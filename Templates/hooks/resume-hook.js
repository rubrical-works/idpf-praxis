// Rubrical Works (c) 2026
/**
 * @framework-script 0.106.0
 * Resume Hook — SessionStart:resume
 * Fires when resuming a previous session.
 */
// Heartbeat (#2917): records this hook's outcome under the project root for the
// startup Hook Health row. A helper that cannot load records nothing and changes
// nothing here; the startup load check reports it.
try { require('../scripts/shared/lib/hook-heartbeat.js').installHeartbeat('resume-hook'); } catch (_) { /* reported by the load check */ }
console.log("resume-hook fired");
