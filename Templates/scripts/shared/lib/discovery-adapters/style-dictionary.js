// Rubrical Works (c) 2026
/**
 * @framework-script 0.90.0
 * @description Style Dictionary discovery adapter. Detects existing Style
 *   Dictionary token files and imports them to DTCG format.
 * @checksum sha256:placeholder
 *
 * lib/discovery-adapters/style-dictionary.js - Style Dictionary discovery adapter
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TOKEN_DIRS = ['tokens', 'design-tokens', 'properties'];
const SD_CONFIG_FILES = ['config.json', 'style-dictionary.config.json', '.style-dictionary.json'];

/**
 * Detect Style Dictionary token files or config.
 * @param {string} projectRoot
 * @returns {boolean}
 */
function detect(projectRoot) {
  // Check for known SD config files
  const hasConfig = SD_CONFIG_FILES.some(f => fs.existsSync(path.join(projectRoot, f)));
  if (hasConfig) return true;

  // Check for token directories with JSON files containing SD format
  for (const dir of TOKEN_DIRS) {
    const dirPath = path.join(projectRoot, dir);
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(dirPath, file), 'utf8'));
          if (hasSDFormat(content)) return true;
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }

  return false;
}

/**
 * Check if an object uses Style Dictionary format (value property without $).
 * @param {object} obj
 * @returns {boolean}
 */
function hasSDFormat(obj) {
  if (typeof obj !== 'object' || obj === null) return false;
  for (const value of Object.values(obj)) {
    if (typeof value === 'object' && value !== null) {
      if ('value' in value && !('$value' in value)) return true;
      if (hasSDFormat(value)) return true;
    }
  }
  return false;
}

/**
 * Import Style Dictionary tokens to DTCG format.
 * @param {string} projectRoot
 * @returns {object} DTCG token groups
 */
function extract(projectRoot) {
  const tokens = {};

  for (const dir of TOKEN_DIRS) {
    const dirPath = path.join(projectRoot, dir);
    if (!fs.existsSync(dirPath)) continue;

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(dirPath, file), 'utf8'));
        const converted = convertSDToDTCG(content, path.basename(file, '.json'));
        Object.assign(tokens, converted);
      } catch {
        // Skip invalid files
      }
    }
  }

  return tokens;
}

/**
 * Convert Style Dictionary format to DTCG format.
 * SD uses {value} while DTCG uses {$value, $type, $description}.
 * @param {object} sdTokens
 * @param {string} groupName
 * @returns {object}
 */
function convertSDToDTCG(sdTokens, groupName) {
  const result = {};

  function walk(node, currentGroup) {
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'object' && value !== null && 'value' in value) {
        // This is a leaf token in SD format
        if (!result[currentGroup]) result[currentGroup] = {};
        result[currentGroup][key] = {
          $type: guessType(value.value),
          $value: value.value,
          $description: value.comment || `Imported from Style Dictionary ${groupName}.${key}`
        };
      } else if (typeof value === 'object' && value !== null) {
        walk(value, currentGroup);
      }
    }
  }

  walk(sdTokens, groupName);
  return result;
}

/**
 * Guess the DTCG type from a value.
 * @param {*} value
 * @returns {string}
 */
function guessType(value) {
  if (typeof value === 'string') {
    if (/^#[0-9a-fA-F]{3,8}$/.test(value) || /^rgb/.test(value)) return 'color';
    if (/^[0-9]*\.?[0-9]+(?:px|rem|em|%)$/.test(value)) return 'dimension';
    if (/^\d+ms$/.test(value)) return 'duration';
  }
  if (typeof value === 'number') return 'number';
  return 'color'; // default fallback
}

module.exports = { detect, extract };
