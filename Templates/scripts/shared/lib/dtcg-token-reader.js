// Rubrical Works (c) 2026
/**
 * @framework-script 0.82.0
 * @description DTCG token reader for integration with /mockups and /catalog-screens.
 *   Loads design tokens from Design-System/, supports theme merging,
 *   provides token value extraction by path, and returns structured palettes.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * lib/dtcg-token-reader.js - Token file reader and integration helper
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TOKEN_FILE = 'idpf-design.tokens.json';
const DESIGN_DIR = 'Design-System';

/**
 * Load design tokens from the project's Design-System directory.
 * Optionally merges a theme override file.
 *
 * @param {string} projectRoot - Project root directory
 * @param {object} [options] - Load options
 * @param {string} [options.theme] - Theme name to merge (e.g., 'dark')
 * @returns {{ found: boolean, tokens: object|null, theme: string|null }}
 */
function loadDesignTokens(projectRoot, options = {}) {
  const tokenPath = path.join(projectRoot, DESIGN_DIR, TOKEN_FILE);

  if (!fs.existsSync(tokenPath)) {
    return { found: false, tokens: null, theme: null };
  }

  let tokens;
  try {
    tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  } catch {
    return { found: false, tokens: null, theme: null };
  }

  // Apply theme if requested
  if (options.theme) {
    const themePath = path.join(projectRoot, DESIGN_DIR, 'themes', `${options.theme}.tokens.json`);
    if (fs.existsSync(themePath)) {
      try {
        const themeTokens = JSON.parse(fs.readFileSync(themePath, 'utf8'));
        tokens = deepMerge(tokens, themeTokens);
        return { found: true, tokens, theme: options.theme };
      } catch {
        // Fall back to base tokens
      }
    }
  }

  return { found: true, tokens, theme: null };
}

/**
 * Get a token value by dot-separated path.
 * @param {object} tokens - Token object
 * @param {string} tokenPath - Dot-separated path (e.g., 'color.primary')
 * @returns {*} Token $value, or undefined if not found
 */
function getTokenValue(tokens, tokenPath) {
  const parts = tokenPath.split('.');
  let current = tokens;

  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[part];
  }

  if (current && typeof current === 'object' && '$value' in current) {
    return current.$value;
  }

  return undefined;
}

/**
 * Get a structured mockup palette from project tokens.
 * Falls back to generic defaults when no tokens are available.
 *
 * @param {string} projectRoot - Project root directory
 * @param {object} [options] - Options (passed to loadDesignTokens)
 * @returns {{ hasTokens: boolean, colors: object, fonts: object, spacing: object }}
 */
function getMockupPalette(projectRoot, options = {}) {
  const { found, tokens } = loadDesignTokens(projectRoot, options);

  if (!found || !tokens) {
    return {
      hasTokens: false,
      colors: { primary: '#3b82f6', secondary: '#6366f1', background: '#ffffff', text: '#111827' },
      fonts: { sans: 'system-ui, sans-serif', mono: 'monospace' },
      spacing: { sm: '8px', md: '16px', lg: '24px' }
    };
  }

  return {
    hasTokens: true,
    colors: extractGroup(tokens, 'color'),
    fonts: extractGroup(tokens, 'fontFamily'),
    spacing: extractGroup(tokens, 'dimension')
  };
}

/**
 * Extract all $value entries from a token group into a flat object.
 * @param {object} tokens - Full token object
 * @param {string} groupName - Top-level group name
 * @returns {object} Flat key-value map of token values
 */
function extractGroup(tokens, groupName) {
  const group = tokens[groupName];
  if (!group || typeof group !== 'object') return {};

  const result = {};

  function walk(node, prefix) {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('$')) continue;
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && '$value' in value) {
        result[key] = value.$value;
      } else if (value && typeof value === 'object') {
        walk(value, fullKey);
      }
    }
  }

  walk(group, '');
  return result;
}

/**
 * Deep merge source into target (for theme application).
 * @param {object} target
 * @param {object} source
 * @returns {object} Merged object
 */
function deepMerge(target, source) {
  const merged = JSON.parse(JSON.stringify(target));

  for (const [key, value] of Object.entries(source)) {
    if (key.startsWith('$')) continue;

    if (value && typeof value === 'object' && '$type' in value) {
      if (!merged[key]) merged[key] = {};
      merged[key] = { ...value };
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!merged[key] || typeof merged[key] !== 'object') merged[key] = {};
      merged[key] = deepMerge(merged[key], value);
    }
  }

  return merged;
}

/**
 * Find all token values that match a CSS value (for /catalog-screens mapping).
 * @param {object} tokens - Token object
 * @param {string} cssValue - CSS value to match (e.g., '#3b82f6')
 * @returns {Array<{ path: string, alias: string }>} Matching token paths
 */
function findTokensByValue(tokens, cssValue) {
  const matches = [];

  function walk(node, prefix) {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('$')) continue;
      const currentPath = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && '$value' in value) {
        if (String(value.$value) === String(cssValue)) {
          matches.push({ path: currentPath, alias: `{${currentPath}}` });
        }
      } else if (value && typeof value === 'object') {
        walk(value, currentPath);
      }
    }
  }

  walk(tokens, '');
  return matches;
}

/**
 * Resolve a DTCG alias reference to its final value.
 * Handles nested aliases (e.g., {color.semantic.info} → {color.primary} → #3b82f6).
 * @param {object} tokens - Token object
 * @param {string} alias - Alias reference (e.g., '{color.primary}')
 * @param {number} [maxDepth=10] - Maximum resolution depth
 * @returns {{ resolved: boolean, value: *, path: string[] }}
 */
function resolveAlias(tokens, alias, maxDepth = 10) {
  const aliasPath = [];
  let current = alias;

  for (let i = 0; i < maxDepth; i++) {
    const match = typeof current === 'string' && current.match(/^\{([^}]+)\}$/);
    if (!match) {
      return { resolved: true, value: current, path: aliasPath };
    }

    const tokenPath = match[1];
    aliasPath.push(tokenPath);
    const value = getTokenValue(tokens, tokenPath);

    if (value === undefined) {
      return { resolved: false, value: undefined, path: aliasPath };
    }

    current = value;
  }

  return { resolved: false, value: undefined, path: aliasPath };
}

module.exports = {
  loadDesignTokens,
  getTokenValue,
  getMockupPalette,
  findTokensByValue,
  resolveAlias
};
