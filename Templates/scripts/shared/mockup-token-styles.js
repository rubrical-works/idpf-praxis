/**
 * @framework-script 0.82.0
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
  return {
    fillColor: colors.background || FALLBACK_COLORS.fillColor,
    fontColor: colors.text || FALLBACK_COLORS.fontColor,
    strokeColor: colors.primary || FALLBACK_COLORS.strokeColor
  };
}

module.exports = { paletteToCSS, paletteToDrawioColors };
