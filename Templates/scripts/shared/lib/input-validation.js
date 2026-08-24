// Rubrical Works (c) 2026
/**
 * @framework-script 0.97.0
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

// Shell metacharacters that enable command injection. Includes \n and \r:
// an embedded newline acts as a command separator when a "validated" value is
// interpolated into a shell string (lib/gh.js). Kept consistent with
// sanitizeShellArg in lib/shell-safe.js, which already rejects \n\r (#2456).
const SHELL_META = /[`$(){}|;&<>!\\\n\r]/;

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
 * Validate a GitHub repository in owner/repo format. Interpolated into `gh`
 * command strings (lib/gh.js); GitHub owner/name allow [A-Za-z0-9._-] only, so
 * anything else is rejected before it can reach the shell (#2456).
 * @param {string} repo
 * @returns {string} Validated owner/repo
 * @throws {Error} If not a valid owner/repo string
 */
const REPO_NAME = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
function validateRepo(repo) {
  if (typeof repo !== 'string' || !repo.trim()) {
    throw new Error('Repository is required');
  }
  if (!REPO_NAME.test(repo)) {
    throw new Error(`Invalid repository (expected owner/repo): ${repo.substring(0, 40)}`);
  }
  return repo;
}

/**
 * Validate a workflow run ID is a positive integer, returned as a string for
 * safe interpolation. Run IDs come from API responses; guard before shell use.
 * @param {string|number} runId
 * @returns {string} Validated run ID as a string
 * @throws {Error} If not a positive integer
 */
function validateRunId(runId) {
  const num = Number(runId);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(`Invalid run ID: ${String(runId).substring(0, 20)}`);
  }
  return String(num);
}

/**
 * Validate an npm package name against the npm name grammar.
 * Dependency keys read from a (possibly hostile) package.json are otherwise
 * interpolated into `npm view ...` — a crafted key executes shell code (#2456).
 * Rules: <= 214 chars; optional @scope/ prefix; lowercase url-safe chars only;
 * no leading dot or underscore.
 * @param {string} name
 * @returns {string} Validated package name
 * @throws {Error} If the name is not a valid npm package name
 */
// One name segment (scope or package): starts with a url-safe char that is not
// '.' or '_', rest url-safe. Single linear char-classes (no nested quantifiers)
// to stay clear of ReDoS — validated per-segment rather than one combined regex.
const NPM_SEGMENT = /^[a-z0-9~-][a-z0-9._~-]*$/;
function validateNpmPackageName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Package name is required');
  }
  const invalid = () => new Error(`Invalid npm package name: ${name.substring(0, 40)}`);
  if (name.length > 214) {
    throw invalid();
  }
  let pkg = name;
  if (name[0] === '@') {
    const slash = name.indexOf('/');
    if (slash < 0) {
      throw invalid();
    }
    const scope = name.slice(1, slash);
    pkg = name.slice(slash + 1);
    if (!NPM_SEGMENT.test(scope)) {
      throw invalid();
    }
  }
  if (!NPM_SEGMENT.test(pkg)) {
    throw invalid();
  }
  return name;
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
  validateRepo,
  validateRunId,
  validateNpmPackageName,
  validateVersion,
  safePath,
  validateFilename,
  safeRegex,
  escapeRegExp,
  SHELL_META
};
