// Rubrical Works (c) 2026
/**
 * @framework-script 0.123.0
 * @description Duplicate check for `/code-review` Step 8 (#3516): classify each
 * approved finding against open `bug` and `enhancement` issues before it is
 * filed, as `new`, `duplicate` or `related`.
 *
 * WHY A SCRIPT. Step 8 filed every approved finding without looking at the
 * board, so a release review over code earlier reviews had examined re-filed
 * what was already tracked. The match is a named, reported decision here, not
 * model judgment in the spec: the same entry and board give the same answer.
 *
 * THE SCORE. Per open issue, two signals:
 *   - a FILE LINK: the finding's `source.file` appears in the issue's title or
 *     body (its `Files to modify:` list, in practice), or the issue number is
 *     in that file's manifest `issueRefs` — an earlier review filed it there;
 *   - TITLE SIMILARITY: the share of the finding title's significant terms
 *     found in the issue title.
 * File link AND similarity >= DUPLICATE_THRESHOLD → `duplicate`. A file link
 * alone, or similarity >= RELATED_TITLE_THRESHOLD alone → `related`. Neither →
 * `new`. A duplicate outranks a related match; ties go to the higher score.
 *
 * THE FAILURE MODE THAT MATTERS. A search that fails must not read as an empty
 * board: every entry is classified `unchecked` with the error, so the caller
 * reports it and files normally rather than treating the entries as `new`.
 *
 * Closed issues are out of scope (#3516): only open issues are searched.
 * Node built-ins and `gh` only, per `04-deployment-awareness.md`.
 */

'use strict';

const { execFileTimed } = require('./exec.js');

/** File link plus at least this title similarity is a duplicate. */
const DUPLICATE_THRESHOLD = 0.5;

/** Title similarity alone, with no file link, is a related match at this level. */
const RELATED_TITLE_THRESHOLD = 0.6;

/** Labels searched. A finding is filed as one of these, so a duplicate is one of these. */
const SEARCH_LABELS = ['bug', 'enhancement'];

/** Upper bound per label; the board's open bugs and enhancements fit well inside it. */
const SEARCH_LIMIT = 500;

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'when', 'not', 'are', 'was',
  'its', 'any', 'all', 'but', 'has', 'have', 'does', 'should', 'can', 'than', 'then', 'which',
]);

/** Significant lowercase terms of a title: type prefix, stopwords and tokens under 3 chars dropped. */
function titleTerms(title) {
  return String(title || '')
    .replace(/^\s*\[(bug|enhancement)\]:\s*/i, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** Share of the entry title's terms that appear in the issue title (0..1). */
function similarity(entryTitle, issueTitle) {
  const a = titleTerms(entryTitle);
  if (a.length === 0) return 0;
  const b = new Set(titleTerms(issueTitle));
  return a.filter((t) => b.has(t)).length / a.length;
}

function sourceFile(entry) {
  return entry && entry.source && typeof entry.source.file === 'string' ? entry.source.file : null;
}

const PATH_CHAR = /[A-Za-z0-9_\-/\\.]/;

/**
 * Whether `text` names `file` as a whole path token (#3518): `src/a.js` is
 * named by `` `src/a.js` ``, `./src/a.js` or "in src/a.js." — not by
 * `src/a.json`, `src/a.js.map` or `lib/src/a.js`, which are other files.
 */
function namesPath(text, file) {
  const hay = String(text || '');
  for (let at = hay.indexOf(file); at !== -1; at = hay.indexOf(file, at + 1)) {
    let start = at;
    if (hay.slice(Math.max(0, start - 2), start) === './') start -= 2;
    const before = start > 0 ? hay[start - 1] : '';
    const end = at + file.length;
    const after = hay[end] || '';
    // A trailing dot is sentence punctuation unless more of a name follows it.
    const continues = after === '.' ? /[A-Za-z0-9_]/.test(hay[end + 1] || '') : PATH_CHAR.test(after);
    if (!(before && PATH_CHAR.test(before)) && !continues) return true;
  }
  return false;
}

// ─── Findings the review gate filed (#3907) ───
//
// When /work Step 4g or the Merge-Back Review Gate cannot resolve a
// correctness finding, merge-back-gate.js files it with a marker naming the
// file, criterion, line range and the /code-review categories the criterion
// maps to (review-criterion-classes.json). A /code-review finding with the
// same file, a matching criterion or category, and a line range touching the
// filed one is `already-filed`: reported, never filed again.

const FINDING_MARKER = /<!--\s*review-finding:\s*(\{[^\n]*?\})\s*-->/;

/** The gate's review-finding marker in an issue body, or null. */
function parseFindingMarker(body) {
  const m = String(body || '').match(FINDING_MARKER);
  if (!m) return null;
  try {
    const p = JSON.parse(m[1]);
    if (!p || typeof p.file !== 'string' || typeof p.criterion !== 'string') return null;
    const lines = Array.isArray(p.lines) && p.lines.length === 2 && p.lines.every(Number.isInteger) ? p.lines : null;
    return { from: Number.isInteger(p.from) ? p.from : null, file: p.file, criterion: p.criterion, lines, categories: Array.isArray(p.categories) ? p.categories.map(String) : [] };
  } catch (_e) {
    return null;
  }
}

/** A /code-review category or criterion id, compared lowercased with spaces as hyphens. */
const normalizeCategory = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '-');

/** `source.lines` as `[start, end]`: "44-46", "44", or a number; null when absent. */
function parseLineRange(lines) {
  if (Number.isInteger(lines)) return [lines, lines];
  const nums = String(lines === undefined || lines === null ? '' : lines).split(/[-–]/).map((s) => s.trim()).filter(Boolean).slice(0, 2);
  if (!nums.length || !nums.every((s) => /^\d+$/.test(s))) return null;
  const a = Number(nums[0]);
  const b = nums[1] !== undefined ? Number(nums[1]) : a;
  return [Math.min(a, b), Math.max(a, b)];
}

/** A repo-relative path compared without a leading ./ and with forward slashes. */
const normalizePath = (p) => String(p || '').split('\\').join('/').replace(/^(?:\.\/)+/, '');

/**
 * The open issue the gate filed for this entry's finding, or null. A marker
 * with no line range, or an entry with no source.lines (a file-level
 * finding), matches on file and criterion alone; two ranges must overlap.
 * Lines given but unreadable ("120, 130", "L44") never match.
 */
function alreadyFiled(entry, issues) {
  const file = sourceFile(entry) && normalizePath(sourceFile(entry));
  const category = normalizeCategory(entry && entry.source && entry.source.category);
  const rawLines = entry && entry.source ? entry.source.lines : undefined;
  const range = parseLineRange(rawLines);
  // No lines at all is a file-level finding; lines given but unreadable are
  // not, and never match on file and criterion alone.
  const fileLevel = rawLines === undefined || rawLines === null || String(rawLines).trim() === '';
  if (!file || !category || (!range && !fileLevel)) return null;
  for (const issue of Array.isArray(issues) ? issues : []) {
    const mk = parseFindingMarker(issue.body);
    if (!mk || normalizePath(mk.file) !== file) continue;
    const criterionMatch = normalizeCategory(mk.criterion) === category || mk.categories.map(normalizeCategory).includes(category);
    if (!criterionMatch) continue;
    // Either side naming no line (a file-level finding) matches on file and
    // criterion alone; two ranges must touch.
    if (mk.lines && range && (range[1] < mk.lines[0] || range[0] > mk.lines[1])) continue;
    const where = mk.lines ? `${mk.file}:${mk.lines[0]}${mk.lines[1] !== mk.lines[0] ? `-${mk.lines[1]}` : ''}` : `${mk.file} (no line)`;
    return {
      classification: 'already-filed',
      match: issue.number,
      similarity: similarity(entry && entry.title, issue.title),
      reasons: [`filed by the review gate of #${mk.from} for ${mk.criterion} at ${where}; this finding (${category}${range ? `, lines ${range[0]}-${range[1]}` : ''}) ${mk.lines && range ? 'overlaps it' : 'is on the same file and criterion (one side names no line)'}`],
    };
  }
  return null;
}

/**
 * Classify one entry against a list of open issues.
 *
 * @param {object} entry - a file-issue.js entry (`title`, `source.file`, and
 *   `source.lines` + `source.category` for the #3907 already-filed match)
 * @param {object[]} issues - `{number, title, body}`
 * @param {{issueRefs?: number[]}} [opts] - the source file's manifest issueRefs
 * @returns {{classification: 'new'|'duplicate'|'related'|'already-filed', match: number|null, similarity: number, reasons: string[]}}
 */
function classifyEntry(entry, issues, { issueRefs = [] } = {}) {
  const filed = alreadyFiled(entry, issues);
  if (filed) return filed;
  const file = sourceFile(entry);
  let best = null;
  for (const issue of Array.isArray(issues) ? issues : []) {
    const reasons = [];
    const haystack = `${issue.title || ''}\n${issue.body || ''}`;
    // A gate-filed bug's file link is its marker's range (#3907): naming the
    // file alone does not link a finding outside that range to it.
    if (file && !parseFindingMarker(issue.body) && namesPath(haystack, file)) reasons.push(`path ${file} named in #${issue.number}`);
    if (issueRefs.includes(issue.number)) reasons.push(`#${issue.number} is in ${file || 'the file'}'s manifest issueRefs`);
    const linked = reasons.length > 0;
    const sim = similarity(entry && entry.title, issue.title);
    let classification = null;
    if (linked && sim >= DUPLICATE_THRESHOLD) classification = 'duplicate';
    else if (linked || sim >= RELATED_TITLE_THRESHOLD) classification = 'related';
    if (!classification) continue;
    reasons.push(`title similarity ${sim.toFixed(2)}`);
    const rank = (classification === 'duplicate' ? 2 : 1) * 10 + sim + (linked ? 1 : 0);
    if (!best || rank > best.rank) best = { classification, match: issue.number, similarity: sim, reasons, rank };
  }
  if (!best) return { classification: 'new', match: null, similarity: 0, reasons: ['no open bug or enhancement shares the file, a manifest ref or the title'] };
  return { classification: best.classification, match: best.match, similarity: best.similarity, reasons: best.reasons };
}

function defaultRunGh(args) {
  return execFileTimed('gh', args, { stdio: ['ignore', 'pipe', 'pipe'] });
}

function firstLine(err) {
  return (err && err.message ? String(err.message) : String(err)).split('\n')[0];
}

/**
 * List open `bug` and `enhancement` issues — read-only, one `gh issue list`
 * per label, merged by number. NEVER THROWS: a failure returns `{ok:false,
 * error}` and no `issues`, so it cannot be mistaken for an empty board.
 */
function searchOpenIssues({ runGh = defaultRunGh } = {}) {
  const byNumber = new Map();
  try {
    for (const label of SEARCH_LABELS) {
      const raw = runGh(['issue', 'list', '--state', 'open', '--label', label, '--limit', String(SEARCH_LIMIT), '--json', 'number,title,body,labels']);
      for (const issue of JSON.parse(String(raw || '[]'))) byNumber.set(issue.number, issue);
    }
  } catch (err) {
    return { ok: false, error: firstLine(err) };
  }
  return { ok: true, issues: [...byNumber.values()] };
}

/**
 * Classify every entry. A failed search classifies each `unchecked` and
 * carries `searchError` — the caller reports it and files the entries
 * normally; it never treats them as `new`.
 *
 * @returns {{ok: boolean, searchError?: string, searched?: number, results: object[]}}
 */
function checkDuplicates({ entries, manifest = {}, runGh = defaultRunGh } = {}) {
  const list = Array.isArray(entries) ? entries : [entries];
  const search = searchOpenIssues({ runGh });
  if (!search.ok) {
    return {
      ok: false,
      searchError: search.error,
      results: list.map((e, index) => ({
        index,
        title: e && e.title,
        classification: 'unchecked',
        match: null,
        reasons: [`issue search failed: ${search.error}`],
      })),
    };
  }
  const files = (manifest && manifest.files) || {};
  return {
    ok: true,
    searched: search.issues.length,
    results: list.map((e, index) => {
      const file = sourceFile(e);
      const issueRefs = file && files[file] && Array.isArray(files[file].issueRefs) ? files[file].issueRefs : [];
      return { index, title: e && e.title, ...classifyEntry(e, search.issues, { issueRefs }) };
    }),
  };
}

module.exports = {
  DUPLICATE_THRESHOLD,
  RELATED_TITLE_THRESHOLD,
  SEARCH_LABELS,
  titleTerms,
  similarity,
  parseFindingMarker,
  parseLineRange,
  classifyEntry,
  searchOpenIssues,
  checkDuplicates,
};
