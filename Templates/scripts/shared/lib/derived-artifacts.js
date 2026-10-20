// Rubrical Works (c) 2026
/**
 * @framework-script 0.109.0
 * derived-artifacts.js — Read and validate the `concurrency` block of
 * framework-config.json (#3118, PRD Concurrent-Work Story 1.1)
 *
 * Purpose: the ONE read path for a project's derived-artifact merge policy.
 * The JSON merge-driver helper (Story 1.2) and the post-merge regeneration
 * runner (Story 1.3) take their entries from `loadConcurrency` and from
 * nowhere else, which is what turns two of the policy's promises into
 * properties:
 *
 *   - "Absent configuration changes nothing." No block → every kind is an
 *     empty array → the driver registers nothing and the runner regenerates
 *     nothing. A consumer cannot act on an entry it was never handed.
 *   - "A malformed block is rejected and nothing is reconciled." ANY error —
 *     schema shape, or the one check a schema cannot express — empties EVERY
 *     kind, not just the offending one. A valid accumulator beside a broken
 *     `recomputed` entry must not survive on its own, or the driver would
 *     register half a policy and the half-applied state would look deliberate.
 *
 * Validation runs against the `concurrency` fragment of
 * .claude/metadata/framework-config.schema.json, so there is exactly one
 * definition of the shape; this module adds only what JSON Schema cannot
 * check — that each `recomputed[].verifiedBy` file exists on disk, because a
 * verifier that cannot run is a verification that never happens.
 *
 * Never throws from `loadConcurrency`: an absent or unreadable config is
 * reported in the envelope, matching resolveVerificationMode's treatment of
 * the same conditions in framework-config.js.
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv').default;
const { CONFIG_FILENAME, SCHEMA_REL_PATH } = require('./framework-config');

/**
 * The three kinds, in the order the schema declares them. Frozen because
 * consumers iterate it as the contract — a kind added here without a schema
 * entry (or vice versa) is caught by derived-artifacts.test.js.
 */
const CONCURRENCY_KINDS = Object.freeze(['derivedArtifacts', 'accumulators', 'recomputed']);

/** One validator per schema file — fixtures may carry their own copy. */
const validators = new Map();

/**
 * Compile (and cache) the validator for the `concurrency` fragment.
 *
 * @param {string} cwd - Project root, used to resolve the schema file
 * @returns {Function} ajv validator over the fragment alone
 */
function getValidator(cwd) {
  const schemaPath = path.join(cwd, SCHEMA_REL_PATH);
  if (validators.has(schemaPath)) return validators.get(schemaPath);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const fragment = schema.properties && schema.properties.concurrency;
  if (!fragment) {
    throw new Error(`${SCHEMA_REL_PATH} declares no concurrency property`);
  }
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(fragment);
  validators.set(schemaPath, validate);
  return validate;
}

/** Forward slashes, no leading `./` — the form declarations and git both use. */
function normalizePath(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '');
}

/** An envelope with every kind empty — the shape of "nothing to reconcile". */
function emptyKinds() {
  const out = {};
  for (const kind of CONCURRENCY_KINDS) out[kind] = [];
  return out;
}

/**
 * Which form a `derivedArtifacts[].regenerate` value takes.
 *
 * @param {*} regenerate
 * @returns {'command'|'skill'|null} `command` for a shell command string the
 *   runner executes, `skill` for a `{ skill, args? }` object the runner
 *   returns as deferred-to-session, null for anything else.
 */
function regenerateKind(regenerate) {
  if (typeof regenerate === 'string') return regenerate.trim() === '' ? null : 'command';
  if (regenerate && typeof regenerate === 'object' && !Array.isArray(regenerate)) {
    return (typeof regenerate.skill === 'string' && regenerate.skill.trim() !== '') ? 'skill' : null;
  }
  return null;
}

/**
 * Validate a `concurrency` block — the schema fragment, then the disk.
 *
 * `undefined` is valid: absence is the no-op, not an error. Disk checks run
 * only once the shape is valid, so a non-array `recomputed` never reaches the
 * existence loop.
 *
 * @param {*} block - The `concurrency` value, or undefined
 * @param {{cwd?: string}} [opts] - `cwd` resolves `verifiedBy` paths and the
 *   schema; defaults to process.cwd()
 * @returns {{valid: boolean, errors: string[]}} Each error names the JSON
 *   pointer of the offending entry so a reader can find it.
 */
function validateConcurrency(block, opts = {}) {
  const cwd = opts.cwd || process.cwd();
  if (block === undefined) return { valid: true, errors: [] };

  const validate = getValidator(cwd);
  if (!validate(block)) {
    const errors = validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}`);
    return { valid: false, errors };
  }

  const errors = [];
  (block.recomputed || []).forEach((entry, i) => {
    const target = path.resolve(cwd, entry.verifiedBy);
    let isFile = false;
    try { isFile = fs.statSync(target).isFile(); } catch { isFile = false; }
    if (!isFile) {
      errors.push(`/recomputed/${i}/verifiedBy names a test file that does not exist: ${entry.verifiedBy}`);
    }
  });
  return { valid: errors.length === 0, errors };
}

/**
 * Load the project's `concurrency` block, validated.
 *
 * @param {string} [cwd] - Project root
 * @returns {{declared: boolean, valid: boolean, errors: string[],
 *   derivedArtifacts: object[], accumulators: object[], recomputed: object[]}}
 *   `declared` is whether the key was present; `valid` is whether it may be
 *   acted on. The three kinds are COPIES — never the config object — and are
 *   all empty whenever `valid` is false or `declared` is false.
 */
function loadConcurrency(cwd = process.cwd()) {
  const configPath = path.join(cwd, CONFIG_FILENAME);
  let config;
  try {
    if (!fs.existsSync(configPath)) {
      return { declared: false, valid: true, errors: [], ...emptyKinds() };
    }
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    return {
      declared: false,
      valid: false,
      errors: [`${CONFIG_FILENAME} could not be read: ${err.message}`],
      ...emptyKinds(),
    };
  }

  const block = config && typeof config === 'object' ? config.concurrency : undefined;
  if (block === undefined) {
    return { declared: false, valid: true, errors: [], ...emptyKinds() };
  }

  let result;
  try {
    result = validateConcurrency(block, { cwd });
  } catch (err) {
    result = { valid: false, errors: [`concurrency block could not be validated: ${err.message}`] };
  }
  if (!result.valid) {
    return { declared: true, valid: false, errors: result.errors, ...emptyKinds() };
  }

  const kinds = emptyKinds();
  for (const kind of CONCURRENCY_KINDS) {
    if (Array.isArray(block[kind])) kinds[kind] = JSON.parse(JSON.stringify(block[kind]));
  }
  return { declared: true, valid: true, errors: [], ...kinds };
}

/**
 * Compile one `paths[]` glob to a RegExp (#3120).
 *
 * Supports literals, `*` within a segment and `**` across segments — the
 * same subset `test-runner.js` and `scope-drift-check.js` carry, vendored
 * here for the same reason: `minimatch` is not a declared runtime dependency
 * and cannot resolve from the hub. Brace expansion, negation and `?` are not
 * supported; a caller that needs them switches this helper rather than
 * re-introducing the dependency.
 */
function globToRegex(pattern) {
  let re = '^';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        re += '.*';
        i += 2;
        if (pattern[i] === '/') i++;
      } else {
        re += '[^/]*';
        i++;
      }
    } else if ('.+^$()|{}[]\\'.includes(c)) {
      re += '\\' + c;
      i++;
    } else {
      re += c;
      i++;
    }
  }
  re += '$';
  return new RegExp(re);
}

/**
 * Whether a project-relative path is covered by any of an entry's globs.
 *
 * @param {string} filePath - Relative path; backslashes and a leading `./` tolerated
 * @param {string[]} globs - A `derivedArtifacts[].paths` list
 * @returns {boolean}
 */
function matchesAnyGlob(filePath, globs) {
  const p = normalizePath(filePath);
  return (Array.isArray(globs) ? globs : []).some((g) => globToRegex(normalizePath(g)).test(p));
}

/** Test-only: drop cached validators so a fixture can swap its schema. */
function _resetCache() {
  validators.clear();
}

module.exports = {
  CONCURRENCY_KINDS,
  loadConcurrency,
  validateConcurrency,
  regenerateKind,
  globToRegex,
  matchesAnyGlob,
  normalizePath,
  _resetCache,
};
