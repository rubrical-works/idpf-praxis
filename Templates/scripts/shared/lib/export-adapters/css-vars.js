// Rubrical Works (c) 2026
/**
 * @framework-script 0.91.0
 * @description CSS Custom Properties export adapter. Translates DTCG tokens
 *   to a CSS file with :root custom property declarations.
 * @checksum sha256:placeholder
 *
 * lib/export-adapters/css-vars.js - CSS Variables export adapter
 */

'use strict';

/**
 * Translate DTCG tokens to CSS custom properties.
 * @param {object} dtcgTokens - DTCG token object
 * @param {object} options - Export options
 * @returns {Array<{ path: string, content: string }>}
 */
function translate(dtcgTokens, _options) {
  const vars = [];

  function walk(node, prefix) {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('$')) continue;

      if (value && typeof value === 'object' && '$type' in value) {
        const varName = `--${prefix}${key}`.replace(/_/g, '-');
        const cssValue = formatValue(value.$type, value.$value);
        vars.push(`  ${varName}: ${cssValue};`);
      } else if (value && typeof value === 'object') {
        walk(value, `${prefix}${key}-`);
      }
    }
  }

  walk(dtcgTokens, '');

  const css = `:root {\n${vars.join('\n')}\n}\n`;
  return [{ path: 'design-tokens.css', content: css }];
}

function formatValue(type, value) {
  if (typeof value === 'object' && value !== null) {
    if (type === 'shadow') {
      return `${value.offsetX} ${value.offsetY} ${value.blur} ${value.spread} ${value.color}`;
    }
    if (type === 'border') {
      return `${value.width} ${value.style} ${value.color}`;
    }
    if (type === 'cubicBezier') {
      return `cubic-bezier(${value.join(', ')})`;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

module.exports = { translate };
