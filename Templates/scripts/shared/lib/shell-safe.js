// Rubrical Works (c) 2026
/**
 * @framework-script 0.122.0
 * @description Shell-safe utilities for CodeQL compliance: sanitizeShellArg (whitelist
 * validation for shell-interpolated values), readFileSafe (TOCTOU-safe file reading),
 * and atomicWriteSync (write-to-temp-then-rename for config files).
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * lib/shell-safe.js - Shell safety utilities for CodeQL remediation
 *
 * @see #2113 (CodeQL security findings remediation)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
// No import cycle: input-validation.js requires only 'path' (#3702).
const { SHELL_META, rejectUnsafeLeadingChar } = require('./input-validation.js');

/**
 * Validate and return a shell-safe argument. Rejects values containing
 * shell metacharacters that could enable command injection.
 *
 * For type-specific validation (issue numbers, branches, versions),
 * prefer the dedicated validators in input-validation.js. This function
 * is a general-purpose fallback for values that don't fit a specific type.
 *
 * @param {string} value - The value to validate
 * @param {string} label - Human-readable label for error messages (e.g., "issue number")
 * @returns {string} The validated value
 * @throws {Error} If value is empty or contains shell metacharacters
 */
function sanitizeShellArg(value, label = 'argument') {
  if (value == null || String(value).trim() === '') {
    throw new Error(`${label} is required`);
  }
  const str = String(value);
  // The character set and the leading-dash guard are imported from
  // input-validation.js, not repeated, so the two cannot drift (#3692, #3702).
  // A leading '-' is read as an option even under execFile; a leading '~' is
  // tilde-expanded.
  if (SHELL_META.test(str)) {
    throw new Error(`${label} contains unsafe shell characters: ${str.substring(0, 30)}`);
  }
  rejectUnsafeLeadingChar(str, label);
  return str;
}

// Characters a file path may legitimately carry that SHELL_META rejects:
// a space (`docs/My Notes.md`) and brackets (`pages/[id].tsx`) (#3742), and
// parentheses — Next.js route groups (`app/(auth)/page.tsx`) (#3749). Inside
// double quotes none is special to sh or to cmd.exe, which is what
// `shell: true` spawns.
const QUOTABLE_PATH_CHARS = /[ [\]()]/g;

// Characters SHELL_META admits that are still not literal under cmd.exe:
// `%` (expands %VAR% even inside double quotes, so no quoting helps) and `^`
// (the escape character in a bare word) (#3751).
const CMD_UNSAFE_PATH_CHARS = /[%^]/;

/**
 * Validate a file path and return it as ONE shell word. A path that passes
 * the strict set is returned bare, unchanged; one carrying only the extra
 * characters in QUOTABLE_PATH_CHARS, or starting with `#` (a comment under
 * sh when bare), is wrapped in double quotes. Everything else SHELL_META
 * rejects — quotes, `$`, backtick, `\`, `;`, tabs, newlines, `*` and `?` —
 * is still rejected, as are `%` and `^` (#3751) and a leading '-' or '~'.
 *
 * sanitizeShellArg keeps the strict set for refs and identifiers; this is for
 * paths interpolated into a command string (test-runner placeholders).
 *
 * @param {string} value - The path to validate
 * @param {string} label - Human-readable label for error messages
 * @returns {string} The path, bare or double-quoted
 * @throws {Error} If value is empty, starts with '-'/'~', or carries an unsafe character
 */
function quoteShellPath(value, label = 'path') {
  if (value == null || String(value).trim() === '') {
    throw new Error(`${label} is required`);
  }
  const str = String(value);
  rejectUnsafeLeadingChar(str, label);
  const rest = str.replace(QUOTABLE_PATH_CHARS, '');
  if (SHELL_META.test(rest) || CMD_UNSAFE_PATH_CHARS.test(rest)) {
    throw new Error(`${label} contains unsafe shell characters: ${str.substring(0, 30)}`);
  }
  return rest === str && !str.startsWith('#') ? str : `"${str}"`;
}

/**
 * Read a file safely without TOCTOU race conditions.
 * Instead of existsSync + readFileSync, uses a single try/catch read.
 *
 * @param {string} filePath - Path to the file
 * @param {string} [encoding='utf-8'] - File encoding
 * @returns {string|null} File contents, or null if file does not exist or cannot be read
 */
function readFileSafe(filePath, encoding = 'utf-8') {
  try {
    return fs.readFileSync(filePath, encoding);
  } catch {
    return null;
  }
}

/**
 * Parse a JSON file safely without TOCTOU race conditions.
 * Combines readFileSafe with JSON.parse in a single operation.
 *
 * @param {string} filePath - Path to the JSON file
 * @returns {object|null} Parsed JSON, or null if file missing or invalid
 */
function readJsonSafe(filePath) {
  const content = readFileSafe(filePath);
  if (content === null) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Write a file atomically by writing to a temp file then renaming.
 * Prevents partial writes from corrupting config files.
 *
 * @param {string} filePath - Destination path
 * @param {string} content - File content to write
 */
function atomicWriteSync(filePath, content) {
  const dir = path.dirname(filePath);
  const tmpFile = path.join(dir, `.tmp-${path.basename(filePath)}.${process.pid}.${Date.now()}`);
  try {
    fs.writeFileSync(tmpFile, content);
    fs.renameSync(tmpFile, filePath);
  } catch (err) {
    // Clean up temp file on failure
    try { fs.unlinkSync(tmpFile); } catch { /* ignore cleanup errors */ }
    throw err;
  }
}

/**
 * Create a secure temporary directory using cryptographically random names.
 * Replacement for insecure Date.now()-based temp file patterns.
 *
 * @param {string} prefix - Directory name prefix (e.g., 'extensions-')
 * @returns {string} Path to the created temporary directory
 */
function secureTempDir(prefix = 'idpf-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Create a secure temporary file path using cryptographically random names.
 *
 * @param {string} prefix - Filename prefix
 * @param {string} ext - File extension (e.g., '.txt')
 * @returns {string} Path to a secure temp file (directory created, file not yet written)
 */
function secureTempFile(prefix = 'idpf-', ext = '.tmp') {
  const dir = secureTempDir(prefix);
  const name = crypto.randomBytes(8).toString('hex') + ext;
  return path.join(dir, name);
}

module.exports = {
  sanitizeShellArg,
  quoteShellPath,
  readFileSafe,
  readJsonSafe,
  atomicWriteSync,
  secureTempDir,
  secureTempFile
};
