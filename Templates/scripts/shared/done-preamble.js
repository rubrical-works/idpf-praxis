#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.91.0
 * @description Consolidate deterministic validation and status transitions for the /done command into a single script invocation. Replaces 6-8 sequential tool round-trips. Validates issue state, checks acceptance criteria, detects epic membership, and returns structured JSON envelope for LLM continuation.
 *
 * Epic guard (#2367): the conditional auto-move-to-done is skipped when the
 * issue has the `epic` label. The /done command spec's Step 1a epic flow
 * expects sub-issues to transition to Done first, then the epic itself.
 * Skipping the move here lets the caller orchestrate that ordering instead
 * of inverting it (which would require post-hoc recovery via `gh pmu move`).
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

// ─── Error Classification ───

/**
 * Classify an error message into a specific error code
 * @param {string} errorMessage - Raw error message or stderr content
 * @param {string} defaultCode - Default code if no pattern matches
 * @returns {string} Classified error code
 */
function classifyError(errorMessage, defaultCode) {
  if (!errorMessage) return defaultCode;
  const msg = errorMessage.toLowerCase();

  if (msg.includes('etimedout') || msg.includes('timed out') || msg.includes('timeout')) {
    return 'TIMEOUT';
  }
  if (msg.includes('rate limit')) {
    return 'RATE_LIMIT';
  }
  if (msg.includes('authentication required') || msg.includes('auth login') || msg.includes('not logged')) {
    return 'AUTH_FAILED';
  }
  if (msg.includes('unknown command') && msg.includes('pmu')) {
    return 'PMU_MISSING';
  }

  return defaultCode;
}

// ─── Execution Safety ───

/**
 * Safe async exec wrapper — never throws
 * @param {string} cmd
 * @returns {Promise<string|null>} Trimmed output or null on failure
 */
async function execSafe(cmd) {
  try {
    const { stdout } = await execAsync(cmd, EXEC_OPTS);
    return stdout.trim();
  } catch (_e) {
    return null;
  }
}

/**
 * Async exec wrapper that returns parsed JSON or an error object.
 * @param {string} cmd
 * @param {string} errorCode - Default error code to use on failure
 * @param {string} errorMsg - Error message prefix
 * @returns {Promise<{ data: object } | { error: { code: string, message: string } }>}
 */
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

/**
 * Parse command-line arguments for done-preamble
 * @param {string[]} args
 * @returns {{ mode: string, issues?: number[], forceMove?: boolean, yes?: boolean } | { error: { code: string, message: string } }}
 */
function parseArgs(args) {
  // No args → discovery mode (will be implemented in Story #1557)
  if (args.length === 0) {
    return { mode: 'discovery' };
  }

  const forceMove = args.includes('--force-move');
  const yes = args.includes('--yes') || args.includes('-y');
  const hasAll = args.includes('--all');

  // --all conflicts with --issue/--issues
  if (hasAll) {
    if (args.includes('--issue') || args.includes('--issues')) {
      return { error: { code: 'CONFLICTING_ARGS', message: '--all cannot be combined with --issue or --issues.' } };
    }
    const result = { mode: 'discovery', all: true };
    if (yes) result.yes = true;
    return result;
  }

  const flagIndex = args.indexOf('--issue');
  if (flagIndex !== -1) {
    const raw = args[flagIndex + 1];
    if (!raw) {
      return { error: { code: 'MISSING_ARGUMENT', message: '--issue requires a value.' } };
    }
    const cleaned = raw.replace(/^#/, '');
    const num = parseInt(cleaned, 10);
    if (isNaN(num) || num <= 0 || String(num) !== cleaned) {
      return { error: { code: 'INVALID_ARGUMENT', message: `Invalid issue number: "${raw}". Must be a positive integer.` } };
    }
    const result = { mode: 'single', issues: [num], forceMove };
    if (yes) result.yes = true;
    return result;
  }

  const issuesIndex = args.indexOf('--issues');
  if (issuesIndex !== -1) {
    const raw = args[issuesIndex + 1];
    if (!raw) {
      return { error: { code: 'MISSING_ARGUMENT', message: '--issues requires a comma-separated list.' } };
    }
    const nums = raw.split(',').map(s => parseInt(s.trim().replace(/^#/, ''), 10));
    if (nums.some(n => isNaN(n) || n <= 0)) {
      return { error: { code: 'INVALID_ARGUMENT', message: `Invalid issue numbers in: "${raw}".` } };
    }
    const result = { mode: 'batch', issues: nums, forceMove };
    if (yes) result.yes = true;
    return result;
  }

  // Unrecognized args with only --force-move
  if (forceMove && args.length === 1) {
    return { error: { code: 'MISSING_ARGUMENT', message: '--force-move requires --issue or --issues.' } };
  }

  return { error: { code: 'MISSING_ARGUMENT', message: 'No recognized arguments. Use --issue N or --issues "N,N".' } };
}

// ─── Data Gathering ───

/**
 * Fetch all issue data (issue fields + project status) in a single API call.
 * Replaces separate gatherIssueData + gatherStatusData calls.
 * @param {number} issueNum
 * @returns {Promise<{ issue: object, status: string } | { error: { code: string, message: string } }>}
 */
async function gatherAllData(issueNum) {
  const result = await execJSON(
    `gh pmu view ${issueNum} --json=number,title,labels,body,state,status`,
    'NOT_FOUND',
    `Issue #${issueNum} not found`
  );
  if (result.error) return result;
  if (result.data.state === 'CLOSED') {
    return { error: { code: 'CLOSED', message: `Issue #${issueNum} is already closed.` } };
  }
  // Normalize labels: gh pmu view returns flat strings, gh issue view returned objects.
  // Downstream code accesses label.name — wrap strings in objects for compatibility.
  const rawLabels = result.data.labels || [];
  const labels = rawLabels.map(l => typeof l === 'string' ? { name: l } : l);

  return {
    issue: {
      number: result.data.number,
      title: result.data.title,
      labels,
      body: result.data.body,
      state: result.data.state
    },
    status: (result.data.status || '').toLowerCase()
  };
}

// ─── Label Detection ───

/**
 * Check if issue has PRD label
 * @param {Array<{ name: string }>} labels
 * @returns {boolean}
 */
function hasPrdLabel(labels) {
  return (labels || []).some(l => l.name === 'prd');
}

/**
 * Check if issue is an approval gate (test-plan + approval-required)
 * @param {Array<{ name: string }>} labels
 * @returns {boolean}
 */
function isApprovalGate(labels) {
  const names = (labels || []).map(l => l.name);
  return names.includes('test-plan') && names.includes('approval-required');
}

// ─── PRD Reference Parsing ───

/**
 * Parse PRD reference from issue body (**PRD:** #NNN or **PRD Tracker:** #NNN)
 * @param {string|null|undefined} body
 * @returns {number|null}
 */
function parsePrdReference(body) {
  if (!body) return null;
  // Try **PRD Tracker:** first (more specific)
  const trackerMatch = body.match(/\*\*PRD Tracker:\*\*\s*#(\d+)/);
  if (trackerMatch) return parseInt(trackerMatch[1], 10);
  // Fall back to **PRD:**
  const prdMatch = body.match(/\*\*PRD:\*\*\s*#(\d+)/);
  if (prdMatch) return parseInt(prdMatch[1], 10);
  return null;
}

// ─── Status Validation ───

/**
 * Validate that issue is in in_review status (required for /done)
 * @param {string} status - Lowercase status string
 * @param {number} issueNum
 * @returns {{ valid: true } | { error: { code: string, message: string, suggestion?: string } }}
 */
function validateStatus(status, issueNum) {
  const normalized = status.replace(/_/g, ' ').toLowerCase().trim();
  if (normalized === 'in review') {
    return { valid: true };
  }

  const suggestions = {
    'in progress': `Issue #${issueNum} is still in progress. Complete work first via /work.`,
    'done': `Issue #${issueNum} is already done.`,
    'backlog': `Issue #${issueNum} is in backlog. Move to in_progress first via /work.`
  };

  const suggestion = suggestions[normalized] ||
    `Issue #${issueNum} is in "${status}" status. Move to in_review first via /work.`;

  return {
    error: {
      code: normalized === 'done' ? 'ALREADY_DONE' : 'WRONG_STATUS',
      message: suggestion,
      suggestion: normalized === 'in progress' ? 'Use /work to complete the issue first.' : undefined
    }
  };
}

// ─── Envelope Builders ───

/**
 * Build a success envelope
 * @param {object} context
 * @param {object} gates
 * @param {Array} warnings
 * @returns {object}
 */
function buildSuccessEnvelope(context, gates, warnings) {
  return {
    ok: true,
    version: SCHEMA_VERSION,
    context: context || {},
    gates: gates || {},
    errors: [],
    warnings: warnings || [],
    roundTrips: 0
  };
}

/**
 * Build an error envelope
 * @param {Array<{ code: string, message: string, suggestion?: string }>} errors
 * @returns {object}
 */
function buildErrorEnvelope(errors) {
  return {
    ok: false,
    version: SCHEMA_VERSION,
    context: {},
    gates: {},
    errors,
    warnings: [],
    roundTrips: 0
  };
}

// ─── CI Pre-Check ───

/**
 * Gather CI workflow data using ci-watch.js's hasPushWorkflows()
 * @returns {{ hasPushWorkflows: boolean, workflowFiles: string[] }}
 */
function gatherCiData() {
  let hasPush = false;
  let workflowFiles = [];

  try {
    const ciWatch = require(path.join(__dirname, 'ci-watch.js'));
    hasPush = ciWatch.hasPushWorkflows();
  } catch (_e) {
    // ci-watch.js not available — default to false
  }

  // List workflow files
  const workflowsDir = path.join(process.cwd(), '.github', 'workflows');
  try {
    workflowFiles = fs.readdirSync(workflowsDir)
      .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
  } catch (_e) {
    // No workflows directory
  }

  return { hasPushWorkflows: hasPush, workflowFiles };
}

// ─── Branch Tracker ───

/**
 * Resolve the branch tracker for the current branch
 * @returns {number|null}
 */
function resolveTracker() {
  try {
    const activeLabel = require(path.join(__dirname, 'lib', 'active-label.js'));
    return activeLabel.getTrackerForBranch();
  } catch (_e) {
    return null;
  }
}

/**
 * Link a completed issue to the branch tracker (best-effort)
 * @param {number} issueNum
 * @param {number|null} trackerNum
 * @returns {Promise<{ linked: boolean, warning?: { code: string, message: string } }>}
 */
async function linkToTracker(issueNum, trackerNum) {
  if (!trackerNum) {
    return { linked: false };
  }
  try {
    await execAsync(`gh pmu sub add ${trackerNum} ${issueNum}`, EXEC_OPTS);
    return { linked: true };
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().trim() : e.message;
    // Best-effort — "already a sub-issue" is success
    if (msg.includes('already')) {
      return { linked: true };
    }
    return {
      linked: false,
      warning: { code: 'TRACKER_LINK_FAILED', message: `Failed to link #${issueNum} to tracker #${trackerNum}: ${msg}` }
    };
  }
}

// ─── Diff Verification ───

/**
 * Run diff verification by calling done-verify.js
 * @param {number} issueNum
 * @returns {Promise<{ diffVerification: object } | { error: { code: string, message: string } }>}
 */
async function runDiffVerification(issueNum) {
  const verifyScript = path.join(__dirname, 'done-verify.js');
  let output;
  try {
    const { stdout } = await execAsync(
      `node "${verifyScript}" --issue ${issueNum}`,
      EXEC_OPTS
    );
    output = stdout.trim();
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().trim() : e.message;
    return {
      error: {
        code: 'VERIFY_ERROR',
        message: `done-verify.js failed: ${msg}`
      }
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch (_e) {
    return {
      error: {
        code: 'INVALID_JSON',
        message: 'done-verify.js returned invalid JSON'
      }
    };
  }

  // Determine if confirmation is needed
  const hasWarnings = (parsed.warnings || []).length > 0;
  const noCommits = (parsed.commits || []).length === 0;
  const requiresConfirmation = hasWarnings || noCommits;

  return {
    diffVerification: {
      ...parsed,
      requiresConfirmation
    }
  };
}

// ─── Status Transitions ───

/**
 * Move an issue to done status
 * @param {number} issueNum
 * @returns {Promise<{ moved: boolean, error?: { code: string, message: string } }>}
 */
async function moveToDone(issueNum) {
  try {
    await execAsync(`gh pmu move ${issueNum} --status done`, EXEC_OPTS);
    return { moved: true };
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().trim() : e.message;
    return {
      moved: false,
      error: { code: 'MOVE_FAILED', message: `Failed to move #${issueNum} to done: ${msg}` }
    };
  }
}

// ─── Single Issue Flow ───

/**
 * Run the done preamble for a single issue.
 * Parallelizes data gathering and diff verification for performance.
 * @param {number} issueNum
 * @param {{ forceMove?: boolean }} options
 * @returns {Promise<object>} JSON envelope
 */
async function runSingleIssue(issueNum, options = {}) {
  const warnings = [];
  let roundTrips = 0;

  // 1. Parallel: gather all data (single API call) + diff verification
  //    These are independent — diff verification only needs issueNum.
  const needsVerify = !options.forceMove;
  const [dataResult, verifyResult] = await Promise.all([
    gatherAllData(issueNum),
    needsVerify ? runDiffVerification(issueNum) : Promise.resolve(null)
  ]);
  roundTrips++; // gatherAllData = 1 consolidated call
  if (needsVerify) roundTrips++; // diff verification subprocess

  // 2. Validate data result
  if (dataResult.error) {
    return buildErrorEnvelope([dataResult.error]);
  }

  // 3. Check for PRD label (redirect)
  if (hasPrdLabel(dataResult.issue.labels)) {
    return buildErrorEnvelope([{
      code: 'PRD_REDIRECT',
      message: `Issue #${issueNum} has the "prd" label.`,
      suggestion: `Use /complete-prd #${issueNum} to close PRD trackers.`
    }]);
  }

  // 4. Check status (must be in_review) — status from consolidated call
  const statusValidation = validateStatus(dataResult.status, issueNum);
  if (statusValidation.error) {
    return buildErrorEnvelope([statusValidation.error]);
  }

  // 5. Check for approval-gate labels
  const approvalGate = isApprovalGate(dataResult.issue.labels);
  let nextSteps = null;
  if (approvalGate) {
    const prdRef = parsePrdReference(dataResult.issue.body);
    // If this is a test plan approval issue, the PRD was necessarily reviewed
    // (test plans are derived from reviewed PRDs) — skip PRD review suggestion (#1867)
    const isTestPlanApproval = (dataResult.issue.labels || []).some(l => l.name === 'test-plan');
    if (prdRef && isTestPlanApproval) {
      nextSteps = {
        prdTracker: prdRef,
        guidance: [
          `/create-backlog #${prdRef} — decompose into epics/stories`
        ]
      };
    } else if (prdRef) {
      nextSteps = {
        prdTracker: prdRef,
        guidance: [
          `/review-prd #${prdRef} — review the PRD before decomposition`,
          `/create-backlog #${prdRef} — decompose into epics/stories (after review)`
        ]
      };
    } else {
      nextSteps = {
        prdTracker: null,
        guidance: ['Review the linked PRD before running /create-backlog.']
      };
    }
  }

  // 6. Process diff verification result
  let diffVerification = null;
  if (verifyResult !== null) {
    if (verifyResult.error) {
      // Diff verification crash is non-fatal — report as warning, require confirmation
      warnings.push(verifyResult.error);
      diffVerification = { requiresConfirmation: true, error: verifyResult.error };
    } else {
      diffVerification = verifyResult.diffVerification;
    }
  }

  // 7. Conditional move to done — epic guard (#2367): skip auto-move when the
  // issue has the `epic` label so the /done command spec's epic flow can
  // process sub-issues first, then close the epic explicitly. The end state
  // (epic reaches Done only after sub-issues) otherwise gets inverted and
  // has to be recovered in a follow-up batch.
  let movedToDone = false;
  const isEpic = (dataResult.issue.labels || []).some(l => l.name === 'epic');
  if (!isEpic && (options.forceMove || (diffVerification && !diffVerification.requiresConfirmation))) {
    roundTrips++;
    const moveResult = await moveToDone(issueNum);
    if (moveResult.error) {
      return buildErrorEnvelope([moveResult.error]);
    }
    movedToDone = moveResult.moved;
  }

  // 8. CI pre-check data + tracker resolution (both local, no network)
  const ciData = gatherCiData();
  const trackerNum = resolveTracker();

  // 9. Branch tracker linking (only after successful move to done)
  let trackerLinked = false;
  if (movedToDone && trackerNum) {
    const linkResult = await linkToTracker(issueNum, trackerNum);
    trackerLinked = linkResult.linked;
    if (linkResult.warning) {
      warnings.push(linkResult.warning);
    }
  }

  // Build context
  const context = {
    issue: dataResult.issue,
    status: movedToDone ? 'done' : dataResult.status
  };

  context.ci = ciData;
  context.tracker = trackerNum;
  context.trackerLinked = trackerLinked;

  if (nextSteps) {
    context.nextSteps = nextSteps;
  }

  const gates = {
    movedToDone
  };

  const envelope = buildSuccessEnvelope(context, gates, warnings);
  if (diffVerification) {
    envelope.diffVerification = diffVerification;
  }
  envelope.roundTrips = roundTrips;
  return envelope;
}

// ─── Discovery Mode ───

/**
 * Query in_review issues for /done selection (no-args mode).
 * Read-only — no mutations, no moves, no tracker linking.
 * @returns {Promise<object>} JSON envelope with discovery data or error
 */
async function runDiscovery(options = {}) {
  let roundTrips = 0;

  // Query in_review issues
  roundTrips++;
  let output;
  try {
    const { stdout } = await execAsync(
      'gh pmu list --branch current --status in_review',
      EXEC_OPTS
    );
    output = stdout.trim();
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().trim() : e.message;
    const code = classifyError(msg, 'DISCOVERY_FAILED');
    const envelope = buildErrorEnvelope([{ code, message: `Failed to query in_review issues: ${msg}` }]);
    envelope.roundTrips = roundTrips;
    return envelope;
  }

  // Parse the output — gh pmu list returns one issue per line: "NUMBER\tTITLE\tSTATUS"
  const lines = output ? output.split('\n').filter(l => l.trim()) : [];

  if (lines.length === 0) {
    const envelope = buildErrorEnvelope([{
      code: 'NONE_IN_REVIEW',
      message: 'No issues in review. Specify issue number or complete work first.'
    }]);
    envelope.roundTrips = roundTrips;
    return envelope;
  }

  // Parse each line into { number, title, status }
  const issues = lines.map(line => {
    const parts = line.split('\t');
    const num = parseInt((parts[0] || '').replace(/^#/, ''), 10);
    return {
      number: isNaN(num) ? 0 : num,
      title: (parts[1] || '').trim(),
      status: (parts[2] || 'in_review').trim()
    };
  }).filter(i => i.number > 0);

  if (issues.length === 0) {
    const envelope = buildErrorEnvelope([{
      code: 'NONE_IN_REVIEW',
      message: 'No issues in review. Specify issue number or complete work first.'
    }]);
    envelope.roundTrips = roundTrips;
    return envelope;
  }

  const envelope = buildSuccessEnvelope({}, {}, []);
  envelope.discovery = {
    mode: options.all ? 'all' : 'query',
    issues
  };
  envelope.roundTrips = roundTrips;
  return envelope;
}

// ─── Main Entry Point ───

async function main() {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  if (parsed.error) {
    const envelope = buildErrorEnvelope([parsed.error]);
    process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
    process.exit(1);
    return;
  }

  if (parsed.mode === 'discovery') {
    const result = await runDiscovery({ all: parsed.all || false });
    if (parsed.yes) result.yes = true;
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
    return;
  }

  if (parsed.mode === 'single') {
    const result = await runSingleIssue(parsed.issues[0], { forceMove: parsed.forceMove });
    if (parsed.yes) result.yes = true;
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
    return;
  }

  if (parsed.mode === 'batch') {
    // Batch mode: process each issue sequentially (order matters for side effects)
    const results = [];
    for (const num of parsed.issues) {
      results.push(await runSingleIssue(num, { forceMove: parsed.forceMove }));
    }
    const envelope = {
      ok: true,
      version: SCHEMA_VERSION,
      results,
      warnings: [],
      roundTrips: results.reduce((sum, r) => sum + (r.roundTrips || 0), 0)
    };
    if (parsed.yes) envelope.yes = true;
    process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
    process.exit(0);
    return;
  }
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
  classifyError,
  execSafe,
  execJSON,
  parseArgs,
  gatherAllData,
  hasPrdLabel,
  isApprovalGate,
  parsePrdReference,
  validateStatus,
  runDiffVerification,
  moveToDone,
  gatherCiData,
  resolveTracker,
  linkToTracker,
  buildSuccessEnvelope,
  buildErrorEnvelope,
  runDiscovery,
  runSingleIssue,
  main
};
