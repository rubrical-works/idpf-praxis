// Rubrical Works (c) 2026
/**
 * @framework-script 0.91.1
 * @description DTCG theme management: generation, validation, merge resolution,
 *   type mismatch detection, and circular alias detection across base+theme tokens.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * lib/dtcg-theme-manager.js - Theme file generation, merge, and validation
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ALIAS_PATTERN = /^\{([^}]+)\}$/;

/**
 * Generate default light and dark theme files.
 * @param {string} designSystemDir - Path to Design-System directory
 * @param {object} baseTokens - Base DTCG token object
 */
function generateThemeFiles(designSystemDir, _baseTokens) {
  const themesDir = path.join(designSystemDir, 'themes');
  fs.mkdirSync(themesDir, { recursive: true });

  const lightTheme = {
    $schema: '../idpf-design.schema.json',
    color: {
      background: { $type: 'color', $value: '#ffffff', $description: 'Light background' },
      text: { $type: 'color', $value: '#111827', $description: 'Light text' }
    }
  };

  const darkTheme = {
    $schema: '../idpf-design.schema.json',
    color: {
      background: { $type: 'color', $value: '#111827', $description: 'Dark background' },
      text: { $type: 'color', $value: '#f9fafb', $description: 'Dark text' }
    }
  };

  fs.writeFileSync(
    path.join(themesDir, 'light.tokens.json'),
    JSON.stringify(lightTheme, null, 2) + '\n', 'utf8'
  );
  fs.writeFileSync(
    path.join(themesDir, 'dark.tokens.json'),
    JSON.stringify(darkTheme, null, 2) + '\n', 'utf8'
  );
}

/**
 * Validate theme overrides against base tokens.
 * Checks that overridden tokens maintain the same $type.
 * @param {object} baseTokens
 * @param {object} themeOverrides
 * @returns {{ valid: boolean, warnings: string[] }}
 */
function validateThemeOverrides(baseTokens, themeOverrides) {
  const warnings = [];

  function walk(basePath, baseNode, themeNode) {
    for (const [key, themeValue] of Object.entries(themeNode)) {
      if (key.startsWith('$')) continue;

      const currentPath = basePath ? `${basePath}.${key}` : key;

      if (themeValue && typeof themeValue === 'object' && '$type' in themeValue) {
        // Check if base has matching token with different type
        const baseValue = getNestedValue(baseNode, key);
        if (baseValue && '$type' in baseValue && baseValue.$type !== themeValue.$type) {
          warnings.push(
            `type mismatch at ${currentPath}: base is "${baseValue.$type}", theme is "${themeValue.$type}"`
          );
        }
      } else if (themeValue && typeof themeValue === 'object') {
        const baseChild = baseNode && typeof baseNode === 'object' ? baseNode[key] : undefined;
        walk(currentPath, baseChild || {}, themeValue);
      }
    }
  }

  walk('', baseTokens, themeOverrides);
  return { valid: warnings.length === 0, warnings };
}

function getNestedValue(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  return obj[key];
}

/**
 * Merge theme overrides into base tokens.
 * Theme values replace base values at the leaf level.
 * @param {object} baseTokens
 * @param {object} themeOverrides
 * @returns {object} Merged token object
 */
function mergeTheme(baseTokens, themeOverrides) {
  const merged = JSON.parse(JSON.stringify(baseTokens)); // deep clone

  function deepMerge(target, source) {
    for (const [key, value] of Object.entries(source)) {
      if (key.startsWith('$')) continue;

      if (value && typeof value === 'object' && '$type' in value) {
        // Leaf token — replace
        if (!target[key] || typeof target[key] !== 'object') {
          target[key] = {};
        }
        target[key] = { ...value };
      } else if (value && typeof value === 'object') {
        if (!target[key] || typeof target[key] !== 'object') {
          target[key] = {};
        }
        deepMerge(target[key], value);
      }
    }
  }

  deepMerge(merged, themeOverrides);
  return merged;
}

/**
 * Detect circular alias references across base and theme tokens.
 * Aliases use the {group.token} format in $value.
 * @param {object} baseTokens
 * @param {object} themeOverrides
 * @returns {{ hasCycles: boolean, cycles: string[][] }}
 */
function detectCircularAliases(baseTokens, themeOverrides) {
  // Build a merged alias graph
  const merged = mergeTheme(baseTokens, themeOverrides);
  const aliasMap = new Map(); // tokenPath -> targetPath

  function collectAliases(node, prefix) {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('$')) continue;

      const currentPath = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && '$value' in value) {
        const aliasMatch = typeof value.$value === 'string' && value.$value.match(ALIAS_PATTERN);
        if (aliasMatch) {
          aliasMap.set(currentPath, aliasMatch[1]);
        }
      } else if (value && typeof value === 'object') {
        collectAliases(value, currentPath);
      }
    }
  }

  collectAliases(merged, '');

  // Detect cycles using DFS
  const cycles = [];
  for (const [start] of aliasMap) {
    const visited = new Set();
    const path = [start];
    let current = start;

    while (aliasMap.has(current)) {
      const next = aliasMap.get(current);
      if (visited.has(next)) {
        // Found a cycle
        const cycleStart = path.indexOf(next);
        if (cycleStart !== -1) {
          cycles.push(path.slice(cycleStart).concat(next));
        } else {
          cycles.push([...path, next]);
        }
        break;
      }
      visited.add(current);
      path.push(next);
      current = next;
    }
  }

  return { hasCycles: cycles.length > 0, cycles };
}

module.exports = {
  generateThemeFiles,
  validateThemeOverrides,
  mergeTheme,
  detectCircularAliases
};
