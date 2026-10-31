// Rubrical Works (c) 2026
/**
 * @framework-script 0.116.0
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

/**
 * Classify one entry against a list of open issues.
 *
 * @param {object} entry - a file-issue.js entry (`title`, `source.file`)
 * @param {object[]} issues - `{number, title, body}`
 * @param {{issueRefs?: number[]}} [opts] - the source file's manifest issueRefs
 * @returns {{classification: 'new'|'duplicate'|'related', match: number|null, similarity: number, reasons: string[]}}
 */
function classifyEntry(entry, issues, { issueRefs = [] } = {}) {
  const file = sourceFile(entry);
  let best = null;
  for (const issue of Array.isArray(issues) ? issues : []) {
    const reasons = [];
    const haystack = `${issue.title || ''}\n${issue.body || ''}`;
    if (file && haystack.includes(file)) reasons.push(`path ${file} named in #${issue.number}`);
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
  classifyEntry,
  searchOpenIssues,
  checkDuplicates,
};
