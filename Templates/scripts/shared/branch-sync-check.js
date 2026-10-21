#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.109.1
 * @description Check branch sync status with upstream. Detects behind, ahead,
 *   diverged, and no-upstream states, and reports the post-fetch upstream tip.
 *   On diverged, derives the analysis a person needs to pick a recovery path
 *   (fork point, each side's commits with issue refs and board status, the
 *   paths both sides touched, dirty paths the remote also changes, last pull)
 *   from read-only git (#3014). Non-blocking; used during session startup,
 *   /work Step 1c, /done Step 2 and /sync-branch.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

// Spawns bounded via lib/exec.js (#2469) — aliased to the original names
// so call sites are unchanged. execFileTimed is the shell-free form: anything
// derived from a ref name or read back from git config goes through it (#3042).
const { execTimed: execSync, execFileTimed } = require('./lib/exec.js');

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
 * Shell-free by necessity (#3042): git accepts `$`, `(`, `)`, `;`, `&`,
 * `|` and backticks in a ref name, and the remote and merge ref come back
 * from config unsanitized. This runs unattended at every session start, so
 * each value is passed to git as one argv element and no shell ever sees it.
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
    const remote = execFileTimed('git', ['config', `branch.${branch}.remote`], EXEC_OPTS).trim();
    const mergeRef = execFileTimed('git', ['config', `branch.${branch}.merge`], EXEC_OPTS).trim();
    if (!remote || !mergeRef) return false;

    // Scoped to the one ref. A bare `git fetch` pulls every branch on the remote.
    execFileTimed('git', ['fetch', '--quiet', remote, mergeRef], {
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
 * `range` names the incoming side. For `behind` the two-dot `HEAD..@{upstream}`
 * is exactly the incoming commits. For `diverged` (#3014) it is not: a two-tree
 * diff from a diverged tip also contains the local side's own edits as reverse
 * diffs, so every dirty file the local commits touched would read as
 * conflicting. The three-dot `HEAD...@{upstream}` is the remote side alone.
 *
 * @param {string} [range] - The incoming diff range
 * @returns {string[]} Paths that are both locally modified and changing upstream
 */
function detectConflictingPaths(range = 'HEAD..@{upstream}') {
  try {
    const dirty = parsePorcelainPaths(execSync('git status --porcelain', EXEC_OPTS));
    if (dirty.length === 0) return [];

    const incoming = new Set(splitLines(execSync(`git diff --name-only ${range}`, EXEC_OPTS)));

    return dirty.filter((p) => incoming.has(p));
  } catch {
    // An unknown intersection must not fail the check. Reporting no conflicts
    // is the safe direction: the offer proceeds, and a ff-only pull that would
    // clobber something aborts on its own with git's own error.
    return [];
  }
}

/** Non-empty, trimmed lines of a command's output. */
function splitLines(output) {
  return String(output || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

// ======================================
//  Divergence analysis (#3014)
// ======================================
//
// Everything below is read-only git. The hook renders these fields; it never
// re-derives them, and nothing here chooses a strategy — picking rebase over
// merge is /done Step 2's and /sync-branch's decision, taken when the user is
// looking at the change (#2518, #2668).

/**
 * Upper bound on board-status lookups per run (#3014).
 *
 * Each distinct referenced issue costs one `gh pmu view` spawn at session
 * start. A long divergence could otherwise walk the startup block into its
 * timeout ladder; five covers the common shape (one or two issues per side)
 * and the envelope says when the cap was hit, so the omission is visible.
 */
const MAX_ISSUE_LOOKUPS = 5;

/** Field separator in the `git log --format` records parsed below. */
const US = '\x1f';

/**
 * Every distinct `#N` in a commit subject, in order of first appearance.
 *
 * Deliberately not restricted to `Refs #N`: `Related to`, `Part of`, `Fixes`
 * and bare `#N` all name an issue the commit belongs to, and the consumer
 * wants to know which issues a side is about, not which keyword was used.
 *
 * @param {string} subject
 * @returns {number[]}
 */
function extractIssueRefs(subject) {
  const seen = new Set();
  for (const m of String(subject || '').matchAll(/#(\d+)\b/g)) {
    seen.add(parseInt(m[1], 10));
  }
  return [...seen];
}

/**
 * Parse `git log --format=%H%x1f%s%x1f%aI` output into commit records.
 *
 * @param {string} output
 * @returns {{ sha: string, subject: string, authorDate: string, issues: number[] }[]}
 */
function parseCommitLog(output) {
  return splitLines(output).map((line) => {
    const [sha = '', subject = '', authorDate = ''] = line.split(US);
    return { sha, subject, authorDate, issues: extractIssueRefs(subject) };
  }).filter((c) => c.sha);
}

/**
 * The most recent pull recorded in the reflog, or null.
 *
 * Input is `git reflog show HEAD --format=%gs%x1f%cI`: the reflog subject
 * (`pull --ff-only: Fast-forward`, `commit: …`, `rebase (finish): …`) and the
 * entry's date. A pull's subject begins with `pull`; the first such entry is
 * the latest, since the reflog is newest-first.
 *
 * @param {string} output
 * @returns {{ subject: string, date: string } | null}
 */
function parseLastPull(output) {
  for (const line of splitLines(output)) {
    const [subject = '', date = ''] = line.split(US);
    if (/^pull\b/.test(subject)) return { subject, date };
  }
  return null;
}

/**
 * Board status for each distinct issue the local commits reference, capped.
 *
 * `gh` may be absent, unauthenticated or offline at session start; a failed
 * lookup yields `status: null` for that issue and the analysis continues —
 * the number is still useful on its own. Lookups are read-only.
 *
 * @param {number[]} numbers - distinct issue numbers, in order
 * @returns {{ statuses: { number: number, status: string|null }[], truncated: boolean }}
 */
function lookupIssueStatuses(numbers) {
  const wanted = numbers.slice(0, MAX_ISSUE_LOOKUPS);
  const statuses = wanted.map((number) => {
    try {
      const raw = execSync(`gh pmu view ${number} --json=status --jq=.status`, EXEC_OPTS).trim();
      const status = raw.replace(/^"(.*)"$/, '$1');
      return { number, status: status || null };
    } catch {
      return { number, status: null };
    }
  });
  return { statuses, truncated: numbers.length > wanted.length };
}

/** Inert analysis fields, carried on every status so the envelope shape is stable. */
function emptyAnalysis() {
  return {
    forkPoint: null,
    localCommits: [],
    remoteCommits: [],
    overlappingPaths: [],
    lastPull: null,
    issueStatuses: [],
    issueStatusesTruncated: false,
  };
}

/**
 * Derive the divergence analysis from read-only git (#3014).
 *
 * Each step degrades independently: a failing `merge-base` leaves `forkPoint`
 * null while the commit lists still populate. The status is the load-bearing
 * answer and is never at risk here; the analysis is evidence beside it.
 *
 * @returns {ReturnType<typeof emptyAnalysis>}
 */
function analyzeDivergence() {
  const out = emptyAnalysis();

  try {
    const sha = execSync('git merge-base HEAD @{upstream}', EXEC_OPTS).trim();
    if (sha) {
      const subject = execSync(`git log -1 --format=%s ${sha}`, EXEC_OPTS).trim();
      out.forkPoint = { sha, subject };
    }
  } catch { /* forkPoint stays null */ }

  const FORMAT = '--format=%H%x1f%s%x1f%aI';
  try {
    out.localCommits = parseCommitLog(execSync(`git log @{upstream}..HEAD ${FORMAT}`, EXEC_OPTS));
  } catch { /* stays [] */ }
  try {
    out.remoteCommits = parseCommitLog(execSync(`git log HEAD..@{upstream} ${FORMAT}`, EXEC_OPTS));
  } catch { /* stays [] */ }

  try {
    const localSide = splitLines(execSync('git diff --name-only @{upstream}...HEAD', EXEC_OPTS));
    const remoteSide = new Set(splitLines(execSync('git diff --name-only HEAD...@{upstream}', EXEC_OPTS)));
    out.overlappingPaths = localSide.filter((p) => remoteSide.has(p));
  } catch { /* stays [] */ }

  try {
    out.lastPull = parseLastPull(execSync('git reflog show HEAD --format=%gs%x1f%cI', EXEC_OPTS));
  } catch { /* stays null */ }

  const numbers = [];
  for (const c of out.localCommits) {
    for (const n of c.issues) if (!numbers.includes(n)) numbers.push(n);
  }
  const { statuses, truncated } = lookupIssueStatuses(numbers);
  out.issueStatuses = statuses;
  out.issueStatusesTruncated = truncated;

  return out;
}

/**
 * Resolve the upstream tip after the fetch (#2635).
 *
 * /done Step 2 pins this before rebasing and pushing, and /work Step 1c
 * reports it. Resolved via `@{upstream}` rather than a hand-built
 * `remote/branch` name for the same reason fetchUpstream reads git config:
 * branch names contain slashes. Best-effort — the status is the load-bearing
 * answer, so a failure here yields null, never a thrown error.
 *
 * @returns {string|null} Full SHA of the upstream ref, or null
 */
function resolveUpstreamSha() {
  try {
    const sha = execSync('git rev-parse @{upstream}', EXEC_OPTS).trim();
    return sha || null;
  } catch {
    return null;
  }
}

/**
 * Detect the sync status of the current branch with its upstream.
 * @returns {{ branch: string, status: string, ahead: number, behind: number,
 *   fetched: boolean, conflictingPaths: string[], upstreamSha: string|null,
 *   forkPoint: {sha: string, subject: string}|null,
 *   localCommits: object[], remoteCommits: object[], overlappingPaths: string[],
 *   lastPull: {subject: string, date: string}|null,
 *   issueStatuses: {number: number, status: string|null}[],
 *   issueStatusesTruncated: boolean } | null}
 */
function detectBranchSync() {
  let branch;
  try {
    branch = execSync('git branch --show-current', EXEC_OPTS).trim();
  } catch {
    return null;
  }

  const fetched = fetchUpstream(branch);
  const base = { branch, fetched, conflictingPaths: [], upstreamSha: null, ...emptyAnalysis() };
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

  // The intersection costs two more spawns, so it is computed only where a
  // consumer acts on it: `behind` (the ff-only offer) and, since #3014,
  // `diverged` (the dirty-tree wrinkle a rebase trips over). The ranges differ
  // — see detectConflictingPaths. Every other state keeps the empty array, so
  // the envelope shape stays stable for consumers.
  let conflictingPaths = [];
  let analysis = {};
  if (parsed.status === 'behind') {
    conflictingPaths = detectConflictingPaths();
  } else if (parsed.status === 'diverged') {
    conflictingPaths = detectConflictingPaths('HEAD...@{upstream}');
    analysis = analyzeDivergence();
  }

  return { ...base, ...parsed, conflictingPaths, upstreamSha: resolveUpstreamSha(), ...analysis };
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
      message: buildMessage(result),
      data: { ...result, skipped: result.status === 'no-upstream' }
    }));
    process.exit(0);
  }

  console.log(JSON.stringify({
    success: true,
    message: buildMessage(result),
    data: result
  }));
}

/**
 * Build the human-readable envelope message for a sync result.
 *
 * A failed upstream fetch means the counts came from a cached
 * remote-tracking ref, so an unqualified "is up to date with upstream"
 * asserts a parity nothing confirmed — and that is the one status where
 * the consumers otherwise emit nothing at all, making a stale all-clear
 * indistinguishable from a verified one (#2687).
 *
 * `no-upstream` is left alone: fetchUpstream() returns false whenever no
 * remote or mergeRef is configured, so that status always carries
 * fetched:false and a caveat would report configuration as failure.
 *
 * @param {{ branch: string, status: string, fetched?: boolean }} result
 * @returns {string}
 */
function buildMessage(result) {
  if (result.status === 'no-upstream') {
    return `Branch '${result.branch}' has no upstream tracking branch.`;
  }
  if (result.status === 'up-to-date') {
    return result.fetched === false
      ? `Branch '${result.branch}' matches its cached remote-tracking ref, but the upstream fetch failed — parity is unverified and the branch may be behind.`
      : `Branch '${result.branch}' is up to date with upstream.`;
  }
  return `Branch '${result.branch}' is ${result.status} upstream.`;
}

module.exports = {
  parseSyncStatus,
  buildMessage,
  parsePorcelainPaths,
  fetchUpstream,
  detectConflictingPaths,
  resolveUpstreamSha,
  detectBranchSync,
  analyzeDivergence,
  parseCommitLog,
  extractIssueRefs,
  parseLastPull,
  lookupIssueStatuses,
  FETCH_TIMEOUT_MS,
  MAX_ISSUE_LOOKUPS
};
