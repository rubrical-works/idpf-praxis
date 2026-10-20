// Rubrical Works (c) 2026
/**
 * @framework-script 0.109.0
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
function readLocal(key, cwd) {
  const r = runGit(['config', '--local', '--get', key], cwd);
  if (r.error) throw r.error;
  if (r.status === 0) return r.stdout;
  if (r.status === 1) return null;
  throw new Error(r.stderr || `git config --get ${key} exited ${r.status}`);
}

function writeLocal(key, value, cwd) {
  const r = runGit(['config', '--local', key, value], cwd);
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(r.stderr || `git config ${key} exited ${r.status}`);
}

/**
 * Ensure `merge.<name>.driver` (and `.name`) are set in the local git config.
 *
 * @param {{cwd?: string, name?: string, command?: string, description?: string}} [opts]
 * @returns {{ok: boolean, changed: boolean, name: string, driver: string,
 *   configPath: string|null, previous: {driver: string|null, name: string|null}|null,
 *   error: string|null}}
 *   `changed` is false when both values were already exactly as requested —
 *   nothing was written. `configPath` is the config file the entry lives in,
 *   as git reports the common dir (relative to `cwd` from a main checkout,
 *   absolute from a linked worktree).
 */
function ensureMergeDriver(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const name = opts.name || DRIVER_NAME;
  const command = opts.command || DEFAULT_COMMAND;
  const description = opts.description || DRIVER_DESCRIPTION;
  const base = { name, driver: command, configPath: null, previous: null };

  const common = runGit(['rev-parse', '--git-common-dir'], cwd);
  if (common.error || common.status !== 0) {
    const reason = common.error ? common.error.message : common.stderr;
    return { ok: false, changed: false, ...base, error: `not a git repository: ${reason}` };
  }
  const configPath = path.join(common.stdout, 'config');

  try {
    const previous = {
      driver: readLocal(`merge.${name}.driver`, cwd),
      name: readLocal(`merge.${name}.name`, cwd),
    };
    let changed = false;
    if (previous.driver !== command) {
      writeLocal(`merge.${name}.driver`, command, cwd);
      changed = true;
    }
    if (previous.name !== description) {
      writeLocal(`merge.${name}.name`, description, cwd);
      changed = true;
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
 * @param {{cwd?: string, command?: string}} [opts] - `command` overrides the
 *   json-merge command only, as ensureMergeDriver's does
 * @returns {{ok: boolean, changed: boolean, drivers: object[], error: string|null}}
 *   `drivers` holds each ensureMergeDriver envelope, json-merge first.
 */
function ensureMergeDrivers(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const drivers = [
    ensureMergeDriver({ cwd, command: opts.command }),
    ensureMergeDriver({ cwd, name: DERIVED_DRIVER_NAME, command: DERIVED_COMMAND, description: DERIVED_DESCRIPTION }),
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
  attributeLine,
  derivedAttributeLine,
  attributesStatus,
};
