// Rubrical Works (c) 2026
/**
 * Tree-wide review gate aggregation (#2749, shared with #2748 and #2750).
 *
 * @framework-script 0.101.0
 *
 * A pure decision function answering "should `/work` stop and ask before
 * touching this set of issues, and what should it offer?" — the counterpart to
 * `create-backlog-review-gate.js` (#2694).
 *
 * THIS IS THE ONE HELPER, NOT THE BRANCH-TRACKER ONE.
 *
 * #2748 settled the "one helper or three" question as one: the epic gate
 * (#2748), the branch-tracker gate (#2749) and the selection gate (#2750)
 * differ only in how the input list is produced, never in the aggregation
 * decision. So this takes an already-resolved issue list and returns the
 * prompt shape; each gate supplies its own enumeration — `gh pmu sub list`
 * for epics, the processable set for branch trackers, argv for selections.
 *
 * There is deliberately NO issue-type test in here. The two gates want
 * opposite things about the tracker — #2749 excludes a branch tracker because
 * nothing reviews one, #2748 classifies the epic because an epic is reviewed
 * and can carry its own findings — and both are expressed by which members the
 * caller passes, via `isTracker`. A type branch here would make the helper
 * three helpers wearing one name.
 *
 * The filename is historical: named for #2749, its first consumer.
 *
 * WHY THIS IS UP FRONT RATHER THAN PER SUB-ISSUE
 *
 * Rule 08 Step 3's Review-State Gate fires per sub-issue, at that sub-issue's
 * own turn. Under `--nonstop` on a branch tracker that means a tracker whose
 * fourth child carries unresolved findings is discovered only after three
 * children have been implemented, committed and moved to `in_review` — the
 * information arrives where acting on it is most expensive. Classifying the
 * whole processable set before the first child is worked moves the decision to
 * the one moment where every option is still cheap.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * No I/O. The caller resolves states via `review-state.js` and passes them in,
 * exactly as `/create-backlog` does for its own gate. That is what makes every
 * branch below testable without a board, and it is why the aggregation logic
 * lives here rather than inline in the spec.
 */

'use strict';

/**
 * The four states `review-state.js` emits. Frozen and asserted against that
 * classifier's own vocabulary: an unrecognised value must stay representable
 * as unknown rather than be coerced into a neighbour, because coercing toward
 * `reviewed-clean` would let a classifier change silently disable this gate.
 */
const REVIEW_STATES = Object.freeze([
  'never-reviewed',
  'findings-pending',
  'reviewed-clean',
  'indeterminate'
]);

/** Board statuses whose issues `/work` skips — it will never reach them. */
const NOT_PROCESSABLE = Object.freeze(['in review', 'in_review', 'done']);

/**
 * Normalize the preamble's `skipped[]`, which is `[{number, status}]` — NOT a
 * bare number array. Accepting only the bare form would silently skip nothing
 * and quietly widen the gate's scope to issues the run will not touch.
 */
function skippedNumbers(skipped) {
  if (!Array.isArray(skipped)) return new Set();
  const out = new Set();
  for (const entry of skipped) {
    if (typeof entry === 'number') out.add(entry);
    else if (entry && typeof entry === 'object' && typeof entry.number === 'number') {
      out.add(entry.number);
    }
  }
  return out;
}

function isProcessable(m, skipSet) {
  if (!m || typeof m !== 'object') return false;
  if (m.isTracker === true) return false;
  if (typeof m.number !== 'number') return false;
  if (skipSet.has(m.number)) return false;
  const status = String(m.boardStatus || '').trim().toLowerCase();
  return !NOT_PROCESSABLE.includes(status);
}

/**
 * @param {{members?: Array, skipped?: Array}} input
 *   `members` — the tracker's children as `{number, state, boardStatus, isTracker?}`.
 *   `skipped` — the preamble's `skipped[]`, in either shape.
 * @returns {{
 *   gate: boolean, processable: number[], neverReviewed: number[],
 *   findingsPending: number[], indeterminate: number[], unknown: number[],
 *   options: string[], prompts: number, reason: string, warnings: string[]
 * }}
 */
function evaluateBranchReviewGate(input = {}) {
  const warnings = [];
  const rawMembers = input && input.members;

  if (!Array.isArray(rawMembers)) {
    if (rawMembers !== undefined) warnings.push('members-not-an-array');
    return {
      gate: false,
      processable: [],
      neverReviewed: [],
      findingsPending: [],
      indeterminate: [],
      unknown: [],
      clean: [],
      options: [],
      prompts: 0,
      reason: 'No classifiable members were supplied — nothing to gate on.',
      warnings: warnings.length ? warnings : ['members-not-an-array']
    };
  }

  const skipSet = skippedNumbers(input.skipped);
  const members = rawMembers.filter((m) => isProcessable(m, skipSet));
  const processable = members.map((m) => m.number);

  const neverReviewed = [];
  const findingsPending = [];
  const indeterminate = [];
  const unknown = [];

  for (const m of members) {
    const state = typeof m.state === 'string' ? m.state : '';
    if (!REVIEW_STATES.includes(state)) {
      unknown.push(m.number);
      continue;
    }
    if (state === 'never-reviewed') neverReviewed.push(m.number);
    else if (state === 'findings-pending') findingsPending.push(m.number);
    else if (state === 'indeterminate') indeterminate.push(m.number);
  }

  if (unknown.length) warnings.push('unrecognised-state');

  // Members the gate has no objection to. `indeterminate` counts as clean:
  // it does not gate, so excluding it would drop issues nothing objected to.
  const flagged = new Set([...neverReviewed, ...findingsPending, ...unknown]);
  const clean = processable.filter((n) => !flagged.has(n));

  const options = [];
  if (neverReviewed.length) options.push('review-issue');
  if (findingsPending.length) options.push('resolve-review');

  const gate = options.length > 0;

  // "Proceed with the clean members only" (#2750). Offered only when it means
  // something different from the other two answers: at N=1, or when every
  // member is flagged, proceeding-with-clean proceeds with nothing, which is
  // the decline path wearing a third label. Dropping one issue from a
  // hand-typed selection is natural; the epic and branch gates do not offer
  // it because dropping a sub-issue from a tree is not.
  if (gate && processable.length >= 2 && clean.length > 0) {
    options.push('proceed-with-clean');
  }

  // ONE prompt, never one per offending member and never two in sequence.
  // A mixed set carries both options in the same question — the reason this
  // is an aggregation helper rather than a per-issue predicate.
  const prompts = gate ? 1 : 0;

  let reason;
  if (!processable.length) {
    reason = 'No processable sub-issues — every child is skipped, in review, or done.';
  } else if (!gate) {
    // `indeterminate` lands here deliberately: #2577 made it fail open for the
    // per-sub-issue gate, and blocking here would let a `gh` outage stop an
    // autonomous run. Reported in its own bucket so the pass is visible rather
    // than indistinguishable from a clean classification.
    reason = 'Every processable sub-issue is reviewed, or its state could not be determined.';
  } else {
    const parts = [];
    if (neverReviewed.length) parts.push(`never reviewed: ${neverReviewed.join(', ')}`);
    if (findingsPending.length) parts.push(`unresolved findings: ${findingsPending.join(', ')}`);
    reason = `Review state blocks an unattended run — ${parts.join('; ')}.`;
  }

  return {
    gate,
    processable,
    neverReviewed,
    findingsPending,
    indeterminate,
    unknown,
    clean,
    options,
    prompts,
    reason,
    warnings
  };
}

module.exports = { evaluateBranchReviewGate, REVIEW_STATES, NOT_PROCESSABLE };
