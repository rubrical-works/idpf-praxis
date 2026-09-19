#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.104.0
 * @description Check for third-party framework/dependency upgrades. Detects ecosystems from manifest files at the project root (never from CHARTER.md or Tech-Stack.md prose), queries package registries for latest versions, and throttles checks to once every 14 days via .idpf-update-check.json. Non-blocking; used during session startup.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');
const { readFileSafe, readJsonSafe } = require('./lib/shell-safe.js');
const { validateNpmPackageName } = require('./lib/input-validation.js');

// ======================================
//  Constants
// ======================================

const COOLDOWN_DAYS = 14;
const CONFIG_FILE = '.idpf-update-check.json';

/**
 * Ecosystem registry — maps ecosystem names to their dependency files
 * and package registry identifiers.
 */
const ECOSYSTEM_REGISTRY = [
  {
    name: 'Node.js',
    keywords: ['node.js', 'node', 'javascript', 'npm', 'yarn', 'pnpm', 'bun'],
    dependencyFiles: ['package.json'],
    registry: 'npm'
  },
  {
    name: 'Python',
    keywords: ['python', 'pip', 'django', 'flask', 'fastapi', 'poetry'],
    dependencyFiles: ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'],
    registry: 'pypi'
  },
  {
    name: 'Rust',
    keywords: ['rust', 'cargo', 'crate'],
    dependencyFiles: ['Cargo.toml'],
    registry: 'crates'
  },
  {
    name: 'Go',
    keywords: ['go', 'golang'],
    dependencyFiles: ['go.mod'],
    registry: 'go'
  },
  {
    name: 'Ruby',
    keywords: ['ruby', 'rails', 'gem', 'bundler'],
    dependencyFiles: ['Gemfile'],
    registry: 'rubygems'
  },
  {
    name: 'Java',
    keywords: ['java', 'maven', 'gradle', 'spring'],
    dependencyFiles: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    registry: 'maven'
  },
  {
    name: '.NET',
    keywords: ['.net', 'dotnet', 'c#', 'csharp', 'nuget'],
    dependencyFiles: ['*.csproj', '*.fsproj', 'packages.config'],
    registry: 'nuget'
  },
  {
    name: 'PHP',
    keywords: ['php', 'composer', 'laravel', 'symfony'],
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

/** Marker the upgrade-check writer puts on the artifact it generates. */
const TECH_STACK_MARKER = '*Auto-detected by upgrade-check.';

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
 * Generate Inception/Tech-Stack.md from manifest detections.
 *
 * Every row cites the manifest files that were opened — never the registry's
 * full list for that ecosystem — and nothing else: no source extensions,
 * Dockerfile or CI evidence. With no detection it writes the codebase-analysis
 * skill's empty-result statement and names no technology.
 * @param {Array<{name: string, files: string[]}>} detections - From detectManifests()
 * @returns {string} Markdown content for the tech stack document
 */
function generateTechStackContent(detections) {
  const rows = (detections || []).filter(d => d && Array.isArray(d.files) && d.files.length > 0);
  const lines = [
    '# Tech Stack',
    '',
    `${TECH_STACK_MARKER} Update as needed.*`,
    ''
  ];

  if (rows.length === 0) {
    lines.push(EMPTY_RESULT_STATEMENT);
    lines.push('');
    return lines.join('\n');
  }

  lines.push('## Detected Ecosystems');
  lines.push('');
  lines.push('| Ecosystem | Manifest Found | Registry |');
  lines.push('|-----------|----------------|----------|');

  for (const detection of rows) {
    const eco = ECOSYSTEM_REGISTRY.find(e => e.name === detection.name);
    if (eco) {
      lines.push(`| ${eco.name} | ${detection.files.join(', ')} | ${eco.registry} |`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Compare an existing Tech-Stack.md against the manifest result.
 *
 * Only a file carrying the upgrade-check marker is compared: a hand-written
 * file is the project's own statement of intent, not a detection that can be
 * wrong. Recorded ecosystems are read from the first cell of table rows and
 * limited to registry names, so the comparison never re-derives prose.
 * @param {string} content - Existing Tech-Stack.md content
 * @param {string[]} detected - Ecosystem names from the manifests
 * @returns {{marked: boolean, recorded: string[], detected: string[],
 *   missing: string[], extra: string[], agrees: boolean}}
 */
function compareTechStackArtifact(content, detected) {
  const text = typeof content === 'string' ? content : '';
  const marked = text.includes(TECH_STACK_MARKER);
  const names = new Set(ECOSYSTEM_REGISTRY.map(e => e.name));
  const recorded = [];

  for (const line of text.split(/\r?\n/)) {
    const cell = line.match(/^\|\s*([^|]+?)\s*\|/);
    if (cell && names.has(cell[1]) && !recorded.includes(cell[1])) recorded.push(cell[1]);
  }

  const missing = detected.filter(n => !recorded.includes(n));
  const extra = recorded.filter(n => !detected.includes(n));
  return { marked, recorded, detected: [...detected], missing, extra, agrees: missing.length === 0 && extra.length === 0 };
}

/**
 * Decide the ecosystem list and the Tech-Stack.md outcome for a project.
 *
 * An absent Inception/Tech-Stack.md is written from the manifests (including
 * the empty-result form). An existing file is never rewritten; when it carries
 * the upgrade-check marker and disagrees with the manifests, the disagreement
 * is returned for the check to report.
 * @param {string} projectDir - Project root directory
 * @returns {{detections: Array<{name: string, files: string[]}>, ecosystems: string[],
 *   techStackSource: string, written: boolean,
 *   disagreement: null|{recorded: string[], detected: string[], missing: string[], extra: string[]}}}
 */
function resolveTechStack(projectDir) {
  const detections = detectManifests(projectDir);
  const ecosystems = detections.map(d => d.name);
  const techStackPath = path.join(projectDir, 'Inception', 'Tech-Stack.md');
  const existing = readFileSafe(techStackPath);

  if (existing === null) {
    fs.mkdirSync(path.join(projectDir, 'Inception'), { recursive: true });
    fs.writeFileSync(techStackPath, generateTechStackContent(detections));
    return {
      detections,
      ecosystems,
      techStackSource: 'Inception/Tech-Stack.md (auto-generated)',
      written: true,
      disagreement: null
    };
  }

  const cmp = compareTechStackArtifact(existing, ecosystems);
  return {
    detections,
    ecosystems,
    techStackSource: 'Inception/Tech-Stack.md',
    written: false,
    disagreement: cmp.marked && !cmp.agrees
      ? { recorded: cmp.recorded, detected: cmp.detected, missing: cmp.missing, extra: cmp.extra }
      : null
  };
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
 * Query a package registry for the latest version of a package.
 * @param {string} registry - Registry type ('npm', 'pypi', 'crates')
 * @param {string} packageName - Package name
 * @returns {string|null} Latest version or null on failure
 */
function queryLatestVersion(registry, packageName) {
  try {
    switch (registry) {
      case 'npm': {
        // packageName is a package.json dependency KEY — arbitrary, and in a
        // cloned repo attacker-controlled. Validate against the npm grammar and
        // spawn via execFileSync array-args so it never reaches a shell (#2456).
        const safeName = validateNpmPackageName(packageName);
        const result = execFileSync(
          'npm',
          ['view', safeName, 'version'],
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 }
        );
        return result.trim();
      }
      case 'pypi': {
        const result = execSync(
          `pip index versions "${packageName}" 2>/dev/null | head -1`,
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 }
        );
        const match = result.match(/\(([^)]+)\)/);
        return match ? match[1] : null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
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
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
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

  // Ecosystems come from root manifests only; CHARTER.md and Tech-Stack.md
  // prose never add or suppress one (#2895). The same list drives the artifact
  // and the registry queries below.
  const {
    detections,
    ecosystems,
    techStackSource,
    disagreement
  } = resolveTechStack(projectDir);

  // A marked artifact disagreeing with the manifests is reported, never
  // silently rewritten — it may be a fabrication from the old prose scan.
  const disagreementNote = disagreement
    ? ` Inception/Tech-Stack.md (auto-detected) lists ${disagreement.recorded.join(', ') || 'no ecosystem'}` +
      ` but the manifests show ${disagreement.detected.join(', ') || 'none'}; the file was not rewritten.`
    : '';

  if (ecosystems.length === 0) {
    console.log(JSON.stringify({
      success: true,
      message: `${EMPTY_RESULT_STATEMENT}${disagreementNote}`,
      data: { ecosystems: [], outdated: [], techStackSource, techStackDisagreement: disagreement }
    }));
    writeCheckConfig(projectDir, { lastCheck: new Date().toISOString() });
    process.exit(0);
  }

  // Query each ecosystem's registry for the manifest files actually found
  const outdated = [];
  const checked = [];

  for (const { name: eco, files: depFiles } of detections) {
    const ecoInfo = ECOSYSTEM_REGISTRY.find(e => e.name === eco);

    for (const depFile of depFiles) {
      const depPath = path.join(projectDir, depFile);
      const content = readFileSafe(depPath);
      if (content === null) continue;

      const deps = parseDependencyVersions(depFile, content);
      for (const dep of deps) {
        const latest = queryLatestVersion(ecoInfo.registry, dep.name);
        if (!latest) continue;

        checked.push({ ...dep, latest, ecosystem: eco });

        if (compareVersions(dep.installed, latest) < 0) {
          outdated.push({ ...dep, latest, ecosystem: eco });
        }
      }
    }
  }

  // Update config with check timestamp
  writeCheckConfig(projectDir, { lastCheck: new Date().toISOString() });

  // Output result
  console.log(JSON.stringify({
    success: true,
    message: (outdated.length > 0
      ? `Found ${outdated.length} outdated package(s)`
      : 'All packages are up-to-date') + (disagreementNote ? `.${disagreementNote}` : ''),
    data: {
      ecosystems,
      checked: checked.length,
      outdated,
      techStackSource,
      techStackDisagreement: disagreement
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
  generateTechStackContent,
  compareTechStackArtifact,
  resolveTechStack,
  parseDependencyVersions,
  queryLatestVersion,
  readCheckConfig,
  writeCheckConfig,
  stripVersionPrefix,
  ECOSYSTEM_REGISTRY,
  COOLDOWN_DAYS,
  CONFIG_FILE
};
