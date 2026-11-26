// Rubrical Works (c) 2026
/**
 * @framework-script 0.123.0
 * concurrency-plan.js — Disjointness over declared scope, and the
 * `--concurrent` grouping plan (#3126, PRD Concurrent-Work Story 1.9)
 *
 * `--concurrent` may run only sub-issues that PROVABLY cannot collide at
 * once, and the only proof the framework has is each member's declared
 * scope — the `Files to modify:` block `parseDeclaredScope` reads for the
 * Step 4c drift gate. So a member falls to the sequential TAIL when:
 *   - its scope is UNDECLARED (no `Files to modify:`, or one with no
 *     backticked path) — nothing can be proved about it;
 *   - the protected-path list (`scope-drift-protected-paths.json`) is
 *     UNREADABLE (#3266) — no contest can be ruled out, so every member tails.
 * Two members whose scopes OVERLAP — the same path, or a glob on one side
 * covering a path on the other — are not tailed (#3287): groups merge back
 * one after another, so the later member is DEFERRED to a later group. A
 * PROTECTED-PATH CONTEST — both members declare a path matching the same
 * always-protected pattern, even different files — is a separation
 * constraint of the same kind (#3875): the two are placed in DIFFERENT
 * groups, never tailed, so protected files still change one member at a
 * time, each merged back before the next starts. Each contested member's
 * reason names the pattern, the member it is kept apart from and the
 * protected-paths file. An uncontested protected path is an ordinary path:
 * parent-owned edits to protected files (Step 4e's registrar, reconcile's
 * regeneration) run on the tracker after merge-back, never in a member
 * worktree. Within each dependency layer members are placed greedily in
 * Processing Order: a member joins the first group of its layer that is
 * under `maxAgents` (`--agents N`, default 3) and holds none of the members
 * it is separated from, opening a new group when none is. A plan with ZERO
 * groups is the sequential run, reported as such rather than silently
 * equivalent.
 *
 * With the `**Depends on:**` graph (#3128), groups are topological LAYERS
 * intersected with that disjointness: a member joins a group only after
 * every dependency's group has merged back, and the cap splits each layer.
 * A member whose dependency cannot be met by a group — unreadable, a skipped
 * `qa-required` member, or a tail member — goes to the tail too.
 *
 * Generated and accumulator files are invisible to this check by design —
 * that is Phase 1's job (merge driver, regeneration): every path declared in
 * framework-config.json `concurrency` `accumulators[].path` or
 * `derivedArtifacts[].paths` is dropped from a member's scope before the
 * protected and overlap checks (#3287), read through derived-artifacts.js.
 * Real overlap is still caught on their inputs. Tokens that cannot be
 * a path (no slash, no dot — `concurrency`, `windows-latest`) are ignored
 * so a stray backticked word never fabricates an overlap — unless the word
 * is a conventional extensionless filename (`Makefile`) or names a file or
 * directory in the checkout (#3239).
 *
 * Pure over its inputs: members carry their bodies, the protected patterns
 * are injectable (loaded from the drift gate's metadata by default), and
 * nothing here touches gh or writes anything. The reads are the on-disk
 * check for a bare word, injectable as `exists`, and the concurrency block,
 * injectable as `concurrency`.
 */

const { parseDeclaredScope, matchesAny } = require('../scope-drift-check.js');

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
 * `layer` (#3568) is the label of the first layer that registers it, or
 * null, so the decision is reportable rather than inferred from silence.
 *
 * @param {{layers: Array<{label: string, path: string}>, readFile: function(string): string}} input
 * @returns {{registered: boolean, layer: string|null, warnings: Array<{code: string, message: string}>}}
 */
function resolveWorktreeHook({ layers = [], readFile } = {}) {
  const warnings = [];
  let registered = false;
  let registeringLayer = null;
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
    if (settingsRegisterWorktreeHook(settings)) {
      registered = true;
      if (registeringLayer === null) registeringLayer = layer.label;
    }
  }
  return { registered, layer: registeringLayer, warnings };
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

/**
 * Conventional root files that carry no extension (#3239). Without a slash
 * or a dot they would read as stray words, so two members sharing a
 * `Makefile` were never seen to overlap.
 */
const EXTENSIONLESS_FILENAMES = new Set([
  'Makefile', 'GNUmakefile', 'Dockerfile', 'Containerfile', 'Jenkinsfile', 'Vagrantfile',
  'Gemfile', 'Rakefile', 'Procfile', 'Brewfile', 'Podfile', 'Pipfile', 'Justfile', 'Caddyfile',
  'LICENSE', 'NOTICE', 'AUTHORS', 'CODEOWNERS',
]);

/** A bare identifier — the only shape the on-disk check is asked about. */
const BARE_TOKEN = /^[A-Za-z0-9_-]+$/;

/** Whether `token` names a file or directory under the project root (the preamble's cwd). */
function existsInCheckout(token) {
  try {
    return require('fs').existsSync(require('path').resolve(process.cwd(), token));
  } catch (_) {
    return false;
  }
}

/**
 * A backticked token that could be a path: carries a slash or a dot, is a
 * conventional extensionless filename, or — a bare word — names a file or
 * directory in the checkout (#3239). `exists` is injectable so tests stay off
 * disk; a stray word that names nothing (`concurrency`) is still ignored.
 */
function isPathLike(token, exists = existsInCheckout) {
  if (token.includes('/') || token.includes('.')) return true;
  if (EXTENSIONLESS_FILENAMES.has(token)) return true;
  return BARE_TOKEN.test(token) && typeof exists === 'function' && exists(token) === true;
}

/**
 * The authored declared scope of a member body, normalized and path-like.
 * Only the human-written `Files to modify:` counts — a `### Files Changed`
 * history is a record of what a run did, not a claim about what it will do.
 */
function declaredScopeOf(body, exists) {
  const parsed = parseDeclaredScope(body);
  const authored = parsed.source === 'files-to-modify' ? (parsed.authoredPaths || []) : [];
  return [...new Set(authored.map(normalizePath).filter((t) => isPathLike(t, exists)))];
}

const WILDCARD = /[*?[{]/;

/** The directory part of a glob before its first wildcard (`src/a/*.js` → `src/a/`). */
function literalPrefix(glob) {
  const wild = glob.search(WILDCARD);
  return wild === -1 ? glob : glob.slice(0, glob.lastIndexOf('/', wild) + 1);
}

/**
 * Could two globs name a common file (#3301)? Treated as overlapping unless
 * provably disjoint — their literal prefixes diverge, so neither lies under
 * the other. `src/a/*.js` and `src/*\/x.js` overlap; `src/**` and `docs/**`
 * do not. Over-inclusive on purpose: a missed overlap merges two edits.
 */
function globsMayOverlap(a, b) {
  const pa = literalPrefix(a);
  const pb = literalPrefix(b);
  return pa.startsWith(pb) || pb.startsWith(pa);
}

/**
 * Does a declared path (literal or glob) reach a file `pattern` matches? A
 * declared glob against a literal pattern goes through globCovers (#3612), so
 * a `?`, `[` or `{` glob reaches a literal under its fixed prefix.
 */
function reaches(declared, pattern) {
  if (matchesAny(declared, [pattern])) return true;
  return WILDCARD.test(declared) && (WILDCARD.test(pattern) ? globsMayOverlap(declared, pattern) : globCovers(declared, pattern));
}

/** Wildcards matchesAny cannot express: it escapes `[` and `{` and passes `?` through as a regex quantifier. */
const UNMATCHED_WILDCARD = /[?[{]/;

/**
 * Does `glob` cover `path` (#3597)? Any wildcard counts, as in reaches().
 * matchesAny decides a `*` glob; a glob using `?`, `[` or `{` is treated as
 * covering any path under its literal prefix — over-inclusive on purpose,
 * like globsMayOverlap: a missed overlap merges two edits.
 */
function globCovers(glob, path) {
  if (!WILDCARD.test(glob)) return false;
  return matchesAny(path, [glob]) || (UNMATCHED_WILDCARD.test(glob) && globsMayOverlap(glob, path));
}

/** Paths two scopes share: equal, a glob on one side covering the other, or two globs that may meet. */
function sharedPaths(a, b) {
  const shared = new Set();
  for (const pa of a) {
    for (const pb of b) {
      if (pa === pb) shared.add(pa);
      else if (globCovers(pa, pb)) shared.add(pb);
      else if (globCovers(pb, pa)) shared.add(pa);
      else if (WILDCARD.test(pa) && WILDCARD.test(pb) && globsMayOverlap(pa, pb)) {
        shared.add(pa);
        shared.add(pb);
      }
    }
  }
  return [...shared].sort();
}

/**
 * The drift gate's protected patterns, as strings — or null when the file is
 * unreadable (#3266). Loaded by require, not fs, so it resolves beside this
 * script wherever the hub links it. A null fails CLOSED in classifyMembers:
 * every member goes to the tail, since without the list nothing can be shown
 * safe to run at once. loadProtectedPaths stays the drift gate's own reader.
 */
function defaultProtectedPatterns() {
  let data;
  try {
    data = require('../../../metadata/scope-drift-protected-paths.json');
  } catch (_e) {
    return null;
  }
  if (!data || !Array.isArray(data.paths)) return null;
  return data.paths
    .map((p) => (p && typeof p.pattern === 'string' ? p.pattern : null))
    .filter(Boolean);
}

/**
 * The project's declared concurrency block (#3287), read through
 * derived-artifacts.js — the one read path #3326 also gave
 * review-interdependence.js. Absent, unreadable or rejected yields empty
 * kinds, so nothing is excluded and the check stays as strict as before.
 */
function defaultConcurrency() {
  try {
    return require('./derived-artifacts.js').loadConcurrency(process.cwd());
  } catch (_e) {
    return { accumulators: [], derivedArtifacts: [] };
  }
}

/**
 * Which declared paths are invisible to the overlap check (#3287): declared
 * `accumulators[].path` (merged by the json-merge driver) and
 * `derivedArtifacts[].paths` globs (regenerated by the parent after
 * merge-back). Real overlap is still caught on their inputs. A bare filename
 * naming an accumulator or a literal derived path counts too, as it does in
 * review-interdependence.js. `recomputed` paths are deliberately NOT here —
 * CHARTER.md stays under the protected rule.
 *
 * @returns {function(string): boolean}
 */
function declaredConcurrencyMatcher(concurrency) {
  const { matchesAnyGlob } = require('./derived-artifacts.js');
  const c = concurrency || {};
  const accumulators = (Array.isArray(c.accumulators) ? c.accumulators : [])
    .map((a) => (a && typeof a.path === 'string' ? normalizePath(a.path) : null)).filter(Boolean);
  const globs = (Array.isArray(c.derivedArtifacts) ? c.derivedArtifacts : [])
    .flatMap((d) => (d && Array.isArray(d.paths) ? d.paths : [])).filter((g) => typeof g === 'string').map(normalizePath);
  const literals = [...accumulators, ...globs.filter((g) => !g.includes('*'))];
  const all = [...accumulators, ...globs];
  if (all.length === 0) return () => false;
  return (p) => matchesAnyGlob(p, all)
    || (!p.includes('/') && literals.some((l) => l.endsWith(`/${p}`)));
}

/**
 * Classify members as eligible for a concurrent group or bound for the tail.
 *
 * @param {{members: Array<{number: number, title?: string, body?: string}>,
 *   protectedPatterns?: string[], concurrency?: {accumulators?: object[],
 *   derivedArtifacts?: object[]}}} input
 *   `concurrency` is the shape `loadConcurrency` returns; omitted, it is read
 *   from framework-config.json in the project root.
 * @returns {Array<{number: number, title: string, scope: string[],
 *   excluded: string[], disposition: 'eligible'|'tail',
 *   cause: 'undeclared'|'protected'|null, reason: string|null,
 *   overlaps: Array<{number: number, paths: string[]}>,
 *   contests: Array<{number: number, pattern: string, paths: string[], otherPaths: string[]}>}>}
 *   In input order. `scope` is the declared scope; `excluded` the part of it
 *   that is a declared accumulator or derived artifact, which neither the
 *   protected nor the overlap check sees (#3287). `overlaps` lists every
 *   member sharing a path, whatever either one's disposition; an overlap
 *   alone never tails a member (#3287) — buildPlan defers one side to a
 *   later group instead. `contests` lists, on both sides, every member
 *   declaring a path that matches the same always-protected pattern (#3875):
 *   `paths` are this member's matching paths, `otherPaths` the other's. A
 *   contest never tails a member either — buildPlan keeps the two apart.
 *   `cause: 'protected'` now means only an unreadable protected list (#3266).
 */
function classifyMembers({ members = [], protectedPatterns, exists, concurrency } = {}) {
  const patterns = Array.isArray(protectedPatterns) ? protectedPatterns : defaultProtectedPatterns();
  const isDeclared = declaredConcurrencyMatcher(concurrency === undefined ? defaultConcurrency() : concurrency);
  const infos = members.map((m) => {
    const scope = declaredScopeOf(m.body, exists);
    return {
      number: m.number,
      title: m.title || '',
      scope,
      excluded: scope.filter(isDeclared),
      disposition: 'eligible',
      cause: null,
      reason: null,
      overlaps: [],
      contests: [],
    };
  });
  // The scope the protected and overlap checks compare.
  const compared = new Map(infos.map((i) => [i.number, i.scope.filter((p) => !i.excluded.includes(p))]));

  for (const info of infos) {
    if (info.scope.length === 0) {
      info.disposition = 'tail';
      info.cause = 'undeclared';
      info.reason = 'no declared scope — `Files to modify:` is absent or names no backticked path';
      continue;
    }
    // #3266: no readable protected list, so nothing can be shown safe.
    if (patterns === null) {
      info.disposition = 'tail';
      info.cause = 'protected';
      info.reason = `the protected-path list (${PROTECTED_PATHS_FILE}) is unreadable, so no member can be shown safe to run concurrently`;
      continue;
    }
  }

  // #3287: a protected path matters only when CONTESTED — another member
  // declares a path matching the same protected pattern. Uncontested, it is an
  // ordinary path for the overlap check. #3875: a contest SEPARATES the two
  // members into different groups, as an overlap does; it no longer tails them.
  const protectedHits = new Map();
  if (patterns !== null) {
    for (const info of infos) {
      if (info.cause === 'undeclared') continue;
      const byPattern = new Map();
      for (const pattern of patterns) {
        // A declared glob wider than the pattern (`.claude/**` against
        // `.claude/metadata/**`) reaches it too (#3301).
        const hits = compared.get(info.number).filter((p) => reaches(p, pattern));
        if (hits.length > 0) byPattern.set(pattern, hits);
      }
      protectedHits.set(info.number, byPattern);
    }
  }
  for (const info of infos) {
    const own = protectedHits.get(info.number);
    if (!own || own.size === 0) continue;
    for (const [pattern, hits] of own) {
      const others = infos.filter((o) => o !== info && protectedHits.has(o.number) && protectedHits.get(o.number).has(pattern));
      for (const o of others) {
        info.contests.push({ number: o.number, pattern, paths: hits, otherPaths: protectedHits.get(o.number).get(pattern) });
      }
    }
    // The plan says why the two never share a group; protected files still
    // change one member at a time, each merged back before the next starts.
    if (info.contests.length > 0) {
      const apart = [...new Set(info.contests.map((k) => `#${k.number}`))];
      const named = info.contests.map((k) => `${k.paths.join(', ')} matching ${k.pattern}, which #${k.number} (${k.otherPaths.join(', ')}) also declares`);
      info.reason = `kept apart from ${apart.join(', ')} in a different group — protected-path contest: declares always-protected path(s) ${named.join('; ')} (${PROTECTED_PATHS_FILE})`;
    }
  }

  for (let i = 0; i < infos.length; i++) {
    for (let j = i + 1; j < infos.length; j++) {
      const shared = sharedPaths(compared.get(infos[i].number), compared.get(infos[j].number));
      if (shared.length === 0) continue;
      infos[i].overlaps.push({ number: infos[j].number, paths: shared });
      infos[j].overlaps.push({ number: infos[i].number, paths: shared });
    }
  }
  return infos;
}

/**
 * Intersect the dependency graph (#3128) with the disjointness verdicts.
 *
 * A member enters a group only once everything it depends on has merged
 * back, so each eligible member gets a LAYER one past its deepest
 * dependency, and groups never mix layers. Processing Order is user-editable
 * and so is NOT assumed topological (#3238): members are decided in a
 * topological pass over the in-plan edges (Kahn's algorithm, ties broken by
 * Processing Order), so every dependency is decided before its dependent.
 * Three more tail causes:
 *   - `unresolved-dependency`: a Depends on entry nobody can read — never
 *     treated as satisfied, so the member cannot be scheduled into a group —
 *     or a dependency cycle (#3238), whose members all get this cause and a
 *     reason naming the cycle; members merely behind a cycle get `dependency`;
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

  const depsOf = (n) => (edges[n] || []).filter((d) => byNumber.has(d));
  const decided = new Set();
  const decisionOrder = [];
  const decideReady = () => {
    for (let progress = true; progress;) {
      progress = false;
      for (const c of ordered) {
        if (decided.has(c.number) || !depsOf(c.number).every((d) => decided.has(d))) continue;
        decided.add(c.number);
        decisionOrder.push(c);
        progress = true;
      }
    }
  };
  decideReady();

  // Whatever Kahn could not decide sits on or behind a cycle. A member is ON
  // one when it can reach itself; its cycle is the members it reaches that
  // reach it back. Those go to the tail; the members merely behind a cycle are
  // then decided normally and fall to the tail as `dependency`.
  const undecided = ordered.filter((c) => !decided.has(c.number)).map((c) => c.number);
  const reachableFrom = (start) => {
    const seen = new Set();
    const stack = [...depsOf(start)];
    while (stack.length > 0) {
      const n = stack.pop();
      if (seen.has(n) || decided.has(n)) continue;
      seen.add(n);
      stack.push(...depsOf(n));
    }
    return seen;
  };
  const reach = new Map(undecided.map((n) => [n, reachableFrom(n)]));
  const onCycle = undecided.filter((n) => reach.get(n).has(n));
  for (const n of onCycle) {
    const cycle = onCycle.filter((m) => reach.get(n).has(m) && reach.get(m).has(n));
    toTail(byNumber.get(n), 'unresolved-dependency', `dependency cycle among ${cycle.map((m) => `#${m}`).join(', ')}`
      + ' — no member of it can merge back first, so none is scheduled into a group');
  }
  for (const n of onCycle) {
    decided.add(n);
    decisionOrder.push(byNumber.get(n));
  }
  decideReady();

  for (const c of decisionOrder) {
    if (invalid[c.number]) {
      toTail(c, 'unresolved-dependency', `unreadable Depends on entr${invalid[c.number].length === 1 ? 'y' : 'ies'} `
        + `${invalid[c.number].map((i) => `${JSON.stringify(i.entry)} (${i.reason})`).join(', ')} — never treated as satisfied`);
    }
    if (blockedBy[c.number]) {
      toTail(c, 'qa-dependency', `depends on skipped qa-required ${blockedBy[c.number].map((n) => `#${n}`).join(', ')}, which this run never works`);
    }
    const deps = depsOf(c.number);
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

/**
 * The members `c` must never share a group with, each with the paths that
 * keep them apart: every overlap (#3287) and every protected-path contest
 * (#3875), merged per member. A contest contributes both sides' protected
 * paths and names its pattern under `patterns`.
 *
 * @returns {Array<{number: number, paths: string[], patterns?: string[]}>}
 */
function separationsOf(c) {
  const byNumber = new Map();
  const entry = (n) => {
    if (!byNumber.has(n)) byNumber.set(n, { number: n, paths: new Set(), patterns: new Set() });
    return byNumber.get(n);
  };
  for (const o of c.overlaps) o.paths.forEach((p) => entry(o.number).paths.add(p));
  for (const k of c.contests || []) {
    const e = entry(k.number);
    [...k.paths, ...k.otherPaths].forEach((p) => e.paths.add(p));
    e.patterns.add(k.pattern);
  }
  return [...byNumber.values()].map((e) => ({
    number: e.number,
    paths: [...e.paths].sort(),
    ...(e.patterns.size > 0 ? { patterns: [...e.patterns] } : {}),
  }));
}

/**
 * Place one dependency layer's members into groups (#3287). Greedy in the
 * given order: a member joins the first group under `cap` holding none of
 * the members it is separated from — an overlap (#3287) or a protected-path
 * contest (#3875) — else opens a new one. Disjoint members therefore chunk
 * exactly as before; a separated member lands in a later group.
 *
 * @param {object[]} layerMembers - classified infos, in Processing Order
 * @param {number} cap
 * @returns {number[][]}
 */
function placeLayer(layerMembers, cap) {
  const groups = [];
  for (const c of layerMembers) {
    const clashes = new Set(separationsOf(c).map((o) => o.number));
    let g = groups.find((grp) => grp.length < cap && !grp.some((n) => clashes.has(n)));
    if (!g) {
      g = [];
      groups.push(g);
    }
    g.push(c.number);
  }
  return groups;
}

/**
 * Rolling-schedule layers (#3274) from in-plan dependencies that include the
 * overlap deferrals (#3287): each member sits one past its deepest
 * dependency, so a deferred member follows the member it waits behind.
 * Processing Order within a layer. `dependsOn` only points at earlier groups,
 * so it is acyclic.
 */
function scheduleLayers(eligibleInOrder, dependsOn) {
  const depth = new Map();
  const depthOf = (n) => {
    if (depth.has(n)) return depth.get(n);
    const d = (dependsOn[n] || []).reduce((max, m) => Math.max(max, depthOf(m) + 1), 0);
    depth.set(n, d);
    return d;
  };
  const out = [];
  for (const n of eligibleInOrder) {
    const d = depthOf(n);
    while (out.length <= d) out.push([]);
    out[d].push(n);
  }
  return out.filter((l) => l.length > 0);
}

/**
 * Build the concurrency plan for a set of active members.
 *
 * @param {{members?: object[], processingOrder?: number[], maxAgents?: number,
 *   source?: string, protectedPatterns?: string[],
 *   dependencies?: {edges?: object, blockedBy?: object, invalid?: object}}} input
 *   `dependencies` is the preamble's `dependencyGraph` (#3128); omitted, every
 *   eligible member is in one layer and the plan is the #3126 plan.
 *   `resume.merged` (#3264, from classifyResume) names members a resumed run
 *   found already merged on the tracker: they leave the plan for `finishOnly`.
 * @returns {{maxAgents: number, source: 'default'|'flag', groups: number[][],
 *   layers: number[][], dependsOn: Object<number, number[]>,
 *   tail: Array<{number: number, cause: string, reason: string}>,
 *   members: object[], finishOnly: number[], noGroupReason: string|null}}
 *   `layers` are the uncapped schedule layers and `dependsOn` each eligible
 *   member's in-plan dependencies — the --nonstop rolling schedule (#3274).
 *   `dependsOn` also names every overlapping member placed in an earlier
 *   group (#3287), so the rolling schedule never runs an overlapping pair at
 *   once; `deferred` lists those members with the paths they wait on.
 *   Groups are dependency layers, in layer order, each packed greedily by the
 *   cap and by disjointness in Processing Order — which is also the
 *   merge-back order within a group.
 *   The tail follows Processing Order; members absent from it are appended
 *   in input order. `noGroupReason` is set only when there is no group, and
 *   says why.
 */
function buildPlan({ members: allMembers = [], processingOrder = [], maxAgents, source, protectedPatterns, dependencies, worktreeHookRegistered, exists, resume } = {}) {
  const cap = maxAgents === undefined ? DEFAULT_MAX_AGENTS : maxAgents;
  const capSource = maxAgents === undefined ? 'default' : (source || 'flag');
  // #3264: a member already merged on the tracker (a resumed run) is never
  // planned again — it is finished, not re-spawned. Out of the member set, a
  // dependency on it counts as met, as an in_review member's does.
  const finishOnly = (resume && Array.isArray(resume.merged) ? resume.merged : []).filter((n) => allMembers.some((m) => m.number === n));
  // A member with a worktree kept from an earlier run is held, not
  // re-spawned: that worktree may hold the user's fixes. It has not merged,
  // so whatever depends on it is held too (transitively), never run early.
  const held = (resume && Array.isArray(resume.kept) ? resume.kept : []).filter((k) => allMembers.some((m) => m.number === k.issue) && !finishOnly.includes(k.issue));
  const heldSet = new Set(held.map((k) => k.issue));
  const edgesOf = (dependencies && dependencies.edges) || {};
  const heldBehind = [];
  for (let grew = true; grew;) {
    grew = false;
    for (const m of allMembers) {
      if (heldSet.has(m.number) || finishOnly.includes(m.number)) continue;
      if ((edgesOf[m.number] || []).some((d) => heldSet.has(d))) { heldSet.add(m.number); heldBehind.push(m.number); grew = true; }
    }
  }
  const members = allMembers.filter((m) => !finishOnly.includes(m.number) && !heldSet.has(m.number));

  const classified = classifyMembers({ members, protectedPatterns, exists });
  const known = new Set(classified.map((c) => c.number));
  const order = [
    ...processingOrder.filter((n) => known.has(n)),
    ...classified.map((c) => c.number).filter((n) => !processingOrder.includes(n)),
  ];
  const ordered = order.map((n) => classified.find((c) => c.number === n));

  const layerOf = applyDependencies(ordered, dependencies);
  const groups = [];
  // Groups for default mode: each dependency layer packed by the cap and by
  // disjointness (#3287), layers in order, so a dependent always follows the
  // group of everything it depends on — deferred or not.
  const eligibleInfos = ordered.filter((c) => c.disposition === 'eligible');
  const layerIds = [...new Set(eligibleInfos.map((c) => layerOf.get(c.number)))].sort((a, b) => a - b);
  for (const layer of layerIds) {
    groups.push(...placeLayer(eligibleInfos.filter((c) => layerOf.get(c.number) === layer), cap));
  }
  const groupOf = new Map();
  groups.forEach((g, i) => g.forEach((n) => groupOf.set(n, i)));
  const eligible = new Set(eligibleInfos.map((c) => c.number));
  const edges = (dependencies && dependencies.edges) || {};
  // The rolling schedule (#3274) has no groups, only these edges: a deferral
  // — an overlap (#3287) or a protected-path contest (#3875) — becomes a
  // dependency on each separated member placed earlier.
  const dependsOn = {};
  const deferred = [];
  for (const c of eligibleInfos) {
    const behind = separationsOf(c).filter((o) => eligible.has(o.number) && groupOf.get(o.number) < groupOf.get(c.number));
    const declared = (edges[c.number] || []).filter((d) => eligible.has(d));
    dependsOn[c.number] = [...new Set([...declared, ...behind.map((o) => o.number)])];
    if (behind.length > 0) deferred.push({ number: c.number, behind });
  }
  const layers = scheduleLayers(eligibleInfos.map((c) => c.number), dependsOn);
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
    return { maxAgents: cap, source: capSource, groups: [], layers: [], dependsOn: {}, deferred: [], tail: fallback, members: ordered, finishOnly, held, heldBehind, noGroupReason: WORKTREE_HOOK_MISSING_REASON };
  }

  let noGroupReason = null;
  if (members.length === 0) {
    noGroupReason = finishOnly.length ? 'every active member is already merged on the tracker — each is finished, not re-run' : 'no active members — nothing to run concurrently';
  } else if (groups.length === 0) {
    noGroupReason = 'every member fell to the sequential tail, so the run proceeds as sequential --nonstop: '
      + tail.map((t) => `#${t.number} (${t.cause}: ${t.reason})`).join('; ');
  }

  return { maxAgents: cap, source: capSource, groups, layers, dependsOn, deferred, tail, members: ordered, finishOnly, held, heldBehind, noGroupReason };
}

/**
 * Which members of a resumed run are already merged on the tracker (#3264).
 * `logs[N]` is what the preamble read from the tracker: the Refs #N commits
 * reachable from it (`all`) and those on its first-parent line. A member
 * worktree's commits reach the tracker only through a merge, so one that is
 * reachable but not first-parent was merged back; a member worked in the
 * root (the sequential tail) commits on the first-parent line and is not
 * merged by this test. Pure.
 *
 * @param {{members: number[], logs: Object<number, {all: string[], firstParent: string[]}>}} input
 * @returns {{merged: number[]}}
 */
function classifyResume({ members = [], logs = {} } = {}) {
  const merged = members.filter((n) => {
    const log = logs[n] || {};
    const fp = new Set(log.firstParent || []);
    return (log.all || []).some((sha) => !fp.has(sha));
  });
  return { merged };
}

/**
 * `git worktree list --porcelain` as `{worktreePath, branch}` records
 * (#3264). A detached worktree has `branch: null`. Pure.
 *
 * @param {string} text
 * @returns {Array<{worktreePath: string, branch: string|null}>}
 */
function parseWorktreeList(text) {
  return String(text || '').replace(/\r\n/g, '\n').split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split('\n');
      const wt = lines.find((l) => l.startsWith('worktree '));
      if (!wt) return null;
      const br = lines.find((l) => l.startsWith('branch '));
      return { worktreePath: wt.slice('worktree '.length).trim(), branch: br ? br.slice('branch '.length).trim().replace(/^refs\/heads\//, '') : null };
    })
    .filter(Boolean);
}

/**
 * One worktree path in comparable form (#3718): backslashes to `/`, any
 * trailing slash stripped, lower-cased, so the separators and drive-letter
 * case git and the harness report never decide a match. Pure.
 *
 * @param {string|null|undefined} p
 * @returns {string}
 */
function normalizeWorktreePath(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/**
 * The run-ledger entry recorded for a worktree (#3718), matched by branch or
 * by normalized path; `null` when none names it. Pure.
 *
 * @param {Array<{issue: number, branch: string, worktreePath: string}>|null} entries
 * @param {{branch: string|null, worktreePath: string}} worktree
 * @returns {object|null}
 */
function ledgerEntryFor(entries, worktree) {
  const w = worktree || {};
  const target = normalizeWorktreePath(w.worktreePath);
  return (Array.isArray(entries) ? entries : []).find((x) => x.branch === w.branch || normalizeWorktreePath(x.worktreePath) === target) || null;
}

/**
 * Which `wt/*` worktrees a resumed run finds, matched to members through the
 * run ledger the parent wrote at each spawn (#3264). Branches are harness-
 * named, so the ledger is the only map back to an issue. A worktree the
 * ledger names for an active member is `kept`; one it does not name — or
 * every one, when the ledger is gone (the startup sweep removes `.tmp-*`
 * after a day) — is `unmatched`, listed, never skipped. Pure.
 *
 * @param {{worktrees: Array<{worktreePath: string, branch: string|null}>,
 *   ledger: {members?: Array<{issue: number, branch: string, worktreePath: string}>}|null,
 *   members: number[]}} input
 * @returns {{kept: object[], unmatched: object[], ledgerFound: boolean}}
 */
function matchKeptWorktrees({ worktrees = [], ledger = null, members = [] } = {}) {
  const entries = (ledger && Array.isArray(ledger.members)) ? ledger.members : [];
  const kept = [];
  const unmatched = [];
  for (const w of worktrees) {
    if (!w.branch || !w.branch.startsWith('wt/')) continue;
    const e = ledgerEntryFor(entries, w);
    if (!e) unmatched.push({ branch: w.branch, worktreePath: w.worktreePath });
    else if (members.includes(e.issue)) kept.push({ issue: e.issue, branch: w.branch, worktreePath: w.worktreePath });
  }
  return { kept, unmatched, ledgerFound: !!ledger };
}

/** A framework member worktree: a `.tmp-wt-*` directory on a `wt/*` branch. */
function isFrameworkWorktree(w) {
  if (!w || !w.branch || !w.branch.startsWith('wt/')) return false;
  const base = String(w.worktreePath || '').replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop();
  return base.startsWith('.tmp-wt-');
}

/**
 * Which framework worktrees hold nothing and may be offered for teardown
 * (#3714). A cancelled run leaves worktrees no ledger records; a denied
 * teardown leaves merged members the ledger does. Both are reclaimable when
 * the branch is fully on the tracker (`merged`: its HEAD is an ancestor of
 * the tracker tip — an empty worktree at the tip qualifies) AND the tree is
 * clean, uncommitted and untracked files included. A worktree with commits
 * off the tracker or a dirty tree — a held member of a halted run among them —
 * is never offered; neither is one whose state could not be read. Pure: the
 * caller reads `states` (keyed by worktree path) from git.
 *
 * @param {{worktrees: Array<{worktreePath: string, branch: string|null}>,
 *   ledger: {members?: Array<{issue: number, branch: string, worktreePath: string}>}|null,
 *   states: Object<string, {merged: boolean, clean: boolean}>}} input
 * @returns {{reclaimable: Array<{branch: string, worktreePath: string, issue: number|null, recorded: boolean}>,
 *   notReclaimable: Array<{branch: string, worktreePath: string}>}}
 */
function classifyReclaim({ worktrees = [], ledger = null, states = {} } = {}) {
  const stateOf = new Map(Object.entries(states || {}).map(([k, v]) => [normalizeWorktreePath(k), v]));
  const entries = (ledger && Array.isArray(ledger.members)) ? ledger.members : [];
  const reclaimable = [];
  const notReclaimable = [];
  for (const w of worktrees) {
    if (!isFrameworkWorktree(w)) continue;
    const s = stateOf.get(normalizeWorktreePath(w.worktreePath));
    if (!s || s.merged !== true || s.clean !== true) {
      notReclaimable.push({ branch: w.branch, worktreePath: w.worktreePath });
      continue;
    }
    const e = ledgerEntryFor(entries, w);
    reclaimable.push({ branch: w.branch, worktreePath: w.worktreePath, issue: e ? e.issue : null, recorded: !!e });
  }
  return { reclaimable, notReclaimable };
}

module.exports = {
  DEFAULT_MAX_AGENTS,
  PROTECTED_PATHS_FILE,
  parseAgentsValue,
  declaredScopeOf,
  classifyMembers,
  buildPlan,
  classifyResume,
  parseWorktreeList,
  normalizeWorktreePath,
  ledgerEntryFor,
  matchKeptWorktrees,
  isFrameworkWorktree,
  classifyReclaim,
  WORKTREE_HOOK_SCRIPT,
  settingsRegisterWorktreeHook,
  resolveWorktreeHook,
};
