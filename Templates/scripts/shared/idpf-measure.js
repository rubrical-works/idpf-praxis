#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.116.0
 * idpf-measure.js
 *
 * CLI for `/idpf-measure` (#2794). Binds the three helpers together:
 *   measure-marker.js   arms/disarms collection and judges staleness
 *   measure-wiring.js   registers and removes the PostToolUse tap
 *   lib/measure-report.js  decomposes the log
 *
 * Modes are mutually exclusive and each returns a JSON envelope:
 *   --start   calibrate, reset the log, write the marker, wire the tap
 *   --stop    disarm, unwire, print the report
 *   --report  print the report, mutating NOTHING, so a long --nonstop run can
 *             be inspected mid-flight
 *
 * `--report` mutating nothing is a contract, not an implementation detail: it
 * calls no marker writer and no wiring function at all, which is what makes
 * mid-flight inspection safe to run at any point in a measured run.
 */

'use strict';

const fs = require('fs');

const marker = require('./lib/measure-marker.js');
const wiring = require('./lib/measure-wiring.js');
const { parseLog, analyze, formatReport } = require('./lib/measure-report.js');
const tap = require('../../hooks/measure-tap.js');

const MODES = ['--start', '--stop', '--report', '--reset', '--schema'];

const SCHEMA = {
  ok: 'boolean',
  mode: 'start | stop | report | reset | schema',
  discarded: 'object — {calls, spanMs} cleared by --reset',
  report: 'string — rendered report (stop, report)',
  analysis: 'object — raw figures behind the report (stop, report)',
  marker: 'object — marker state as read (start, stop, report)',
  wiring: 'object — what changed on disk (start, stop)',
  errors: '[{code, message}]',
  warnings: '[string]',
};

function envelope(mode, extra) {
  return Object.assign({ ok: true, version: 1, mode, errors: [], warnings: [] }, extra);
}

function fail(code, message) {
  return { ok: false, version: 1, errors: [{ code, message }], warnings: [] };
}

function logPath(root) {
  return tap.logPathFor(root);
}

function readAnalysis(root, spawnMs, markerPresent, sessionId) {
  let raw = '';
  try {
    raw = fs.readFileSync(logPath(root), 'utf8');
  } catch (_) {
    raw = '';
  }
  return analyze(parseLog(raw), { spawnMs, markerPresent, sessionId });
}

function run(argv, opts) {
  const o = opts || {};
  const root = o.root || process.cwd();
  // Session identity, threaded to every marker call so the arming session — not
  // this CLI process — owns the marker (#2796). Injectable so tests can exercise
  // the absent case without mutating the real environment.
  const env = o.env || process.env;
  // The ACTIVE session, for filtering the report (#2798). Distinct from the
  // marker's CLAUDE_PID identity above: that says who armed collection, this
  // says whose calls to report. Collection is project-wide, so one log holds
  // every session's calls, and gap-derived model generation is only meaningful
  // within one session's records.
  const sessionId = typeof env.CLAUDE_CODE_SESSION_ID === 'string' && env.CLAUDE_CODE_SESSION_ID
    ? env.CLAUDE_CODE_SESSION_ID
    : null;
  const args = Array.isArray(argv) ? argv : [];

  const modes = args.filter((a) => MODES.includes(a));
  // Unrecognized flags are reported, never silently dropped — the pass-through
  // convention in 02-github-workflow.md, applied at the script layer.
  const unknown = args.filter((a) => a.startsWith('--') && !MODES.includes(a));

  if (modes.length === 0) {
    // Built from MODES (#3415): a hand-written list omitted --reset.
    return fail('NO_MODE', `One of ${MODES.slice(0, -1).join(', ')} or ${MODES[MODES.length - 1]} is required.`);
  }
  if (modes.length > 1) {
    return fail('MULTIPLE_MODES', `Exactly one mode may be given; received ${modes.join(', ')}.`);
  }

  const mode = modes[0].replace(/^--/, '');
  const warnings = unknown.map((f) => `Unrecognized flag ignored: ${f}`);

  if (mode === 'schema') {
    return envelope('schema', { schema: SCHEMA, warnings });
  }

  if (mode === 'start') {
    const spawnMs = typeof o.spawnMs === 'number' ? o.spawnMs : marker.calibrateSpawnMs();

    // Refuse before resetting (#3295): a refused --start must leave the
    // previous run's retained log, which a post-hoc --report still reads.
    if (!wiring.settingsParseable(root)) {
      return fail('SETTINGS_UNPARSEABLE', wiring.UNPARSEABLE_MESSAGE);
    }

    // Refuse on a live foreign marker before the unlink (#3393), matching the
    // --reset and --stop guards: the log is shared, so resetting it and
    // overwriting the marker would discard another session's collection.
    const existing = marker.readMarker(root);
    const sessionPid = Number(env.CLAUDE_PID) || null;
    if (existing.active && existing.pid !== sessionPid) {
      return fail(
        'FOREIGN_MARKER',
        `A live collection marker in this working directory belongs to pid ${existing.pid}. `
        + 'The event log is shared, so arming here would discard that session\'s '
        + 'collected events. Nothing was changed.'
      );
    }

    // Reset first. The log is transient by decision: a run must not inherit the
    // previous one's events, which would corrupt every figure in the report.
    try {
      fs.unlinkSync(logPath(root));
    } catch (_) {
      // Nothing to reset.
    }

    if (existing.reason === 'stale-pid' || existing.reason === 'stale-boot') {
      warnings.push(
        `A stale marker from pid ${existing.pid} was replaced (${existing.reason}). `
        + 'A previous session ended without --stop.'
      );
    } else if (existing.reason === 'identity-unavailable') {
      // readMarker reports this marker inactive, so the FOREIGN_MARKER guard
      // passes it (#3415); warn as --stop does rather than replace it silently.
      warnings.push(
        'The previous marker carries no session identity (CLAUDE_PID was unavailable when '
        + 'collection was armed), so it could not be shown not to belong to another live '
        + 'session. Re-arming; if a concurrent session armed it, its collected events have '
        + 'been discarded.'
      );
    }

    let w;
    try {
      w = wiring.wire(root);
    } catch (e) {
      // An unparseable settings.local.json is refused, not overwritten (#3059);
      // anything else (an I/O error) is not a parse problem and says so (#3295).
      const r = fail(e.code === 'SETTINGS_UNPARSEABLE' ? 'SETTINGS_UNPARSEABLE' : 'SETTINGS_WRITE_FAILED', e.message);
      r.warnings = warnings; // the log is already reset; keep what was said about it
      return r;
    }
    const backup = { created: w.created, previousRaw: w.previousRaw, wiredRaw: w.wiredRaw };
    // Held so a failed write can put the previous marker back: it may carry an
    // earlier --start's settings backup, which --stop needs for an already-wired tap.
    let previousMarker = null;
    try {
      previousMarker = fs.readFileSync(marker.markerPath(root), 'utf8');
    } catch (_) {
      // No previous marker.
    }
    let stored;
    try {
      const m = marker.writeMarker(root, { spawnMs, env });
      // The wiring backup rides in the marker so --stop can restore verbatim
      // rather than re-serializing, which is byte-for-byte only by luck.
      stored = Object.assign({}, m, { settings: backup });
      fs.writeFileSync(marker.markerPath(root), JSON.stringify(stored, null, 2) + '\n');
    } catch (e) {
      // A tap left wired with no marker has no backup for --stop to restore
      // (#3415), so undo the wiring this --start added and say how it went. A
      // tap that was already wired is not ours to remove.
      const restored = w.alreadyWired ? { restored: 'left-wired' } : wiring.unwire(root, backup);
      // Put the marker back as it was, never just delete it: deleting would drop
      // a previous marker's settings backup along with any partial write.
      let markerState = previousMarker === null ? 'absent' : 'restored';
      try {
        if (previousMarker === null) fs.unlinkSync(marker.markerPath(root));
        else fs.writeFileSync(marker.markerPath(root), previousMarker);
      } catch (err) {
        if (previousMarker !== null || err.code !== 'ENOENT') markerState = 'unknown';
      }
      const r = fail(
        'MARKER_WRITE_FAILED',
        `The collection marker could not be written (${e.message}), so collection was not armed. `
        + `Settings: ${restored.restored}${restored.reason ? ` (${restored.reason})` : ''}. `
        + `Previous marker: ${markerState}.`
      );
      r.wiring = { restored: restored.restored, ...(restored.reason ? { reason: restored.reason } : {}) };
      r.marker = { previous: markerState };
      // The log is already reset, so the warnings raised before the failure
      // still describe what happened (fail() starts them empty).
      r.warnings = warnings;
      return r;
    }

    if (w.alreadyWired) warnings.push('The tap was already wired; --start left it as it was.');

    return envelope('start', {
      marker: stored,
      wiring: { created: w.created, alreadyWired: w.alreadyWired, matcher: wiring.TAP_MATCHER },
      warnings,
    });
  }

  // --reset: clear the log, stay armed (#2799).
  //
  // Narrower than the name suggests, deliberately. "Clear everything" already
  // exists — --start unlinks the log on every arm — so a --reset that also
  // disarmed would be a second spelling of --start. What no combination
  // provided is clearing the log WITHOUT disarming: after arming you inspect a
  // file or fix a typo, and those setup calls are now in the measured run.
  //
  // The alternative was --stop then --start, which recalibrates (putting
  // figures either side on different bases), rewrites the git-tracked settings
  // file twice, and briefly disarms in a directory where peers may be
  // collecting. None of that is wanted for a log truncation.
  if (mode === 'reset') {
    const m = marker.readMarker(root);

    // Refuse on a live foreign marker, matching --stop's guard rather than
    // inventing a second convention for the same situation. The log is shared
    // across every session here, so truncating it discards a concurrent
    // session's events — the analogue of the stranding --stop already prevents.
    // Reachable only because #2796 made the marker carry the SESSION pid.
    const sessionPid = Number(env.CLAUDE_PID) || null;
    if (m.active && m.pid !== sessionPid) {
      return fail(
        'FOREIGN_MARKER',
        `A live collection marker in this working directory belongs to pid ${m.pid}. `
        + 'The event log is shared, so clearing it would discard that session\'s '
        + 'collected events. Nothing was cleared.'
      );
    }

    if (m.reason === 'no-marker') {
      warnings.push('Collection is not armed. Clearing any log left by a previous run.');
    }

    // Count what is being discarded BEFORE truncating. A silent reset is
    // indistinguishable from a run that collected nothing.
    const before = readAnalysis(root, undefined, undefined, sessionId);
    const discarded = {
      calls: before.calls,
      spanMs: before.recordsSpan.from !== null && before.recordsSpan.to !== null
        ? before.recordsSpan.to - before.recordsSpan.from
        : null,
    };

    try {
      fs.unlinkSync(logPath(root));
    } catch (_) {
      // No log — indistinguishable in effect from a successful reset, so not
      // an error. Reported below as nothing to clear.
    }

    const report = discarded.calls === 0
      ? 'idpf-measure: nothing to clear — no events had been collected.'
      : `idpf-measure: cleared ${discarded.calls} calls`
        + (discarded.spanMs !== null ? ` spanning ${discarded.spanMs}ms` : '')
        + '. Collection remains armed; the calibrated spawn cost is unchanged.';

    // No wiring call and no marker write: --reset touches neither the settings
    // file nor the marker, which is what separates it from --start/--stop.
    return envelope('reset', { marker: m, discarded, report, warnings });
  }

  if (mode === 'report') {
    const m = marker.readMarker(root);
    if (m.reason === 'no-marker') {
      warnings.push('Collection is not armed. Reporting on the log left by the last --start.');
    } else if (m.reason === 'identity-unavailable') {
      // NOT "a session ended" (#2796): nothing ended. The marker is intact and
      // collection may well be live — the arming session's identity simply was
      // not resolvable, so liveness cannot be judged either way.
      warnings.push(
        'The marker carries no session identity (CLAUDE_PID was unavailable when '
        + 'collection was armed), so whether the arming session is still running '
        + 'cannot be determined. This is not a staleness verdict.'
      );
    } else if (!m.active) {
      warnings.push(`The marker is ${m.reason} — a session ended without --stop.`);
    }
    const spawnMs = typeof m.spawnMs === 'number' ? m.spawnMs : undefined;
    // The marker's absence qualifies the report's COVERAGE, not just the
    // disarm state (#2800 AC4, AC7). Without this the report renders
    // identically whether collection ran throughout or died partway.
    const analysis = readAnalysis(root, spawnMs, m.reason !== 'no-marker', sessionId);
    // No marker write, no wiring call: --report mutates nothing (AC6).
    return envelope('report', { marker: m, analysis, report: formatReport(analysis), warnings });
  }

  // --stop
  const m = marker.readMarker(root);

  // Refuse on a live foreign marker before anything is unwired (#3378) — the
  // --reset guard above, for the same reason. Unwiring first removed the other
  // session's tap and stopped its collection, while the removeMarker warning
  // below said its marker had been left in place.
  const stopperPid = Number(env.CLAUDE_PID) || null;
  if (m.active && m.pid !== stopperPid) {
    return fail(
      'FOREIGN_MARKER',
      `A live collection marker in this working directory belongs to pid ${m.pid}. `
      + 'Disarming would remove that session\'s measurement tap and stop its collection. '
      + 'Nothing was changed.'
    );
  }

  if (m.reason === 'no-marker') {
    warnings.push('Collection was not armed — no marker found. Nothing to disarm.');
  } else if (m.reason === 'identity-unavailable') {
    // Same distinction as --report (#2796), and it matters more here: this path
    // DELETES. Saying "a session ended" would assert the thing that justifies
    // the deletion, when in fact liveness was never established.
    warnings.push(
      'The marker carries no session identity (CLAUDE_PID was unavailable when '
      + 'collection was armed), so it could not be shown to belong to another '
      + 'live session. Disarming; if a concurrent session armed this, its '
      + 'collection has now stopped.'
    );
  } else if (!m.active) {
    warnings.push(`The marker was ${m.reason} — a session ended without --stop. Cleaning up.`);
  }

  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(marker.markerPath(root), 'utf8')) || {};
  } catch (_) {
    stored = {};
  }

  const analysis = readAnalysis(
    root,
    typeof m.spawnMs === 'number' ? m.spawnMs : undefined,
    m.reason !== 'no-marker',
    sessionId
  );
  const restored = wiring.unwire(root, stored.settings || {});
  const removal = marker.removeMarker(root, { env });

  if (!removal.removed && removal.reason === 'foreign') {
    warnings.push(
      `A live marker belonging to pid ${removal.pid} was left in place; another session is measuring here.`
    );
  }

  // A failed write was silent (#3378): the envelope said `failed` and the run
  // read as a clean disarm, with the tap possibly still in the file.
  if (restored.restored === 'failed') {
    warnings.push(
      `${wiring.SETTINGS_RELPATH} could not be written, so the measurement tap could not be removed. `
      + 'Check the file\'s permissions, then remove the tap entry by hand or re-run --stop.'
    );
  }

  if (restored.restored === 'refused-unparseable') {
    warnings.push(
      `${wiring.SETTINGS_RELPATH} is not a valid JSON object, so --stop left it as it was rather than `
      + 'overwrite it (#3295). If the measurement tap is still in it, remove that entry by hand '
      + 'once the file is fixed.'
    );
  }

  // The disarm must not read as a clean restore when it was not one (#2807).
  // `surgical` means the file was rewritten without the tap rather than written
  // back from a backup. Saying nothing here is how the old defect stayed
  // invisible: it reported `restored: "verbatim"` against a baseline that
  // already contained the tap. The cause is unwire's own `reason` (#3295) —
  // since #3059 a file changed during the window goes surgical too, and the
  // already-wired wording was false for it.
  if (restored.restored === 'surgical') {
    const why = restored.reason === 'changed-during-window'
      ? `${wiring.SETTINGS_RELPATH} changed during the measurement window (something was saved into it), `
        + 'so restoring the --start snapshot would have discarded that change.'
      : 'this --start found it already wired and held no pre-tap baseline.';
    warnings.push(
      `The tap was removed surgically, not restored from a backup: ${why} Entries belonging to the tap were removed `
      + 'and co-tenant hooks left in place, so the result is correct but is not a byte-for-byte '
      + 'restore — unrelated formatting in the settings file may be normalized.'
    );
  }

  // The log is deliberately NOT removed: it is retained after --stop so a
  // post-hoc --report still works, until the next --start resets it.
  return envelope('stop', {
    marker: m,
    wiring: { restored: restored.restored, ...(restored.reason ? { reason: restored.reason } : {}) },
    analysis,
    report: formatReport(analysis),
    warnings,
  });
}

if (require.main === module) {
  const result = run(process.argv.slice(2), {});
  if (result.report) {
    process.stdout.write(result.report + '\n');
    delete result.report;
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.ok ? 0 : 1);
}

module.exports = { run, SCHEMA, MODES };
