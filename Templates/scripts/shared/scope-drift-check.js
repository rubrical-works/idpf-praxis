#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.101.0
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
// Spawns bounded via lib/exec.js (#2469) — aliased to the original names
// so call sites are unchanged.
const { execFileTimed: execFileSync } = require('./lib/exec.js');
const { issueRefGrepPattern, collectTouchedPaths } = require('./lib/issue-ref-match.js');
// #2600: extractSection and the fence loop that used to live in this file are
// now the shared scanner. This file was the ONLY place fence awareness existed
// under .claude/scripts/shared/ — twice, exported from neither — so lifting it
// here is what let five other scripts stop being fence-blind.
const { extractSection, hasHeader } = require('./lib/checkbox-scan.js');

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
    return { paths: [], source: 'none', warnings: [] };
  }

  const { paths: fromExplicit, sectionFound } = extractFilesToModifySection(body);
  const fromHistory = extractFilesChanged(body);

  // A declaration that names no backticked path is silently equivalent to no
  // declaration — it contributes nothing and the gate falls through to the
  // `### Files Changed` history (#2523 Mode 3, seen on #2436). Backticks stay
  // required: reading bare prose as paths would turn "Bundle generator HTML
  // template" into one. The failure is surfaced instead of repaired.
  const warnings = [];
  if (sectionFound && fromExplicit.length === 0) {
    warnings.push(
      'Files to modify section found but no backticked paths parsed — ' +
      'declaration ignored. Wrap each path in backticks.'
    );
  }

  if (fromExplicit.length > 0) {
    const union = Array.from(new Set([...fromExplicit, ...fromHistory]));
    return { paths: union, source: 'files-to-modify', warnings };
  }
  if (fromHistory.length > 0) {
    return { paths: fromHistory, source: 'files-changed', warnings };
  }
  return { paths: [], source: 'none', warnings };
}

// extractSection (#2409, #2523) now lives in ./lib/checkbox-scan.js and is
// imported above. It was lifted rather than reimplemented: this file held the
// only fence-aware section extraction in the deployed tree, and five other
// scripts needed exactly it (#2600).

// Returns { paths, sectionFound } — the caller needs to tell "no declaration"
// apart from "a declaration that parsed to nothing" (#2523 Mode 3).
function extractFilesToModifySection(body) {
  const isHeader = (line) => {
    const t = line.trim().toLowerCase();
    return t === '**files:**' || t === '**files to modify:**';
  };

  // A **bold:** sub-header or ##/### heading always ends the section. A blank
  // line ends it only when the declaration does not resume: standard markdown
  // puts a blank line between the bold header and a table, so terminating on
  // the first blank swallowed every table-form declaration whole (#2523 Mode 1).
  // Prose after a blank line still terminates, so the widened rule cannot drag
  // unrelated backticked text into the declared scope.
  const isTerminator = (line, idx, lines) => {
    if (/^\*\*/.test(line) || /^##/.test(line)) return true;
    if (line.trim() !== '') return false;
    let k = idx + 1;
    while (k < lines.length && lines[k].trim() === '') k++;
    if (k >= lines.length) return true;
    const next = lines[k];
    if (/^\*\*/.test(next) || /^##/.test(next)) return true;
    // Continue only into a list item or a table row.
    return !/^\s*(?:[-*+]\s|\|)/.test(next);
  };

  const section = extractSection(body, isHeader, isTerminator, {
    fenceAware: true,
    pickBest: (candidate) => extractBacktickedPaths(candidate).length > 0
  });

  const sectionFound = section !== '' || hasFilesToModifyHeader(body);
  return { paths: extractBacktickedPaths(section), sectionFound };
}

function hasFilesToModifyHeader(body) {
  // #2600: the duplicate fence loop that used to be inlined here is retired —
  // hasHeader() is the same scan, shared. Two fence implementations in one file
  // was how they drifted apart in the first place.
  return hasHeader(body, (line) => {
    const t = line.trim().toLowerCase();
    return t === '**files:**' || t === '**files to modify:**';
  });
}

function extractFilesToModify(body) {
  return extractFilesToModifySection(body).paths;
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

  // Mode keys on protected violations alone (#2520). Declaring scope used to
  // escalate the gate to blocking, which made the declaration actively harmful:
  // a declared list is a *plan*, and the touched set growing during
  // implementation is expected, not drift. Under the old rule, persisting a
  // review-authored list would have turned normal work into routine halts —
  // strictly worse than the occasional override it was meant to replace.
  //
  // Growth is still reported as an `outside-declared-scope` violation, and the
  // next Step 4c pass absorbs it via parseDeclaredScope's union with the
  // `### Files Changed` history. Undeclared protected paths still halt (see the
  // guard above), which is where the gate earns its keep.
  const mode = violations.some(v => v.reason === 'always-protected')
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
    : ['log', '--name-status', `--grep=${issueRefGrepPattern(issueNumber)}`, '--pretty=format:'];
  return execFileSync('git', args, { encoding: 'utf-8' });
}

function readLatestCommitMessage(issueNumber) {
  try {
    return execFileSync('git', [
      'log', '-1', `--grep=${issueRefGrepPattern(issueNumber)}`, '--format=%B'
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
  const { paths: declaredScope, source: scopeSource, warnings } = parseDeclaredScope(body || '');
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
    override: drift.override,
    warnings: warnings || []
  };
}

function parseTouchedFromGitLog(raw) {
  // Rename/copy aware (#2467): a `git mv` of an always-protected path emits an
  // R line carrying two tab-separated paths. The superseded parser recognised
  // only add/modify/delete statuses, so it dropped that line entirely and the
  // move passed the gate. collectTouchedPaths records both old and new paths.
  return collectTouchedPaths(raw);
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
  // A malformed declaration would otherwise read identically to no declaration
  // in this report — the exact silence #2523 was filed about.
  if (envelope.warnings && envelope.warnings.length > 0) {
    lines.push(`  Warnings:`);
    for (const w of envelope.warnings) lines.push(`    - ${w}`);
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
