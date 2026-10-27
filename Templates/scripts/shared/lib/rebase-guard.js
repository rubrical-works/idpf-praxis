#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.112.0
 * @description The one rebase / fast-forward sequence /done Step 2, /work Step 1c
 *   and /sync-branch share (#3014). `rebaseOntoUpstream()` rebases onto @{u} and
 *   on conflict captures the unmerged paths, aborts and reports them;
 *   `fastForwardFromUpstream()` runs `git pull --ff-only` and reports git's
 *   refusal verbatim with no fallback. Every command it can issue is a member of
 *   a frozen list checked against the shared prohibitions: never --force, never
 *   stash, never merge, never checkout --. CLI: `--rebase` | `--ff-only`.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * WHY ONE HELPER. #2635 wrote the rebase guard inline in /done Step 2.3 and the
 * fast-forward offer inline in /work Step 1c; /sync-branch (#3014) needed both.
 * A sequence stated in three specs is three copies for one to drift, and the
 * prohibitions beside it (never force, never stash, never merge) are the kind
 * of sentence a later edit softens in one place and not the others. Here the
 * sequence is code, the prohibitions are a frozen list the commands are
 * checked against, and the specs reference the helper rather than restating it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It never asks: the consent gates — one
 * `AskUserQuestion` per operation — live in the command specs, which is where
 * the user is. It never pushes: `/done` Step 2.4 owns the push. It never
 * stashes, discards or reverts a dirty tree: a dirty tracked file the incoming
 * commits also change is reported by branch-sync-check.js as `conflictingPaths`
 * and the user decides what happens to it before either operation runs.
 *
 * Node built-ins only — deployed helpers may not require undeclared externals
 * (Reference/Deployment-Awareness.md § Runtime Dependency Contract).
 */

'use strict';

const { execTimed } = require('./exec.js');

const EXEC_OPTS = { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] };

/**
 * Every command this module can issue. Frozen, and checked against FORBIDDEN
 * by `tests/scripts/shared/lib/rebase-guard.test.js`, so adding a forced,
 * stashed or merged form fails CI at the definition rather than at a review.
 */
const COMMANDS = Object.freeze({
  rebase: 'git rebase @{u}',
  unmergedPaths: 'git diff --name-only --diff-filter=U',
  abort: 'git rebase --abort',
  fastForward: 'git pull --ff-only',
});

/**
 * The forms the three specs forbid, as substrings of a git command line.
 *
 * `--force` covers `--force-with-lease` and `-f` is not matched on purpose:
 * no command here takes `-f`, and matching a bare `-f` would also match
 * `--diff-filter`. `reset --hard` and `pull --rebase` are added because they
 * destroy or rewrite in the same way and a future caller could reach for them.
 */
const FORBIDDEN = Object.freeze(['--force', 'stash', 'merge', 'checkout --', 'reset --hard', 'pull --rebase']);

/** FORBIDDEN as one regex, for tests that scan recorded command lines. */
const FORBIDDEN_PATTERN = new RegExp(FORBIDDEN.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');

/**
 * Refuse a git command line carrying a forbidden form.
 * @param {string} cmd
 * @throws {Error} when the command matches FORBIDDEN
 */
function assertSafeCommand(cmd) {
  const hit = FORBIDDEN.find((f) => String(cmd).includes(f));
  if (hit) throw new Error(`forbidden git form "${hit}" in: ${cmd}`);
}

/** git's own words for a failed spawn, for verbatim reporting. */
function gitMessage(err) {
  const stderr = err && err.stderr ? String(err.stderr).trim() : '';
  const stdout = err && err.stdout ? String(err.stdout).trim() : '';
  return stderr || stdout || (err && err.message) || String(err);
}

function run(execFn, cmd) {
  assertSafeCommand(cmd);
  return execFn(cmd, EXEC_OPTS);
}

/**
 * Rebase the local commits onto the upstream; on conflict, abort and report.
 *
 * Rebase, not merge (#2635): the branch's per-AC `Refs #N` commits are what
 * scope-drift-check.js, log-changed-files.js and nonstop-audit.js key off, and
 * a merge commit adds an unattributed commit to that set.
 *
 * The abort ALWAYS follows a failed rebase, even when capturing the paths
 * failed: the contract is that the tree is left as the caller found it, with
 * the conflicting paths named when they could be read. A failing abort is
 * reported beside the conflict, never thrown — the caller STOPs either way and
 * needs both facts.
 *
 * @param {{ execFn?: Function }} [deps]
 * @returns {{ ok: boolean, action: 'rebased'|'aborted'|'abort-failed',
 *   conflictingPaths: string[], error: string|null, abortError: string|null }}
 */
function rebaseOntoUpstream({ execFn = execTimed } = {}) {
  try {
    run(execFn, COMMANDS.rebase);
    return { ok: true, action: 'rebased', conflictingPaths: [], error: null, abortError: null };
  } catch (err) {
    const error = gitMessage(err);
    let conflictingPaths = [];
    try {
      conflictingPaths = String(run(execFn, COMMANDS.unmergedPaths) || '')
        .split('\n').map((p) => p.trim()).filter(Boolean);
    } catch { /* paths unknown; the abort below still runs */ }
    try {
      run(execFn, COMMANDS.abort);
      return { ok: false, action: 'aborted', conflictingPaths, error, abortError: null };
    } catch (abortErr) {
      return { ok: false, action: 'abort-failed', conflictingPaths, error, abortError: gitMessage(abortErr) };
    }
  }
}

/**
 * Fast-forward from the upstream, or report why git refused.
 *
 * One command, no fallback: a refused fast-forward is git saying the branch
 * has local commits (diverged) or the tree would be overwritten, and both are
 * decisions for the user — the same rule the startup offer and /work Step 1c
 * state as "no retry, no non-fast-forward merge fallback".
 *
 * @param {{ execFn?: Function }} [deps]
 * @returns {{ ok: boolean, action: 'fast-forwarded'|'none', error: string|null }}
 */
function fastForwardFromUpstream({ execFn = execTimed } = {}) {
  try {
    run(execFn, COMMANDS.fastForward);
    return { ok: true, action: 'fast-forwarded', error: null };
  } catch (err) {
    return { ok: false, action: 'none', error: gitMessage(err) };
  }
}

// ======================================
//  CLI
// ======================================

const USAGE = 'Usage: node .claude/scripts/shared/lib/rebase-guard.js --rebase | --ff-only\n' +
  '  --rebase   git rebase @{u}; on conflict capture unmerged paths, abort, report (exit 1)\n' +
  '  --ff-only  git pull --ff-only; on refusal report git verbatim (exit 1)\n' +
  'Never forces, stashes, merges or checks out. Consent is the caller\'s.';

function main(argv) {
  const mode = argv[0];
  let result;
  if (mode === '--rebase') result = rebaseOntoUpstream();
  else if (mode === '--ff-only') result = fastForwardFromUpstream();
  else {
    process.stderr.write(USAGE + '\n');
    return 2;
  }
  const message = result.ok
    ? (mode === '--rebase' ? 'Rebased onto the upstream.' : 'Fast-forwarded from the upstream.')
    : (mode === '--rebase'
      ? `Rebase aborted; ${result.conflictingPaths.length} conflicting path(s). Tree left as found.`
      : 'Fast-forward refused; nothing changed.');
  process.stdout.write(JSON.stringify({ ok: result.ok, message, data: result }) + '\n');
  return result.ok ? 0 : 1;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = {
  COMMANDS,
  FORBIDDEN,
  FORBIDDEN_PATTERN,
  assertSafeCommand,
  rebaseOntoUpstream,
  fastForwardFromUpstream,
  main,
};
