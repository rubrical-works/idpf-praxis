#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.95.0
 * @description Check branch sync status with upstream. Detects behind, ahead,
 *   diverged, and no-upstream states. Non-blocking; used during session startup.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

// Spawns bounded via lib/exec.js (#2469) — aliased to the original names
// so call sites are unchanged.
const { execTimed: execSync } = require('./lib/exec.js');

const EXEC_OPTS = { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] };

/**
 * Upper bound on the upstream fetch (#2518).
 *
 * This script runs as a subprocess spawned by startup-hook.js, so it cannot
 * reach that file's private safeExec wrapper — there is no ambient timeout to
 * inherit. The only fallback would be the hook's 60s SIGKILL ladder, which is
 * the wrong outcome twice over: it stalls startup for a full minute, and it
 * marks the whole check as timed-out, discarding the cached-ref answer that
 * was available from the start. 10s keeps a slow network well inside the
 * ladder's first 15s warning stage.
 */
const FETCH_TIMEOUT_MS = 10000;

/**
 * Fetch the current branch's upstream ref so `behind` is measured against the
 * remote rather than the last-fetched ref (#2518).
 *
 * Best-effort by design: any failure — offline, auth rejected, timeout, no
 * configured upstream — returns false and leaves the caller to measure against
 * the cached ref. A failed fetch degrades accuracy, never availability.
 *
 * @param {string} branch - Current branch name
 * @returns {boolean} true if the fetch ran successfully
 */
function fetchUpstream(branch) {
  if (!branch) return false;

  try {
    // Read remote and merge ref from config rather than splitting the upstream
    // name: branch names contain slashes, so 'origin/idpf/0.94.0' cannot be
    // decomposed into remote and ref by string manipulation.
    const remote = execSync(`git config branch.${branch}.remote`, EXEC_OPTS).trim();
    const mergeRef = execSync(`git config branch.${branch}.merge`, EXEC_OPTS).trim();
    if (!remote || !mergeRef) return false;

    // Scoped to the one ref. A bare `git fetch` pulls every branch on the remote.
    execSync(`git fetch --quiet ${remote} ${mergeRef}`, {
      ...EXEC_OPTS,
      timeout: FETCH_TIMEOUT_MS,
      // A credential prompt would block until the timeout fires; refusing the
      // prompt turns that into an immediate, catchable failure.
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse the output of `git rev-list --left-right --count HEAD...@{upstream}`.
 * @param {string|null} output - Tab-separated "ahead\tbehind" string
 * @returns {{ status: string, ahead: number, behind: number } | null}
 */
function parseSyncStatus(output) {
  if (!output) return null;

  const trimmed = String(output).trim();
  const match = trimmed.match(/^\s*(\d+)\s+(\d+)\s*$/);
  if (!match) return null;

  const ahead = parseInt(match[1], 10);
  const behind = parseInt(match[2], 10);

  let status;
  if (ahead === 0 && behind === 0) {
    status = 'up-to-date';
  } else if (ahead > 0 && behind > 0) {
    status = 'diverged';
  } else if (behind > 0) {
    status = 'behind';
  } else {
    status = 'ahead';
  }

  return { status, ahead, behind };
}

/**
 * Extract file paths from `git status --porcelain` output.
 *
 * Each line is `XY path`, or `XY orig -> dest` for a rename. Paths containing
 * special characters are C-quoted by git.
 *
 * @param {string} output - Raw porcelain output
 * @returns {string[]} Modified paths (rename destinations, not origins)
 */
function parsePorcelainPaths(output) {
  if (!output) return [];

  return String(output)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const rest = line.slice(3); // strip the two status columns and separator
      const arrow = rest.indexOf(' -> ');
      // A rename conflicts on where it lands, not where it came from.
      const target = arrow === -1 ? rest : rest.slice(arrow + 4);
      return target.replace(/^"(.*)"$/, '$1');
    })
    .filter(Boolean);
}

/**
 * Find modified paths that also change in the incoming diff (#2518).
 *
 * Dirtiness alone does not block a fast-forward — only dirty paths that the
 * incoming commits also touch do. Keying the offer on dirtiness instead of on
 * this intersection would refuse a safe update whenever any unrelated file is
 * modified, which is the common case.
 *
 * @returns {string[]} Paths that are both locally modified and changing upstream
 */
function detectConflictingPaths() {
  try {
    const dirty = parsePorcelainPaths(execSync('git status --porcelain', EXEC_OPTS));
    if (dirty.length === 0) return [];

    const incoming = new Set(
      execSync('git diff --name-only HEAD..@{upstream}', EXEC_OPTS)
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean)
    );

    return dirty.filter((p) => incoming.has(p));
  } catch {
    // An unknown intersection must not fail the check. Reporting no conflicts
    // is the safe direction: the offer proceeds, and a ff-only pull that would
    // clobber something aborts on its own with git's own error.
    return [];
  }
}

/**
 * Detect the sync status of the current branch with its upstream.
 * @returns {{ branch: string, status: string, ahead: number, behind: number,
 *   fetched: boolean, conflictingPaths: string[] } | null}
 */
function detectBranchSync() {
  let branch;
  try {
    branch = execSync('git branch --show-current', EXEC_OPTS).trim();
  } catch {
    return null;
  }

  const fetched = fetchUpstream(branch);
  const base = { branch, fetched, conflictingPaths: [] };
  const noUpstream = { ...base, status: 'no-upstream', ahead: 0, behind: 0 };

  let parsed;
  try {
    parsed = parseSyncStatus(
      execSync('git rev-list --left-right --count HEAD...@{upstream}', EXEC_OPTS)
    );
  } catch {
    return noUpstream;
  }
  if (!parsed) return noUpstream;

  // Only `behind` can produce an offer, and the intersection costs two more
  // spawns — so it is computed for that state alone. Every other state keeps
  // the empty array, so the envelope shape stays stable for consumers.
  const conflictingPaths = parsed.status === 'behind' ? detectConflictingPaths() : [];

  return { ...base, ...parsed, conflictingPaths };
}

// ======================================
//  Main Entry Point
// ======================================

if (require.main === module) {
  const result = detectBranchSync();

  if (!result) {
    console.log(JSON.stringify({
      success: false,
      message: 'Could not determine branch sync status.',
      data: { skipped: true }
    }));
    process.exit(0);
  }

  if (result.status === 'up-to-date' || result.status === 'no-upstream') {
    console.log(JSON.stringify({
      success: true,
      message: result.status === 'up-to-date'
        ? `Branch '${result.branch}' is up to date with upstream.`
        : `Branch '${result.branch}' has no upstream tracking branch.`,
      data: { ...result, skipped: result.status === 'no-upstream' }
    }));
    process.exit(0);
  }

  console.log(JSON.stringify({
    success: true,
    message: `Branch '${result.branch}' is ${result.status} upstream.`,
    data: result
  }));
}

module.exports = {
  parseSyncStatus,
  parsePorcelainPaths,
  fetchUpstream,
  detectConflictingPaths,
  detectBranchSync,
  FETCH_TIMEOUT_MS
};
