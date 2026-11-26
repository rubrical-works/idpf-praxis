// Rubrical Works (c) 2026
/**
 * @framework-script 0.123.0
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

const path = require('path');
const { execFileTimed, execTimed } = require('./exec.js');
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

/** How long one selector may run before it counts as failed and the per-AC run falls back. */
const SELECTOR_TIMEOUT_MS = 120000;

/**
 * Run one suite selector for `test-runner.js scoped` (#3880).
 *
 * The spawn lives here, beside the probe, so test-runner.js stays spawn-free.
 * A selector is a project-declared command line carrying `{files}` already
 * expanded and shell-checked, so it runs through the shell form. Nothing is
 * thrown: a non-zero exit is `{exitCode, stdout}`, and a timeout or failed
 * spawn is `spawnError` — both make the plan fall back to the touched tree.
 *
 * @param {{command: string, cwd: string|null}} run - from selectorInvocations
 * @param {{root?: string, exec?: Function}} [options] - `exec` replaces execTimed in tests
 * @returns {{exitCode: number|null, stdout: string, spawnError?: string}}
 */
function runSelectorCommand(run, { root = process.cwd(), exec = execTimed } = {}) {
  // A suite `cwd` is config-declared and reaches a spawn: contain it to the
  // root before anything runs (#3880 review). Refused, not thrown, so the
  // plan falls back and names why.
  const base = path.resolve(root);
  const cwd = run.cwd ? path.resolve(base, run.cwd) : base;
  const rel = path.relative(base, cwd);
  // A parent segment, not a '..' prefix (#3892): '..cache/x' is in the root.
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    return { exitCode: null, stdout: '', spawnError: `suite cwd ${JSON.stringify(run.cwd)} resolves outside the project root` };
  }
  try {
    const stdout = exec(run.command, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
      timeout: SELECTOR_TIMEOUT_MS,
    });
    return { exitCode: 0, stdout: String(stdout || '') };
  } catch (err) {
    if (Number.isInteger(err.status)) return { exitCode: err.status, stdout: String(err.stdout || '') };
    return { exitCode: null, stdout: '', spawnError: err.code || err.message };
  }
}

module.exports = { probeRunner, probeSuites, runSelectorCommand, PROBE_TIMEOUT_MS, SELECTOR_TIMEOUT_MS };
