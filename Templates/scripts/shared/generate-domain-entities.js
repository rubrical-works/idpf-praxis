#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.81.0
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

  // Extract companion repositories as external entities
  extractCompanionRepos(charterContent, entities);

  // Infer relationships between entities from charter content
  inferRelationships(entities, charterContent);

  // Build drift signals from scope (including expansion signals)
  const driftSignals = buildDriftSignals(outOfScope, entities);

  // Build validation rules from entities
  const validationRules = buildValidationRules(entities);

  // Extract architecture description
  const architecture = extractArchitecture(charterContent);

  // Extract current focus items
  const currentFocus = extractListItems(charterContent, 'Current Focus');

  const today = new Date().toISOString().slice(0, 10);

  return {
    generatedFrom: 'CHARTER.md',
    generatedAt: today,
    projectVersion: projectVersion || 'unknown',
    boundedContext: {
      name: projectName,
      purpose: vision || 'To be documented',
      boundary: buildBoundary(projectName, inScope)
    },
    entities,
    architecture,
    currentFocus,
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
  const regex = new RegExp(`^##\\s+${escapeRegex(heading)}[\\s\\S]*?\\n\\n([\\s\\S]*?)(?=\\n##\\s)`, 'm');
  let match = content.match(regex);
  // Fallback: heading is the last section (no following ## heading)
  if (!match) {
    const fallback = new RegExp(`^##\\s+${escapeRegex(heading)}[\\s\\S]*?\\n\\n([\\s\\S]*)`, 'm');
    match = content.match(fallback);
  }
  if (!match) return '';
  // Return first non-empty line
  const lines = match[1].trim().split('\n').filter(l => l.trim() && !l.startsWith('|') && !l.startsWith('-'));
  return lines[0] ? lines[0].trim() : '';
}

/**
 * Extract list items from a section (lines starting with -).
 */
function extractListItems(content, heading) {
  const esc = escapeRegex(heading);
  // Try exact heading (bounded by next ## or end of string), then with parenthetical suffix
  const patterns = [
    new RegExp(`^##\\s+${esc}(?:\\s*\\([^)]*\\))?\\s*\\n([\\s\\S]*?)(?=\\n##\\s)`, 'm'),
    new RegExp(`^##\\s+${esc}(?:\\s*\\([^)]*\\))?\\s*\\n([\\s\\S]*)`, 'm'),
    new RegExp(`^##\\s+[^\\n]*${esc}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s)`, 'mi'),
    new RegExp(`^##\\s+[^\\n]*${esc}[^\\n]*\\n([\\s\\S]*)`, 'mi')
  ];

  for (const regex of patterns) {
    const match = content.match(regex);
    if (match && match[1].trim()) {
      const items = match[1]
        .split('\n')
        .filter(line => line.match(/^\s*-\s/))
        .map(line => line.replace(/^\s*-\s+/, '').trim());
      if (items.length > 0) return items;
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
  let sectionMatch = content.match(/##\s+Key Entities[^\n]*\n([\s\S]*?)(?=\n##\s)/);
  // Fallback: Key Entities is the last section
  if (!sectionMatch) {
    sectionMatch = content.match(/##\s+Key Entities[^\n]*\n([\s\S]*)/);
  }
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

      // Parse location if present — split comma-separated locations
      // Only split on commas outside parentheses to preserve annotations
      if (cells[2]) {
        const locationRaw = cells[2].replace(/`/g, '').trim();
        if (locationRaw) {
          const { locations, exclude } = parseLocationWithExclusions(locationRaw);
          entity.locations = locations;
          if (exclude.length > 0) {
            entity.countSource = { exclude };
          }
        }
      }

      entity.relationships = [];
      entities[key] = entity;
    }
  }

  return entities;
}

/**
 * Extract companion repositories from a Companion Repositories table
 * and add them as external entities.
 */
function extractCompanionRepos(content, entities) {
  let sectionMatch = content.match(/###?\s+Companion Repositories[^\n]*\n([\s\S]*?)(?=\n##\s)/);
  if (!sectionMatch) {
    sectionMatch = content.match(/###?\s+Companion Repositories[^\n]*\n([\s\S]*)/);
  }
  if (!sectionMatch) return;

  const tableLines = sectionMatch[1].split('\n').filter(l => l.startsWith('|'));
  // Skip header and separator
  for (let i = 2; i < tableLines.length; i++) {
    const cells = tableLines[i].split('|').map(c => c.trim()).filter(c => c);
    if (cells.length >= 2) {
      const repoName = cells[0].replace(/`/g, '').trim();
      const key = repoName.toLowerCase().replace(/\s+/g, '-');
      const responsibility = cells[1] || '';
      const relationship = cells[2] || '';

      entities[key] = {
        description: `${repoName} — ${responsibility}`,
        external: true,
        locations: [repoName],
        relationships: []
      };

      // If relationship column mentions a connection, try to infer
      if (relationship) {
        for (const [entityKey, entity] of Object.entries(entities)) {
          if (entityKey === key || entity.external) continue;
          const desc = entity.description.toLowerCase();
          if (relationship.toLowerCase().includes(desc) ||
              desc.split(/\s+/).some(w => w.length > 4 && relationship.toLowerCase().includes(w))) {
            entities[key].relationships.push({
              type: 'interacts-with',
              target: entityKey,
              evidence: relationship
            });
            break;
          }
        }
      }
    }
  }
}

/**
 * Extract the Architecture section content (code blocks and text).
 */
function extractArchitecture(content) {
  let match = content.match(/##\s+Architecture[^\n]*\n([\s\S]*?)(?=\n##\s)/);
  if (!match) {
    match = content.match(/##\s+Architecture[^\n]*\n([\s\S]*)/);
  }
  if (!match) return '';
  return match[1].trim();
}

/**
 * Infer relationships between entities based on charter content.
 * Detects textual cross-references in location descriptions and
 * entity name mentions in other entities' context.
 */
function inferRelationships(entities, charterContent) {
  const entityKeys = Object.keys(entities);
  const entityNames = {};
  for (const [key, entity] of Object.entries(entities)) {
    entityNames[key] = entity.description.toLowerCase();
  }

  // Find the Key Entities table section for location text analysis
  let tableSection = '';
  const sectionMatch = charterContent.match(/##\s+Key Entities[^\n]*\n([\s\S]*?)(?=\n##\s)/);
  if (sectionMatch) tableSection = sectionMatch[1].toLowerCase();

  for (const [key, entity] of Object.entries(entities)) {
    const locationText = (entity.locations || []).join(' ').toLowerCase();
    const entityRow = getEntityRow(tableSection, entity.description);

    for (const [otherKey, otherEntity] of Object.entries(entities)) {
      if (key === otherKey) continue;
      const otherName = otherEntity.description.toLowerCase();
      const otherNameWords = otherName.split(/\s+/);

      // Check if this entity's location/row text references another entity
      const searchText = entityRow || locationText;

      // Match multi-word entity names (e.g., "extensible commands" ≈ "slash commands")
      if (containsEntityReference(searchText, otherKey, otherNameWords)) {
        const existing = entity.relationships.find(r => r.target === otherKey);
        if (!existing) {
          entity.relationships.push({
            type: inferRelationshipType(key, otherKey, searchText),
            target: otherKey,
            evidence: `Location/context references ${otherEntity.description}`
          });
        }
      }

      // Check location containment (parent-child by path prefix)
      if (entity.locations && otherEntity.locations) {
        for (const loc of entity.locations) {
          const cleanLoc = loc.replace(/\s*\([^)]*\)\s*$/, '').trim();
          for (const otherLoc of otherEntity.locations) {
            const cleanOtherLoc = otherLoc.replace(/\s*\([^)]*\)\s*$/, '').trim();
            if (cleanLoc !== cleanOtherLoc && cleanOtherLoc.startsWith(cleanLoc) && cleanLoc.endsWith('/')) {
              const existing = entity.relationships.find(r => r.target === otherKey && r.type === 'contains');
              if (!existing) {
                entity.relationships.push({
                  type: 'contains',
                  target: otherKey,
                  evidence: `${cleanLoc} is parent of ${cleanOtherLoc}`
                });
              }
            }
          }
        }
      }
    }
  }
}

/**
 * Get the raw table row text for a given entity from the charter table section.
 */
function getEntityRow(tableSection, description) {
  const descLower = description.toLowerCase();
  const lines = tableSection.split('\n');
  for (const line of lines) {
    if (line.includes(descLower)) return line;
  }
  return '';
}

/**
 * Check if text contains a reference to an entity by key or name words.
 */
function containsEntityReference(text, entityKey, nameWords) {
  // Direct key match (e.g., "slash-commands")
  if (text.includes(entityKey)) return true;
  // Match significant name words (skip very short/common words)
  const significant = nameWords.filter(w => w.length > 3);
  if (significant.length === 0) return false;
  // Require at least one significant word match
  return significant.some(word => text.includes(word));
}

/**
 * Infer relationship type from context.
 */
function inferRelationshipType(sourceKey, targetKey, context) {
  if (context.includes('across') || context.includes('within')) return 'distributed-across';
  if (context.includes('target') || context.includes('for')) return 'targets';
  if (context.includes('import') || context.includes('from')) return 'imports-from';
  return 'references';
}

/**
 * Build drift signals from out-of-scope items and entity validation rules.
 */
function buildDriftSignals(outOfScope, entities) {
  const entityOutOfBounds = outOfScope.map(item => ({
    signal: `Story involves: ${item}`,
    severity: 'error'
  }));

  // Scope expansion signals — warn when entity counts or structure grow
  const scopeExpansion = [
    {
      signal: 'Entity count exceeds validation max range',
      severity: 'warning'
    },
    {
      signal: 'New directory or file location not in known entity locations',
      severity: 'warning'
    },
    {
      signal: 'Entity introduced that is not in charter Key Entities table',
      severity: 'warning'
    }
  ];

  return {
    entityOutOfBounds,
    scopeExpansion
  };
}

/**
 * Build validation rules from entities that have counts.
 */
/**
 * Build validation rules from entities with adaptive ranges.
 * @param {object} entities - Current entities
 * @param {object} [previousEntities] - Previous generation's entities (for growth rate)
 */
function buildValidationRules(entities, previousEntities) {
  const rules = [];
  for (const [key, entity] of Object.entries(entities)) {
    if (entity.count) {
      // Check for explicit min/max override
      if (entity.validationOverride && entity.validationOverride.min != null && entity.validationOverride.max != null) {
        const rule = {
          type: 'count-range',
          entity: key,
          description: `Expected count for ${key}`,
          min: entity.validationOverride.min,
          max: entity.validationOverride.max
        };
        if (entity.lastVerified) rule.lastVerified = entity.lastVerified;
        rules.push(rule);
      } else {
        // Calculate adaptive range based on growth rate
        const margin = calculateMargin(entity.count, key, previousEntities);
        const rule = {
          type: 'count-range',
          entity: key,
          description: `Expected count for ${key}`,
          min: Math.max(1, entity.count - Math.ceil(entity.count * margin)),
          max: entity.count + Math.ceil(entity.count * margin)
        };
        if (entity.lastVerified) rule.lastVerified = entity.lastVerified;
        rules.push(rule);
      }
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

/**
 * Calculate the range margin based on entity growth rate.
 * Stable (< 5% growth): ±20%, Medium (5-15%): ±30%, Fast (> 15%): ±40%
 * Default (no previous data): ±20%
 */
function calculateMargin(currentCount, entityKey, previousEntities) {
  if (!previousEntities || !previousEntities[entityKey] || !previousEntities[entityKey].count) {
    return 0.2; // Default ±20%
  }
  const prevCount = previousEntities[entityKey].count;
  if (prevCount === 0) return 0.2;
  const growthRate = Math.abs(currentCount - prevCount) / prevCount;
  if (growthRate > 0.15) return 0.4;  // Fast growth
  if (growthRate > 0.05) return 0.3;  // Medium growth
  return 0.2;                          // Stable
}

/**
 * Parse a location string, extracting exclusion annotations.
 * "Domains/ (excludes Guides/, Templates/)" → { locations: ["Domains/"], exclude: ["Guides/", "Templates/"] }
 * ".claude/commands/ (19 extensible, 19 managed)" → { locations: [".claude/commands/ (19 extensible, 19 managed)"], exclude: [] }
 */
function parseLocationWithExclusions(locationRaw) {
  // Match "(excludes X, Y)" or "(excludes X)" pattern
  const excludeMatch = locationRaw.match(/\(excludes?\s+([^)]+)\)/i);
  if (excludeMatch) {
    // Remove the exclusion annotation from the location string
    const cleaned = locationRaw.replace(/\s*\(excludes?\s+[^)]+\)/, '').trim();
    const exclude = excludeMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    return {
      locations: splitOutsideParens(cleaned),
      exclude
    };
  }
  return {
    locations: splitOutsideParens(locationRaw),
    exclude: []
  };
}

/**
 * Split a string on commas, but only those outside parentheses.
 * "IDPF-Agile/, IDPF-Vibe/" → ["IDPF-Agile/", "IDPF-Vibe/"]
 * ".claude/commands/ (19 extensible, 19 managed)" → [".claude/commands/ (19 extensible, 19 managed)"]
 */
function splitOutsideParens(str) {
  const parts = [];
  let current = '';
  let depth = 0;
  for (const ch of str) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      current = '';
      continue;
    }
    current += ch;
  }
  const trimmed = current.trim();
  if (trimmed) parts.push(trimmed);
  return parts;
}

/**
 * Build a boundary description from the project name and in-scope items.
 * Summarizes what the project IS (its perimeter), rather than picking
 * an arbitrary out-of-scope item.
 */
function buildBoundary(projectName, inScope) {
  if (inScope.length === 0) {
    return `${projectName} — scope not yet defined`;
  }
  // Take up to 3 in-scope items, strip leading qualifiers for brevity
  const items = inScope.slice(0, 3).map(item => {
    // Remove trailing parenthetical details for conciseness
    return item.replace(/\s*\([^)]*\)\s*$/, '').trim();
  });
  const summary = items.join('; ');
  const suffix = inScope.length > 3 ? ` (+${inScope.length - 3} more)` : '';
  return `${projectName}: ${summary}${suffix}`;
}

/**
 * Verify entity counts against the filesystem.
 * For each entity with both `count` and `locations`, counts actual items
 * on disk and compares against the charter count.
 * @param {object} entities - Entities object from generateFromCharter output
 * @returns {Array<{entity, charterCount, actualCount, match, excludesApplied}>}
 */
function verifyEntityCounts(entities) {
  const fs = require('fs');
  const path = require('path');
  const results = [];

  for (const [key, entity] of Object.entries(entities)) {
    if (!entity.count || !entity.locations || entity.locations.length === 0) continue;

    let totalCount = 0;
    const excludes = (entity.countSource && entity.countSource.exclude) || [];
    const excludesApplied = excludes.length > 0;

    for (const location of entity.locations) {
      // Strip parenthetical annotations for path resolution
      const cleanLoc = location.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const fullPath = path.resolve(cleanLoc);

      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          // Count immediate children (files or subdirectories)
          let entries = fs.readdirSync(fullPath);
          if (excludes.length > 0) {
            const excludeNames = excludes.map(e => e.replace(/\/$/, ''));
            entries = entries.filter(e => !excludeNames.includes(e));
          }
          totalCount += entries.length;
        }
      } catch {
        // Location doesn't exist on disk — skip
      }
    }

    results.push({
      entity: key,
      charterCount: entity.count,
      actualCount: totalCount,
      match: entity.count === totalCount,
      excludesApplied
    });
  }

  return results;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { generateFromCharter, verifyEntityCounts, buildValidationRules };
