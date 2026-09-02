// Rubrical Works (c) 2026
/**
 * @framework-script 0.100.0
 * @description Decide whether /create-backlog Phase 1c should gate on PRD review state. Exports evaluateReviewGate(). Reads the tracker's lifecycle checkbox and the review-state verdict together, so a reviewed PRD is not re-gated.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * create-backlog-review-gate.js
 *
 * Phase 1c used to be prose in the command spec parsing one checkbox with a
 * naked regex (`- \[([ x])\].*PRD reviewed`). Three problems followed from
 * that, and this helper exists to fix all three (#2694):
 *
 *   1. Untestable — the gate decision lived in a markdown step, so no test
 *      could pin it and the "Run /review-prd first" branch's re-gate went
 *      unnoticed.
 *   2. Fence-blind — the same defect class #2600 fixed for checkbox scanning
 *      across six scripts; a quoted example of the checklist read as the live
 *      box. This uses the shared fence-aware scanner instead.
 *   3. Reading the wrong signal — the review subsystem writes a `reviewed`
 *      label and a `Reviews` marker that `review-state.js` classifies, and the
 *      gate ignored all of it in favour of one checkbox nothing was writing.
 *
 * Both signals are read because they fail in different directions. The
 * checkbox is what a human sees in the tracker body; the review state is what
 * the review subsystem recorded. Requiring both would re-gate a PRD whose
 * review landed but whose gate write failed; requiring neither is the bug.
 */

'use strict';

const { scanCheckboxes } = require('./checkbox-scan.js');

/** Verdicts review-state.js can return. Mirrors its STATES export. */
const REVIEW_STATES = new Set([
  'never-reviewed',
  'findings-pending',
  'reviewed-clean',
  'indeterminate',
]);

const GATE_LABEL = 'PRD reviewed';

/**
 * Whether the tracker's lifecycle gate box is checked.
 *
 * Fence-aware and label-anchored, matching how review-ac-checkoff.js writes
 * it — the reader and the writer must agree on which line is the real box, or
 * the gate reads one line while the review wrote another.
 */
function isCheckboxChecked(body) {
  if (!body || typeof body !== 'string') return false;
  return scanCheckboxes(body).some((box) => box.checked && box.text.startsWith(GATE_LABEL));
}

/**
 * Normalize the review-state verdict.
 *
 * An absent, malformed, or unrecognized state becomes `indeterminate` rather
 * than being treated as clean. That distinction is the point: `indeterminate`
 * passes the gate (below) but is REPORTED as indeterminate, so a pass caused
 * by an unreadable verdict is never indistinguishable from a pass caused by a
 * real clean review (#2577, #2682).
 */
function normalizeState(reviewState) {
  const raw = reviewState && typeof reviewState === 'object' ? reviewState.state : reviewState;
  return typeof raw === 'string' && REVIEW_STATES.has(raw) ? raw : 'indeterminate';
}

/**
 * Decide whether Phase 1c should gate.
 *
 * @param {object} input
 * @param {string} [input.body] - PRD tracker issue body
 * @param {object|string} [input.reviewState] - review-state.js verdict, or its `state` string
 * @param {boolean} [input.requireCheckbox] - require the checkbox as well as a clean
 *   review state. Off by default so a failed gate write cannot re-gate a PRD whose
 *   review genuinely completed; on when the caller wants the tracker body itself to
 *   be the authority — notably to keep "Ready with minor revisions", which earns the
 *   `reviewed` label but deliberately not the gate box, from passing by the back door.
 * @returns {{ gate: boolean, reason: string, indeterminate: boolean,
 *             signals: { checkboxChecked: boolean, reviewState: string } }}
 */
function evaluateReviewGate(input = {}) {
  const checkboxChecked = isCheckboxChecked(input.body);
  const reviewState = normalizeState(input.reviewState);
  const signals = { checkboxChecked, reviewState };
  const indeterminate = reviewState === 'indeterminate';

  // Unresolved findings gate regardless of the checkbox. A reviewer flagged
  // criteria and they are still open; a checked box does not close them.
  if (reviewState === 'findings-pending') {
    return {
      gate: true,
      reason: 'Review completed with unresolved findings — resolve them before decomposing.',
      indeterminate: false,
      signals,
    };
  }

  if (reviewState === 'reviewed-clean') {
    if (input.requireCheckbox && !checkboxChecked) {
      return {
        gate: true,
        reason:
          'Review state is clean but the tracker checkbox is unchecked — the recommendation earned the reviewed label without earning the gate.',
        indeterminate: false,
        signals,
      };
    }
    return {
      gate: false,
      reason: 'PRD review completed cleanly.',
      indeterminate: false,
      signals,
    };
  }

  if (checkboxChecked) {
    return {
      gate: false,
      reason: 'Tracker records the PRD reviewed gate as checked.',
      indeterminate,
      signals,
    };
  }

  if (indeterminate) {
    // Fails open, and says so. Blocking here would let a `gh` outage stop all
    // backlog creation; passing silently would hide it. #2577 made the same
    // call for /work's Review-State Gate, for the same reasons.
    return {
      gate: false,
      reason:
        'Review state is indeterminate — proceeding without a gate, but the review could not be confirmed.',
      indeterminate: true,
      signals,
    };
  }

  return {
    gate: true,
    reason: 'PRD has not been reviewed.',
    indeterminate: false,
    signals,
  };
}

module.exports = { evaluateReviewGate, REVIEW_STATES, GATE_LABEL };
