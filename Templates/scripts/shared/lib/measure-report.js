// Rubrical Works (c) 2026
/**
 * @framework-script 0.103.0
 * measure-report.js
 *
 * Report generation for `/idpf-measure` (#2794). `--stop` and `--report` both
 * call this, so the two cannot drift into disagreeing about the same log.
 *
 * ## The decomposition
 *
 * The tap records one event per tool call, at PostToolUse. Writing `t_n` for
 * the timestamp of event n and `D_n` for that call's harness-reported
 * `duration_ms`:
 *
 *   t_n      = (end of tool n) + time for the tap to reach its append
 *   gap_n    = t_(n+1) - t_n
 *            = [hook completes] + [model generates] + [tool n+1 runs]
 *
 * so model generation between calls n and n+1 is `gap_n - D_(n+1) - spawn`.
 * The spawn term does NOT cancel between consecutive events: the session waits
 * for the hook process to exit before the model resumes, so each gap carries
 * exactly one spawn. That is the whole of the instrument's cost, and it lands
 * in the model-generation bucket — tool execution comes from the harness and
 * carries none of it (AC13).
 *
 * The first call's duration sits in no gap: it completed before the measured
 * window opened. Hence the accounting identity the tests pin:
 *
 *   wallClock === sum(D for calls 2..N) + modelGeneration + overhead
 *
 * ## Why not a Pre/Post pair
 *
 * Subtracting a PreToolUse timestamp from a PostToolUse one measures the
 * instrument's two spawns along with the tool, inflating tool execution time
 * 1.8x-8.3x and worst where the tool is fastest. See
 * Construction/Design-Decisions/2026-09-06-idpf-measure-posttooluse-only.md.
 */

'use strict';

/**
 * Fallback per-call spawn cost in ms, used only when the caller supplies none.
 * `--start` calibrates this on the running machine and stores it in the marker;
 * this constant exists so a report from a marker written by an older version is
 * still readable, not as a substitute for measuring.
 */
const DEFAULT_SPAWN_MS = 95;

/** Parse JSONL into records, ordered by timestamp. Malformed lines are skipped. */
function parseLog(text) {
  if (!text) return [];
  const out = [];
  for (const line of String(text).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const rec = JSON.parse(trimmed);
      if (rec && typeof rec === 'object') out.push(rec);
    } catch (_) {
      // A measured command can mutate the log it is being written into; a torn
      // or partial line is expected rather than exceptional.
    }
  }
  return out.sort((a, b) => (a.t || 0) - (b.t || 0));
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Decompose a run.
 *
 * `modelGenerationMs` is null rather than 0 when fewer than two events were
 * recorded: with no gap the figure is unmeasured, and reporting 0 would assert
 * the model spent no time thinking — a claim the log cannot support.
 */
function analyze(records, opts) {
  const o = opts || {};
  const all = Array.isArray(records) ? records : [];

  // Per-session grouping (#2798). Collection is PROJECT-scoped: the tap fires
  // for every session in the working directory, so one log holds several
  // sessions' calls. Tool execution survives that — it sums independent
  // duration_ms — but model generation is derived from inter-record GAPS, which
  // assume consecutive records belong to one serial timeline. Across an
  // interleaved log a gap can span a peer's whole tool call and can go negative
  // against the following call's duration, and nothing said so.
  //
  // Filtering FIRST is what makes this a correctness fix rather than a
  // presentational one: every figure below is then computed within one
  // session's records, and the interval between that session's consecutive
  // calls genuinely is its own generation time whatever a peer did meanwhile.
  const sessionId = typeof o.sessionId === 'string' && o.sessionId ? o.sessionId : null;
  const attributed = all.filter((r) => typeof r.session_id === 'string' && r.session_id);
  const unattributedCalls = all.length - attributed.length;

  // A log written before this change has no identifiers at all. Filtering it to
  // a session would report nothing, making an old log indistinguishable from an
  // empty run — so with nothing attributed, analyse the whole log (AC8).
  const filtering = sessionId !== null && attributed.length > 0;
  const recs = filtering ? all.filter((r) => r.session_id === sessionId) : all;

  // Other sessions present in the log, counted but never merged (AC5).
  const otherCounts = new Map();
  if (filtering) {
    for (const r of attributed) {
      if (r.session_id === sessionId) continue;
      otherCounts.set(r.session_id, (otherCounts.get(r.session_id) || 0) + 1);
    }
  }
  const otherSessions = [...otherCounts.entries()]
    .map(([id, calls]) => ({ session_id: id, calls }))
    .sort((a, b) => (a.session_id < b.session_id ? -1 : 1));
  const suppliedSpawnMs = isNum(o.spawnMs);
  const spawnMs = suppliedSpawnMs ? o.spawnMs : DEFAULT_SPAWN_MS;

  // Where the overhead figure came from (#2800 AC1). DEFAULT_SPAWN_MS stays —
  // a marker written by an older version must still render — but printing a
  // constant in the same form as a calibration is what let an observed report
  // claim 7.7s of overhead on a machine that had measured 39ms, putting model
  // generation ~4.5s out. The fallback is fine; its silence was not.
  const spawnMsSource = suppliedSpawnMs ? 'calibrated' : 'fallback';

  const calls = recs.length;
  const withDuration = recs.filter((r) => isNum(r.duration_ms));
  const toolExecutionMs = withDuration.reduce((s, r) => s + r.duration_ms, 0);
  const missingDurationCount = calls - withDuration.length;

  const wallClockMs = calls > 0 ? (recs[calls - 1].t || 0) - (recs[0].t || 0) : 0;

  // The FULL measured span, and the denominator every share divides by (#2797).
  //
  // wallClockMs runs end-of-call-1 to end-of-call-N, which is correct and is
  // what the documented identity depends on — but toolExecutionMs sums all N
  // calls, so dividing one by the other overstated every share by
  // (D1 - overhead) / wallClock. An observed run printed 118.4%.
  //
  // Records are stamped at completion, so first.t - D1 is the moment call 1
  // began: wallClock + D1 covers start-of-first to end-of-last, and
  //   sum(D 1..N) + modelGeneration + overhead === wallClock + D1
  // follows directly from the identity above. The partition is then exact.
  //
  // NULL when the first call has no duration: the span genuinely cannot be
  // derived, and treating a missing duration as zero is the silent misreport
  // the tap already refuses to make by recording null rather than defaulting.
  const firstCallDurationMs = calls > 0 && isNum(recs[0].duration_ms)
    ? recs[0].duration_ms
    : null;
  const measuredSpanMs = firstCallDurationMs === null
    ? null
    : wallClockMs + firstCallDurationMs;

  const byTool = {};
  for (const r of recs) {
    const name = r.tool_name || '(unknown)';
    const entry = (byTool[name] = byTool[name] || { calls: 0, totalMs: 0 });
    entry.calls += 1;
    if (isNum(r.duration_ms)) entry.totalMs += r.duration_ms;
  }

  const slowest = withDuration
    .slice()
    .sort((a, b) => b.duration_ms - a.duration_ms)
    .map((r) => ({ tool_name: r.tool_name || '(unknown)', duration_ms: r.duration_ms }));

  let modelGenerationRawMs = null;
  let overheadMs = 0;
  let modelGenerationMs = null;

  if (calls >= 2) {
    let raw = 0;
    for (let i = 0; i < calls - 1; i += 1) {
      const gap = (recs[i + 1].t || 0) - (recs[i].t || 0);
      const next = isNum(recs[i + 1].duration_ms) ? recs[i + 1].duration_ms : 0;
      raw += gap - next;
    }
    modelGenerationRawMs = raw;
    overheadMs = (calls - 1) * spawnMs;
    modelGenerationMs = raw - overheadMs;
  }

  // Unconditional (#2800 AC3): the interval the records actually span, and when
  // the report was produced. Both are derivable with no new instrumentation, and
  // both are recorded on a healthy run too — a field that appears only when
  // something is wrong cannot be used to show that nothing is.
  const recordsSpan = calls > 0
    ? { from: recs[0].t || null, to: recs[calls - 1].t || null }
    : { from: null, to: null };
  const reportedAt = isNum(o.now) ? o.now : Date.now();

  // Coverage (#2800 AC4). The ABSENCE OF A MARKER at report time is sufficient
  // on its own, and is the primary signal. No timestamp threshold: a report
  // legitimately runs some time after the last tool call, so any bare timeout
  // would be invented rather than derived, and the marker's absence is a fact
  // the report already holds. Three states, not two — a caller that did not say
  // leaves this `unknown`, because claiming truncation would be exactly as
  // wrong as claiming health.
  let coverage;
  if (o.markerPresent === false) {
    coverage = { qualified: true, reason: 'marker-absent' };
  } else if (o.markerPresent === true) {
    coverage = { qualified: false, reason: 'marker-present' };
  } else {
    coverage = { qualified: false, reason: 'unknown' };
  }

  return {
    calls,
    wallClockMs,
    measuredSpanMs,
    firstCallDurationMs,
    recordsSpan,
    reportedAt,
    coverage,
    spawnMsSource,
    sessionId,
    otherSessions,
    // Counted across the WHOLE log, not the filtered group: these records
    // belong to no session, so they are excluded from every figure above and
    // reported separately rather than folded into whoever read the log (AC6).
    unattributedCalls: filtering ? unattributedCalls : 0,
    toolExecutionMs,
    modelGenerationRawMs,
    modelGenerationMs,
    overheadMs,
    spawnMs,
    missingDurationCount,
    byTool,
    slowest,
  };
}

function ms(v) {
  if (!isNum(v)) return 'n/a';
  return v >= 1000 ? (v / 1000).toFixed(1) + 's' : v + 'ms';
}

function plural(n, word) {
  return n + ' ' + word + (n === 1 ? '' : 's');
}

function pct(part, whole) {
  if (!isNum(part) || !isNum(whole) || whole <= 0) return '';
  return ' (' + ((part / whole) * 100).toFixed(1) + '%)';
}

/** Render an analysis. Every absent figure says why rather than printing a zero. */
function formatReport(a) {
  if (!a || a.calls === 0) {
    return [
      'idpf-measure report',
      '',
      'No events were collected. Either nothing ran between --start and now, or',
      'the tap was never wired — check that --start reported success.',
    ].join('\n');
  }

  const lines = [];
  lines.push('idpf-measure report');
  lines.push('');
  // Headline and denominator describe the SAME span, and the line says which
  // (#2797 AC2). Reporting a duration the shares are not computed against is
  // how the two drifted apart in the first place.
  const span = a.measuredSpanMs;
  if (span === null) {
    lines.push(`  ${plural(a.calls, 'call')}; measured span unavailable`);
  } else {
    lines.push(`  ${plural(a.calls, 'call')} over ${ms(span)} measured span (first call start → last call end)`);
  }
  lines.push('');
  lines.push(`  tool execution      ${ms(a.toolExecutionMs)}${pct(a.toolExecutionMs, span)}`);

  if (a.modelGenerationMs === null) {
    lines.push('  model generation    not measurable — requires at least 2 recorded calls');
  } else {
    lines.push(`  model generation    ${ms(a.modelGenerationMs)}${pct(a.modelGenerationMs, span)}`);
  }

  // Overhead is the third component of the partition, so it is reported as a
  // share rather than left for the reader to infer from the other two (AC1).
  // It stays OUT of the tool-execution figure: the spawn cost lands in model
  // generation, and tool execution comes from the harness carrying none of it
  // (#2794 AC13). AC3 forbids putting the two on a common footing.
  lines.push(`  instrument overhead ${ms(a.overheadMs)}${pct(a.overheadMs, span)}`);

  if (span === null) {
    lines.push('');
    lines.push('  Shares are withheld: the first call has no recorded duration, so the');
    lines.push('  measured span cannot be derived. The totals above stand; only their');
    lines.push('  proportions are unknown. Assuming a zero duration would compute shares');
    lines.push('  against a span shorter than the run, overstating every one of them.');
  }

  lines.push('');
  lines.push('  Per tool:');
  const names = Object.keys(a.byTool).sort((x, y) => a.byTool[y].totalMs - a.byTool[x].totalMs);
  for (const n of names) {
    const e = a.byTool[n];
    lines.push(`    ${n.padEnd(14)} ${plural(e.calls, 'call').padStart(9)}   ${ms(e.totalMs)}`);
  }

  if (a.slowest.length) {
    lines.push('');
    lines.push('  Slowest calls:');
    for (const s of a.slowest.slice(0, 5)) {
      lines.push(`    ${s.tool_name.padEnd(14)} ${ms(s.duration_ms)}`);
    }
  }

  lines.push('');
  lines.push('  Instrument overhead:');
  lines.push(`    ${ms(a.overheadMs)} — ${plural(a.calls - 1, 'inter-call gap')} x ${ms(a.spawnMs)} per hook spawn.`);
  lines.push('    Charged entirely to model generation, which is reported net of it.');
  lines.push('    Tool execution is the harness\'s own duration_ms and carries no');
  lines.push('    instrument cost at all.');

  // #2800 AC2. Only when there IS something to disclose — a healthy run keeps
  // the block above byte-identical (AC6).
  if (a.spawnMsSource === 'fallback') {
    lines.push(`    The ${ms(a.spawnMs)} is a FALLBACK constant, not this machine's calibration:`);
    lines.push('    no spawn cost was available from the marker. Overhead above, and the');
    lines.push('    model-generation figure it is subtracted from, are therefore');
    lines.push('    approximate. Re-run --start to calibrate.');
  }

  // #2798 AC5/AC6: a filtered report must not read like one where no peer was
  // present, and unattributed records must be visible rather than absorbed.
  if ((a.otherSessions && a.otherSessions.length) || a.unattributedCalls > 0) {
    lines.push('');
    lines.push('  Session scope:');
    lines.push('    Collection is project-wide; these figures are this session\'s calls only.');
    for (const s of a.otherSessions || []) {
      lines.push(`    ${plural(s.calls, 'call')} from another session (${s.session_id}) excluded.`);
    }
    if (a.unattributedCalls > 0) {
      lines.push(`    ${plural(a.unattributedCalls, 'call')} unattributed (no session id, logged`);
      lines.push('    before session attribution existed) and excluded rather than assumed');
      lines.push('    to be this session\'s.');
    }
  }

  if (a.coverage && a.coverage.qualified) {
    lines.push('');
    lines.push('  Coverage:');
    lines.push('    No collection marker was present when this report was produced, so');
    lines.push('    collection had already stopped. These figures cover only the period');
    lines.push('    up to the last recorded call and may omit later activity — the run');
    lines.push('    itself may have continued well past it.');
  }

  if (a.missingDurationCount > 0) {
    lines.push('');
    lines.push(`  ${plural(a.missingDurationCount, 'call')} reported no duration and are excluded from the`);
    lines.push('  tool-execution total, which is therefore partial. A missing duration is');
    lines.push('  the harness declining to report, not a 0ms call.');
  }

  return lines.join('\n');
}

module.exports = {
  parseLog,
  analyze,
  formatReport,
  DEFAULT_SPAWN_MS,
};
