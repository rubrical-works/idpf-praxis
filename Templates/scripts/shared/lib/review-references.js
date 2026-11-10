#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.117.0
 * review-references.js — Back the `references-valid` review criterion: check
 * the paths, `#N` issues and `/commands` an issue body names against project
 * state (#3540).
 *
 * Reviews accepted existence facts on trust: #3199 named a schema file that
 * does not exist and five reviews passed it. A script catches that in one pass.
 *
 *   | kind | result   | meaning                                                  |
 *   |------|----------|----------------------------------------------------------|
 *   | path | exists   | on disk under the root                                   |
 *   | path | new      | not on disk, but listed under `**Files to modify:**`     |
 *   | path | missing  | not on disk and not declared — a warning                 |
 *   | path | outside-root | resolves outside the root via `..` — never stat-ed, a warning |
 *   | issue| open / closed / merged | state; `closeReason` completed, not_planned… |
 *   | issue| superseded-or-dropped  | `Depends on` / `Blocked by` line names an issue closed not_planned — a warning |
 *   | issue| missing  | the number resolves to nothing — a warning               |
 *   | issue| unverified | the query failed or no repository is configured — fail-open, named in `warnings` |
 *   | command | exists / proposed / missing | `/name` against `CommandsSrc/` (dev repo) or `.claude/commands/` (deployed); missing warns, proposed (named beside an open issue, #3547) does not |
 *
 * Every `#N` is resolved by ONE batched `gh api graphql` query (aliases
 * `i<N>`), against `.gh-pmu.json` `repositories[0]`. `owner/repo#N` companion
 * references are out of scope and not extracted.
 *
 * Fenced code blocks are quotation, not reference, and are skipped
 * (`checkbox-scan.js` `computeFenceMask`). The declaration is parsed by
 * `scope-drift-check.js` `parseDeclaredScope`, never re-implemented.
 *
 * Built-ins and shared siblings only (runtime dependency contract, #2418).
 *
 * CLI: node .claude/scripts/shared/lib/review-references.js [--body-file <path>] [--root <dir>]
 *      (or the body on stdin) → JSON result on stdout.
 */

const fs = require('fs');
const path = require('path');
const { computeFenceMask } = require('./checkbox-scan.js');
const { parseDeclaredScope } = require('../scope-drift-check.js');

const CODE_SPAN = /`([^`\n]+)`/g;

/**
 * Whether a backticked token reads as a repository path. Deliberately
 * conservative: a token must contain a slash, so a bare file name
 * (`review-preamble.js`) is never guessed at a location.
 */
function isPathToken(token) {
  if (/\s/.test(token)) return false;                 // commands with arguments, prose
  if (!token.includes('/')) return false;             // bare names are ambiguous
  if (token.startsWith('/')) return false;            // /command, absolute paths
  if (token.startsWith('-')) return false;            // flags
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(token)) return false; // URLs
  if (/[*?<>{}[\]|$#@]/.test(token)) return false;    // globs, placeholders, owner/repo#N
  return true;
}

/**
 * Backticked path references outside fenced blocks, in body order, one entry
 * per distinct path (first occurrence's line).
 *
 * @param {string} body
 * @returns {{ ref: string, line: number }[]} 1-based lines
 */
function extractPathRefs(body) {
  if (!body || typeof body !== 'string') return [];
  const lines = body.split(/\r?\n/);
  const fenced = computeFenceMask(lines);
  const seen = new Set();
  const out = [];
  lines.forEach((line, i) => {
    if (fenced[i]) return;
    for (const m of line.matchAll(CODE_SPAN)) {
      // Strip a trailing :line or :line:col — a flat pattern applied twice,
      // not a nested quantifier (security/detect-unsafe-regex).
      const token = m[1].trim().replace(/:\d+$/, '').replace(/:\d+$/, '');
      if (!isPathToken(token) || seen.has(token)) continue;
      seen.add(token);
      out.push({ ref: token, line: i + 1 });
    }
  });
  return out;
}

function checkPaths(body, root) {
  const declared = new Set((parseDeclaredScope(body).authoredPaths || []).map(normalize));
  const rootAbs = path.resolve(root);
  return extractPathRefs(body).map(({ ref, line }) => {
    // The token is external input: resolve it and refuse to stat anything that
    // escapes the root via `..` — it is reported, never probed.
    const abs = path.resolve(rootAbs, ref);
    const rel = path.relative(rootAbs, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return { kind: 'path', ref, result: 'outside-root', line };
    }
    let result;
    if (fs.existsSync(abs)) result = 'exists';
    else if (declared.has(normalize(ref))) result = 'new';
    else result = 'missing';
    return { kind: 'path', ref, result, line };
  });
}

function normalize(p) {
  return String(p).replace(/^\.\//, '').replace(/\\/g, '/');
}

// ─── issue references ───

// `#N` not preceded by a word character, `/`, `&` or `#`: excludes
// `owner/repo#N` (companion references are out of scope), HTML entities
// (`&#97;`) and nothing else that matters — `## Heading` has no digit.
const ISSUE_REF = /(^|[^\w/&#])#([1-9]\d*)\b/g;
const DEPENDENCY_LINE = /\b(?:depends on|blocked by)\b/i;

/**
 * `#N` references outside fenced blocks, one entry per number (first line),
 * flagged `dependency` when ANY occurrence sits on a `Depends on` /
 * `Blocked by` line.
 *
 * @param {string} body
 * @returns {{ number: number, line: number, dependency: boolean }[]}
 */
function extractIssueRefs(body) {
  if (!body || typeof body !== 'string') return [];
  const lines = body.split(/\r?\n/);
  const fenced = computeFenceMask(lines);
  const byNumber = new Map();
  lines.forEach((line, i) => {
    if (fenced[i]) return;
    const dependency = DEPENDENCY_LINE.test(line);
    for (const m of line.matchAll(ISSUE_REF)) {
      const number = Number(m[2]);
      const entry = byNumber.get(number);
      if (entry) entry.dependency = entry.dependency || dependency;
      else byNumber.set(number, { number, line: i + 1, dependency });
    }
  });
  return [...byNumber.values()];
}

function readRepository(root) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.gh-pmu.json'), 'utf8'));
    const repo = Array.isArray(cfg.repositories) ? cfg.repositories[0] : null;
    const m = typeof repo === 'string' && repo.match(/^([^/\s]+)\/([^/\s]+)$/);
    return m ? { owner: m[1], name: m[2] } : null;
  } catch {
    return null;
  }
}

/**
 * Default gh runner. Keeps stdout on a non-zero exit: `gh api graphql` exits 1
 * on a PARTIAL error — one unresolvable number — while stdout still holds
 * every number that did resolve (same contract as daily-log-collect.js).
 */
function defaultRunGh(args, input) {
  const { execFileTimed } = require('./exec.js');
  try {
    const out = execFileTimed('gh', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], input, shell: false });
    return { ok: true, output: String(out), error: null };
  } catch (e) {
    const detail = (e && e.stderr ? String(e.stderr).trim() : '') || (e && e.message) || 'unknown error';
    return { ok: false, output: e && e.stdout ? String(e.stdout) : '', error: `gh api graphql failed: ${detail}` };
  }
}

/** ONE query for every number — aliases `i<N>`, issue or pull request. */
function buildIssueQuery(numbers) {
  const fields = numbers
    .map((n) => `i${n}: issueOrPullRequest(number: ${n}) { __typename ... on Issue { state stateReason } ... on PullRequest { state } }`)
    .join(' ');
  return `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`;
}

/**
 * One batched state query for `numbers`, the `repository` object keyed
 * `i<N>`, or `null` with the reason. A whole-batch failure (no data at all —
 * a dropped connection's "unexpected EOF") is retried once with the identical
 * payload; a partial error already carries data and is never retried. Shared
 * with resolve-precheck.js's fallback (#3563) — one copy of the query.
 *
 * @param {number[]} numbers
 * @param {string} root
 * @param {Function} [runGh]
 * @returns {{ repository: object|null, error: string|null }}
 */
function queryIssueStates(numbers, root, runGh = defaultRunGh) {
  const repo = readRepository(root);
  if (!repo) return { repository: null, error: 'no repository in .gh-pmu.json repositories[0]' };
  const input = JSON.stringify({ query: buildIssueQuery(numbers), variables: repo });
  const attempt = () => {
    const res = runGh(['api', 'graphql', '--input', '-'], input);
    let repository = null;
    try {
      const parsed = JSON.parse(res.output || 'null');
      repository = parsed && parsed.data && parsed.data.repository;
    } catch { /* no data */ }
    return { repository, error: res.error };
  };
  let { repository, error } = attempt();
  if (!repository) ({ repository, error } = attempt());
  return repository ? { repository, error: null } : { repository: null, error: error || 'unparseable gh output' };
}

function checkIssues(body, root, runGh, warnings) {
  const refs = extractIssueRefs(body);
  if (refs.length === 0) return [];
  const unverified = (reason) => {
    warnings.push(`Issue references not verified: ${reason}`);
    return refs.map((r) => ({ kind: 'issue', ref: `#${r.number}`, result: 'unverified', closeReason: null, dependency: r.dependency, line: r.line }));
  };

  const { repository, error } = queryIssueStates(refs.map((r) => r.number), root, runGh);
  if (!repository) return unverified(error);

  return refs.map((r) => {
    const node = repository[`i${r.number}`];
    const base = { kind: 'issue', ref: `#${r.number}`, dependency: r.dependency, line: r.line };
    if (!node) return { ...base, result: 'missing', closeReason: null };
    const closeReason = node.stateReason ? String(node.stateReason).toLowerCase() : null;
    let result = String(node.state || '').toLowerCase();
    if (r.dependency && closeReason === 'not_planned') result = 'superseded-or-dropped';
    const out = { ...base, result, closeReason };
    if (node.__typename === 'PullRequest') out.pullRequest = true;
    return out;
  });
}

// ─── command references ───

// `/name` at a word start (line start, whitespace, `(`, backtick or quote),
// ending at whitespace, backtick or punctuation — never followed by another
// `/` or `.x` (absolute paths, `/dev/null`) and never mid-word (`and/or`).
const COMMAND_REF = /(^|[\s(`"'])\/([a-z][a-z0-9-]*)(?![\w/-]|\.\w)/g;
// A single-segment absolute path in prose (`write to /tmp`) has the shape of a
// command; these top-level system directories are never framework commands.
const SYSTEM_DIRS = new Set(['bin', 'boot', 'dev', 'etc', 'home', 'lib', 'mnt', 'opt', 'proc', 'root', 'run', 'sbin', 'srv', 'sys', 'tmp', 'usr', 'var']);

/**
 * `/command` references outside fenced blocks, one per name (first line).
 * @param {string} body
 * @returns {{ name: string, line: number }[]}
 */
function extractCommandRefs(body) {
  if (!body || typeof body !== 'string') return [];
  const lines = body.split(/\r?\n/);
  const fenced = computeFenceMask(lines);
  const seen = new Set();
  const out = [];
  lines.forEach((line, i) => {
    if (fenced[i]) return;
    for (const m of line.matchAll(COMMAND_REF)) {
      if (SYSTEM_DIRS.has(m[2]) || seen.has(m[2])) continue;
      seen.add(m[2]);
      out.push({ name: m[2], line: i + 1 });
    }
  });
  return out;
}

/**
 * The issue numbers named on every line (outside fenced blocks) that mentions
 * each command — a command is proposed by an issue on ANY line naming it (#3547).
 *
 * @param {string} body
 * @returns {Map<string, number[]>} command name → issue numbers, in body order
 */
function issuesBesideCommands(body) {
  const lines = body.split(/\r?\n/);
  const fenced = computeFenceMask(lines);
  const out = new Map();
  lines.forEach((line, i) => {
    if (fenced[i]) return;
    const numbers = [...line.matchAll(ISSUE_REF)].map((m) => Number(m[2]));
    for (const m of line.matchAll(COMMAND_REF)) {
      if (!out.has(m[2])) out.set(m[2], []);
      out.get(m[2]).push(...numbers);
    }
  });
  return out;
}

/**
 * Dev repo (CommandsSrc/ present) checks sources; a deployed project checks
 * .claude/commands/. A missing command named beside an OPEN issue is
 * `proposed` (#3547) — a legitimate forward reference, like a declared path
 * reported `new` — read from the issue results already fetched, never a
 * second query. Beside an issue whose state could not be verified it stays
 * `missing`, and a warning names it.
 */
function checkCommands(body, root, issueResults = [], warnings = []) {
  const refs = extractCommandRefs(body);
  if (refs.length === 0) return [];
  const source = fs.existsSync(path.join(root, 'CommandsSrc')) ? 'CommandsSrc' : '.claude/commands';
  const stateOf = new Map(issueResults.map((r) => [Number(String(r.ref).slice(1)), r.result]));
  const beside = issuesBesideCommands(body);
  return refs.map(({ name, line }) => {
    const out = { kind: 'command', ref: `/${name}`, result: 'missing', source, line };
    if (fs.existsSync(path.join(root, source, `${name}.md`))) return { ...out, result: 'exists' };
    const numbers = beside.get(name) || [];
    const proposer = numbers.find((n) => stateOf.get(n) === 'open');
    if (proposer) return { ...out, result: 'proposed', proposedBy: proposer };
    const unverified = numbers.find((n) => stateOf.get(n) === 'unverified');
    if (unverified) warnings.push(`Command /${name} is missing; it is named beside #${unverified}, whose state could not be verified, so it was not checked as proposed`);
    return out;
  });
}

const WARN_RESULTS = new Set(['missing', 'superseded-or-dropped', 'outside-root']);

/**
 * @param {string} body issue body
 * @param {{ root?: string, runGh?: Function }} [opts]
 * @returns {{ status: 'pass'|'warn', references: object[], warnings: string[] }}
 */
function checkReferences(body, opts = {}) {
  const text = typeof body === 'string' ? body : '';
  const root = opts.root || process.cwd();
  const runGh = opts.runGh || defaultRunGh;
  const warnings = [];
  const issues = checkIssues(text, root, runGh, warnings);
  const references = [
    ...checkPaths(text, root),
    ...issues,
    ...checkCommands(text, root, issues, warnings),
  ];
  const status = references.some((r) => WARN_RESULTS.has(r.result)) ? 'warn' : 'pass';
  return { status, references, warnings };
}

function main(argv = process.argv.slice(2)) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i !== -1 ? argv[i + 1] : undefined;
  };
  const bodyFile = arg('--body-file');
  const body = bodyFile ? fs.readFileSync(bodyFile, 'utf8') : fs.readFileSync(0, 'utf8');
  const result = checkReferences(body, { root: arg('--root') || process.cwd() });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (require.main === module) main();

module.exports = { checkReferences, extractPathRefs, extractIssueRefs, extractCommandRefs, isPathToken, ISSUE_REF, queryIssueStates };
