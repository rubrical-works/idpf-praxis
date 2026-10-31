#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.116.0
 * @description Compute the Files Changed section for a /work issue by scanning commits that
 * reference the issue ("Refs #N"), classifying each file via lib/classify-changed-files.js,
 * and emitting a formatted markdown section to stdout. Empty output when no commits match
 * (caller should skip appending). Exits 0 on success, 1 on git failure, 2 on bad args.
 *
 * Extracted from /work Step 4c (#2318).
 */

const { execFileSync } = require('child_process');
const { formatFilesChanged } = require('./lib/classify-changed-files');
const { issueRefGrepPattern, parseNameStatusLine } = require('./lib/issue-ref-match.js');

// Only a hex SHA may be a base (#3290). git now runs with an argument array
// (#3446), so no shell sees it; the check stays so a non-SHA range is refused
// before git is asked to resolve it.
const SHA_PATTERN = /^[0-9a-fA-F]{4,40}$/;

function parseArgs(argv) {
  const out = { issue: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--issue' && argv[i + 1]) out.issue = parseInt(argv[++i], 10);
    else if (argv[i] === '--since-commit' && argv[i + 1]) out.sinceCommit = argv[++i];
  }
  if (!out.issue || Number.isNaN(out.issue)) {
    return { error: 'Missing or invalid --issue <number> argument.' };
  }
  if (out.sinceCommit !== undefined && !SHA_PATTERN.test(out.sinceCommit)) {
    return { error: `Invalid --since-commit "${out.sinceCommit}": expected a 4-40 character hex commit SHA.` };
  }
  return out;
}

function readGitLog(issueNumber, execFn = execFileSync, base = null) {
  if (base && !SHA_PATTERN.test(base)) {
    throw new Error(`base "${base}" is not a commit SHA`);
  }
  // Boundary-anchored (#2467): a bare `Refs #24` grep also matched #245, #2453
  // and every other longer number, polluting the "### Files Changed" section
  // that scope-drift-check then consumes as declared scope.
  // Range-bounded (#3267): `base..HEAD` keeps a reopened issue's released
  // commits out of this run's Files Changed.
  const args = [
    // core.quotePath=false (#3382): a non-ASCII name arrives literal; what
    // git still quotes is undone by parseNameStatusLine.
    '-c', 'core.quotePath=false',
    'log', '--name-status',
    `--grep=${issueRefGrepPattern(issueNumber)}`,
    '--pretty=format:',
  ];
  if (base) args.push(`${base}..HEAD`);
  return execFn('git', args, { encoding: 'utf8' });
}

/**
 * Where this run's commits start (#3267): --since-commit when given, else the
 * branch's merge-base with the default branch (lib/branch-diff.js, the same
 * resolution announce.js uses since #2888). Null when neither resolves —
 * the caller then reads all history and says so on stderr.
 */
function resolveBase(sinceCommit) {
  if (sinceCommit) return sinceCommit;
  try {
    const { resolveBranchBase } = require('./lib/branch-diff.js');
    const r = resolveBranchBase();
    return r.ok ? r.sha : null;
  } catch (_e) {
    return null;
  }
}

/**
 * Deduplicate git log name-status lines (same path may appear in multiple commits).
 * Last occurrence wins, matching the sort -u | uniq semantic the spec described.
 */
function dedupeNameStatus(raw) {
  const byPath = new Map();
  for (const line of raw.split('\n')) {
    // Rename/copy aware (#2467): R/C lines carry two paths and were previously
    // dropped entirely, so a renamed file never appeared in Files Changed.
    const parsed = parseNameStatusLine(line);
    if (!parsed) continue;
    for (const p of parsed.paths) byPath.set(p, parsed.status);
  }
  return [...byPath.entries()].map(([p, s]) => `${s}\t${p}`).join('\n');
}

function run(issueNumber, execFn = execFileSync, base = null) {
  const raw = readGitLog(issueNumber, execFn, base);
  if (!raw || !raw.trim()) return '';
  return formatFilesChanged(dedupeNameStatus(raw));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    process.stderr.write(args.error + '\n');
    process.exit(2);
  }
  try {
    const base = resolveBase(args.sinceCommit);
    if (!base) {
      process.stderr.write('Warning: no base branch resolved; Files Changed covers every Refs commit in history, not only this branch (#3267).\n');
    }
    const out = run(args.issue, execFileSync, base);
    if (out) process.stdout.write(out + '\n');
    process.exit(0);
  } catch (e) {
    process.stderr.write(`git log failed: ${e.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { parseArgs, readGitLog, resolveBase, dedupeNameStatus, run };
