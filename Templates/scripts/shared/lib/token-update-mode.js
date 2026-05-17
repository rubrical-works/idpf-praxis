// Rubrical Works (c) 2026
/**
 * @framework-script 0.92.0
 * Token update-mode helpers for /design-system.
 * AC35 — PRD #2333 Story 1.13. Refs #2351.
 *
 * detectMode: 'init' | 'update' | 'unreadable'
 * backupAndOffer: copy unreadable file to .bak.{ts}, return path
 * mergeUpdate: deep-merge updates onto original, preserving untouched groups byte-for-byte
 */

'use strict';

const fs = require('fs');

function detectMode(tokenPath) {
  if (!fs.existsSync(tokenPath)) return 'init';
  try {
    JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    return 'update';
  } catch {
    return 'unreadable';
  }
}

function backupAndOffer(tokenPath) {
  const ts = Date.now();
  const backupPath = `${tokenPath}.bak.${ts}`;
  fs.copyFileSync(tokenPath, backupPath);
  return { backupPath, message: `Original moved to ${backupPath} — proceed with init walkthrough.` };
}

function mergeUpdate(original, updates) {
  const merged = JSON.parse(JSON.stringify(original));
  for (const [key, value] of Object.entries(updates || {})) {
    if (key.startsWith('$')) continue;
    if (value && typeof value === 'object' && '$type' in value) {
      merged[key] = JSON.parse(JSON.stringify(value));
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      merged[key] = mergeUpdate(merged[key] || {}, value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

module.exports = { detectMode, backupAndOffer, mergeUpdate };
