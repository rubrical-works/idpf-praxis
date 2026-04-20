// Rubrical Works (c) 2026
/**
 * @framework-script 0.89.0
 * Token drift report aggregator + formatter + selective apply.
 * AC33/AC34/AC38/AC39 — PRD #2333 Story 1.12. Refs #2350.
 *
 * Adapter contract (AC38):
 *   diff(projectRoot, currentTokens) → {
 *     name: string,
 *     additions: [{ path, $value, $type? }],
 *     removals: [{ path }],
 *     mismatches: [{ path, current, incoming }],
 *     brokenAliases: [{ path, alias }]
 *   }
 */

'use strict';

const CATEGORIES = ['additions', 'removals', 'mismatches', 'brokenAliases'];

function buildDriftReport(adapterDiffs) {
  const out = { additions: [], removals: [], mismatches: [], brokenAliases: [] };
  for (const d of adapterDiffs || []) {
    for (const cat of CATEGORIES) {
      for (const item of d[cat] || []) {
        out[cat].push({ adapter: d.name, ...item });
      }
    }
  }
  return out;
}

function formatDriftReport(report) {
  const total = CATEGORIES.reduce((n, c) => n + (report[c]?.length || 0), 0);
  if (total === 0) return 'No drift detected — tokens in sync with source.\n';
  const lines = ['## Token Drift Report', ''];
  function section(label, items, render) {
    lines.push(`### ${label} (${items.length})`);
    if (items.length === 0) {
      lines.push('- (none)');
    } else {
      for (const it of items) lines.push(`- ${render(it)}`);
    }
    lines.push('');
  }
  section('Additions', report.additions, i => `[${i.adapter}] \`${i.path}\``);
  section('Removals', report.removals, i => `[${i.adapter}] \`${i.path}\``);
  section('Mismatches', report.mismatches, i => `[${i.adapter}] \`${i.path}\`: ${i.current} → ${i.incoming}`);
  section('Broken aliases', report.brokenAliases, i => `[${i.adapter}] \`${i.path}\` → ${i.alias}`);
  return lines.join('\n') + '\n';
}

function applySelectedDiff(report, selection) {
  const sel = selection || {};
  const applied = { additions: [], removals: [], mismatches: [] };
  const deferred = { additions: [], removals: [], mismatches: [] };
  for (const cat of ['additions', 'removals', 'mismatches']) {
    const chosen = new Set(sel[cat] || []);
    for (const item of report[cat] || []) {
      if (chosen.has(item.path)) applied[cat].push(item);
      else deferred[cat].push(item);
    }
  }
  return { applied, deferred };
}

module.exports = { buildDriftReport, formatDriftReport, applySelectedDiff };
