// Rubrical Works (c) 2026
/**
 * @framework-script 0.67.1
 * @description Error types, validation utilities, and handling helpers for skill catalog operations. Exports ErrorTypes, CatalogError, and validation helpers. Used by manage-skills.js and px-manager.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * catalog-errors.js
 */

const crypto = require('crypto');

// ============================================================================
// ERROR TYPES
// ============================================================================

const ErrorTypes = {
  CATALOG_FETCH_FAILED: 'CATALOG_FETCH_FAILED',
  CHECKSUM_MISMATCH: 'CHECKSUM_MISMATCH',
  COMPATIBILITY_MISMATCH: 'COMPATIBILITY_MISMATCH',
  EXTRACTION_FAILED: 'EXTRACTION_FAILED',
  PARTIAL_DOWNLOAD: 'PARTIAL_DOWNLOAD',
  MALFORMED_CATALOG: 'MALFORMED_CATALOG',
  LOCK_CONFLICT: 'LOCK_CONFLICT'
};

// ============================================================================
// CATALOG ERROR CLASS
// ============================================================================

class CatalogError extends Error {
  constructor(type, message, details = {}) {
    super(message);
    this.name = 'CatalogError';
    this.type = type;
    this.details = details;
  }
}

// ============================================================================
// CHECKSUM VERIFICATION
// ============================================================================

/**
 * Verify a buffer's SHA-256 hash matches the expected checksum.
 * @param {Buffer} content - File content to verify
 * @param {string} expectedHash - Expected SHA-256 hex string
 * @returns {boolean}
 */
function verifyChecksum(content, expectedHash) {
  if (!expectedHash) return false;
  const actual = crypto.createHash('sha256').update(content).digest('hex');
  return actual === expectedHash;
}

// ============================================================================
// FRAMEWORK COMPATIBILITY CHECKING
// ============================================================================

/**
 * Check if a framework version satisfies a skill's compatibility constraint.
 * @param {string} constraint - e.g., ">=0.60.0"
 * @param {string} frameworkVersion - e.g., "0.65.0"
 * @returns {{ compatible: boolean, message?: string }}
 */
function checkCompatibility(constraint, frameworkVersion) {
  if (!constraint) return { compatible: true };

  const match = constraint.match(/^>=(\d+\.\d+\.\d+)$/);
  if (!match) return { compatible: true }; // Unknown constraint format, allow

  const required = match[1];
  const reqParts = required.split('.').map(Number);
  const fwParts = frameworkVersion.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    if (fwParts[i] > reqParts[i]) return { compatible: true };
    if (fwParts[i] < reqParts[i]) {
      return {
        compatible: false,
        message: `Skill requires framework >=${required} but current version is ${frameworkVersion}`
      };
    }
  }

  return { compatible: true }; // Equal versions
}

// ============================================================================
// CATALOG VALIDATION
// ============================================================================

/**
 * Validate a catalog object has the required structure.
 * @param {object} catalog - Parsed catalog JSON
 * @returns {{ valid: boolean, error?: string }}
 */
function validateCatalog(catalog) {
  if (!catalog || typeof catalog !== 'object') {
    return { valid: false, error: 'Catalog is null or not an object' };
  }

  const requiredFields = ['catalogVersion', 'frameworkVersion', 'baseUrl'];
  for (const field of requiredFields) {
    if (!catalog[field]) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }

  if (!Array.isArray(catalog.skills)) {
    return { valid: false, error: 'skills field must be an array' };
  }

  return { valid: true };
}

module.exports = {
  ErrorTypes,
  CatalogError,
  verifyChecksum,
  checkCompatibility,
  validateCatalog
};
