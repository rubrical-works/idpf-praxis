#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.120.0
 * @description Charter scope inputs shared by the commands that create work (#3001, #3645).
 * @checksum sha256:placeholder
 *
 * Charter enforcement used to be the always-on 04-charter-enforcement rule,
 * paid in every session for checks that run in five commands. Those commands
 * now call this helper at the depth `.claude/metadata/charter-enforcement.json`
 * declares for them.
 *
 * The helper decides nothing (#3645). It assembles the inputs — the charter's
 * In Scope and Out of Scope bullets, the work item and, at `full` depth, the
 * titles of the board's open epics and PRD trackers — and the calling command
 * makes the alignment call, named and reported in the one-line format the data
 * file carries. Deciding by shared words made the charter's prose bend to the
 * matcher; meaning is a judgment, so the judgment is made where it is reported.
 *
 * Only In Scope and Out of Scope are read: the board is the live record of
 * what the project is working on, and a section the charter contract retired
 * is never an input (#3653). Whether CHARTER.md is an unfilled template is decided by
 * `.claude/scripts/shared/lib/charter-template.js`, the one rule for it.
 *
 * Built-ins only: deployed with `.claude/scripts/shared/` (runtime dependency
 * contract, rule 04).
 *
 * CLI: node .claude/scripts/shared/lib/charter-scope.js --command <name>
 *        [--text "<work item>" | --text-file <path>] [--paths a,b] [--quiet] [--root <dir>]
 *   With neither text flag, the work item is read from stdin (#3351).
 *   → {"depth", "inputs", "guidance", "quiet", "skipped", "warnings"}, exit 0
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { classifyCharterFile } = require('./charter-template');

const DATA_REL = path.join('.claude', 'metadata', 'charter-enforcement.json');
const DEFAULT_DEPTH = 'summary';
const BOARD_TIMEOUT_MS = 15000;

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

/** The charter's scope bullets: In Scope and Out of Scope. */
function parseCharterSections(charterText) {
  return {
    inScope: sectionBullets(charterText, 'In Scope'),
    outOfScope: sectionBullets(charterText, 'Out of Scope'),
  };
}

function globToRegex(glob) {
  const re = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // `?` is one non-separator character, not a regex quantifier (#3688).
    // Translated before the `*` passes; `[^/]` holds no `*` for them to touch.
    .replace(/\?/g, '[^/]')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${re}$`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** The repository the board belongs to: `.gh-pmu.json` `repositories[0]`, else gh's default. */
function boardRepo(root) {
  try {
    const repos = readJson(path.join(root, '.gh-pmu.json')).repositories;
    return Array.isArray(repos) && typeof repos[0] === 'string' ? repos[0] : null;
  } catch {
    return null;
  }
}

/**
 * Titles of the board's open epics and PRD trackers — the current themes the
 * scope call weighs at `full` depth. Throws when the board cannot be read; the
 * caller reports the themes as unavailable.
 * @param {string} root
 * @param {{run?: (args: string[]) => string}} [opts] injectable gh runner
 */
function readBoardThemes(root, opts = {}) {
  const run = opts.run || ((args) => execFileSync('gh', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: BOARD_TIMEOUT_MS }));
  const repo = boardRepo(root);
  const titles = (label) => {
    const args = ['issue', 'list', '--state', 'open', '--label', label, '--json', 'title', '--limit', '100'];
    if (repo) args.push('-R', repo);
    const parsed = JSON.parse(run(args));
    return Array.isArray(parsed) ? parsed.map((i) => i.title).filter((t) => typeof t === 'string') : [];
  };
  return { epics: titles('epic'), prdTrackers: titles('prd') };
}

/**
 * Assemble the inputs for the scope call on a work item. Decides nothing.
 * @param {{text: string, command?: string, paths?: string[], quiet?: boolean, root?: string,
 *   readBoard?: (root: string) => {epics: string[], prdTrackers: string[]}}} opts
 */
function checkScope(opts = {}) {
  const root = opts.root || process.cwd();
  const warnings = [];
  // Declared before the closure that reads it (#3627), so no early return can
  // reach `depth` in its temporal dead zone.
  let depth = DEFAULT_DEPTH;
  let guidance = null;
  const result = (fields) => ({
    depth, inputs: null, guidance, quiet: !!opts.quiet, skipped: null, warnings, ...fields,
  });

  let data;
  try {
    data = readJson(path.join(root, DATA_REL));
  } catch (err) {
    return result({ skipped: { reason: 'no-config', detail: `${DATA_REL} unreadable: ${err.message}` } });
  }
  guidance = data.scopeCall || null;
  const checkpoint = data.checkpoints[opts.command];
  if (checkpoint) depth = checkpoint.depth;
  else warnings.push(`No charter checkpoint for command "${opts.command}"; assembled at ${DEFAULT_DEPTH} depth.`);
  // #3627: a checkpoint naming a depth with no `depths` entry is a config
  // problem — reported as a skip, not a TypeError further down.
  const depthSpec = data.depths && data.depths[depth];
  if (!depthSpec || !Array.isArray(depthSpec.lists)) {
    return result({ skipped: { reason: 'bad-config', detail: `${DATA_REL} names depth "${depth}" with no depths entry` } });
  }

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
  const wants = (list) => depthSpec.lists.includes(list);
  let boardThemes = null;
  if (wants('boardThemes')) {
    try {
      const board = (opts.readBoard || readBoardThemes)(root);
      boardThemes = { available: true, epics: board.epics || [], prdTrackers: board.prdTrackers || [] };
    } catch (err) {
      boardThemes = { available: false, reason: `board unreadable: ${String(err && err.message ? err.message : err).split('\n')[0]}` };
    }
  }
  const inputs = {
    workItem: String(opts.text || ''),
    inScope: wants('inScope') ? lists.inScope : null,
    outOfScope: wants('outOfScope') ? lists.outOfScope : null,
    boardThemes,
  };
  return result({ inputs });
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

module.exports = { checkScope, parseCharterSections, readBoardThemes, globToRegex };

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  // Neither --text nor --text-file: the text arrives on stdin (#3351), as
  // declared-scope-check.js reads its body, so a caller writes no temp file.
  if (opts.text === undefined) opts.text = fs.readFileSync(0, 'utf8');
  process.stdout.write(JSON.stringify(checkScope(opts), null, 2) + '\n');
}
