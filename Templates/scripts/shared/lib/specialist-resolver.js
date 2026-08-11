// Rubrical Works (c) 2026
/**
 * @framework-script 0.96.1
 * Domain specialist resolution — shared by the startup hook and
 * /change-domain-expert.
 *
 * Two entry points reach the same injection surface: session start reads
 * `framework-config.json` `domainSpecialist`, and /change-domain-expert selects
 * one mid-session. Both must apply the same allowlist and the same input
 * validation, so both call this module. Restating the rules in command prose
 * would hold only until the two drift (#2504).
 *
 * Extracted from .claude/hooks/startup-hook.js, where #2503 first implemented
 * it. Node built-ins only — this file is symlinked into user projects, where an
 * undeclared external package would resolve against a node_modules the symlink
 * target cannot see.
 */

const fs = require('fs');
const path = require('path');

const SPECIALIST_DIRS = ['Base', 'Pack'];

// A specialist name is a bare file stem. Anything that could steer path.join
// elsewhere — separators, leading dots, drive letters, NUL — is not a name.
const SAFE_SPECIALIST_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function isSafeSpecialistName(name) {
  if (typeof name !== 'string' || name.length === 0 || name.length > 128) return false;
  if (name.includes('..')) return false;
  return SAFE_SPECIALIST_NAME.test(name);
}

/**
 * Resolve a specialist name into an injection decision.
 *
 * The step order IS the security property, so it must not be reordered for
 * convenience: shape is checked with pure string operations before any
 * filesystem access, manifest membership before any path is built, and the
 * loadable allowlist before any file is read. Prior to #2503 the raw config
 * value went straight into path.join, which made `framework-config.json` an
 * arbitrary-file-disclosure surface.
 *
 * Fails closed throughout: an unreadable manifest yields no allowlist, and no
 * allowlist means nothing injects. The startup caller gates every session
 * start, so every failure path degrades to announce-only rather than throwing.
 *
 * @param {{cwd: string, frameworkPath?: string, domainSpecialist: string}} opts
 * @returns {{status: 'none'|'rejected'|'announce-only'|'missing'|'loaded',
 *            name: string, path: string|null, content: string|null,
 *            warning: string|null}}
 */
function resolveSpecialist({ cwd, frameworkPath = '.', domainSpecialist }) {
  const base = { name: domainSpecialist || '', path: null, content: null, warning: null };

  if (!domainSpecialist) return { ...base, status: 'none' };

  // (1) Shape — no filesystem access on a value that fails here, by any route.
  if (!isSafeSpecialistName(domainSpecialist)) {
    return {
      ...base,
      status: 'rejected',
      warning: 'Configured domainSpecialist is not a valid specialist name — ignored, nothing loaded.',
    };
  }

  const name = domainSpecialist;

  // (2) Manifest allowlist — membership decided before any path is built.
  const manifest = readJson(path.join(cwd, frameworkPath, 'framework-manifest.json'));
  if (!manifest) {
    return {
      ...base,
      status: 'rejected',
      warning: `Specialist allowlist unavailable (framework-manifest.json unreadable) — "${name}" announced only, nothing loaded.`,
    };
  }

  // domainSpecialists is an array of objects since #2533; the loadable flag moved
  // onto the entry and the loadableSpecialists sibling was removed. Entries that
  // are not objects with a string `name` are ignored rather than coerced — a
  // malformed manifest should narrow the allowlist, never widen it.
  const entries = Array.isArray(manifest.domainSpecialists) ? manifest.domainSpecialists : [];
  const known = entries
    .filter((e) => e && typeof e === 'object' && typeof e.name === 'string')
    .map((e) => e.name);
  const loadable = entries
    .filter((e) => e && typeof e === 'object' && typeof e.name === 'string' && e.loadable === true)
    .map((e) => e.name);

  if (!known.includes(name)) {
    return {
      ...base,
      status: 'rejected',
      warning: `"${name}" is not a known domain specialist — announced only, nothing loaded.`,
    };
  }

  // (3) Loadable gate. `loadable: false` means no file exists to load (#2533) —
  // the entry's announceReason records why. Not a warning: announce-only is the
  // designed path for a role the base model already covers, or one whose warrant
  // has never been evaluated.
  if (!loadable.includes(name)) {
    return { ...base, status: 'announce-only' };
  }

  // (4) Filesystem — reached only by a shape-safe, allowlisted, loadable name.
  // Base/ then Pack/: a name may live in either tree, and hardcoding Base/ is
  // the defect this order fixes for the switch path (#2504).
  for (const dir of SPECIALIST_DIRS) {
    const candidate = path.join(cwd, frameworkPath, 'System-Instructions', 'Domain', dir, `${name}.md`);
    if (!fs.existsSync(candidate)) continue;
    try {
      return { ...base, status: 'loaded', path: candidate, content: fs.readFileSync(candidate, 'utf8') };
    } catch (err) {
      return {
        ...base,
        status: 'missing',
        path: candidate,
        warning: `Specialist file for "${name}" could not be read (${err.message}) — announced only.`,
      };
    }
  }

  return {
    ...base,
    status: 'missing',
    warning: `Specialist file for "${name}" was not found on disk — announced only.`,
  };
}

module.exports = {
  resolveSpecialist,
  isSafeSpecialistName,
  SPECIALIST_DIRS,
};
