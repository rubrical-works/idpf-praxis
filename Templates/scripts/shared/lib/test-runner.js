// Rubrical Works (c) 2026
/**
 * @framework-script 0.108.0
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
 *            reason: string|null, warnings: string[]}} `reason` is
 *   `'no-suites-matched'` when nothing ran — which must stay distinguishable
 *   from "everything passed", since both are an empty result and conflating
 *   them is a silent skip. Suites whose scoped command and `cwd` match share
 *   one run carrying every id and the union of their files (#3025).
 */
function scopedInvocations({ suites = [], changedFiles = [] } = {}) {
  const runs = [];
  const warnings = [];
  const matchedAny = new Set();

  for (const suite of suites) {
    if (isManualOnly(suite)) continue;

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
    if (mode === DEFAULT_SCOPING_MODE) {
      command = suite.full;
    } else {
      const template = scoped.command || suite.full;
      try {
        command = expandPlaceholders(template, files);
      } catch (err) {
        warnings.push(`Suite "${suite.id}" was not run: ${err.message}`);
        continue;
      }
    }

    runs.push({ suiteId: suite.id, mode, command, files, cwd: suiteCwd(suite), kind: suite.kind });
  }

  const merged = collapseRuns(runs, (run) => run.command, (into, from) => {
    for (const f of from.files) if (!into.files.includes(f)) into.files.push(f);
  });

  return {
    runs: merged.runs,
    collapsed: merged.collapsed,
    unmatched: changedFiles.filter((f) => !matchedAny.has(f)),
    reason: runs.length === 0 && changedFiles.length > 0 ? 'no-suites-matched' : null,
    warnings,
  };
}

/**
 * The full-sweep invocation set.
 *
 * @returns {{runs: object[], collapsed: {suiteIds: string[]}[], manualOnly: string[],
 *            skipped: string[], warnings: string[]}} A run carries `phases`,
 *   ordered `prepare` then `full`, so a caller cannot accidentally run tests
 *   against an unbuilt tree and report a failure that is not the code's.
 *   Suites whose phases and `cwd` match share one run carrying every id
 *   (#3025); `collapsed` names each merge.
 */
function sweepInvocations({ suites = [], sweepScope = 'all', changedFiles = [] } = {}) {
  const runs = [];
  const manualOnly = [];
  const skipped = [];

  for (const suite of suites) {
    if (isManualOnly(suite)) {
      // Excluded from BOTH sets, and named — declared-but-not-run is
      // information, and dropping it silently would read as "not declared".
      manualOnly.push(suite.id);
      continue;
    }
    if (suite.sweep === false) {
      skipped.push(suite.id);
      continue;
    }
    if (sweepScope === 'touched' && filesForSuite(suite, changedFiles).length === 0) {
      skipped.push(suite.id);
      continue;
    }

    const phases = [];
    if (typeof suite.prepare === 'string' && suite.prepare.trim() !== '') {
      phases.push({ phase: 'prepare', command: suite.prepare });
    }
    phases.push({ phase: 'full', command: suite.full });

    runs.push({ suiteId: suite.id, phases, cwd: suiteCwd(suite), kind: suite.kind });
  }

  const merged = collapseRuns(runs, (run) => run.phases.map((p) => [p.phase, p.command]));

  return { runs: merged.runs, collapsed: merged.collapsed, manualOnly, skipped, warnings: [] };
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
  classifyRunResult,
  firstToken,
  SCOPING_MODES,
  DEFAULT_SCOPING_MODE,
};
