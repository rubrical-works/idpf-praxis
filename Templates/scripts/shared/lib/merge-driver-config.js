// Rubrical Works (c) 2026
/**
 * @framework-script 0.111.0
 * merge-driver-config.js — Idempotent writer of the `merge.<name>.driver`
 * git config entry for json-merge-driver.js (#3119, PRD Concurrent-Work
 * Story 1.2)
 *
 * `.gitattributes` only NAMES a merge driver (`<path> merge=json-merge`);
 * git reads the driver's command from `merge.<name>.driver` in config, and
 * no clone carries that entry by default — an unregistered name silently
 * falls back to the textual three-way merge. This helper writes the entry
 * into the repository's LOCAL config so the attribute means something:
 *   - the WorktreeCreate hook (Story 1.5) runs it before handing a worktree
 *     over — from inside a linked worktree `git config --local` writes the
 *     shared common config, so one run covers every worktree;
 *   - this repository runs it at setup;
 *   - the regeneration runner (Story 1.3) shares it;
 *   - in deployed projects Praxis Hub Manager runs it at project setup (the
 *     companion item this story files).
 *
 * IDEMPOTENT AS BYTES, not merely as effect: the entry is read first and
 * written only when it differs, so a second run leaves .git/config
 * untouched. The hook runs on every worktree creation; a config file that
 * churned on each would be one nobody could diff.
 *
 * Never throws: outside a repository, or on any git failure, the envelope
 * reports `ok: false` with the reason, matching the other shared helpers.
 *
 * The command defaults to a PROJECT-RELATIVE script path. Git runs merge
 * drivers from the worktree root, where `.claude/scripts/shared/` resolves
 * through the hub link in a deployed project and survives a hub upgrade
 * that an absolute hub path would not.
 */

const path = require('path');
const { spawnSync } = require('child_process');

/** The name .gitattributes uses; kept equal to json-merge-driver.js's export by test. */
const DRIVER_NAME = 'json-merge';

/** The driver script, relative to the project root. */
const DRIVER_SCRIPT = '.claude/scripts/shared/json-merge-driver.js';

/** What git runs: base, ours, theirs and the pathname. */
const DEFAULT_COMMAND = `node ${DRIVER_SCRIPT} %O %A %B %P`;

/** `merge.<name>.name` — git shows it in conflict messages. */
const DRIVER_DESCRIPTION = 'IDPF JSON-aware merge for declared accumulator files';

/**
 * The driver for declared DERIVED artifacts (#3152). A derived file is
 * regenerated after every merge, so either side is as good as the other and a
 * textual conflict only stops the merge before the regeneration runner can
 * run (QA #3143). `true` exits 0 and leaves `%A` — the current side — in
 * place. It is registered like json-merge because git has no built-in "ours"
 * driver: `merge=ours` with no config entry still conflicts.
 */
const DERIVED_DRIVER_NAME = 'idpf-derived';
const DERIVED_COMMAND = 'true';
const DERIVED_DESCRIPTION = 'IDPF take-one-side merge for declared derived artifacts (regenerated after the merge)';

function normalizePath(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Upper bound on each git call (#2469 spawn contract). Config reads and
 * writes are milliseconds; the bound is for `index.lock` contention or a hung
 * git, so the hook that calls this can never freeze worktree creation.
 */
const GIT_TIMEOUT_MS = 30_000;

function runGit(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: GIT_TIMEOUT_MS });
  return {
    status: r.status,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
    error: r.error || null,
  };
}

/** A local config value, null when unset; throws on any other git failure. */
function readLocal(key, cwd, git = runGit) {
  const r = git(['config', '--local', '--get', key], cwd);
  if (r.error) throw r.error;
  if (r.status === 0) return r.stdout;
  if (r.status === 1) return null;
  throw new Error(r.stderr || `git config --get ${key} exited ${r.status}`);
}

function writeLocal(key, value, cwd, git = runGit) {
  const r = git(['config', '--local', key, value], cwd);
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(r.stderr || `git config ${key} exited ${r.status}`);
}

/**
 * Config contention (#3200). Parallel WorktreeCreate hooks in a checkout where
 * the drivers are not yet registered all read the keys as absent and all
 * write. Git takes `config.lock` for each write, so every writer but one fails
 * to lock; and on Windows a reader opening `config` while another git renames
 * `config.lock` over it is refused with a sharing violation, which git reports
 * as an unreadable config. Both are transient. The winner wrote the same
 * value, so a loser that re-reads and finds it is done, and one that does not
 * retries after a backoff.
 */
const CONTENTION_ERROR = /could not lock config file|unable to access '[^']*config': Permission denied|unknown error occurred while reading the configuration files/i;
const RETRY_ATTEMPTS = 5;

/**
 * Jittered exponential backoff: 50ms doubling per attempt, capped at 400ms,
 * each delay drawn from the upper half of its step and never under 50ms, so
 * contending hooks spread out instead of retrying in lockstep.
 */
function backoffDelay(attempt, random = Math.random) {
  const base = Math.min(400, 50 * 2 ** attempt);
  return Math.max(50, Math.round(base / 2 + (base / 2) * random()));
}

/** Synchronous sleep: the helper and its callers are synchronous. */
function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Run `step(attempt)` until it returns, retrying only failures whose message
 * `matcher` matches — config contention unless a caller names another
 * transient (#3236: the WorktreeCreate hook's sibling-admin-entry read).
 * `step` throwing anything else, or a match outlasting every attempt,
 * rethrows the error.
 *
 * @param {function(): *} step
 * @param {{attempts?: number, sleep?: function(number): void}} [retry]
 * @param {RegExp} [matcher] - which failures are transient; CONTENTION_ERROR by default
 */
function withContentionRetry(step, retry = {}, matcher = CONTENTION_ERROR) {
  const attempts = retry.attempts || RETRY_ATTEMPTS;
  const sleep = retry.sleep || ((attempt) => sleepMs(backoffDelay(attempt)));
  for (let attempt = 0; ; attempt++) {
    try {
      return step();
    } catch (err) {
      if (!matcher.test(err.message) || attempt + 1 >= attempts) throw err;
      sleep(attempt);
    }
  }
}

/**
 * One git call, retried while its stderr is config contention (#3234). Any
 * git command reads .git/config, so `rev-parse` meets the same Windows sharing
 * violation as a config read. Returns the runner's result as-is: the last
 * attempt's when contention outlasts the budget, the first when the failure
 * is anything else — a spawn error is never retried.
 *
 * @param {string[]} args
 * @param {string} cwd
 * @param {{attempts?: number, sleep?: function(number): void}} [retry]
 * @param {function} [git] - runner returning {status, stdout, stderr, error}
 * @returns {{status: number|null, stdout: string, stderr: string, error: Error|null}}
 */
function runGitContended(args, cwd, retry, git = runGit) {
  let result;
  try {
    withContentionRetry(() => {
      result = git(args, cwd);
      if (!result.error && result.status !== 0 && CONTENTION_ERROR.test(result.stderr)) {
        throw new Error(result.stderr);
      }
    }, retry);
  } catch (_) { /* contention outlasted the budget: `result` is the last attempt */ }
  return result;
}

/** readLocal, retried through config contention. */
function readLocalContended(key, cwd, retry, git) {
  return withContentionRetry(() => readLocal(key, cwd, git), retry);
}

/**
 * writeLocal, tolerant of a concurrent writer. Returns true when this call
 * wrote the value, false when another writer had already written it — a
 * contended write re-reads and stops as soon as the value is there.
 */
function writeLocalContended(key, value, cwd, retry, git) {
  let wrote = false;
  withContentionRetry(() => {
    try {
      writeLocal(key, value, cwd, git);
      wrote = true;
    } catch (err) {
      if (!CONTENTION_ERROR.test(err.message)) throw err;
      let current;
      try { current = readLocal(key, cwd, git); } catch (_) { throw err; }
      if (current !== value) throw err;
    }
  }, retry);
  return wrote;
}

/**
 * Ensure `merge.<name>.driver` (and `.name`) are set in the local git config.
 *
 * Reads and writes that hit config contention from a concurrent writer are
 * retried with backoff; a contended write counts as done once a re-read shows
 * the requested value (#3200).
 *
 * @param {{cwd?: string, name?: string, command?: string, description?: string,
 *   retry?: {attempts?: number, sleep?: function(number): void},
 *   runGit?: function}} [opts] - `retry` tunes the contention loop (default 5
 *   attempts, backoffDelay sleeps); `runGit` replaces the git runner (tests)
 * @returns {{ok: boolean, changed: boolean, name: string, driver: string,
 *   configPath: string|null, previous: {driver: string|null, name: string|null}|null,
 *   error: string|null}}
 *   `changed` is false when this call wrote nothing — both values were already
 *   as requested, or a concurrent writer wrote them first. `configPath` is the
 *   config file the entry lives in, as git reports the common dir (relative to
 *   `cwd` from a main checkout, absolute from a linked worktree).
 */
function ensureMergeDriver(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const name = opts.name || DRIVER_NAME;
  const command = opts.command || DEFAULT_COMMAND;
  const description = opts.description || DRIVER_DESCRIPTION;
  const git = opts.runGit || runGit;
  const base = { name, driver: command, configPath: null, previous: null };

  const common = runGitContended(['rev-parse', '--git-common-dir'], cwd, opts.retry, git);
  if (common.error || common.status !== 0) {
    const reason = common.error ? common.error.message : common.stderr;
    return { ok: false, changed: false, ...base, error: `not a git repository: ${reason}` };
  }
  const configPath = path.join(common.stdout, 'config');

  try {
    const previous = {
      driver: readLocalContended(`merge.${name}.driver`, cwd, opts.retry, git),
      name: readLocalContended(`merge.${name}.name`, cwd, opts.retry, git),
    };
    let changed = false;
    if (previous.driver !== command) {
      changed = writeLocalContended(`merge.${name}.driver`, command, cwd, opts.retry, git) || changed;
    }
    if (previous.name !== description) {
      changed = writeLocalContended(`merge.${name}.name`, description, cwd, opts.retry, git) || changed;
    }
    return { ok: true, changed, ...base, configPath, previous, error: null };
  } catch (err) {
    return { ok: false, changed: false, ...base, configPath, error: err.message };
  }
}

/**
 * Register both drivers — json-merge for accumulators, idpf-derived for
 * derived artifacts (#3152). One call, so no caller can register half the
 * policy. `changed` is true when either entry was written.
 *
 * @param {{cwd?: string, command?: string, retry?: object}} [opts] - `command`
 *   overrides the json-merge command only, as ensureMergeDriver's does;
 *   `retry` is passed to both
 * @returns {{ok: boolean, changed: boolean, drivers: object[], error: string|null}}
 *   `drivers` holds each ensureMergeDriver envelope, json-merge first.
 */
function ensureMergeDrivers(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const drivers = [
    ensureMergeDriver({ cwd, command: opts.command, retry: opts.retry }),
    ensureMergeDriver({ cwd, name: DERIVED_DRIVER_NAME, command: DERIVED_COMMAND, description: DERIVED_DESCRIPTION, retry: opts.retry }),
  ];
  const failed = drivers.find((d) => !d.ok);
  return {
    ok: !failed,
    changed: drivers.some((d) => d.changed),
    drivers,
    error: failed ? failed.error : null,
  };
}

/**
 * The .gitattributes line naming the driver for one accumulator path.
 *
 * @param {string} p - Accumulator path, as declared
 * @returns {string}
 */
function attributeLine(p) {
  return `${normalizePath(p)} merge=${DRIVER_NAME}`;
}

/**
 * The .gitattributes line naming the derived driver for one declared glob.
 *
 * @param {string} glob - A `derivedArtifacts[].paths` entry, as declared
 * @returns {string}
 */
function derivedAttributeLine(glob) {
  return `${normalizePath(glob)} merge=${DERIVED_DRIVER_NAME}`;
}

/**
 * Which declared accumulator paths a .gitattributes text names the driver
 * for, and which it does not.
 *
 * Pattern matching is literal: an accumulator is `named` when a line's
 * pattern equals its normalized path and the line carries `merge=<name>`.
 * A glob that would cover the path is NOT credited — the declaration names
 * files, and the attribute should name the same files, one line each.
 *
 * Derived artifacts are reported the same way under `derived`, matched on the
 * declared glob text against `merge=idpf-derived` lines (#3152).
 *
 * @param {{gitattributes: string, accumulators: Array<{path: string}>,
 *   derivedArtifacts?: Array<{paths: string[]}>, name?: string}} input
 * @returns {{declared: string[], named: string[], missing: string[],
 *   derived: {declared: string[], named: string[], missing: string[]}}}
 */
function attributesStatus({ gitattributes = '', accumulators = [], derivedArtifacts = [], name = DRIVER_NAME } = {}) {
  const namedBy = (driver) => {
    const named = new Set();
    for (const raw of String(gitattributes).split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const [pattern, ...attrs] = line.split(/\s+/);
      if (attrs.includes(`merge=${driver}`)) named.add(normalizePath(pattern));
    }
    return named;
  };
  const report = (declared, named) => ({
    declared,
    named: declared.filter((p) => named.has(p)),
    missing: declared.filter((p) => !named.has(p)),
  });
  const derivedGlobs = derivedArtifacts.flatMap((d) => (Array.isArray(d.paths) ? d.paths : [])).map(normalizePath);
  return {
    ...report(accumulators.map((a) => normalizePath(a.path)), namedBy(name)),
    derived: report(derivedGlobs, namedBy(DERIVED_DRIVER_NAME)),
  };
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--name' && argv[i + 1] !== undefined) opts.name = argv[++i];
    else if (argv[i] === '--command' && argv[i + 1] !== undefined) opts.command = argv[++i];
    else if (argv[i] === '--cwd' && argv[i + 1] !== undefined) opts.cwd = argv[++i];
  }
  return opts;
}

if (require.main === module) {
  // `--name` registers that one driver, as before; otherwise both (#3152).
  const opts = parseArgs(process.argv.slice(2));
  const result = opts.name ? ensureMergeDriver(opts) : ensureMergeDrivers(opts);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exitCode = result.ok ? 0 : 1;
}

module.exports = {
  DRIVER_NAME,
  DRIVER_SCRIPT,
  DEFAULT_COMMAND,
  DRIVER_DESCRIPTION,
  DERIVED_DRIVER_NAME,
  DERIVED_COMMAND,
  DERIVED_DESCRIPTION,
  ensureMergeDriver,
  ensureMergeDrivers,
  runGitContended,
  withContentionRetry,
  CONTENTION_ERROR,
  backoffDelay,
  attributeLine,
  derivedAttributeLine,
  attributesStatus,
};
