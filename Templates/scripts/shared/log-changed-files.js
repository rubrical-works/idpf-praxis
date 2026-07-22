#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.93.0
 * @description Compute the Files Changed section for a /work issue by scanning commits that
 * reference the issue ("Refs #N"), classifying each file via lib/classify-changed-files.js,
 * and emitting a formatted markdown section to stdout. Empty output when no commits match
 * (caller should skip appending). Exits 0 on success, 1 on git failure, 2 on bad args.
 *
 * Extracted from /work Step 4c (#2318).
 */

const { execSync } = require('child_process');
const { formatFilesChanged } = require('./lib/classify-changed-files');
const { issueRefGrepPattern, parseNameStatusLine } = require('./lib/issue-ref-match.js');

function parseArgs(argv) {
  const out = { issue: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--issue' && argv[i + 1]) out.issue = parseInt(argv[++i], 10);
  }
  if (!out.issue || Number.isNaN(out.issue)) {
    return { error: 'Missing or invalid --issue <number> argument.' };
  }
  return out;
}

function readGitLog(issueNumber, execFn = execSync) {
  // Boundary-anchored (#2467): a bare `Refs #24` grep also matched #245, #2453
  // and every other longer number, polluting the "### Files Changed" section
  // that scope-drift-check then consumes as declared scope.
  return execFn(
    `git log --name-status --grep="${issueRefGrepPattern(issueNumber)}" --pretty=format:""`,
    { encoding: 'utf8' }
  );
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

function run(issueNumber, execFn = execSync) {
  const raw = readGitLog(issueNumber, execFn);
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
    const out = run(args.issue);
    if (out) process.stdout.write(out + '\n');
    process.exit(0);
  } catch (e) {
    process.stderr.write(`git log failed: ${e.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { parseArgs, readGitLog, dedupeNameStatus, run };
