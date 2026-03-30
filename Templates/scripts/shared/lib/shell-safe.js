// Rubrical Works (c) 2026
/**
 * @framework-script 0.77.0
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
  // Reject shell metacharacters: backticks, $, (), {}, |, ;, &, <, >, !, \, newlines
  if (/[`$(){}|;&<>!\\\n\r]/.test(str)) {
    throw new Error(`${label} contains unsafe shell characters: ${str.substring(0, 30)}`);
  }
  return str;
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
  readFileSafe,
  readJsonSafe,
  atomicWriteSync,
  secureTempDir,
  secureTempFile
};
