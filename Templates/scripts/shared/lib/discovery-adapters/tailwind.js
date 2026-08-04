// Rubrical Works (c) 2026
/**
 * @framework-script 0.95.0
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
 * Extract the text of a brace-delimited block following `key:`.
 *
 * The previous `\{([^}]+)\}` stopped at the first inner `}`, so a nested
 * palette lost every group after the first and its scale keys were promoted
 * to top-level colour names (#2466). This walks braces by depth instead,
 * while skipping over string literals so a brace inside a value cannot
 * unbalance the scan.
 *
 * @param {string} content - full config source
 * @param {RegExp} keyRe - matches the key and its colon, e.g. /colors?\s*:\s*\{/
 * @returns {string|null} the block body without its outer braces, or null
 */
function extractBlock(content, keyRe) {
  const re = new RegExp(keyRe.source, 'g');
  const m = re.exec(content);
  if (!m) return null;

  const openIndex = content.indexOf('{', m.index + m[0].length - 1);
  if (openIndex === -1) return null;

  const span = readBraceSpan(content, openIndex);
  return span ? span.body : null;
}

/**
 * Read the brace-delimited span starting at `openIndex`, skipping over string
 * literals so a brace inside a value cannot unbalance the scan.
 *
 * @param {string} content
 * @param {number} openIndex - index of the '{' to match
 * @returns {{body: string, endIndex: number}|null} null when unbalanced
 */
function readBraceSpan(content, openIndex) {
  let depth = 0;
  let quote = null;

  for (let i = openIndex; i < content.length; i++) {
    const ch = content[i];

    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return { body: content.slice(openIndex + 1, i), endIndex: i };
      }
    }
  }
  return null; // unbalanced — treat as absent rather than throwing
}

/**
 * Walk a theme block, emitting one entry per leaf with its path joined by
 * underscores. Nested keys are path-prefixed so `brand.900` and `gray.900`
 * no longer collide on the terminal key (#2466).
 *
 * @param {string} block - block body from extractBlock
 * @param {string[]} [prefix] - accumulated key path
 * @returns {Array<{path: string[], value: string}>}
 */
function walkBlock(block, prefix = []) {
  const entries = [];
  // Each key is either `key: '<scalar>'` or `key: { ... }`.
  const keyRe = /['"]?([\w.-]+)['"]?\s*:\s*(\{|['"])/g;
  let m;

  while ((m = keyRe.exec(block)) !== null) {
    const key = m[1];

    if (m[2] === '{') {
      // m[0] ends on the '{' itself, so its index is unambiguous.
      const openIndex = m.index + m[0].length - 1;
      const span = readBraceSpan(block, openIndex);
      if (span) {
        entries.push(...walkBlock(span.body, [...prefix, key]));
        // Resume after the nested block so its keys are not re-scanned here.
        keyRe.lastIndex = span.endIndex + 1;
      }
      continue;
    }

    const quote = m[2];
    const valueStart = m.index + m[0].length;
    const valueEnd = block.indexOf(quote, valueStart);
    if (valueEnd === -1) continue;
    entries.push({ path: [...prefix, key], value: block.slice(valueStart, valueEnd) });
    keyRe.lastIndex = valueEnd + 1;
  }

  return entries;
}

/**
 * Extract theme values from Tailwind config to DTCG tokens.
 * Uses brace-aware parsing to extract theme values without executing the config.
 * @param {string} projectRoot
 * @returns {object} DTCG token groups
 */
function extract(projectRoot) {
  const configFile = CONFIG_FILES.find(f => fs.existsSync(path.join(projectRoot, f)));
  if (!configFile) return {};

  const content = fs.readFileSync(path.join(projectRoot, configFile), 'utf8');
  const tokens = {};

  const colorBlock = extractBlock(content, /colors?\s*:\s*\{/);
  if (colorBlock !== null) {
    const entries = walkBlock(colorBlock);
    if (entries.length > 0) {
      tokens.color = {};
      for (const { path: keyPath, value } of entries) {
        const name = keyPath.join('_');
        tokens.color[name] = {
          $type: 'color',
          $value: value,
          $description: `Extracted from Tailwind theme color "${keyPath.join('.')}"`
        };
      }
    }
  }

  const spacingBlock = extractBlock(content, /spacing\s*:\s*\{/);
  if (spacingBlock !== null) {
    const entries = walkBlock(spacingBlock);
    if (entries.length > 0) {
      tokens.dimension = tokens.dimension || {};
      for (const { path: keyPath, value } of entries) {
        const name = `spacing_${keyPath.join('_')}`;
        tokens.dimension[name] = {
          $type: 'dimension',
          $value: value,
          $description: `Extracted from Tailwind theme spacing "${keyPath.join('.')}"`
        };
      }
    }
  }

  return tokens;
}

module.exports = { detect, extract, extractBlock, walkBlock };
