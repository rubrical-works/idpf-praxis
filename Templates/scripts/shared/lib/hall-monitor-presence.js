// Rubrical Works (c) 2026
/**
 * @framework-script 0.102.0
 *
 * `/hall-monitor` presence marker (#2769).
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
 * value is wrong - re-invoking `/hall-monitor` in the session that wrote the
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
const MARKER_FILENAME = '.hall-monitor.json';

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
 * @param {string} [markerFilename]  Marker to read. Defaults to the
 *   hall-monitor's own, so existing callers are unaffected.
 * @returns {{active: boolean, reason: string, pid: number|null,
 *            livenessBasis: string, startedAt: string|null}}
 *   `active` is true ONLY for `live`. A stale marker is reported inactive AND
 *   named as stale, so a crashed monitor is visible rather than merely absent.
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
function readPresence(cwd, markerFilename) {
  const livenessBasis = livenessBasisFor(process.platform);
  const base = { active: false, reason: 'no-marker', pid: null, livenessBasis, startedAt: null };

  const root = typeof cwd === 'string' && cwd ? cwd : process.cwd();
  const filename = typeof markerFilename === 'string' && markerFilename
    ? markerFilename
    : MARKER_FILENAME;
  const markerPath = path.join(root, filename);

  let raw;
  try {
    raw = fs.readFileSync(markerPath, 'utf8');
  } catch {
    return base;
  }

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
  if (livenessBasis === 'pid-and-procstart') {
    const actual = defaultReadProcStartLinux(pid);
    // A marker written without a procStart cannot be corroborated. Accept
    // pid-existence and let `livenessBasis` carry the caveat, rather than
    // reporting a live monitor dead.
    if (marker.procStart !== null && marker.procStart !== undefined
        && !procStartMatches(marker.procStart, actual)) {
      return Object.assign(out, { reason: 'stale-pid' });
    }
  }

  return Object.assign(out, { active: true, reason: 'live' });
}

/**
 * Decide whether a monitor may start here, and say why (#2769).
 *
 * @param {string} cwd  Project root.
 * @param {{force?: boolean}} [options]
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
 * `/hall-monitor` Step 1a reaches decideStart through `node -e`, where
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
  const presence = readPresence(cwd);

  if (!presence.active) {
    // Every non-live reason proceeds, and this is the property that stops one
    // crashed monitor locking out its successors forever.
    const message = presence.reason === 'no-marker'
      ? 'No hall-monitor marker present; writing one.'
      : `Overwriting a ${presence.reason} hall-monitor marker`
        + (presence.pid === null ? '.' : ` (pid ${presence.pid}).`);
    return { proceed: true, reason: presence.reason, message };
  }

  // Active, and ours. The same monitor re-arming, not a second one.
  const sessionPid = resolveSessionPid(env);
  if (sessionPid !== null && presence.pid === sessionPid) {
    return {
      proceed: true,
      reason: 'self',
      message: `The existing hall-monitor marker belongs to this session (pid ${presence.pid}); re-arming it.`,
    };
  }

  if (force) {
    return {
      proceed: true,
      reason: 'live',
      message: `--force given: displacing the live hall-monitor marker for pid ${presence.pid}`
        + (presence.startedAt ? `, started ${presence.startedAt}.` : '.')
        + ' That monitor is still running and will not be stopped by this;'
        + ' it simply no longer owns the marker.',
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
      message: `A hall-monitor marker is live in this working directory (pid ${presence.pid})`
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
    message: `A hall-monitor is already live in this working directory: pid ${presence.pid}`
      + (presence.startedAt ? `, started ${presence.startedAt}` : '')
      + `. Not starting a second one. Re-run with --force to displace it`
      + ` (on win32 the liveness basis is pid-existence only, so a recycled pid can`
      + ` read as live - --force is the remedy for that case).`,
  };
}

module.exports = {
  MARKER_FILENAME,
  PRESENCE_REASONS,
  readPresence,
  decideStart,
  resolveSessionPid,
};
