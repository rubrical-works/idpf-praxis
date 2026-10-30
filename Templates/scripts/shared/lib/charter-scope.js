#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.115.0
 * @description Charter scope check shared by the commands that create work (#3001).
 * @checksum sha256:placeholder
 *
 * Charter enforcement used to be the always-on 04-charter-enforcement rule,
 * paid in every session for checks that run in five commands. Those commands
 * now call this helper at the depth `.claude/metadata/charter-enforcement.json`
 * declares for them, so no command restates the check.
 *
 * Scope lists come from CHARTER.md's In Scope, Out of Scope and Current Focus
 * sections, read on every call. The generated JSON index it once preferred was
 * retired (#3420): it went stale silently whenever the charter was edited
 * without regeneration, and held nothing the charter does not. Whether CHARTER.md is an unfilled
 * template is decided by `.claude/scripts/shared/lib/charter-template.js`, the
 * one rule for it.
 *
 * Built-ins only: deployed with `.claude/scripts/shared/` (runtime dependency
 * contract, rule 04).
 *
 * CLI: node .claude/scripts/shared/lib/charter-scope.js --command <name>
 *        [--text "<work item>" | --text-file <path>] [--paths a,b] [--quiet] [--root <dir>]
 *   With neither text flag, the work item is read from stdin (#3351).
 *   → {"alignment", "matchedItems", "warnings", "skipped", "depth", "ask"}, exit 0
 */

const fs = require('fs');
const path = require('path');
const { classifyCharterFile } = require('./charter-template');

const DATA_REL = path.join('.claude', 'metadata', 'charter-enforcement.json');
const DEFAULT_DEPTH = 'summary';

/**
 * Share of an In Scope / Current Focus item's core words a work item must
 * share to match it (#3421). Measured, not guessed: the corpus, the rejected
 * values and the before/after counts are in
 * Construction/Design-Decisions/2026-10-27-charter-scope-in-scope-share.md.
 */
const IN_SCOPE_SHARE = 0.5;

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'onto', 'via', 'not', 'are', 'this', 'that', 'these',
  'those', 'its', 'all', 'any', 'new', 'use', 'using', 'used', 'per', 'out', 'our', 'your', 'can',
  'will', 'has', 'have', 'was', 'were', 'but', 'such', 'only', 'also', 'more', 'less', 'each',
]);

function tokens(text) {
  const out = new Set();
  for (const raw of String(text || '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOPWORDS.has(raw)) continue;
    out.add(raw.length > 4 && raw.endsWith('s') ? raw.slice(0, -1) : raw);
  }
  return out;
}

/** Remove parenthetical asides — "(this is a framework/tooling repo)" — from a bullet. */
function dropAsides(item) {
  return String(item || '').replace(/\([^()]*\)/g, ' ');
}

/**
 * Items whose significant words appear in the text: one word for a one-word
 * item, two for anything longer, so a single shared word is not a match.
 *
 * Parentheticals (#3322): with `outOfScope: true`, words inside a bullet's
 * parentheses do not count toward its match — on an Out of Scope bullet they
 * are an explanatory aside ("(this is a framework/tooling repo)") whose
 * ordinary vocabulary would flag in-scope work as a conflict. In Scope and
 * Current Focus bullets keep their parenthetical words, which carry their main
 * terms ("Script infrastructure (… hooks …)").
 *
 * Share (#3322): an Out of Scope item also needs at least half of its
 * significant words (minimum two), so a long item is not matched by two
 * incidental ones; a conflict is blocking, a missed in-scope match is not.
 * @param {string} text
 * @param {string[]} items
 * @param {{outOfScope?: boolean}} [opts]
 * @returns {Array<{item: string, words: string[]}>}
 */
function matchItems(text, items, opts = {}) {
  const have = tokens(text);
  const matched = [];
  for (const item of items || []) {
    const want = [...tokens(opts.outOfScope ? dropAsides(item) : item)];
    if (!want.length) continue;
    const words = want.filter((w) => have.has(w));
    let need;
    if (opts.outOfScope) {
      need = Math.max(2, Math.ceil(want.length / 2));
    } else {
      // #3421: In Scope and Current Focus need IN_SCOPE_SHARE of their core
      // words — the item with its parenthetical asides dropped — minimum two.
      // Aside words still count as matches; they just do not raise the bar.
      const core = tokens(dropAsides(item)).size || want.length;
      need = Math.max(2, Math.ceil(core * IN_SCOPE_SHARE));
    }
    if (words.length >= Math.min(need, want.length)) matched.push({ item, words });
  }
  return matched;
}

function sectionBullets(charterText, heading) {
  const re = new RegExp(`^##\\s+${heading}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'im');
  const m = String(charterText || '').match(re);
  if (!m) return [];
  return m[1]
    .split('\n')
    .map((l) => l.match(/^\s*[-*]\s+(.*\S)\s*$/))
    .filter(Boolean)
    .map((x) => x[1]);
}

function parseCharterSections(charterText) {
  return {
    inScope: sectionBullets(charterText, 'In Scope'),
    outOfScope: sectionBullets(charterText, 'Out of Scope'),
    currentFocus: sectionBullets(charterText, 'Current Focus'),
  };
}

function globToRegex(glob) {
  const re = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${re}$`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Check a work item against the charter.
 * @param {{text: string, command?: string, paths?: string[], quiet?: boolean, root?: string}} opts
 */
function checkScope(opts = {}) {
  const root = opts.root || process.cwd();
  const warnings = [];
  const result = (fields) => ({
    alignment: null, matchedItems: [], warnings, skipped: null, depth, ask: false, ...fields,
  });

  let data;
  let depth = DEFAULT_DEPTH;
  try {
    data = readJson(path.join(root, DATA_REL));
  } catch (err) {
    return result({ skipped: { reason: 'no-config', detail: `${DATA_REL} unreadable: ${err.message}` } });
  }
  const checkpoint = data.checkpoints[opts.command];
  if (checkpoint) depth = checkpoint.depth;
  else warnings.push(`No charter checkpoint for command "${opts.command}"; checked at ${DEFAULT_DEPTH} depth.`);

  if (fs.existsSync(path.join(root, data.optOut.file))) {
    return result({ skipped: { reason: 'opt-out', detail: `${data.optOut.file} present` } });
  }
  const paths = (opts.paths || []).map((p) => String(p).replace(/\\/g, '/'));
  if (paths.length) {
    const patterns = data.exclusions.map(globToRegex);
    if (paths.every((p) => patterns.some((re) => re.test(p)))) {
      return result({ skipped: { reason: 'excluded-path', detail: 'every path matches a framework exclusion' } });
    }
  }
  const charterPath = path.join(root, 'CHARTER.md');
  const charter = classifyCharterFile(charterPath);
  if (!charter.exists) return result({ skipped: { reason: 'no-charter', detail: 'CHARTER.md not found' } });
  if (charter.template) return result({ skipped: { reason: 'template-charter', detail: 'CHARTER.md is an unfilled template' } });

  const lists = parseCharterSections(fs.readFileSync(charterPath, 'utf8'));
  const matchedItems = [];
  for (const list of data.depths[depth].lists) {
    for (const m of matchItems(opts.text, lists[list], { outOfScope: list === 'outOfScope' })) matchedItems.push({ list, ...m });
  }

  // #3479: an Out of Scope match outweighed by in-charter matches — strictly
  // more In Scope and Current Focus items than Out of Scope ones — names an
  // out-of-scope concept rather than proposing out-of-scope work, and is a
  // possibly-misaligned warning; the Out of Scope items stay in matchedItems.
  const outOfScope = matchedItems.filter((m) => m.list === 'outOfScope').length;
  const inCharter = matchedItems.length - outOfScope;
  let alignment;
  if (outOfScope) alignment = inCharter > outOfScope ? 'possibly-misaligned' : 'conflicts';
  else if (matchedItems.length || !data.depths[depth].lists.includes('inScope')) alignment = 'aligned';
  else alignment = 'possibly-misaligned';

  let ask = data.alignment[alignment].ask;
  if (opts.quiet && alignment !== 'conflicts') ask = false;

  return result({ alignment, matchedItems, ask });
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--command') opts.command = argv[++i];
    else if (a === '--text') opts.text = argv[++i];
    else if (a === '--text-file') opts.text = fs.readFileSync(argv[++i], 'utf8');
    else if (a === '--paths') opts.paths = argv[++i].split(',').filter(Boolean);
    else if (a === '--quiet') opts.quiet = true;
    else if (a === '--root') opts.root = argv[++i];
  }
  return opts;
}

module.exports = { checkScope, parseCharterSections, matchItems, globToRegex, IN_SCOPE_SHARE };

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  // Neither --text nor --text-file: the text arrives on stdin (#3351), as
  // declared-scope-check.js reads its body, so a caller writes no temp file.
  if (opts.text === undefined) opts.text = fs.readFileSync(0, 'utf8');
  process.stdout.write(JSON.stringify(checkScope(opts), null, 2) + '\n');
}
