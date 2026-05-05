/**
 * @framework-script 0.91.0
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
 * Convert a mockup palette to a CSS :root block with custom properties.
 *
 * @param {Object} palette - From getMockupPalette()
 * @returns {string} CSS :root block
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

function paletteToCSS(palette) {
  const props = [];

  for (const [key, value] of Object.entries(palette.colors || {})) {
    props.push(`  --color-${key}: ${value};`);
  }
  for (const [key, value] of Object.entries(palette.fonts || {})) {
    props.push(`  --font-${key}: ${value};`);
  }
  for (const [key, value] of Object.entries(palette.spacing || {})) {
    props.push(`  --spacing-${key}: ${value};`);
  }
  for (const [key, value] of Object.entries(palette.gradients || {})) {
    const css = gradientToCSS(value);
    if (css) props.push(`  --gradient-${key}: ${css};`);
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

module.exports = { paletteToCSS, paletteToDrawioColors, gradientToCSS };
