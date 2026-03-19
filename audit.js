#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.66.0
 * audit.js - IDPF Framework Installation Auditor
 *
 * Audits all IDPF Framework installations to detect:
 * - Modified files (user changed managed files)
 * - Outdated files (older version installed)
 * - Custom/untracked files (not in manifest)
 * - Missing files (expected but not present)
 * - Configuration inconsistencies
 *
 * Usage:
 *   node audit.js          # Audit only - report issues
 *   node audit.js --fix    # Interactive fix mode
 *
 * @module audit
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

// Status indicators
const STATUS = {
  CLEAN: '✅ Clean',
  MODIFIED: '⚠️  Modified',
  OUTDATED: '📦 Outdated',
  MODIFIED_OUTDATED: '❌ Modified+Outdated',
  USER_SCRIPT: '👤 User Script',
  MISSING_USER_SCRIPT: '❓ Missing User Script',
  ORPHANED_ENTRY: '⚠️  Orphaned Entry',
  UNTRACKED: '➕ Untracked',
  MISSING: '❓ Missing',
  CONFIG_MISMATCH: '⚠️  Config Mismatch',
  NOT_IDPF_PROJECT: '⏭️  Not IDPF Project',
};

// Directories to audit within .claude/
const AUDIT_DIRS = ['scripts', 'commands', 'rules', 'hooks'];

/**
 * Compute SHA256 hash of file content
 */
function computeFileHash(filePath) {
  const content = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256');
  hash.update(content);
  return hash.digest('hex');
}

/**
 * Compute hash of content string with 0.66.0 replaced
 */
function computeContentHashWithVersion(content, version) {
  const replaced = content.replace(/\{\{VERSION\}\}/g, version);
  const hash = crypto.createHash('sha256');
  hash.update(replaced, 'utf8');
  return hash.digest('hex');
}

/**
 * Read JSON file safely
 */
function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Get all files recursively in a directory
 */
function getAllFiles(dir, baseDir = dir) {
  const files = [];
  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath, baseDir));
    } else {
      // Return relative path from baseDir
      files.push(path.relative(baseDir, fullPath).replace(/\\/g, '/'));
    }
  }
  return files;
}

/**
 * Get user scripts from framework-config.json
 * Returns a Set of relative paths like "scripts/prepare-release/coverage.js"
 */
function getUserScriptPaths(userScripts) {
  const paths = new Set();
  if (!userScripts) return paths;

  for (const [dir, scripts] of Object.entries(userScripts)) {
    for (const script of scripts) {
      paths.add(`scripts/${dir}/${script}`);
    }
  }
  return paths;
}

/**
 * Get expected files from manifest categories
 * Returns an object with category -> { filename: checksum data }
 */
function getManifestFiles(manifest) {
  const files = {
    scripts: {},
    commands: {},
    rules: {},
    hooks: {},
  };

  if (manifest?.scripts) {
    for (const [key, data] of Object.entries(manifest.scripts)) {
      files.scripts[key] = data;
    }
  }
  if (manifest?.commands) {
    for (const [key, data] of Object.entries(manifest.commands)) {
      files.commands[key] = data;
    }
  }
  if (manifest?.rules) {
    for (const [key, data] of Object.entries(manifest.rules)) {
      files.rules[key] = data;
    }
  }
  if (manifest?.hooks) {
    for (const [key, data] of Object.entries(manifest.hooks)) {
      files.hooks[key] = data;
    }
  }

  return files;
}

/**
 * Compute expected hash from source file
 */
function computeSourceHash(frameworkPath, sourcePath, version) {
  // Handle generated files
  if (sourcePath === 'generated') {
    return null; // Can't compare generated files
  }

  const fullPath = path.join(frameworkPath, 'Templates', sourcePath);
  if (!fs.existsSync(fullPath)) {
    // Try without Templates/ prefix for non-template sources
    const altPath = path.join(frameworkPath, sourcePath);
    if (fs.existsSync(altPath)) {
      const content = fs.readFileSync(altPath, 'utf8');
      return computeContentHashWithVersion(content, version);
    }
    return null;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  return computeContentHashWithVersion(content, version);
}

/**
 * Audit a single project
 */
function auditProject(projectPath, frameworkPath, installedVersion) {
  const results = [];
  const claudeDir = path.join(projectPath, '.claude');

  if (!fs.existsSync(claudeDir)) {
    results.push({
      status: STATUS.MISSING,
      file: '.claude/',
      details: 'Project .claude/ directory not found',
    });
    return results;
  }

  // Read project configs
  const frameworkConfig = readJsonFile(path.join(projectPath, 'framework-config.json'));
  const manifest = readJsonFile(path.join(claudeDir, '.manifest.json'));

  // Check if this is actually an IDPF-installed project
  // Must have both framework-config.json AND .claude/.manifest.json
  if (!frameworkConfig || !manifest) {
    results.push({
      status: STATUS.NOT_IDPF_PROJECT,
      file: projectPath,
      details: !frameworkConfig
        ? 'Missing framework-config.json (not IDPF-installed)'
        : 'Missing .claude/.manifest.json (not IDPF-installed)',
    });
    return results;
  }

  // Configuration validation
  if (frameworkConfig && manifest) {
    // Skip version check when manifest uses 0.66.0 placeholder (dev environment)
    if (frameworkConfig.frameworkVersion !== manifest.version && !manifest.version.includes('{{')) {
      results.push({
        status: STATUS.CONFIG_MISMATCH,
        file: 'framework-config.json',
        details: `frameworkVersion (${frameworkConfig.frameworkVersion}) ≠ manifest version (${manifest.version})`,
      });
    }
  }

  // Check frameworkPath validity
  if (frameworkConfig?.frameworkPath && !fs.existsSync(frameworkConfig.frameworkPath)) {
    results.push({
      status: STATUS.CONFIG_MISMATCH,
      file: 'framework-config.json',
      details: `frameworkPath does not exist: ${frameworkConfig.frameworkPath}`,
    });
  }

  // Get manifest files by category
  const manifestFiles = getManifestFiles(manifest);

  // Get user scripts (these are expected custom files)
  const userScriptPaths = getUserScriptPaths(frameworkConfig?.userScripts);

  // Validate userScripts entries
  if (frameworkConfig?.userScripts) {
    for (const [dir, scripts] of Object.entries(frameworkConfig.userScripts)) {
      const dirPath = path.join(claudeDir, 'scripts', dir);

      // Check if directory exists
      if (!fs.existsSync(dirPath)) {
        results.push({
          status: STATUS.ORPHANED_ENTRY,
          file: `userScripts["${dir}"]`,
          details: `Directory .claude/scripts/${dir}/ doesn't exist`,
          fixable: true,
          fixType: 'orphaned-dir',
          fixKey: dir,
        });
        continue;
      }

      // Check if each script exists
      for (const script of scripts) {
        const scriptPath = path.join(dirPath, script);
        if (!fs.existsSync(scriptPath)) {
          results.push({
            status: STATUS.MISSING_USER_SCRIPT,
            file: `scripts/${dir}/${script}`,
            details: 'Listed in userScripts but file not found',
            fixable: true,
            fixType: 'missing-script',
            fixKey: dir,
            fixScript: script,
          });
        } else {
          results.push({
            status: STATUS.USER_SCRIPT,
            file: `scripts/${dir}/${script}`,
            details: 'User-defined script',
          });
        }
      }
    }
  }

  // Audit each category
  for (const category of AUDIT_DIRS) {
    const categoryDir = path.join(claudeDir, category);
    if (!fs.existsSync(categoryDir)) {
      continue;
    }

    const categoryManifest = manifestFiles[category] || {};
    const actualFiles = getAllFiles(categoryDir);

    // Check files in manifest
    for (const [filename, data] of Object.entries(categoryManifest)) {
      const filePath = path.join(categoryDir, filename);
      const relPath = `${category}/${filename}`;

      if (!fs.existsSync(filePath)) {
        results.push({
          status: STATUS.MISSING,
          file: relPath,
          details: 'Expected file not found',
        });
        continue;
      }

      const currentHash = computeFileHash(filePath);
      const storedHash = data.checksum;
      const sourceHash = computeSourceHash(frameworkPath, data.source, installedVersion);

      const matchesStored = currentHash === storedHash;
      const matchesSource = sourceHash ? currentHash === sourceHash : null;

      if (matchesStored && (matchesSource === null || matchesSource)) {
        results.push({
          status: STATUS.CLEAN,
          file: relPath,
          details: 'Up to date',
        });
      } else if (!matchesStored && matchesSource) {
        results.push({
          status: STATUS.MODIFIED,
          file: relPath,
          details: 'File was modified by user',
        });
      } else if (matchesStored && matchesSource === false) {
        results.push({
          status: STATUS.OUTDATED,
          file: relPath,
          details: 'Newer version available',
        });
      } else if (!matchesStored && matchesSource === false) {
        results.push({
          status: STATUS.MODIFIED_OUTDATED,
          file: relPath,
          details: 'Modified and outdated',
        });
      } else {
        // matchesSource is null (generated file)
        if (matchesStored) {
          results.push({
            status: STATUS.CLEAN,
            file: relPath,
            details: 'Generated file unchanged',
          });
        } else {
          results.push({
            status: STATUS.MODIFIED,
            file: relPath,
            details: 'Generated file was modified',
          });
        }
      }
    }

    // Check for untracked files
    for (const file of actualFiles) {
      const relPath = `${category}/${file}`;

      // Skip if in manifest
      if (categoryManifest[file]) {
        continue;
      }

      // Skip .gitkeep files
      if (file.endsWith('.gitkeep')) {
        continue;
      }

      // Skip if it's a user script
      if (userScriptPaths.has(relPath)) {
        continue;
      }

      results.push({
        status: STATUS.UNTRACKED,
        file: relPath,
        details: 'File not in manifest',
      });
    }
  }

  return results;
}

/**
 * Print audit results as a table
 */
function printResults(projectPath, results) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`Project: ${projectPath}`);
  console.log('═'.repeat(80));

  if (results.length === 0) {
    console.log('  No files found to audit.');
    return;
  }

  // Group by status
  const byStatus = {};
  for (const r of results) {
    if (!byStatus[r.status]) {
      byStatus[r.status] = [];
    }
    byStatus[r.status].push(r);
  }

  // Print in order of severity
  const order = [
    STATUS.CONFIG_MISMATCH,
    STATUS.ORPHANED_ENTRY,
    STATUS.MISSING_USER_SCRIPT,
    STATUS.MISSING,
    STATUS.MODIFIED_OUTDATED,
    STATUS.MODIFIED,
    STATUS.OUTDATED,
    STATUS.UNTRACKED,
    STATUS.USER_SCRIPT,
    STATUS.CLEAN,
  ];

  for (const status of order) {
    const items = byStatus[status];
    if (!items || items.length === 0) continue;

    console.log(`\n${status} (${items.length})`);
    for (const item of items) {
      console.log(`  ${item.file}`);
      if (item.details && status !== STATUS.CLEAN && status !== STATUS.USER_SCRIPT) {
        console.log(`    └─ ${item.details}`);
      }
    }
  }
}

/**
 * Print summary statistics
 */
function printSummary(allResults) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log('AUDIT SUMMARY');
  console.log('═'.repeat(80));

  const totals = {};
  for (const [, results] of allResults) {
    for (const r of results) {
      totals[r.status] = (totals[r.status] || 0) + 1;
    }
  }

  const issues = (totals[STATUS.CONFIG_MISMATCH] || 0) +
                 (totals[STATUS.ORPHANED_ENTRY] || 0) +
                 (totals[STATUS.MISSING_USER_SCRIPT] || 0) +
                 (totals[STATUS.MISSING] || 0) +
                 (totals[STATUS.MODIFIED_OUTDATED] || 0) +
                 (totals[STATUS.MODIFIED] || 0) +
                 (totals[STATUS.OUTDATED] || 0) +
                 (totals[STATUS.UNTRACKED] || 0);

  const clean = totals[STATUS.CLEAN] || 0;
  const userScripts = totals[STATUS.USER_SCRIPT] || 0;

  console.log(`\nTotal files audited: ${clean + issues + userScripts}`);
  console.log(`  ${STATUS.CLEAN}: ${clean}`);
  console.log(`  ${STATUS.USER_SCRIPT}: ${userScripts}`);
  console.log(`  Issues found: ${issues}`);

  if (issues > 0) {
    console.log('\nBreakdown of issues:');
    if (totals[STATUS.CONFIG_MISMATCH]) console.log(`  ${STATUS.CONFIG_MISMATCH}: ${totals[STATUS.CONFIG_MISMATCH]}`);
    if (totals[STATUS.ORPHANED_ENTRY]) console.log(`  ${STATUS.ORPHANED_ENTRY}: ${totals[STATUS.ORPHANED_ENTRY]}`);
    if (totals[STATUS.MISSING_USER_SCRIPT]) console.log(`  ${STATUS.MISSING_USER_SCRIPT}: ${totals[STATUS.MISSING_USER_SCRIPT]}`);
    if (totals[STATUS.MISSING]) console.log(`  ${STATUS.MISSING}: ${totals[STATUS.MISSING]}`);
    if (totals[STATUS.MODIFIED_OUTDATED]) console.log(`  ${STATUS.MODIFIED_OUTDATED}: ${totals[STATUS.MODIFIED_OUTDATED]}`);
    if (totals[STATUS.MODIFIED]) console.log(`  ${STATUS.MODIFIED}: ${totals[STATUS.MODIFIED]}`);
    if (totals[STATUS.OUTDATED]) console.log(`  ${STATUS.OUTDATED}: ${totals[STATUS.OUTDATED]}`);
    if (totals[STATUS.UNTRACKED]) console.log(`  ${STATUS.UNTRACKED}: ${totals[STATUS.UNTRACKED]}`);
  }
}

/**
 * Prompt user for yes/no answer
 */
async function promptYesNo(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

/**
 * Fix a single issue
 */
async function fixIssue(projectPath, issue) {
  const configPath = path.join(projectPath, 'framework-config.json');
  const config = readJsonFile(configPath);

  if (!config || !config.userScripts) {
    console.log('  ✗ Could not read framework-config.json');
    return false;
  }

  if (issue.fixType === 'orphaned-dir') {
    // Remove the entire directory entry from userScripts
    delete config.userScripts[issue.fixKey];
    // Clean up empty userScripts object
    if (Object.keys(config.userScripts).length === 0) {
      delete config.userScripts;
    }
  } else if (issue.fixType === 'missing-script') {
    // Remove the script from the array
    const scripts = config.userScripts[issue.fixKey];
    const idx = scripts.indexOf(issue.fixScript);
    if (idx !== -1) {
      scripts.splice(idx, 1);
    }
    // Clean up empty array
    if (scripts.length === 0) {
      delete config.userScripts[issue.fixKey];
    }
    // Clean up empty userScripts object
    if (config.userScripts && Object.keys(config.userScripts).length === 0) {
      delete config.userScripts;
    }
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return true;
}

/**
 * Run fix mode for a project
 */
async function runFixMode(projectPath, results) {
  const fixableIssues = results.filter(r => r.fixable);

  if (fixableIssues.length === 0) {
    console.log('  No fixable issues found.');
    return;
  }

  console.log(`\nFound ${fixableIssues.length} fixable issue(s):\n`);

  for (const issue of fixableIssues) {
    console.log(`${issue.status}: ${issue.file}`);
    console.log(`  ${issue.details}`);
    console.log();

    const shouldFix = await promptYesNo('  Remove reference from framework-config.json?');

    if (shouldFix) {
      const success = await fixIssue(projectPath, issue);
      if (success) {
        console.log(`  ✓ Fixed: removed reference\n`);
      } else {
        console.log(`  ✗ Failed to fix\n`);
      }
    } else {
      console.log(`  Skipped\n`);
    }
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const fixMode = args.includes('--fix');

  // Get the directory where audit.js is located (the framework path)
  const frameworkPath = path.dirname(process.argv[1]);

  // Read installed-projects.json from same directory
  const projectsFile = path.join(frameworkPath, 'installed-projects.json');
  const projectsData = readJsonFile(projectsFile);

  if (!projectsData || !projectsData.projects || projectsData.projects.length === 0) {
    console.log('No installed projects found.');
    console.log(`Expected: ${projectsFile}`);
    process.exit(0);
  }

  console.log(`IDPF Framework Audit`);
  console.log(`Version: 0.66.0`);
  console.log(`Mode: ${fixMode ? 'Fix' : 'Audit'}`);
  console.log(`Projects: ${projectsData.projects.length}`);

  const allResults = [];

  for (const project of projectsData.projects) {
    const projectPath = project.path;

    if (!fs.existsSync(projectPath)) {
      console.log(`\n⚠️  Project path does not exist: ${projectPath}`);
      continue;
    }

    const results = auditProject(projectPath, frameworkPath, project.installedVersion);
    allResults.push([projectPath, results]);

    printResults(projectPath, results);

    if (fixMode) {
      await runFixMode(projectPath, results);
    }
  }

  printSummary(allResults);
}

// Run
main().catch((err) => {
  console.error('Audit failed:', err.message);
  process.exit(1);
});
