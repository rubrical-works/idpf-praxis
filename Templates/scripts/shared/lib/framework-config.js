// Rubrical Works (c) 2026
/**
 * @framework-script 0.101.0
 * framework-config.js — Read/validate/write helper for framework-config.json
 *
 * Purpose: Single entry point for all writers of framework-config.json. Every
 * writer (/charter, /create-prd, /change-domain-expert, /fw-import-skills, etc.)
 * should go through this helper instead of calling fs.readFileSync /
 * JSON.parse / fs.writeFileSync directly. This guarantees that:
 *   - Writers never produce schema-invalid output (validate-before-write gate)
 *   - Schema drift is caught at write time, not at the next CI run
 *   - The schema is loaded once and cached
 *   - A failed write never leaves a torn config behind (#2470): write() goes
 *     through shell-safe's atomicWriteSync, so the destination is replaced by
 *     rename or not touched at all. Protects against process interruption and
 *     ENOSPC — not power loss, which would need an fsync of the temp file and
 *     its parent directory.
 *
 * Schema source: .claude/metadata/framework-config.schema.json (draft-07).
 * Validation library: ajv 8 (declared runtime dep per #2378).
 *
 * See #2292 for context. #2378 migrated from ajv 6 to ajv 8.
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv').default;
const { atomicWriteSync } = require('./shell-safe');

const CONFIG_FILENAME = 'framework-config.json';

/**
 * Permitted `verificationMode` values (#2556). Kept in step with the schema
 * enum by `framework-config.test.js`, so the two cannot drift.
 */
const VERIFICATION_MODES = Object.freeze(['automated-tests', 'host-process']);

/**
 * The mode an undeclared project gets. Strict by construction: the carve-out
 * must be opted into, never arrived at by omission or by a typo.
 */
const DEFAULT_VERIFICATION_MODE = 'automated-tests';
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
  // ajv 8 default export supports draft-07, which matches the schema's $schema declaration
  const ajv = new Ajv({ allErrors: true, strict: false });
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
  atomicWriteSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Materialise an absent `reviewSweep` as the default mode (#2564).
 *
 * One of the two writers that keep the key present: Praxis Hub Manager writes
 * it at install and upgrade, and the review commands call this on first
 * encounter so projects that predate the setting converge without waiting to
 * be reinstalled. Between them the absent case approaches zero, but
 * `normalizeReviewSweep` still defines what absent means for the window before
 * the first write.
 *
 * Routed through `write` rather than a raw `fs` call so the value is schema-
 * validated before it lands — a mode string that the schema does not admit is
 * rejected here rather than discovered later by a reader.
 *
 * A legacy boolean is deliberately NOT rewritten. Migration is a read-time
 * concern handled by `normalizeReviewSweep`; rewriting the file would mutate a
 * project's committed config as a side effect of running a review, which is a
 * substantially larger promise than filling in a missing key. The migrated
 * mode is still reported so the caller can act on it.
 *
 * @param {string} [cwd] - Project root
 * @returns {{written: boolean, mode: string}} `written` false when the key was
 *   already present (including as a legacy boolean); `mode` is the effective
 *   normalised mode either way.
 */
function ensureReviewSweep(cwd = process.cwd()) {
  const { normalizeReviewSweep, DEFAULT_REVIEW_SWEEP_MODE } = require('./prior-art-marker.js');
  const config = read(cwd);

  if (config.reviewSweep !== undefined && config.reviewSweep !== null) {
    return { written: false, mode: normalizeReviewSweep(config.reviewSweep) };
  }

  write(cwd, { ...config, reviewSweep: DEFAULT_REVIEW_SWEEP_MODE });
  return { written: true, mode: DEFAULT_REVIEW_SWEEP_MODE };
}

/**
 * Reset the cached validator. Test-only — exposed so unit tests can swap the
 * schema between cases without leaking cached state across test files.
 */
function _resetCache() {
  cachedValidator = null;
}

/**
 * The effective TDD verification mode for a project (#2556).
 *
 * Reader half of the `verificationMode` key. Every path that is not an
 * explicitly declared, recognised mode resolves to
 * `DEFAULT_VERIFICATION_MODE` — absent key, absent file, unreadable file,
 * and an unrecognised string alike.
 *
 * **Failing into the strict gate is the point.** The carve-out relaxes what
 * satisfies RED, so resolving an unknown value into it would let a typo
 * (`host_process`, `hostProcess`, `manual`) silently disable a gate while
 * the config still looks deliberate. Failing into the strict mode makes a
 * mistyped declaration behave as if it were absent, which is visible the
 * moment the gate is applied rather than never.
 *
 * Note the asymmetry with `write`: the schema REJECTS an unrecognised mode at
 * write time, so a bad value should not reach disk through the helper at all.
 * This guard covers the file being hand-edited, which is how most projects
 * will set the key.
 *
 * @param {string} [cwd] - Project root
 * @returns {string} One of `VERIFICATION_MODES`
 */
function resolveVerificationMode(cwd = process.cwd()) {
  let config;
  try {
    config = read(cwd);
  } catch {
    return DEFAULT_VERIFICATION_MODE;
  }
  const declared = config && config.verificationMode;
  return VERIFICATION_MODES.includes(declared) ? declared : DEFAULT_VERIFICATION_MODE;
}

/**
 * The ordered verification commands /work Step 4f must run (#2733).
 *
 * Reader half of the `verificationCommands` key, with `testCommand` as the
 * single-command fallback. Returns `{ commands, source }` where `source` is
 * one of `verificationCommands` | `testCommand` | `none`.
 *
 * **`source` exists so Step 4f can say which branch it took.** The three
 * outcomes need three different reports — every declared command ran, the one
 * declared command ran, or nothing ran and the gap is being reported — and a
 * bare array cannot distinguish the last from a project that declared an empty
 * list. Returning the reason alongside the value is what keeps "the gate did
 * not run" reportable rather than indistinguishable from "the gate passed",
 * which is the failure #2595 named and this key must not reintroduce.
 *
 * **An empty or malformed array falls back rather than short-circuiting.**
 * `verificationCommands: []` and `verificationCommands: "npm run lint"` are
 * both declarations that declare no runnable set, so they defer to
 * `testCommand`; a project that meant to declare commands and mistyped the
 * shape gets its previous behaviour, not a silently satisfied gate.
 *
 * Never throws — an unreadable or absent config resolves to `none`, matching
 * `resolveVerificationMode`'s treatment of the same conditions.
 *
 * @param {string} [cwd] - Project root
 * @returns {{commands: string[], source: 'verificationCommands'|'testCommand'|'none'}}
 */
function resolveVerificationCommands(cwd = process.cwd()) {
  const NONE = { commands: [], source: 'none' };

  let config;
  try {
    config = read(cwd);
  } catch {
    return NONE;
  }
  if (!config) return NONE;

  const declared = config.verificationCommands;
  if (Array.isArray(declared)) {
    const commands = declared.filter((c) => typeof c === 'string' && c.trim() !== '');
    if (commands.length > 0) {
      return { commands, source: 'verificationCommands' };
    }
  }

  const single = config.testCommand;
  if (typeof single === 'string' && single.trim() !== '') {
    return { commands: [single], source: 'testCommand' };
  }

  return NONE;
}

module.exports = {
  read,
  resolveVerificationMode,
  resolveVerificationCommands,
  VERIFICATION_MODES,
  DEFAULT_VERIFICATION_MODE,
  validate,
  write,
  ensureReviewSweep,
  _resetCache,
  CONFIG_FILENAME,
  SCHEMA_REL_PATH
};
