// Rubrical Works (c) 2026
/**
 * @framework-script 0.91.1
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
  theme: ${JSON.stringify(theme, null, 4).replace(/"([^"]+)":/g, '$1:')},
};
`;

  return [{ path: 'tailwind.tokens.config.js', content }];
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

module.exports = { translate };
