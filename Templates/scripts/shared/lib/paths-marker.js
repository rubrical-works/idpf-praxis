// Rubrical Works (c) 2026
/**
 * @framework-script 0.98.0
 * paths-marker.js
 *
 * Mechanical half of recording `/paths` application on the proposal issue
 * (#2642): compose the `**Path Analysis:**` marker line, and insert or replace
 * it in a body idempotently.
 *
 * The analysis itself — category walk, candidate generation, user confirmation,
 * the `## Path Analysis` section written to the proposal file — is generative
 * work owned by `CommandsSrc/paths.md`. None of it is here. This module answers
 * only two mechanical questions: what does the marker line say, and where does
 * it go in the body.
 *
 * Shaped after `prior-art-marker.js` deliberately. `/paths` had no on-issue
 * record at all while `/review-*` has had `**Reviews:** N` since long before,
 * so the gap was never a missing mechanism — it was a missing use of one that
 * already worked. A third insert-or-replace shape would have been a third set
 * of edge cases to get wrong.
 *
 * Node built-ins only, per the runtime dependency contract for deployed helpers
 * (04-deployment-awareness.md) — this file is symlinked into every user project
 * through the `shared/lib` tree.
 *
 * Explicit non-goal (#2642): no classifier, and no gate that consults the
 * marker. Recording the state and consuming it are separate work; `hasMarker`
 * is not exported for that reason, even though the replace path needs it.
 */

const MARKER_HEADING = '**Path Analysis:**';

/**
 * Start-of-line anchored marker predicate.
 *
 * Anchored for the reason #2540 established on the prior-art marker: an
 * unanchored search counts any occurrence of the literal, including one inside
 * ordinary prose — and here that would splice a replacement over the middle of
 * a sentence that merely *named* the marker.
 *
 * Derived from MARKER_HEADING rather than written out, so the literal lives in
 * one place and a second hand-written copy cannot drift out from under it.
 *
 * Leading whitespace is allowed: an indented marker is still a marker line. A
 * marker inside a fenced code block still matches; anchoring does not address
 * that and this module does not claim it.
 *
 * Non-global on purpose — `exec` on a global regex carries `lastIndex` between
 * calls, which would make these functions stateful across invocations.
 */
const MARKER_LINE = new RegExp(
  `^[ \\t]*${MARKER_HEADING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
  'm'
);

/**
 * Qualifier wording, keyed by run kind.
 *
 * The strings match the `/paths` file-footer wording — `(Quick pass — 3/6
 * categories)` and `(Partial — 2/6 categories)` — so the marker and the footer
 * describe the same run in the same words. A reader comparing them is not left
 * deciding whether two different phrasings mean the same thing, which is the
 * whole point of propagating the qualifier at all: a partial pass must never be
 * readable as a complete one.
 *
 * `full` maps to null rather than to an "everything" qualifier. An unqualified
 * marker is the complete case, so saying so adds length without adding meaning.
 */
const RUN_QUALIFIERS = {
  full: null,
  quick: 'Quick pass',
  partial: 'Partial'
};

/**
 * Today's date in the `YYYY-MM-DD` form the marker uses.
 *
 * Only reached when the caller omits `date`. Tests always pass one explicitly,
 * so nothing in the suite depends on the clock.
 */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Compose the marker line for a completed `/paths` run.
 *
 * @param {object} input
 * @param {number} input.pathCount - Paths confirmed in Step 5. Must be >= 1.
 * @param {string} input.destination - Where the analysis was written: a proposal
 *   file path, or the literal `issue comment` for the fallback. Recorded as
 *   data — the marker states that `/paths` ran, not that a file exists.
 * @param {string} [input.date] - `YYYY-MM-DD`; defaults to today (UTC).
 * @param {object} [input.run] - Run shape. `{kind}` is one of `full`, `quick`,
 *   `partial`; `quick` and `partial` also require `categoriesDone` and
 *   `categoriesTotal`. Omitted means a full run.
 * @returns {string}
 */
function composePathMarker({ pathCount, destination, date, run } = {}) {
  // Absence of the marker has to mean "no analysis was applied". Step 5's
  // Discard and no-paths-confirmed outcomes STOP without writing the file and
  // must not write a marker either — a zero-path marker would make those
  // outcomes indistinguishable from a completed run, which is the very
  // distinction this marker exists to record. Enforced here so the invariant is
  // structural rather than prose a caller can overlook.
  if (!Number.isInteger(pathCount) || pathCount < 1) {
    throw new Error(
      `composePathMarker: a marker records a run that confirmed at least one path (got ${pathCount})`
    );
  }

  if (typeof destination !== 'string' || destination.trim() === '') {
    throw new Error('composePathMarker: destination is required (a file path, or "issue comment")');
  }

  const kind = run && run.kind ? run.kind : 'full';
  if (!Object.prototype.hasOwnProperty.call(RUN_QUALIFIERS, kind)) {
    throw new Error(
      `composePathMarker: unknown run kind "${kind}" (expected ${Object.keys(RUN_QUALIFIERS).join(', ')})`
    );
  }

  const qualifier = RUN_QUALIFIERS[kind];
  let qualifierText = '';
  if (qualifier) {
    const { categoriesDone, categoriesTotal } = run;
    // A qualifier without counts would say a run was partial while withholding
    // how partial — worse than no qualifier, because it looks informative.
    if (!Number.isInteger(categoriesDone) || !Number.isInteger(categoriesTotal)) {
      throw new Error(
        `composePathMarker: run kind "${kind}" requires integer categoriesDone and categoriesTotal`
      );
    }
    qualifierText = ` — ${qualifier}, ${categoriesDone}/${categoriesTotal} categories`;
  }

  const noun = pathCount === 1 ? 'path' : 'paths';
  const stamp = date || today();

  return `${MARKER_HEADING} ${pathCount} ${noun} — ${destination.trim()}${qualifierText} (${stamp})`;
}

/**
 * Insert the marker into a body, or replace the one already there.
 *
 * Idempotent by construction: a second `/paths` run on the same issue replaces
 * the existing line rather than appending beside it, so the body carries at
 * most one marker no matter how many times the command runs. Replacement covers
 * the partial-to-complete direction specifically — a resumed run must not leave
 * its own superseded partial qualifier standing.
 *
 * When no marker is present the line goes above a trailing `**Reviews:** N`
 * footer, matching `insertPriorArtSection`. The marker is part of the body, not
 * something appended after its footer, and keeping the Reviews line last leaves
 * `updateBodyReviewCount` finding exactly the marker it expects.
 *
 * @param {string} body - Current issue body; a missing body is treated as empty.
 * @param {string} marker - A line from `composePathMarker`.
 * @returns {string}
 */
function applyPathMarker(body, marker) {
  const base = typeof body === 'string' ? body : '';
  const match = MARKER_LINE.exec(base);

  if (match) {
    // Replace the existing marker line in place, including any leading
    // whitespace the anchor allowed, and keep everything after it.
    const before = base.slice(0, match.index);
    const after = base.slice(match.index);
    const lineBreak = after.indexOf('\n');
    const tail = lineBreak === -1 ? '' : after.slice(lineBreak);
    return before + marker + tail;
  }

  const reviewsMatch = base.match(/\n\*\*Reviews:\*\*\s*\d+/);
  if (reviewsMatch) {
    const at = base.indexOf(reviewsMatch[0]);
    return `${base.slice(0, at)}\n\n${marker}${base.slice(at)}`;
  }

  return `${base.trimEnd()}\n\n${marker}\n`;
}

module.exports = {
  MARKER_HEADING,
  RUN_QUALIFIERS,
  composePathMarker,
  applyPathMarker
};
