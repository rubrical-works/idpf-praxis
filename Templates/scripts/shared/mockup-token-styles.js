/**
 * @framework-script 0.123.0
 * @description Converts design token palette (from dtcg-token-reader.js getMockupPalette())
 *   into CSS custom properties for HTML mockups and color maps for drawio.svg mockups.
 *   Used by /mockups command Step 2 when design tokens are available.
 */

const FALLBACK_COLORS = {
  fillColor: '#ffffff',
  fontColor: '#111827',
  strokeColor: '#3b82f6'
};

/**
 * Convert a DTCG gradient token to a CSS gradient value.
 *
 * @param {Object} g - Gradient token value
 * @returns {string|null} CSS gradient, or null for an unknown type
 */
function gradientToCSS(g) {
  const stops = (g.stops || []).map(s => `${s.color} ${Math.round(s.position * 100)}%`).join(', ');
  if (g.type === 'linear-gradient') {
    const angle = g.angle || '180deg';
    return `linear-gradient(${angle}, ${stops})`;
  }
  if (g.type === 'radial-gradient') {
    return `radial-gradient(${stops})`;
  }
  return null;
}

/**
 * Map a DTCG token path to a valid CSS custom property name segment (#3843).
 * Token paths are dotted (`primary.50`, `semantic.background`); a dot is not a
 * CSS name code point, so a verbatim path makes the browser drop the whole
 * declaration. Every character outside [A-Za-z0-9_-] becomes `-`:
 * `semantic.background` → `--color-semantic-background`.
 *
 * @param {string} key - Token path
 * @returns {string} Name-safe segment
 */
function cssNameSegment(key) {
  return String(key).replace(/[^A-Za-z0-9_-]/g, '-');
}

/**
 * Convert a mockup palette to a CSS :root block with custom properties.
 *
 * @param {Object} palette - From getMockupPalette()
 * @returns {string} CSS :root block
 */
function paletteToCSS(palette) {
  const props = [];
  const seen = new Map(); // emitted name → original token path

  const emit = (prefix, key, value) => {
    const name = `--${prefix}-${cssNameSegment(key)}`;
    if (seen.has(name)) {
      console.warn(
        `mockup-token-styles: token paths "${seen.get(name)}" and "${key}" both map to ${name}; ` +
        `keeping "${seen.get(name)}", skipping "${key}".`
      );
      return;
    }
    seen.set(name, key);
    props.push(`  ${name}: ${value};`);
  };

  for (const [key, value] of Object.entries(palette.colors || {})) {
    emit('color', key, value);
  }
  for (const [key, value] of Object.entries(palette.fonts || {})) {
    emit('font', key, value);
  }
  for (const [key, value] of Object.entries(palette.spacing || {})) {
    emit('spacing', key, value);
  }
  for (const [key, value] of Object.entries(palette.gradients || {})) {
    const css = gradientToCSS(value);
    if (css) emit('gradient', key, css);
  }

  return `:root {\n${props.join('\n')}\n}`;
}

/**
 * Convert a mockup palette to a drawio color map for mxGraphModel style attributes.
 *
 * @param {Object} palette - From getMockupPalette()
 * @returns {Object} { fillColor, fontColor, strokeColor }
 */
function paletteToDrawioColors(palette) {
  const colors = palette.colors || {};
  const gradients = {};
  // drawio cannot render CSS gradients; emit a hint with the first stop as a solid-color fallback
  // so layouts referencing the gradient have a stable color and downstream tooling can branch on the
  // hint to switch to a sketch/SVG path if/when needed.
  for (const [key, g] of Object.entries(palette.gradients || {})) {
    const firstStop = g && Array.isArray(g.stops) && g.stops[0];
    gradients[key] = {
      type: g.type,
      fallbackColor: (firstStop && firstStop.color) || FALLBACK_COLORS.fillColor,
      stops: g.stops || []
    };
  }
  return {
    fillColor: colors.background || FALLBACK_COLORS.fillColor,
    fontColor: colors.text || FALLBACK_COLORS.fontColor,
    strokeColor: colors.primary || FALLBACK_COLORS.strokeColor,
    gradients
  };
}

module.exports = { paletteToCSS, paletteToDrawioColors, gradientToCSS, cssNameSegment };
