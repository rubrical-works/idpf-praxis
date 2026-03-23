#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.70.0
 * @description Consolidate deterministic setup for the /work command into a single script invocation. Replaces 7-9 sequential tool round-trips. Fetches issue metadata, validates state and labels, detects epic vs story vs branch tracker, checks branch assignment, and returns structured JSON envelope for LLM workflow routing.
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
 * Classifies errors using stderr patterns (TIMEOUT, RATE_LIMIT, AUTH_FAILED, PMU_MISSING).
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
 * Parse command-line arguments
 * @param {string[]} args
 * @returns {{ mode: string, issues: number[] } | { error: { code: string, message: string } }}
 */
function parseArgs(args) {
  if (args.length === 0) {
    return { error: { code: 'MISSING_ARGUMENT', message: 'No arguments provided. Use --issue N, --issues "N,N", or --status <status>.' } };
  }

  // Detect --schema flag (mutually exclusive with other flags)
  const hasSchema = args.includes('--schema');
  if (hasSchema) {
    const hasOther = args.includes('--issue') || args.includes('--issues') || args.includes('--status');
    if (hasOther) {
      return { error: { code: 'MUTUAL_EXCLUSION', message: '--schema cannot be combined with --issue, --issues, or --status.' } };
    }
    return { mode: 'schema' };
  }

  // Detect boolean modifier flags (combinable with any mode)
  const hasAssign = args.includes('--assign');
  const hasWait = args.includes('--wait');

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
    const result = { mode: 'single', issues: [num] };
    if (hasAssign) result.assign = true;
    if (hasWait) result.wait = true;
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
    const result = { mode: 'batch', issues: nums };
    if (hasAssign) result.assign = true;
    if (hasWait) result.wait = true;
    return result;
  }

  const statusIndex = args.indexOf('--status');
  if (statusIndex !== -1) {
    const status = args[statusIndex + 1];
    if (!status) {
      return { error: { code: 'MISSING_ARGUMENT', message: '--status requires a value.' } };
    }
    const result = { mode: 'status', status };
    if (hasAssign) result.assign = true;
    if (hasWait) result.wait = true;
    return result;
  }

  return { error: { code: 'MISSING_ARGUMENT', message: 'No recognized arguments. Use --issue N, --issues "N,N", or --status <status>.' } };
}

// ─── Data Gathering ───

/**
 * Fetch all issue data (issue fields + project status + branch) in a single API call.
 * Replaces separate gatherIssueData + gatherBranchData calls.
 * @param {number} issueNum
 * @returns {Promise<{ issue: object, branch: object } | { error: { code: string, message: string, suggestion?: string } }>}
 */
async function gatherAllData(issueNum) {
  const result = await execJSON(
    `gh pmu view ${issueNum} --json=number,title,labels,body,state,status,branch`,
    'NOT_FOUND',
    `Issue #${issueNum} not found`
  );
  if (result.error) return result;
  if (result.data.state === 'CLOSED') {
    return { error: { code: 'CLOSED', message: `Issue #${issueNum} is already closed.` } };
  }
  if (!result.data.branch) {
    return { error: { code: 'NO_BRANCH', message: `Issue #${issueNum} is not assigned to a branch.`, suggestion: `Run /assign-branch #${issueNum} first.` } };
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
    branch: {
      branch: result.data.branch,
      status: result.data.status
    }
  };
}

/**
 * Fetch issue data only (without branch requirement) for assignability check.
 * @param {number} issueNum
 * @returns {Promise<{ issue: object } | { error: { code: string, message: string } }>}
 */
async function gatherIssueOnly(issueNum) {
  const result = await execJSON(
    `gh pmu view ${issueNum} --json=number,title,labels,body,state`,
    'NOT_FOUND',
    `Issue #${issueNum} not found`
  );
  if (result.error) return result;
  if (result.data.state === 'CLOSED') {
    return { error: { code: 'CLOSED', message: `Issue #${issueNum} is already closed.` } };
  }
  // Normalize labels: gh pmu view returns flat strings, wrap in objects for compatibility
  const rawLabels = result.data.labels || [];
  const normalizedLabels = rawLabels.map(l => typeof l === 'string' ? { name: l } : l);
  return { issue: { ...result.data, labels: normalizedLabels } };
}

/**
 * Check branch assignment for an issue (used by checkAssignability).
 * @param {number} issueNum
 * @returns {Promise<{ branch: object } | { error: { code: string, message: string, suggestion?: string } }>}
 */
async function gatherBranchData(issueNum) {
  const result = await execJSON(
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
 * @returns {string} "branch" | "epic" | "standard"
 */
function detectIssueType(issueData) {
  const labels = (issueData.labels || []).map(l => l.name);
  if (labels.includes('branch')) return 'branch';
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
 * @returns {Promise<{ subIssues: Array<{ number: number, title: string }>, warning?: object }>}
 */
async function loadSubIssues(issueNum) {
  const result = await execJSON(
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
 * Check statuses of sub-issues and classify as skipped or active.
 * Parallelizes status checks for all sub-issues.
 * @param {Array<{ number: number, title: string }>} subIssues
 * @returns {Promise<{ skipped: Array<{ number: number, status: string }>, active: Array<{ number: number, title: string }> }>}
 */
async function checkSubIssueStatuses(subIssues, timeoutMs = 30000) {
  const skipped = [];
  const active = [];
  const skipStatuses = ['in review', 'done'];

  // Parallelize all sub-issue status checks with timeout (#1883)
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Sub-issue status check timed out after ${timeoutMs / 1000}s`)), timeoutMs)
  );
  const statusResults = await Promise.race([
    Promise.all(
      subIssues.map(async (sub) => {
        try {
          const { stdout } = await execAsync(`gh pmu view ${sub.number} --json=status`, EXEC_OPTS);
          const data = JSON.parse(stdout.trim());
          return { sub, status: data.status };
        } catch (_e) {
          return { sub, status: null };
        }
      })
    ),
    timeoutPromise
  ]);

  for (const { sub, status } of statusResults) {
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
 * @returns {Promise<{ moved: boolean, error?: { code: string, message: string } }>}
 */
async function moveToInProgress(issueNum) {
  try {
    await execAsync(`gh pmu move ${issueNum} --status in_progress`, EXEC_OPTS);
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
 * @returns {Promise<{ moved: boolean, warning?: { code: string, message: string } }>}
 */
async function movePrdTracker(trackerNum) {
  // Check current status
  const statusResult = await execJSON(
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
    await execAsync(`gh pmu move ${trackerNum} --status in_progress`, EXEC_OPTS);
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
 * @returns {Promise<number|null>} Tracker issue number or null
 */
async function resolveTracker() {
  const output = await execSafe('gh pmu branch current');
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

// ─── Assignment Support (--assign flag) ───

/**
 * Get the current git branch name
 * @returns {Promise<string|null>} Branch name or null on failure
 */
async function getCurrentBranch() {
  const output = await execSafe('git branch --show-current');
  return output ? output.trim() : null;
}

/**
 * Check whether an issue can be assigned to the target branch.
 * Returns assignable: true if the issue is unassigned or already on the target branch.
 * Returns assignable: false with error if assigned to a different branch or blocked by workstream.
 * @param {number} issueNum
 * @param {string} targetBranch - Branch to assign to
 * @param {object|null} [workstreams] - Parsed .workstreams.json (optional)
 * @returns {Promise<{ assignable: boolean, alreadyAssigned?: boolean, error?: { code: string, message: string } }>}
 */
async function checkAssignability(issueNum, targetBranch, workstreams) {
  // Check current branch assignment
  const branchResult = await gatherBranchData(issueNum);
  if (branchResult.error && branchResult.error.code === 'NO_BRANCH') {
    // Unassigned — check workstream conflicts before allowing
    if (workstreams && workstreams.streams) {
      for (const stream of workstreams.streams) {
        if (stream.status !== 'active') continue;
        if ((stream.epics || []).includes(issueNum) && stream.branch !== targetBranch) {
          return {
            assignable: false,
            error: {
              code: 'WORKSTREAM_CONFLICT',
              message: `Issue #${issueNum} is allocated to branch "${stream.branch}" by /plan-workstreams. Use /assign-branch directly to override.`
            }
          };
        }
      }
    }
    return { assignable: true };
  }
  if (branchResult.error) {
    return { assignable: false, error: branchResult.error };
  }

  // Issue has a branch — check if it matches
  if (branchResult.branch.branch === targetBranch) {
    return { assignable: true, alreadyAssigned: true };
  }

  return {
    assignable: false,
    error: {
      code: 'ALREADY_ASSIGNED',
      message: `Issue #${issueNum} is already assigned to branch "${branchResult.branch.branch}". Cannot reassign with --assign.`
    }
  };
}

/**
 * Perform assignment of an issue to the current branch via assign-branch.js
 * @param {number} issueNum
 * @returns {Promise<{ assigned: boolean, error?: { code: string, message: string } }>}
 */
async function performAssignment(issueNum) {
  const scriptPath = path.join(__dirname, 'assign-branch.js');
  try {
    await execAsync(`node "${scriptPath}" "#${issueNum}"`, EXEC_OPTS);
    return { assigned: true };
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().trim() : e.message;
    return {
      assigned: false,
      error: { code: 'ASSIGN_FAILED', message: `Failed to assign #${issueNum} to current branch: ${msg}` }
    };
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
 * Run the preamble for a single issue.
 * Uses consolidated API calls and parallelized I/O for performance.
 * @param {number} issueNum
 * @param {object} [options] - Optional flags
 * @param {boolean} [options.assign] - If true, assign issue to current branch before proceeding
 * @returns {Promise<object>} JSON envelope
 */
async function runSingleIssue(issueNum, options) {
  const warnings = [];
  let roundTrips = 0;
  const assignRequested = options && options.assign;
  let assignGate = false;

  // 1. Assignment flow (if --assign requested)
  if (assignRequested) {
    // Need issue data first to check if it exists, then check assignability
    roundTrips++;
    const issueCheck = await gatherIssueOnly(issueNum);
    if (issueCheck.error) {
      return buildErrorEnvelope([issueCheck.error]);
    }

    roundTrips++;
    const currentBranch = await getCurrentBranch();
    if (!currentBranch) {
      return buildErrorEnvelope([{ code: 'NO_CURRENT_BRANCH', message: 'Could not determine current git branch.' }]);
    }

    // Load workstreams metadata for conflict check
    let workstreams = null;
    try {
      const wsPath = path.join(process.cwd(), '.workstreams.json');
      if (fs.existsSync(wsPath)) {
        workstreams = JSON.parse(fs.readFileSync(wsPath, 'utf-8'));
      }
    } catch (_e) {
      // No workstreams file or parse error — proceed without conflict check
    }

    const assignCheck = await checkAssignability(issueNum, currentBranch, workstreams);
    if (!assignCheck.assignable) {
      return buildErrorEnvelope([assignCheck.error]);
    }

    if (!assignCheck.alreadyAssigned) {
      roundTrips++;
      const assignResult = await performAssignment(issueNum);
      if (!assignResult.assigned) {
        return buildErrorEnvelope([assignResult.error]);
      }
      assignGate = true;
    }
  }

  // 2. Parallel: gather all data (single consolidated call) + resolve tracker
  //    These are independent — tracker resolution only needs the current branch.
  const [dataResult, tracker] = await Promise.all([
    gatherAllData(issueNum),
    resolveTracker()
  ]);
  roundTrips++; // gatherAllData = 1 consolidated call
  roundTrips++; // resolveTracker

  if (dataResult.error) {
    return buildErrorEnvelope([dataResult.error]);
  }

  if (tracker === null) {
    warnings.push({ code: 'NO_TRACKER', message: 'Could not resolve branch tracker.' });
  }

  // 3. Detect type + read framework config (both sync, no I/O)
  const type = detectIssueType(dataResult.issue);
  const frameworkConfig = readFrameworkConfig();

  // 4. Move to in_progress
  roundTrips++;
  const moveResult = await moveToInProgress(issueNum);
  const gates = {
    assigned: assignGate,
    movedToInProgress: moveResult.moved,
    prdTrackerMoved: false
  };
  if (moveResult.error) {
    return buildErrorEnvelope([moveResult.error]);
  }

  // 5. PRD tracker auto-move
  const prdTrackerNum = parsePrdTracker(dataResult.issue.body);
  if (prdTrackerNum) {
    roundTrips++;
    const prdResult = await movePrdTracker(prdTrackerNum);
    gates.prdTrackerMoved = prdResult.moved;
    if (prdResult.warning) {
      warnings.push(prdResult.warning);
    }
  }

  // 6. Type-specific data gathering
  let autoTodo;
  const context = {
    issue: dataResult.issue,
    branch: dataResult.branch,
    type,
    tracker,
    framework: frameworkConfig.framework,
    frameworkPath: frameworkConfig.frameworkPath,
    ...(options && options.wait ? { wait: true } : {})
  };

  if (type === 'epic' || type === 'branch') {
    // Epic/Branch flow: load sub-issues, check statuses (parallelized), determine order
    roundTrips++;
    const subResult = await loadSubIssues(issueNum);
    if (subResult.warning) {
      warnings.push(subResult.warning);
    }
    context.subIssues = subResult.subIssues;

    const subNums = subResult.subIssues.map(s => s.number);

    // Branch tracker with no sub-issues: provide guidance
    if (type === 'branch' && subNums.length === 0) {
      warnings.push({
        code: 'NO_SUB_ISSUES',
        message: 'Branch tracker has no sub-issues. Use /assign-branch #N to assign issues to this branch.'
      });
    }

    roundTrips += subResult.subIssues.length; // parallelized but still counted
    const statusResult = await checkSubIssueStatuses(subResult.subIssues);
    context.skipped = statusResult.skipped;

    // Branch trackers always use ascending numeric order (no custom Processing Order)
    const processingOrder = type === 'branch'
      ? [...subNums].sort((a, b) => a - b)
      : parseProcessingOrder(dataResult.issue.body, subNums);
    context.processingOrder = processingOrder;

    autoTodo = buildEpicAutoTodo(statusResult.active, processingOrder);

    // Branch tracker with all sub-issues complete: suggest next step
    if (type === 'branch' && subNums.length > 0 && statusResult.active.length === 0) {
      warnings.push({
        code: 'ALL_SUB_ISSUES_COMPLETE',
        message: 'All sub-issues are complete. Consider running /merge-branch or /prepare-release.'
      });
    }
  } else {
    // Standard flow: parse acceptance criteria
    autoTodo = parseAcceptanceCriteria(dataResult.issue.body);
  }

  const envelope = buildSuccessEnvelope(context, gates, autoTodo, warnings);
  envelope.roundTrips = roundTrips;
  return envelope;
}

// ─── Status Query ───

/**
 * Resolve issue numbers from a status query
 * @param {string} status
 * @returns {Promise<{ issues: number[] } | { error: { code: string, message: string } }>}
 */
async function resolveStatusIssues(status) {
  const result = await execJSON(
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
 * @param {object} [options] - Optional flags (e.g., { assign: true })
 * @returns {Promise<object>} Per-issue result envelope
 */
async function runSingleIssueWithShared(issueNum, shared, options) {
  const warnings = [];
  let roundTrips = 0;
  const assignRequested = options && options.assign;
  let assignGate = false;

  roundTrips++;
  const issueResult = await gatherIssueOnly(issueNum);
  if (issueResult.error) {
    return { ok: false, issueNum, errors: [issueResult.error], warnings: [], roundTrips };
  }

  // --assign: check assignability and perform assignment
  if (assignRequested) {
    roundTrips++;
    const currentBranch = await getCurrentBranch();
    if (!currentBranch) {
      return { ok: false, issueNum, errors: [{ code: 'NO_CURRENT_BRANCH', message: 'Could not determine current git branch.' }], warnings: [], roundTrips };
    }

    const assignCheck = await checkAssignability(issueNum, currentBranch);
    if (!assignCheck.assignable) {
      return { ok: false, issueNum, errors: [assignCheck.error], warnings: [], roundTrips };
    }

    if (!assignCheck.alreadyAssigned) {
      roundTrips++;
      const assignResult = await performAssignment(issueNum);
      if (!assignResult.assigned) {
        return { ok: false, issueNum, errors: [assignResult.error], warnings: [], roundTrips };
      }
      assignGate = true;
    }
  }

  roundTrips++;
  const branchResult = await gatherBranchData(issueNum);
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

  const gates = { assigned: assignGate, movedToInProgress: false, prdTrackerMoved: false };

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
 * @param {object} [options] - Optional flags (e.g., { assign: true })
 * @returns {Promise<object>} Batch envelope with results array
 */
async function runBatch(issueNums, options) {
  // Resolve shared config once
  const tracker = issueNums.length > 0 ? await resolveTracker() : null;
  const frameworkConfig = readFrameworkConfig();
  const shared = {
    tracker,
    framework: frameworkConfig.framework,
    frameworkPath: frameworkConfig.frameworkPath
  };

  // Process issues sequentially (order matters for side effects)
  const results = [];
  for (const num of issueNums) {
    results.push(await runSingleIssueWithShared(num, shared, options));
  }

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

  if (parsed.mode === 'schema') {
    const schema = {
      context: {
        name: 'context',
        type: 'object',
        description: 'Issue data (number, title, labels, body, state), branch/status data, type ("branch"/"epic"/"standard"), tracker number, framework config, sub-issues, skipped, and processing order.'
      },
      gates: {
        name: 'gates',
        type: 'object',
        description: 'Boolean gate results: assigned, movedToInProgress, prdTrackerMoved.'
      },
      autoTodo: {
        name: 'autoTodo',
        type: 'object',
        description: 'Auto-generated TODO list. Standard: { source: "acceptance_criteria", items: [{ text, checked }] }. Epic/Branch: { source: "sub_issues", items: [{ number, title }] }.'
      },
      warnings: {
        name: 'warnings',
        type: 'array',
        description: 'Non-blocking warnings (e.g., NO_SUB_ISSUES, ALL_SUB_ISSUES_COMPLETE). Each has code and message.'
      }
    };
    process.stdout.write(JSON.stringify(schema, null, 2) + '\n');
    process.exit(0);
    return;
  }

  const options = {};
  if (parsed.assign) options.assign = true;
  if (parsed.wait) options.wait = true;

  if (parsed.mode === 'single') {
    const result = await runSingleIssue(parsed.issues[0], options);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
    return;
  }

  if (parsed.mode === 'batch') {
    const result = await runBatch(parsed.issues, options);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(0);
    return;
  }

  if (parsed.mode === 'status') {
    const statusResult = await resolveStatusIssues(parsed.status);
    if (statusResult.error) {
      const envelope = buildErrorEnvelope([statusResult.error]);
      process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
      process.exit(1);
      return;
    }
    const result = await runBatch(statusResult.issues, options);
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
  gatherAllData,
  gatherIssueOnly,
  gatherBranchData,
  detectIssueType,
  parseAcceptanceCriteria,
  moveToInProgress,
  parsePrdTracker,
  movePrdTracker,
  resolveTracker,
  readFrameworkConfig,
  getCurrentBranch,
  checkAssignability,
  performAssignment,
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
