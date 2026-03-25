// Rubrical Works (c) 2026
/**
 * @framework-script 0.72.0
 * @description Read a PRD document, extract technical requirements from feature sections, and match against the skill keyword registry (.claude/metadata/skill-keywords.json). Consolidates PRD-to-skill mapping into a single script call. Used by /create-prd technical skills phase.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');

/**
 * Extract technical requirement text from PRD content.
 * Pulls from Technical Notes, NFRs, and user story content.
 *
 * @param {string|null} content - Raw PRD markdown content
 * @returns {string} Concatenated technical text for keyword matching
 */
function extractTechnicalRequirements(content) {
  if (!content) return '';

  const sections = [];

  // Extract ## Technical Notes section
  const techNotesMatch = content.match(
    /## Technical Notes\s*\n([\s\S]*?)(?=\n## |\n---|\*\*End|$)/i
  );
  if (techNotesMatch) sections.push(techNotesMatch[1].trim());

  // Extract ## Non-Functional Requirements section
  const nfrMatch = content.match(
    /## Non-Functional Requirements\s*\n([\s\S]*?)(?=\n## |\n---|\*\*End|$)/i
  );
  if (nfrMatch) sections.push(nfrMatch[1].trim());

  // Extract user story content (titles and descriptions)
  const storyMatches = content.match(
    /### Story [\d.]+:[\s\S]*?(?=### Story |\n## |\*\*End|$)/gi
  );
  if (storyMatches) {
    sections.push(storyMatches.join('\n'));
  }

  return sections.join('\n').trim();
}

/**
 * Match PRD content against skill keyword registry.
 *
 * @param {string} content - Text to match against
 * @param {string[]} installedSkills - Already-installed skill names
 * @param {object|null} registryData - Parsed skill-keywords.json data
 * @returns {{ matchedSkills: Array, existingSkills: string[], newSkills: Array, registryAvailable: boolean }}
 */
function matchSkills(content, installedSkills, registryData) {
  if (!registryData) {
    return {
      matchedSkills: [],
      existingSkills: installedSkills || [],
      newSkills: [],
      registryAvailable: false
    };
  }

  if (!content) {
    return {
      matchedSkills: [],
      existingSkills: installedSkills || [],
      newSkills: [],
      registryAvailable: true
    };
  }

  const lowerContent = content.toLowerCase();
  const installedSet = new Set(installedSkills || []);
  const matchedSkills = [];
  const addedSkills = new Set();

  const skillKeywords = registryData.skillKeywords || {};
  for (const [skill, keywords] of Object.entries(skillKeywords)) {
    const matched = (keywords || []).filter(kw =>
      lowerContent.includes(kw.toLowerCase())
    );
    if (matched.length > 0 && !addedSkills.has(skill)) {
      matchedSkills.push({ skill, matchedKeywords: matched });
      addedSkills.add(skill);
    }
  }

  // Separate into new vs existing
  const newSkills = matchedSkills.filter(m => !installedSet.has(m.skill));
  const existingFromMatched = matchedSkills
    .filter(m => installedSet.has(m.skill))
    .map(m => m.skill);

  return {
    matchedSkills,
    existingSkills: [...new Set([...(installedSkills || []), ...existingFromMatched])],
    newSkills,
    registryAvailable: true
  };
}

/**
 * Load skill-keywords.json from the metadata directory.
 * @param {string} metadataPath
 * @returns {object|null}
 */
function loadRegistry(metadataPath) {
  try {
    const filePath = path.join(metadataPath, 'skill-keywords.json');
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_e) {
    return null;
  }
}

/**
 * Load projectSkills from framework-config.json.
 * @param {string} configPath
 * @returns {string[]}
 */
function loadInstalledSkills(configPath) {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);
    return config.projectSkills || [];
  } catch (_e) {
    return [];
  }
}

// CLI entrypoint
if (require.main === module) {
  const args = process.argv.slice(2);
  let prdPath = '';
  let installed = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--prd' && i + 1 < args.length) {
      prdPath = args[++i];
    } else if (args[i] === '--installed' && i + 1 < args.length) {
      installed = args[++i];
    }
  }

  // Read PRD file
  let prdContent = '';
  if (prdPath) {
    try {
      prdContent = fs.readFileSync(prdPath, 'utf8');
    } catch (_e) {
      // Missing/invalid PRD file — non-blocking
    }
  }

  // Extract technical content
  const techContent = extractTechnicalRequirements(prdContent);

  // Load registry
  const metadataPath = path.join(__dirname, '..', '..', 'metadata');
  const registryData = loadRegistry(metadataPath);

  // Load installed skills from config or CLI arg
  const configPath = path.join(process.cwd(), 'framework-config.json');
  const configSkills = loadInstalledSkills(configPath);
  const installedSkills = installed
    ? installed.split(',').map(s => s.trim()).filter(Boolean)
    : configSkills;

  // Match
  const result = matchSkills(techContent, installedSkills, registryData);
  console.log(JSON.stringify(result));
}

module.exports = { extractTechnicalRequirements, matchSkills };
