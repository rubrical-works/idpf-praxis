// Rubrical Works (c) 2026
/**
 * @framework-script 0.104.0
 *
 * `/overwatch` presence marker (#2769).
 *
 * WHY A FILE AND NOT A MESSAGE. When a monitor is live in a working directory,
 * every session there should narrate inbound announcements quietly - the
 * one-line acknowledgement only - for as long as the monitor runs. A peer
 * `SendMessage` cannot express that: it is advisory, it cannot change another
 * session's behaviour durably, it is lost at compaction, it never reaches a
 * session that starts later, and #2768's contract is that the monitor emits
 * nothing. Project-local runtime state is the only substrate that can say
 * "quiet WHILE a monitor is live", because a message cannot compel and config
 * does not know when the monitor exits.
 *
 * TWO FUNCTIONS, TWO QUESTIONS, OPPOSITE ANSWERS TO ONE FACT.
 *
 *   readPresence(cwd)          -> what is on disk? Consumed by the narration rule.
 *   decideStart(cwd, {force})  -> may THIS monitor start? Consumed by the command.
 *
 * They disagree about a marker whose `pid` is the calling process.
 * `readPresence` reports it `active: true`, which is correct for narration: a
 * monitor narrates quietly under its own marker. Applied to refusal that same
 * value is wrong - re-invoking `/overwatch` in the session that wrote the
 * marker would read its own live pid and refuse itself, a lockout over a
 * monitor that is not a second monitor. So the carve-out lives in
 * `decideStart` and nowhere else: refuse when `active` AND `pid !== process.pid`.
 * Collapsing `self` into `live` reinstates the lockout; moving the carve-out
 * into `readPresence` breaks the narration rule instead.
 *
 * WHY THE DECISION IS HERE AND NOT IN THE COMMAND SPEC. A decision living only
 * in prose can be asserted as TEXT and never EXERCISED. Same precedent as
 * `branch-review-gate.js` for /work's review gate, `decideSweep` /
 * `decideFlagSweep` in `prior-art-marker.js`, and `armingDecision()` in
 * `upstream-monitor.js`.
 *
 * THIS MODULE NEVER DELETES OR MODIFIES THE MARKER. Read-only and advisory, per
 * `06-runtime-triggers.md`. That is not merely tidiness: it is what makes the
 * start-time overwrite the ONLY cleanup path a stale marker has, which in turn
 * is why refusal must be scoped to `live` alone. If any stale reason could
 * refuse, one crashed monitor would lock out every future monitor in that
 * directory permanently, with no in-framework remedy - `malformed` being the
 * sharpest case, where a truncated write becomes an unrecoverable lock.
 *
 * Liveness is REUSED from `peers-check.js`, never re-derived, so the marker and
 * the Peers row agree by construction rather than by two implementations
 * happening to match.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  livenessBasisFor,
  defaultPidExists,
  defaultReadProcStartLinux,
  procStartMatches,
} = require('../peers-check.js');

/** The marker's filename, at the project root. */
const MARKER_FILENAME = '.overwatch.json';

/**
 * The pre-rename marker name, read as a fallback for one release (#2928).
 *
 * The rename is a LIVE-STATE MIGRATION, not a string change. A monitor started
 * by the old code and still running when the new code lands wrote this name and
 * will never write the new one. Without the fallback the new code sees no
 * marker at all — and "no marker" is not an error state, so targeted routing
 * silently falls back to broadcast and narration goes verbose with nothing
 * reporting why.
 *
 * Remove this, and the `markerFile` reporting it exists for, one release after
 * the rename ships: past that point no live monitor can still be writing it.
 */
const LEGACY_MARKER_FILENAME = '.hall-monitor.json';

/**
 * Every value `readPresence` can return as `reason`.
 *
 * `decideStart` carries its OWN set, which adds `self`. The two enumerations
 * are scoped per function and neither constrains the other - `self` is a
 * refusal-time concept and would be wrong on the narration side.
 */
const PRESENCE_REASONS = Object.freeze([
  'no-marker', 'live', 'stale-pid', 'stale-boot', 'malformed', 'cwd-mismatch',
]);

/** A non-null, non-array object. */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Did this `startedAt` predate the current boot?
 *
 * Start stamps are boot-relative, so a marker surviving a reboot can carry a
 * value that collides with a live one. Anything older than the boot is
 * excluded, and an ABSENT or unparseable `startedAt` FAILS CLOSED - treating
 * "cannot tell" as live would keep every session quiet on the strength of a
 * marker nobody can date.
 */
function predatesBoot(startedAt) {
  if (typeof startedAt !== 'string') return true;
  const t = Date.parse(startedAt);
  if (Number.isNaN(t)) return true;
  return t < Date.now() - os.uptime() * 1000;
}

/**
 * Report what the marker on disk says.
 *
 * @param {string} cwd  Project root.
 * @param {string} [markerFilename]  Marker to read. Defaults to
 *   `/overwatch`'s own, so existing callers are unaffected.
 * @param {{platform?: string, readProcStart?: function}} [options]  Test
 *   seams, defaulting to `process.platform` and the linux procStart reader —
 *   the same injection `peers-check.js` accepts, so both the win32 branch and
 *   the corroborated branch execute on any host (#2868).
 * @returns {{active: boolean, reason: string, pid: number|null,
 *            livenessBasis: string, corroborated: boolean,
 *            startedAt: string|null, markerFile: string|null}}
 *   `markerFile` names WHICH file answered - the current marker, the legacy one
 *   (#2928), or null when neither was readable. It is how an upgrade mid-session
 *   is visible instead of silent: a reading served by the legacy name means a
 *   pre-rename monitor is still running here.
 *   `active` is true ONLY for `live`. A stale marker is reported inactive AND
 *   named as stale, so a crashed monitor is visible rather than merely absent.
 *
 *   `corroborated` is true ONLY for a `live` verdict reached on the
 *   `pid-and-procstart` path with a recorded procStart that matched (#2868).
 *   Every other `live` rests on pid-existence alone — win32 always, and linux
 *   for a marker written without a procStart — which a recycled pid satisfies.
 *   It qualifies `live`; it never changes `reason`, which consumers key off.
 *
 * The filename is a parameter because liveness is the reusable part and the
 * marker's name is not: `/idpf-measure` (#2794) needs the same boot-relative
 * staleness rule and the same platform split in `livenessBasis`, and a second
 * implementation of that logic would be a place for the two to disagree. What
 * a marker MEANS still belongs to its owner - this function only reports
 * whether the process that wrote one is still alive.
 *
 * Never throws.
 */
function readPresence(cwd, markerFilename, options) {
  const opts = isPlainObject(options) ? options : {};
  const livenessBasis = livenessBasisFor(opts.platform || process.platform);
  const readProcStart = typeof opts.readProcStart === 'function'
    ? opts.readProcStart
    : defaultReadProcStartLinux;
  const base = {
    active: false,
    reason: 'no-marker',
    pid: null,
    livenessBasis,
    corroborated: false,
    startedAt: null,
    markerFile: null,
  };

  const root = typeof cwd === 'string' && cwd ? cwd : process.cwd();
  const explicit = typeof markerFilename === 'string' && markerFilename;

  // The legacy fallback is scoped to the DEFAULT marker and nowhere else. An
  // explicit filename is a question about a DIFFERENT marker - /idpf-measure's
  // `.idpf-measure.json` (#2794) - and falling back there would answer it with
  // a stale overwatch marker. The new name wins whenever both exist: a legacy
  // marker can only have been written by code that is now gone.
  const candidates = explicit
    ? [markerFilename]
    : [MARKER_FILENAME, LEGACY_MARKER_FILENAME];

  let raw;
  let filename = null;
  for (const candidate of candidates) {
    try {
      raw = fs.readFileSync(path.join(root, candidate), 'utf8');
      filename = candidate;
      break;
    } catch {
      // Absent or unreadable: try the next candidate, then report no-marker.
    }
  }
  if (filename === null) return base;
  base.markerFile = filename;

  let marker;
  try {
    marker = JSON.parse(raw);
  } catch {
    return Object.assign({}, base, { reason: 'malformed' });
  }
  if (!isPlainObject(marker)) {
    return Object.assign({}, base, { reason: 'malformed' });
  }

  const pid = Number.isInteger(marker.pid) ? marker.pid : null;
  const startedAt = typeof marker.startedAt === 'string' ? marker.startedAt : null;
  const out = Object.assign({}, base, { pid, startedAt });

  if (pid === null) return Object.assign(out, { reason: 'malformed' });

  // The marker belongs to a different working directory. Scope is one machine,
  // one user, one directory - the same boundary the peers availability matrix
  // draws - so a foreign-cwd marker says nothing about this directory.
  if (typeof marker.cwd === 'string' && path.resolve(marker.cwd) !== path.resolve(root)) {
    return Object.assign(out, { reason: 'cwd-mismatch' });
  }

  if (predatesBoot(startedAt)) {
    return Object.assign(out, { reason: 'stale-boot' });
  }

  if (!defaultPidExists(pid)) {
    return Object.assign(out, { reason: 'stale-pid' });
  }

  // On linux the pid alone is not enough: pids are recycled, so the recorded
  // start stamp must match too. On win32 Node exposes no process creation time,
  // so the basis is pid-existence only and `livenessBasis` says so rather than
  // passing the weaker signal off as the stronger one.
  let corroborated = false;
  if (livenessBasis === 'pid-and-procstart') {
    // A marker written without a procStart cannot be corroborated. Accept
    // pid-existence rather than reporting a live monitor dead, and say so in
    // `corroborated` - `livenessBasis` alone reads as the stronger basis here.
    if (marker.procStart !== null && marker.procStart !== undefined) {
      if (!procStartMatches(marker.procStart, readProcStart(pid))) {
        return Object.assign(out, { reason: 'stale-pid' });
      }
      corroborated = true;
    }
  }

  return Object.assign(out, { active: true, reason: 'live', corroborated });
}

/**
 * Decide whether a monitor may start here, and say why (#2769).
 *
 * @param {string} cwd  Project root.
 * @param {{force?: boolean, env?: object, platform?: string,
 *          readProcStart?: function}} [options]  `platform` and
 *   `readProcStart` are forwarded to `readPresence` (#2868).
 * @returns {{proceed: boolean, reason: string, message: string}}
 *
 * | reason                                          | proceed | action              |
 * |-------------------------------------------------|---------|---------------------|
 * | no-marker                                       | true    | write               |
 * | stale-pid, stale-boot, malformed, cwd-mismatch  | true    | overwrite           |
 * | self                                            | true    | same monitor, re-arm|
 * | live                                            | false   | refuse              |
 * | live + force                                    | true    | overwrite           |
 *
 * WHY `--force` IS A WIN32 REQUIREMENT AND NOT A CONVENIENCE. On win32 the
 * liveness basis is pid-existence only, so a RECYCLED PID reads as `live` with
 * nothing to disambiguate it. That weaker basis was acceptable when a false
 * `live` merely kept sessions quiet. Singleton refusal changes the consequence
 * of the same signal: a false `live` now blocks the monitor from starting at
 * all, on the primary development platform, with no way for the user to tell a
 * real monitor from a recycled pid. `--force` is what keeps the refusal safe to
 * add. A documented manual `rm` was rejected - it puts the remedy outside the
 * framework and degrades silently to verbose narration if the user deletes a
 * genuinely live monitor's marker. Age-bounding the refusal was rejected too:
 * it invents a threshold and silently overwrites a legitimately long-running
 * monitor past it.
 */
/**
 * Resolve the CLAUDE CODE SESSION pid — never this process's pid (#2795).
 *
 * `/overwatch` Step 1a reaches decideStart through `node -e`, where
 * `process.pid` is the node child's, fresh on every invocation and never the
 * session pid written into the marker. Comparing against it made the `self`
 * branch unreachable in production while every in-process test passed.
 *
 * `CLAUDE_PID` is the same source `peers-check.js` already uses to recognise
 * itself, so there is one notion of session identity rather than two, and it
 * survives into a subprocess by ordinary inheritance — no spec substitution
 * (whose unsubstituted placeholder would fail in this bug's own direction) and
 * no platform-specific ancestry walk (declined for `peers-check.js` on win32).
 *
 * Returns null when unset, blank, or non-numeric. Null is "not established",
 * which the caller must keep distinct from "does not match" — collapsing them
 * is the defect this replaces.
 */
function resolveSessionPid(env) {
  const raw = env && env.CLAUDE_PID;
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const n = Number(String(raw).trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

function decideStart(cwd, options) {
  const force = !!(options && options.force);
  const env = (options && options.env) || process.env;
  const presence = readPresence(cwd, undefined, {
    platform: options && options.platform,
    readProcStart: options && options.readProcStart,
  });

  if (!presence.active) {
    // Every non-live reason proceeds, and this is the property that stops one
    // crashed monitor locking out its successors forever.
    const message = presence.reason === 'no-marker'
      ? 'No overwatch marker present; writing one.'
      : `Overwriting a ${presence.reason} overwatch marker`
        + (presence.pid === null ? '.' : ` (pid ${presence.pid}).`);
    return { proceed: true, reason: presence.reason, message };
  }

  // Active, and ours. The same monitor re-arming, not a second one.
  const sessionPid = resolveSessionPid(env);
  if (sessionPid !== null && presence.pid === sessionPid) {
    return {
      proceed: true,
      reason: 'self',
      message: `The existing overwatch marker belongs to this session (pid ${presence.pid}); re-arming it.`,
    };
  }

  if (force) {
    // Claim only what the liveness basis established (#2868). A pid-existence
    // `live` is satisfied by any process holding the pid, so asserting "that
    // monitor is still running" there is a claim nothing checked - and
    // /overwatch Step 1a relays this message verbatim.
    if (presence.corroborated) {
      return {
        proceed: true,
        reason: 'live',
        message: `--force given: displacing the live overwatch marker for pid ${presence.pid}`
          + (presence.startedAt ? `, started ${presence.startedAt}.` : '.')
          + ' That monitor is still running and will not be stopped by this;'
          + ' it simply no longer owns the marker.',
      };
    }
    const why = presence.livenessBasis === 'pid-existence'
      ? 'the liveness basis is pid-existence only'
      : 'the marker carries no procStart to match against the process';
    return {
      proceed: true,
      reason: 'live',
      message: `--force given: displacing the overwatch marker for pid ${presence.pid}`
        + (presence.startedAt ? `, started ${presence.startedAt}.` : '.')
        + ` A process with pid ${presence.pid} exists, but ${why},`
        + ' so it may be a recycled pid rather than a monitor. Whatever holds that pid'
        + ' is not stopped by this; it no longer owns the marker.',
    };
  }

  // Identity could not be established, so `self` and `live` are genuinely
  // indistinguishable here (#2795). Both wrong answers are bad in different
  // ways: falling back to process.pid reproduces the original defect silently,
  // and reporting a bare `live` blames a foreign monitor that may not exist and
  // points the reader at --force, which is not the remedy for meeting your own
  // marker. So say what is actually wrong. Refusing is still the safe side —
  // the alternative starts a second monitor on a guess.
  if (sessionPid === null) {
    return {
      proceed: false,
      reason: 'self-pid-unresolved',
      message: `An overwatch marker is live in this working directory (pid ${presence.pid})`
        + (presence.startedAt ? `, started ${presence.startedAt}` : '')
        + ', but CLAUDE_PID is unset or unreadable, so this session cannot tell'
        + ' whether that marker is its own. Not starting, and not claiming the'
        + ' marker is foreign. If this session owns it, the marker is re-armed'
        + ' once CLAUDE_PID is available; --force displaces it either way.',
    };
  }

  return {
    proceed: false,
    reason: 'live',
    message: `An overwatch is already live in this working directory: pid ${presence.pid}`
      + (presence.startedAt ? `, started ${presence.startedAt}` : '')
      + `. Not starting a second one. Re-run with --force to displace it`
      + ` (on win32 the liveness basis is pid-existence only, so a recycled pid can`
      + ` read as live - --force is the remedy for that case).`,
  };
}

module.exports = {
  MARKER_FILENAME,
  LEGACY_MARKER_FILENAME,
  PRESENCE_REASONS,
  readPresence,
  decideStart,
  resolveSessionPid,
};
