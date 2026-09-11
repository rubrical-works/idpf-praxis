// Rubrical Works (c) 2026
/**
 * Tree-wide review gate aggregation (#2749, shared with #2748 and #2750).
 *
 * @framework-script 0.102.0
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
 * WHERE THE GATES DIFFER IN THEIR OPTION SET (#2780)
 *
 * `proceed-with-clean` is a selection-only answer, and the caller declares
 * which shape of set it assembled via `setShape`. This is the same mechanism
 * as `isTracker` one level up — a caller declaration about its own input, not
 * a type test — so the paragraph above still holds: the difference is carried
 * by what the caller passes, never by this file inspecting an issue.
 *
 * #2750 added the drop option and, in the same commit, wrote in three places
 * that the epic and branch gates do not get it: both `Drop option?` cells of
 * the § Step 2b-ii table, the rule-08 line "Dropping is natural here and
 * nowhere else", and this file's own comment beside the condition. Only the
 * code disagreed, gating on set size alone, and no test exercised a
 * tracker-shaped set — so the divergence survived until #2780. Recorded
 * intent was unanimous, so the code was corrected to match it rather than the
 * reverse. #2749 could not have withheld the option deliberately: it predates
 * `proceed-with-clean` entirely (ec42f72b), which is why that hypothesis is
 * disproved rather than merely unsupported.
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
 * The shape of the set the caller assembled, which decides whether
 * `proceed-with-clean` is on offer (#2780).
 *
 * `selection` — the user hand-typed these numbers (`/work 44 47 68`) or named
 * a status query. Dropping one is editing their own input.
 * `tree` — the members were derived from a tracker (an epic's children, or a
 * branch tracker's processable set). They carry an order and may carry
 * provider/consumer dependencies (`**Processing Order:**`, #2622), so dropping
 * one silently changes what the remaining run means.
 *
 * This is a caller declaration about its INPUT, exactly like `isTracker`, not
 * an issue-type test — the distinction the file header draws and this keeps.
 */
const SET_SHAPES = Object.freeze(['selection', 'tree']);

/**
 * Absent or unrecognised resolves to `tree`, the shape that withholds the drop.
 *
 * The direction is the whole point. A tree caller that omits the field would,
 * under a `selection` default, get the drop back with nothing reporting it —
 * the #2750 defect restored silently. A selection caller that omits it loses a
 * third option, which is visible in the prompt it raises.
 */
function resolveSetShape(raw, warnings) {
  if (raw === undefined || raw === null) return 'tree';
  const shape = String(raw).trim().toLowerCase();
  if (SET_SHAPES.includes(shape)) return shape;
  warnings.push('unrecognised-set-shape');
  return 'tree';
}

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
 * @param {{members?: Array, skipped?: Array, setShape?: string}} input
 *   `members` — the tracker's children as `{number, state, boardStatus, isTracker?}`.
 *   `skipped` — the preamble's `skipped[]`, in either shape.
 *   `setShape` — `'selection'` or `'tree'` (#2780). Decides whether
 *   `proceed-with-clean` is offered. Absent or unrecognised resolves to
 *   `'tree'`, which withholds it; an unrecognised value also warns.
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

  const setShape = resolveSetShape(input.setShape, warnings);
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

  // "Proceed with the clean members only" (#2750), restricted to selections
  // by #2780. Three conditions, each removing a case where the option would
  // not mean what it says:
  //
  //   - `setShape === 'selection'` — dropping one issue from a hand-typed
  //     list is an ordinary answer; dropping a member from a tracker-derived,
  //     ordered set is not. #2750 stated this in three places and did not
  //     implement it; the shape the caller declares is what implements it.
  //   - `processable.length >= 2` — at N=1 proceeding with the clean members
  //     proceeds with nothing, which is the decline path wearing a third label.
  //   - `clean.length > 0` — likewise when every member is flagged.
  if (setShape === 'selection' && gate && processable.length >= 2 && clean.length > 0) {
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
