// Rubrical Works (c) 2026
/**
 * @framework-script 0.102.0
 * measure-marker.js
 *
 * Collection-marker lifecycle for `/idpf-measure` (#2794).
 *
 * `.idpf-measure.json` is what says collection is armed. The tap consults it
 * before appending, `--report` reads the calibrated spawn cost out of it, and
 * `--stop` removes it.
 *
 * ## Liveness is borrowed, never re-derived
 *
 * Staleness is decided by `hall-monitor-presence.js` `readPresence`, which
 * already carries two rules that are easy to get subtly wrong: start stamps are
 * boot-relative, so a marker surviving a reboot can collide with a live value;
 * and win32 exposes no process creation time, so its `livenessBasis` is
 * pid-existence only and says so rather than passing the weaker signal off as
 * the stronger. Re-implementing either here would give one project two answers
 * to the same question, which is what AC8 forbids.
 *
 * What a marker MEANS still belongs here. `readPresence` reports whether the
 * writing process is alive; whether an armed-but-dead collection should be
 * cleared is this module's decision.
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { readPresence, resolveSessionPid } = require('./hall-monitor-presence.js');

/** Must match the .gitignore entry, or --start litters every git status. */
const MARKER_FILENAME = '.idpf-measure.json';

/**
 * Per-sample ceiling for the calibration spawn (#2469 spawn-timeout contract).
 * Generous against the 58-107ms a bare `node -e 0` actually takes, because the
 * bound exists to stop `--start` hanging forever on a wedged spawn, not to
 * discipline a slow machine — a sample cut short still counts toward the
 * average rather than being dropped.
 */
const CALIBRATION_TIMEOUT_MS = 5000;

function markerPath(root) {
  return path.join(root || process.cwd(), MARKER_FILENAME);
}

/**
 * Measure this machine's per-spawn hook cost.
 *
 * Calibrated rather than assumed: the figure is subtracted from model
 * generation time in every report, and it varies with machine, cache warmth and
 * platform — measured 58-107ms on the authoring machine alone. A hardcoded
 * constant would silently misreport the instrument's own contribution, which is
 * the error `/idpf-measure` exists to stop making.
 */
function calibrateSpawnMs(samples) {
  const n = Number.isInteger(samples) && samples > 0 ? samples : 5;
  const started = Date.now();
  for (let i = 0; i < n; i += 1) {
    try {
      execFileSync(process.execPath, ['-e', '0'], { stdio: 'ignore', timeout: CALIBRATION_TIMEOUT_MS });
    } catch (_) {
      // A failed or timed-out spawn still consumed time; keep it in the average
      // rather than dropping the sample and reporting a cost lower than reality.
    }
  }
  return Math.max(1, Math.round((Date.now() - started) / n));
}

/**
 * Arm collection. Writes the fields `readPresence` needs plus the calibrated
 * spawn cost, and returns the marker written.
 *
 * A second write replaces the first, which is what keeps `--start` idempotent.
 */
function writeMarker(root, opts) {
  const o = opts || {};
  // The ARMING SESSION's pid, never this process's (#2796). `--start` runs as
  // `node .../idpf-measure.js --start`, a CLI process that exits the moment it
  // returns, so recording process.pid guaranteed a dead pid: on win32, where
  // livenessBasis is pid-existence, the very next --report reported stale-pid on
  // a healthy collection, and removeMarker's foreign-live guard — which tests
  // presence.active — could never fire. A concurrent session's --stop then
  // deleted a live collection, observed here on 2026-09-06 with data loss.
  //
  // Identity comes from the SAME resolver /hall-monitor uses (#2795) rather than
  // a second copy: this module already borrows liveness from that file by #2794
  // AC8, and one question deserves one answer.
  const sessionPid = resolveSessionPid(o.env || process.env);
  const marker = {
    // null, never process.pid — the fallback that reproduces this defect.
    pid: sessionPid,
    pidSource: sessionPid === null ? 'unavailable' : 'session',
    cwd: path.resolve(root || process.cwd()),
    startedAt: new Date().toISOString(),
    spawnMs: typeof o.spawnMs === 'number' ? o.spawnMs : calibrateSpawnMs(),
    version: 1,
  };
  fs.writeFileSync(markerPath(root), JSON.stringify(marker, null, 2) + '\n');
  return marker;
}

/**
 * Report the marker's state.
 *
 * Returns everything `readPresence` reports — `active`, `reason`,
 * `livenessBasis` — plus `spawnMs` read back from the file. A stale marker is
 * reported stale rather than as absent: absence means nothing was armed, while
 * stale means collection was armed and the session died, so the wiring is
 * probably still in place and `--stop` still has work to do.
 */
function readMarker(root) {
  const presence = readPresence(root, MARKER_FILENAME);

  let spawnMs = null;
  let pidSource = null;
  try {
    const raw = JSON.parse(fs.readFileSync(markerPath(root), 'utf8'));
    if (raw && typeof raw.spawnMs === 'number') spawnMs = raw.spawnMs;
    if (raw && typeof raw.pidSource === 'string') pidSource = raw.pidSource;
  } catch (_) {
    // No marker, or unreadable — presence already says which.
  }

  // A marker written without a resolvable session identity gets its OWN reason
  // (#2796 AC5). readPresence sees `pid: null` and reports `malformed`, which
  // claims a truncated write; `stale-pid` would claim a session died. Both are
  // false and both send the reader somewhere useless. The marker is intact —
  // only its identity is missing — so say that and nothing more.
  if (pidSource === 'unavailable') {
    return Object.assign({}, presence, {
      active: false,
      reason: 'identity-unavailable',
      spawnMs,
      pidSource,
    });
  }

  return Object.assign({}, presence, { spawnMs, pidSource });
}

/**
 * Disarm. Removes the marker unless it belongs to a live foreign process.
 *
 * The ownership test follows /hall-monitor's precedent: without it, this
 * session's `--stop` would delete a marker a concurrent session had just
 * written, leaving that session collecting with nothing left to stop it. A
 * STALE foreign marker is removed without `--force` — its owner is gone, and
 * refusing there would strand collection armed forever, the case AC8 exists
 * for.
 */
function removeMarker(root, opts) {
  const o = opts || {};
  const force = Boolean(o.force);
  const presence = readMarker(root);

  if (presence.reason === 'no-marker') {
    return { removed: false, reason: 'no-marker' };
  }

  // Compare against the SESSION pid, matching what writeMarker recorded (#2796).
  // Comparing against process.pid here would invert the guard once the marker
  // holds a session pid: every marker would look foreign and a session could no
  // longer disarm the collection it started.
  const sessionPid = resolveSessionPid(o.env || process.env);
  const foreignAndLive = presence.active && presence.pid !== sessionPid;
  if (foreignAndLive && !force) {
    return { removed: false, reason: 'foreign', pid: presence.pid };
  }

  try {
    fs.unlinkSync(markerPath(root));
    return { removed: true, reason: presence.reason };
  } catch (_) {
    return { removed: false, reason: 'unreadable' };
  }
}

module.exports = {
  MARKER_FILENAME,
  markerPath,
  writeMarker,
  readMarker,
  removeMarker,
  calibrateSpawnMs,
};
