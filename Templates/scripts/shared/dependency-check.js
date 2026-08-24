#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.97.0
 * @description Detect missing, partial, or stale node_modules at session startup. Stats node_modules/<name>/package.json for each declared package and compares package-lock.json mtime against node_modules/.package-lock.json. Read-only and advisory — performs no installation and spawns no npm subprocess.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');

// ─── Helpers ───

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_e) {
    return null;
  }
}

/**
 * Which packages to check, and which tree to check them in.
 *
 * Self-hosted (this repo): dependencies + devDependencies at the project root.
 * A missing devDependency is the sharp case here — /work Step 3 runs jest per
 * acceptance criterion.
 *
 * Deployed user project: only runtimeNpmDependencies, resolved against
 * frameworkPath. devDependencies are legitimately absent because
 * deploy-dist.yml bundles the hub with `npm ci --omit=dev`, so checking them
 * would warn on every correctly-installed project.
 */
function resolveScope(projectDir) {
  const config = readJson(path.join(projectDir, 'framework-config.json'));
  const selfHosted = config ? config.selfHosted === true : true;

  if (selfHosted) {
    const pkg = readJson(path.join(projectDir, 'package.json')) || {};
    return {
      scope: 'project',
      root: projectDir,
      packages: Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }),
    };
  }

  const frameworkPath = path.resolve(projectDir, config.frameworkPath || '.');
  // The manifest lives at frameworkPath in a deployed install; fall back to the
  // project root so a co-located layout still resolves.
  const manifest =
    readJson(path.join(frameworkPath, 'framework-manifest.json')) ||
    readJson(path.join(projectDir, 'framework-manifest.json')) ||
    {};

  return {
    scope: 'framework',
    root: frameworkPath,
    packages: Object.keys(manifest.runtimeNpmDependencies || {}),
  };
}

/**
 * A single `npm install` writes package-lock.json and
 * node_modules/.package-lock.json moments apart, in an order npm does not
 * guarantee. Measured on this repo: package-lock.json landed 17 ms after the
 * installed copy. A strict `a > b` comparison therefore reports `stale` on a
 * correctly-installed tree — a warning on every session, which trains the
 * reader to ignore the line that matters.
 *
 * The tolerance separates same-install skew (milliseconds) from a genuine
 * change (a human edits package.json and reinstalls, or a pull brings a new
 * lockfile — always seconds to days later). No real staleness is missed.
 */
const STALE_TOLERANCE_MS = 2000;

/**
 * Lockfile meaningfully newer than the installed tree's copy means npm ci has
 * not run since dependencies last changed. Absent either file, staleness is
 * unknowable and is not reported — a startup check must not invent a warning
 * from a missing file.
 */
function isStale(root) {
  const lock = path.join(root, 'package-lock.json');
  const installedLock = path.join(root, 'node_modules', '.package-lock.json');
  try {
    const drift = fs.statSync(lock).mtime.getTime() - fs.statSync(installedLock).mtime.getTime();
    return drift > STALE_TOLERANCE_MS;
  } catch (_e) {
    return false;
  }
}

// ─── Detection ───

function checkDependencies(options = {}) {
  const projectDir = options.projectDir || process.cwd();
  const { scope, root, packages } = resolveScope(projectDir);

  const missing = packages.filter(
    (name) => !fs.existsSync(path.join(root, 'node_modules', ...name.split('/'), 'package.json'))
  );
  const total = packages.length;
  const resolved = total - missing.length;

  const base = { scope, root, total, resolved, missing };

  if (total === 0) return { ...base, state: 'healthy' };

  // Ordered by actionability. An unpopulated tree is reported as `missing` even
  // when the lockfile is also newer: `npm ci` is the same remedy, and "stale"
  // understates a clone that has never installed anything.
  if (resolved === 0) return { ...base, state: 'missing' };
  if (missing.length > 0) return { ...base, state: 'partial' };
  if (isStale(root)) return { ...base, state: 'stale' };

  return { ...base, state: 'healthy' };
}

// ─── Main ───

const MESSAGES = {
  healthy: () => 'Dependencies installed.',
  missing: () => 'node_modules not installed — run npm ci',
  partial: (r) => `${r.missing.length} of ${r.total} packages missing — run npm ci`,
  stale: () => 'node_modules stale vs lockfile',
};

if (require.main === module) {
  const result = checkDependencies();
  process.stdout.write(JSON.stringify({
    success: true,
    message: MESSAGES[result.state](result),
    data: result,
  }) + '\n');
}

module.exports = { checkDependencies, MESSAGES, STALE_TOLERANCE_MS };
