// Rubrical Works (c) 2026
/**
 * @framework-script 0.65.0
 * lib/debug.js - Debug logging utility
 *
 * Provides DEBUG-gated diagnostic logging to stderr.
 * Enable via: DEBUG=1 node script.js
 *
 * @see #1881
 */

const DEBUG = !!process.env.DEBUG;

/**
 * Log a debug message to stderr (only when DEBUG=1).
 * @param {string} context - Source identifier (e.g., 'review-mode')
 * @param {string} message - Debug message
 */
function debug(context, message) {
  if (DEBUG) {
    console.error(`[DEBUG ${context}] ${message}`);
  }
}

/**
 * Log a warning to stderr (always, not gated by DEBUG).
 * Use for non-fatal issues that should be visible in normal operation.
 * @param {string} context - Source identifier
 * @param {string} message - Warning message
 */
function warn(context, message) {
  console.error(`[WARN ${context}] ${message}`);
}

module.exports = { debug, warn, DEBUG };
