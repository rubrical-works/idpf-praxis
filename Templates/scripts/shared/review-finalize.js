#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.62.0
 * review-finalize.js
 *
 * Consolidates all review cleanup work into a single script call:
 * update body metadata (Reviews count), format and post review comment,
 * assign label (reviewed/pending), propagate labels for epics.
 *
 * Usage:
 *   node review-finalize.js 42 -F .tmp-42-findings.json
 */

const { exec: execCb } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(execCb);
const EXEC_OPTS = { encoding: 'utf-8' };

// ─── Shared Constants ───

const { EMOJI, SECTION_HEADERS, formatFindingLine } = require('./lib/review-format');

const TYPE_LABELS = {
  bug: 'Bug',
  enhancement: 'Enhancement',
  story: 'Story',
  epic: 'Epic',
  generic: 'Generic',
};

// ─── Argument Parsing ───

function parseArgs(args) {
  let issue = null;
  let findingsFile = null;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '-F') {
      findingsFile = args[i + 1] || null;
      i += 2;
    } else {
      const cleaned = arg.replace(/^#/, '');
      const num = parseInt(cleaned, 10);
      if (!isNaN(num) && num > 0 && String(num) === cleaned) {
        issue = num;
      }
      i += 1;
    }
  }

  if (issue === null) {
    return { error: { code: 'MISSING_ARGUMENT', message: 'No issue number provided. Usage: node review-finalize.js <issue> -F <findings.json>' } };
  }
  if (!findingsFile) {
    return { error: { code: 'MISSING_FINDINGS_FILE', message: 'No findings file specified. Use -F <path>.' } };
  }

  return { issue, findingsFile };
}

// ─── Findings File Parsing ───

function parseFindingsFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { error: { code: 'FILE_NOT_FOUND', message: `Findings file not found: ${filePath}` } };
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return { data };
  } catch (e) {
    return { error: { code: 'INVALID_JSON', message: `Failed to parse findings file: ${e.message}` } };
  }
}

// ─── Body Metadata Update ───

function updateBodyReviewCount(body) {
  if (!body) return '**Reviews:** 1\n';

  const match = body.match(/\*\*Reviews:\*\*\s*(\d+)/);
  if (match) {
    const current = parseInt(match[1], 10);
    return body.replace(/\*\*Reviews:\*\*\s*\d+/, `**Reviews:** ${current + 1}`);
  }

  // Append Reviews field at end
  return body.trimEnd() + '\n**Reviews:** 1\n';
}

// ─── Comment Formatting ───

function formatReviewComment(findings) {
  const date = new Date().toISOString().slice(0, 10);
  const typeLabel = TYPE_LABELS[findings.type] || findings.type || 'Generic';
  const extensions = findings.extensions && findings.extensions.length > 0
    ? findings.extensions.join(', ')
    : 'None';

  const lines = [];
  lines.push(`## Issue Review #${findings.reviewNumber} — ${date}`);
  lines.push('');
  lines.push(`**Issue:** #${findings.issue} — ${findings.title}`);
  lines.push(`**Type:** ${typeLabel}`);
  lines.push(`**Total Reviews:** ${findings.reviewNumber}`);
  lines.push(`**Extensions Applied:** ${extensions}`);
  lines.push('');
  lines.push(SECTION_HEADERS.findings);
  lines.push('');

  // Auto-Evaluated
  lines.push(SECTION_HEADERS.autoEvaluated);
  const autoFindings = (findings.findings && findings.findings.autoEvaluated) || [];
  if (autoFindings.length === 0) {
    lines.push('- (none)');
  } else {
    for (const f of autoFindings) {
      const emoji = EMOJI[f.status] || EMOJI.skip;
      lines.push(`- ${emoji} ${f.criterion} — ${f.evidence}`);
    }
  }
  lines.push('');

  // User-Evaluated
  lines.push(SECTION_HEADERS.userEvaluated);
  const userFindings = (findings.findings && findings.findings.userEvaluated) || [];
  if (userFindings.length === 0) {
    lines.push('- (none)');
  } else {
    for (const f of userFindings) {
      const emoji = EMOJI[f.status] || EMOJI.skip;
      lines.push(`- ${emoji} ${f.criterion} — ${f.evidence}`);
    }
  }
  lines.push('');

  // Recommendation
  lines.push(SECTION_HEADERS.recommendation);
  lines.push(`**${findings.recommendation}** — ${findings.recommendationReason || ''}`);

  return lines.join('\n');
}

// ─── Label Determination ───

function determineLabel(recommendation) {
  if (!recommendation) return 'pending';
  return recommendation.startsWith('Ready') ? 'reviewed' : 'pending';
}

// ─── Envelope Builders ───

function buildSuccessResult(data) {
  return {
    ok: true,
    bodyUpdated: data.bodyUpdated,
    commentPosted: data.commentPosted,
    commentUrl: data.commentUrl || null,
    labelAssigned: data.labelAssigned,
    epicSubIssuesLabeled: data.epicSubIssuesLabeled || 0,
  };
}

function buildErrorResult(error) {
  return {
    ok: false,
    error,
  };
}

// ─── Execution Helpers ───

async function execSafe(cmd) {
  try {
    const { stdout } = await execAsync(cmd, EXEC_OPTS);
    return { ok: true, output: stdout.trim() };
  } catch (e) {
    return { ok: false, message: e.stderr ? e.stderr.toString().trim() : e.message };
  }
}

// ─── Main ───

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    const result = buildErrorResult(args.error);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(1);
  }

  const { issue, findingsFile } = args;

  // Parse findings
  const findingsResult = parseFindingsFile(findingsFile);
  if (findingsResult.error) {
    const result = buildErrorResult(findingsResult.error);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(1);
  }
  const findings = findingsResult.data;

  // Update body review count
  let bodyUpdated = false;
  const bodyExport = await execSafe(`gh pmu view ${issue} --body-stdout`);
  if (bodyExport.ok) {
    const updatedBody = updateBodyReviewCount(bodyExport.output);
    const tmpBodyFile = `.tmp-${issue}-body.md`;
    fs.writeFileSync(tmpBodyFile, updatedBody);
    const editResult = await execSafe(`gh pmu edit ${issue} -F ${tmpBodyFile}`);
    bodyUpdated = editResult.ok;
    try { fs.unlinkSync(tmpBodyFile); } catch (_e) { /* ignore */ }
  }

  // Format and post comment
  let commentPosted = false;
  let commentUrl = null;
  const comment = formatReviewComment(findings);
  const tmpCommentFile = `.tmp-${issue}-review-comment.md`;
  fs.writeFileSync(tmpCommentFile, comment);
  const commentResult = await execSafe(`gh issue comment ${issue} -F ${tmpCommentFile}`);
  if (commentResult.ok) {
    commentPosted = true;
    // Try to extract URL from output
    const urlMatch = commentResult.output.match(/(https:\/\/\S+)/);
    if (urlMatch) commentUrl = urlMatch[1];
  }
  try { fs.unlinkSync(tmpCommentFile); } catch (_e) { /* ignore */ }

  // Assign label
  const label = determineLabel(findings.recommendation);
  let labelAssigned = null;
  if (label === 'reviewed') {
    const labelResult = await execSafe(
      `gh issue edit ${issue} --add-label=reviewed --remove-label=pending`
    );
    if (labelResult.ok) labelAssigned = 'reviewed';
  } else {
    const labelResult = await execSafe(
      `gh issue edit ${issue} --add-label=pending --remove-label=reviewed`
    );
    if (labelResult.ok) labelAssigned = 'pending';
  }

  // Epic sub-issue label propagation
  let epicSubIssuesLabeled = 0;
  if (findings.type === 'epic' && label) {
    const subListResult = await execSafe(`gh pmu sub list ${issue} --json`);
    if (subListResult.ok) {
      try {
        const subData = JSON.parse(subListResult.output);
        const subIssues = subData.children || subData.subIssues || [];
        for (const sub of subIssues) {
          const subNum = sub.number || sub;
          if (label === 'reviewed') {
            await execSafe(`gh issue edit ${subNum} --add-label=reviewed --remove-label=pending`);
          } else {
            await execSafe(`gh issue edit ${subNum} --add-label=pending --remove-label=reviewed`);
          }
          epicSubIssuesLabeled++;
        }
      } catch (_e) {
        // Non-blocking
      }
    }
  }

  // Clean up findings file
  try { fs.unlinkSync(findingsFile); } catch (_e) { /* ignore */ }

  const result = buildSuccessResult({
    bodyUpdated,
    commentPosted,
    commentUrl,
    labelAssigned,
    epicSubIssuesLabeled,
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

// ─── Module Guard ───

if (require.main === module) {
  main().catch(err => {
    const result = buildErrorResult({
      code: 'UNEXPECTED',
      message: err.message,
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  parseFindingsFile,
  updateBodyReviewCount,
  formatReviewComment,
  determineLabel,
  buildSuccessResult,
  buildErrorResult,
  EMOJI,
  SECTION_HEADERS,
};
