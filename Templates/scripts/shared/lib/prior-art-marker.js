// Rubrical Works (c) 2026
/**
 * @framework-script 0.94.0
 * prior-art-marker.js
 *
 * Deterministic half of the review-time prior-art gate (#2517): classify the
 * `**Prior Art:**` marker, apply the authored-before-the-feature cutoff, and
 * insert the section so it survives review-finalize's own body write.
 *
 * The sweep itself — surface resolution, term derivation, searching, relevance
 * judgment — is owned by #2514 and performed as generative work by the command
 * specs reading `.claude/metadata/prior-art-sweep.json`. None of it is here.
 * This module answers only three mechanical questions: is a marker present and
 * complete, is this issue old enough to be exempt, and where does the section
 * go in the body.
 *
 * Node built-ins only, per the runtime dependency contract for deployed
 * helpers (04-deployment-awareness.md). Marker strings are matched by shape
 * rather than re-read from prior-art-sweep.json so this stays dependency-free;
 * the literal heading is fixed by that file's `bodyFormat.heading` and is
 * asserted against it in tests.
 */

const MARKER_HEADING = '**Prior Art:**';

/**
 * Cutoff for the no-backport exemption (#2517).
 *
 * **Pinned at feature introduction and carried forward unchanged.** Deriving
 * it from the currently-installed framework version is explicitly ruled out:
 * that advances the exemption boundary on every release, progressively
 * exempting newer issues from ever being swept. The erosion has no error
 * surface — at any single moment the value looks correct — so it has to be
 * excluded by construction rather than caught by inspection.
 *
 * Date proxy rather than a version comparison because issues do not record the
 * framework version that authored them. Inexact only for issues created within
 * hours of the cutoff release, which are the least likely to have needed a
 * sweep.
 */
const PRIOR_ART_CUTOFF = '2026-08-01';

/**
 * Classify the prior-art marker in an issue or proposal body.
 *
 * `partial` is deliberately distinct from `complete`: a sweep that failed
 * halfway emits a marker that would otherwise read as finished, and any
 * consumer keying off mere presence would skip that issue forever.
 *
 * @param {string} body
 * @returns {'complete'|'partial'|'absent'}
 */
function classifyMarker(body) {
  if (!body || typeof body !== 'string') return 'absent';
  const index = body.indexOf(MARKER_HEADING);
  if (index === -1) return 'absent';

  // PARTIAL appears immediately after the heading on the same line.
  const line = body.slice(index).split('\n', 1)[0];
  return /\bPARTIAL\b/.test(line) ? 'partial' : 'complete';
}

/**
 * Whether an issue predates the prior-art feature and is therefore exempt.
 *
 * An unparseable or missing creation date is treated as exempt — the safe
 * direction. Sweeping on a date we cannot establish risks stamping an
 * affirmative marker into an issue that predates the feature.
 *
 * @param {string|Date|undefined} createdAt - ISO 8601 timestamp
 * @returns {boolean}
 */
function isExemptFromSweep(createdAt) {
  if (!createdAt) return true;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return true;
  return created < new Date(`${PRIOR_ART_CUTOFF}T00:00:00Z`);
}

/**
 * Decide whether a review-time sweep should run, and what the criterion reports.
 *
 * @param {object} input
 * @param {string} input.body - Current issue/proposal body
 * @param {string} [input.createdAt] - Issue creation timestamp
 * @param {boolean} [input.reviewSweep] - framework-config.json setting; absent means on
 * @returns {{sweep: boolean, status: 'pass'|'fail'|'skip'|'not-applicable', reason: string}}
 */
function decideSweep({ body, createdAt, reviewSweep } = {}) {
  // Explicit opt-out reports skip, never fail. A fail here would combine with
  // the scope-duplication recommendation rule to downgrade every review in a
  // project that deliberately turned automated sweeping off.
  if (reviewSweep === false) {
    return { sweep: false, status: 'skip', reason: 'reviewSweep is off for this project' };
  }

  const marker = classifyMarker(body);
  if (marker === 'complete') {
    return { sweep: false, status: 'pass', reason: 'prior-art marker already present and complete' };
  }

  // Checked after the marker so a post-cutoff issue that already carries a
  // marker still reports pass rather than not-applicable.
  if (isExemptFromSweep(createdAt)) {
    return {
      sweep: false,
      status: 'not-applicable',
      reason: `issue predates the prior-art feature (cutoff ${PRIOR_ART_CUTOFF})`
    };
  }

  return {
    sweep: true,
    status: 'fail',
    reason: marker === 'partial'
      ? 'prior-art marker is PARTIAL — treated as absent, re-sweeping'
      : 'no prior-art marker present'
  };
}

/**
 * Insert or replace the prior-art section in a body.
 *
 * Must be applied BEFORE review-finalize's read-modify-write for
 * `**Reviews:** N`, so finalize reads a body that already contains the
 * section. The reverse order races: both edits are read-modify-write against
 * the same body and the later write wins, losing the other silently.
 *
 * Idempotent, and replaces a PARTIAL marker rather than appending beside it.
 *
 * @param {string} body
 * @param {string} section - Fully-formed section text beginning with the marker heading
 * @returns {string}
 */
function insertPriorArtSection(body, section) {
  const base = typeof body === 'string' ? body : '';
  const index = base.indexOf(MARKER_HEADING);

  if (index !== -1) {
    // Replace the existing marker line (complete or PARTIAL) in place.
    const before = base.slice(0, index);
    const after = base.slice(index);
    const restOfLine = after.indexOf('\n');
    const tail = restOfLine === -1 ? '' : after.slice(restOfLine);
    return before + section + tail;
  }

  // No marker yet — append, keeping it above any trailing Reviews line so the
  // section reads as part of the body rather than after its footer.
  const reviewsMatch = base.match(/\n\*\*Reviews:\*\*\s*\d+/);
  if (reviewsMatch) {
    const at = base.indexOf(reviewsMatch[0]);
    return `${base.slice(0, at)}\n\n${section}${base.slice(at)}`;
  }

  return `${base.trimEnd()}\n\n${section}\n`;
}

module.exports = {
  PRIOR_ART_CUTOFF,
  MARKER_HEADING,
  classifyMarker,
  isExemptFromSweep,
  decideSweep,
  insertPriorArtSection
};
