#!/usr/bin/env node
/**
 * @framework-script 0.52.0
 * work-preamble.js
 *
 * Consolidates deterministic setup work for the /work command into a single
 * invocation returning structured JSON. Replaces 7-9 sequential round-trips
 * with one script call.
 *
 * Usage:
 *   node work-preamble.js --issue N
 *   node work-preamble.js --issues "42,43,44"
 *   node work-preamble.js --status backlog
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;
const EXEC_OPTS = { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] };

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
 * Safe exec wrapper — never throws
 * @param {string} cmd
 * @returns {string|null} Trimmed output or null on failure
 */
function execSafe(cmd) {
  try {
    return execSync(cmd, EXEC_OPTS).trim();
  } catch (_e) {
    return null;
  }
}

/**
 * Exec wrapper that returns parsed JSON or an error object.
 * Classifies errors using stderr patterns (TIMEOUT, RATE_LIMIT, AUTH_FAILED, PMU_MISSING).
 * @param {string} cmd
 * @param {string} errorCode - Default error code to use on failure
 * @param {string} errorMsg - Error message prefix
 * @returns {{ data: object } | { error: { code: string, message: string } }}
 */
function execJSON(cmd, errorCode, errorMsg) {
  let output;
  try {
    output = execSync(cmd, EXEC_OPTS).trim();
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
 * Parse command-line arguments
 * @param {string[]} args
 * @returns {{ mode: string, issues: number[] } | { error: { code: string, message: string } }}
 */
function parseArgs(args) {
  if (args.length === 0) {
    return { error: { code: 'MISSING_ARGUMENT', message: 'No arguments provided. Use --issue N, --issues "N,N", or --status <status>.' } };
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
    return { mode: 'single', issues: [num] };
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
    return { mode: 'batch', issues: nums };
  }

  const statusIndex = args.indexOf('--status');
  if (statusIndex !== -1) {
    const status = args[statusIndex + 1];
    if (!status) {
      return { error: { code: 'MISSING_ARGUMENT', message: '--status requires a value.' } };
    }
    return { mode: 'status', status };
  }

  return { error: { code: 'MISSING_ARGUMENT', message: 'No recognized arguments. Use --issue N, --issues "N,N", or --status <status>.' } };
}

// ─── Data Gathering ───

/**
 * Fetch issue data from GitHub
 * @param {number} issueNum
 * @returns {{ issue: object } | { error: { code: string, message: string } }}
 */
function gatherIssueData(issueNum) {
  const result = execJSON(
    `gh issue view ${issueNum} --json=number,title,labels,body,state`,
    'NOT_FOUND',
    `Issue #${issueNum} not found`
  );
  if (result.error) return result;
  if (result.data.state === 'CLOSED') {
    return { error: { code: 'CLOSED', message: `Issue #${issueNum} is already closed.` } };
  }
  return { issue: result.data };
}

/**
 * Fetch branch/status data from gh pmu
 * @param {number} issueNum
 * @returns {{ branch: object } | { error: { code: string, message: string } }}
 */
function gatherBranchData(issueNum) {
  const result = execJSON(
    `gh pmu view ${issueNum} --json=status,branch`,
    'NO_BRANCH',
    `Failed to get branch data for #${issueNum}`
  );
  if (result.error) return result;
  if (!result.data.branch) {
    return { error: { code: 'NO_BRANCH', message: `Issue #${issueNum} is not assigned to a branch.`, suggestion: `Run /assign-branch #${issueNum} first.` } };
  }
  return { branch: result.data };
}

// ─── Type Detection ───

/**
 * Detect issue type from labels
 * @param {{ labels: Array<{ name: string }> }} issueData
 * @returns {string} "epic" or "standard"
 */
function detectIssueType(issueData) {
  const labels = (issueData.labels || []).map(l => l.name);
  if (labels.includes('epic')) return 'epic';
  return 'standard';
}

// ─── Acceptance Criteria Parsing ───

/**
 * Parse checkbox items from issue body
 * @param {string|null|undefined} body
 * @returns {{ source: string, items: Array<{ text: string, checked: boolean }> }}
 */
function parseAcceptanceCriteria(body) {
  const result = { source: 'acceptance_criteria', items: [] };
  if (!body) return result;

  const regex = /^- \[([ x])\] (.+)$/gm;
  let match;
  while ((match = regex.exec(body)) !== null) {
    result.items.push({
      text: match[2].trim(),
      checked: match[1] === 'x'
    });
  }
  return result;
}

// ─── Epic Sub-Issue Loading ───

/**
 * Load sub-issues for an epic
 * @param {number} issueNum
 * @returns {{ subIssues: Array<{ number: number, title: string }>, warning?: object }}
 */
function loadSubIssues(issueNum) {
  const result = execJSON(
    `gh pmu sub list ${issueNum} --json`,
    'SUB_ISSUE_LOAD_FAILED',
    `Failed to load sub-issues for #${issueNum}`
  );
  if (result.error) {
    return {
      subIssues: [],
      warning: { code: 'SUB_ISSUE_LOAD_FAILED', message: result.error.message }
    };
  }
  const children = (result.data.children || []).map(c => ({
    number: c.number,
    title: c.title
  }));
  return { subIssues: children };
}

/**
 * Check statuses of sub-issues and classify as skipped or active
 * @param {Array<{ number: number, title: string }>} subIssues
 * @returns {{ skipped: Array<{ number: number, status: string }>, active: Array<{ number: number, title: string }> }}
 */
function checkSubIssueStatuses(subIssues) {
  const skipped = [];
  const active = [];
  const skipStatuses = ['in review', 'done'];

  for (const sub of subIssues) {
    let status = null;
    try {
      const output = execSync(`gh pmu view ${sub.number} --json=status`, EXEC_OPTS).trim();
      const data = JSON.parse(output);
      status = data.status;
    } catch (_e) {
      // On failure, treat as active (don't skip)
      active.push(sub);
      continue;
    }

    if (status && skipStatuses.includes(status.toLowerCase())) {
      skipped.push({ number: sub.number, status });
    } else {
      active.push(sub);
    }
  }
  return { skipped, active };
}

/**
 * Parse processing order from epic body
 * @param {string|null} body
 * @param {number[]} subIssueNums - All sub-issue numbers
 * @returns {number[]} Ordered issue numbers
 */
function parseProcessingOrder(body, subIssueNums) {
  if (!body) return [...subIssueNums].sort((a, b) => a - b);

  const orderMatch = body.match(/\*\*Processing Order:\*\*\s*\n([\s\S]*?)(?:\n\n|\n##|$)/);
  if (!orderMatch) return [...subIssueNums].sort((a, b) => a - b);

  const orderSection = orderMatch[1];
  const orderedNums = [];
  const issueRefRegex = /#(\d+)/g;
  let match;
  while ((match = issueRefRegex.exec(orderSection)) !== null) {
    const num = parseInt(match[1], 10);
    if (subIssueNums.includes(num) && !orderedNums.includes(num)) {
      orderedNums.push(num);
    }
  }

  // Append any sub-issues not mentioned in the order
  for (const num of [...subIssueNums].sort((a, b) => a - b)) {
    if (!orderedNums.includes(num)) {
      orderedNums.push(num);
    }
  }

  return orderedNums;
}

/**
 * Build autoTodo for epic issues
 * @param {Array<{ number: number, title: string }>} activeSubIssues
 * @param {number[]} processingOrder
 * @returns {{ source: string, items: Array<{ number: number, title: string }> }}
 */
function buildEpicAutoTodo(activeSubIssues, processingOrder) {
  const ordered = processingOrder
    .map(num => activeSubIssues.find(s => s.number === num))
    .filter(Boolean);
  return {
    source: 'sub_issues',
    items: ordered
  };
}

// ─── Status Transitions ───

/**
 * Move an issue to in_progress status
 * @param {number} issueNum
 * @returns {{ moved: boolean, error?: { code: string, message: string } }}
 */
function moveToInProgress(issueNum) {
  try {
    execSync(`gh pmu move ${issueNum} --status in_progress`, EXEC_OPTS);
    return { moved: true };
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().trim() : e.message;
    return {
      moved: false,
      error: { code: 'MOVE_FAILED', message: `Failed to move #${issueNum} to in_progress: ${msg}` }
    };
  }
}

/**
 * Parse PRD tracker reference from issue body
 * @param {string|null|undefined} body
 * @returns {number|null} PRD tracker issue number or null
 */
function parsePrdTracker(body) {
  if (!body) return null;
  const match = body.match(/\*\*PRD Tracker:\*\*\s*#(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Move PRD tracker to in_progress if in backlog or ready
 * @param {number} trackerNum
 * @returns {{ moved: boolean, warning?: { code: string, message: string } }}
 */
function movePrdTracker(trackerNum) {
  // Check current status
  const statusResult = execJSON(
    `gh pmu view ${trackerNum} --json=status`,
    'PRD_TRACKER_ERROR',
    `Failed to check PRD tracker #${trackerNum}`
  );
  if (statusResult.error) {
    return { moved: false, warning: statusResult.error };
  }

  const status = (statusResult.data.status || '').toLowerCase();
  const moveStatuses = ['backlog', 'ready'];

  if (!moveStatuses.includes(status)) {
    // Already in_progress, in_review, or done — skip silently
    return { moved: false };
  }

  try {
    execSync(`gh pmu move ${trackerNum} --status in_progress`, EXEC_OPTS);
    return { moved: true };
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().trim() : e.message;
    return {
      moved: false,
      warning: { code: 'PRD_TRACKER_MOVE_FAILED', message: `Failed to move PRD tracker #${trackerNum}: ${msg}` }
    };
  }
}

// ─── Branch Tracker ───

/**
 * Resolve the branch tracker for the current branch
 * @returns {number|null} Tracker issue number or null
 */
function resolveTracker() {
  const output = execSafe('gh pmu branch current');
  if (!output) return null;
  const match = output.match(/Tracker:\s*#(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

// ─── Framework Config ───

/**
 * Read framework-config.json
 * @returns {{ framework: string|null, frameworkPath: string|null }}
 */
function readFrameworkConfig() {
  try {
    if (!fs.existsSync('framework-config.json')) {
      return { framework: null, frameworkPath: null };
    }
    const raw = fs.readFileSync('framework-config.json', 'utf-8');
    const config = JSON.parse(raw);
    return {
      framework: config.processFramework || null,
      frameworkPath: config.frameworkPath || null
    };
  } catch (_e) {
    return { framework: null, frameworkPath: null };
  }
}

// ─── Envelope Builders ───

/**
 * Build a success envelope
 * @param {object} context
 * @param {object} gates
 * @param {object} autoTodo
 * @param {Array} warnings
 * @returns {object}
 */
function buildSuccessEnvelope(context, gates, autoTodo, warnings) {
  return {
    ok: true,
    version: SCHEMA_VERSION,
    context: context || {},
    gates: gates || {},
    autoTodo: autoTodo || {},
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
    autoTodo: {},
    errors,
    warnings: [],
    roundTrips: 0
  };
}

// ─── Single Issue Flow ───

/**
 * Run the preamble for a single issue
 * @param {number} issueNum
 * @returns {object} JSON envelope
 */
function runSingleIssue(issueNum) {
  const warnings = [];
  let roundTrips = 0;

  // 1. Gather issue data
  roundTrips++;
  const issueResult = gatherIssueData(issueNum);
  if (issueResult.error) {
    return buildErrorEnvelope([issueResult.error]);
  }

  // 2. Gather branch data
  roundTrips++;
  const branchResult = gatherBranchData(issueNum);
  if (branchResult.error) {
    return buildErrorEnvelope([branchResult.error]);
  }

  // 3. Detect type
  const type = detectIssueType(issueResult.issue);

  // 4. Resolve tracker
  roundTrips++;
  const tracker = resolveTracker();
  if (tracker === null) {
    warnings.push({ code: 'NO_TRACKER', message: 'Could not resolve branch tracker.' });
  }

  // 5. Read framework config
  const frameworkConfig = readFrameworkConfig();

  // 6. Move to in_progress
  roundTrips++;
  const moveResult = moveToInProgress(issueNum);
  const gates = {
    movedToInProgress: moveResult.moved,
    prdTrackerMoved: false
  };
  if (moveResult.error) {
    return buildErrorEnvelope([moveResult.error]);
  }

  // 7. PRD tracker auto-move
  const prdTrackerNum = parsePrdTracker(issueResult.issue.body);
  if (prdTrackerNum) {
    roundTrips++;
    const prdResult = movePrdTracker(prdTrackerNum);
    gates.prdTrackerMoved = prdResult.moved;
    if (prdResult.warning) {
      warnings.push(prdResult.warning);
    }
  }

  // 8. Type-specific data gathering
  let autoTodo;
  const context = {
    issue: issueResult.issue,
    branch: branchResult.branch,
    type,
    tracker,
    framework: frameworkConfig.framework,
    frameworkPath: frameworkConfig.frameworkPath
  };

  if (type === 'epic') {
    // Epic flow: load sub-issues, check statuses, parse order
    roundTrips++;
    const subResult = loadSubIssues(issueNum);
    if (subResult.warning) {
      warnings.push(subResult.warning);
    }
    context.subIssues = subResult.subIssues;

    const subNums = subResult.subIssues.map(s => s.number);
    roundTrips += subResult.subIssues.length; // one gh call per sub-issue status
    const statusResult = checkSubIssueStatuses(subResult.subIssues);
    context.skipped = statusResult.skipped;

    const processingOrder = parseProcessingOrder(issueResult.issue.body, subNums);
    context.processingOrder = processingOrder;

    autoTodo = buildEpicAutoTodo(statusResult.active, processingOrder);
  } else {
    // Standard flow: parse acceptance criteria
    autoTodo = parseAcceptanceCriteria(issueResult.issue.body);
  }

  const envelope = buildSuccessEnvelope(context, gates, autoTodo, warnings);
  envelope.roundTrips = roundTrips;
  return envelope;
}

// ─── Status Query ───

/**
 * Resolve issue numbers from a status query
 * @param {string} status
 * @returns {{ issues: number[] } | { error: { code: string, message: string } }}
 */
function resolveStatusIssues(status) {
  const result = execJSON(
    `gh pmu list --status ${status} --json=number,title`,
    'STATUS_QUERY_FAILED',
    `Failed to query issues in "${status}" status`
  );
  if (result.error) return result;
  const issues = (result.data || []).map(i => i.number);
  return { issues };
}

// ─── Batch Flow ───

/**
 * Run preamble for a single issue using pre-resolved shared config
 * @param {number} issueNum
 * @param {{ tracker: number|null, framework: string|null, frameworkPath: string|null }} shared
 * @returns {object} Per-issue result envelope
 */
function runSingleIssueWithShared(issueNum, shared) {
  const warnings = [];
  let roundTrips = 0;

  roundTrips++;
  const issueResult = gatherIssueData(issueNum);
  if (issueResult.error) {
    return { ok: false, issueNum, errors: [issueResult.error], warnings: [], roundTrips };
  }

  roundTrips++;
  const branchResult = gatherBranchData(issueNum);
  if (branchResult.error) {
    return { ok: false, issueNum, errors: [branchResult.error], warnings: [], roundTrips };
  }

  const type = detectIssueType(issueResult.issue);
  const autoTodo = parseAcceptanceCriteria(issueResult.issue.body);

  const context = {
    issue: issueResult.issue,
    branch: branchResult.branch,
    type,
    tracker: shared.tracker,
    framework: shared.framework,
    frameworkPath: shared.frameworkPath
  };

  const gates = { movedToInProgress: false, prdTrackerMoved: false };

  return {
    ok: true,
    issueNum,
    context,
    gates,
    autoTodo,
    errors: [],
    warnings,
    roundTrips
  };
}

/**
 * Run preamble for multiple issues with shared config resolution
 * @param {number[]} issueNums
 * @returns {object} Batch envelope with results array
 */
function runBatch(issueNums) {
  // Resolve shared config once
  const tracker = issueNums.length > 0 ? resolveTracker() : null;
  const frameworkConfig = readFrameworkConfig();
  const shared = {
    tracker,
    framework: frameworkConfig.framework,
    frameworkPath: frameworkConfig.frameworkPath
  };

  const results = issueNums.map(num => runSingleIssueWithShared(num, shared));

  return {
    ok: true,
    version: SCHEMA_VERSION,
    results,
    warnings: [],
    roundTrips: results.reduce((sum, r) => sum + (r.roundTrips || 0), 0) + (issueNums.length > 0 ? 1 : 0)
  };
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

  if (parsed.mode === 'single') {
    const result = runSingleIssue(parsed.issues[0]);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
    return;
  }

  if (parsed.mode === 'batch') {
    const result = runBatch(parsed.issues);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(0);
    return;
  }

  if (parsed.mode === 'status') {
    const statusResult = resolveStatusIssues(parsed.status);
    if (statusResult.error) {
      const envelope = buildErrorEnvelope([statusResult.error]);
      process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
      process.exit(1);
      return;
    }
    const result = runBatch(statusResult.issues);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
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
  parseArgs,
  gatherIssueData,
  gatherBranchData,
  detectIssueType,
  parseAcceptanceCriteria,
  moveToInProgress,
  parsePrdTracker,
  movePrdTracker,
  resolveTracker,
  readFrameworkConfig,
  buildSuccessEnvelope,
  buildErrorEnvelope,
  runSingleIssue,
  loadSubIssues,
  checkSubIssueStatuses,
  parseProcessingOrder,
  buildEpicAutoTodo,
  resolveStatusIssues,
  runBatch,
  execSafe,
  main
};
