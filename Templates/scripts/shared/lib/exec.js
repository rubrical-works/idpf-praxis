// Rubrical Works (c) 2026
/**
 * @framework-script 0.100.2
 * @description Timed child-process wrappers. Exports execTimed(), execTimedAsync(), execFileTimed(), execFileTimedAsync() and withTimeout() — every spawn under shared/ routes through one of these so a hung gh/git call fails with ETIMEDOUT instead of blocking the workflow forever.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * lib/exec.js — bounded child-process execution
 *
 * Why this exists: an unbounded spawn turns a hung `gh` call, a credential
 * prompt, or `index.lock` contention into an indefinite freeze of the calling
 * workflow — no feedback, no upper bound, nothing to report. A timeout converts
 * that into an actionable error.
 *
 * Why a helper rather than `timeout:` at each call site: Node reports a timeout
 * kill inconsistently across the two forms.
 *
 *   execFileSync  -> { code: 'ETIMEDOUT', signal: 'SIGTERM', status: null }
 *   execFile (promisified)
 *                 -> { code: null,        signal: 'SIGTERM', killed: true }
 *
 * A caller branching on `err.code === 'ETIMEDOUT'` therefore works for sync
 * spawns and silently never fires for async ones. These wrappers normalise both
 * to a single contract so `done-preamble.js`'s TIMEOUT classification (and any
 * future retry policy) can rely on it.
 *
 * Node built-ins only — deployed helpers may not require undeclared externals
 * (see Reference/Deployment-Awareness.md § Runtime Dependency Contract).
 *
 * Refs #2469
 */

'use strict';

// The module object is held rather than its members destructured, and the
// promisified forms are built on first use rather than at load.
//
// Both choices exist for the same reason: a large number of existing suites mock
// child_process partially (execSync + spawnSync, say). Destructuring at load
// captures `undefined` for whatever the mock omits, and `promisify(undefined)`
// throws — so importing this helper anywhere in a mocked module graph would fail
// the suite at import time, before a single test ran. A helper should not
// explode on load over a function it may never call.
const cp = require('child_process');
const { promisify } = require('util');

let _execAsync = null;
let _execFileAsync = null;

function execAsync(command, options) {
  if (!_execAsync) _execAsync = promisify(cp.exec);
  return _execAsync(command, options);
}

function execFileAsync(file, args, options) {
  if (!_execFileAsync) _execFileAsync = promisify(cp.execFile);
  return _execFileAsync(file, args, options);
}

/** Default ceiling for any spawn that does not name its own. */
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Merge the default budget into an options object.
 *
 * Uses `??` rather than `||` deliberately: `timeout: 0` disables Node's timer,
 * and `||` would rewrite that to 30s — handing back an unbounded spawn from the
 * helper whose entire job is bounding it.
 *
 * @param {object} [options] - Caller options
 * @returns {object} Options with a `timeout` guaranteed present
 */
function withTimeout(options = {}) {
  return { ...options, timeout: options.timeout ?? DEFAULT_TIMEOUT_MS };
}

/**
 * Normalise a spawn error so a timeout always carries `code: 'ETIMEDOUT'`.
 *
 * Detection differs by form. Sync spawns already set the code, so they pass
 * through. Async spawns report only `killed: true` plus the kill signal, so the
 * signal is what identifies them — checked together with `killed` so an ordinary
 * non-zero exit is never relabelled as a hang.
 *
 * @param {Error} err - Error thrown/rejected by child_process
 * @param {string} label - Command shown in the message
 * @param {number} timeoutMs - Budget that was applied
 * @returns {Error} The same error, annotated when it was a timeout
 */
function normalizeTimeoutError(err, label, timeoutMs) {
  const timedOut = err.code === 'ETIMEDOUT' ||
    (err.killed === true && err.signal === 'SIGTERM');
  if (!timedOut) return err;
  err.code = 'ETIMEDOUT';
  err.timeout = timeoutMs;
  err.message = `Command timed out after ${timeoutMs}ms: ${label}`;
  return err;
}

/**
 * Run a shell command synchronously under a timeout.
 *
 * Shell form is retained because a number of call sites pass a single command
 * string and depend on shell semantics; rewriting those to execFile would be a
 * behaviour change well beyond adding a bound.
 *
 * @param {string} command - Command line to run
 * @param {object} [options] - execSync options; `timeout` defaults to 30s
 * @returns {string} stdout
 * @throws {Error} `code: 'ETIMEDOUT'` on timeout; original error otherwise
 */
function execTimed(command, options = {}) {
  const opts = withTimeout({ encoding: 'utf-8', ...options });
  try {
    return cp.execSync(command, opts);
  } catch (err) {
    throw normalizeTimeoutError(err, command, opts.timeout);
  }
}

/**
 * Run a shell command asynchronously under a timeout.
 *
 * @param {string} command - Command line to run
 * @param {object} [options] - exec options; `timeout` defaults to 30s
 * @returns {Promise<{stdout: string, stderr: string}>}
 * @throws {Error} `code: 'ETIMEDOUT'` on timeout; original error otherwise
 */
async function execTimedAsync(command, options = {}) {
  const opts = withTimeout({ encoding: 'utf-8', ...options });
  try {
    return await execAsync(command, opts);
  } catch (err) {
    throw normalizeTimeoutError(err, command, opts.timeout);
  }
}

/**
 * Run a binary synchronously under a timeout, without a shell.
 *
 * @param {string} file - Executable to run
 * @param {string[]} [args] - Arguments
 * @param {object} [options] - execFileSync options; `timeout` defaults to 30s
 * @returns {string} stdout
 * @throws {Error} `code: 'ETIMEDOUT'` on timeout; original error otherwise
 */
function execFileTimed(file, args = [], options = {}) {
  const opts = withTimeout({ encoding: 'utf-8', ...options });
  try {
    return cp.execFileSync(file, args, opts);
  } catch (err) {
    throw normalizeTimeoutError(err, `${file} ${args.join(' ')}`.trim(), opts.timeout);
  }
}

/**
 * Run a binary asynchronously under a timeout, without a shell.
 *
 * @param {string} file - Executable to run
 * @param {string[]} [args] - Arguments
 * @param {object} [options] - execFile options; `timeout` defaults to 30s
 * @returns {Promise<{stdout: string, stderr: string}>}
 * @throws {Error} `code: 'ETIMEDOUT'` on timeout; original error otherwise
 */
async function execFileTimedAsync(file, args = [], options = {}) {
  const opts = withTimeout({ encoding: 'utf-8', ...options });
  try {
    return await execFileAsync(file, args, opts);
  } catch (err) {
    throw normalizeTimeoutError(err, `${file} ${args.join(' ')}`.trim(), opts.timeout);
  }
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  withTimeout,
  normalizeTimeoutError,
  execTimed,
  execTimedAsync,
  execFileTimed,
  execFileTimedAsync,
};
