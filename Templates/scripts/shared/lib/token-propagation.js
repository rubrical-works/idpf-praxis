// Rubrical Works (c) 2026
/**
 * @framework-script 0.89.0
 * Token change propagation: find mockups that consumed changed tokens
 * and apply user decision (yes/no/select) about regeneration.
 *
 * AC36/AC37 — PRD #2333 Story 1.14. Refs #2352.
 *
 * tokenDependencies field (AC37) is part of screen-catalog-schema.json
 * (#2339); /mockups populates it on generation (#2344).
 */

'use strict';

function findAffectedMockups(catalog, changedKeys) {
  const set = new Set(changedKeys || []);
  const affected = [];
  for (const [name, entry] of Object.entries(catalog?.screens || {})) {
    const deps = Array.isArray(entry.tokenDependencies) ? entry.tokenDependencies : [];
    if (deps.some(k => set.has(k))) affected.push(name);
  }
  return { affected, count: affected.length };
}

function applyPropagationDecision(affected, choice) {
  if (!choice || typeof choice !== 'object') {
    throw new Error('choice required');
  }
  const decision = choice.decision;
  if (decision === 'yes') return { regenerate: [...affected] };
  if (decision === 'no') return { regenerate: [] };
  if (decision === 'select') {
    const sel = new Set(Array.isArray(choice.selected) ? choice.selected : []);
    return { regenerate: affected.filter(n => sel.has(n)) };
  }
  throw new Error(`unknown decision: ${decision}`);
}

module.exports = { findAffectedMockups, applyPropagationDecision };
