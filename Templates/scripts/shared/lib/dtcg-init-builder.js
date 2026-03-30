// Rubrical Works (c) 2026
/**
 * @framework-script 0.77.2
 * @description DTCG init mode builder for interactive token creation.
 *   Defines token categories with sensible defaults, supports optional
 *   categories (skip), and produces valid DTCG-compliant token output.
 *   Used by the /design-system command's init mode walkthrough.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * lib/dtcg-init-builder.js - Init mode category definitions and token builder
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { createToken } = require('./dtcg-tokens');

/**
 * Check whether init mode should be triggered.
 * @param {string} designSystemDir - Path to the Design-System directory
 * @returns {boolean} true if no token file exists
 */
function shouldStartInit(designSystemDir) {
  const tokenPath = path.join(designSystemDir, 'idpf-design.tokens.json');
  return !fs.existsSync(tokenPath);
}

/**
 * Get all init mode categories with their groups and defaults.
 * Each category defines groups of tokens with sensible default values.
 *
 * @returns {Array<{
 *   name: string,
 *   label: string,
 *   description: string,
 *   optional: boolean,
 *   groups: Array<{ name: string, label: string, type: string, defaultValue: * }>
 * }>}
 */
function getCategories() {
  return [
    {
      name: 'color',
      label: 'Color Palette',
      description: 'Define your brand and semantic colors',
      optional: false,
      groups: [
        { name: 'primary', label: 'Primary color', type: 'color', defaultValue: '#3b82f6' },
        { name: 'secondary', label: 'Secondary color', type: 'color', defaultValue: '#6366f1' },
        { name: 'accent', label: 'Accent color', type: 'color', defaultValue: '#f59e0b' },
        { name: 'neutral', label: 'Neutral palette base', type: 'color', defaultValue: '#6b7280' },
        { name: 'semantic', label: 'Semantic colors (success/warning/error/info)', type: 'color', defaultValue: '#10b981' }
      ]
    },
    {
      name: 'typography',
      label: 'Typography',
      description: 'Define font families, sizes, and weights',
      optional: false,
      groups: [
        { name: 'fontFamily', label: 'Primary font family', type: 'fontFamily', defaultValue: 'system-ui, -apple-system, sans-serif' },
        { name: 'fontSize', label: 'Base font size', type: 'dimension', defaultValue: '16px' },
        { name: 'fontWeight', label: 'Base font weight', type: 'fontWeight', defaultValue: 400 }
      ]
    },
    {
      name: 'spacing',
      label: 'Spacing',
      description: 'Define spacing base unit and scale',
      optional: false,
      groups: [
        { name: 'baseUnit', label: 'Base spacing unit', type: 'dimension', defaultValue: '8px' },
        { name: 'scale', label: 'Spacing scale multipliers', type: 'number', defaultValue: 1 }
      ]
    },
    {
      name: 'components',
      label: 'Component Patterns',
      description: 'Border radii, shadows, and transitions',
      optional: true,
      groups: [
        { name: 'borderRadius', label: 'Default border radius', type: 'dimension', defaultValue: '8px' },
        { name: 'shadow', label: 'Default shadow', type: 'shadow', defaultValue: { offsetX: '0px', offsetY: '4px', blur: '6px', spread: '-1px', color: '#0000001a' } },
        { name: 'transition', label: 'Default transition', type: 'transition', defaultValue: { duration: '200ms', delay: '0ms', timingFunction: [0.4, 0, 0.2, 1] } }
      ]
    }
  ];
}

/**
 * Build a DTCG token set from selected categories with optional custom values.
 *
 * @param {string[]} selectedCategories - Category names to include
 * @param {object} [customValues] - Custom values keyed by category.group
 * @returns {object} DTCG-compliant token object with $schema
 */
function buildTokens(selectedCategories, customValues = {}) {
  const allCategories = getCategories();
  const tokens = {
    $schema: './idpf-design.schema.json'
  };

  for (const catName of selectedCategories) {
    const category = allCategories.find(c => c.name === catName);
    if (!category) continue;

    const categoryCustom = customValues[catName] || {};

    switch (catName) {
      case 'color':
        tokens.color = buildColorTokens(category, categoryCustom);
        break;
      case 'typography':
        tokens.fontFamily = buildTypographyFamilyTokens(category, categoryCustom);
        tokens.dimension = tokens.dimension || {};
        tokens.dimension.fontSize = buildFontSizeTokens(category, categoryCustom);
        tokens.fontWeight = buildFontWeightTokens(category, categoryCustom);
        break;
      case 'spacing':
        tokens.dimension = tokens.dimension || {};
        Object.assign(tokens.dimension, buildSpacingTokens(category, categoryCustom));
        break;
      case 'components':
        tokens.dimension = tokens.dimension || {};
        tokens.dimension.borderRadius = buildBorderRadiusTokens(category, categoryCustom);
        tokens.shadow = buildShadowTokens(category, categoryCustom);
        tokens.transition = buildTransitionTokens(category, categoryCustom);
        break;
    }
  }

  return tokens;
}

function buildColorTokens(category, custom) {
  const primaryVal = custom.primary || '#3b82f6';
  const secondaryVal = custom.secondary || '#6366f1';
  const accentVal = custom.accent || '#f59e0b';

  return {
    primary: createToken('color', primaryVal, 'Primary brand color'),
    secondary: createToken('color', secondaryVal, 'Secondary brand color'),
    accent: createToken('color', accentVal, 'Accent color'),
    neutral: {
      50: createToken('color', '#f9fafb', 'Neutral 50'),
      100: createToken('color', '#f3f4f6', 'Neutral 100'),
      300: createToken('color', '#d1d5db', 'Neutral 300'),
      500: createToken('color', custom.neutral || '#6b7280', 'Neutral 500'),
      700: createToken('color', '#374151', 'Neutral 700'),
      900: createToken('color', '#111827', 'Neutral 900')
    },
    semantic: {
      success: createToken('color', custom.semantic || '#10b981', 'Success state'),
      warning: createToken('color', '#f59e0b', 'Warning state'),
      error: createToken('color', '#ef4444', 'Error state'),
      info: createToken('color', primaryVal, 'Info state')
    }
  };
}

function buildTypographyFamilyTokens(category, custom) {
  const familyGroup = category.groups.find(g => g.name === 'fontFamily');
  const familyVal = custom.fontFamily || familyGroup.defaultValue;
  return {
    sans: createToken('fontFamily', familyVal, 'Sans-serif font stack'),
    mono: createToken('fontFamily', 'ui-monospace, monospace', 'Monospace font stack')
  };
}

function buildFontSizeTokens(category, custom) {
  return {
    xs: createToken('dimension', '12px', 'Extra small text'),
    sm: createToken('dimension', '14px', 'Small text'),
    base: createToken('dimension', custom.fontSize || '16px', 'Base text size'),
    lg: createToken('dimension', '18px', 'Large text'),
    xl: createToken('dimension', '24px', 'Extra large text'),
    '2xl': createToken('dimension', '30px', 'Heading text')
  };
}

function buildFontWeightTokens(category, custom) {
  return {
    normal: createToken('fontWeight', custom.fontWeight || 400, 'Normal weight'),
    medium: createToken('fontWeight', 500, 'Medium weight'),
    semibold: createToken('fontWeight', 600, 'Semi-bold weight'),
    bold: createToken('fontWeight', 700, 'Bold weight')
  };
}

function buildSpacingTokens(category, custom) {
  const baseUnit = parseInt(custom.baseUnit || '8', 10);
  return {
    spacing: {
      xs: createToken('dimension', `${baseUnit / 2}px`, 'Extra small spacing'),
      sm: createToken('dimension', `${baseUnit}px`, 'Small spacing'),
      md: createToken('dimension', `${baseUnit * 2}px`, 'Medium spacing'),
      lg: createToken('dimension', `${baseUnit * 3}px`, 'Large spacing'),
      xl: createToken('dimension', `${baseUnit * 4}px`, 'Extra large spacing'),
      '2xl': createToken('dimension', `${baseUnit * 6}px`, 'Double extra large spacing')
    }
  };
}

function buildBorderRadiusTokens(category, custom) {
  const radiusGroup = category.groups.find(g => g.name === 'borderRadius');
  const base = parseInt(custom.borderRadius || radiusGroup.defaultValue, 10);
  return {
    sm: createToken('dimension', `${base / 2}px`, 'Small border radius'),
    md: createToken('dimension', `${base}px`, 'Medium border radius'),
    lg: createToken('dimension', `${base * 2}px`, 'Large border radius'),
    full: createToken('dimension', '9999px', 'Full border radius (circle)')
  };
}

function buildShadowTokens(_category, _custom) {
  return {
    sm: createToken('shadow',
      { offsetX: '0px', offsetY: '1px', blur: '2px', spread: '0px', color: '#0000001a' },
      'Small shadow'
    ),
    md: createToken('shadow',
      { offsetX: '0px', offsetY: '4px', blur: '6px', spread: '-1px', color: '#0000001a' },
      'Medium shadow'
    ),
    lg: createToken('shadow',
      { offsetX: '0px', offsetY: '10px', blur: '15px', spread: '-3px', color: '#0000001a' },
      'Large shadow'
    )
  };
}

function buildTransitionTokens(_category, _custom) {
  return {
    default: createToken('transition',
      { duration: '200ms', delay: '0ms', timingFunction: [0.4, 0, 0.2, 1] },
      'Default transition'
    ),
    slow: createToken('transition',
      { duration: '400ms', delay: '0ms', timingFunction: [0.4, 0, 0.2, 1] },
      'Slow transition'
    )
  };
}

module.exports = {
  shouldStartInit,
  getCategories,
  buildTokens
};
