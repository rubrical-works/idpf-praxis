#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.121.0
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

const escapeChar = (c) => c.replace(/[\\^$.*+?()[\]{}|-]/g, '\\$&');

/** Freeze an object and everything it holds, so no consumer can change the contract for another (#3482). */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/**
 * Compile a contract `{ pattern, flags }` entry for `.test()` (#3695): 'g' and
 * 'y' are removed, since either keeps `lastIndex` between calls and a second
 * call on the same regex would answer differently from the first.
 * @param {{pattern: string, flags?: string}} entry
 * @returns {RegExp}
 */
const testRe = ({ pattern, flags }) => new RegExp(pattern, (flags || '').replace(/[gy]/g, ''));

/**
 * Compile a contract `{ pattern, flags }` entry for `matchAll` (#3695): 'g' is
 * added only when absent — appending it unconditionally turned a contract 'g'
 * into the invalid 'gg'.
 * @param {{pattern: string, flags?: string}} entry
 * @returns {RegExp}
 */
const globalRe = ({ pattern, flags }) => new RegExp(pattern, (flags || '').includes('g') ? flags : `${flags || ''}g`);

/**
 * The regexes the placeholder rule compiles from the contract.
 *
 * PLACEHOLDER_PATTERN — an unfilled placeholder, per `placeholder.pattern`: a
 * single- or double-braced token starting with a letter. Covers
 * `{Describe the project vision}`, `{project-name}` and `{{VISION}}`; inline
 * JSON such as `{"enabled": true}` does not match. Exported without the `g`
 * flag: a global regex keeps `lastIndex` between `.test()` calls, so a
 * consumer testing two charters with it would get alternating answers. The
 * global copy used for matching stays private.
 *
 * TODO_MARKER — the prose marker the startup hook already honored; kept so no
 * template regresses.
 */
function compileRules(contract) {
  const { placeholder } = contract;
  const PLACEHOLDER_PATTERN = new RegExp(placeholder.pattern);
  const { codeExclusion } = placeholder;
  const INLINE = escapeChar(codeExclusion.inlineCodeChar);
  return {
    PLACEHOLDER_PATTERN,
    PLACEHOLDER_PATTERN_ALL: new RegExp(PLACEHOLDER_PATTERN.source, 'g'),
    TODO_MARKER: testRe(placeholder.todoMarker),
    FENCE_RE: new RegExp(
      '^\\s*(' + codeExclusion.fenceChars.map((c) => `${escapeChar(c)}{${codeExclusion.fenceMinLength},}`).join('|') + ')'
    ),
    INLINE_CODE_RE: new RegExp(`(${INLINE}+)[^${INLINE}]*?\\1`, 'g'),
  };
}

/** The successful load, cached; a failure is not cached, so a repaired file is read on the next call. */
let loaded = null;

const contractFailure = (code, detail) => ({
  ok: false,
  error: { code, path: CONTRACT_PATH, message: `charter contract ${CONTRACT_PATH} ${detail}` },
});

/**
 * Load the charter contract lazily (#3482). Never throws: a missing,
 * unreadable, malformed or unusable contract is a structured failure, so a
 * consumer can degrade — the startup hook to a row naming the failure,
 * checkScope to a skip — instead of failing at require time.
 * @returns {{ok: true, contract: object} | {ok: false, error: {code: string, path: string, message: string}}}
 *   code is CONTRACT_MISSING, CONTRACT_UNREADABLE, CONTRACT_MALFORMED or CONTRACT_INVALID
 */
function tryLoadCharterContract() {
  if (loaded) return { ok: true, contract: loaded.contract };
  let text;
  try {
    text = fs.readFileSync(CONTRACT_PATH, 'utf8');
  } catch (err) {
    return err && err.code === 'ENOENT'
      ? contractFailure('CONTRACT_MISSING', 'not found')
      : contractFailure('CONTRACT_UNREADABLE', `unreadable: ${err && err.message}`);
  }
  let contract;
  try {
    contract = JSON.parse(text);
  } catch (err) {
    return contractFailure('CONTRACT_MALFORMED', `is not valid JSON: ${err.message}`);
  }
  let rules;
  try {
    rules = compileRules(contract);
  } catch (err) {
    return contractFailure('CONTRACT_INVALID', `cannot be applied: ${err.message}`);
  }
  loaded = { contract: deepFreeze(contract), rules };
  return { ok: true, contract: loaded.contract };
}

/**
 * The parsed charter contract, deep-frozen — one consumer cannot change it
 * for another. Throws at call time, never at require time, when it cannot be
 * loaded; the error carries `code` and `contractPath`.
 * @returns {object}
 */
function loadCharterContract() {
  const r = tryLoadCharterContract();
  if (r.ok) return r.contract;
  const err = new Error(r.error.message);
  err.code = r.error.code;
  err.contractPath = r.error.path;
  throw err;
}

/** The compiled placeholder rule; throws as loadCharterContract() does. */
function rules() {
  loadCharterContract();
  return loaded.rules;
}

/**
 * The fence mask, per `placeholder.codeExclusion` (#3695): per line, true when
 * it opens, sits inside or closes a fenced code block. A fence closes on a run
 * of its own character at least as long as the opening run; an unclosed fence
 * runs to the end. The one fence rule — stripCode() and charter-shape.js both
 * read it, so detection and repair never disagree on what is code.
 * @param {string[]} lines
 * @returns {boolean[]}
 */
function fencedLines(lines) {
  const { FENCE_RE } = rules();
  const out = new Array(lines.length).fill(false);
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const marker = lines[i].match(FENCE_RE);
    if (fence) {
      out[i] = true;
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
    } else if (marker) {
      out[i] = true;
      fence = marker[1];
    }
  }
  return out;
}

/**
 * Remove fenced code blocks and inline code spans, per
 * `placeholder.codeExclusion`. Braces there are literal content — JSON
 * examples, path conventions like `{frameworkPath}/` — never placeholders
 * (#689's edge case).
 */
function stripCode(content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const { INLINE_CODE_RE } = rules();
  const fenced = fencedLines(lines);
  return lines.filter((_, i) => !fenced[i]).map((line) => line.replace(INLINE_CODE_RE, '')).join('\n');
}

/**
 * The cells of one markdown table row (#3695). An escaped pipe (`\|`) or a
 * pipe inside an inline code span (per `placeholder.codeExclusion`) belongs to
 * its cell. The row's edge pipes are not cells; an empty middle cell is kept.
 * The one splitter — the storedValues rule here and the charter-shape.js
 * repairs read it, so a row is cut into the same cells by detection and repair.
 * @param {string} line
 * @returns {string[]}
 */
function tableCells(line) {
  const row = String(line).trim().replace(/^\|/, '');
  const { INLINE_CODE_RE } = rules();
  const inCode = new Array(row.length).fill(false);
  for (const m of row.matchAll(INLINE_CODE_RE)) {
    for (let i = m.index; i < m.index + m[0].length; i++) inCode[i] = true;
  }
  const cells = [];
  let cell = '';
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '\\' && row[i + 1] === '|') {
      cell += '\\|';
      i++;
    } else if (ch === '|' && !inCode[i]) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.trim()) cells.push(cell.trim());
  return cells;
}

/**
 * List the unfilled placeholders in charter content, in document order.
 * @param {string} content
 * @returns {string[]}
 */
function findPlaceholders(content) {
  if (typeof content !== 'string' || content === '') return [];
  return stripCode(content).match(rules().PLACEHOLDER_PATTERN_ALL) || [];
}

/**
 * Is this charter an unfilled template? ANY placeholder makes it one (#689).
 * @param {string} content
 * @returns {boolean}
 */
function isCharterTemplate(content) {
  if (typeof content !== 'string' || content === '') return false;
  return findPlaceholders(content).length > 0 || rules().TODO_MARKER.test(stripCode(content));
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

/**
 * Every match of every entry's regex in `text`, as findings in position order.
 * @param {string} text - one line or one table cell
 * @param {Array<{kind: string, re: RegExp}>} entries - each `re` global (globalRe), as `matchAll` requires
 * @param {string} section - the contract section name the text sits under
 * @returns {Array<{section: string, kind: string, text: string}>} one finding per match, `text` the matched substring
 */
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
  const { storedValues, keyEntities } = loadCharterContract();
  const excluded = storedValues.never.excludedSections;
  const techEntries = [
    { kind: 'version', re: globalRe(storedValues.techStack.version) },
    { kind: 'parenthesized-quantity', re: globalRe(storedValues.techStack.parenthesizedQuantity) },
  ];
  const proseEntries = [{ kind: 'counted-noun', re: globalRe(storedValues.prose.countedNoun) }];
  const numberOnly = testRe(storedValues.keyEntities.numberOnlyCell);
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
  const contract = loadCharterContract();
  const missingSections = contract.requiredSections.filter((s) => !has(s));
  const retiredSections = contract.retiredSections.filter(has);
  const storedValues = findStoredValues(content);
  const outOfOrderSections = sectionsOutOfOrder(requiredInDocumentOrder(headings, contract.requiredSections), contract.requiredSections);
  return {
    conforms: missingSections.length === 0 && retiredSections.length === 0 && storedValues.length === 0 && outOfOrderSections.length === 0,
    missingSections,
    retiredSections,
    storedValues,
    outOfOrderSections,
  };
}

/**
 * The required sections a charter carries, in the order it carries them —
 * each by its contract name, the first heading that matches it (#3711).
 * @param {string[]} headings - `##` heading texts in document order
 * @param {string[]} required - the contract's requiredSections
 * @returns {string[]}
 */
function requiredInDocumentOrder(headings, required) {
  const seen = [];
  for (const h of headings) {
    const name = required.find((r) => headingMatches(h, r));
    if (name && !seen.includes(name)) seen.push(name);
  }
  return seen;
}

/**
 * Which required sections are out of contract order (#3711): the ones outside
 * the longest run already in contract order — the fewest sections to move.
 * A charter with Key Entities after Out of Scope names Key Entities alone,
 * not every section it now sits beside. Among equally long runs the earliest
 * in the document is kept.
 * @param {string[]} present - required section names in document order
 * @param {string[]} order - the contract's requiredSections
 * @returns {string[]} names in document order; [] when in order
 */
function sectionsOutOfOrder(present, order) {
  const rank = present.map((n) => order.indexOf(n));
  const best = rank.map(() => 1);
  const prev = rank.map(() => -1);
  for (let i = 0; i < rank.length; i++) {
    for (let j = 0; j < i; j++) {
      if (rank[j] < rank[i] && best[j] + 1 > best[i]) { best[i] = best[j] + 1; prev[i] = j; }
    }
  }
  let end = -1;
  for (let i = 0; i < rank.length; i++) if (end === -1 || best[i] > best[end]) end = i;
  const keep = new Set();
  for (let i = end; i !== -1; i = prev[i]) keep.add(i);
  return present.filter((_, i) => !keep.has(i));
}

module.exports = {
  loadCharterContract,
  tryLoadCharterContract,
  stripCode,
  fencedLines,
  tableCells,
  findPlaceholders,
  isCharterTemplate,
  classifyCharterFile,
  findStoredValues,
  checkContractShape,
  headingMatches,
  requiredInDocumentOrder,
  sectionsOutOfOrder
};

// Compiled from the contract on first read, never at require time (#3482).
for (const name of ["PLACEHOLDER_PATTERN", "TODO_MARKER"]) {
  Object.defineProperty(module.exports, name, { enumerable: true, get: () => rules()[name] });
}

if (require.main === module) {
  const target = process.argv[2] || 'CHARTER.md';
  console.log(JSON.stringify(classifyCharterFile(target)));
}
