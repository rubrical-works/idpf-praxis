#!/usr/bin/env node
/**
 * @framework-script 0.48.1
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
const readline = require('readline');

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
 * Check if running from the -dist repository
 * The -dist repo should not prompt about extensions - just overwrite files
 */
function isDistRepository() {
  try {
    const remoteUrl = execSync('git config --get remote.origin.url', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    return remoteUrl.includes('idpf-praxis-dist');
  } catch {
    return false;
  }
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
 * On Windows, fs.readFileSync can return stale cached data when reading
 * a file immediately after it was written by copyFileSync.
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

// ======================================
//  Extensibility Functions
// ======================================

/**
 * Parse command file header to extract category (EXTENSIBLE or MANAGED)
 * Inlined from install/lib/extensibility.js for standalone operation
 */
function parseCommandHeader(content) {
  const headerRegex = /<!--\s*(EXTENSIBLE|MANAGED)(?::\s*v?([\d.]+))?\s*-->/i;
  const match = content.match(headerRegex);
  if (!match) return null;
  return {
    category: match[1].toUpperCase(),
    version: match[2] || null
  };
}

/**
 * Extract all USER-EXTENSION blocks from content
 * Returns Map of extension ID → content between markers
 * Inlined from install/lib/extensibility.js for standalone operation
 */
function extractExtensionBlocks(content) {
  const blocks = new Map();
  const blockRegex = /<!--\s*USER-EXTENSION-START:\s*(\S+)\s*-->([\s\S]*?)<!--\s*USER-EXTENSION-END:\s*\1\s*-->/g;
  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    const id = match[1];
    const innerContent = match[2].trim();
    if (innerContent) {
      blocks.set(id, innerContent);
    }
  }
  return blocks;
}

/**
 * Check if a file has non-empty user extensions
 */
function hasUserExtensions(filePath) {
  if (!fs.existsSync(filePath)) return false;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const header = parseCommandHeader(content);
    if (!header || header.category !== 'EXTENSIBLE') return false;
    const blocks = extractExtensionBlocks(content);
    return blocks.size > 0;
  } catch {
    return false;
  }
}

/**
 * Scan for extensible files with user extensions in the target directory
 * @param {string} frameworkPath - Path to check for extensible files
 * @param {string} tempPath - Path to new template files
 * @returns {Array<{file: string, extensions: string[]}>} Files with user extensions
 */
function scanForUserExtensions(frameworkPath, tempPath) {
  const extensibleFiles = [];
  const commandsDir = path.join(frameworkPath, 'Templates', 'commands');
  const tempCommandsDir = path.join(tempPath, 'Templates', 'commands');

  if (!fs.existsSync(commandsDir) || !fs.existsSync(tempCommandsDir)) {
    return extensibleFiles;
  }

  const files = fs.readdirSync(tempCommandsDir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const existingPath = path.join(commandsDir, file);
    const tempFilePath = path.join(tempCommandsDir, file);

    // Check if new file is marked EXTENSIBLE
    const tempContent = fs.readFileSync(tempFilePath, 'utf8');
    const tempHeader = parseCommandHeader(tempContent);
    if (!tempHeader || tempHeader.category !== 'EXTENSIBLE') continue;

    // Check if existing file has user extensions
    if (hasUserExtensions(existingPath)) {
      const content = fs.readFileSync(existingPath, 'utf8');
      const blocks = extractExtensionBlocks(content);
      extensibleFiles.push({
        file: `Templates/commands/${file}`,
        extensions: Array.from(blocks.keys())
      });
    }
  }

  return extensibleFiles;
}

// ======================================
//  User Prompt Functions
// ======================================

/**
 * Prompt user for input (promise-based)
 */
function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

/**
 * Create backup directory and copy files
 */
function createBackup(frameworkPath, files) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = path.join(frameworkPath, '.backup', `pre-upgrade-${timestamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  for (const fileInfo of files) {
    const srcPath = path.join(frameworkPath, fileInfo.file);
    const destDir = path.join(backupDir, path.dirname(fileInfo.file));
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcPath, path.join(destDir, path.basename(fileInfo.file)));
  }

  return backupDir;
}

/**
 * Update framework files from temp directory
 * @param {string} frameworkPath - Target framework directory
 * @param {Map<string, string>|null} preservedExtensions - Map of file → preserved content (null = no preservation)
 * @returns {string[]} Array of files that failed to update (e.g., locked on Windows)
 */
function updateFrameworkFiles(frameworkPath, preservedExtensions = null) {
  // Files/directories to preserve during update
  const PRESERVE = ['.git', 'installed-projects.json', '.backup'];
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

  // Restore preserved extensions if any
  if (preservedExtensions && preservedExtensions.size > 0) {
    log(colors.dim('Restoring user extensions...'));
    for (const [filePath, preservedBlocks] of preservedExtensions) {
      const fullPath = path.join(frameworkPath, filePath);
      if (fs.existsSync(fullPath)) {
        restoreExtensionsToFile(fullPath, preservedBlocks);
      }
    }
  }

  return failedFiles;
}

/**
 * Restore preserved extension blocks to a file
 */
function restoreExtensionsToFile(filePath, preservedBlocks) {
  let content = fs.readFileSync(filePath, 'utf8');

  for (const [id, userContent] of preservedBlocks) {
    // Find the empty extension marker and replace with preserved content
    const emptyMarkerRegex = new RegExp(
      `(<!--\\s*USER-EXTENSION-START:\\s*${escapeRegex(id)}\\s*-->)[\\s\\S]*?(<!--\\s*USER-EXTENSION-END:\\s*${escapeRegex(id)}\\s*-->)`,
      'g'
    );
    content = content.replace(emptyMarkerRegex, `$1\n${userContent}\n$2`);
  }

  fs.writeFileSync(filePath, content);
}

/**
 * Escape special regex characters
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract and store extension blocks for later restoration
 */
function extractExtensionsForPreservation(frameworkPath, filesWithExtensions) {
  const preserved = new Map();

  for (const fileInfo of filesWithExtensions) {
    const filePath = path.join(frameworkPath, fileInfo.file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const blocks = extractExtensionBlocks(content);
      if (blocks.size > 0) {
        preserved.set(fileInfo.file, blocks);
      }
    }
  }

  return preserved;
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

  // Pre-upgrade validation: Check for user extensions
  // Skip extension prompts in -dist repo (it's the distribution source, not a user installation)
  let preservedExtensions = null;
  const isDistRepo = isDistRepository();
  const filesWithExtensions = isDistRepo ? [] : scanForUserExtensions(frameworkPath, TEMP_DIR);

  if (isDistRepo) {
    log(colors.dim('Distribution repository detected - skipping extension checks'));
  }

  if (filesWithExtensions.length > 0) {
    log();
    log(colors.yellow('⚠️  User Extensions Detected'));
    log(colors.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    log();
    log('The following files contain user customizations:');
    log();
    for (const fileInfo of filesWithExtensions) {
      log(`  ${colors.cyan(fileInfo.file)}`);
      for (const ext of fileInfo.extensions) {
        log(colors.dim(`    └─ ${ext}`));
      }
    }
    log();
    log('Options:');
    log('  [p] Preserve - Keep your extensions (recommended)');
    log('  [b] Backup   - Create backup, then overwrite');
    log('  [o] Overwrite - Replace with new version (lose changes)');
    log('  [a] Abort    - Cancel the update');
    log();

    const answer = await prompt('Choose an option [p/b/o/a]: ');

    switch (answer) {
      case 'p':
        log(colors.dim('Preserving user extensions...'));
        preservedExtensions = extractExtensionsForPreservation(frameworkPath, filesWithExtensions);
        break;

      case 'b':
        const backupDir = createBackup(frameworkPath, filesWithExtensions);
        log(colors.green(`✓ Backup created: ${backupDir}`));
        break;

      case 'o':
        log(colors.dim('Proceeding without preservation...'));
        break;

      case 'a':
        log(colors.yellow('Update aborted by user.'));
        removeDir(TEMP_DIR);
        process.exit(0);
        break;

      default:
        log(colors.yellow('Invalid option. Defaulting to preserve.'));
        preservedExtensions = extractExtensionsForPreservation(frameworkPath, filesWithExtensions);
    }
    log();
  }

  // Update framework files
  const failedFiles = updateFrameworkFiles(frameworkPath, preservedExtensions);

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
