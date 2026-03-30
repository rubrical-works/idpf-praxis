// Rubrical Works (c) 2026
/**
 * @framework-script 0.77.1
 * @description Persist skill suggestions from keyword matching to framework-config.json. Exports persistSuggestions(). Used by /create-prd and /create-backlog to bridge skill discovery with px-manager installation.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * lib/persist-skill-suggestions.js
 *
 * Schema for suggestedSkills entries:
 *   { skill: string, source: string, keywords: string[] }
 */

const fs = require('fs');

/**
 * Persist confirmed skill suggestions to framework-config.json.
 *
 * @param {string} configPath - Path to framework-config.json
 * @param {Array<{skill: string, matchedKeywords: string[]}>} suggestions - From skill-keyword-matcher
 * @param {string} source - Source reference (e.g., "#1905")
 * @returns {{ ok: boolean, added: number, skippedInstalled: number, skippedDuplicate: number, error?: string }}
 */
function persistSuggestions(configPath, suggestions, source) {
  if (!suggestions || suggestions.length === 0) {
    return { ok: true, added: 0, skippedInstalled: 0, skippedDuplicate: 0 };
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (err) {
    return { ok: false, added: 0, skippedInstalled: 0, skippedDuplicate: 0, error: `Failed to read ${configPath}: ${err.message}` };
  }

  const projectSkills = new Set(Array.isArray(config.projectSkills) ? config.projectSkills : []);
  const existing = Array.isArray(config.suggestedSkills) ? config.suggestedSkills : [];
  const existingNames = new Set(existing.map(s => s.skill));

  let added = 0;
  let skippedInstalled = 0;
  let skippedDuplicate = 0;

  for (const suggestion of suggestions) {
    if (projectSkills.has(suggestion.skill)) {
      skippedInstalled++;
      continue;
    }
    if (existingNames.has(suggestion.skill)) {
      skippedDuplicate++;
      continue;
    }

    existing.push({
      skill: suggestion.skill,
      source: source,
      keywords: suggestion.matchedKeywords || []
    });
    existingNames.add(suggestion.skill);
    added++;
  }

  if (added > 0) {
    config.suggestedSkills = existing;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  }

  return { ok: true, added, skippedInstalled, skippedDuplicate };
}

module.exports = { persistSuggestions };
