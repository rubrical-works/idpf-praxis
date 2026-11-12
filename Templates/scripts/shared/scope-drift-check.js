#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.118.0
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
//   - `?`  (one non-`/` char)    e.g.  src/?.js                  (#3613)
//   - `[...]` / `[!...]` class   e.g.  src/[ab].js, src/[!ab].js  (#3613)
//   - `{a,b}` alternation        e.g.  src/{a,b}.js, may nest     (#3613)
// Leading-dot segments are matched by `*`/`**` (equivalent to minimatch's
// `{ dot: true }` mode). An unclosed `[` or a `{...}` with no top-level comma
// is literal. Negation of a whole pattern (`!foo`) is NOT supported. Before
// #3613 `?` leaked through as a regex quantifier and `[`/`{` were escaped, so
// those globs silently never matched (the #3597 workaround's root cause).
function globToRegex(pattern) {
  return new RegExp('^' + globBodyToRegex(pattern) + '$');
}

function escapeRegexChar(c) {
  return '.+^$()|{}[]\\?*'.includes(c) ? '\\' + c : c;
}

// Index of the `]` closing a class opened at `start`, or -1. A `]` right after
// the opener (or after its `!`/`^`) is a member, not the closer.
function findClassEnd(pattern, start) {
  let j = start + 1;
  if (pattern[j] === '!' || pattern[j] === '^') j++;
  if (pattern[j] === ']') j++;
  while (j < pattern.length && pattern[j] !== ']') {
    if (pattern[j] === '/') return -1;
    j++;
  }
  return j < pattern.length ? j : -1;
}

// For a `{` at `start`: { end, alternatives } split on top-level commas, or
// null when it is unclosed or has no top-level comma (then it is literal).
function findBraceGroup(pattern, start) {
  let depth = 0;
  const alternatives = [];
  let from = start + 1;
  for (let j = start; j < pattern.length; j++) {
    const c = pattern[j];
    if (c === '[') {
      const end = findClassEnd(pattern, j);
      if (end !== -1) { j = end; continue; }
    } else if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) {
        if (alternatives.length === 0) return null;
        alternatives.push(pattern.slice(from, j));
        return { end: j, alternatives };
      }
    } else if (c === ',' && depth === 1) {
      alternatives.push(pattern.slice(from, j));
      from = j + 1;
    }
  }
  return null;
}

// A `[...]` body as a regex class, or null when the regex engine rejects it
// (a reversed range such as `[z-a]`). Null makes the `[` literal: one bad
// authored declaration must never throw out of matchesAny and break the scope
// check for every file — before #3613 `[` was always escaped and could not.
function classToRegex(body) {
  let negate = false;
  if (body[0] === '!' || body[0] === '^') { negate = true; body = body.slice(1); }
  body = body.replace(/[\\\]^]/g, (m) => '\\' + m);
  const cls = negate ? `(?!/)[^${body}]` : `[${body}]`;
  try {
    new RegExp(cls);
  } catch {
    return null;
  }
  return cls;
}

function globBodyToRegex(pattern) {
  let re = '';
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
      continue;
    }
    if (c === '?') {
      re += '[^/]';
      i++;
      continue;
    }
    const classEnd = c === '[' ? findClassEnd(pattern, i) : -1;
    const classRe = classEnd !== -1 ? classToRegex(pattern.slice(i + 1, classEnd)) : null;
    const group = c === '{' ? findBraceGroup(pattern, i) : null;
    if (classRe) {
      re += classRe;
      i = classEnd + 1;
    } else if (group) {
      re += '(?:' + group.alternatives.map(globBodyToRegex).join('|') + ')';
      i = group.end + 1;
    } else {
      re += escapeRegexChar(c);
      i++;
    }
  }
  return re;
}

// Literal first (#3613): a real file named `pages/[id].js` or `src/{a,b}.js`
// must match its own declaration, which the glob reading would not.
function globMatch(filePath, pattern) {
  if (filePath === pattern) return true;
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

  // `authoredPaths` is the human-written declaration alone (#2788). It is what
  // the always-protected guard is computed against, because `### Files Changed`
  // is generated by this very run — Step 4c appends it before the gate reads
  // the body, so unioning it into the protected check let a run license its own
  // protected edits. The union stays in `paths` for `outside-declared-scope`,
  // where absorbing growth across passes is the #2520 behavior and correct.
  if (fromExplicit.length > 0) {
    const union = Array.from(new Set([...fromExplicit, ...fromHistory]));
    return {
      paths: union,
      authoredPaths: fromExplicit,
      source: 'files-to-modify',
      warnings
    };
  }
  if (fromHistory.length > 0) {
    // No authored declaration at all: the run manufactured its entire declared
    // scope from itself, so nothing here can satisfy the protected guard.
    return { paths: fromHistory, authoredPaths: [], source: 'files-changed', warnings };
  }
  return { paths: [], authoredPaths: [], source: 'none', warnings };
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

  // A **bold:** sub-header or ##/### heading always ends the section.
  //
  // THE ONE-BLOCK RULE (#2813): the declaration absorbs one contiguous block —
  // a bullet list or a table, never both. A blank line continues the section
  // only while nothing has been collected yet, because standard markdown puts a
  // blank line between the bold header and a table and terminating on the first
  // blank swallowed every table-form declaration whole (#2523 Mode 1). Once a
  // block has yielded content, the next blank line ends the declaration.
  //
  // Why the earlier "continue into any list item or table row" rule was not
  // enough: it could not tell a declaration table from ANY other table that
  // happened to follow, so every backticked token in an unrelated table was
  // harvested as a declared path. Since #2788 `authoredPaths` is the only scope
  // that can license an always-protected edit, a table row naming a protected
  // path licensed the edit — including a row whose prose FORBADE it. The parser
  // read the prohibition as permission and the halt never fired.
  //
  // A path-shape filter on the harvested tokens is not a substitute and was
  // rejected on the issue: it rejects `source: "none"` and `card-overflow`, but
  // `/work` is slash-shaped and survives it, leaving the boundary defect open
  // underneath.
  const isTerminator = (line, idx, lines) => {
    if (/^\*\*/.test(line) || /^##/.test(line)) return true;
    if (line.trim() !== '') return false;

    // Anything collected since the header means the one block is complete.
    for (let back = idx - 1; back >= 0 && !isHeader(lines[back]); back--) {
      if (lines[back].trim() !== '') return true;
    }

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

// A GFM delimiter row (`--- | ---`, optional outer pipes and `:` alignment):
// two or more cells, each only dashes with optional colons. Checked cell by
// cell rather than with one regex, which nested quantifiers would make unsafe.
function isDelimiterRow(line) {
  const t = line.trim();
  if (!t.includes('|')) return false;
  const cells = t.replace(/^\|/, '').replace(/\|$/, '').split('|');
  return cells.length >= 2 && cells.every((c) => /^:?-+:?$/.test(c.trim()));
}

function extractBacktickedPaths(chunk) {
  const out = [];
  const lines = chunk.split('\n');
  // GFM allows a table with no leading pipe. Such a row is recognized only when
  // the chunk holds a delimiter row (`--- | ---`), which no bullet or prose line
  // looks like, and the row itself is not a bullet item.
  const hasDelimiterRow = lines.some(isDelimiterRow);
  for (const line of lines) {
    // A table cell escapes `|` as `\|` so the cell does not split; review-repair.js
    // writes it that way (#3602). Read the path back unescaped (#3613), or the
    // declaration names a different path and the repair is refused as unverified.
    const inTable = /^\s*\|/.test(line) ||
      (hasDelimiterRow && line.includes('|') && !/^\s*[-*+]\s/.test(line));
    const re = /`([^`\n]+)`/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      let candidate = m[1].trim();
      if (inTable) candidate = candidate.replace(/\\\|/g, '|');
      // Skip obvious non-paths (URLs, code fragments without slashes/dots are tolerated)
      if (candidate) out.push(candidate);
    }
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
  return resolveOverride({ commitMessage, comments }).override;
}

/**
 * findOverride, bounded to this run (#3267). A comment override written
 * before `since` (the run's base commit time) belongs to an earlier run:
 * honoring it disarmed the protected-path halt for the issue forever. It is
 * returned in `stale` so the report can say it was ignored. A comment with no
 * `createdAt` cannot be placed and is honored as before. The commit-message
 * override needs no time check: its commit is read from the bounded range.
 *
 * @returns {{ override: {source: string, reason: string}|null, stale: Array<{reason: string, createdAt: string}> }}
 */
function resolveOverride({ commitMessage = '', comments = [], since = null }) {
  const stale = [];
  const fromCommit = OVERRIDE_REGEX.exec(commitMessage || '');
  if (fromCommit) return { override: { source: 'commit', reason: fromCommit[1].trim() }, stale };
  const sinceMs = since ? Date.parse(since) : NaN;
  for (const c of comments) {
    if (!c || !c.body) continue;
    const m = OVERRIDE_REGEX.exec(c.body);
    if (!m) continue;
    const at = c.createdAt ? Date.parse(c.createdAt) : NaN;
    if (Number.isFinite(sinceMs) && Number.isFinite(at) && at < sinceMs) {
      stale.push({ reason: m[1].trim(), createdAt: c.createdAt });
      continue;
    }
    return { override: { source: 'comment', reason: m[1].trim() }, stale };
  }
  return { override: null, stale };
}

// ─── Drift Check ───

/**
 * True when the touched set carries the Step 4e registrar's full signature:
 * EVERY trigger pattern matched by at least one touched path. Requiring all of
 * them is the whole safeguard — any single pattern on its own describes
 * ordinary work.
 */
function isRegistrarRun(touched, registrarExemption) {
  if (!registrarExemption ||
      !Array.isArray(registrarExemption.triggerPatterns) ||
      registrarExemption.triggerPatterns.length === 0 ||
      !Array.isArray(registrarExemption.exemptPatterns) ||
      registrarExemption.exemptPatterns.length === 0) {
    return false;
  }
  return registrarExemption.triggerPatterns.every(
    pattern => touched.some(file => globMatch(file, pattern))
  );
}

function checkDrift({ touched, declaredScope, scopeSource, authoredScope, protectedPaths, override, registrarExemption }) {
  const protectedPatterns = (protectedPaths || []).map(p => p.pattern);
  const violations = [];

  // Two scopes, two questions (#2788). `declaredScope` is the union including
  // this run's own appended `### Files Changed`; `authoredScope` is the human
  // declaration alone. Only the latter can license an always-protected path,
  // otherwise the gate's input is derived from its own subject.
  //
  // Absent `authoredScope` falls back to `declaredScope`, preserving the
  // pre-#2788 semantics for direct callers written against the old signature.
  // run() is the production caller and always passes the split explicitly.
  const authoredPatterns = authoredScope === undefined ? declaredScope : authoredScope;

  // Step 4e registrar exemption (#2788). register-helper.js edits
  // framework-manifest.json and CHARTER.md — always-protected, and undeclarable
  // when the issue is written because the helper does not exist yet. Keyed on a
  // co-occurrence signature so it stays narrow: touching a shared helper is
  // ordinary work, but doing so alongside constants.js is the registrar's
  // fingerprint. An absent block exempts nothing — absence must not widen a
  // gate, or deleting the config silently disarms the guard.
  const exemptedPaths = [];
  const registrarActive = isRegistrarRun(touched, registrarExemption);

  for (const file of touched) {
    const inDeclared = matchesAny(file, declaredScope);
    const inAuthored = matchesAny(file, authoredPatterns);
    const isProtected = matchesAny(file, protectedPatterns);
    const isExempt = registrarActive &&
      matchesAny(file, (registrarExemption && registrarExemption.exemptPatterns) || []);

    if (isExempt && isProtected) exemptedPaths.push(file);

    if (isProtected && !inAuthored && !isExempt) {
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

  return {
    ok,
    mode,
    violations,
    override: override || null,
    registrarExemptionApplied: registrarActive,
    exemptedPaths
  };
}

// ─── Loaders ───

/**
 * The always-protected path list. Fails CLOSED (#3266): a missing, unparseable
 * or path-less file throws PROTECTED_PATHS_UNREADABLE. Returning [] made the
 * gate advisory and exit 0 — and the file sits under `.claude/metadata/**`, so
 * the edit that broke it removed the guard that would have caught it. Absence
 * must never widen a gate (the registrarExemption rule beside it).
 */
function loadProtectedPaths(metadataPath = DEFAULT_METADATA_PATH) {
  const fail = (reason) => Object.assign(
    new Error(`Protected-paths file ${metadataPath} is unreadable (${reason}); the scope-drift gate cannot run without it.`),
    { code: 'PROTECTED_PATHS_UNREADABLE' }
  );
  let data;
  try {
    data = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  } catch (e) {
    throw fail(e && e.code === 'ENOENT' ? 'not found' : e.message);
  }
  if (!data || !Array.isArray(data.paths)) throw fail('no "paths" array');
  return data.paths;
}

/**
 * Load the Step 4e registrar exemption block (#2788). A missing, malformed, or
 * empty block returns empty arrays, which `isRegistrarRun` reads as "no
 * exemption" — absence keeps the gate strict rather than widening it.
 */
function loadRegistrarExemption(metadataPath = DEFAULT_METADATA_PATH) {
  try {
    const data = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    const block = data.registrarExemption;
    if (!block) return { triggerPatterns: [], exemptPatterns: [] };
    return {
      triggerPatterns: Array.isArray(block.triggerPatterns) ? block.triggerPatterns : [],
      exemptPatterns: Array.isArray(block.exemptPatterns) ? block.exemptPatterns : [],
      reason: block.reason || ''
    };
  } catch (_e) {
    return { triggerPatterns: [], exemptPatterns: [] };
  }
}

// ─── Git / GitHub Reads (only used by main()) ───

/**
 * git log arguments for this issue's commits. `sinceCommit` keeps its
 * original meaning (every commit since it). Otherwise the issue's Refs
 * commits are bounded to `base..HEAD` (#3267) — the branch's merge-base with
 * the default branch, as announce.js resolves it — so a reopened issue's
 * released commits are not read as this run's. No base → all history.
 */
// --since-commit narrows (#3297): it replaces the range base and keeps the
// issue grep. Dropping the grep read every commit since the sha — other
// issues' and peers' — as this issue's, and their protected edits halted it.
function gitLogArgs(issueNumber, { sinceCommit = null, base = null } = {}) {
  const from = sinceCommit || base;
  // core.quotePath=false (#3382): a non-ASCII name arrives literal; what git
  // still quotes is undone by parseNameStatusLine.
  return ['-c', 'core.quotePath=false', 'log', '--name-status', `--grep=${issueRefGrepPattern(issueNumber)}`, '--pretty=format:', ...(from ? [`${from}..HEAD`] : [])];
}

/** The run base (#3267): merge-base sha and its commit time, or nulls. */
function resolveRunBase() {
  try {
    const { resolveBranchBase } = require('./lib/branch-diff.js');
    const r = resolveBranchBase();
    if (!r.ok) return { base: null, baseTime: null };
    const baseTime = execFileSync('git', ['show', '-s', '--format=%cI', r.sha], { encoding: 'utf-8' }).trim();
    return { base: r.sha, baseTime: baseTime || null };
  } catch (_e) {
    return { base: null, baseTime: null };
  }
}

function readGitLogForIssue(issueNumber, sinceCommit, base = null) {
  return execFileSync('git', gitLogArgs(issueNumber, { sinceCommit, base }), { encoding: 'utf-8' });
}

function readLatestCommitMessage(issueNumber, base = null) {
  try {
    return execFileSync('git', [
      'log', '-1', `--grep=${issueRefGrepPattern(issueNumber)}`, '--format=%B', ...(base ? [`${base}..HEAD`] : [])
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
function run({ issue, body, gitLog, latestCommitMessage, comments, protectedPaths, sinceCommit, registrarExemption, overrideSince }) {
  const touched = parseTouchedFromGitLog(gitLog || '');
  const {
    paths: declaredScope,
    authoredPaths: authoredScope,
    source: scopeSource,
    warnings
  } = parseDeclaredScope(body || '');
  const { override, stale: staleOverrides } = resolveOverride({
    commitMessage: latestCommitMessage || '', comments: comments || [], since: overrideSince || null
  });
  const drift = checkDrift({
    touched,
    declaredScope,
    scopeSource,
    authoredScope,
    protectedPaths: protectedPaths || [],
    override,
    registrarExemption
  });

  return {
    ok: drift.ok,
    mode: drift.mode,
    issue,
    sinceCommit: sinceCommit || null,
    touched,
    declaredScope,
    // Reported separately so the two scopes are distinguishable in the report.
    // Collapsing them is what made this defect invisible across three reviews.
    authoredScope,
    scopeSource,
    violations: drift.violations,
    override: drift.override,
    ...(staleOverrides.length ? { staleOverrides } : {}),
    registrarExemptionApplied: drift.registrarExemptionApplied,
    exemptedPaths: drift.exemptedPaths,
    warnings: warnings || []
  };
}

function parseTouchedFromGitLog(raw) {
  // Rename/copy aware (#2467): a `git mv` of an always-protected path emits an
  // R line carrying two tab-separated paths. The superseded parser recognized
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
  // Without this line a protected path appears under "Declared scope" and the
  // gate halts anyway, which reads as a contradiction (#2788). Name the
  // narrower scope the protected guard actually consults, and say so only when
  // the two differ — printing it on every run would be noise.
  if (Array.isArray(envelope.authoredScope) &&
      envelope.authoredScope.length !== envelope.declaredScope.length) {
    if (envelope.authoredScope.length > 0) {
      lines.push(`  Authored scope (governs always-protected only):`);
      for (const p of envelope.authoredScope) lines.push(`    - ${p}`);
    } else {
      lines.push(`  Authored scope: none — the declared scope above came from this run's`);
      lines.push(`    own \`### Files Changed\` section, which cannot license a protected path.`);
    }
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
  for (const s of envelope.staleOverrides || []) {
    lines.push(`  Ignored stale Scope-Override (comment of ${s.createdAt}, before this run's base): ${s.reason}`);
  }
  // An exemption that says nothing is indistinguishable from a guard that
  // passed on the merits — the failure shape this whole issue is about.
  if (envelope.registrarExemptionApplied && envelope.exemptedPaths &&
      envelope.exemptedPaths.length > 0) {
    lines.push(`  Step 4e registrar exemption applied to ${envelope.exemptedPaths.length} protected path(s):`);
    for (const p of envelope.exemptedPaths) lines.push(`    - ${p}`);
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
    lines.push('    (an always-protected path must be named THERE — the appended');
    lines.push('     `### Files Changed` section does not satisfy that guard), or');
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

  // #3267: commits and overrides are bounded to this branch's run.
  const runBase = resolveRunBase();

  let protectedPaths;
  try {
    protectedPaths = loadProtectedPaths();
  } catch (e) {
    // #3266: fail closed with a named error, never an advisory pass.
    const envelope = { ok: false, issue: args.issue, error: { code: e.code || 'PROTECTED_PATHS_UNREADABLE', message: e.message } };
    process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
    process.stderr.write(`\nScope-drift gate: HALT — ${e.message}\n`);
    process.exit(1);
    return;
  }

  const envelope = run({
    issue: args.issue,
    body: readIssueBody(args.issue),
    gitLog: readGitLogForIssue(args.issue, args.sinceCommit, runBase.base),
    latestCommitMessage: readLatestCommitMessage(args.issue, runBase.base),
    comments: readIssueComments(args.issue),
    protectedPaths,
    registrarExemption: loadRegistrarExemption(),
    sinceCommit: args.sinceCommit,
    overrideSince: runBase.baseTime
  });

  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
  process.stderr.write('\n' + formatReport(envelope) + '\n');
  process.exit(envelope.ok ? 0 : 1);
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  parseDeclaredScope,
  extractFilesToModifySection,
  matchesAny,
  findOverride,
  resolveOverride,
  gitLogArgs,
  checkDrift,
  isRegistrarRun,
  loadProtectedPaths,
  loadRegistrarExemption,
  parseTouchedFromGitLog,
  formatReport,
  run,
  main
};
