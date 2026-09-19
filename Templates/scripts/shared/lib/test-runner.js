// Rubrical Works (c) 2026
/**
 * @framework-script 0.104.0
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

/** The mode an unrecognised or absent declaration falls back to. */
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

/** Files from `changedFiles` that any of the suite's `match[]` patterns cover. */
function filesForSuite(suite, changedFiles) {
  const patterns = Array.isArray(suite.match) ? suite.match : [];
  return changedFiles.filter((f) => patterns.some((p) => globMatch(f, p)));
}

/** A suite the gate never invokes at any scope. */
function isManualOnly(suite) {
  return suite && suite.execution === 'manual-only';
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
  // half-initialised for the other.
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
 * @returns {{runs: object[], unmatched: string[], reason: string|null,
 *            warnings: string[]}} `reason` is `'no-suites-matched'` when
 *   nothing ran — which must stay distinguishable from "everything passed",
 *   since both are an empty result and conflating them is a silent skip.
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
      // Named, never silently skipped: an unrecognised mode is a declaration
      // the project believes is in force.
      warnings.push(
        `Suite "${suite.id}" declares unrecognised scoping mode "${mode}" — `
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

    runs.push({ suiteId: suite.id, mode, command, files });
  }

  return {
    runs,
    unmatched: changedFiles.filter((f) => !matchedAny.has(f)),
    reason: runs.length === 0 && changedFiles.length > 0 ? 'no-suites-matched' : null,
    warnings,
  };
}

/**
 * The full-sweep invocation set.
 *
 * @returns {{runs: object[], manualOnly: string[], skipped: string[],
 *            warnings: string[]}} A run carries `phases`, ordered `prepare`
 *   then `full`, so a caller cannot accidentally run tests against an unbuilt
 *   tree and report a failure that is not the code's.
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

    runs.push({ suiteId: suite.id, phases });
  }

  return { runs, manualOnly, skipped, warnings: [] };
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
 * @returns {{verdict: string, phase: string, blocksReview: boolean}}
 */
function classifyRunResult({ phase, exitCode } = {}) {
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
  SCOPING_MODES,
  DEFAULT_SCOPING_MODE,
};
