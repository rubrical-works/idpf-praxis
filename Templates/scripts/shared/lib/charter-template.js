#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.119.0
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
 * It also applies the contract's shape rule (#3643): checkContractShape()
 * reports required sections missing, retired sections present and stored
 * counts or versions (findStoredValues(), the `storedValues` rule). The legacy
 * detection and the structural tests read that one rule.
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

// ── the shape rule (#3643) ────────────────────────────────────────────────────

const globalRe = ({ pattern, flags }) => new RegExp(pattern, `${flags || ''}g`);

/**
 * H2 sections of charter content, code removed first (a heading inside a
 * fence is not a heading). Each is `{ heading, lines }`.
 * @param {string} content
 * @returns {Array<{heading: string, lines: string[]}>}
 */
function h2Sections(content) {
  const sections = [];
  let current = null;
  for (const line of stripCode(String(content || '')).split('\n')) {
    const h = line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (h && !/^###/.test(line)) {
      current = { heading: h[1].trim(), lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return sections;
}

/**
 * The contract's heading rule (#3687): heading text is the section `name`
 * when it equals the name or begins with `<name> `, ignoring case.
 * "Out of Scope (v1)" and "out of scope" are Out of Scope; "Architectures" is
 * not Architecture. Detection and repair both read this one rule.
 * @param {string} heading - heading text without its `#` marks
 * @param {string} name - a contract section name
 * @returns {boolean}
 */
function headingMatches(heading, name) {
  const h = String(heading).trim().toLowerCase();
  const n = String(name).toLowerCase();
  return h === n || h.startsWith(`${n} `);
}

/** The contract section name a heading is, or null. "Out of Scope (v1)" is Out of Scope. */
function sectionName(heading, names) {
  return names.find((n) => headingMatches(heading, n)) || null;
}

const isTableRow = (line) => /^\s*\|/.test(line);
// Every cell a dash run (with optional alignment colons). Split, not one
// repeated group: a nested quantifier is an unsafe regex (lint).
const isSeparatorRow = (line) => {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return t.length > 0 && t.split('|').every((c) => /^\s*:?-{2,}:?\s*$/.test(c));
};
const tableCells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim());

/** Every match of `re` in `text`, in position order, as findings of `kind`. */
function matchesOf(text, entries, section) {
  const found = [];
  for (const { kind, re } of entries) {
    for (const m of text.matchAll(re)) found.push({ index: m.index, finding: { section, kind, text: m[0] } });
  }
  return found.sort((a, b) => a.index - b.index).map((f) => f.finding);
}

/**
 * Stored counts and versions in charter content, per the contract's
 * `storedValues` rule, in document order. Code is removed first; sections the
 * rule does not read — Companion Repositories among them — are never scanned.
 * @param {string} content
 * @returns {Array<{section: string, kind: string, text: string}>}
 */
function findStoredValues(content) {
  const { storedValues, keyEntities } = CONTRACT;
  const excluded = storedValues.never.excludedSections;
  const techEntries = [
    { kind: 'version', re: globalRe(storedValues.techStack.version) },
    { kind: 'parenthesized-quantity', re: globalRe(storedValues.techStack.parenthesizedQuantity) },
  ];
  const proseEntries = [{ kind: 'counted-noun', re: globalRe(storedValues.prose.countedNoun) }];
  const numberOnly = new RegExp(storedValues.keyEntities.numberOnlyCell.pattern, storedValues.keyEntities.numberOnlyCell.flags || '');
  const names = [keyEntities.heading, 'Tech Stack', ...storedValues.prose.sections, ...excluded];
  const found = [];

  for (const { heading, lines } of h2Sections(content)) {
    const name = sectionName(heading, names);
    if (!name || excluded.includes(name)) continue;

    if (name === keyEntities.heading) {
      let seenHeader = false;
      for (const line of lines) {
        if (!isTableRow(line) || isSeparatorRow(line)) continue;
        const cells = tableCells(line);
        if (!seenHeader) {
          seenHeader = true;
          for (const c of cells) if (c.toLowerCase() === storedValues.keyEntities.countColumn.toLowerCase()) found.push({ section: name, kind: 'count-column', text: c });
          continue;
        }
        for (const c of cells) if (numberOnly.test(c)) found.push({ section: name, kind: 'number-cell', text: c });
      }
      continue;
    }

    if (name === 'Tech Stack') {
      let seenHeader = false;
      for (const line of lines) {
        if (isTableRow(line)) {
          if (isSeparatorRow(line)) continue;
          if (!seenHeader) { seenHeader = true; continue; }
          for (const c of tableCells(line)) found.push(...matchesOf(c, techEntries, name));
        } else if (line.trim()) {
          found.push(...matchesOf(line, techEntries, name));
        }
      }
      continue;
    }

    for (const line of lines) {
      if (isTableRow(line)) continue;
      found.push(...matchesOf(line, proseEntries, name));
    }
  }
  return found;
}

/**
 * The shape verdict for charter content against the contract (#3643):
 * required sections missing, retired sections present, stored values.
 * @param {string} content
 * @returns {{conforms: boolean, missingSections: string[], retiredSections: string[], storedValues: Array}}
 */
function checkContractShape(content) {
  const headings = h2Sections(content).map((s) => s.heading);
  const has = (name) => headings.some((h) => headingMatches(h, name));
  const missingSections = CONTRACT.requiredSections.filter((s) => !has(s));
  const retiredSections = CONTRACT.retiredSections.filter(has);
  const storedValues = findStoredValues(content);
  return {
    conforms: missingSections.length === 0 && retiredSections.length === 0 && storedValues.length === 0,
    missingSections,
    retiredSections,
    storedValues,
  };
}

module.exports = {
  loadCharterContract,
  PLACEHOLDER_PATTERN,
  TODO_MARKER,
  stripCode,
  findPlaceholders,
  isCharterTemplate,
  classifyCharterFile,
  findStoredValues,
  checkContractShape,
  headingMatches
};

if (require.main === module) {
  const target = process.argv[2] || 'CHARTER.md';
  console.log(JSON.stringify(classifyCharterFile(target)));
}
