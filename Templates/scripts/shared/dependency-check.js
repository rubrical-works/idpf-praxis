#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.115.0
 * @description Detect missing, partial, or stale node_modules at session startup, and probe whether each runner the project's testing.suites[] names is on PATH (#3012). Stats node_modules/<name>/package.json for each declared package and compares package-lock.json mtime against node_modules/.package-lock.json; the runner probe goes through lib/runner-probe.js (where / command -v) and never spawns the runner. Read-only and advisory — performs no installation and spawns no npm subprocess.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');
const { resolveSuites } = require('./lib/test-runner.js');
const { probeSuites } = require('./lib/runner-probe.js');

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
 * guarantee. A strict `a > b` comparison therefore reports `stale` on a
 * correctly-installed tree — a warning on every session, which trains the
 * reader to ignore the line that matters.
 *
 * The tolerance separates same-install skew from a genuine change (a human
 * edits package.json and reinstalls, or a pull brings a new lockfile — always
 * seconds to days later). No real staleness is missed: a lockfile that changed
 * because of an edit or a pull is never 30 s from its install.
 *
 * Sized from a PHM-deployed hub framework root (framework_root_0.97.0), where
 * npm wrote package-lock.json 3279 ms after the installed copy while all four
 * declared runtime deps resolved (#2638). The earlier 17 ms figure came from
 * this repo's own install and did not generalize — a framework root installs a
 * different dependency set on a different machine profile, and the window sized
 * from the dev measurement produced exactly the every-session warning the
 * paragraph above names as the cost of getting it wrong.
 *
 * Measure before narrowing this. The relative-to-constant cases in
 * `tests/scripts/shared/dependency-check.test.js` stay green for any value;
 * the literal 3.3 s case is the one that fails if the window shrinks back
 * under a real install's skew.
 */
const STALE_TOLERANCE_MS = 30000;

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

/**
 * Which declared runners are missing from PATH (#3012).
 *
 * A different question from the package check above, asked in every scope: a
 * deployed project's own node_modules is deliberately not inspected, but the
 * binary its `testing.suites[]` names (`npm`, `npx`, `dotnet`, …) is a host
 * matter, and a host with Node but no npm passed this check and then failed
 * every gate with exit 127. The probe resolves the suites through the same
 * declaration reader the gates use, so it sees exactly what they would run.
 *
 * No declaration → nothing probed. A throwing probe degrades to an empty list:
 * the package finding must still reach the block.
 *
 * @returns {Array<{runner: string, suites: string[], error: string|null}>}
 */
function missingRunners(projectDir, probe) {
  try {
    const { suites } = resolveSuites(projectDir);
    if (!Array.isArray(suites) || suites.length === 0) return [];
    const { missing } = probe(suites);
    return Array.isArray(missing) ? missing : [];
  } catch (_e) {
    return [];
  }
}

/**
 * Supply-chain presence for a JS/TS project (#3313).
 *
 * The npm controls (`min-release-age`, `ignore-scripts`) and Dependabot
 * cooldowns reach a project only through one-time offers — /charter's `.npmrc`
 * offer and /ci's `dependabot` feature — so a project chartered before they
 * shipped is never asked, and nothing later names the gap. This reports
 * PRESENCE ONLY: an existing file suppresses its row whatever it contains, so
 * there is no content judgment and no template comparison. Read-only — it
 * stats two paths and writes nothing.
 *
 * JS/TS detection is /charter's own trigger for the offer: `package.json` on
 * disk, or a `testing.suites[]` entry for either language. Suites declare no
 * language field, so an entry counts when a `match` glob ends in a JS/TS
 * extension or its id carries a js/ts/javascript/typescript token
 * (`js-jest`, `none-typescript-unit`).
 *
 * Opt-out follows the tmpCleanup precedent (#2771): absent means enabled, and
 * only the literal `false` under `supplyChainRows.<row>` suppresses that row.
 *
 * @returns {{stack: 'package.json'|'testing.suites'|null, npmrcMissing: boolean, dependabotMissing: boolean}}
 */
const JS_TS_GLOB = /\.[cm]?[jt]sx?$/i;
const JS_TS_ID_TOKENS = new Set(['js', 'ts', 'javascript', 'typescript']);

function isJsTsSuite(suite) {
  if (!suite || typeof suite !== 'object') return false;
  if (Array.isArray(suite.match) && suite.match.some((g) => typeof g === 'string' && JS_TS_GLOB.test(g))) return true;
  return typeof suite.id === 'string' && suite.id.toLowerCase().split(/[-_]/).some((t) => JS_TS_ID_TOKENS.has(t));
}

function checkSupplyChain(projectDir, config) {
  const none = { stack: null, npmrcMissing: false, dependabotMissing: false };
  let stack = null;
  if (fs.existsSync(path.join(projectDir, 'package.json'))) stack = 'package.json';
  else if (Array.isArray(config?.testing?.suites) && config.testing.suites.some(isJsTsSuite)) stack = 'testing.suites';
  if (!stack) return none;

  const rows = config && typeof config.supplyChainRows === 'object' ? config.supplyChainRows : {};
  const enabled = (key) => !(rows && rows[key] === false);
  // GitHub reads either extension for the Dependabot config.
  const hasDependabot = ['dependabot.yml', 'dependabot.yaml']
    .some((f) => fs.existsSync(path.join(projectDir, '.github', f)));
  return {
    stack,
    npmrcMissing: enabled('npmrc') && !fs.existsSync(path.join(projectDir, '.npmrc')),
    dependabotMissing: enabled('dependabot') && !hasDependabot,
  };
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

  const runnersMissing = missingRunners(projectDir, options.probe || probeSuites);
  // Always the PROJECT root, never frameworkPath: the gap is in the user's tree.
  const supplyChain = checkSupplyChain(projectDir, readJson(path.join(projectDir, 'framework-config.json')));
  const base = { scope, root, total, resolved, missing, runnersMissing, supplyChain };

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

/** `; runner \`npm\` not on PATH (suites: unit, types)` — or nothing. */
function runnerClause(r) {
  const list = Array.isArray(r && r.runnersMissing) ? r.runnersMissing : [];
  if (list.length === 0) return '';
  return '; ' + list.map((m) => (
    m.error
      ? `runner \`${m.runner}\` could not be probed (${m.error}; suites: ${m.suites.join(', ')})`
      : `runner \`${m.runner}\` not on PATH (suites: ${m.suites.join(', ')})`
  )).join('; ');
}

const MESSAGES = {
  healthy: (r) => 'Dependencies installed.' + runnerClause(r),
  missing: (r) => 'node_modules not installed — run npm ci' + runnerClause(r),
  partial: (r) => `${r.missing.length} of ${r.total} packages missing — run npm ci` + runnerClause(r),
  stale: (r) => 'node_modules stale vs lockfile' + runnerClause(r),
};

if (require.main === module) {
  const result = checkDependencies();
  process.stdout.write(JSON.stringify({
    success: true,
    message: MESSAGES[result.state](result),
    data: result,
  }) + '\n');
}

module.exports = { checkDependencies, checkSupplyChain, MESSAGES, STALE_TOLERANCE_MS };
