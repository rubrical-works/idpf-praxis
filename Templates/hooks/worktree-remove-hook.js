#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.114.0
 * worktree-remove-hook.js — WorktreeRemove hook (#3187)
 *
 * The counterpart of worktree-create-hook.js. Once a project installs a
 * WorktreeCreate hook, Claude Code hands removal to the project: at session
 * exit and on ExitWorktree it runs this hook with `worktree_path` on stdin,
 * and with NO WorktreeRemove hook it falls back to a git removal of the path
 * "as `git worktree remove --force` would". In a Praxis Hub Manager project
 * that worktree holds the hub links worktree-links.js recreated, and a git
 * removal deletes THROUGH them — the #3124 incident, emptying the hub for
 * every project on the machine. Installing this hook replaces that fallback.
 *
 * Contract, per the WorktreeRemove docs: exit 0 means the worktree counts as
 * removed (nothing else is read, so the directory must really be gone); a
 * non-zero exit fails the removal while the directory exists, with no git
 * fallback. Everything this hook says goes to stderr.
 *
 * What it does, in order — the order IS the safety argument:
 *   1. Refuse any path that is not a `.tmp-wt-*` directory DIRECTLY under the
 *      project root (CLAUDE_PROJECT_DIR, as the create hook resolves it).
 *      Nothing is touched for a refused path.
 *   2. A framework path that no longer exists counts as removed: exit 0.
 *   3. worktree-teardown.js: unlink every link, verify each hub target,
 *      confirm none remain, then `git worktree remove` WITHOUT `--force`.
 *      Kept (dirty), halted (a link would not unlink) or refused → exit 2,
 *      worktree left in place and named. Exit 1 is only the unexpected (a
 *      thrown error, unparseable input), so the heartbeat counts it alone.
 *   4. Delete `wt/<name>` with `git branch -d`, which git refuses for an
 *      unmerged branch — so commits are never lost here. A refused delete is
 *      reported as kept; the directory is gone, so the exit is still 0.
 *
 * Subagent and workflow-agent worktrees never reach this hook: Claude Code
 * keeps them and does not run WorktreeRemove. The startup hook names those
 * leftovers with the teardown command instead.
 *
 * Node built-ins and relative requires only (deployed hooks resolve from the
 * hub, #2418). Every spawn is bounded (#2469).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveRoot, WORKTREE_PREFIX, BRANCH_PREFIX } = require('./worktree-create-hook.js');

/** Bound on each git call (#2469). */
const GIT_TIMEOUT_MS = 60_000;

/**
 * Exit codes (#3190). Both non-zero codes fail the removal, as the contract
 * requires while the directory exists; they differ only in what they say about
 * the hook. 2 is the hook doing its job — refused, kept or halted — and the
 * heartbeat counts it as healthy; 1 is reserved for the unexpected.
 */
const EXIT_REMOVED = 0;
const EXIT_NOT_REMOVED = 2;
const EXIT_UNEXPECTED = 1;

function defaultExec(argv, { cwd }) {
  const r = spawnSync('git', argv, { cwd, encoding: 'utf8', timeout: GIT_TIMEOUT_MS });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error || null };
}

/** Real path in its long form (an 8.3 short name never compares equal otherwise, #3150), or null. */
function realOrNull(p) {
  try { return fs.realpathSync.native(p); } catch { return null; }
}

/**
 * Whether a path names a framework worktree position: a `.tmp-wt-*` directory
 * whose parent is the project root itself. Lexical on the last segment, real
 * on the parent, so it answers for a path that no longer exists.
 *
 * @param {{root: string, worktreePath: *}} input
 * @returns {{ok: boolean, reason: string|null, lexical: string|null}}
 */
function isFrameworkWorktreePath({ root, worktreePath }) {
  if (typeof worktreePath !== 'string' || worktreePath.trim() === '') {
    return { ok: false, reason: `refused worktree_path ${JSON.stringify(worktreePath)} — not a path`, lexical: null };
  }
  const lexical = path.resolve(root, worktreePath);
  const base = path.basename(lexical);
  if (!base.startsWith(WORKTREE_PREFIX) || base.length === WORKTREE_PREFIX.length) {
    return { ok: false, reason: `refused ${worktreePath} — not a framework worktree (expected ${WORKTREE_PREFIX}<name>)`, lexical };
  }
  const realRoot = realOrNull(root);
  const realParent = realOrNull(path.dirname(lexical));
  if (!realRoot || !realParent || realParent !== realRoot) {
    return { ok: false, reason: `refused ${worktreePath} — not directly under the project root ${root}`, lexical };
  }
  return { ok: true, reason: null, lexical };
}

/**
 * Remove one worktree. Pure of process state: reports rather than printing
 * or exiting, so the decision is asserted in-process and the CLI only relays.
 *
 * @param {{worktreePath: *, cwd?: string, env?: object, execFn?: Function, unlinkFn?: Function}} opts
 * @returns {{ok: boolean, exitCode: number, status: string, root: string|null, branch: string|null,
 *   branchDeleted: boolean, teardown: object|null, commands: string[][], stderr: string[]}}
 *   `status` is `refused`, `absent`, or the teardown status (`removed`, `kept`, `halted`).
 */
function removeWorktree(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const env = opts.env || process.env;
  const execFn = typeof opts.execFn === 'function' ? opts.execFn : defaultExec;
  const out = {
    ok: false, exitCode: EXIT_UNEXPECTED, status: null, root: null, branch: null, branchDeleted: false,
    teardown: null, commands: [], stderr: [],
  };
  const say = (line) => out.stderr.push(`worktree-remove: ${line}`);
  const refuse = (reason) => {
    out.status = 'refused';
    out.exitCode = EXIT_NOT_REMOVED;
    say(`${reason}; nothing was removed`);
    return out;
  };

  try {
    const rootInfo = resolveRoot({ cwd, env });
    if (!rootInfo.ok) return refuse(`refused — cannot resolve the project root: ${rootInfo.error}`);
    out.root = rootInfo.root;

    const target = isFrameworkWorktreePath({ root: rootInfo.root, worktreePath: opts.worktreePath });
    if (!target.ok) return refuse(target.reason);

    if (!fs.existsSync(target.lexical)) {
      out.ok = true;
      out.exitCode = EXIT_REMOVED;
      out.status = 'absent';
      say(`${target.lexical} does not exist — counts as removed`);
      return out;
    }

    const { teardownWorktree } = require('../scripts/shared/lib/worktree-teardown.js');
    const td = teardownWorktree({
      root: rootInfo.root,
      worktreePath: target.lexical,
      execFn,
      ...(typeof opts.unlinkFn === 'function' ? { unlinkFn: opts.unlinkFn } : {}),
    });
    out.teardown = td;
    out.commands.push(...td.commands);
    out.status = td.status;
    out.branch = td.branch;

    if (td.status !== 'removed') {
      out.exitCode = EXIT_NOT_REMOVED;
      say(`${td.status}: ${td.reason}`);
      return out;
    }
    say(`removed ${target.lexical} (${td.unlinked.length} link(s) unlinked, hub targets verified)`);

    if (td.branch && td.branch.startsWith(BRANCH_PREFIX)) {
      const argv = ['branch', '-d', td.branch];
      out.commands.push(argv);
      const del = execFn(argv, { cwd: rootInfo.root });
      if (!del.error && del.status === 0) {
        out.branchDeleted = true;
        say(`deleted branch ${td.branch}`);
      } else {
        say(`branch ${td.branch} kept — git refused -d (unmerged commits?): ${(del.error ? del.error.message : del.stderr).trim()}`);
      }
    }

    if (fs.existsSync(target.lexical)) {
      out.status = 'kept';
      out.exitCode = EXIT_NOT_REMOVED;
      say(`${target.lexical} still exists after git worktree remove`);
      return out;
    }
    out.ok = true;
    out.exitCode = EXIT_REMOVED;
    return out;
  } catch (err) {
    out.exitCode = EXIT_UNEXPECTED;
    say(`unexpected failure: ${err.message}`);
    return out;
  }
}

// Heartbeat (#2917): only when run as the hook, never for the test process.
// okCodes [0, EXIT_NOT_REMOVED] (#3190): a refused, kept or halted removal is
// the hook doing its job, not a hook failure — the #2997 pattern.
let heartbeat = { fail() {}, setCwd() {} };
if (require.main === module) {
  try {
    heartbeat = require('../scripts/shared/lib/hook-heartbeat.js')
      .installHeartbeat('worktree-remove-hook', { okCodes: [EXIT_REMOVED, EXIT_NOT_REMOVED] });
  } catch (_) { /* reported by the load check */ }
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  let data;
  try {
    data = JSON.parse(input);
  } catch (err) {
    process.stderr.write(`worktree-remove: hook input is not JSON: ${err.message}\n`);
    process.exitCode = EXIT_UNEXPECTED;
    return;
  }
  if (data && typeof data === 'object') heartbeat.setCwd(data.cwd);

  const worktreePath = data && typeof data === 'object' ? data.worktree_path : undefined;
  const result = removeWorktree({ worktreePath, cwd: process.cwd(), env: process.env });
  for (const line of result.stderr) process.stderr.write(`${line}\n`);
  process.exitCode = result.exitCode;
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`worktree-remove: ${err.message}\n`);
    heartbeat.fail(err);
    process.exitCode = 1;
  });
}

module.exports = {
  isFrameworkWorktreePath,
  removeWorktree,
};
