// Rubrical Works (c) 2026
/**
 * @framework-script 0.99.0
 * @description CSS Gradient discovery adapter. Scans .css/.scss files for
 * linear-gradient(...) and radial-gradient(...) calls and extracts them as
 * DTCG `gradient` $type candidates (#2346).
 * @checksum sha256:placeholder
 *
 * AC28 PRD #2333 — Story 1.10. Refs #2348.
 *
 * Note: PRD AC28 lists the path as Design-System/adapters/discovery/css-gradients.js,
 * but Externalization Guardrails (AC50) require helpers in
 * .claude/scripts/shared/. This adapter follows AC50; Story 1.17
 * (#2355 Command Specs + Schema Updates) reconciles the discrepancy.
 *
 * @module .claude/scripts/shared/lib/discovery-adapters/css-gradients
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Locates the opening `linear-gradient(` / `radial-gradient(` only. The
// matching close paren is found by scanning, not by regex: the previous
// `\(([^)]+)\)` stopped at the FIRST `)`, so any gradient with function-valued
// stops — rgb(), rgba(), hsl() — was truncated mid-value (#2466).
const GRADIENT_OPEN_RE = /(linear-gradient|radial-gradient)\(/g;
// Colour-stop pieces, matched separately rather than as one combined pattern:
// a single alternation-plus-optional-suffix regex trips the unsafe-regex
// detector, and splitting the concerns reads better anyway.
const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;
const KEYWORD_RE = /^[a-zA-Z]+$/;
const COLOR_FN_RE = /^(rgba?|hsla?)\(/i;

/**
 * Parse a CSS percentage into a 0..1 fraction.
 *
 * Done with Number() rather than a regex: the natural pattern
 * (`\d+(\.\d+)?%`) trips the unsafe-regex lint, and Number() is stricter than
 * the parseFloat it replaces — parseFloat('12abc%') silently yielded 12.
 *
 * @param {string} text
 * @returns {number|null} fraction, or null when `text` is not a percentage
 */
function parsePercent(text) {
  if (typeof text !== 'string' || !text.endsWith('%')) return null;
  const body = text.slice(0, -1);
  if (body === '') return null;
  const n = Number(body);
  return Number.isFinite(n) ? n / 100 : null;
}
// eslint-disable-next-line security/detect-unsafe-regex -- inputs bounded to single CSS angle token; no catastrophic backtracking reachable
const ANGLE_RE = /^(\d+(?:\.\d+)?(deg|rad|grad|turn))$/;
// Direction keywords ("to right", "to bottom left") are not colour stops.
const DIRECTION_RE = /^to\s+[a-z\s]+$/i;

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

/**
 * Given the index of an opening paren, return the index of its matching close
 * paren, or -1 if unbalanced.
 * @param {string} text
 * @param {number} openIndex - index of the '(' to match
 * @returns {number}
 */
function findMatchingParen(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Split an argument list on top-level commas only, so commas inside rgb(...)
 * or hsl(...) do not fragment a single colour stop (#2466).
 * @param {string} args
 * @returns {string[]}
 */
function splitTopLevel(args) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of args) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * Parse one colour stop into {color, position}.
 *
 * Splitting colour from position by scanning rather than by one combined
 * regex keeps `rgb(...)` intact: the old pattern's `[a-z]+` fallback matched
 * the bare word "rgb" (and "to") as a colour once the value had already been
 * truncated (#2466).
 *
 * @param {string} part - one top-level argument, e.g. "rgb(1, 2, 3) 50%"
 * @returns {{color: string, position: number|null}|null}
 */
function parseStop(part) {
  const text = part.trim();
  if (!text) return null;

  let color;
  let rest;

  if (COLOR_FN_RE.test(text)) {
    const open = text.indexOf('(');
    const close = findMatchingParen(text, open);
    if (close === -1) return null;
    color = text.slice(0, close + 1);
    rest = text.slice(close + 1).trim();
  } else {
    const spaceIndex = text.search(/\s/);
    color = spaceIndex === -1 ? text : text.slice(0, spaceIndex);
    rest = spaceIndex === -1 ? '' : text.slice(spaceIndex).trim();
    if (!HEX_RE.test(color) && !KEYWORD_RE.test(color)) return null;
  }

  return { color, position: parsePercent(rest) };
}

/**
 * Fill in positions for stops that carried no explicit percentage.
 *
 * CSS distributes unpositioned stops evenly between their nearest positioned
 * neighbours. The old code assigned 0 to the first stop and 1 to every other
 * one, so a three-stop gradient reported [0, 1, 1] (#2466).
 *
 * @param {Array<{color: string, position: number|null}>} stops - mutated in place
 */
function interpolatePositions(stops) {
  if (stops.length === 0) return;
  if (stops[0].position === null) stops[0].position = 0;
  if (stops.length > 1 && stops[stops.length - 1].position === null) {
    stops[stops.length - 1].position = 1;
  }

  let anchor = 0;
  for (let i = 1; i < stops.length; i++) {
    if (stops[i].position === null) continue;
    const gap = i - anchor;
    if (gap > 1) {
      const start = stops[anchor].position;
      const step = (stops[i].position - start) / gap;
      for (let j = anchor + 1; j < i; j++) {
        stops[j].position = Number((start + step * (j - anchor)).toFixed(6));
      }
    }
    anchor = i;
  }
}

function parseGradient(type, args) {
  const parts = splitTopLevel(args);
  let angle = null;

  if (parts.length > 0 && ANGLE_RE.test(parts[0])) {
    angle = parts.shift();
  } else if (parts.length > 0 && DIRECTION_RE.test(parts[0])) {
    // "to right" etc. — a direction, not a colour stop. Dropped rather than
    // parsed; the old `[a-z]+` fallback captured "to" as a colour (#2466).
    parts.shift();
  }

  const stops = [];
  for (const part of parts) {
    const stop = parseStop(part);
    if (stop) stops.push(stop);
  }

  if (stops.length === 0) return null;
  interpolatePositions(stops);

  const value = { type, stops };
  if (angle && type === 'linear-gradient') value.angle = angle;
  return value;
}

/**
 * Find every gradient call in a stylesheet, honouring nested parens.
 * @param {string} text
 * @returns {Array<{type: string, args: string}>}
 */
function findGradients(text) {
  const found = [];
  const re = new RegExp(GRADIENT_OPEN_RE.source, 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    const openIndex = m.index + m[0].length - 1;
    const closeIndex = findMatchingParen(text, openIndex);
    if (closeIndex === -1) continue;
    found.push({ type: m[1], args: text.slice(openIndex + 1, closeIndex) });
    re.lastIndex = closeIndex + 1;
  }
  return found;
}

function detect(projectRoot) {
  for (const f of findFiles(projectRoot)) {
    const c = fs.readFileSync(f, 'utf8');
    // Fresh regex per call — a shared /g regex carries lastIndex between
    // calls and produces false negatives on repeat invocation.
    if (new RegExp(GRADIENT_OPEN_RE.source).test(c)) return true;
  }
  return false;
}

function extract(projectRoot) {
  const gradients = {};
  let counter = 1;
  for (const f of findFiles(projectRoot)) {
    const c = fs.readFileSync(f, 'utf8');
    for (const { type, args } of findGradients(c)) {
      const value = parseGradient(type, args);
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

module.exports = {
  detect,
  extract,
  parseGradient,
  splitTopLevel,
  findGradients,
  findMatchingParen,
  interpolatePositions
};
