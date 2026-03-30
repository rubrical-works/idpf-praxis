#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.77.1
 * @description Consolidate /review-issue setup into a single JSON response. Fetches issue metadata, detects type for routing (redirects to /review-proposal, /review-prd, /review-test-plan as needed), loads review mode and criteria (common + type-specific + domain extensions), and computes review sequence number. Pass --no-redirect to suppress redirect and load criteria directly (used by redirected review commands to avoid infinite loops).
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const { exec: execCb } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(execCb);
const SCHEMA_VERSION = 1;
const EXEC_OPTS = { encoding: 'utf-8' };

const VALID_MODES = ['solo', 'team', 'enterprise'];

// ─── Error Classification ───

function classifyError(errorMessage, defaultCode) {
  if (!errorMessage) return defaultCode;
  const msg = errorMessage.toLowerCase();
  if (msg.includes('etimedout') || msg.includes('timed out') || msg.includes('timeout')) return 'TIMEOUT';
  if (msg.includes('rate limit')) return 'RATE_LIMIT';
  if (msg.includes('authentication required') || msg.includes('auth login') || msg.includes('not logged')) return 'AUTH_FAILED';
  if (msg.includes('unknown command') && msg.includes('pmu')) return 'PMU_MISSING';
  return defaultCode;
}

// ─── Execution Safety ───

async function execJSON(cmd, errorCode, errorMsg) {
  let output;
  try {
    const { stdout } = await execAsync(cmd, EXEC_OPTS);
    output = stdout.trim();
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().trim() : e.message;
    const code = classifyError(msg, errorCode);
    return { error: { code, message: `${errorMsg}: ${msg}` } };
  }
  try {
    return { data: JSON.parse(output) };
  } catch (_e) {
    return { error: { code: 'INVALID_RESPONSE', message: `${errorMsg}: could not parse JSON` } };
  }
}

async function execSafe(cmd) {
  try {
    const { stdout } = await execAsync(cmd, EXEC_OPTS);
    return stdout.trim();
  } catch (_e) {
    return null;
  }
}

// ─── Argument Parsing ───

function parseArgs(args) {
  if (args.length === 0) {
    return { error: { code: 'MISSING_ARGUMENT', message: 'No arguments provided. Usage: node review-preamble.js <issue-number> [--with extensions] [--mode mode] [--force]' } };
  }

  // First non-flag argument is issue number
  let issue = null;
  let withExtensions = null;
  let withoutExtensions = null;
  let modeOverride = null;
  let force = false;
  let noRedirect = false;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--with') {
      withExtensions = args[i + 1] || null;
      i += 2;
    } else if (arg === '--without') {
      withoutExtensions = args[i + 1] || null;
      i += 2;
    } else if (arg === '--mode') {
      const val = args[i + 1];
      if (!val || !VALID_MODES.includes(val)) {
        return { error: { code: 'INVALID_MODE', message: `Invalid mode: "${val || ''}". Must be one of: ${VALID_MODES.join(', ')}` } };
      }
      modeOverride = val;
      i += 2;
    } else if (arg === '--force') {
      force = true;
      i += 1;
    } else if (arg === '--no-redirect') {
      noRedirect = true;
      i += 1;
    } else {
      // Positional: issue number
      const cleaned = arg.replace(/^#/, '');
      const num = parseInt(cleaned, 10);
      if (isNaN(num) || num <= 0 || String(num) !== cleaned) {
        return { error: { code: 'INVALID_ARGUMENT', message: `Invalid issue number: "${arg}". Must be a positive integer.` } };
      }
      issue = num;
      i += 1;
    }
  }

  if (issue === null) {
    return { error: { code: 'MISSING_ARGUMENT', message: 'No issue number provided.' } };
  }

  const result = { issue };
  if (withExtensions !== null) result.withExtensions = withExtensions;
  if (withoutExtensions !== null) result.withoutExtensions = withoutExtensions;
  if (modeOverride !== null) result.modeOverride = modeOverride;
  if (force) result.force = true;
  if (noRedirect) result.noRedirect = true;
  return result;
}

// ─── Review Number Computation ───

function computeReviewNumber(body) {
  if (!body) return 1;
  const match = body.match(/\*\*Reviews:\*\*\s*(\d+)/);
  return match ? parseInt(match[1], 10) + 1 : 1;
}

// ─── Early Exit Detection ───

function checkEarlyExit(issue, force) {
  const labels = (issue.labels || []).map(l => typeof l === 'string' ? l : l.name);
  const hasReviewedLabel = labels.includes('reviewed');

  if (hasReviewedLabel && !force) {
    const reviewMatch = (issue.body || '').match(/\*\*Reviews:\*\*\s*(\d+)/);
    const reviewCount = reviewMatch ? parseInt(reviewMatch[1], 10) : 0;
    return { earlyExit: true, reviewCount };
  }

  return { earlyExit: false };
}

// ─── Criteria Loading ───

function loadCriteria(issueType, projectDir, modeOverride) {
  const metadataDir = path.join(projectDir, '.claude', 'metadata');

  // Load common (cross-cutting) criteria filtered by review mode
  let common = {};
  try {
    const raw = fs.readFileSync(path.join(metadataDir, 'review-mode-criteria.json'), 'utf-8');
    const parsed = JSON.parse(raw);

    // Determine active mode
    let mode = modeOverride;
    if (!mode) {
      try {
        const configRaw = fs.readFileSync(path.join(projectDir, 'framework-config.json'), 'utf-8');
        const config = JSON.parse(configRaw);
        mode = config.reviewMode || 'solo';
      } catch (_e) {
        mode = 'solo';
      }
    }

    // Filter criteria by mode
    const criteria = parsed.criteria || {};
    for (const [id, criterion] of Object.entries(criteria)) {
      if (criterion.modes && criterion.modes.includes(mode)) {
        common[id] = criterion;
      }
    }
  } catch (_e) {
    // Non-blocking: return empty common criteria
  }

  // Load type-specific criteria
  let typeSpecific = [];
  try {
    const raw = fs.readFileSync(path.join(metadataDir, 'review-criteria.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    const typeData = parsed.typeSpecific && parsed.typeSpecific[issueType];
    if (typeData && typeData.criteria) {
      typeSpecific = typeData.criteria;
    }
  } catch (_e) {
    // Non-blocking: return empty type-specific criteria
  }

  return { common, typeSpecific };
}

// ─── Extension Loading ───

function loadExtensions(withArg, projectDir, withoutArg) {
  const metadataDir = path.join(projectDir, '.claude', 'metadata');
  let registry;
  try {
    const raw = fs.readFileSync(path.join(metadataDir, 'review-extensions.json'), 'utf-8');
    registry = JSON.parse(raw);
  } catch (_e) {
    return {
      extensions: [],
      warnings: [{ code: 'EXTENSIONS_LOAD_FAILED', message: 'Could not load review-extensions.json' }]
    };
  }

  const available = registry.extensions || {};
  const extensions = [];
  const warnings = [];
  const withNone = withArg === 'none';

  // Auto-inclusion: resolve activeDomains + relevantSpecialists
  const { resolveAutoInclusion } = require('./lib/load-review-extensions');
  const withoutList = withoutArg ? withoutArg.split(',').map(s => s.trim()) : [];
  const explicitDomains = (withArg && withArg !== 'all' && withArg !== 'none')
    ? withArg.split(',').map(s => s.trim())
    : [];

  const autoResult = resolveAutoInclusion(projectDir, explicitDomains, { withNone, without: withoutList });
  const allDomainIds = new Set(autoResult.domains);

  // If --with all, add all registered
  if (withArg === 'all') {
    for (const id of Object.keys(available)) {
      allDomainIds.add(id);
    }
  }

  // If no explicit --with and no auto-included domains, return empty
  if (allDomainIds.size === 0) {
    return { extensions: [], warnings };
  }

  for (const id of allDomainIds) {
    if (available[id]) {
      const ext = available[id];
      const source = autoResult.sources.get(id) || '--with';
      extensions.push({ id, ...ext, autoSource: source });
    } else {
      warnings.push({
        code: 'EXTENSION_NOT_FOUND',
        message: `Extension "${id}" not found in registry. Available: ${Object.keys(available).join(', ')}`
      });
    }
  }

  return { extensions, warnings };
}

// ─── Envelope Builders ───

function buildSuccessEnvelope(context, criteria, warnings) {
  return {
    ok: true,
    version: SCHEMA_VERSION,
    context,
    criteria,
    errors: [],
    warnings: warnings || []
  };
}

function buildErrorEnvelope(errors) {
  return {
    ok: false,
    version: SCHEMA_VERSION,
    context: null,
    criteria: null,
    errors,
    warnings: []
  };
}

// ─── Data Gathering ───

async function gatherIssueData(issueNum) {
  const result = await execJSON(
    `gh pmu view ${issueNum} --json=number,title,labels,body,state`,
    'NOT_FOUND',
    `Issue #${issueNum} not found`
  );
  if (result.error) return result;

  if (result.data.state === 'CLOSED') {
    return { error: { code: 'CLOSED', message: `Issue #${issueNum} is closed.` } };
  }

  // Normalize labels
  const rawLabels = result.data.labels || [];
  const labels = rawLabels.map(l => typeof l === 'string' ? { name: l } : l);

  return {
    issue: {
      number: result.data.number,
      title: result.data.title,
      labels,
      body: result.data.body,
      state: result.data.state
    }
  };
}

async function countReviewComments(issueNum) {
  const raw = await execSafe(
    `gh api repos/{owner}/{repo}/issues/${issueNum}/comments --jq="[.[] | select(.body | test(\\"^## .*Review #\\"))] | length"`
  );
  return raw ? parseInt(raw, 10) || 0 : 0;
}

// ─── Main ───

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    const envelope = buildErrorEnvelope([args.error]);
    process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
    process.exit(1);
  }

  let roundTrips = 0;

  // Fetch issue data
  const issueResult = await gatherIssueData(args.issue);
  roundTrips++;
  if (issueResult.error) {
    const envelope = buildErrorEnvelope([issueResult.error]);
    envelope.roundTrips = roundTrips;
    process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
    process.exit(1);
  }

  const { issue } = issueResult;

  // Early exit check
  const earlyExit = checkEarlyExit(issue, args.force || false);
  if (earlyExit.earlyExit) {
    const envelope = buildSuccessEnvelope(
      {
        issue,
        earlyExit: true,
        reviewCount: earlyExit.reviewCount,
        message: `Issue #${args.issue} already reviewed (Review #${earlyExit.reviewCount}). Use --force to re-review.`
      },
      null,
      []
    );
    envelope.roundTrips = roundTrips;
    process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
    return;
  }

  // Type detection (uses shared issue-type.js)
  const { getIssueType } = require('./lib/issue-type.js');
  const { type: issueType, redirect } = getIssueType(issue);

  // If redirect and not suppressed, return immediately with redirect info
  if (redirect && !args.noRedirect) {
    const envelope = buildSuccessEnvelope(
      {
        issue,
        type: null,
        redirect,
        reviewNumber: computeReviewNumber(issue.body)
      },
      null,
      []
    );
    envelope.roundTrips = roundTrips;
    process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
    return;
  }

  // When redirect was suppressed (--no-redirect), derive type from redirect label name
  // e.g., proposal label -> type 'proposal', prd label -> type 'prd', test-plan label -> type 'test-plan'
  const resolvedType = issueType || ((issue.labels || []).find(l => ['proposal', 'prd', 'test-plan'].includes(l.name)) || {}).name || 'generic';

  // Load review mode
  const { getReviewMode } = require('./lib/review-mode.js');
  const reviewMode = getReviewMode(process.cwd(), args.modeOverride || null);

  // Compute review number from body
  const reviewNumber = computeReviewNumber(issue.body);

  // Count review comments for more accurate tracking
  const commentCount = await countReviewComments(args.issue);
  roundTrips++;

  // Load criteria
  const criteria = loadCriteria(resolvedType, process.cwd(), args.modeOverride || null);

  // Load extensions
  const extensionResult = loadExtensions(args.withExtensions || null, process.cwd(), args.withoutExtensions || null);
  criteria.extensions = extensionResult.extensions;

  const allWarnings = [...extensionResult.warnings];

  // Build context
  const context = {
    issue,
    type: resolvedType,
    redirect: null,
    reviewMode,
    reviewNumber: Math.max(reviewNumber, commentCount + 1),
    hasReviewedLabel: (issue.labels || []).some(l => l.name === 'reviewed'),
    force: args.force || false
  };

  const envelope = buildSuccessEnvelope(context, criteria, allWarnings);
  envelope.roundTrips = roundTrips;
  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
}

// ─── Module Guard ───

if (require.main === module) {
  main().catch(err => {
    const envelope = buildErrorEnvelope([{
      code: 'UNEXPECTED',
      message: err.message
    }]);
    process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  computeReviewNumber,
  checkEarlyExit,
  loadCriteria,
  loadExtensions,
  buildSuccessEnvelope,
  buildErrorEnvelope
};
