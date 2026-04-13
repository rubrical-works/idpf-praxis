// Rubrical Works (c) 2026
/**
 * @framework-script 0.86.0
 * framework-config.js — Read/validate/write helper for framework-config.json
 *
 * Purpose: Single entry point for all writers of framework-config.json. Every
 * writer (/charter, /create-prd, /change-domain-expert, /fw-import-skills, etc.)
 * should go through this helper instead of calling fs.readFileSync /
 * JSON.parse / fs.writeFileSync directly. This guarantees that:
 *   - Writers never produce schema-invalid output (validate-before-write gate)
 *   - Schema drift is caught at write time, not at the next CI run
 *   - The schema is loaded once and cached
 *
 * Schema source: .claude/metadata/framework-config.schema.json (draft-07).
 * Validation library: ajv 6 (already in this repo's package.json).
 *
 * See #2292 for context.
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const CONFIG_FILENAME = 'framework-config.json';
const SCHEMA_REL_PATH = '.claude/metadata/framework-config.schema.json';

let cachedValidator = null;

/**
 * Build (and cache) the ajv validator function for framework-config.schema.json.
 *
 * @param {string} cwd - Project root (used to resolve the schema file)
 * @returns {Function} ajv validator
 */
function getValidator(cwd) {
  if (cachedValidator) return cachedValidator;
  const schemaPath = path.join(cwd, SCHEMA_REL_PATH);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  // ajv 6 defaults to draft-07, which matches the schema's $schema declaration
  const ajv = new Ajv({ allErrors: true });
  cachedValidator = ajv.compile(schema);
  return cachedValidator;
}

/**
 * Read framework-config.json from the project root.
 *
 * @param {string} cwd - Project root
 * @returns {object} Parsed config object
 * @throws {Error} If the file is missing or contains invalid JSON
 */
function read(cwd) {
  const configPath = path.join(cwd, CONFIG_FILENAME);
  if (!fs.existsSync(configPath)) {
    throw new Error(`framework-config.json not found at ${configPath}`);
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`framework-config.json is not valid JSON: ${err.message}`);
  }
}

/**
 * Validate a config object against framework-config.schema.json.
 *
 * @param {object} config - Config object to validate
 * @param {string} [cwd=process.cwd()] - Project root (for schema resolution)
 * @returns {{ valid: boolean, errors: Array|null }} Validation result. When
 *   invalid, `errors` is the ajv error array (each entry has `dataPath`,
 *   `message`, `params`, etc.).
 */
function validate(config, cwd = process.cwd()) {
  const validator = getValidator(cwd);
  const valid = validator(config);
  return { valid, errors: valid ? null : validator.errors };
}

/**
 * Write a config object back to framework-config.json. Validates first and
 * throws if validation fails — writers must produce schema-compliant output
 * or the write is rejected.
 *
 * @param {string} cwd - Project root
 * @param {object} config - Config object to write
 * @throws {Error} If the config fails schema validation
 */
function write(cwd, config) {
  const { valid, errors } = validate(config, cwd);
  if (!valid) {
    const summary = errors
      .map((e) => `${e.dataPath || '(root)'} ${e.message}`)
      .join('; ');
    throw new Error(`framework-config.json validation failed: ${summary}`);
  }
  const configPath = path.join(cwd, CONFIG_FILENAME);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Reset the cached validator. Test-only — exposed so unit tests can swap the
 * schema between cases without leaking cached state across test files.
 */
function _resetCache() {
  cachedValidator = null;
}

module.exports = { read, validate, write, _resetCache, CONFIG_FILENAME, SCHEMA_REL_PATH };
