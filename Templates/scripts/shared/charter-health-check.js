#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.115.0
 * @description Session-start charter health check (#3423). Verifies Key Entities and prose counts with charter-entities.js and charter shape with charter-shape.js, and emits a row only on a finding, naming /charter --refresh. Read-only and advisory: never writes CHARTER.md, never prompts.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * REPLACES A JUDGMENT CALL. The startup hook used to ask the model to "note any
 * mismatch between the charter and current repository state" every session.
 * On an active project that is effectively unconditional, so it fired nearly
 * every session and trained the reader to ignore it (#2930, after #2577). This
 * check makes the same observation from named, reported calls instead.
 *
 * WHAT COUNTS AS A FINDING. Each is something `/charter --refresh` repairs:
 *   - a Key Entities count disagreeing with disk — except a counting-rule
 *     artifact (an entity with declared exclusions or an annotated location,
 *     where the immediate-children count is known not to be the charter's
 *     count), and except an unresolvable location, which is no evidence;
 *   - a prose count disagreeing with the Key Entities table (`drift`);
 *   - a charter-shape finding — except the stale-version signal: it would fire
 *     from each release until the next refresh, the habituation #2930
 *     removed. It stays a `/charter --refresh` shape-step finding only.
 *
 * NO ROW IS AN ALL-CLEAR ONLY WHEN SOMETHING WAS LOOKED AT. A charter that
 * cannot be read, or a helper that throws, reports `undetermined` — a row
 * saying the check could not run — never `clean`.
 *
 * Node built-ins and colocated files only (runtime dependency contract, rule 04).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REMEDY = '/charter --refresh';
const EXCLUDED_SHAPE_KINDS = new Set(['stale-version']);

function firstLine(err) {
  return String((err && err.message) || err).split('\n')[0];
}

/**
 * @param {string} cwd - Project root
 * @param {{latestTag?: string|null}} [opts] - accepted for parity with the
 *   shape analyzer; staleness is excluded either way, so no tag is read.
 */
function checkCharterHealth(cwd, opts = {}) {
  let text;
  try {
    text = fs.readFileSync(path.join(cwd, 'CHARTER.md'), 'utf8');
  } catch (err) {
    return { state: 'undetermined', reason: 'charter-unreadable', detail: firstLine(err), counts: [], prose: [], shape: [] };
  }
  try {
    const { extractEntities, verifyEntityCounts, scanOutOfTableCounts } = require('./charter-entities.js');
    const { analyzeCharterShape } = require('./lib/charter-shape.js');

    const entities = extractEntities(text);
    const results = verifyEntityCounts(entities, { root: cwd });
    const isArtifact = (key) => {
      const e = entities[key] || {};
      const excludes = e.countSource && Array.isArray(e.countSource.exclude) && e.countSource.exclude.length > 0;
      return excludes || (Array.isArray(e.locations) && e.locations.some((l) => String(l).includes('(')));
    };
    const counts = results
      .filter((r) => r.match === false && r.resolved !== false && !isArtifact(r.entity))
      .map((r) => ({ entity: r.entity, description: (entities[r.entity] || {}).description || r.entity, charterCount: r.charterCount, actualCount: r.actualCount }));

    const prose = scanOutOfTableCounts(text, entities, results)
      .filter((c) => c.classification === 'drift')
      .map((c) => ({ entity: c.entity, description: (entities[c.entity] || {}).description || c.entity, line: c.line, statedCount: c.statedCount, tableCount: c.tableCount }));

    // latestTag: null — staleness is excluded below, so no git call is spent on it.
    const report = analyzeCharterShape(text, { latestTag: opts.latestTag === undefined ? null : opts.latestTag });
    const shape = (report.findings || []).filter((f) => !EXCLUDED_SHAPE_KINDS.has(f.kind));

    const state = counts.length || prose.length || shape.length ? 'findings' : 'clean';
    return { state, counts, prose, shape };
  } catch (err) {
    return { state: 'undetermined', reason: 'check-failed', detail: firstLine(err), counts: [], prose: [], shape: [] };
  }
}

/**
 * The row text the startup hook renders verbatim. `null` means no row.
 * Owned here so the wording has one home; the hook only prefixes the label.
 */
function formatRows(result) {
  const r = result || {};
  if (r.state === 'undetermined') {
    return { health: `⚠️ check could not run (${r.reason}${r.detail ? `: ${r.detail}` : ''}) — the absence of information, not an all-clear` };
  }
  if (r.state !== 'findings') return { health: null };
  const parts = [];
  if (r.counts.length) {
    parts.push(`${r.counts.length} count mismatch(es): ${r.counts.map((c) => `${c.description} ${c.charterCount} → ${c.actualCount} on disk`).join(', ')}`);
  }
  if (r.prose.length) {
    parts.push(`${r.prose.length} prose count(s) disagree with the Key Entities table (${r.prose.map((p) => `${p.description} L${p.line}: ${p.statedCount} vs ${p.tableCount}`).join(', ')})`);
  }
  if (r.shape.length) {
    parts.push(`shape: ${[...new Set(r.shape.map((f) => f.kind))].join(', ')}`);
  }
  return { health: `⚠️ ${parts.join('; ')} — remedy: ${REMEDY}` };
}

module.exports = { checkCharterHealth, formatRows, EXCLUDED_SHAPE_KINDS };

if (require.main === module) {
  const result = checkCharterHealth(process.cwd());
  process.stdout.write(JSON.stringify({ success: true, data: { ...result, rows: formatRows(result) } }) + '\n');
}
