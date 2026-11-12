#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.118.0
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
 *   | references         | review-references.js (#3540)                   |
 *   | declared-scope     | declared-scope-check.js                        |
 *   | unbuilt-dependency | an AC naming an OPEN issue #N — possibly out of |
 *   |                    | phase (ac-feasibility-prompts.json phaseFeasibility) |
 *   | stale-mention      | a line still naming a reference the edit removed |
 *   |                    | from other lines (#3546); needs --before-file    |
 *
 * Built-ins and shared siblings only (runtime dependency contract, #2418).
 * review-references.js is a hard dependency, installed with this file under
 * the same gate (#3566): there is no degraded mode without it (#3574).
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
const { issueRefPattern, checkReferences, extractIssueRefs, extractPathRefs, extractCommandRefs } = require('./review-references.js');
const REFERENCE_PROBLEMS = new Set(['missing', 'superseded-or-dropped', 'outside-root']);

/**
 * Acceptance criteria that name an open issue: the AC may depend on work not
 * built yet. The states come from `issueStates` — the per-#N results
 * checkReferences already fetched in this precheck — so the scan makes no
 * query of its own (#3563). A number absent from it, or `unverified`, is not
 * flagged and is named in a warning.
 *
 * @param {string} body
 * @param {{ issue?: number, warnings?: string[], issueStates?: Map<number, string> }} opts
 *   issueStates: #N → its checkReferences result (`open`, `closed`, `unverified`, …)
 * @returns {{ check: 'unbuilt-dependency', ref: string, acIndex: number, detail: string }[]}
 */
function scanUnbuiltDependencies(body, opts = {}) {
  const warnings = opts.warnings || [];
  const { items } = extractAcceptanceCriteria(typeof body === 'string' ? body : '');
  const refs = [];
  items.forEach((item, i) => {
    const text = stripGateSuffix(item.text);
    for (const m of text.matchAll(issueRefPattern())) {
      const n = Number(m[2]);
      if (n !== Number(opts.issue)) refs.push({ n, acIndex: i + 1 });
    }
  });
  if (refs.length === 0) return [];
  const numbers = [...new Set(refs.map((r) => r.n))];

  const states = opts.issueStates instanceof Map ? opts.issueStates : new Map();
  const unknown = numbers.filter((n) => !states.has(n) || states.get(n) === 'unverified');
  if (unknown.length) warnings.push(`unbuilt-dependency scan: ${unknown.map((n) => `#${n}`).join(', ')} not verified by the reference check — not flagged`);
  const isOpen = (n) => states.get(n) === 'open';

  return refs
    .filter((r) => isOpen(r.n))
    .map((r) => ({
      check: 'unbuilt-dependency',
      ref: `#${r.n}`,
      acIndex: r.acIndex,
      detail: `AC ${r.acIndex} names open #${r.n} — possibly out of phase; see ac-feasibility-prompts.json phaseFeasibility`,
    }));
}

/**
 * The lines (outside fenced blocks) on which each reference appears. Runs
 * review-references.js's own extractors one line at a time, so a `#N`, a
 * backticked path and a slash command are recognized exactly as the
 * reference check recognizes them — no second set of patterns (#3546).
 *
 * @param {string} body
 * @returns {Map<string, { line: number, text: string }[]>}
 */
function referenceLines(body) {
  const lines = (typeof body === 'string' ? body : '').split(/\r?\n/);
  const fenced = computeFenceMask(lines);
  const map = new Map();
  lines.forEach((text, i) => {
    if (fenced[i]) return;
    const keys = [
      ...extractIssueRefs(text).map((r) => `#${r.number}`),
      ...extractPathRefs(text).map((r) => r.ref),
      ...extractCommandRefs(text).map((r) => `/${r.name}`),
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
 * @returns {{ check: 'stale-mention', ref: string, line: number, text: string, detail: string }[]}
 */
function scanStaleMentions(before, after) {
  const was = referenceLines(before);
  const now = referenceLines(after);
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
 * @param {{ root?: string, runGh?: Function, issue?: number, before?: string, beforeError?: string }} [opts]
 *   before: the pre-edit body (`--before-file`), which feeds the stale-mention
 *     check; absent or blank skips that check with a warning.
 *   beforeError: why the pre-edit body could not be read; used as the skip
 *     reason when `before` is absent.
 * @returns {{ ok: true, found: number, hits: object[], references: 'checked'|'failed', warnings: string[] }}
 */
function runPrecheck(body, opts = {}) {
  const text = typeof body === 'string' ? body : '';
  const root = opts.root || process.cwd();
  const warnings = [];
  const hits = [];
  // #3574: a check that throws becomes a warning naming it; the rest still run.
  const guard = (check, fn) => {
    try { return fn(); } catch (e) { warnings.push(`${check} failed: ${e && e.message ? e.message : String(e)}`); return undefined; }
  };

  // #3563: the issue states checkReferences fetched, reused by the
  // unbuilt-dependency scan so one precheck makes one issue query.
  const issueStates = new Map();
  const referencesChecked = guard('references', () => {
    const r = checkReferences(text, { root, runGh: opts.runGh });
    warnings.push(...(r.warnings || []));
    for (const ref of r.references || []) {
      if (ref.kind === 'issue') issueStates.set(Number(String(ref.ref).slice(1)), ref.result);
      if (REFERENCE_PROBLEMS.has(ref.result)) {
        hits.push({ check: 'references', ref: ref.ref, line: ref.line, detail: `${ref.kind} ${ref.ref} is ${ref.result}` });
      }
    }
    return true;
  });

  guard('declared-scope', () => {
    const scope = checkDeclaredScope(text);
    if (scope.status !== 'pass') hits.push({ check: 'declared-scope', ref: 'Files to modify', detail: scope.evidence });
  });

  guard('unbuilt-dependency', () => {
    hits.push(...scanUnbuiltDependencies(text, { issue: opts.issue, warnings, issueStates }));
  });

  if (typeof opts.before !== 'string') {
    warnings.push(`stale-mention check skipped: ${opts.beforeError || 'no pre-edit body (--before-file)'}`);
  } else if (opts.before.trim() === '') {
    // A failed `gh pmu view … > file` still creates the file, empty. Read as a
    // body it would find no references and pass silently.
    warnings.push('stale-mention check skipped: pre-edit body is empty (the save may have failed)');
  } else {
    guard('stale-mention', () => { hits.push(...scanStaleMentions(opts.before, text)); });
  }
  return { ok: true, found: hits.length, hits, references: referencesChecked ? 'checked' : 'failed', warnings };
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
  const fail = (code, message) => ({ ok: false, error: { code, message } });
  // A flag in a value position is a missing value, never the value (#3600):
  // `--issue --body-file x` must not read `--body-file` as the issue.
  let flagAsValue = null;
  const arg = (name) => {
    const i = argv.indexOf(name);
    if (i === -1) return undefined;
    const value = argv[i + 1];
    if (typeof value === 'string' && value.startsWith('--')) {
      if (!flagAsValue) flagAsValue = `${name} is missing its value (found the flag ${value} instead)`;
      return undefined;
    }
    return value;
  };
  // A positive integer, checked the way review-preamble.js checks it: an
  // invalid value is named, not reported as a missing argument (#3600).
  const rawIssue = arg('--issue');
  let issue;
  if (rawIssue !== undefined) {
    const num = parseInt(rawIssue, 10);
    if (isNaN(num) || num <= 0 || String(num) !== rawIssue) {
      return fail('INVALID_ARGUMENT', `Invalid --issue value: ${rawIssue} (expected a positive integer)`);
    }
    issue = num;
  }
  const bodyFile = arg('--body-file');
  const beforeFile = arg('--before-file');
  if (flagAsValue) return fail('INVALID_ARGUMENT', flagAsValue);
  let body;
  let source;
  try {
    if (bodyFile) { body = fs.readFileSync(bodyFile, 'utf8'); source = 'file'; }
    else if (issue) { body = (deps.fetchBody || defaultFetchBody)(issue); source = 'issue'; }
    else return fail('MISSING_ARGUMENT', 'Usage: resolve-precheck.js --issue <N> [--body-file <path>] [--before-file <path>]');
  } catch (e) {
    return fail('BODY_UNREADABLE', `Could not read the body of ${bodyFile || `#${issue}`}: ${e.message}`);
  }
  if (typeof body !== 'string' || body.trim() === '') {
    return fail('NO_BODY', `The body of ${bodyFile || `#${issue}`} is empty — nothing to pre-check.`);
  }
  const result = { ok: true, body, issue, source };
  // The pre-edit body only feeds the stale-mention check, so an unreadable one
  // skips that check with its reason; the other checks still run (#3546).
  if (beforeFile) {
    try { result.before = fs.readFileSync(beforeFile, 'utf8'); } catch (e) {
      result.beforeError = `pre-edit body ${beforeFile} unreadable: ${e.message}`;
    }
  }
  return result;
}

/**
 * CLI entry. stdout is always exactly one JSON document (#3574): a usage or
 * body error is resolveBody's envelope, and anything else that throws becomes
 * `{ ok: false, error }`.
 *
 * @param {string[]} [argv]
 * @param {{ fetchBody?: (issue: number) => string, runPrecheck?: Function }} [deps]
 */
function main(argv = process.argv.slice(2), deps = {}) {
  const emit = (doc) => process.stdout.write(JSON.stringify(doc, null, 2) + '\n');
  try {
    const input = resolveBody(argv, deps);
    if (!input.ok) {
      // exitCode, not process.exit(): exit can cut off a pending stdout write
      // to a pipe, which is how rule 09 consumes this envelope.
      emit(input);
      process.exitCode = 1;
      return;
    }
    const opts = { issue: input.issue, before: input.before, beforeError: input.beforeError };
    emit((deps.runPrecheck || runPrecheck)(input.body, opts));
  } catch (e) {
    emit({ ok: false, error: { code: 'PRECHECK_FAILED', message: e && e.message ? e.message : String(e) } });
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { runPrecheck, scanUnbuiltDependencies, scanStaleMentions, resolveBody, main };
