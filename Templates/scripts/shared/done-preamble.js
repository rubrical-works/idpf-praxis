#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.121.0
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

const fs = require('fs');
const path = require('path');
const { execTimedAsync } = require('./lib/exec.js');
const { findRetired, wantsHelp, helpEnvelope } = require('./lib/command-args.js');

// Every spawn here goes through the timed wrapper (#2469). classifyError has
// always had a TIMEOUT branch; until these spawns were bounded there was no
// input that could reach it.
const execAsync = execTimedAsync;
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

  // --help takes precedence over every other argument and performs no action (#3030).
  if (wantsHelp(args)) return { mode: 'help' };
  // `-y` was dropped for `--yes` (#3030); refused rather than silently ignored.
  const retired = findRetired('done', args);
  if (retired) return { error: { code: 'RETIRED_ARGUMENT', message: retired.message } };

  const forceMove = args.includes('--force-move');
  const yes = args.includes('--yes');
  // --release-handoff performs the post-release gate hand-off (#3453); only
  // carried when given, so existing envelopes are unchanged.
  const releaseHandoff = args.includes('--release-handoff');
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
    if (releaseHandoff) result.releaseHandoff = true;
    if (yes) result.yes = true;
    return result;
  }

  const issuesIndex = args.indexOf('--issues');
  if (issuesIndex !== -1) {
    const raw = args[issuesIndex + 1];
    if (!raw) {
      return { error: { code: 'MISSING_ARGUMENT', message: '--issues requires a comma-separated list.' } };
    }
    // #3668: the same round-trip check --issue applies, per element — parseInt
    // alone read '12abc' as 12.
    const tokens = raw.split(',').map(s => s.trim().replace(/^#/, ''));
    const nums = tokens.map(t => parseInt(t, 10));
    if (nums.some((n, i) => isNaN(n) || n <= 0 || String(n) !== tokens[i])) {
      return { error: { code: 'INVALID_ARGUMENT', message: `Invalid issue numbers in: "${raw}".` } };
    }
    const result = { mode: 'batch', issues: nums, forceMove };
    if (releaseHandoff) result.releaseHandoff = true;
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
    `gh pmu view ${issueNum} --json=number,title,labels,body,state,status,parentIssue`,
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
    status: (result.data.status || '').toLowerCase(),
    parent: result.data.parentIssue || null
  };
}

// ─── Default-Mode Epic Continuation (#3325) ───

const labelNames = (labels) => (labels || []).map(l => (typeof l === 'string' ? l : l && l.name));
/** The one epic-label predicate (#3667): labels as objects or strings; null entries tolerated. */
const hasEpicLabel = (labels) => labelNames(labels).includes('epic');
const PROCESSED_STATUSES = new Set(['in review', 'in_review', 'done']);

/**
 * Decide whether /done on a sub-issue hands back to /work on its parent epic.
 * A default-mode epic advances one sub-issue per `/work #<epic>` invocation, so
 * the continuation is due while an open sibling is still unprocessed — not In
 * review, not Done, and not qa-required (which /work skips for /qa).
 * @param {{ issueNumber: number, parent: { number: number, labels: Array }|null,
 *           siblings: Array<{ number: number, status?: string, labels?: Array }> }} input
 * @returns {{ epic: number, remaining: number[], guidance: string[] }|null}
 */
function buildEpicContinuation({ issueNumber, parent, siblings }) {
  if (!parent || !hasEpicLabel(parent.labels)) return null;
  const remaining = (siblings || [])
    .filter(s => s.number !== issueNumber)
    .filter(s => !PROCESSED_STATUSES.has(String(s.status || '').toLowerCase()))
    .filter(s => !labelNames(s.labels).includes('qa-required'))
    .map(s => s.number);
  if (remaining.length === 0) return null;
  return { epic: parent.number, remaining, guidance: [`Next: /work #${parent.number}`] };
}

/**
 * Look up the parent epic's open siblings and build the continuation.
 * No parent → no call. Every lookup failure is a warning, never a /done failure.
 * @param {number} issueNum
 * @param {{ number: number }|null} parentRef - `parentIssue` from the issue view
 * @param {Function} [execJSONFn] - injectable for tests
 * @returns {Promise<{ nextSteps: object|null, calls: number, warning?: string }>}
 */
async function resolveEpicContinuation(issueNum, parentRef, execJSONFn = execJSON) {
  if (!parentRef || !parentRef.number) return { nextSteps: null, calls: 0 };
  const epicNum = parentRef.number;
  // A { code, message } object like every other warnings[] entry (#3357).
  const warning = {
    code: 'EPIC_CONTINUATION_UNAVAILABLE',
    message: `Could not check parent #${epicNum} for unprocessed sub-issues; run /work #${epicNum} if any remain.`,
  };
  const parentResult = await execJSONFn(`gh pmu view ${epicNum} --json=labels,subIssues`, 'NOT_FOUND', `Issue #${epicNum} not found`);
  if (parentResult.error) return { nextSteps: null, calls: 1, warning };
  const parent = { number: epicNum, labels: parentResult.data.labels };
  if (!hasEpicLabel(parent.labels)) return { nextSteps: null, calls: 1 };
  const open = (parentResult.data.subIssues || [])
    .filter(s => String(s.state || '').toUpperCase() === 'OPEN' && s.number !== issueNum)
    .map(s => s.number);
  if (open.length === 0) return { nextSteps: null, calls: 1 };
  const sibResult = await execJSONFn(`gh pmu view ${open.join(' ')} --json=number,status,labels`, 'NOT_FOUND', 'Sub-issues not found');
  if (sibResult.error) return { nextSteps: null, calls: 2, warning };
  const siblings = Array.isArray(sibResult.data) ? sibResult.data : [sibResult.data];
  return { nextSteps: buildEpicContinuation({ issueNumber: issueNum, parent, siblings }), calls: 2 };
}

// ─── Label Detection ───

/**
 * Check if issue has PRD label
 * @param {Array<{ name: string }>} labels
 * @returns {boolean}
 */
function hasPrdLabel(labels) {
  return labelNames(labels).includes('prd');
}

/**
 * Check if issue is an approval gate (test-plan + approval-required)
 * @param {Array<{ name: string }>} labels
 * @returns {boolean}
 */
function isApprovalGate(labels) {
  const names = labelNames(labels);
  return names.includes('test-plan') && names.includes('approval-required');
}

// ─── Move Eligibility and the Epic Guard Skip Signal (#2670) ───

/**
 * Would a move to Done be attempted, ignoring the epic guard?
 * @param {boolean} forceMove
 * @param {{ requiresConfirmation?: boolean }|null} diffVerification
 * @returns {boolean}
 */
function isMoveEligible(forceMove, diffVerification) {
  return Boolean(forceMove || (diffVerification && !diffVerification.requiresConfirmation));
}

/**
 * Classify whether the epic guard (#2367) suppressed a move that would
 * otherwise have happened, so the envelope can report it (#2670).
 *
 * Emits a reason ONLY when a move was actually suppressed. An epic reached
 * without --force-move and without a clean diff verification would not have
 * moved anyway, so reporting a skip there would restate the guard rather than
 * report an event -- the same vacuous signal this exists to replace.
 *
 * @param {{ labels?: Array<{ name: string }>, forceMove?: boolean, diffVerification?: object|null }} input
 * @returns {{ skippedReason: string|null, warning: { code: string, message: string }|null }}
 */
function classifyMoveSkip({ labels, forceMove, diffVerification } = {}) {
  if (!hasEpicLabel(labels) || !isMoveEligible(forceMove, diffVerification)) {
    return { skippedReason: null, warning: null };
  }
  return {
    skippedReason: 'epic-guard',
    warning: {
      code: 'EPIC_MOVE_SKIPPED',
      message: 'Move to Done was suppressed by the epic guard (#2367): this issue '
        + 'carries the epic label, so the /done epic flow closes sub-issues first, '
        + 'then closes the epic explicitly with gh pmu move <epic> --status done '
        + '--force. The preamble will not move it.'
    }
  };
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

/**
 * Next-step guidance for an approval-gate issue (#1481, #1867, #3641).
 *
 * The tracker comes from the body's `#N` reference when there is one; for a
 * test plan approval that cites its PRD by file path, it comes from the
 * lifecycle-box lookup (#3636) this run already made — never a second search,
 * so the guidance and `gates.lifecycleBox` cannot name different trackers. An
 * ambiguous, failed or empty lookup names no tracker.
 *
 * @param {{ labels: Array<{name:string}>, body: string, lifecycleBox?: object|null }} input
 * @returns {{ prdTracker: number|null, guidance: string[] }|null} null when not an approval gate
 */
function buildApprovalNextSteps({ labels, body, lifecycleBox = null }) {
  if (!isApprovalGate(labels)) return null;
  const isTestPlanApproval = labelNames(labels).includes('test-plan');
  let prdRef = parsePrdReference(body);
  if (!prdRef && isTestPlanApproval && lifecycleBox && lifecycleBox.tracker
      && lifecycleBox.reason !== 'ambiguous-tracker') {
    prdRef = lifecycleBox.tracker;
  }
  // A test plan approval implies a reviewed PRD (test plans are derived from
  // reviewed PRDs) — no PRD review suggestion (#1867).
  if (prdRef && isTestPlanApproval) {
    return { prdTracker: prdRef, guidance: [`/create-backlog #${prdRef} — decompose into epics/stories`] };
  }
  if (prdRef) {
    return {
      prdTracker: prdRef,
      guidance: [
        `/review-prd #${prdRef} — review the PRD before decomposition`,
        `/create-backlog #${prdRef} — decompose into epics/stories (after review)`
      ]
    };
  }
  return { prdTracker: null, guidance: ['Review the linked PRD before running /create-backlog.'] };
}

/** Combine approval guidance with the epic continuation (#3325); either may be null. */
function mergeNextSteps(approval, continuation) {
  if (!continuation) return approval;
  if (!approval) return continuation;
  return { ...approval, ...continuation, guidance: [...approval.guidance, ...continuation.guidance] };
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

// ─── PRD tracker lifecycle box (#3636) ───

/**
 * Check `Test plan approved` on the PRD tracker when a test plan approval
 * issue — `test-plan` + `approval-required`, per isApprovalGate — moves to Done. #2694 left this box to "the command that closes" the
 * approval issue; /done is that command and never wrote it, so the box stayed
 * unchecked for the life of every tracker.
 *
 * The tracker is resolved by prd-tracker-lookup.js (the approval issue cites
 * the PRD file, not the tracker), and the box is written by label and
 * fence-aware through review-ac-checkoff.js — with this approval issue as the
 * reference, so a box naming another approval issue is left alone.
 *
 * Advisory: never throws, never blocks the close. No tracker (an Extract Mode
 * PRD) is a reported outcome, not a warning; a failed lookup or write is a
 * coded warning.
 *
 * @returns {null | { result: {tracker, label, checked, reason}, warning?: {code, message} }}
 */
function applyTestPlanApprovedBox({ issueNum, labels, body, deps = {} }) {
  // One predicate with the approval guidance (#3667): a bare `test-plan`
  // issue is not an approval issue and never claims the box.
  if (!isApprovalGate(labels)) return null;
  const label = 'Test plan approved';
  const fail = (tracker, reason, detail) => ({
    result: { tracker, label, checked: false, reason },
    warning: { code: 'LIFECYCLE_BOX_FAILED', message: `Could not check "${label}" for approval issue #${issueNum}${tracker ? ` on PRD tracker #${tracker}` : ''}: ${detail}` },
  });
  // Dependencies resolve inside the try (#3667): this runs after the move to
  // Done, so a module that fails to load is a lookup failure, never a throw.
  const load = deps.load || require;
  let lookup;
  let check;
  try {
    const resolve = deps.resolvePrdTracker || load('./lib/prd-tracker-lookup.js').resolvePrdTracker;
    check = deps.checkLifecycleBox || load('./review-ac-checkoff.js').checkLifecycleBox;
    lookup = resolve({ approvalIssue: issueNum, body });
  } catch (e) {
    return fail(null, 'lookup-failed', e.message);
  }
  if (!lookup || lookup.ok !== true) {
    return fail(null, 'lookup-failed', ((lookup && lookup.warnings) || []).join('; ') || 'tracker search failed');
  }
  if (!lookup.tracker) return { result: { tracker: null, label, checked: false, reason: 'no-tracker' } };
  // Several trackers name the same PRD path: resolvePrdTracker picks the
  // first, and a box with no `#N` would pass the reference guard. Writing a
  // guess is worse than writing nothing — warn, name the candidates, skip.
  if ((lookup.warnings || []).includes('ambiguous-path-match')) {
    const names = (lookup.candidates || [lookup.tracker]).map((n) => `#${n}`).join(', ');
    return fail(lookup.tracker, 'ambiguous-tracker', `${names} all name the same PRD path; check the box on the right tracker by hand`);
  }
  let out;
  try {
    out = check(lookup.tracker, label, { reference: issueNum });
  } catch (e) {
    return fail(lookup.tracker, 'write-failed', e.message);
  }
  if (!out || out.ok !== true) return fail(lookup.tracker, (out && out.reason) || 'write-failed', (out && out.error) || 'unknown error');
  return { result: { tracker: lookup.tracker, label, checked: out.checked === true, reason: out.reason } };
}

// ─── Post-release gate hand-off (#3453) ───
//
// A `→ GATE: release` criterion whose check can only run after the release
// deploys has no step that can check it: /prepare-release closes the branch
// tracker (moving every open sub-issue to Backlog) before the tag push that
// starts the deploy. When an issue's only unchecked boxes are such gates,
// /done hands each to a standalone QA issue — off the tracker, in qa_required
// — checks the box with a pointer to it, and lets the issue close. Detection
// runs before any `gh pmu move`, so a `.gh-pmu.json` `checkboxGateMarkers`
// that lets the move accept gate lines can never skip the hand-off.

const GATE_MARKERS_PATH = path.join(__dirname, '..', '..', 'metadata', 'ac-gate-markers.json');
const QA_CONFIG_PATH = path.join(__dirname, 'lib', 'qa-config.json');

function releaseGatePattern(markersPath = GATE_MARKERS_PATH) {
  const markers = JSON.parse(fs.readFileSync(markersPath, 'utf8')).markers || [];
  const release = markers.find((m) => m.id === 'gate-release');
  if (!release) throw new Error('ac-gate-markers.json has no gate-release marker');
  return new RegExp(release.pattern);
}

/**
 * Whether an issue body can be handed off: every unchecked checkbox line
 * carries `→ GATE: release`. Any other unchecked line — plain work, an open
 * `→ QA: #N` gate, a `→ GATE: review` — blocks, so the move refuses it as
 * before. Checkboxes are read by lib/checkbox-scan.js — line-start, outside
 * code fences — the way `gh pmu move` counts them.
 * @param {string} body
 * @returns {{eligible: boolean, gated: Array<{index: number, line: string, criterion: string}>, blocking: string[]}}
 *   `index` is the box's line index in the LF-normalized body, as scanCheckboxes returns it.
 */
function classifyReleaseGates(body, markersPath = GATE_MARKERS_PATH) {
  const { scanCheckboxes } = require('./lib/checkbox-scan.js');
  const pattern = releaseGatePattern(markersPath);
  const text = String(body || '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const gated = [];
  const blocking = [];
  for (const box of scanCheckboxes(text)) {
    if (box.checked) continue;
    const line = lines[box.line];
    if (pattern.test(box.text)) {
      gated.push({ index: box.line, line, criterion:box.text.replace(/\s*→ GATE: release\s*$/, '').trim() });
    } else {
      blocking.push(line.trim());
    }
  }
  return { eligible: gated.length > 0 && blocking.length === 0, gated, blocking };
}

/**
 * classifyReleaseGates for runSingleIssue, which must not throw (#3465): an
 * unreadable ac-gate-markers.json — missing, not JSON, no gate-release marker
 * — is a coded warning, never an UNEXPECTED envelope. No hand-off is offered
 * then; `gh pmu move` still validates the checkboxes itself.
 * @returns {{ gates: {eligible: boolean, gated: Array, blocking?: string[]}, warning: {code: string, message: string}|null }}
 */
function readReleaseGates(issueNum, body, markersPath) {
  try {
    return { gates: classifyReleaseGates(body, markersPath), warning: null };
  } catch (e) {
    return {
      gates: { eligible: false, gated: [] },
      warning: { code: 'RELEASE_GATE_MARKERS_UNREADABLE', message: `Release-gate markers could not be read, so no post-release hand-off was offered for #${issueNum}: ${(e && e.message) || e}` },
    };
  }
}

/**
 * The body with each handed-off box checked and pointed at its QA issue.
 * Boxes are addressed by the line index classifyReleaseGates reports, never
 * by line text (#3470): two identical gated lines are two boxes, and each
 * gets its own QA number.
 * @param {string} body
 * @param {Array<{index: number, qaNumber: number}>} handoffs
 */
function applyReleaseHandoff(body, handoffs) {
  const lines = String(body || '').replace(/\r\n/g, '\n').split('\n');
  for (const { index, qaNumber } of handoffs) {
    if (!Number.isInteger(index) || index < 0 || index >= lines.length) continue;
    lines[index] = `${lines[index].replace('[ ]', '[x]').replace(/\s+$/, '')} → QA: #${qaNumber}`;
  }
  return lines.join('\n');
}

/** The QA issue body, in the same template /work Step 4a files. */
function buildHandoffQaBody({ parent, parentTitle, criterion }, configPath = QA_CONFIG_PATH) {
  const template = JSON.parse(fs.readFileSync(configPath, 'utf8')).bodyTemplate;
  const steps = [
    `1. After the release that ships #${parent} has deployed, check: ${criterion}`,
    '2. Record the evidence (run or scan URL, output) in a comment on this issue.',
    `3. Close with \`/qa\` once it holds. #${parent} was closed by \`/done\` with this check handed off (post-release gate, #3453).`,
  ].join('\n');
  return template
    .replace('{acDescription}', criterion)
    .replace('{parentIssue}', String(parent))
    .replace('{parentTitle}', parentTitle || '')
    .replace('{steps}', steps)
    .replace('{expectedResult}', `${criterion} — holds after the release deploys.`);
}

async function defaultWriteBody(issueNum, body) {
  const tmp = `.tmp-${issueNum}.md`;
  fs.writeFileSync(tmp, body);
  try {
    await execAsync(`gh pmu edit ${issueNum} -F ${tmp}`, EXEC_OPTS);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/**
 * File one standalone QA issue per gated criterion, then rewrite the parent's
 * boxes. A filing failure — returned `ok: false` or thrown (#3734) — stops
 * the run; the boxes already filed are still
 * rewritten, so no QA issue is left without the pointer that explains it.
 * A body write that fails returns `BODY_WRITE_FAILED` with `handedOff`, so
 * the numbers of the issues already filed are never lost (#3465).
 */
async function runReleaseHandoff(issueNum, { issue, fileQaFn, writeBodyFn = defaultWriteBody, markersPath } = {}) {
  const classified = classifyReleaseGates(issue.body, markersPath);
  if (!classified.eligible) {
    return {
      ok: false,
      handedOff: [],
      error: { code: 'NOT_RELEASE_GATED', message: `#${issueNum} has unchecked criteria that are not post-release gates`, blocking: classified.blocking },
    };
  }
  const file = fileQaFn || require('./lib/qa-issue.js').fileQaIssue;
  const handedOff = [];
  const lines = [];
  let failure = null;
  for (const { index, criterion } of classified.gated) {
    const bodyPath = `.tmp-qa-body-${require('crypto').randomBytes(4).toString('hex')}.md`;
    fs.writeFileSync(bodyPath, buildHandoffQaBody({ parent: issueNum, parentTitle: issue.title, criterion }));
    let r;
    try {
      r = await file({ title: `QA: ${criterion}`, bodyPath });
    } catch (e) {
      // A throw is a failed filing like any other (#3734): rejecting here
      // would discard handedOff and leave the boxes already filed unrewritten.
      r = { ok: false, error: (e && e.message) || String(e) };
    } finally {
      fs.rmSync(bodyPath, { force: true });
    }
    if (!r || !r.ok) {
      failure = { code: 'QA_FILING_FAILED', message: `QA issue for "${criterion}" was not filed: ${(r && r.error) || 'unknown error'}` };
      break;
    }
    handedOff.push({ criterion, qaNumber: r.number, status: r.status });
    lines.push({ index, qaNumber: r.number });
  }
  let body = issue.body;
  if (lines.length) {
    body = applyReleaseHandoff(issue.body, lines);
    try {
      await writeBodyFn(issueNum, body);
    } catch (e) {
      // The QA issues exist but the parent's boxes do not point at them
      // (#3465). Return their numbers: a re-run would file each one again.
      const filed = handedOff.map((h) => `#${h.qaNumber}`).join(', ');
      return {
        ok: false,
        handedOff,
        error: {
          code: 'BODY_WRITE_FAILED',
          message: `QA issue${handedOff.length === 1 ? '' : 's'} ${filed} filed, but the body of #${issueNum} was not rewritten: ${(e && e.message) || e}. `
            + `Check each handed-off box by hand and append its "→ QA: #N" pointer; do not re-run --release-handoff, which would file duplicates.`
            + (failure ? ` Also: ${failure.message}` : ''),
        },
      };
    }
  }
  return failure ? { ok: false, handedOff, body, error: failure } : { ok: true, handedOff, body };
}

// ─── Single Issue Flow ───

/**
 * Run the done preamble for a single issue.
 * Parallelizes data gathering and diff verification for performance.
 * @param {number} issueNum
 * @param {object} [options]
 * @param {boolean} [options.forceMove] - Move to Done without diff verification
 *   (verification is skipped entirely, and the move needs no confirmation).
 * @param {boolean} [options.releaseHandoff] - Consent to hand each post-release
 *   `→ GATE: release` criterion to a standalone QA issue before the move (#3453).
 * @param {boolean} [options.yes] - Fix both consents in advance (#3658): the move
 *   a requiresConfirmation would ask about, and the release hand-off. Unlike
 *   forceMove, diff verification still runs, so its warnings stay in the envelope.
 * @param {object} [options.deps] - Injected collaborators for tests: `fileQaFn`
 *   `writeBodyFn` and `gateMarkersPath` (release hand-off), `resolvePrdTracker`, `checkLifecycleBox`
 *   and `load` (the PRD tracker lifecycle box, see applyTestPlanApprovedBox).
 * @returns {Promise<object>} JSON envelope
 */
async function runSingleIssue(issueNum, options = {}) {
  const warnings = [];
  let roundTrips = 0;
  // --yes fixes the answer to both consents in advance (#3658): the move a
  // requiresConfirmation would ask about, and the release hand-off. Verification
  // still runs under --yes, so its warnings stay in the envelope for audit.
  const consentMove = Boolean(options.forceMove || options.yes);
  const consentHandoff = Boolean(options.releaseHandoff || options.yes);

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

  // Computed once (#3667): gates the release hand-off (6a) and the move (7).
  const isEpic = hasEpicLabel(dataResult.issue.labels);

  // 5. Approval-gate guidance. Built from the body here; rebuilt after 7a
  // once the lifecycle-box lookup has resolved a path-cited tracker (#3641).
  const approvalInput = { labels: dataResult.issue.labels, body: dataResult.issue.body };

  // 5a. Default-mode epic continuation (#3325): a sub-issue whose parent epic
  // still has unprocessed siblings hands back to a fresh /work #<epic>.
  const continuation = await resolveEpicContinuation(issueNum, dataResult.parent);
  roundTrips += continuation.calls;
  if (continuation.warning) warnings.push(continuation.warning);
  let nextSteps = mergeNextSteps(buildApprovalNextSteps(approvalInput), continuation.nextSteps);

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

  // 6a. Post-release gate hand-off (#3453), before any move. Offered by
  // default; performed with --release-handoff, after which the rewritten body
  // has no unchecked box and the move below proceeds.
  let releaseHandoff = null;
  const deps = options.deps || {};
  let gates0 = { eligible: false, gated: [] };
  if (!isEpic) {
    const releaseGates = readReleaseGates(issueNum, dataResult.issue.body, deps.gateMarkersPath);
    gates0 = releaseGates.gates;
    if (releaseGates.warning) warnings.push(releaseGates.warning);
  }
  // The hand-off files issues and rewrites the body, so it is performed only
  // when the move that follows it will run (#3470). Consent to hand off on an
  // unconfirmed diff is refused back to the offer — nothing filed, written or
  // moved — and `refused` says why; a re-run adds --force-move or --yes.
  const moveEligible = isMoveEligible(consentMove, diffVerification);
  const performHandoff = gates0.eligible && consentHandoff && moveEligible;
  if (gates0.eligible && !performHandoff) {
    const context = { issue: dataResult.issue, status: dataResult.status, ci: gatherCiData(), tracker: resolveTracker(), trackerLinked: false };
    if (nextSteps) context.nextSteps = nextSteps;
    const gates = { movedToDone: false, releaseHandoff: { offered: true, criteria: gates0.gated.map((g) => g.criterion) } };
    if (consentHandoff) gates.releaseHandoff.refused = 'move-unconfirmed';
    const envelope = attachDiffVerification(buildSuccessEnvelope(context, gates, warnings), diffVerification);
    envelope.roundTrips = roundTrips;
    return envelope;
  }
  if (performHandoff) {
    const handoff = await runReleaseHandoff(issueNum, { issue: dataResult.issue, fileQaFn: deps.fileQaFn, writeBodyFn: deps.writeBodyFn, markersPath: deps.gateMarkersPath });
    roundTrips += handoff.handedOff.length + (handoff.handedOff.length ? 1 : 0);
    if (!handoff.ok) {
      return buildErrorEnvelope([{ ...handoff.error, handedOff: handoff.handedOff }]);
    }
    dataResult.issue.body = handoff.body;
    releaseHandoff = { offered: false, handedOff: handoff.handedOff };
  }

  // 7. Conditional move to done — epic guard (#2367): skip auto-move when the
  // issue has the `epic` label so the /done command spec's epic flow can
  // process sub-issues first, then close the epic explicitly. The end state
  // (epic reaches Done only after sub-issues) otherwise gets inverted and
  // has to be recovered in a follow-up batch.
  let movedToDone = false;
  if (!isEpic && moveEligible) {
    roundTrips++;
    const moveResult = await moveToDone(issueNum);
    if (moveResult.error) {
      return buildErrorEnvelope([moveResult.error]);
    }
    movedToDone = moveResult.moved;
  }

  // The guard above is silent by construction: movedToDone is false both when
  // no move was due and when the epic guard suppressed one. Name the second
  // case so a caller can tell them apart (#2670).
  const moveSkip = classifyMoveSkip({
    labels: dataResult.issue.labels,
    forceMove: consentMove,
    diffVerification
  });
  if (moveSkip.warning) {
    warnings.push(moveSkip.warning);
  }

  // 7a. PRD tracker lifecycle box (#3636): only after the approval issue
  // actually reached Done — a box claiming approval must not precede it.
  let lifecycleBoxResult = null;
  if (movedToDone) {
    const lifecycleBox = applyTestPlanApprovedBox({
      issueNum, labels: dataResult.issue.labels, body: dataResult.issue.body, deps: options.deps || {}
    });
    if (lifecycleBox) {
      lifecycleBoxResult = lifecycleBox.result;
      if (lifecycleBox.warning) warnings.push(lifecycleBox.warning);
      nextSteps = mergeNextSteps(
        buildApprovalNextSteps({ ...approvalInput, lifecycleBox: lifecycleBoxResult }),
        continuation.nextSteps
      );
    }
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
  if (moveSkip.skippedReason) {
    gates.skippedReason = moveSkip.skippedReason;
  }
  if (releaseHandoff) {
    gates.releaseHandoff = releaseHandoff;
  }
  if (lifecycleBoxResult) {
    gates.lifecycleBox = lifecycleBoxResult;
  }

  const envelope = attachDiffVerification(buildSuccessEnvelope(context, gates, warnings), diffVerification);
  envelope.roundTrips = roundTrips;
  return envelope;
}

/**
 * Attach a diff-verification result to a success envelope. buildSuccessEnvelope
 * never carries one; runSingleIssue adds it here, and only when verification ran.
 * @param {object} envelope
 * @param {object|null} diffVerification
 * @returns {object} the same envelope
 */
function attachDiffVerification(envelope, diffVerification) {
  if (diffVerification) {
    envelope.diffVerification = diffVerification;
  }
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

/**
 * The --issues envelope (#3054 item 4). A batch in which every issue failed is
 * a failed batch: ok:false, ALL_MEMBERS_FAILED, exit 1 — the shape
 * work-preamble.js has used since #3260. A batch with any issue that succeeded
 * stays ok, its failures in results[].
 *
 * @param {number[]} issues   The batch, in argument order
 * @param {object[]} results  One runSingleIssue envelope per issue
 * @returns {object}
 */
function buildBatchEnvelope(issues, results) {
  const allFailed = results.length > 0 && results.every((r) => !r.ok);
  return {
    ok: !allFailed,
    version: SCHEMA_VERSION,
    results,
    errors: allFailed
      ? [{ code: 'ALL_MEMBERS_FAILED', message: `Every issue in the batch failed: ${issues.map((n) => `#${n}`).join(', ')}.` }]
      : [],
    warnings: [],
    roundTrips: results.reduce((sum, r) => sum + (r.roundTrips || 0), 0)
  };
}

// ─── Main Entry Point ───

/**
 * The per-issue options main passes to runSingleIssue, single and batch alike.
 * `yes` is carried so the preamble applies --force-move and --release-handoff
 * itself under --yes (#3658) instead of the spec re-running it with them.
 * @param {{ forceMove?: boolean, releaseHandoff?: boolean, yes?: boolean }} parsed
 * @returns {{ forceMove: boolean, releaseHandoff: boolean, yes: boolean }}
 */
function issueOptions(parsed) {
  return { forceMove: Boolean(parsed.forceMove), releaseHandoff: Boolean(parsed.releaseHandoff), yes: Boolean(parsed.yes) };
}

async function main() {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  if (parsed.error) {
    const envelope = buildErrorEnvelope([parsed.error]);
    process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
    process.exit(1);
    return;
  }

  if (parsed.mode === 'help') {
    process.stdout.write(JSON.stringify(helpEnvelope('done'), null, 2) + '\n');
    process.exit(0);
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
    const result = await runSingleIssue(parsed.issues[0], issueOptions(parsed));
    if (parsed.yes) result.yes = true;
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
    return;
  }

  if (parsed.mode === 'batch') {
    // Batch mode: process each issue sequentially (order matters for side effects)
    const results = [];
    for (const num of parsed.issues) {
      results.push(await runSingleIssue(num, issueOptions(parsed)));
    }
    const envelope = buildBatchEnvelope(parsed.issues, results);
    if (parsed.yes) envelope.yes = true;
    process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
    process.exit(envelope.ok ? 0 : 1);
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
  applyReleaseHandoff,
  applyTestPlanApprovedBox,
  attachDiffVerification,
  buildHandoffQaBody,
  classifyReleaseGates,
  runReleaseHandoff,
  buildBatchEnvelope,
  classifyError,
  execSafe,
  execJSON,
  parseArgs,
  gatherAllData,
  hasPrdLabel,
  hasEpicLabel,
  isApprovalGate,
  buildEpicContinuation,
  resolveEpicContinuation,
  isMoveEligible,
  issueOptions,
  classifyMoveSkip,
  parsePrdReference,
  buildApprovalNextSteps,
  mergeNextSteps,
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
