// Rubrical Works (c) 2026
/**
 * @framework-script 0.81.1
 * @description Input validation utilities to prevent command injection, path traversal, and ReDoS from externally-sourced inputs. Exports validateIssueNumber(), validateBranchName(), validatePath(), and related guards. Used by all preamble scripts accepting user input.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * lib/input-validation.js - Input validation utilities for shell safety
 *
 * @see #1875 (command injection), #1876 (ReDoS), #1877 (path traversal)
 */

const path = require('path');

// Shell metacharacters that enable command injection
const SHELL_META = /[`$(){}|;&<>!\\]/;

/**
 * Validate an issue number is a positive integer.
 * @param {string|number} value
 * @returns {number} Validated integer
 * @throws {Error} If not a positive integer
 */
function validateIssueNumber(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(`Invalid issue number: ${String(value).substring(0, 20)}`);
  }
  return num;
}

/**
 * Validate a branch name is safe for shell use.
 * Git branch names can contain /, -, ., _ but not shell metacharacters.
 * @param {string} name
 * @returns {string} Validated branch name
 * @throws {Error} If branch name contains shell metacharacters
 */
function validateBranchName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Branch name is required');
  }
  if (SHELL_META.test(name)) {
    throw new Error(`Branch name contains unsafe characters: ${name.substring(0, 30)}`);
  }
  return name;
}

/**
 * Validate a git tag is safe for shell use.
 * @param {string} tag
 * @returns {string} Validated tag
 * @throws {Error} If tag contains shell metacharacters
 */
function validateTag(tag) {
  if (typeof tag !== 'string' || !tag.trim()) {
    throw new Error('Tag is required');
  }
  if (SHELL_META.test(tag)) {
    throw new Error(`Tag contains unsafe characters: ${tag.substring(0, 30)}`);
  }
  return tag;
}

/**
 * Validate a version string (semver-like).
 * @param {string} version
 * @returns {string} Validated version
 * @throws {Error} If version format is invalid
 */
function validateVersion(version) {
  if (typeof version !== 'string') {
    throw new Error('Version must be a string');
  }
  if (!/^v?\d+\.\d+\.\d+/.test(version)) {
    throw new Error(`Invalid version format: ${version.substring(0, 30)}`);
  }
  return version;
}

/**
 * Validate a file path stays within a base directory (prevents traversal).
 * @param {string} base - Base directory (must be absolute)
 * @param {string} userPath - User-provided path (relative or absolute)
 * @returns {string} Resolved, validated absolute path
 * @throws {Error} If path escapes base directory
 */
function safePath(base, userPath) {
  const resolved = path.resolve(base, userPath);
  const normalizedBase = path.resolve(base);
  if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
    throw new Error(`Path traversal detected: ${userPath} escapes ${base}`);
  }
  return resolved;
}

/**
 * Validate a filename has no path separators (simple name only).
 * @param {string} name
 * @returns {string} Validated filename
 * @throws {Error} If name contains path separators or traversal
 */
function validateFilename(name) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Filename is required');
  }
  if (/[/\\]/.test(name) || name.includes('..')) {
    throw new Error(`Unsafe filename: ${name.substring(0, 30)}`);
  }
  return name;
}

/**
 * Safely construct a RegExp from external input.
 * Returns null if pattern is invalid or potentially dangerous.
 * @param {string} pattern - Regex pattern from external source
 * @param {string} flags - Regex flags (default: '')
 * @returns {RegExp|null} Compiled regex or null on failure
 */
function safeRegex(pattern, flags = '') {
  if (typeof pattern !== 'string' || !pattern.trim()) {
    return null;
  }
  // Reject patterns with known ReDoS-prone constructs (nested quantifiers)
  if (/([+*])\)[\+\*]|([+*])\)\{/.test(pattern)) {
    return null;
  }
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

/**
 * Escape a string for safe use in a RegExp.
 * @param {string} str
 * @returns {string} Escaped string
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  validateIssueNumber,
  validateBranchName,
  validateTag,
  validateVersion,
  safePath,
  validateFilename,
  safeRegex,
  escapeRegExp,
  SHELL_META
};
