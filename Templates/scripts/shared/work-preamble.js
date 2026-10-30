#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.115.0
 * @description Consolidate deterministic setup for the /work command into a single script invocation. Replaces 7-9 sequential tool round-trips. Fetches issue metadata, validates state and labels, detects epic vs story vs branch tracker, checks branch assignment, and returns structured JSON envelope for LLM workflow routing.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');
const { validateIssueNumber } = require('./lib/input-validation.js');
const { execFileTimedAsync } = require('./lib/exec.js');
const { extractAcceptanceCriteria } = require('./lib/checkbox-scan.js');
const { normalizeEol } = require('./lib/normalize-eol.js');
const { findRetired, wantsHelp, helpEnvelope } = require('./lib/command-args.js');
// Relative path under shared/lib, per the runtime dependency contract —
// never an external package (#2418).
const { REDIRECT_LABELS } = require('./lib/issue-type.js');
// #3126: --agents validation at parse time, and the --concurrent grouping plan.
const { parseAgentsValue, buildPlan, resolveWorktreeHook, classifyResume, parseWorktreeList, matchKeptWorktrees } = require('./lib/concurrency-plan.js');
const { issueRefGrepPattern } = require('./lib/issue-ref-match.js');
// #3128: processing order is a topological sort of the **Depends on:** graph.
const { topoOrder } = require('./lib/topo-order.js');
// #3129: the parent's step sequence and member spawn requests for --concurrent.
const { buildRun, nextSteps, memberTasks, memberBriefs, extractBriefSections, MEMBER_TEMPLATES, pruneRunLedger } = require('./lib/concurrent-orchestration.js');
// #3259: the status move waits on the Review-State Gate's decision, computed
// from the same classifier and aggregator the gate itself uses.
const { classifyReviewState } = require('./review-state.js');
const { evaluateBranchReviewGate } = require('./lib/branch-review-gate.js');
const { dirtyTrackerPaths } = require('./lib/merge-back-gate.js');

/**
 * The Step 3 gate's action matrix. Loaded by require, not fs, so it resolves
 * beside this script wherever the hub links it. Unreadable → null, and the
 * decision below fails open to today's behavior (move), naming the reason.
 */
function loadGateActions() {
  try {
    return require('../../metadata/review-state-gate-actions.json');
  } catch (_e) {
    return null;
  }
}

/**
 * Would the review gate stop before the first AC is worked (#3259)? When it
 * would, the preamble must not move the issue, its PRD tracker or the tree's
 * root to in_progress: accepting the gate's offer leaves everything as found,
 * and a decline is moved by the Step 3 Pre-Work Status Gate as usual.
 *
 * - standard issue: the Step 3 matrix, shape `single`;
 * - epic, or branch tracker under --nonstop: the Step 2b-ii tree gate over
 *   the epic (classified) or the tracker (dropped) plus its active members;
 * - branch tracker without --nonstop: no up-front gate, so no deferral.
 *
 * @returns {{ defer: boolean, state?: string, action?: string, reason?: string }}
 */
function decideStartMove({ type, issue, active = [], skipped = [], nonstop = false }) {
  if (type === 'epic' || (type === 'branch' && nonstop)) {
    const members = [
      { number: issue.number, state: classifyReviewState(issue).state, boardStatus: null, isTracker: type === 'branch' },
      ...active.map((s) => ({ number: s.number, state: classifyReviewState(s).state, boardStatus: s.status || null })),
    ];
    const verdict = evaluateBranchReviewGate({ members, skipped, setShape: 'tree' });
    if (!verdict.gate) return { defer: false };
    return {
      defer: true,
      action: 'stop',
      reason: `the Step 2b-ii tree gate will stop on ${[...(verdict.neverReviewed || []), ...(verdict.findingsPending || [])].map((n) => `#${n}`).join(', ')}`,
    };
  }
  if (type === 'branch') return { defer: false };

  const matrix = loadGateActions();
  const { state } = classifyReviewState(issue);
  const entry = matrix && matrix.actions && matrix.actions[state] && matrix.actions[state].single;
  if (!entry) return { defer: false };
  if (entry.action !== 'stop' && entry.action !== 'halt') return { defer: false };
  return { defer: true, state, action: entry.action, reason: `the Step 3 Review-State Gate will ${entry.action} on a ${state} issue` };
}

// Every spawn here goes through the timed wrapper (#2469). These are /work's
// Step 1 critical path — including the `gh pmu move --status in_progress` calls —
// so an unbounded one froze the command with no feedback and no upper bound.
const execFileAsync = execFileTimedAsync;
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
 * Safe async exec wrapper — never throws. Bypasses shell via execFileAsync.
 * @param {string} cmd - Command string (split on whitespace)
 * @returns {Promise<string|null>} Trimmed output or null on failure
 */
async function execSafe(cmd) {
  try {
    const parts = cmd.split(/\s+/);
    const { stdout } = await execFileAsync(parts[0], parts.slice(1), EXEC_OPTS);
    return stdout.trim();
  } catch (_e) {
    return null;
  }
}

/**
 * Async exec wrapper that returns parsed JSON or an error object.
 * Bypasses shell via execFileAsync. Classifies errors using stderr patterns.
 * @param {string} command - Executable name
 * @param {string[]} args - Argument array
 * @param {string} errorCode - Default error code to use on failure
 * @param {string} errorMsg - Error message prefix
 * @returns {Promise<{ data: object } | { error: { code: string, message: string } }>}
 */
async function execJSON(command, args, errorCode, errorMsg) {
  let output;
  try {
    const { stdout } = await execFileAsync(command, args, EXEC_OPTS);
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
// #2414 — find a flag in either space form (--flag value) or equals form (--flag=value).
// Empty equals values (`--flag=`) are returned as `value: ''` so callers can emit MISSING_ARGUMENT.
function findFlag(args, name) {
  const exact = `--${name}`;
  const i = args.indexOf(exact);
  if (i !== -1) return { index: i, value: args[i + 1] };
  const prefix = `${exact}=`;
  const j = args.findIndex(a => a.startsWith(prefix));
  if (j !== -1) return { index: j, value: args[j].slice(prefix.length) };
  return null;
}

function parseArgs(args) {
  if (args.length === 0) {
    return { error: { code: 'MISSING_ARGUMENT', message: 'No arguments provided. Use --issue N, --issues "N,N", or --status <status>.' } };
  }

  // --help takes precedence over every other argument and performs no action (#3030).
  if (wantsHelp(args)) return { mode: 'help' };
  // `all in <status>` was replaced by `--status <status>` (#3030).
  const retired = findRetired('work', args);
  if (retired) return { error: { code: 'RETIRED_ARGUMENT', message: retired.message } };

  // Detect --schema flag (mutually exclusive with other flags)
  const hasSchema = args.includes('--schema');
  if (hasSchema) {
    const hasOther = findFlag(args, 'issue') || findFlag(args, 'issues') || findFlag(args, 'status');
    if (hasOther) {
      return { error: { code: 'MUTUAL_EXCLUSION', message: '--schema cannot be combined with --issue, --issues, or --status.' } };
    }
    return { mode: 'schema' };
  }

  // Detect boolean modifier flags (combinable with any mode)
  const hasAssign = args.includes('--assign');
  const hasWait = args.includes('--wait');
  // #2622. --nonstop was previously rule-level only. The preamble needs it
  // because the ordering derivation it gates has to run before the status
  // transition this script issues — a decision the rule cannot make after the
  // envelope is already built.
  const hasNonstop = args.includes('--nonstop');
  // #3265: an issue already In review or Done is refused unless --reopen.
  const hasReopen = args.includes('--reopen');

  // #3126. --concurrent and --agents N are parsed HERE, before the first round
  // trip, so an invalid cap fails with nothing moved and no worktree created.
  // --agents without --concurrent is a warning, not an error: the value is
  // well-formed and merely has nothing to apply to.
  const hasConcurrent = args.includes('--concurrent');
  const agentsFlag = findFlag(args, 'agents');
  let maxAgents;
  const parseWarnings = [];
  if (agentsFlag) {
    if (agentsFlag.value === undefined || agentsFlag.value === '' || agentsFlag.value.startsWith('--')) {
      return { error: { code: 'MISSING_ARGUMENT', message: '--agents requires a positive integer value.' } };
    }
    const parsedAgents = parseAgentsValue(agentsFlag.value);
    if (!parsedAgents.ok) {
      return { error: { code: 'INVALID_ARGUMENT', message: parsedAgents.error } };
    }
    if (hasConcurrent) {
      maxAgents = parsedAgents.value;
    } else {
      parseWarnings.push({
        code: 'AGENTS_IGNORED',
        message: `--agents ${agentsFlag.value} has no effect without --concurrent; ignored.`
      });
    }
  }
  // --no-review skips the independent review: the Merge-Back Review Gate's
  // Tier 3 under --concurrent (#3269), sequential /work's review otherwise
  // (#3457) — so it applies in every mode and is never reported as ignored.
  const hasNoReview = args.includes('--no-review');

  // The modifier flags attach identically to every mode. One place, so a
  // flag added later cannot be carried by two modes and dropped by the third
  // (the #2624 wire defect, one layer up).
  const withModifiers = (result) => {
    if (hasAssign) result.assign = true;
    if (hasWait) result.wait = true;
    if (hasNonstop) result.nonstop = true;
    if (hasReopen) result.reopen = true;
    if (hasConcurrent) result.concurrent = true;
    if (hasNoReview) result.noReview = true;
    if (maxAgents !== undefined) {
      result.maxAgents = maxAgents;
      result.maxAgentsSource = 'flag';
    }
    if (parseWarnings.length > 0) result.parseWarnings = parseWarnings;
    return result;
  };

  const issueFlag = findFlag(args, 'issue');
  if (issueFlag) {
    const raw = issueFlag.value;
    if (!raw) {
      return { error: { code: 'MISSING_ARGUMENT', message: '--issue requires a value.' } };
    }
    const cleaned = raw.replace(/^#/, '');
    let num;
    try {
      num = validateIssueNumber(cleaned);
    } catch (_e) {
      return { error: { code: 'INVALID_ARGUMENT', message: `Invalid issue number: "${raw}". Must be a positive integer.` } };
    }
    return withModifiers({ mode: 'single', issues: [num] });
  }

  const issuesFlag = findFlag(args, 'issues');
  if (issuesFlag) {
    const raw = issuesFlag.value;
    if (!raw) {
      return { error: { code: 'MISSING_ARGUMENT', message: '--issues requires a comma-separated list.' } };
    }
    let nums;
    try {
      nums = raw.split(',').map(s => validateIssueNumber(s.trim().replace(/^#/, '')));
    } catch (_e) {
      return { error: { code: 'INVALID_ARGUMENT', message: `Invalid issue numbers in: "${raw}".` } };
    }
    return withModifiers({ mode: 'batch', issues: nums });
  }

  const statusFlag = findFlag(args, 'status');
  if (statusFlag) {
    const status = statusFlag.value;
    if (!status) {
      return { error: { code: 'MISSING_ARGUMENT', message: '--status requires a value.' } };
    }
    return withModifiers({ mode: 'status', status });
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
/**
 * Label names from either shape `gh` returns: flat strings (`gh pmu view`)
 * or `{ name }` objects (`gh issue view`). Null-safe, so callers can pass
 * `data.labels` straight through.
 * @param {Array<string|{ name: string }>|null|undefined} labels
 * @returns {string[]}
 */
function labelNamesOf(labels) {
  return Array.isArray(labels)
    ? labels.map(l => typeof l === 'string' ? l : (l && l.name)).filter(Boolean)
    : [];
}

async function gatherAllData(issueNum) {
  const result = await execJSON(
    'gh', ['pmu', 'view', String(issueNum), '--json=number,title,labels,body,state,status,branch'],
    'NOT_FOUND',
    `Issue #${issueNum} not found`
  );
  if (result.error) return result;
  if (result.data.state === 'CLOSED') {
    return { error: { code: 'CLOSED', message: `Issue #${issueNum} is already closed.` } };
  }
  if (!result.data.branch) {
    // This error fires BEFORE detectRedirect() runs, so an unassigned
    // qa-required issue never reaches the /qa redirect (#2824). The labels are
    // already here, so the pointer names the command that owns the assignment
    // for a QA issue rather than sending the user to /assign-branch and back.
    const suggestion = labelNamesOf(result.data.labels).includes('qa-required')
      ? `Run /qa #${issueNum} — a qa-required issue is verified there, and /qa handles the branch assignment itself.`
      : `Run /assign-branch #${issueNum} first.`;
    return { error: { code: 'NO_BRANCH', message: `Issue #${issueNum} is not assigned to a branch.`, suggestion } };
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
    'gh', ['pmu', 'view', String(issueNum), '--json=number,title,labels,body,state'],
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
    'gh', ['pmu', 'view', String(issueNum), '--json=status,branch'],
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
  const redirect = detectRedirect(issueData);
  if (redirect) return redirect.label;
  return 'standard';
}

/**
 * Labels `/work` redirects on, and the reason the set is narrower than
 * `issue-type.js`'s (#2784).
 *
 * `test-plan` ONLY. An approval issue's six gates are not implementation
 * work: they are a checklist `/review-test-plan` Step 5a already computes,
 * confirms with the user and checks off on both surfaces. Classified
 * `standard`, `/work` loaded them as `autoTask` items instead, matched none
 * against `qa-config.json`, and reached Step 4b with six unchecked ACs
 * carrying no marker.
 *
 * `prd` and `proposal` are deliberately absent. They share the fall-through
 * and the map, but neither `/review-prd` nor `/review-proposal` has an
 * equivalent of the gate rollup for a redirected user to land in, so
 * redirecting there would hand someone a review with nothing to confirm.
 * #2784 records that as a separate decision rather than folding it in.
 *
 * `qa-required` → `/qa` (#2824) lives HERE and not in the shared map, and
 * that is the point of this being a map rather than a filter over
 * `REDIRECT_LABELS`. `review-preamble.js` acts on every key of the shared
 * map with no honored set of its own, so adding the label there would
 * redirect `review #N` — and a story that also carries the label — into
 * `/qa`. The shared map exists so two commands cannot route ONE label to
 * DIFFERENT targets; here the second command must not route it at all, so
 * there is nothing to keep in sync and the map gains nothing.
 *
 * Single-issue shape only. Under an epic or branch-tracker run a
 * `qa-required` sub-issue is skipped with a pointer by
 * `checkSubIssueStatuses` — a mid-loop Skill redirect never returns to the
 * sub-issue loop.
 */
const WORK_REDIRECT_LABELS = Object.freeze({
  'test-plan': REDIRECT_LABELS['test-plan'],
  'qa-required': '/qa'
});

/**
 * The redirect target for an issue, or null.
 *
 * `test-plan`'s COMMAND comes from `issue-type.js` rather than a literal, so
 * `/work` and `/review-issue` cannot drift to different targets for that
 * label. A label in the shared map but not in `WORK_REDIRECT_LABELS` returns
 * null — that is the out-of-scope case above, not a lookup failure.
 *
 * @param {{ labels?: Array<{ name: string }> }} issueData
 * @returns {{ label: string, command: string }|null}
 */
function detectRedirect(issueData) {
  const labels = ((issueData && issueData.labels) || []).map(l => l.name);
  for (const label of labels) {
    if (WORK_REDIRECT_LABELS[label]) {
      return { label, command: WORK_REDIRECT_LABELS[label] };
    }
  }
  return null;
}

/**
 * Test whether an issue is a branch tracker (carries the 'branch' label).
 * Used by --assign rejection (#2403): branch trackers represent a working
 * branch, not implementation work, so assigning them to a branch is always
 * a user mistake.
 * @param {{ labels: Array<{ name: string }> }} issueData
 * @returns {boolean}
 */
function isBranchTracker(issueData) {
  const labels = (issueData.labels || []).map(l => l.name);
  return labels.includes('branch');
}

// ─── Acceptance Criteria Parsing ───

/**
 * Parse acceptance criteria from an issue body (#2600).
 *
 * Previously a bare `/^- \[([ x])\] (.+)$/gm` over the whole body: no fence
 * tracking, no section anchor. It returned every checkbox anywhere, including
 * ones quoted inside code fences and ones belonging to other sections, and
 * reported `source: 'acceptance_criteria'` for all of them — so a caller could
 * not tell a real criterion from a quoted example.
 *
 * `/work` builds its per-AC subtasks, its commit-per-AC gate and its Step 4
 * verification from this list, while `gh pmu move --status in_review` validates
 * the same body correctly. The two silently disagreed, and because `gh pmu` was
 * the right one the `in_review` transition always succeeded — so nothing ever
 * surfaced the overcount.
 *
 * `sectionFound` is additive: `source` keeps its value, because the /work rule
 * and two existing suites branch on that literal.
 *
 * @param {string|null|undefined} body
 * @returns {{ source: string, items: Array<{ text: string, checked: boolean }>, sectionFound: boolean }}
 */
function parseAcceptanceCriteria(body) {
  const { items, sectionFound } = extractAcceptanceCriteria(body);
  return { source: 'acceptance_criteria', items, sectionFound };
}

/**
 * Turn an empty acceptance-criteria result into a reportable warning.
 *
 * #2600 added `sectionFound` so a caller could tell "this issue has no
 * acceptance-criteria section" from "it has one that parsed to nothing", and
 * #2614 is the consumer: nothing read the flag, so the distinction it exists to
 * draw never reached anyone.
 *
 * Why it matters that the two are distinguishable: a silent zero passes every
 * downstream gate VACUOUSLY. No per-AC subtasks are created, Step 4 has nothing
 * to verify, Step 4b finds no unchecked boxes, Step 6a's checkbox audit reports
 * clean. An overcount announces itself; a vacuous pass does not. Naming which
 * of the two happened makes a failed parse visible at the one moment it is
 * still cheap to notice — before any criterion is worked.
 *
 * Reporting only, never blocking. A proposal issue correctly has no
 * acceptance-criteria section, so blocking would halt a legitimate and common
 * case. Same fail-open-but-visible choice /work's Review-State Gate makes for
 * `indeterminate`.
 *
 * Silent for the epic/branch `sub_issues` shape, which carries no
 * `sectionFound` and must not be described as a missing AC section.
 *
 * @param {{source?: string, items?: Array, sectionFound?: boolean}|null} autoTask
 * @param {number} issueNum
 * @returns {{code: string, message: string}|null}
 */
function buildAcSectionWarning(autoTask, issueNum) {
  if (!autoTask || autoTask.source !== 'acceptance_criteria') return null;
  if (Array.isArray(autoTask.items) && autoTask.items.length > 0) return null;

  return autoTask.sectionFound
    ? {
        code: 'EMPTY_ACCEPTANCE_CRITERIA_SECTION',
        message: `Issue #${issueNum} has an acceptance-criteria section, but no criteria were parsed from it. Verify the section before working the issue — an empty list satisfies every downstream AC gate without checking anything.`
      }
    : {
        code: 'NO_ACCEPTANCE_CRITERIA_SECTION',
        message: `Issue #${issueNum} has no acceptance-criteria section — working as a single unit, no auto-tasks. Expected for a proposal issue; unexpected for a story, bug or enhancement.`
      };
}

// ─── Epic Sub-Issue Loading ───

/**
 * Load sub-issues for an epic
 * @param {number} issueNum
 * Each child carries the GitHub `state` (`OPEN`/`CLOSED`) that `sub list`
 * already returns, so checkSubIssueStatuses can skip a closed child without a
 * per-child call (#2970).
 *
 * @returns {Promise<{ subIssues: Array<{ number: number, title: string, state?: string }>, warning?: object }>}
 */
async function loadSubIssues(issueNum) {
  const result = await execJSON(
    'gh', ['pmu', 'sub', 'list', String(issueNum), '--json'],
    'SUB_ISSUE_LOAD_FAILED',
    `Failed to load sub-issues for #${issueNum}`
  );
  // #3265: an enumeration that failed is an error, not an empty tree. As a
  // warning it let the run continue with zero members and move the tracker —
  // for an epic, on to in_review with nothing worked.
  if (result.error) {
    return { subIssues: [], error: { code: 'SUB_ISSUE_LOAD_FAILED', message: result.error.message } };
  }
  const children = (result.data.children || []).map(c => ({
    number: c.number,
    title: c.title,
    ...(c.state ? { state: c.state } : {})
  }));
  return { subIssues: children };
}

/**
 * Check statuses of sub-issues and classify as skipped or active.
 * Parallelizes status checks for all sub-issues.
 *
 * Active entries carry `body` and `labels` (#2622). `gh pmu sub list` returns
 * number/title/state only, so before this the ordering decision was made from
 * issue NUMBERS while the content that should drive it sat in the bodies,
 * unread. The fields ride along on the status query that already runs once per
 * sub-issue, so bodies cost zero additional round trips.
 *
 * Skipped entries stay `{ number, status }`. They feed a report line rather than
 * the ordering pass, and two existing suites assert that exact shape. The one
 * addition is `reason: 'qa-required'` on a child skipped for its label rather
 * than its status (#2824); status skips are unchanged.
 *
 * A child whose GitHub `state` is `CLOSED` is skipped as
 * `{ number, status: 'Closed', reason: 'closed' }` with NO `gh pmu view` call
 * (#2970). Without this the per-child cost scaled with the tracker's history
 * rather than its remaining work: every closed child was fetched in full only
 * to be skipped. Completed and `not_planned` children are treated alike —
 * `sub list` carries no stateReason, and reading it would cost the call this
 * removes. A child with no `state` is fetched as before: absence never skips.
 *
 * @param {Array<{ number: number, title: string, state?: string }>} subIssues
 * @returns {Promise<{ skipped: Array<{ number: number, status: string, reason?: 'qa-required' | 'closed' }>, active: Array<{ number: number, title: string, body: string, labels: string[] }> }>}
 */
async function checkSubIssueStatuses(subIssues, timeoutMs = 30000) {
  const skipped = [];
  const active = [];
  const skipStatuses = ['in review', 'done'];

  // Closed children are settled from `sub list` alone (#2970).
  const toFetch = [];
  for (const sub of subIssues) {
    if (sub.state === 'CLOSED') {
      skipped.push({ number: sub.number, status: 'Closed', reason: 'closed' });
    } else {
      toFetch.push(sub);
    }
  }

  // Parallelize all sub-issue status checks with timeout (#1883)
  //
  // The timer handle is captured and cleared in a `finally` (#2469). Without it
  // the losing side of the race keeps a 30s timer pending after the checks have
  // already resolved. Every CLI path here ends in process.exit(), so a real run
  // never waits on it — but under Jest it holds the worker open, which is how
  // this surfaced.
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`Sub-issue status check timed out after ${timeoutMs / 1000}s`)),
      timeoutMs
    );
  });

  let statusResults;
  try {
    statusResults = await Promise.race([
      Promise.all(
        toFetch.map(async (sub) => {
          try {
            const { stdout } = await execFileAsync('gh', ['pmu', 'view', String(sub.number), '--json=status,body,labels'], EXEC_OPTS);
            const data = JSON.parse(stdout.trim());
            return { sub, status: data.status, body: data.body, labels: data.labels };
          } catch (e) {
            // #3265: an unreadable sub-issue is its own bucket, never active.
            // Its status is unknown — it may be In review, or carry
            // qa-required — so working it could reopen finished work.
            return { sub, unreadable: true, reason: e && e.message ? e.message : String(e) };
          }
        })
      ),
      timeoutPromise
    ]);
  } finally {
    clearTimeout(timeoutHandle);
  }

  const unreadable = [];
  for (const { sub, status, body, labels, unreadable: failed, reason } of statusResults) {
    if (failed) {
      unreadable.push({ number: sub.number, reason });
      continue;
    }
    // A qa-required child is a gate on the PARENT's closure, not implementation
    // work in sequence with its siblings (#2824). It is skipped with a pointer
    // whatever its board status — never redirected mid-loop, because a Skill
    // transfer would end at /qa's own STOP and nothing would return here. The
    // `reason` field is what lets the caller print `run /qa #N` rather than a
    // status; status-skipped entries keep their two-field shape.
    if (labelNamesOf(labels).includes('qa-required')) {
      skipped.push({ number: sub.number, status, reason: 'qa-required' });
    } else if (status && skipStatuses.includes(status.toLowerCase())) {
      skipped.push({ number: sub.number, status });
    } else {
      // Normalize to '' / [] rather than passing null through. Every downstream
      // body consumer stays total, instead of each one guarding separately.
      active.push({
        ...sub,
        body: typeof body === 'string' ? body : '',
        labels: Array.isArray(labels) ? labels : []
      });
    }
  }
  return { skipped, active, unreadable };
}

/**
 * Parse processing order from an epic or branch tracker body (#2544)
 * @param {string|null} body
 * @param {number[]} subIssueNums - All sub-issue numbers
 * @returns {number[]} Ordered issue numbers
 */
function parseProcessingOrder(body, subIssueNums) {
  return parseProcessingOrderDetail(body, subIssueNums).order;
}

const PO_BOLD = /^\s*\*\*Processing Order:\*\*\s*(.*)$/;
const PO_HEADING = /^\s*#{1,6}\s+Processing Order:?\s*$/;
const PO_ITEM = /^\s*(?:\d+[.)]|[-*+])\s+/;

/**
 * Locate a Processing Order section in normalized body lines (#3270). One
 * definition for the reader and the writer, so a section the parser reads is
 * exactly the section applyProcessingOrder replaces. Recognized: the bold
 * header with items below or inline after it, and a markdown heading. Items
 * are list lines; blank lines between items do not end the section — the
 * first non-blank, non-item line, any heading, or an item with no `#N`
 * reference does. The inline form is the header line alone (#3291): lines
 * below it are body content the reader never used, so the writer must not
 * replace them.
 *
 * @param {string[]} lines
 * @returns {{start: number, end: number, inline: string, items: string[]}|null}
 */
function findProcessingOrderSection(lines) {
  const start = lines.findIndex((l) => PO_BOLD.test(l) || PO_HEADING.test(l));
  if (start === -1) return null;
  const bold = PO_BOLD.exec(lines[start]);
  const inline = bold ? bold[1].trim() : '';
  const items = [];
  let end = start + 1;
  if (inline) return { start, end, inline, items };
  let i = start + 1;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }
    if (!PO_ITEM.test(line) || /^\s*#{1,6}\s/.test(line) || !/#\d+/.test(line)) break;
    items.push(line);
    i++;
    end = i;
  }
  return { start, end, inline, items };
}

/**
 * parseProcessingOrder with what it set aside (#3270). Each item contributes
 * its FIRST `#N`; further references in the same item (`#12 (after #13
 * lands)`) and references to issues that are not members are ignored and
 * named in `warnings`, never dropped silently. Members the section does not
 * mention are appended in ascending order, as before.
 *
 * @returns {{order: number[], warnings: string[], found: boolean}}
 */
function parseProcessingOrderDetail(body, subIssueNums) {
  const ascending = [...subIssueNums].sort((a, b) => a - b);
  if (!body) return { order: ascending, warnings: [], found: false };

  // A CRLF body would let the section read on past its blank line (#3064).
  const section = findProcessingOrderSection(normalizeEol(body).split('\n'));
  if (!section) return { order: ascending, warnings: [], found: false };

  const entries = section.inline
    ? section.inline.split(',').map((s) => s.trim()).filter(Boolean)
    : section.items;
  const order = [];
  const warnings = [];
  for (const entry of entries) {
    const refs = [...entry.matchAll(/#(\d+)/g)].map((m) => parseInt(m[1], 10));
    if (refs.length === 0) continue;
    const [first, ...rest] = refs;
    if (rest.length > 0) {
      warnings.push(`Processing Order item "${entry.trim()}": only #${first} is read; ${rest.map((n) => `#${n}`).join(', ')} ignored`);
    }
    if (!subIssueNums.includes(first)) {
      warnings.push(`Processing Order names #${first}, which is not a sub-issue of this tracker; ignored`);
      continue;
    }
    if (!order.includes(first)) order.push(first);
  }

  for (const num of ascending) {
    if (!order.includes(num)) order.push(num);
  }
  return { order, warnings, found: true };
}

/**
 * Render a **Processing Order:** section (#2622).
 *
 * Pure string builder, deliberately separate from any write: the caller shows
 * the user exactly what would be persisted before anything is. The format is
 * the one `parseProcessingOrder` already reads — this issue changes what WRITES
 * a Processing Order, not what reads one, so an accepted order is durable
 * through the existing #2544 parser with no new state store.
 *
 * @param {number[]} order
 * @returns {string} section text, newline-terminated
 */
function buildProcessingOrderSection(order) {
  const lines = order.map((num, i) => `${i + 1}. #${num}`);
  return `**Processing Order:**\n${lines.join('\n')}\n`;
}

/**
 * Return a copy of `body` carrying `order` as its **Processing Order:** section.
 *
 * Replaces an existing section in place rather than appending a second — two
 * sections would leave `parseProcessingOrder` reading whichever came first,
 * which is not necessarily the accepted one.
 *
 * Pure: the input string is never mutated and nothing is written anywhere.
 * Persisting is the caller's separate, explicit step (#2622 AC7).
 *
 * @param {string} body
 * @param {number[]} order
 * @returns {string}
 */
function applyProcessingOrder(body, order) {
  const section = buildProcessingOrderSection(order);
  // Normalized so a CRLF body's `\r\n\r\n` reads as the blank line it is (#3064).
  const text = typeof body === 'string' ? normalizeEol(body) : '';
  const lines = text.split('\n');

  // The same locator the parser uses (#3270), so the inline form, a
  // `## Processing Order` heading and a blank-line list are all replaced in
  // place — matching only the bare bold header appended a second section.
  const found = findProcessingOrderSection(lines);
  if (!found) {
    const sep = text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n';
    return text + sep + section;
  }

  const replacement = section.replace(/\n$/, '').split('\n');
  return [...lines.slice(0, found.start), ...replacement, ...lines.slice(found.end)].join('\n');
}

/**
 * The durable not-swept record a sequential `--nonstop` halt leaves on its
 * tracker (#3270), as an HTML comment line so it renders invisibly. Empty
 * list → the clearing marker. A halt report alone is a report, not a store.
 * @param {number[]} nums
 * @returns {string}
 */
function buildUnsweptMarker(nums) {
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  return `<!-- unswept: ${sorted.length ? sorted.map((n) => `#${n}`).join(', ') : 'none'} -->`;
}

/**
 * The latest unswept marker among a tracker's comments (#3270); [] when the
 * newest marker is the clearing one or there is none. Ordered by createdAt.
 * @param {Array<{body: string, createdAt?: string}>} comments
 * @returns {number[]}
 */
function parseLatestUnswept(comments) {
  const marked = (comments || [])
    .filter((c) => c && typeof c.body === 'string' && /<!-- unswept: [^>]*-->/.test(c.body))
    .sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0));
  if (marked.length === 0) return [];
  const m = /<!-- unswept: ([^>]*?) -->/.exec(marked[marked.length - 1].body);
  if (!m || m[1].trim() === 'none') return [];
  return [...m[1].matchAll(/#(\d+)/g)].map((x) => parseInt(x[1], 10));
}

/**
 * Derive a proposed processing order from sub-issue CONTENT (#2622).
 *
 * Wires two pieces that already existed but were never connected:
 * `parseProcessingOrder` reads a **Processing Order:** the author wrote by hand,
 * and `review-interdependence.js` derives an order from issue bodies — but only
 * inside `/review-issue`, and its `suggestedOrder` was persisted nowhere. This
 * consumes the engine as it stands rather than adding a second implementation.
 *
 * Returns a PROPOSAL. Nothing here writes to an issue: `differs` tells the
 * caller whether the proposal changes anything, and persistence is a separate,
 * explicitly-invoked step. The engine's measured miss rate on #2614–#2620 is
 * why — an unattended reorder would replace a knowably-wrong order with an
 * unaccountably-wrong one.
 *
 * Sub-issues the engine cannot analyze (ineligible labels, no body) are not
 * dropped: they keep their existing relative position after the ordered ones,
 * so a derivation failure degrades to the current order rather than losing work.
 *
 * @param {Array<{ number: number, title: string, body?: string, labels?: string[] }>} activeSubIssues
 * @param {number[]} processingOrder - the order in effect today
 * @returns {{ order: number[], differs: boolean, rationale: Array<object>, warning?: object }}
 */
function deriveProposedOrder(activeSubIssues, processingOrder) {
  const current = processingOrder.filter(n => activeSubIssues.some(s => s.number === n));

  if (activeSubIssues.length < 2) {
    return { order: current, differs: false, rationale: [] };
  }

  let engine;
  try {
    engine = require('./review-interdependence.js');
  } catch (e) {
    // Fail-open: no ordering proposal is strictly better than halting /work.
    return {
      order: current,
      differs: false,
      rationale: [],
      warning: {
        code: 'ORDER_DERIVATION_UNAVAILABLE',
        message: `Could not load the interdependence engine — proposing no reorder: ${e.message}`
      }
    };
  }

  const eligible = activeSubIssues.filter(s =>
    engine.isEligibleForInterdependence(s.labels || [])
  );

  if (eligible.length < 2) {
    return {
      order: current,
      differs: false,
      rationale: [],
      warning: {
        code: 'ORDER_DERIVATION_SKIPPED',
        message: `Fewer than 2 sub-issues are eligible for interdependence analysis (${eligible.length} of ${activeSubIssues.length}) — proposing no reorder.`
      }
    };
  }

  let result;
  try {
    result = engine.analyzeInterdependence(eligible.map(s => ({
      number: s.number,
      title: s.title,
      type: (s.labels || [])[0],
      labels: s.labels || [],
      body: s.body || ''
    })));
  } catch (e) {
    return {
      order: current,
      differs: false,
      rationale: [],
      warning: {
        code: 'ORDER_DERIVATION_FAILED',
        message: `Interdependence analysis threw — proposing no reorder: ${e.message}`
      }
    };
  }

  // Ordered sub-issues first, then anything the engine did not rank, each in its
  // existing relative position.
  const ranked = result.suggestedOrder.filter(n => current.includes(n));
  const order = [...ranked, ...current.filter(n => !ranked.includes(n))];

  const rationale = result.findings
    .filter(f => f.dimension === 'ordering')
    .map(f => ({ issues: f.issues, source: f.source || 'body-mention', evidence: f.evidence }));

  return {
    order,
    differs: order.length !== current.length || order.some((n, i) => n !== current[i]),
    rationale
  };
}

/**
 * Order the tree by its **Depends on:** graph (#3128).
 *
 * The declared order (`**Processing Order:**`, else ascending) is the
 * tie-break; only an explicit dependency moves a member. Active members are
 * reordered within their own slots of the declared order, so skipped members
 * keep their positions and a tree with no dependency lines comes back exactly
 * as declared. Skipped members count as merged (`satisfied`) — except a
 * `qa-required` skip, which this run never works (`blocked`).
 *
 * @param {Array<{number: number, body?: string}>} active
 * @param {Array<{number: number, reason?: string}>} skipped
 * @param {number[]} declaredOrder
 * @returns {{ok: boolean, order: number[], graph: object}}
 *   `graph` is the topoOrder result; on a cycle `ok` is false and `order` is
 *   the declared order, unused.
 */
function orderByDependencies(active, skipped, declaredOrder) {
  const graph = topoOrder({
    members: active,
    tiebreak: declaredOrder,
    satisfied: skipped.filter(s => s.reason !== 'qa-required').map(s => s.number),
    blocked: skipped.filter(s => s.reason === 'qa-required').map(s => s.number)
  });
  if (!graph.ok) return { ok: false, order: declaredOrder, graph };

  const activeSet = new Set(active.map(s => s.number));
  const queue = [...graph.order];
  const order = declaredOrder.map(n => (activeSet.has(n) ? queue.shift() : n));
  // Active members missing from the declared order (none today — the
  // declared order covers every sub-issue) are appended rather than lost.
  order.push(...queue);
  return { ok: true, order, graph };
}

/**
 * Read the TDD checklist a member brief carries (#3129). The checklist is an
 * imported skill file; an absent or malformed one yields null, and the brief
 * says it fell back to the inline cycle rather than failing the preamble.
 * @returns {object|null}
 */
function loadTddChecklist() {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), '.claude', 'skills', 'tdd-process', 'tdd-checklist.json'), 'utf8');
    const checklist = JSON.parse(raw);
    const valid = ['red', 'green', 'refactor'].every(p => checklist[p] && Array.isArray(checklist[p].required) && checklist[p].gate);
    return valid ? checklist : null;
  } catch (_e) {
    return null;
  }
}

/**
 * Resolve, from the Claude Code settings layers on disk, whether the
 * WorktreeCreate hook (worktree-create-hook.js) is registered (#3224).
 * Without it a member's worktree branches from the remote default branch.
 * @param {{cwd?: string, homedir?: string}} [where]
 * @returns {{registered: boolean, warnings: Array<{code: string, message: string}>}}
 */
function resolveWorktreeHookFromDisk({ cwd = process.cwd(), homedir = require('os').homedir() } = {}) {
  const layers = [
    { label: 'project', path: path.join(cwd, '.claude', 'settings.json') },
    { label: 'project-local', path: path.join(cwd, '.claude', 'settings.local.json') },
    { label: 'user', path: path.join(homedir, '.claude', 'settings.json') }
  ];
  return resolveWorktreeHook({ layers, readFile: (p) => fs.readFileSync(p, 'utf-8') });
}

/**
 * Per member, the `Refs #N` commits reachable from the tracker (HEAD) and
 * those on its first-parent line (#3264), for classifyResume. A git failure
 * reads as no commits: the member is planned as before, never skipped.
 *
 * @param {number[]} numbers
 * @returns {Promise<Object<number, {all: string[], firstParent: string[]}>>}
 */
async function readResumeLogsFromGit(numbers) {
  const shas = async (args) => {
    try {
      const { stdout } = await execFileAsync('git', args, { cwd: process.cwd() });
      return String(stdout || '').split('\n').map((l) => l.trim()).filter((l) => /^[0-9a-f]{7,40}$/.test(l));
    } catch (_e) {
      return [];
    }
  };
  const logs = {};
  for (const n of numbers) {
    const grep = `--grep=${issueRefGrepPattern(n, { keywords: ['Refs'] })}`;
    logs[n] = { all: await shas(['log', '--format=%H', grep, 'HEAD']), firstParent: await shas(['log', '--first-parent', '--format=%H', grep, 'HEAD']) };
  }
  return logs;
}

/** The tracker tree's `git status --porcelain` (#3277); unreadable reads as clean. */
async function readTrackerStatusFromGit() {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: process.cwd() });
    return String(stdout || '');
  } catch (_e) {
    return '';
  }
}

/**
 * TRACKER_TREE_DIRTY (#3277): uncommitted paths on the tracker, named before
 * any worktree is spawned. group-tier1 fails only on those inside the group's
 * touched set, so this is advisory: a pre-existing bump or a peer's edit is
 * seen at the start of the run, not discovered at the end of a group.
 */
function trackerTreeDirtyWarning(raw) {
  const paths = dirtyTrackerPaths(raw);
  if (paths.length === 0) return null;
  return {
    code: 'TRACKER_TREE_DIRTY',
    paths,
    message: `Uncommitted on the tracker before any worktree is spawned: ${paths.join(', ')}. group-tier1 fails on one only if the group touches it — commit, move or leave each knowingly.`,
  };
}

/**
 * The worktrees git knows and this tracker's run ledger (#3264), for
 * matchKeptWorktrees. Either read failing reads as none: a missing ledger
 * lists every wt/* worktree unmatched rather than skipping them.
 *
 * @param {number} tracker
 * @returns {Promise<{worktrees: object[], ledger: object|null}>}
 */
async function readResumeWorktreesFromDisk(tracker) {
  let worktrees = [];
  try {
    const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], { cwd: process.cwd() });
    worktrees = parseWorktreeList(stdout);
  } catch (_e) { /* no worktrees readable */ }
  let ledger = null;
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(process.cwd(), `.tmp-concurrent-${tracker}.json`), 'utf8'));
    if (parsed && Array.isArray(parsed.members)) ledger = parsed;
  } catch (_e) { /* no ledger */ }
  return { worktrees, ledger };
}

/** Write the pruned run ledger back to `.tmp-concurrent-<tracker>.json` (#3350). */
function writeResumeLedgerToDisk(tracker, ledger) {
  fs.writeFileSync(path.join(process.cwd(), `.tmp-concurrent-${tracker}.json`), JSON.stringify(ledger, null, 2));
}

/**
 * The concurrent run the parent executes (#3129): its step sequence, with a
 * worktree spawn request carrying each group member's brief, and one task per
 * member naming its group.
 *
 * Each member's brief is written to `.tmp-brief-<N>.md` at the root and the
 * spawn request names that file (#3280), so the envelope never carries the
 * brief. The member's scratch-clear step removes it once the member is
 * merged and In review (#3360); the startup sweep is only the fallback, for a
 * halted or interrupted run. Written on every preamble run, so a resumed run
 * rewrites a file either removed. A failed write inlines every brief and warns.
 *
 * Under `--nonstop` with at least one group the run is the rolling schedule
 * (#3274, `schedule: 'rolling'`): the steps are nextSteps' first output, and
 * the run state — layers, dependencies, cap, members — is written to
 * `.tmp-rolling-<tracker>.json` for the `next-steps` CLI. Default mode keeps
 * the fixed groups (`schedule: 'groups'`) and their per-group STOP.
 * @param {object} plan - buildPlan result
 * @param {Array<{number: number, title?: string, body?: string}>} active
 * @param {boolean} nonstop
 * @param {{writeBrief?: function(string, string): void, warnings?: object[], tracker?: number, noReview?: boolean}} [io] -
 *   writeBrief (also writes the rolling state file) injectable for tests; a
 *   failed write is pushed onto `warnings`; `noReview` (`--no-review`, #3269) turns every Tier 3 spawn into a review-skip
 */
function buildConcurrentRun(plan, active, nonstop, { writeBrief = (p, text) => fs.writeFileSync(p, text), warnings = [], tracker, noReview = false } = {}) {
  const members = {};
  const scopeOf = (n) => {
    const info = ((plan && plan.members) || []).find(m => m.number === n);
    return info && Array.isArray(info.scope) ? info.scope : [];
  };
  for (const s of active) {
    // The brief carries the approach and declared scope the issue was reviewed
    // with (#3203); the scope is the plan's own parse of `Files to modify:`.
    members[s.number] = {
      title: s.title,
      acceptanceCriteria: extractAcceptanceCriteria(s.body || '').items.map(i => i.text),
      ...extractBriefSections(s.body || ''),
      declaredScope: scopeOf(s.number)
    };
  }
  const tddChecklist = loadTddChecklist();
  let inlineBriefs = false;
  for (const brief of memberBriefs({ plan, members, tddChecklist, root: process.cwd() })) {
    try {
      writeBrief(brief.path, brief.text);
    } catch (err) {
      inlineBriefs = true;
      warnings.push({ code: 'BRIEF_WRITE_FAILED', message: `Could not write ${brief.path} (${err && err.message ? err.message : String(err)}); every member brief is inline in its spawn request instead.` });
    }
  }
  const rootDir = process.cwd().replace(/\\/g, '/').replace(/\/+$/, '');
  // The run ledger (#3264): record-spawn creates it on the first spawn; a
  // resumed run reads it to map kept worktrees back to their members.
  const ledgerFile = `${rootDir}/.tmp-concurrent-${tracker}.json`;
  if (nonstop && Array.isArray(plan.groups) && plan.groups.length > 0) {
    const stateFile = `${rootDir}/.tmp-rolling-${tracker}.json`;
    const first = nextSteps({
      layers: plan.layers || [], dependsOn: plan.dependsOn || {}, maxAgents: plan.maxAgents, members, tddChecklist,
      root: process.cwd(), inlineBriefs, noReview, tail: (plan.tail || []).map(t => t.number), stateFile, ledgerFile, finishOnly: plan.finishOnly || [],
    });
    try {
      writeBrief(stateFile, JSON.stringify(first.state, null, 2));
    } catch (err) {
      warnings.push({ code: 'RUN_STATE_WRITE_FAILED', message: `Could not write ${stateFile} (${err && err.message ? err.message : String(err)}); the rolling schedule cannot advance past its first steps — re-run the preamble.` });
    }
    const total = (plan.layers || []).flat().length + (plan.tail || []).length;
    return { schedule: 'rolling', start: first.start, steps: first.steps, total, stateFile, ledgerFile, templates: { ...MEMBER_TEMPLATES }, tasks: memberTasks({ plan, members, rolling: true }) };
  }
  // The run's inputs, for the replan CLI (#3269): the Review-State Gate and
  // worktree creation decide after this plan is built, and a re-plan drops a
  // stopped or never-started member's later steps. A failed write leaves the
  // steps without re-plan instructions rather than naming a missing file.
  const inputs = { plan, members, nonstop: !!nonstop, tddChecklist, root: process.cwd(), inlineBriefs, noReview, ledgerFile };
  let stateFile = `${rootDir}/.tmp-run-${tracker}.json`;
  try {
    writeBrief(stateFile, JSON.stringify(inputs, null, 2));
  } catch (err) {
    warnings.push({ code: 'RUN_STATE_WRITE_FAILED', message: `Could not write ${stateFile} (${err && err.message ? err.message : String(err)}); a member the Review-State Gate stops, or whose worktree cannot be created, cannot be re-planned — re-run the preamble.` });
    stateFile = null;
  }
  const { steps, total, templates } = buildRun({ ...inputs, stateFile });
  return { schedule: 'groups', steps, total, templates, ...(stateFile ? { stateFile } : {}), ledgerFile, tasks: memberTasks({ plan, members }) };
}

/**
 * Build autoTask for epic issues
 * @param {Array<{ number: number, title: string }>} activeSubIssues
 * @param {number[]} processingOrder
 * @returns {{ source: string, items: Array<{ number: number, title: string }> }}
 */
function buildEpicAutoTask(activeSubIssues, processingOrder) {
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
 * Normalize a board status string for comparison.
 * Board values arrive in mixed spellings ('In progress' from `gh pmu view`,
 * 'in_progress' from CLI flags), so compare on a punctuation-free lowercase form.
 * @param {string|null|undefined} status
 * @returns {string} normalized status, or '' when absent
 */
function normalizeStatus(status) {
  if (!status || typeof status !== 'string') return '';
  return status.toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Ensure an issue is in in_progress status.
 *
 * `moved` reports whether this call caused a STATE CHANGE — not whether the
 * command exited 0 (#2483). Before that fix `moved` was unconditionally true on
 * success, so an issue already in_progress (every branch tracker, which
 * `gh pmu branch start` creates in that state) produced a no-op that the
 * envelope reported as a successful transition. That false signal is why
 * /work's missing sub-issue transitions went unnoticed.
 *
 * `priorStatus` is supplied by the caller from data already fetched by
 * gatherAllData (`--json=...,status`), so determining this costs no extra
 * round trip. The move is still issued when already in_progress — this
 * ensures the target state rather than skipping — we simply stop claiming
 * to have changed something that did not change.
 *
 * @param {number} issueNum
 * @param {string} [priorStatus] Board status before this call
 * @returns {Promise<{ moved: boolean, alreadyInProgress: boolean, error?: { code: string, message: string } }>}
 */
async function moveToInProgress(issueNum, priorStatus) {
  const alreadyInProgress = normalizeStatus(priorStatus) === 'inprogress';
  try {
    await execFileAsync('gh', ['pmu', 'move', String(issueNum), '--status', 'in_progress'], EXEC_OPTS);
    return { moved: !alreadyInProgress, alreadyInProgress };
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().trim() : e.message;
    return {
      moved: false,
      alreadyInProgress,
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
    'gh', ['pmu', 'view', String(trackerNum), '--json=status'],
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
    await execFileAsync('gh', ['pmu', 'move', String(trackerNum), '--status', 'in_progress'], EXEC_OPTS);
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
  } catch (e) {
    // #3266: a corrupt config left frameworkPath null with no word, so Step 2
    // loaded nothing and nobody was told why. Same nulls, now with a warning.
    return {
      framework: null,
      frameworkPath: null,
      warning: {
        code: 'FRAMEWORK_CONFIG_UNREADABLE',
        message: `framework-config.json could not be parsed (${e && e.message ? e.message : e}); framework and frameworkPath are unset for this run.`
      }
    };
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
/**
 * Parsed `.workstreams.json` for the WORKSTREAM_CONFLICT check, or null when
 * absent or unparseable. Shared by the single and batch paths (#3260): the
 * batch path called checkAssignability without it, so the check never ran.
 * @returns {object|null}
 */
function loadWorkstreams() {
  try {
    const wsPath = path.join(process.cwd(), '.workstreams.json');
    if (fs.existsSync(wsPath)) {
      return JSON.parse(fs.readFileSync(wsPath, 'utf-8'));
    }
  } catch (_e) {
    // No workstreams file or parse error — proceed without conflict check
  }
  return null;
}

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
 * Perform assignment of an issue to the current branch via assign-branch.js.
 * The branch checkAssignability validated is passed as --branch (#3160): left
 * implicit, assign-branch.js resolved its own, and with 2+ trackers printed
 * help and exited 0 — read here as success. A rejected branch now exits 1, and
 * its stderr (naming the open branches) is the ASSIGN_FAILED message.
 * @param {number} issueNum
 * @param {string} [branch] - The checked-out branch; omitted only by legacy callers
 * @returns {Promise<{ assigned: boolean, error?: { code: string, message: string } }>}
 */
/**
 * The LINK_OUTCOME line assign-branch.js prints under --link-json (#3405).
 * @param {string} stdout
 * @returns {object|null} null when no parseable line is present
 */
function parseLinkOutcome(stdout) {
  const line = String(stdout || '').split(/\r?\n/).reverse().find(l => l.startsWith('LINK_OUTCOME '));
  if (!line) return null;
  try { return JSON.parse(line.slice('LINK_OUTCOME '.length)); } catch (_e) { return null; }
}

/**
 * A TRACKER_LINK_FAILED warning when the Branch field was set but the issue is
 * not a tracker sub-issue (#3405) — `/work <tracker>` enumerates sub-issues,
 * so without this the issue silently drops out of tracker runs. `assigned`
 * stays true: the Branch field assignment itself succeeded.
 * @param {number} issueNum
 * @param {object|null} outcome - parseLinkOutcome() result
 * @returns {{code: string, message: string}|null}
 */
function trackerLinkWarning(issueNum, outcome) {
  if (!outcome) return null;
  const num = Number(issueNum);
  const tracker = outcome.tracker ? `#${outcome.tracker}` : 'the branch tracker';
  let reason = null;
  if ((outcome.limit || []).map(Number).includes(num)) {
    reason = `the tracker is at GitHub's ${outcome.limitSize || 100} sub-issue limit`;
  } else if ((outcome.failed || []).map(Number).includes(num)) {
    reason = (outcome.reasons && outcome.reasons[num]) || 'no reason reported';
  }
  if (!reason) return null;
  return {
    code: 'TRACKER_LINK_FAILED',
    message: `#${num} was assigned to the branch but not linked to tracker ${tracker} as a sub-issue: ${reason}. ` +
      `/work ${tracker.replace(/^the branch tracker$/, '<tracker>')} will not process it.`,
  };
}

async function performAssignment(issueNum, branch) {
  const scriptPath = path.join(__dirname, 'assign-branch.js');
  const args = [scriptPath, `#${issueNum}`];
  if (branch) args.push('--branch', branch);
  args.push('--link-json');
  try {
    const { stdout } = await execFileAsync('node', args, EXEC_OPTS);
    const warning = trackerLinkWarning(issueNum, parseLinkOutcome(stdout));
    return warning ? { assigned: true, warning } : { assigned: true };
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
 * @param {object} autoTask
 * @param {Array} warnings
 * @returns {object}
 */
function buildSuccessEnvelope(context, gates, autoTask, warnings) {
  return {
    ok: true,
    version: SCHEMA_VERSION,
    context: context || {},
    gates: gates || {},
    autoTask: autoTask || {},
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
    autoTask: {},
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
  // Parse-time warnings (#3126 AGENTS_IGNORED) travel with the envelope, so a
  // flag that had no effect is reported where the run reads its context.
  if (options && Array.isArray(options.parseWarnings)) warnings.push(...options.parseWarnings);
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

    // Branch trackers are not assignable (#2403) — reject before any mutation.
    if (isBranchTracker(issueCheck.issue)) {
      return buildErrorEnvelope([{
        code: 'BRANCH_TRACKER_NOT_ASSIGNABLE',
        message: `Issue #${issueNum} is a branch tracker and cannot be assigned. Target the sub-issues on the branch instead.`
      }]);
    }

    roundTrips++;
    const currentBranch = await getCurrentBranch();
    if (!currentBranch) {
      return buildErrorEnvelope([{ code: 'NO_CURRENT_BRANCH', message: 'Could not determine current git branch.' }]);
    }

    const assignCheck = await checkAssignability(issueNum, currentBranch, loadWorkstreams());
    if (!assignCheck.assignable) {
      return buildErrorEnvelope([assignCheck.error]);
    }

    if (!assignCheck.alreadyAssigned) {
      roundTrips++;
      const assignResult = await performAssignment(issueNum, currentBranch);
      if (!assignResult.assigned) {
        return buildErrorEnvelope([assignResult.error]);
      }
      if (assignResult.warning) warnings.push(assignResult.warning);
      assignGate = true;
    }
  }

  // #3273: once --assign has moved the issue, every later error envelope says
  // so — buildErrorEnvelope alone reported gates:{} and hid the mutation.
  const failAfterAssign = (errors) => {
    const envelope = buildErrorEnvelope(errors);
    if (assignGate) envelope.gates = { assigned: true };
    return envelope;
  };

  // 2. Parallel: gather all data (single consolidated call) + resolve tracker
  //    These are independent — tracker resolution only needs the current branch.
  const [dataResult, tracker] = await Promise.all([
    gatherAllData(issueNum),
    resolveTracker()
  ]);
  roundTrips++; // gatherAllData = 1 consolidated call
  roundTrips++; // resolveTracker

  if (dataResult.error) {
    return failAfterAssign([dataResult.error]);
  }

  if (tracker === null) {
    warnings.push({ code: 'NO_TRACKER', message: 'Could not resolve branch tracker.' });
  }

  // 3. Detect type + read framework config (both sync, no I/O)
  const type = detectIssueType(dataResult.issue);
  const frameworkConfig = readFrameworkConfig();
  if (frameworkConfig.warning) warnings.push(frameworkConfig.warning);

  // 4. Type-specific data gathering.
  //
  // This runs BEFORE the status transition below (#2622). The ordering
  // derivation `--nonstop` depends on consumes sub-issue bodies, and `--nonstop`
  // is precisely the mode that removes the per-sub-issue STOP where a human
  // would otherwise catch a wrong order — so the proposal has to exist before
  // the run starts mutating state, not after.
  //
  // Two consequences of the reorder, both deliberate:
  //   - a failure to load sub-issues returns SUB_ISSUE_LOAD_FAILED before the
  //     tracker is moved to in_progress, rather than leaving it moved with
  //     nothing derived (true since #3265; it was a warning before);
  //   - `moveToInProgress` still reads `dataResult.branch.status` captured in
  //     step 2, so the reorder cannot stale the prior-status comparison that
  //     makes `movedToInProgress` report a real transition (#2483).
  let autoTask;
  const context = {
    issue: dataResult.issue,
    branch: dataResult.branch,
    type,
    tracker,
    framework: frameworkConfig.framework,
    frameworkPath: frameworkConfig.frameworkPath,
    ...(options && options.wait ? { wait: true } : {}),
    ...(options && options.noReview ? { noReview: true } : {})
  };

  // 4a. Redirect types return BEFORE any work is loaded or any status moved
  //     (#2784). An approval issue's gates are not acceptance criteria — they
  //     are a checklist `/review-test-plan` Step 5a computes and confirms — so
  //     loading them as `autoTask` items is what produced six unmarked
  //     unchecked ACs at Step 4b.
  //
  //     Placement is the contract. This sits above the type-specific loading
  //     and above step 5's `moveToInProgress`, so a redirected issue is left
  //     exactly as found: the command that owns the work owns the transition,
  //     the same reason `/review-issue`'s redirect happens before its own
  //     side effects.
  const redirect = detectRedirect(dataResult.issue);
  if (redirect) {
    context.redirect = redirect.command;
    context.redirectLabel = redirect.label;
    const envelope = buildSuccessEnvelope(
      context,
      { assigned: assignGate, movedToInProgress: false, alreadyInProgress: false, prdTrackerMoved: false },
      { items: [] },
      warnings
    );
    envelope.roundTrips = roundTrips;
    return envelope;
  }

  // 4b. #3265: an issue already In review or Done is finished work. Moving it
  //     back to in_progress silently reopened it; now /work refuses, naming
  //     the status, unless --reopen asks for exactly that.
  const priorStatus = dataResult.branch && dataResult.branch.status;
  const priorNorm = normalizeStatus(priorStatus);
  const finished = priorNorm === 'inreview' || priorNorm === 'done';
  if (finished && !(options && options.reopen)) {
    return failAfterAssign([finishedWorkError(issueNum, priorStatus, priorNorm)]);
  }

  // The tree's active members, held for the #3259 start-move decision below.
  let treeActive = [];
  let treeSkipped = [];
  if (type === 'epic' || type === 'branch') {
    // Epic/Branch flow: load sub-issues, check statuses (parallelized), determine order
    roundTrips++;
    const subResult = await loadSubIssues(issueNum);
    if (subResult.error) {
      return failAfterAssign([subResult.error]);
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

    // Parallelized but still counted; CLOSED children cost no call (#2970).
    roundTrips += subResult.subIssues.filter(s => s.state !== 'CLOSED').length;
    const statusResult = await checkSubIssueStatuses(subResult.subIssues);
    context.skipped = statusResult.skipped;
    treeActive = statusResult.active;
    treeSkipped = statusResult.skipped;
    // #3265: a child whose status could not be read is reported, never worked.
    // Under --nonstop nobody would see the warning, so the run halts instead.
    if (statusResult.unreadable.length > 0) {
      const named = statusResult.unreadable.map((u) => `#${u.number} (${u.reason})`).join('; ');
      const unreadableIssue = {
        code: 'SUB_ISSUE_STATUS_UNREADABLE',
        message: `Board status could not be read for ${named}; ${statusResult.unreadable.length === 1 ? 'it is' : 'they are'} not worked by this run. Re-run once gh pmu view succeeds.`
      };
      if (options && options.nonstop) return failAfterAssign([unreadableIssue]);
      warnings.push(unreadableIssue);
      context.unreadable = statusResult.unreadable.map((u) => u.number);
      // The processing loop skips what context.skipped names. Dependency
      // ordering still reads statusResult.skipped, so an unreadable member is
      // never mistaken for a satisfied dependency.
      context.skipped = [
        ...context.skipped,
        ...statusResult.unreadable.map((u) => ({ number: u.number, status: null, reason: 'status-unreadable' }))
      ];
    }

    // Surface the bodies fetched above on context.subIssues (#2622, AC1).
    // context.subIssues stays the FULL list — active plus skipped — because two
    // callers count it; only the active entries gain body/labels, which is
    // exactly the set the ordering pass consumes.
    const enrichedByNumber = new Map(statusResult.active.map(s => [s.number, s]));
    context.subIssues = subResult.subIssues.map(s => enrichedByNumber.get(s.number) || s);

    // Epics and branch trackers both read **Processing Order:** from their own body,
    // falling back to ascending numeric order when the section is absent (#2544).
    const orderDetail = parseProcessingOrderDetail(dataResult.issue.body, subNums);
    const declaredOrder = orderDetail.order;
    // #3270: an entry the parser set aside is reported, never replaced silently.
    for (const message of orderDetail.warnings) warnings.push({ code: 'PROCESSING_ORDER_PARTIAL', message });

    // #3128: the order actually worked is a topological sort of the
    // **Depends on:** graph, the declared order breaking ties. A cycle has no
    // valid order, so it halts HERE — above the plan, above the status move —
    // and nothing has been created or moved when the run stops.
    const dependencies = orderByDependencies(statusResult.active, statusResult.skipped, declaredOrder);
    if (!dependencies.ok) {
      return failAfterAssign([{
        code: 'DEPENDENCY_CYCLE',
        message: dependencies.graph.message,
        cycle: dependencies.graph.cycle
      }]);
    }
    const processingOrder = dependencies.order;
    context.processingOrder = processingOrder;
    // #3270: what a run — or a resume after compaction — works next, in the
    // dependency order. context.subIssues keeps `gh pmu sub list` order, so
    // resuming from it could start a child before its **Depends on:** sibling.
    const skippedSet = new Set((context.skipped || []).map((s) => s.number));
    context.resumeOrder = processingOrder.filter((n) => !skippedSet.has(n));

    // #3270: a sequential --nonstop halt leaves an `unswept` marker on the
    // tracker; a resumed --nonstop run must sweep those members' changes too.
    if (options && options.nonstop) {
      roundTrips++;
      const commentsResult = await execJSON(
        'gh', ['issue', 'view', String(issueNum), '--json=comments'],
        'TRACKER_COMMENTS_FAILED',
        `Failed to read comments on #${issueNum}`
      );
      if (commentsResult.error) {
        warnings.push({ code: 'UNSWEPT_UNKNOWN', message: `${commentsResult.error.message}; an earlier halt's not-swept members cannot be recovered this run.` });
      } else {
        const unswept = parseLatestUnswept(commentsResult.data && commentsResult.data.comments);
        if (unswept.length > 0) context.unswept = unswept;
      }
    }
    context.declaredOrder = declaredOrder;
    context.dependencyGraph = {
      edges: dependencies.graph.edges,
      blockedBy: dependencies.graph.blockedBy,
      invalid: dependencies.graph.invalid
    };
    for (const message of dependencies.graph.warnings) {
      warnings.push({ code: 'DEPENDS_ON_INVALID', message });
    }

    // A dependency on a skipped qa-required member cannot be met by this run
    // (#3128, Corner Case 1): the QA issue is a gate on the parent, never
    // worked in the loop. Under --nonstop nobody is present to notice the
    // dependent being worked anyway, so the run halts here, before any move;
    // in default mode it is reported, and --concurrent's plan sends the
    // dependent to the tail.
    const blockedBy = Object.entries(dependencies.graph.blockedBy);
    if (blockedBy.length > 0) {
      const message = 'Depends on a skipped qa-required member this run never works: '
        + blockedBy.map(([n, qa]) => `#${n} → ${qa.map(q => `#${q}`).join(', ')}`).join('; ')
        + '. Close the QA issue (/qa #N) or remove the dependency.';
      if (options && options.nonstop) {
        return failAfterAssign([{ code: 'DEPENDS_ON_QA_REQUIRED', message }]);
      }
      warnings.push({ code: 'DEPENDS_ON_QA_REQUIRED', message });
    }

    autoTask = buildEpicAutoTask(statusResult.active, processingOrder);

    // Derive a proposed order from sub-issue CONTENT (#2622, AC6). Gated on
    // --nonstop: default mode's per-sub-issue STOP already gives a human the
    // chance to reorder, so paying for the derivation there buys nothing.
    //
    // `proposedOrder` sits ALONGSIDE `processingOrder`, never replacing it. The
    // caller reports the difference and persists only on acceptance; silently
    // swapping the order here would be exactly the unattended reorder this
    // issue rules out, and the derivation's measured miss rate is why.
    if (options && options.nonstop) {
      const derived = deriveProposedOrder(statusResult.active, processingOrder);
      // #3128: the heuristic only breaks ties the graph leaves open. Re-sorting
      // its ranking topologically means a proposal can never place a member
      // before what it declares it depends on — the wrong order this report
      // once offered when a scope heuristic misread "created in #N".
      const constrained = orderByDependencies(statusResult.active, statusResult.skipped, derived.order);
      const proposed = constrained.ok ? constrained.order : derived.order;
      const current = processingOrder.filter(n => proposed.includes(n));
      context.proposedOrder = proposed;
      context.orderDiffers = proposed.length !== current.length || proposed.some((n, i) => n !== current[i]);
      context.orderRationale = derived.rationale;
      if (derived.warning) warnings.push(derived.warning);
    }

    // Concurrency plan (#3126). Gated on --concurrent, present in default and
    // --nonstop mode alike, and — like the ordering derivation — computed
    // BEFORE the status move below, so a plan the rule may still reject never
    // follows a transition. Members are the ACTIVE set: skipped sub-issues
    // are not worked, so they are not grouped.
    if (options && options.concurrent) {
      // #3224: a member worktree starts from the tracker's HEAD only when the
      // WorktreeCreate hook is registered; absent (or unreadable settings),
      // the plan falls back to sequential. Injectable so tests read no disk.
      const hook = (options.resolveWorktreeHook || resolveWorktreeHookFromDisk)();
      if (hook && Array.isArray(hook.warnings)) warnings.push(...hook.warnings);
      // #3277: the tracker tree is checked before any spawn step. Injectable
      // so tests run no git.
      const dirtyTree = trackerTreeDirtyWarning(await (options.readTrackerStatus || readTrackerStatusFromGit)());
      if (dirtyTree) warnings.push(dirtyTree);
      // #3264: a resumed run's members already merged on the tracker are
      // finished, not re-spawned. Injectable so tests run no git.
      const numbers = statusResult.active.map((s) => s.number);
      const logs = await (options.readResumeLogs || readResumeLogsFromGit)(numbers);
      const { merged } = classifyResume({ members: numbers, logs });
      const found = await (options.readResumeWorktrees || readResumeWorktreesFromDisk)(issueNum);
      // #3350: drop ledger entries whose worktree is gone and whose member is
      // not active, before matching; a kept worktree's entry always stays.
      const pruned = pruneRunLedger(found.ledger, { worktrees: found.worktrees, active: numbers });
      if (pruned.dropped.length) {
        try {
          (options.writeResumeLedger || writeResumeLedgerToDisk)(issueNum, pruned.ledger);
        } catch (_e) { /* the in-memory prune still applies to this run */ }
        warnings.push({ code: 'RUN_LEDGER_PRUNED', dropped: pruned.dropped, message: `Pruned ${pruned.dropped.length} run-ledger ${pruned.dropped.length === 1 ? 'entry' : 'entries'} with no worktree and no active member: ${pruned.dropped.map((n) => `#${n}`).join(', ')}.` });
      }
      const worktreeMatch = matchKeptWorktrees({ worktrees: found.worktrees, ledger: pruned.ledger, members: numbers.filter((n) => !merged.includes(n)) });
      for (const k of worktreeMatch.kept) {
        warnings.push({ code: 'KEPT_WORKTREE', message: `#${k.issue} has a worktree kept from an earlier run at ${k.worktreePath} (${k.branch}); it is held, not re-spawned, since it may hold fixes. Check it, then merge it with \`node .claude/scripts/shared/lib/merge-back-gate.js merge-back --tracker <tracker branch> --member ${k.issue}:${k.branch}:${k.worktreePath}\`, or tear it down with worktree-teardown.js, and re-run.` });
      }
      for (const u of worktreeMatch.unmatched) {
        warnings.push({ code: 'UNMATCHED_WORKTREE', message: `Worktree ${u.worktreePath} (${u.branch}) is not in ${worktreeMatch.ledgerFound ? 'the run ledger' : 'any run ledger — none was found'}; it may hold a member's work from an earlier run. Inspect it before tearing it down.` });
      }
      context.concurrencyPlan = buildPlan({
        resume: { merged, kept: worktreeMatch.kept },
        members: statusResult.active,
        processingOrder,
        maxAgents: options.maxAgents,
        source: options.maxAgents !== undefined ? (options.maxAgentsSource || 'flag') : 'default',
        dependencies: context.dependencyGraph,
        worktreeHookRegistered: !!(hook && hook.registered)
      });
      context.concurrentRun = buildConcurrentRun(context.concurrencyPlan, statusResult.active, options.nonstop, {
        ...(options.writeBrief ? { writeBrief: options.writeBrief } : {}),
        warnings,
        tracker: issueNum,
        noReview: !!options.noReview
      });
    }

    // Branch tracker with all sub-issues complete: suggest next step
    if (type === 'branch' && subNums.length > 0 && statusResult.active.length === 0) {
      warnings.push({
        code: 'ALL_SUB_ISSUES_COMPLETE',
        message: 'All sub-issues are complete. Consider running /merge-branch or /prepare-release.'
      });
    }
  } else {
    // --concurrent has no members to group on a standard issue (#3126):
    // reported as ignored, never an error, so the flag cannot stop a run it
    // does not apply to.
    if (options && options.concurrent) {
      warnings.push({
        code: 'CONCURRENT_IGNORED',
        message: '--concurrent applies to an epic or branch tracker; ignored for a standard issue.'
      });
    }
    // Standard flow: parse acceptance criteria
    autoTask = parseAcceptanceCriteria(dataResult.issue.body);
    // #2614: report which empty case this is, before Step 3 begins.
    const acWarning = buildAcSectionWarning(autoTask, issueNum);
    if (acWarning) warnings.push(acWarning);
  }

  // 5a. #3259: when the review gate will stop, nothing moves. Accepting the
  //     gate's offer then leaves the issue, its PRD tracker and the tree's
  //     root exactly as found; a decline is moved by the Step 3 Pre-Work
  //     Status Gate, which also moves `moveDeferred.prdTracker` when set.
  const prdTrackerNum = parsePrdTracker(dataResult.issue.body);
  const startMove = decideStartMove({
    type, issue: dataResult.issue, active: treeActive, skipped: treeSkipped, nonstop: !!(options && options.nonstop)
  });
  if (startMove.defer) {
    const priorStatus = dataResult.branch && dataResult.branch.status;
    const envelope = buildSuccessEnvelope(context, {
      assigned: assignGate,
      movedToInProgress: false,
      alreadyInProgress: normalizeStatus(priorStatus) === 'inprogress',
      prdTrackerMoved: false,
      moveDeferred: {
        ...(startMove.state ? { state: startMove.state } : {}),
        action: startMove.action,
        reason: startMove.reason,
        prdTracker: prdTrackerNum || null
      }
    }, autoTask, warnings);
    envelope.roundTrips = roundTrips;
    return envelope;
  }

  // 5. Ensure in_progress. Prior status comes from gatherAllData in step 2 — no
  //    extra round trip — so movedToInProgress reports a real transition (#2483).
  //    Runs AFTER the ordering derivation above; see the note on step 4.
  roundTrips++;
  const moveResult = await moveToInProgress(issueNum, dataResult.branch && dataResult.branch.status);
  const gates = {
    assigned: assignGate,
    movedToInProgress: moveResult.moved,
    alreadyInProgress: moveResult.alreadyInProgress,
    prdTrackerMoved: false,
    // #3265: --reopen names the status it reopened, so the move is reported.
    ...(finished && moveResult.moved ? { reopenedFrom: priorStatus } : {})
  };
  if (moveResult.error) {
    return failAfterAssign([moveResult.error]);
  }

  // 6. PRD tracker auto-move
  if (prdTrackerNum) {
    roundTrips++;
    const prdResult = await movePrdTracker(prdTrackerNum);
    gates.prdTrackerMoved = prdResult.moved;
    if (prdResult.warning) {
      warnings.push(prdResult.warning);
    }
  }

  const envelope = buildSuccessEnvelope(context, gates, autoTask, warnings);
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
    'gh', ['pmu', 'list', '--status', status, '--json=number,title'],
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
/**
 * The #3265 refusal for finished work, shared by the single and batch paths
 * (#3292) so the two cannot word or code it differently.
 */
function finishedWorkError(issueNum, priorStatus, priorNorm) {
  return {
    code: priorNorm === 'done' ? 'ALREADY_DONE' : 'ALREADY_IN_REVIEW',
    message: `Issue #${issueNum} is already ${priorStatus}; /work made no status move. Re-run with --reopen to move it back to in_progress and work it again.`
  };
}

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

  // #3260: an epic or branch tracker is not expanded inside a batch — its
  // sub-issue loading, ordering and tree gate belong to the single-issue path.
  // Refused with a named error before any mutation, never worked as a story.
  const memberType = detectIssueType(issueResult.issue);
  if (memberType === 'epic' || (memberType === 'branch' && !assignRequested)) {
    return {
      ok: false,
      issueNum,
      errors: [{
        code: 'TREE_IN_BATCH',
        message: `Issue #${issueNum} is ${memberType === 'epic' ? 'an epic' : 'a branch tracker'}; a batch does not expand it. Run it on its own: /work #${issueNum}`
      }],
      warnings: [],
      roundTrips
    };
  }

  // --assign: check assignability and perform assignment
  if (assignRequested) {
    // Branch trackers are not assignable (#2403) — reject before any mutation.
    if (isBranchTracker(issueResult.issue)) {
      return {
        ok: false,
        issueNum,
        errors: [{
          code: 'BRANCH_TRACKER_NOT_ASSIGNABLE',
          message: `Issue #${issueNum} is a branch tracker and cannot be assigned. Target the sub-issues on the branch instead.`
        }],
        warnings: [],
        roundTrips
      };
    }

    roundTrips++;
    const currentBranch = await getCurrentBranch();
    if (!currentBranch) {
      return { ok: false, issueNum, errors: [{ code: 'NO_CURRENT_BRANCH', message: 'Could not determine current git branch.' }], warnings: [], roundTrips };
    }

    const assignCheck = await checkAssignability(issueNum, currentBranch, loadWorkstreams());
    if (!assignCheck.assignable) {
      return { ok: false, issueNum, errors: [assignCheck.error], warnings: [], roundTrips };
    }

    if (!assignCheck.alreadyAssigned) {
      roundTrips++;
      const assignResult = await performAssignment(issueNum, currentBranch);
      if (!assignResult.assigned) {
        return { ok: false, issueNum, errors: [assignResult.error], warnings: [], roundTrips };
      }
      if (assignResult.warning) warnings.push(assignResult.warning);
      assignGate = true;
    }
  }

  roundTrips++;
  const branchResult = await gatherBranchData(issueNum);
  if (branchResult.error) {
    // #3273: an assignment that already happened is reported, not hidden.
    return { ok: false, issueNum, errors: [branchResult.error], warnings: [], roundTrips, ...(assignGate ? { gates: { assigned: true } } : {}) };
  }

  const type = detectIssueType(issueResult.issue);
  const context = {
    issue: issueResult.issue,
    branch: branchResult.branch,
    type,
    tracker: shared.tracker,
    framework: shared.framework,
    frameworkPath: shared.frameworkPath,
    ...(options && options.wait ? { wait: true } : {}),
    ...(options && options.noReview ? { noReview: true } : {})
  };
  const gates = { assigned: assignGate, movedToInProgress: false, alreadyInProgress: false, prdTrackerMoved: false };

  // #3260: the same redirect the single-issue path applies (#2784), at the
  // same point — after the branch check, before any AC is loaded. A test-plan
  // or qa-required member's checkboxes are not this run's work. The batch is
  // not handed off mid-run: the caller works the other members and reports
  // this one with its command at the end.
  const redirect = detectRedirect(issueResult.issue);
  if (redirect) {
    context.redirect = redirect.command;
    context.redirectLabel = redirect.label;
    return { ok: true, issueNum, context, gates, autoTask: { items: [] }, errors: [], warnings, roundTrips };
  }

  // #3292: the #3265 finished-work guard, at the same point as the single
  // path (after the redirect). Without it a batch member In review or Done
  // came back ok and Step 3's status gate moved it back to in_progress.
  const priorStatus = branchResult.branch && branchResult.branch.status;
  const priorNorm = normalizeStatus(priorStatus);
  if (priorNorm === 'inreview' || priorNorm === 'done') {
    if (!(options && options.reopen)) {
      return {
        ok: false,
        issueNum,
        errors: [finishedWorkError(issueNum, priorStatus, priorNorm)],
        warnings: [],
        roundTrips,
        ...(assignGate ? { gates: { assigned: true } } : {})
      };
    }
    gates.reopenedFrom = priorStatus;
  }

  const autoTask = parseAcceptanceCriteria(issueResult.issue.body);
  // #2614: same reporting on the batch path — a vacuous pass is no more visible
  // in a batch than alone, and a batch offers less opportunity to notice it.
  const acWarning = buildAcSectionWarning(autoTask, issueNum);
  if (acWarning) warnings.push(acWarning);

  return {
    ok: true,
    issueNum,
    context,
    gates,
    autoTask,
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

  // #3260: flags that only an epic or branch tracker uses are reported once,
  // never dropped silently. Members are never trees on this path (TREE_IN_BATCH).
  const warnings = [];
  if (frameworkConfig.warning) warnings.push(frameworkConfig.warning);   // #3266
  if (options && options.concurrent) {
    warnings.push({ code: 'CONCURRENT_IGNORED', message: '--concurrent applies to an epic or branch tracker; ignored for a selection of issues.' });
  }
  if (options && options.nonstop) {
    warnings.push({ code: 'NONSTOP_IGNORED', message: '--nonstop applies to an epic or branch tracker; ignored for a selection of issues.' });
  }

  // A batch in which every member failed is a failed batch (#3260); one that
  // has any member to work is ok, with per-member errors in results[].
  const allFailed = results.length > 0 && results.every((r) => !r.ok);
  return {
    ok: !allFailed,
    version: SCHEMA_VERSION,
    results,
    errors: allFailed
      ? [{ code: 'ALL_MEMBERS_FAILED', message: `Every member of the selection failed: ${results.map((r) => `#${r.issueNum}`).join(', ')}.` }]
      : [],
    warnings,
    roundTrips: results.reduce((sum, r) => sum + (r.roundTrips || 0), 0) + (issueNums.length > 0 ? 1 : 0)
  };
}

// ─── Main Entry Point ───

/**
 * The --schema envelope reference.
 *
 * Extracted from main() in #2614. The autoTask description had gone stale —
 * it still described the pre-#2600 shape and omitted sectionFound — for the
 * same structural reason #2624 found in the options mapping: it lived inline
 * in main(), where no test could address it. A description nothing can assert
 * against drifts from the envelope silently, which is the exact failure this
 * issue is about, one level up.
 *
 * @returns {Object<string, {name: string, type: string, description: string}>}
 */
function buildSchema() {
  return {
    context: {
      name: 'context',
      type: 'object',
      description: 'Issue data (number, title, labels, body, state), branch/status data, type ("branch"/"epic"/"standard"), tracker number, framework config, sub-issues, skipped, and processing order. On an epic or branch tracker (#3128): processingOrder is a topological sort of the **Depends on:** graph with declaredOrder (the **Processing Order:** section, else ascending) breaking ties, and dependencyGraph { edges, blockedBy, invalid } carries the graph; a cycle fails the preamble with DEPENDENCY_CYCLE before any status move, and so — under --nonstop only — does a dependency on a skipped qa-required member (DEPENDS_ON_QA_REQUIRED; a warning otherwise). in_review/done members satisfy their dependents. With --concurrent on an epic or branch tracker (#3126): concurrencyPlan { maxAgents, source ("default"|"flag"), groups (number[][] in Processing Order, each at most maxAgents), tail ([{ number, cause, reason }]), members, noGroupReason } — zero groups, every member in the tail and a noGroupReason naming the hook when no settings layer (.claude/settings.json, .claude/settings.local.json, ~/.claude/settings.json) registers the WorktreeCreate hook worktree-create-hook.js; an unreadable or malformed layer warns WORKTREE_HOOK_SETTINGS_UNREADABLE and counts as absent (#3224) — and concurrentRun { steps, total, templates, tasks } (#3129) — the parent\'s step sequence from concurrent-orchestration.js, a worktree spawn request on each group member\'s spawn step whose prompt names the member brief written to .tmp-brief-<N>.md at the root (request.briefPath; the brief is inline only when a write failed, warned BRIEF_WRITE_FAILED — #3280), and one task per member naming its group. A step carries either instruction text or, for the per-member gate steps (gate-tier1, gate-tier2, gate-tier3, gate-outcome), a template id and params: its instruction is templates[template] with each {{key}} replaced by params[key] (instructionOf in concurrent-orchestration.js, #3280). concurrentRun.schedule is "groups" (default --concurrent: fixed groups, one STOP per group) or "rolling" (--nonstop --concurrent, #3274): steps are only what runs first, start names the members started, and stateFile (.tmp-rolling-<tracker>.json) holds the run state — after each member\'s merge-back, and after each batch\'s reports, run `node .claude/scripts/shared/lib/concurrent-orchestration.js next-steps --state <stateFile> [--merged N ...] [--passed N ...]` and execute the steps it prints, until done is true; a member the Review-State Gate stops, or whose worktree cannot be created, is reported with next-steps --stopped N / --not-started N[=<path>] and halts the run. Under "groups" stateFile (.tmp-run-<tracker>.json) holds the run\'s inputs: the review-state-gate and spawn steps name `node .claude/scripts/shared/lib/concurrent-orchestration.js replan --state <stateFile> --stopped N` / `--not-started N[=<path>]`, which re-plans without that member\'s later steps (#3269). --no-review turns every Tier 3 reviewer spawn into a review-skip step under --concurrent, and skips the sequential /work review otherwise (#3457); it applies in every mode and sets context.noReview. A resumed run (#3264): concurrencyPlan.finishOnly names members whose Refs #N commits reached the tracker through a merge — each gets a resume-finish step and its remaining steps, never a spawn; concurrencyPlan.held names members with a worktree kept from an earlier run (matched through the run ledger, concurrentRun.ledgerFile = .tmp-concurrent-<tracker>.json, which the record-spawn command in each spawn step onSpawned writes) and heldBehind what depends on them — warned KEPT_WORKTREE with the merge-back command; a wt/* worktree no ledger names is warned UNMATCHED_WORKTREE.'
    },
    gates: {
      name: 'gates',
      type: 'object',
      description: 'Boolean gate results: assigned, movedToInProgress, alreadyInProgress, prdTrackerMoved. movedToInProgress reports a real state change — it is false when the issue was already in_progress (see alreadyInProgress), not merely when the move command failed.'
    },
    autoTask: {
      name: 'autoTask',
      type: 'object',
      description: 'Auto-generated task list. Standard: { source: "acceptance_criteria", items: [{ text, checked }], sectionFound }. sectionFound distinguishes "no acceptance-criteria section" (false) from "a section that parsed to nothing" (true); an empty items list alone cannot. Epic/Branch: { source: "sub_issues", items: [{ number, title }] }.'
    },
    warnings: {
      name: 'warnings',
      type: 'array',
      description: 'Non-blocking warnings (e.g., NO_SUB_ISSUES, ALL_SUB_ISSUES_COMPLETE, DEPENDS_ON_INVALID, DEPENDS_ON_QA_REQUIRED). Each has code and message.'
    }
  };
}

/**
 * Map parsed CLI args onto the options object runSingleIssue/runBatch consume.
 *
 * Extracted in #2624. main() previously mapped the modifier flags inline, and
 * mapped only two of the three: --nonstop was parsed at every parseArgs return
 * site and gated the #2622 ordering derivation in runSingleIssue, but nothing
 * carried it between them. Both endpoints had tests; the wire between them was
 * unreachable from any test, so the derivation was inert from the CLI while the
 * suite stayed green.
 *
 * A function rather than a third inline `if`: the defect was that the mapping
 * lived somewhere no test could address, and another unguarded line reproduces
 * that exposure for the next flag added.
 *
 * Absent flags are omitted, not set false — same convention parseArgs uses.
 * Callers gate on truthiness either way, but an envelope reporting wait:false
 * describes a decision nobody made.
 *
 * @param {{assign?: boolean, wait?: boolean, nonstop?: boolean}} parsed parseArgs output
 * @returns {{assign?: boolean, wait?: boolean, nonstop?: boolean}}
 */
function buildOptions(parsed) {
  const options = {};
  if (!parsed) return options;
  if (parsed.assign) options.assign = true;
  if (parsed.wait) options.wait = true;
  if (parsed.nonstop) options.nonstop = true;
  if (parsed.reopen) options.reopen = true;   // #3265
  // #3126
  if (parsed.concurrent) options.concurrent = true;
  if (parsed.noReview) options.noReview = true;   // #3269
  if (parsed.maxAgents !== undefined) {
    options.maxAgents = parsed.maxAgents;
    options.maxAgentsSource = parsed.maxAgentsSource || 'flag';
  }
  if (Array.isArray(parsed.parseWarnings) && parsed.parseWarnings.length > 0) {
    options.parseWarnings = parsed.parseWarnings;
  }
  return options;
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
    process.stdout.write(JSON.stringify(helpEnvelope('work'), null, 2) + '\n');
    process.exit(0);
    return;
  }

  if (parsed.mode === 'schema') {
    const schema = buildSchema();
    process.stdout.write(JSON.stringify(schema, null, 2) + '\n');
    process.exit(0);
    return;
  }

  const options = buildOptions(parsed);

  if (parsed.mode === 'single') {
    const result = await runSingleIssue(parsed.issues[0], options);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
    return;
  }

  if (parsed.mode === 'batch') {
    const result = await runBatch(parsed.issues, options);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
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
    process.exit(result.ok ? 0 : 1);
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
  detectRedirect,
  isBranchTracker,
  parseAcceptanceCriteria,
  normalizeStatus,
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
  buildSchema,
  buildAcSectionWarning,
  buildOptions,
  parseProcessingOrder,
  parseProcessingOrderDetail,
  buildUnsweptMarker,
  parseLatestUnswept,
  deriveProposedOrder,
  buildProcessingOrderSection,
  applyProcessingOrder,
  buildEpicAutoTask,
  resolveStatusIssues,
  runBatch,
  resolveWorktreeHookFromDisk,
  execSafe,
  main
};
