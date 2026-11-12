// Rubrical Works (c) 2026
/**
 * @framework-script 0.118.0
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
 * Built-ins and shared siblings only (runtime dependency contract, #2418).
 */

const fs = require('fs');
const path = require('path');
const { DEPLOYMENT_PATH_TABLE } = require('./deployment-scope.js');

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
  // #3578: injected ctx.data is not normalized by loadRepairs — guard a
  // missing `repairs` object and rule out prototype keys such as `constructor`.
  const repairs = data && typeof data.repairs === 'object' && data.repairs ? data.repairs : {};
  if (!id || !Object.prototype.hasOwnProperty.call(repairs, id)) return null;
  const entry = repairs[id];
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
 * A `test-ac` entry (#3588) also passes `checkTestAc`: `fix` is the AC text,
 * `files` the Files-to-modify paths it adds (default: the AC's own paths). A
 * refusal carries a named reason (`non-test-path: <path> …`, `no-suite-runs:
 * <path> …`, `conventions-unreadable: …`, `no-test-path: …`) and the finding
 * goes to /resolve-review Pass 2; an accepted one returns `files`.
 *
 * @param {{ id?: string, status?: string, fix?: string, files?: string[] }} finding
 * @param {object} ctx - see repairEntry; plus `readConventions(root)` and
 *   `resolveSuites(root)` injection points for the test-ac guard
 * @returns {{ repairable: boolean, id: string|null, kind: string|null, reason: string|null, files?: string[] }}
 */
function classifyRepair(finding, ctx = {}) {
  const id = finding && finding.id ? String(finding.id) : null;
  const no = (reason, kind = null) => ({ repairable: false, id, kind, reason });
  if (!finding || !NON_PASS.has(finding.status)) return no('status');
  const entry = repairEntry(id, ctx);
  if (!entry) return no('not-repairable');
  if (!entry.preFinalize) return no('not-pre-finalize', entry.kind);
  if (typeof finding.fix !== 'string' || finding.fix.trim() === '') return no('no-concrete-fix', entry.kind);
  if (entry.kind === 'test-ac') {
    const guard = checkTestAc(finding, ctx);
    if (guard.reason) return no(guard.reason, entry.kind);
    return { repairable: true, id, kind: entry.kind, reason: null, files: guard.files };
  }
  return { repairable: true, id, kind: entry.kind, reason: null };
}

// ─── Test-only AC guard (kind: test-ac, #3588) ───

// The conventions file lives in a copied skill, so it is read from the
// project, never the hub. Absent or unreadable fails closed: the finding is
// asked in /resolve-review Pass 2, never written unprompted.
const CONVENTIONS_PATH = path.join('.claude', 'skills', 'tdd-refactor-coverage-audit', 'resources', 'test-coverage-conventions.json');
const CONVENTIONS_LABEL = CONVENTIONS_PATH.replace(/\\/g, '/');

// Suite roles that cover files without running their tests. Roles are an open
// string (framework-config.schema.json), so this names the two known
// non-test roles rather than allowlisting test ones.
const NON_TEST_ROLES = new Set(['lint', 'compile-check']);

function defaultReadConventions(root) {
  return JSON.parse(fs.readFileSync(path.join(root || process.cwd(), CONVENTIONS_PATH), 'utf8'));
}

function defaultResolveSuites(root) {
  return require('./test-runner.js').resolveSuites(root || process.cwd());
}

/**
 * Glob → RegExp for testPatterns and suite `match[]`: `{dir}/` and `**\/` match
 * zero or more leading directories, `{stem}` one non-empty segment, `**` any
 * run, `*` within a segment. Everything else is literal.
 */
function patternToRegex(pattern) {
  let re = '^';
  let i = 0;
  while (i < pattern.length) {
    if (pattern.startsWith('{dir}/', i)) { re += '(?:.*/)?'; i += 6; continue; }
    if (pattern.startsWith('{stem}', i)) { re += '[^/]+'; i += 6; continue; }
    if (pattern.startsWith('**/', i)) { re += '(?:.*/)?'; i += 3; continue; }
    if (pattern.startsWith('**', i)) { re += '.*'; i += 2; continue; }
    const c = pattern[i];
    if (c === '*') re += '[^/]*';
    else re += /[.+^$()|{}[\]\\?]/.test(c) ? `\\${c}` : c;
    i++;
  }
  return new RegExp(`${re}$`);
}

function normalizePath(p) {
  return String(p).trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

// A bare (unbackticked) token is a path when it has a directory separator or
// ends in a file extension, and carries no whitespace or URL scheme. Erring toward "path" is
// the safe direction: a misread token is a non-test path, which prompts.
const EXTENSION = /\.[A-Za-z0-9]{1,8}$/;

function isPathToken(t) {
  if (!/^[\w.@~/-]+$/.test(t)) return false;
  return t.includes('/') || EXTENSION.test(t);
}

// A backticked token is delimited, so its shape alone decides (#3589): a path
// separator (`/` or `\`) or a trailing file extension makes it a path whatever
// other characters it carries — a Windows path or one with a space reaches the
// non-test check and refuses instead of being skipped, which failed open.
function isBacktickedPath(t) {
  return t.includes('/') || t.includes('\\') || EXTENSION.test(t);
}

/** Every path the AC text names: backticked tokens, then bare tokens with a `/` and an extension. */
function pathsInText(text) {
  const found = [];
  const add = (t) => { const p = normalizePath(t); if (p && !found.includes(p)) found.push(p); };
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    const t = m[1].trim();
    if (isBacktickedPath(t)) add(t);
  }
  const bare = text.replace(/`[^`]*`/g, ' ');
  for (const raw of bare.split(/\s+/)) {
    const t = raw.replace(/^[("'[]+/, '').replace(/[)"'\],.;:!?]+$/, '');
    if (t.includes('/') && EXTENSION.test(t) && isPathToken(t)) add(t);
  }
  return found;
}

/**
 * The guard: every path the AC names, and every Files-to-modify path it adds
 * (`finding.files`, defaulting to the AC's own paths), must be a test path
 * under the conventions file's `testPatterns`, and a declared suite that runs
 * tests must cover it. Returns `{ reason }` naming the first refusal, or
 * `{ reason: null, files }`.
 *
 * @param {{ fix: string, files?: string[] }} finding
 * @param {{ root?: string, readConventions?: Function, resolveSuites?: Function }} ctx
 */
function checkTestAc(finding, ctx = {}) {
  const acPaths = pathsInText(finding.fix);
  const files = Array.isArray(finding.files) && finding.files.length
    ? [...new Set(finding.files.map(normalizePath).filter(Boolean))]
    : acPaths;
  const all = [...new Set([...acPaths, ...files])];
  if (all.length === 0) return { reason: 'no-test-path: the AC names no test file' };

  let conventions;
  try {
    conventions = (ctx.readConventions || defaultReadConventions)(ctx.root);
  } catch (err) {
    return { reason: `conventions-unreadable: ${CONVENTIONS_LABEL} (${err && err.message ? err.message : err})` };
  }
  const languages = conventions && typeof conventions.languages === 'object' && conventions.languages;
  if (!languages) return { reason: `conventions-unreadable: ${CONVENTIONS_LABEL} declares no languages` };
  const testRes = [];
  for (const lang of Object.values(languages)) {
    for (const p of (lang && Array.isArray(lang.testPatterns) ? lang.testPatterns : [])) {
      if (typeof p === 'string') testRes.push(patternToRegex(p));
    }
  }

  for (const p of all) {
    if (p.startsWith('/') || /^[A-Za-z]:/.test(p) || p.split('/').includes('..') || !testRes.some((re) => re.test(p))) {
      return { reason: `non-test-path: ${p} is not a test path under ${CONVENTIONS_LABEL}` };
    }
  }

  let resolved;
  try {
    resolved = (ctx.resolveSuites || defaultResolveSuites)(ctx.root);
  } catch {
    resolved = null;
  }
  const suites = (resolved && Array.isArray(resolved.suites) ? resolved.suites : []).filter((s) =>
    s && s.execution !== 'manual-only' && !NON_TEST_ROLES.has(s.role) && Array.isArray(s.match));
  for (const p of all) {
    const runs = suites.some((s) =>
      s.match.some((g) => typeof g === 'string' && patternToRegex(g).test(p))
      && !(Array.isArray(s.exclude) ? s.exclude : []).some((g) => typeof g === 'string' && patternToRegex(g).test(p)));
    if (!runs) return { reason: `no-suite-runs: ${p} is run by no declared test suite (resolveSuites source: ${(resolved && resolved.source) || 'unavailable'})` };
  }
  return { reason: null, files };
}

// ─── Applying a test-ac repair (#3588) ───

const FILES_HEADERS = new Set(['**files to modify:**', '**files:**']);
const BLOCK_LINE = /^\s*(?:[-*+]\s|\|)/;

function headingLevel(line) {
  const m = line.match(/^\s*(#{1,6})\s+\S/);
  return m ? m[1].length : null;
}

/** Index to insert a new criterion at: after the AC section's last checkbox item. */
function locateAcInsert(lines) {
  const { computeFenceMask, matchCheckboxLine, isBoldMarker, ACCEPTANCE_CRITERIA_HEADINGS } = require('./checkbox-scan.js');
  const mask = computeFenceMask(lines);
  for (const form of ACCEPTANCE_CRITERIA_HEADINGS) {
    const start = lines.findIndex((l, i) => !mask[i] && form.pattern.test(l.toLowerCase()));
    if (start === -1) continue;
    let insertAt = start + 1;
    for (let j = start + 1; j < lines.length; j++) {
      if (mask[j]) continue;
      const level = headingLevel(lines[j]);
      if (level !== null && (form.level === null || level <= form.level)) break;
      if (level === null && isBoldMarker(lines[j])) break;
      if (matchCheckboxLine(lines[j])) {
        insertAt = j + 1;
        // Keep an item's indented continuation lines with it.
        while (insertAt < lines.length && /^\s+\S/.test(lines[insertAt]) && !matchCheckboxLine(lines[insertAt])) insertAt++;
      }
    }
    return { start, insertAt };
  }
  return null;
}

/**
 * Add paths to the `**Files to modify:**` declaration, keeping the one-block
 * shape `extractFilesToModifySection` accepts: bullets join a bullet list, a
 * row joins a table, and an absent declaration is written as one bullet block
 * before the AC section.
 */
function addDeclaredFiles(lines, paths, acStart) {
  const { computeFenceMask } = require('./checkbox-scan.js');
  const mask = computeFenceMask(lines);
  const header = lines.findIndex((l, i) => !mask[i] && FILES_HEADERS.has(l.trim().toLowerCase()));
  const out = lines.slice();
  if (header === -1) {
    out.splice(acStart, 0, '**Files to modify:**', ...paths.map((p) => `- \`${p}\``), '');
    return out;
  }
  let first = header + 1;
  while (first < out.length && out[first].trim() === '') first++;
  const isTable = first < out.length && out[first].trim().startsWith('|');
  let last = first - 1;
  // #3602: an indented continuation line under a bullet belongs to the block,
  // as locateAcInsert keeps one with its AC item — else `last` stops early and
  // new entries are spliced mid-list. Tables have no continuation lines.
  const inBlock = (line) => BLOCK_LINE.test(line) || (!isTable && last >= first && /^\s+\S/.test(line));
  while (last + 1 < out.length && inBlock(out[last + 1])) last++;
  if (last < first) {
    out.splice(header + 1, 0, ...paths.map((p) => `- \`${p}\``));
    return out;
  }
  if (isTable) {
    const cols = Math.max(1, out[first].trim().replace(/^\||\|$/g, '').split('|').length);
    // #3602: an unescaped '|' in a cell splits the row. scope-drift-check does
    // not unescape '\|', so applyTestAcRepair's parse-back refuses such a
    // write (write-unverified) — the finding goes to Pass 2, never a broken row.
    out.splice(last + 1, 0, ...paths.map((p) => `| ${[`\`${p.replace(/\|/g, '\\|')}\``, ...Array(cols - 1).fill('')].join(' | ')} |`));
    return out;
  }
  let bullet = last;
  while (bullet > first && !/^\s*[-*+]\s/.test(out[bullet])) bullet--;
  const marker = (out[bullet].match(/^(\s*[-*+])\s/) || [null, '-'])[1];
  out.splice(last + 1, 0, ...paths.map((p) => `${marker} \`${p}\``));
  return out;
}

/**
 * Write an accepted `test-ac` repair into the body, before finalize: append
 * the AC to the Acceptance Criteria section and any test file not yet declared
 * to `**Files to modify:**`, so `scope-drift-check.js` never halts on the new
 * test file. The returned `repair` is the findings `repairs` record
 * (`before` empty — nothing was replaced; `after` the text written), rendered
 * ✅ repaired in the review comment so it can be reverted.
 *
 * Writes nothing — `applied: false` with a reason — when the body has no AC
 * section, when the AC and every file are already present, or when the
 * written body does not parse back to the AC and paths it was given.
 *
 * @param {string} body
 * @param {{ criterion: string, ac: string, files?: string[] }} repair
 * @returns {{ applied: boolean, body: string, repair: {criterion: string, before: string, after: string}|null, reason: string|null }}
 */
function applyTestAcRepair(body, { criterion, ac, files } = {}) {
  const text = typeof body === 'string' ? body : '';
  const none = (reason) => ({ applied: false, body: text, repair: null, reason });
  const acText = typeof ac === 'string' ? ac.trim() : '';
  if (!acText) return none('no-ac: the repair carries no acceptance-criterion text');

  const { extractAcceptanceCriteria } = require('./checkbox-scan.js');
  const { extractFilesToModifySection } = require('../scope-drift-check.js');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  let lines = text.split(/\r?\n/);
  const loc = locateAcInsert(lines);
  if (!loc) return none('no-ac-section: the body has no Acceptance Criteria section to append to');

  const hasAc = extractAcceptanceCriteria(text).items.some((i) => i.text === acText);
  const declared = new Set(extractFilesToModifySection(text).paths.map(normalizePath));
  const toAdd = [...new Set((Array.isArray(files) ? files : []).map(normalizePath).filter(Boolean))]
    .filter((p) => !declared.has(p));
  if (hasAc && toAdd.length === 0) return none('already-present: the AC and its test files are already in the body');

  const acLine = `- [ ] ${acText}`;
  if (!hasAc) lines.splice(loc.insertAt, 0, acLine);
  if (toAdd.length) lines = addDeclaredFiles(lines, toAdd, loc.start);
  const next = lines.join(eol);

  const paths = extractFilesToModifySection(next).paths.map(normalizePath);
  const ok = extractAcceptanceCriteria(next).items.some((i) => i.text === acText) && toAdd.every((p) => paths.includes(p));
  if (!ok) return none('write-unverified: the written body does not parse back to the AC and its files');

  const after = [];
  if (!hasAc) after.push(acLine);
  if (toAdd.length) after.push(`**Files to modify:** + ${toAdd.map((p) => `\`${p}\``).join(', ')}`);
  return { applied: true, body: next, repair: { criterion: criterion || null, before: '', after: after.join('\n') }, reason: null };
}

// ─── Deployment Impact derivation (kind: deployment-impact) ───

// Paths that never reach a user project — the `userProject` answers of the
// shared table in deployment-scope.js (#3565), which also records why a path
// such as CHANGELOG.md is dev-only here yet deployed for the changelog.
// Anything matched by neither this nor a deploymentFiles mapping is
// `unknown`, and one unknown path means no repair.
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

module.exports = {
  loadRepairs, isDevRepo, repairEntry, classifyRepair, deriveDeploymentImpact, DATA_PATH,
  checkTestAc, pathsInText, applyTestAcRepair, addDeclaredFiles, CONVENTIONS_PATH,
};
