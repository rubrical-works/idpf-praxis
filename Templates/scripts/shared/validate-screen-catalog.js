#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.113.0
 * Validate Mockups/screen-catalog.json against 9 invariants.
 *
 * Invariants:
 *   1. canonicalSpec exists (path resolvable inside projectRoot)
 *   2. active screens have source
 *   3. orphan spec warning (planned without source — informational)
 *   4. navigatesTo target exists in catalog
 *   5. parent exists in catalog (no dangling parent)
 *   6. children consistent with parent (each child's parent === wizard)
 *   7. removed without source — passes (historical record), warn elsewhere
 *   8. duplicate canonicalSpec across entries — fail
 *   9. schema validation — fail on schema violation
 *
 * Exit code: 0 = clean, 1 = errors. Warnings non-blocking.
 *
 * AC42/AC43/AC44 — PRD #2333 Story 1.16. Refs #2354.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.join(__dirname, '..', '..', 'metadata', 'screen-catalog-schema.json');

let _schemaValidator = null;
function schemaValidator() {
  if (_schemaValidator) return _schemaValidator;
  const Ajv2020 = require('ajv/dist/2020');
  const addFormats = require('ajv-formats');
  const raw = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const schema = JSON.parse(raw);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  _schemaValidator = ajv.compile(schema);
  return _schemaValidator;
}

function validateCatalog(catalog, opts = {}) {
  const projectRoot = opts.projectRoot || process.cwd();
  const errors = [];
  const warnings = [];

  // Invariant 9: schema validation (run early so other invariants get clean data)
  const validate = schemaValidator();
  if (!validate(catalog)) {
    for (const err of validate.errors || []) {
      errors.push({ invariant: 9, path: err.instancePath, message: err.message });
    }
  }

  const screens = catalog?.screens || {};
  const entries = Object.entries(screens);

  // Invariant 8: duplicate canonicalSpec
  const specToNames = new Map();
  for (const [name, entry] of entries) {
    const k = entry.canonicalSpec;
    if (!k) continue;
    if (!specToNames.has(k)) specToNames.set(k, []);
    specToNames.get(k).push(name);
  }
  for (const [spec, names] of specToNames) {
    if (names.length > 1) {
      errors.push({ invariant: 8, message: `Duplicate canonicalSpec ${spec} for screens: ${names.join(', ')}` });
    }
  }

  for (const [name, entry] of entries) {
    const spec = entry.canonicalSpec;

    // Invariant 1: canonicalSpec exists
    if (spec) {
      const abs = path.resolve(projectRoot, spec);
      if (!fs.existsSync(abs)) {
        errors.push({ invariant: 1, screen: name, message: `canonicalSpec not found: ${spec}` });
      }
    }

    // Invariant 2: active screens have source
    if (entry.status === 'active' && !entry.source) {
      errors.push({ invariant: 2, screen: name, message: `active screen missing source` });
    }

    // Invariant 3: planned without source = informational warning
    if (entry.status === 'planned' && !entry.source) {
      warnings.push({ invariant: 3, screen: name, message: `planned screen has no source yet` });
    }

    // Invariant 4: navigatesTo target exists
    for (const t of entry.navigatesTo || []) {
      if (!screens[t]) {
        errors.push({ invariant: 4, screen: name, message: `navigatesTo target missing: ${t}` });
      }
    }

    // Invariant 5: parent exists in catalog
    if (entry.parent) {
      if (!screens[entry.parent]) {
        errors.push({ invariant: 5, screen: name, message: `parent not in catalog: ${entry.parent}` });
      } else if (entry.parent === name) {
        errors.push({ invariant: 5, screen: name, message: `circular parent (self)` });
      }
    }

    // Invariant 6: children consistent with parent
    for (const c of entry.children || []) {
      const child = screens[c];
      if (!child) {
        errors.push({ invariant: 6, screen: name, message: `child not in catalog: ${c}` });
      } else if (child.parent !== name) {
        errors.push({ invariant: 6, screen: name, message: `child ${c} parent mismatch (got: ${child.parent || 'undefined'})` });
      }
    }
  }

  return {
    errors,
    warnings,
    exitCode: errors.length > 0 ? 1 : 0,
    summary: `${errors.length} error(s), ${warnings.length} warning(s)`
  };
}

/**
 * Load the catalog to validate (#3054 item 9). A path passed explicitly is
 * required: missing or unparseable, it is an error — it used to validate an
 * empty catalog, "0 error(s)", exit 0. The default path is optional: a project
 * with no catalog yet validates an empty one, with a warning naming the path.
 *
 * @param {string|undefined} argPath  The path given on the command line
 * @param {string} cwd
 * @returns {{catalog: object|null, error: string|null, warning: string|null}}
 */
function loadCatalog(argPath, cwd) {
  const catalogPath = argPath || path.join(cwd, 'Mockups', 'screen-catalog.json');
  if (!fs.existsSync(catalogPath)) {
    if (argPath) return { catalog: null, error: `catalog not found: ${catalogPath}`, warning: null };
    return { catalog: { version: 1, screens: {} }, error: null, warning: `no catalog at ${catalogPath}; validated an empty one` };
  }
  try {
    return { catalog: JSON.parse(fs.readFileSync(catalogPath, 'utf8')), error: null, warning: null };
  } catch (err) {
    return { catalog: null, error: `catalog unreadable: ${catalogPath} (${err.message})`, warning: null };
  }
}

if (require.main === module) {
  const loaded = loadCatalog(process.argv[2], process.cwd());
  if (loaded.error) {
    process.stdout.write(JSON.stringify({ errors: [{ message: loaded.error }], warnings: [], exitCode: 1, summary: '1 error(s), 0 warning(s)' }, null, 2) + '\n');
    process.exit(1);
  }
  const result = validateCatalog(loaded.catalog, { projectRoot: process.cwd() });
  if (loaded.warning) result.warnings.unshift({ message: loaded.warning });
  result.summary = `${result.errors.length} error(s), ${result.warnings.length} warning(s)`;
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.exitCode);
}

module.exports = { validateCatalog, loadCatalog };
