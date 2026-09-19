#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.104.0
 * @description Targeted overlap notices for /overwatch (#2914). Attributes in-flight issues to sessions from received work-started announcements, intersects their authored Files to modify declarations, and decides which involved session is told what, bounded by dedupe and a per-recipient rate limit. Pure and synchronous: no file read, no send, no throwing path. The monitor relays the composed text verbatim.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

/**
 * WHY THIS EXISTS (#2914).
 *
 * `/overwatch` already raised `scope-overlap` — two in-flight issues
 * declaring the same file — and could report it only to its own user. The two
 * sessions that would actually collide never heard about it unless someone
 * relayed it by hand, although the monitor is the one session positioned to
 * see both sides.
 *
 * WHY THE MONITOR STILL EMITS NO ANNOUNCEMENTS. A lifecycle announcement goes
 * to every peer and says what the sender is doing; the monitor does no work, so
 * it has nothing to announce. An overlap notice is neither: it goes only to the
 * sessions involved, and it is actionable for exactly those two. #2768's
 * "the monitor emits nothing" is narrowed, not abandoned.
 *
 * WHY A HELPER RATHER THAN SPEC PROSE. Who is told, what they are told, and
 * when a standing overlap has already been told are all deterministic. Left to
 * prose, the text is composed by a model on every tick, and a composed list is
 * how `work-completed` once named a commit that never existed (#2790). The spec
 * relays `notices[].text` and never writes its own.
 */

// The authored-declaration parser the drift gate already uses, reused rather
// than re-derived: two parsers of one section are two answers to what an issue
// declared. `authoredPaths` is the declaration alone — `### Files Changed` is
// history of what one session already did, and committed-file overlap belongs
// to #2839, not here.
const { parseDeclaredScope } = require('../scope-drift-check.js');

/** A non-null, non-array object. */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A usable session name: a non-blank string. Anything else is unattributed. */
function sessionName(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** A positive integer issue number, or null. */
function issueNumber(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Map each in-flight issue to the session that announced starting it.
 *
 * The attribution is the `from-name` on the `work-started` the monitor RECEIVED
 * for that issue — the only evidence of who is working what that the monitor
 * actually holds. A later `work-completed` takes the issue out of flight. An
 * announcement with no sender name attributes nothing: guessing a recipient
 * would message a session about work it is not doing.
 *
 * @param {Array<{event: string, issues: number[], fromName: string, at: number}>} announcements
 * @returns {Object<number, string>} issue number → session name
 */
function attributeInFlight(announcements) {
  const map = {};
  if (!Array.isArray(announcements)) return map;

  const ordered = announcements
    .filter((a) => isPlainObject(a) && Array.isArray(a.issues))
    .map((a, i) => ({ a, i, at: Number.isFinite(a.at) ? a.at : 0 }))
    // Stable on ties, so two announcements stamped together keep their order.
    .sort((x, y) => (x.at - y.at) || (x.i - y.i))
    .map((x) => x.a);

  for (const a of ordered) {
    const issues = a.issues.map(issueNumber).filter((n) => n !== null);
    if (a.event === 'work-started') {
      const name = sessionName(a.fromName);
      if (name === null) continue;
      for (const n of issues) map[n] = name;
    } else if (a.event === 'work-completed') {
      for (const n of issues) delete map[n];
    }
  }
  return map;
}

/**
 * Every pair of in-flight issues whose authored declarations share a path.
 *
 * @param {Array<{issue: number, session: string|null, body: string}>} inFlight
 * @returns {Array<{issues: [number, number], sessions: [string|null, string|null], paths: string[]}>}
 *   Pairs in ascending issue order; paths sorted.
 */
function findOverlaps(inFlight) {
  if (!Array.isArray(inFlight)) return [];

  const members = inFlight
    .filter((m) => isPlainObject(m) && issueNumber(m.issue) !== null && typeof m.body === 'string')
    .map((m) => {
      let declared = [];
      try {
        declared = parseDeclaredScope(m.body).authoredPaths || [];
      } catch {
        declared = [];
      }
      return { issue: m.issue, session: sessionName(m.session), paths: new Set(declared) };
    })
    .sort((x, y) => x.issue - y.issue);

  const overlaps = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i];
      const b = members[j];
      const shared = [...a.paths].filter((p) => b.paths.has(p)).sort();
      if (shared.length === 0) continue;
      overlaps.push({ issues: [a.issue, b.issue], sessions: [a.session, b.session], paths: shared });
    }
  }
  return overlaps;
}

/**
 * The notice one recipient receives. The first line stands alone, because a
 * recipient's user sees only the first line of a message until they expand it.
 *
 * @param {{recipient: string, self: number, other: number, otherSession: string, paths: string[]}} args
 * @returns {string}
 */
function composeNotice({ recipient, self, other, otherSession, paths }) {
  const pair = [self, other].sort((x, y) => x - y);
  const list = (Array.isArray(paths) ? paths : []).map((p) => `\`${p}\``).join(', ');
  return [
    `Overlap notice from /overwatch: #${pair[0]} and #${pair[1]} declare the same files in Files to modify.`,
    `You are working #${self} (${recipient}); ${otherSession} is working #${other}. Shared: ${list}.`,
    'Advisory only: nothing is blocked. Coordinate with the other session before editing these files.',
    `${otherSession} was sent the same notice; delivery is not confirmed, so it may not have received it.`,
  ].join('\n');
}

/** Stable identity of one notice to one recipient. Paths are part of it on purpose. */
function fingerprintNotice(recipient, issues, paths) {
  return `${recipient}|#${issues[0]}-#${issues[1]}|${paths.join(',')}`;
}

/** Read the thresholds, or null when they cannot bound a send. */
function readThresholds(signals) {
  const block = isPlainObject(signals) ? signals.overlapNotices : null;
  if (!isPlainObject(block) || !isPlainObject(block.dedupe) || !isPlainObject(block.rateLimit)) return null;
  const dedupeMinutes = block.dedupe.windowMinutes;
  const max = block.rateLimit.maxPerRecipient;
  const rateMinutes = block.rateLimit.windowMinutes;
  if (![dedupeMinutes, max, rateMinutes].every((n) => Number.isInteger(n) && n > 0)) return null;
  return { dedupeMs: dedupeMinutes * 60 * 1000, max, rateMs: rateMinutes * 60 * 1000 };
}

/**
 * Decide the overlap notices for one tick.
 *
 * ORDER IS LOAD-BEARING, as in `evaluateAutoCreate`: dedupe before the rate
 * limit, so an unchanged overlap reports as a repeat rather than as a recipient
 * at its cap. Those are different remedies.
 *
 * @param {Object} options
 * @param {Array}  options.inFlight - [{issue, session, body}]; session from attributeInFlight
 * @param {Array}  options.sent     - [{fingerprint, recipient, at}] notices already sent this session
 * @param {number} options.now      - epoch ms
 * @param {Object} options.signals  - parsed overwatch-signals.json
 * @param {Object} [options.config] - resolved cross-session state; absent means enabled
 * @returns {{enabled: boolean, notices: Array, reportOnly: Array, suppressed: Array}}
 *   notices:    [{recipient, text, fingerprint, issues, paths}] — send each, verbatim
 *   reportOnly: [{issues, sessions, paths, reason}] — tell the monitor's user; message no one
 *   suppressed: [{recipient, issues, paths, fingerprint, reason}] — withheld, and why
 */
function evaluateOverlapNotices(options) {
  const empty = { enabled: false, notices: [], reportOnly: [], suppressed: [] };
  try {
    const opts = isPlainObject(options) ? options : {};
    const config = isPlainObject(opts.config) ? opts.config : {};
    // Absence means enabled: only an exact false turns the lever off, as the
    // resolver reads it.
    const enabled = config.overlapNotices !== false;
    const overlaps = findOverlaps(opts.inFlight);
    const result = { enabled, notices: [], reportOnly: [], suppressed: [] };

    if (!enabled) {
      result.reportOnly = overlaps.map((o) => ({ ...o, reason: 'overlap-notices-off' }));
      return result;
    }

    const thresholds = readThresholds(opts.signals);
    if (thresholds === null) {
      // Fail closed. Without dedupe and a cap a standing overlap becomes one
      // message per tick to two working sessions; the overlap is still
      // reported, so nothing is lost but the send.
      result.reportOnly = overlaps.map((o) => ({ ...o, reason: 'signals-unreadable' }));
      return result;
    }

    const now = Number.isFinite(opts.now) ? opts.now : Date.now();
    const sent = (Array.isArray(opts.sent) ? opts.sent : [])
      .filter((s) => isPlainObject(s) && Number.isFinite(s.at));
    // Sends decided in THIS tick count against the cap too.
    const decided = [];

    for (const o of overlaps) {
      const [sa, sb] = o.sessions;
      if (sa === null || sb === null) {
        result.reportOnly.push({ ...o, reason: 'unattributed' });
        continue;
      }
      if (sa === sb) {
        result.reportOnly.push({ ...o, reason: 'same-session' });
        continue;
      }

      const sides = [
        { recipient: sa, self: o.issues[0], other: o.issues[1], otherSession: sb },
        { recipient: sb, self: o.issues[1], other: o.issues[0], otherSession: sa },
      ];
      for (const side of sides) {
        const fingerprint = fingerprintNotice(side.recipient, o.issues, o.paths);
        const base = { recipient: side.recipient, issues: o.issues, paths: o.paths, fingerprint };

        const duplicate = sent.some((s) => s.fingerprint === fingerprint && (now - s.at) <= thresholds.dedupeMs);
        if (duplicate) {
          result.suppressed.push({ ...base, reason: 'duplicate' });
          continue;
        }

        const recent = sent.filter((s) => s.recipient === side.recipient && (now - s.at) <= thresholds.rateMs).length
          + decided.filter((r) => r === side.recipient).length;
        if (recent >= thresholds.max) {
          result.suppressed.push({ ...base, reason: 'rate-limited' });
          continue;
        }

        decided.push(side.recipient);
        result.notices.push({ ...base, text: composeNotice({ ...side, paths: o.paths }) });
      }
    }
    return result;
  } catch {
    // Unreachable by construction; keeps the no-throw contract if a later edit
    // introduces a throwing path. The monitor is advisory.
    return empty;
  }
}

module.exports = {
  attributeInFlight,
  findOverlaps,
  composeNotice,
  evaluateOverlapNotices,
};
