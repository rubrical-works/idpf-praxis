// Rubrical Works (c) 2026
/**
 * @framework-script 0.84.0
 * @description DTCG token schema generation and validation. Generates JSON Schema
 *   for the Design Tokens Community Group specification (Living Draft 2025-04-18).
 *   Validates token files against the schema, checking $value/$type/$description
 *   structure and all 11 DTCG token types.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * lib/dtcg-schema.js - DTCG schema generation and validation
 */

'use strict';

/**
 * All 11 DTCG token types from the specification.
 * @see https://github.com/design-tokens/community-group (Living Draft 2025-04-18)
 */
const DTCG_TYPES = [
  'color',
  'dimension',
  'fontFamily',
  'fontWeight',
  'duration',
  'cubicBezier',
  'number',
  'shadow',
  'border',
  'typography',
  'transition'
];

/**
 * Value validation rules per DTCG type.
 * Each rule defines expected JavaScript typeof or validator function.
 */
const TYPE_VALIDATORS = {
  color: (v) => typeof v === 'string',
  dimension: (v) => typeof v === 'string',
  fontFamily: (v) => typeof v === 'string' || Array.isArray(v),
  fontWeight: (v) => typeof v === 'number' || typeof v === 'string',
  duration: (v) => typeof v === 'string',
  cubicBezier: (v) => Array.isArray(v) && v.length === 4 && v.every(n => typeof n === 'number'),
  number: (v) => typeof v === 'number',
  shadow: (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
  border: (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
  typography: (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
  transition: (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
};

/**
 * Generate a JSON Schema for DTCG token files.
 * @returns {object} JSON Schema object
 */
function generateSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'IDPF Design Tokens (DTCG)',
    description: 'Design tokens following the DTCG specification (Living Draft 2025-04-18)',
    type: 'object',
    properties: {
      $schema: { type: 'string' }
    },
    additionalProperties: {
      $ref: '#/$defs/tokenGroup'
    },
    $defs: {
      tokenGroup: {
        type: 'object',
        oneOf: [
          { $ref: '#/$defs/tokenLeaf' },
          {
            type: 'object',
            additionalProperties: {
              $ref: '#/$defs/tokenGroup'
            }
          }
        ]
      },
      tokenLeaf: {
        type: 'object',
        required: ['$value', '$type'],
        properties: {
          $value: {},
          $type: {
            type: 'string',
            enum: DTCG_TYPES
          },
          $description: { type: 'string' }
        }
      }
    }
  };
}

/**
 * Check if a node is a DTCG token leaf (has $value and $type).
 * @param {object} node
 * @returns {boolean}
 */
function isTokenLeaf(node) {
  return node !== null &&
    typeof node === 'object' &&
    !Array.isArray(node) &&
    '$type' in node;
}

/**
 * Validate a token file against DTCG rules.
 * @param {*} tokens - Token data to validate
 * @returns {{ valid: boolean, errors: Array<{ path: string, message: string }> }}
 */
function validateTokens(tokens) {
  const errors = [];

  if (tokens === null || tokens === undefined || typeof tokens !== 'object' || Array.isArray(tokens)) {
    return { valid: false, errors: [{ path: '$', message: 'Token file must be a JSON object' }] };
  }

  // Must have at least one token group (besides $schema)
  const groups = Object.keys(tokens).filter(k => !k.startsWith('$'));
  if (groups.length === 0) {
    return { valid: false, errors: [{ path: '$', message: 'Token file must contain at least one token group' }] };
  }

  // Recursively validate
  validateNode(tokens, '$', errors);

  return { valid: errors.length === 0, errors };
}

/**
 * Recursively validate a token node.
 * @param {object} node
 * @param {string} currentPath
 * @param {Array} errors
 */
function validateNode(node, currentPath, errors) {
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) continue; // skip meta keys

    const nodePath = `${currentPath}.${key}`;

    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      errors.push({ path: nodePath, message: `Expected object at ${nodePath}` });
      continue;
    }

    if (isTokenLeaf(value)) {
      validateLeaf(value, nodePath, errors);
    } else {
      validateNode(value, nodePath, errors);
    }
  }
}

/**
 * Validate a single token leaf node.
 * @param {object} leaf
 * @param {string} leafPath
 * @param {Array} errors
 */
function validateLeaf(leaf, leafPath, errors) {
  // Must have $value
  if (!('$value' in leaf)) {
    errors.push({ path: leafPath, message: `Missing $value at ${leafPath}` });
    return;
  }

  // $type must be a known DTCG type
  if (!DTCG_TYPES.includes(leaf.$type)) {
    errors.push({
      path: leafPath,
      message: `Unknown DTCG type "${leaf.$type}" at ${leafPath}. Valid types: ${DTCG_TYPES.join(', ')}`
    });
    return;
  }

  // Validate $value against type-specific rules
  const validator = TYPE_VALIDATORS[leaf.$type];
  if (validator && !validator(leaf.$value)) {
    errors.push({
      path: leafPath,
      message: `Invalid $value for type "${leaf.$type}" at ${leafPath}`
    });
  }
}

module.exports = {
  DTCG_TYPES,
  TYPE_VALIDATORS,
  generateSchema,
  validateTokens,
  isTokenLeaf
};
