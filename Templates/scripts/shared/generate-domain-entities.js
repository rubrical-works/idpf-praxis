#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.98.0
 * @description Generate domain-entities.json from CHARTER.md content.
 * Parses charter markdown to extract bounded context, entities,
 * scope boundaries, and drift signals into a machine-readable format.
 * @checksum sha256:placeholder
 */

const { computeFenceMask } = require('./lib/checkbox-scan.js');

/**
 * Generate domain-entities.json content from charter markdown.
 * @param {string|null} charterContent - Raw markdown content of CHARTER.md
 * @param {string} projectVersion - Current project version
 * @returns {object} Domain entities object (or { error: string } on failure)
 */
function generateFromCharter(charterContent, projectVersion) {
  const CONTRACT_HINT = 'CHARTER.md must start with "# Project Charter: <name>" and include a "## Key Entities" section with a three-column table (Entity | Count | Location). Count may be "TBD". See CommandsSrc/charter.md Step 7 for the full contract (#2379).';

  if (!charterContent || typeof charterContent !== 'string' || charterContent.trim() === '') {
    return { error: 'Charter content is empty or invalid', hint: CONTRACT_HINT };
  }

  // Validate this looks like a charter (must have # heading)
  if (!charterContent.match(/^#\s+/m)) {
    return { error: 'Content does not appear to be a valid charter (no markdown headings found)', hint: CONTRACT_HINT };
  }

  // Extract project name from title
  const titleMatch = charterContent.match(/^#\s+Project Charter:\s*(.+)/m);
  if (!titleMatch) {
    return { error: 'Charter title not found (expected "# Project Charter: <name>")', hint: CONTRACT_HINT };
  }
  const projectName = titleMatch[1].trim();

  // Extract vision
  const vision = extractSection(charterContent, 'Vision');

  // Extract scope boundaries
  const inScope = extractListItems(charterContent, 'In Scope');
  const outOfScope = extractListItems(charterContent, 'Out of Scope');

  // Extract entities from Key Entities table. Missing section surfaces a
  // warning at top-level (not silent entities:{}), per #2379.
  const hasKeyEntitiesSection = /##\s+Key Entities/.test(charterContent);
  const entities = extractEntities(charterContent);
  const warning = !hasKeyEntitiesSection
    ? 'Key Entities section not found in CHARTER.md; entities is empty. ' + CONTRACT_HINT
    : undefined;

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

  // Extract tech stack table
  const techStack = extractTechStack(charterContent);

  // Extract current focus items
  const currentFocus = extractListItems(charterContent, 'Current Focus');

  // Extract problem statement
  const problemStatement = extractSection(charterContent, 'Problem Statement');

  const today = new Date().toISOString().slice(0, 10);

  const result = {
    generatedFrom: 'CHARTER.md',
    generatedAt: today,
    projectVersion: projectVersion || 'unknown',
    boundedContext: {
      name: projectName,
      purpose: vision || 'To be documented',
      boundary: buildBoundary(projectName, inScope)
    },
    entities,
    problemStatement,
    techStack,
    architecture,
    currentFocus,
    scopeBoundaries: {
      inScope,
      outOfScope
    },
    driftSignals,
    validationRules
  };
  if (warning) result.warning = warning;
  return result;
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
 * Extract tech stack from a Tech Stack markdown table.
 * @param {string} content - Charter markdown content
 * @returns {Array<{layer: string, technology: string}>}
 */
function extractTechStack(content) {
  let sectionMatch = content.match(/##\s+Tech Stack[^\n]*\n([\s\S]*?)(?=\n##\s)/);
  if (!sectionMatch) {
    sectionMatch = content.match(/##\s+Tech Stack[^\n]*\n([\s\S]*)/);
  }
  if (!sectionMatch) return [];

  const tableLines = sectionMatch[1].split('\n').filter(l => l.startsWith('|'));
  if (tableLines.length < 3) return []; // Need header + separator + at least one data row

  const result = [];
  for (let i = 2; i < tableLines.length; i++) {
    const cells = tableLines[i].split('|').map(c => c.trim()).filter(c => c);
    if (cells.length >= 2) {
      result.push({ layer: cells[0], technology: cells[1] });
    }
  }
  return result;
}

/**
 * Extract the Architecture section into a structured object.
 * Parses subsections (### headings), tables, diagrams (code blocks),
 * and infers components from table rows and subsection content.
 * @param {string} content - Charter markdown content
 * @returns {{subsections: Array, tables: Array, components: Array}}
 */
function extractArchitecture(content) {
  const empty = { subsections: [], tables: [], components: [] };

  let match = content.match(/^##\s+Architecture[^\n]*\n([\s\S]*?)(?=\n##\s[^#])/m);
  if (!match) {
    match = content.match(/^##\s+Architecture[^\n]*\n([\s\S]*)$/m);
  }
  if (!match || !match[1].trim()) return empty;

  const sectionContent = match[1];
  const subsections = [];
  const tables = [];
  const components = [];

  // Split into ### subsections
  const subParts = sectionContent.split(/^###\s+/m);
  // First part is content before any ### (skip if empty)
  for (let i = 1; i < subParts.length; i++) {
    const part = subParts[i];
    const headingEnd = part.indexOf('\n');
    if (headingEnd === -1) continue;

    const heading = part.slice(0, headingEnd).trim();
    const body = part.slice(headingEnd + 1);

    const subsection = { heading };

    // Extract first non-empty, non-table, non-code-fence line as description
    const descLines = body.split('\n')
      .filter(l => l.trim() && !l.startsWith('|') && !l.startsWith('```') && !l.startsWith('-'));
    if (descLines.length > 0) {
      subsection.description = descLines[0].trim();
    }

    // Extract code block as diagram
    const codeMatch = body.match(/```[^\n]*\n([\s\S]*?)```/);
    if (codeMatch) {
      subsection.diagram = codeMatch[1].trimEnd();
    }

    subsections.push(subsection);

    // Extract tables under this subsection
    const tableLines = body.split('\n').filter(l => l.startsWith('|'));
    if (tableLines.length >= 3) {
      const headerCells = tableLines[0].split('|').map(c => c.trim()).filter(c => c);
      const rows = [];
      for (let r = 2; r < tableLines.length; r++) {
        const cells = tableLines[r].split('|').map(c => c.trim()).filter(c => c);
        const row = {};
        for (let c = 0; c < headerCells.length; c++) {
          row[headerCells[c]] = cells[c] || '';
        }
        rows.push(row);

        // Infer component from first column of table rows
        if (cells[0]) {
          components.push({
            name: cells[0].replace(/`/g, ''),
            role: cells[1] || '',
            inferredFrom: heading
          });
        }
      }
      tables.push({
        parentHeading: heading,
        columns: headerCells,
        rows
      });
    }
  }

  return { subsections, tables, components };
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
 * Characters that make a location a glob rather than a path (#2597).
 */
const GLOB_CHARS = /[*?]/;

/**
 * Bounds on a glob walk.
 *
 * A `**` pattern has no natural stopping point, and this helper is symlinked
 * into user projects whose trees it has never seen. Exceeding either bound is
 * reported as unresolvable rather than as a partial count — a truncated walk
 * that returns a number is the same class of false signal this issue is about.
 */
const GLOB_WALK_MAX_DEPTH = 12;
const GLOB_WALK_MAX_ENTRIES = 50000;

/**
 * Vendored glob matcher (#2597).
 *
 * Modelled on `globToRegex` in `scope-drift-check.js`, the worked precedent for
 * exactly this: `minimatch` is not in `runtimeNpmDependencies`, so requiring it
 * here would crash at module load in every deployed project (the runtime
 * dependency contract in 04-deployment-awareness.md). Twenty-odd lines is well
 * under the threshold where declaring a dependency pays.
 *
 * `**` crosses directory separators; a single `*` and `?` do not.
 */
function globToRegex(pattern) {
  let re = '^';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        re += '.*';
        i += 2;
        if (pattern[i] === '/') i++;
      } else {
        re += '[^/]*';
        i++;
      }
    } else if (c === '?') {
      re += '[^/]';
      i++;
    } else if ('.+^$()|{}[]\\'.includes(c)) {
      re += '\\' + c;
      i++;
    } else {
      re += c;
      i++;
    }
  }
  re += '$';
  return new RegExp(re);
}

/**
 * Split a glob location into the deepest directory that is a literal path and
 * the pattern relative to it.
 *
 * Walking from the static prefix is what lets a pattern cost a subtree rather
 * than the whole project, and it is also what makes "base does not exist" a
 * distinguishable outcome from "matched nothing".
 */
function splitGlobLocation(location) {
  const segments = location.split(/[\\/]+/).filter(s => s !== '');
  const staticSegments = [];
  let i = 0;
  while (i < segments.length && !GLOB_CHARS.test(segments[i])) {
    staticSegments.push(segments[i]);
    i++;
  }
  const patternSegments = segments.slice(i);
  const isAbsolute = /^([a-zA-Z]:)?[\\/]/.test(location);
  let base = staticSegments.join('/');
  if (isAbsolute && !/^[a-zA-Z]:/.test(base)) base = '/' + base;
  return { base: base || '.', pattern: patternSegments.join('/') };
}

/**
 * Collect paths under absBase matching pattern, relative to the base.
 *
 * Returns null when a bound is exceeded, which the caller turns into an
 * unresolvable result. Both files and directories are eligible: a Key Entities
 * location may legitimately name either.
 */
function collectGlobMatches(fs, path, absBase, pattern) {
  const regex = globToRegex(pattern);
  const maxDepth = pattern.includes('**')
    ? GLOB_WALK_MAX_DEPTH
    : pattern.split('/').length;

  const matches = [];
  let seen = 0;
  const stack = [{ dir: absBase, rel: '', depth: 0 }];

  while (stack.length > 0) {
    const { dir, rel, depth } = stack.pop();
    if (depth >= maxDepth) continue;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // An unreadable subdirectory mid-walk: skip it rather than failing the
      // whole location. The base resolved, which is all `resolved` claims.
      continue;
    }

    for (const dirent of entries) {
      seen++;
      if (seen > GLOB_WALK_MAX_ENTRIES) return null;

      const childRel = rel ? rel + '/' + dirent.name : dirent.name;
      if (regex.test(childRel)) matches.push(childRel);
      if (dirent.isDirectory()) {
        stack.push({ dir: path.join(dir, dirent.name), rel: childRel, depth: depth + 1 });
      }
    }
  }

  return matches;
}

/**
 * Verify entity counts against the filesystem.
 *
 * For each entity with both `count` and `locations`, derives a count on disk
 * and compares it against the charter count.
 *
 * **A count that could not be derived is reported as such, never as zero**
 * (#2597). Before this, three separate failures — a glob thrown into a silent
 * catch, a file location matching no branch, and a path that does not exist —
 * all emerged as `actualCount: 0, match: false`, indistinguishable from a
 * genuinely deleted entity. A caller then had to re-derive every count by hand,
 * which is the work this function exists to save.
 *
 * Location kinds:
 *   - **glob** (contains `*` or `?`) — expanded from its static prefix and
 *     counted. A base directory that does not exist is unresolvable; a base
 *     that exists and matches nothing is a resolved zero.
 *   - **file** — counts as 1.
 *   - **directory** — immediate children, as before.
 *   - **anything else** — unresolvable, with a reason.
 *
 * Resolution is all-or-nothing per entity: one unresolvable location among
 * several yields `resolved: false` and `actualCount: null`. A partial total
 * compared against a charter count is precisely the false mismatch this
 * function was producing.
 *
 * **Directory counting semantics are unchanged** — still immediate children,
 * files and subdirectories alike. Whether a charter count means "files" or
 * "subdirectories" cannot be settled without inferring intent from prose, which
 * #2597 places out of scope; `scanOutOfTableCounts` classifies that gap as a
 * `counting-rule-artifact` (#2636) instead.
 *
 * @param {object} entities - Entities object from generateFromCharter output
 * @returns {Array<{entity, charterCount, actualCount: number|null,
 *   match: boolean|null, excludesApplied: boolean, resolved: boolean,
 *   unresolved: Array<{location: string, reason: string}>}>}
 */
function verifyEntityCounts(entities) {
  const fs = require('fs');
  const path = require('path');
  const results = [];

  for (const [key, entity] of Object.entries(entities)) {
    if (!entity.count || !entity.locations || entity.locations.length === 0) continue;

    let totalCount = 0;
    const unresolved = [];
    const excludes = (entity.countSource && entity.countSource.exclude) || [];
    const excludesApplied = excludes.length > 0;
    const excludeNames = excludes.map(e => e.replace(/\/$/, ''));
    const notExcluded = (name) => !excludeNames.includes(name);

    for (const location of entity.locations) {
      // Strip parenthetical annotations for path resolution
      const cleanLoc = location.replace(/\s*\([^)]*\)\s*$/, '').trim();

      if (GLOB_CHARS.test(cleanLoc)) {
        const { base, pattern } = splitGlobLocation(cleanLoc);
        const absBase = path.resolve(base);

        let baseStat;
        try {
          baseStat = fs.statSync(absBase);
        } catch {
          unresolved.push({ location, reason: 'glob base directory not found: ' + base });
          continue;
        }
        if (!baseStat.isDirectory()) {
          unresolved.push({ location, reason: 'glob base is not a directory: ' + base });
          continue;
        }

        const matches = collectGlobMatches(fs, path, absBase, pattern);
        if (matches === null) {
          unresolved.push({
            location,
            reason: 'glob expansion exceeded ' + GLOB_WALK_MAX_ENTRIES +
              ' entries; refusing to report a truncated count'
          });
          continue;
        }
        totalCount += matches.filter(m => notExcluded(m.split('/').pop())).length;
        continue;
      }

      const fullPath = path.resolve(cleanLoc);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        unresolved.push({ location, reason: 'path does not exist on disk' });
        continue;
      }

      if (stat.isDirectory()) {
        // Count immediate children (files or subdirectories)
        let entries = fs.readdirSync(fullPath);
        if (excludes.length > 0) entries = entries.filter(notExcluded);
        totalCount += entries.length;
      } else if (stat.isFile()) {
        // Defect 2: a file used to stat successfully, match no branch, and add
        // nothing — output identical to a path that does not exist.
        totalCount += 1;
      } else {
        unresolved.push({ location, reason: 'not a file or directory' });
      }
    }

    const resolved = unresolved.length === 0;
    results.push({
      entity: key,
      charterCount: entity.count,
      actualCount: resolved ? totalCount : null,
      // null, never false: "does not match" is a claim about disk, and no claim
      // about disk can be made from a count that was never derived.
      match: resolved ? entity.count === totalCount : null,
      excludesApplied,
      resolved,
      unresolved
    });
  }

  return results;
}

/**
 * Maximum character distance between an entity match form and an integer for
 * that integer to be treated as a count claim about the entity (#2636).
 */
const COUNT_SCAN_WINDOW = 60;

/** Words too generic to be worth matching on their own. */
const COUNT_SCAN_STOPWORDS = new Set([
  'and', 'the', 'for', 'with', 'from', 'into', 'over', 'across', 'per', 'via',
  'plus', 'that', 'this', 'each', 'other', 'than', 'also', 'only'
]);

/**
 * Best-effort plural -> singular. Returns null when no transform applies.
 */
function singularizeWord(word) {
  if (/[^aeiou]ies$/i.test(word)) return word.slice(0, -3) + 'y';
  if (/(ches|shes|sses|xes|zes)$/i.test(word)) return word.slice(0, -2);
  if (/[^su]s$/i.test(word)) return word.slice(0, -1);
  return null;
}

/**
 * Best-effort singular -> plural. Returns null when no transform applies.
 */
function pluralizeWord(word) {
  if (/s$/i.test(word)) return null;
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + 'ies';
  if (/(ch|sh|x|z)$/i.test(word)) return word + 'es';
  return word + 's';
}

/**
 * Derive the forms of an entity name that prose might use, from the name
 * itself — no hardcoded alias list, because downstream charters define
 * arbitrary entity names (#2636).
 *
 * Priority 0 = the name verbatim, 1 = singular/plural of the name,
 * 2 = an individual significant word (or its singular/plural). Lower wins.
 *
 * @param {string} name - Entity name as written in the Key Entities table
 * @returns {Array<{form: string, priority: number}>}
 */
function deriveMatchForms(name) {
  const forms = new Map();
  const add = (form, priority) => {
    const f = String(form).trim().toLowerCase();
    if (!f) return;
    if (!forms.has(f) || forms.get(f) > priority) forms.set(f, priority);
  };

  const clean = String(name || '').replace(/`/g, '').trim();
  if (!clean) return [];
  add(clean, 0);

  // Singular/plural of the whole name, by transforming its final word.
  const words = clean.split(/\s+/);
  const last = words[words.length - 1];
  const lastCore = last.replace(/[^A-Za-z0-9]/g, '');
  if (lastCore) {
    for (const transformed of [singularizeWord(lastCore), pluralizeWord(lastCore)]) {
      if (transformed && transformed.toLowerCase() !== lastCore.toLowerCase()) {
        add(words.slice(0, -1).concat(transformed).join(' '), 1);
      }
    }
  }

  // Individual significant words, so "Metadata Registries" also reaches
  // "metadata registry system" in prose.
  for (const word of clean.split(/[^A-Za-z0-9]+/)) {
    const lw = word.toLowerCase();
    if (lw.length < 4 || COUNT_SCAN_STOPWORDS.has(lw)) continue;
    add(lw, 2);
    for (const transformed of [singularizeWord(lw), pluralizeWord(lw)]) {
      if (transformed && transformed.toLowerCase() !== lw) add(transformed, 2);
    }
  }

  return Array.from(forms.entries())
    .map(([form, priority]) => ({ form, priority }))
    // Longest form first within a priority tier: prefer the most specific match.
    .sort((a, b) => a.priority - b.priority || b.form.length - a.form.length);
}

/**
 * True when this entity's count carries a qualifier the naive counting rule in
 * verifyEntityCounts() does not honor — declared exclusions, or a location
 * annotated with a parenthetical (".js only", per-directory subtotals). Such
 * entities can report a disk mismatch that is an artifact, not drift.
 */
/**
 * Character gap between an integer and a matched entity name on one line.
 * Zero when they overlap.
 */
function gapBetween(number, matchStart, matchEnd) {
  if (number.start >= matchEnd) return number.start - matchEnd;
  if (number.end <= matchStart) return matchStart - number.end;
  return 0;
}

function hasQualifiedCount(entity) {
  const excludes = entity && entity.countSource && entity.countSource.exclude;
  if (Array.isArray(excludes) && excludes.length > 0) return true;
  return Array.isArray(entity && entity.locations)
    && entity.locations.some(loc => typeof loc === 'string' && loc.includes('('));
}

/**
 * Scan the non-table regions of a charter for count claims about entities that
 * the Key Entities table already counts (#2636).
 *
 * verifyEntityCounts() only ever sees the Key Entities table, so counts written
 * into charter prose — Vision, In Scope, Architecture — are never verified and
 * drift silently. This scan finds them; it never modifies the charter. Repair is
 * the caller's, under the existing consent contract.
 *
 * Markdown table rows are skipped wherever they appear, which is what keeps rows
 * of the Key Entities table itself from being reported as out-of-table claims.
 * Fenced code blocks and headings are skipped as non-prose.
 *
 * False positives (an integer near an entity word that is not a count of it) are
 * expected and safe: every candidate is reported for a human to accept or reject,
 * never auto-applied. Do not tighten the matcher into fragility to chase them.
 *
 * @param {string} charterContent - Raw markdown content of CHARTER.md
 * @param {object} entities - Entities parsed from the Key Entities table
 * @param {Array} [countVerification] - Optional verifyEntityCounts() results, which
 *   supply the disk count used to tell drift from a counting-rule artifact
 * @returns {Array<object>} Candidates, in charter order
 */
function scanOutOfTableCounts(charterContent, entities, countVerification) {
  if (!charterContent || typeof charterContent !== 'string') return [];
  if (!entities || typeof entities !== 'object') return [];

  const verificationByEntity = new Map();
  if (Array.isArray(countVerification)) {
    for (const result of countVerification) {
      if (result && typeof result.entity === 'string') verificationByEntity.set(result.entity, result);
    }
  }

  const targets = [];
  for (const [key, entity] of Object.entries(entities)) {
    if (!entity || entity.external) continue;
    // No numeric table count means nothing to compare a prose claim against.
    if (typeof entity.count !== 'number') continue;
    const forms = deriveMatchForms(entity.description || key.replace(/-/g, ' '));
    if (forms.length === 0) continue;
    targets.push({ key, tableCount: entity.count, forms, qualifiedCount: hasQualifiedCount(entity) });
  }
  if (targets.length === 0) return [];

  const lines = charterContent.split('\n');
  const fenceMask = computeFenceMask(lines);
  const candidates = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (fenceMask[i]) continue;            // inside a fenced code block
    if (trimmed.startsWith('|')) continue;   // markdown table row — incl. Key Entities
    if (/^#{1,6}\s/.test(trimmed)) continue; // heading
    if (!/\d/.test(raw)) continue;

    const numbers = [];
    const numberPattern = /\d+/g;
    let numberMatch;
    while ((numberMatch = numberPattern.exec(raw)) !== null) {
      numbers.push({
        value: parseInt(numberMatch[0], 10),
        start: numberMatch.index,
        end: numberMatch.index + numberMatch[0].length
      });
    }
    if (numbers.length === 0) continue;

    const lower = raw.toLowerCase();
    const lineCandidates = [];

    for (const target of targets) {
      let best = null;
      for (const { form, priority } of target.forms) {
        const formPattern = new RegExp('\\b' + escapeRegex(form) + '\\b', 'g');
        let formMatch;
        while ((formMatch = formPattern.exec(lower)) !== null) {
          const matchStart = formMatch.index;
          const matchEnd = matchStart + formMatch[0].length;
          for (const number of numbers) {
            const distance = gapBetween(number, matchStart, matchEnd);
            if (distance > COUNT_SCAN_WINDOW) continue;
            if (!best
              || priority < best.priority
              || (priority === best.priority && distance < best.distance)) {
              best = { priority, distance, form, matchStart, matchEnd, number };
            }
          }
        }
      }
      if (!best) continue;

      // Integers that were in range but not selected are surfaced, not dropped:
      // one prose line often carries several counts for the same entity.
      const otherCountsOnLine = numbers
        .filter(n => n !== best.number)
        .filter(n => gapBetween(n, best.matchStart, best.matchEnd) <= COUNT_SCAN_WINDOW)
        .map(n => n.value);

      const statedCount = best.number.value;
      // #2597: verifyEntityCounts now reports an unresolvable location as
      // `actualCount: null` with a reason, so a 0 finally means what it says —
      // an empty resolved location. The hedge that used to be attached to every
      // 0 existed only because the two were indistinguishable.
      const describeDisk = (n) => (n === null || n === undefined)
        ? 'unresolved (the location could not be resolved on disk)'
        : String(n);
      const verification = verificationByEntity.get(target.key) || null;
      const diskCount = verification ? verification.actualCount : null;
      // true | false | null. null means no count was derived, which is NOT a
      // disagreement — reading it through `=== true` collapsed it to false and
      // folded unresolvable entities into the mismatch list, the consumer-side
      // half of the defect (#2597).
      const tableMatchesDisk = verification ? verification.match : null;
      const diskUnresolved = verification ? verification.resolved === false : false;
      const agreesWithTable = statedCount === target.tableCount;

      let classification;
      let note;
      if (!agreesWithTable) {
        classification = 'drift';
        note = 'Prose states ' + statedCount + '; the Key Entities table states ' + target.tableCount + '.';
        if (tableMatchesDisk === false) {
          note += target.qualifiedCount
            ? ' The table count is itself unconfirmed on disk (' + describeDisk(diskCount) + '), but this entity\'s count is qualified, so that gap is likely a verifyEntityCounts counting-rule artifact.'
            : ' The table count also disagrees with disk (' + describeDisk(diskCount) + '); settle the table first.';
        } else if (diskUnresolved) {
          note += ' Disk could not confirm either figure: ' + describeDisk(diskCount) + '. The prose-vs-table drift stands on its own.';
        }
      } else if (diskUnresolved) {
        // Prose and table agree and disk said nothing. Reporting this as a disk
        // disagreement is what #2597 fixes: an unresolvable location is not
        // evidence of anything, so it neither confirms nor contradicts.
        classification = 'agrees-with-table';
        note = 'Prose agrees with the table (' + target.tableCount + '). Disk is ' + describeDisk(diskCount) + ', so it neither confirms nor contradicts the count.';
      } else if (tableMatchesDisk === false && target.qualifiedCount) {
        classification = 'counting-rule-artifact';
        note = 'Prose agrees with the table (' + target.tableCount + '). Disk reports ' + describeDisk(diskCount) + ', but this entity\'s count is qualified, so the gap is a verifyEntityCounts counting-rule artifact rather than drift.';
      } else if (tableMatchesDisk === false) {
        classification = 'unclassified';
        note = 'Prose agrees with the table (' + target.tableCount + '), but disk reports ' + describeDisk(diskCount) + ' and nothing qualifies the count. Table-vs-disk drift is verifyEntityCounts\' remit, not this scan\'s.';
      } else {
        classification = 'agrees-with-table';
        note = 'Prose agrees with the table (' + target.tableCount + ').';
      }

      lineCandidates.push({
        entity: target.key,
        statedCount,
        tableCount: target.tableCount,
        diskCount,
        line: i + 1,
        lineText: trimmed,
        matchedText: raw.slice(best.matchStart, best.matchEnd),
        matchForm: best.form,
        matchPriority: best.priority,
        distance: best.distance,
        otherCountsOnLine,
        agreesWithTable,
        tableMatchesDisk,
        qualifiedCount: target.qualifiedCount,
        classification,
        note
      });
    }

    // When some entity matched this line by its full name (or that name's
    // singular/plural), entities that matched only by a shared significant word
    // are dropped. Without this, "framework" and "commands" claim integers on
    // lines a specific match already explains, and the resulting wall of bogus
    // drift verdicts is what makes a user reject the whole report — the outcome
    // the drift/artifact distinction exists to prevent. A line with no specific
    // match keeps its generic candidates, so charters that only ever use generic
    // wording are still covered.
    const hasSpecificMatch = lineCandidates.some(c => c.matchPriority <= 1);
    for (const candidate of lineCandidates) {
      if (hasSpecificMatch && candidate.matchPriority > 1) continue;
      candidates.push(candidate);
    }
  }

  return candidates.sort((a, b) => a.line - b.line || a.entity.localeCompare(b.entity));
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { generateFromCharter, verifyEntityCounts, scanOutOfTableCounts, buildValidationRules };
