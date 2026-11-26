// Rubrical Works (c) 2026
/**
 * @framework-script 0.123.0
 * @description Plan a concurrent multi-issue /review-issue run. Exports planDispatch(), nextDispatches(), decideTestPlanHold(), planResolvePhase(). Pure: takes each member's review-preamble.js envelope and returns the parent-handled members (PRD before its test plan), the deduplicated dispatch queue with epic children ahead of their epic, the cap-bounded groups and the run mode; planResolvePhase() returns the deferred resolve phase once every member has settled (#3808).
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * review-dispatch-plan.js (#3804)
 *
 * The parent runs review-preamble.js once per member — the preamble stays
 * per-issue — and feeds the envelopes here. Nothing in this module calls `gh`
 * or spawns an Agent, so every planning decision is unit-testable.
 */

'use strict';

const { evaluateReviewGate } = require('./create-backlog-review-gate.js');
// The caller passes the resolved `expansionCap` (framework-config.js
// `resolveReviewExpansion`); this default covers a caller that passes none,
// read from the same place so the two cannot drift.
const { DEFAULT_REVIEW_EXPANSION_CAP: DEFAULT_EXPANSION_CAP } = require('./framework-config.js');

/**
 * Classify one member's preamble envelope.
 *
 * Returns `{ handled }` for a member the parent resolves itself — a redirect,
 * an early exit, a declined closed issue or a preamble error — or
 * `{ dispatch }` for one a reviewer takes.
 */
function classifyMember(member) {
  const issue = member.issue;
  const env = member.envelope || {};
  if (env.ok === false) {
    const err = (env.errors && env.errors[0]) || {};
    if (err.code === 'CLOSED') {
      // The parent asks before reviewing a closed issue; only an explicit
      // `proceed` dispatches it. An unanswered question is not consent.
      if (member.closedDecision === 'proceed') {
        return { dispatch: { issue, type: null, closed: true } };
      }
      return {
        handled: { issue, reason: 'closed-declined', status: 'skipped', message: err.message || `Issue #${issue} is closed.` },
      };
    }
    return { handled: { issue, reason: 'error', status: 'error', code: err.code || null, message: err.message || 'preamble failed' } };
  }
  // Only a parsed `ok: true` envelope with a context dispatches. A missing,
  // null or non-envelope value means the preamble never produced a result
  // (it crashed, or its output was not JSON) — the parent reports that, and
  // no reviewer is sent to review an issue whose preamble did not run.
  if (!env || typeof env !== 'object' || env.ok !== true || !env.context || typeof env.context !== 'object') {
    return { handled: { issue, reason: 'error', status: 'error', code: 'NO_PREAMBLE', message: `Issue #${issue}: no usable review-preamble.js envelope — the preamble did not run or its output was not an envelope.` } };
  }
  const ctx = env.context;
  if (ctx.earlyExit) {
    return { handled: { issue, reason: 'early-exit', status: 'already-reviewed', reviewCount: ctx.reviewCount, message: ctx.message } };
  }
  if (ctx.redirect) {
    return { handled: { issue, reason: 'redirect', status: 'redirected', redirect: ctx.redirect } };
  }
  return { dispatch: { issue, type: ctx.type || null } };
}

/**
 * Plan the run.
 *
 * @param {object} input
 * @param {Array<{issue: number, envelope: object, closedDecision?: 'proceed'|'decline',
 *   prdTracker?: number, children?: number[], childEnvelopes?: Object<number, object>}>} input.members
 *   - typed order. `prdTracker` on a test plan; `children` (and optionally their
 *   preamble envelopes) on an epic.
 * @param {number} input.cap - resolved concurrency cap (`--agents` > project default > 3)
 * @param {boolean} [input.agentAvailable] - false → sequential fallback
 * @param {boolean} [input.sequential] - `--sequential`
 * @param {number} [input.expansionCap] - per-epic child cap (`resolveReviewExpansion`)
 * @returns {{ mode: 'concurrent'|'sequential', modeReason: string, maxConcurrent: number,
 *   parentHandled: Array, queue: Array<{issue: number, type: ?string, epic?: number, after?: number[]}>,
 *   groups: number[][], duplicates: number[], prdGates: Array<{testPlan: number, prd: number}>,
 *   notReached: Array<{issue: number, epic: number, reason: string}> }}
 */
function planDispatch(input = {}) {
  const members = Array.isArray(input.members) ? input.members : [];
  const seen = new Set();
  const duplicates = [];
  const parentHandled = [];
  const queue = [];
  const notReached = [];
  const expansionCap = Number.isInteger(input.expansionCap) && input.expansionCap >= 1
    ? input.expansionCap
    : DEFAULT_EXPANSION_CAP;
  const queued = new Set();
  const add = (c) => {
    if (c.handled) parentHandled.push(c.handled);
    else {
      queue.push(c.dispatch);
      queued.add(c.dispatch.issue);
    }
  };

  for (const member of members) {
    if (seen.has(member.issue)) {
      duplicates.push(member.issue);
      continue;
    }
    seen.add(member.issue);
    const c = classifyMember(member);
    if (c.dispatch && c.dispatch.type === 'epic') {
      // Expand: children ascending, `expansionCap` per epic; the epic itself
      // waits on every child in the run that a reviewer takes. A child already
      // seen (typed earlier, or under another epic) is reviewed once, takes no
      // cap slot, and — when queued — gates the epic whatever its index (#3835).
      const children = [...new Set(Array.isArray(member.children) ? member.children : [])].sort((a, b) => a - b);
      const childEnvelopes = member.childEnvelopes || {};
      const after = [];
      let expanded = 0;
      for (const child of children) {
        if (!seen.has(child)) {
          if (expanded >= expansionCap) {
            notReached.push({ issue: child, epic: member.issue, reason: 'expansion-cap' });
            continue;
          }
          expanded += 1;
          seen.add(child);
          const env = childEnvelopes[child];
          add(env ? classifyMember({ issue: child, envelope: env }) : { dispatch: { issue: child, type: null } });
          const last = queue[queue.length - 1];
          if (last && last.issue === child) last.epic = member.issue;
        }
        if (queued.has(child)) after.push(child);
      }
      add({ dispatch: { ...c.dispatch, after } });
      continue;
    }
    add(c);
  }

  const { ordered, prdGates } = orderPrdFirst(parentHandled, members);

  const { mode, modeReason, slots } = decideMode(input, queue.length);
  const maxConcurrent = Math.max(1, Math.min(slots, queue.length));
  const plan = { mode, modeReason, maxConcurrent, parentHandled: ordered, queue, duplicates, prdGates, notReached };
  plan.groups = buildGroups(plan);
  return plan;
}

/**
 * A PRD and its test plan in one selection: the PRD is handled first whatever
 * the typed order, and the test plan records `awaitsPrd`. Both redirect, so
 * both are parent-handled; the parent decides the test plan's turn with
 * `decideTestPlanHold` once the PRD's review has settled.
 *
 * `member.prdTracker` is the test plan's PRD, resolved by the parent with
 * prd-tracker-lookup.js `resolvePrdTracker` — the same lookup
 * /review-test-plan Step 1a uses.
 */
function orderPrdFirst(handled, members) {
  const prdOf = new Map();
  for (const m of members) {
    if (Number.isInteger(m.prdTracker) && !prdOf.has(m.issue)) prdOf.set(m.issue, m.prdTracker);
  }
  const redirectedIssues = new Set(handled.filter((h) => h.reason === 'redirect').map((h) => h.issue));
  const prdGates = [];
  const ordered = [];
  const placed = new Set();
  const byIssue = new Map(handled.map((h) => [h.issue, h]));
  for (const h of handled) {
    if (placed.has(h.issue)) continue;
    const prd = h.redirect === '/review-test-plan' ? prdOf.get(h.issue) : undefined;
    if (prd !== undefined && redirectedIssues.has(prd)) {
      if (!placed.has(prd)) {
        ordered.push(byIssue.get(prd));
        placed.add(prd);
      }
      ordered.push({ ...h, awaitsPrd: prd });
      prdGates.push({ testPlan: h.issue, prd });
    } else {
      ordered.push(h);
    }
    placed.add(h.issue);
  }
  return { ordered, prdGates };
}

/**
 * Roster wording for a gating PRD state. `reviewed-clean` gates only when the
 * latest recommendation is not "Ready for" (#3637), so it reads "not ready";
 * `never-reviewed` and `stale-reviewed` are named as themselves.
 */
const HOLD_STATE_WORDS = Object.freeze({
  'findings-pending': 'pending',
  'reviewed-clean': 'not ready',
});

/**
 * Decide a held test plan's turn from its PRD's post-review state.
 *
 * Delegates to `evaluateReviewGate` — /review-test-plan Step 1a's gate — so the
 * two cannot disagree about what "reviewed" means. A gate that fails holds the
 * test plan and names `/resolve-review #<prd>`; an indeterminate state fails
 * open, as the gate itself does, and the roster entry says so (PRD Review #2's
 * open suggestion, decided in #3804).
 *
 * @param {object} input
 * @param {number} input.testPlan
 * @param {number} input.prd
 * @param {string} [input.prdBody] - the PRD tracker body after its review
 * @param {object|string} [input.prdReviewState] - review-state.js verdict, or its state
 * @returns {{ proceed: boolean, held: boolean, indeterminate: boolean, reason: string, roster: string }}
 */
function decideTestPlanHold(input = {}) {
  const { testPlan, prd } = input;
  const gate = evaluateReviewGate({ body: input.prdBody, reviewState: input.prdReviewState });
  if (gate.gate) {
    const state = HOLD_STATE_WORDS[gate.signals.reviewState] || gate.signals.reviewState;
    return {
      proceed: false,
      held: true,
      indeterminate: false,
      reason: gate.reason,
      roster: `held — PRD #${prd} ${state}; run /resolve-review #${prd}, then /review-test-plan #${testPlan}`,
    };
  }
  return {
    proceed: true,
    held: false,
    indeterminate: gate.indeterminate,
    reason: gate.reason,
    roster: gate.indeterminate
      ? `reviewing — PRD #${prd} review state indeterminate; proceeding without the PRD gate`
      : `reviewing — PRD #${prd} gate passed`,
  };
}

/**
 * Concurrent or sequential, and how many slots.
 *
 * Sequential when `--sequential` is passed, the resolved cap is 1 (`--agents 1`
 * or a project default of 1), the Agent tool is unavailable, or fewer than two
 * issues are left to dispatch. A cap that is not a positive integer plans one
 * slot — the bounded direction, never an unbounded run.
 */
function decideMode(input, dispatchCount) {
  const capValid = Number.isInteger(input.cap) && input.cap >= 1;
  const cap = capValid ? input.cap : 1;
  const sequential = (modeReason) => ({ mode: 'sequential', modeReason, slots: 1 });
  if (input.sequential) return sequential('sequential-flag');
  if (!capValid) return sequential('invalid-cap');
  if (cap === 1) return sequential('cap-1');
  if (input.agentAvailable === false) return sequential('agent-unavailable');
  if (dispatchCount < 2) return sequential('single-issue');
  return { mode: 'concurrent', modeReason: 'default', slots: cap };
}

/**
 * The waves a run with no refill would take: each at most `maxConcurrent`,
 * in queue order. The rolling schedule (`nextDispatches`) never runs more at
 * once than one wave holds, so the waves bound it.
 */
function buildGroups(plan) {
  const groups = [];
  const done = [];
  for (;;) {
    const wave = nextDispatches(plan, { running: [], done });
    if (wave.length === 0) break;
    groups.push(wave);
    done.push(...wave);
  }
  return groups;
}

/**
 * The issues to start now: queue order, skipping running and finished ones,
 * up to the free slots. Called again each time a reviewer returns, so a new
 * review starts as a slot frees.
 *
 * @param {object} plan - planDispatch result
 * @param {{running?: number[], done?: number[]}} state
 * @returns {number[]}
 */
function nextDispatches(plan, state = {}) {
  const running = new Set(state.running || []);
  const done = new Set(state.done || []);
  const free = plan.maxConcurrent - running.size;
  const picked = [];
  for (const item of plan.queue) {
    if (picked.length >= free) break;
    if (running.has(item.issue) || done.has(item.issue)) continue;
    // An epic waits for every reached child; a blocked item does not stop
    // later members from taking a free slot.
    if ((item.after || []).some((dep) => !done.has(dep))) continue;
    picked.push(item.issue);
  }
  return picked;
}

/**
 * First-pass outcomes that settle a dispatched member (#3808). A finalized
 * review is `reviewed` or `pending`; a reviewer that failed is `error`.
 */
const FIRST_PASS_OUTCOMES = Object.freeze(['reviewed', 'pending', 'error']);

/**
 * The deferred resolve phase (#3808): two phases on every multi-issue path.
 *
 * Empty until every member has settled — finalized, errored, redirected,
 * early-exited or held. Parent-handled members are settled by the plan, except
 * a test plan awaiting its PRD, which settles when the parent records its hold
 * decision (`held`, or any other outcome once it proceeds). Then each `pending`
 * member in queue order — typed order, an expanded epic's children before the
 * epic — one at a time; errored and held members never block it. Empty under
 * `--step-wise` or when no member is `pending`.
 *
 * Takes the plan, never the mode: the concurrent and sequential paths share one
 * ordering because the order is a property of the queue, not of completion.
 *
 * **Readiness (#3859, #3848).** When the parent passes `relayed`, a dispatched
 * member is settled only once its reviewer has returned **and** its result has
 * been relayed to the user: a result relayed after a resolve prompt is printed
 * pushes the prompt's printed change out of view. A returned-but-unrelayed
 * member is named in `unsettled` and in `unrelayed`. Parent-handled members
 * have no reviewer result to relay. Without `relayed` only the outcome is read.
 *
 * @param {object} plan - planDispatch result
 * @param {{outcomes?: Object<number, string>, relayed?: Object<number, boolean>|number[], stepWise?: boolean}} state
 *   `outcomes`: issue → first-pass outcome (`reviewed`, `pending`, `error`, `held`);
 *   `relayed`: issue → true once its result was relayed (or an array of those issues)
 * @returns {{ phase: 'review'|'resolve'|'done', settled: boolean, unsettled: number[],
 *   unrelayed: number[], resolveOrder: number[], errored: number[], held: number[],
 *   skipped: ?string, step3aInput: number[] }}
 */
function planResolvePhase(plan, state = {}) {
  const outcomes = state.outcomes || {};
  const outcomeOf = (issue) => outcomes[issue];
  const tracksRelay = state.relayed !== undefined && state.relayed !== null;
  const relayedSet = new Set(
    Array.isArray(state.relayed)
      ? state.relayed.map(Number)
      : Object.entries(state.relayed || {}).filter(([, v]) => v === true).map(([k]) => Number(k))
  );
  const unsettled = [];
  const unrelayed = [];
  for (const item of plan.queue || []) {
    if (!FIRST_PASS_OUTCOMES.includes(outcomeOf(item.issue))) unsettled.push(item.issue);
    else if (tracksRelay && !relayedSet.has(item.issue)) {
      unsettled.push(item.issue);
      unrelayed.push(item.issue);
    }
  }
  for (const h of plan.parentHandled || []) {
    if (h.awaitsPrd !== undefined && outcomeOf(h.issue) === undefined) unsettled.push(h.issue);
  }
  const errored = (plan.queue || []).filter((q) => outcomeOf(q.issue) === 'error').map((q) => q.issue);
  const held = (plan.parentHandled || []).filter((h) => outcomeOf(h.issue) === 'held').map((h) => h.issue);
  // Step 3a reads the issues a reviewer finalized; a pass changes bodies, not membership.
  const step3aInput = (plan.queue || [])
    .filter((q) => ['reviewed', 'pending'].includes(outcomeOf(q.issue)))
    .map((q) => q.issue);
  const base = { unsettled, unrelayed, errored, held, step3aInput };
  if (unsettled.length > 0) {
    return { phase: 'review', settled: false, resolveOrder: [], skipped: null, ...base };
  }
  const pending = (plan.queue || []).filter((q) => outcomeOf(q.issue) === 'pending').map((q) => q.issue);
  if (state.stepWise) return { phase: 'done', settled: true, resolveOrder: [], skipped: 'step-wise', ...base };
  if (pending.length === 0) return { phase: 'done', settled: true, resolveOrder: [], skipped: 'none-pending', ...base };
  return { phase: 'resolve', settled: true, resolveOrder: pending, skipped: null, ...base };
}

module.exports = { planDispatch, nextDispatches, decideTestPlanHold, classifyMember, planResolvePhase };
