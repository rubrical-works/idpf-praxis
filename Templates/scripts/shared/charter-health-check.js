#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.120.0
 * @description Session-start charter health check (#3423, #3644, #3647). Derives the Key Entities counts with charter-entities.js and checks charter shape and the legacy shape with charter-shape.js; the row carries a one-line derived count summary and names /charter --refresh on a shape finding or a legacy shape. Read-only and advisory: never writes CHARTER.md, never prompts.
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
 * NO STORED COUNT IS CHECKED (#3644). The charter stores no count, so there is
 * nothing on disk to disagree with: the row reports the counts derived now, as
 * information. The count-mismatch and prose-count findings are retired with
 * the stored counts.
 *
 * WHAT COUNTS AS A FINDING — something `/charter --refresh` repairs: a
 * charter-shape finding, except the stale-version signal, which would fire
 * from each release until the next refresh (the habituation #2930 removed);
 * and the legacy shape (#3647) — a retired section, a missing founding
 * section, a stored count or version, the old lifecycle directory — from
 * charter-shape.js detectLegacyShape. The legacy shape is reported every
 * session until repaired, naming only what remains, so a partly accepted
 * repair shrinks the row and a hand edit that brings a count back is caught
 * the next session.
 *
 * LOCAL READS ONLY (#3647): the detection and the count summary read files —
 * no child process, no network — and run inside the startup hook's staged
 * timeout ladder, where this script is one child.
 *
 * NO WARNING IS AN ALL-CLEAR ONLY WHEN SOMETHING WAS LOOKED AT. A charter that
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
 * @param {{latestTag?: string|null}} [opts] - forwarded to the shape analyzer
 *   when a caller supplies one (default null; this function reads no tag
 *   itself). The stale-version finding it may produce is still excluded.
 */
function checkCharterHealth(cwd, opts = {}) {
  let text;
  try {
    text = fs.readFileSync(path.join(cwd, 'CHARTER.md'), 'utf8');
  } catch (err) {
    return { state: 'undetermined', reason: 'charter-unreadable', detail: firstLine(err), summary: null, shape: [], legacy: [] };
  }
  try {
    const { extractEntities, deriveEntityCounts, summarizeCounts } = require('./charter-entities.js');
    const { analyzeCharterShape, detectLegacyShape } = require('./lib/charter-shape.js');

    const entities = extractEntities(text);
    const summary = Object.keys(entities).length ? summarizeCounts(deriveEntityCounts(entities, { root: cwd })) : null;

    // latestTag defaults to null, so no git call is spent on staleness; a
    // caller-supplied tag is forwarded, and the stale-version finding it may
    // yield is filtered out below by EXCLUDED_SHAPE_KINDS (#3671).
    const report = analyzeCharterShape(text, { latestTag: opts.latestTag === undefined ? null : opts.latestTag });
    const shape = (report.findings || []).filter((f) => !EXCLUDED_SHAPE_KINDS.has(f.kind));
    // #3647: the legacy shape, reported every session until repaired. Only
    // what remains is listed, so a partly accepted repair shrinks the row.
    const legacy = detectLegacyShape(text, cwd).items;

    return { state: shape.length || legacy.length ? 'findings' : 'clean', summary, shape, legacy };
  } catch (err) {
    return { state: 'undetermined', reason: 'check-failed', detail: firstLine(err), summary: null, shape: [], legacy: [] };
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
  if (r.state !== 'findings') return { health: r.summary || null };
  const parts = [];
  if ((r.legacy || []).length) {
    // #3671: a summarizer failure must not escape — the row still names the
    // legacy shape and the remedy, never no row at all.
    try {
      const { summarizeLegacyItems } = require('./lib/charter-shape.js');
      parts.push(`legacy shape: ${summarizeLegacyItems(r.legacy).join('; ')}`);
    } catch (_err) {
      parts.push('legacy shape present');
    }
  }
  if ((r.shape || []).length) parts.push(`shape: ${[...new Set(r.shape.map((f) => f.kind))].join(', ')}`);
  const finding = `⚠️ ${parts.join('; ')} — remedy: ${REMEDY}`;
  return { health: r.summary ? `${finding} · ${r.summary}` : finding };
}

module.exports = { checkCharterHealth, formatRows, EXCLUDED_SHAPE_KINDS };

if (require.main === module) {
  const result = checkCharterHealth(process.cwd());
  process.stdout.write(JSON.stringify({ success: true, data: { ...result, rows: formatRows(result) } }) + '\n');
}
