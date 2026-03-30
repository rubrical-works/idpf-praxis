// Rubrical Works (c) 2026
/**
 * @framework-script 0.77.1
 * @description Provide DEBUG-gated diagnostic logging to stderr. Exports debug(), warn(), and DEBUG flag. Used by preamble scripts and library modules for conditional tracing.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * lib/debug.js - Debug logging utility
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
