#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.79.0
 * @description Check off acceptance criteria on review issues based on findings status. Exports checkOffACs(). Used by /review-prd and /review-test-plan for post-review AC updates with optional status transition.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * review-ac-checkoff.js
 *
 * Usage:
 *   node review-ac-checkoff.js --issue N --findings .tmp-N-findings.json [--move-status in_review]
 *
 * Output: JSON { ok, checkedOff, total, moved, error? }
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const { validateIssueNumber } = require('./lib/input-validation.js');
const { sanitizeShellArg } = require('./lib/shell-safe.js');

const EXEC_OPTS = { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] };

function parseArgs(argv) {
  const args = { issue: null, findingsFile: null, moveStatus: null };
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
    }
  }
  return args;
}

/**
 * Check off ACs on an issue based on findings pass/fail status.
 * @param {number} issue - Issue number
 * @param {Array} findings - Array of { status: 'pass'|'warn'|'fail'|'skip' } objects
 * @param {string|null} moveStatus - Optional status to move issue to after check-off
 * @returns {{ ok: boolean, checkedOff: number, total: number, moved: boolean, error?: string }}
 */
function checkOffACs(issue, findings, moveStatus) {
  let body;
  try {
    body = execFileSync('gh', ['pmu', 'view', String(issue), '--body-stdout'], EXEC_OPTS).trim();
  } catch (e) {
    return { ok: false, checkedOff: 0, total: 0, moved: false, error: `Failed to read issue body: ${e.message}` };
  }

  const lines = body.split('\n');
  let checkedOff = 0;
  let total = 0;
  let findingIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    if (/^- \[ \] /.test(lines[i])) {
      total++;
      if (findingIndex < findings.length && findings[findingIndex].status === 'pass') {
        lines[i] = lines[i].replace('- [ ] ', '- [x] ');
        checkedOff++;
      }
      findingIndex++;
    } else if (/^- \[x\] /.test(lines[i])) {
      total++;
      findingIndex++;
    }
  }

  const tmpFile = `.tmp-ac-checkoff-${issue}.md`;
  try {
    fs.writeFileSync(tmpFile, lines.join('\n'));
    execFileSync('gh', ['pmu', 'edit', String(issue), '-F', tmpFile], EXEC_OPTS);
  } catch (e) {
    try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }
    return { ok: false, checkedOff, total, moved: false, error: `Failed to update issue body: ${e.message}` };
  }
  try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }

  let moved = false;
  if (moveStatus) {
    try {
      execFileSync('gh', ['pmu', 'move', String(issue), '--status', moveStatus, '--force', '--yes'], EXEC_OPTS);
      moved = true;
    } catch (e) {
      return { ok: true, checkedOff, total, moved: false, error: `AC check-off succeeded but status move failed: ${e.message}` };
    }
  }

  return { ok: true, checkedOff, total, moved };
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
  try {
    const raw = JSON.parse(fs.readFileSync(args.findingsFile, 'utf8'));
    findings = [...(raw.findings.autoEvaluated || []), ...(raw.findings.userEvaluated || [])];
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: `Failed to parse findings: ${e.message}` }));
    process.exit(1);
  }

  const result = checkOffACs(args.issue, findings, args.moveStatus);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

module.exports = { checkOffACs };
