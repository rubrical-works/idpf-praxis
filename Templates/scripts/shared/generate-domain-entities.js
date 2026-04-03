#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.80.0
 * @description Generate domain-entities.json from CHARTER.md content.
 * Parses charter markdown to extract bounded context, entities,
 * scope boundaries, and drift signals into a machine-readable format.
 * @checksum sha256:placeholder
 */

/**
 * Generate domain-entities.json content from charter markdown.
 * @param {string|null} charterContent - Raw markdown content of CHARTER.md
 * @param {string} projectVersion - Current project version
 * @returns {object} Domain entities object (or { error: string } on failure)
 */
function generateFromCharter(charterContent, projectVersion) {
  if (!charterContent || typeof charterContent !== 'string' || charterContent.trim() === '') {
    return { error: 'Charter content is empty or invalid' };
  }

  // Validate this looks like a charter (must have # heading)
  if (!charterContent.match(/^#\s+/m)) {
    return { error: 'Content does not appear to be a valid charter (no markdown headings found)' };
  }

  // Extract project name from title
  const titleMatch = charterContent.match(/^#\s+Project Charter:\s*(.+)/m);
  if (!titleMatch) {
    return { error: 'Charter title not found (expected "# Project Charter: <name>")' };
  }
  const projectName = titleMatch[1].trim();

  // Extract vision
  const vision = extractSection(charterContent, 'Vision');

  // Extract scope boundaries
  const inScope = extractListItems(charterContent, 'In Scope');
  const outOfScope = extractListItems(charterContent, 'Out of Scope');

  // Extract entities from Key Entities table
  const entities = extractEntities(charterContent);

  // Build drift signals from scope
  const driftSignals = buildDriftSignals(outOfScope);

  // Build validation rules from entities
  const validationRules = buildValidationRules(entities);

  const today = new Date().toISOString().slice(0, 10);

  return {
    generatedFrom: 'CHARTER.md',
    generatedAt: today,
    projectVersion: projectVersion || 'unknown',
    boundedContext: {
      name: projectName,
      purpose: vision || 'To be documented',
      boundary: outOfScope.length > 0
        ? outOfScope[0]
        : 'Not yet defined'
    },
    entities,
    scopeBoundaries: {
      inScope,
      outOfScope
    },
    driftSignals,
    validationRules
  };
}

/**
 * Extract a section's text content (first paragraph after heading).
 */
function extractSection(content, heading) {
  const regex = new RegExp(`^##\\s+${escapeRegex(heading)}[\\s\\S]*?\\n\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'm');
  const match = content.match(regex);
  if (!match) return '';
  // Return first non-empty line
  const lines = match[1].trim().split('\n').filter(l => l.trim() && !l.startsWith('|') && !l.startsWith('-'));
  return lines[0] ? lines[0].trim() : '';
}

/**
 * Extract list items from a section (lines starting with -).
 */
function extractListItems(content, heading) {
  // Try exact heading first, then with parenthetical suffix
  const patterns = [
    new RegExp(`^##\\s+${escapeRegex(heading)}(?:\\s*\\([^)]*\\))?\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'm'),
    new RegExp(`^##\\s+[^\\n]*${escapeRegex(heading)}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'mi')
  ];

  for (const regex of patterns) {
    const match = content.match(regex);
    if (match) {
      return match[1]
        .split('\n')
        .filter(line => line.match(/^\s*-\s/))
        .map(line => line.replace(/^\s*-\s+/, '').trim());
    }
  }
  return [];
}

/**
 * Extract entities from a Key Entities markdown table.
 */
function extractEntities(content) {
  const entities = {};
  // Find the Key Entities section and extract the table
  const sectionMatch = content.match(/##\s+Key Entities[^\n]*\n([\s\S]*?)(?=\n##\s|$)/m);
  if (!sectionMatch) return entities;
  const tableLines = sectionMatch[1].split('\n').filter(l => l.startsWith('|'));
  const tableMatch = tableLines.length >= 3 ? [null, tableLines.join('\n') + '\n'] : null;

  if (!tableMatch) return entities;

  const rows = tableLines;
  // Skip header and separator rows
  for (let i = 2; i < rows.length; i++) {
    const cells = rows[i].split('|').map(c => c.trim()).filter(c => c);
    if (cells.length >= 2) {
      const name = cells[0];
      const key = name.toLowerCase().replace(/\s+/g, '-');
      const entity = { description: name };

      // Parse count if present
      if (cells[1] && cells[1].match(/^\d+$/)) {
        entity.count = parseInt(cells[1], 10);
      }

      // Parse location if present
      if (cells[2]) {
        const location = cells[2].replace(/`/g, '').trim();
        if (location) {
          entity.locations = [location];
        }
      }

      entity.relationships = [];
      entities[key] = entity;
    }
  }

  return entities;
}

/**
 * Build drift signals from out-of-scope items.
 */
function buildDriftSignals(outOfScope) {
  const entityOutOfBounds = outOfScope.map(item => ({
    signal: `Story involves: ${item}`,
    severity: 'error'
  }));

  return {
    entityOutOfBounds,
    scopeExpansion: []
  };
}

/**
 * Build validation rules from entities that have counts.
 */
function buildValidationRules(entities) {
  const rules = [];
  for (const [key, entity] of Object.entries(entities)) {
    if (entity.count) {
      rules.push({
        type: 'count-range',
        entity: key,
        description: `Expected count for ${key}`,
        min: Math.max(1, entity.count - Math.ceil(entity.count * 0.2)),
        max: entity.count + Math.ceil(entity.count * 0.2)
      });
    }
    if (entity.locations && entity.locations.length > 0) {
      rules.push({
        type: 'location-exists',
        entity: key,
        description: `Location must exist for ${key}`
      });
    }
  }
  return rules;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { generateFromCharter };
