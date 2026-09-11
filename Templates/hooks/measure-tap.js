#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.102.0
 * measure-tap.js
 *
 * PostToolUse hook for `/idpf-measure` (#2794). Appends one JSONL record per
 * matched tool call so `--report` can decompose a command run into tool
 * execution time and model generation time.
 *
 * PostToolUse only, deliberately. The originally-specified
 * PreToolUse/PostToolUse pair subtracted its own two process spawns into the
 * figure it was reporting, inflating tool execution time 1.8x-8.3x and worst
 * where the tool is fastest. PostToolUse carries the harness's own
 * `duration_ms`, so tool time is read rather than inferred and one spawn
 * replaces two. See Construction/Design-Decisions/
 * 2026-09-06-idpf-measure-posttooluse-only.md.
 *
 * This runs on every matched call, so its cost is charged to the run it is
 * measuring. It does no work beyond building one record and appending it: no
 * requires beyond Node built-ins, no parsing of tool_input or tool_response,
 * no validation that could throw.
 *
 * Paths resolve from __dirname, never process.cwd() (#2626) — a hook invoked
 * with a different working directory must still find its own project root.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/** Repo root: this file lives at <root>/.claude/hooks/measure-tap.js */
const DEFAULT_ROOT = path.resolve(__dirname, '..', '..');

const LOG_BASENAME = '.idpf-measure.jsonl';
const MARKER_BASENAME = '.idpf-measure.json';

function logPathFor(root) {
  return path.join(root || DEFAULT_ROOT, LOG_BASENAME);
}

function markerPathFor(root) {
  return path.join(root || DEFAULT_ROOT, MARKER_BASENAME);
}

/**
 * Build the record appended for one tool call.
 *
 * `duration_ms` is kept `null` when the harness did not report a number rather
 * than defaulted to 0: a vanished field would otherwise read as a run of
 * instantaneous calls, which is indistinguishable from a genuinely fast one.
 * `tool_input` and `tool_response` are deliberately never recorded — the log is
 * a timing artifact, not a transcript.
 */
/**
 * Which SESSION produced this call (#2798).
 *
 * Collection is project-scoped — the tap is wired through
 * .claude/settings.local.json and fires for every session in the working
 * directory — so without this every session's calls landed in one log and the
 * report treated them as one serial timeline. Tool execution survives that;
 * model generation does not, being derived from inter-record gaps that assume
 * consecutive records belong to one session.
 *
 * Both sources were confirmed by dumping a live PostToolUse invocation (AC1),
 * not from documentation: the payload carries `session_id`, and the hook
 * process inherits CLAUDE_CODE_SESSION_ID with the same value. The payload wins
 * — it is the harness's own per-call attribution, while the environment
 * describes the process that happens to be running.
 *
 * Null when neither supplies one. Records written before this change have no
 * identifier at all, and inventing one would silently merge them into whichever
 * session read the log.
 */
function resolveSessionId(p, env) {
  if (typeof p.session_id === 'string' && p.session_id.trim() !== '') return p.session_id;
  const e = env && env.CLAUDE_CODE_SESSION_ID;
  if (typeof e === 'string' && e.trim() !== '') return e;
  return null;
}

function buildRecord(payload, env) {
  const p = payload || {};
  return {
    t: Date.now(),
    tool_name: typeof p.tool_name === 'string' ? p.tool_name : null,
    duration_ms: typeof p.duration_ms === 'number' ? p.duration_ms : null,
    tool_use_id: typeof p.tool_use_id === 'string' ? p.tool_use_id : null,
    session_id: resolveSessionId(p, env === undefined ? process.env : env),
  };
}

/**
 * Append one record when collection is armed. Returns whether it wrote.
 *
 * The marker check is not a cost control — the process spawn happens before
 * this code runs, which is why `--start`/`--stop` wire and unwire rather than
 * leaving a permanently-registered hook to check a flag. It is the defence
 * against wiring that outlived a crashed `--stop`, which would otherwise
 * accumulate a log nobody armed.
 *
 * Never throws: an advisory tap that can fail a tool call has stopped being
 * advisory.
 */
function recordEvent(payload, root) {
  try {
    if (!fs.existsSync(markerPathFor(root))) return false;
    fs.appendFileSync(logPathFor(root), JSON.stringify(buildRecord(payload)) + '\n');
    return true;
  } catch (_) {
    return false;
  }
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let data;
  try {
    data = JSON.parse(input);
  } catch (_) {
    return; // unparseable input — record nothing, block nothing
  }

  recordEvent(data);
}

if (require.main === module) {
  main().catch(() => {
    // Never block a tool call.
  });
}

module.exports = {
  buildRecord,
  logPathFor,
  markerPathFor,
  recordEvent,
  DEFAULT_ROOT,
  LOG_BASENAME,
  MARKER_BASENAME,
};
