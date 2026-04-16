#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.88.0
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
  const Ajv = require('ajv');
  const raw = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const schema = JSON.parse(raw);
  const ajv = new Ajv({ allErrors: true, strict: false });
  const { $schema: _s, $id: _i, ...rest } = schema;
  _schemaValidator = ajv.compile(rest);
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

if (require.main === module) {
  const catalogPath = process.argv[2] || path.join(process.cwd(), 'Mockups', 'screen-catalog.json');
  const catalog = fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath, 'utf8')) : { version: 1, screens: {} };
  const result = validateCatalog(catalog, { projectRoot: process.cwd() });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.exitCode);
}

module.exports = { validateCatalog };
