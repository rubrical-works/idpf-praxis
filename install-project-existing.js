#!/usr/bin/env node
/**
 * @framework-script 0.48.2
 * IDPF Existing Project Installer
 * Adds IDPF integration to an existing codebase.
 *
 * Usage: node install-project-existing.js [--target <path>] [--hub <path>]
 *
 * This script adds symlinks to the central hub, interactive configuration,
 * and optional git setup to existing projects without modifying existing files.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

// ======================================
//  Console UI (reused pattern)
// ======================================

const colors = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

function log(msg = '') {
  console.log(msg);
}

function logSuccess(msg) {
  console.log(colors.green(msg));
}

function logWarning(msg) {
  console.log(colors.yellow(msg));
}

function logError(msg) {
  console.log(colors.red(msg));
}

function logCyan(msg) {
  console.log(colors.cyan(msg));
}

function divider() {
  log(colors.cyan('───────────────────────────────────────'));
}

// ======================================
//  Hub Detection
// ======================================

/**
 * Auto-detect hub path from script location
 */
function detectHubPath() {
  return __dirname;
}

/**
 * Read framework version from manifest
 */
function readFrameworkVersion(hubPath) {
  const manifestPath = path.join(hubPath, 'framework-manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return manifest.version || 'unknown';
  }
  return 'unknown';
}

/**
 * Read domain specialists from manifest
 * Falls back to a minimal list if manifest is missing or malformed
 */
function readDomainSpecialists(hubPath) {
  const manifestPath = path.join(hubPath, 'framework-manifest.json');
  const fallback = ['Full-Stack-Developer', 'Backend-Specialist', 'Frontend-Specialist'];

  try {
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (Array.isArray(manifest.domainSpecialists) && manifest.domainSpecialists.length > 0) {
        return manifest.domainSpecialists;
      }
    }
  } catch (err) {
    logWarning(`Warning: Could not read domain specialists from manifest: ${err.message}`);
  }

  logWarning('Using fallback domain specialists list');
  return fallback;
}

// ======================================
//  Symlink Setup
// ======================================

/**
 * Create symlink/junction to hub directory
 * Uses junctions on Windows (works without admin)
 */
function createSymlink(target, linkPath) {
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';

  try {
    // Remove existing symlink/directory if present
    if (fs.existsSync(linkPath)) {
      fs.rmSync(linkPath, { recursive: true, force: true });
    }

    fs.symlinkSync(target, linkPath, linkType);
    return true;
  } catch (_err) {
    return false;
  }
}

// ======================================
//  Extensible Commands Handling
// ======================================

/**
 * Check if a command file is extensible (vs managed)
 * Extensible commands have <!-- EXTENSIBLE --> marker
 * Managed commands have <!-- MANAGED --> marker
 */
function isExtensibleCommand(content) {
  return content.includes('<!-- EXTENSIBLE -->');
}

/**
 * Strip FRAMEWORK-ONLY content from command file
 * Removes content between <!-- FRAMEWORK-ONLY-START --> and <!-- FRAMEWORK-ONLY-END -->
 */
function stripFrameworkOnlyContent(content) {
  // Use regex to remove FRAMEWORK-ONLY blocks (including the markers)
  const regex = /<!-- FRAMEWORK-ONLY-START -->[\s\S]*?<!-- FRAMEWORK-ONLY-END -->/g;
  return content.replace(regex, '');
}

/**
 * Extract extension blocks from content
 * Returns a map of extension name -> content
 */
function extractExtensionBlocks(content) {
  const blocks = {};
  const regex = /<!-- USER-EXTENSION-START: ([a-z][a-z0-9-]*) -->([\s\S]*?)<!-- USER-EXTENSION-END: \1 -->/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const name = match[1];
    const blockContent = match[2];
    // Only store if there's actual content (not just whitespace/empty)
    if (blockContent.trim()) {
      blocks[name] = blockContent;
    }
  }
  return blocks;
}

/**
 * Merge extension blocks from existing file into new content
 * Preserves user customizations while updating the command structure
 */
function mergeExtensionBlocks(existingContent, newContent) {
  // Extract blocks from existing file
  const existingBlocks = extractExtensionBlocks(existingContent);

  // If no existing blocks with content, just return new content
  if (Object.keys(existingBlocks).length === 0) {
    return newContent;
  }

  // Replace empty extension blocks in new content with existing content
  let mergedContent = newContent;
  for (const [name, blockContent] of Object.entries(existingBlocks)) {
    // Find the extension block in new content and replace its content
    const blockRegex = new RegExp(
      `(<!-- USER-EXTENSION-START: ${name} -->)[\\s\\S]*?(<!-- USER-EXTENSION-END: ${name} -->)`,
      'g'
    );
    mergedContent = mergedContent.replace(blockRegex, `$1${blockContent}$2`);
  }

  return mergedContent;
}

// ======================================
//  Extension Directory Management
// ======================================

/**
 * Commands that support user extension points
 * These get dedicated directories under .claude/scripts/{command}/
 */
const EXTENSIBLE_COMMANDS = [
  // Existing extensible commands
  'create-branch',
  'prepare-release',
  'prepare-beta',
  'merge-branch',
  'destroy-branch',
  'create-prd',
  // New extensible commands (per #1080)
  'work',
  'done',
  'bug',
  'enhancement',
  'proposal',
  'review-proposal',
  'review-prd',
  'review-issue'
];

/**
 * Create project-owned extension directories
 * These directories are NOT symlinked and survive hub reinstalls
 *
 * Structure:
 *   .claude/extensions/           - General extension point
 *   .claude/scripts/{command}/    - Per-command extension scripts
 *
 * Returns: { extensions: boolean, commands: string[] }
 */
function createExtensionDirectories(projectPath) {
  const results = { extensions: false, commands: [] };
  const claudeDir = path.join(projectPath, '.claude');

  // Create .claude/extensions/ with .gitkeep
  const extensionsDir = path.join(claudeDir, 'extensions');
  if (!fs.existsSync(extensionsDir)) {
    fs.mkdirSync(extensionsDir, { recursive: true });
    fs.writeFileSync(path.join(extensionsDir, '.gitkeep'), '');
    results.extensions = true;
  } else if (!fs.existsSync(path.join(extensionsDir, '.gitkeep'))) {
    // Directory exists but no .gitkeep - add it
    fs.writeFileSync(path.join(extensionsDir, '.gitkeep'), '');
    results.extensions = true;
  }

  // Create .claude/scripts/{command}/ directories with .gitkeep
  const scriptsDir = path.join(claudeDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });

  for (const command of EXTENSIBLE_COMMANDS) {
    const commandDir = path.join(scriptsDir, command);
    if (!fs.existsSync(commandDir)) {
      fs.mkdirSync(commandDir, { recursive: true });
      fs.writeFileSync(path.join(commandDir, '.gitkeep'), '');
      results.commands.push(command);
    } else if (!fs.existsSync(path.join(commandDir, '.gitkeep'))) {
      // Directory exists but no .gitkeep - add it
      fs.writeFileSync(path.join(commandDir, '.gitkeep'), '');
      results.commands.push(command);
    }
  }

  return results;
}

/**
 * Copy extensible commands to project, preserving existing extensions
 * Managed commands are skipped (will be accessed via symlink to hub)
 *
 * Returns: { copied: string[], skipped: string[], preserved: string[] }
 */
function copyExtensibleCommands(hubPath, projectPath) {
  const results = { copied: [], skipped: [], preserved: [] };

  const hubCommandsDir = path.join(hubPath, '.claude', 'commands');
  const projectCommandsDir = path.join(projectPath, '.claude', 'commands');

  // Create project commands directory if needed
  fs.mkdirSync(projectCommandsDir, { recursive: true });

  // Get list of command files from hub
  if (!fs.existsSync(hubCommandsDir)) {
    return results;
  }

  const commandFiles = fs.readdirSync(hubCommandsDir).filter(f => f.endsWith('.md'));

  for (const file of commandFiles) {
    const hubFilePath = path.join(hubCommandsDir, file);
    const projectFilePath = path.join(projectCommandsDir, file);
    const hubContent = fs.readFileSync(hubFilePath, 'utf8');

    if (isExtensibleCommand(hubContent)) {
      // Extensible command: copy with FRAMEWORK-ONLY stripped, preserve extensions
      let newContent = stripFrameworkOnlyContent(hubContent);

      // Check if project already has this file with customizations
      if (fs.existsSync(projectFilePath)) {
        const existingContent = fs.readFileSync(projectFilePath, 'utf8');
        const existingBlocks = extractExtensionBlocks(existingContent);

        if (Object.keys(existingBlocks).length > 0) {
          // Has customizations - merge them
          newContent = mergeExtensionBlocks(existingContent, newContent);
          results.preserved.push(file);
        }
      }

      fs.writeFileSync(projectFilePath, newContent);
      results.copied.push(file);
    } else {
      // Managed command: copy as-is (no customization expected)
      fs.copyFileSync(hubFilePath, projectFilePath);
      results.skipped.push(file);
    }
  }

  return results;
}

/**
 * Handle existing .claude directory
 * Replaces symlinked content with fresh symlinks
 * Preserves commands directory (handled separately by copyExtensibleCommands)
 */
function handleExistingClaude(projectPath) {
  const claudeDir = path.join(projectPath, '.claude');

  if (fs.existsSync(claudeDir)) {
    // Paths to replace with symlinks (NOT commands - those are copied/preserved)
    const pathsToReplace = [
      path.join(claudeDir, 'rules'),
      path.join(claudeDir, 'hooks'),
      path.join(claudeDir, 'scripts', 'shared'),
      path.join(claudeDir, 'metadata'),
      path.join(claudeDir, 'skills'),
    ];

    // Remove existing directories/symlinks (will be replaced with symlinks)
    for (const p of pathsToReplace) {
      if (fs.existsSync(p)) {
        fs.rmSync(p, { recursive: true, force: true });
      }
    }

    // Check if commands is a symlink - if so, remove it (will be replaced with copies)
    const commandsPath = path.join(claudeDir, 'commands');
    if (fs.existsSync(commandsPath)) {
      try {
        const stats = fs.lstatSync(commandsPath);
        if (stats.isSymbolicLink()) {
          // Remove symlink - will be replaced with copied commands
          fs.rmSync(commandsPath, { recursive: true, force: true });
        }
        // If it's a real directory, leave it (extensions will be preserved)
      } catch (_err) {
        // Ignore stat errors
      }
    }

    return true; // Had existing .claude/
  }

  return false; // No existing .claude/
}

/**
 * Setup .claude directory with symlinks to hub and copied commands
 * Symlinks: rules, hooks, scripts/shared, metadata, skills
 * Copies: commands (extensible commands with FRAMEWORK-ONLY stripped)
 */
function setupProjectSymlinks(projectPath, hubPath) {
  const claudeDir = path.join(projectPath, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  const results = {
    commands: { copied: [], skipped: [], preserved: [] },
    rules: false,
    hooks: false,
    scripts: false,
    metadata: false,
    skills: false,
    extensionDirs: { extensions: false, commands: [] }
  };

  // Commands: COPY (not symlink) - extensible commands with FRAMEWORK-ONLY stripped
  // Existing extension blocks are preserved
  results.commands = copyExtensibleCommands(hubPath, projectPath);

  // Rules symlink
  const rulesTarget = path.join(hubPath, '.claude', 'rules');
  const rulesLink = path.join(claudeDir, 'rules');
  if (fs.existsSync(rulesTarget)) {
    results.rules = createSymlink(rulesTarget, rulesLink);
  }

  // Hooks symlink
  const hooksTarget = path.join(hubPath, '.claude', 'hooks');
  const hooksLink = path.join(claudeDir, 'hooks');
  if (fs.existsSync(hooksTarget)) {
    results.hooks = createSymlink(hooksTarget, hooksLink);
  }

  // Scripts/shared symlink
  const scriptsDir = path.join(claudeDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  const scriptsTarget = path.join(hubPath, '.claude', 'scripts', 'shared');
  const scriptsLink = path.join(scriptsDir, 'shared');
  if (fs.existsSync(scriptsTarget)) {
    results.scripts = createSymlink(scriptsTarget, scriptsLink);
  }

  // Metadata symlink (skill-registry.json, extension-recipes.json)
  const metadataTarget = path.join(hubPath, '.claude', 'metadata');
  const metadataLink = path.join(claudeDir, 'metadata');
  if (fs.existsSync(metadataTarget)) {
    results.metadata = createSymlink(metadataTarget, metadataLink);
  }

  // Skills symlink (extracted skill packages)
  const skillsTarget = path.join(hubPath, '.claude', 'skills');
  const skillsLink = path.join(claudeDir, 'skills');
  if (fs.existsSync(skillsTarget)) {
    results.skills = createSymlink(skillsTarget, skillsLink);
  }

  // Extension directories (project-owned, not symlinked)
  // These provide locations for per-command pre/post hooks
  results.extensionDirs = createExtensionDirectories(projectPath);

  // Check for critical failures (rules must be symlinked, commands must have files)
  const commandsCopied = results.commands.copied.length + results.commands.skipped.length;
  if (commandsCopied === 0 || !results.rules) {
    logError('Failed to setup .claude/ directory');
    logError('');
    if (commandsCopied === 0) {
      logError('  No commands were copied from hub');
    }
    if (!results.rules) {
      logError('  Failed to create rules symlink');
      logError('');
      logError('On Windows, either:');
      logError('  1. Enable Developer Mode (Settings > Privacy & Security > For developers)');
      logError('  2. Run as Administrator');
    }
    process.exit(1);
  }

  return results;
}

/**
 * Update .gitignore to exclude symlinked directories
 * These point to hub-specific paths and should not be committed
 * NOTE: .claude/commands is NOT excluded - it's project-owned (copied, not symlinked)
 */
function updateGitignore(projectPath) {
  const gitignorePath = path.join(projectPath, '.gitignore');
  const entriesToAdd = [
    '# IDPF hub symlinks (machine-specific, do not commit)',
    '# NOTE: .claude/commands is committed (project-owned, not symlinked)',
    '.claude/hooks',
    '.claude/metadata',
    '.claude/rules',
    '.claude/scripts/shared',
    '.claude/skills',
    'run_claude.cmd',
    'run_claude.sh',
    'runp_claude.cmd',
    'runp_claude.sh',
  ];

  let content = '';
  let existingEntries = new Set();

  // Read existing .gitignore if it exists
  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, 'utf8');
    // Track existing entries (trimmed, non-empty, non-comment lines)
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        existingEntries.add(trimmed);
      }
    }
  }

  // Determine which entries need to be added
  const newEntries = entriesToAdd.filter(entry => {
    if (entry.startsWith('#')) return true; // Always include comments for context
    return !existingEntries.has(entry);
  });

  // Skip if all entries already exist (except comment)
  const nonCommentNew = newEntries.filter(e => !e.startsWith('#'));
  if (nonCommentNew.length === 0) {
    return { updated: false, entriesAdded: 0 };
  }

  // Append new entries
  const suffix = content.endsWith('\n') || content === '' ? '' : '\n';
  const addition = newEntries.join('\n') + '\n';
  fs.writeFileSync(gitignorePath, content + suffix + addition);

  return { updated: true, entriesAdded: nonCommentNew.length };
}

/**
 * Copy launcher scripts to project root
 * Platform-specific: .cmd for Windows, .sh for Unix
 */
function copyLauncherScripts(projectPath, hubPath) {
  const results = { run: false, runp: false };
  const templatesDir = path.join(hubPath, 'Templates');

  if (process.platform === 'win32') {
    // Windows: copy .cmd files
    const runSrc = path.join(templatesDir, 'run_claude.cmd');
    const runDest = path.join(projectPath, 'run_claude.cmd');
    if (fs.existsSync(runSrc)) {
      fs.copyFileSync(runSrc, runDest);
      results.run = true;
    }

    const runpSrc = path.join(templatesDir, 'runp_claude.cmd');
    const runpDest = path.join(projectPath, 'runp_claude.cmd');
    if (fs.existsSync(runpSrc)) {
      fs.copyFileSync(runpSrc, runpDest);
      results.runp = true;
    }
  } else {
    // Unix: copy .sh files and make executable
    const runSrc = path.join(templatesDir, 'run_claude.sh');
    const runDest = path.join(projectPath, 'run_claude.sh');
    if (fs.existsSync(runSrc)) {
      fs.copyFileSync(runSrc, runDest);
      fs.chmodSync(runDest, '755');
      results.run = true;
    }

    const runpSrc = path.join(templatesDir, 'runp_claude.sh');
    const runpDest = path.join(projectPath, 'runp_claude.sh');
    if (fs.existsSync(runpSrc)) {
      fs.copyFileSync(runpSrc, runpDest);
      fs.chmodSync(runpDest, '755');
      results.runp = true;
    }
  }

  return results;
}

// ======================================
//  Project Registry
// ======================================

/**
 * Compare two paths for equality, case-insensitive on Windows/macOS.
 * @param {string} a - First path
 * @param {string} b - Second path
 * @returns {boolean}
 */
function pathsEqual(a, b) {
  if (process.platform === 'win32' || process.platform === 'darwin') {
    return a.toLowerCase() === b.toLowerCase();
  }
  return a === b;
}

/**
 * Register project in hub's projects.json
 */
function registerProject(hubPath, projectPath, config) {
  const registryPath = path.join(hubPath, '.projects', 'projects.json');
  const normalizedPath = path.resolve(projectPath);

  let registry = { version: '1.0', projects: [] };
  if (fs.existsSync(registryPath)) {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  }

  // Remove existing entry for this path (case-insensitive on Windows/macOS)
  registry.projects = registry.projects.filter(p => !pathsEqual(p.path, normalizedPath));

  // Add new entry with normalized path
  registry.projects.push({
    name: config.name,
    path: normalizedPath,
    framework: config.framework,
    domainSpecialist: config.domainSpecialist,
    registeredAt: new Date().toISOString(),
    linkType: process.platform === 'win32' ? 'junction' : 'symlink',
  });

  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
}

// ======================================
//  Interactive Prompts
// ======================================

const FRAMEWORKS = ['IDPF-Agile', 'IDPF-Vibe'];

// TDD skills to include by default in all projects
const TDD_SKILLS = [
  'tdd-red-phase',
  'tdd-green-phase',
  'tdd-refactor-phase',
  'tdd-failure-recovery'
];

/**
 * Create readline interface
 */
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Ask a question and return the answer
 */
function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Display a numbered menu and get selection
 */
async function selectFromList(rl, prompt, options) {
  log();
  log(colors.cyan(prompt));
  options.forEach((opt, i) => {
    log(`  ${colors.green(i + 1)}. ${opt}`);
  });
  log();

  while (true) {
    const answer = await ask(rl, `  Enter number (1-${options.length}): `);
    const num = parseInt(answer, 10);
    if (num >= 1 && num <= options.length) {
      return options[num - 1];
    }
    logWarning(`  Please enter a number between 1 and ${options.length}`);
  }
}

/**
 * Prompt for project configuration
 */
async function promptConfiguration(rl, defaultName, hubPath) {
  divider();
  log(colors.cyan('  Project Configuration'));
  divider();
  log();

  // Project name
  const nameAnswer = await ask(rl, `  Project name [${defaultName}]: `);
  const name = nameAnswer || defaultName;

  // Framework selection
  const framework = await selectFromList(
    rl,
    '  Select process framework:',
    FRAMEWORKS
  );

  // Domain specialist selection (read from manifest)
  const domainSpecialists = readDomainSpecialists(hubPath);
  const domainSpecialist = await selectFromList(
    rl,
    '  Select domain specialist:',
    domainSpecialists
  );

  return { name, framework, domainSpecialist };
}

// ======================================
//  Git & GitHub Setup
// ======================================

/**
 * Check if a command is available
 */
function checkCommand(cmd) {
  try {
    const checkCmd = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`;
    execSync(checkCmd, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check git remote status
 */
function checkGitRemote(projectPath) {
  const gitDir = path.join(projectPath, '.git');
  if (!fs.existsSync(gitDir)) {
    return { hasGit: false, hasRemote: false };
  }
  try {
    const result = execSync('git remote -v', { cwd: projectPath, stdio: 'pipe' }).toString();
    return { hasGit: true, hasRemote: result.trim().length > 0 };
  } catch {
    return { hasGit: true, hasRemote: false };
  }
}

/**
 * Check GitHub CLI prerequisites
 */
function checkGhCliPrerequisites() {
  const issues = [];

  if (!checkCommand('gh')) {
    issues.push({
      message: 'GitHub CLI (gh) is not installed',
      remediation: 'Install from: https://cli.github.com/',
    });
    return { ready: false, issues };
  }

  try {
    execSync('gh auth status', { stdio: 'pipe' });
  } catch {
    issues.push({
      message: 'GitHub CLI is not authenticated',
      remediation: 'Run: gh auth login',
    });
    return { ready: false, issues };
  }

  // Auto-install gh-pmu extension if missing
  try {
    const extensions = execSync('gh extension list', { stdio: 'pipe' }).toString();
    if (!extensions.includes('gh-pmu')) {
      log(colors.dim('  Installing gh-pmu extension...'));
      try {
        execSync('gh extension install rubrical-studios/gh-pmu', { stdio: 'pipe' });
        logSuccess('  ✓ Installed gh-pmu extension');
      } catch {
        issues.push({
          message: 'Failed to install gh-pmu extension',
          remediation: 'Run: gh extension install rubrical-studios/gh-pmu',
        });
      }
    }
  } catch {
    try {
      execSync('gh extension install rubrical-studios/gh-pmu', { stdio: 'pipe' });
    } catch {
      issues.push({
        message: 'Failed to install gh-pmu extension',
        remediation: 'Run: gh extension install rubrical-studios/gh-pmu',
      });
    }
  }

  return { ready: issues.length === 0, issues };
}

/**
 * Get current GitHub username
 */
function getGitHubUsername() {
  try {
    return execSync('gh api user --jq ".login"', { stdio: 'pipe' }).toString().trim();
  } catch {
    return null;
  }
}

/**
 * Create GitHub repository
 */
function createGitHubRepo(projectPath, repoName, visibility) {
  try {
    const visFlag = visibility === 'public' ? '--public' : '--private';
    const result = execSync(
      `gh repo create "${repoName}" ${visFlag} --source="${projectPath}" --push`,
      { cwd: projectPath, stdio: 'pipe' }
    ).toString();
    const urlMatch = result.match(/https:\/\/github\.com\/[^\s]+/);
    return { success: true, repoUrl: urlMatch ? urlMatch[0] : `https://github.com/${repoName}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Copy project board template
 */
function copyProjectBoard(templateNumber, projectTitle, targetOwner) {
  try {
    const result = execSync(
      `gh project copy ${templateNumber} --source-owner rubrical-studios --target-owner ${targetOwner} --title "${projectTitle}" --format json`,
      { stdio: 'pipe' }
    ).toString();
    const projectData = JSON.parse(result);
    return { success: true, projectNumber: projectData.number, projectUrl: projectData.url };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Link project board to repository
 */
function linkProjectBoard(projectNumber, owner, repoName) {
  try {
    execSync(`gh project link ${projectNumber} --owner ${owner} --repo ${repoName}`, { stdio: 'pipe' });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Generate .gh-pmu.yml configuration
 */
function generateGhPmuConfig(projectPath, projectTitle, projectNumber, owner, repoName) {
  const config = `# gh-pmu configuration
# Generated by IDPF installer

project:
  owner: ${owner}
  number: ${projectNumber}

repositories:
  - ${owner}/${repoName}

fields:
  status:
    values:
      - backlog
      - in_progress
      - in_review
      - done
  priority:
    values:
      - p0
      - p1
      - p2
`;
  fs.writeFileSync(path.join(projectPath, '.gh-pmu.yml'), config);
}

/**
 * Run gh pmu init to create .gh-pmu.yml and set up project board labels/fields.
 * Falls back to generateGhPmuConfig() if gh pmu init is not available.
 */
function runGhPmuInit(projectPath, projectTitle, projectNumber, owner, repoName) {
  // Skip if .gh-pmu.yml already exists
  if (fs.existsSync(path.join(projectPath, '.gh-pmu.yml'))) {
    return { success: true, skipped: true, method: 'existing' };
  }

  try {
    execSync(
      `gh pmu init --non-interactive --project ${projectNumber} --repo ${owner}/${repoName} --owner ${owner}`,
      { cwd: projectPath, stdio: 'pipe' }
    );
    return { success: true, skipped: false, method: 'gh-pmu-init' };
  } catch (err) {
    // Fallback: generate config file directly (labels/fields won't be created)
    try {
      generateGhPmuConfig(projectPath, projectTitle, projectNumber, owner, repoName);
      return { success: true, skipped: false, method: 'fallback', warning: err.message };
    } catch (writeErr) {
      return { success: false, error: writeErr.message };
    }
  }
}

/**
 * Integrated GitHub setup flow
 */
async function setupGitHubIntegration(rl, projectPath, projectName) {
  const result = { repoUrl: null, projectUrl: null, skipped: false, gitStatus: 'none' };

  // Check git status
  const gitStatus = checkGitRemote(projectPath);

  // Skip if remote already exists
  if (gitStatus.hasRemote) {
    log(colors.dim('  Git remote already configured - skipping GitHub setup'));
    result.skipped = true;
    result.gitStatus = 'existing';
    return result;
  }

  // Check prerequisites
  const ghPrereqs = checkGhCliPrerequisites();
  if (!ghPrereqs.ready) {
    logWarning('  GitHub setup skipped - prerequisites not met:');
    for (const issue of ghPrereqs.issues) {
      log(`    ${colors.yellow('⚠')} ${issue.message}`);
      log(`      ${colors.cyan(issue.remediation)}`);
    }
    result.skipped = true;
    return result;
  }

  // Single prompt for GitHub integration
  log();
  divider();
  logCyan('  GitHub Repository Setup');
  divider();
  log();
  log('  Would you like to set up GitHub integration?');
  log(colors.dim('  This will create a GitHub repository and project board.'));
  log();

  const setupGitHub = await ask(rl, '  Set up GitHub integration? [y/N]: ');
  if (setupGitHub.toLowerCase() !== 'y') {
    logWarning('  GitHub setup skipped.');
    result.skipped = true;

    // Offer local git only (for existing projects without git)
    if (!gitStatus.hasGit && checkCommand('git')) {
      const initLocal = await ask(rl, '  Initialize local git repository? [y/N]: ');
      if (initLocal.toLowerCase() === 'y') {
        try {
          execSync('git init', { cwd: projectPath, stdio: 'pipe' });
          execSync('git add .', { cwd: projectPath, stdio: 'pipe' });
          execSync('git commit -m "Add IDPF integration"', { cwd: projectPath, stdio: 'pipe' });
          logSuccess('  ✓ Initialized local git repository');
          result.gitStatus = 'local';
        } catch {
          logWarning('  ⊘ Failed to initialize git');
        }
      }
    }
    return result;
  }

  // Get configuration
  const ghUsername = getGitHubUsername();
  if (!ghUsername) {
    logWarning('  ⊘ Could not determine GitHub username');
    result.skipped = true;
    return result;
  }

  const repoNameAnswer = await ask(rl, `  Repository name [${projectName}]: `);
  const repoName = repoNameAnswer || projectName;

  const visibilityAnswer = await ask(rl, '  Repository visibility (1=Private, 2=Public) [1]: ');
  const visibility = visibilityAnswer === '2' ? 'public' : 'private';

  const templateAnswer = await ask(rl, '  Project template number [30]: ');
  const templateNumber = parseInt(templateAnswer, 10) || 30;

  const projectTitleAnswer = await ask(rl, `  Project board title [${repoName}]: `);
  const projectTitle = projectTitleAnswer || repoName;

  log();
  log(colors.dim('  Creating GitHub resources...'));
  log();

  // Initialize git if needed
  if (!gitStatus.hasGit) {
    try {
      execSync('git init', { cwd: projectPath, stdio: 'pipe' });
      logSuccess('  ✓ Initialized git repository');
    } catch (err) {
      logError(`  ✗ Failed to initialize git: ${err.message}`);
    }
  }

  // Create initial commit
  try {
    execSync('git rev-parse HEAD', { cwd: projectPath, stdio: 'pipe' });
  } catch {
    try {
      execSync('git add -A', { cwd: projectPath, stdio: 'pipe' });
      execSync('git commit -m "Add IDPF integration"', { cwd: projectPath, stdio: 'pipe' });
      logSuccess('  ✓ Created initial commit');
    } catch (err) {
      logWarning(`  ⚠ Could not create initial commit: ${err.message}`);
    }
  }

  // Create GitHub repository
  const repoResult = createGitHubRepo(projectPath, repoName, visibility);
  if (repoResult.success) {
    logSuccess(`  ✓ Created repository: ${repoResult.repoUrl}`);
    result.repoUrl = repoResult.repoUrl;
    result.gitStatus = 'pushed';
  } else {
    logError(`  ✗ Failed to create repository: ${repoResult.error}`);
    result.gitStatus = 'local';
  }

  // Copy project board
  const projectResult = copyProjectBoard(templateNumber, projectTitle, ghUsername);
  if (projectResult.success) {
    logSuccess(`  ✓ Copied project board: ${projectResult.projectUrl || `#${projectResult.projectNumber}`}`);
    result.projectUrl = projectResult.projectUrl;

    // Link project to repository
    if (repoResult.success && projectResult.projectNumber) {
      const linkResult = linkProjectBoard(projectResult.projectNumber, ghUsername, repoName);
      if (linkResult.success) {
        logSuccess('  ✓ Linked project board to repository');
      } else {
        logWarning(`  ⚠ Could not link project: ${linkResult.error}`);
      }
    }

    // Initialize gh-pmu (creates .gh-pmu.yml + labels + branch field)
    if (projectResult.projectNumber) {
      const initResult = runGhPmuInit(projectPath, projectTitle, projectResult.projectNumber, ghUsername, repoName);
      if (initResult.success && !initResult.skipped) {
        if (initResult.method === 'gh-pmu-init') {
          logSuccess('  ✓ Initialized gh-pmu (config + labels + branch field)');
        } else if (initResult.method === 'fallback') {
          logSuccess('  ✓ Generated .gh-pmu.yml (fallback — run gh pmu init manually for labels)');
          logWarning(`  ⚠ gh pmu init failed: ${initResult.warning}`);
        }
      } else if (initResult.skipped) {
        log(colors.dim('  .gh-pmu.yml already exists — skipping init'));
      }

      // Commit and push config
      try {
        execSync('git add .gh-pmu.yml', { cwd: projectPath, stdio: 'pipe' });
        execSync('git commit -m "Add gh-pmu configuration"', { cwd: projectPath, stdio: 'pipe' });
        execSync('git push', { cwd: projectPath, stdio: 'pipe' });
        logSuccess('  ✓ Committed and pushed .gh-pmu.yml');
      } catch (err) {
        logWarning(`  ⚠ Could not push config: ${err.message}`);
      }
    }
  } else {
    logWarning(`  ⚠ Could not copy project board: ${projectResult.error}`);
    log(colors.dim('    You can create a project board manually and run: gh pmu init'));
  }

  return result;
}

// ======================================
//  Main Installation
// ======================================

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const targetIdx = args.indexOf('--target');
  const hubIdx = args.indexOf('--hub');

  // Default target to current directory
  const targetPath = targetIdx !== -1 && targetIdx < args.length - 1
    ? path.resolve(args[targetIdx + 1])
    : process.cwd();

  const hubPath = hubIdx !== -1 && hubIdx < args.length - 1
    ? path.resolve(args[hubIdx + 1])
    : detectHubPath();

  // Validate target exists
  if (!fs.existsSync(targetPath)) {
    logError('ERROR: Target directory does not exist');
    logError(`  Target: ${targetPath}`);
    logError('');
    logError('For existing projects, the target directory must already exist.');
    logError('To create a new project, use: node install-project-new.js --target <path>');
    process.exit(1);
  }

  // Validate hub
  if (!fs.existsSync(path.join(hubPath, 'framework-manifest.json'))) {
    logError('ERROR: Invalid hub path - framework-manifest.json not found');
    logError(`  Hub: ${hubPath}`);
    process.exit(1);
  }

  // Guard: hub and target must not be the same directory (#1281)
  if (pathsEqual(hubPath, targetPath)) {
    logError('ERROR: Hub and target paths are the same directory');
    logError(`  Hub:    ${hubPath}`);
    logError(`  Target: ${targetPath}`);
    logError('');
    logError('Cannot install a project into the hub itself. This would create');
    logError('circular symlinks and corrupt the hub installation.');
    logError('');
    logError('Run this command from your project directory instead:');
    logError(`  node install-project-existing.js --hub "${hubPath}"`);
    process.exit(1);
  }

  const version = readFrameworkVersion(hubPath);

  log();
  logCyan('╔══════════════════════════════════════╗');
  logCyan('║  IDPF Existing Project Installer     ║');
  logCyan('╚══════════════════════════════════════╝');
  log();

  divider();
  log(`  Hub:     ${colors.cyan(hubPath)}`);
  log(`  Target:  ${colors.cyan(targetPath)}`);
  log(`  Version: ${colors.green(version)}`);
  divider();
  log();

  // Handle existing .claude/ directory
  const hadExisting = handleExistingClaude(targetPath);
  if (hadExisting) {
    logSuccess('  ✓ Processed existing .claude/ directory');
  }

  // Setup .claude/ structure: copy commands, symlink everything else
  const setupResults = setupProjectSymlinks(targetPath, hubPath);

  // Report command copy results
  const cmdResults = setupResults.commands;
  const totalCmds = cmdResults.copied.length + cmdResults.skipped.length;
  const extensibleCount = cmdResults.copied.length - cmdResults.preserved.length;
  if (cmdResults.preserved.length > 0) {
    logSuccess(`  ✓ Copied ${totalCmds} commands (${extensibleCount} extensible, ${cmdResults.preserved.length} with preserved extensions)`);
  } else {
    logSuccess(`  ✓ Copied ${totalCmds} commands (${cmdResults.copied.length} extensible)`);
  }

  // Report symlink results
  if (setupResults.rules) logSuccess('  ✓ Created .claude/rules symlink');
  if (setupResults.hooks) logSuccess('  ✓ Created .claude/hooks symlink');
  if (setupResults.scripts) logSuccess('  ✓ Created .claude/scripts/shared symlink');
  if (setupResults.metadata) logSuccess('  ✓ Created .claude/metadata symlink');
  if (setupResults.skills) logSuccess('  ✓ Created .claude/skills symlink');

  // Report extension directory results
  const extDirs = setupResults.extensionDirs;
  if (extDirs.extensions || extDirs.commands.length > 0) {
    const extCount = extDirs.commands.length;
    if (extDirs.extensions && extCount > 0) {
      logSuccess(`  ✓ Created extension directories (.claude/extensions + ${extCount} command dirs)`);
    } else if (extDirs.extensions) {
      logSuccess('  ✓ Created .claude/extensions directory');
    } else if (extCount > 0) {
      logSuccess(`  ✓ Created ${extCount} command extension directories`);
    }
  }

  // Update .gitignore to exclude symlinked directories
  const gitignoreResult = updateGitignore(targetPath);
  if (gitignoreResult.updated) {
    logSuccess(`  ✓ Updated .gitignore (${gitignoreResult.entriesAdded} entries added)`);
  }

  // Copy launcher scripts (skip if they exist)
  const runScriptName = process.platform === 'win32' ? 'run_claude.cmd' : 'run_claude.sh';
  const runpScriptName = process.platform === 'win32' ? 'runp_claude.cmd' : 'runp_claude.sh';
  if (!fs.existsSync(path.join(targetPath, runScriptName))) {
    const launcherResults = copyLauncherScripts(targetPath, hubPath);
    if (launcherResults.run) logSuccess(`  ✓ Copied ${runScriptName}`);
    if (launcherResults.runp) logSuccess(`  ✓ Copied ${runpScriptName}`);
  } else {
    logSuccess(`  ✓ ${runScriptName} (preserved)`);
    logSuccess(`  ✓ ${runpScriptName} (preserved)`);
  }

  // Create readline interface for interactive prompts
  const rl = createInterface();

  // Create project config (skip if exists, otherwise prompt)
  const configPath = path.join(targetPath, '.idpf-project.json');
  let config;

  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    logSuccess('  ✓ .idpf-project.json (preserved)');
  } else {
    // Interactive configuration
    const defaultName = path.basename(targetPath);
    const userConfig = await promptConfiguration(rl, defaultName, hubPath);

    config = {
      name: userConfig.name,
      hub: path.relative(targetPath, hubPath),
      framework: userConfig.framework,
      domainSpecialist: userConfig.domainSpecialist,
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    logSuccess('  ✓ Created .idpf-project.json');
  }

  // Create or update framework-config.json with TDD skills
  const frameworkConfigPath = path.join(targetPath, 'framework-config.json');
  if (fs.existsSync(frameworkConfigPath)) {
    // Update existing config - merge TDD skills and refresh version fields
    const existingConfig = JSON.parse(fs.readFileSync(frameworkConfigPath, 'utf8'));
    const existingSkills = existingConfig.projectSkills || [];
    const mergedSkills = [...new Set([...existingSkills, ...TDD_SKILLS])].sort();
    existingConfig.frameworkVersion = readFrameworkVersion(hubPath);
    existingConfig.installedDate = new Date().toISOString().split('T')[0];
    existingConfig.frameworkPath = config.hub;
    existingConfig.projectSkills = mergedSkills;
    if (!existingConfig.reviewMode) {
      existingConfig.reviewMode = 'solo';
    }
    if (!existingConfig.domainSpecialist) {
      existingConfig.domainSpecialist = config.domainSpecialist;
    }
    fs.writeFileSync(frameworkConfigPath, JSON.stringify(existingConfig, null, 2) + '\n');
    logSuccess('  ✓ framework-config.json (updated version fields, merged TDD skills)');
  } else {
    // Create new framework-config.json
    const frameworkConfig = {
      frameworkVersion: readFrameworkVersion(hubPath),
      installedDate: new Date().toISOString().split('T')[0],
      processFramework: config.framework,
      domainSpecialist: config.domainSpecialist,
      reviewMode: 'solo',
      frameworkPath: config.hub,
      projectSkills: [...TDD_SKILLS]
    };
    fs.writeFileSync(frameworkConfigPath, JSON.stringify(frameworkConfig, null, 2) + '\n');
    logSuccess('  ✓ Created framework-config.json');
  }

  // Create CHARTER.md (skip if exists)
  const charterPath = path.join(targetPath, 'CHARTER.md');
  if (fs.existsSync(charterPath)) {
    logSuccess('  ✓ CHARTER.md (preserved)');
  } else {
    const charterContent = `# Project Charter

> This file triggers the \`/charter\` command on first session.
> Replace this content with your project charter.

## Project: ${config.name}

### Vision
{Describe the project vision}

### Goals
- {Goal 1}
- {Goal 2}

### Tech Stack
- {Technology 1}
- {Technology 2}
`;
    fs.writeFileSync(charterPath, charterContent);
    logSuccess('  ✓ Created CHARTER.md template');
  }

  // GitHub integration (skip if .gh-pmu.yml exists)
  let githubResult = { gitStatus: 'existing', skipped: true };
  const ghPmuPath = path.join(targetPath, '.gh-pmu.yml');
  if (fs.existsSync(ghPmuPath)) {
    log();
    logSuccess('  ✓ .gh-pmu.yml (preserved)');
  } else {
    // Run integrated GitHub setup
    githubResult = await setupGitHubIntegration(rl, targetPath, config.name);
  }

  // Close readline interface
  rl.close();

  // Register project in hub
  registerProject(hubPath, targetPath, config);
  logSuccess('  ✓ Registered project in hub');

  // Success message
  log();
  logCyan('╔══════════════════════════════════════╗');
  logCyan('║     IDPF Integration Complete!       ║');
  logCyan('╚══════════════════════════════════════╝');
  log();
  log(`  ${colors.dim('Project:')}     ${targetPath}`);
  log(`  ${colors.dim('Framework:')}   ${colors.green(config.framework)}`);
  log(`  ${colors.dim('Specialist:')}  ${colors.green(config.domainSpecialist)}`);
  log(`  ${colors.dim('Git Status:')}  ${colors.green(githubResult.gitStatus)}`);
  log();

  logCyan('  Next steps:');
  log('    1. Review CHARTER.md and customize for your project');
  log('    2. Start Claude Code in this directory');
  log();
}

// Export for testing
module.exports = { registerProject, pathsEqual };

// Run main only when executed directly
if (require.main === module) {
  main().catch(err => {
    logError(`Error: ${err.message}`);
    process.exit(1);
  });
}
