#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.111.0
 * @description JSON-aware git merge driver for accumulator files (#3119, PRD
 * Concurrent-Work Story 1.2). Registered as `merge.json-merge.driver` by
 * lib/merge-driver-config.js and named per path in .gitattributes
 * (`<path> merge=json-merge`); git then runs it as
 * `node .claude/scripts/shared/json-merge-driver.js %O %A %B %P` with the
 * base, ours and theirs temp files and the pathname. The result is written
 * over %A; exit 0 means clean, non-zero means git records a conflict.
 *
 * WHAT IT MERGES. An accumulator is a JSON document holding an object map of
 * keyed records at the declared `key` path (minimize-targets.json keeps its
 * records under `files`, keyed by source path). Two branches that each add
 * DIFFERENT records to that map conflict only textually — the records are
 * unrelated — so the driver unions them by name, three-way:
 *   - equal on both sides → taken (covers added-identically, both-deleted,
 *     untouched);
 *   - unchanged on one side → the other side's version (modified, or deleted);
 *   - otherwise → a REAL CONFLICT, never a side picked. Same name, different
 *     values on both sides is the case the driver cannot decide, and picking
 *     one would be data loss that reads as a successful merge. The file is
 *     left with git-style markers around each such record and exit code 1.
 * Everything outside the map follows the same three-way rule as one value.
 *
 * ORDER IS DETERMINISTIC: records present in base keep base order, additions
 * follow sorted by name, so two runs — or the same merge with the sides
 * swapped — produce byte-identical output. Indent is taken from ours.
 *
 * ABSENT CONFIGURATION CHANGES NOTHING. The key for a pathname comes from the
 * project's `concurrency.accumulators` declaration through
 * lib/derived-artifacts.js. A path with no declaration (or an invalid block,
 * which yields none) is handed to `git merge-file`, which is the textual
 * three-way merge git would have run without this driver — so a
 * .gitattributes entry on an undeclared path is inert, and a registered
 * driver on a clone that never declares anything merges exactly as before.
 *
 * Exit codes: 0 clean; 1 conflict (content written); 2 usage error or
 * unmergeable input (ours left untouched). Both non-zero values are a
 * conflict to git; the distinction is for a human reading stderr.
 */

const fs = require('fs');
const { spawnSync } = require('child_process');
const { loadConcurrency, normalizePath } = require('./lib/derived-artifacts');

/** The name .gitattributes uses and merge-driver-config.js registers. */
const DRIVER_NAME = 'json-merge';

const CONFLICT_TOKEN = '__JSON_MERGE_CONFLICT__';

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Key-order-insensitive serialization, so a reordered object is not a change. */
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (isPlainObject(v)) {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

const eq = (a, b) => stable(a) === stable(b);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function getPath(obj, segs) {
  let cur = obj;
  for (const s of segs) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[s];
  }
  return cur;
}

function setPath(obj, segs, value) {
  let cur = obj;
  for (const s of segs.slice(0, -1)) {
    if (!isPlainObject(cur[s])) cur[s] = {};
    cur = cur[s];
  }
  cur[segs[segs.length - 1]] = value;
}

/** A deep copy of the document with the collection removed. */
function withoutPath(obj, segs) {
  const copy = clone(obj);
  const parent = getPath(copy, segs.slice(0, -1));
  if (isPlainObject(parent)) delete parent[segs[segs.length - 1]];
  return copy;
}

/**
 * The declared key for a pathname, read through the project's `concurrency`
 * block. `{ key: null, declared: false }` for an undeclared path, an absent
 * config, or an invalid block — every one of those is "merge as text".
 *
 * @param {string} pathname - git's %P, relative to the worktree root
 * @param {string} [cwd] - Project root (git runs merge drivers from it)
 * @returns {{key: string|null, declared: boolean}}
 */
function resolveAccumulatorKey(pathname, cwd = process.cwd()) {
  const want = normalizePath(pathname);
  const hit = loadConcurrency(cwd).accumulators.find((a) => normalizePath(a.path) === want);
  return hit ? { key: hit.key, declared: true } : { key: null, declared: false };
}

/**
 * Three-way merge of parsed documents by the keyed collection at `key`.
 *
 * @param {{base: object, ours: object, theirs: object, key: string}} input
 * @returns {{ok: boolean, merged: object|null, conflicts: object[],
 *   order: string[], partial: object|null, error: string|null}}
 *   `conflicts` entries are `{ name, scope: 'record', base, ours, theirs }`
 *   or `{ name: null, scope: 'document', ... }` for the fields outside the
 *   collection. `merged` is null whenever there is any conflict — no side is
 *   ever chosen. `partial` and `order` carry what the conflict renderer
 *   needs: the clean records, and every record name in output order.
 */
function mergeDocuments({ base, ours, theirs, key }) {
  const segs = String(key).split('.').filter(Boolean);
  const docs = { base, ours, theirs };
  const coll = {};
  for (const side of ['base', 'ours', 'theirs']) {
    const c = getPath(docs[side], segs);
    if (c !== undefined && !isPlainObject(c)) {
      return {
        ok: false, merged: null, conflicts: [], order: [], partial: null,
        error: `${side}: collection at "${key}" is not an object map of records`,
      };
    }
    coll[side] = c === undefined ? {} : c;
  }

  const conflicts = [];

  // Everything outside the collection, as one value under the same rule.
  const rest = { base: withoutPath(base, segs), ours: withoutPath(ours, segs), theirs: withoutPath(theirs, segs) };
  let mergedRest;
  if (eq(rest.ours, rest.theirs)) mergedRest = rest.ours;
  else if (eq(rest.ours, rest.base)) mergedRest = rest.theirs;
  else if (eq(rest.theirs, rest.base)) mergedRest = rest.ours;
  else {
    mergedRest = rest.ours;
    conflicts.push({ name: null, scope: 'document', base: rest.base, ours: rest.ours, theirs: rest.theirs });
  }

  // Base order first, then additions sorted — the deterministic order.
  const baseNames = Object.keys(coll.base);
  const seen = new Set(baseNames);
  const added = [...Object.keys(coll.ours), ...Object.keys(coll.theirs)]
    .filter((n) => !seen.has(n) && seen.add(n))
    .sort();
  const order = [...baseNames, ...added];

  const records = {};
  const kept = [];
  for (const name of order) {
    const b = coll.base[name];
    const o = coll.ours[name];
    const t = coll.theirs[name];
    let take;
    if (eq(o, t)) take = o;
    else if (eq(o, b)) take = t;
    else if (eq(t, b)) take = o;
    else {
      conflicts.push({ name, scope: 'record', base: clone(b), ours: clone(o), theirs: clone(t) });
      kept.push(name);
      continue;
    }
    if (take !== undefined) {
      records[name] = clone(take);
      kept.push(name);
    }
  }

  const partial = clone(mergedRest);
  setPath(partial, segs, records);

  if (conflicts.length > 0) {
    return { ok: false, merged: null, conflicts, order: kept, partial, error: null };
  }
  return { ok: true, merged: partial, conflicts: [], order: kept, partial, error: null };
}

/** The indent unit of a pretty-printed JSON text; two spaces when unknown. */
function detectIndent(text) {
  const m = /\n([ \t]+)\S/.exec(text);
  return m ? m[1] : '  ';
}

function parseSide(label, text) {
  try {
    return { value: JSON.parse(text) };
  } catch (err) {
    return { error: `${label} is not valid JSON: ${err.message}` };
  }
}

/**
 * Render a conflicting merge as text: the clean records in place, each
 * conflicting record replaced by a git-style marker block carrying both
 * sides. Deliberately NOT valid JSON — a conflict must not parse.
 */
function renderConflict({ partial, conflicts, order, segs, indent, newline }) {
  const docConflict = conflicts.find((c) => c.scope === 'document');
  if (docConflict) {
    const ours = JSON.stringify(docConflict.ours, null, indent);
    const theirs = JSON.stringify(docConflict.theirs, null, indent);
    return `<<<<<<< ours\n${ours}\n=======\n${theirs}\n>>>>>>> theirs${newline}`;
  }

  const byName = new Map(conflicts.map((c) => [c.name, c]));
  // Token index → record name, in output order; the serialized token is the
  // only thing that survives JSON.stringify, so the name is recovered from it.
  const conflictNames = order.filter((n) => byName.has(n));
  const records = getPath(partial, segs) || {};
  const withTokens = {};
  for (const name of order) {
    withTokens[name] = byName.has(name)
      ? `${CONFLICT_TOKEN}${conflictNames.indexOf(name)}__`
      : records[name];
  }
  const doc = clone(partial);
  setPath(doc, segs, withTokens);

  const sideLines = (name, value, pad, comma) => {
    if (value === undefined) return [];
    const lines = JSON.stringify({ [name]: value }, null, indent).split('\n').slice(1, -1);
    const out = lines.map((l) => pad + l.slice(indent.length));
    out[out.length - 1] += comma;
    return out;
  };

  const tokenLine = new RegExp(`^(\\s*)".*": "${CONFLICT_TOKEN}(\\d+)__"(,?)$`);
  const rendered = [];
  for (const line of JSON.stringify(doc, null, indent).split('\n')) {
    const m = tokenLine.exec(line);
    if (!m) { rendered.push(line); continue; }
    const [, leading, index, comma] = m;
    const name = conflictNames[Number(index)];
    const c = byName.get(name);
    rendered.push(
      '<<<<<<< ours',
      ...sideLines(name, c.ours, leading, comma),
      '=======',
      ...sideLines(name, c.theirs, leading, comma),
      '>>>>>>> theirs',
    );
  }
  return rendered.join('\n') + newline;
}

/**
 * Text layer: parse, merge, serialize.
 *
 * @param {{baseText: string, oursText: string, theirsText: string, key: string}} input
 * @returns {{status: 'clean'|'conflict'|'error', output: string|null,
 *   conflicts: object[], error: string|null}}
 */
function merge({ baseText, oursText, theirsText, key }) {
  const sides = { base: parseSide('base', baseText), ours: parseSide('ours', oursText), theirs: parseSide('theirs', theirsText) };
  for (const side of ['base', 'ours', 'theirs']) {
    if (sides[side].error) return { status: 'error', output: null, conflicts: [], error: sides[side].error };
  }
  const r = mergeDocuments({ base: sides.base.value, ours: sides.ours.value, theirs: sides.theirs.value, key });
  if (r.error) return { status: 'error', output: null, conflicts: [], error: r.error };

  const indent = detectIndent(oursText);
  const newline = oursText.endsWith('\n') ? '\n' : '';
  if (r.ok) {
    return { status: 'clean', output: JSON.stringify(r.merged, null, indent) + newline, conflicts: [], error: null };
  }
  const segs = String(key).split('.').filter(Boolean);
  const output = renderConflict({ partial: r.partial, conflicts: r.conflicts, order: r.order, segs, indent, newline });
  return { status: 'conflict', output, conflicts: r.conflicts, error: null };
}

/**
 * Upper bound on the `git merge-file` fallback (#2469 spawn contract). The
 * merge itself is milliseconds; the bound exists for a hung git, not a slow one.
 */
const GIT_TIMEOUT_MS = 30_000;

/** The merge git would have run without this driver. */
function textMergeFallback(O, A, B) {
  const r = spawnSync('git', ['merge-file', '-L', 'ours', '-L', 'base', '-L', 'theirs', A, O, B], {
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
  });
  if (r.error) {
    process.stderr.write(`${DRIVER_NAME}: git merge-file unavailable: ${r.error.message}\n`);
    return 2;
  }
  if (r.status === 0) return 0;
  return r.status > 0 ? 1 : 2;
}

function parseArgs(argv) {
  const positional = [];
  const opts = { key: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--key' && argv[i + 1] !== undefined) opts.key = argv[++i];
    else positional.push(argv[i]);
  }
  return { positional, opts };
}

function main() {
  const { positional, opts } = parseArgs(process.argv.slice(2));
  if (positional.length < 3) {
    process.stderr.write(`usage: json-merge-driver.js <base> <ours> <theirs> [<pathname>] [--key <path>]\n`);
    return 2;
  }
  const [O, A, B, P] = positional;
  const key = opts.key !== null ? opts.key : resolveAccumulatorKey(P || A).key;
  if (key === null) return textMergeFallback(O, A, B);

  let texts;
  try {
    texts = { baseText: fs.readFileSync(O, 'utf8'), oursText: fs.readFileSync(A, 'utf8'), theirsText: fs.readFileSync(B, 'utf8') };
  } catch (err) {
    process.stderr.write(`${DRIVER_NAME}: cannot read merge inputs: ${err.message}\n`);
    return 2;
  }

  const r = merge({ ...texts, key });
  if (r.status === 'error') {
    process.stderr.write(`${DRIVER_NAME}: ${P || A}: ${r.error}\n`);
    return 2;
  }
  fs.writeFileSync(A, r.output);
  if (r.status === 'conflict') {
    const names = r.conflicts.map((c) => (c.scope === 'document' ? '(fields outside the collection)' : c.name));
    process.stderr.write(`${DRIVER_NAME}: conflict in ${P || A} — same key, different values: ${names.join(', ')}\n`);
    return 1;
  }
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  DRIVER_NAME,
  mergeDocuments,
  merge,
  resolveAccumulatorKey,
  detectIndent,
};
