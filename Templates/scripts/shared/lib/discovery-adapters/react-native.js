// Rubrical Works (c) 2026
/**
 * @framework-script 0.90.0
 * @description React Native discovery adapter. Detects StyleSheet.create
 *   patterns and extracts style values to DTCG tokens.
 * @checksum sha256:placeholder
 *
 * lib/discovery-adapters/react-native.js - React Native discovery adapter
 */

'use strict';

const fs = require('fs');
const path = require('path');

const STYLESHEET_PATTERN = /StyleSheet\.create/;
const COLOR_VALUE_PATTERN = /(?:color|backgroundColor|borderColor)\s*:\s*['"]([^'"]+)['"]/g;
const DIMENSION_VALUE_PATTERN = /(?:fontSize|margin|padding|width|height|borderRadius|borderWidth)\s*:\s*(\d+)/g;

/**
 * Detect React Native StyleSheet.create patterns.
 * @param {string} projectRoot
 * @returns {boolean}
 */
function detect(projectRoot) {
  const jsFiles = findJsFiles(projectRoot);
  return jsFiles.some(file => {
    const content = fs.readFileSync(file, 'utf8');
    return STYLESHEET_PATTERN.test(content);
  });
}

/**
 * Extract style values from React Native StyleSheet.create to DTCG tokens.
 * @param {string} projectRoot
 * @returns {object} DTCG token groups
 */
function extract(projectRoot) {
  const jsFiles = findJsFiles(projectRoot);
  const colorTokens = {};
  const dimensionTokens = {};

  for (const file of jsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    if (!STYLESHEET_PATTERN.test(content)) continue;

    // Extract colors
    let match;
    const colorPattern = new RegExp(COLOR_VALUE_PATTERN.source, 'g');
    while ((match = colorPattern.exec(content)) !== null) {
      const value = match[1];
      const name = `rn_${value.replace(/[^a-zA-Z0-9]/g, '_')}`;
      colorTokens[name] = {
        $type: 'color',
        $value: value,
        $description: `Extracted from React Native StyleSheet`
      };
    }

    // Extract dimensions
    const dimPattern = new RegExp(DIMENSION_VALUE_PATTERN.source, 'g');
    while ((match = dimPattern.exec(content)) !== null) {
      const value = match[1];
      const name = `rn_dim_${value}`;
      dimensionTokens[name] = {
        $type: 'dimension',
        $value: `${value}px`,
        $description: `Extracted from React Native StyleSheet`
      };
    }
  }

  const tokens = {};
  if (Object.keys(colorTokens).length > 0) tokens.color = colorTokens;
  if (Object.keys(dimensionTokens).length > 0) tokens.dimension = dimensionTokens;

  return tokens;
}

function findJsFiles(projectRoot) {
  const files = [];
  const dirs = [projectRoot, path.join(projectRoot, 'src')];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      if (entry.endsWith('.js') || entry.endsWith('.tsx') || entry.endsWith('.jsx')) {
        files.push(path.join(dir, entry));
      }
    }
  }

  return files;
}

module.exports = { detect, extract };
