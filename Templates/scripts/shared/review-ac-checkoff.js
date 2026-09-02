#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.100.0
 * @description Check off acceptance criteria on review issues based on findings status, skipping tracker-shaped review types whose checklists are lifecycle gates. Exports checkOffACs(). Used by /review-prd and /review-test-plan for post-review AC updates with optional status transition.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * review-ac-checkoff.js
 *
 * Usage:
 *   node review-ac-checkoff.js --issue N --findings .tmp-N-findings.json [--move-status in_review] [--type prd]
 *
 * --type defaults to the findings JSON's own `type` field; pass it only to
 * override. prd/proposal/test-plan suppress positional check-off (#2594).
 *
 * Output: JSON { ok, checkedOff, total, moved, skipped, skipReason?, error? }
 */

'use strict';

// Spawns bounded via lib/exec.js (#2469) — aliased to the original names
// so call sites are unchanged.
const { execFileTimed: execFileSync } = require('./lib/exec.js');
const fs = require('fs');
const { validateIssueNumber } = require('./lib/input-validation.js');
const { sanitizeShellArg } = require('./lib/shell-safe.js');
const { REVIEW_TYPES } = require('./lib/review-format.js');
const { scanCheckboxes } = require('./lib/checkbox-scan.js');

const EXEC_OPTS = { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] };

// Review types whose checkbox list is a fixed lifecycle gate rather than the
// AC list being reviewed (#2594). Positional check-off is meaningless there:
// a PRD tracker carries 3 lifecycle boxes while a review carries ~20 criteria,
// so the Nth box and the Nth finding have nothing to do with one another.
//
// Derived from REVIEW_TYPES — the non-issue review types ARE the tracker-shaped
// ones — so adding a review type to that table cannot leave this set stale.
const TRACKER_REVIEW_TYPES = new Set(
  Object.values(REVIEW_TYPES).filter((t) => t !== 'issue')
);

function isTrackerType(type) {
  return typeof type === 'string' && TRACKER_REVIEW_TYPES.has(type);
}

// The lifecycle gate each tracker type's own review owns (#2694). #2594 said
// these gates were "left to the commands that own them" — `PRD reviewed` had
// no owner, so a clean /review-prd wrote the `reviewed` label and the Reviews
// marker while leaving the box unchecked, and the only path that ever wrote it
// was /create-backlog's BYPASS branch. Checked when review was skipped, blank
// when it was performed.
//
// Keyed by gate LABEL, never by position. That is the whole distinction from
// the positional check-off #2594 suppressed: a tracker's 3 boxes and a review's
// ~20 findings have no correspondence, so the box is found by what it says.
const LIFECYCLE_GATES = { prd: 'PRD reviewed' };

// The gate predicate is deliberately STRICTER than determineLabel()'s.
// determineLabel (review-finalize.js) tests startsWith('Ready'), which admits
// "Ready with minor revisions"; /review-prd Step 5 tests "Ready for", which
// does not. The two disagree on exactly that string. This write follows Step 5
// — the step that already governs check-off on this workflow — so a PRD with
// open minor revisions earns the `reviewed` label but NOT the gate that lets
// /create-backlog decompose it.
function isCleanRecommendation(recommendation) {
  return typeof recommendation === 'string' && recommendation.startsWith('Ready for');
}

/**
 * Find the unchecked lifecycle gate box for a tracker type, if it should be
 * written. Returns the line index, or -1 when nothing should be written.
 *
 * Returns -1 — meaning "no write" — for four distinct situations: the type has
 * no gate, the recommendation is not clean, the tracker has no such box, and
 * the box is already checked. Each is a legitimate no-op; none is an error.
 */
function findLifecycleGateLine(body, type, recommendation) {
  const gateLabel = LIFECYCLE_GATES[type];
  if (!gateLabel || !isCleanRecommendation(recommendation)) return -1;
  for (const box of scanCheckboxes(body)) {
    if (!box.checked && box.text.startsWith(gateLabel)) return box.line;
  }
  return -1;
}

function parseArgs(argv) {
  const args = { issue: null, findingsFile: null, moveStatus: null, type: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--issue' && argv[i + 1]) {
      args.issue = parseInt(argv[i + 1], 10);
      i++;
    } else if (argv[i] === '--findings' && argv[i + 1]) {
      args.findingsFile = argv[i + 1];
      i++;
    } else if (argv[i] === '--move-status' && argv[i + 1]) {
      args.moveStatus = argv[i + 1];
      i++;
    } else if (argv[i] === '--type' && argv[i + 1]) {
      // Explicit override; otherwise the type is read from the findings JSON.
      args.type = argv[i + 1];
      i++;
    }
  }
  return args;
}

/**
 * Write a body back to the issue through a temp file.
 *
 * Shared by the positional check-off path and the lifecycle-gate path so the
 * two cannot drift on temp-file naming or cleanup — both must unlink on the
 * failure path as well as the success path, which is the easy half to forget.
 *
 * @returns {{ ok: boolean, error?: string }}
 */
function writeBody(issue, lines) {
  const tmpFile = `.tmp-ac-checkoff-${issue}.md`;
  try {
    fs.writeFileSync(tmpFile, lines.join('\n'));
    execFileSync('gh', ['pmu', 'edit', String(issue), '-F', tmpFile], EXEC_OPTS);
  } catch (e) {
    try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }
    return { ok: false, error: `Failed to update issue body: ${e.message}` };
  }
  try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }
  return { ok: true };
}

/**
 * Move the issue to a status, if one was requested.
 * @returns {{ moved: boolean, error?: string }}
 */
function applyMoveStatus(issue, moveStatus) {
  if (!moveStatus) return { moved: false };
  try {
    execFileSync('gh', ['pmu', 'move', String(issue), '--status', moveStatus, '--force', '--yes'], EXEC_OPTS);
    return { moved: true };
  } catch (e) {
    return { moved: false, error: `status move failed: ${e.message}` };
  }
}

/**
 * Check off ACs on an issue based on findings pass/fail status.
 *
 * Positional check-off is applied only to issue-shaped review types. For
 * tracker-shaped types (prd/proposal/test-plan) the positional pass is skipped
 * (#2594) and, since #2694, the single lifecycle gate this review owns is
 * checked by label when `recommendation` starts with "Ready for". Gates owned
 * by other commands — "Ready for backlog creation", "Test plan approved" — are
 * never touched. Any requested status move still happens.
 *
 * @param {number} issue - Issue number
 * @param {Array} findings - Array of { status: 'pass'|'warn'|'fail'|'skip' } objects
 * @param {string|null} moveStatus - Optional status to move issue to after check-off
 * @param {string|null} [type] - Review type from the findings JSON. Omitted or
 *   unrecognized values fall open to check-off, preserving pre-#2594 behaviour.
 * @param {string|null} [recommendation] - Review recommendation from the findings
 *   JSON. Omitted means no lifecycle-gate write, so callers predating #2694 do
 *   not begin writing gates by omission.
 * @returns {{ ok: boolean, checkedOff: number, total: number, moved: boolean, skipped: boolean, skipReason?: string, lifecycleGateChecked?: string|null, error?: string }}
 */
function checkOffACs(issue, findings, moveStatus, type, recommendation) {
  let body;
  try {
    body = execFileSync('gh', ['pmu', 'view', String(issue), '--body-stdout'], EXEC_OPTS).trim();
  } catch (e) {
    return { ok: false, checkedOff: 0, total: 0, moved: false, skipped: false, error: `Failed to read issue body: ${e.message}` };
  }

  // Raw lines are kept for write-back fidelity (a CRLF body must round-trip
  // unchanged); the scanner reports which of them are real checkboxes. Both
  // split on the same newline count, so `box.line` indexes `lines` directly.
  const lines = body.split('\n');
  const skip = isTrackerType(type);
  let checkedOff = 0;
  let total = 0;
  let findingIndex = 0;

  // #2600: previously two inline regexes with no fence tracking. Check-off is
  // positional — findingIndex advances per matched line — so a single fenced
  // match early in a body shifted every later criterion onto the wrong
  // finding's verdict, and could rewrite quoted evidence to `- [x]`.
  for (const box of scanCheckboxes(body)) {
    total++;
    if (!box.checked && !skip && findingIndex < findings.length
        && findings[findingIndex].status === 'pass') {
      lines[box.line] = lines[box.line].replace('- [ ] ', '- [x] ');
      checkedOff++;
    }
    findingIndex++;
  }

  if (skip) {
    // Positional check-off stays suppressed (#2594). What changed in #2694 is
    // that the ONE box this review owns may now be written — by label, not by
    // position — when the recommendation is clean.
    const gateLine = findLifecycleGateLine(body, type, recommendation);
    let lifecycleGateChecked = null;
    if (gateLine !== -1) {
      lines[gateLine] = lines[gateLine].replace('- [ ] ', '- [x] ');
      const write = writeBody(issue, lines);
      if (!write.ok) {
        return { ok: false, checkedOff: 0, total, moved: false, skipped: true, lifecycleGateChecked: null, error: write.error };
      }
      lifecycleGateChecked = LIFECYCLE_GATES[type];
    }
    // Otherwise no write at all — not even a no-op edit, which would churn the
    // issue's updated-at and read as a review having touched the lifecycle gates.
    const { moved, error } = applyMoveStatus(issue, moveStatus);
    const skipReason = `Review type "${type}" is tracker-shaped; its checklist is a lifecycle gate, not the reviewed AC list. Check-off skipped.`;
    return error
      ? { ok: true, checkedOff: 0, total, moved, skipped: true, skipReason, lifecycleGateChecked, error: `AC check-off skipped but ${error}` }
      : { ok: true, checkedOff: 0, total, moved, skipped: true, skipReason, lifecycleGateChecked };
  }

  const write = writeBody(issue, lines);
  if (!write.ok) {
    return { ok: false, checkedOff, total, moved: false, skipped: false, error: write.error };
  }

  const { moved, error } = applyMoveStatus(issue, moveStatus);
  if (error) {
    return { ok: true, checkedOff, total, moved: false, skipped: false, error: `AC check-off succeeded but ${error}` };
  }

  return { ok: true, checkedOff, total, moved, skipped: false };
}

// ─── Approval-gate check-off for test plans (#2712) ───
//
// ADDITIVE to the #2594 suppression above, which is unchanged: checkOffACs()
// still returns skipped:true for test-plan and still checks off nothing
// positionally. This path resolves the SIX declared gates from #2710 by their
// text, generalising the by-label discipline findLifecycleGateLine() uses for
// the single prd gate.
//
// By text, never by index. A template's fixed checklist and a review's findings
// have no positional correspondence — the reason #2594 suppressed the
// positional pass in the first place — so a gate that cannot be found by what
// it SAYS is reported unresolvable and left alone. Checking the wrong box is
// strictly worse than checking none.

const APPROVAL_HEADINGS = { issue: '## Review Checklist', plan: '## Approval Checklist' };

/** Line range of the checklist under `heading`, or the whole body when absent. */
function headingBounds(body, heading) {
  if (!heading) return { start: -1, end: Number.MAX_SAFE_INTEGER };
  const lines = body.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start === -1) return { start: -1, end: Number.MAX_SAFE_INTEGER };
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}

/**
 * Resolve each declared gate to its checkbox line, by declared text.
 *
 * @returns {{resolved: Array<{id,line,alreadyChecked}>, unresolvable: Array<{id,text,reason}>}}
 */
function resolveApprovalGates(body, gateMap, heading) {
  const declared = gateMap && Array.isArray(gateMap.gates) ? gateMap.gates : [];
  const { start, end } = headingBounds(body, heading);
  const boxes = [...scanCheckboxes(body)].filter((b) => b.line > start && b.line < end);

  const resolved = [];
  const unresolvable = [];
  for (const g of declared) {
    if (typeof g.text !== 'string' || g.text.length === 0) {
      unresolvable.push({ id: g.id, text: '', reason: 'Gate ' + g.id + ' declares no text to match.' });
      continue;
    }
    const match = boxes.find((b) => b.text === g.text || b.text.startsWith(g.text));
    if (match) {
      resolved.push({ id: g.id, line: match.line, alreadyChecked: match.checked });
    } else {
      unresolvable.push({
        id: g.id,
        text: g.text,
        reason:
          'No checklist line under ' + (heading || 'the body') + ' matches gate ' + g.id +
          '; left unchecked rather than resolved by position.',
      });
    }
  }
  return { resolved, unresolvable };
}

/** Gate ids the rollup reports checkable. */
function checkableIds(rollup) {
  const gates = rollup && Array.isArray(rollup.gates) ? rollup.gates : [];
  return new Set(gates.filter((g) => g.checkable === true).map((g) => g.id));
}

function checkOffIn(body, gateMap, heading, checkable) {
  const { resolved, unresolvable } = resolveApprovalGates(body, gateMap, heading);
  const lines = body.split('\n');
  let checked = 0;
  for (const r of resolved) {
    if (r.alreadyChecked || !checkable.has(r.id)) continue;
    lines[r.line] = lines[r.line].replace('- [ ] ', '- [x] ');
    checked++;
  }
  return { text: lines.join('\n'), checked, resolved, unresolvable };
}

const defaultIo = {
  readIssueBody: (issue) =>
    execFileSync('gh', ['pmu', 'view', String(issue), '--body-stdout'], EXEC_OPTS).trim(),
  writeIssueBody: (issue, text) => writeBody(issue, text.split('\n')),
  readPlan: (planPath) => fs.readFileSync(planPath, 'utf8'),
  writePlan: (planPath, text) => {
    fs.writeFileSync(planPath, text);
    return { ok: true };
  },
};

/**
 * Check off resolvable, checkable gates on BOTH surfaces.
 *
 * Each surface is re-read immediately before its own write. This phase runs
 * directly after review-finalize.js, which has just rewritten the issue body —
 * composing a write from a snapshot taken before finalize would silently
 * revert the Reviews marker it wrote. The ordering IS the invariant, so it is
 * asserted as an ordering in the tests rather than merely described here.
 *
 * Never closes the issue. Closure stays with /done.
 */
function applyApprovalGateCheckOff({ issue, planPath, gateMap, rollup, io = defaultIo }) {
  const checkable = checkableIds(rollup);
  const out = { ok: true, issueChecked: 0, planChecked: 0, unresolvable: [] };

  const issueBody = io.readIssueBody(issue);
  const issueResult = checkOffIn(issueBody, gateMap, APPROVAL_HEADINGS.issue, checkable);
  if (issueResult.checked > 0) {
    const w = io.writeIssueBody(issue, issueResult.text);
    if (!w || w.ok === false) {
      return { ...out, ok: false, error: (w && w.error) || 'issue write failed' };
    }
  }
  out.issueChecked = issueResult.checked;
  out.unresolvable.push(...issueResult.unresolvable.map((u) => ({ ...u, surface: 'issue' })));

  if (planPath) {
    const planBody = io.readPlan(planPath);
    const planResult = checkOffIn(planBody, gateMap, APPROVAL_HEADINGS.plan, checkable);
    if (planResult.checked > 0) {
      const w = io.writePlan(planPath, planResult.text);
      if (!w || w.ok === false) {
        return { ...out, ok: false, error: (w && w.error) || 'plan write failed' };
      }
    }
    out.planChecked = planResult.checked;
    out.unresolvable.push(...planResult.unresolvable.map((u) => ({ ...u, surface: 'plan' })));
  }

  return out;
}

/**
 * Render the `## Approval Decisions` section for the approval issue BODY.
 *
 * In the body rather than only a comment, so /resolve-review and /done can read
 * it back — a comment is not part of the state those commands parse.
 */
function renderApprovalDecisions(gateMap, rollup, responses = {}) {
  const declared = gateMap && Array.isArray(gateMap.gates) ? gateMap.gates : [];
  const byId = new Map(
    (rollup && Array.isArray(rollup.gates) ? rollup.gates : []).map((g) => [g.id, g])
  );

  const lines = ['## Approval Decisions', ''];
  for (const g of declared) {
    const r = byId.get(g.id);
    let status = 'not computed';
    if (r) {
      if (r.checkable) status = 'auto-checkable';
      else if (r.risk && r.risk.kind === 'unresolvable') status = 'unresolvable';
      else status = 'blocked';
    }
    lines.push('### ' + g.text);
    lines.push('');
    lines.push('- **Gate:** `' + g.id + '`');
    lines.push('- **Computed status:** ' + status);
    const verdicts =
      r && Array.isArray(r.criteria) && r.criteria.length > 0
        ? r.criteria
            .map((c) => c.id + ' — ' + c.status + (c.evidence ? ': ' + c.evidence : ''))
            .join('; ')
        : 'none recorded';
    lines.push('- **Backing criteria:** ' + verdicts);
    if (r && Array.isArray(r.missing) && r.missing.length > 0) {
      lines.push('- **Missing findings:** ' + r.missing.join(', '));
    }
    // Verbatim: the reviewer's own words are the record, and paraphrasing a
    // risk acceptance is how an accepted risk becomes an approved gate.
    const response = Object.prototype.hasOwnProperty.call(responses, g.id)
      ? responses[g.id]
      : '(not recorded)';
    lines.push('- **Response:** ' + response);
    lines.push('');
  }
  return lines.join('\n');
}

// CLI mode
if (require.main === module) {
  const args = parseArgs(process.argv);
  if (!args.issue || !args.findingsFile) {
    console.error('Usage: node review-ac-checkoff.js --issue N --findings FILE [--move-status STATUS]');
    process.exit(1);
  }
  validateIssueNumber(args.issue);
  if (args.moveStatus) args.moveStatus = sanitizeShellArg(args.moveStatus, 'status');

  let findings;
  let type = args.type;
  let recommendation = null;
  try {
    const raw = JSON.parse(fs.readFileSync(args.findingsFile, 'utf8'));
    findings = [...(raw.findings.autoEvaluated || []), ...(raw.findings.userEvaluated || [])];
    // --type wins if given; otherwise the findings JSON declares its own type.
    if (!type) type = raw.type || null;
    // The same JSON already carries the recommendation review-finalize reads.
    recommendation = raw.recommendation || null;
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: `Failed to parse findings: ${e.message}` }));
    process.exit(1);
  }

  const result = checkOffACs(args.issue, findings, args.moveStatus, type, recommendation);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

module.exports = {
  checkOffACs,
  resolveApprovalGates,
  applyApprovalGateCheckOff,
  renderApprovalDecisions,
  APPROVAL_HEADINGS,
};
