// Rubrical Works (c) 2026
/**
 * @framework-script 0.88.0
 * Screen Catalog Registry helper.
 *
 * Reads/writes Mockups/screen-catalog.json — the master inventory of
 * screens shared across /catalog-screens, /mockups, and /design-system.
 * Schema lives in .claude/metadata/screen-catalog-schema.json.
 *
 * Refs #2339 (PRD #2333 — Screen Design Pipeline)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const DEFAULT_CATALOG_PATH = path.join('Mockups', 'screen-catalog.json');
const SCHEMA_PATH = path.join(__dirname, '..', '..', '..', 'metadata', 'screen-catalog-schema.json');

let _validator = null;
function getValidator() {
  if (_validator) return _validator;
  const raw = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const schema = JSON.parse(raw);
  const ajv = new Ajv({ allErrors: true, strict: false });
  // Strip $schema + $id so Ajv 6.x (no draft 2020-12) compiles cleanly and
  // duplicate-$id guard does not fire on repeated validator construction.
  const { $schema: _s, $id: _i, ...schemaForAjv } = schema;
  _validator = ajv.compile(schemaForAjv);
  return _validator;
}

function describeAjvError(err) {
  // Field reference (e.g., '/screens/Home/status') first; surface keyword for context.
  const where = err.instancePath || err.dataPath || '';
  return `${where} ${err.keyword}: ${err.message}`.trim();
}

// Per AC5 + schema: planned/active/deprecated/removed.
// removed is terminal; everything else can transition to anything except going back to planned.
const STATUS_TRANSITIONS = {
  planned: ['active', 'deprecated', 'removed'],
  active: ['deprecated', 'removed'],
  deprecated: ['active', 'removed'],
  removed: []
};

function loadCatalog(catalogPath = DEFAULT_CATALOG_PATH) {
  if (!fs.existsSync(catalogPath)) {
    return { version: 1, screens: {} };
  }
  const raw = fs.readFileSync(catalogPath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Failed to parse catalog at ${catalogPath}: ${e.message}`);
  }
}

function saveCatalog(catalog, catalogPath = DEFAULT_CATALOG_PATH) {
  const out = { ...catalog, lastModified: new Date().toISOString() };
  const validate = getValidator();
  if (!validate(out)) {
    const detail = (validate.errors || []).map(describeAjvError).join('; ');
    throw new Error(`Invalid catalog — refusing to write: ${detail}`);
  }
  fs.writeFileSync(catalogPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
}

function upsertScreen(catalog, name, fields) {
  const next = { ...catalog, screens: { ...catalog.screens } };
  const existing = next.screens[name] || {};
  next.screens[name] = { ...existing, ...fields };
  return next;
}

function setStatus(catalog, name, newStatus) {
  const entry = catalog.screens[name];
  if (!entry) {
    throw new Error(`Screen not found: ${name}`);
  }
  const allowed = STATUS_TRANSITIONS[entry.status] || [];
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid status transition for ${name}: ${entry.status} → ${newStatus}`
    );
  }
  return upsertScreen(catalog, name, { status: newStatus });
}

function getNavigationGraph(catalog) {
  const graph = {};
  for (const [name, entry] of Object.entries(catalog.screens)) {
    graph[name] = Array.isArray(entry.navigatesTo) ? [...entry.navigatesTo] : [];
  }
  return graph;
}

function detectDrift(catalog, sourcesOnDisk = []) {
  const registrySources = new Set();
  const sourceToName = new Map();
  for (const [name, entry] of Object.entries(catalog.screens)) {
    if (entry.source) {
      registrySources.add(entry.source);
      sourceToName.set(entry.source, name);
    }
  }
  const diskSet = new Set(sourcesOnDisk);
  const missing = [];
  for (const src of registrySources) {
    if (!diskSet.has(src)) {
      missing.push(sourceToName.get(src));
    }
  }
  const fresh = sourcesOnDisk.filter(src => !registrySources.has(src));
  return { missing, new: fresh, changed: [] };
}

function formatDriftReport(drift) {
  const { missing = [], new: fresh = [], changed = [] } = drift || {};
  if (missing.length === 0 && fresh.length === 0 && changed.length === 0) {
    return 'Registry in sync with source — no drift detected.\n';
  }
  const lines = ['## Drift Report', ''];
  lines.push('### Missing (in registry, source removed)');
  lines.push(missing.length ? missing.map(n => `- ${n}`).join('\n') : '- (none)');
  lines.push('', '### New (in source, not in registry)');
  lines.push(fresh.length ? fresh.map(s => `- ${s}`).join('\n') : '- (none)');
  lines.push('', '### Changed (navigation or source path differs)');
  lines.push(changed.length ? changed.map(c => `- ${c}`).join('\n') : '- (none)');
  return lines.join('\n') + '\n';
}

module.exports = {
  loadCatalog,
  saveCatalog,
  upsertScreen,
  setStatus,
  getNavigationGraph,
  detectDrift,
  formatDriftReport,
  DEFAULT_CATALOG_PATH,
  STATUS_TRANSITIONS
};
