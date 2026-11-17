// Rubrical Works (c) 2026
/**
 * @framework-script 0.120.0
 * Clear Hook — SessionStart:clear
 * Fires when the user runs /clear in Claude Code.
 *
 * Runs the startup routine (#3679): startup-hook.js's main() with source
 * "clear", so the session gets the same Session Initialized rows after /clear
 * as after a fresh start. Actions that assume a new process are skipped there
 * (startup-hook.js CLEAR_SAFETY), not here — one routine, one list.
 */
// Heartbeat (#2917): records this hook's outcome under the project root for the
// startup Hook Health row. A helper that cannot load records nothing and changes
// nothing here; the startup load check reports it.
let heartbeat = { fail() {} };
try { heartbeat = require('../scripts/shared/lib/hook-heartbeat.js').installHeartbeat('clear-hook'); } catch (_) { /* reported by the load check */ }

try {
  require('./startup-hook.js').main({ source: 'clear' }).catch(fallback);
} catch (err) {
  fallback(err);
}

/** Same contract as startup-hook.js: never block the session, always answer. */
function fallback(err) {
  heartbeat.fail(err);
  process.stderr.write(`clear-hook failed: ${err.message}\n`);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: `Session Initialized\n- Error: clear-hook failed: ${err.message}`,
    },
  }) + '\n');
  process.exitCode = 0;
}
