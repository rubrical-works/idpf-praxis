#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.116.0
 * @description The one rule deciding whether CHARTER.md is an unfilled template (#2893).
 * Consulted by the startup hook, the /charter spec and Charter-Enforcement.md.
 * @checksum sha256:placeholder
 *
 * Before this module the rule was stated three times and no two copies agreed:
 * the spec matched `{lowercase-kebab}`, the hook `{{UPPER_SNAKE}}`, and the
 * bootstrap charter Praxis Hub Manager writes uses `{Capitalized Words}` — so
 * a charter made entirely of placeholders read as Active. Each regex was right
 * for the template of its day; nothing bound any of them to the real file.
 * `tests/fixtures/phm-charter-template.json` is that binding.
 *
 * Built-ins only: deployed with `.claude/scripts/shared/` (runtime dependency
 * contract, rule 04).
 *
 * CLI: node .claude/scripts/shared/lib/charter-template.js [CHARTER.md]
 *   → {"exists": bool, "template": bool, "placeholders": [...]}, exit 0
 */

const fs = require('fs');
const path = require('path');

/**
 * The charter contract (#3481): what a valid CHARTER.md is, as data. This
 * module and charter-shape.js / charter-entities.js read their constants from
 * it rather than restating them, so a downstream implementation checking
 * itself against cases[] checks against the rule the framework runs on.
 */
const CONTRACT_PATH = path.join(__dirname, '..', '..', '..', 'metadata', 'charter-contract.json');
const CONTRACT = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));

/** @returns {object} the parsed charter contract */
function loadCharterContract() {
  return CONTRACT;
}

const escapeChar = (c) => c.replace(/[\\^$.*+?()[\]{}|-]/g, '\\$&');

/**
 * An unfilled placeholder, per `placeholder.pattern`: a single- or
 * double-braced token starting with a letter. Covers
 * `{Describe the project vision}`, `{project-name}` and `{{VISION}}`; inline
 * JSON such as `{"enabled": true}` does not match.
 *
 * Exported without the `g` flag: a global regex keeps `lastIndex` between
 * `.test()` calls, so a consumer testing two charters with it would get
 * alternating answers. The global copy used for matching stays private.
 */
const PLACEHOLDER_PATTERN = new RegExp(CONTRACT.placeholder.pattern);
const PLACEHOLDER_PATTERN_ALL = new RegExp(PLACEHOLDER_PATTERN.source, 'g');

/** Prose marker the startup hook already honored; kept so no template regresses. */
const TODO_MARKER = new RegExp(CONTRACT.placeholder.todoMarker.pattern, CONTRACT.placeholder.todoMarker.flags || '');

const { codeExclusion } = CONTRACT.placeholder;
const FENCE_RE = new RegExp(
  '^\\s*(' + codeExclusion.fenceChars.map((c) => `${escapeChar(c)}{${codeExclusion.fenceMinLength},}`).join('|') + ')'
);
const INLINE = escapeChar(codeExclusion.inlineCodeChar);
const INLINE_CODE_RE = new RegExp(`(${INLINE}+)[^${INLINE}]*?\\1`, 'g');

/**
 * Remove fenced code blocks and inline code spans, per
 * `placeholder.codeExclusion`. Braces there are literal content — JSON
 * examples, path conventions like `{frameworkPath}/` — never placeholders
 * (#689's edge case).
 */
function stripCode(content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const kept = [];
  let fence = null;
  for (const line of lines) {
    const marker = line.match(FENCE_RE);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (marker) {
      fence = marker[1];
      continue;
    }
    kept.push(line.replace(INLINE_CODE_RE, ''));
  }
  return kept.join('\n');
}

/**
 * List the unfilled placeholders in charter content, in document order.
 * @param {string} content
 * @returns {string[]}
 */
function findPlaceholders(content) {
  if (typeof content !== 'string' || content === '') return [];
  return stripCode(content).match(PLACEHOLDER_PATTERN_ALL) || [];
}

/**
 * Is this charter an unfilled template? ANY placeholder makes it one (#689).
 * @param {string} content
 * @returns {boolean}
 */
function isCharterTemplate(content) {
  if (typeof content !== 'string' || content === '') return false;
  return findPlaceholders(content).length > 0 || TODO_MARKER.test(stripCode(content));
}

/**
 * Classify a charter file on disk. A missing file is reported, not thrown.
 * @param {string} filePath
 * @returns {{exists: boolean, template: boolean, placeholders: string[]}}
 */
function classifyCharterFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { exists: false, template: false, placeholders: [] };
  }
  return {
    exists: true,
    template: isCharterTemplate(content),
    placeholders: findPlaceholders(content)
  };
}

module.exports = {
  loadCharterContract,
  PLACEHOLDER_PATTERN,
  TODO_MARKER,
  stripCode,
  findPlaceholders,
  isCharterTemplate,
  classifyCharterFile
};

if (require.main === module) {
  const target = process.argv[2] || 'CHARTER.md';
  console.log(JSON.stringify(classifyCharterFile(target)));
}
