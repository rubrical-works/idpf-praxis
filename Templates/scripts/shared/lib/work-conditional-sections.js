#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * Section-scoped loading of /work's conditional bodies (#3325).
 *
 * @framework-script 0.115.0
 *
 * Rule 08 Step 1d used to read all of `Reference/work-execution-conditional.md`
 * for any epic, branch tracker, `--nonstop`, `--concurrent` or multi-issue run.
 * Most of that file is `--nonstop`/`--concurrent` cadence and lifecycle, which a
 * default-mode epic never executes. This emits only the `### Step` sections a
 * run shape needs, so Step 1d holds the helper's output instead of the file.
 *
 * A section is a `### Step <id>:` or `#### Step <id>:` heading through the line
 * before the next such heading; a heading inside fenced code does not count
 * (checkbox-scan.js computeFenceMask, the one fence-state implementation).
 * Each id's trigger is the predicate in SECTIONS; it restates the trigger line
 * at the top of that section in the conditional file, and the test keeps the
 * ids and the file's headings in correspondence.
 *
 * CLI:
 *   node .claude/scripts/shared/lib/work-conditional-sections.js \
 *     --type epic|branch|standard [--nonstop] [--concurrent] [--selection N] [--json] [--file <path>]
 *   Prints the sections' text (or, with --json, { shape, sections, chars, text }).
 *   The file defaults to {frameworkPath}/Reference/work-execution-conditional.md,
 *   frameworkPath read from the working directory's framework-config.json.
 */

const fs = require('fs');
const path = require('path');
const { computeFenceMask } = require('./checkbox-scan.js');

const CONDITIONAL_REL = path.join('Reference', 'work-execution-conditional.md');

const tree = (s) => s.type === 'epic' || s.type === 'branch';

/** Every section of the conditional file, in file order, with when it loads. */
const SECTIONS = [
  { id: '1b', applies: (s) => s.type === 'epic' && !!s.nonstop },
  { id: '2b', applies: (s) => tree(s) },
  { id: '2b-ii', applies: (s) => s.type === 'epic' || (s.type === 'branch' && !!s.nonstop) || (!tree(s) && (s.selection || 0) >= 2) },
  { id: '2c', applies: (s) => tree(s) && !!s.nonstop },
  { id: '3', applies: (s) => tree(s) && !!s.concurrent },
  { id: '4f', applies: (s) => tree(s) && !!s.nonstop },
  // Step 4g runs for every issue (#3457); a shape Step 1d loads carries it, and
  // a single standard issue reads it with --section 4g.
  { id: '4g', applies: (s) => tree(s) || (s.selection || 0) >= 2 },
  { id: '6', applies: (s) => tree(s) && (!!s.nonstop || !!s.concurrent) },
  { id: '6a', applies: (s) => tree(s) && !!s.nonstop },
];

/** Named run shapes the size report measures. */
const SHAPES = [
  { name: 'default-epic', shape: { type: 'epic' } },
  { name: 'branch', shape: { type: 'branch' } },
  { name: 'nonstop-epic', shape: { type: 'epic', nonstop: true } },
  { name: 'nonstop-branch', shape: { type: 'branch', nonstop: true } },
  { name: 'concurrent-epic', shape: { type: 'epic', concurrent: true } },
  { name: 'concurrent-branch', shape: { type: 'branch', concurrent: true } },
  { name: 'nonstop-concurrent-epic', shape: { type: 'epic', nonstop: true, concurrent: true } },
  { name: 'selection', shape: { type: 'standard', selection: 2 } },
];

/**
 * The section ids a run shape loads, in file order.
 * @param {{type: string, nonstop?: boolean, concurrent?: boolean, selection?: number}} shape
 * @returns {string[]}
 */
function sectionsForShape(shape) {
  return SECTIONS.filter((s) => s.applies(shape || {})).map((s) => s.id);
}

/**
 * Split the conditional file into its Step sections.
 * @param {string} text
 * @returns {Object<string, string>} id → section text (heading included)
 */
function parseSections(text) {
  // Keep each line's terminator so the sections sum to the file's own length.
  const lines = text.split(/(?<=\n)/);
  const fenced = computeFenceMask(lines.map((l) => l.replace(/\r?\n$/, '')));
  const out = {};
  let current = null;
  lines.forEach((line, i) => {
    const m = !fenced[i] && /^#{3,4} Step ([0-9][0-9a-z-]*):/.exec(line);
    if (m) {
      current = m[1];
      out[current] = '';
    }
    if (current) out[current] += line;
  });
  return out;
}

/** {frameworkPath}/Reference/work-execution-conditional.md for a working directory. */
function resolveConditionalFile(cwd = process.cwd()) {
  let frameworkPath = '.';
  try {
    const config = JSON.parse(fs.readFileSync(path.join(cwd, 'framework-config.json'), 'utf8'));
    if (typeof config.frameworkPath === 'string' && config.frameworkPath.trim() !== '') frameworkPath = config.frameworkPath;
  } catch (_) { /* no config: the framework root is the working directory */ }
  return path.resolve(cwd, frameworkPath, CONDITIONAL_REL);
}

/**
 * The sections a shape loads, with their sizes.
 * @param {object} shape
 * @param {{text?: string, file?: string}} [opts]
 * @returns {{shape: object, file: string|null, sections: Array<{id: string, heading: string, chars: number}>, chars: number, text: string}}
 */
function loadSections(shape, opts = {}) {
  const file = opts.text === undefined ? (opts.file || resolveConditionalFile()) : null;
  const text = opts.text === undefined ? fs.readFileSync(file, 'utf8') : opts.text;
  const parsed = parseSections(text);
  const sections = sectionsForShape(shape)
    .filter((id) => parsed[id] !== undefined)
    .map((id) => ({ id, heading: parsed[id].split('\n')[0].trim(), chars: parsed[id].length }));
  const body = sections.map((s) => parsed[s.id]).join('');
  return { shape, file, sections, chars: body.length, text: body };
}

function parseArgs(argv) {
  const shape = { type: 'standard' };
  const opts = { json: false, file: null, section: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--type') shape.type = argv[++i];
    else if (a === '--nonstop') shape.nonstop = true;
    else if (a === '--concurrent') shape.concurrent = true;
    else if (a === '--selection') shape.selection = Number(argv[++i]);
    else if (a === '--json') opts.json = true;
    else if (a === '--file') opts.file = argv[++i];
    else if (a === '--section') opts.section = argv[++i];
  }
  return { shape, opts };
}

function main(argv) {
  const { shape, opts } = parseArgs(argv);
  if (!['epic', 'branch', 'standard'].includes(shape.type)) {
    process.stderr.write(`--type must be epic, branch or standard (got ${shape.type})\n`);
    return 2;
  }
  if (opts.section) {
    let parsed;
    try {
      parsed = parseSections(fs.readFileSync(opts.file || resolveConditionalFile(), 'utf8'));
    } catch (e) {
      process.stderr.write(`Cannot read the conditional file: ${e.message}\n`);
      return 1;
    }
    if (parsed[opts.section] === undefined) {
      process.stderr.write(`No section ${opts.section} in the conditional file (have: ${Object.keys(parsed).join(', ')})\n`);
      return 2;
    }
    process.stdout.write(parsed[opts.section]);
    return 0;
  }
  let result;
  try {
    result = loadSections(shape, { file: opts.file || undefined });
  } catch (e) {
    process.stderr.write(`Cannot read the conditional file: ${e.message}\n`);
    return 1;
  }
  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else if (result.sections.length === 0) {
    process.stdout.write('No conditional sections apply to this run shape.\n');
  } else {
    process.stdout.write(result.text);
  }
  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { SECTIONS, SHAPES, sectionsForShape, parseSections, resolveConditionalFile, loadSections, main };
