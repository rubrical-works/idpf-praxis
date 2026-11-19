#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.121.0
 * @description Post-review checklist updates for tracker-shaped reviews (prd/proposal/test-plan): checks the one lifecycle gate the review owns, by label, and applies an optional status transition. Any other review type is refused (#3059). Exports checkOffACs(), and checkLifecycleBoxIn()/checkLifecycleBox() (CLI --check-box) for the PRD tracker lifecycle boxes other commands own (#3636). Used by /review-prd, /review-test-plan, /done and /create-backlog.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * review-ac-checkoff.js
 *
 * Usage:
 *   node review-ac-checkoff.js --issue $ISSUE --findings .tmp-$ISSUE-findings.json [--move-status in_review] [--type prd]
 *
 * --type defaults to the findings JSON's own `type` field; pass it only to
 * override. Only prd/proposal/test-plan are served; positional check-off was
 * suppressed for them (#2594) and is removed for every type (#3059).
 *
 * Output: JSON { ok, checkedOff, total, moved, skipped, skipReason?, error? }
 */

'use strict';

// Spawns bounded via lib/exec.js (#2469) — aliased to the original names
// so call sites are unchanged.
const { execFileTimed: execFileSync } = require('./lib/exec.js');
const fs = require('fs');
const { validateIssueNumber, safePath } = require('./lib/input-validation.js');
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

// Every lifecycle box /create-prd writes on a PRD tracker, with the command
// that checks it (#3636). #2694 gave `PRD reviewed` its owner and said the
// other two were "left to the commands that close them"; none did, so they
// stayed unchecked for the life of every tracker. A box absent from this table
// is never written by checkLifecycleBoxIn(), which is what keeps the write
// from becoming a general-purpose checkbox setter.
const LIFECYCLE_BOXES = [
  { label: 'PRD reviewed', owner: '/review-prd Step 5 (checkOffACs, clean "Ready for" recommendation)' },
  { label: 'Test plan approved', owner: '/done, when the test plan approval issue moves to Done' },
  { label: 'Ready for backlog creation', owner: '/create-backlog Phase 7, in the banner body write' },
];

/**
 * Tick the marker on a line the scanner already resolved as an open checkbox.
 *
 * The one marker rewrite every write path shares (#3665). It works in whatever
 * spacing the scanner accepted (`-  [ ] `, `- [ ]Label`): a literal '- [ ] '
 * replace no-ops on those while the caller still reports the box checked. The
 * scanner proved the line is an open checkbox, so its first `[ ]` is the
 * marker — no second checkbox regex (checkbox-scan.js stays the only one).
 *
 * @param {string} line
 * @returns {string|null} the rewritten line, or null when there is no open marker
 */
function tickMarker(line) {
  const at = typeof line === 'string' ? line.indexOf('[ ]') : -1;
  if (at === -1) return null;
  return line.slice(0, at) + '[x]' + line.slice(at + 3);
}

/**
 * Check one lifecycle box in a body, by label and fence-aware (#3636).
 *
 * The same by-label discipline findLifecycleGateLine() uses: the box is found
 * by what it says, never by where it sits, and a quoted `- [ ]` inside a fence
 * is not a box. Pure — the caller owns the read and the write, so
 * /create-backlog can apply it to the body it is already composing.
 *
 * `reference`, when given, is the approval issue number: a box naming a
 * DIFFERENT `#N` belongs to another approval issue and is left alone. A box
 * naming no number (an unfilled `#{test_plan_issue}`) is still written.
 *
 * @param {string} body
 * @param {string} label - one of LIFECYCLE_BOXES' labels
 * @param {{reference?: number}} [opts]
 * @returns {{ body: string, checked: boolean, reason: 'checked'|'absent'|'already-checked'|'reference-mismatch'|'unknown-label' }}
 */
function checkLifecycleBoxIn(body, label, opts = {}) {
  const text = typeof body === 'string' ? body : '';
  if (!LIFECYCLE_BOXES.some((b) => b.label === label)) {
    return { body: text, checked: false, reason: 'unknown-label' };
  }
  const boxes = scanCheckboxes(text).filter((b) => b.text.startsWith(label));
  if (boxes.length === 0) return { body: text, checked: false, reason: 'absent' };
  const openBoxes = boxes.filter((b) => !b.checked);
  if (openBoxes.length === 0) return { body: text, checked: false, reason: 'already-checked' };
  // Filter by reference first, then pick (#3665): an earlier box naming another
  // #N must not hide a later one naming the requested reference.
  const hasRef = opts.reference !== undefined && opts.reference !== null;
  const qualifies = (b) => {
    if (!hasRef) return true;
    const named = [...b.text.matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
    return named.length === 0 || named.includes(Number(opts.reference));
  };
  const open = openBoxes.find(qualifies);
  if (!open) return { body: text, checked: false, reason: 'reference-mismatch' };
  const lines = text.split('\n');
  const ticked = tickMarker(lines[open.line]);
  if (ticked === null) return { body: text, checked: false, reason: 'absent' };
  lines[open.line] = ticked;
  return { body: lines.join('\n'), checked: true, reason: 'checked' };
}

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
      // Raw text (#3694): validated by the caller, never parseInt's prefix —
      // '12abc' was read as issue 12.
      args.issue = argv[i + 1];
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
 * Apply a tracker-shaped review's checklist update.
 *
 * Only tracker-shaped types (prd/proposal/test-plan) are served. The
 * positional pass was skipped for them (#2594) and is removed outright
 * (#3059); since #2694 the single lifecycle gate this review owns is checked
 * by label when `recommendation` starts with "Ready for". Gates owned by other
 * commands — "Ready for backlog creation", "Test plan approved" — are never
 * touched. Any requested status move still happens.
 *
 * @param {number} issue - Issue number
 * @param {Array} findings - Array of { status: 'pass'|'warn'|'fail'|'skip' } objects
 *   (kept for call-shape compatibility; no longer read)
 * @param {string|null} moveStatus - Optional status to move issue to after check-off
 * @param {string|null} [type] - Review type from the findings JSON. Anything but
 *   an exact tracker type returns ok:false with an error and touches nothing (#3059).
 * @param {string|null} [recommendation] - Review recommendation from the findings
 *   JSON. Omitted means no lifecycle-gate write, so callers predating #2694 do
 *   not begin writing gates by omission.
 * @returns {{ ok: boolean, checkedOff: number, total: number, moved: boolean, skipped: boolean, skipReason?: string, lifecycleGateChecked?: string|null, error?: string }}
 */
function checkOffACs(issue, findings, moveStatus, type, recommendation) {
  // #3059: only tracker-shaped types are served. The positional path that any
  // other type used to reach is removed — its only callers are /review-prd and
  // /review-test-plan, and a missing or miscased `type` fell through to it and
  // could tick "Ready for backlog creation" on a PRD tracker. Refused before
  // the body is read, so nothing is written and nothing moves.
  if (!isTrackerType(type)) {
    return {
      ok: false, checkedOff: 0, total: 0, moved: false, skipped: false,
      error: `Unrecognized review type ${JSON.stringify(type === undefined ? null : type)}: review-ac-checkoff serves only `
        + `${[...TRACKER_REVIEW_TYPES].join(', ')} (exact, lower-case). Nothing was checked off or moved.`,
    };
  }

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
  // Fence-aware count (#2600): a quoted `- [ ]` is not a checkbox. Reported as
  // `total`, the checklist this review declined to touch positionally.
  const total = scanCheckboxes(body).length;

  // Positional check-off is suppressed (#2594) and, since #3059, removed. What
  // #2694 added is that the ONE box this review owns may be written — by label,
  // not by position — when the recommendation is clean.
  const gateLine = findLifecycleGateLine(body, type, recommendation);
  // Only a line that really changed is written and reported (#3665).
  const ticked = gateLine !== -1 ? tickMarker(lines[gateLine]) : null;
  let lifecycleGateChecked = null;
  if (ticked !== null) {
    lines[gateLine] = ticked;
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

// ─── Approval-gate check-off for test plans (#2712) ───
//
// ADDITIVE to the #2594 suppression above, which is unchanged: checkOffACs()
// still returns skipped:true for test-plan and still checks off nothing
// positionally. This path resolves the SIX declared gates from #2710 by their
// text, generalizing the by-label discipline findLifecycleGateLine() uses for
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
    // Counted only when the line really changed (#3665): a count for an
    // unticked gate would make the caller write and report it.
    const ticked = tickMarker(lines[r.line]);
    if (ticked === null) continue;
    lines[r.line] = ticked;
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
 * Read an issue body, check one lifecycle box by label, write only on change
 * (#3636). Never throws: a failed read or write is `ok: false` with the error,
 * because both callers (/done, /create-backlog) report it and continue — the
 * box is bookkeeping, and closing the approval issue must not fail on it.
 *
 * @returns {{ ok: boolean, issue: number, label: string, checked: boolean, reason: string, error?: string }}
 */
function checkLifecycleBox(issue, label, { reference, io = defaultIo } = {}) {
  const base = { issue, label, checked: false };
  // A misspelled label is a caller error, not a no-op (#3665): refused before
  // the read, and ok:false so --issue exits 1 exactly as --body-file does.
  if (!LIFECYCLE_BOXES.some((b) => b.label === label)) {
    return { ...base, ok: false, reason: 'unknown-label', error: `Unknown lifecycle box label ${JSON.stringify(label)}` };
  }
  let body;
  try {
    body = io.readIssueBody(issue);
  } catch (e) {
    return { ...base, ok: false, reason: 'read-failed', error: `Failed to read #${issue}: ${e.message}` };
  }
  const out = checkLifecycleBoxIn(body, label, { reference });
  if (!out.checked) return { ...base, ok: out.reason !== 'unknown-label', reason: out.reason };
  const w = io.writeIssueBody(issue, out.body);
  if (!w || w.ok === false) {
    return { ...base, ok: false, reason: 'write-failed', error: (w && w.error) || 'issue write failed' };
  }
  return { ...base, ok: true, checked: true, reason: 'checked' };
}

/**
 * Check off resolvable, checkable gates on BOTH surfaces.
 *
 * Each surface is re-read immediately before its own write. This phase runs
 * directly after review-finalize.js, which has just rewritten the issue body —
 * composing a write from a snapshot taken before finalize would silently
 * revert the Reviews marker it wrote. The ordering IS the invariant, so it is
 * asserted as an ordering in the tests rather than merely described here.
 *
 * `only` (#3494) restricts the write to the named gate ids — the gates the
 * user confirmed plus any testPlanGateConfirmation wrote unasked — so a
 * declined prompt never writes a checkable gate it covered. Absent, every
 * checkable gate is written, as before.
 *
 * Never closes the issue. Closure stays with /done.
 */
function applyApprovalGateCheckOff({ issue, planPath, gateMap, rollup, io = defaultIo, only }) {
  const checkable = checkableIds(rollup);
  if (Array.isArray(only)) {
    for (const id of [...checkable]) if (!only.includes(id)) checkable.delete(id);
  }
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

/** The recorded response for a gate written unasked under the setting (#3494). */
const AUTO_CHECKED_RESPONSE = 'auto-checked (testPlanGateConfirmation: when-blocked)';

/**
 * The gates /review-test-plan Step 5a writes without a confirmation prompt
 * (#3494): under `when-blocked`, every gate that is checkable AND declares
 * autoCheckable: true. Any other mode returns none, so every checkable gate is
 * confirmed. An autoCheckable: false gate is never returned — it rests on a
 * reading of prose and always needs a human.
 *
 * @param {object} rollup - computeApprovalGates() output
 * @param {string} mode - resolveTestPlanGateConfirmation().mode
 * @returns {string[]} gate ids, in rollup order
 */
function autoWritableGateIds(rollup, mode) {
  if (mode !== 'when-blocked') return [];
  const gates = rollup && Array.isArray(rollup.gates) ? rollup.gates : [];
  return gates.filter((g) => g.checkable === true && g.autoCheckable === true).map((g) => g.id);
}

/**
 * Render the `## Approval Decisions` section for the approval issue BODY.
 *
 * In the body rather than only a comment, so /resolve-review and /done can read
 * it back — a comment is not part of the state those commands parse.
 */
function renderApprovalDecisions(gateMap, rollup, responses = {}, { autoChecked = [] } = {}) {
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
    // An automatic write names the setting and says it was not a user answer
    // (#3494), so it can never be read back as a human approval.
    if (autoChecked.includes(g.id)) {
      lines.push('- **Response:** ' + AUTO_CHECKED_RESPONSE);
      lines.push('- **Decided by:** the testPlanGateConfirmation setting, not a user answer');
    } else {
      const response = Object.prototype.hasOwnProperty.call(responses, g.id)
        ? responses[g.id]
        : '(not recorded)';
      lines.push('- **Response:** ' + response);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// CLI mode
if (require.main === module && process.argv.includes('--check-box')) {
  // Lifecycle-box mode (#3636):
  //   --check-box <label> --body-file F   rewrite F in place (create-backlog Phase 7)
  //   --check-box <label> --issue N [--reference M]   read/write the issue body
  const argv = process.argv;
  const val = (flag) => { const i = argv.indexOf(flag); return i !== -1 ? argv[i + 1] : undefined; };
  const label = val('--check-box');
  const bodyFile = val('--body-file');
  const issueArg = val('--issue');
  const refArg = val('--reference');
  // Validated, never parseInt'd: a malformed value became NaN and turned every
  // box naming a #N into a silent reference-mismatch (#3665).
  let reference;
  let refError = null;
  if (refArg !== undefined) {
    try {
      reference = validateIssueNumber(refArg);
    } catch (e) {
      refError = `--reference: ${e.message}`;
    }
  }
  let result;
  if (refError) {
    result = { ok: false, label, checked: false, reason: 'usage', error: refError };
  } else if (bodyFile) {
    // Contained to the working directory: the file is read AND written back.
    let target = null;
    try {
      target = safePath(process.cwd(), bodyFile);
    } catch (e) {
      result = { ok: false, label, checked: false, reason: 'unsafe-path', error: e.message };
    }
    if (target) {
      try {
        const out = checkLifecycleBoxIn(fs.readFileSync(target, 'utf8'), label, { reference });
        if (out.checked) fs.writeFileSync(target, out.body);
        result = { ok: out.reason !== 'unknown-label', label, checked: out.checked, reason: out.reason, bodyFile };
      } catch (e) {
        result = { ok: false, label, checked: false, reason: 'read-failed', error: e.message };
      }
    }
  } else if (issueArg) {
    // Caught (#3665): an uncaught throw printed a stack trace, and callers that
    // parse stdout as JSON got nothing parseable.
    let issue = null;
    try {
      issue = validateIssueNumber(issueArg);
    } catch (e) {
      result = { ok: false, label, checked: false, reason: 'usage', error: e.message };
    }
    if (issue !== null) result = checkLifecycleBox(issue, label, { reference });
  } else {
    result = { ok: false, label, checked: false, reason: 'usage', error: 'Usage: --check-box <label> (--body-file F | --issue N [--reference M])' };
  }
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
} else if (require.main === module) {
  const args = parseArgs(process.argv);
  if (!args.issue || !args.findingsFile) {
    console.error('Usage: node review-ac-checkoff.js --issue N --findings FILE [--move-status STATUS]');
    process.exit(1);
  }
  // Caught (#3694), as the --check-box branch is (#3665): callers parse
  // stdout as JSON, and an uncaught throw printed a stack trace.
  try {
    args.issue = validateIssueNumber(args.issue);
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: e.message }, null, 2));
    process.exit(1);
  }
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
  checkLifecycleBoxIn,
  checkLifecycleBox,
  LIFECYCLE_BOXES,
  resolveApprovalGates,
  applyApprovalGateCheckOff,
  renderApprovalDecisions,
  autoWritableGateIds,
  AUTO_CHECKED_RESPONSE,
  APPROVAL_HEADINGS,
};
