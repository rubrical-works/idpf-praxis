#!/usr/bin/env node
/**
 * @framework-script 0.53.0
 * IDPF Framework Update Fetcher
 *
 * Updates the framework installation from the distribution repository.
 *
 * Usage:
 *   node fetch-updates.js              # From project or framework directory
 *
 * Modes:
 *   1. Self-update: Run from framework directory (has framework-manifest.json)
 *   2. Project update: Run from project directory (has framework-config.json)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ======================================
//  Configuration
// ======================================

const DIST_REPO = 'https://github.com/rubrical-studios/idpf-praxis-dist.git';
const TEMP_DIR = path.join(require('os').tmpdir(), 'idpf-framework-update');

// ======================================
//  Console Colors
// ======================================

const colors = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

function log(msg = '') { console.log(msg); }
function logSuccess(msg) { console.log(colors.green(msg)); }
function logError(msg) { console.log(colors.red(msg)); }

// ======================================
//  Utility Functions
// ======================================

/**
 * Read framework-config.json from project directory
 */
function readConfig() {
  const configPath = path.join(process.cwd(), 'framework-config.json');
  if (!fs.existsSync(configPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Check if running from framework directory (has framework-manifest.json)
 */
function isFrameworkDirectory() {
  const manifestPath = path.join(process.cwd(), 'framework-manifest.json');
  return fs.existsSync(manifestPath);
}

/**
 * Read version from framework-manifest.json
 */
function readVersion(frameworkPath) {
  const manifestPath = path.join(frameworkPath, 'framework-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return manifest.version || null;
  } catch {
    return null;
  }
}

/**
 * Flush file to disk (forces Windows to write cached data)
 * This ensures copyFileSync writes are fully persisted before reading.
 */
function flushFile(filePath) {
  try {
    // Open with 'r+' to get a writable descriptor without truncating
    const fd = fs.openSync(filePath, 'r+');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
  } catch {
    // Ignore errors - file might be read-only or not exist
  }
}

/**
 * Read version with fresh file handle (bypasses Windows file cache)
 * Used after file updates to ensure we read the newly written content.
 */
function readVersionFresh(frameworkPath) {
  const manifestPath = path.join(frameworkPath, 'framework-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    // Force OS to flush any pending writes before reading
    flushFile(manifestPath);

    // Force fresh read using explicit file descriptor operations
    const fd = fs.openSync(manifestPath, 'r');
    const stats = fs.fstatSync(fd);
    const buffer = Buffer.alloc(stats.size);
    fs.readSync(fd, buffer, 0, stats.size, 0);
    fs.closeSync(fd);

    const manifest = JSON.parse(buffer.toString('utf8'));
    return manifest.version || null;
  } catch {
    return null;
  }
}

/**
 * Get latest version from dist repo
 */
function getLatestVersion() {
  try {
    const result = execSync(`git ls-remote --tags ${DIST_REPO}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const tags = result
      .split('\n')
      .filter(line => line.includes('refs/tags/v'))
      .map(line => {
        const match = line.match(/refs\/tags\/(v[\d.]+)/);
        return match ? match[1] : null;
      })
      .filter(Boolean)
      .sort((a, b) => {
        const aParts = a.slice(1).split('.').map(Number);
        const bParts = b.slice(1).split('.').map(Number);
        for (let i = 0; i < 3; i++) {
          if (aParts[i] !== bParts[i]) return bParts[i] - aParts[i];
        }
        return 0;
      });
    return tags[0] || null;
  } catch {
    return null;
  }
}

/**
 * Remove directory recursively
 */
function removeDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Copy directory recursively
 */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Update framework files from temp directory
 * @returns {string[]} Array of files that failed to update (e.g., locked on Windows)
 */
function updateFrameworkFiles(frameworkPath) {
  // Files/directories to preserve during update
  const PRESERVE = ['.git', 'installed-projects.json'];
  const failedFiles = [];

  // Clear framework directory (except preserved items)
  log(colors.dim('Updating framework files...'));
  const entries = fs.readdirSync(frameworkPath);
  for (const entry of entries) {
    if (PRESERVE.includes(entry)) continue;
    const entryPath = path.join(frameworkPath, entry);
    try {
      fs.rmSync(entryPath, { recursive: true, force: true });
    } catch {
      // File might be locked (e.g., this script on Windows) - will try to overwrite
    }
  }

  // Copy from temp to framework path
  const tempEntries = fs.readdirSync(TEMP_DIR);
  for (const entry of tempEntries) {
    if (entry === '.git') continue;
    const srcPath = path.join(TEMP_DIR, entry);
    const destPath = path.join(frameworkPath, entry);
    try {
      if (fs.statSync(srcPath).isDirectory()) {
        copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    } catch (_err) {
      // File might be locked on Windows (e.g., this script itself)
      failedFiles.push(entry);
    }
  }

  return failedFiles;
}

// ======================================
//  Main Update Process
// ======================================

async function main() {
  log();
  log(colors.cyan('╔══════════════════════════════════════╗'));
  log(colors.cyan('║   IDPF Framework Update Fetcher      ║'));
  log(colors.cyan('╚══════════════════════════════════════╝'));
  log();

  // Determine mode: self-update or project update
  const isSelfUpdate = isFrameworkDirectory();
  const config = isSelfUpdate ? null : readConfig();

  let frameworkPath;
  let updateConfigFile = false;

  if (isSelfUpdate) {
    // Self-update mode: updating the framework directory itself
    frameworkPath = process.cwd();
    log(colors.yellow('  Mode: Self-update (framework directory)'));
  } else if (config) {
    // Project update mode: updating framework from project directory
    frameworkPath = config.frameworkPath;
    updateConfigFile = true;
    log(colors.yellow('  Mode: Project update'));
    if (!frameworkPath || !fs.existsSync(frameworkPath)) {
      logError(`ERROR: Framework path not found: ${frameworkPath}`);
      process.exit(1);
    }
  } else {
    logError('ERROR: Neither framework-manifest.json nor framework-config.json found');
    logError('Run this script from either:');
    logError('  - Framework directory (for self-update)');
    logError('  - Project directory (for project update)');
    process.exit(1);
  }

  // Get current version
  const currentVersion = readVersion(frameworkPath);
  log(`  Framework path: ${colors.cyan(frameworkPath)}`);
  log(`  Current version: ${currentVersion ? colors.yellow(currentVersion) : colors.dim('unknown')}`);
  log();

  // Get latest version
  log(colors.dim('Checking for updates...'));
  const latestVersion = getLatestVersion();

  if (!latestVersion) {
    logError('ERROR: Could not fetch latest version from dist repo');
    process.exit(1);
  }

  log(`  Latest version: ${colors.green(latestVersion.slice(1))}`);
  log();

  // Compare versions
  if (currentVersion && `v${currentVersion}` === latestVersion) {
    logSuccess('Already up to date!');
    process.exit(0);
  }

  // Clone dist repo to temp directory
  log(colors.dim('Downloading update...'));
  removeDir(TEMP_DIR);

  try {
    execSync(`git clone --depth 1 --branch ${latestVersion} ${DIST_REPO} ${TEMP_DIR}`, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (_err) {
    logError('ERROR: Failed to download update');
    removeDir(TEMP_DIR);
    process.exit(1);
  }

  // Update framework files
  const failedFiles = updateFrameworkFiles(frameworkPath);

  // Cleanup
  removeDir(TEMP_DIR);

  // Verify the update by reading the new version
  // Use readVersionFresh to bypass Windows file system caching
  const newVersion = readVersionFresh(frameworkPath);
  const expectedVersion = latestVersion.slice(1);

  if (newVersion !== expectedVersion) {
    log();
    logError(`ERROR: Version verification failed!`);
    logError(`  Expected: ${expectedVersion}`);
    logError(`  Found: ${newVersion || 'unknown'}`);
    if (failedFiles.length > 0) {
      logError(`  Failed to update: ${failedFiles.join(', ')}`);
    }
    logError('');
    logError('This may be caused by locked files (e.g., running script on Windows).');
    logError('Try closing any editors or terminals using framework files and run again.');
    process.exit(1);
  }

  // Report any files that couldn't be updated (non-critical if version verified)
  if (failedFiles.length > 0) {
    log(colors.yellow(`  Note: Some files were locked and may need manual update:`));
    log(colors.yellow(`    ${failedFiles.join(', ')}`));
  }

  // Update config version (only for project update mode)
  if (updateConfigFile && config) {
    config.installedVersion = expectedVersion;
    config.installedDate = new Date().toISOString().split('T')[0];
    fs.writeFileSync(
      path.join(process.cwd(), 'framework-config.json'),
      JSON.stringify(config, null, 2)
    );
    log(colors.dim('Updated framework-config.json with new version.'));
  }

  log();
  logSuccess(`Updated to version ${expectedVersion}`);
  log();
}

main().catch(err => {
  logError(`Error: ${err.message}`);
  removeDir(TEMP_DIR);
  process.exit(1);
});
