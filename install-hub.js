#!/usr/bin/env node
/**
 * @framework-script 0.48.1
 * IDPF Hub Installer
 * Creates a central IDPF installation that can serve multiple projects.
 *
 * Usage: node install-hub.js --target <path>
 *
 * This script installs the IDPF framework to a central hub location.
 * Projects can then link to this hub via install-project-new.js or
 * install-project-existing.js.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ======================================
//  Console UI
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
//  File Operations
// ======================================

/**
 * Copy a directory recursively
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
 * Copy a file if it exists
 */
function copyFile(src, dest) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    return true;
  }
  return false;
}

/**
 * Extract a zip file to a destination directory
 * Uses PowerShell on Windows, unzip on Unix
 */
function extractZip(zipPath, destDir) {
  try {
    fs.mkdirSync(destDir, { recursive: true });
    if (process.platform === 'win32') {
      execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, { stdio: 'pipe' });
    } else {
      execSync(`unzip -q -o "${zipPath}" -d "${destDir}"`, { stdio: 'pipe' });
    }
    return true;
  } catch (_err) {
    return false;
  }
}

/**
 * Remove a directory recursively if it exists
 */
function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Read framework version from manifest
 */
function readFrameworkVersion(frameworkPath) {
  const manifestPath = path.join(frameworkPath, 'framework-manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return manifest.version || 'unknown';
  }
  return 'unknown';
}

/**
 * Copy a rule file with Source reference injection
 */
function copyRuleFile(src, dest, sourcePath) {
  if (fs.existsSync(src)) {
    const content = fs.readFileSync(src, 'utf8');
    const withSource = content.replace(
      /(\*\*Version:\*\* .+)/,
      `$1\n**Source:** ${sourcePath}`
    );
    fs.writeFileSync(dest, withSource);
    return true;
  }
  return false;
}

/**
 * Generate startup rules for hub (generic, not project-specific)
 */
function generateHubStartupRules(hubPath, version) {
  return `# Session Startup (Hub)

**Version:** ${version}
**Type:** Central Hub

---

## Rules Auto-Loading

Essential rules auto-load from \`.claude/rules/\`:

| Rule File | Content |
|-----------|---------|
| \`01-anti-hallucination.md\` | Software development quality rules |
| \`02-github-workflow.md\` | GitHub issue management integration |
| \`03-startup.md\` | Startup procedure (this file) |
| \`04-charter-enforcement.md\` | Charter lifecycle enforcement |
| \`05-windows-shell.md\` | Windows shell safety (Windows only) |
| \`06-runtime-triggers.md\` | Runtime artifact triggers |

---

## Startup Sequence

**Run all startup steps sequentially — never in parallel.** Parallel tool calls cascade: if one fails, all siblings abort.

When starting a new session:

1. **Gather Information**: Collect session data (see table below)
2. **Charter Detection**: Check project charter status
3. **Display Session Initialized**: Show consolidated status block
4. **Ask**: What would you like to work on?

### Session Information Sources

| Field | Source | Tool |
|-------|--------|------|
| Date | Current date | Bash: \`node -e "console.log(new Date().toISOString().slice(0,10))"\` |
| Repository | Git repo name | Bash: \`git rev-parse --show-toplevel\` (parse last path segment) |
| Branch | \`git branch --show-current\` + clean/dirty status | Bash |
| Process Framework | \`framework-config.json\` → \`processFramework\` | Read tool |
| Framework Version | \`framework-config.json\` → \`frameworkVersion\` | Read tool |
| Active Role | \`framework-config.json\` → \`domainSpecialist\` | Read tool |
| Charter Status | \`Active\` or \`Pending\` | Glob tool |
| GitHub Workflow | \`gh pmu --version\` | Bash |

**Do not use shell builtins** (\`date\`, \`basename\`, \`echo\`, \`test -f\`, \`pwd\`) — blocked in sandbox.

---

## Charter Detection (Mandatory)

**Charter is mandatory.** Check for project charter at startup:

1. Check CHARTER.md exists using the Glob tool
2. Check for template placeholders: \`/{[a-z][a-z0-9-]*}/\`

### Charter Status

- **Active** (exists, no placeholders): Proceed to display
- **Pending** (missing or template): Auto-run \`/charter\` command

**BLOCKING:** Session startup does not complete until charter is configured.

---

## Display Session Initialized Block

**Date appears ONLY here.** Format:

\`\`\`
Session Initialized
- Date: {date}
- Repository: {repo-name}
- Branch: {branch} ({clean|dirty})
- Process Framework: {framework}
- Framework Version: {version}
- Active Role: {specialist}
- Charter Status: {Active|Pending}
- GitHub Workflow: Active via gh pmu {version}
\`\`\`

If Charter Status is Pending, display blocking message and run \`/charter\`.

---

## Post-Compact Behavior

**No re-reading required.** Rules in \`.claude/rules/\` auto-reload after compaction.

---

## On-Demand Loading

Paths use \`frameworkPath\` from \`framework-config.json\` (resolve relative to project root).

| When Needed | Load From |
|-------------|-----------|
| Framework workflow | \`{frameworkPath}/{framework}/\` |
| Domain specialist | \`{frameworkPath}/System-Instructions/Domain/Base/{specialist}.md\` |
| Skill usage | \`.claude/skills/{skill-name}/SKILL.md\` |
| Charter management | Run \`/charter\` command |

---

**End of Session Startup**
`;
}

/**
 * Generate rules in hub's .claude/rules/ directory
 * Hub always has all rules enabled (GitHub workflow, Windows shell on Windows)
 */
function generateHubRules(hubPath, version) {
  const rulesDir = path.join(hubPath, '.claude', 'rules');

  // Clean existing rules directory to avoid duplicates from dev repo copy
  if (fs.existsSync(rulesDir)) {
    fs.rmSync(rulesDir, { recursive: true, force: true });
  }
  fs.mkdirSync(rulesDir, { recursive: true });

  const results = [];

  // 01-anti-hallucination.md
  const ahSrc = path.join(hubPath, 'Assistant', 'Anti-Hallucination-Rules-for-Software-Development.md');
  const ahDest = path.join(rulesDir, '01-anti-hallucination.md');
  if (copyRuleFile(ahSrc, ahDest, 'Assistant/Anti-Hallucination-Rules-for-Software-Development.md')) {
    results.push('01-anti-hallucination.md');
  }

  // 02-github-workflow.md (always enabled for hub)
  const ghSrc = path.join(hubPath, 'Reference', 'GitHub-Workflow.md');
  const ghDest = path.join(rulesDir, '02-github-workflow.md');
  if (copyRuleFile(ghSrc, ghDest, 'Reference/GitHub-Workflow.md')) {
    results.push('02-github-workflow.md');
  }

  // 03-startup.md (generated)
  const startupContent = generateHubStartupRules(hubPath, version);
  const startupDest = path.join(rulesDir, '03-startup.md');
  fs.writeFileSync(startupDest, startupContent);
  results.push('03-startup.md');

  // 04-charter-enforcement.md
  const ceSrc = path.join(hubPath, 'Reference', 'Charter-Enforcement.md');
  const ceDest = path.join(rulesDir, '04-charter-enforcement.md');
  if (copyRuleFile(ceSrc, ceDest, 'Reference/Charter-Enforcement.md')) {
    results.push('04-charter-enforcement.md');
  }

  // 05-windows-shell.md (Windows only)
  if (process.platform === 'win32') {
    const wsSrc = path.join(hubPath, 'Reference', 'Windows-Shell-Safety.md');
    const wsDest = path.join(rulesDir, '05-windows-shell.md');
    if (copyRuleFile(wsSrc, wsDest, 'Reference/Windows-Shell-Safety.md')) {
      results.push('05-windows-shell.md');
    }
  }

  // 06-runtime-triggers.md
  const rtSrc = path.join(hubPath, 'Reference', 'Runtime-Artifact-Triggers.md');
  const rtDest = path.join(rulesDir, '06-runtime-triggers.md');
  if (copyRuleFile(rtSrc, rtDest, 'Reference/Runtime-Artifact-Triggers.md')) {
    results.push('06-runtime-triggers.md');
  }

  return results;
}

/**
 * Setup .claude/ structure with symlinks for project installers
 * Creates:
 *   .claude/commands/  -> Templates/commands/ or preserves existing
 *   .claude/hooks/     -> Templates/hooks/ or preserves existing
 *   .claude/scripts/shared/ -> Templates/scripts/shared/ or preserves existing
 *   .claude/rules/     (generated from source files)
 *
 * Handles both dist repo (Templates/) and dev repo (.claude/) structures
 *
 * @param {string} hubPath - Target hub directory
 * @param {string} version - Framework version string
 * @param {string} [sourcePath] - Source directory for metadata files (defaults to hubPath for backward compat)
 */
function setupClaudeStructure(hubPath, version, sourcePath) {
  const results = { commands: false, hooks: false, scripts: false, skills: 0, metadata: false, rules: [] };

  // Create .claude directory if needed
  const claudeDir = path.join(hubPath, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  // Commands: Copy from Templates/commands (dist) or preserve .claude/commands (dev)
  const commandsDest = path.join(claudeDir, 'commands');
  const commandsSource = path.join(hubPath, 'Templates', 'commands');
  if (fs.existsSync(commandsSource)) {
    // Dist repo: copy from Templates/commands to .claude/commands
    try {
      if (fs.existsSync(commandsDest)) {
        fs.rmSync(commandsDest, { recursive: true, force: true });
      }
      copyDir(commandsSource, commandsDest);
      results.commands = true;
    } catch (err) {
      logError(`    Failed to copy commands: ${err.message}`);
    }
  } else if (fs.existsSync(commandsDest)) {
    // Dev repo: .claude/commands already exists from copy, keep it
    results.commands = true;
  }

  // Hooks: Copy from Templates/hooks (dist) or preserve .claude/hooks (dev)
  const hooksDest = path.join(claudeDir, 'hooks');
  const hooksSource = path.join(hubPath, 'Templates', 'hooks');
  if (fs.existsSync(hooksSource)) {
    try {
      if (fs.existsSync(hooksDest)) {
        fs.rmSync(hooksDest, { recursive: true, force: true });
      }
      copyDir(hooksSource, hooksDest);
      results.hooks = true;
    } catch (err) {
      logError(`    Failed to copy hooks: ${err.message}`);
    }
  } else if (fs.existsSync(hooksDest)) {
    results.hooks = true;
  }

  // Scripts/shared: Copy from Templates/scripts/shared
  const scriptsDir = path.join(claudeDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  const scriptsDest = path.join(scriptsDir, 'shared');
  const scriptsSource = path.join(hubPath, 'Templates', 'scripts', 'shared');
  if (fs.existsSync(scriptsSource)) {
    try {
      if (fs.existsSync(scriptsDest)) {
        fs.rmSync(scriptsDest, { recursive: true, force: true });
      }
      copyDir(scriptsSource, scriptsDest);
      results.scripts = true;
    } catch (err) {
      logError(`    Failed to copy scripts/shared: ${err.message}`);
    }
  } else if (fs.existsSync(scriptsDest)) {
    results.scripts = true;
  }

  // Skills: Extract all skill packages to .claude/skills/
  const skillsDir = path.join(claudeDir, 'skills');
  const skillPackagesDir = path.join(hubPath, 'Skills', 'Packaged');
  if (fs.existsSync(skillPackagesDir)) {
    // Clear and rebuild skills directory
    if (fs.existsSync(skillsDir)) {
      fs.rmSync(skillsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(skillsDir, { recursive: true });

    // Extract each skill package
    const zipFiles = fs.readdirSync(skillPackagesDir).filter(f => f.endsWith('.zip'));
    for (const zipFile of zipFiles) {
      const skillName = zipFile.replace('.zip', '');
      const zipPath = path.join(skillPackagesDir, zipFile);
      const skillDir = path.join(skillsDir, skillName);
      if (extractZip(zipPath, skillDir)) {
        results.skills++;
      }
    }
  }

  // Metadata: Copy registry files from source (.claude/metadata/)
  const metadataDir = path.join(claudeDir, 'metadata');
  const metadataSrc = sourcePath || hubPath;
  const metadataSource = path.join(metadataSrc, '.claude', 'metadata');
  if (fs.existsSync(metadataSource)) {
    try {
      if (fs.existsSync(metadataDir)) {
        fs.rmSync(metadataDir, { recursive: true, force: true });
      }
      copyDir(metadataSource, metadataDir);
      results.metadata = true;
    } catch (err) {
      logError(`    Failed to copy metadata: ${err.message}`);
      results.metadata = false;
    }
  } else {
    results.metadata = false;
  }

  // Generate rules (always regenerate to ensure consistency)
  results.rules = generateHubRules(hubPath, version);

  return results;
}

// ======================================
//  Hub Installation
// ======================================

/**
 * Directories to install from framework to hub
 */
const FRAMEWORK_DIRECTORIES = [
  '.claude',           // Commands and rules
  'Skills',            // Skill packages
  'IDPF-Agile',        // Process frameworks
  'IDPF-Vibe',
  'IDPF-Accessibility',
  'IDPF-Chaos',
  'IDPF-Contract-Testing',
  'IDPF-Performance',
  'IDPF-QA-Automation',
  'IDPF-Security',
  'IDPF-Testing',
  'Overview',          // Documentation
  'System-Instructions', // Domain specialists
  'Assistant',         // Anti-hallucination rules
  'Templates',         // Command templates, hooks, scripts
  'Reference',         // Reference documents
];

/**
 * Root files to install
 */
const FRAMEWORK_FILES = [
  'framework-manifest.json',
  'CHANGELOG.md',
  'LICENSE',
  'README.md',
];

/**
 * Preserve projects.json during reinstall
 */
function backupProjectsRegistry(hubPath) {
  const registryPath = path.join(hubPath, '.projects', 'projects.json');
  const backupPath = path.join(hubPath, '.projects.backup.json');

  if (fs.existsSync(registryPath)) {
    fs.copyFileSync(registryPath, backupPath);
    return backupPath;
  }
  return null;
}

/**
 * Restore projects.json after reinstall
 */
function restoreProjectsRegistry(hubPath, backupPath) {
  if (backupPath && fs.existsSync(backupPath)) {
    const registryDir = path.join(hubPath, '.projects');
    fs.mkdirSync(registryDir, { recursive: true });
    const registryPath = path.join(registryDir, 'projects.json');
    fs.copyFileSync(backupPath, registryPath);
    fs.unlinkSync(backupPath);
    return true;
  }
  return false;
}

/**
 * Create empty projects registry
 */
function createProjectsRegistry(hubPath) {
  const registryDir = path.join(hubPath, '.projects');
  const registryPath = path.join(registryDir, 'projects.json');

  fs.mkdirSync(registryDir, { recursive: true });

  if (!fs.existsSync(registryPath)) {
    const registry = {
      version: '1.0',
      projects: []
    };
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
    return true;
  }
  return false;
}

/**
 * Remove IDPF-* directories in target that no longer exist in source.
 * Comparison-driven: scans for IDPF-* dirs rather than using a hardcoded list.
 * Non-IDPF directories (user customizations) are never removed.
 *
 * @param {string} sourceDir - Source framework directory
 * @param {string} targetDir - Target hub directory
 * @returns {string[]} Names of removed directories
 */
function cleanOrphanedDirectories(sourceDir, targetDir) {
  const removed = [];

  if (!fs.existsSync(targetDir)) {
    return removed;
  }

  // Get IDPF-* directories in source
  const sourceDirs = new Set(
    fs.readdirSync(sourceDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name.startsWith('IDPF-'))
      .map(e => e.name)
  );

  // Find IDPF-* directories in target that are not in source
  const targetEntries = fs.readdirSync(targetDir, { withFileTypes: true });
  for (const entry of targetEntries) {
    if (entry.isDirectory() && entry.name.startsWith('IDPF-') && !sourceDirs.has(entry.name)) {
      removeDir(path.join(targetDir, entry.name));
      removed.push(entry.name);
    }
  }

  return removed;
}

/**
 * Main hub installation function
 */
function installHub(sourcePath, targetPath) {
  const version = readFrameworkVersion(sourcePath);

  log();
  logCyan('╔══════════════════════════════════════╗');
  logCyan('║       IDPF Hub Installer             ║');
  logCyan('╚══════════════════════════════════════╝');
  log();

  divider();
  log(`  Source:  ${colors.cyan(sourcePath)}`);
  log(`  Target:  ${colors.cyan(targetPath)}`);
  log(`  Version: ${colors.green(version)}`);
  divider();
  log();

  // Step 1: Backup existing projects.json
  const backupPath = backupProjectsRegistry(targetPath);
  if (backupPath) {
    logSuccess('  ✓ Backed up existing projects.json');
  }

  // Step 2: Create target directory
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
    logSuccess(`  ✓ Created target directory`);
  }

  // Step 3: Remove old framework directories (clean install)
  log();
  log(colors.dim('  Cleaning old framework files...'));
  for (const dir of FRAMEWORK_DIRECTORIES) {
    const targetDir = path.join(targetPath, dir);
    if (fs.existsSync(targetDir)) {
      removeDir(targetDir);
    }
  }

  // Step 4: Copy framework directories
  log();
  log(colors.dim('  Installing framework files...'));
  let installedDirs = 0;
  for (const dir of FRAMEWORK_DIRECTORIES) {
    const srcDir = path.join(sourcePath, dir);
    const destDir = path.join(targetPath, dir);

    if (fs.existsSync(srcDir)) {
      copyDir(srcDir, destDir);
      logSuccess(`    ✓ ${dir}/`);
      installedDirs++;
    } else {
      logWarning(`    ⊘ ${dir}/ (not found in source)`);
    }
  }

  // Step 4b: Clean orphaned IDPF-* directories (renamed/removed in source)
  const orphans = cleanOrphanedDirectories(sourcePath, targetPath);
  if (orphans.length > 0) {
    log();
    log(colors.dim('  Cleaning orphaned directories...'));
    for (const name of orphans) {
      logWarning(`    ✗ ${name}/ (removed — no longer in source)`);
    }
  }

  // Step 5: Copy root files
  log();
  log(colors.dim('  Installing root files...'));
  for (const file of FRAMEWORK_FILES) {
    const srcFile = path.join(sourcePath, file);
    const destFile = path.join(targetPath, file);

    if (copyFile(srcFile, destFile)) {
      logSuccess(`    ✓ ${file}`);
    }
  }

  // Step 6: Deploy project installers
  log();
  log(colors.dim('  Deploying project installers...'));

  // install-project-new.js
  const newInstallerSrc = path.join(sourcePath, 'install-project-new.js');
  const newInstallerDest = path.join(targetPath, 'install-project-new.js');
  if (copyFile(newInstallerSrc, newInstallerDest)) {
    logSuccess('    ✓ install-project-new.js');
  } else {
    logWarning('    ⊘ install-project-new.js (not found)');
  }

  // install-project-existing.js
  const existingInstallerSrc = path.join(sourcePath, 'install-project-existing.js');
  const existingInstallerDest = path.join(targetPath, 'install-project-existing.js');
  if (copyFile(existingInstallerSrc, existingInstallerDest)) {
    logSuccess('    ✓ install-project-existing.js');
  } else {
    logWarning('    ⊘ install-project-existing.js (not found)');
  }

  // Step 7: Setup .claude/ structure for project symlinks
  log();
  log(colors.dim('  Setting up .claude/ structure for project symlinks...'));
  const claudeResults = setupClaudeStructure(targetPath, version, sourcePath);

  if (claudeResults.commands) {
    logSuccess('    ✓ .claude/commands/ (copied from Templates/)');
  } else {
    logWarning('    ⊘ .claude/commands/ (failed)');
  }

  if (claudeResults.hooks) {
    logSuccess('    ✓ .claude/hooks/ (copied from Templates/)');
  } else {
    logWarning('    ⊘ .claude/hooks/ (failed)');
  }

  if (claudeResults.scripts) {
    logSuccess('    ✓ .claude/scripts/shared/ (copied from Templates/)');
  } else {
    logWarning('    ⊘ .claude/scripts/shared/ (failed)');
  }

  if (claudeResults.skills > 0) {
    logSuccess(`    ✓ .claude/skills/ (${claudeResults.skills} skills extracted)`);
  } else {
    logWarning('    ⊘ .claude/skills/ (no skills extracted)');
  }

  if (claudeResults.metadata) {
    logSuccess('    ✓ .claude/metadata/ (registry files copied)');
  } else {
    logWarning('    ⊘ .claude/metadata/ (no registry files found)');
  }

  if (claudeResults.rules.length > 0) {
    logSuccess(`    ✓ .claude/rules/ (${claudeResults.rules.length} rules generated)`);
  } else {
    logWarning('    ⊘ .claude/rules/ (no rules generated)');
  }

  // Step 8: Create/restore projects registry
  log();
  if (restoreProjectsRegistry(targetPath, backupPath)) {
    logSuccess('  ✓ Restored projects.json');
  } else if (createProjectsRegistry(targetPath)) {
    logSuccess('  ✓ Created .projects/projects.json');
  } else {
    logSuccess('  ✓ .projects/projects.json (preserved)');
  }

  // Step 9: Success message
  log();
  logCyan('╔══════════════════════════════════════╗');
  logCyan('║       Hub Installation Complete!     ║');
  logCyan('╚══════════════════════════════════════╝');
  log();
  log(`  ${colors.dim('Hub Location:')}  ${targetPath}`);
  log(`  ${colors.dim('Version:')}       ${colors.green(version)}`);
  log(`  ${colors.dim('Directories:')}   ${colors.green(installedDirs)} installed`);
  log();

  logCyan('  Next steps:');
  log();
  log('    Create a new project:');
  log(`      ${colors.cyan(`node ${path.join(targetPath, 'install-project-new.js')} --target <project-path>`)}`);
  log();
  log('    Add IDPF to existing project:');
  log(`      ${colors.cyan(`node ${path.join(targetPath, 'install-project-existing.js')} --target <project-path>`)}`);
  log();
}

// ======================================
//  Main Entry Point
// ======================================

function main() {
  const args = process.argv.slice(2);

  // Parse --target argument
  const targetIdx = args.indexOf('--target');
  if (targetIdx === -1 || targetIdx === args.length - 1) {
    logError('Usage: node install-hub.js --target <path>');
    logError('');
    logError('Arguments:');
    logError('  --target <path>  Directory to install the IDPF hub');
    logError('');
    logError('Example:');
    logError('  node install-hub.js --target ~/idpf-hub');
    process.exit(1);
  }

  const targetPath = path.resolve(args[targetIdx + 1]);
  const sourcePath = __dirname; // Hub installer runs from the source directory

  // Validate source has framework-manifest.json
  if (!fs.existsSync(path.join(sourcePath, 'framework-manifest.json'))) {
    logError('ERROR: Not a valid IDPF source directory.');
    logError(`  Expected framework-manifest.json in: ${sourcePath}`);
    process.exit(1);
  }

  // Validate target path format
  if (!targetPath || targetPath.trim() === '') {
    logError('ERROR: Target path cannot be empty.');
    process.exit(1);
  }

  // Run installation
  try {
    installHub(sourcePath, targetPath);
  } catch (err) {
    logError(`\nERROR: ${err.message}`);
    process.exit(1);
  }
}

// Run main only when executed directly (not when require'd for testing)
if (require.main === module) {
  main();
}

module.exports = { setupClaudeStructure, cleanOrphanedDirectories, generateHubStartupRules };
