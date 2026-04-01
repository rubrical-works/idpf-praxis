// Rubrical Works (c) 2026
/**
 * @framework-script 0.79.0
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
 * @param {Object} issueData - Parsed JSON from gh issue view --json labels
 * @returns {{ type: string|null, redirect: string|null }}
 */
function getIssueType(issueData) {
  const labels = (issueData.labels || []).map(l => l.name);

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

module.exports = { getIssueType };

if (require.main === module) {
  console.log('issue-type.js — no standalone execution');
}
