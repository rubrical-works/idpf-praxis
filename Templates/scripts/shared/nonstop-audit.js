#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.106.0
 * @description Post-nonstop audit for /work epic/branch processing. Performs three audits:
 *   (1) Commit density — warning if commit count < (AC count / 3) across sub-issues
 *   (2) AC checkbox — blocking if any sub-issue has unchecked - [ ] boxes in its body
 *   (4) Announcement pairing — warning if a sub-issue has a work-completed with no
 *       work-started recorded, or an announcement composed but never dispatched (#2790)
 * Audit (3) test coverage is intentionally NOT handled here — that remains skill-delegated
 * to tdd-refactor-coverage-audit per the spec (#2318 AC7). The gap in the numbering is
 * deliberate: (3) is an established reference in the Step 6a spec, so the new audit takes
 * the next number rather than renumbering it.
 *
 * Usage: node nonstop-audit.js --issue <N>
 *
 * Output (JSON envelope on stdout):
 *   { ok, issueNumber, audits: { commitDensity:       { status, commitCount, acCount, threshold, message },
 *                                acCheckbox:          { status, unchecked: [{ subIssue, uncheckedCount }], message },
 *                                announcementPairing: { status, missingOpener, missingCloser, unrecorded,
 *                                                       undispatched, skipped, caveats, message } },
 *     warnings: [string], blocks: [string] }
 *
 * Only (2) can populate `blocks`. (1) and (4) are advisory — (4) audits a channel that
 * gates nothing, and an audit stricter than the thing it audits is a gate by the back door.
 *
 * Exit codes: 0 = ok or warnings only; 1 = blocking audit failed; 2 = bad args; 3 = query failed
 */

const { execSync } = require('child_process');
const { issueRefGrepPattern } = require('./lib/issue-ref-match.js');
const { scanCheckboxes } = require('./lib/checkbox-scan.js');
const { readLedger, reconcile: reconcileLedger } = require('./lib/announce-ledger.js');

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
  // Boundary-anchored (#2467): an unbounded grep inflated per-sub-issue commit
  // counts with unrelated issues' commits, masking genuine low-commit-density
  // warnings — the audit reported healthy numbers it had not earned.
  const raw = execFn(`git log --grep="${issueRefGrepPattern(issueNumber)}" --pretty=format:"x"`, { encoding: 'utf8' });
  if (!raw) return 0;
  return raw.split('\n').filter(Boolean).length;
}

// Phase tokens permitted in the "→ GATE: <phase>" annotation (#2508).
//
// Mirrors `phaseFeasibility.gatePhases` in
// `.claude/metadata/ac-feasibility-prompts.json`. Pinned here rather than read
// at runtime: this helper is symlinked into user projects and resolves from its
// real path, so a relative read of `.claude/metadata/` is not dependable there.
// `tests/scripts/shared/nonstop-audit.test.js` asserts the two lists match, so
// drift fails CI rather than silently narrowing the exemption.
//
// Every token added here widens the Step 4b force-move exemption. Keep it short.
const GATE_PHASES = ['review', 'release'];

const GATE_ANNOTATION = new RegExp(`→\\s*GATE:\\s*(?:${GATE_PHASES.join('|')})\\b`, 'i');

// An unchecked box that is open *by design* rather than unfinished. Two
// annotations qualify, and the shared discipline is narrowness: each matches a
// specific, structured marker, so no unfinished AC can be relabeled past the
// gate by rewording it.
//
//   → QA: #N          (#2477 / #2472) — closure deferred to a QA sub-issue
//   → GATE: <phase>   (#2508)         — condition resolves after in_review
//
// Adding a third requires the same treatment: a structured marker with a closed
// token set, not a free-text convention.
function isIntentionallyOpenGate(line) {
  return /→\s*QA:\s*#\d+/.test(line) || GATE_ANNOTATION.test(line);
}

// #2600: both counts read through the shared fence-aware scanner. This audit
// returns status "fail" and BLOCKS the epic in_review move, so a fenced
// checkbox did not merely miscount here — it halted an epic on a quotation.
// The gate annotation lives in the criterion text, so testing box.text is
// equivalent to testing the whole line.
function countUncheckedAcs(body) {
  if (!body) return 0;
  return scanCheckboxes(body)
    .filter((box) => !box.checked && !isIntentionallyOpenGate(box.text))
    .length;
}

function countTotalAcs(body) {
  if (!body) return 0;
  return scanCheckboxes(body).length;
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

/**
 * Audit (3) — announcement pairing (#2790).
 *
 * WHAT IT ANSWERS, and what it deliberately does not. Symptom 1 of #2790 was a
 * `work-completed` for sub-issue #1165 with no matching `work-started`, among
 * twelve sub-issues of one `--nonstop` run. Nothing reported it on either side.
 * #2674 makes the receiving side structurally unable to say which of three
 * things happened — never composed, composed and the send failed, or delivered
 * and dropped — because all three arrive as the same silence.
 *
 * The SENDER can separate the first two, and this audit is where that surfaces.
 * It reads the local ledger, not the network, and claims nothing about
 * delivery.
 *
 * ADVISORY, never blocking. The channel it audits gates nothing by design; an
 * audit that halted an epic over a missing announcement would make an advisory
 * channel a gate — the property every other line in this subsystem protects.
 * So it joins `commitDensity` in `warnings`, never `blocks`.
 *
 * `skip` is a first-class outcome, not a degraded `pass`. A project with
 * messaging disabled records nothing, and reporting twelve dropped openers
 * there would get the whole audit ignored — which costs more than the gap it
 * reports. No ledger file at all means the question was never asked.
 */
function auditAnnouncementPairing(subIssueNumbers, ledgerFn, reconcileFn) {
  if (typeof ledgerFn !== 'function') {
    return { status: 'skip', message: 'Announcement pairing not audited — no ledger reader supplied.' };
  }

  let read;
  try {
    read = ledgerFn();
  } catch (err) {
    // The other two audits must still render. A ledger that cannot be read is
    // this audit failing, not the epic failing.
    return {
      status: 'skip',
      message: `Announcement pairing not audited — the ledger could not be read (${err && err.message ? err.message : 'unknown'}).`,
    };
  }

  if (!read || read.exists === false) {
    return {
      status: 'skip',
      message: 'Announcement pairing not audited — no announcement ledger in this working directory '
        + '(peer messaging may be disabled, or this run predates the ledger).',
    };
  }

  const result = reconcileFn({ entries: read.entries, issues: subIssueNumbers });
  return {
    status: result.ok ? 'pass' : 'warn',
    missingOpener: result.missingOpener,
    missingCloser: result.missingCloser,
    unrecorded: result.unrecorded,
    undispatched: result.undispatched,
    // #2990: shouldSend:false compositions, recorded `skipped` at composition
    // time. Never a warning; reported so an all-skipped run reads clean.
    skipped: result.skipped || [],
    caveats: result.caveats,
    message: result.message,
  };
}

function audit({ issueNumber, listFn, fetchFn, countFn, ledgerFn, reconcileFn }) {
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
  const announcementPairing = auditAnnouncementPairing(
    details.map((d) => d.number),
    ledgerFn,
    reconcileFn || reconcileLedger
  );

  const warnings = [];
  const blocks = [];
  for (const r of perSubIssue) {
    if (r.status === 'warn') {
      warnings.push(`#${r.subIssue}: Low commit density (${r.commits} commits for ${r.acs} ACs, threshold ${r.threshold}). Warning only — does not block.`);
    }
  }
  if (announcementPairing.status === 'warn') {
    warnings.push(announcementPairing.message);
    for (const c of announcementPairing.caveats || []) warnings.push(c);
  }
  if (acCheckbox.status === 'fail') blocks.push(acCheckbox.message);

  return {
    ok: blocks.length === 0,
    issueNumber,
    audits: { commitDensity, acCheckbox, announcementPairing },
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
      countFn: (n) => countCommitsForIssue(n),
      ledgerFn: () => readLedger({ cwd: process.cwd() })
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
  GATE_PHASES,
  parseArgs,
  countUncheckedAcs,
  countTotalAcs,
  auditCommitDensity,
  auditCommitDensityPerSubIssue,
  auditAcCheckbox,
  auditAnnouncementPairing,
  audit,
  fetchIssue,
  listSubIssues
};
