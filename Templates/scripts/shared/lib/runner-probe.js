// Rubrical Works (c) 2026
/**
 * @framework-script 0.107.1
 * @description Runner-presence probe for the verification gates and the startup dependency check (#3012). Resolves the first token of a suite command on PATH — `where` on win32, `command -v` through `sh` elsewhere — without ever spawning the runner itself, and names the suites each missing runner would have served.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * lib/runner-probe.js — is the runner a suite names actually on PATH?
 *
 * Why a sibling of test-runner.js rather than an addition to it: that helper
 * is PURE — it runs nothing and spawns nothing — and that purity is what makes
 * `prerequisite failed` testable without a subprocess (#2852). A probe has to
 * spawn, so it lives here and test-runner.js keeps its contract.
 *
 * Why the lookup never spawns the runner: on win32 `npm` resolves to
 * `npm.cmd`, and spawning a `.cmd` without a shell throws EINVAL on Node >=
 * 20.12 (px-manager#944). `where` and `command -v` answer the question the
 * gates ask — "is it on PATH?" — without executing anything the suite author
 * wrote. The runner name reaches `sh` as a positional argument, never
 * interpolated into the script string.
 *
 * Node built-ins and colocated files only — deployed helpers may not require
 * undeclared externals (04-deployment-awareness.md § Runtime Dependency Contract).
 */

'use strict';

const { execFileTimed } = require('./exec.js');
const { firstToken } = require('./test-runner.js');

/** A PATH lookup is instant; anything longer is a hung shell, not a slow one. */
const PROBE_TIMEOUT_MS = 5000;

/** `where` prints one match per line; `command -v` prints one. Take the first. */
function firstLine(stdout) {
  const text = typeof stdout === 'string' ? stdout : String(stdout || '');
  const line = text.split(/\r?\n/).find((l) => l.trim() !== '');
  return line ? line.trim() : null;
}

/**
 * Resolve the runner a suite command names on PATH.
 *
 * @param {string} command - A suite `full` or `prepare` command
 * @param {object} [options]
 * @param {string} [options.platform] - `process.platform` override (tests)
 * @param {Function} [options.exec] - `(file, args, opts) => stdout` override (tests)
 * @returns {{runner: string|null, found: boolean, path: string|null, error: string|null}}
 *   `error` carries the lookup's own failure code (`ENOENT`, `ETIMEDOUT`) —
 *   the probe could not run, which is not the same as "not found".
 */
function probeRunner(command, options = {}) {
  const runner = firstToken(command);
  if (!runner) return { runner: null, found: false, path: null, error: null };

  const platform = options.platform || process.platform;
  const exec = options.exec || execFileTimed;
  const opts = { timeout: PROBE_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] };

  const [file, args] = platform === 'win32'
    ? ['where', [runner]]
    : ['sh', ['-c', 'command -v -- "$1"', '_', runner]];

  try {
    const found = firstLine(exec(file, args, opts));
    return found
      ? { runner, found: true, path: found, error: null }
      : { runner, found: false, path: null, error: null };
  } catch (err) {
    // A non-zero exit is the lookup's answer: not on PATH. A spawn error is the
    // lookup failing to ask — reported as such so a missing `sh` or `where`
    // does not read as every runner being absent.
    const exited = err && typeof err.status === 'number';
    if (!exited && err && err.code) {
      return { runner, found: false, path: null, error: String(err.code) };
    }
    return { runner, found: false, path: null, error: null };
  }
}

/**
 * Probe every distinct runner a suite list names, once each.
 *
 * `manual-only` suites are skipped — nothing runs them, so nothing needs their
 * runner. Both `full` and `prepare` count: a `prepare` that cannot start is a
 * `prerequisite failed` the gate would otherwise misattribute to the build.
 *
 * @param {Array<object>} suites - Normalized suites (`resolveSuites().suites`)
 * @param {object} [options] - Forwarded to `probeRunner`
 * @returns {{runners: Array<{runner, found, path, error, suites: string[]}>, missing: Array<{runner, suites: string[], error}>}}
 */
function probeSuites(suites, options = {}) {
  const list = Array.isArray(suites) ? suites : [];
  const byRunner = new Map();

  for (const suite of list) {
    if (!suite || suite.execution === 'manual-only') continue;
    for (const command of [suite.full, suite.prepare]) {
      const runner = firstToken(command);
      if (!runner) continue;
      if (!byRunner.has(runner)) byRunner.set(runner, { command, suites: [] });
      const entry = byRunner.get(runner);
      if (suite.id && !entry.suites.includes(suite.id)) entry.suites.push(suite.id);
    }
  }

  const runners = [];
  for (const [, entry] of byRunner) {
    const r = probeRunner(entry.command, options);
    runners.push({ ...r, suites: entry.suites });
  }

  const missing = runners
    .filter((r) => !r.found)
    .map((r) => ({ runner: r.runner, suites: r.suites, error: r.error }));

  return { runners, missing };
}

module.exports = { probeRunner, probeSuites, PROBE_TIMEOUT_MS };
