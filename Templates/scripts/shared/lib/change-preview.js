// Rubrical Works (c) 2026
/**
 * @framework-script 0.123.0
 * @description Compose the AskUserQuestion preview for a proposed change as summary, then AFTER, then BEFORE: the whole change within the line budget, or AFTER clipped and BEFORE kept as one clipped line plus the complete change in a scratch file outside the repository root (#3859, #3848, #3909).
 *
 * change-preview.js
 *
 * `/resolve-review` Step 3 (and `/review-issue` Step 3c, which runs it) asks
 * the user to accept a change in an AskUserQuestion whose preview pane clips
 * what does not fit. The user decides from that pane alone: text printed
 * above the call is not visible while the dialog is open. The format —
 * `{frameworkPath}/Reference/AskUserQuestion-Shape.md` § Previews that show a
 * change — was prose the model executed; this module makes it deterministic
 * and testable. The two summary lines (`Changes:` / `Effect:`) are Claude's;
 * the verbatim AFTER and BEFORE below them are built here.
 *
 *   node .claude/scripts/shared/lib/change-preview.js --issue N --summary-file <path> \
 *     --before-file <path> --after-file <path> --scratch-dir <dir> [--budget N]
 *
 * prints `{ ok, preview, description, scratchPath, condensed, lines }`, or
 * `{ ok: false, error: { code, message } }`. Exit 0 / 1.
 *
 * The scratch directory is refused when it lies inside the repository root: a
 * root `.tmp-` file lands in the tree a still-running reviewer agent reads.
 *
 * Built-ins only (runtime dependency contract, #2418).
 */

'use strict';

const nodeFs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isIssueNumber } = require('./input-validation.js');

/**
 * Preview lines visible before the pane clips in the smaller window measured
 * on 2026-11-23 (AskUserQuestion-Shape.md § Line budget, #3909).
 */
const DEFAULT_BUDGET = 14;
/**
 * Lines a clipped preview spends outside AFTER's content: the two summary
 * lines, `AFTER`, the BEFORE (clipped) heading and its one line.
 */
const FIXED_LINES = 5;
/**
 * A clipped preview needs FIXED_LINES plus one AFTER line and the
 * `… (+N more lines)` marker — any less and the marker displaces the only
 * AFTER line (code review 2026-11-22).
 */
const MIN_BUDGET = FIXED_LINES + 2;
/** Longest one-line BEFORE in a clipped preview. */
const BEFORE_WIDTH = 120;
/** Heading over BEFORE's one clipped line when the change is over budget (#3909). */
const CLIPPED_HEADING = 'BEFORE (clipped)';
const ABSENT = '(section absent)';

function normalize(text) {
  return typeof text === 'string' ? text.replace(/\r\n?/g, '\n').replace(/\n+$/, '') : '';
}

/** Whether `child` is `root` or lies beneath it. Case-insensitive on Windows. */
function isInside(root, child) {
  const fold = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
  const rel = path.relative(fold(path.resolve(root)), fold(path.resolve(child)));
  // Segment-exact: `..scratch` is a directory inside the root, not a parent.
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/** The nearest directory at or above `start` holding `.git`; `start` when none does. */
function findRepoRoot(start = process.cwd(), fs = nodeFs) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync && fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

/** `Changes: <clause>` then `Effect: <clause>` — exactly two lines, each clause non-blank. */
const SUMMARY_PATTERN = /^Changes: *\S[^\n]*\nEffect: *\S[^\n]*$/;

/**
 * Validate the two-line /bluf-style summary Claude writes for the change.
 *
 * @param {*} summary
 * @returns {{ summary: string } | { error: object }}
 */
function checkSummary(summary) {
  const text = normalize(summary).trim();
  if (text === '') {
    return { error: fail('SUMMARY_REQUIRED', 'A summary is required: two lines, "Changes: <clause>" and "Effect: <clause>" ("not stated" when a clause is unknown).') };
  }
  if (!SUMMARY_PATTERN.test(text)) {
    return { error: fail('INVALID_SUMMARY', 'The summary must be exactly two lines, "Changes: <clause>" then "Effect: <clause>", each clause non-blank.') };
  }
  return { summary: text };
}

function fullPreview(summary, before, after) {
  return `${summary}\n\nAFTER\n${after}\n\nBEFORE\n${before === '' ? ABSENT : before}`;
}

/**
 * Over the budget: the summary, AFTER clipped with a `… (+N more lines)`
 * marker when it overflows, then BEFORE as exactly one clipped line under
 * CLIPPED_HEADING. No blank separators — every line of the pane is content.
 */
function clippedPreview(summary, before, after, budget) {
  let oneLine = before === '' ? ABSENT : before.split('\n').map((l) => l.trim()).filter(Boolean).join(' ');
  if (oneLine.length > BEFORE_WIDTH) oneLine = `${oneLine.slice(0, BEFORE_WIDTH - 1)}…`;
  const room = budget - FIXED_LINES;
  const afterLines = after.split('\n').filter((l) => l.trim() !== '');
  const shown = afterLines.length > room
    ? [...afterLines.slice(0, room - 1), `… (+${afterLines.length - (room - 1)} more lines)`]
    : afterLines;
  return [summary, 'AFTER', ...shown, CLIPPED_HEADING, oneLine].join('\n');
}

function fail(code, message) {
  return { ok: false, error: { code, message } };
}

/**
 * Build the preview for one proposed change.
 *
 * @param {object} input
 * @param {number} input.issue - the issue the change is for (names the scratch file)
 * @param {string} input.summary - two lines, `Changes: <clause>` then `Effect: <clause>`; required
 * @param {string} input.before - text replaced, verbatim; '' when the section is absent
 * @param {string} input.after - text that would be written
 * @param {number} [input.budget] - preview line budget (default DEFAULT_BUDGET, 14)
 * @param {string} [input.scratchDir] - session scratchpad; required over budget
 * @param {string} [input.repoRoot] - defaults to the git root above the cwd
 * @param {object} [input.fs] - injectable `{ writeFileSync, existsSync }`
 * @param {Function} [input.random] - injectable suffix generator
 * @returns {{ ok: true, preview: string, description: string, scratchPath: ?string, condensed: boolean, lines: number }
 *   | { ok: false, error: { code: string, message: string } }}
 */
function buildChangePreview(input = {}) {
  const fs = input.fs || nodeFs;
  // Checked as text: Number() reads '1e2' as 100 and '0x1A' as 26 (#3675).
  if (!isIssueNumber(input.issue)) return fail('INVALID_ISSUE', `An issue number is required; got ${String(input.issue).slice(0, 20)}.`);
  const issue = Number(input.issue);
  const budget = input.budget === undefined ? DEFAULT_BUDGET : Number(input.budget);
  if (!Number.isInteger(budget) || budget < MIN_BUDGET) {
    return fail('INVALID_BUDGET', `The line budget must be an integer of at least ${MIN_BUDGET}; got ${input.budget}.`);
  }

  const repoRoot = input.repoRoot ? path.resolve(input.repoRoot) : findRepoRoot(process.cwd(), fs);
  const scratchDir = input.scratchDir ? path.resolve(input.scratchDir) : null;
  if (scratchDir && isInside(repoRoot, scratchDir)) {
    return fail('SCRATCH_IN_REPO', `Scratch directory ${input.scratchDir} is inside the repository root ${repoRoot}; use the session scratchpad.`);
  }

  const checked = checkSummary(input.summary);
  if (checked.error) return checked.error;
  const { summary } = checked;
  const before = normalize(input.before);
  const after = normalize(input.after);
  const whole = fullPreview(summary, before, after);
  const wholeLines = whole.split('\n').length;
  if (wholeLines <= budget) {
    return { ok: true, preview: whole, description: 'Apply the change shown', scratchPath: null, condensed: false, lines: wholeLines };
  }

  if (!scratchDir) {
    return fail('SCRATCH_DIR_REQUIRED', 'The change is over the line budget; a scratch directory is required for the complete text.');
  }
  const suffix = (input.random || (() => crypto.randomBytes(4).toString('hex')))();
  const scratchPath = path.join(scratchDir, `.tmp-${issue}-change-${suffix}.md`);
  try {
    fs.writeFileSync(scratchPath, `# Proposed change for #${issue}\n\n${whole}\n`, 'utf8');
  } catch (e) {
    return fail('SCRATCH_UNWRITABLE', `Cannot write ${scratchPath}: ${e.code || e.message}`);
  }
  const preview = clippedPreview(summary, before, after, budget);
  return {
    ok: true,
    preview,
    // The scratch path is named here only, never in the preview (#3909).
    description: `Clipped preview — full change in ${scratchPath}`,
    scratchPath,
    condensed: true,
    lines: preview.split('\n').length,
  };
}

const FLAGS = {
  '--issue': 'issue',
  '--summary-file': 'summaryFile',
  '--before-file': 'beforeFile',
  '--after-file': 'afterFile',
  '--scratch-dir': 'scratchDir',
  '--budget': 'budget',
};

/**
 * Parse the CLI arguments. Every token must be a known flag followed by its
 * value: a typo such as `--scratchdir` is refused here rather than surfacing
 * later as SCRATCH_DIR_REQUIRED.
 *
 * @param {string[]} argv
 * @returns {{ args: object } | { error: object }}
 */
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = FLAGS[argv[i]];
    if (!key) return { error: fail('INVALID_ARGS', `Unknown argument ${argv[i]}; expected ${Object.keys(FLAGS).join(', ')}.`) };
    if (i + 1 >= argv.length) return { error: fail('INVALID_ARGS', `${argv[i]} requires a value.`) };
    args[key] = argv[++i];
  }
  return { args };
}

/**
 * CLI entry point. Prints one JSON envelope to stdout — the
 * buildChangePreview() result, or `{ ok: false, error: { code, message } }`
 * with code INVALID_ARGS, FILE_UNREADABLE, INVALID_ISSUE, INVALID_BUDGET,
 * SUMMARY_REQUIRED, INVALID_SUMMARY,
 * SCRATCH_IN_REPO, SCRATCH_DIR_REQUIRED, SCRATCH_UNWRITABLE or INTERNAL (an
 * unexpected throw).
 *
 * @param {string[]} [argv] - arguments after the script path
 * @returns {number} exit code: 0 when the envelope is ok, 1 otherwise
 */
function main(argv = process.argv.slice(2)) {
  const emit = (r) => { process.stdout.write(`${JSON.stringify(r, null, 2)}\n`); return r.ok ? 0 : 1; };
  try {
    return run(argv, emit);
  } catch (e) {
    return emit(fail('INTERNAL', `Unexpected error: ${e && e.message ? e.message : String(e)}`));
  }
}

function run(argv, emit) {
  const parsed = parseArgs(argv);
  if (parsed.error) return emit(parsed.error);
  const { args } = parsed;
  if (!args.afterFile) return emit(fail('INVALID_ARGS', '--after-file is required.'));
  // A named file that cannot be read is an error, never an empty change: an
  // omitted --before-file is the only way to say the section is absent.
  const read = (p) => {
    try { return { text: nodeFs.readFileSync(p, 'utf8') }; } catch (e) { return { error: fail('FILE_UNREADABLE', `Cannot read ${p}: ${e.code || e.message}`) }; }
  };
  const before = args.beforeFile ? read(args.beforeFile) : { text: '' };
  if (before.error) return emit(before.error);
  const after = read(args.afterFile);
  if (after.error) return emit(after.error);
  // No --summary-file reaches buildChangePreview as an absent summary: SUMMARY_REQUIRED.
  const summary = args.summaryFile ? read(args.summaryFile) : { text: undefined };
  if (summary.error) return emit(summary.error);
  return emit(buildChangePreview({
    issue: args.issue,
    summary: summary.text,
    before: before.text,
    after: after.text,
    budget: args.budget,
    scratchDir: args.scratchDir,
  }));
}

if (require.main === module) process.exitCode = main();

module.exports = { buildChangePreview, isInside, findRepoRoot, DEFAULT_BUDGET, MIN_BUDGET, CLIPPED_HEADING, main };
