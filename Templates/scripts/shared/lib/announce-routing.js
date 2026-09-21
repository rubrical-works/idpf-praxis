#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.105.0
 * @description Targeted announcement routing (#2915). Given the recipient split from peer-announce.js resolveRecipients(), the resolved broadcast lever and an overwatch presence reading, decides whether an announcement goes to every addressable peer or to the live /overwatch alone. Every path short of a confirmed, uniquely addressable monitor falls back to broadcast and names why. Pure: no I/O, no throwing path.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

/**
 * WHY (#2915). Every announcement goes to every addressable peer, so N sessions
 * in one directory pay N-1 acknowledgements per event, and `/overwatch` is
 * the one session built to consume them. With `broadcast: false` and a live
 * monitor, a session sends to the monitor alone; the monitor relays what is
 * actionable (overlap notices, #2914).
 *
 * FALLBACK IS BROADCAST, NEVER SILENCE. Targeted routing narrows who hears an
 * announcement, so every doubt about the monitor widens back to everyone:
 *
 *   no marker, or a stale one        -> nobody is monitoring
 *   live marker, pid not addressable -> the marker names nothing we can send to
 *                                       (also the win32 recycled-pid case: a
 *                                       recycled pid is not a registered session)
 *   monitor name shared or missing   -> SendMessage addresses by NAME while this
 *                                       matched by PID, so a send could reach the
 *                                       wrong session. Neither guess nor drop
 *                                       (Cross-Session-Peer-Awareness.md:479).
 *
 * WHAT THIS CANNOT SEE. A monitor that holds, declines or lets messages expire
 * is undetectable from the sender (#2674). Under targeted routing that leaves
 * every session uninformed, and the docs say so; no field here can detect it.
 */

/** Skip reason for a peer not sent to because the announcement went to the monitor. */
const ROUTED_SKIP_REASON = 'routed-to-monitor';

/**
 * Every reason targeted routing can fall back to broadcast. The first five are
 * `overwatch-presence.js` PRESENCE_REASONS other than `live`, passed through
 * so the envelope names the marker state rather than a paraphrase of it.
 */
const FALLBACK_REASONS = Object.freeze([
  'no-marker', 'stale-pid', 'stale-boot', 'malformed', 'cwd-mismatch',
  'monitor-not-addressable', 'monitor-name-ambiguous',
]);

/**
 * Why an announcement may bypass targeted routing altogether (#2960).
 *
 * A branch operation — a merge to main, a tag push, a branch deletion —
 * changes what every session in the directory is standing on, and a working
 * peer needs to hear it before it happens, not through a monitor whose relay
 * vocabulary has no such message and whose disposition is invisible (#2674).
 *
 * Deliberately NOT a fallback reason: a fallback is a doubt about the monitor,
 * this is a decision about the event. `fallbackReason` stays null so the two
 * cannot be confused, and `forced` carries the reason instead.
 */
const FORCED_REASONS = Object.freeze(['branch-operation']);

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nameOf(p) {
  return isPlainObject(p) && typeof p.name === 'string' ? p.name.trim() : '';
}

/**
 * Decide the recipients for one announcement.
 *
 * @param {Object} options
 * @param {Array}   options.recipients - addressable peers, from resolveRecipients()
 * @param {Array}   options.skipped    - unaddressable peers, from resolveRecipients()
 * @param {boolean} [options.broadcast] - resolved lever; anything but false is broadcast
 * @param {Object}  [options.presence]  - overwatch-presence.js readPresence() result
 * @param {string}  [options.force]     - a FORCED_REASONS value: broadcast regardless
 *                                        of the lever and the monitor (#2960)
 * @returns {{recipients: Array, skipped: Array, routing: {broadcast: boolean,
 *            applied: 'broadcast'|'targeted', monitorPid: number|null,
 *            monitorName: string|null, fallbackReason: string|null,
 *            forced: string|null}}}
 */
function routeRecipients(options) {
  const opts = isPlainObject(options) ? options : {};
  const recipients = Array.isArray(opts.recipients) ? opts.recipients : [];
  const skipped = Array.isArray(opts.skipped) ? opts.skipped : [];
  const broadcast = opts.broadcast !== false;
  // An unrecognised value forces nothing: widening who hears an announcement
  // is a decision, so only a named reason may make it.
  const forced = FORCED_REASONS.includes(opts.force) ? opts.force : null;

  const unchanged = (fallbackReason) => ({
    recipients,
    skipped,
    routing: { broadcast, applied: 'broadcast', monitorPid: null, monitorName: null, fallbackReason, forced },
  });

  try {
    // Forced first: the monitor is one recipient among many, never the only one.
    if (forced || broadcast) return unchanged(null);

    const presence = isPlainObject(opts.presence) ? opts.presence : null;
    if (!presence || presence.active !== true) {
      const reason = presence && FALLBACK_REASONS.includes(presence.reason) ? presence.reason : 'no-marker';
      return unchanged(reason);
    }

    const monitor = recipients.find((p) => isPlainObject(p) && Number(p.pid) === presence.pid);
    if (!monitor) return unchanged('monitor-not-addressable');

    const name = nameOf(monitor);
    const shared = recipients.some((p) => p !== monitor && nameOf(p) === name);
    if (name === '' || shared) return unchanged('monitor-name-ambiguous');

    const routedAway = recipients
      .filter((p) => p !== monitor)
      .map((p) => ({ ...p, skipReason: ROUTED_SKIP_REASON }));

    return {
      recipients: [monitor],
      skipped: [...skipped, ...routedAway],
      routing: {
        broadcast: false,
        applied: 'targeted',
        monitorPid: Number(monitor.pid),
        monitorName: name,
        fallbackReason: null,
        forced: null,
      },
    };
  } catch {
    // Unreachable by construction. Broadcast is the safe answer: it is what
    // every session did before this helper existed.
    return unchanged('no-marker');
  }
}

module.exports = { routeRecipients, ROUTED_SKIP_REASON, FALLBACK_REASONS, FORCED_REASONS };
