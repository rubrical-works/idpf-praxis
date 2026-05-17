// Rubrical Works (c) 2026
/**
 * @framework-script 0.92.0
 * @description Tailwind CSS discovery adapter. Detects tailwind.config.js
 *   and extracts theme values to DTCG tokens.
 * @checksum sha256:placeholder
 *
 * lib/discovery-adapters/tailwind.js - Tailwind CSS discovery adapter
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_FILES = ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.mjs'];

/**
 * Detect Tailwind CSS configuration.
 * @param {string} projectRoot
 * @returns {boolean}
 */
function detect(projectRoot) {
  return CONFIG_FILES.some(f => fs.existsSync(path.join(projectRoot, f)));
}

/**
 * Extract theme values from Tailwind config to DTCG tokens.
 * Uses regex parsing to extract theme values without executing the config.
 * @param {string} projectRoot
 * @returns {object} DTCG token groups
 */
function extract(projectRoot) {
  const configFile = CONFIG_FILES.find(f => fs.existsSync(path.join(projectRoot, f)));
  if (!configFile) return {};

  const content = fs.readFileSync(path.join(projectRoot, configFile), 'utf8');
  const tokens = {};

  // Extract color values
  const colorMatches = content.match(/colors?\s*:\s*\{([^}]+)\}/);
  if (colorMatches) {
    tokens.color = {};
    const colorPairs = colorMatches[1].matchAll(/['"]?(\w+)['"]?\s*:\s*['"]([^'"]+)['"]/g);
    for (const match of colorPairs) {
      tokens.color[match[1]] = {
        $type: 'color',
        $value: match[2],
        $description: `Extracted from Tailwind theme color "${match[1]}"`
      };
    }
  }

  // Extract spacing values
  const spacingMatches = content.match(/spacing\s*:\s*\{([^}]+)\}/);
  if (spacingMatches) {
    tokens.dimension = tokens.dimension || {};
    const spacingPairs = spacingMatches[1].matchAll(/['"]?(\w+)['"]?\s*:\s*['"]([^'"]+)['"]/g);
    for (const match of spacingPairs) {
      tokens.dimension[`spacing_${match[1]}`] = {
        $type: 'dimension',
        $value: match[2],
        $description: `Extracted from Tailwind theme spacing "${match[1]}"`
      };
    }
  }

  return tokens;
}

module.exports = { detect, extract };
