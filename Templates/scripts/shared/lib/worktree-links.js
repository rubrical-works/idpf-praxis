// Rubrical Works (c) 2026
/**
 * @framework-script 0.111.0
 * worktree-links.js — Hub link recreation in worktrees, and the platform
 * link/unlink helpers teardown shares (#3123, PRD Concurrent-Work Story 1.6)
 *
 * A Praxis Hub Manager project keeps `.claude/hooks`, `.claude/metadata`,
 * `.claude/recipes` and `.claude/scripts/shared` as GITIGNORED LINKS into a
 * hub shared by every project on the machine, so a fresh worktree has no
 * framework runtime until those links exist inside it. `recreateLinks`
 * recreates them by READING the parent checkout's link targets — never by
 * computing a hub path — so a worktree follows whatever version the project
 * is pinned to, wherever that hub happens to live.
 *
 * LAYOUT IS READ, NOT INFERRED FROM DIRECTORY SHAPE. `framework-config.json`
 * `selfHosted: true` or `frameworkPath: "."` means self-hosted (this
 * repository: real directories, nothing to recreate). A hub `frameworkPath`
 * with hub links in the checkout means PHM. Neither marker and no links is
 * treated as self-hosted AND REPORTED AS AN ASSUMPTION, so a misdetected
 * project is visible in the hook's stderr rather than silently linkless.
 *
 * Which directories are candidates comes from `framework-manifest.json`
 * `deploymentFiles` targets (read from the hub root, since a deployed
 * project does not carry the manifest); nested targets fold into their
 * parent, and the four known targets are the fallback when no manifest
 * is readable — reported, never silent. A relative `frameworkPath` that is
 * itself a link in the checkout joins them (#3195), or `{frameworkPath}`
 * resolves to nothing inside the worktree.
 *
 * TWO THINGS ARE DELIBERATELY ABSENT. No `node_modules` link: worktrees sit
 * under the project root, so Node's upward lookup reaches the parent's, and
 * the incident behind Story 1.7 (`git worktree remove --force` deleting
 * THROUGH a node_modules junction) is why a link there is a rule, not a
 * convenience. No copied rules: subagents inherit `.claude/rules/` from the
 * parent checkout.
 *
 * Platform: directory junctions on Windows (no elevation needed; the target
 * must be absolute) and directory symlinks on POSIX. `removeDirLink` removes
 * ONLY a link — a real directory is refused — so teardown can unlink first
 * and never delete through a link.
 *
 * Node built-ins only (deployed hooks and helpers resolve from the hub, #2418).
 */

const fs = require('fs');
const path = require('path');

/** The hub-managed directories a PHM project links, as the manifest names them. */
const DEFAULT_CANDIDATES = Object.freeze(['.claude/metadata', '.claude/recipes', '.claude/scripts/shared', '.claude/hooks']);

function norm(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readConfig(root) {
  return readJson(path.join(root, 'framework-config.json'));
}

/**
 * The manifest: from the hub root (`frameworkPath`) when the config names
 * one, else beside the config. Null when neither is readable.
 */
function readManifest(root, config) {
  const fp = config && typeof config.frameworkPath === 'string' && config.frameworkPath.trim() !== ''
    ? path.resolve(root, config.frameworkPath.trim())
    : null;
  return (fp && readJson(path.join(fp, 'framework-manifest.json'))) || readJson(path.join(root, 'framework-manifest.json'));
}

/**
 * Link candidates from a manifest's `deploymentFiles` targets, nested
 * targets folded into their parent (shared/lib is inside shared).
 *
 * @param {object|null} manifest
 * @returns {string[]} Relative paths; the defaults when the manifest declares none.
 */
function linkCandidates(manifest) {
  const d = manifest && manifest.deploymentFiles;
  if (!d || typeof d !== 'object') return [...DEFAULT_CANDIDATES];
  const targets = [];
  const push = (t) => { if (typeof t === 'string' && t.trim() !== '') targets.push(norm(t)); };
  if (d.metadata) push(d.metadata.target);
  if (d.recipes) push(d.recipes.target);
  if (d.scripts && typeof d.scripts === 'object') {
    for (const v of Object.values(d.scripts)) if (v && typeof v === 'object') push(v.target);
  }
  const uniq = [...new Set(targets)];
  const top = uniq.filter((t) => !uniq.some((o) => o !== t && t.startsWith(`${o}/`)));
  return top.length > 0 ? top : [...DEFAULT_CANDIDATES];
}

/**
 * The `frameworkPath` target as a link candidate (#3195): a Praxis Hub
 * Manager project can commit `frameworkPath: ".claude/framework"` and keep
 * that path as a gitignored link to the hub version folder, which no
 * manifest `deploymentFiles` target names. Generic on `frameworkPath` —
 * a candidate only when the project is not self-hosted, the path is
 * relative, stays under the root, and is a link in the root checkout.
 *
 * @param {{root: string, config?: object|null}} input
 * @returns {string|null} The normalized relative path, or null.
 */
function frameworkPathCandidate({ root, config = readConfig(root) }) {
  if (!config || config.selfHosted === true) return null;
  const fp = typeof config.frameworkPath === 'string' ? config.frameworkPath.trim() : '';
  if (fp === '' || path.isAbsolute(fp)) return null;
  // Containment is checked on the RESOLVED path (#3206): a string check
  // alone lets an interior `..` ("a/../../x") escape the root.
  const relNative = path.relative(path.resolve(root), path.resolve(root, fp));
  if (relNative === '' || relNative === '..' || relNative.startsWith(`..${path.sep}`) || path.isAbsolute(relNative)) return null;
  const rel = norm(relNative);
  try {
    return fs.lstatSync(path.join(root, rel)).isSymbolicLink() ? rel : null;
  } catch {
    return null;
  }
}

/**
 * Fold the `frameworkPath` candidate into the manifest candidates with the
 * same top-level filter `linkCandidates` applies (#3210): candidates nested
 * under it are dropped (its link covers them), and it is dropped when it is
 * nested under, or equal to, one of them. Without this, a nested candidate
 * that is itself a link would be created first with real parent directories,
 * and the frameworkPath link then skipped as a real directory in its place.
 *
 * Comparison is case-insensitive on win32, where `.claude/Metadata` and
 * `.claude/metadata` name the same directory.
 *
 * @param {string[]} candidates Normalized relative paths.
 * @param {string|null} fpLink The normalized frameworkPath candidate, or null.
 * @param {{platform?: string}} [opts]
 * @returns {string[]} A new list.
 */
function foldFrameworkPathCandidate(candidates, fpLink, { platform = process.platform } = {}) {
  if (!fpLink) return [...candidates];
  const key = platform === 'win32' ? (p) => p.toLowerCase() : (p) => p;
  const fp = key(fpLink);
  const under = (child, parent) => child.startsWith(`${parent}/`);
  if (candidates.some((c) => key(c) === fp || under(fp, key(c)))) return [...candidates];
  return [...candidates.filter((c) => !under(key(c), fp)), fpLink];
}

/**
 * The candidates that are links in the parent checkout, with their targets
 * read from the link itself.
 *
 * @param {{root: string, candidates?: string[]}} input
 * @returns {Array<{rel: string, linkPath: string, target: string}>}
 */
function readParentLinks({ root, candidates = DEFAULT_CANDIDATES }) {
  const found = [];
  for (const rel of candidates) {
    const linkPath = path.join(root, rel);
    let st;
    try { st = fs.lstatSync(linkPath); } catch { continue; }
    if (!st.isSymbolicLink()) continue;
    let target;
    try { target = fs.readlinkSync(linkPath); } catch { continue; }
    if (!path.isAbsolute(target)) target = path.resolve(path.dirname(linkPath), target);
    found.push({ rel, linkPath, target });
  }
  return found;
}

/**
 * Which layout a project is, and how that was decided.
 *
 * @param {{root: string}} input
 * @returns {{layout: 'self-hosted'|'phm', source: 'selfHosted'|'frameworkPath'|'links'|'assumed',
 *   reason: string, candidates: string[], manifestFound: boolean}}
 */
function detectLayout({ root, platform = process.platform }) {
  const config = readConfig(root);
  const manifest = readManifest(root, config);
  const candidates = foldFrameworkPathCandidate(linkCandidates(manifest), frameworkPathCandidate({ root, config }), { platform });
  const base = { candidates, manifestFound: manifest !== null };

  if (config && config.selfHosted === true) {
    return { ...base, layout: 'self-hosted', source: 'selfHosted', reason: 'framework-config.json declares selfHosted: true' };
  }
  const fp = config && typeof config.frameworkPath === 'string' ? config.frameworkPath.trim() : '';
  if (fp === '.' || fp === './') {
    return { ...base, layout: 'self-hosted', source: 'frameworkPath', reason: 'framework-config.json declares frameworkPath "."' };
  }
  const present = readParentLinks({ root, candidates });
  if (fp !== '' && present.length > 0) {
    return { ...base, layout: 'phm', source: 'frameworkPath', reason: `frameworkPath ${fp} and ${present.length} hub link(s) in the checkout` };
  }
  if (present.length > 0) {
    return { ...base, layout: 'phm', source: 'links', reason: `${present.length} hub link(s) in the checkout, no layout marker in framework-config.json` };
  }
  return {
    ...base,
    layout: 'self-hosted',
    source: 'assumed',
    reason: 'no selfHosted or frameworkPath marker and no hub links in the checkout — assuming self-hosted; checkout used as is',
  };
}

/**
 * Create a directory link: a junction on win32 (no elevation), a `dir`
 * symlink elsewhere. `fsImpl` and `platform` are injectable so both branches
 * are testable on one host.
 *
 * @returns {{linkPath: string, target: string, type: 'junction'|'dir'}}
 */
function createDirLink({ target, linkPath, platform = process.platform, fsImpl = fs }) {
  const type = platform === 'win32' ? 'junction' : 'dir';
  fsImpl.symlinkSync(target, linkPath, type);
  return { linkPath, target, type };
}

/**
 * Remove a directory link and ONLY a link. A real directory is refused —
 * this is the primitive teardown uses before `git worktree remove`, and the
 * one property it must have is never deleting through to a target.
 *
 * @returns {{ok: boolean, linkPath: string, error: string|null}}
 */
function removeDirLink({ linkPath, fsImpl = fs }) {
  let st;
  try {
    st = fsImpl.lstatSync(linkPath);
  } catch (err) {
    return { ok: false, linkPath, error: `${linkPath}: ${err.message}` };
  }
  if (!st.isSymbolicLink()) {
    return { ok: false, linkPath, error: `${linkPath} is not a link; refusing to remove a real directory` };
  }
  try {
    try {
      fsImpl.unlinkSync(linkPath);
    } catch (err) {
      // A junction on some Windows configurations unlinks only as a directory.
      if (err.code === 'EPERM' || err.code === 'EISDIR') fsImpl.rmdirSync(linkPath);
      else throw err;
    }
  } catch (err) {
    return { ok: false, linkPath, error: `${linkPath}: ${err.message}` };
  }
  return { ok: true, linkPath, error: null };
}

/**
 * Recreate the parent checkout's hub links inside a worktree.
 *
 * @param {{root: string, worktree: string, platform?: string, fsImpl?: object}} input
 * @returns {{ok: boolean, layout: string, source: string, reason: string, note: string|null,
 *   recreated: Array<{rel: string, target: string, linkPath: string}>,
 *   skipped: Array<{rel: string, reason: string}>, error: string|null}}
 *   Self-hosted: nothing recreated, `note` says so (and names the assumption
 *   when the layout was assumed). A link that cannot be created fails the
 *   whole call naming it; the caller (the hook) reports the half-made worktree.
 */
function recreateLinks({ root, worktree, platform = process.platform, fsImpl = fs }) {
  const detected = detectLayout({ root, platform });
  const out = {
    ok: true,
    layout: detected.layout,
    source: detected.source,
    reason: detected.reason,
    note: null,
    recreated: [],
    skipped: [],
    error: null,
  };
  if (detected.layout === 'self-hosted') {
    out.note = detected.source === 'assumed'
      ? `self-hosted layout (${detected.reason})`
      : 'self-hosted layout: checkout used as is, no links to recreate';
    return out;
  }
  if (!detected.manifestFound) out.note = 'no framework-manifest.json readable — using the default hub link candidates';

  for (const link of readParentLinks({ root, candidates: detected.candidates })) {
    const dest = path.join(worktree, link.rel);
    let st = null;
    try { st = fs.lstatSync(dest); } catch { st = null; }
    if (st) {
      out.skipped.push({ rel: link.rel, reason: st.isSymbolicLink() ? 'link already present' : 'a real directory is already in its place' });
      continue;
    }
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      createDirLink({ target: link.target, linkPath: dest, platform, fsImpl });
      out.recreated.push({ rel: link.rel, target: link.target, linkPath: dest });
    } catch (err) {
      out.ok = false;
      out.error = `cannot create link ${dest} -> ${link.target}: ${err.message}`;
      return out;
    }
  }
  return out;
}

module.exports = {
  DEFAULT_CANDIDATES,
  linkCandidates,
  frameworkPathCandidate,
  foldFrameworkPathCandidate,
  readParentLinks,
  detectLayout,
  createDirLink,
  removeDirLink,
  recreateLinks,
};
