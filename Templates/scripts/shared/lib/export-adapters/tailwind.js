// Rubrical Works (c) 2026
/**
 * @framework-script 0.100.2
 * @description Tailwind CSS export adapter. Translates DTCG tokens to a
 *   Tailwind config theme extension using CSS custom properties.
 * @checksum sha256:placeholder
 *
 * lib/export-adapters/tailwind.js - Tailwind CSS export adapter
 */

'use strict';

/**
 * Translate DTCG tokens to Tailwind theme extension.
 * @param {object} dtcgTokens - DTCG token object
 * @param {object} options - Export options
 * @returns {Array<{ path: string, content: string }>}
 */
function translate(dtcgTokens, _options) {
  const theme = { extend: {} };

  // Extract colors
  if (dtcgTokens.color) {
    theme.extend.colors = {};
    extractFlatTokens(dtcgTokens.color, theme.extend.colors);
  }

  // Extract spacing
  if (dtcgTokens.dimension && dtcgTokens.dimension.spacing) {
    theme.extend.spacing = {};
    extractFlatTokens(dtcgTokens.dimension.spacing, theme.extend.spacing);
  }

  // Extract font families
  if (dtcgTokens.fontFamily) {
    theme.extend.fontFamily = {};
    extractFlatTokens(dtcgTokens.fontFamily, theme.extend.fontFamily);
  }

  const content = `/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: ${serializeJsObject(theme, 1)},
};
`;

  return [{ path: 'tailwind.tokens.config.js', content }];
}

// A bare property key must be a valid JS identifier. '2xl' — which this
// framework's own dtcg-init-builder generates for spacing and font sizes —
// is not, and neither are dashed names, so unquoting every key produced a
// config that threw SyntaxError on require (#2466).
const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Format one object key: bare when it is a valid identifier, JSON-quoted
 * otherwise.
 * @param {string} key
 * @returns {string}
 */
function formatKey(key) {
  return IDENTIFIER_RE.test(key) ? key : JSON.stringify(key);
}

/**
 * Serialize a plain object to a JS object literal.
 *
 * Replaces JSON.stringify + a blanket "([^"]+)": → $1: regex. Besides
 * mangling non-identifier keys, that regex operated on the whole document, so
 * a string VALUE containing a quote-colon sequence could be corrupted too.
 * Values here go through JSON.stringify individually, which escapes them
 * correctly.
 *
 * @param {*} value
 * @param {number} [depth] - current indent depth (4 spaces per level)
 * @returns {string}
 */
function serializeJsObject(value, depth = 0) {
  const pad = ' '.repeat(depth * 4);
  const padInner = ' '.repeat((depth + 1) * 4);

  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map(v => `${padInner}${serializeJsObject(v, depth + 1)}`);
    return `[\n${items.join(',\n')}\n${pad}]`;
  }

  const keys = Object.keys(value);
  if (keys.length === 0) return '{}';

  const lines = keys.map(k =>
    `${padInner}${formatKey(k)}: ${serializeJsObject(value[k], depth + 1)}`
  );
  return `{\n${lines.join(',\n')}\n${pad}}`;
}

function extractFlatTokens(tokenGroup, target) {
  for (const [key, value] of Object.entries(tokenGroup)) {
    if (key.startsWith('$')) continue;
    if (value && typeof value === 'object' && '$value' in value) {
      target[key] = String(value.$value);
    } else if (value && typeof value === 'object') {
      target[key] = {};
      extractFlatTokens(value, target[key]);
    }
  }
}

module.exports = { translate, serializeJsObject, formatKey };
