#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.98.0
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
    const result = { mode: 'single', issues: [num] };
    if (hasAssign) result.assign = true;
    if (hasWait) result.wait = true;
    if (hasNonstop) result.nonstop = true;
    return result;
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
    const result = { mode: 'batch', issues: nums };
    if (hasAssign) result.assign = true;
    if (hasWait) result.wait = true;
    if (hasNonstop) result.nonstop = true;
    return result;
  }

  const statusFlag = findFlag(args, 'status');
  if (statusFlag) {
    const status = statusFlag.value;
    if (!status) {
      return { error: { code: 'MISSING_ARGUMENT', message: '--status requires a value.' } };
    }
    const result = { mode: 'status', status };
    if (hasAssign) result.assign = true;
    if (hasWait) result.wait = true;
    if (hasNonstop) result.nonstop = true;
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
    'gh', ['pmu', 'view', String(issueNum), '--json=number,title,labels,body,state,status,branch'],
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
  return 'standard';
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
 * @returns {Promise<{ subIssues: Array<{ number: number, title: string }>, warning?: object }>}
 */
async function loadSubIssues(issueNum) {
  const result = await execJSON(
    'gh', ['pmu', 'sub', 'list', String(issueNum), '--json'],
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
 *
 * Active entries carry `body` and `labels` (#2622). `gh pmu sub list` returns
 * number/title/state only, so before this the ordering decision was made from
 * issue NUMBERS while the content that should drive it sat in the bodies,
 * unread. The fields ride along on the status query that already runs once per
 * sub-issue, so bodies cost zero additional round trips.
 *
 * Skipped entries stay `{ number, status }`. They feed a report line rather than
 * the ordering pass, and two existing suites assert that exact shape.
 *
 * @param {Array<{ number: number, title: string }>} subIssues
 * @returns {Promise<{ skipped: Array<{ number: number, status: string }>, active: Array<{ number: number, title: string, body: string, labels: string[] }> }>}
 */
async function checkSubIssueStatuses(subIssues, timeoutMs = 30000) {
  const skipped = [];
  const active = [];
  const skipStatuses = ['in review', 'done'];

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
        subIssues.map(async (sub) => {
          try {
            const { stdout } = await execFileAsync('gh', ['pmu', 'view', String(sub.number), '--json=status,body,labels'], EXEC_OPTS);
            const data = JSON.parse(stdout.trim());
            return { sub, status: data.status, body: data.body, labels: data.labels };
          } catch (_e) {
            // Fail-open: an unreadable sub-issue stays in the work list. Body and
            // labels normalize below, so a fetch failure degrades the ordering
            // signal rather than dropping the sub-issue.
            return { sub, status: null, body: null, labels: null };
          }
        })
      ),
      timeoutPromise
    ]);
  } finally {
    clearTimeout(timeoutHandle);
  }

  for (const { sub, status, body, labels } of statusResults) {
    if (status && skipStatuses.includes(status.toLowerCase())) {
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
  return { skipped, active };
}

/**
 * Parse processing order from an epic or branch tracker body (#2544)
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
  const text = typeof body === 'string' ? body : '';
  const lines = text.split('\n');

  const headerIdx = lines.findIndex(l => l.trim() === '**Processing Order:**');
  if (headerIdx === -1) {
    const sep = text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n';
    return text + sep + section;
  }

  // The section ends where parseProcessingOrder stops reading: the first blank
  // line or `##` heading after the header. Keeping the two definitions aligned
  // is what makes the round-trip hold.
  let end = headerIdx + 1;
  while (end < lines.length && lines[end].trim() !== '' && !lines[end].startsWith('##')) {
    end++;
  }

  const replacement = section.replace(/\n$/, '').split('\n');
  return [...lines.slice(0, headerIdx), ...replacement, ...lines.slice(end)].join('\n');
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
    await execFileAsync('node', [scriptPath, `#${issueNum}`], EXEC_OPTS);
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

  // 4. Type-specific data gathering.
  //
  // This runs BEFORE the status transition below (#2622). The ordering
  // derivation `--nonstop` depends on consumes sub-issue bodies, and `--nonstop`
  // is precisely the mode that removes the per-sub-issue STOP where a human
  // would otherwise catch a wrong order — so the proposal has to exist before
  // the run starts mutating state, not after.
  //
  // Two consequences of the reorder, both deliberate:
  //   - a failure to load sub-issues now returns before the tracker is moved to
  //     in_progress, rather than leaving it moved with nothing derived;
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

    // Surface the bodies fetched above on context.subIssues (#2622, AC1).
    // context.subIssues stays the FULL list — active plus skipped — because two
    // callers count it; only the active entries gain body/labels, which is
    // exactly the set the ordering pass consumes.
    const enrichedByNumber = new Map(statusResult.active.map(s => [s.number, s]));
    context.subIssues = subResult.subIssues.map(s => enrichedByNumber.get(s.number) || s);

    // Epics and branch trackers both read **Processing Order:** from their own body,
    // falling back to ascending numeric order when the section is absent (#2544).
    const processingOrder = parseProcessingOrder(dataResult.issue.body, subNums);
    context.processingOrder = processingOrder;

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
      context.proposedOrder = derived.order;
      context.orderDiffers = derived.differs;
      context.orderRationale = derived.rationale;
      if (derived.warning) warnings.push(derived.warning);
    }

    // Branch tracker with all sub-issues complete: suggest next step
    if (type === 'branch' && subNums.length > 0 && statusResult.active.length === 0) {
      warnings.push({
        code: 'ALL_SUB_ISSUES_COMPLETE',
        message: 'All sub-issues are complete. Consider running /merge-branch or /prepare-release.'
      });
    }
  } else {
    // Standard flow: parse acceptance criteria
    autoTask = parseAcceptanceCriteria(dataResult.issue.body);
    // #2614: report which empty case this is, before Step 3 begins.
    const acWarning = buildAcSectionWarning(autoTask, issueNum);
    if (acWarning) warnings.push(acWarning);
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
    prdTrackerMoved: false
  };
  if (moveResult.error) {
    return buildErrorEnvelope([moveResult.error]);
  }

  // 6. PRD tracker auto-move
  const prdTrackerNum = parsePrdTracker(dataResult.issue.body);
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
  const autoTask = parseAcceptanceCriteria(issueResult.issue.body);
  // #2614: same reporting on the batch path — a vacuous pass is no more visible
  // in a batch than alone, and a batch offers less opportunity to notice it.
  const acWarning = buildAcSectionWarning(autoTask, issueNum);
  if (acWarning) warnings.push(acWarning);

  const context = {
    issue: issueResult.issue,
    branch: branchResult.branch,
    type,
    tracker: shared.tracker,
    framework: shared.framework,
    frameworkPath: shared.frameworkPath
  };

  const gates = { assigned: assignGate, movedToInProgress: false, alreadyInProgress: false, prdTrackerMoved: false };

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

  return {
    ok: true,
    version: SCHEMA_VERSION,
    results,
    warnings: [],
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
      description: 'Issue data (number, title, labels, body, state), branch/status data, type ("branch"/"epic"/"standard"), tracker number, framework config, sub-issues, skipped, and processing order.'
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
      description: 'Non-blocking warnings (e.g., NO_SUB_ISSUES, ALL_SUB_ISSUES_COMPLETE). Each has code and message.'
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
  deriveProposedOrder,
  buildProcessingOrderSection,
  applyProcessingOrder,
  buildEpicAutoTask,
  resolveStatusIssues,
  runBatch,
  execSafe,
  main
};
