#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.84.0
 * @description Consolidate /resolve-review setup into a single script call. Parses review comments from the issue, extracts individual findings with severity and status, classifies each as auto-fixable or requiring user input, and returns structured envelope for LLM-driven resolution.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const {
  EMOJI,
  REVIEW_HEADER_PATTERN,
  MALFORMED_REVIEW_HEADER_PATTERN,
  REVIEW_TYPES,
  FINDING_LINE_PATTERN,
  RECOMMENDATION_PATTERN,
  AUTO_FIXABLE_CRITERIA,
} = require('./lib/review-format');

// ─── Argument Parsing ───

function parseArgs(args) {
  if (!args || args.length === 0) {
    return { error: { code: 'MISSING_ARGUMENT', message: 'No issue number provided. Usage: node resolve-preamble.js <issue>' } };
  }

  const cleaned = args[0].replace(/^#/, '');
  const num = parseInt(cleaned, 10);
  if (isNaN(num) || num <= 0) {
    return { error: { code: 'INVALID_ARGUMENT', message: `Invalid issue number: ${args[0]}` } };
  }

  return { issue: num };
}

// ─── Review Comment Matching ───

function findLatestReview(comments) {
  if (!comments || comments.length === 0) {
    return { found: false };
  }

  let latest = null;
  let malformedFound = false;

  for (const comment of comments) {
    const match = comment.body.match(REVIEW_HEADER_PATTERN);
    if (match) {
      const rawType = match[1];
      const reviewNumber = parseInt(match[2], 10);
      const reviewType = REVIEW_TYPES[rawType] || rawType.toLowerCase();

      if (!latest || reviewNumber > latest.reviewNumber) {
        latest = { found: true, reviewType, reviewNumber, body: comment.body };
      }
    } else if (comment.body.match(MALFORMED_REVIEW_HEADER_PATTERN)) {
      // Track malformed reviews — only report if no well-formed review found
      malformedFound = true;
    }
  }

  if (!latest && malformedFound) {
    return { found: true, malformed: true };
  }

  return latest || { found: false };
}

// ─── Finding Parsing ───

function parseFindings(body) {
  const findings = [];
  const lines = body.split('\n');

  const emojiToStatus = {};
  emojiToStatus[EMOJI.pass] = 'pass';
  emojiToStatus[EMOJI.fail] = 'fail';
  emojiToStatus[EMOJI.warn] = 'warn';
  emojiToStatus[EMOJI.skip] = 'skip';

  for (const line of lines) {
    const match = line.match(FINDING_LINE_PATTERN);
    if (match) {
      const emoji = match[1];
      const criterion = match[2];
      const evidence = match[3];
      const status = emojiToStatus[emoji] || 'skip';

      findings.push({ status, criterion, evidence });
    }
  }

  return findings;
}

// ─── Recommendation Extraction ───

function extractRecommendation(body) {
  const recIdx = body.indexOf('### Recommendation');
  if (recIdx === -1) {
    return { recommendation: null, reason: null };
  }

  const recSection = body.slice(recIdx);
  const match = recSection.match(RECOMMENDATION_PATTERN);
  if (match) {
    return { recommendation: match[1], reason: match[2] || null };
  }

  return { recommendation: null, reason: null };
}

// ─── Classification ───

function slugify(criterion) {
  return criterion
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function classifyFindings(findings) {
  const passed = [];
  const autoFixable = [];
  const needsUserInput = [];

  for (const f of findings) {
    if (f.status === 'pass') {
      passed.push(f);
    } else if (f.status === 'fail') {
      const slug = slugify(f.criterion);
      if (AUTO_FIXABLE_CRITERIA.includes(slug)) {
        autoFixable.push(f);
      } else {
        needsUserInput.push(f);
      }
    } else {
      // warn, skip, or unknown → needs user input
      needsUserInput.push(f);
    }
  }

  return { passed, autoFixable, needsUserInput };
}

// ─── Envelope Builders ───

function buildSuccessEnvelope(reviewInfo, classified, _findings) {
  return {
    ok: true,
    version: 1,
    context: {
      reviewType: reviewInfo.reviewType,
      reviewNumber: reviewInfo.reviewNumber,
    },
    findings: classified,
    errors: [],
  };
}

function buildErrorEnvelope(errors) {
  return {
    ok: false,
    errors: Array.isArray(errors) ? errors : [errors],
  };
}

// ─── Main ───

async function main() {
  const { exec: execCb } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(execCb);

  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    process.stdout.write(JSON.stringify(buildErrorEnvelope([args.error]), null, 2) + '\n');
    process.exit(1);
  }

  const { issue } = args;

  // Fetch issue comments
  let comments;
  try {
    const { stdout } = await execAsync(
      `gh issue view ${issue} --json comments --jq=".comments"`,
      { encoding: 'utf-8' }
    );
    comments = JSON.parse(stdout.trim());
  } catch (e) {
    process.stdout.write(JSON.stringify(buildErrorEnvelope([{
      code: 'FETCH_FAILED',
      message: `Failed to fetch comments for issue #${issue}: ${e.message}`,
    }]), null, 2) + '\n');
    process.exit(1);
  }

  // Find latest review
  const reviewResult = findLatestReview(comments);
  if (!reviewResult.found) {
    process.stdout.write(JSON.stringify(buildErrorEnvelope([{
      code: 'NO_REVIEW',
      message: `No review comments found on issue #${issue}`,
    }]), null, 2) + '\n');
    process.exit(1);
  }

  if (reviewResult.malformed) {
    process.stdout.write(JSON.stringify(buildErrorEnvelope([{
      code: 'MALFORMED_REVIEW',
      message: `Issue #${issue} has a malformed review comment (undefined values in header). Re-run /review-issue --force to generate a valid review.`,
    }]), null, 2) + '\n');
    process.exit(1);
  }

  // Parse findings from review body
  const findings = parseFindings(reviewResult.body);
  const recommendation = extractRecommendation(reviewResult.body);
  const classified = classifyFindings(findings);

  const envelope = buildSuccessEnvelope(reviewResult, classified, findings);
  envelope.recommendation = recommendation;
  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
}

// ─── Module Guard ───

if (require.main === module) {
  main().catch(err => {
    process.stdout.write(JSON.stringify(buildErrorEnvelope([{
      code: 'UNEXPECTED',
      message: err.message,
    }]), null, 2) + '\n');
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  findLatestReview,
  parseFindings,
  classifyFindings,
  extractRecommendation,
  buildSuccessEnvelope,
  buildErrorEnvelope,
};
