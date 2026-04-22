// Rubrical Works (c) 2026
/**
 * @framework-script 0.90.0
 * @description React Native export adapter. Translates DTCG tokens to a
 *   JavaScript/TypeScript theme constants module.
 * @checksum sha256:placeholder
 *
 * lib/export-adapters/react-native.js - React Native export adapter
 */

'use strict';

/**
 * Translate DTCG tokens to React Native theme constants.
 * @param {object} dtcgTokens - DTCG token object
 * @param {object} options - Export options
 * @returns {Array<{ path: string, content: string }>}
 */
function translate(dtcgTokens, _options) {
  const sections = [];
  sections.push('// Auto-generated from DTCG design tokens');
  sections.push('// Do not edit manually — regenerate with /design-system --export react-native');
  sections.push('');

  for (const [groupKey, group] of Object.entries(dtcgTokens)) {
    if (groupKey.startsWith('$')) continue;
    if (typeof group !== 'object' || group === null) continue;

    const constName = groupKey.charAt(0).toUpperCase() + groupKey.slice(1);
    const values = extractValues(group);

    sections.push(`export const ${constName} = ${JSON.stringify(values, null, 2)};`);
    sections.push('');
  }

  return [{ path: 'theme.tokens.ts', content: sections.join('\n') }];
}

function extractValues(tokenGroup) {
  const result = {};
  for (const [key, value] of Object.entries(tokenGroup)) {
    if (key.startsWith('$')) continue;
    if (value && typeof value === 'object' && '$value' in value) {
      result[key] = value.$value;
    } else if (value && typeof value === 'object') {
      result[key] = extractValues(value);
    }
  }
  return result;
}

module.exports = { translate };
