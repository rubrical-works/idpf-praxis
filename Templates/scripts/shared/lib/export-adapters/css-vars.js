// Rubrical Works (c) 2026
/**
 * @framework-script 0.96.1
 * @description CSS Custom Properties export adapter. Translates DTCG tokens
 *   to a CSS file with :root custom property declarations.
 * @checksum sha256:placeholder
 *
 * lib/export-adapters/css-vars.js - CSS Variables export adapter
 */

'use strict';

/**
 * Local copy of the DTCG leaf predicate.
 *
 * Deliberately NOT imported from ../dtcg-schema.js: export adapters are
 * copied out of this tree into a project's adapter directory, where a
 * relative require to a sibling lib file does not resolve and the adapter
 * silently fails to load. Adapters must stay self-contained.
 *
 * Keep in sync with dtcg-schema.isTokenLeaf — $value is definitive, and a
 * bare { $type } with no children counts as a (malformed) leaf.
 *
 * @param {*} node
 * @returns {boolean}
 */
function isTokenLeaf(node) {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return false;
  if ('$value' in node) return true;
  if ('$type' in node) return !Object.keys(node).some(k => !k.startsWith('$'));
  return false;
}

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

      if (isTokenLeaf(value)) {
        // A malformed leaf carrying $type but no $value has nothing to emit;
        // String(undefined) used to put a literal "undefined" in the CSS.
        if (value.$value === undefined) continue;

        const varName = `--${prefix}${key}`.replace(/_/g, '-');
        // Typography has no single CSS value — it expands into one custom
        // property per sub-property instead of one unusable blob.
        if (value.$type === 'typography' && isPlainObject(value.$value)) {
          for (const [prop, propValue] of Object.entries(value.$value)) {
            vars.push(`  ${varName}-${camelToKebab(prop)}: ${String(propValue)};`);
          }
          continue;
        }

        const cssValue = formatValue(value.$type, value.$value);
        // A composite with no CSS representation is skipped, not stringified
        // into JSON that no parser accepts (#2466).
        if (cssValue === null) continue;
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

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** fontFamily -> font-family, so sub-properties read as CSS names. */
function camelToKebab(name) {
  return String(name).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/** Render a cubicBezier array, or pass a keyword timing function through. */
function formatTimingFunction(tf) {
  if (Array.isArray(tf)) return `cubic-bezier(${tf.join(', ')})`;
  return String(tf);
}

/** Render a gradient token as its CSS function call. */
function formatGradient(value) {
  if (!isPlainObject(value) || !Array.isArray(value.stops) || value.stops.length === 0) {
    return null;
  }
  const stops = value.stops.map(s => {
    const pos = typeof s.position === 'number' ? ` ${s.position * 100}%` : '';
    return `${s.color}${pos}`;
  });
  const head = value.angle ? [value.angle] : [];
  const type = value.type || 'linear-gradient';
  return `${type}(${[...head, ...stops].join(', ')})`;
}

/**
 * Render a token value as CSS.
 *
 * Anything without a CSS representation returns null so the caller can skip
 * it. The previous fallthrough was JSON.stringify, which emitted raw object
 * literals into the stylesheet for typography, transition and gradient — and
 * the default token set always includes typography and transition, so the
 * default pipeline shipped invalid CSS (#2466).
 *
 * @param {string} type - DTCG $type
 * @param {*} value - DTCG $value
 * @returns {string|null} CSS value, or null when it cannot be represented
 */
function formatValue(type, value) {
  if (typeof value === 'object' && value !== null) {
    if (type === 'shadow') {
      return `${value.offsetX} ${value.offsetY} ${value.blur} ${value.spread} ${value.color}`;
    }
    if (type === 'border') {
      return `${value.width} ${value.style} ${value.color}`;
    }
    if (type === 'cubicBezier') {
      return formatTimingFunction(value);
    }
    if (type === 'transition') {
      const parts = [value.duration, formatTimingFunction(value.timingFunction), value.delay]
        .filter(p => p !== undefined && p !== null && p !== '');
      return parts.length > 0 ? parts.join(' ') : null;
    }
    if (type === 'gradient') {
      return formatGradient(value);
    }
    if (type === 'fontFamily' && Array.isArray(value)) {
      return value.join(', ');
    }
    return null;
  }
  return String(value);
}

module.exports = { translate, formatValue, formatGradient, camelToKebab };
