// Rubrical Works (c) 2026
/**
 * @framework-script 0.104.0
 * @description Centralize label-based issue type detection and review command routing. Exports getIssueType(). Used by review-preamble.js and work-preamble.js for type dispatch.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * Issue Type Detection Utility
 * Pure function — no API calls, no side effects.
 */

const REDIRECT_LABELS = {
  'test-plan': '/review-test-plan',
  'proposal': '/review-proposal',
  'prd': '/review-prd'
};

const TYPE_LABELS = ['bug', 'enhancement', 'story', 'epic'];

/**
 * Determine issue type and review routing from labels.
 *
 * Accepts both label shapes: `gh issue view` emits `[{name}]` objects and
 * `gh pmu view` emits flat strings. Tolerating both is the same choice
 * `isEligibleForInterdependence` made in #2682 — a caller handing over the
 * other CLI's representation has given readable input, and answering it beats
 * failing on it.
 *
 * Unreadable input warns (#2935). Before this, `generic` was the answer for
 * BOTH "this issue carries no type label" and "I could not read the labels you
 * gave me", and a bare return value cannot carry that distinction. `/bluf`
 * shipped against the second meaning while its author read the first: every
 * issue classified `generic`, no error, no warning, and a plausible brief.
 * That is #2682's defect one level down, which its code comment predicted.
 * The warn is the side-channel that keeps the two answers distinguishable.
 *
 * An absent or empty `labels` is NOT unreadable — "this issue has no labels"
 * is a real question with a real answer, and warning there would cry wolf on
 * the common case.
 *
 * @param {Object} issueData - Parsed JSON from `gh issue view` or `gh pmu view`
 * @returns {{ type: string|null, redirect: string|null }}
 */
function getIssueType(issueData) {
  const rawLabels = (issueData && issueData.labels) || [];
  const labels = rawLabels
    .map(l => (typeof l === 'string' ? l : l && typeof l.name === 'string' ? l.name : null))
    .filter(Boolean);

  if (rawLabels.length > 0 && labels.length === 0) {
    console.warn(
      '[issue-type] getIssueType: no readable label names in input; ' +
      'returning generic. Expected string[] or {name:string}[].'
    );
  }

  // Redirect labels take precedence
  for (const label of labels) {
    if (REDIRECT_LABELS[label]) {
      return { type: null, redirect: REDIRECT_LABELS[label] };
    }
  }

  // Review type labels — first recognized wins
  for (const label of labels) {
    if (TYPE_LABELS.includes(label)) {
      return { type: label, redirect: null };
    }
  }

  // No recognized label
  return { type: 'generic', redirect: null };
}

/**
 * The label-to-command map, exported so `/work` routes to the same target
 * `/review-issue` does (#2784).
 *
 * `work-preamble.js` reads the COMMAND from here while deciding for itself
 * WHICH labels it honours — currently `test-plan` only, because `prd` and
 * `proposal` have no equivalent of the Step 5a gate rollup for a redirected
 * user to land in. Sharing the map and not the label set is the split that
 * keeps the two commands from drifting to different targets for one label
 * without forcing them to redirect on the same set.
 */
module.exports = { getIssueType, REDIRECT_LABELS };

if (require.main === module) {
  console.log('issue-type.js — no standalone execution');
}
