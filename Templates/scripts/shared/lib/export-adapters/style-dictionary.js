// Rubrical Works (c) 2026
/**
 * @framework-script 0.91.1
 * @description Style Dictionary export adapter. Translates DTCG tokens to
 *   Amazon Style Dictionary compatible JSON format.
 * @checksum sha256:placeholder
 *
 * lib/export-adapters/style-dictionary.js - Style Dictionary export adapter
 */

'use strict';

/**
 * Translate DTCG tokens to Style Dictionary format.
 * @param {object} dtcgTokens - DTCG token object
 * @param {object} options - Export options
 * @returns {Array<{ path: string, content: string }>}
 */
function translate(dtcgTokens, _options) {
  const sdTokens = convertToSD(dtcgTokens);
  const content = JSON.stringify(sdTokens, null, 2) + '\n';
  return [{ path: 'tokens.style-dictionary.json', content }];
}

/**
 * Convert DTCG format to Style Dictionary format.
 * DTCG uses $value/$type/$description, SD uses value/type/comment.
 * @param {object} dtcgTokens
 * @returns {object}
 */
function convertToSD(dtcgTokens) {
  const result = {};

  for (const [key, value] of Object.entries(dtcgTokens)) {
    if (key.startsWith('$')) continue;

    if (value && typeof value === 'object' && '$value' in value) {
      result[key] = {
        value: value.$value,
        type: value.$type || undefined,
        comment: value.$description || undefined
      };
    } else if (value && typeof value === 'object') {
      result[key] = convertToSD(value);
    }
  }

  return result;
}

module.exports = { translate };
