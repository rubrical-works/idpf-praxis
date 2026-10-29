#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.114.0
 * worktree-create-hook.js — WorktreeCreate hook (#3122, PRD Concurrent-Work
 * Story 1.5)
 *
 * Claude Code's own worktree creation (subagent `isolation: "worktree"`,
 * `claude --worktree`, `EnterWorktree`) branches from the REMOTE DEFAULT
 * branch, so an isolated agent on a tracker would start without the
 * tracker's commits; the documented remedy is a user-level setting the
 * framework cannot ship (design decision 2026-10-18). This hook replaces that
 * default. Contract, per the WorktreeCreate docs: `name` arrives on stdin;
 * the absolute worktree path is the LAST non-empty stdout line; everything
 * else goes to stderr; a non-zero exit fails the creation (no fallback).
 *
 * What it does, in order — the order IS the safety argument:
 *   1. Refuse any `name` that is not a single path segment, before touching
 *      anything: no directory is ever created outside `<root>/.tmp-wt-*`.
 *   2. Resolve the project root from CLAUDE_PROJECT_DIR (the caller's cwd may
 *      itself be a worktree) and the caller's branch tip from HEAD in cwd —
 *      never `main`, never the remote default.
 *   3. Ensure the exclude line (EXCLUDE_LINE: the `.tmp-wt-` directory
 *      pattern, trailing slash) is in the shared `.git/info/exclude`, once and
 *      idempotently, BEFORE `git worktree add`: an unignored worktree is
 *      staged by `git add -A` as an embedded-repository gitlink (mode 160000)
 *      with only a warning, and four release commands stage with `git add -A`.
 *      If the line cannot be written or confirmed, stop here — no worktree.
 *   4. `git worktree add <root>/.tmp-wt-<name> -b wt/<name> <tip>`. A refusal
 *      because a sibling hook's `.git/worktrees/<name>/` is mid-creation is
 *      retried with backoff (#3236); any other add failure fails at once.
 *   5. Recreate hub links inside the worktree (Story 1.6's helper, when
 *      installed; the self-hosted layout has none to recreate), then register
 *      the merge driver's git config entry (Story 1.2's helper) — both before
 *      the path is printed, so a worktree Claude Code hands to an agent is
 *      complete. A failure here exits non-zero, prints NO path, and leaves
 *      the half-made worktree in place, named on stderr, for the caller to
 *      report (Exception Path 5): removing it would be a second destructive
 *      operation inside a hook that already failed once. The driver step
 *      retries config-lock contention itself (#3200: hooks started together
 *      race for `.git/config`), so a driver failure that reaches here has
 *      outlasted that budget or is not contention at all (a spawn error,
 *      timeout or other stderr fails on the first attempt). It too keeps the
 *      worktree — the caller removes it with worktree-teardown.js, never
 *      `git worktree remove`.
 *
 * It assumes nothing about who asked. Once the entry is installed the hook
 * fires for every worktree created in the project — a peer's session, an
 * unrelated isolated Agent — so there is no tracker lookup, no concurrency
 * plan, and no `--agents` cap here; the cap is the orchestrator's.
 *
 * Node built-ins and relative requires only (deployed hooks resolve from the
 * hub, #2418). Every spawn is bounded (#2469).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { runGitContended, withContentionRetry } = require('../scripts/shared/lib/merge-driver-config.js');

/** The line kept in `.git/info/exclude`; the trailing slash matches directories only. */
const EXCLUDE_LINE = '.tmp-wt-*/';

/** Where worktrees live, relative to the project root. */
const WORKTREE_PREFIX = '.tmp-wt-';

/** Branch prefix, kept distinct from `workstream/*` so /plan-workstreams' cleanup never matches it. */
const BRANCH_PREFIX = 'wt/';

/** A name is one path segment: alphanumeric start, then letters, digits, `.`, `_`, `-`. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * A `git worktree add` refused because a SIBLING hook's admin entry is
 * mid-creation (#3236). `add` enumerates existing worktrees before creating
 * anything of its own, and a concurrent hook's `.git/worktrees/<name>/`
 * exists before its `commondir` is written. Derived from the recorded stderr
 * (git 2.53.0.windows.1):
 *   fatal: failed to read .git/worktrees/-tmp-wt-c1/commondir: No error
 * The `<name>` is one path segment; the trailing reason is left open, since
 * ": No error" is Windows rendering errno 0 and other platforms word it
 * differently. Distinct from CONTENTION_ERROR (the `.git/config` sharing
 * violation, #3234), which this stderr does not match.
 */
const SIBLING_ADMIN_READ_ERROR = /fatal: failed to read \.git\/worktrees\/[^/\\\s]+\/commondir(?::|$)/m;

/** Bound on each git call (#2469): milliseconds of work, a guard against a hung git. */
const GIT_TIMEOUT_MS = 60_000;

/**
 * Whether a worktree name may be used at all.
 *
 * Rejects `/`, `\`, `..`, absolute paths and anything else that could place
 * the directory outside `<root>/.tmp-wt-*` — by construction, since only a
 * single safe segment passes.
 *
 * @param {*} name
 * @returns {boolean}
 */
function isSafeName(name) {
  if (typeof name !== 'string') return false;
  if (name.length === 0 || name.length > 100) return false;
  if (!SAFE_NAME.test(name)) return false;
  return !name.includes('..');
}

function runGit(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: GIT_TIMEOUT_MS });
  return {
    status: r.status,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
    error: r.error || null,
  };
}

function gitFailure(r) {
  if (r.error) return r.error.message;
  return r.stderr || `git exited ${r.status}`;
}

/**
 * The shared git directory for `dir` — the main checkout's `.git`, even from
 * a linked worktree. `rev-parse` reads .git/config, so a read refused while a
 * concurrent hook renames config.lock over it is retried through the merge
 * driver helper's contention budget (#3234); any other failure fails at once.
 *
 * @param {string} dir
 * @param {{runGit?: function, retry?: {attempts?: number, sleep?: function(number): void}}} [opts]
 *   `runGit` replaces the git runner and `retry` tunes the contention loop (tests)
 * @returns {{ok: boolean, commonDir?: string, error?: string}}
 */
function commonDirOf(dir, opts = {}) {
  const r = runGitContended(['rev-parse', '--git-common-dir'], dir, opts.retry, opts.runGit || runGit);
  if (r.error || r.status !== 0) return { ok: false, error: `not a git repository: ${gitFailure(r)}` };
  return { ok: true, commonDir: path.resolve(dir, r.stdout) };
}

const samePath = (a, b) => {
  const norm = (p) => path.resolve(p).replace(/\\/g, '/');
  return process.platform === 'win32' ? norm(a).toLowerCase() === norm(b).toLowerCase() : norm(a) === norm(b);
};

/**
 * What a refused `git worktree add` left behind of its OWN (#3236): the
 * `wt/<name>` branch, and any `.git/worktrees/` entry that is this
 * worktree's. Git names the entry after the path's basename with a leading
 * `.` made `-` (`-tmp-wt-<name>`), suffixing digits on a collision, and
 * records the worktree path in the entry's `gitdir`. So an entry is ours when
 * its name is the unsuffixed form, or its `gitdir` names this worktree — never
 * by a digit-suffix pattern, which would claim a sibling's half-made
 * `-tmp-wt-<name>1` (no `gitdir` yet), the very state this retry exists for.
 * A check that cannot be answered is reported as a leftover: a retry is
 * allowed only on a positive confirmation that nothing was left.
 *
 * @returns {string[]} what was found, empty when the retry is safe
 */
function addLeftovers({ wtPath, branch, name, commonDir, root }, opts = {}) {
  const found = [];
  const ref = runGitContended(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], root, opts.retry, opts.runGit || runGit);
  if (ref.error || (ref.status !== 0 && ref.status !== 1)) found.push(`branch ${branch} could not be checked: ${gitFailure(ref)}`);
  else if (ref.status === 0) found.push(`branch ${branch}`);

  const adminRoot = path.join(commonDir, 'worktrees');
  let entries = [];
  try {
    entries = fs.readdirSync(adminRoot);
  } catch (err) {
    if (err.code !== 'ENOENT') found.push(`${adminRoot} could not be read: ${err.message}`);
  }
  const base = `${WORKTREE_PREFIX}${name}`;
  const names = new Set([base, base.replace(/^\./, '-')]);
  const gitdir = path.join(wtPath, '.git');
  for (const entry of entries) {
    let ours = names.has(entry);
    if (!ours) {
      try {
        ours = samePath(fs.readFileSync(path.join(adminRoot, entry, 'gitdir'), 'utf8').trim(), gitdir);
      } catch (_) { /* no gitdir: a sibling's entry mid-creation, or not a worktree entry */ }
    }
    if (ours) found.push(`.git/worktrees/${entry}`);
  }
  return found;
}

/**
 * `git worktree add`, retried while it is refused by a sibling hook's admin
 * entry mid-creation (#3236), with withContentionRetry's backoff and budget
 * and SIBLING_ADMIN_READ_ERROR as the matcher. Before each retry the failed
 * attempt is confirmed to have left nothing of its own (addLeftovers); if it
 * left anything, or the check cannot be answered, no retry — the refusal is
 * returned as it would have been before #3236, with `leftovers` naming why.
 * Any other failure, and a spawn error, is returned at once.
 *
 * @returns {{result: object, attempts: number, leftovers: string[]}}
 *   `result` is the last attempt's runner result
 */
function addWorktree({ wtPath, branch, tip, root, name, commonDir }, opts = {}) {
  const git = opts.runGit || runGit;
  let result;
  let attempts = 0;
  let leftovers = [];
  try {
    withContentionRetry(() => {
      attempts++;
      result = git(['worktree', 'add', wtPath, '-b', branch, tip], root);
      if (result.error || result.status === 0 || !SIBLING_ADMIN_READ_ERROR.test(result.stderr)) return;
      leftovers = addLeftovers({ wtPath, branch, name, commonDir, root }, opts);
      if (leftovers.length > 0) return;
      throw new Error(result.stderr);
    }, opts.retry, SIBLING_ADMIN_READ_ERROR);
  } catch (_) { /* refusal outlasted the budget: `result` is the last attempt */ }
  return { result, attempts, leftovers };
}

/**
 * The project root: CLAUDE_PROJECT_DIR when set — the caller's cwd may be
 * another worktree — else the main checkout, resolved through the common
 * git directory so a worktree cwd still lands on the root.
 */
function resolveRoot({ cwd, env }, opts = {}) {
  const declared = env && typeof env.CLAUDE_PROJECT_DIR === 'string' ? env.CLAUDE_PROJECT_DIR.trim() : '';
  if (declared !== '') {
    const root = path.resolve(declared);
    let isDir = false;
    try { isDir = fs.statSync(root).isDirectory(); } catch { isDir = false; }
    if (!isDir) return { ok: false, error: `CLAUDE_PROJECT_DIR is not a directory: ${root}` };
    const common = commonDirOf(root, opts);
    if (!common.ok) return { ok: false, error: `CLAUDE_PROJECT_DIR ${root}: ${common.error}` };
    return { ok: true, root, commonDir: common.commonDir, source: 'CLAUDE_PROJECT_DIR' };
  }
  const common = commonDirOf(cwd, opts);
  if (!common.ok) return { ok: false, error: `${cwd}: ${common.error}` };
  if (path.basename(common.commonDir) !== '.git') {
    return { ok: false, error: `cannot derive a project root from git dir ${common.commonDir}; set CLAUDE_PROJECT_DIR` };
  }
  return { ok: true, root: path.dirname(common.commonDir), commonDir: common.commonDir, source: 'git-common-dir' };
}

/**
 * Ensure EXCLUDE_LINE is listed in `<commonDir>/info/exclude`.
 *
 * Idempotent as bytes: when the line is already present nothing is written,
 * so a second run leaves the file identical. After a write the file is read
 * back and the line confirmed — "written" means "git will see it".
 *
 * @param {{commonDir: string}} input
 * @returns {{ok: boolean, written: boolean, file: string, error: string|null}}
 */
function ensureExclude({ commonDir }) {
  const file = path.join(commonDir, 'info', 'exclude');
  try {
    let existing = '';
    try { existing = fs.readFileSync(file, 'utf8'); } catch (err) { if (err.code !== 'ENOENT') throw err; }
    const present = existing.split(/\r?\n/).some((l) => l.trim() === EXCLUDE_LINE);
    if (present) return { ok: true, written: false, file, error: null };

    fs.mkdirSync(path.dirname(file), { recursive: true });
    const sep = existing === '' || existing.endsWith('\n') ? '' : '\n';
    // Append, never rewrite (#3200): hooks started together each read the line
    // as absent, and a rewrite of `existing + line` truncates the file under a
    // concurrent hook's confirm-read and drops what another writer added. The
    // cost of a race is the line twice, which git reads as once.
    fs.appendFileSync(file, `${sep}${EXCLUDE_LINE}\n`);

    const confirmed = fs.readFileSync(file, 'utf8').split(/\r?\n/).some((l) => l.trim() === EXCLUDE_LINE);
    if (!confirmed) return { ok: false, written: false, file, error: 'line not present after write' };
    return { ok: true, written: true, file, error: null };
  } catch (err) {
    return { ok: false, written: false, file, error: err.message };
  }
}

/**
 * Recreate hub links inside the worktree through Story 1.6's helper when it
 * is installed. Without it — this repository's self-hosted layout, where the
 * checkout already carries the framework runtime — there is nothing to
 * recreate, and that is reported rather than treated as a failure.
 */
function defaultLinkStep({ root, worktree }) {
  const helper = path.join(__dirname, '..', 'scripts', 'shared', 'lib', 'worktree-links.js');
  if (!fs.existsSync(helper)) {
    return { ok: true, recreated: [], note: 'no link helper installed — nothing to recreate' };
  }
  const links = require(helper);
  if (typeof links.recreateLinks !== 'function') {
    return { ok: false, error: `${helper} exports no recreateLinks()` };
  }
  return links.recreateLinks({ root, worktree });
}

/**
 * Story 1.2's idempotent driver writer, run from inside the worktree — both
 * drivers, json-merge for accumulators and idpf-derived for derived
 * artifacts (#3152), so a worktree never merges with half the policy.
 */
function defaultDriverStep({ cwd }) {
  const { ensureMergeDrivers } = require('../scripts/shared/lib/merge-driver-config.js');
  return ensureMergeDrivers({ cwd });
}

/**
 * Create the worktree. Pure of process state: everything it needs is passed
 * in, and it reports rather than printing or exiting, so the whole decision
 * can be asserted in-process and the CLI below only relays it.
 *
 * @param {{name: *, cwd?: string, env?: object, linkStep?: Function, driverStep?: Function,
 *   runGit?: function, retry?: {attempts?: number, sleep?: function(number): void}}} opts
 *   `runGit` replaces the git runner for every git call the hook makes itself
 *   (not the link or driver steps); `retry` tunes the contention loops (tests)
 * @returns {{ok: boolean, exitCode: number, path: string|null, halfMade: string|null,
 *   branch: string|null, tip: string|null, root: string|null, stage: string|null,
 *   stdout: string[], stderr: string[]}}
 *   `stdout` holds the path alone on success and is empty on every failure;
 *   `halfMade` names a worktree that exists although the hook failed.
 */
function createWorktree(opts = {}) {
  const name = opts.name;
  const cwd = opts.cwd || process.cwd();
  const env = opts.env || process.env;
  const linkStep = typeof opts.linkStep === 'function' ? opts.linkStep : defaultLinkStep;
  const driverStep = typeof opts.driverStep === 'function' ? opts.driverStep : defaultDriverStep;
  const git = typeof opts.runGit === 'function' ? opts.runGit : runGit;
  const gitOpts = { runGit: git, retry: opts.retry };

  const out = {
    ok: false, exitCode: 1, path: null, halfMade: null, branch: null, tip: null, root: null,
    stage: null, stdout: [], stderr: [],
  };
  const fail = (stage, message) => {
    out.stage = stage;
    out.stderr.push(`worktree-create: ${message}`);
    return out;
  };

  try {
    if (!isSafeName(name)) {
      return fail('name', `refused worktree name ${JSON.stringify(name)} — a name is one path segment `
        + `(no '/', '\\', '..' or absolute path; ${SAFE_NAME}); nothing was created`);
    }

    const rootInfo = resolveRoot({ cwd, env }, gitOpts);
    if (!rootInfo.ok) return fail('root', rootInfo.error);
    out.root = rootInfo.root;

    // Reads .git/config like commonDirOf's lookup, so it retries the same
    // contention a concurrent hook's config.lock rename causes (#3237).
    const head = runGitContended(['rev-parse', 'HEAD'], cwd, opts.retry, git);
    if (head.error || head.status !== 0) return fail('tip', `cannot read the caller's branch tip in ${cwd}: ${gitFailure(head)}`);
    out.tip = head.stdout;

    const branch = `${BRANCH_PREFIX}${name}`;
    const wtPath = path.join(rootInfo.root, `${WORKTREE_PREFIX}${name}`);
    out.branch = branch;

    const exclude = ensureExclude({ commonDir: rootInfo.commonDir });
    if (!exclude.ok) {
      return fail('exclude', `cannot ensure ${EXCLUDE_LINE} in ${exclude.file}: ${exclude.error} — no worktree created`);
    }
    out.stderr.push(`worktree-create: ${exclude.written ? 'added' : 'found'} ${EXCLUDE_LINE} in ${exclude.file}`);

    const { result: add, attempts, leftovers } = addWorktree(
      { wtPath, branch, tip: out.tip, root: rootInfo.root, name, commonDir: rootInfo.commonDir }, gitOpts,
    );
    if (attempts > 1) {
      out.stderr.push(`worktree-create: git worktree add retried ${attempts - 1} time(s) — a sibling worktree's admin entry was mid-creation`);
    }
    if (add.error || add.status !== 0) {
      const why = leftovers.length > 0 ? ` — not retried: the failed attempt left ${leftovers.join(', ')}` : '';
      return fail('add', `git worktree add failed for ${wtPath} (branch ${branch} at ${out.tip.slice(0, 8)}): ${gitFailure(add)}${why}`);
    }
    out.halfMade = wtPath;
    out.stderr.push(`worktree-create: created ${wtPath} on ${branch} at ${out.tip.slice(0, 8)} (root from ${rootInfo.source})`);

    let links;
    try {
      links = linkStep({ root: rootInfo.root, worktree: wtPath, env });
    } catch (err) {
      links = { ok: false, error: err.message };
    }
    if (!links || links.ok === false) {
      return fail('links', `link recreation failed after git worktree add — half-made worktree left at ${wtPath}: ${(links && links.error) || 'unknown error'}`);
    }
    if (links.note) out.stderr.push(`worktree-create: links: ${links.note}`);
    else {
      const layout = links.layout ? ` (${links.layout} layout)` : '';
      out.stderr.push(`worktree-create: links recreated: ${(links.recreated || []).length}${layout}`);
    }
    for (const s of links.skipped || []) out.stderr.push(`worktree-create: link ${s.rel} skipped: ${s.reason}`);

    let driver;
    try {
      driver = driverStep({ cwd: wtPath });
    } catch (err) {
      driver = { ok: false, error: err.message };
    }
    if (!driver || driver.ok === false) {
      return fail('driver', `merge-driver registration failed after git worktree add — half-made worktree left at ${wtPath}: ${(driver && driver.error) || 'unknown error'}`);
    }
    out.stderr.push(`worktree-create: merge driver ${driver.changed ? 'registered' : 'already registered'}`);

    out.ok = true;
    out.exitCode = 0;
    out.path = wtPath;
    out.halfMade = null;
    out.stage = 'done';
    out.stdout.push(wtPath);
    return out;
  } catch (err) {
    const where = out.halfMade ? ` — half-made worktree left at ${out.halfMade}` : '';
    return fail('unexpected', `unexpected failure${where}: ${err.message}`);
  }
}

// Heartbeat (#2917): records this hook's outcome under the project root for the
// startup Hook Health row. Installed only when run as the hook — the test suite
// requires this module and must not write a heartbeat for its own process.
let heartbeat = { fail() {}, setCwd() {} };
if (require.main === module) {
  try { heartbeat = require('../scripts/shared/lib/hook-heartbeat.js').installHeartbeat('worktree-create-hook'); } catch (_) { /* reported by the load check */ }
}

function parseName(argv) {
  const i = argv.indexOf('--name');
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : undefined;
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  let data = {};
  if (input.trim() !== '') {
    try {
      data = JSON.parse(input);
    } catch (err) {
      process.stderr.write(`worktree-create: hook input is not JSON: ${err.message}\n`);
      process.exitCode = 1;
      return;
    }
  }
  if (data && typeof data === 'object') heartbeat.setCwd(data.cwd);

  const name = data && typeof data === 'object' && data.name !== undefined ? data.name : parseName(process.argv.slice(2));
  const result = createWorktree({ name, cwd: process.cwd(), env: process.env });

  for (const line of result.stderr) process.stderr.write(`${line}\n`);
  for (const line of result.stdout) process.stdout.write(`${line}\n`);
  process.exitCode = result.exitCode;
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`worktree-create: ${err.message}\n`);
    heartbeat.fail(err);
    process.exitCode = 1;
  });
}

module.exports = {
  EXCLUDE_LINE,
  WORKTREE_PREFIX,
  BRANCH_PREFIX,
  SAFE_NAME,
  SIBLING_ADMIN_READ_ERROR,
  isSafeName,
  ensureExclude,
  resolveRoot,
  commonDirOf,
  createWorktree,
  defaultLinkStep,
};
