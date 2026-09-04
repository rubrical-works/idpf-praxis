// Rubrical Works (c) 2026
/**
 * @framework-script 0.101.0
 * prior-art-surfaces.js
 *
 * Resolves the `searchSurfaces` block of `.claude/metadata/prior-art-sweep.json`
 * against a project on disk, for the `--prior-art` sweep in /enhancement and
 * /proposal (#2514).
 *
 * Scope is deliberately narrow: this is the deterministic half of the sweep.
 * Term derivation, searching, and relevance judgment are generative work the
 * command specs perform — they are not computation and are not here.
 *
 * Why it exists at all: user projects read prior-art-sweep.json verbatim from
 * the hub, so a framework-shaped surface list resolves to nothing in, say, an
 * Electron app whose code lives in src/. Such a sweep searches nothing. It
 * must report that as a FAILED sweep (PARTIAL), because reporting "none found"
 * for a sweep that looked nowhere is the exact failure the feature prevents.
 *
 * Glob entries (#2555): a literal surface list also resolves nothing in a
 * multi-root or monorepo layout, where every source root sits one level down.
 * That made PARTIAL the permanent steady state for a whole class of projects
 * rather than an exception, which trains readers to treat the marker as noise.
 * An entry whose FIRST path segment carries a wildcard is expanded against the
 * project root, so a star-slash-src pattern finds `pkg-a/src`. (Patterns are
 * spelled out in prose here rather than shown literally: a star followed by a
 * slash closes this comment block.)
 *
 * The PARTIAL contract is unchanged and deliberately so — this makes surfaces
 * resolvable, it does not make a sweep that found nothing report differently.
 *
 * Node built-ins only, per the runtime dependency contract for deployed
 * helpers (04-deployment-awareness.md). The matcher below is vendored for
 * that reason: `minimatch` is not declared in `runtimeNpmDependencies`, and an
 * undeclared require crashes at module load in a user project. Precedent is
 * `globToRegex` in scope-drift-check.js, cited by that rule as the worked
 * vendoring case (#2418).
 */

const fs = require('fs');
const path = require('path');

// Depth bound for glob entries: exactly two segments, wildcard confined to the
// first — one level down, no deeper. Expanded:   */src
// Not expanded:                                  */*/src   and   src/*
//
// The bound is a deliberate refusal, not a limitation waiting to be lifted.
// Unbounded expansion walks an arbitrary project root of unknown size on a
// path that runs during issue creation, and one level covers every layout in
// the field report. Widening it later is cheap; narrowing it after projects
// depend on deep patterns is not.
const GLOB_MAX_SEGMENTS = 2;

/** True when an entry is a pattern rather than a literal directory name. */
function hasWildcard(entry) {
  return /[*?]/.test(entry);
}

/**
 * Compile ONE path segment of a glob to a RegExp.
 *
 * Segment-scoped on purpose: `/` never appears in the input, so there is no
 * `**` case to handle and no way for a pattern to escape its level. That is
 * what keeps the vendored surface at a few lines instead of a glob library.
 */
function segmentToRegex(segment) {
  let re = '^';
  for (const c of segment) {
    if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if ('.+^$()|{}[]\\/'.includes(c)) re += '\\' + c;
    else re += c;
  }
  return new RegExp(re + '$');
}

/**
 * Split a glob entry into its parts, or report why it is out of bounds.
 *
 * @returns {{ok: true, pattern: string, child: string} | {ok: false}}
 */
function parseGlobEntry(entry) {
  const segments = entry.split('/').filter((s) => s.length > 0);
  if (segments.length !== GLOB_MAX_SEGMENTS) return { ok: false };
  const [pattern, child] = segments;
  // The wildcard must be in the first segment. A pattern in the second would
  // require a readdir per matched parent, which is the cost this bound exists
  // to avoid.
  if (!hasWildcard(pattern) || hasWildcard(child)) return { ok: false };
  return { ok: true, pattern, child };
}

/** True when `p` is a directory. A regular file of the same name is not. */
function isDirectory(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch (_e) {
    return false;
  }
}

/**
 * Resolve configured search surfaces against a project root.
 *
 * A configured surface absent from disk is skipped rather than fatal. Zero
 * surfaces resolving is partial — a failed sweep, not an empty one.
 *
 * Literal entries resolve by a single `statSync` each, exactly as before
 * #2555. Glob entries share at most ONE `readdir` of the project root
 * regardless of how many patterns are configured, and a config containing no
 * patterns performs no `readdir` at all.
 *
 * Beyond that readdir, expansion costs one `statSync` per (pattern x matching
 * top-level directory). Measured against this repo with the shipped defaults:
 * 30 top-level directories, 6 patterns, 1 readdir + 193 stats in ~7ms. The
 * product is what grows, so adding a pattern to the shipped defaults is not
 * free in a wide monorepo — weigh a new default against that, not against the
 * readdir, which is already shared.
 *
 * @param {object} config - Parsed prior-art-sweep.json (or its searchSurfaces owner)
 * @param {string} projectRoot - Absolute path of the project being swept
 * @returns {{resolved: string[], skipped: string[], partial: boolean, reason: string|null}}
 *   `resolved` preserves configured priority order; a glob contributes its
 *   expanded concrete paths, sorted, at the position of the pattern that
 *   produced them. `reason` is null unless partial.
 */
function resolveSurfaces(config, projectRoot) {
  const configured = config?.searchSurfaces?.projectRoots;

  if (!Array.isArray(configured) || configured.length === 0) {
    return {
      resolved: [],
      skipped: [],
      partial: true,
      reason: 'no configured surfaces: searchSurfaces.projectRoots is missing or empty'
    };
  }

  const resolved = [];
  const skipped = [];

  // Read lazily and once. A literal-only config — every project today — must
  // not pay for a capability it does not use.
  let topLevelDirs = null;
  const listTopLevelDirs = () => {
    if (topLevelDirs !== null) return topLevelDirs;
    try {
      topLevelDirs = fs
        .readdirSync(projectRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch (_e) {
      // An unreadable root is not an error here: it resolves nothing, which
      // the partial contract below already reports honestly.
      topLevelDirs = [];
    }
    return topLevelDirs;
  };

  for (const surface of configured) {
    if (!hasWildcard(surface)) {
      // A regular file of the same name is not a surface — surfaces are trees
      // to walk, and reporting one the sweep cannot descend into is worse than
      // skipping it.
      (isDirectory(path.resolve(projectRoot, surface)) ? resolved : skipped).push(surface);
      continue;
    }

    const parsed = parseGlobEntry(surface);
    if (!parsed.ok) {
      // Out of bounds. Reported rather than dropped: a caller reconciling
      // configured entries against the result must not find one missing.
      skipped.push(surface);
      continue;
    }

    const re = segmentToRegex(parsed.pattern);
    const matches = listTopLevelDirs()
      .filter((dir) => re.test(dir))
      .map((dir) => path.join(dir, parsed.child))
      .filter((rel) => isDirectory(path.resolve(projectRoot, rel)))
      .sort();

    if (matches.length === 0) skipped.push(surface);
    else resolved.push(...matches);
  }

  return {
    resolved,
    skipped,
    partial: resolved.length === 0,
    reason: resolved.length === 0
      ? `no configured surface resolved against ${projectRoot}: nothing was searched`
      : null
  };
}

module.exports = { resolveSurfaces };
