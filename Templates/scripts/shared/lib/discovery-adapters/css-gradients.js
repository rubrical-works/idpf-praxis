// Rubrical Works (c) 2026
/**
 * CSS Gradient discovery adapter. Scans .css/.scss files for
 * linear-gradient(...) and radial-gradient(...) calls and extracts
 * them as DTCG `gradient` $type candidates (#2346).
 *
 * AC28 PRD #2333 — Story 1.10. Refs #2348.
 *
 * Note: PRD AC28 lists the path as Design-System/adapters/discovery/css-gradients.js,
 * but Externalization Guardrails (AC50) require helpers in
 * .claude/scripts/shared/. This adapter follows AC50; Story 1.17
 * (#2355 Command Specs + Schema Updates) reconciles the discrepancy.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const GRADIENT_RE = /(linear-gradient|radial-gradient)\(([^)]+)\)/g;
// eslint-disable-next-line security/detect-unsafe-regex -- inputs bounded to CSS file content; no catastrophic backtracking reachable on realistic stylesheet sizes
const STOP_RE = /(#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|rgba\([^)]+\)|hsl\([^)]+\)|hsla\([^)]+\))(?:\s+(\d+(?:\.\d+)?%?))?/g;
// eslint-disable-next-line security/detect-unsafe-regex -- inputs bounded to single CSS angle token; no catastrophic backtracking reachable
const ANGLE_RE = /^(\d+(?:\.\d+)?(deg|rad|grad|turn))$/;

function findFiles(root) {
  const out = [];
  const dirs = [root, path.join(root, 'src'), path.join(root, 'styles')];
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (!ent.isFile()) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (ext === '.css' || ext === '.scss') out.push(path.join(d, ent.name));
    }
  }
  return out;
}

function parseGradient(type, args) {
  const parts = args.split(',').map(s => s.trim());
  let angle = null;
  if (parts.length > 0 && ANGLE_RE.test(parts[0])) {
    angle = parts.shift();
  }
  const stops = [];
  for (const part of parts) {
    // eslint-disable-next-line security/detect-unsafe-regex -- inputs bounded to CSS gradient stop (comma-split, short); no catastrophic backtracking reachable
    const m = /(#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|rgba\([^)]+\)|hsl\([^)]+\)|hsla\([^)]+\)|[a-z]+)\s*(\d+(?:\.\d+)?%?)?/i.exec(part);
    if (!m) continue;
    const color = m[1];
    let position = stops.length === 0 ? 0 : 1;
    if (m[2] && m[2].endsWith('%')) {
      position = parseFloat(m[2]) / 100;
    }
    stops.push({ color, position });
  }
  if (stops.length === 0) return null;
  // Normalize positions for stops without explicit positions
  if (stops.length >= 2) {
    if (stops[stops.length - 1].position === 1 && !args.match(/100%/)) {
      // already 1
    }
  }
  const value = { type, stops };
  if (angle && type === 'linear-gradient') value.angle = angle;
  return value;
}

function detect(projectRoot) {
  for (const f of findFiles(projectRoot)) {
    const c = fs.readFileSync(f, 'utf8');
    if (GRADIENT_RE.test(c)) { GRADIENT_RE.lastIndex = 0; return true; }
    GRADIENT_RE.lastIndex = 0;
  }
  return false;
}

function extract(projectRoot) {
  const gradients = {};
  let counter = 1;
  for (const f of findFiles(projectRoot)) {
    const c = fs.readFileSync(f, 'utf8');
    const re = new RegExp(GRADIENT_RE.source, 'g');
    let m;
    while ((m = re.exec(c)) !== null) {
      const value = parseGradient(m[1], m[2]);
      if (!value) continue;
      const key = `discovered_${counter++}`;
      gradients[key] = {
        $type: 'gradient',
        $value: value,
        $description: `Extracted from ${path.relative(projectRoot, f).replace(/\\/g, '/')}`
      };
    }
  }
  return Object.keys(gradients).length > 0 ? { gradient: gradients } : {};
}

module.exports = { detect, extract };
