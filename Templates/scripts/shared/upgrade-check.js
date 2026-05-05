#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.91.0
 * @description Check for third-party framework/dependency upgrades. Reads CHARTER.md or Tech-Stack.md for dependency list, queries package registries for latest versions, and throttles checks to once every 14 days via .idpf-update-check.json. Non-blocking; used during session startup.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { readFileSafe, readJsonSafe } = require('./lib/shell-safe.js');

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
 * Detect ecosystems from charter or tech-stack document content.
 * Scans the text for keywords that match known ecosystems.
 * @param {string} content - Content of CHARTER.md or Tech-Stack.md
 * @returns {string[]} Array of detected ecosystem names (deduplicated)
 */
function detectEcosystems(content) {
  if (!content) return [];

  const lower = content.toLowerCase();
  const detected = new Set();

  for (const eco of ECOSYSTEM_REGISTRY) {
    for (const keyword of eco.keywords) {
      if (lower.includes(keyword)) {
        detected.add(eco.name);
        break;
      }
    }
  }

  return Array.from(detected);
}

/**
 * Detect ecosystems by checking for dependency files in the project directory.
 * Fallback when no charter or tech-stack doc is available.
 * @param {string} projectDir - Project root directory
 * @returns {string[]} Array of detected ecosystem names
 */
function detectEcosystemsFromFiles(projectDir) {
  const detected = [];

  for (const eco of ECOSYSTEM_REGISTRY) {
    for (const depFile of eco.dependencyFiles) {
      // Skip glob patterns (e.g., *.csproj)
      if (depFile.includes('*')) continue;

      const depPath = path.join(projectDir, depFile);
      if (readFileSafe(depPath) !== null) {
        detected.push(eco.name);
        break;
      }
    }
  }

  return detected;
}

/**
 * Generate a basic Inception/Tech-Stack.md document from detected ecosystems.
 * @param {string[]} ecosystems - Array of ecosystem names
 * @returns {string} Markdown content for the tech stack document
 */
function generateTechStackContent(ecosystems) {
  const lines = [
    '# Tech Stack',
    '',
    '*Auto-detected by upgrade-check. Update as needed.*',
    ''
  ];

  if (ecosystems.length === 0) {
    lines.push('No ecosystems auto-detected. Add your tech stack details here.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('## Detected Ecosystems');
  lines.push('');
  lines.push('| Ecosystem | Dependency Files | Registry |');
  lines.push('|-----------|-----------------|----------|');

  for (const ecoName of ecosystems) {
    const eco = ECOSYSTEM_REGISTRY.find(e => e.name === ecoName);
    if (eco) {
      lines.push(`| ${eco.name} | ${eco.dependencyFiles.join(', ')} | ${eco.registry} |`);
    }
  }

  lines.push('');
  return lines.join('\n');
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
        const result = execSync(
          `npm view "${packageName}" version`,
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

  // Read tech stack info
  let techContent = '';
  let techStackSource = null;
  const charterPath = path.join(projectDir, 'CHARTER.md');
  const techStackPath = path.join(projectDir, 'Inception', 'Tech-Stack.md');

  const techStackContent = readFileSafe(techStackPath);
  if (techStackContent !== null) {
    techContent = techStackContent;
    techStackSource = 'Inception/Tech-Stack.md';
  } else {
    const charterContent = readFileSafe(charterPath);
    if (charterContent !== null) {
      techContent = charterContent;
      techStackSource = 'CHARTER.md';
    }
  }

  let ecosystems = detectEcosystems(techContent);

  // Fallback: detect from dependency files if no ecosystems found in docs
  if (ecosystems.length === 0) {
    ecosystems = detectEcosystemsFromFiles(projectDir);
  }

  // If Tech-Stack.md is absent but we detected ecosystems, generate it
  if (techStackContent === null && ecosystems.length > 0) {
    const inceptionDir = path.join(projectDir, 'Inception');
    fs.mkdirSync(inceptionDir, { recursive: true });
    fs.writeFileSync(techStackPath, generateTechStackContent(ecosystems));
    techStackSource = 'Inception/Tech-Stack.md (auto-generated)';
  }

  if (ecosystems.length === 0) {
    console.log(JSON.stringify({
      success: true,
      message: 'No recognized ecosystems detected in project.',
      data: { ecosystems: [], outdated: [], techStackSource }
    }));
    writeCheckConfig(projectDir, { lastCheck: new Date().toISOString() });
    process.exit(0);
  }

  // Detect dependency files
  const outdated = [];
  const checked = [];

  for (const eco of ecosystems) {
    const depFiles = getEcosystemDependencyFiles(eco);
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
    message: outdated.length > 0
      ? `Found ${outdated.length} outdated package(s)`
      : 'All packages are up-to-date',
    data: {
      ecosystems,
      checked: checked.length,
      outdated
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
  detectEcosystems,
  detectEcosystemsFromFiles,
  generateTechStackContent,
  parseDependencyVersions,
  queryLatestVersion,
  readCheckConfig,
  writeCheckConfig,
  stripVersionPrefix,
  ECOSYSTEM_REGISTRY,
  COOLDOWN_DAYS,
  CONFIG_FILE
};
