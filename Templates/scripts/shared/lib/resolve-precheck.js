#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.117.0
 * resolve-precheck.js — /resolve-review's deterministic check of its own edits
 * before the Step 4 re-review (#3542).
 *
 * A resolve cycle edits the body and then pays for a full `--force` re-review
 * to learn whether the edit was sound. #3538's resolve introduced a stale
 * reference the next review caught (#3540, #3542); a script catches that in
 * one pass, before the re-review, while the fix is still one edit away.
 *
 *   | check              | source                                         |
 *   |--------------------|------------------------------------------------|
 *   | references         | review-references.js (#3540), when present      |
 *   | declared-scope     | declared-scope-check.js                        |
 *   | unbuilt-dependency | an AC naming an OPEN issue #N — possibly out of |
 *   |                    | phase (ac-feasibility-prompts.json phaseFeasibility) |
 *   | stale-mention      | a line still naming a reference the edit removed |
 *   |                    | from other lines (#3546); needs --before-file    |
 *
 * Built-ins and shared siblings only (runtime dependency contract, #2418).
 *
 * CLI: node .claude/scripts/shared/lib/resolve-precheck.js --issue <N> [--body-file <path>] [--before-file <path>]
 *      --issue alone fetches the live body (gh pmu view --body-stdout) → JSON on stdout.
 *      --before-file is the body saved before the first edit; without it the
 *      stale-mention check is skipped with a warning.
 */

const fs = require('fs');
const { extractAcceptanceCriteria, computeFenceMask } = require('./checkbox-scan.js');
const { checkDeclaredScope } = require('./declared-scope-check.js');
// `→ QA: #N` / `→ GATE: …` suffixes name the gate that owns the AC, not a
// dependency. One shared stripper (review-body-hash.js), no second pattern.
const { stripGateSuffix } = require('./review-body-hash.js');

// One issue-reference pattern, owned by review-references.js (#3563).
const { ISSUE_REF, queryIssueStates } = require('./review-references.js');
const REFERENCE_PROBLEMS = new Set(['missing', 'superseded-or-dropped', 'outside-root']);

/**
 * Acceptance criteria that name an open issue: the AC may depend on work not
 * built yet. With `issueStates` — the per-#N results checkReferences already
 * fetched in this precheck — no query is made (#3563). Without it (references
 * unavailable) one batched query through review-references.js's own
 * queryIssueStates, which retries a whole-batch failure once; a failed query
 * flags nothing and warns.
 *
 * @param {string} body
 * @param {{ root?: string, runGh?: Function, issue?: number, warnings?: string[], issueStates?: Map<number, string> }} opts
 *   issueStates: #N → its checkReferences result (`open`, `closed`, `unverified`, …)
 * @returns {{ check: 'unbuilt-dependency', ref: string, acIndex: number, detail: string }[]}
 */
function scanUnbuiltDependencies(body, opts = {}) {
  const root = opts.root || process.cwd();
  const warnings = opts.warnings || [];
  const { items } = extractAcceptanceCriteria(typeof body === 'string' ? body : '');
  const refs = [];
  items.forEach((item, i) => {
    const text = stripGateSuffix(item.text);
    for (const m of text.matchAll(ISSUE_REF)) {
      const n = Number(m[2]);
      if (n !== Number(opts.issue)) refs.push({ n, acIndex: i + 1 });
    }
  });
  if (refs.length === 0) return [];
  const numbers = [...new Set(refs.map((r) => r.n))];

  let isOpen;
  if (opts.issueStates instanceof Map) {
    const unknown = numbers.filter((n) => !opts.issueStates.has(n) || opts.issueStates.get(n) === 'unverified');
    if (unknown.length) warnings.push(`unbuilt-dependency scan: ${unknown.map((n) => `#${n}`).join(', ')} not verified by the reference check — not flagged`);
    isOpen = (n) => opts.issueStates.get(n) === 'open';
  } else {
    const { repository, error } = queryIssueStates(numbers, root, opts.runGh);
    if (!repository) { warnings.push(`unbuilt-dependency scan skipped: ${error}`); return []; }
    isOpen = (n) => Boolean(repository[`i${n}`]) && repository[`i${n}`].state === 'OPEN';
  }

  return refs
    .filter((r) => isOpen(r.n))
    .map((r) => ({
      check: 'unbuilt-dependency',
      ref: `#${r.n}`,
      acIndex: r.acIndex,
      detail: `AC ${r.acIndex} names open #${r.n} — possibly out of phase; see ac-feasibility-prompts.json phaseFeasibility`,
    }));
}

function defaultLoadReferences() {
  try { return require('./review-references.js'); } catch { return null; }
}

/**
 * The lines (outside fenced blocks) on which each reference appears. Runs
 * review-references.js's own extractors one line at a time, so a `#N`, a
 * backticked path and a slash command are recognized exactly as the
 * reference check recognizes them — no second set of patterns (#3546).
 *
 * @param {string} body
 * @param {object} refs review-references.js exports
 * @returns {Map<string, { line: number, text: string }[]>}
 */
function referenceLines(body, refs) {
  const lines = (typeof body === 'string' ? body : '').split(/\r?\n/);
  const fenced = computeFenceMask(lines);
  const map = new Map();
  lines.forEach((text, i) => {
    if (fenced[i]) return;
    const keys = [
      ...refs.extractIssueRefs(text).map((r) => `#${r.number}`),
      ...refs.extractPathRefs(text).map((r) => r.ref),
      ...refs.extractCommandRefs(text).map((r) => `/${r.name}`),
    ];
    for (const key of keys) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ line: i + 1, text });
    }
  });
  return map;
}

/**
 * Lines that still name a reference the edit removed from other lines (#3546).
 * A reference on fewer lines after the edit than before, but on at least one,
 * is partially removed: each remaining line may now describe a state the body
 * no longer has. Advisory — the hit asks for a re-read and fixes nothing. A
 * reference removed entirely, untouched, or added to more lines is not a hit.
 *
 * @param {string} before body before the resolve pass edited it
 * @param {string} after edited body
 * @param {{ loadReferences?: Function }} [opts]
 * @returns {{ check: 'stale-mention', ref: string, line: number, text: string, detail: string }[]}
 */
function scanStaleMentions(before, after, opts = {}) {
  const refs = (opts.loadReferences || defaultLoadReferences)();
  if (!refs) return [];
  const was = referenceLines(before, refs);
  const now = referenceLines(after, refs);
  const hits = [];
  for (const [ref, prior] of was) {
    const remaining = now.get(ref);
    if (!remaining || remaining.length >= prior.length) continue;
    const removed = prior.length - remaining.length;
    for (const { line, text } of remaining) {
      hits.push({
        check: 'stale-mention',
        ref,
        line,
        text: text.trim(),
        detail: `${ref} was removed from ${removed} of ${prior.length} lines by this edit; re-read this one`,
      });
    }
  }
  return hits;
}

/**
 * Run every check over the edited body.
 *
 * @param {string} body
 * @param {{ root?: string, runGh?: Function, issue?: number, loadReferences?: Function }} [opts]
 * @returns {{ ok: true, found: number, hits: object[], references: 'checked'|'not available', warnings: string[] }}
 */
function runPrecheck(body, opts = {}) {
  const text = typeof body === 'string' ? body : '';
  const root = opts.root || process.cwd();
  const warnings = [];
  const hits = [];

  const refsModule = (opts.loadReferences || defaultLoadReferences)();
  let references = 'not available';
  // #3563: the issue states checkReferences fetched, reused by the
  // unbuilt-dependency scan so one precheck makes one issue query.
  let issueStates;
  if (refsModule && typeof refsModule.checkReferences === 'function') {
    references = 'checked';
    const r = refsModule.checkReferences(text, { root, runGh: opts.runGh });
    warnings.push(...(r.warnings || []));
    issueStates = new Map();
    for (const ref of r.references || []) {
      if (ref.kind === 'issue') issueStates.set(Number(String(ref.ref).slice(1)), ref.result);
      if (REFERENCE_PROBLEMS.has(ref.result)) {
        hits.push({ check: 'references', ref: ref.ref, line: ref.line, detail: `${ref.kind} ${ref.ref} is ${ref.result}` });
      }
    }
  }

  const scope = checkDeclaredScope(text);
  if (scope.status !== 'pass') hits.push({ check: 'declared-scope', ref: 'Files to modify', detail: scope.evidence });

  hits.push(...scanUnbuiltDependencies(text, { root, runGh: opts.runGh, issue: opts.issue, warnings, issueStates }));

  if (typeof opts.before !== 'string') {
    warnings.push(`stale-mention check skipped: ${opts.beforeError || 'no pre-edit body (--before-file)'}`);
  } else if (opts.before.trim() === '') {
    // A failed `gh pmu view … > file` still creates the file, empty. Read as a
    // body it would find no references and pass silently.
    warnings.push('stale-mention check skipped: pre-edit body is empty (the save may have failed)');
  } else if (!refsModule) {
    warnings.push('stale-mention check skipped: review-references.js not available');
  } else {
    hits.push(...scanStaleMentions(opts.before, text, { loadReferences: () => refsModule }));
  }
  return { ok: true, found: hits.length, hits, references, warnings };
}

function defaultFetchBody(issue) {
  const { execFileTimed } = require('./exec.js');
  return String(execFileTimed('gh', ['pmu', 'view', String(issue), '--body-stdout'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: false }));
}

/**
 * Where the edited body comes from. `--body-file` wins; otherwise `--issue N`
 * fetches the live body — what rule 09 Step 3b runs, after Passes 1–2 wrote
 * their edits. An empty body is an error, never a body with no declaration.
 *
 * @param {string[]} argv
 * @param {{ fetchBody?: (issue: number) => string }} [deps]
 * @returns {{ ok: true, body: string, issue: number|undefined, source: 'file'|'issue' }
 *   | { ok: false, error: { code: string, message: string } }}
 */
function resolveBody(argv, deps = {}) {
  const arg = (name) => { const i = argv.indexOf(name); return i !== -1 ? argv[i + 1] : undefined; };
  const issue = Number(arg('--issue')) || undefined;
  const bodyFile = arg('--body-file');
  const fail = (code, message) => ({ ok: false, error: { code, message } });
  let body;
  let source;
  try {
    if (bodyFile) { body = fs.readFileSync(bodyFile, 'utf8'); source = 'file'; }
    else if (issue) { body = (deps.fetchBody || defaultFetchBody)(issue); source = 'issue'; }
    else return fail('MISSING_ARGUMENT', 'Usage: resolve-precheck.js --issue <N> [--body-file <path>]');
  } catch (e) {
    return fail('BODY_UNREADABLE', `Could not read the body of ${bodyFile || `#${issue}`}: ${e.message}`);
  }
  if (typeof body !== 'string' || body.trim() === '') {
    return fail('NO_BODY', `The body of ${bodyFile || `#${issue}`} is empty — nothing to pre-check.`);
  }
  const result = { ok: true, body, issue, source };
  // The pre-edit body only feeds the stale-mention check, so an unreadable one
  // skips that check with its reason; the other checks still run (#3546).
  const beforeFile = arg('--before-file');
  if (beforeFile) {
    try { result.before = fs.readFileSync(beforeFile, 'utf8'); } catch (e) {
      result.beforeError = `pre-edit body ${beforeFile} unreadable: ${e.message}`;
    }
  }
  return result;
}

function main(argv = process.argv.slice(2)) {
  const input = resolveBody(argv);
  if (!input.ok) {
    process.stdout.write(JSON.stringify(input, null, 2) + '\n');
    process.exit(1);
  }
  const opts = { issue: input.issue, before: input.before, beforeError: input.beforeError };
  process.stdout.write(JSON.stringify(runPrecheck(input.body, opts), null, 2) + '\n');
}

if (require.main === module) main();

module.exports = { runPrecheck, scanUnbuiltDependencies, scanStaleMentions, resolveBody };
