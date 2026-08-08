// Rubrical Works (c) 2026
/**
 * @framework-script 0.96.0
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
 * Start-of-line anchored marker predicate (#2540).
 *
 * The single place either function decides a marker is present. It was an
 * unanchored `indexOf`, so any occurrence of the literal counted — including
 * one inside ordinary prose. A review note that merely *named* the marker
 * classified as `complete`, `decideSweep` returned `pass`, and the sweep was
 * skipped on an issue that had never been swept (observed on
 * rubrical-worker/px-manager#1002).
 *
 * Derived from MARKER_HEADING rather than written out, so the literal lives in
 * one place: MARKER_HEADING is pinned to prior-art-sweep.json `bodyFormat.heading`
 * by test, and a second hand-written copy could drift out from under that pin —
 * the same two-places-matching-on-different-rules defect this fix exists to close.
 *
 * Leading whitespace is allowed: an indented marker is still a marker line.
 * A marker inside a fenced code block still matches; line-anchoring does not
 * address that and #2540 does not claim it.
 *
 * Non-global on purpose — `exec` on a global regex carries `lastIndex` between
 * calls, which would make these functions stateful across invocations.
 */
const MARKER_LINE = new RegExp(
  `^[ \\t]*${MARKER_HEADING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
  'm'
);

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
 * Trailing text on the marker line that begins a COMPLETED sweep (#2542).
 *
 * Presence of a marker is not evidence a sweep ran. A marker line may equally
 * record that nobody looked — observed in the wild on #2538, #2541 and #2535 —
 * and such a line classified as `complete`, so `decideSweep` returned `pass`
 * before any other check and the sweep was skipped on an issue never swept.
 * /enhancement states the intended property directly: the marker's "absence
 * means no sweep was performed", and omitting it on a nil result "would make
 * 'nothing found' indistinguishable from 'nobody looked'."
 *
 * Recognised shapes, from prior-art-sweep.json `bodyFormat`:
 *   - bare heading, nothing after it  → the found case; payload is a
 *     `foundEntryFormat` table on the following lines
 *   - `found …`      → `foundFormat`
 *   - `none found …` → `noneFoundFormat`
 *   - `PARTIAL …`    → `partialFormat`, handled separately below
 *
 * Hardcoded rather than read from that file, per the runtime dependency
 * contract in the module header — this helper is symlinked into every user
 * project and must stay dependency-free. Parity with the config is asserted in
 * tests, exactly as MARKER_HEADING is.
 *
 * `foundFormat` did not exist in the config before #2542. Two genuinely-swept
 * issues (#2531, #2532) write a found summary on the heading line, a shape the
 * config never described — so an allowlist derived from the config as it stood
 * would have reclassified real completed sweeps as unswept. The missing entry
 * is why the vocabulary could not express the distinction in the first place.
 *
 * An allowlist, not a not-swept denylist: the observed phrasings already vary
 * ("not swept —", "Not swept."), and matching known bad wording only defers the
 * same defect to the next phrasing nobody predicted.
 */
const COMPLETED_SWEEP_PREFIXES = ['found', 'none found'];

/**
 * Classify the prior-art marker in an issue or proposal body.
 *
 * `partial` is deliberately distinct from `complete`: a sweep that failed
 * halfway emits a marker that would otherwise read as finished, and any
 * consumer keying off mere presence would skip that issue forever.
 *
 * `absent` covers two cases that are the same to every consumer: no marker at
 * all, and a marker that does not record a completed sweep. Both mean the same
 * thing — no evidence a sweep ran.
 *
 * @param {string} body
 * @returns {'complete'|'partial'|'absent'}
 */
function classifyMarker(body) {
  if (!body || typeof body !== 'string') return 'absent';
  const match = MARKER_LINE.exec(body);
  if (!match) return 'absent';

  const line = body.slice(match.index).split('\n', 1)[0];

  // PARTIAL appears immediately after the heading on the same line. Tested
  // first and against the whole line, preserving pre-#2542 behaviour exactly.
  if (/\bPARTIAL\b/.test(line)) return 'partial';

  // Everything after the heading, which is what distinguishes the shapes.
  const trailing = line.slice(line.indexOf(MARKER_HEADING) + MARKER_HEADING.length).trim();

  // Bare heading: the found case, with its entries in the table below it.
  if (trailing === '') return 'complete';

  const lower = trailing.toLowerCase();
  const recognised = COMPLETED_SWEEP_PREFIXES.some((p) => lower.startsWith(p));

  return recognised ? 'complete' : 'absent';
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
 * The four values `reviewSweep` may take (#2564).
 *
 * Ordered from most to least sweeping, which is the order the Praxis Hub
 * Manager picker presents them in:
 *   full      — sweep automatically at review time (pre-#2564 behaviour)
 *   recommend — never sweep automatically; surface an advisory instead
 *   flag-only — never sweep automatically, no advisory; `--prior-art` works
 *   off       — as flag-only, and `--prior-art` is refused with a message
 *
 * `off` is the one mode that overrides an explicitly-typed flag. That inverts
 * the pre-#2564 contract, which promised `--prior-art` swept regardless, and is
 * deliberate: the refusal must be *reported*, never a silent no-op, or a user
 * who typed the flag has no way to learn why nothing happened.
 */
const REVIEW_SWEEP_MODES = ['full', 'recommend', 'flag-only', 'off'];

/**
 * What an absent `reviewSweep` means (#2564).
 *
 * Absent used to mean `full`. It now means `recommend`: no command sweeps
 * unless `--prior-art` is passed, but the recommendation is still surfaced.
 * Both writers materialise the key rather than relying on this fallback, so it
 * governs only the window before the first write.
 */
const DEFAULT_REVIEW_SWEEP_MODE = 'recommend';

/**
 * Coerce any accepted `reviewSweep` value to a mode string (#2564).
 *
 * Legacy booleans are migrated rather than rejected, so configs written before
 * #2564 keep validating and keep their meaning:
 *   true  → full       (it swept automatically, and still does)
 *   false → flag-only  (NOT `off`)
 *
 * `false` maps to flag-only because that is what `false` has always meant —
 * "gates automated sweeps only: an explicit --prior-art invocation sweeps
 * regardless". Mapping it to `off` would silently take away a capability every
 * opted-out project currently has, and would do so without an error surface.
 *
 * An unrecognised value falls back to the default rather than throwing: this is
 * a read path reached during review, and the fallback is the safest mode
 * (nothing sweeps, the advisory still appears). Write-time schema validation in
 * framework-config.js is where a typo is meant to be caught.
 *
 * @param {string|boolean|undefined|null} value
 * @returns {'full'|'recommend'|'flag-only'|'off'}
 */
function normalizeReviewSweep(value) {
  if (value === true) return 'full';
  if (value === false) return 'flag-only';
  if (typeof value === 'string' && REVIEW_SWEEP_MODES.includes(value)) return value;
  return DEFAULT_REVIEW_SWEEP_MODE;
}

/**
 * Decide whether a review-time sweep should run, and what the criterion reports.
 *
 * @param {object} input
 * @param {string} input.body - Current issue/proposal body
 * @param {string} [input.createdAt] - Issue creation timestamp
 * @param {string|boolean} [input.reviewSweep] - framework-config.json setting: one of
 *   REVIEW_SWEEP_MODES, or a legacy boolean. Absent means `recommend` (#2564).
 * @returns {{sweep: boolean, status: 'pass'|'fail'|'recommend'|'skip'|'not-applicable', reason: string}}
 */
function decideSweep({ body, createdAt, reviewSweep } = {}) {
  const mode = normalizeReviewSweep(reviewSweep);

  // flag-only and off suppress automated sweeping outright, before any marker
  // is inspected — exactly what the legacy `false` did, which is why `false`
  // migrates to flag-only. Reported as skip, never fail: a fail here would
  // combine with the scope-duplication recommendation rule to downgrade every
  // review in a project that deliberately turned automated sweeping off.
  if (mode === 'flag-only' || mode === 'off') {
    return {
      sweep: false,
      status: 'skip',
      reason: `reviewSweep mode "${mode}" — automated sweeping is off for this project`
    };
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

  // The diagnostic is computed once for both remaining modes (#2564). Only the
  // *action* differs between `full` and `recommend`; what the reader needs to
  // be told about the body does not. Deriving it twice is how the two would
  // drift into disagreeing about the same body.
  //
  // `absent` covers two cases, distinguished here only for the reason string:
  // reporting "no marker present" for a body that visibly HAS one sends the
  // reader looking for a missing line instead of at the line that is there.
  // #2542 exists because a message misrepresented whether a sweep ran;
  // replacing one such message with another would be a poor trade.
  const reason =
    marker === 'partial'
      ? 'prior-art marker is PARTIAL — treated as absent'
      : MARKER_LINE.test(body || '')
        ? 'prior-art marker does not record a completed sweep'
        : 'no prior-art marker present';

  // recommend: surface the advisory, sweep nothing. Deliberately NOT `fail` —
  // since --prior-art is opt-in and rarely passed, most issues carry no marker,
  // so a fail would downgrade nearly every review for a sweep that was never
  // meant to run automatically.
  if (mode === 'recommend') {
    return { sweep: false, status: 'recommend', reason };
  }

  // mode === 'full' — the only mode that still sweeps automatically.
  return {
    sweep: true,
    status: 'fail',
    reason: reason === 'no prior-art marker present' ? reason : `${reason} — re-sweeping`
  };
}

/**
 * Decide what an explicitly-typed `--prior-art` does under the current mode (#2564).
 *
 * Companion to `decideSweep`, which governs the *automatic* review-time path.
 * This governs the *explicit* authoring path in /enhancement and /proposal, and
 * exists for the same reason `decideSweep` does: the command specs delegate the
 * decision rather than re-deriving it, so the two paths cannot drift into
 * disagreeing about what a mode means.
 *
 * Only `off` refuses. That inverts the pre-#2564 contract — the schema and both
 * command specs promised an explicit flag "sweeps regardless" — and the
 * inversion is the point of the mode. What is *not* acceptable is a silent
 * no-op: the user typed a flag, so a refusal must be reported and must name the
 * setting to change, or there is no way to tell refusal from a sweep that found
 * nothing.
 *
 * @param {object} [input]
 * @param {string|boolean} [input.reviewSweep] - framework-config.json setting
 * @returns {{sweep: boolean, refused: boolean, mode: string, message: string|null}}
 */
function decideFlagSweep({ reviewSweep } = {}) {
  const mode = normalizeReviewSweep(reviewSweep);

  if (mode === 'off') {
    return {
      sweep: false,
      refused: true,
      mode,
      message:
        'Prior-art sweeps are disabled for this project: framework-config.json ' +
        'sets reviewSweep to "off", which refuses --prior-art. Change reviewSweep ' +
        'to "flag-only", "recommend", or "full" to allow the flag to sweep.'
    };
  }

  return { sweep: true, refused: false, mode, message: null };
}

/**
 * The advisory shown when a sweep was not run under mode `recommend` (#2564 AC8).
 *
 * Names a command the reader can actually run. An advisory that only reports
 * absence leaves them to work out what to do about it, which is how a
 * recommendation degrades into noise that gets tuned out.
 *
 * @returns {string}
 */
function formatSweepAdvisory() {
  return (
    'Prior art was not swept for this issue. To run one, re-invoke the authoring ' +
    'command with the flag: `/enhancement <title> --prior-art` or ' +
    '`/proposal <title> --prior-art`.'
  );
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
  // Same predicate as classifyMarker (#2540). When the two disagreed, a prose
  // mention read as `absent` but still took this replace branch, splicing the
  // section over the middle of a sentence and discarding its tail.
  const match = MARKER_LINE.exec(base);

  if (match) {
    // Replace the existing marker line (complete or PARTIAL) in place,
    // including any leading whitespace the anchor allowed.
    const index = match.index;
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
  REVIEW_SWEEP_MODES,
  DEFAULT_REVIEW_SWEEP_MODE,
  normalizeReviewSweep,
  decideFlagSweep,
  formatSweepAdvisory,
  classifyMarker,
  isExemptFromSweep,
  decideSweep,
  insertPriorArtSection
};
