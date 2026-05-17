// Rubrical Works (c) 2026
/**
 * @framework-script 0.92.0
 * @description Detect technology stack from project root file indicators.
 * Used by recipe filtering and domain specialist selection.
 * @checksum sha256:placeholder
 *
 * @module .claude/scripts/shared/lib/detect-tech-stack
 */

const fs = require('fs');
const path = require('path');

/**
 * Technology detection heuristics.
 * Each entry maps a project-root file to a technology identifier.
 */
const HEURISTICS = [
  { file: 'package.json', tech: 'node' },
  { file: 'pyproject.toml', tech: 'python' },
  { file: 'setup.py', tech: 'python' },
  { file: 'go.mod', tech: 'go' },
  { file: 'Cargo.toml', tech: 'rust' },
  { file: 'pom.xml', tech: 'java' },
  { file: 'build.gradle', tech: 'java' },
  { file: 'Gemfile', tech: 'ruby' },
];

/**
 * Glob include patterns per detected technology. Used by /code-review Step 3
 * to resolve default include patterns from the charter's detected tech stack.
 */
const TECH_GLOB_PATTERNS = {
  node: ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx', '**/*.mjs', '**/*.cjs'],
  python: ['**/*.py'],
  go: ['**/*.go'],
  rust: ['**/*.rs'],
  java: ['**/*.java'],
  ruby: ['**/*.rb'],
};

/**
 * Detect technology stack by checking for indicator files in the project root.
 * @param {string} projectRoot - Path to the project root directory
 * @returns {string[]} Array of detected technology identifiers (deduplicated)
 */
function detectTechStack(projectRoot) {
  const detected = new Set();
  for (const { file, tech } of HEURISTICS) {
    if (fs.existsSync(path.join(projectRoot, file))) {
      detected.add(tech);
    }
  }
  return [...detected];
}

/**
 * Resolve glob include patterns for a list of tech identifiers. Unknown techs
 * are skipped silently. Patterns are deduplicated across techs.
 * @param {string[]} techs - Technology identifiers from detectTechStack()
 * @returns {string[]} Deduplicated glob patterns
 */
function getGlobPatternsForTechs(techs) {
  const patterns = new Set();
  for (const tech of techs) {
    const forTech = TECH_GLOB_PATTERNS[tech];
    if (forTech) forTech.forEach(p => patterns.add(p));
  }
  return [...patterns];
}

module.exports = { detectTechStack, getGlobPatternsForTechs, HEURISTICS, TECH_GLOB_PATTERNS };
