// Rubrical Works (c) 2026
/**
 * @framework-script 0.91.0
 * DTCG gradient $type helpers (#2346).
 *   - validateGradientValue: structural check (linear/radial + stops)
 *   - resolveGradientAlias: resolve {color.path} references inside stop colors
 *   - getDefaultGradients: fallback gradient palette when no tokens defined (AC30)
 */

'use strict';

const ALLOWED_GRADIENT_TYPES = ['linear-gradient', 'radial-gradient'];

function validateGradientValue(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  if (!ALLOWED_GRADIENT_TYPES.includes(value.type)) return false;
  if (!Array.isArray(value.stops) || value.stops.length === 0) return false;
  return value.stops.every(s =>
    s && typeof s === 'object' && typeof s.color === 'string' && typeof s.position === 'number'
  );
}

function resolveGradientAlias(maybeAlias, tokens) {
  if (typeof maybeAlias !== 'string') {
    return { ok: false, error: 'Alias must be a string' };
  }
  const m = /^\{([^}]+)\}$/.exec(maybeAlias);
  if (!m) {
    return { ok: true, value: maybeAlias }; // literal pass-through
  }
  const segments = m[1].split('.');
  let cursor = tokens;
  for (const seg of segments) {
    if (cursor && typeof cursor === 'object' && seg in cursor) {
      cursor = cursor[seg];
    } else {
      return { ok: false, error: `alias broken: target ${maybeAlias} not found` };
    }
  }
  // If cursor is a DTCG leaf, return its $value
  if (cursor && typeof cursor === 'object' && '$value' in cursor) {
    return { ok: true, value: cursor.$value };
  }
  return { ok: true, value: cursor };
}

const DEFAULT_GRADIENTS = Object.freeze({
  primary: {
    type: 'linear-gradient',
    angle: '180deg',
    stops: [
      { color: '#3B82F6', position: 0 },
      { color: '#1E40AF', position: 1 }
    ]
  },
  accent: {
    type: 'linear-gradient',
    angle: '90deg',
    stops: [
      { color: '#06B6D4', position: 0 },
      { color: '#22D3EE', position: 1 }
    ]
  },
  surface: {
    type: 'radial-gradient',
    stops: [
      { color: '#F8FAFC', position: 0 },
      { color: '#E2E8F0', position: 1 }
    ]
  }
});

function getDefaultGradients() {
  return JSON.parse(JSON.stringify(DEFAULT_GRADIENTS));
}

module.exports = {
  validateGradientValue,
  resolveGradientAlias,
  getDefaultGradients,
  ALLOWED_GRADIENT_TYPES
};
