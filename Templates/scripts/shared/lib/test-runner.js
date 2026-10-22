// Rubrical Works (c) 2026
/**
 * @framework-script 0.110.0
 * test-runner.js — suite resolution, scoped routing, sweep sets, run
 * classification (#2852).
 *
 * PURE. This helper runs nothing and spawns nothing: it turns a declaration
 * into invocation sets and classifies an exit code. The caller owns the
 * processes, and the rule owns what blocks `in_review` (#2857 AC2). Keeping
 * the decision here and the action there is what makes "prerequisite failed"
 * testable without a subprocess.
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

const { sanitizeShellArg } = require('./shell-safe.js');

/** Scoping modes that ship in v1. `filter` is reserved and deliberately absent. */
const SCOPING_MODES = Object.freeze(['path', 'package', 'none', 'custom']);

/** The mode an unrecognized or absent declaration falls back to. */
const DEFAULT_SCOPING_MODE = 'none';

/**
 * Vendored glob matcher, the same one `scope-drift-check.js` carries (#2418).
 *
 * Supports literals, `*` within a segment and `**` across segments — the whole
 * pattern set a `match[]` entry uses. Brace expansion, negation and `?` are
 * NOT supported; if a caller ever needs them, switch this helper rather than
 * re-introducing an external dependency that cannot resolve from the hub.
 */
function globToRegex(pattern) {
  let re = '^';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        re += '.*';
        i += 2;
        if (pattern[i] === '/') i++;
      } else {
        re += '[^/]*';
        i++;
      }
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

/** Files from `changedFiles` that any of the suite's `match[]` patterns cover. */
function filesForSuite(suite, changedFiles) {
  const patterns = Array.isArray(suite.match) ? suite.match : [];
  return changedFiles.filter((f) => patterns.some((p) => globMatch(f, p)));
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
 * Split suites by where they may run (#3132). Manual-only and invalid suites
 * are in neither set, and named, so nothing leaves the report silently.
 *
 * @returns {{parallel: object[], exclusive: object[], manualOnly: string[],
 *   invalid: Array<{suiteId: string, declared: *, error: string}>, warnings: string[]}}
 */
function partitionByConcurrency(suites) {
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
    (concurrency.value === 'exclusive' ? out.exclusive : out.parallel).push(suite);
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
 * Every substituted value goes through `sanitizeShellArg`, which REJECTS shell
 * metacharacters rather than escaping them. A rejection the caller can see and
 * report beats a command that merely looks composed — the value comes from
 * `git diff` output, which is attacker-influenced in any repository that takes
 * contributions.
 *
 * @throws {Error} From `sanitizeShellArg`, when a value is not shell-safe.
 */
function expandPlaceholders(template, files) {
  const first = files[0] || '';
  const slash = first.lastIndexOf('/');
  const dir = slash === -1 ? '.' : first.slice(0, slash);
  const base = first.slice(slash + 1);
  const dot = base.lastIndexOf('.');
  const stem = dot === -1 ? base : base.slice(0, dot);
  const pkg = first.split('/')[0] || '';

  const safeFiles = files.map((f) => sanitizeShellArg(f, 'changed file')).join(' ');

  return template
    .replace(/\{files\}/g, safeFiles)
    .replace(/\{dir\}/g, sanitizeShellArg(dir, 'directory'))
    .replace(/\{stem\}/g, sanitizeShellArg(stem, 'stem'))
    .replace(/\{package\}/g, sanitizeShellArg(pkg, 'package'));
}

/**
 * Resolve a project's declaration into a normalized suite list.
 *
 * @param {string} [cwd] - Project root
 * @returns {{suites: object[], source: 'testing'|'verificationCommands'|'testCommand'|'none',
 *            sweepScope: string}}
 */
function resolveSuites(cwd = process.cwd()) {
  // Function-scoped, deliberately: framework-config.js requires THIS module
  // from inside `resolveVerificationCommands`, so a top-level require in
  // either direction would be a load-time cycle leaving one module
  // half-initialized for the other.
  const { read, normalizeSuite } = require('./framework-config.js');

  const NONE = { suites: [], source: 'none', sweepScope: 'all' };

  let config;
  try {
    config = read(cwd);
  } catch {
    return NONE;
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
 *   expansion error skipped (#3175). `reason` is
 *   `'no-suites-matched'` when nothing ran — which must stay distinguishable
 *   from "everything passed", since both are an empty result and conflating
 *   them is a silent skip. Suites whose scoped command and `cwd` match share
 *   one run carrying every id and the union of their files (#3025).
 */
function scopedInvocations({ suites = [], changedFiles = [], inWorktree = false } = {}) {
  const runs = [];
  const warnings = [];
  const notRun = [];
  const matchedAny = new Set();
  // Inside a member's worktree only parallel suites run (#3132). Exclusive
  // suites are returned as the deferred set the parent runs after merge-back
  // — never dropped, so a role-default e2e suite is never skipped. An
  // invalid declaration is named and is in neither set. Outside a worktree
  // nothing is partitioned and every gate suite runs, as before.
  const split = inWorktree
    ? partitionByConcurrency(suites)
    : { parallel: suites.filter((s) => !isManualOnly(s)), exclusive: [], manualOnly: suites.filter(isManualOnly).map((s) => s.id), invalid: [], warnings: [] };
  const deferred = split.exclusive.map((s) => ({ suiteId: s.id, concurrency: 'exclusive', source: resolveConcurrency(s).source }));
  const { invalid, manualOnly } = split;
  warnings.push(...split.warnings);

  for (const suite of split.parallel) {
    const files = filesForSuite(suite, changedFiles);
    if (files.length === 0) continue;
    files.forEach((f) => matchedAny.add(f));

    const scoped = suite.scoped || {};
    let mode = scoped.mode === undefined ? DEFAULT_SCOPING_MODE : scoped.mode;
    if (!SCOPING_MODES.includes(mode)) {
      // Named, never silently skipped: an unrecognized mode is a declaration
      // the project believes is in force.
      warnings.push(
        `Suite "${suite.id}" declares unrecognized scoping mode "${mode}" — `
        + `falling back to "${DEFAULT_SCOPING_MODE}".`
      );
      mode = DEFAULT_SCOPING_MODE;
    }

    if (mode === DEFAULT_SCOPING_MODE && scoped.onScoped === 'skip') continue;

    let command;
    let narrowed = false;
    if (mode === DEFAULT_SCOPING_MODE) {
      command = suite.full;
    } else {
      const template = scoped.command || suite.full;
      // A template expanding no placeholder runs the whole suite whatever
      // changed — the Merge-Back Review Gate defers such a run (#3159).
      narrowed = PLACEHOLDER_RE.test(template);
      try {
        command = expandPlaceholders(template, files);
      } catch (err) {
        // `notRun` is the structured record consumers read (#3175); the
        // warning is for display and its wording is not a contract.
        notRun.push({ suiteId: suite.id, reason: err.message });
        warnings.push(`Suite "${suite.id}" was not run: ${err.message}`);
        continue;
      }
    }

    runs.push({ suiteId: suite.id, mode, command, narrowed, files, cwd: suiteCwd(suite), kind: suite.kind });
  }

  const merged = collapseRuns(runs, (run) => run.command, (into, from) => {
    for (const f of from.files) if (!into.files.includes(f)) into.files.push(f);
    into.narrowed = into.narrowed && from.narrowed;
  });

  return {
    runs: merged.runs,
    collapsed: merged.collapsed,
    unmatched: changedFiles.filter((f) => !matchedAny.has(f)),
    reason: runs.length === 0 && changedFiles.length > 0 ? 'no-suites-matched' : null,
    deferred,
    invalid,
    notRun,
    manualOnly,
    warnings,
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
 * @returns {{runs: object[], collapsed: object[], serial: true, manualOnly: string[],
 *   invalid: object[], unmatchedExclusive: string[], unmatchedCannotNarrow: string[],
 *   warnings: string[]}}
 */
function deferredInvocations({ suites = [], changedFiles = [], cannotNarrow = [] } = {}) {
  const { exclusive, parallel, invalid, manualOnly, warnings } = partitionByConcurrency(suites);

  const narrowIds = [...new Set(cannotNarrow)];
  const unknown = narrowIds.filter((id) => !parallel.some((s) => s.id === id));
  for (const id of unknown) {
    warnings.push(`Deferred suite "${id}" names no declared parallel suite — not run.`);
  }
  const narrowSuites = parallel.filter((s) => narrowIds.includes(s.id));

  const scoped = scopedInvocations({ suites: exclusive, changedFiles });
  const late = scopedInvocations({ suites: narrowSuites, changedFiles });
  const ran = new Set([...scoped.runs, ...late.runs].flatMap((r) => r.suiteIds));
  return {
    runs: [...scoped.runs, ...late.runs],
    collapsed: [...scoped.collapsed, ...late.collapsed],
    serial: true,
    manualOnly,
    invalid,
    unmatchedExclusive: exclusive.map((s) => s.id).filter((id) => !ran.has(id)),
    unmatchedCannotNarrow: narrowSuites.map((s) => s.id).filter((id) => !ran.has(id)),
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

function declaresSelector(suite) {
  return typeof suite.sweepSelect === 'string' && suite.sweepSelect.trim() !== '';
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
 * @returns {{runs: Array<{suiteId: string, command: string, cwd: string|null}>,
 *            notRun: {suiteId: string, reason: string}[]}}
 */
function selectorInvocations({ suites = [], sweepScope = 'all', changedFiles = [] } = {}) {
  const runs = [];
  const notRun = [];
  if (changedFiles.length === 0) return { runs, notRun };
  for (const suite of suites) {
    if (!isSwept(suite, sweepScope, changedFiles) || !declaresSelector(suite)) continue;
    try {
      runs.push({ suiteId: suite.id, command: expandPlaceholders(suite.sweepSelect, changedFiles), cwd: suiteCwd(suite) });
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
function resolveSelection(suite, result, changedFiles) {
  const full = (fallback, why) => ({ mode: 'full', fallback, report: `full — ${why}` });
  if (!declaresSelector(suite)) return full('no-selector', 'no sweepSelect declared');
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
  return {
    mode: 'selected',
    tests,
    selected: tests.length,
    ...(total === undefined ? {} : { total }),
    report: total === undefined ? `selected ${tests.length}` : `selected ${tests.length} of ${total}`,
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
 * @returns {{runs: object[], collapsed: {suiteIds: string[]}[], manualOnly: string[],
 *            skipped: string[], selectedNone: object[], warnings: string[]}} A run
 *   carries `phases`, ordered `prepare` then `full`, so a caller cannot
 *   accidentally run tests against an unbuilt tree and report a failure that
 *   is not the code's. Suites whose phases, `cwd` and selection match share
 *   one run carrying every id (#3025); `collapsed` names each merge.
 */
function sweepInvocations({ suites = [], sweepScope = 'all', changedFiles = [], selections = {} } = {}) {
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
      selectedNone.push({ suiteId: suite.id, report: selection.report, reason: selection.reason });
      continue;
    }
    let command = suite.full;
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
          command = expandPlaceholders(template, selection.tests);
        } catch (err) {
          selection = { mode: 'full', fallback: 'selection-unsafe', report: `full — a selected test is not shell-safe: ${err.message}` };
        }
      }
    }
    const { tests, ...reported } = selection;

    const phases = [];
    if (typeof suite.prepare === 'string' && suite.prepare.trim() !== '') {
      phases.push({ phase: 'prepare', command: suite.prepare });
    }
    phases.push({ phase: 'full', command });

    runs.push({ suiteId: suite.id, phases, cwd: suiteCwd(suite), kind: suite.kind, selection: reported });
  }

  const merged = collapseRuns(runs, (run) => [run.phases.map((p) => [p.phase, p.command]), run.selection.report]);

  return { runs: merged.runs, collapsed: merged.collapsed, manualOnly, skipped, selectedNone, warnings: [] };
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
 * @returns {{verdict: string, phase: string, blocksReview: boolean, runner?: string|null}}
 */
function classifyRunResult({ phase, exitCode, spawnError, command, runner } = {}) {
  if (exitCode === 127 || spawnError === 'ENOENT') {
    const name = runner || firstToken(command);
    return { verdict: 'runner not found', phase, blocksReview: true, runner: name || null };
  }
  if (exitCode === 0) {
    return { verdict: 'passed', phase, blocksReview: false };
  }
  if (phase === 'prepare') {
    return { verdict: 'prerequisite failed', phase: 'prepare', blocksReview: true };
  }
  return { verdict: 'tests failed', phase: 'full', blocksReview: true };
}

module.exports = {
  resolveSuites,
  scopedInvocations,
  sweepInvocations,
  selectorInvocations,
  resolveConcurrency,
  deferredInvocations,
  leftoverWorktrees,
  CONCURRENCY_VALUES,
  EXCLUSIVE_BY_ROLE,
  WORKTREE_PREFIX,
  classifyRunResult,
  firstToken,
  SCOPING_MODES,
  DEFAULT_SCOPING_MODE,
};
