#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.75.0
 * @description Consolidate /paths command setup into a single JSON response. Parses flags (--quick, --dry-run, --categories, --from-code), validates category names, detects flag conflicts, fetches issue metadata, validates issue type (proposal/enhancement), detects partial analysis state, and returns structured JSON envelope.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

'use strict';

const { exec: execCb } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(execCb);
const SCHEMA_VERSION = 1;
const EXEC_OPTS = { encoding: 'utf-8' };

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

// ─── Argument Parsing ───

function parseArgs(args) {
  if (args.length === 0) {
    return { error: { code: 'MISSING_ARGUMENT', message: 'No arguments provided. Usage: node paths-preamble.js <issue-number> [--quick] [--dry-run] [--categories IDs] [--from-code path]' } };
  }

  let issue = null;
  let quick = false;
  let dryRun = false;
  let categories = null;
  let fromCode = null;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--quick') {
      quick = true;
      i += 1;
    } else if (arg === '--dry-run') {
      dryRun = true;
      i += 1;
    } else if (arg === '--categories') {
      const val = args[i + 1];
      if (!val || val.startsWith('--')) {
        return { error: { code: 'MISSING_VALUE', message: '--categories requires a comma-separated list of category IDs' } };
      }
      categories = val.split(',').map(s => s.trim()).filter(s => s.length > 0);
      if (categories.length === 0) {
        return { error: { code: 'INVALID_CATEGORIES', message: '--categories value is empty. Provide comma-separated category IDs (e.g., edge,corner)' } };
      }
      i += 2;
    } else if (arg === '--from-code') {
      fromCode = args[i + 1] || null;
      i += 2;
    } else if (arg.startsWith('--')) {
      // Unknown flag — ignore gracefully
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
  if (quick) result.quick = true;
  if (dryRun) result.dryRun = true;
  if (categories) result.categories = categories;
  if (fromCode) result.fromCode = fromCode;
  return result;
}

// ─── Config Loading ───

function loadConfig(metadataDir) {
  const configPath = path.join(metadataDir, 'paths-config.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return { error: { code: 'CONFIG_LOAD_FAILED', message: `Failed to load paths-config.json: ${e.message}` } };
  }
}

// ─── Category Validation ───

function validateCategories(categories, validIds) {
  if (!categories || categories.length === 0) {
    return { valid: false, error: 'No categories specified. Valid: ' + validIds.join(', ') };
  }

  const filtered = categories.filter(c => c.length > 0);
  if (filtered.length === 0) {
    return { valid: false, error: 'All category values are empty. Valid: ' + validIds.join(', ') };
  }

  const invalid = filtered.filter(c => !validIds.includes(c));
  if (invalid.length > 0) {
    return { valid: false, error: `Unrecognized categories: ${invalid.join(', ')}. Valid: ${validIds.join(', ')}` };
  }

  const deduplicated = [...new Set(filtered)];
  return { valid: true, deduplicated };
}

// ─── Flag Conflict Detection ───

function detectFlagConflicts(flags) {
  if (flags.quick && flags.categories) {
    return { code: 'FLAG_CONFLICT', message: 'Cannot combine --quick with --categories. Use one or the other.' };
  }
  if (flags.dryRun && flags.quick) {
    return { code: 'FLAG_CONFLICT', message: 'Cannot combine --dry-run with --quick. Use one or the other.' };
  }
  return null;
}

// ─── Partial Analysis Detection ───

function parsePartialMarker(content) {
  if (!content) return null;
  const match = content.match(/## Path Analysis \(Partial\s*[—–-]\s*(\d+)\/(\d+) categories\)/);
  if (!match) return null;
  const completed = parseInt(match[1], 10);
  const total = parseInt(match[2], 10);
  if (isNaN(completed) || isNaN(total) || completed < 0 || completed > total) return null;
  return { completed, total };
}

// ─── Envelope Builders ───

function buildSuccessEnvelope(context, warnings) {
  return {
    ok: true,
    version: SCHEMA_VERSION,
    context,
    errors: [],
    warnings: warnings || []
  };
}

function buildErrorEnvelope(errors) {
  return {
    ok: false,
    version: SCHEMA_VERSION,
    context: null,
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

  // Normalize labels
  const rawLabels = result.data.labels || [];
  const labels = rawLabels.map(l => typeof l === 'string' ? { name: l } : l);
  const labelNames = labels.map(l => l.name);

  // Validate issue type
  const isProposal = labelNames.includes('proposal');
  const isEnhancement = labelNames.includes('enhancement');
  if (!isProposal && !isEnhancement) {
    return { error: { code: 'INVALID_TYPE', message: `Issue #${issueNum} is not a proposal or enhancement. /paths supports proposals and enhancements only.` } };
  }

  return {
    issue: {
      number: result.data.number,
      title: result.data.title,
      labels,
      body: result.data.body,
      state: result.data.state,
      type: isProposal ? 'proposal' : 'enhancement'
    }
  };
}

// ─── Main ───

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    const envelope = buildErrorEnvelope([args.error]);
    process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
    process.exit(1);
  }

  // Load config
  const metadataDir = path.join(process.cwd(), '.claude', 'metadata');
  const config = loadConfig(metadataDir);
  if (config.error) {
    const envelope = buildErrorEnvelope([config.error]);
    process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
    process.exit(1);
  }

  const validIds = config.categories.map(c => c.id);

  // Validate categories if specified
  if (args.categories) {
    const catResult = validateCategories(args.categories, validIds);
    if (!catResult.valid) {
      const envelope = buildErrorEnvelope([{ code: 'INVALID_CATEGORIES', message: catResult.error }]);
      process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
      process.exit(1);
    }
    args.categories = catResult.deduplicated;
  }

  // Detect flag conflicts
  const conflict = detectFlagConflicts(args);
  if (conflict) {
    const envelope = buildErrorEnvelope([conflict]);
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

  // Extract proposal file path
  let proposalFile = null;
  const fileMatch = (issue.body || '').match(/\*\*File:\*\*\s*(Proposal\/[A-Za-z0-9_-]+\.md)/);
  if (fileMatch) {
    proposalFile = fileMatch[1];
  }

  // Detect partial analysis
  const partial = parsePartialMarker(issue.body || '');

  // Determine active categories
  let activeCategories = config.categories;
  if (args.quick) {
    activeCategories = config.categories.filter(c => config.quickModeCategories.includes(c.id));
  } else if (args.categories) {
    activeCategories = config.categories.filter(c => args.categories.includes(c.id));
  }

  // Build context
  const context = {
    issue,
    config: {
      categories: activeCategories,
      allCategories: config.categories,
      fromCodeHint: config.fromCodeHint
    },
    flags: {
      quick: args.quick || false,
      dryRun: args.dryRun || false,
      categories: args.categories || null,
      fromCode: args.fromCode || null
    },
    proposalFile,
    partial,
    resumeFrom: partial ? partial.completed + 1 : null
  };

  const warnings = [];
  if (issue.state === 'CLOSED') {
    warnings.push({ code: 'ISSUE_CLOSED', message: `Issue #${args.issue} is closed.` });
  }

  const envelope = buildSuccessEnvelope(context, warnings);
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
  loadConfig,
  validateCategories,
  detectFlagConflicts,
  parsePartialMarker,
  buildSuccessEnvelope,
  buildErrorEnvelope
};
