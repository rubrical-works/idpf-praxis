#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.123.0
 * session-end-hook.js — SessionEnd hook (#3912)
 *
 * When a session exits it tells its peers it is leaving: to the live
 * /overwatch alone when one is running, otherwise to every addressable sibling
 * in this working directory. The routing is announce.js's, not this file's.
 *
 * RECORDED, NOT PUSHED. `SendMessage` is a model tool, a Node subprocess
 * cannot call one (#2660), and the model gets no turn after SessionEnd fires.
 * So `announce.js --event session-exited` composes the announcement and writes
 * it as one file in `.claude/.overwatch/session-exits/`, addressed by the routing
 * decision; /overwatch reads it on its next tick and a sibling at its next
 * peer discovery.
 *
 * NEVER BLOCKS EXIT. The work runs in a child bounded by CHILD_TIMEOUT_MS,
 * inside the 5-second timeout the manifest declares, and every failure inside
 * this hook — unreadable input, a child that throws, hangs or exits non-zero —
 * is recorded on the heartbeat and exits 0.
 *
 * BEST-EFFORT. SessionEnd does not fire on a hard kill (#2792), so a missing
 * exit record never proves a session is alive.
 *
 * SESSIONEND CONTRACT (#3922). Source: the Claude Code hooks reference,
 * https://code.claude.com/docs/en/hooks.md § SessionEnd. Only what that page
 * documents is relied on as given; the rest is named as an assumption.
 *  - Payload (stdin JSON). Documented example: `session_id`,
 *    `transcript_path`, `cwd`, `hook_event_name` ("SessionEnd"), `reason`.
 *    This hook reads `cwd` (falling back to CLAUDE_PROJECT_DIR, then the
 *    process cwd), `session_id` and `reason`; each is passed on only when it
 *    is a non-empty string, so a missing field degrades, never throws.
 *  - Documented `reason` values: `clear`, `resume`, `logout`,
 *    `prompt_input_exit`, `other` (`bypass_permissions_disabled` is listed as
 *    removed, never sent). The value is forwarded verbatim, not validated.
 *  - `CLAUDE_PID` is undocumented: the hooks reference does not list it for a
 *    SessionEnd hook's environment. announce.js reads it as the exiting
 *    session's pid, with the session-registry fallback — the payload's
 *    `session_id` finds the registry entry when the pid is absent. Neither
 *    available → nothing is recorded and the failure is on the heartbeat.
 *  - Timeout. SessionEnd hooks default to a 1.5 s budget. A per-hook
 *    `timeout` raises it only when it sits in a settings file — the manifest
 *    declares `timeout: 5`, and this repository registers it in
 *    `.claude/settings.local.json`; a registration elsewhere must also be a
 *    settings file. Plugin-provided hook timeouts do not raise the budget, so a plugin
 *    registration of this hook would be cut off at 1.5 s, before
 *    CHILD_TIMEOUT_MS. CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS also overrides it.
 *
 * Node built-ins and relative requires only (deployed hooks resolve from the
 * hub, #2418). The one spawn is bounded (#2469).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Heartbeat (#2917). A helper that cannot load records nothing and changes
// nothing here; the startup load check reports it.
let heartbeat = null;
try { heartbeat = require('../scripts/shared/lib/hook-heartbeat.js').installHeartbeat('session-end-hook'); } catch (_) { /* reported by the load check */ }

/** Inside the 5 s hook timeout, leaving room for node startup and the exit. */
const CHILD_TIMEOUT_MS = 3500;

const ANNOUNCE = path.join(__dirname, '..', 'scripts', 'shared', 'announce.js');

function readInput() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (err) {
    return { _inputError: err };
  }
}

// One failure per run: consecutiveFailures counts runs, so a run that fails
// twice (unreadable stdin, then a failing child) records only the first.
let failed = false;

function fail(err) {
  if (failed) return;
  failed = true;
  if (heartbeat) {
    try { heartbeat.fail(err); } catch (_) { /* advisory */ }
  }
}

function main() {
  const input = readInput();
  if (input._inputError) fail(input._inputError);
  const cwd = (typeof input.cwd === 'string' && input.cwd) || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (heartbeat) heartbeat.setCwd(cwd);

  const args = [ANNOUNCE, '--event', 'session-exited'];
  if (typeof input.reason === 'string' && input.reason) args.push('--reason', input.reason);
  if (typeof input.session_id === 'string' && input.session_id) args.push('--session-id', input.session_id);

  const res = spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    timeout: CHILD_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (res.error) {
    fail(res.error);
  } else if (res.status !== 0) {
    // The error line, not a stack frame: Node prints the file position first.
    const lines = String(res.stderr || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const detail = lines.find((l) => /Error/.test(l)) || lines[0] || `announce.js exited ${res.status}`;
    fail(new Error(detail));
  }
}

// Every failure of this hook's own work is caught here and exits 0. The exit is
// natural rather than process.exit(0), so a fault from outside the hook (the
// heartbeat suite's induced crash) still fails the way Node fails it.
try {
  main();
} catch (err) {
  fail(err);
}
process.exitCode = 0;
