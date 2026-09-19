// Rubrical Works (c) 2026
/**
 * @framework-script 0.104.0
 * Clear Hook — SessionStart:clear
 * Fires when the user runs /clear in Claude Code.
 */
// Heartbeat (#2917): records this hook's outcome under the project root for the
// startup Hook Health row. A helper that cannot load records nothing and changes
// nothing here; the startup load check reports it.
try { require('../scripts/shared/lib/hook-heartbeat.js').installHeartbeat('clear-hook'); } catch (_) { /* reported by the load check */ }
console.log("clear-hook fired");
