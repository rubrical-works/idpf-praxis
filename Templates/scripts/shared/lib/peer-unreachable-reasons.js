#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.100.0
 * @description Shared vocabulary for why a discovered peer cannot be sent to. One reason-to-phrase map, consumed by both surfaces that describe unreachable peers — the startup Peers row (peers-check.js) and the announcement skip notice (peer-announce.js) — so the two cannot drift apart again. Pure data plus two formatters: no I/O, no external require.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

/**
 * WHY THIS IS A SHARED MODULE AND NOT TWO LOCAL MAPS (#2672).
 *
 * `peers-check.js` classified both reasons correctly and rendered both
 * correctly in the startup row. `peer-announce.js` hardcoded "carry no
 * messaging address" into its skip notice and never read `unreachableReason`
 * at all — so a headless `-p` peer, which HAS an address and is merely absent
 * from `ListAgents`, was told it had none. The two surfaces had the same
 * vocabulary to express and only one of them knew it.
 *
 * Duplicating the map would have fixed today's wording and left tomorrow's
 * third reason to be added in one place and forgotten in the other. The
 * failure is diagnostic-only but expensive: a wrong CAUSE sends someone
 * looking for a `DO_NOT_TRACK` setting that was never set.
 *
 * Two phrasings per reason, deliberately. The row appends to a name
 * (`peer-3 (#2280, registered, not tool-reachable)`); the notice counts into a
 * clause (`1 registered but not tool-reachable`). Forcing one string to serve
 * both produced "1 with registered, not tool-reachable" — which is why the
 * shapes are named rather than derived.
 */

/** Reason key used when a peer's reason is absent or unrecognised. */
const UNKNOWN_REASON = 'unknown';

/**
 * Reason → phrasing. Key order is the render order for grouped summaries, so
 * a mixed notice reads the same way every time.
 */
const PEER_UNREACHABLE_REASONS = Object.freeze({
  'no-messaging-address': Object.freeze({
    row: 'no messaging address',
    clause: 'with no messaging address',
  }),
  'not-listed-by-listagents': Object.freeze({
    row: 'registered, not tool-reachable',
    clause: 'registered but not tool-reachable',
  }),
});

/**
 * The neutral fallback.
 *
 * An absent or unrecognised reason must not be rendered as either known cause.
 * Same rule `03-startup.md` applies to an absent `entrypoint`, which is never
 * read as `sdk-cli`: absence must not manufacture a specific cause. An older
 * build that omits the field, or a future reason this map has not learned yet,
 * both land here and are described as unreachable without a claim about why.
 */
const UNKNOWN_PHRASING = Object.freeze({
  row: 'not reachable',
  clause: 'not reachable for an unrecorded reason',
});

function phrasingFor(reason) {
  if (typeof reason === 'string' && PEER_UNREACHABLE_REASONS[reason]) {
    return PEER_UNREACHABLE_REASONS[reason];
  }
  return UNKNOWN_PHRASING;
}

/** The form appended to a peer's name in the startup Peers row. */
function rowLabel(reason) {
  return phrasingFor(reason).row;
}

/**
 * Group skipped peers by reason into one clause, e.g.
 * `1 with no messaging address, 1 registered but not tool-reachable`.
 *
 * Returns '' for an empty list so the caller decides whether a notice is
 * warranted at all. Stated once for the whole set, never once per peer —
 * repeating it per peer turns a one-line advisory into a wall in the common
 * multi-session case.
 */
function summarizeUnreachable(peers) {
  const list = Array.isArray(peers) ? peers : [];
  if (list.length === 0) return '';

  const counts = new Map();
  for (const p of list) {
    const reason = p && typeof p === 'object' ? p.unreachableReason : undefined;
    const key = typeof reason === 'string' && PEER_UNREACHABLE_REASONS[reason]
      ? reason
      : UNKNOWN_REASON;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const order = [...Object.keys(PEER_UNREACHABLE_REASONS), UNKNOWN_REASON];
  return order
    .filter((key) => counts.has(key))
    .map((key) => {
      const phrasing = key === UNKNOWN_REASON ? UNKNOWN_PHRASING : PEER_UNREACHABLE_REASONS[key];
      return `${counts.get(key)} ${phrasing.clause}`;
    })
    .join(', ');
}

module.exports = {
  PEER_UNREACHABLE_REASONS,
  UNKNOWN_PHRASING,
  UNKNOWN_REASON,
  phrasingFor,
  rowLabel,
  summarizeUnreachable,
};
