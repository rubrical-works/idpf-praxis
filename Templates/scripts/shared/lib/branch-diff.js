// Rubrical Works (c) 2026
/**
 * @framework-script 0.115.0
 * @description Branch diff helpers. Exports BASE_REF_CANDIDATES, resolveBranchBase(), changedFilesSinceBase() and classifyFindingRange() and reviewRecordFreshness() — the one definition of "what this branch changed" shared by /code-review --diff and announce.js.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * lib/branch-diff.js — the files and line ranges a branch changed
 *
 * Hoisted from announce.js (#2888) so the commit range a `work-completed`
 * names and the file set `/code-review --diff` reviews come from one base
 * resolution and cannot drift apart (#3114).
 *
 * Every git call is `execFileTimed('git', [...argv])`: refs and paths are
 * arguments, never interpolated into a shell string (#3042), and a hung git
 * fails with ETIMEDOUT instead of freezing the caller.
 *
 * Node built-ins only — deployed helpers may not require undeclared externals.
 *
 * Refs #3114
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileTimed } = require('./exec.js');
// Undo git's C-style quoting of a path (#3170); shared since #3382.
const { unquoteGitPath } = require('./git-path.js');

const GIT_TIMEOUT_MS = 10000;
// A release branch's -U0 diff runs to megabytes; Node's 1 MB default failed it
// with ENOBUFS (#3166). Same ceiling merge-back-gate.js uses.
const GIT_MAX_BUFFER = 1e8;

function git(args, cwd) {
  return execFileTimed('git', args, {
    cwd: cwd || process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER,
  });
}

/**
 * The refs a working branch may have been cut from, in lookup order.
 * `origin/HEAD` is resolved first and prepended when it exists.
 */
const BASE_REF_CANDIDATES = Object.freeze(['origin/main', 'origin/master', 'main', 'master']);

function isGitRepo(cwd) {
  try {
    return git(['rev-parse', '--is-inside-work-tree'], cwd).trim() === 'true';
  } catch {
    return false;
  }
}

function notGitRepo() {
  return { ok: false, code: 'NOT_GIT_REPO', error: '--diff requires a git repository; this directory is not one.' };
}

/**
 * Where this branch left its base — the merge-base of HEAD with the base ref.
 *
 * Automatic: every candidate that resolves is measured and the NEAREST
 * merge-base wins. A stale local `main` gives an older merge-base than a
 * fetched `origin/main`, and the commits between the two would fall back
 * inside the range (#2888).
 *
 * Explicit (`base` given): that ref is the only candidate. An explicit ref that
 * does not resolve fails rather than falling back — the caller named a base,
 * and silently using a different one would review the wrong range.
 *
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {string} [options.base] - Explicit base ref
 * @returns {{ok: true, ref: string, sha: string, tried: string[]} | {ok: false, code: string, error: string, tried?: string[]}}
 */
function resolveBranchBase(options = {}) {
  const { cwd, base } = options;
  if (!isGitRepo(cwd)) return notGitRepo();

  const refs = [];
  if (base) {
    refs.push(base);
  } else {
    try {
      const sym = git(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], cwd).trim();
      if (sym) refs.push(sym.replace(/^refs\/remotes\//, ''));
    } catch { /* no origin/HEAD — the fixed candidates still apply */ }
    for (const ref of BASE_REF_CANDIDATES) if (!refs.includes(ref)) refs.push(ref);
  }

  let nearest = null;
  for (const ref of refs) {
    try {
      git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd);
      const sha = git(['merge-base', 'HEAD', ref], cwd).trim();
      if (!sha) continue;
      const distance = Number(git(['rev-list', '--count', `${sha}..HEAD`], cwd).trim());
      if (!Number.isFinite(distance)) continue;
      if (!nearest || distance < nearest.distance) nearest = { sha, ref, distance };
    } catch {
      // Ref absent, or no common history with HEAD — not a candidate.
    }
  }

  if (!nearest) {
    if (base) {
      return { ok: false, code: 'BASE_UNRESOLVED_EXPLICIT', tried: refs, error: `Could not resolve base ref ${base} for --diff.` };
    }
    return {
      ok: false,
      code: 'BASE_UNRESOLVED',
      tried: refs,
      error: `Could not resolve the default branch for --diff (tried: ${refs.join(', ')}).`,
    };
  }
  return { ok: true, ref: nearest.ref, sha: nearest.sha, tried: refs };
}

/** `-c core.quotePath=false` keeps non-ASCII paths literal instead of octal-quoted. */
const DIFF_PREFIX = ['-c', 'core.quotePath=false', 'diff'];

function diffTarget(sha, includeWorkingTree) {
  // Base vs working tree covers committed, staged and unstaged edits in one
  // pass; base vs HEAD covers commits only.
  return includeWorkingTree ? [sha] : [sha, 'HEAD'];
}

/**
 * Files, deletions, renames and copies from `git diff --name-status`.
 * Paths are unquoted (#3399): git C-quotes a path holding a double quote, a
 * backslash or a control character even under core.quotePath=false, and the
 * ranges parseRanges returns are keyed by the plain path (#3170).
 * @param {string} raw
 * @returns {{files: Set<string>, deleted: string[], renamed: {from: string, to: string}[],
 *            copied: {from: string, to: string}[]}}
 */
function parseNameStatus(raw) {
  const files = new Set();
  const deleted = [];
  const renamed = [];
  const copied = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const [status, ...paths] = line.split('\t');
    const [first, second] = paths.map(unquoteGitPath);
    if (status.startsWith('R')) {
      renamed.push({ from: first, to: second });
      files.add(second);
    } else if (status.startsWith('C')) {
      copied.push({ from: first, to: second });
      files.add(second);
    } else if (status === 'D') {
      deleted.push(first);
    } else {
      files.add(first);
    }
  }
  return { files, deleted, renamed, copied };
}

/**
 * The path a `+++ ` header names, as `--name-status` reports it (#3170).
 * git appends a TAB when the path contains a space and C-quotes a path
 * containing a double quote, a backslash or a control character
 * (`core.quotePath=false` keeps non-ASCII literal); both are undone here
 * before the `b/` prefix is removed.
 * @param {string} target - the header text after `+++ `
 * @returns {string|null} null for `/dev/null`
 */
function headerPath(target) {
  let t = target.replace(/\t$/, '');
  if (t === '/dev/null') return null;
  t = unquoteGitPath(t);
  return t.replace(/^b\//, '');
}

/**
 * Added-line ranges per destination path, from `git diff -U0`.
 * A hunk with no added lines (`+c,0`) is a pure deletion and contributes none.
 */
function parseRanges(raw) {
  const ranges = {};
  let current = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('+++ ')) {
      current = headerPath(line.slice(4));
      if (current && !ranges[current]) ranges[current] = [];
      continue;
    }
    const m = current && line.match(/^@@ -[\d,]+ \+([\d,]+) @@/);
    if (m) {
      const [startText, countText] = m[1].split(',');
      const start = Number(startText);
      const count = countText === undefined ? 1 : Number(countText);
      if (count > 0) ranges[current].push({ start, end: start + count - 1 });
    }
  }
  return ranges;
}

function countLines(cwd, rel) {
  try {
    const text = fs.readFileSync(path.join(cwd || process.cwd(), rel), 'utf8');
    if (!text) return 0;
    const n = text.split('\n').length;
    return text.endsWith('\n') ? n - 1 : n;
  } catch {
    return 0;
  }
}

/**
 * The files a branch changed relative to its base, with changed line ranges.
 *
 * Deleted files are reported in `deleted` and excluded from `files` (nothing
 * to review); a rename contributes its destination path. With
 * `includeWorkingTree` (the default) uncommitted edits and untracked files are
 * part of the set, and `workingTreeIncluded` says whether any were present.
 *
 * An empty `files` is a successful result: whether that stops the caller is the
 * caller's decision.
 *
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {string} [options.base] - Explicit base ref (see resolveBranchBase)
 * @param {boolean} [options.includeWorkingTree=true]
 */
function changedFilesSinceBase(options = {}) {
  const { cwd, base, includeWorkingTree = true } = options;
  const resolved = resolveBranchBase({ cwd, base });
  if (!resolved.ok) return resolved;

  try {
    const target = diffTarget(resolved.sha, includeWorkingTree);
    const nameStatus = parseNameStatus(git([...DIFF_PREFIX, '--name-status', '-M', ...target], cwd));
    const ranges = parseRanges(git([...DIFF_PREFIX, '-U0', '-M', '--no-color', ...target], cwd));

    let workingTreeIncluded = false;
    if (includeWorkingTree) {
      workingTreeIncluded = git(['status', '--porcelain'], cwd).trim().length > 0;
      const untracked = git(['-c', 'core.quotePath=false', 'ls-files', '--others', '--exclude-standard'], cwd)
        .split('\n').map((l) => l.trim()).filter(Boolean).map(unquoteGitPath);
      for (const rel of untracked) {
        nameStatus.files.add(rel);
        const n = countLines(cwd, rel);
        ranges[rel] = n > 0 ? [{ start: 1, end: n }] : [];
      }
    }

    const files = [...nameStatus.files].sort();
    const fileRanges = {};
    for (const rel of files) fileRanges[rel] = ranges[rel] || [];

    return {
      ok: true,
      base: { ref: resolved.ref, sha: resolved.sha },
      files,
      deleted: nameStatus.deleted.sort(),
      renamed: nameStatus.renamed,
      copied: nameStatus.copied,
      ranges: fileRanges,
      workingTreeIncluded,
    };
  } catch (err) {
    return { ok: false, code: 'GIT_FAILED', error: err && err.message ? err.message : 'git diff failed' };
  }
}

/**
 * Whether a finding at [startLine, endLine] in `file` lies entirely outside the
 * branch's changed ranges (`pre-existing`) or touches one (`introduced`).
 * A file with no recorded ranges is entirely pre-existing.
 */
function classifyFindingRange(ranges, file, startLine, endLine = startLine) {
  const fileRanges = (ranges && ranges[file]) || [];
  const overlaps = fileRanges.some((r) => startLine <= r.end && endLine >= r.start);
  return overlaps ? 'introduced' : 'pre-existing';
}

/**
 * The files /code-review writes as its output (#3183). A commit touching only
 * these after a review cannot have changed what was reviewed.
 */
const REVIEW_OUTPUT_FILE = '.code-review-manifest.json';
const REVIEW_REPORT_DIR = 'Construction/Code-Reviews/';

function isReviewOutputPath(rel) {
  return rel === REVIEW_OUTPUT_FILE || (rel.startsWith(REVIEW_REPORT_DIR) && rel.length > REVIEW_REPORT_DIR.length);
}

/** Paths with uncommitted changes, staged, unstaged or untracked. */
function dirtyPaths(cwd) {
  const raw = git(['-c', 'core.quotePath=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all'], cwd);
  const tokens = raw.split('\0').filter(Boolean);
  const paths = [];
  for (let i = 0; i < tokens.length; i++) {
    const status = tokens[i].slice(0, 2);
    paths.push(tokens[i].slice(3));
    // A rename or copy carries its source path as the next token.
    if (/[RC]/.test(status)) paths.push(tokens[++i]);
  }
  return paths;
}

/**
 * Whether a lastDiffReview record still describes HEAD (#3183) — the
 * /prepare-release Step 2.1 freshness rule. Current when:
 *   - headSha is HEAD, or every commit since it changes only review output
 *     (the manifest and Construction/Code-Reviews/**), so committing the
 *     review's own output does not invalidate it; and
 *   - the working tree has no uncommitted change outside review output, or
 *     the review included the working tree.
 * A review that covered uncommitted source goes stale once that source is
 * committed, since the commit lies outside review output. That is
 * deliberate: the gate compares paths, not content.
 *
 * @param {{cwd?: string, record?: {headSha?: string, workingTreeIncluded?: boolean}|null}} options
 * @returns {{current: boolean, reason: string, headSha: string|null, head: string|null,
 *   changedSince: string[], offending: string[]}}
 *   reason: head-matches | review-output-only | no-record | not-ancestor |
 *   changed-since-review | uncommitted-changes
 */
function reviewRecordFreshness(options = {}) {
  const cwd = options.cwd || process.cwd();
  const record = options.record || null;
  const headSha = (record && typeof record.headSha === 'string' && record.headSha.trim()) || null;
  let head = null;
  const result = (current, reason, extra = {}) => ({
    current, reason, headSha, head, changedSince: [], offending: [], ...extra,
  });
  if (!headSha) return result(false, 'no-record');
  // A hex object name only: headSha reaches git as an argument, and a value
  // starting with '-' would be read as an option.
  if (!/^[0-9a-f]{4,40}$/i.test(headSha)) return result(false, 'not-ancestor');
  head = git(['rev-parse', 'HEAD'], cwd).trim();

  let changedSince = [];
  if (headSha !== head) {
    try {
      git(['merge-base', '--is-ancestor', headSha, 'HEAD'], cwd);
    } catch {
      return result(false, 'not-ancestor');
    }
    const raw = git([...DIFF_PREFIX, '--name-only', '--no-renames', '-z', headSha, 'HEAD'], cwd);
    changedSince = raw.split('\0').filter(Boolean);
    const offending = changedSince.filter((p) => !isReviewOutputPath(p));
    if (offending.length > 0) return result(false, 'changed-since-review', { changedSince, offending });
  }

  if (!record.workingTreeIncluded) {
    const offending = dirtyPaths(cwd).filter((p) => !isReviewOutputPath(p));
    if (offending.length > 0) return result(false, 'uncommitted-changes', { changedSince, offending });
  }

  return result(true, headSha === head ? 'head-matches' : 'review-output-only', { changedSince });
}

module.exports = {
  BASE_REF_CANDIDATES,
  resolveBranchBase,
  changedFilesSinceBase,
  classifyFindingRange,
  parseRanges,
  parseNameStatus,
  isReviewOutputPath,
  reviewRecordFreshness,
};
