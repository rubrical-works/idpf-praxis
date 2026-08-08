// Rubrical Works (c) 2026
/**
 * @framework-script 0.96.0
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
 * Node built-ins only, per the runtime dependency contract for deployed
 * helpers (04-deployment-awareness.md).
 */

const fs = require('fs');
const path = require('path');

/**
 * Resolve configured search surfaces against a project root.
 *
 * A configured surface absent from disk is skipped rather than fatal. Zero
 * surfaces resolving is partial — a failed sweep, not an empty one.
 *
 * @param {object} config - Parsed prior-art-sweep.json (or its searchSurfaces owner)
 * @param {string} projectRoot - Absolute path of the project being swept
 * @returns {{resolved: string[], skipped: string[], partial: boolean, reason: string|null}}
 *   `resolved` preserves configured priority order; `reason` is null unless partial.
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

  for (const surface of configured) {
    // A regular file of the same name is not a surface — surfaces are trees
    // to walk, and reporting one the sweep cannot descend into is worse than
    // skipping it.
    let isDirectory = false;
    try {
      isDirectory = fs.statSync(path.resolve(projectRoot, surface)).isDirectory();
    } catch (_e) {
      isDirectory = false;
    }
    (isDirectory ? resolved : skipped).push(surface);
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
