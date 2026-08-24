#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.97.0
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
 * tracker-shaped types (prd/proposal/test-plan) the body is left untouched and
 * the lifecycle gates are left to the commands that own them — /create-backlog
 * owns "Ready for backlog creation" (#2594). Any requested status move still
 * happens; only the check-off is skipped.
 *
 * @param {number} issue - Issue number
 * @param {Array} findings - Array of { status: 'pass'|'warn'|'fail'|'skip' } objects
 * @param {string|null} moveStatus - Optional status to move issue to after check-off
 * @param {string|null} [type] - Review type from the findings JSON. Omitted or
 *   unrecognized values fall open to check-off, preserving pre-#2594 behaviour.
 * @returns {{ ok: boolean, checkedOff: number, total: number, moved: boolean, skipped: boolean, skipReason?: string, error?: string }}
 */
function checkOffACs(issue, findings, moveStatus, type) {
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
    // No write at all — not even a no-op edit, which would churn the issue's
    // updated-at and read as a review having touched the lifecycle gates.
    const { moved, error } = applyMoveStatus(issue, moveStatus);
    const skipReason = `Review type "${type}" is tracker-shaped; its checklist is a lifecycle gate, not the reviewed AC list. Check-off skipped.`;
    return error
      ? { ok: true, checkedOff: 0, total, moved, skipped: true, skipReason, error: `AC check-off skipped but ${error}` }
      : { ok: true, checkedOff: 0, total, moved, skipped: true, skipReason };
  }

  const tmpFile = `.tmp-ac-checkoff-${issue}.md`;
  try {
    fs.writeFileSync(tmpFile, lines.join('\n'));
    execFileSync('gh', ['pmu', 'edit', String(issue), '-F', tmpFile], EXEC_OPTS);
  } catch (e) {
    try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }
    return { ok: false, checkedOff, total, moved: false, skipped: false, error: `Failed to update issue body: ${e.message}` };
  }
  try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }

  const { moved, error } = applyMoveStatus(issue, moveStatus);
  if (error) {
    return { ok: true, checkedOff, total, moved: false, skipped: false, error: `AC check-off succeeded but ${error}` };
  }

  return { ok: true, checkedOff, total, moved, skipped: false };
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
  try {
    const raw = JSON.parse(fs.readFileSync(args.findingsFile, 'utf8'));
    findings = [...(raw.findings.autoEvaluated || []), ...(raw.findings.userEvaluated || [])];
    // --type wins if given; otherwise the findings JSON declares its own type.
    if (!type) type = raw.type || null;
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: `Failed to parse findings: ${e.message}` }));
    process.exit(1);
  }

  const result = checkOffACs(args.issue, findings, args.moveStatus, type);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

module.exports = { checkOffACs };
