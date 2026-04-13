// Rubrical Works (c) 2026
/**
 * @framework-script 0.86.0
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

module.exports = { detectTechStack, HEURISTICS };
