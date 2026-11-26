// Rubrical Works (c) 2026
/**
 * @framework-script 0.123.0
 * test-runner.js — suite resolution, scoped routing, sweep sets, run
 * classification (#2852).
 *
 * PURE. This helper runs nothing and spawns nothing: it turns a declaration
 * into invocation sets and classifies an exit code. The caller owns the
 * processes, and the rule owns what blocks `in_review` (#2857 AC2). Keeping
 * the decision here and the action there is what makes "prerequisite failed"
 * testable without a subprocess.
 *
 * The command line (#3880), `test-runner.js scoped --files <changed...>`,
 * runs each suite's per-AC selector — never a test — and prints the plan
 * `scopedPlan` builds from the results. The selector spawn is runner-probe.js's
 * `runSelectorCommand`, injected, so this module still spawns nothing itself.
 *
 * ONE SHAPE, WHATEVER THE DECLARATION FORM. `resolveSuites` desugars the
 * `testCommand` string and the `verificationCommands` array into the same
 * suite list `testing.suites[]` produces, so no caller branches on which key a
 * project happened to use. Precedence is `testing` > `verificationCommands` >
 * `testCommand` > none, matching #2849 AC2 — the two keys are legal together,
 * so something must decide, and it is decided once here rather than per
 * caller.
 *
 * IT INVENTS NO COMMAND. Nothing declared resolves to `source: 'none'` with an
 * empty list. A substituted default is correct for Node and silently wrong for
 * Go, Rust, .NET and Python — the defect #2595 exists to prevent.
 *
 * Node built-ins and colocated files only, glob matching vendored: this
 * directory is symlinked into user projects from a hub whose `node_modules` is
 * production-only, so an undeclared external `require` crashes at module load
 * with MODULE_NOT_FOUND before argument parsing
 * (`04-deployment-awareness.md` § Runtime Dependency Contract).
 */

'use strict';

const { quoteShellPath } = require('./shell-safe.js');

/** Scoping modes that ship in v1. `filter` is reserved and deliberately absent. */
const SCOPING_MODES = Object.freeze(['path', 'package', 'none', 'custom']);

/** The mode an unrecognized or absent declaration falls back to. */
const DEFAULT_SCOPING_MODE = 'none';

/**
 * Vendored glob matcher, derived from the one `scope-drift-check.js` carries
 * (#2418); the two differ since #3407 fixed the segment handling here.
 *
 * Supports literals, `*` and `?` within a segment and `**` across whole
 * segments — the whole pattern set a `match[]` entry uses. Brace expansion and
 * negation are NOT supported; if a caller ever needs them, switch this helper rather than
 * re-introducing an external dependency that cannot resolve from the hub.
 */
function globToRegex(pattern) {
  let re = '^';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        i += 2;
        if (pattern[i] === '/') {
          // Zero or more WHOLE segments (#3407): `.*` here would also match
          // a prefix of the next segment's name.
          re += '(?:.*/)?';
          i++;
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
        i++;
      }
    } else if (c === '?') {
      // One character within a segment — never a regex quantifier (#3407).
      re += '[^/]';
      i++;
    } else if ('.+^$()|{}[]\\'.includes(c)) {
      re += '\\' + c;
      i++;
    } else {
      re += c;
      i++;
    }
  }
  re += '$';
  return new RegExp(re);
}

function globMatch(filePath, pattern) {
  return globToRegex(pattern).test(filePath);
}

/**
 * The first token of a suite command — the runner the gate would spawn (#3012).
 *
 * Pure string parsing, so it lives here beside the classification it informs;
 * `runner-probe.js` is the sibling that resolves the token on PATH. A quoted
 * first token (a path with spaces) is returned without its quotes.
 *
 * @param {string} command
 * @returns {string|null}
 */
function firstToken(command) {
  if (typeof command !== 'string') return null;
  const s = command.trim();
  if (s === '') return null;
  const quote = s[0] === '"' || s[0] === "'" ? s[0] : null;
  if (quote) {
    const end = s.indexOf(quote, 1);
    return end > 1 ? s.slice(1, end) : s.slice(1) || null;
  }
  return s.split(/\s+/)[0];
}

/**
 * Files from `changedFiles` that any of the suite's `match[]` patterns cover
 * and none of its `exclude[]` patterns do (#3258). A broad match such as
 * `tests/**\/*.test.js` can overlap another suite's files; `exclude` keeps a
 * suite from being handed a file it does not run, so a runner configured to
 * skip it never reports "no tests found" as a failure.
 */
function filesForSuite(suite, changedFiles) {
  const patterns = Array.isArray(suite.match) ? suite.match : [];
  const excluded = Array.isArray(suite.exclude) ? suite.exclude : [];
  return changedFiles.filter((f) => patterns.some((p) => globMatch(f, p)) && !excluded.some((p) => globMatch(f, p)));
}

/** A suite the gate never invokes at any scope. */
function isManualOnly(suite) {
  return suite && suite.execution === 'manual-only';
}

/** The two concurrency values a suite may declare (#3132). */
const CONCURRENCY_VALUES = Object.freeze(['parallel', 'exclusive']);

/** Roles whose suites are exclusive unless the suite says otherwise. */
const EXCLUSIVE_BY_ROLE = Object.freeze(['e2e']);

/**
 * Whether a suite may run inside a concurrent member's worktree (#3132).
 *
 * `parallel` runs per member in the worktree; `exclusive` is deferred to the
 * tracker branch after the group's merge-back. Absent → the role default:
 * `e2e` is exclusive (a host-bound run from two worktrees at once collides on
 * ports, browsers and fixtures), everything else is parallel.
 *
 * An invalid declaration is `{value: null, source: 'invalid'}`, never
 * `parallel`: the schema refuses the value at write time, and a config that
 * bypassed it must not be rewarded with the permissive default (Negative
 * Test Scenario 6).
 *
 * @returns {{value: 'parallel'|'exclusive'|null, source: 'declared'|'role-default'|'invalid', error?: string}}
 */
function resolveConcurrency(suite) {
  const declared = suite ? suite.concurrency : undefined;
  if (declared === undefined) {
    const role = suite && suite.role !== undefined ? suite.role : 'unit';
    return { value: EXCLUSIVE_BY_ROLE.includes(role) ? 'exclusive' : 'parallel', source: 'role-default' };
  }
  if (CONCURRENCY_VALUES.includes(declared)) {
    return { value: declared, source: 'declared' };
  }
  return {
    value: null,
    source: 'invalid',
    error: `Suite "${suite.id}" declares concurrency ${JSON.stringify(declared)} — expected "parallel" or "exclusive"; not run, not deferred, and never defaulted to parallel.`,
  };
}

/**
 * Whether a suite reads files across the whole repository rather than only
 * the files it matches (#3856): a spelling sweep, a contract test that
 * enumerates every command spec. Declared by the project as `wholeRepo: true`.
 */
function isWholeRepo(suite) {
  return Boolean(suite) && suite.wholeRepo === true;
}

/**
 * Whether a parallel suite is held back from a worktree as whole-repo (#3856).
 * A sparse worktree lacks the files outside its cone, and a suite that reads
 * the whole repository passes there without checking them. `sparse` is the
 * caller's statement about the worktree: `false` (a full checkout) runs the
 * suite in place; `true` or unstated defers it, since a worktree not known to
 * be full may be missing files — the guard fails safe.
 */
function deferredAsWholeRepo(suite, sparse) {
  return isWholeRepo(suite) && sparse !== false && resolveConcurrency(suite).value === 'parallel';
}

/**
 * Split suites by where they may run (#3132). Manual-only and invalid suites
 * are in neither set, and named, so nothing leaves the report silently. A
 * whole-repo suite counts as exclusive unless the worktree is stated full
 * (#3856, deferredAsWholeRepo).
 *
 * @param {object[]} suites
 * @param {{sparse?: boolean}} [opts]
 * @returns {{parallel: object[], exclusive: object[], manualOnly: string[],
 *   invalid: Array<{suiteId: string, declared: *, error: string}>, warnings: string[]}}
 */
function partitionByConcurrency(suites, { sparse } = {}) {
  const out = { parallel: [], exclusive: [], manualOnly: [], invalid: [], warnings: [] };
  for (const suite of suites) {
    if (isManualOnly(suite)) {
      out.manualOnly.push(suite.id);
      continue;
    }
    const concurrency = resolveConcurrency(suite);
    if (concurrency.source === 'invalid') {
      out.invalid.push({ suiteId: suite.id, declared: suite.concurrency, error: concurrency.error });
      out.warnings.push(concurrency.error);
      continue;
    }
    (concurrency.value === 'exclusive' || deferredAsWholeRepo(suite, sparse) ? out.exclusive : out.parallel).push(suite);
  }
  return out;
}

/** A suite's working directory, with absent and the project root reading the same. */
function suiteCwd(suite) {
  const cwd = typeof suite.cwd === 'string' ? suite.cwd.trim() : '';
  return cwd === '' || cwd === '.' || cwd === './' ? null : cwd;
}

/**
 * Merge runs that would execute the same commands in the same directory
 * (#3025).
 *
 * The harness registry gives `js-jest` and `ts-jest` the same `npx jest`, so a
 * project with both languages declares two gate suites with one command, and
 * an uncollapsed set runs it twice. The key is the exact command sequence plus
 * `cwd` — no whitespace or argument normalization, since a near-match is a
 * different command the project declared on purpose.
 *
 * A merged run keeps `suiteId` (the first contributing id) beside `suiteIds`,
 * so readers of the single id keep working, and keeps each suite's `kind` in
 * `suites[]` rather than taking the first one's. Every merge is named in
 * `collapsed`, so no declared suite disappears from the report.
 *
 * @param {object[]} runs - Runs carrying `suiteId`, `cwd` and `kind`
 * @param {(run: object) => string} commandKey - The run's command sequence
 * @param {(into: object, from: object) => void} [mergeExtra] - Per-shape merge
 * @returns {{runs: object[], collapsed: {suiteIds: string[]}[]}}
 */
function collapseRuns(runs, commandKey, mergeExtra = () => {}) {
  const byKey = new Map();
  const out = [];
  for (const { kind, ...run } of runs) {
    const key = JSON.stringify([commandKey(run), run.cwd]);
    const existing = byKey.get(key);
    if (existing) {
      existing.suiteIds.push(run.suiteId);
      existing.suites.push({ id: run.suiteId, kind });
      mergeExtra(existing, run);
      continue;
    }
    const merged = { ...run, suiteIds: [run.suiteId], suites: [{ id: run.suiteId, kind }] };
    byKey.set(key, merged);
    out.push(merged);
  }
  const collapsed = out
    .filter((run) => run.suiteIds.length > 1)
    .map((run) => ({ suiteIds: run.suiteIds.slice() }));
  return { runs: out, collapsed };
}

/** A template carrying none of these expands to itself, so it does not narrow. */
const PLACEHOLDER_RE = /\{(?:files|dir|stem|package)\}/;

/**
 * Expand `{files}`, `{dir}`, `{stem}` and `{package}` into a command string.
 *
 * Every substituted value goes through `quoteShellPath`, which REJECTS shell
 * metacharacters rather than escaping them. A rejection the caller can see and
 * report beats a command that merely looks composed — the value comes from
 * `git diff` output, which is attacker-influenced in any repository that takes
 * contributions. A path carrying only a space, brackets or parentheses
 * (`pages/[id].tsx`, `docs/My Notes.md`, `app/(auth)/page.tsx`) is legitimate
 * and is emitted as one double-quoted word (#3742, #3749);
 * `sanitizeShellArg`'s strict set rejected it.
 *
 * A placeholder is validated only when the template uses it (#3750): an unused
 * `{stem}` of `.gitignore` (empty) or `~tmp` must not reject a `{files}`-only
 * run whose every substituted value is safe.
 *
 * @throws {Error} From `quoteShellPath`, when a used value is not shell-safe.
 */
function expandPlaceholders(template, files) {
  const first = files[0] || '';
  const slash = first.lastIndexOf('/');
  const base = first.slice(slash + 1);
  const dot = base.lastIndexOf('.');

  const values = {
    files: () => files.map((f) => quoteShellPath(f, 'changed file')).join(' '),
    dir: () => quoteShellPath(slash === -1 ? '.' : first.slice(0, slash), 'directory'),
    stem: () => quoteShellPath(dot === -1 ? base : base.slice(0, dot), 'stem'),
    package: () => quoteShellPath(first.split('/')[0] || '', 'package'),
  };

  const cache = {};
  return template.replace(/\{(files|dir|stem|package)\}/g, (_m, name) => {
    if (!(name in cache)) cache[name] = values[name]();
    return cache[name];
  });
}

/**
 * The longest command line the platform's shell accepts, or null for none
 * worth enforcing (#3778).
 *
 * Callers spawn these commands with `shell: true`. On win32 that is cmd.exe,
 * which refuses a line over 8,191 characters with "The command line is too
 * long." and exit 1 — before any test starts. POSIX shells are bounded by
 * ARG_MAX (hundreds of KB to MB), far past any selection, so no limit is
 * declared there and nothing is split.
 */
const COMMAND_LINE_LIMITS = Object.freeze({ win32: 8191 });

/**
 * Head-room under the limit for the wrapper Node adds around a `shell: true`
 * command on win32 (`/d /s /c "…"`), so a split invocation stays under the
 * limit as cmd.exe counts it, not only as this helper does. Measured (#3855):
 * with no shim the longest accepted command was 8,152 characters, 39 short.
 */
const SHELL_WRAPPER_RESERVE = 40;

/**
 * Head-room for a `.cmd` shim re-expanding the line (#3855). `npx jest …`
 * runs `npx.cmd`, whose last line is `"%NODE_EXE%" "%NPX_CLI_JS%" %*`: the
 * re-expanded line carries both paths, and its length depends on where Node
 * is installed. A fixed, conservative reserve rather than a measurement — an
 * extra part costs seconds, a refused one fails the sweep.
 */
const CMD_SHIM_RESERVE = 512;

/**
 * cmd.exe's refusals of an over-limit line, as it prints them: the line
 * itself ("The command line is too long.") and a `.cmd` shim's re-expanded
 * line ("The input line is too long.", exit 255 — #3855).
 */
const TOO_LONG_RE = /The (?:command|input) line is too long\./i;

/**
 * The other message a shim prints for a re-expanded line it cannot hold
 * (#3855). It is also cmd.exe's answer to ordinary bad syntax, so it names a
 * refusal only for a command already over the budget.
 */
const SYNTAX_REFUSAL_RE = /The syntax of the command is incorrect\./i;

function commandLineLimit(platform = process.platform) {
  return Object.prototype.hasOwnProperty.call(COMMAND_LINE_LIMITS, platform) ? COMMAND_LINE_LIMITS[platform] : null;
}

/**
 * The longest command `expandChunked` builds on a platform: the limit less
 * the wrapper and shim reserves, or null where no limit applies (#3855).
 */
function commandLineBudget(platform = process.platform) {
  const limit = commandLineLimit(platform);
  return limit === null ? null : limit - SHELL_WRAPPER_RESERVE - CMD_SHIM_RESERVE;
}

/**
 * Expand a `{files}` template into as many commands as the platform's
 * command-line limit needs (#3778).
 *
 * Under the limit, or where no limit applies, this is exactly one
 * `expandPlaceholders` call. Over it, the files are cut into consecutive,
 * order-preserving groups, each expanding under the limit, so every file runs
 * once and no command is one the shell will refuse. A single file too long
 * on its own still gets its own command: the split cannot shorten it, and
 * `classifyRunResult` names the refusal rather than calling it a test failure.
 *
 * Only `{files}` is split: `{dir}`, `{stem}` and `{package}` come from the
 * first file, so a template using them alone is never long enough to need it.
 *
 * @throws {Error} From `quoteShellPath`, when a value is not shell-safe.
 * @returns {{command: string, files: string[]}[]}
 */
function expandChunked(template, files, platform) {
  const whole = expandPlaceholders(template, files);
  const budget = commandLineBudget(platform);
  if (budget === null || whole.length < budget || !template.includes('{files}')) {
    return [{ command: whole, files }];
  }
  // Each further file adds one separator plus its quoted form per `{files}`.
  const perFile = template.split('{files}').length - 1;
  const groups = [];
  let current = [];
  let length = 0;
  for (const file of files) {
    if (current.length === 0) {
      current = [file];
      length = expandPlaceholders(template, current).length;
      continue;
    }
    const added = perFile * (1 + quoteShellPath(file, 'changed file').length);
    if (length + added >= budget) {
      groups.push(current);
      current = [file];
      length = expandPlaceholders(template, current).length;
    } else {
      current.push(file);
      length += added;
    }
  }
  if (current.length > 0) groups.push(current);
  return groups.map((group) => ({ command: expandPlaceholders(template, group), files: group }));
}

/**
 * Resolve a project's declaration into a normalized suite list.
 *
 * @param {string} [cwd] - Project root
 * @returns {{suites: object[], source: 'testing'|'verificationCommands'|'testCommand'|'none'|'unreadable',
 *            sweepScope: string, error?: string}}
 *   `unreadable` (#3266): framework-config.json exists but cannot be parsed.
 *   It is never `none` — "nothing declared" is reported only for a valid
 *   file that declares nothing — and `error` carries the parse error.
 */
function resolveSuites(cwd = process.cwd()) {
  // Function-scoped, deliberately: framework-config.js requires THIS module
  // from inside `resolveVerificationCommands`, so a top-level require in
  // either direction would be a load-time cycle leaving one module
  // half-initialized for the other.
  const { read, normalizeSuite } = require('./framework-config.js');
  const fs = require('fs');
  const path = require('path');

  const NONE = { suites: [], source: 'none', sweepScope: 'all' };

  let config;
  try {
    config = read(cwd);
  } catch (err) {
    // An absent file is a project that declares nothing; a present one that
    // will not parse is a broken declaration, and must block, not pass.
    if (!fs.existsSync(path.join(cwd, 'framework-config.json'))) return NONE;
    return { suites: [], source: 'unreadable', sweepScope: 'all', error: err.message };
  }
  if (!config) return NONE;

  const testing = config.testing;
  if (testing && Array.isArray(testing.suites) && testing.suites.length > 0) {
    return {
      suites: testing.suites.map(normalizeSuite),
      source: 'testing',
      sweepScope: testing.sweepScope || 'all',
    };
  }

  const declared = config.verificationCommands;
  if (Array.isArray(declared)) {
    const commands = declared.filter((c) => typeof c === 'string' && c.trim() !== '');
    if (commands.length > 0) {
      return {
        suites: commands.map((full, i) => normalizeSuite({
          id: `verification-${i}`,
          full,
          // A shorthand declares no file scope, so it covers everything.
          match: ['**'],
        })),
        source: 'verificationCommands',
        sweepScope: 'all',
      };
    }
  }

  const single = config.testCommand;
  if (typeof single === 'string' && single.trim() !== '') {
    return {
      suites: [normalizeSuite({ id: 'testCommand', full: single, match: ['**'] })],
      source: 'testCommand',
      sweepScope: 'all',
    };
  }

  return NONE;
}

/**
 * Route a changed-file set to the suites that cover it.
 *
 * @returns {{runs: object[], collapsed: {suiteIds: string[]}[], unmatched: string[],
 *            reason: string|null, notRun: {suiteId: string, reason: string}[],
 *            warnings: string[]}} `notRun` names each suite a placeholder
 *   expansion error skipped (#3175), and each selector-declaring suite
 *   whose selector fell back with no touched file to fall back to (#3407).
 *   `reason` is
 *   `'no-suites-matched'` when nothing ran (`'matched-suites-skipped'` when
 *   the matched suites were all skipped by `onScoped`, `'selected-none'` when
 *   a selector reached a suite and chose no test) — which must stay distinguishable
 *   from "everything passed", since both are an empty result and conflating
 *   them is a silent skip. Suites whose scoped command and `cwd` match share
 *   one run carrying every id and the union of their files (#3025).
 *   `selections` (#3318) — selector results keyed by suite id, as Step 4f
 *   passes them to `sweepInvocations` — narrows a selector-declaring suite to
 *   the tests its selector chose; each run then carries `selection` and an
 *   empty selection is listed in `selectedNone`. Absent, nothing changes.
 *   A `{files}` expansion longer than `platform`'s command line (#3778) is
 *   split into consecutive runs, each with its own `files` and a
 *   `chunk: {index, of}`; callers already run every entry of `runs`.
 *   `selectionTier` (#3880) names the tier `selections` were built at:
 *   `scoped` (default — the per-AC run) or `sweep` (merge-back Tier 1), so a
 *   suite is reached only by a selector of that tier.
 *   `sparse` (#3856) states whether the worktree is a sparse checkout; with
 *   `inWorktree`, a `wholeRepo` suite is deferred as exclusive (source
 *   `whole-repo`) unless `sparse` is `false`.
 */
function scopedInvocations({ suites = [], changedFiles = [], inWorktree = false, sparse, selections, selectionTier = 'scoped', platform = process.platform } = {}) {
  assertTier(selectionTier);
  const runs = [];
  const warnings = [];
  const notRun = [];
  const scopedSkipped = [];
  const matchedAny = new Set();
  // #3318: opt-in. Only a caller passing `selections` (/work Step 3) gets
  // selector-narrowed runs and a `selection` report on each run; every other
  // caller — the Merge-Back Gate, the regeneration runner — gets exactly the
  // result it got before.
  const selectionAware = selections !== undefined && selections !== null;
  const selectedNone = [];
  // Inside a member's worktree only parallel suites run (#3132). Exclusive
  // suites are returned as the deferred set the parent runs after merge-back
  // — never dropped, so a role-default e2e suite is never skipped. An
  // invalid declaration is named and is in neither set. Outside a worktree
  // nothing is partitioned and every gate suite runs, as before.
  // #3856: a whole-repo suite in a worktree that may be sparse is deferred the
  // same way — it would pass there over files the cone left out.
  const split = inWorktree
    ? partitionByConcurrency(suites, { sparse })
    : { parallel: suites.filter((s) => !isManualOnly(s)), exclusive: [], manualOnly: suites.filter(isManualOnly).map((s) => s.id), invalid: [], warnings: [] };
  const deferred = split.exclusive.map((s) => ({
    suiteId: s.id, concurrency: 'exclusive', source: deferredAsWholeRepo(s, sparse) ? 'whole-repo' : resolveConcurrency(s).source,
  }));
  const { invalid, manualOnly } = split;
  warnings.push(...split.warnings);

  for (const suite of split.parallel) {
    const files = filesForSuite(suite, changedFiles);
    const scoped = suite.scoped || {};
    let mode = scoped.mode === undefined ? DEFAULT_SCOPING_MODE : scoped.mode;
    // #3394: the suite's own declarations are honored before its selector is
    // consulted — a selector reads every changed file, so it reaches the suite
    // even when its match globs do not.
    const reached = files.length > 0 || (selectionAware && declaresSelector(suite, selectionTier));
    if (reached && !SCOPING_MODES.includes(mode)) {
      // Named, never silently skipped: an unrecognized mode is a declaration
      // the project believes is in force.
      warnings.push(
        `Suite "${suite.id}" declares unrecognized scoping mode "${mode}" — `
        + `falling back to "${DEFAULT_SCOPING_MODE}".`
      );
      mode = DEFAULT_SCOPING_MODE;
    }

    if (reached && mode === DEFAULT_SCOPING_MODE && scoped.onScoped === 'skip') {
      // #3273: matched, and skipped by its own declaration — named, so it is
      // distinguishable from a suite nothing matched. Not `notRun`, which
      // records failures to run that the merge-back gate treats as such.
      // #3300: "only in the full sweep" is true only of a swept suite; every
      // shipped harness with onScoped: skip is also sweep: false.
      files.forEach((f) => matchedAny.add(f));
      scopedSkipped.push({
        suiteId: suite.id,
        reason: suite.sweep === false
          ? 'onScoped: skip — and the suite declares sweep: false, so neither a scoped run nor the sweep runs it'
          : 'onScoped: skip — this suite runs only in the full sweep',
      });
      continue;
    }

    let fallback = null;
    if (selectionAware) {
      const picked = selectedRun(suite, selections[suite.id], changedFiles, platform, selectionTier);
      if (picked.runs) {
        // The selector read every changed file, so it reached them all.
        changedFiles.forEach((f) => matchedAny.add(f));
        runs.push(...picked.runs);
        continue;
      }
      if (picked.none) {
        // #3407: the selector read every changed file and chose nothing —
        // the files were matched, just not to any test.
        changedFiles.forEach((f) => matchedAny.add(f));
        selectedNone.push(picked.none);
        continue;
      }
      fallback = picked.fallback;
    }

    if (files.length === 0) {
      // #3407: a selector reached this suite and then fell back, but there is
      // no touched tree to fall back to — so nothing ran. Named, since every
      // fallback is reported; a suite with no selector was simply not reached.
      if (fallback && declaresSelector(suite, selectionTier) && changedFiles.length > 0) {
        const reason = `${fallback.report}, and none of the changed files match this suite`;
        // `selectorFallback` (#3880): the suite was reached only through its
        // selector — a gate may treat this as advisory, since without the
        // selector it was never reached at all.
        notRun.push({ suiteId: suite.id, reason, selectorFallback: true });
        warnings.push(`Suite "${suite.id}" was not run: ${reason}`);
      }
      continue;
    }
    files.forEach((f) => matchedAny.add(f));

    let chunks;
    let narrowed = false;
    if (mode === DEFAULT_SCOPING_MODE) {
      chunks = [{ command: suite.full, files }];
    } else {
      const template = scoped.command || suite.full;
      // A template expanding no placeholder runs the whole suite whatever
      // changed — the Merge-Back Review Gate defers such a run (#3159).
      narrowed = PLACEHOLDER_RE.test(template);
      try {
        chunks = expandChunked(template, files, platform);
      } catch (err) {
        // `notRun` is the structured record consumers read (#3175); the
        // warning is for display and its wording is not a contract.
        notRun.push({ suiteId: suite.id, reason: err.message });
        warnings.push(`Suite "${suite.id}" was not run: ${err.message}`);
        continue;
      }
    }

    chunks.forEach((chunk, i) => {
      const run = { suiteId: suite.id, mode, command: chunk.command, narrowed, files: chunk.files, cwd: suiteCwd(suite), kind: suite.kind };
      if (chunks.length > 1) run.chunk = { index: i + 1, of: chunks.length };
      if (fallback) run.selection = fallback;
      runs.push(run);
    });
  }

  const merged = collapseRuns(runs, (run) => run.command, (into, from) => {
    for (const f of from.files) if (!into.files.includes(f)) into.files.push(f);
    into.narrowed = into.narrowed && from.narrowed;
  });

  return {
    runs: merged.runs,
    collapsed: merged.collapsed,
    unmatched: changedFiles.filter((f) => !matchedAny.has(f)),
    // #3300: suites that matched but were all skipped by onScoped are not
    // "no suites matched" — the two have different remedies. #3407: nor are
    // suites whose selector chose nothing; that is 'selected-none'.
    reason: runs.length === 0 && changedFiles.length > 0
      ? (scopedSkipped.length > 0 ? 'matched-suites-skipped'
        : selectedNone.length > 0 ? 'selected-none' : 'no-suites-matched')
      : null,
    deferred,
    invalid,
    notRun,
    scopedSkipped,
    manualOnly,
    warnings,
    ...(selectionAware ? { selectedNone } : {}),
  };
}

/**
 * One suite's per-AC run as its selector decides it (#3318).
 *
 * Mirrors the Step 4f sweep's use of `resolveSelection`, with one difference:
 * where the sweep falls back to the suite's `full` command, a per-AC run falls
 * back to today's touched-tree narrowing — a scoped run is a feedback loop, and
 * Step 4f still sweeps in full. Every fallback is reported, never silent.
 *
 * A selection longer than the platform's command line is split into several
 * runs, each carrying the same suite id and selection plus its `chunk` (#3778).
 *
 * @returns {{runs?: object[], none?: object, fallback?: object}} exactly one key
 */
function selectedRun(suite, result, changedFiles, platform, tier = 'scoped') {
  const touched = (selection) => ({
    fallback: { mode: 'touched', fallback: selection.fallback, report: `touched tree — ${selection.report.replace(/^full — /, '')}` },
  });
  if (!declaresSelector(suite, tier)) {
    return touched({ fallback: 'no-selector', report: tier === 'scoped' ? 'no scopedSelect or sweepSelect declared' : 'no sweepSelect declared' });
  }

  const selection = resolveSelection(suite, result, changedFiles, tier);
  if (selection.mode === 'none') {
    return { none: { suiteId: suite.id, report: selection.report, reason: selection.reason, verdict: 'selected none — ran nothing, not a pass' } };
  }
  if (selection.mode !== 'selected') return touched(selection);

  const template = (suite.scoped || {}).command;
  if (typeof template !== 'string' || !template.includes('{files}')) {
    return touched({ fallback: 'no-files-placeholder', report: 'the scoped command has no {files} placeholder to carry every selected test' });
  }
  let chunks;
  try {
    chunks = expandChunked(template, selection.tests, platform);
  } catch (err) {
    return touched({ fallback: 'selection-unsafe', report: `a selected test is not shell-safe: ${err.message}` });
  }
  const reported = { ...selection };
  delete reported.tests;
  return {
    runs: chunks.map((chunk, i) => ({
      suiteId: suite.id,
      mode: (suite.scoped || {}).mode || DEFAULT_SCOPING_MODE,
      command: chunk.command,
      narrowed: true,
      files: chunk.files,
      cwd: suiteCwd(suite),
      kind: suite.kind,
      selection: reported,
      ...(chunks.length > 1 ? { chunk: { index: i + 1, of: chunks.length } } : {}),
    })),
  };
}

/**
 * The exclusive suites a group deferred, for the parent to run once each,
 * serially, on the tracker branch after merge-back and worktree teardown
 * (#3132). Scoped to `changedFiles` — the union of the group's changed files,
 * regenerated paths included — through the same scoping each suite declares.
 *
 * Nothing is dropped silently: `manualOnly` and `invalid` are named, and an
 * exclusive suite matching none of the changed files is listed in
 * `unmatchedExclusive`, so a suite that did not run is distinguishable from
 * one that was never declared.
 *
 * `cannotNarrow` names the parallel suites a member's Tier 1 deferred because
 * their scoped command expands no placeholder (#3159). They run here, after
 * the exclusive ones, at the tracker — never in a worktree, never dropped: an
 * unmatched one is in `unmatchedCannotNarrow`, an unknown id in `warnings`.
 *
 * Whole-repo suites (#3856) a member's worktree deferred are among the
 * exclusive ones here, under the same `sparse` statement scopedInvocations
 * took: unstated or `true` runs them once on the tracker; `false` leaves them
 * to the members, which ran them in place.
 *
 * @returns {{runs: object[], collapsed: object[], serial: true, manualOnly: string[],
 *   invalid: object[], scopedSkipped: object[], unmatchedExclusive: string[],
 *   unmatchedCannotNarrow: string[], warnings: string[]}}
 */
function deferredInvocations({ suites = [], changedFiles = [], cannotNarrow = [], sparse } = {}) {
  const { exclusive, parallel, invalid, manualOnly, warnings } = partitionByConcurrency(suites, { sparse });

  const narrowIds = [...new Set(cannotNarrow)];
  const unknown = narrowIds.filter((id) => !parallel.some((s) => s.id === id));
  for (const id of unknown) {
    warnings.push(`Deferred suite "${id}" names no declared parallel suite — not run.`);
  }
  const narrowSuites = parallel.filter((s) => narrowIds.includes(s.id));

  const scoped = scopedInvocations({ suites: exclusive, changedFiles });
  const late = scopedInvocations({ suites: narrowSuites, changedFiles });
  const ran = new Set([...scoped.runs, ...late.runs].flatMap((r) => r.suiteIds));
  // #3300: a suite its own `onScoped: 'skip'` declaration skipped matched —
  // reported as skipped, never as unmatched (every shipped e2e harness).
  // Also a warning, so the merge-back step — which names every warning — names it.
  const scopedSkipped = [...scoped.scopedSkipped, ...late.scopedSkipped];
  const accounted = new Set([...ran, ...scopedSkipped.map((s) => s.suiteId)]);
  for (const s of scopedSkipped) warnings.push(`Suite "${s.suiteId}" matched and was not run: ${s.reason}.`);
  return {
    runs: [...scoped.runs, ...late.runs],
    collapsed: [...scoped.collapsed, ...late.collapsed],
    serial: true,
    manualOnly,
    invalid,
    scopedSkipped,
    unmatchedExclusive: exclusive.map((s) => s.id).filter((id) => !accounted.has(id)),
    unmatchedCannotNarrow: narrowSuites.map((s) => s.id).filter((id) => !accounted.has(id)),
    warnings: [...warnings, ...scoped.warnings, ...late.warnings],
  };
}

/** The prefix framework-owned worktrees carry under the project root. */
const WORKTREE_PREFIX = '.tmp-wt-';

/**
 * Worktree directories still under the project root when the parent's own
 * suites are about to run (#3132). Worktrees sit under the root (#3123), so
 * a suite run from the root may collect their files; the gate sequences
 * teardown before these runs rather than passing an ignore flag the
 * framework cannot name for an unknown runner. Any directory still present —
 * kept after a halt, or created by an unrelated caller — is reported by path
 * and the run continues.
 *
 * @param {{root: string, fs?: {readdirSync: Function}}} input
 * @returns {{paths: string[], report: string|null}}
 */
function leftoverWorktrees({ root, fs = require('fs') } = {}) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return { paths: [], report: null };
  }
  const paths = entries
    .filter((e) => e.isDirectory() && e.name.startsWith(WORKTREE_PREFIX))
    .map((e) => `${root}/${e.name}`)
    .sort();
  if (paths.length === 0) return { paths, report: null };
  return {
    paths,
    report: `Worktree director${paths.length === 1 ? 'y' : 'ies'} still present under the project root — possibly collected by the project's suites:\n`
      + paths.map((p) => `  - ${p}`).join('\n'),
  };
}

/** Whether the sweep reaches this suite at all — before any selection. */
function isSwept(suite, sweepScope, changedFiles) {
  if (isManualOnly(suite) || suite.sweep === false) return false;
  return !(sweepScope === 'touched' && filesForSuite(suite, changedFiles).length === 0);
}

/**
 * The two selection tiers (#3880). `sweep` — the Step 4f sweep and merge-back
 * Tier 1 — reads `sweepSelect` alone. `scoped` — the per-AC run — reads
 * `scopedSelect` and falls back to `sweepSelect` when it is absent, so a
 * project declaring one selector gets it at both scopes.
 */
const SELECTION_TIERS = Object.freeze(['sweep', 'scoped']);

const isCommand = (value) => typeof value === 'string' && value.trim() !== '';

/**
 * The key naming the selector a suite runs at `tier`, or null for none.
 * @returns {'scopedSelect'|'sweepSelect'|null}
 */
function assertTier(tier) {
  if (!SELECTION_TIERS.includes(tier)) {
    throw new Error(`Unrecognized selection tier ${JSON.stringify(tier)} — expected one of ${SELECTION_TIERS.join(', ')}.`);
  }
}

function selectorKey(suite, tier = 'sweep') {
  assertTier(tier);
  if (tier === 'scoped' && isCommand(suite.scopedSelect)) return 'scopedSelect';
  return isCommand(suite.sweepSelect) ? 'sweepSelect' : null;
}

function declaresSelector(suite, tier = 'sweep') {
  return selectorKey(suite, tier) !== null;
}

/**
 * The selector commands a sweep needs run first (#3201).
 *
 * A suite declaring `sweepSelect` maps the changed files to the tests that can
 * observe them. `{files}` expands to EVERY changed file, not only the suite's
 * `match[]` hits: a selector exists to reach tests from source changes, so
 * filtering its input to test files would defeat it. No changed files → no
 * selector run, since an empty input selects nothing and would skip the suite;
 * `sweepInvocations` reports that case as a fallback to `full`.
 *
 * PURE, like the rest of this helper: the caller runs each command and hands
 * `{exitCode, stdout, spawnError}` back to `sweepInvocations` as `selections`.
 *
 * `tier` (#3880): `sweep` (default — Step 4f and merge-back Tier 1) runs
 * `sweepSelect`; `scoped` (the per-AC run) runs `scopedSelect`, else
 * `sweepSelect`, and names the key it ran as `selector`. Any other value throws.
 *
 * @returns {{runs: Array<{suiteId: string, command: string, cwd: string|null, selector?: string}>,
 *            notRun: {suiteId: string, reason: string}[]}}
 */
function selectorInvocations({ suites = [], sweepScope = 'all', changedFiles = [], tier = 'sweep' } = {}) {
  const runs = [];
  const notRun = [];
  // Validated before the empty-input return, so a misspelled tier is caught
  // whatever changed.
  assertTier(tier);
  if (changedFiles.length === 0) return { runs, notRun };
  for (const suite of suites) {
    // #3880: a per-AC run is not the sweep, so `sweep: false` and
    // `sweepScope: touched` do not apply to it — only manual-only does, as
    // scopedInvocations itself never runs a manual-only suite.
    const reached = tier === 'scoped' ? !isManualOnly(suite) : isSwept(suite, sweepScope, changedFiles);
    const key = reached ? selectorKey(suite, tier) : null;
    if (!key) continue;
    try {
      const run = { suiteId: suite.id, command: expandPlaceholders(suite[key], changedFiles), cwd: suiteCwd(suite) };
      // The per-AC tier names which selector it ran, since it has two.
      if (tier === 'scoped') run.selector = key;
      runs.push(run);
    } catch (err) {
      notRun.push({ suiteId: suite.id, reason: err.message });
    }
  }
  return { runs, notRun };
}

/**
 * What a suite's selector result means for its sweep run (#3201).
 *
 * Every path that cannot narrow resolves to `full` and names why — a selector
 * that cannot decide must never decide "fewer tests". The selector's output is
 * one JSON document: `mode` `selected` | `none` | `full`, `tests[]`, and
 * optionally `total` and `reason`.
 *
 * @returns {{mode: 'selected'|'none'|'full', report: string, fallback?: string,
 *            reason?: string, tests?: string[], selected?: number, total?: number}}
 */
function resolveSelection(suite, result, changedFiles, tier = 'sweep') {
  const full = (fallback, why) => ({ mode: 'full', fallback, report: `full — ${why}` });
  if (!declaresSelector(suite, tier)) return full('no-selector', 'no sweepSelect declared');
  if (changedFiles.length === 0) return full('no-changed-files', 'no changed files to select from');
  if (!result) return full('selector-not-run', 'the selector was not run');
  if (result.spawnError) return full('selector-failed', `the selector could not be spawned (${result.spawnError})`);
  if (result.exitCode !== 0) return full('selector-failed', `the selector exited ${result.exitCode}`);

  let out;
  try {
    out = JSON.parse(String(result.stdout || ''));
  } catch {
    return full('selector-unparseable', 'the selector output is not JSON');
  }
  if (!out || !['selected', 'none', 'full'].includes(out.mode)) {
    return full('selector-unparseable', 'the selector output names no recognized mode');
  }
  if (out.mode === 'full') {
    return full('selector-full', `the selector chose the full suite${out.reason ? `: ${out.reason}` : ''}`);
  }
  const tests = Array.isArray(out.tests) ? out.tests.filter((t) => typeof t === 'string' && t !== '') : [];
  if (out.mode === 'none') {
    return { mode: 'none', report: 'selected none', reason: out.reason || 'the selector returned no tests' };
  }
  // `selected` naming no valid test contradicts itself: it cannot narrow, so it runs full (#3216).
  if (tests.length === 0) return full('selector-unparseable', 'the selector chose selected but named no valid tests');
  const total = Number.isInteger(out.total) ? out.total : undefined;
  // The selector's reason is kept beside the report, never folded into it
  // (#3885): a narrowing the selector names (the ac tier's skipped data-file
  // hops) reaches the per-AC report while "selected N of M" stays as it was.
  const reason = typeof out.reason === 'string' && out.reason !== '' ? out.reason : undefined;
  return {
    mode: 'selected',
    tests,
    selected: tests.length,
    ...(total === undefined ? {} : { total }),
    report: total === undefined ? `selected ${tests.length}` : `selected ${tests.length} of ${total}`,
    ...(reason === undefined ? {} : { reason }),
  };
}

/**
 * The full-sweep invocation set.
 *
 * A suite declaring `sweepSelect` runs its scoped command over the tests its
 * selector returned (#3201); `selections` carries each selector's result,
 * keyed by suite id. Every run carries `selection` — `selected N of M`, or
 * `full — <reason>` naming the fallback — so a narrowed sweep is never
 * reported as a full one. An empty selection runs nothing and is listed in
 * `selectedNone`, never in `runs` (it is not a pass) or `skipped`.
 *
 * A selected command longer than `platform`'s command line (#3778 — cmd.exe's
 * 8,191 characters on win32) is split into consecutive runs, each carrying
 * `chunk: {index, of}`; together they run every selected test once. Each part
 * is reported on its own line, never collapsed into one verdict.
 *
 * @returns {{runs: object[], collapsed: {suiteIds: string[]}[], manualOnly: string[],
 *            skipped: string[], selectedNone: object[], warnings: string[]}} A run
 *   carries `phases`, ordered `prepare` then `full`, so a caller cannot
 *   accidentally run tests against an unbuilt tree and report a failure that
 *   is not the code's. Suites whose phases, `cwd` and selection match share
 *   one run carrying every id (#3025); `collapsed` names each merge.
 */
function sweepInvocations({ suites = [], sweepScope = 'all', changedFiles = [], selections = {}, source, error, platform = process.platform } = {}) {
  // #3266: a resolution that could not read the config blocks the sweep. Run
  // nothing, and say why — never the "nothing declared" report, which blamed
  // the declaration for a parse error and let in_review proceed unverified.
  if (source === 'unreadable') {
    return {
      runs: [], collapsed: [], manualOnly: [], skipped: [], selectedNone: [], warnings: [],
      blocksReview: true,
      verdict: 'config unreadable',
      message: `framework-config.json could not be read, so no verification suite ran: ${error || 'unknown error'}. Fix the file and re-run the sweep; in_review is blocked until then.`,
    };
  }
  const runs = [];
  const manualOnly = [];
  const skipped = [];
  const selectedNone = [];

  for (const suite of suites) {
    if (isManualOnly(suite)) {
      // Excluded from BOTH sets, and named — declared-but-not-run is
      // information, and dropping it silently would read as "not declared".
      manualOnly.push(suite.id);
      continue;
    }
    if (!isSwept(suite, sweepScope, changedFiles)) {
      skipped.push(suite.id);
      continue;
    }

    let selection = resolveSelection(suite, (selections || {})[suite.id], changedFiles);
    if (selection.mode === 'none') {
      // #3273: it ran nothing, so it is never a pass — named as such in the
      // entry and in `notPassed`, which the Step 4f report reads.
      selectedNone.push({ suiteId: suite.id, report: selection.report, reason: selection.reason, verdict: 'selected none — ran nothing, not a pass' });
      continue;
    }
    let commands = [suite.full];
    if (selection.mode === 'selected') {
      const template = (suite.scoped || {}).command;
      if (typeof template !== 'string' || !PLACEHOLDER_RE.test(template)) {
        selection = { mode: 'full', fallback: 'no-scoped-command', report: 'full — no scoped command with a placeholder to narrow with' };
      } else if (!template.includes('{files}')) {
        // {dir}, {stem} and {package} expand from the FIRST file only, so they
        // would run one selected test's scope while reporting all of them.
        selection = { mode: 'full', fallback: 'no-files-placeholder', report: 'full — the scoped command has no {files} placeholder to carry every selected test' };
      } else {
        try {
          commands = expandChunked(template, selection.tests, platform).map((c) => c.command);
        } catch (err) {
          selection = { mode: 'full', fallback: 'selection-unsafe', report: `full — a selected test is not shell-safe: ${err.message}` };
        }
      }
    }
    const { tests, ...reported } = selection;

    // #3778: a selection split to fit the command line is one run per part,
    // each carrying the suite id and selection. `prepare` belongs to the first
    // part only — it builds the tree once — so a failed prepare means no part
    // of this suite runs, exactly as for an unsplit run.
    commands.forEach((command, i) => {
      const phases = [];
      if (i === 0 && typeof suite.prepare === 'string' && suite.prepare.trim() !== '') {
        phases.push({ phase: 'prepare', command: suite.prepare });
      }
      phases.push({ phase: 'full', command });
      const run = { suiteId: suite.id, phases, cwd: suiteCwd(suite), kind: suite.kind, selection: reported };
      if (commands.length > 1) run.chunk = { index: i + 1, of: commands.length };
      runs.push(run);
    });
  }

  const merged = collapseRuns(runs, (run) => [run.phases.map((p) => [p.phase, p.command]), run.selection.report]);

  return { runs: merged.runs, collapsed: merged.collapsed, manualOnly, skipped, selectedNone, notPassed: selectedNone.map((s) => s.suiteId), warnings: [] };
}

/**
 * Turn one phase's exit code into a verdict (#2852 AC7).
 *
 * The `prepare` / `full` distinction is the whole point: a non-zero `prepare`
 * means the tests never ran, so a caller must not go on to run `full` and
 * report a test failure that belongs to the build.
 *
 * This helper CLASSIFIES; blocking `in_review` is the rule's action (#2857
 * AC2). Pure — no spawn, no filesystem — so the blocking decision is testable
 * without running anything.
 *
 * A missing runner is a fourth verdict (#3012). Exit 127 is POSIX "command
 * not found"; `spawnError: 'ENOENT'` is the same condition as reported by the
 * probe (`runner-probe.js`) on any platform. Either names the runner — the
 * remedy is the host toolchain, not the tests — and still blocks review. The
 * check runs before the `prepare` branch so a `prepare` whose runner is
 * absent is not misread as a failed build. `spawnError` and `runner` are
 * optional: a call without them behaves exactly as before.
 *
 * A command the shell refused to start is a fifth (#3778). cmd.exe answers a
 * line over 8,191 characters with "The command line is too long." and exit
 * 1 — the code a test failure uses — so without this check the verdict blamed
 * the tests for a command that never started. It is recognized from the
 * captured `output`, or — only when no output was captured — on a platform
 * with a limit, from an integer non-zero exit of a `command` longer than it;
 * the verdict names the limit and the length. Checked after the missing-runner
 * check and before `prepare` (#3831): neither the build nor the tests ran, and
 * a null exit (timeout or signal kill) is never read as a refusal. A `.cmd`
 * shim's refusal (#3855) is recognized too: "The input line is too long."
 * always, and "The syntax of the command is incorrect." only for a command
 * over `commandLineBudget`, since cmd.exe prints it for ordinary bad syntax.
 *
 * @returns {{verdict: string, phase: string, blocksReview: boolean, runner?: string|null,
 *            length?: number, limit?: number}}
 */
function classifyRunResult({ phase, exitCode, spawnError, command, runner, output, platform = process.platform } = {}) {
  // #3831: a missing runner is decided before the length heuristic, so an
  // over-limit command whose runner is absent still names the runner.
  if (exitCode === 127 || spawnError === 'ENOENT') {
    const name = runner || firstToken(command);
    return { verdict: 'runner not found', phase, blocksReview: true, runner: name || null };
  }
  // Only an integer non-zero exit can be a refusal: null (timeout, signal
  // kill) never is. Captured output decides when there is any; the
  // length-only rule applies only when nothing was captured.
  if (Number.isInteger(exitCode) && exitCode !== 0) {
    const captured = typeof output === 'string' && output.trim() !== '';
    const limit = commandLineLimit(platform);
    const length = typeof command === 'string' ? command.length : null;
    const budget = commandLineBudget(platform);
    const overBudget = budget !== null && length !== null && length > budget;
    const refused = captured && (TOO_LONG_RE.test(output) || (overBudget && SYNTAX_REFUSAL_RE.test(output)));
    const overLimit = !captured && limit !== null && length !== null && length > limit;
    if (refused || overLimit) {
      return { verdict: 'command line too long', phase, blocksReview: true, length, limit: limit || COMMAND_LINE_LIMITS.win32 };
    }
  }
  if (exitCode === 0) {
    return { verdict: 'passed', phase, blocksReview: false };
  }
  if (phase === 'prepare') {
    return { verdict: 'prerequisite failed', phase: 'prepare', blocksReview: true };
  }
  return { verdict: 'tests failed', phase: 'full', blocksReview: true };
}

/**
 * The per-AC run as a plan an agent can execute (#3880): the commands to run
 * after an acceptance criterion's change, each with its suite ids and its
 * selection report.
 *
 * Resolves the suites, runs each selector at the per-AC tier (`scopedSelect`,
 * else `sweepSelect`) through `runSelector`, and hands the results to
 * `scopedInvocations` as `selections`. Runs no test: the caller runs each
 * printed command. `runSelector` is the one side effect, injected so the plan
 * is testable without a subprocess; the command line passes
 * runner-probe.js's `runSelectorCommand`.
 *
 * @param {{root?: string, changedFiles?: string[], platform?: string,
 *   runSelector: (run: {suiteId: string, command: string, cwd: string|null, selector: string}) =>
 *     {exitCode: number|null, stdout: string, spawnError?: string}}} input
 * @returns {object} `ok: false` with `error` when the config cannot be read;
 *   otherwise `runs[]` (`command`, `suiteIds`, `cwd`, `files`, `selection`,
 *   `selectionReason` when the selector gave one (#3885), `chunk` when split), `selectors[]`, `selectedNone`, `notRun`, `unmatched`,
 *   `reason`, `scopedSkipped`, `manualOnly` and `warnings`.
 */
function scopedPlan({ root = process.cwd(), changedFiles = [], runSelector, platform = process.platform } = {}) {
  const resolved = resolveSuites(root);
  if (resolved.source === 'unreadable') {
    return { ok: false, tier: 'scoped', source: resolved.source, error: `framework-config.json could not be read: ${resolved.error}` };
  }
  const files = changedFiles.map((f) => String(f).replace(/\\/g, '/'));
  const selectorSet = selectorInvocations({ suites: resolved.suites, changedFiles: files, tier: 'scoped' });
  const selections = {};
  const selectors = [];
  for (const run of selectorSet.runs) {
    const result = runSelector(run) || {};
    selections[run.suiteId] = result;
    selectors.push({
      suiteId: run.suiteId, selector: run.selector, command: run.command, exitCode: result.exitCode,
      ...(result.spawnError ? { spawnError: result.spawnError } : {}),
    });
  }
  const scoped = scopedInvocations({ suites: resolved.suites, changedFiles: files, selections, platform });
  return {
    ok: true,
    tier: 'scoped',
    source: resolved.source,
    changedFiles: files,
    selectors,
    runs: scoped.runs.map((r) => ({
      command: r.command,
      suiteIds: r.suiteIds,
      cwd: r.cwd,
      files: r.files,
      selection: r.selection ? r.selection.report : 'touched tree',
      ...(r.selection && r.selection.reason ? { selectionReason: r.selection.reason } : {}),
      ...(r.chunk ? { chunk: r.chunk } : {}),
    })),
    selectedNone: scoped.selectedNone || [],
    notRun: [...selectorSet.notRun, ...scoped.notRun],
    unmatched: scoped.unmatched,
    reason: scoped.reason,
    scopedSkipped: scoped.scopedSkipped,
    manualOnly: scoped.manualOnly,
    warnings: scoped.warnings,
    ...(resolved.source === 'none' ? { message: 'No suite is declared in framework-config.json, so there is nothing to run.' } : {}),
  };
}

/**
 * The command line's selector runner. The spawn is runner-probe.js's, through
 * lib/exec.js — this module stays spawn-free. Required here, not at the top:
 * runner-probe.js requires this module.
 */
function defaultSelectorRunner(root) {
  const { runSelectorCommand } = require('./runner-probe.js');
  return (run) => runSelectorCommand(run, { root });
}

const USAGE = 'node .claude/scripts/shared/lib/test-runner.js scoped --files <changed-file...> [--root <project-root>]';

/**
 * Command line (#3880). `scoped --files <changed...>` prints the per-AC plan
 * as JSON. Exit 0 with a plan, 1 when the config cannot be read, 2 on a usage
 * error. `seams.runSelector` and `seams.log` replace the spawn and stdout in
 * tests.
 */
function cli(argv = process.argv.slice(2), seams = {}) {
  const log = seams.log || ((s) => console.log(s));
  const print = (doc) => log(JSON.stringify(doc, null, 2));
  const [sub, ...rest] = argv;
  if (sub !== 'scoped') {
    print({ ok: false, error: sub ? `unknown subcommand: ${sub}` : 'missing subcommand', usage: USAGE });
    return 2;
  }
  let files = null;
  let root = process.cwd();
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--files') {
      files = [];
      while (i + 1 < rest.length && !rest[i + 1].startsWith('--')) files.push(rest[++i]);
    } else if (rest[i] === '--root' && i + 1 < rest.length) {
      root = rest[++i];
    } else {
      print({ ok: false, error: `unrecognized argument: ${rest[i]}`, usage: USAGE });
      return 2;
    }
  }
  if (!files || files.length === 0) {
    print({ ok: false, error: '--files takes at least one changed file', usage: USAGE });
    return 2;
  }
  const plan = scopedPlan({ root, changedFiles: files, runSelector: seams.runSelector || defaultSelectorRunner(root) });
  print(plan);
  return plan.ok ? 0 : 1;
}

module.exports = {
  scopedPlan,
  cli,
  resolveSelection,
  resolveSuites,
  scopedInvocations,
  sweepInvocations,
  selectorInvocations,
  resolveConcurrency,
  isWholeRepo,
  deferredInvocations,
  leftoverWorktrees,
  CONCURRENCY_VALUES,
  EXCLUSIVE_BY_ROLE,
  WORKTREE_PREFIX,
  classifyRunResult,
  commandLineLimit,
  commandLineBudget,
  expandChunked,
  firstToken,
  SCOPING_MODES,
  DEFAULT_SCOPING_MODE,
  SELECTION_TIERS,
};

// After module.exports: runner-probe.js, which the command line requires,
// requires this module back and must find its exports complete.
if (require.main === module) {
  process.exitCode = cli();
}
