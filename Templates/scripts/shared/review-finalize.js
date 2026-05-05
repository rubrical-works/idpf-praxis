#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.91.0
 * @description Consolidate all review cleanup into a single script call. Updates issue body metadata (review count, reviewed-by), formats and posts the review comment with findings, assigns labels (reviewed/changes-requested), and propagates review labels to parent epics.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const { exec: execCb } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');

const execAsync = promisify(execCb);
const EXEC_OPTS = { encoding: 'utf-8' };

// ─── Shared Constants ───

const { EMOJI, SECTION_HEADERS } = require('./lib/review-format');

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

// ─── Findings Normalization (#1828) ───

/**
 * Normalize alternate field names to the canonical schema before validation.
 * Accepts common aliases the AI may produce when the schema isn't explicit.
 * Mutates and returns the same object.
 */
function normalizeFindings(data) {
  if (!data || typeof data !== 'object') return data;

  // Top-level field aliases (from findings-schema.json alternateFields)
  const alternates = findingsSchema.alternateFields || {};
  for (const [alt, canonical] of Object.entries(alternates)) {
    if (data[alt] !== undefined && data[canonical] === undefined) {
      data[canonical] = data[alt];
      delete data[alt];
    }
  }

  // criteria → findings structure transformation
  if (data.criteria && !data.findings) {
    const autoEvaluated = [];
    const userEvaluated = [];

    // criteria.common: keyed object → autoEvaluated array
    if (data.criteria.common && typeof data.criteria.common === 'object') {
      for (const [id, entry] of Object.entries(data.criteria.common)) {
        autoEvaluated.push({
          id,
          criterion: entry.name || entry.criterion || id,
          status: entry.status || entry.result || 'skip',
          evidence: entry.evidence || '',
        });
      }
    }

    // criteria.typeSpecific: keyed object → autoEvaluated array (appended)
    if (data.criteria.typeSpecific && typeof data.criteria.typeSpecific === 'object') {
      for (const [id, entry] of Object.entries(data.criteria.typeSpecific)) {
        autoEvaluated.push({
          id,
          criterion: entry.name || entry.criterion || id,
          status: entry.status || entry.result || 'skip',
          evidence: entry.evidence || '',
        });
      }
    }

    // criteria.extensions: keyed object → userEvaluated or autoEvaluated
    if (data.criteria.extensions && typeof data.criteria.extensions === 'object') {
      for (const [id, entry] of Object.entries(data.criteria.extensions)) {
        autoEvaluated.push({
          id,
          criterion: entry.name || entry.criterion || id,
          status: entry.status || entry.result || 'skip',
          evidence: entry.evidence || '',
        });
      }
    }

    data.findings = { autoEvaluated, userEvaluated };
    delete data.criteria;
  }

  // Normalize finding entry field aliases (from findings-schema.json alternateFields)
  if (data.findings && typeof data.findings === 'object') {
    for (const key of ['autoEvaluated', 'userEvaluated']) {
      const arr = data.findings[key];
      if (Array.isArray(arr)) {
        for (const entry of arr) {
          for (const [alt, canonical] of Object.entries(alternates)) {
            if (entry[alt] !== undefined && entry[canonical] === undefined) {
              entry[canonical] = entry[alt];
              delete entry[alt];
            }
          }
        }
      }
    }
  }

  // Normalize recommendation shorthand values (#1958)
  if (typeof data.recommendation === 'string') {
    const RECOMMENDATION_ALIASES = {
      'ready': 'Ready for work',
      'minor': 'Needs minor revision',
      'revision': 'Needs revision',
      'rework': 'Needs major rework',
    };
    const lower = data.recommendation.toLowerCase().trim();
    if (RECOMMENDATION_ALIASES[lower]) {
      data.recommendation = RECOMMENDATION_ALIASES[lower];
    }
  }

  return data;
}

// ─── Findings Validation (#1825) ───

const findingsSchema = require('./lib/findings-schema.json');
const REQUIRED_FIELDS = findingsSchema.required;

function validateFindings(findings) {
  if (!findings || typeof findings !== 'object') {
    return {
      ok: false,
      error: {
        code: 'INVALID_FINDINGS',
        message: 'Findings data is null or not an object',
        missingFields: REQUIRED_FIELDS,
      },
    };
  }

  const missing = [];
  for (const field of REQUIRED_FIELDS) {
    if (findings[field] === undefined || findings[field] === null) {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      error: {
        code: 'INVALID_FINDINGS',
        message: `Findings JSON is missing required fields: ${missing.join(', ')}. Expected schema: { issue, title, reviewNumber, type, findings: { autoEvaluated: [], userEvaluated: [] }, recommendation }`,
        missingFields: missing,
      },
    };
  }

  return { ok: true };
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
    closingNotification: data.closingNotification || null,
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

/**
 * Build context-aware closing notification based on issue status.
 * @param {number} issue - Issue number
 * @param {string} title - Issue title
 * @param {string} status - Normalized status (e.g., 'in_progress', 'backlog')
 * @returns {string} Closing notification text
 */
function buildClosingNotification(issue, title, status) {
  const header = `---\nReview complete: #${issue} — ${title}`;
  const footer = '---';

  if (status === 'in_progress' || status === 'in_review') {
    return `${header}\nSay "done" or run /done #${issue} to close this issue.\n${footer}`;
  }
  return `${header}\nSay "work #${issue}" to start working on this issue.\n${footer}`;
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
  const findings = normalizeFindings(findingsResult.data);

  // Validate required fields before proceeding (#1825)
  const validation = validateFindings(findings);
  if (!validation.ok) {
    const result = buildErrorResult(validation.error);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(1);
  }

  // Update body review count
  let bodyUpdated = false;
  const bodyExport = await execSafe(`gh pmu view ${issue} --body-stdout`);
  if (bodyExport.ok) {
    const updatedBody = updateBodyReviewCount(bodyExport.output);
    const tmpBodyFile = `.tmp-${issue}-body.${process.pid}.md`;
    fs.writeFileSync(tmpBodyFile, updatedBody);
    const editResult = await execSafe(`gh pmu edit ${issue} -F ${tmpBodyFile}`);
    bodyUpdated = editResult.ok;
    try { fs.unlinkSync(tmpBodyFile); } catch (_e) { /* ignore */ }
  }

  // Format and post comment
  let commentPosted = false;
  let commentUrl = null;
  const comment = formatReviewComment(findings);
  const tmpCommentFile = `.tmp-${issue}-review-comment.${process.pid}.md`;
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

  // Findings file cleanup is owned by the caller (#2396) — the /review-issue
  // spec chains `&& rm .tmp-<issue>-findings.json`. Do not delete here or
  // the caller's rm fails with "No such file or directory" and its
  // non-zero exit masks the script's success.

  // Query issue status for context-aware closing notification
  let issueStatus = '';
  const statusResult = await execSafe(`gh pmu view ${issue} --json=status`);
  if (statusResult.ok) {
    try {
      const parsed = JSON.parse(statusResult.output);
      issueStatus = (parsed.status || '').toLowerCase().replace(/\s+/g, '_');
    } catch (_e) { /* fall through to default */ }
  }

  // Build closing notification
  const closingNotification = buildClosingNotification(issue, findings.title, issueStatus);

  const result = buildSuccessResult({
    bodyUpdated,
    commentPosted,
    commentUrl,
    labelAssigned,
    epicSubIssuesLabeled,
    closingNotification,
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
  normalizeFindings,
  validateFindings,
  updateBodyReviewCount,
  formatReviewComment,
  determineLabel,
  buildClosingNotification,
  buildSuccessResult,
  buildErrorResult,
  EMOJI,
  SECTION_HEADERS,
};
