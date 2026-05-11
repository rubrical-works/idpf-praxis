// Rubrical Works (c) 2026
/**
 * @framework-script 0.91.1
 * Apply user decision to screenshot-extracted token candidates.
 * AC32: candidates presented before write, user can reject / accept all / select subset.
 * Refs #2349 (PRD #2333 Story 1.11)
 */

'use strict';

function applyCandidateSelection(candidates, choice) {
  if (!choice || typeof choice !== 'object') {
    throw new Error('choice required');
  }
  const decision = choice.decision;
  if (decision === 'reject') {
    return { tokens: {}, applied: 0 };
  }
  if (decision === 'accept') {
    let applied = 0;
    for (const group of Object.values(candidates || {})) {
      applied += Object.keys(group || {}).length;
    }
    // Deep clone to prevent caller from mutating source
    return { tokens: JSON.parse(JSON.stringify(candidates)), applied };
  }
  if (decision === 'partial') {
    const selected = Array.isArray(choice.selected) ? choice.selected : [];
    const out = {};
    let applied = 0;
    for (const dotted of selected) {
      const [groupName, tokenName] = dotted.split('.');
      const candidate = candidates?.[groupName]?.[tokenName];
      if (!candidate) continue; // unknown path silently skipped
      if (!out[groupName]) out[groupName] = {};
      out[groupName][tokenName] = JSON.parse(JSON.stringify(candidate));
      applied++;
    }
    return { tokens: out, applied };
  }
  throw new Error(`unknown decision: ${decision}`);
}

module.exports = { applyCandidateSelection };
