// Rubrical Works (c) 2026
/**
 * @framework-script 0.105.0
 * prior-art-marker.js
 *
 * Deterministic half of the review-time prior-art gate (#2517): classify the
 * `**Prior Art:**` marker, apply the authored-before-the-feature cutoff, and
 * insert the section so it survives review-finalize's own body write.
 *
 * The sweep itself — surface resolution, term derivation, searching, relevance
 * judgment — is owned by #2514 and performed as generative work by the command
 * specs reading `.claude/metadata/prior-art-sweep.json`. None of it is here.
 * This module answers mechanical questions only: is a marker present and
 * complete, is this issue old enough to be exempt, where does the section go
 * in the body — and, for issue-history matching (#2874), what of a candidate
 * body counts as evidence and whether a search may have been truncated.
 *
 * Node built-ins and sibling framework modules only (`./checkbox-scan.js` for
 * fence masking, `./review-format.js` for the `**Reviews:** N` footer pattern),
 * per the runtime dependency contract for deployed helpers
 * (04-deployment-awareness.md). Marker strings are matched by shape
 * rather than re-read from prior-art-sweep.json so this stays dependency-free;
 * the literal heading is fixed by that file's `bodyFormat.heading` and is
 * asserted against it in tests.
 */

// The review footer this module inserts above, defined once (#2880).
const { REVIEWS_MARKER_PATTERN } = require('./review-format.js');

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
const MARKER_HEADING_PATTERN = MARKER_HEADING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Heading form, accepted alongside the bold inline form (#2700).
 *
 * `## Prior Art` / `### Prior Art:` — any level, optional trailing colon. The
 * `\b` after `Art` is load-bearing: without it `### Prior Artistry` matches a
 * prefix and reports a section that is not there.
 *
 * Recognition only. Emission is unchanged and still uses MARKER_HEADING — see
 * `prior-art-sweep.json` `bodyFormat`, which this file does not write.
 */
const HEADING_FORM_PATTERN = '#{1,6}[ \\t]+Prior[ \\t]+Art\\b[ \\t]*:?';

const MARKER_LINE = new RegExp(
  `^[ \\t]*(?:${MARKER_HEADING_PATTERN}|${HEADING_FORM_PATTERN})`,
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

  // Every marker line, not just the first (#2700). Collected by scanning lines
  // rather than by making MARKER_LINE global — a global regex carries
  // `lastIndex` between calls, which is why the constant is non-global.
  const markers = [];
  for (const line of body.split('\n')) {
    const m = MARKER_LINE.exec(line);
    if (m) markers.push({ line, marker: m[0] });
  }
  if (markers.length === 0) return 'absent';

  // PARTIAL among ANY marker line wins, and scanning only the first is what
  // made this necessary (#2700). Widening detection to accept the heading form
  // meant a bare `### Prior Art` above a `**Prior Art:** PARTIAL` line matched
  // first and reported `complete` — a sweep that explicitly recorded itself as
  // incomplete, read as finished. Before widening the bold line WAS the first
  // match, so this regression arrived with the widening and belongs to it.
  // AC3 requires PARTIAL to survive in every accepted form; that includes
  // combinations of forms, not just each form alone.
  if (markers.some((entry) => /\bPARTIAL\b/.test(entry.line))) return 'partial';

  const first = markers[0];

  // Which accepted form matched decides how the rest of the line reads (#2700).
  const isHeadingForm = /^[ \t]*#/.test(first.marker);

  // A markdown heading DECLARES a section; its content lives below the line,
  // not on it. The bold inline form carries its summary ON the line, which is
  // why only that form inspects what trails it.
  if (isHeadingForm) return 'complete';

  // Offset taken from the match, NOT from indexOf(MARKER_HEADING) (#2700).
  // With two accepted shapes a literal search for the bold heading returns -1
  // on a heading-form line, and `-1 + MARKER_HEADING.length` silently yields a
  // plausible-looking offset wrong by an amount that varies with heading depth.
  const trailing = first.line.slice(first.marker.length).trim();

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
 * The advisory shown when a sweep was not run under mode `recommend` (#2564 AC8,
 * rewritten #2725).
 *
 * Names a command the reader can actually run. An advisory that only reports
 * absence leaves them to work out what to do about it, which is how a
 * recommendation degrades into noise that gets tuned out.
 *
 * **It previously named the wrong half of the workflow.** The text pointed at
 * `/enhancement <title> --prior-art` and `/proposal <title> --prior-art` — the
 * *authoring* commands. This advisory is emitted during a **review**, so the
 * issue already exists; re-invoking an authoring command files a *second* issue
 * and sweeps nothing on the one being read. The instruction did not apply in the
 * only situation it ever appeared in.
 *
 * It names `/review-issue` because that is the universal entry point: a
 * `proposal`-labelled issue redirects to `/review-proposal` carrying the flag
 * (#2725 AC2), so one command covers both artifacts and the reader does not have
 * to know which they are looking at.
 *
 * @returns {string}
 */
function formatSweepAdvisory() {
  return (
    'Prior art was not swept for this issue. To run one against this issue, ' +
    're-invoke the review with the flag: `/review-issue #<N> --prior-art`.'
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
  // The standalone footer line only (#2880): a prose line that merely opens
  // with a quoted marker is not the footer. Inserting at the newline that ends
  // the line above keeps the output exactly as the old `\n**Reviews` match gave.
  const reviews = REVIEWS_MARKER_PATTERN.exec(base);
  if (reviews && reviews.index > 0) {
    const at = reviews.index - 1;
    return `${base.slice(0, at)}\n\n${section}${base.slice(at)}`;
  }

  return `${base.trimEnd()}\n\n${section}\n`;
}

// ─── Issue-history evidence matching (#2874) ───
//
// Fence masking and the bold-section-header predicate come from the shared
// scanner rather than being written a third time. checkbox-scan.js requires
// nothing, so this helper stays inside the runtime dependency contract.
const { computeFenceMask, isBoldMarker } = require('./checkbox-scan.js');

/**
 * Sections removed from an issue body before it is matched as prior-art
 * evidence (#2874).
 *
 * The corpus is self-contaminating: every sweep writes a Prior Art section into
 * the body it swept, and log-changed-files.js appends a Files Changed section,
 * so a later sweep "found" issues whose only hit was an earlier sweep's record
 * of its own search terms, or a path the issue merely touched. Each sweep
 * degraded the precision of the next, with no natural bound.
 *
 * Mirrors prior-art-sweep.json `searchSurfaces.issueHistory.excludedSections`
 * and is pinned to it by test; the heading form is matched at any level, as
 * classifyMarker recognises it.
 */
const EXCLUDED_SECTION_FORMS = [MARKER_HEADING, '## Prior Art', '### Files Changed'];

// Header and terminator are scope-drift-check.js `extractFilesChanged`'s own
// predicates, so the parser that READS this section as declared scope and the
// one that REMOVES it cannot disagree about where it ends. Pinned by test.
const FILES_CHANGED_HEADER = /^###\s+Files Changed\s*$/;
const isFilesChangedTerminator = (line) => /^##\s/.test(line) || /^###\s/.test(line);

// Derived from the same constants MARKER_LINE uses, so recognition and removal
// match on one rule. Split in two because the forms end differently.
const BOLD_MARKER_LINE = new RegExp(`^[ \\t]*${MARKER_HEADING_PATTERN}`);
const HEADING_MARKER_LINE = new RegExp(`^[ \\t]*(${HEADING_FORM_PATTERN})`);

const ANY_HEADING = /^[ \t]*(#{1,6})[ \t]+\S/;
// A bold lead-in label: `**Reviews:** 2`, `**Motivation:**`. Wider than
// isBoldMarker, which requires the bold run to be the whole line.
const BOLD_LABEL = /^[ \t]*\*\*[^*\n]+:\*\*/;

/**
 * The terminator for the excluded section `line` opens, or null.
 *
 * Each form ends by its own grammar:
 *   ### Files Changed  next `##`/`###` heading — `**Added:**` sub-headers
 *                      belong to it, exactly as extractFilesChanged reads it
 *   ## Prior Art       next heading of the same or higher level, or a
 *                      whole-line bold header — the rule checkbox-scan.js
 *                      applies to a heading-form acceptance-criteria section
 *   **Prior Art:**     next heading of any level, or the next bold label line;
 *                      a bold label is a peer of the labels around it, and
 *                      blank lines do not end it, so its entry table goes too
 *
 * @param {string} line
 * @returns {((line: string) => boolean)|null}
 */
function excludedSectionTerminator(line) {
  if (FILES_CHANGED_HEADER.test(line)) return isFilesChangedTerminator;

  const heading = HEADING_MARKER_LINE.exec(line);
  if (heading) {
    const level = /#+/.exec(heading[1])[0].length;
    return (next) => {
      const h = ANY_HEADING.exec(next);
      return (h !== null && h[1].length <= level) || isBoldMarker(next);
    };
  }

  if (BOLD_MARKER_LINE.test(line)) {
    return (next) => ANY_HEADING.test(next) || BOLD_LABEL.test(next);
  }

  return null;
}

/**
 * Remove every excluded section from an issue body before evidence matching.
 *
 * Applies to issue-history evidence matching ONLY. It never removes a section a
 * command reads as input — /qa deliberately reads a parent's Files Changed
 * section as its term source, and does not call this.
 *
 * Fence-aware in both directions: a marker quoted inside a fenced code block
 * opens no section (the #2523 rule — a body that discusses a format does not
 * carry it), and a heading quoted inside a fence ends none. extractFilesChanged
 * is fence-blind; the two agree on every body log-changed-files.js writes,
 * since that section never contains a fence.
 *
 * A body with nothing to strip is returned as given; otherwise lines are
 * rejoined with `\n`, which is all evidence matching needs.
 *
 * @param {string} body
 * @returns {string}
 */
function stripExcludedSections(body) {
  if (typeof body !== 'string' || body === '') return '';

  const lines = body.split(/\r?\n/);
  const mask = computeFenceMask(lines);
  const kept = [];
  let stripped = false;
  let i = 0;

  while (i < lines.length) {
    const isTerminator = mask[i] ? null : excludedSectionTerminator(lines[i]);
    if (!isTerminator) {
      kept.push(lines[i]);
      i++;
      continue;
    }
    stripped = true;
    let j = i + 1;
    while (j < lines.length && (mask[j] || !isTerminator(lines[j]))) j++;
    i = j;
  }

  return stripped ? kept.join('\n') : body;
}

/**
 * `gh issue list`'s default `--limit`, per `gh issue list --help`
 * ("Maximum number of issues to fetch (default 30)"). Applies when a
 * configured command carries no limit of its own.
 */
const GH_ISSUE_LIST_DEFAULT_LIMIT = 30;

/**
 * Whether an issue search may have been cut off by its own `--limit` (#2874).
 *
 * `--limit` truncates with no signal: a search returning exactly the limit is
 * indistinguishable from one that returned every match. Reporting it complete
 * is the sweep claiming a search it did not finish — so a full page is reported
 * as possibly truncated, never as complete.
 *
 * @param {number} resultCount - how many issues the search returned
 * @param {string} command - the invocation that produced them
 * @returns {boolean}
 */
function isPossiblyTruncated(resultCount, command) {
  if (typeof resultCount !== 'number' || !Number.isFinite(resultCount)) return false;
  const text = typeof command === 'string' ? command : '';
  const m = /(?:^|\s)(?:--limit|-L)(?:=|\s+)(\d+)/.exec(text);
  const limit = m ? Number(m[1]) : GH_ISSUE_LIST_DEFAULT_LIMIT;
  return resultCount >= limit;
}

module.exports = {
  PRIOR_ART_CUTOFF,
  MARKER_HEADING,
  REVIEW_SWEEP_MODES,
  DEFAULT_REVIEW_SWEEP_MODE,
  EXCLUDED_SECTION_FORMS,
  GH_ISSUE_LIST_DEFAULT_LIMIT,
  normalizeReviewSweep,
  decideFlagSweep,
  formatSweepAdvisory,
  classifyMarker,
  isExemptFromSweep,
  decideSweep,
  insertPriorArtSection,
  stripExcludedSections,
  isPossiblyTruncated
};
