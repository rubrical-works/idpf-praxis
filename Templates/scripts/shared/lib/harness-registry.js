// Rubrical Works (c) 2026
/**
 * @framework-script 0.105.0
 * harness-registry.js — merge the shipped harness registry with a project's
 * local one (#2848).
 *
 * A project may ADD a language, ADD a role, REPLACE a shipped harness by id, or
 * HIDE one, without editing the hub. Those four intents are reconciled here,
 * and the `report` is what makes the outcome auditable: a merge that silently
 * dropped a shipped entry would be indistinguishable from one the project never
 * had.
 *
 * NEVER THROWS. The caller is charter-time selection, so a malformed local file
 * must degrade to the shipped registry with a warning rather than abort the
 * interview. Every failure is a `report.warnings` entry naming the file and the
 * error — a silent fallback would leave a project believing its local registry
 * was in force.
 *
 * PERMISSIVE ON THE LOCAL SIDE, deliberately. The shipped registry is validated
 * by a closed schema (#2847); the local one is not. An unknown role and an
 * unknown key are PRESERVED and SURFACED, because a project adding `smoke`, or
 * a vendor field, is the entire point of the file. Validating it with a strict
 * clone would reproduce #2596 one layer down.
 *
 * Node built-ins only, so it resolves from the hub in deployed projects
 * (`04-deployment-awareness.md` § Runtime Dependency Contract).
 */

'use strict';

const fs = require('fs');
const path = require('path');

/** Roles the shipped registry closes over. Anything else is local-only. */
const KNOWN_ROLES = Object.freeze(['unit', 'e2e', 'integration', 'compile-check']);

/** Harness keys the shipped schema defines, plus the local-only `hidden`. */
const KNOWN_HARNESS_KEYS = Object.freeze(['id', 'role', 'name', 'kind', 'full', 'scoped', 'hidden']);

const SHIPPED_REL = '.claude/metadata/test-harnesses.json';
const LOCAL_REL = '.claude/local-metadata/test-harnesses.json';

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));
const firstLine = (err) => String((err && err.message) || err).split('\n')[0];

/**
 * Merge a local registry over a shipped one.
 *
 * PURE, and the shipped input is never mutated — callers hold it from their own
 * config read, and mutating in place would make a second merge compound the
 * first.
 *
 * @returns {{merged: object, report: {warnings: string[], conflicts: string[],
 *   unknownRoles: string[], unknownKeys: string[], added: number,
 *   replaced: number, hidden: number}}}
 */
function mergeRegistries(shipped, local) {
  const report = {
    warnings: [], conflicts: [], unknownRoles: [], unknownKeys: [],
    added: 0, replaced: 0, hidden: 0,
  };

  const merged = isPlainObject(shipped) ? clone(shipped) : { languages: {}, platforms: {} };
  if (!isPlainObject(merged.languages)) merged.languages = {};
  if (!isPlainObject(merged.platforms)) merged.platforms = {};

  if (!isPlainObject(local)) {
    // `null`/`undefined` is the normal state — no local file. Anything else is
    // a malformed declaration and is reported rather than ignored.
    if (local !== null && local !== undefined) {
      report.warnings.push(
        `Local harness registry ignored: expected an object, got ${Array.isArray(local) ? 'array' : typeof local}.`
      );
    }
    return { merged, report };
  }

  const shippedVersion = isPlainObject(shipped) && isPlainObject(shipped._meta)
    ? shipped._meta.schemaVersion : undefined;
  const localVersion = isPlainObject(local._meta) ? local._meta.schemaVersion : undefined;
  if (typeof localVersion === 'number' && typeof shippedVersion === 'number'
      && localVersion < shippedVersion) {
    report.warnings.push(
      `Local harness registry declares schemaVersion ${localVersion}, older than the shipped `
      + `${shippedVersion}. Keys introduced since then are not recognised by that version and `
      + `were merged as written; review them against the current schema.`
    );
  }

  for (const group of ['languages', 'platforms']) {
    const localGroup = local[group];
    if (!isPlainObject(localGroup)) continue;

    for (const [entryName, roles] of Object.entries(localGroup)) {
      if (!isPlainObject(roles)) continue;
      if (!isPlainObject(merged[group][entryName])) merged[group][entryName] = {};

      for (const [role, list] of Object.entries(roles)) {
        if (!KNOWN_ROLES.includes(role) && !report.unknownRoles.includes(role)) {
          report.unknownRoles.push(role);
        }
        if (!Array.isArray(list)) continue;
        if (!Array.isArray(merged[group][entryName][role])) merged[group][entryName][role] = [];

        const target = merged[group][entryName][role];
        const where = `${group}.${entryName}.${role}`;

        for (const entry of list) {
          if (!isPlainObject(entry) || !entry.id) continue;

          for (const key of Object.keys(entry)) {
            if (KNOWN_HARNESS_KEYS.includes(key)) continue;
            const tag = `${entry.id}.${key}`;
            if (!report.unknownKeys.includes(tag)) report.unknownKeys.push(tag);
          }

          const idx = target.findIndex((h) => isPlainObject(h) && h.id === entry.id);

          if (entry.hidden === true) {
            if (idx === -1) {
              // A typo'd id would otherwise read as a successful hide while the
              // option kept appearing, with nothing to explain it.
              report.warnings.push(
                `Local harness registry hides "${entry.id}" in ${where}, but no shipped harness `
                + `with that id exists there. Nothing was removed.`
              );
              continue;
            }
            const body = Object.keys(entry).filter((k) => k !== 'id' && k !== 'hidden');
            if (body.length > 0) {
              report.conflicts.push(
                `"${entry.id}" in ${where} both replaces and hides. Hidden wins; the replacement `
                + `body was ignored.`
              );
            }
            target.splice(idx, 1);
            report.hidden += 1;
            continue;
          }

          if (idx === -1) {
            target.push(clone(entry));
            report.added += 1;
          } else {
            // IN POSITION: the prompt offers these in order, so a replacement
            // appended to the end would silently reorder what the user sees.
            target[idx] = clone(entry);
            report.replaced += 1;
          }
        }
      }
    }
  }

  return { merged, report };
}

/**
 * Read both registries from a project root and merge them.
 *
 * An ABSENT local file is not a warning — it is the normal state of every
 * project that has not customised selection. Only an unreadable or unparseable
 * one is.
 *
 * @returns {{merged: object, report: object}} Never throws.
 */
function loadMergedRegistry(cwd = process.cwd()) {
  const preWarnings = [];

  let shipped;
  try {
    shipped = JSON.parse(fs.readFileSync(path.join(cwd, SHIPPED_REL), 'utf8'));
  } catch (err) {
    shipped = { languages: {}, platforms: {} };
    preWarnings.push(
      `Shipped harness registry at ${SHIPPED_REL} could not be read: ${firstLine(err)}. `
      + `Selection has no harnesses to offer.`
    );
  }

  let local = null;
  const localPath = path.join(cwd, LOCAL_REL);
  try {
    if (fs.existsSync(localPath)) {
      local = JSON.parse(fs.readFileSync(localPath, 'utf8'));
    }
  } catch (err) {
    local = null;
    preWarnings.push(
      `Local harness registry at ${LOCAL_REL} could not be parsed: ${firstLine(err)}. `
      + `Falling back to the shipped registry.`
    );
  }

  const { merged, report } = mergeRegistries(shipped, local);
  report.warnings = preWarnings.concat(report.warnings);
  return { merged, report };
}

module.exports = {
  mergeRegistries,
  loadMergedRegistry,
  KNOWN_ROLES,
  KNOWN_HARNESS_KEYS,
  SHIPPED_REL,
  LOCAL_REL,
};
