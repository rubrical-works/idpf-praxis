#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.91.1
 * @description Step 4c state-drift gate (#2404). Compares the files touched by
 * the current sub-issue's commits against a declared scope parsed from the
 * issue body, and against an always-protected paths list from
 * .claude/metadata/scope-drift-protected-paths.json. Halts (exit 1) when a
 * violation is detected unless overridden via a `Scope-Override: <reason>`
 * line in the most recent commit message or an issue comment.
 *
 * Mode:
 *   blocking — declared scope present, or a protected path was touched
 *   advisory — no declared scope, no protected violations (warn only)
 *
 * CLI:
 *   node scope-drift-check.js --issue N [--since-commit SHA]
 *
 * Output: JSON envelope on stdout. Exit 1 on halt, 0 otherwise.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Vendored glob matcher (#2418). The framework root ships without a populated
// node_modules in deployed projects, so external `require()` calls crash
// /work Step 4c at module-load time. The pattern set actually used here —
// literals, `*`, and recursive `**` — is small enough that an inline matcher
// is cheaper than declaring + installing a dependency. Supports:
//   - exact path match           e.g.  framework-config.json
//   - `*`  (within one segment)  e.g.  src/*.js
//   - `**` (across segments)     e.g.  .claude/metadata/**
// Leading-dot segments are matched by `*`/`**` (equivalent to minimatch's
// `{ dot: true }` mode). Brace expansion, negation, and `?` are NOT
// supported — they are not used by any caller. If a future caller needs
// them, switch the helper rather than re-introducing an external dep.
function globToRegex(pattern) {
  let re = '^';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        re += '.*';
        i += 2;
        if (pattern[i] === '/') i++;
      } else {
        re += '[^/]*';
        i++;
      }
    } else if ('.+^$()|{}[]\\'.includes(c)) {
      re += '\\' + c;
      i++;
    } else {
      re += c;
      i++;
    }
  }
  re += '$';
  return new RegExp(re);
}

function globMatch(filePath, pattern) {
  return globToRegex(pattern).test(filePath);
}

const DEFAULT_METADATA_PATH = path.join(
  __dirname, '..', '..', 'metadata', 'scope-drift-protected-paths.json'
);

// ─── Argument Parsing ───

function parseArgs(argv) {
  const out = { issue: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--issue' && argv[i + 1]) {
      out.issue = parseInt(argv[++i], 10);
    } else if (argv[i] === '--since-commit' && argv[i + 1]) {
      out.sinceCommit = argv[++i];
    }
  }
  if (!out.issue || Number.isNaN(out.issue)) {
    return { error: 'Missing or invalid --issue <number> argument.' };
  }
  return out;
}

// ─── Scope Parsing ───

/**
 * Parse declared scope from an issue body.
 * Priority: `Files to modify:` / `**Files:**` section, then sticky scope from
 * a previously-logged `### Files Changed` section. Sources are unioned, not
 * replaced — Files-to-modify is the "source", but Files-Changed history
 * extends the scope as work progresses.
 */
function parseDeclaredScope(body) {
  if (!body || typeof body !== 'string') {
    return { paths: [], source: 'none' };
  }

  const fromExplicit = extractFilesToModify(body);
  const fromHistory = extractFilesChanged(body);

  if (fromExplicit.length > 0) {
    const union = Array.from(new Set([...fromExplicit, ...fromHistory]));
    return { paths: union, source: 'files-to-modify' };
  }
  if (fromHistory.length > 0) {
    return { paths: fromHistory, source: 'files-changed' };
  }
  return { paths: [], source: 'none' };
}

// Line-based section extraction (#2409). Replaces a single regex with
// `[\s\S]*?` plus an alternation whose branches share prefixes
// (`\n##` vs `\n###`), which the safe-regex2 heuristic flags as catastrophic-
// backtracking risk. Behavior is identical to the prior regex on every existing
// test fixture.
function extractSection(body, isHeader, isTerminator) {
  if (!body || typeof body !== 'string') return '';
  const lines = body.split('\n');
  let i = 0;
  while (i < lines.length && !isHeader(lines[i])) i++;
  if (i >= lines.length) return '';
  const collected = [];
  for (let j = i + 1; j < lines.length; j++) {
    if (isTerminator(lines[j])) break;
    collected.push(lines[j]);
  }
  return collected.join('\n');
}

function extractFilesToModify(body) {
  const isHeader = (line) => {
    const t = line.trim().toLowerCase();
    return t === '**files:**' || t === '**files to modify:**';
  };
  // Terminate on blank line, any **bold:** sub-header, or any ##/### heading.
  const isTerminator = (line) =>
    line.trim() === '' || /^\*\*/.test(line) || /^##/.test(line);
  return extractBacktickedPaths(extractSection(body, isHeader, isTerminator));
}

function extractFilesChanged(body) {
  // "### Files Changed" section produced by log-changed-files.js. Terminate on
  // the next top-level section (`## ` / `### `) only — `**X:**` sub-headers
  // like `**Added:**` and `**Modified:**` are part of this section, not
  // delimiters.
  const isHeader = (line) => /^###\s+Files Changed\s*$/.test(line);
  const isTerminator = (line) => /^##\s/.test(line) || /^###\s/.test(line);
  return extractBacktickedPaths(extractSection(body, isHeader, isTerminator));
}

function extractBacktickedPaths(chunk) {
  const out = [];
  const re = /`([^`\n]+)`/g;
  let m;
  while ((m = re.exec(chunk)) !== null) {
    const candidate = m[1].trim();
    // Skip obvious non-paths (URLs, code fragments without slashes/dots are tolerated)
    if (candidate) out.push(candidate);
  }
  return out;
}

// ─── Glob Matching ───

function matchesAny(filePath, patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return false;
  return patterns.some(p => globMatch(filePath, p));
}

// ─── Override Detection ───

const OVERRIDE_REGEX = /^\s*Scope-Override:\s*(.+)$/m;

function findOverride({ commitMessage = '', comments = [] }) {
  const fromCommit = OVERRIDE_REGEX.exec(commitMessage || '');
  if (fromCommit) return { source: 'commit', reason: fromCommit[1].trim() };
  for (const c of comments) {
    if (!c || !c.body) continue;
    const m = OVERRIDE_REGEX.exec(c.body);
    if (m) return { source: 'comment', reason: m[1].trim() };
  }
  return null;
}

// ─── Drift Check ───

function checkDrift({ touched, declaredScope, scopeSource, protectedPaths, override }) {
  const protectedPatterns = (protectedPaths || []).map(p => p.pattern);
  const violations = [];

  for (const file of touched) {
    const inDeclared = matchesAny(file, declaredScope);
    const isProtected = matchesAny(file, protectedPatterns);

    if (isProtected && !inDeclared) {
      const proto = protectedPaths.find(p => globMatch(file, p.pattern));
      violations.push({
        path: file,
        reason: 'always-protected',
        detail: proto ? proto.reason : ''
      });
      continue;
    }

    if (scopeSource !== 'none' && !inDeclared) {
      violations.push({ path: file, reason: 'outside-declared-scope' });
    }
  }

  const mode = (scopeSource !== 'none' || violations.some(v => v.reason === 'always-protected'))
    ? 'blocking'
    : 'advisory';

  const ok = violations.length === 0 || mode === 'advisory' || !!override;

  return { ok, mode, violations, override: override || null };
}

// ─── Loaders ───

function loadProtectedPaths(metadataPath = DEFAULT_METADATA_PATH) {
  try {
    const raw = fs.readFileSync(metadataPath, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data.paths) ? data.paths : [];
  } catch (_e) {
    return [];
  }
}

// ─── Git / GitHub Reads (only used by main()) ───

function readGitLogForIssue(issueNumber, sinceCommit) {
  const args = sinceCommit
    ? ['log', '--name-status', `${sinceCommit}..HEAD`, '--pretty=format:']
    : ['log', '--name-status', `--grep=Refs #${issueNumber}`, '--pretty=format:'];
  return execFileSync('git', args, { encoding: 'utf-8' });
}

function readLatestCommitMessage(issueNumber) {
  try {
    return execFileSync('git', [
      'log', '-1', `--grep=Refs #${issueNumber}`, '--format=%B'
    ], { encoding: 'utf-8' }).trim();
  } catch (_e) {
    return '';
  }
}

function readIssueBody(issueNumber) {
  try {
    const out = execFileSync('gh', [
      'pmu', 'view', String(issueNumber), '--json=body'
    ], { encoding: 'utf-8' });
    return JSON.parse(out).body || '';
  } catch (_e) {
    return '';
  }
}

function readIssueComments(issueNumber) {
  try {
    const out = execFileSync('gh', [
      'issue', 'view', String(issueNumber), '--json=comments'
    ], { encoding: 'utf-8' });
    return JSON.parse(out).comments || [];
  } catch (_e) {
    return [];
  }
}

// ─── Pure Pipeline ───

/**
 * Compute the gate envelope from injected fixtures (no git/gh I/O).
 * Use for testing and as the core pipeline that main() wraps.
 */
function run({ issue, body, gitLog, latestCommitMessage, comments, protectedPaths, sinceCommit }) {
  const touched = parseTouchedFromGitLog(gitLog || '');
  const { paths: declaredScope, source: scopeSource } = parseDeclaredScope(body || '');
  const override = findOverride({ commitMessage: latestCommitMessage || '', comments: comments || [] });
  const drift = checkDrift({ touched, declaredScope, scopeSource, protectedPaths: protectedPaths || [], override });

  return {
    ok: drift.ok,
    mode: drift.mode,
    issue,
    sinceCommit: sinceCommit || null,
    touched,
    declaredScope,
    scopeSource,
    violations: drift.violations,
    override: drift.override
  };
}

function parseTouchedFromGitLog(raw) {
  const seen = new Set();
  for (const line of raw.split('\n')) {
    const m = line.match(/^([AMD])\t(.+)$/);
    if (m) seen.add(m[2].trim());
  }
  return [...seen];
}

// ─── Reporting ───

function formatReport(envelope) {
  const lines = [];
  lines.push(`Scope-drift gate: ${envelope.ok ? 'PASS' : 'HALT'} (mode: ${envelope.mode})`);
  lines.push(`  Issue: #${envelope.issue}`);
  lines.push(`  Touched: ${envelope.touched.length} file(s)`);
  if (envelope.declaredScope.length > 0) {
    lines.push(`  Declared scope (${envelope.scopeSource}):`);
    for (const p of envelope.declaredScope) lines.push(`    - ${p}`);
  } else {
    lines.push(`  Declared scope: none (advisory mode)`);
  }
  if (envelope.violations.length > 0) {
    lines.push(`  Violations:`);
    for (const v of envelope.violations) {
      const detail = v.detail ? ` — ${v.detail}` : '';
      lines.push(`    - ${v.path} [${v.reason}]${detail}`);
    }
  }
  if (envelope.override) {
    lines.push(`  Override (${envelope.override.source}): ${envelope.override.reason}`);
  }
  if (!envelope.ok) {
    lines.push('');
    lines.push('Resolution:');
    lines.push('  - Add the file(s) to the issue body Files to modify: section, or');
    lines.push('  - Revert the out-of-scope change, or');
    lines.push('  - Add `Scope-Override: <reason>` to the latest commit message or an issue comment.');
  }
  return lines.join('\n');
}

// ─── Main ───

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    process.stderr.write(args.error + '\n');
    process.exit(2);
    return;
  }

  const envelope = run({
    issue: args.issue,
    body: readIssueBody(args.issue),
    gitLog: readGitLogForIssue(args.issue, args.sinceCommit),
    latestCommitMessage: readLatestCommitMessage(args.issue),
    comments: readIssueComments(args.issue),
    protectedPaths: loadProtectedPaths(),
    sinceCommit: args.sinceCommit
  });

  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
  process.stderr.write('\n' + formatReport(envelope) + '\n');
  process.exit(envelope.ok ? 0 : 1);
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  parseDeclaredScope,
  matchesAny,
  findOverride,
  checkDrift,
  loadProtectedPaths,
  parseTouchedFromGitLog,
  formatReport,
  run,
  main
};
