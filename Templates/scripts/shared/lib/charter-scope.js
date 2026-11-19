#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.121.0
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
 *   A missing flag value or an unreadable work item prints
 *   {"ok": false, "error": {"code", "message"}}, exit 1 (#3434).
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { classifyCharterFile, tryLoadCharterContract, headingMatches, fencedLines } = require('./charter-template');
const { readFlagValues } = require('./command-args');

const DATA_REL = path.join('.claude', 'metadata', 'charter-enforcement.json');
const DEFAULT_DEPTH = 'summary';
const BOARD_TIMEOUT_MS = 15000;

/**
 * The bullets under the first `## <heading>` section; [] when there is none —
 * the one section reader, shared with charter-shape.js. The section is
 * identified by charter-template.js `headingMatches` (#3695): the heading is
 * the name, or the name then a space, ignoring case, compared as text — never
 * as a regex (#3434). Lines inside a fenced code block (charter-template.js
 * `fencedLines`) are content: never a heading, never a bullet.
 * @param {string} charterText
 * @param {string} heading
 * @returns {string[]}
 */
function sectionBullets(charterText, heading) {
  const lines = String(charterText || '').split(/\r?\n/);
  const fenced = fencedLines(lines);
  const bullets = [];
  let state = 'before';
  for (let i = 0; i < lines.length && state !== 'after'; i++) {
    if (fenced[i]) continue;
    const h2 = lines[i].match(/^##\s+(.+?)\s*$/);
    if (h2) {
      if (state === 'in') state = 'after';
      else if (headingMatches(h2[1], heading)) state = 'in';
      continue;
    }
    const bullet = state === 'in' && lines[i].match(/^\s*[-*]\s+(.*\S)\s*$/);
    if (bullet) bullets.push(bullet[1]);
  }
  return bullets;
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

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The first shape problem in the parsed data file, or null when the fields
 * checkScope reads are present and typed (#3434).
 * @param {*} data
 * @returns {string|null}
 */
function configShapeProblem(data) {
  if (!isPlainObject(data)) return 'is not a JSON object';
  if (!isPlainObject(data.checkpoints)) return 'has no checkpoints object';
  if (!isPlainObject(data.optOut) || typeof data.optOut.file !== 'string') return 'has no optOut.file string';
  if (!Array.isArray(data.exclusions)) return 'has no exclusions array';
  return null;
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
  // #3434: validate the shape once, after parsing — a missing or mistyped
  // required field is the same bad-config skip the depths check uses (#3627).
  const shapeProblem = configShapeProblem(data);
  if (shapeProblem) {
    return result({ skipped: { reason: 'bad-config', detail: `${DATA_REL} ${shapeProblem}` } });
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
  // #3482: the template rule is read from charter-contract.json. When that
  // cannot be loaded the charter cannot be classified — a skip naming the
  // contract, never a throw. An absent charter is still reported as no-charter.
  if (fs.existsSync(charterPath)) {
    const contract = tryLoadCharterContract();
    if (!contract.ok) {
      return result({ skipped: { reason: 'contract-unavailable', detail: `${contract.error.code}: ${contract.error.message}` } });
    }
  }
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

/**
 * Parse the CLI flags. A flag in a value position, or a value flag given
 * last, is a missing value, never the value (#3434, via command-args.js).
 * @returns {{opts: object, textFile?: string, error: string|null}}
 */
function parseArgs(argv) {
  const { arg, flagAsValue } = readFlagValues(argv);
  const opts = {};
  const command = arg('--command');
  const text = arg('--text');
  const textFile = arg('--text-file');
  const paths = arg('--paths');
  const root = arg('--root');
  if (command !== undefined) opts.command = command;
  if (text !== undefined) opts.text = text;
  if (paths !== undefined) opts.paths = paths.split(',').filter(Boolean);
  if (root !== undefined) opts.root = root;
  if (argv.includes('--quiet')) opts.quiet = true;
  return { opts, textFile, error: flagAsValue() };
}

function main(argv = process.argv.slice(2)) {
  // One JSON envelope, never a stack trace (#3434) — the contract
  // review-references.js holds. exitCode, not process.exit(), so a piped
  // stdout write is not cut off.
  const emit = (code, message) => {
    process.stdout.write(JSON.stringify({ ok: false, error: { code, message } }, null, 2) + '\n');
    process.exitCode = 1;
  };
  const why = (e) => (e && e.message ? e.message : String(e));
  const { opts, textFile, error } = parseArgs(argv);
  if (error) {
    emit('INVALID_ARGUMENT', error);
    return;
  }
  // Neither --text nor --text-file: the text arrives on stdin (#3351), as
  // declared-scope-check.js reads its body, so a caller writes no temp file.
  try {
    if (textFile !== undefined) opts.text = fs.readFileSync(textFile, 'utf8');
    else if (opts.text === undefined) opts.text = fs.readFileSync(0, 'utf8');
  } catch (e) {
    emit('TEXT_UNREADABLE', `Could not read the work item from ${textFile || 'stdin'}: ${why(e)}`);
    return;
  }
  try {
    process.stdout.write(JSON.stringify(checkScope(opts), null, 2) + '\n');
  } catch (e) {
    emit('CHECK_FAILED', `Charter scope check failed: ${why(e)}`);
  }
}

module.exports = { checkScope, parseCharterSections, sectionBullets, readBoardThemes, globToRegex, main };

if (require.main === module) main();
