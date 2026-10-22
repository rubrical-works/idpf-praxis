// Rubrical Works (c) 2026
/**
 * @framework-script 0.110.0
 * concurrency-plan.js — Disjointness over declared scope, and the
 * `--concurrent` grouping plan (#3126, PRD Concurrent-Work Story 1.9)
 *
 * `--concurrent` may run only sub-issues that PROVABLY cannot collide at
 * once, and the only proof the framework has is each member's declared
 * scope — the `Files to modify:` block `parseDeclaredScope` reads for the
 * Step 4c drift gate. So a member falls to the sequential TAIL when:
 *   - its scope is UNDECLARED (no `Files to modify:`, or one with no
 *     backticked path) — nothing can be proved about it;
 *   - it OVERLAPS another member's scope — the same path, or a glob on one
 *     side covering a path on the other; both members go to the tail, each
 *     naming the other and the shared paths;
 *   - it names an ALWAYS-PROTECTED path (`scope-drift-protected-paths.json`)
 *     — a merge of two such edits is exactly what the drift gate halts on,
 *     so it is kept sequential; the reason names that file.
 * Everything else is chunked in Processing Order into consecutive groups of
 * at most `maxAgents` (`--agents N`, default 3). A plan with ZERO groups is
 * the sequential run, reported as such rather than silently equivalent.
 *
 * With the `**Depends on:**` graph (#3128), groups are topological LAYERS
 * intersected with that disjointness: a member joins a group only after
 * every dependency's group has merged back, and the cap splits each layer.
 * A member whose dependency cannot be met by a group — unreadable, a skipped
 * `qa-required` member, or a tail member — goes to the tail too.
 *
 * Generated and accumulator files are invisible to this check by design —
 * that is Phase 1's job (merge driver, regeneration). Tokens that cannot be
 * a path (no slash, no dot — `concurrency`, `windows-latest`) are ignored
 * so a stray backticked word never fabricates an overlap.
 *
 * Pure over its inputs: members carry their bodies, the protected patterns
 * are injectable (loaded from the drift gate's metadata by default), and
 * nothing here touches gh or writes anything.
 */

const { parseDeclaredScope, matchesAny, loadProtectedPaths } = require('../scope-drift-check.js');

/** The cap when `--agents` is not given. */
const DEFAULT_MAX_AGENTS = 3;

/** Named in every protected-path reason, so a reader knows where the pattern came from. */
const PROTECTED_PATHS_FILE = '.claude/metadata/scope-drift-protected-paths.json';

const AGENTS_RE = /^[1-9]\d*$/;

/** The hook script that makes a member's worktree branch from the caller's HEAD (#3122). */
const WORKTREE_HOOK_SCRIPT = 'worktree-create-hook.js';
// The script name as a whole path segment of a command token (#3232): preceded
// by start, a path separator, whitespace or a quote; followed by end,
// whitespace or a quote. A substring match let `old-worktree-create-hook.js`
// count as registered.
const WORKTREE_HOOK_COMMAND_PATTERN = /(^|[\\/\s"'])worktree-create-hook\.js(?=$|[\s"'])/;

/** The tail cause, and the zero-group reason, when that hook is not registered (#3224). */
const WORKTREE_HOOK_MISSING = 'worktree-hook-missing';
const WORKTREE_HOOK_SETTINGS_UNREADABLE = 'WORKTREE_HOOK_SETTINGS_UNREADABLE';
const WORKTREE_HOOK_MISSING_REASON = 'the WorktreeCreate hook is not registered — no Claude Code settings layer '
  + '(.claude/settings.json, .claude/settings.local.json, ~/.claude/settings.json) has a WorktreeCreate hook whose command names '
  + `${WORKTREE_HOOK_SCRIPT}, so a member worktree would branch from the remote default branch instead of the tracker HEAD; `
  + 'the run proceeds as sequential. Register it under hooks.WorktreeCreate in .claude/settings.json or .claude/settings.local.json.';

/**
 * Does one parsed settings object register the WorktreeCreate hook? True when
 * any `hooks.WorktreeCreate[].hooks[]` command names WORKTREE_HOOK_SCRIPT as
 * a whole path segment — the basename of a command token, not a substring.
 *
 * @param {*} settings
 * @returns {boolean}
 */
function settingsRegisterWorktreeHook(settings) {
  const matchers = settings && settings.hooks && settings.hooks.WorktreeCreate;
  if (!Array.isArray(matchers)) return false;
  return matchers.some((m) => m && Array.isArray(m.hooks) && m.hooks.some(
    (h) => h && typeof h.command === 'string' && WORKTREE_HOOK_COMMAND_PATTERN.test(h.command)));
}

/**
 * Resolve whether any Claude Code settings layer registers the WorktreeCreate
 * hook (#3224). The reader is injected, so callers decide what "disk" is.
 *
 * @param {{layers: Array<{label: string, path: string}>, readFile: function(string): string}} input
 * @returns {{registered: boolean, warnings: Array<{code: string, message: string}>}}
 */
function resolveWorktreeHook({ layers = [], readFile } = {}) {
  const warnings = [];
  let registered = false;
  for (const layer of layers) {
    let settings;
    try {
      settings = JSON.parse(readFile(layer.path));
    } catch (err) {
      // An absent layer is the normal case (most projects have no settings.json).
      if (err && err.code === 'ENOENT') continue;
      // Unreadable or malformed counts as absent, so the run fails toward
      // sequential — never toward unguarded concurrency — and says which file.
      warnings.push({
        code: WORKTREE_HOOK_SETTINGS_UNREADABLE,
        message: `${layer.label} settings ${layer.path} could not be read or parsed (${err && err.message ? err.message : String(err)}); `
          + 'treated as not registering the WorktreeCreate hook.',
      });
      continue;
    }
    if (settingsRegisterWorktreeHook(settings)) registered = true;
  }
  return { registered, warnings };
}

/**
 * Validate a raw `--agents` value.
 *
 * @param {*} raw
 * @returns {{ok: boolean, value: number|null, error: string|null}}
 *   The error names the flag and the value, so a typo is attributable.
 */
function parseAgentsValue(raw) {
  if (raw === undefined || raw === null) {
    return { ok: false, value: null, error: '--agents requires a positive integer value.' };
  }
  const s = String(raw);
  if (!AGENTS_RE.test(s)) {
    return { ok: false, value: null, error: `--agents requires a positive integer (got ${JSON.stringify(s)}).` };
  }
  return { ok: true, value: Number(s), error: null };
}

function normalizePath(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

/** A backticked token that could be a path: carries a slash or a dot. */
function isPathLike(token) {
  return token.includes('/') || token.includes('.');
}

/**
 * The authored declared scope of a member body, normalized and path-like.
 * Only the human-written `Files to modify:` counts — a `### Files Changed`
 * history is a record of what a run did, not a claim about what it will do.
 */
function declaredScopeOf(body) {
  const parsed = parseDeclaredScope(body);
  const authored = parsed.source === 'files-to-modify' ? (parsed.authoredPaths || []) : [];
  return [...new Set(authored.map(normalizePath).filter(isPathLike))];
}

/** Paths two scopes share: equal, or a glob on one side covering the other. */
function sharedPaths(a, b) {
  const shared = new Set();
  for (const pa of a) {
    for (const pb of b) {
      if (pa === pb) shared.add(pa);
      else if (pa.includes('*') && matchesAny(pb, [pa])) shared.add(pb);
      else if (pb.includes('*') && matchesAny(pa, [pb])) shared.add(pa);
    }
  }
  return [...shared].sort();
}

/** The drift gate's protected patterns, as strings. */
function defaultProtectedPatterns() {
  return loadProtectedPaths()
    .map((p) => (p && typeof p.pattern === 'string' ? p.pattern : null))
    .filter(Boolean);
}

/**
 * Classify members as eligible for a concurrent group or bound for the tail.
 *
 * @param {{members: Array<{number: number, title?: string, body?: string}>,
 *   protectedPatterns?: string[]}} input
 * @returns {Array<{number: number, title: string, scope: string[],
 *   disposition: 'eligible'|'tail', cause: 'undeclared'|'overlap'|'protected'|null,
 *   reason: string|null, overlaps: Array<{number: number, paths: string[]}>}>}
 *   In input order. A protected member keeps `protected` as its cause even
 *   when it also overlaps; its sibling's cause is `overlap`.
 */
function classifyMembers({ members = [], protectedPatterns } = {}) {
  const patterns = Array.isArray(protectedPatterns) ? protectedPatterns : defaultProtectedPatterns();
  const infos = members.map((m) => ({
    number: m.number,
    title: m.title || '',
    scope: declaredScopeOf(m.body),
    disposition: 'eligible',
    cause: null,
    reason: null,
    overlaps: [],
  }));

  for (const info of infos) {
    if (info.scope.length === 0) {
      info.disposition = 'tail';
      info.cause = 'undeclared';
      info.reason = 'no declared scope — `Files to modify:` is absent or names no backticked path';
      continue;
    }
    const hits = info.scope.filter((p) => matchesAny(p, patterns));
    if (hits.length > 0) {
      info.disposition = 'tail';
      info.cause = 'protected';
      info.reason = `declares always-protected path(s) ${hits.join(', ')} (${PROTECTED_PATHS_FILE})`;
    }
  }

  for (let i = 0; i < infos.length; i++) {
    for (let j = i + 1; j < infos.length; j++) {
      const shared = sharedPaths(infos[i].scope, infos[j].scope);
      if (shared.length === 0) continue;
      infos[i].overlaps.push({ number: infos[j].number, paths: shared });
      infos[j].overlaps.push({ number: infos[i].number, paths: shared });
    }
  }
  for (const info of infos) {
    if (info.disposition === 'eligible' && info.overlaps.length > 0) {
      info.disposition = 'tail';
      info.cause = 'overlap';
      info.reason = `scope overlaps ${info.overlaps.map((o) => `#${o.number} on ${o.paths.join(', ')}`).join('; ')}`;
    }
  }
  return infos;
}

/**
 * Intersect the dependency graph (#3128) with the disjointness verdicts.
 *
 * A member enters a group only once everything it depends on has merged
 * back, so each eligible member gets a LAYER one past its deepest
 * dependency, and groups never mix layers. Three more tail causes, set in
 * Processing Order (a topological order, so dependencies are decided first):
 *   - `unresolved-dependency`: a Depends on entry nobody can read — never
 *     treated as satisfied, so the member cannot be scheduled into a group;
 *   - `qa-dependency`: it depends on a skipped `qa-required` member this run
 *     never works;
 *   - `dependency`: it depends on a tail member, and the tail runs after
 *     every group.
 * Mutates the classified infos' disposition, cause and reason.
 *
 * @returns {Map<number, number>} member → layer (eligible members only).
 */
function applyDependencies(ordered, dependencies) {
  const edges = (dependencies && dependencies.edges) || {};
  const blockedBy = (dependencies && dependencies.blockedBy) || {};
  const invalid = (dependencies && dependencies.invalid) || {};
  const byNumber = new Map(ordered.map((c) => [c.number, c]));
  const layerOf = new Map();
  const toTail = (c, cause, reason) => {
    if (c.disposition === 'tail') return;
    c.disposition = 'tail';
    c.cause = cause;
    c.reason = reason;
  };

  for (const c of ordered) {
    if (invalid[c.number]) {
      toTail(c, 'unresolved-dependency', `unreadable Depends on entr${invalid[c.number].length === 1 ? 'y' : 'ies'} `
        + `${invalid[c.number].map((i) => `${JSON.stringify(i.entry)} (${i.reason})`).join(', ')} — never treated as satisfied`);
    }
    if (blockedBy[c.number]) {
      toTail(c, 'qa-dependency', `depends on skipped qa-required ${blockedBy[c.number].map((n) => `#${n}`).join(', ')}, which this run never works`);
    }
    const deps = (edges[c.number] || []).filter((n) => byNumber.has(n));
    const tailDeps = deps.filter((n) => byNumber.get(n).disposition === 'tail');
    if (tailDeps.length > 0) {
      toTail(c, 'dependency', `depends on ${tailDeps.map((n) => `#${n}`).join(', ')}, which run${tailDeps.length === 1 ? 's' : ''} in the sequential tail`);
    }
    if (c.disposition === 'eligible') {
      layerOf.set(c.number, deps.reduce((max, n) => Math.max(max, (layerOf.get(n) ?? -1) + 1), 0));
    }
  }
  return layerOf;
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Build the concurrency plan for a set of active members.
 *
 * @param {{members?: object[], processingOrder?: number[], maxAgents?: number,
 *   source?: string, protectedPatterns?: string[],
 *   dependencies?: {edges?: object, blockedBy?: object, invalid?: object}}} input
 *   `dependencies` is the preamble's `dependencyGraph` (#3128); omitted, every
 *   eligible member is in one layer and the plan is the #3126 plan.
 * @returns {{maxAgents: number, source: 'default'|'flag', groups: number[][],
 *   tail: Array<{number: number, cause: string, reason: string}>,
 *   members: object[], noGroupReason: string|null}}
 *   Groups are dependency layers, in layer order, each split by the cap in
 *   Processing Order — which is also the merge-back order within a group.
 *   The tail follows Processing Order; members absent from it are appended
 *   in input order. `noGroupReason` is set only when there is no group, and
 *   says why.
 */
function buildPlan({ members = [], processingOrder = [], maxAgents, source, protectedPatterns, dependencies, worktreeHookRegistered } = {}) {
  const cap = maxAgents === undefined ? DEFAULT_MAX_AGENTS : maxAgents;
  const capSource = maxAgents === undefined ? 'default' : (source || 'flag');

  const classified = classifyMembers({ members, protectedPatterns });
  const known = new Set(classified.map((c) => c.number));
  const order = [
    ...processingOrder.filter((n) => known.has(n)),
    ...classified.map((c) => c.number).filter((n) => !processingOrder.includes(n)),
  ];
  const ordered = order.map((n) => classified.find((c) => c.number === n));

  const layerOf = applyDependencies(ordered, dependencies);
  const groups = [];
  const layers = [...new Set(ordered.filter((c) => c.disposition === 'eligible').map((c) => layerOf.get(c.number)))]
    .sort((a, b) => a - b);
  for (const layer of layers) {
    const inLayer = ordered.filter((c) => c.disposition === 'eligible' && layerOf.get(c.number) === layer);
    groups.push(...chunk(inLayer.map((c) => c.number), cap));
  }
  const tail = ordered
    .filter((c) => c.disposition === 'tail')
    .map((c) => ({ number: c.number, cause: c.cause, reason: c.reason }));

  // #3224: without the WorktreeCreate hook a member's worktree would start
  // from the remote default branch, so nothing may run concurrently. Only an
  // explicit false triggers this; omitted means the caller did not resolve it.
  if (worktreeHookRegistered === false && members.length > 0) {
    const fallback = ordered.map((c) => (c.disposition === 'tail'
      ? { number: c.number, cause: c.cause, reason: c.reason }
      : { number: c.number, cause: WORKTREE_HOOK_MISSING, reason: WORKTREE_HOOK_MISSING_REASON }));
    return { maxAgents: cap, source: capSource, groups: [], tail: fallback, members: ordered, noGroupReason: WORKTREE_HOOK_MISSING_REASON };
  }

  let noGroupReason = null;
  if (members.length === 0) {
    noGroupReason = 'no active members — nothing to run concurrently';
  } else if (groups.length === 0) {
    noGroupReason = 'every member fell to the sequential tail, so the run proceeds as sequential --nonstop: '
      + tail.map((t) => `#${t.number} (${t.cause}: ${t.reason})`).join('; ');
  }

  return { maxAgents: cap, source: capSource, groups, tail, members: ordered, noGroupReason };
}

module.exports = {
  DEFAULT_MAX_AGENTS,
  PROTECTED_PATHS_FILE,
  parseAgentsValue,
  declaredScopeOf,
  classifyMembers,
  buildPlan,
  WORKTREE_HOOK_SCRIPT,
  settingsRegisterWorktreeHook,
  resolveWorktreeHook,
};
