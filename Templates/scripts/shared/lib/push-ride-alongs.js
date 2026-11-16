#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.119.0
 *
 * Which other issues' commits a `/done` push would carry (#3640).
 *
 * `/done` Step 2.4 is a bare `git push`: closing one issue publishes every
 * unpushed commit on the branch — other issues still In review, a peer
 * session's work, commits with no `Refs #N` at all. This helper groups
 * `@{u}..HEAD` by issue so `/done` can show the ride-alongs and ask before the
 * first Done move, while stopping still leaves every issue as it was.
 *
 * ANCHORING IS INHERITED. Candidates are proposed by a loose scan and each is
 * CONFIRMED through `issueRefGrepPattern()` (`git log --grep`), the shared
 * boundary rule that stops `#245` matching `#2453` (#2467, #2753) — the same
 * propose/confirm split as `announcement-issues.js`, never a third matcher.
 *
 * NEVER THROWS. No upstream is a reported outcome (`upstream: false`); a git
 * failure is `ok: false` with `error`. Either way `hasRideAlongs` is false, so
 * a caller that only reads that field falls back to today's behavior.
 *
 * Node built-ins and relative `shared/lib` requires only (runtime dependency
 * contract, `04-deployment-awareness.md`).
 *
 * CLI: node push-ride-alongs.js --issues 3640,3641 [--no-board]
 */

'use strict';

const { execFileSync } = require('child_process');
const { issueRefGrepPattern } = require('./issue-ref-match.js');

const KEYWORDS = ['Refs', 'Fixes', 'Closes'];
const TIMEOUT_MS = 10000;
const RANGE = '@{u}..HEAD';

function defaultRunGit(args, cwd) {
  return execFileSync('git', args, {
    cwd: cwd || process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: TIMEOUT_MS,
  });
}

function defaultRunGh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 });
}

const lines = (s) => String(s || '').split(/\r?\n/).filter(Boolean);
const toIssues = (list) => [...new Set((list || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];

/**
 * Group the unpushed commits by `Refs`/`Fixes`/`Closes #N`.
 *
 * @param {{ issues: number[], cwd?: string, runGit?: Function }} opts
 * @returns {{ ok: boolean, upstream: boolean, reason?: string, error?: string,
 *   named: Array<{issue, count, shas}>, others: Array<{issue, count, shas}>,
 *   unreferenced: Array<{sha, short, subject}>, hasRideAlongs: boolean }}
 *   Commits are oldest first. A commit naming several issues is in each group.
 */
function groupUnpushedCommits(opts = {}) {
  const runGit = typeof opts.runGit === 'function' ? opts.runGit : defaultRunGit;
  const issues = toIssues(opts.issues);
  const empty = { named: [], others: [], unreferenced: [], hasRideAlongs: false };

  // A git fault (not a repository, git missing, timeout) is not "no upstream".
  try {
    runGit(['rev-parse', '--git-dir'], opts.cwd);
  } catch (e) {
    return { ok: false, upstream: false, error: String((e && e.message) || e).split('\n')[0], ...empty };
  }
  try {
    runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], opts.cwd);
  } catch {
    return { ok: true, upstream: false, reason: 'no-upstream', ...empty };
  }

  let commits;
  const candidates = new Set(issues);
  const confirmed = new Map();
  try {
    const raw = runGit(['log', RANGE, '--reverse', '--no-merges', '--format=%H%x1f%s%x1f%B%x1e'], opts.cwd);
    commits = String(raw).split('\x1e').map((r) => r.trim()).filter(Boolean).map((r) => {
      const [sha, subject, body] = r.split('\x1f');
      return { sha: sha.trim(), subject, body: body || '' };
    });
    // PROPOSE: the scan decides nothing. Same case and spacing as the
    // confirm pattern, so a proposal the confirm step cannot match is never
    // made (`refs #200` is unreferenced, not a misgrouped ride-along).
    const scan = /\b(?:Refs|Fixes|Closes) #(\d+)/g;
    for (const c of commits) {
      let m;
      while ((m = scan.exec(c.body)) !== null) candidates.add(Number(m[1]));
    }
    // CONFIRM through the shared, boundary-anchored pattern.
    for (const n of candidates) {
      const pattern = issueRefGrepPattern(String(n), { keywords: KEYWORDS });
      confirmed.set(n, new Set(lines(runGit(['log', RANGE, '--format=%H', '--no-merges', `--grep=${pattern}`], opts.cwd))));
    }
  } catch (e) {
    return { ok: false, upstream: true, error: String((e && e.message) || e).split('\n')[0], ...empty };
  }

  const groupFor = (n) => {
    const hit = confirmed.get(n) || new Set();
    const shas = commits.filter((c) => hit.has(c.sha)).map((c) => c.sha);
    return { issue: n, count: shas.length, shas };
  };
  const named = issues.map(groupFor);
  const others = [...candidates].filter((n) => !issues.includes(n)).sort((a, b) => a - b)
    .map(groupFor).filter((g) => g.count > 0);
  const referenced = new Set([...confirmed.values()].flatMap((s) => [...s]));
  const unreferenced = commits.filter((c) => !referenced.has(c.sha))
    .map((c) => ({ sha: c.sha, short: c.sha.slice(0, 7), subject: c.subject }));

  return { ok: true, upstream: true, named, others, unreferenced, hasRideAlongs: others.length > 0 || unreferenced.length > 0 };
}

/**
 * Add each other issue's title and board status. Only `In review` is
 * completable — an issue in any other status is listed, never offered.
 *
 * @param {object} grouped `groupUnpushedCommits()` result
 * @param {{ runGh?: Function }} [deps]
 */
function describeRideAlongs(grouped, deps = {}) {
  const runGh = typeof deps.runGh === 'function' ? deps.runGh : defaultRunGh;
  const warnings = [];
  const others = (grouped.others || []).map((g) => {
    let title = null;
    let status = null;
    try {
      const v = JSON.parse(runGh(['pmu', 'view', String(g.issue), '--json=title,status']));
      title = v.title || null;
      status = v.status || null;
    } catch (e) {
      warnings.push(`#${g.issue}: title and status unreadable — ${String((e && e.message) || e).split('\n')[0]}`);
    }
    return { ...g, title, status, completable: isInReview(status) };
  });
  return { ...grouped, others, completable: others.filter((o) => o.completable).map((o) => o.issue), warnings };
}

/** Board status "In review", in any of the spellings done-preamble.js accepts. */
function isInReview(status) {
  return typeof status === 'string' && status.replace(/_/g, ' ').toLowerCase() === 'in review';
}

/**
 * CLI. `--issues` is required: without it every unpushed commit would read as
 * a ride-along. Returns the exit code; writes one JSON document to `out`.
 */
function main(argv, deps = {}) {
  const out = deps.out || process.stdout;
  const at = argv.indexOf('--issues');
  const issues = at >= 0 ? toIssues(String(argv[at + 1] || '').split(',')) : [];
  if (issues.length === 0) {
    out.write(`${JSON.stringify({ ok: false, error: '--issues <N,N,...> is required' })}\n`);
    return 1;
  }
  const grouped = groupUnpushedCommits({ issues, cwd: deps.cwd, runGit: deps.runGit });
  const result = argv.includes('--no-board') || !grouped.hasRideAlongs ? grouped : describeRideAlongs(grouped, deps);
  out.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { KEYWORDS, groupUnpushedCommits, describeRideAlongs, isInReview, main };
