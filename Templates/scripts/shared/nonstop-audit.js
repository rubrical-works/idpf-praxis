#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.92.0
 * @description Post-nonstop audit for /work epic/branch processing. Performs two audits:
 *   (1) Commit density — warning if commit count < (AC count / 3) across sub-issues
 *   (2) AC checkbox — blocking if any sub-issue has unchecked - [ ] boxes in its body
 * Audit (3) test coverage is intentionally NOT handled here — that remains skill-delegated
 * to tdd-refactor-coverage-audit per the spec (#2318 AC7).
 *
 * Usage: node nonstop-audit.js --issue <N>
 *
 * Output (JSON envelope on stdout):
 *   { ok, issueNumber, audits: { commitDensity: { status, commitCount, acCount, threshold, message },
 *                                  acCheckbox:    { status, unchecked: [{ subIssue, uncheckedCount }], message } },
 *     warnings: [string], blocks: [string] }
 *
 * Exit codes: 0 = ok or warnings only; 1 = blocking audit failed; 2 = bad args; 3 = query failed
 */

const { execSync } = require('child_process');

function parseArgs(argv) {
  const out = { issue: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--issue' && argv[i + 1]) out.issue = parseInt(argv[++i], 10);
  }
  if (!out.issue || Number.isNaN(out.issue)) {
    return { error: 'Missing or invalid --issue <number> argument.' };
  }
  return out;
}

function listSubIssues(parentIssue, execFn = execSync) {
  const raw = execFn(`gh pmu sub list ${parentIssue} --json`, { encoding: 'utf8' });
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  // #2361 — gh pmu sub list --json returns { issue, children: [...] }. Prior
  // code read parsed.items and silently dropped every sub-issue. Accept
  // children first; keep items as a backward-compat fallback.
  return parsed.children || parsed.items || [];
}

function fetchIssue(issueNumber, execFn = execSync) {
  const raw = execFn(`gh pmu view ${issueNumber} --json=body`, { encoding: 'utf8' });
  return JSON.parse(raw);
}

function countCommitsForIssue(issueNumber, execFn = execSync) {
  const raw = execFn(`git log --grep="Refs #${issueNumber}" --pretty=format:"x"`, { encoding: 'utf8' });
  if (!raw) return 0;
  return raw.split('\n').filter(Boolean).length;
}

function countUncheckedAcs(body) {
  if (!body) return 0;
  let count = 0;
  for (const line of body.split('\n')) {
    if (/^\s*- \[ \] /.test(line)) count++;
  }
  return count;
}

function countTotalAcs(body) {
  if (!body) return 0;
  let count = 0;
  for (const line of body.split('\n')) {
    if (/^\s*- \[[ xX]\] /.test(line)) count++;
  }
  return count;
}

function auditCommitDensity(totalCommits, totalAcs) {
  const threshold = Math.ceil(totalAcs / 3);
  if (totalAcs === 0) {
    return {
      status: 'skip', commitCount: totalCommits, acCount: 0, threshold: 0,
      message: 'No ACs found across sub-issues — commit density audit skipped.'
    };
  }
  const pass = totalCommits >= threshold;
  return {
    status: pass ? 'pass' : 'warn',
    commitCount: totalCommits,
    acCount: totalAcs,
    threshold,
    message: pass
      ? `Commit density OK (${totalCommits} commits for ${totalAcs} ACs, threshold ${threshold}).`
      : `Low commit density: ${totalCommits} commits for ${totalAcs} ACs (threshold ${threshold}). Warning only — does not block.`
  };
}

function auditAcCheckbox(subIssuesWithBodies) {
  const unchecked = [];
  for (const { number, body } of subIssuesWithBodies) {
    const n = countUncheckedAcs(body);
    if (n > 0) unchecked.push({ subIssue: number, uncheckedCount: n });
  }
  if (unchecked.length === 0) {
    return { status: 'pass', unchecked: [], message: 'All sub-issue ACs are checked.' };
  }
  return {
    status: 'fail',
    unchecked,
    message: `Unchecked ACs found in ${unchecked.length} sub-issue(s) — require Step 4 completion before moving the epic.`
  };
}

// #2361 AC2 — per-sub-issue commit-density audit. Each sub-issue is audited
// against its own AC count; aggregate totals are retained for backward
// compatibility with older callers.
function auditCommitDensityPerSubIssue(details, countFn) {
  const perSubIssue = [];
  for (const d of details) {
    const acs = countTotalAcs(d.body);
    if (acs === 0) continue;
    const commits = countFn(d.number);
    const threshold = Math.ceil(acs / 3);
    perSubIssue.push({
      subIssue: d.number,
      commits,
      acs,
      threshold,
      status: commits >= threshold ? 'pass' : 'warn'
    });
  }
  return perSubIssue;
}

function audit({ issueNumber, listFn, fetchFn, countFn }) {
  const subIssues = listFn(issueNumber);
  if (!subIssues.length) {
    return {
      ok: true,
      issueNumber,
      audits: {
        commitDensity: { status: 'skip', message: 'No sub-issues — audit skipped.' },
        acCheckbox: { status: 'skip', unchecked: [], message: 'No sub-issues — audit skipped.' }
      },
      warnings: [],
      blocks: []
    };
  }

  const details = subIssues.map(s => {
    const num = s.number || s.num;
    const full = fetchFn(num);
    return { number: num, body: full.body || '' };
  });

  const totalAcs = details.reduce((sum, d) => sum + countTotalAcs(d.body), 0);
  const totalCommits = details.reduce((sum, d) => sum + countFn(d.number), 0);

  const aggregate = auditCommitDensity(totalCommits, totalAcs);
  const perSubIssue = auditCommitDensityPerSubIssue(details, countFn);
  const anyWarn = perSubIssue.some(r => r.status === 'warn');
  const commitDensity = {
    ...aggregate,
    perSubIssue,
    status: aggregate.status === 'skip' ? 'skip' : (anyWarn ? 'warn' : 'pass')
  };

  const acCheckbox = auditAcCheckbox(details);

  const warnings = [];
  const blocks = [];
  for (const r of perSubIssue) {
    if (r.status === 'warn') {
      warnings.push(`#${r.subIssue}: Low commit density (${r.commits} commits for ${r.acs} ACs, threshold ${r.threshold}). Warning only — does not block.`);
    }
  }
  if (acCheckbox.status === 'fail') blocks.push(acCheckbox.message);

  return {
    ok: blocks.length === 0,
    issueNumber,
    audits: { commitDensity, acCheckbox },
    warnings,
    blocks
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    process.stderr.write(args.error + '\n');
    process.exit(2);
  }
  try {
    const result = audit({
      issueNumber: args.issue,
      listFn: (n) => listSubIssues(n),
      fetchFn: (n) => fetchIssue(n),
      countFn: (n) => countCommitsForIssue(n)
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
  } catch (e) {
    process.stderr.write(e.message + '\n');
    process.exit(3);
  }
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  countUncheckedAcs,
  countTotalAcs,
  auditCommitDensity,
  auditCommitDensityPerSubIssue,
  auditAcCheckbox,
  audit,
  fetchIssue,
  listSubIssues
};
