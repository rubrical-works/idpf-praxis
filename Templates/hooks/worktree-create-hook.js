#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.123.0
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
 *   4. `git worktree add <root>/.tmp-wt-<name> -b wt/<name> <tip>`, one hook
 *      at a time: hooks started together take the creation lock in turn
 *      (#3853), so their checkouts never compete for the disk. A refusal
 *      because a sibling hook's `.git/worktrees/<name>/` is mid-creation is
 *      retried with backoff (#3236); an add killed at its bound whose
 *      checkout nonetheless finished — registered, clean, at the tip — is
 *      accepted and its `initializing` lock removed (#3853); any other add
 *      failure fails at once. With framework-config.json `worktrees.sparse`
 *      declaring a cone (#3856) the add runs `--no-checkout` and is followed,
 *      under the same lock, by `git sparse-checkout set --cone` and `git
 *      checkout`, bounded by the tracked files inside the cone; the cone
 *      always includes `.claude/` and `Construction/`. `worktrees.lfs` sets
 *      how LFS content arrives (smudged, pointers, or pointers plus a bounded
 *      `git lfs pull`), and a partial clone widens the bound and names a
 *      failed blob fetch as such.
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
const os = require('os');
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
 * The creation lock (#3853): a file in the shared git directory, held around
 * `git worktree add` so hooks started together check out one after another.
 * It exists for throughput, not correctness — git itself keeps concurrent
 * adds safe — so a breach costs a slower checkout, never a wrong worktree.
 */
const CREATE_LOCK_NAME = 'idpf-worktree-create.lock';

/** How often a waiter looks at the lock again. */
const LOCK_POLL_MS = 250;

/** An unreadable lock younger than this is a holder mid-write, not a stale file. */
const LOCK_WRITE_GRACE_MS = 2_000;

/** Lock wait and stale age for a caller that passes no budget (creationBudget). */
const DEFAULT_LOCK_WAIT_MS = 120_000;
const DEFAULT_LOCK_STALE_MS = 150_000;

/**
 * The hook entry's own timeout (#3853): Claude Code cancels the hook when it
 * runs this long, so every wait below is cut from it. Kept equal to the
 * WorktreeCreate entry's `timeout` in framework-manifest.json (a test holds
 * the two together); a settings layer that registers the hook with another
 * value is read at run time (resolveHookTimeout), since a project installed
 * before the manifest value changed keeps its old one.
 */
const HOOK_TIMEOUT_MS = 600_000;

/** Kept back from the budget for everything that is not the lock wait or the add. */
const HOOK_RESERVE_MS = 45_000;

/** The `git worktree add` bound never drops below this, whatever the repository. */
const ADD_FLOOR_MS = 60_000;

/**
 * Bound per tracked file. A warm checkout here ran about 2 ms per file alone
 * and about 5 ms with three at once; the run that timed out — a cold disk,
 * three checkouts together — needed more than 22 ms. 40 leaves a cold,
 * uncontended checkout room without waiting minutes on a hung git.
 */
const ADD_MS_PER_FILE = 40;

/** Creations the budget covers in sequence: the default `--agents` cap. */
const SERIAL_CREATIONS = 3;

/** How long a timed-out add is given to finish its checkout (#3853). */
const LATE_SUCCESS_WAIT_MS = 20_000;

/**
 * Bound on each of a sparse creation's two set-up steps (#3856): the
 * `--no-checkout` add, which writes the branch and the admin entry and no
 * files, and `sparse-checkout set`. Reserved from the budget before the
 * checkout bound is cut, so the three steps together stay inside it.
 */
const SPARSE_STEP_MS = 30_000;

/**
 * Written into a two-step worktree's admin directory once its `--no-checkout`
 * add returns, and removed only when its checkout exits 0 (#3856). While it is
 * there the worktree was never checked out by this hook, and lateSuccess
 * refuses it whatever its tree looks like.
 */
const CHECKOUT_PENDING_MARKER = 'idpf-checkout-pending';

/**
 * Bound on `git lfs pull` in `worktrees.lfs.mode: pull` (#3856), reserved from
 * the budget like the sparse set-up steps. LFS objects are not counted the way
 * tracked files are, so the bound is fixed rather than scaled.
 */
const LFS_PULL_MS = 120_000;

/** What git-lfs writes as a pointer file's first line. */
const LFS_POINTER_PREFIX = 'version https://git-lfs.github.com/spec/v1';

/**
 * Bound per tracked file in a partial clone (#3856): its checkout fetches every
 * missing blob from the promisor remote, so the bound covers network time as
 * well as the disk. Four times ADD_MS_PER_FILE; the floor and the cap still hold.
 */
const PROMISOR_MS_PER_FILE = 160;

/**
 * A checkout that needed a blob this partial clone does not hold and could not
 * fetch it (#3856). Derived from the recorded stderr (git 2.53.0.windows.1,
 * the promisor remote taken away):
 *   fatal: could not fetch d00491fd7e5bb6fa28c517a0bb32b8b506539d4d from promisor remote
 */
const MISSING_BLOB_FETCH = /could not fetch [0-9a-f]{7,64} from promisor remote|unable to fetch missing object/i;

/** Whether a git failure is a missing-blob fetch from a promisor remote. */
const isMissingBlobFetch = (stderr) => MISSING_BLOB_FETCH.test(String(stderr || ''));

/** A tracked blob at least this large is named by the startup evaluation (#3856). */
const LARGE_BLOB_BYTES = 1024 * 1024;

/**
 * Top-level directory names the startup evaluation suggests leaving out of the
 * cone (#3856), compared case-insensitively: archives, documentation,
 * proposals and release notes, which an implementation agent rarely reads.
 * A suggestion only — the user accepts, edits or declines it.
 */
const SUGGEST_EXCLUDE_NAMES = Object.freeze([
  'archive', 'archives', 'doc', 'docs', 'documentation', 'proposal', 'proposals', 'prd', 'prds', 'release', 'releases',
]);

/** A directory whose bytes are at least this share large blobs is an asset directory, suggested out too. */
const ASSET_DIR_SHARE = 0.8;

/** Below both shares a sparse cone saves too little to suggest: a full checkout is suggested instead. */
const SUGGEST_MIN_FILE_SHARE = 0.05;
const SUGGEST_MIN_BYTE_SHARE = 0.25;

/** The flags a session passes to write an accepted startup offer (#3856). */
const APPLY_FLAG = '--apply-worktree-config';
const APPLY_CHOICES = Object.freeze(['suggested', 'full']);

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

/** stdout ceiling for a full tree listing (#3856); spawnSync's 1 MB default overflows near 20,000 paths. */
const LISTING_MAX_BUFFER = 512 * 1024 * 1024;

function runGit(args, cwd, o = {}) {
  const r = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: o.timeout || GIT_TIMEOUT_MS,
    ...(o.maxBuffer ? { maxBuffer: o.maxBuffer } : {}),
    ...(o.env ? { env: { ...process.env, ...o.env } } : {}),
    ...(o.input !== undefined ? { input: o.input } : {}),
  });
  // `raw` keeps stdout byte-for-byte: a `-z` listing's first or last path may
  // begin or end with a space, which a trim would strip (#3856 work review).
  return {
    status: r.status,
    stdout: o.raw ? (r.stdout || '') : (r.stdout || '').trim(),
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
function addWorktree({ wtPath, branch, tip, root, name, commonDir, timeoutMs, noCheckout = false, env = null }, opts = {}) {
  const git = opts.runGit || runGit;
  let result;
  let attempts = 0;
  let leftovers = [];
  const args = ['worktree', 'add', ...(noCheckout ? ['--no-checkout'] : []), wtPath, '-b', branch, tip];
  const runOpts = { ...(timeoutMs ? { timeout: timeoutMs } : {}), ...(env ? { env } : {}) };
  try {
    withContentionRetry(() => {
      attempts++;
      result = git(args, root, runOpts);
      if (result.error || result.status === 0 || !SIBLING_ADMIN_READ_ERROR.test(result.stderr)) return;
      leftovers = addLeftovers({ wtPath, branch, name, commonDir, root }, opts);
      if (leftovers.length > 0) return;
      throw new Error(result.stderr);
    }, opts.retry, SIBLING_ADMIN_READ_ERROR);
  } catch (_) { /* refusal outlasted the budget: `result` is the last attempt */ }
  return { result, attempts, leftovers };
}

/**
 * The tracked-file count of the main checkout, read from the index header
 * (bytes 8-11 of `<commonDir>/index`) — no git process, no output to buffer.
 * Null when the index is missing or not in the expected form; the caller then
 * uses the floor.
 *
 * @param {string} commonDir
 * @returns {number|null}
 */
function trackedFileCount(commonDir) {
  let fd = null;
  try {
    fd = fs.openSync(path.join(commonDir, 'index'), 'r');
    const head = Buffer.alloc(12);
    if (fs.readSync(fd, head, 0, 12, 0) !== 12 || head.toString('latin1', 0, 4) !== 'DIRC') return null;
    return head.readUInt32BE(8);
  } catch (_) {
    return null;
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch (_) { /* nothing to release */ } }
  }
}

/** Does a settings hook command name this hook's script? */
const NAMES_THIS_HOOK = /(^|[\\/"'\s])worktree-create-hook\.js(["'\s]|$)/;

/**
 * The timeout Claude Code applies to this hook: the smallest `timeout` any
 * settings layer gives a WorktreeCreate command naming this script, else
 * HOOK_TIMEOUT_MS. An unreadable layer is skipped — the budget is advisory,
 * and a wrong guess costs a less helpful failure, never a wrong worktree.
 *
 * @param {{root: string, home?: string}} input
 * @returns {{ms: number, source: string}}
 */
function resolveHookTimeout({ root, home = os.homedir() }) {
  const layers = [
    ['.claude/settings.json', path.join(root, '.claude', 'settings.json')],
    ['.claude/settings.local.json', path.join(root, '.claude', 'settings.local.json')],
    ['~/.claude/settings.json', path.join(home, '.claude', 'settings.json')],
  ];
  let best = null;
  for (const [label, file] of layers) {
    let groups;
    try {
      groups = JSON.parse(fs.readFileSync(file, 'utf8')).hooks.WorktreeCreate;
    } catch (_) {
      continue;
    }
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const h of Array.isArray(group && group.hooks) ? group.hooks : []) {
        if (!h || typeof h.command !== 'string' || !NAMES_THIS_HOOK.test(h.command)) continue;
        if (typeof h.timeout !== 'number' || !(h.timeout > 0)) continue;
        if (!best || h.timeout * 1000 < best.ms) best = { ms: h.timeout * 1000, source: label };
      }
    }
  }
  return best || { ms: HOOK_TIMEOUT_MS, source: 'default' };
}

/**
 * Cut the hook's time into the `git worktree add` bound and the lock wait
 * (#3853). The bound scales with the tracked-file count from ADD_FLOOR_MS up
 * to a third of what the hook timeout leaves after the reserve, so the lock
 * wait — the rest — covers two full-bound creations ahead of this one. Under
 * a hook timeout too short for that the floor still holds and the wait
 * shrinks. A lock is stale once it is older than one creation may hold it.
 *
 * A sparse creation (#3856) holds the lock for three steps, not one: its two
 * set-up steps each get SPARSE_STEP_MS (`setupStepMs`), reserved before the
 * cap is cut, and `addTimeoutMs` is then the bound on its checkout — the step
 * that writes files, scaled by the tracked files inside the cone, which is the
 * count the caller passes.
 *
 * A `git lfs pull` (`lfsPull`) is reserved the same way, as `lfsPullMs`. In
 * a partial clone (`promisor`) each file is allowed PROMISOR_MS_PER_FILE, since
 * the checkout fetches its missing blobs over the network.
 *
 * @param {{trackedFiles?: number|null, hookTimeoutMs?: number, sparse?: boolean, lfsPull?: boolean, promisor?: boolean}} input
 * @returns {{addTimeoutMs: number, setupStepMs: number, lfsPullMs: number, extrasMs: number, msPerFile: number,
 *   lockWaitMs: number, lockStaleMs: number, hookTimeoutMs: number}}
 *   `addTimeoutMs` bounds the step that checks files out — the add itself for
 *   a full checkout, the checkout after `sparse-checkout set` for a sparse one;
 *   `extrasMs` is the time reserved for every other step the lock is held for
 */
function creationBudget({ trackedFiles, hookTimeoutMs = HOOK_TIMEOUT_MS, sparse = false, lfsPull = false, promisor = false } = {}) {
  const usable = Math.max(0, hookTimeoutMs - HOOK_RESERVE_MS);
  const setupStepMs = sparse ? SPARSE_STEP_MS : 0;
  const lfsPullMs = lfsPull ? LFS_PULL_MS : 0;
  const extrasMs = 2 * setupStepMs + lfsPullMs;
  const msPerFile = promisor ? PROMISOR_MS_PER_FILE : ADD_MS_PER_FILE;
  const cap = Math.max(ADD_FLOOR_MS, Math.floor(usable / SERIAL_CREATIONS) - extrasMs);
  const scaled = Number.isFinite(trackedFiles) && trackedFiles > 0 ? trackedFiles * msPerFile : 0;
  const addTimeoutMs = Math.min(cap, Math.max(ADD_FLOOR_MS, scaled));
  return {
    addTimeoutMs,
    setupStepMs,
    lfsPullMs,
    extrasMs,
    msPerFile,
    lockWaitMs: Math.max(0, usable - addTimeoutMs - extrasMs),
    lockStaleMs: addTimeoutMs + extrasMs + LATE_SUCCESS_WAIT_MS + 10_000,
    hookTimeoutMs,
  };
}

/**
 * Every path tracked at `tip`, from one `git ls-tree` (#3856) — the tip, not
 * the main checkout's index, since the caller may be on another branch.
 *
 * @returns {{ok: boolean, paths?: string[], error?: string}}
 */
function treeListing({ tip, root }, git = runGit) {
  const r = git(['ls-tree', '-r', '-z', '--full-tree', '--name-only', tip], root, { maxBuffer: LISTING_MAX_BUFFER, raw: true });
  if (r.error || r.status !== 0) return { ok: false, error: gitFailure(r) };
  // NUL-separated: a path is every byte between separators, spaces included.
  return { ok: true, paths: r.stdout.split('\0').filter((p) => p !== '') };
}

/**
 * Whether a tracked path is checked out by a cone-mode sparse checkout of
 * `dirs`: root-level files always, everything under a cone directory, and
 * the files directly inside each of its ancestors — git's cone semantics.
 */
function inCone(file, dirs) {
  const slash = file.lastIndexOf('/');
  if (slash < 0) return true;
  const parent = file.slice(0, slash);
  return dirs.some((d) => file.startsWith(`${d}/`) || d.startsWith(`${parent}/`));
}

/** How many of `paths` a cone of `dirs` checks out (#3856). */
function coneFileCount(paths, dirs) {
  let n = 0;
  for (const p of paths) if (inCone(p, dirs)) n++;
  return n;
}

/**
 * The cone directories for a resolved `worktrees` config and the paths at the
 * tip (#3856): the declared `include` list, or every top-level directory at
 * the tip less the `exclude` list — then the cone floor, whatever was
 * declared, so framework writes always land.
 *
 * @param {{sparse: {declared: string, include: string[]|null, exclude: string[]|null}, floor: string[]}} config
 * @param {string[]} paths
 * @returns {{dirs: string[], floorAdded: string[]}}
 */
function resolveCone(config, paths) {
  let dirs;
  if (config.sparse.declared === 'include') {
    dirs = [...config.sparse.include];
  } else {
    const top = [];
    for (const p of paths) {
      const slash = p.indexOf('/');
      if (slash > 0 && !top.includes(p.slice(0, slash))) top.push(p.slice(0, slash));
    }
    dirs = top.filter((d) => !config.sparse.exclude.includes(d));
  }
  const floorAdded = config.floor.filter((f) => !dirs.includes(f));
  return { dirs: [...dirs, ...floorAdded], floorAdded };
}

/**
 * The highest directories holding no file of the cone (#3856): for each path
 * outside it, its shortest ancestor that is neither a cone directory, nor
 * inside one, nor an ancestor of one. `git lfs pull` ignores sparse-checkout —
 * measured with git-lfs 3.7.1, it wrote `assets/` into a worktree whose cone
 * was `src` — so these are passed to it as `--exclude`.
 *
 * @param {string[]} paths
 * @param {string[]} dirs
 * @returns {string[]} in first-seen order
 */
function outOfConeDirs(paths, dirs) {
  const out = [];
  const touchesCone = (p) => dirs.some((d) => d === p || d.startsWith(`${p}/`) || p.startsWith(`${d}/`));
  for (const file of paths) {
    if (inCone(file, dirs)) continue;
    const segs = file.split('/').slice(0, -1);
    for (let k = 1; k <= segs.length; k++) {
      const prefix = segs.slice(0, k).join('/');
      if (!touchesCone(prefix)) {
        if (!out.includes(prefix)) out.push(prefix);
        break;
      }
    }
  }
  return out;
}

/**
 * Directory names git would split (#3878). Names come byte-for-byte from the
 * tree listing (#3856), and two of the hook's hand-offs to git join them with
 * a separator a name can hold: the cone goes to `git sparse-checkout set
 * --stdin` one directory per line, and the LFS exclude list goes to
 * `git lfs pull --exclude` comma-separated. Neither has an escape the hook can
 * rely on, so such a name is refused before anything is created — never passed
 * through as two different names.
 *
 * @param {{coneDirs: string[], lfsExclude: string[]}} input
 * @returns {Array<{stage: 'sparse'|'lfs', dir: string, separator: string}>}
 */
function unsplittableDirs({ coneDirs = [], lfsExclude = [] }) {
  const out = [];
  for (const dir of coneDirs) if (/[\r\n]/.test(dir)) out.push({ stage: 'sparse', dir, separator: 'line break' });
  for (const dir of lfsExclude) if (dir.includes(',')) out.push({ stage: 'lfs', dir, separator: 'comma' });
  return out;
}

const SPLIT_BY = {
  sparse: 'git sparse-checkout set --stdin reads one cone directory per line',
  lfs: 'git lfs pull --exclude splits its value on commas',
};

/**
 * Whether the repository uses Git LFS at `tip` and whether git-lfs runs here
 * (#3856). `used` is true when a tracked `.gitattributes` at the tip names
 * `filter=lfs`, false when none does, and null when git could not say — `error`
 * then carries why. Only called for a configured mode other than `smudge`.
 *
 * @returns {{used: boolean|null, available: boolean, error: string|null}}
 */
function detectLfs({ tip, root }, git = runGit) {
  const grep = git(['grep', '-q', '-e', 'filter=lfs', tip, '--', '.gitattributes', ':(glob)**/.gitattributes'], root);
  let used = null;
  if (!grep.error && grep.status === 0) used = true;
  else if (!grep.error && grep.status === 1) used = false;
  const version = git(['lfs', 'version'], root);
  return { used, available: !version.error && version.status === 0, error: used === null ? gitFailure(grep) : null };
}

/**
 * What the hook does about LFS for a resolved `worktrees.lfs` (#3856).
 * `smudge` asks nothing of the repository. `skip` and `pull` set
 * GIT_LFS_SKIP_SMUDGE=1 for the checkout; `pull` then fetches `include`.
 * A mode configured in a repository that uses no LFS is noted and resolves to
 * `smudge` — reported, never a failure. `pull` with git-lfs unavailable is
 * `fatal`: the configured content cannot arrive, and the caller stops before
 * creating anything.
 *
 * @param {{mode: string, include: string[]}} lfs
 * @param {function(): {used: boolean|null, available: boolean, error?: string|null}} detect
 * @returns {{mode: string, env: object|null, pull: string[]|null, notes: string[], fatal: string|null}}
 */
function planLfs(lfs, detect) {
  const plan = { mode: 'smudge', env: null, pull: null, notes: [], fatal: null };
  if (!lfs || lfs.mode === 'smudge') return plan;
  const found = detect();
  if (found.used === false) {
    plan.notes.push(`worktrees.lfs.mode ${lfs.mode} is configured but this repository uses no Git LFS (no filter=lfs in a tracked .gitattributes) — ignored`);
    return plan;
  }
  if (found.used === null) {
    plan.notes.push(`whether this repository uses Git LFS could not be determined (${found.error}) — applying worktrees.lfs.mode ${lfs.mode}`);
  }
  if (lfs.mode === 'pull' && !found.available) {
    plan.fatal = 'worktrees.lfs.mode pull is configured but git-lfs is not available, so the listed paths cannot be fetched — '
      + 'install Git LFS or set worktrees.lfs.mode to skip; no worktree created';
    return plan;
  }
  if (!found.available) plan.notes.push('git-lfs is not available here — LFS files arrive as pointer files whatever the mode');
  plan.mode = lfs.mode;
  plan.env = { GIT_LFS_SKIP_SMUDGE: '1' };
  if (lfs.mode === 'pull') plan.pull = [...lfs.include];
  return plan;
}

/**
 * Whether the repository is a partial clone (#3856): a promisor remote with a
 * `partialclonefilter`, from one `git config --get-regexp`. Partial clone is a
 * property of the clone — every worktree shares its object store — so the
 * hook only accounts for it: a wider bound, and a failed fetch named as such.
 * A config git cannot read is `detected: false` with `error` set.
 *
 * @returns {{detected: boolean, remote: string|null, filter: string|null, error: string|null}}
 */
function detectPartialClone({ root }, git = runGit) {
  const r = git(['config', '--get-regexp', '^remote\\..*\\.partialclonefilter$'], root);
  const out = { detected: false, remote: null, filter: null, error: null };
  if (r.error || (r.status !== 0 && r.status !== 1)) {
    out.error = gitFailure(r);
    return out;
  }
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = line.match(/^remote\.(.+)\.partialclonefilter\s+(.+)$/i);
    if (m) {
      out.detected = true;
      out.remote = m[1];
      out.filter = m[2].trim();
      break;
    }
  }
  return out;
}

/**
 * `git lfs pull` of the configured patterns into a new worktree, bounded, with
 * the out-of-cone directories excluded (#3856).
 *
 * @returns {{ok: boolean, error?: string}}
 */
function lfsPull({ wtPath, include, exclude, timeoutMs }, git = runGit) {
  const args = ['lfs', 'pull', '--include', include.join(','), ...(exclude.length > 0 ? ['--exclude', exclude.map((d) => `${d}/**`).join(',')] : [])];
  const r = git(args, wtPath, { timeout: timeoutMs });
  if (r.error || r.status !== 0) return { ok: false, error: gitFailure(r) };
  return { ok: true };
}

const sleepMs = (ms) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };

/** Whether a process with this pid exists; a pid we may not signal still exists. */
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/**
 * Take the creation lock, waiting for a running holder up to `waitMs` (#3853).
 *
 * The lock records its holder's pid and when it was taken. A waiter takes it
 * over when the holder is no longer running — a hook killed mid-creation must
 * not block the next — or when the lock is older than `staleMs`, longer than
 * any holder may keep it, which also covers a dead holder's pid reused by an
 * unrelated process. A lock that cannot be parsed is a holder mid-write until
 * LOCK_WRITE_GRACE_MS has passed, then stale. The takeover (takeOverStale)
 * guarantees that a lock is removed only if it is still the one judged stale:
 * the file is renamed to a unique name in one atomic step, the renamed content
 * is compared with what was judged, and it is deleted only on a match. A lock
 * another waiter has taken since is restored, never removed on the strength of
 * the old one. What it does not guarantee: a third waiter that finds `file`
 * absent in the instant between the rename and the restore writes its own lock
 * there, and the restored holder's file is then not put back — two holders,
 * which (see CREATE_LOCK_NAME) costs a slower checkout, never a wrong worktree.
 *
 * @param {{commonDir: string}} input
 * @param {{waitMs?: number, staleMs?: number, pollMs?: number, pid?: number,
 *   now?: function(): number, sleep?: function(number): void, isAlive?: function(number): boolean}} [opts]
 * A write that fails with anything but EEXIST (EACCES, EROFS, EPERM, ENOENT on
 * the common dir) is not contention: no wait can clear it, so it returns at
 * once — no sleep, no poll — with `writeFailed` set and the error (#3872).
 *
 * @returns {{ok: boolean, file: string, waitedMs: number, tookOver: string|null, holder: string|null,
 *   error: string|null, writeFailed: boolean}}
 *   `tookOver` says why a stale lock was replaced; `holder` describes the
 *   holder that outlasted the wait; `writeFailed` marks a lock that could not
 *   be written at all
 */
function acquireCreateLock({ commonDir }, opts = {}) {
  const file = path.join(commonDir, CREATE_LOCK_NAME);
  const waitMs = opts.waitMs !== undefined ? opts.waitMs : DEFAULT_LOCK_WAIT_MS;
  const staleMs = opts.staleMs !== undefined ? opts.staleMs : DEFAULT_LOCK_STALE_MS;
  const pollMs = opts.pollMs || LOCK_POLL_MS;
  const now = opts.now || Date.now;
  const sleep = opts.sleep || sleepMs;
  const isAlive = opts.isAlive || pidAlive;
  const pid = opts.pid || process.pid;
  const started = now();
  const out = { ok: false, file, waitedMs: 0, tookOver: null, holder: null, error: null, writeFailed: false };

  for (;;) {
    let writeError = null;
    try {
      fs.writeFileSync(file, JSON.stringify({ pid, at: now() }), { flag: 'wx' });
      out.ok = true;
      out.waitedMs = now() - started;
      return out;
    } catch (err) {
      writeError = err;
    }

    let stale = null;
    let raw = null;
    if (writeError.code === 'EEXIST') {
      try {
        raw = fs.readFileSync(file, 'utf8');
        let rec = null;
        try { rec = JSON.parse(raw); } catch (_) { /* mid-write, or not ours */ }
        if (rec && Number.isInteger(rec.pid) && typeof rec.at === 'number') {
          out.holder = `pid ${rec.pid}, held ${Math.round((now() - rec.at) / 1000)}s`;
          if (!isAlive(rec.pid)) stale = `its holder (pid ${rec.pid}) is no longer running`;
          else if (now() - rec.at > staleMs) stale = `it is ${Math.round((now() - rec.at) / 1000)}s old, longer than a holder may keep it`;
        } else {
          out.holder = 'an unreadable lock file';
          if (now() - fs.statSync(file).mtimeMs > LOCK_WRITE_GRACE_MS) stale = 'it is unreadable';
        }
      } catch (_) { /* released between the write and the read: try again */ }
    } else {
      // Not contention (EACCES, EROFS, EPERM, ENOENT…): waiting cannot clear it.
      out.error = writeError.message;
      out.writeFailed = true;
      out.waitedMs = now() - started;
      return out;
    }

    // A removed stale lock is retried at once; a failed takeover (#3902 — a
    // rename refused with EPERM/EBUSY every time) falls through to the
    // deadline check and the sleep, never spinning until the hook timeout.
    if (stale && takeOverStale(file, raw, pid)) {
      out.tookOver = stale;
      continue;
    }

    if (now() - started >= waitMs) {
      out.waitedMs = now() - started;
      if (!out.error) out.error = `held by ${out.holder || 'another hook'}`;
      return out;
    }
    sleep(pollMs);
  }
}

/**
 * Remove the lock at `file` only if it is still the one judged stale (#3872).
 *
 * The rename is the one atomic step: it moves whatever lock is there at that
 * instant to a name no other waiter uses, so the content checked afterwards is
 * exactly what was removed from `file`. A match is deleted; anything else is a
 * lock another waiter took in the meantime, and it is put back — with link, so
 * a lock written to `file` since the rename is never overwritten.
 *
 * @returns {boolean} true when the stale lock was removed
 */
function takeOverStale(file, raw, pid) {
  const aside = `${file}.${pid}.${Date.now()}.${Math.random().toString(36).slice(2, 10)}`;
  try {
    fs.renameSync(file, aside);
  } catch (_) {
    return false; // another waiter removed it first
  }
  let moved = null;
  try { moved = fs.readFileSync(aside, 'utf8'); } catch (_) { /* unreadable: treat as not ours to remove */ }
  if (moved === raw) {
    try { fs.unlinkSync(aside); } catch (_) { /* already gone */ }
    return true;
  }
  try {
    fs.linkSync(aside, file);
  } catch (err) {
    if (err.code !== 'EEXIST') {
      try { fs.renameSync(aside, file); return false; } catch (_) { /* fall through to the cleanup */ }
    }
  }
  try { fs.unlinkSync(aside); } catch (_) { /* already gone */ }
  return false;
}

/**
 * The remedy every failure that leaves a worktree behind names (#3872). The
 * hook assumes nothing about who asked (see the header), so the general path
 * is worktree-teardown.js; `merge-back-gate.js reclaim` re-checks the worktree
 * is on a tracker first and refuses anything else, so it is offered to tracker
 * members only.
 *
 * @param {string} wtPath  the worktree left behind
 * @param {string} root    the project root
 * @param {string} [what]  what state it is left in, appended to the path
 */
function leftBehind(wtPath, root, what = '') {
  return `the worktree is left at ${wtPath}${what} — remove it with worktree-teardown.js `
    + `(node .claude/scripts/shared/lib/worktree-teardown.js --root ${root} --worktree ${wtPath}), never git worktree remove; `
    + 'a tracker member may use merge-back-gate.js reclaim instead';
}

/** Release the creation lock, only while it is still this process's. */
function releaseCreateLock(file, pid = process.pid) {
  try {
    const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (rec && rec.pid === pid) fs.unlinkSync(file);
  } catch (_) { /* already gone, or taken over as stale: nothing of ours to remove */ }
}

/** A path as the filesystem names it, so git's long form and an 8.3 short form compare equal (#3150). */
const realOr = (p) => { try { return fs.realpathSync.native(p); } catch (_) { return p; } };

/** The `git worktree list --porcelain` entry for `wtPath`, or null. */
function listedWorktree(porcelain, wtPath) {
  for (const block of porcelain.split(/\r?\n\r?\n/)) {
    const entry = { path: null, head: null, branch: null, locked: null };
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('worktree ')) entry.path = line.slice('worktree '.length);
      else if (line.startsWith('HEAD ')) entry.head = line.slice('HEAD '.length);
      else if (line.startsWith('branch ')) entry.branch = line.slice('branch '.length);
      else if (line === 'locked' || line.startsWith('locked ')) entry.locked = line.slice('locked'.length).trim();
    }
    if (entry.path && samePath(realOr(entry.path), realOr(wtPath))) return entry;
  }
  return null;
}

/**
 * Whether a `git worktree add` killed at its bound nonetheless produced the
 * worktree (#3853). The kill ends the parent git only: its checkout child
 * runs on, and when it finishes the worktree is registered, clean and at the
 * requested tip, but still locked with reason `initializing` — the parent
 * removes that lock, and the parent is gone.
 *
 * Accepted only on all of: registered at `wtPath`, on `branch`, HEAD at
 * `tip`, no checkout in progress (an index, and no `index.lock`), and a
 * clean tree, untracked files counted. A checkout still running is waited for
 * up to `waitMs`; every other shortfall refuses at once. On acceptance an
 * `initializing` lock is removed; a lock with any other reason is someone's
 * decision and refuses.
 *
 * A two-step (sparse) creation (#3856, `twoStep`) is stricter. Its add ran
 * with `--no-checkout`, so a registered worktree at the tip proves nothing
 * about its files: one with no index was never checked out and is refused at
 * once, not waited for, and one still carrying CHECKOUT_PENDING_MARKER was
 * not checked out by this hook and is refused whatever its tree looks like.
 *
 * `ownCheckout` (#3901) is the case where the timed-out command was this
 * hook's own `git checkout` (sparseCheckout): the marker is this hook's and
 * is skipped, a checkout still holding `index.lock` is waited for, and one
 * that left neither an index nor `index.lock` is refused at once. The caller
 * removes the marker on acceptance.
 *
 * `ownAdd` (#3942) is the case where the timed-out command was this hook's
 * own `git worktree add --no-checkout`. Real git writes no index for such an
 * add, so the twoStep refusal of a missing index would make it unrecoverable.
 * With no index and no `index.lock` it is accepted as the state a returned
 * add leaves — registered, on the branch, at the tip, no pending marker (the
 * hook writes it only after the add returns) and no files in the work tree but
 * `.git` — and the caller continues to the sparse checkout. A tree with an
 * index is judged like any other. Such an acceptance sets `noCheckout`: the
 * tree was found empty with no index, never checked clean by `git status`,
 * and the caller's report says so.
 *
 * @param {{wtPath: string, branch: string, tip: string, root: string}} input
 * @param {{runGit?: function, twoStep?: boolean, ownCheckout?: boolean, ownAdd?: boolean, late?: {waitMs?: number, pollMs?: number, now?: function(): number, sleep?: function(number): void}}} [opts]
 * @returns {{ok: boolean, registered: boolean, unlocked: boolean, noCheckout: boolean, reason: string|null}}
 */
function lateSuccess({ wtPath, branch, tip, root }, opts = {}) {
  const git = opts.runGit || runGit;
  const late = opts.late || {};
  const waitMs = late.waitMs !== undefined ? late.waitMs : LATE_SUCCESS_WAIT_MS;
  const pollMs = late.pollMs || 1000;
  const now = late.now || Date.now;
  const sleep = late.sleep || sleepMs;
  const started = now();
  const out = { ok: false, registered: false, unlocked: false, noCheckout: false, reason: null };
  const no = (reason) => { out.reason = reason; return out; };
  // A lock left by the killed creation is removed; any other lock is someone's decision.
  const accept = (entry) => {
    if (entry.locked !== null && entry.locked !== 'initializing') return no(`it is locked (${entry.locked || 'no reason given'}), not by its own creation`);
    if (entry.locked === 'initializing') {
      const unlock = git(['worktree', 'unlock', wtPath], root);
      if (unlock.error || unlock.status !== 0) return no(`its initializing lock could not be removed: ${gitFailure(unlock)}`);
      out.unlocked = true;
    }
    out.ok = true;
    return out;
  };

  for (;;) {
    const list = git(['worktree', 'list', '--porcelain'], root);
    if (list.error || list.status !== 0) return no(`cannot list worktrees: ${gitFailure(list)}`);
    const entry = listedWorktree(list.stdout, wtPath);
    if (!entry) return no('no worktree was registered');
    out.registered = true;
    if (entry.branch !== `refs/heads/${branch}`) return no(`it is on ${entry.branch || 'a detached HEAD'}, not ${branch}`);
    if (entry.head !== tip) return no(`it is at ${String(entry.head).slice(0, 8)}, not at the requested tip ${tip.slice(0, 8)}`);

    const admin = git(['rev-parse', '--absolute-git-dir'], wtPath);
    if (admin.error || admin.status !== 0) return no(`cannot read its git directory: ${gitFailure(admin)}`);
    if (opts.ownCheckout) {
      // #3901: the checkout that timed out is this hook's own, so the pending
      // marker it wrote proves nothing. A checkout holds index.lock while it
      // runs; with neither an index nor index.lock it is not running and never
      // finished, so there is nothing to wait for.
      if (!fs.existsSync(path.join(admin.stdout, 'index')) && !fs.existsSync(path.join(admin.stdout, 'index.lock'))) {
        return no('its checkout exited without writing an index');
      }
    } else if (opts.ownAdd) {
      // #3942: the add that timed out is this hook's own --no-checkout add.
      if (fs.existsSync(path.join(admin.stdout, CHECKOUT_PENDING_MARKER))) {
        return no('its two-step checkout never completed — created with --no-checkout and not checked out by this hook');
      }
      if (!fs.existsSync(path.join(admin.stdout, 'index')) && !fs.existsSync(path.join(admin.stdout, 'index.lock'))) {
        let files;
        try {
          files = fs.readdirSync(wtPath).filter((e) => e !== '.git');
        } catch (err) {
          return no(`cannot read its work tree: ${err.message}`);
        }
        if (files.length > 0) return no(`it has files a --no-checkout add never writes: ${files.slice(0, 3).join(', ')}`);
        const accepted = accept(entry);
        if (accepted.ok) accepted.noCheckout = true;
        return accepted;
      }
    } else if (opts.twoStep) {
      if (fs.existsSync(path.join(admin.stdout, CHECKOUT_PENDING_MARKER))) {
        return no('its two-step checkout never completed — created with --no-checkout and not checked out by this hook');
      }
      if (!fs.existsSync(path.join(admin.stdout, 'index'))) {
        return no('it was created with --no-checkout and never checked out');
      }
    }
    const busy = fs.existsSync(path.join(admin.stdout, 'index.lock')) || !fs.existsSync(path.join(admin.stdout, 'index'));
    if (!busy) {
      const status = git(['status', '--porcelain', '--untracked-files=all'], wtPath);
      if (status.error || status.status !== 0) return no(`cannot read its tree: ${gitFailure(status)}`);
      if (status.stdout !== '') return no('it has uncommitted or untracked changes');
      return accept(entry);
    }
    if (now() - started >= waitMs) return no(`its checkout was still running ${Math.round(waitMs / 1000)}s after the bound`);
    sleep(pollMs);
  }
}

/**
 * The second and third steps of a sparse creation (#3856), run under the
 * creation lock once `git worktree add --no-checkout` has returned 0:
 * CHECKOUT_PENDING_MARKER is written into the worktree's admin directory,
 * `git sparse-checkout set --cone` writes the cone into that worktree's own
 * config (git turns on `extensions.worktreeConfig` for it, so the main
 * checkout stays full), and `git checkout` writes the files under the
 * checkout bound. The marker is removed only when the checkout exits 0, or
 * when a checkout that outlasted its bound is accepted by lateSuccess
 * (`ownCheckout`, #3901) — so a worktree this sequence did not finish is never
 * accepted by a later lateSuccess.
 *
 * The directories reach git on stdin (`--stdin`): a long cone never meets a
 * command-line limit, and a directory named like an option is never read as one.
 *
 * @param {{wtPath: string, branch: string, tip: string, root: string, dirs: string[],
 *   setupStepMs: number, checkoutMs: number, env?: object|null}} input
 * @param {{runGit?: function, retry?: object, late?: object}} [opts]
 * @returns {{ok: boolean, stage?: 'sparse'|'checkout', error?: string, late?: object}}
 */
function sparseCheckout({ wtPath, branch, tip, root, dirs, setupStepMs, checkoutMs, env = null }, opts = {}) {
  const git = opts.runGit || runGit;
  const admin = git(['rev-parse', '--absolute-git-dir'], wtPath);
  if (admin.error || admin.status !== 0) return { ok: false, stage: 'sparse', error: `cannot read its git directory: ${gitFailure(admin)}` };
  const marker = path.join(admin.stdout, CHECKOUT_PENDING_MARKER);
  try {
    fs.writeFileSync(marker, `${JSON.stringify({ pid: process.pid, at: Date.now() })}\n`);
  } catch (err) {
    return { ok: false, stage: 'sparse', error: `cannot write ${marker}: ${err.message}` };
  }

  // Writes extensions.worktreeConfig into the shared .git/config the first
  // time, so a concurrent hook's config.lock is retried like the driver step's.
  const set = runGitContended(['sparse-checkout', 'set', '--cone', '--stdin'], wtPath, opts.retry,
    (a, c) => git(a, c, { timeout: setupStepMs, input: `${dirs.join('\n')}\n` }));
  if (set.error || set.status !== 0) return { ok: false, stage: 'sparse', error: gitFailure(set) };

  const co = git(['checkout'], wtPath, { timeout: checkoutMs, ...(env ? { env } : {}) });
  let late = null;
  if (co.error && co.error.code === 'ETIMEDOUT') {
    late = lateSuccess({ wtPath, branch, tip, root }, { runGit: git, late: opts.late, twoStep: true, ownCheckout: true });
    if (!late.ok) return { ok: false, stage: 'checkout', error: gitFailure(co), late };
  } else if (co.error || co.status !== 0) {
    return { ok: false, stage: 'checkout', error: gitFailure(co) };
  }
  try {
    fs.rmSync(marker, { force: true });
  } catch (err) {
    return { ok: false, stage: 'checkout', error: `checked out, but ${marker} could not be removed: ${err.message}` };
  }
  return late ? { ok: true, late } : { ok: true };
}

/**
 * The project's `worktrees` config through framework-config.js (#3856). A
 * resolver that cannot load is a full checkout — today's behavior — named.
 */
function readWorktreeConfig(root) {
  try {
    return require('../scripts/shared/lib/framework-config.js').resolveWorktreeConfig(root);
  } catch (err) {
    return {
      mode: 'full', needsOffer: false, sparse: { declared: 'absent', include: null, exclude: null },
      lfs: { declared: 'absent', mode: 'smudge', include: [] }, floor: ['.claude', 'Construction'],
      warnings: [`worktrees config could not be read (${err.message}) — full checkout`], source: 'default',
    };
  }
}

/** The cone floor, from the resolver that owns it; its literal value if that cannot load. */
function coneFloor() {
  try {
    return [...require('../scripts/shared/lib/framework-config.js').WORKTREE_CONE_FLOOR];
  } catch (_) {
    return ['.claude', 'Construction'];
  }
}

/**
 * Evaluate the repository for the startup offer (#3856): tracked files per
 * top-level directory, tracked blobs of at least `largeBlobBytes`, LFS use and
 * partial-clone state, and the `worktrees` configuration to suggest.
 *
 * Read-only: `git config`, one `git ls-tree` of `tip` and the two LFS probes.
 * In a partial clone the sizes are NOT read — `ls-tree -l` would fetch every
 * missing blob — so `sizesKnown` is false and no large blob is named.
 *
 * The suggestion leaves out top-level directories named in
 * SUGGEST_EXCLUDE_NAMES and asset directories (large blobs are at least
 * ASSET_DIR_SHARE of their bytes), never the cone floor; when what it leaves
 * out is under both SUGGEST_MIN_FILE_SHARE of the files and
 * SUGGEST_MIN_BYTE_SHARE of the bytes, it suggests `sparse: false`. A
 * repository using LFS is suggested `lfs: {mode: 'skip'}`. Partial clone is
 * never suggested: all worktrees share one object store, so it cannot make a
 * worktree lighter, and the initial clone stays full.
 *
 * @param {{root: string, tip?: string, runGit?: function, largeBlobBytes?: number}} input
 * @returns {{ok: boolean, error?: string, trackedFiles?: number, rootFiles?: number,
 *   topLevel?: Array<{dir: string, files: number, bytes: number|null, largeBlobs: number}>,
 *   largeBlobs?: Array<{path: string, size: number}>, largeBlobBytes?: number, sizesKnown?: boolean,
 *   lfs?: object, partialClone?: object, suggestion?: object, saving?: {files: number, share: number, dirs: string[]}}}
 */
function evaluateRepository({ root, tip = 'HEAD', runGit: git = runGit, largeBlobBytes = LARGE_BLOB_BYTES } = {}) {
  try {
    const partialClone = detectPartialClone({ root }, git);
    const sizesKnown = !partialClone.detected;
    const r = git(['ls-tree', '-r', '-z', '--full-tree', ...(sizesKnown ? ['-l'] : ['--name-only']), tip], root, { maxBuffer: LISTING_MAX_BUFFER, raw: true });
    if (r.error || r.status !== 0) return { ok: false, error: `cannot list the tracked files at ${tip}: ${gitFailure(r)}` };

    const byDir = new Map();
    const large = [];
    let trackedFiles = 0;
    let rootFiles = 0;
    let totalBytes = 0;
    for (const raw of r.stdout.split('\0')) {
      if (raw === '') continue;
      let file = raw;
      let size = null;
      if (sizesKnown) {
        const tab = raw.indexOf('\t');
        if (tab < 0) continue;
        file = raw.slice(tab + 1);
        const n = Number(raw.slice(0, tab).trim().split(/\s+/).pop());
        size = Number.isFinite(n) ? n : null;
      }
      trackedFiles++;
      if (size !== null) totalBytes += size;
      const slash = file.indexOf('/');
      if (slash < 0) {
        rootFiles++;
      } else {
        const dir = file.slice(0, slash);
        const entry = byDir.get(dir) || { dir, files: 0, bytes: sizesKnown ? 0 : null, largeBytes: 0, largeBlobs: 0 };
        entry.files++;
        if (size !== null) entry.bytes += size;
        if (size !== null && size >= largeBlobBytes) { entry.largeBlobs++; entry.largeBytes += size; }
        byDir.set(dir, entry);
      }
      if (size !== null && size >= largeBlobBytes) large.push({ path: file, size });
    }

    const lfs = detectLfs({ tip, root }, git);
    const floor = coneFloor();
    const excluded = [];
    for (const d of byDir.values()) {
      if (floor.includes(d.dir)) continue;
      const named = SUGGEST_EXCLUDE_NAMES.includes(d.dir.toLowerCase());
      const assets = sizesKnown && d.largeBlobs > 0 && d.bytes > 0 && d.largeBytes / d.bytes >= ASSET_DIR_SHARE;
      if (named || assets) excluded.push(d);
    }
    const savedFiles = excluded.reduce((n, d) => n + d.files, 0);
    const savedBytes = sizesKnown ? excluded.reduce((n, d) => n + d.bytes, 0) : 0;
    const fileShare = trackedFiles > 0 ? savedFiles / trackedFiles : 0;
    const byteShare = totalBytes > 0 ? savedBytes / totalBytes : 0;
    const worth = excluded.length > 0 && (fileShare >= SUGGEST_MIN_FILE_SHARE || byteShare >= SUGGEST_MIN_BYTE_SHARE);

    const suggestion = { sparse: worth ? { exclude: excluded.map((d) => d.dir) } : false };
    if (lfs.used === true) suggestion.lfs = { mode: 'skip' };

    large.sort((a, b) => b.size - a.size);
    return {
      ok: true,
      trackedFiles,
      rootFiles,
      topLevel: [...byDir.values()].map(({ dir, files, bytes, largeBlobs }) => ({ dir, files, bytes, largeBlobs })),
      largeBlobs: large.slice(0, 5),
      largeBlobCount: large.length,
      largeBlobBytes,
      sizesKnown,
      lfs,
      partialClone,
      suggestion,
      saving: worth ? { files: savedFiles, share: fileShare, dirs: excluded.map((d) => d.dir) } : { files: 0, share: 0, dirs: [] },
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Write the configuration an accepted startup offer chose (#3856), through
 * framework-config.js (schema-validated, against the file as it is now).
 * `suggested` writes evaluateRepository's suggestion as evaluated now;
 * `full` writes `sparse: false` — a decided full checkout — and, in a
 * repository using LFS, `lfs: {mode: 'smudge'}`, so the offer is settled.
 * Either choice writes `lfs` only when none is declared: a `worktrees.lfs`
 * the user or Praxis Hub Manager already set is kept, never replaced.
 * A project with no framework-config.json, or an unknown choice, writes nothing.
 *
 * @param {{root: string, choice: string, runGit?: function, largeBlobBytes?: number}} input
 * @returns {{ok: boolean, written?: boolean, worktrees?: object, error?: string}}
 */
function applyWorktreeConfig({ root, choice, runGit: git = runGit, largeBlobBytes } = {}) {
  if (!APPLY_CHOICES.includes(choice)) {
    return { ok: false, error: `${APPLY_FLAG} takes one of ${APPLY_CHOICES.join(', ')}, not ${JSON.stringify(choice)}; nothing written` };
  }
  if (!fs.existsSync(path.join(root, 'framework-config.json'))) {
    return { ok: false, error: `no framework-config.json in ${root}; nothing written` };
  }
  const evaluation = evaluateRepository({ root, runGit: git, ...(largeBlobBytes ? { largeBlobBytes } : {}) });
  let worktrees;
  if (choice === 'suggested') {
    if (!evaluation.ok) return { ok: false, error: `the repository could not be evaluated (${evaluation.error}); nothing written` };
    worktrees = { ...evaluation.suggestion };
  } else {
    worktrees = { sparse: false, ...(evaluation.ok && evaluation.lfs.used === true ? { lfs: { mode: 'smudge' } } : {}) };
  }
  // The offer settles the cone, not LFS: an `lfs` the user or Praxis Hub
  // Manager already declared is kept, never replaced (#3856 work review).
  let lfsDeclared = false;
  try {
    lfsDeclared = require('../scripts/shared/lib/framework-config.js').resolveWorktreeConfig(root).lfs.declared === 'set';
  } catch (_) { /* unreadable: the write below reports it */ }
  if (lfsDeclared) delete worktrees.lfs;
  try {
    const written = require('../scripts/shared/lib/framework-config.js').writeWorktreeConfig(root, worktrees);
    return { ok: true, written, worktrees };
  } catch (err) {
    return { ok: false, error: `${err.message}; nothing written` };
  }
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
 *   runGit?: function, retry?: {attempts?: number, sleep?: function(number): void},
 *   lock?: object, late?: object, home?: string, trackedFiles?: number|null}} opts
 *   `runGit` replaces the git runner for every git call the hook makes itself
 *   (not the link or driver steps); `retry` tunes the contention loops, `lock`
 *   overrides acquireCreateLock's options and `late` lateSuccess's, `home` the home directory whose
 *   settings are read and `trackedFiles` the count the bound scales with (tests)
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

    // #3856: the cone, when worktrees.sparse declares one. Absent or empty is
    // a full checkout — the path below is then exactly the one before #3856.
    const wtConfig = readWorktreeConfig(rootInfo.root);
    for (const w of wtConfig.warnings) out.stderr.push(`worktree-create: ${w}`);
    let cone = null;
    let listing = null;
    if (wtConfig.mode === 'sparse') {
      const listed = treeListing({ tip: out.tip, root: rootInfo.root }, git);
      if (listed.ok) {
        listing = listed.paths;
        cone = resolveCone(wtConfig, listing);
      } else {
        out.stderr.push(`worktree-create: cannot list the tracked files at ${out.tip.slice(0, 8)} (${listed.error}) — `
          + 'creating a full checkout instead of the configured sparse one');
      }
    }
    const sparse = cone !== null;

    // #3856: how LFS content arrives. `smudge` (the default) asks git nothing.
    const lfsPlan = planLfs(wtConfig.lfs, () => detectLfs({ tip: out.tip, root: rootInfo.root }, git));
    for (const n of lfsPlan.notes) out.stderr.push(`worktree-create: ${n}`);
    if (lfsPlan.fatal) return fail('lfs', lfsPlan.fatal);

    // #3878: a name git would split is refused here, before the lock, the
    // branch or the worktree exist — never handed to git as two names.
    const splits = sparse
      ? unsplittableDirs({ coneDirs: cone.dirs, lfsExclude: lfsPlan.pull !== null ? outOfConeDirs(listing, cone.dirs) : [] })
      : [];
    if (splits.length > 0) {
      const first = splits[0];
      const named = splits.map((s) => `${JSON.stringify(s.dir)} (${s.separator}: ${SPLIT_BY[s.stage]})`).join('; ');
      return fail(first.stage, `refused: ${splits.length === 1 ? 'a directory name' : 'directory names'} git would split into different names — ${named}; `
        + 'nothing was created. Rename the directory, or leave it out of the sparse and LFS configuration so the worktree is a full checkout');
    }

    // #3856: a partial clone fetches missing blobs during the checkout.
    const partial = detectPartialClone({ root: rootInfo.root }, git);
    if (partial.error) out.stderr.push(`worktree-create: partial-clone detection could not read git config (${partial.error}) — bound as a full clone`);
    const blobFetchFailure = (where, stderr) => {
      const from = partial.detected ? `promisor remote ${partial.remote} (filter ${partial.filter})` : 'the promisor remote';
      if (fs.existsSync(wtPath)) out.halfMade = wtPath;
      // git removes a worktree whose checkout failed but keeps its new branch (observed, git 2.53.0).
      const ref = git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], rootInfo.root);
      const branchLeft = !out.halfMade && !ref.error && ref.status === 0;
      return fail('blob-fetch', `missing-blob fetch from ${from} failed during ${where} of ${wtPath} — this partial clone does not hold `
        + `every blob the checkout needs, and fetching them failed; check that the remote is reachable: ${stderr}`
        + `${out.halfMade ? `; ${leftBehind(wtPath, out.root)}` : ''}`
        + `${branchLeft ? `; the branch ${branch} was left behind — delete it (git branch -D ${branch}) before retrying this name` : ''}`);
    };

    // #3853: one `git worktree add` at a time across hooks started together.
    let files;
    if (opts.trackedFiles !== undefined) files = opts.trackedFiles;
    else files = sparse ? coneFileCount(listing, cone.dirs) : trackedFileCount(rootInfo.commonDir);
    const hookTimeout = resolveHookTimeout({ root: rootInfo.root, home: opts.home });
    const budget = creationBudget({
      trackedFiles: files, hookTimeoutMs: hookTimeout.ms, sparse, lfsPull: lfsPlan.pull !== null, promisor: partial.detected,
    });
    if (partial.detected) {
      out.stderr.push(`worktree-create: partial clone: promisor remote ${partial.remote} (filter ${partial.filter}) — the checkout fetches `
        + `missing blobs from it, so the bound allows ${budget.msPerFile}ms per file`);
    }
    const within = `lock wait up to ${Math.round(budget.lockWaitMs / 1000)}s, within the ${Math.round(hookTimeout.ms / 1000)}s hook timeout (${hookTimeout.source})`;
    if (sparse) {
      out.stderr.push(`worktree-create: sparse checkout of ${cone.dirs.join(', ')}`
        + `${cone.floorAdded.length > 0 ? ` (cone floor added ${cone.floorAdded.join(', ')})` : ''}`);
      out.stderr.push(`worktree-create: checkout bound ${Math.round(budget.addTimeoutMs / 1000)}s (${files} of ${listing.length} tracked files inside the cone), `
        + `set-up steps ${Math.round(budget.setupStepMs / 1000)}s each, ${within}`);
    } else {
      out.stderr.push(`worktree-create: git worktree add bound ${Math.round(budget.addTimeoutMs / 1000)}s `
        + `(${files === null ? 'tracked-file count unreadable' : `${files} tracked files`}), ${within}`);
    }
    if (lfsPlan.mode === 'skip') out.stderr.push('worktree-create: LFS: skip — LFS files are left as pointer files (GIT_LFS_SKIP_SMUDGE=1)');
    if (lfsPlan.mode === 'pull') {
      out.stderr.push(`worktree-create: LFS: pull — pointer files, then git lfs pull of ${lfsPlan.pull.join(',')} under a ${Math.round(budget.lfsPullMs / 1000)}s bound`);
    }
    const lock = acquireCreateLock({ commonDir: rootInfo.commonDir }, { waitMs: budget.lockWaitMs, staleMs: budget.lockStaleMs, ...opts.lock });
    if (!lock.ok && lock.writeFailed) {
      return fail('lock', `cannot create the creation lock ${lock.file}: ${lock.error}; no worktree created`);
    }
    if (!lock.ok) {
      return fail('lock', `waited ${Math.round(lock.waitedMs / 1000)}s for the creation lock ${lock.file} — ${lock.error}; `
        + 'no worktree created. Another worktree is still being created: retry once it finishes');
    }
    if (lock.tookOver) out.stderr.push(`worktree-create: took over the creation lock — ${lock.tookOver}`);
    else if (lock.waitedMs >= LOCK_POLL_MS) out.stderr.push(`worktree-create: waited ${Math.round(lock.waitedMs / 1000)}s for the creation lock`);

    let added;
    let late = null;
    let checkout = null;
    let pulled = null;
    const target = { wtPath, branch, tip: out.tip, root: rootInfo.root };
    try {
      added = addWorktree({
        ...target, name, commonDir: rootInfo.commonDir,
        timeoutMs: sparse ? budget.setupStepMs : budget.addTimeoutMs, noCheckout: sparse,
        env: sparse ? null : lfsPlan.env,
      }, gitOpts);
      const addOk = !added.result.error && added.result.status === 0;
      // Still under the lock: a checkout that outlived its parent is still using the disk.
      if (added.result.error && added.result.error.code === 'ETIMEDOUT') {
        late = lateSuccess(target, { runGit: git, late: opts.late, twoStep: sparse, ownAdd: sparse });
      }
      // #3901: a sparse add accepted late has no cone yet, so it continues to
      // its set-up steps exactly as one that returned 0 does — never straight to success.
      if (sparse && (addOk || (late && late.ok))) {
        checkout = sparseCheckout({ ...target, dirs: cone.dirs, setupStepMs: budget.setupStepMs, checkoutMs: budget.addTimeoutMs, env: lfsPlan.env },
          { runGit: git, retry: opts.retry, late: opts.late });
      }
      const ready = sparse ? Boolean(checkout && checkout.ok) : Boolean(addOk || (late && late.ok));
      if (ready && lfsPlan.pull) {
        pulled = lfsPull({ wtPath, include: lfsPlan.pull, exclude: sparse ? outOfConeDirs(listing, cone.dirs) : [], timeoutMs: budget.lfsPullMs }, git);
      }
    } finally {
      releaseCreateLock(lock.file);
    }
    const { result: add, attempts, leftovers } = added;
    if (attempts > 1) {
      out.stderr.push(`worktree-create: git worktree add retried ${attempts - 1} time(s) — a sibling worktree's admin entry was mid-creation`);
    }
    const bound = `${Math.round((sparse ? budget.setupStepMs : budget.addTimeoutMs) / 1000)}s bound`;
    if (late && late.ok) {
      out.stderr.push(`worktree-create: git worktree add outlasted its ${bound} but ${sparse ? 'finished' : 'its checkout finished'} — `
        + (late.noCheckout
          ? `registered at ${out.tip.slice(0, 8)} with no index and an empty work tree, as a --no-checkout add leaves it; accepted`
          : `registered, clean and at ${out.tip.slice(0, 8)}; accepted`)
        + `${late.unlocked ? ', initializing lock removed' : ''}`
        + `${sparse ? ' — continuing to its sparse checkout' : ''}`);
    } else if (!add.error && add.status !== 0 && isMissingBlobFetch(add.stderr)) {
      return blobFetchFailure('git worktree add', gitFailure(add));
    } else if (add.error || add.status !== 0) {
      const why = leftovers.length > 0 ? ` — not retried: the failed attempt left ${leftovers.join(', ')}` : '';
      if (late && late.registered) out.halfMade = wtPath;
      const left = late
        ? ` — outlasted its ${bound} and was not accepted: ${late.reason}${late.registered ? `; ${leftBehind(wtPath, out.root)}` : ''}`
        : '';
      return fail('add', `git worktree add failed for ${wtPath} (branch ${branch} at ${out.tip.slice(0, 8)}): ${gitFailure(add)}${why}${left}`);
    }
    out.halfMade = wtPath;
    if (checkout && !checkout.ok && !checkout.late && isMissingBlobFetch(checkout.error)) {
      return blobFetchFailure(checkout.stage === 'sparse' ? 'git sparse-checkout set' : 'git checkout', checkout.error);
    }
    if (checkout && !checkout.ok) {
      const command = checkout.stage === 'sparse' ? 'git sparse-checkout set' : 'git checkout';
      const late2 = checkout.late
        ? ` — outlasted its ${Math.round(budget.addTimeoutMs / 1000)}s bound and was not accepted: ${checkout.late.reason}`
        : '';
      return fail(checkout.stage, `${command} failed for ${wtPath} (branch ${branch} at ${out.tip.slice(0, 8)}): ${checkout.error}${late2}; `
        + leftBehind(wtPath, out.root));
    }
    if (checkout && checkout.late) {
      out.stderr.push(`worktree-create: git checkout outlasted its ${Math.round(budget.addTimeoutMs / 1000)}s bound but finished — `
        + `clean and at ${out.tip.slice(0, 8)}; accepted, pending marker removed${checkout.late.unlocked ? ', initializing lock removed' : ''}`);
    }
    if (pulled && !pulled.ok) {
      return fail('lfs', `git lfs pull of ${lfsPlan.pull.join(',')} failed for ${wtPath}: ${pulled.error}; `
        + leftBehind(wtPath, out.root, ' with LFS pointer files'));
    }
    if (pulled) out.stderr.push(`worktree-create: LFS: pulled ${lfsPlan.pull.join(',')}`);
    out.stderr.push(`worktree-create: created ${wtPath} on ${branch} at ${out.tip.slice(0, 8)} (root from ${rootInfo.source})`
      + `${sparse ? `, sparse: ${files} of ${listing.length} tracked files checked out` : ''}`);

    let links;
    try {
      links = linkStep({ root: rootInfo.root, worktree: wtPath, env });
    } catch (err) {
      links = { ok: false, error: err.message };
    }
    if (!links || links.ok === false) {
      return fail('links', `link recreation failed after git worktree add: ${(links && links.error) || 'unknown error'}; `
        + leftBehind(wtPath, out.root, ' (half-made)'));
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
      return fail('driver', `merge-driver registration failed after git worktree add: ${(driver && driver.error) || 'unknown error'}; `
        + leftBehind(wtPath, out.root, ' (half-made)'));
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
    const where = out.halfMade ? `; ${leftBehind(out.halfMade, out.root, ' (half-made)')}` : '';
    return fail('unexpected', `unexpected failure: ${err.message}${where}`);
  }
}

// Heartbeat (#2917): records this hook's outcome under the project root for the
// startup Hook Health row. Installed only when run as the hook — the test suite
// requires this module and must not write a heartbeat for its own process.
let heartbeat = { fail() {}, setCwd() {} };
// The apply command (#3856) is a session writing an accepted offer, not the
// WorktreeCreate hook firing: it records no heartbeat.
if (require.main === module && !process.argv.includes(APPLY_FLAG)) {
  try { heartbeat = require('../scripts/shared/lib/hook-heartbeat.js').installHeartbeat('worktree-create-hook'); } catch (_) { /* reported by the load check */ }
}

function parseName(argv) {
  const i = argv.indexOf('--name');
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : undefined;
}

/**
 * `node worktree-create-hook.js --apply-worktree-config suggested|full` (#3856):
 * what a session runs when the user accepts the startup offer. Reads no hook
 * input; prints applyWorktreeConfig's result as JSON.
 */
function applyMain(argv) {
  const choice = argv[argv.indexOf(APPLY_FLAG) + 1];
  const rootInfo = resolveRoot({ cwd: process.cwd(), env: process.env });
  const result = rootInfo.ok
    ? applyWorktreeConfig({ root: rootInfo.root, choice })
    : { ok: false, error: `${rootInfo.error}; nothing written` };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

async function main() {
  if (process.argv.includes(APPLY_FLAG)) {
    applyMain(process.argv.slice(2));
    return;
  }
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
  CREATE_LOCK_NAME,
  HOOK_TIMEOUT_MS,
  CHECKOUT_PENDING_MARKER,
  SPARSE_STEP_MS,
  creationBudget,
  treeListing,
  coneFileCount,
  resolveCone,
  sparseCheckout,
  LFS_PULL_MS,
  LFS_POINTER_PREFIX,
  outOfConeDirs,
  unsplittableDirs,
  detectLfs,
  planLfs,
  lfsPull,
  PROMISOR_MS_PER_FILE,
  LARGE_BLOB_BYTES,
  SUGGEST_EXCLUDE_NAMES,
  APPLY_FLAG,
  APPLY_CHOICES,
  evaluateRepository,
  applyWorktreeConfig,
  detectPartialClone,
  isMissingBlobFetch,
  trackedFileCount,
  resolveHookTimeout,
  lateSuccess,
  acquireCreateLock,
  releaseCreateLock,
  isSafeName,
  ensureExclude,
  resolveRoot,
  commonDirOf,
  createWorktree,
  defaultLinkStep,
};
