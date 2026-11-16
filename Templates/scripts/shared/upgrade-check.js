#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.119.0
 * @description Check for third-party framework/dependency upgrades. Detects ecosystems from manifest files at the project root (never from CHARTER.md or Tech-Stack.md prose), queries package registries for latest versions, and throttles checks to once every 14 days via .idpf-update-check.json. Non-blocking; used during session startup.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { readFileSafe, readJsonSafe, atomicWriteSync } = require('./lib/shell-safe.js');
const { validateNpmPackageName } = require('./lib/input-validation.js');

// ======================================
//  Constants
// ======================================

const COOLDOWN_DAYS = 14;
const CONFIG_FILE = '.idpf-update-check.json';

/**
 * Ecosystem registry — maps ecosystem names to their dependency files
 * and package registry identifiers. No keyword lists: ecosystems come only
 * from manifests (#2895), so prose matching has nothing to read (#3672).
 */
const ECOSYSTEM_REGISTRY = [
  {
    name: 'Node.js',
    dependencyFiles: ['package.json'],
    registry: 'npm'
  },
  {
    name: 'Python',
    dependencyFiles: ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'],
    registry: 'pypi'
  },
  {
    name: 'Rust',
    dependencyFiles: ['Cargo.toml'],
    registry: 'crates'
  },
  {
    name: 'Go',
    dependencyFiles: ['go.mod'],
    registry: 'go'
  },
  {
    name: 'Ruby',
    dependencyFiles: ['Gemfile'],
    registry: 'rubygems'
  },
  {
    name: 'Java',
    dependencyFiles: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    registry: 'maven'
  },
  {
    name: '.NET',
    dependencyFiles: ['*.csproj', '*.fsproj', 'packages.config'],
    registry: 'nuget'
  },
  {
    name: 'PHP',
    dependencyFiles: ['composer.json'],
    registry: 'packagist'
  }
];

// ======================================
//  Version Comparison
// ======================================

/**
 * Compare two semver version strings.
 * @param {string} a - First version (e.g., "1.2.3" or "v1.2.3")
 * @param {string} b - Second version
 * @returns {number|null} Negative if a < b, 0 if equal, positive if a > b, null if invalid
 */
function compareVersions(a, b) {
  if (!a || !b) return null;

  const parseVer = (v) => {
    const cleaned = String(v).replace(/^v/, '');
    const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/) || cleaned.match(/^(\d+)\.(\d+)/) || cleaned.match(/^(\d+)/);
    if (!match) return null;
    return [
      parseInt(match[1], 10),
      parseInt(match[2] || '0', 10),
      parseInt(match[3] || '0', 10)
    ];
  };

  const pa = parseVer(a);
  const pb = parseVer(b);
  if (!pa || !pb) return null;

  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

// ======================================
//  Cooldown Calculation
// ======================================

/**
 * Check if the cooldown period has expired.
 * @param {string|null|undefined} lastCheckTimestamp - ISO date string of last check
 * @param {number} cooldownDays - Number of days for cooldown
 * @returns {boolean} True if cooldown has expired (check should run)
 */
function isCooldownExpired(lastCheckTimestamp, cooldownDays) {
  if (!lastCheckTimestamp) return true;

  const lastCheck = new Date(lastCheckTimestamp);
  if (isNaN(lastCheck.getTime())) return true;

  const now = new Date();
  const diffMs = now.getTime() - lastCheck.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return diffDays >= cooldownDays;
}

// ======================================
//  Ecosystem Detection
// ======================================

/**
 * Get the dependency file names for a given ecosystem.
 * @param {string} ecosystemName - Name of the ecosystem (case-insensitive)
 * @returns {string[]} Array of dependency file names
 */
function getEcosystemDependencyFiles(ecosystemName) {
  const lower = ecosystemName.toLowerCase();
  const eco = ECOSYSTEM_REGISTRY.find(e => e.name.toLowerCase() === lower);
  return eco ? eco.dependencyFiles : [];
}

/**
 * Ecosystems come from manifest files at the project root, and only from them
 * (#2895). A prose scan of CHARTER.md / Tech-Stack.md used to decide first:
 * it substring-matched keywords ("goal" → Go, "JavaScript" → Java, "trust" →
 * Rust) and, because the manifest check ran only when prose found nothing,
 * one spurious word also suppressed the ecosystem actually present.
 */

/** The codebase-analysis skill's empty-result statement, verbatim. */
const EMPTY_RESULT_STATEMENT = 'No stack detected - no manifest file present at the analyzed root.';

/**
 * List the project root, or [] when it cannot be read. A listing failure only
 * loses glob manifests (`*.csproj`); literal manifests are still opened.
 */
function listRootEntries(projectDir) {
  try {
    const entries = fs.readdirSync(projectDir);
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

/** Match a root entry against a dependency-file pattern supporting `*` only. */
function matchesManifestPattern(entry, pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/\\\\]*');
  return new RegExp(`^${escaped}$`).test(entry);
}

/**
 * Detect ecosystems from the manifest files present at the project root.
 * Glob entries are resolved against the root listing rather than skipped, so a
 * .NET project with only `App.csproj` is not reported as having no manifest.
 * @param {string} projectDir - Project root directory
 * @returns {Array<{name: string, files: string[]}>} Registry order; each
 *   detection names only the manifest files actually found
 */
function detectManifests(projectDir) {
  const entries = listRootEntries(projectDir);
  const detections = [];

  for (const eco of ECOSYSTEM_REGISTRY) {
    const files = [];
    for (const depFile of eco.dependencyFiles) {
      if (depFile.includes('*')) {
        for (const entry of entries.filter(e => matchesManifestPattern(e, depFile)).sort()) {
          if (!files.includes(entry)) files.push(entry);
        }
        continue;
      }
      if (readFileSafe(path.join(projectDir, depFile)) !== null) files.push(depFile);
    }
    if (files.length > 0) detections.push({ name: eco.name, files });
  }

  return detections;
}

/**
 * Detect ecosystem names from manifest files at the project root.
 * @param {string} projectDir - Project root directory
 * @returns {string[]} Array of detected ecosystem names, registry order
 */
function detectEcosystemsFromFiles(projectDir) {
  return detectManifests(projectDir).map(d => d.name);
}

/**
 * The ecosystem list for a project, from its root manifests (#2895).
 *
 * Writes nothing (#3650): the generated Tech-Stack.md artifact this used to
 * write and compare is retired with the lifecycle directory that held it. The charter's Tech Stack table
 * names the stack; the manifests read here hold the versions.
 * @param {string} projectDir - Project root directory
 * @returns {{detections: Array<{name: string, files: string[]}>, ecosystems: string[],
 *   techStackSource: string, written: false}}
 */
function resolveTechStack(projectDir) {
  const detections = detectManifests(projectDir);
  return { detections, ecosystems: detections.map(d => d.name), techStackSource: 'root manifests', written: false };
}

// ======================================
//  Dependency Version Parsing
// ======================================

/**
 * Strip semver range prefixes (^, ~, >=, >, <=, <, =) from a version string.
 * @param {string} version - Version string possibly with range prefix
 * @returns {string} Clean version string
 */
function stripVersionPrefix(version) {
  return version.replace(/^[\^~>=<]*/, '').trim();
}

/**
 * Parse dependency versions from a dependency file.
 * @param {string} filename - The dependency filename (e.g., "package.json")
 * @param {string} content - The file content
 * @returns {Array<{name: string, installed: string, type: string}>}
 */
function parseDependencyVersions(filename, content) {
  const basename = path.basename(filename);

  if (basename === 'package.json') {
    return parsePackageJson(content);
  }

  if (basename === 'requirements.txt') {
    return parseRequirementsTxt(content);
  }

  return [];
}

/**
 * Parse package.json for dependency versions.
 */
function parsePackageJson(content) {
  const deps = [];
  try {
    const pkg = JSON.parse(content);

    if (pkg.dependencies) {
      for (const [name, version] of Object.entries(pkg.dependencies)) {
        deps.push({ name, installed: stripVersionPrefix(version), type: 'dependency' });
      }
    }

    if (pkg.devDependencies) {
      for (const [name, version] of Object.entries(pkg.devDependencies)) {
        deps.push({ name, installed: stripVersionPrefix(version), type: 'devDependency' });
      }
    }
  } catch {
    // Invalid JSON
  }
  return deps;
}

/**
 * Parse requirements.txt for dependency versions.
 */
function parseRequirementsTxt(content) {
  const deps = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Match patterns: package==version, package>=version, package~=version
    const match = trimmed.match(/^([a-zA-Z0-9_.-]+)\s*[><=~!]+\s*([\d.]+)/);
    if (match) {
      deps.push({ name: match[1], installed: match[2], type: 'dependency' });
    }
  }
  return deps;
}

// ======================================
//  Registry Queries
// ======================================

/**
 * Resolve how to spawn npm without a shell.
 * On win32 npm is npm.cmd, which execFileSync cannot spawn without a shell
 * (ENOENT for 'npm', EINVAL for 'npm.cmd' since CVE-2024-27980), so run the
 * npm-cli.js that ships beside the node binary instead (#3050).
 * @param {object} [env]
 * @param {string} [env.platform] - Defaults to process.platform
 * @param {string} [env.execPath] - Defaults to process.execPath
 * @param {Function} [env.exists] - Defaults to fs.existsSync
 * @returns {{file: string, prefix: string[]}|null} null when no shell-free npm exists
 */
function resolveNpmCommand({ platform = process.platform, execPath = process.execPath, exists = fs.existsSync } = {}) {
  if (platform !== 'win32') return { file: 'npm', prefix: [] };
  const cli = path.win32.join(path.win32.dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  return exists(cli) ? { file: execPath, prefix: [cli] } : null;
}

// PEP 508 project name: starts with an alphanumeric, then letters, digits, `.`, `_`, `-`.
const PYPI_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Query a package registry for the latest version of a package.
 * @param {string} registry - Registry type ('npm', 'pypi', 'crates')
 * @param {string} packageName - Package name
 * @param {object} [env] - Platform overrides for resolveNpmCommand (tests), and timeoutMs
 * @returns {string|null} Latest version or null on failure
 */
function queryLatestVersion(registry, packageName, env = {}) {
  const timeoutMs = env.timeoutMs || LOOKUP_TIMEOUT_MS;
  try {
    switch (registry) {
      case 'npm': {
        // packageName is a package.json dependency KEY — arbitrary, and in a
        // cloned repo attacker-controlled. Validate against the npm grammar and
        // spawn via execFileSync array-args so it never reaches a shell (#2456).
        const safeName = validateNpmPackageName(packageName);
        const npm = resolveNpmCommand(env);
        if (!npm) return null;
        const result = execFileSync(
          npm.file,
          [...npm.prefix, 'view', safeName, 'version'],
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: timeoutMs }
        );
        return result.trim();
      }
      case 'pypi': {
        // packageName comes from requirements.txt — in a cloned repo
        // attacker-controlled. A name must start with an alphanumeric (PEP 508),
        // so `--pre` or `-v` never reaches pip as an option (#3693).
        if (typeof packageName !== 'string' || !PYPI_NAME_PATTERN.test(packageName)) return null;
        // Array-args and a JS first-line parse: the old `2>/dev/null | head -1`
        // shell string cannot run under cmd.exe (#3050).
        const result = execFileSync(
          'pip',
          ['index', 'versions', packageName],
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: timeoutMs }
        );
        const match = String(result).split(/\r?\n/)[0].match(/\(([^)]+)\)/);
        return match ? match[1] : null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// Per-lookup timeout, and the overall budget for all lookups. The budget sits
// under startup-hook.js's 40 s final kill stage so the check reports instead
// of being killed (#3050).
const LOOKUP_TIMEOUT_MS = 10000;
const LOOKUP_BUDGET_MS = 25000;

/**
 * Query every dependency under one overall time budget.
 * Lookups run in order; each gets min(LOOKUP_TIMEOUT_MS, budget remaining),
 * and once the budget is spent the rest are failed without a spawn, so N
 * dependencies cost at most the budget rather than N × 10 s (#3050).
 * @param {Array<{dep: object, ecosystem: string, registry: string}>} items
 * @param {object} [opts]
 * @param {Function} [opts.query] - (registry, name, timeoutMs) → version|null
 * @param {number} [opts.budgetMs]
 * @param {Function} [opts.now]
 * @returns {{checked: object[], outdated: object[], failed: object[]}}
 */
function checkDependencies(items, {
  query = (registry, name, timeoutMs) => queryLatestVersion(registry, name, { timeoutMs }),
  budgetMs = LOOKUP_BUDGET_MS,
  now = Date.now
} = {}) {
  const checked = [];
  const outdated = [];
  const failed = [];
  const start = now();

  for (const { dep, ecosystem, registry } of items) {
    const remaining = budgetMs - (now() - start);
    if (remaining <= 0) {
      failed.push({ ...dep, ecosystem, reason: 'time budget exceeded' });
      continue;
    }
    const latest = query(registry, dep.name, Math.min(LOOKUP_TIMEOUT_MS, remaining));
    if (!latest) {
      failed.push({ ...dep, ecosystem, reason: 'lookup failed' });
      continue;
    }
    checked.push({ ...dep, latest, ecosystem });
    if (compareVersions(dep.installed, latest) < 0) {
      outdated.push({ ...dep, latest, ecosystem });
    }
  }
  return { checked, outdated, failed };
}

/**
 * Build the result message and decide whether to advance lastCheck.
 * A lookup that failed is unknown, never up to date; when nothing could be
 * checked at all, lastCheck stays put so the next session retries (#3050).
 * When ecosystems were detected but none of their manifests yielded a
 * dependency (no parser or registry for them), nothing was queried, so the
 * message says so rather than "up-to-date" (#3672); lastCheck still advances,
 * as for no ecosystems at all — the answer cannot change until the manifests do.
 * @param {{checked: object[], outdated: object[], failed: object[], ecosystems?: string[]}} result
 * @returns {{message: string, writeLastCheck: boolean, failed: object[]}}
 */
function summarizeCheck({ checked, outdated, failed, ecosystems = [] }) {
  const failedList = failed.map(({ name, ecosystem, reason }) => ({ name, ecosystem, reason }));
  if (checked.length === 0 && failed.length === 0 && ecosystems.length > 0) {
    return {
      message: `No dependencies could be enumerated for the detected ecosystem(s): ${ecosystems.join(', ')}; nothing was checked`,
      writeLastCheck: true,
      failed: failedList
    };
  }
  if (checked.length === 0 && failed.length > 0) {
    return {
      message: `Could not query the registry for any of ${failed.length} package(s); nothing was checked`,
      writeLastCheck: false,
      failed: failedList
    };
  }
  const parts = [outdated.length > 0
    ? `Found ${outdated.length} outdated package(s)`
    : (failed.length > 0 ? `No outdated package(s) among ${checked.length} checked` : 'All packages are up-to-date')];
  if (failed.length > 0) parts.push(`${failed.length} package(s) could not be checked`);
  return { message: parts.join('; '), writeLastCheck: true, failed: failedList };
}

// ======================================
//  Config File Management
// ======================================

/**
 * Read the update check config file.
 * @param {string} projectDir - Project root directory
 * @returns {object} Config object (empty object if file doesn't exist)
 */
function readCheckConfig(projectDir) {
  const configPath = path.join(projectDir, CONFIG_FILE);
  const data = readJsonSafe(configPath);
  return data || {};
}

/**
 * Write the update check config file.
 * @param {string} projectDir - Project root directory
 * @param {object} config - Config object to write
 */
function writeCheckConfig(projectDir, config) {
  const configPath = path.join(projectDir, CONFIG_FILE);
  atomicWriteSync(configPath, JSON.stringify(config, null, 2) + '\n'); // #3063
}

// ======================================
//  Main Entry Point
// ======================================

async function main() {
  const projectDir = process.cwd();
  const forceCheck = process.argv.includes('--force');

  // Check cooldown
  const config = readCheckConfig(projectDir);
  if (!forceCheck && !isCooldownExpired(config.lastCheck, COOLDOWN_DAYS)) {
    // Silent skip — cooldown not expired
    console.log(JSON.stringify({
      success: true,
      message: 'Cooldown active — skipping upgrade check.',
      data: { skipped: true, lastCheck: config.lastCheck, cooldownDays: COOLDOWN_DAYS }
    }));
    process.exit(0);
  }

  // Ecosystems come from root manifests only; CHARTER.md prose never adds or
  // suppresses one (#2895), and nothing is written (#3650).
  const { detections, ecosystems, techStackSource } = resolveTechStack(projectDir);

  if (ecosystems.length === 0) {
    console.log(JSON.stringify({
      success: true,
      message: EMPTY_RESULT_STATEMENT,
      data: { ecosystems: [], outdated: [], techStackSource }
    }));
    writeCheckConfig(projectDir, { lastCheck: new Date().toISOString() });
    process.exit(0);
  }

  // Query each ecosystem's registry for the manifest files actually found
  const items = [];
  for (const { name: eco, files: depFiles } of detections) {
    const ecoInfo = ECOSYSTEM_REGISTRY.find(e => e.name === eco);

    for (const depFile of depFiles) {
      const depPath = path.join(projectDir, depFile);
      const content = readFileSafe(depPath);
      if (content === null) continue;

      for (const dep of parseDependencyVersions(depFile, content)) {
        items.push({ dep, ecosystem: eco, registry: ecoInfo.registry });
      }
    }
  }

  const { checked, outdated, failed } = checkDependencies(items);
  const summary = summarizeCheck({ checked, outdated, failed, ecosystems });

  // Update config with check timestamp — not when every lookup failed (#3050)
  if (summary.writeLastCheck) {
    writeCheckConfig(projectDir, { lastCheck: new Date().toISOString() });
  }

  // Output result
  console.log(JSON.stringify({
    success: true,
    message: summary.message,
    data: {
      ecosystems,
      checked: checked.length,
      failed: summary.failed,
      outdated,
      techStackSource
    }
  }));
}

// ======================================
//  Exports & Main Guard
// ======================================

if (require.main === module) {
  main().catch(err => {
    console.log(JSON.stringify({
      success: false,
      message: `Upgrade check failed: ${err.message}`,
      data: { error: err.message }
    }));
    process.exit(0); // Non-blocking — don't fail startup
  });
}

module.exports = {
  compareVersions,
  isCooldownExpired,
  getEcosystemDependencyFiles,
  detectEcosystemsFromFiles,
  detectManifests,
  resolveTechStack,
  parseDependencyVersions,
  queryLatestVersion,
  resolveNpmCommand,
  summarizeCheck,
  checkDependencies,
  LOOKUP_BUDGET_MS,
  readCheckConfig,
  writeCheckConfig,
  stripVersionPrefix,
  ECOSYSTEM_REGISTRY,
  COOLDOWN_DAYS,
  CONFIG_FILE
};
