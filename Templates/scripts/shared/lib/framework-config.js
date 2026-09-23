// Rubrical Works (c) 2026
/**
 * @framework-script 0.106.0
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
const { isEnabled: tmpCleanupEnabled } = require('./tmp-cleanup');

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

// ─────────────────────────────────────────────────────────────────────────────
// .claude/x-session.json — the per-developer cross-session preferences (#2774)
// ─────────────────────────────────────────────────────────────────────────────

/** Where the file lives, relative to the project root. */
const X_SESSION_FILENAME = '.claude/x-session.json';

/** Its schema, deployed alongside framework-config.schema.json. */
const X_SESSION_SCHEMA_REL_PATH = '.claude/metadata/x-session.schema.json';

let cachedXSessionValidator = null;

/**
 * Compile and cache the x-session validator.
 *
 * Its own cache, not a shared one keyed by path: the two schemas have different
 * lifetimes in a test run (`_resetCache` clears both), and a single-slot cache
 * shared between them would silently validate one file against the other's
 * schema the moment a caller interleaved them.
 */
function getXSessionValidator(cwd) {
  if (cachedXSessionValidator) return cachedXSessionValidator;
  const schemaPath = path.join(cwd, X_SESSION_SCHEMA_REL_PATH);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  cachedXSessionValidator = ajv.compile(schema);
  return cachedXSessionValidator;
}

/**
 * Read `.claude/x-session.json`.
 *
 * @returns {object|undefined} The parsed object, or undefined when the file is
 *   absent or unreadable. NOT a throw: an absent file is the normal state of
 *   every project that has not run `/x-session-config`, and the resolver's
 *   absence rule already defines what it means.
 */
function readXSession(cwd = process.cwd()) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(cwd, X_SESSION_FILENAME), 'utf8'));
    return (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed))
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Validate an x-session object against its schema.
 *
 * @returns {{valid: boolean, errors: Array|null}}
 */
function validateXSession(obj, cwd = process.cwd()) {
  const validator = getXSessionValidator(cwd);
  const valid = validator(obj);
  return { valid, errors: valid ? null : validator.errors };
}

/**
 * Write `.claude/x-session.json`, validating first.
 *
 * Creates `.claude/` when absent — unlike `write`, which refuses to create
 * `framework-config.json`. The asymmetry is the point: this command owns this
 * file outright, whereas it owns exactly one key of the other one.
 *
 * @throws {Error} If the object fails schema validation. Nothing is written.
 */
function writeXSession(cwd, obj) {
  const { valid, errors } = validateXSession(obj, cwd);
  if (!valid) {
    const summary = errors
      .map((e) => `${e.dataPath || e.instancePath || '(root)'} ${e.message}`)
      .join('; ');
    throw new Error(`${X_SESSION_FILENAME} validation failed: ${summary}`);
  }
  const target = path.join(cwd, X_SESSION_FILENAME);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  atomicWriteSync(target, JSON.stringify(obj, null, 2) + '\n');
}

/**
 * Remove the deprecated `crossSessionMessaging` key from framework-config.json
 * (#2774), returning whether anything was removed.
 *
 * Routed through `write` so the result is schema-validated before it lands. The
 * key stays ACCEPTED by that schema, marked deprecated, precisely so this write
 * succeeds on a project mid-migration — removing it from the schema outright
 * would invalidate every unmigrated project's config and block every other
 * writer of that file.
 *
 * Never throws on an absent or unreadable framework-config.json: a project may
 * legitimately have only the new file.
 *
 * @returns {boolean} True when a key was present and has been removed.
 */
function stripLegacyCrossSessionKey(cwd = process.cwd()) {
  let config;
  try {
    config = read(cwd);
  } catch {
    return false;
  }
  if (!Object.prototype.hasOwnProperty.call(config, 'crossSessionMessaging')) return false;

  const next = { ...config };
  delete next.crossSessionMessaging;
  write(cwd, next);
  return true;
}

/**
 * Materialize an absent `reviewSweep` as the default mode (#2564).
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
 *   normalized mode either way.
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
  // Both, always. Leaving the x-session validator cached across a reset would
  // let one test's schema fixture validate the next test's file.
  cachedXSessionValidator = null;
}

/**
 * The effective TDD verification mode for a project (#2556).
 *
 * Reader half of the `verificationMode` key. Every path that is not an
 * explicitly declared, recognized mode resolves to
 * `DEFAULT_VERIFICATION_MODE` — absent key, absent file, unreadable file,
 * and an unrecognized string alike.
 *
 * **Failing into the strict gate is the point.** The carve-out relaxes what
 * satisfies RED, so resolving an unknown value into it would let a typo
 * (`host_process`, `hostProcess`, `manual`) silently disable a gate while
 * the config still looks deliberate. Failing into the strict mode makes a
 * mistyped declaration behave as if it were absent, which is visible the
 * moment the gate is applied rather than never.
 *
 * Note the asymmetry with `write`: the schema REJECTS an unrecognized mode at
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
 * shape gets its previous behavior, not a silently satisfied gate.
 *
 * Never throws — an unreadable or absent config resolves to `none`, matching
 * `resolveVerificationMode`'s treatment of the same conditions.
 *
 * @param {string} [cwd] - Project root
 * @returns {{commands: string[], source: 'verificationCommands'|'testCommand'|'none'}}
 */
function resolveVerificationCommands(cwd = process.cwd()) {
  // Function-scoped require, deliberately (#2852 AC3): test-runner.js requires
  // THIS module from inside `resolveSuites`, so a top-level require in either
  // direction would be a load-time cycle leaving one module half-initialized
  // for the other. Scoping both to call time makes the order irrelevant.
  const { resolveSuites } = require('./test-runner.js');

  // Thin delegate since #2852. The precedence rule — `testing` >
  // `verificationCommands` > `testCommand` > none — lives in ONE place, so
  // `/qa` Step 4 and every other caller inherits it rather than each growing a
  // second resolution rule that drifts.
  const { suites, source } = resolveSuites(cwd);

  // A `manual-only` suite is declared-but-not-run, so it contributes no
  // command. Filtering here rather than in the resolver keeps the suite list
  // complete for callers that need to REPORT what was skipped.
  const commands = suites
    .filter((s) => s.execution !== 'manual-only')
    .map((s) => s.full)
    .filter((c) => typeof c === 'string' && c.trim() !== '');

  return { commands, source };
}

/**
 * Whether the startup hook's stale-scratch-file sweep is enabled (#2771).
 *
 * Reader half of the `tmpCleanup` key. **Absent means enabled**, matching
 * `crossSessionMessaging`'s absence rule: a config records only what was
 * turned OFF, so the sweep arrives switched on in every project already on
 * disk without anyone editing a file.
 *
 * **Only the literal `false` disables it**, and that asymmetry is deliberate
 * in the opposite direction from `resolveVerificationMode`. There, an
 * unrecognized value fails INTO the strict gate, because the risk is a typo
 * silently relaxing a check. Here the risk runs the other way: a typo that
 * silently disabled the sweep would leave a user believing a cleanup is
 * running when it is not, and nothing would ever report the gap — the sweep
 * emits no row when it removes nothing, so a disabled sweep and a clean one
 * look identical. Requiring an exact `false` means a mistyped opt-out behaves
 * as if it were absent, which is visible the first time files are removed
 * anyway rather than never.
 *
 * The safety of that choice rests on the helper, not on this flag: what the
 * sweep will delete is bounded by `tmp-cleanup.js` refusing directories,
 * tracked files, young files and everything at all when git cannot answer.
 * This key decides whether to run it, not what it may touch.
 *
 * Never throws — an absent or unreadable config resolves to enabled, matching
 * how `resolveVerificationMode` treats the same conditions.
 *
 * @param {string} [cwd] - Project root
 * @returns {boolean}
 */
function resolveTmpCleanup(cwd = process.cwd()) {
  let config;
  try {
    config = read(cwd);
  } catch {
    return true;
  }
  // The predicate lives in tmp-cleanup.js, not here, so the startup hook can
  // apply the same absence rule without loading this module — requiring it
  // pulls ajv, ~41ms paid synchronously on every session start before any
  // check is spawned. Delegating rather than restating keeps one rule.
  return tmpCleanupEnabled(config);
}

/**
 * The defaults a declared suite acquires when it omits them (#2849).
 *
 * Applied by `normalizeSuite`, and documented a second time in the schema's
 * per-property `description` fields. The duplication is deliberate and
 * asserted by `framework-config.test.js`: a reader of the schema alone must be
 * able to learn what an omitted key means, while every CONSUMER gets the value
 * from here — a JSON Schema `default` keyword documents but does not apply
 * unless ajv is run with `useDefaults`, which this helper deliberately does not
 * enable (it would mutate the caller's config as a side effect of validating).
 */
const SUITE_DEFAULTS = Object.freeze({
  role: 'unit',
  execution: 'gate',
  kind: 'framework',
});

/**
 * Apply the suite defaults, returning a new object (#2849).
 *
 * **Returns a copy; never mutates the input.** Callers pass suites straight out
 * of their own parsed config, and #2852's `resolveSuites` calls this on every
 * suite — normalizing in place would silently rewrite the caller's config
 * object and make a later `write()` persist defaults the project never
 * declared.
 *
 * **Never throws.** The caller is a gate helper, so a malformed suite must be
 * reportable rather than an exception raised mid-sweep; a non-object resolves
 * to a suite carrying only the defaults, which then fails schema validation
 * visibly rather than crashing.
 *
 * `resolveSuites` and every other consumer call this rather than re-deriving
 * the defaults, so there is exactly one place the answer lives.
 *
 * @param {object} suite - A declared suite, possibly partial
 * @returns {object} A new suite with `role`, `execution` and `kind` populated
 */
function normalizeSuite(suite) {
  const src = (suite && typeof suite === 'object' && !Array.isArray(suite)) ? suite : {};
  return {
    ...src,
    role: src.role === undefined ? SUITE_DEFAULTS.role : src.role,
    execution: src.execution === undefined ? SUITE_DEFAULTS.execution : src.execution,
    kind: src.kind === undefined ? SUITE_DEFAULTS.kind : src.kind,
  };
}

module.exports = {
  read,
  resolveVerificationMode,
  resolveVerificationCommands,
  resolveTmpCleanup,
  VERIFICATION_MODES,
  DEFAULT_VERIFICATION_MODE,
  normalizeSuite,
  SUITE_DEFAULTS,
  validate,
  write,
  ensureReviewSweep,
  _resetCache,
  CONFIG_FILENAME,
  SCHEMA_REL_PATH,
  // .claude/x-session.json (#2774)
  X_SESSION_FILENAME,
  X_SESSION_SCHEMA_REL_PATH,
  readXSession,
  validateXSession,
  writeXSession,
  stripLegacyCrossSessionKey
};
