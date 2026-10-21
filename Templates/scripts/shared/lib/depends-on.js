// Rubrical Works (c) 2026
/**
 * @framework-script 0.109.1
 * depends-on.js — Parse a sub-issue body's `**Depends on:** #N, #M` line into
 * dependency edges (#3127, PRD Concurrent-Work Story 1.10)
 *
 * `--nonstop` and `--concurrent` remove the per-member STOP where a human
 * would notice a wrong order, so the parent needs an explicit graph rather
 * than heuristics. `/create-backlog` and `/add-story` author the line; this
 * reads it.
 *
 * The line's value is `none` or a comma-separated list of `#N` references.
 * A parenthetical note on an entry is ignored (`#12 (shares helpers)`).
 *
 * One hard rule: an entry that cannot be read as a valid member dependency —
 * malformed (`#abc`, `Story 1.1`, a bare `3126`), a self-reference, or a
 * number outside the member set — yields NO edge plus a warning, and is
 * recorded in `invalid` so `isSatisfied` can never report the member ready.
 * Dropping it silently would make an unreadable dependency look like none.
 *
 * A missing line is `found: false` with no warning: it is the state of every
 * issue authored before the line existed, not an error.
 *
 * Pure over its inputs: no gh, no disk.
 */

const LINE_RE = /^[ \t]*\*\*Depends on:\*\*[ \t]*(.*)$/m;
const REF_RE = /^#([1-9]\d*)$/;

/**
 * @param {string} body - Issue body.
 * @param {{self?: number, members?: number[]}} [opts]
 *   `self` is the issue's own number (self-reference check). `members` is the
 *   set a dependency must belong to; omitted → membership is not checked,
 *   reported as `membershipChecked: false`.
 * @returns {{found: boolean, none: boolean, edges: number[],
 *   invalid: Array<{entry: string, reason: string}>, warnings: string[],
 *   membershipChecked: boolean}}
 */
function parseDependsOn(body, opts = {}) {
  const members = Array.isArray(opts.members) ? new Set(opts.members) : null;
  const result = {
    found: false,
    none: false,
    edges: [],
    invalid: [],
    warnings: [],
    membershipChecked: members !== null,
  };
  if (typeof body !== 'string') return result;

  const match = body.match(LINE_RE);
  if (!match) return result;
  result.found = true;

  const value = match[1].replace(/\([^)]*\)/g, '').trim();
  if (/^none$/i.test(value)) {
    result.none = true;
    return result;
  }

  const label = opts.self ? `#${opts.self}` : 'this issue';
  const reject = (entry, reason) => {
    result.invalid.push({ entry, reason });
    result.warnings.push(`${label}: Depends on entry ${JSON.stringify(entry)} is ${reason} — no edge recorded; not treated as satisfied.`);
  };

  if (value === '') {
    reject('', 'empty');
    return result;
  }

  for (const raw of value.split(',')) {
    const entry = raw.trim();
    const ref = entry.match(REF_RE);
    if (!ref) { reject(entry, 'malformed'); continue; }
    const n = Number(ref[1]);
    if (opts.self && n === opts.self) { reject(entry, 'self-reference'); continue; }
    if (members && !members.has(n)) { reject(entry, 'non-member'); continue; }
    if (!result.edges.includes(n)) result.edges.push(n);
  }
  return result;
}

/**
 * Whether every dependency is done. Any invalid entry makes the answer
 * false, whatever else is done — an unreadable dependency is unknown, not
 * absent.
 *
 * @param {{edges: number[], invalid: Array}} parsed - parseDependsOn result.
 * @param {Set<number>} done
 * @returns {boolean}
 */
function isSatisfied(parsed, done) {
  if (parsed.invalid.length > 0) return false;
  return parsed.edges.every((n) => done.has(n));
}

/**
 * Parse every member against the set's own numbers.
 *
 * @param {Array<{number: number, body: string}>} members
 * @returns {{edges: Object<number, number[]>, invalid: Object<number, Array>, warnings: string[]}}
 *   `invalid` carries only members that have invalid entries.
 */
function buildGraph(members) {
  const graph = { edges: {}, invalid: {}, warnings: [] };
  if (!Array.isArray(members)) return graph;
  const numbers = members.map((m) => m.number);
  for (const m of members) {
    const parsed = parseDependsOn(m.body, { self: m.number, members: numbers });
    graph.edges[m.number] = parsed.edges;
    if (parsed.invalid.length > 0) graph.invalid[m.number] = parsed.invalid;
    graph.warnings.push(...parsed.warnings);
  }
  return graph;
}

module.exports = {
  parseDependsOn,
  isSatisfied,
  buildGraph,
};
