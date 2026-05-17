// Rubrical Works (c) 2026
/**
 * @framework-script 0.92.0
 * @description CSS Custom Properties discovery adapter. Detects CSS files with
 *   custom properties (--*) and extracts them to DTCG color/dimension tokens.
 * @checksum sha256:placeholder
 *
 * lib/discovery-adapters/css-vars.js - CSS Variables discovery adapter
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CSS_VAR_PATTERN = /--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
const COLOR_PATTERN = /^#[0-9a-fA-F]{3,8}$|^rgb|^hsl|^(red|blue|green|black|white|transparent)/;
const DIMENSION_PATTERN = /^[0-9]*\.?[0-9]+(?:px|rem|em|vh|vw|%|ch)$/;

/**
 * Detect CSS files with custom properties in the project.
 * @param {string} projectRoot
 * @returns {boolean}
 */
function detect(projectRoot) {
  const cssFiles = findCssFiles(projectRoot);
  return cssFiles.some(file => {
    const content = fs.readFileSync(file, 'utf8');
    return CSS_VAR_PATTERN.test(content);
  });
}

/**
 * Extract CSS custom properties to DTCG tokens.
 * @param {string} projectRoot
 * @returns {object} DTCG token groups
 */
function extract(projectRoot) {
  const cssFiles = findCssFiles(projectRoot);
  const colorTokens = {};
  const dimensionTokens = {};

  for (const file of cssFiles) {
    const content = fs.readFileSync(file, 'utf8');
    let match;
    const pattern = new RegExp(CSS_VAR_PATTERN.source, 'g');

    while ((match = pattern.exec(content)) !== null) {
      const name = match[1];
      const value = match[2].trim();
      const tokenName = name.replace(/-/g, '_');

      if (COLOR_PATTERN.test(value)) {
        colorTokens[tokenName] = {
          $type: 'color',
          $value: value,
          $description: `Extracted from CSS variable --${name}`
        };
      } else if (DIMENSION_PATTERN.test(value)) {
        dimensionTokens[tokenName] = {
          $type: 'dimension',
          $value: value,
          $description: `Extracted from CSS variable --${name}`
        };
      }
    }
  }

  const tokens = {};
  if (Object.keys(colorTokens).length > 0) tokens.color = colorTokens;
  if (Object.keys(dimensionTokens).length > 0) tokens.dimension = dimensionTokens;

  return tokens;
}

/**
 * Find CSS files in the project (top-level and src/).
 * @param {string} projectRoot
 * @returns {string[]}
 */
function findCssFiles(projectRoot) {
  const files = [];
  const dirs = [projectRoot, path.join(projectRoot, 'src'), path.join(projectRoot, 'styles')];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      if (entry.endsWith('.css')) {
        files.push(path.join(dir, entry));
      }
    }
  }

  return files;
}

module.exports = { detect, extract };
