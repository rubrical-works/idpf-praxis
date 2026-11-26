// Rubrical Works (c) 2026
/**
 * @framework-script 0.123.0
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
const { atomicWriteSync } = require('./shell-safe');
const { isEnabled: tmpCleanupEnabled } = require('./tmp-cleanup');
const { parseAgentsValue, DEFAULT_MAX_AGENTS } = require('./concurrency-plan');

const CONFIG_FILENAME = 'framework-config.json';

/**
 * Permitted `verificationMode` values (#2556). Kept in step with the schema
 * enum by `framework-config.test.js`, so the two cannot drift.
 */
const VERIFICATION_MODES = Object.freeze(['automated-tests', 'host-process']);
// /work's independent diff-review before In review (#3457). Absent = 'always'.
const WORK_REVIEW_MODES = Object.freeze(['always', 'nonstop-only', 'off']);
const DEFAULT_WORK_REVIEW = 'always';
const TEST_PLAN_GATE_CONFIRMATION_MODES = Object.freeze(['always', 'when-blocked']);
const DEFAULT_TEST_PLAN_GATE_CONFIRMATION = 'always';

/**
 * The mode an undeclared project gets. Strict by construction: the carve-out
 * must be opted into, never arrived at by omission or by a typo.
 */
const DEFAULT_VERIFICATION_MODE = 'automated-tests';

/**
 * Epic-expansion caps for the review subsystem (#2963). The schema documents
 * the same default and bounds; `framework-config.test.js` keeps the copies in
 * step. The upper bound is a budget fact, not a style choice: at ≈12k tokens
 * per reviewed child and ≈8k more per resolved one, 50 resolved children plus
 * their re-review is ≈1M — the largest window this framework is sized for.
 */
const DEFAULT_REVIEW_EXPANSION_CAP = 20;
const REVIEW_EXPANSION_BOUNDS = Object.freeze({ minimum: 1, maximum: 50 });
const SCHEMA_REL_PATH = '.claude/metadata/framework-config.schema.json';

let cachedValidator = null;

/**
 * ajv, loaded at first validation rather than at require (#3856): the startup
 * hook and the WorktreeCreate hook read framework-config.json through this
 * module's resolvers, which validate nothing, and ajv is ~41ms paid on every
 * session start otherwise.
 */
function loadAjv() {
  return require('ajv').default;
}

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
  const Ajv = loadAjv();
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
 *   invalid, `errors` is the ajv 8 error array (each entry has `instancePath`,
 *   `message`, `params`, etc. — ajv 6 called the path `dataPath`).
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
      // ajv 8 reports instancePath; dataPath is ajv 6's name for it (#3304).
      .map((e) => `${e.instancePath || e.dataPath || '(root)'} ${e.message}`)
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
  const Ajv = loadAjv();
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
function stripLegacyCrossSessionKey(cwd = process.cwd(), options = {}) {
  let config;
  try {
    config = read(cwd);
  } catch {
    return false;
  }
  if (!Object.prototype.hasOwnProperty.call(config, 'crossSessionMessaging')) return false;

  if (typeof options._beforeWrite === 'function') options._beforeWrite();
  return updateKey(cwd, (fresh) => {
    if (!Object.prototype.hasOwnProperty.call(fresh, 'crossSessionMessaging')) return null;
    const next = { ...fresh };
    delete next.crossSessionMessaging;
    return next;
  });
}

/**
 * Change one key of framework-config.json against the file as it is NOW
 * (#3063 item 2). Backfills used to write back the object they read earlier,
 * so another session's edit landing in between was silently discarded. This
 * re-reads immediately before the atomic write and hands the fresh object to
 * `change`, which edits only its own key — or returns null when the fresh
 * file already says what it wanted, so nothing is written.
 *
 * @param {string} cwd - Project root
 * @param {(fresh: object) => object|null} change
 * @returns {boolean} True when a write happened.
 */
function updateKey(cwd, change) {
  const next = change(read(cwd));
  if (next === null) return false;
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
function ensureReviewSweep(cwd = process.cwd(), options = {}) {
  const { normalizeReviewSweep, DEFAULT_REVIEW_SWEEP_MODE } = require('./prior-art-marker.js');
  const present = (c) => c.reviewSweep !== undefined && c.reviewSweep !== null;
  const config = read(cwd);

  if (present(config)) {
    return { written: false, mode: normalizeReviewSweep(config.reviewSweep) };
  }

  if (typeof options._beforeWrite === 'function') options._beforeWrite();
  // A mode another session materialized meanwhile is kept, never overwritten.
  let kept = null;
  const written = updateKey(cwd, (fresh) => {
    if (present(fresh)) { kept = fresh.reviewSweep; return null; }
    return { ...fresh, reviewSweep: DEFAULT_REVIEW_SWEEP_MODE };
  });
  return written
    ? { written: true, mode: DEFAULT_REVIEW_SWEEP_MODE }
    : { written: false, mode: normalizeReviewSweep(kept) };
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
  return resolveVerificationModeDetail(cwd).mode;
}

/**
 * resolveVerificationMode, with what it set aside (#3266). The mode resolves
 * exactly as before — unrecognized or unreadable is the strict default — but
 * the value it ignored, or the read error, is returned so /work Step 2a can
 * report it instead of dropping it silently. A clean resolution is `{ mode }`.
 *
 * @param {string} [cwd]
 * @returns {{ mode: string, ignored?: *, warning?: string }}
 */
function resolveVerificationModeDetail(cwd = process.cwd()) {
  let config;
  try {
    config = read(cwd);
  } catch (err) {
    if (!fs.existsSync(path.join(cwd, CONFIG_FILENAME))) return { mode: DEFAULT_VERIFICATION_MODE };
    return { mode: DEFAULT_VERIFICATION_MODE, warning: `verificationMode resolved to ${DEFAULT_VERIFICATION_MODE}: ${err.message}` };
  }
  const declared = config && config.verificationMode;
  if (declared === undefined || VERIFICATION_MODES.includes(declared)) {
    return { mode: declared === undefined ? DEFAULT_VERIFICATION_MODE : declared };
  }
  return {
    mode: DEFAULT_VERIFICATION_MODE,
    ignored: declared,
    warning: `verificationMode ${JSON.stringify(declared)} is not one of ${VERIFICATION_MODES.join(', ')}; resolved to ${DEFAULT_VERIFICATION_MODE} (strict).`,
  };
}

/**
 * When /work runs the independent diff-review before In review (#3457).
 *
 * `always` (the default when the key is absent) reviews every issue;
 * `nonstop-only` reviews only under --nonstop; `off` never reviews. An
 * unrecognized value or an unreadable config resolves to the default and says
 * why, so a typo never silently turns the review off.
 *
 * @param {string} [cwd]
 * @returns {{ mode: string, source: string, ignored?: *, warning?: string }}
 */
function resolveWorkReview(cwd = process.cwd()) {
  let config;
  try {
    config = read(cwd);
  } catch (err) {
    if (!fs.existsSync(path.join(cwd, CONFIG_FILENAME))) return { mode: DEFAULT_WORK_REVIEW, source: 'default' };
    return { mode: DEFAULT_WORK_REVIEW, source: 'default', warning: `workReview resolved to ${DEFAULT_WORK_REVIEW}: ${err.message}` };
  }
  const declared = config && config.workReview;
  if (declared === undefined) return { mode: DEFAULT_WORK_REVIEW, source: 'default' };
  if (WORK_REVIEW_MODES.includes(declared)) return { mode: declared, source: CONFIG_FILENAME };
  return {
    mode: DEFAULT_WORK_REVIEW,
    source: 'default',
    ignored: declared,
    warning: `workReview ${JSON.stringify(declared)} is not one of ${WORK_REVIEW_MODES.join(', ')}; resolved to ${DEFAULT_WORK_REVIEW}.`,
  };
}

/**
 * Whether /review-test-plan Step 5a asks before writing passing gates (#3494).
 *
 * `always` (the default when the key is absent) confirms every checkable gate
 * before it is written, which is the behavior before this setting existed.
 * `when-blocked` writes gates that are checkable and autoCheckable without a
 * prompt; an autoCheckable: false gate and a blocked gate still prompt. An
 * unrecognized value or an unreadable config resolves to the default and says
 * why, so a typo never silently drops the confirmation.
 *
 * @param {string} [cwd]
 * @returns {{ mode: string, source: string, ignored?: *, warning?: string }}
 */
function resolveTestPlanGateConfirmation(cwd = process.cwd()) {
  const fallback = DEFAULT_TEST_PLAN_GATE_CONFIRMATION;
  let config;
  try {
    config = read(cwd);
  } catch (err) {
    if (!fs.existsSync(path.join(cwd, CONFIG_FILENAME))) return { mode: fallback, source: 'default' };
    return { mode: fallback, source: 'default', warning: `testPlanGateConfirmation resolved to ${fallback}: ${err.message}` };
  }
  const declared = config && config.testPlanGateConfirmation;
  if (declared === undefined) return { mode: fallback, source: 'default' };
  if (TEST_PLAN_GATE_CONFIRMATION_MODES.includes(declared)) return { mode: declared, source: CONFIG_FILENAME };
  return {
    mode: fallback,
    source: 'default',
    ignored: declared,
    warning: `testPlanGateConfirmation ${JSON.stringify(declared)} is not one of ${TEST_PLAN_GATE_CONFIRMATION_MODES.join(', ')}; resolved to ${fallback}.`,
  };
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
 * The epic-expansion caps for `/review-issue` and `/resolve-review` (#2963).
 *
 * Reader half of the `reviewExpansion` key. Returns
 * `{ expansionCap, resolveCap, source: { expansionCap, resolveCap } }`, where
 * each `source` is `project-config` or `default`, so a session can report
 * which cap it applied and why.
 *
 * **No script enforces either cap.** The model applies them from rule prose,
 * so this call is the only place a project's value can reach a run — the
 * prose names it, never a digit, or a session reading "default 20" applies 20
 * whatever the config says.
 *
 * **Every path that is not a declared in-bounds integer resolves to the
 * default**, per cap and independently: absent key, absent or unreadable
 * file, a non-object block, and a zero, negative, fractional, string or
 * over-bound value alike. The strict direction here is *bounded*: a
 * hand-edited typo must never resolve to an unbounded run, which would
 * exhaust context mid-epic — the failure the cap exists to prevent.
 *
 * @param {string} [cwd] - Project root
 * @returns {{expansionCap: number, resolveCap: number,
 *   source: {expansionCap: 'project-config'|'default', resolveCap: 'project-config'|'default'}}}
 */
function resolveReviewExpansion(cwd = process.cwd()) {
  let block;
  try {
    block = read(cwd).reviewExpansion;
  } catch {
    block = undefined;
  }
  const declared = (block && typeof block === 'object' && !Array.isArray(block)) ? block : {};
  const result = { source: {} };
  for (const key of ['expansionCap', 'resolveCap']) {
    const v = declared[key];
    const ok = Number.isInteger(v)
      && v >= REVIEW_EXPANSION_BOUNDS.minimum
      && v <= REVIEW_EXPANSION_BOUNDS.maximum;
    result[key] = ok ? v : DEFAULT_REVIEW_EXPANSION_CAP;
    result.source[key] = ok ? 'project-config' : 'default';
  }
  return {
    expansionCap: result.expansionCap,
    resolveCap: result.resolveCap,
    source: result.source,
  };
}

/**
 * The concurrent-reviewer cap for a multi-issue `/review-issue` (#3803).
 *
 * Resolution order: `--agents N` > `framework-config.json` `reviewAgents` >
 * `DEFAULT_MAX_AGENTS` (3, shared with `/work --concurrent`). `source` names
 * the layer that supplied `value`: `flag`, `project-config` or `default`.
 *
 * **Pure.** The caller passes the parsed config object (or nothing) and the
 * selection size, so no file or `gh` access happens here.
 *
 * - An invalid flag (0, negative, non-integer) is **rejected**: `ok: false`,
 *   `value: null` and an `error` naming the valid range — there is nothing to
 *   dispatch. The flag is checked by `concurrency-plan.js` `parseAgentsValue`,
 *   so both commands accept exactly the same values.
 * - An invalid `reviewAgents` (string, 0, negative, fractional) is named by
 *   value in `warnings` and the default applies, sourced `default`. A typo
 *   never silently becomes an unbounded or zero-width run.
 * - With one issue the cap is moot: a supplied `--agents` is reported as
 *   ignored (`ignored: true`, `notice`) and the review runs inline
 *   (`inline: true`). It is still validated first, so a typo is never masked.
 *
 * @param {object} [opts]
 * @param {*} [opts.agents] - Raw `--agents` value; undefined when not passed
 * @param {object|null} [opts.config] - Parsed framework-config.json
 * @param {number} [opts.issueCount] - Members in the selection
 * @returns {{ ok: boolean, value: number|null, source: 'flag'|'project-config'|'default',
 *   warnings: string[], ignored: boolean, error?: string, inline?: boolean, notice?: string }}
 */
function resolveReviewConcurrency({ agents, config, issueCount } = {}) {
  const flagGiven = agents !== undefined;
  if (flagGiven) {
    const parsed = parseAgentsValue(agents);
    if (!parsed.ok) {
      return {
        ok: false,
        value: null,
        source: 'flag',
        warnings: [],
        ignored: false,
        error: `${parsed.error} Valid range: an integer of 1 or more.`,
      };
    }
    if (issueCount === 1) {
      const fallback = resolveReviewConcurrency({ config, issueCount });
      return {
        ...fallback,
        ignored: true,
        inline: true,
        notice: `--agents ${parsed.value} ignored: a single issue is reviewed inline.`,
      };
    }
    return { ok: true, value: parsed.value, source: 'flag', warnings: [], ignored: false };
  }
  const declared = config && typeof config === 'object' ? config.reviewAgents : undefined;
  if (declared === undefined) {
    return { ok: true, value: DEFAULT_MAX_AGENTS, source: 'default', warnings: [], ignored: false };
  }
  if (Number.isInteger(declared) && declared >= 1) {
    return { ok: true, value: declared, source: 'project-config', warnings: [], ignored: false };
  }
  return {
    ok: true,
    value: DEFAULT_MAX_AGENTS,
    source: 'default',
    warnings: [`${CONFIG_FILENAME} reviewAgents ${JSON.stringify(declared)} is not an integer of 1 or more; using the default ${DEFAULT_MAX_AGENTS}.`],
    ignored: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// worktrees — sparse framework worktrees and their LFS treatment (#3856)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Directories every sparse framework worktree checks out, whatever the cone
 * says: framework steps write there (/work Step 3b writes
 * Construction/Design-Decisions/), and `git add` refuses a path outside the
 * cone. Root-level files need no entry — cone mode always checks them out.
 */
const WORKTREE_CONE_FLOOR = Object.freeze(['.claude', 'Construction']);

/** The LFS modes a framework worktree may be created with; the first is the default. */
const WORKTREE_LFS_MODES = Object.freeze(['smudge', 'skip', 'pull']);

/**
 * Characters no cone directory may carry: glob syntax, a backslash, a drive
 * colon — and a line break (#3878), since the hook writes the cone to
 * `git sparse-checkout set --stdin` one entry per line.
 */
const NOT_IN_DIR = /[*?[\]!\\:\r\n]/;

/** One path segment of a cone directory: not empty, not `.` or `..`, no forbidden character. */
const isDirSegment = (seg) => seg !== '' && seg !== '.' && seg !== '..' && !NOT_IN_DIR.test(seg);

/** A cone directory: relative, `/`-separated segments (the schema's `include` pattern). */
const isConeDir = (dir) => !dir.startsWith('/') && dir.split('/').every(isDirSegment);

/** An excluded top-level directory: one segment (the schema's `exclude` pattern). */
const isTopLevelDir = (dir) => isDirSegment(dir);

/**
 * Keep the entries `accepts` admits, trailing slash dropped; name each dropped
 * one. An entry is kept as written otherwise — never trimmed — so a directory
 * whose name begins or ends with a space is the directory the cone names, as
 * the hook's byte-for-byte tree listing sees it (#3856 work re-review). A
 * whitespace-only entry names nothing and is refused.
 */
function cleanDirs(list, accepts, key, warnings) {
  const kept = [];
  for (const raw of list) {
    const entry = typeof raw === 'string' ? raw.replace(/\/+$/, '') : raw;
    if (typeof entry === 'string' && entry.trim() !== '' && accepts(entry)) {
      if (!kept.includes(entry)) kept.push(entry);
    } else {
      warnings.push(`worktrees.sparse.${key} entry ${JSON.stringify(raw)} is not a valid directory — ignored.`);
    }
  }
  return kept;
}

/**
 * What a parsed framework-config.json declares for framework worktrees (#3856).
 * Pure: the caller passes the object.
 *
 * `mode` is what the WorktreeCreate hook does — `full` unless a non-empty,
 * valid `include` or `exclude` list is declared. `sparse.declared` says which
 * form was found: `absent` (no `sparse` key), `empty` (an object with no list,
 * or an empty one), `full` (`sparse: false`), `include` or `exclude`.
 * `needsOffer` is true while the cone is undecided — absent or empty — which
 * is when the startup hook evaluates the repository and offers a
 * configuration. A declaration the schema would refuse, hand-edited onto
 * disk, is named in `warnings` and ignored, never half-applied.
 *
 * @param {object|null|undefined} config
 * @returns {{mode: 'full'|'sparse', needsOffer: boolean,
 *   sparse: {declared: 'absent'|'empty'|'full'|'include'|'exclude', include: string[]|null, exclude: string[]|null},
 *   lfs: {declared: 'absent'|'set', mode: 'smudge'|'skip'|'pull', include: string[]},
 *   floor: string[], warnings: string[]}}
 */
function normalizeWorktreeConfig(config) {
  const warnings = [];
  const block = config && typeof config.worktrees === 'object' && config.worktrees !== null && !Array.isArray(config.worktrees)
    ? config.worktrees : {};
  if (config && config.worktrees !== undefined && block !== config.worktrees) {
    warnings.push(`worktrees ${JSON.stringify(config.worktrees)} is not an object — ignored; full checkout.`);
  }

  const sparse = { declared: 'absent', include: null, exclude: null };
  const s = block.sparse;
  if (s === false) {
    sparse.declared = 'full';
  } else if (s && typeof s === 'object' && !Array.isArray(s)) {
    const both = Array.isArray(s.include) && Array.isArray(s.exclude) && s.include.length > 0 && s.exclude.length > 0;
    if (both) {
      warnings.push('worktrees.sparse declares both include and exclude — ignored; full checkout.');
      sparse.declared = 'empty';
    } else {
      const inc = Array.isArray(s.include) ? cleanDirs(s.include, isConeDir, 'include', warnings) : [];
      const exc = Array.isArray(s.exclude) ? cleanDirs(s.exclude, isTopLevelDir, 'exclude', warnings) : [];
      if (inc.length > 0) { sparse.declared = 'include'; sparse.include = inc; }
      else if (exc.length > 0) { sparse.declared = 'exclude'; sparse.exclude = exc; }
      else sparse.declared = 'empty';
    }
  } else if (s !== undefined) {
    warnings.push(`worktrees.sparse ${JSON.stringify(s)} is neither false nor an object — ignored; full checkout.`);
    sparse.declared = 'empty';
  }

  const lfs = { declared: 'absent', mode: WORKTREE_LFS_MODES[0], include: [] };
  const l = block.lfs;
  if (l && typeof l === 'object' && !Array.isArray(l)) {
    lfs.declared = 'set';
    if (WORKTREE_LFS_MODES.includes(l.mode)) lfs.mode = l.mode;
    else warnings.push(`worktrees.lfs.mode ${JSON.stringify(l.mode)} is not one of ${WORKTREE_LFS_MODES.join(', ')} — resolved to ${WORKTREE_LFS_MODES[0]}.`);
    if (lfs.mode === 'pull') {
      const inc = Array.isArray(l.include) ? l.include.filter((p) => typeof p === 'string' && p.trim() !== '' && !p.includes(',')) : [];
      if (inc.length === 0) {
        warnings.push('worktrees.lfs.mode pull declares no usable include pattern — resolved to skip, leaving pointer files.');
        lfs.mode = 'skip';
      } else lfs.include = inc;
    }
  } else if (l !== undefined) {
    warnings.push(`worktrees.lfs ${JSON.stringify(l)} is not an object — ignored; LFS content is smudged.`);
  }

  return {
    mode: sparse.declared === 'include' || sparse.declared === 'exclude' ? 'sparse' : 'full',
    needsOffer: sparse.declared === 'absent' || sparse.declared === 'empty',
    sparse,
    lfs,
    floor: [...WORKTREE_CONE_FLOOR],
    warnings,
  };
}

/**
 * normalizeWorktreeConfig for the project at `cwd`, reading framework-config.json.
 * No file is the default — a full checkout, with the offer open. An unreadable
 * file is a full checkout with a warning and NO offer: an acceptance could not
 * be written to a file that does not parse.
 *
 * @param {string} [cwd]
 * @returns {ReturnType<typeof normalizeWorktreeConfig> & {source: 'framework-config.json'|'default'}}
 */
function resolveWorktreeConfig(cwd = process.cwd()) {
  let config;
  try {
    config = read(cwd);
  } catch (err) {
    const missing = !fs.existsSync(path.join(cwd, CONFIG_FILENAME));
    const out = { ...normalizeWorktreeConfig(null), source: 'default' };
    if (!missing) {
      out.needsOffer = false;
      out.warnings.push(`worktrees resolved to a full checkout: ${err.message}`);
    }
    return out;
  }
  const declared = config && config.worktrees !== undefined;
  return { ...normalizeWorktreeConfig(config), source: declared ? CONFIG_FILENAME : 'default' };
}

/**
 * Write the `worktrees` keys an accepted startup offer settles (#3856),
 * against the file as it is now (updateKey) and schema-validated (write).
 * Only `sparse` and `lfs` are replaced, and only when given; anything else in
 * the block is kept.
 *
 * @param {string} cwd
 * @param {{sparse?: false|{include?: string[], exclude?: string[]}, lfs?: {mode: string, include?: string[]}}} worktrees
 * @returns {boolean} whether a write happened
 */
function writeWorktreeConfig(cwd, worktrees) {
  return updateKey(cwd, (fresh) => {
    const current = fresh.worktrees && typeof fresh.worktrees === 'object' && !Array.isArray(fresh.worktrees) ? fresh.worktrees : {};
    const next = { ...current };
    if (worktrees.sparse !== undefined) next.sparse = worktrees.sparse;
    if (worktrees.lfs !== undefined) next.lfs = worktrees.lfs;
    if (JSON.stringify(next) === JSON.stringify(fresh.worktrees)) return null;
    return { ...fresh, worktrees: next };
  });
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
  resolveVerificationModeDetail,
  resolveVerificationCommands,
  resolveWorkReview,
  WORK_REVIEW_MODES,
  resolveTestPlanGateConfirmation,
  TEST_PLAN_GATE_CONFIRMATION_MODES,
  resolveTmpCleanup,
  resolveReviewExpansion,
  DEFAULT_REVIEW_EXPANSION_CAP,
  REVIEW_EXPANSION_BOUNDS,
  resolveReviewConcurrency,
  DEFAULT_REVIEW_AGENTS: DEFAULT_MAX_AGENTS,
  VERIFICATION_MODES,
  DEFAULT_VERIFICATION_MODE,
  normalizeSuite,
  SUITE_DEFAULTS,
  // worktrees (#3856)
  normalizeWorktreeConfig,
  resolveWorktreeConfig,
  writeWorktreeConfig,
  WORKTREE_CONE_FLOOR,
  WORKTREE_LFS_MODES,
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
