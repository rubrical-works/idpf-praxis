// Rubrical Works (c) 2026
/**
 * @framework-script 0.117.0
 * review-repair.js — Which review findings carry a deterministic fix, decided
 * by criterion id (#3544).
 *
 * Measured over 40 issues reviewed twice, most first-review findings were a
 * missing section the review itself had already worked out — #3509 Review #1
 * wrote the exact `**Depends on:**` line and deployment classification, then
 * returned `pending`, and a resolve cycle plus a full re-review pasted them
 * in. `/review-issue` now writes such a fix before finalize, unprompted and
 * listed in the comment, and `/resolve-review` classifies by the same data.
 *
 * Keyed by criterion **id** from `.claude/metadata/review-repairs.json`, never
 * by a slug of the display name, which drifts between reviews.
 *
 * Built-ins only (runtime dependency contract, #2418).
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join('.claude', 'metadata', 'review-repairs.json');
const NON_PASS = new Set(['warn', 'fail']);

/**
 * Read the repair data. Fails soft to an empty set: no data means nothing is
 * repairable, which leaves every finding standing — never a silent repair.
 * @param {string} [root]
 */
function loadRepairs(root) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(root || process.cwd(), DATA_PATH), 'utf8'));
    return { ...parsed, repairs: parsed && typeof parsed.repairs === 'object' && parsed.repairs ? parsed.repairs : {} };
  } catch {
    return { repairs: {} };
  }
}

/** Whether this is the framework dev repo — `env: dev` entries apply only here. */
function isDevRepo(root) {
  return fs.existsSync(path.join(root || process.cwd(), 'CommandsSrc'));
}

/**
 * The data entry for a criterion id when it applies to this issue type and
 * review mode, else null. An omitted `mode` skips the mode filter
 * (`/resolve-review` reads findings from a comment that does not record it).
 *
 * @param {string} id
 * @param {{ type?: string, mode?: string, devRepo?: boolean, data?: object, root?: string }} ctx
 */
function repairEntry(id, ctx = {}) {
  const data = ctx.data || loadRepairs(ctx.root);
  const entry = id && data.repairs[id];
  if (!entry) return null;
  // #3564: an entry without array `types`/`modes` is malformed — not
  // repairable, whatever the caller supplied. Fails soft, like loadRepairs.
  if (!Array.isArray(entry.types) || !Array.isArray(entry.modes)) return null;
  if (ctx.type && !entry.types.includes(ctx.type)) return null;
  if (ctx.mode && !entry.modes.includes(ctx.mode)) return null;
  if (entry.env === 'dev') {
    const dev = typeof ctx.devRepo === 'boolean' ? ctx.devRepo : isDevRepo(ctx.root);
    if (!dev) return null;
  }
  return entry;
}

/**
 * Is this finding a pre-finalize repair? Repairable means: a warn or fail, a
 * criterion id whose entry applies here and is marked `preFinalize`, and a
 * concrete fix — the exact text or value to write. A finding whose fix cannot
 * be stated concretely is never repairable.
 *
 * @param {{ id?: string, status?: string, fix?: string }} finding
 * @param {object} ctx - see repairEntry
 * @returns {{ repairable: boolean, id: string|null, kind: string|null, reason: string|null }}
 */
function classifyRepair(finding, ctx = {}) {
  const id = finding && finding.id ? String(finding.id) : null;
  const no = (reason, kind = null) => ({ repairable: false, id, kind, reason });
  if (!finding || !NON_PASS.has(finding.status)) return no('status');
  const entry = repairEntry(id, ctx);
  if (!entry) return no('not-repairable');
  if (!entry.preFinalize) return no('not-pre-finalize', entry.kind);
  if (typeof finding.fix !== 'string' || finding.fix.trim() === '') return no('no-concrete-fix', entry.kind);
  return { repairable: true, id, kind: entry.kind, reason: null };
}

// ─── Deployment Impact derivation (kind: deployment-impact) ───

// Paths that never reach a user project — the `userProject` answers of the
// shared table in deployment-scope.js (#3565), which also records why a path
// such as CHANGELOG.md is dev-only here yet deployed for the changelog.
// Anything matched by neither this nor a deploymentFiles mapping is
// `unknown`, and one unknown path means no repair.
const { DEPLOYMENT_PATH_TABLE } = require('./deployment-scope.js');
const DEV_ONLY = DEPLOYMENT_PATH_TABLE.filter((r) => r.userProject === 'dev-only').map((r) => r.pattern);

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/** One path → `{ scope: 'deployed'|'dev-only'|'unknown', area? }`. */
function classifyDeployPath(p, manifest, minimize) {
  const d = manifest.deploymentFiles || {};
  if (DEV_ONLY.some((re) => re.test(p))) return { scope: 'dev-only' };

  // Commands: source, Stage 1 and Stage 2 outputs share a file name.
  const cmd = p.match(/^(?:CommandsSrc|\.claude\/commands|\.min-mirror\/Templates\/commands)\/([^/]+\.md)$/);
  if (cmd) {
    const entry = ((d.commands && d.commands.registry) || []).find((c) => c.file === cmd[1]);
    if (!entry) return { scope: 'unknown' };
    return entry.env === 'dev' ? { scope: 'dev-only' } : { scope: 'deployed', area: 'commands' };
  }

  // Rules: the source, its .min-mirror copies (incl. a .dev.md side-file), the dev repo's .claude/rules/ output.
  const rules = Array.isArray(d.rules) ? d.rules : [];
  const ruleHits = rules.filter((r) => {
    const mirror = `.min-mirror/${r.src}`;
    return p === r.src || p === mirror || p === mirror.replace(/\.md$/, '.dev.md') || p === `.claude/rules/${r.dest}`;
  });
  if (ruleHits.length) {
    // This repo's .claude/rules/ holds `dev` and `both` outputs, so a dest
    // shared by a dev and a deployed variant (01-…) ships only when a `both`
    // entry owns it; a source or mirror path ships when any non-dev entry does.
    const ships = p.startsWith('.claude/rules/')
      ? ruleHits.some((r) => r.env === 'both')
      : ruleHits.some((r) => r.env !== 'dev');
    return ships ? { scope: 'deployed', area: 'rules' } : { scope: 'dev-only' };
  }

  // Deployed target directories (a new file there ships once registered).
  const dirs = [
    ['.claude/scripts/shared/', 'scripts'],
    [(d.scripts && d.scripts.hooks && d.scripts.hooks.target) || '.claude/hooks/', 'hooks'],
    [(d.metadata && d.metadata.source) || '.claude/metadata/', 'metadata'],
    [(d.recipes && d.recipes.source) || '.claude/recipes/', 'recipes'],
    [(d.agents && d.agents.source) || '.claude/agents/idpf/', 'agents'],
  ];
  for (const [prefix, area] of dirs) if (p.startsWith(prefix)) return { scope: 'deployed', area };
  if (p === 'framework-manifest.json') return { scope: 'deployed', area: 'manifest' };
  if (p.startsWith('Skills/Packaged/')) return { scope: 'deployed', area: 'skills' };

  // Stage 2 documents: minimize-config.json includedDirectories, or their .min-mirror/ copy.
  if (minimize) {
    const rel = p.replace(/^\.min-mirror\//, '');
    const excluded = (minimize.excludedFiles || []).includes(rel);
    const included = (minimize.includedDirectories || []).some((dir) => rel.startsWith(`${dir}/`));
    if (included) return excluded ? { scope: 'dev-only' } : { scope: 'deployed', area: 'docs' };
  }
  return { scope: 'unknown' };
}

/**
 * Derive the Deployment Impact line from the body's `**Files to modify:**`
 * against `framework-manifest.json` `deploymentFiles` (and, for Stage 2
 * documents, `minimize-config.json`). Returns `classification: null` — no
 * repair, the finding stands — when there is no declaration, no manifest, or
 * any path cannot be classified.
 *
 * @param {string} body
 * @param {{ root?: string }} [opts]
 * @returns {{ classification: 'dev-only'|'deployed'|null, areas: string[], unknown: string[], line: string|null }}
 */
function deriveDeploymentImpact(body, opts = {}) {
  const root = opts.root || process.cwd();
  const none = (unknown = []) => ({ classification: null, areas: [], unknown, line: null });
  const { parseDeclaredScope } = require('../scope-drift-check.js');
  const paths = (parseDeclaredScope(typeof body === 'string' ? body : '').authoredPaths || []).map((p) => p.replace(/\\/g, '/').replace(/^\.\//, ''));
  if (paths.length === 0) return none();
  const manifest = readJson(path.join(root, 'framework-manifest.json'));
  if (!manifest || !manifest.deploymentFiles) return none(paths);
  const minimize = readJson(path.join(root, '.claude', 'scripts', 'framework', 'minimize-config.json'));

  const areas = new Set();
  const unknown = [];
  for (const p of paths) {
    const c = classifyDeployPath(p, manifest, minimize);
    if (c.scope === 'unknown') unknown.push(p);
    else if (c.scope === 'deployed') areas.add(c.area);
  }
  if (unknown.length) return none(unknown);
  if (areas.size === 0) return { classification: 'dev-only', areas: [], unknown: [], line: '**Deployment Impact:** dev-only' };
  const sorted = [...areas].sort();
  return { classification: 'deployed', areas: sorted, unknown: [], line: `**Deployment Impact:** deployed (${sorted.join(', ')})` };
}

module.exports = { loadRepairs, isDevRepo, repairEntry, classifyRepair, deriveDeploymentImpact, DATA_PATH };
