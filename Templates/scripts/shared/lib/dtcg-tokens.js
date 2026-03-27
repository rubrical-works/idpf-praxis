// Rubrical Works (c) 2026
/**
 * @framework-script 0.74.0
 * @description DTCG token generation, directory scaffolding, and file writing.
 *   Creates default token sets conforming to the DTCG specification,
 *   scaffolds the Design-System directory structure, and writes token/schema files.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * lib/dtcg-tokens.js - DTCG token generation and file management
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Create a single DTCG token with the correct $value structure for its type.
 * @param {string} type - One of the 11 DTCG token types
 * @param {*} [value] - Custom value (uses sensible default if omitted)
 * @param {string} [description] - Token description
 * @returns {{ $type: string, $value: *, $description: string }}
 */
function createToken(type, value, description) {
  const defaults = {
    color: { $value: '#000000', $description: 'Default color token' },
    dimension: { $value: '16px', $description: 'Default dimension token' },
    fontFamily: { $value: 'system-ui, sans-serif', $description: 'Default font family' },
    fontWeight: { $value: 400, $description: 'Default font weight' },
    duration: { $value: '200ms', $description: 'Default duration' },
    cubicBezier: { $value: [0.4, 0, 0.2, 1], $description: 'Default easing curve' },
    number: { $value: 1, $description: 'Default number token' },
    shadow: {
      $value: { offsetX: '0px', offsetY: '4px', blur: '8px', spread: '0px', color: '#00000029' },
      $description: 'Default shadow'
    },
    border: {
      $value: { color: '#d1d5db', width: '1px', style: 'solid' },
      $description: 'Default border'
    },
    typography: {
      $value: { fontFamily: 'system-ui, sans-serif', fontSize: '16px', fontWeight: 400, lineHeight: 1.5, letterSpacing: '0px' },
      $description: 'Default typography'
    },
    transition: {
      $value: { duration: '200ms', delay: '0ms', timingFunction: [0.4, 0, 0.2, 1] },
      $description: 'Default transition'
    }
  };

  const def = defaults[type];
  if (!def) {
    throw new Error(`Unknown DTCG token type: ${type}`);
  }

  return {
    $type: type,
    $value: value !== undefined ? value : def.$value,
    $description: description || def.$description
  };
}

/**
 * Generate a complete default token set with all 11 DTCG types represented.
 * @returns {object} DTCG-compliant token object with $schema reference
 */
function generateDefaultTokens() {
  return {
    $schema: './idpf-design.schema.json',
    color: {
      primary: createToken('color', '#3b82f6', 'Primary brand color'),
      secondary: createToken('color', '#6366f1', 'Secondary brand color'),
      accent: createToken('color', '#f59e0b', 'Accent color'),
      neutral: {
        50: createToken('color', '#f9fafb', 'Neutral 50'),
        100: createToken('color', '#f3f4f6', 'Neutral 100'),
        500: createToken('color', '#6b7280', 'Neutral 500'),
        900: createToken('color', '#111827', 'Neutral 900')
      },
      semantic: {
        success: createToken('color', '#10b981', 'Success state'),
        warning: createToken('color', '#f59e0b', 'Warning state'),
        error: createToken('color', '#ef4444', 'Error state'),
        info: createToken('color', '#3b82f6', 'Info state')
      }
    },
    dimension: {
      spacing: {
        xs: createToken('dimension', '4px', 'Extra small spacing'),
        sm: createToken('dimension', '8px', 'Small spacing'),
        md: createToken('dimension', '16px', 'Medium spacing'),
        lg: createToken('dimension', '24px', 'Large spacing'),
        xl: createToken('dimension', '32px', 'Extra large spacing')
      },
      borderRadius: {
        sm: createToken('dimension', '4px', 'Small border radius'),
        md: createToken('dimension', '8px', 'Medium border radius'),
        lg: createToken('dimension', '16px', 'Large border radius'),
        full: createToken('dimension', '9999px', 'Full border radius (circle)')
      }
    },
    fontFamily: {
      sans: createToken('fontFamily', 'system-ui, -apple-system, sans-serif', 'Sans-serif font stack'),
      mono: createToken('fontFamily', 'ui-monospace, monospace', 'Monospace font stack')
    },
    fontWeight: {
      normal: createToken('fontWeight', 400, 'Normal weight'),
      medium: createToken('fontWeight', 500, 'Medium weight'),
      bold: createToken('fontWeight', 700, 'Bold weight')
    },
    duration: {
      fast: createToken('duration', '100ms', 'Fast animation'),
      normal: createToken('duration', '200ms', 'Normal animation'),
      slow: createToken('duration', '400ms', 'Slow animation')
    },
    cubicBezier: {
      ease: createToken('cubicBezier', [0.4, 0, 0.2, 1], 'Standard ease'),
      easeIn: createToken('cubicBezier', [0.4, 0, 1, 1], 'Ease in'),
      easeOut: createToken('cubicBezier', [0, 0, 0.2, 1], 'Ease out')
    },
    number: {
      lineHeight: {
        tight: createToken('number', 1.25, 'Tight line height'),
        normal: createToken('number', 1.5, 'Normal line height'),
        loose: createToken('number', 1.75, 'Loose line height')
      },
      opacity: {
        disabled: createToken('number', 0.5, 'Disabled state opacity'),
        full: createToken('number', 1, 'Full opacity')
      }
    },
    shadow: {
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
    },
    border: {
      default: createToken('border',
        { color: '#d1d5db', width: '1px', style: 'solid' },
        'Default border'
      ),
      focus: createToken('border',
        { color: '#3b82f6', width: '2px', style: 'solid' },
        'Focus border'
      )
    },
    typography: {
      body: createToken('typography',
        { fontFamily: 'system-ui, sans-serif', fontSize: '16px', fontWeight: 400, lineHeight: 1.5, letterSpacing: '0px' },
        'Body text style'
      ),
      heading: createToken('typography',
        { fontFamily: 'system-ui, sans-serif', fontSize: '24px', fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.025em' },
        'Heading text style'
      )
    },
    transition: {
      default: createToken('transition',
        { duration: '200ms', delay: '0ms', timingFunction: [0.4, 0, 0.2, 1] },
        'Default transition'
      ),
      slow: createToken('transition',
        { duration: '400ms', delay: '0ms', timingFunction: [0.4, 0, 0.2, 1] },
        'Slow transition'
      )
    }
  };
}

/**
 * Extract all leaf token nodes from a token tree.
 * @param {object} tokens - Token tree
 * @returns {Array<object>} Array of leaf token objects (nodes with $type)
 */
function getLeafNodes(tokens) {
  const leaves = [];

  function walk(node) {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return;

    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('$')) continue;
      if (typeof value === 'object' && value !== null && '$type' in value) {
        leaves.push(value);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        walk(value);
      }
    }
  }

  walk(tokens);
  return leaves;
}

/**
 * Scaffold the Design-System directory structure.
 * @param {string} targetDir - Path to the Design-System directory
 */
function scaffoldDirectory(targetDir) {
  const dirs = [
    targetDir,
    path.join(targetDir, 'themes'),
    path.join(targetDir, 'adapters'),
    path.join(targetDir, 'adapters', 'discovery'),
    path.join(targetDir, 'adapters', 'export')
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Write token and schema files to the target directory.
 * @param {string} targetDir - Path to the Design-System directory
 * @param {object} tokens - DTCG token object
 * @param {object} schema - JSON Schema object
 */
function writeTokenFiles(targetDir, tokens, schema) {
  const tokenPath = path.join(targetDir, 'idpf-design.tokens.json');
  const schemaPath = path.join(targetDir, 'idpf-design.schema.json');

  fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2) + '\n', 'utf8');
  fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2) + '\n', 'utf8');
}

module.exports = {
  createToken,
  generateDefaultTokens,
  getLeafNodes,
  scaffoldDirectory,
  writeTokenFiles
};
