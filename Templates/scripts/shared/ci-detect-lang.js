#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.66.2
 * @description Detect project programming languages by scanning for language-specific manifest files (package.json, requirements.txt, go.mod, Cargo.toml, etc.). Returns an array of detected language identifiers. Used by ci-analyze.js during project analysis.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');

/**
 * Language detection manifest mapping.
 * Each entry maps a manifest file to the language(s) it indicates.
 */
const MANIFEST_MAP = [
  { file: 'package.json', languages: ['javascript'] },
  { file: 'tsconfig.json', languages: ['typescript'] },
  { file: 'requirements.txt', languages: ['python'] },
  { file: 'pyproject.toml', languages: ['python'] },
  { file: 'setup.py', languages: ['python'] },
  { file: 'Pipfile', languages: ['python'] },
  { file: 'go.mod', languages: ['go'] },
  { file: 'Cargo.toml', languages: ['rust'] },
  { file: 'pom.xml', languages: ['java'] },
  { file: 'build.gradle', languages: ['java'] },
  { file: 'build.gradle.kts', languages: ['java'] },
  { file: 'Gemfile', languages: ['ruby'] },
  { file: 'composer.json', languages: ['php'] },
  { file: 'mix.exs', languages: ['elixir'] }
];

/**
 * Detect all languages present in a project directory.
 * @param {string} projectDir - Path to the project root
 * @returns {string[]} Array of detected language identifiers
 */
function detectLanguages(projectDir) {
  const detected = new Set();

  for (const entry of MANIFEST_MAP) {
    const manifestPath = path.join(projectDir, entry.file);
    if (fs.existsSync(manifestPath)) {
      for (const lang of entry.languages) {
        detected.add(lang);
      }
    }
  }

  return Array.from(detected);
}

/**
 * Detect the primary language for a project.
 * Returns the first detected language, or 'unknown' if none found.
 * @param {string} projectDir - Path to the project root
 * @returns {string} Primary language identifier
 */
function detectPrimaryLanguage(projectDir) {
  const languages = detectLanguages(projectDir);
  return languages.length > 0 ? languages[0] : 'unknown';
}

/**
 * Get a formatted summary of detected languages for display.
 * @param {string} projectDir - Path to the project root
 * @returns {string} Human-readable language summary
 */
function formatLanguageSummary(projectDir) {
  const languages = detectLanguages(projectDir);

  if (languages.length === 0) {
    return 'Language: Unknown (no recognized manifest files)';
  }

  if (languages.length === 1) {
    return `Language: ${capitalize(languages[0])}`;
  }

  return `Languages: ${languages.map(capitalize).join(', ')} (polyglot)`;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// CLI entry point
if (require.main === module) {
  const dir = process.argv[2] || process.cwd();
  console.log(formatLanguageSummary(dir));
  const langs = detectLanguages(dir);
  if (langs.length > 0) {
    console.log(`Primary: ${detectPrimaryLanguage(dir)}`);
    console.log(`All: ${langs.join(', ')}`);
  }
}

module.exports = { detectLanguages, detectPrimaryLanguage, formatLanguageSummary };
