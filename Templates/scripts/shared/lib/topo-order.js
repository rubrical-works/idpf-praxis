// Rubrical Works (c) 2026
/**
 * @framework-script 0.114.0
 * topo-order.js — Processing order as a topological sort of the
 * `**Depends on:**` graph (#3128, PRD Concurrent-Work Story 1.11)
 *
 * No member starts before what it depends on. Among members that are ready
 * at the same time, ties break by `**Processing Order:**` rank when present,
 * then by ascending number — so a tree with no dependency lines keeps exactly
 * the order it had, and an explicit dependency is the only thing that moves
 * a member.
 *
 * Three kinds of dependency target besides an active member:
 *   - SATISFIED (`in_review`, `done`, closed): counts as merged, so the
 *     dependency is met and adds no edge — what lets a resumed run continue;
 *   - BLOCKED (a skipped `qa-required` member): this run never works it, so
 *     the dependency cannot be met here; the dependent is named in `blockedBy`
 *     and the caller decides (tail in default mode, halt under `--nonstop`);
 *   - unreadable (`depends-on.js` rejects it): no edge, a warning, and the
 *     member is reported in `invalid` — never treated as satisfied.
 *
 * A cycle has no valid order. It is returned, named, with `ok: false` so the
 * preamble can halt before any worktree is created or any member moved.
 *
 * Pure over its inputs: no gh, no disk.
 */

const { parseDependsOn } = require('./depends-on.js');

/**
 * @param {{members?: Array<{number: number, body?: string}>, tiebreak?: number[],
 *   satisfied?: number[], blocked?: number[]}} [input]
 *   `members` are the members to order. `tiebreak` is the Processing Order.
 * @returns {{ok: boolean, order: number[], cycle: number[]|null, message: string|null,
 *   edges: Object<number, number[]>, blockedBy: Object<number, number[]>,
 *   invalid: Object<number, Array<{entry: string, reason: string}>>, warnings: string[]}}
 *   `edges` maps each member to the active members it waits on. `cycle` lists
 *   the members in dependency order, first repeated last.
 */
function topoOrder({ members = [], tiebreak = [], satisfied = [], blocked = [] } = {}) {
  const numbers = members.map((m) => m.number);
  const active = new Set(numbers);
  const satisfiedSet = new Set(satisfied);
  const blockedSet = new Set(blocked);
  const universe = [...new Set([...numbers, ...satisfied, ...blocked])];

  const rankOf = new Map(tiebreak.map((n, i) => [n, i]));
  const compare = (a, b) => {
    const ra = rankOf.has(a) ? rankOf.get(a) : Infinity;
    const rb = rankOf.has(b) ? rankOf.get(b) : Infinity;
    return ra !== rb ? ra - rb : a - b;
  };

  const result = {
    ok: true, order: [], cycle: null, message: null,
    edges: {}, blockedBy: {}, invalid: {}, warnings: [],
  };

  for (const m of members) {
    const parsed = parseDependsOn(m.body, { self: m.number, members: universe });
    result.warnings.push(...parsed.warnings);
    if (parsed.invalid.length > 0) result.invalid[m.number] = parsed.invalid;
    result.edges[m.number] = parsed.edges.filter((n) => active.has(n) && !satisfiedSet.has(n));
    const blockers = parsed.edges.filter((n) => blockedSet.has(n));
    if (blockers.length > 0) result.blockedBy[m.number] = blockers;
  }

  const waiting = new Map(numbers.map((n) => [n, new Set(result.edges[n])]));
  while (waiting.size > 0) {
    const ready = [...waiting.keys()].filter((n) => waiting.get(n).size === 0).sort(compare);
    if (ready.length === 0) break;
    const next = ready[0];
    result.order.push(next);
    waiting.delete(next);
    for (const deps of waiting.values()) deps.delete(next);
  }

  if (waiting.size > 0) {
    result.ok = false;
    result.order = [];
    result.cycle = findCycle(waiting, compare);
    result.message = `Dependency cycle: ${result.cycle.map((n) => `#${n}`).join(' → ')}. `
      + 'No member can start first; fix a **Depends on:** line in one of them.';
  }
  return result;
}

/**
 * Walk dependency edges among the members left after the sort, starting from
 * the best-ranked one and always following the best-ranked dependency, until
 * a member repeats. Every leftover member waits on another leftover member,
 * so the walk always closes.
 */
function findCycle(waiting, compare) {
  const start = [...waiting.keys()].sort(compare)[0];
  const path = [];
  let current = start;
  while (!path.includes(current)) {
    path.push(current);
    current = [...waiting.get(current)].sort(compare)[0];
  }
  return [...path.slice(path.indexOf(current)), current];
}

module.exports = {
  topoOrder,
};
