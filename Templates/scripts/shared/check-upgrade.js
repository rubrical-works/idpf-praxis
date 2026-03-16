#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.65.0
 * check-upgrade.js — Post-upgrade verification for IDPF user projects
 *
 * Exports 5 check functions for verifying hub upgrade integrity:
 *   - checkExtensionIntegrity(projectDir, options?)
 *   - checkCustomScripts(projectDir)
 *   - checkCommandVersionDrift(projectDir, hubDir)
 *   - checkStaleConfigReferences(projectDir, hubDir)
 *   - checkSymlinkHealth(projectDir)
 *
 * Each function returns { pass: boolean, status: 'PASS'|'WARN'|'FAIL', findings: string[] }
 *
 * @see https://github.com/rubrical-works/idpf-praxis-dev/issues/1501
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Extension block regex — same pattern as mergeExtensionBlocks() in install-project-existing.js
const EXTENSION_BLOCK_REGEX = /<!-- USER-EXTENSION-START: ([a-z][a-z0-9-]*) -->([\s\S]*?)<!-- USER-EXTENSION-END: \1 -->/g;

// Command header regex — parses EXTENSIBLE/MANAGED with optional version
const HEADER_REGEX = /<!--\s*(EXTENSIBLE|MANAGED)(?::\s*v?([\d.]+))?\s*-->/i;

// Expected symlink directories (relative to project root)
const EXPECTED_SYMLINKS = [
  '.claude/rules',
  '.claude/hooks',
  '.claude/scripts/shared',
  '.claude/metadata',
  '.claude/skills',
];

/**
 * Extract extension blocks from command file content.
 * @param {string} content - File content to parse
 * @returns {Map<string, string>} Map of blockName → block content (raw, untrimmed)
 */
function extractExtensionBlocks(content) {
  const blocks = new Map();
  const regex = new RegExp(EXTENSION_BLOCK_REGEX.source, EXTENSION_BLOCK_REGEX.flags);
  let match;
  while ((match = regex.exec(content)) !== null) {
    blocks.set(match[1], match[2]);
  }
  return blocks;
}

/**
 * Normalize whitespace for block content comparison.
 * Collapses all whitespace sequences to single space and trims.
 * @param {string} str - Content to normalize
 * @returns {string} Normalized content
 */
function normalizeBlockWhitespace(str) {
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Get file content from a specific git ref.
 * @param {string} ref - Git ref (e.g., 'HEAD', 'HEAD~1')
 * @param {string} relPath - Relative file path (forward slashes)
 * @param {string} cwd - Working directory for git command
 * @returns {string|null} File content or null if not found in ref
 */
function getGitFileContent(ref, relPath, cwd) {
  try {
    return execSync(`git show ${ref}:"${relPath}"`, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    return null;
  }
}

/**
 * Check extension block integrity in EXTENSIBLE commands.
 * Compares extension block content between committed version(s) and working
 * tree to detect post-upgrade content loss. Uses git show for comparison
 * instead of git diff parsing.
 *
 * @param {string} projectDir - Path to project root
 * @param {object} [options] - Optional configuration
 * @param {number} [options.deep=0] - Number of additional commits to scan (0 = HEAD only)
 * @param {string} [options.hubDir=null] - Hub directory for release-aware tracking
 * @returns {{ pass: boolean, status: string, findings: string[] }}
 */
function checkExtensionIntegrity(projectDir, options = {}) {
  const { deep = 0, hubDir = null } = options;
  const findings = [];
  const commandsDir = path.join(projectDir, '.claude', 'commands');

  if (!fs.existsSync(commandsDir)) {
    return { pass: false, status: 'FAIL', findings: ['No .claude/commands/ directory found'] };
  }

  const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));
  let extensibleCount = 0;
  let hasFailure = false;
  let hasWarning = false;

  // Build hub extension block cache for release-aware tracking (AC5)
  const hubBlocksCache = new Map();
  if (hubDir) {
    const hubCommandsDir = path.join(hubDir, '.claude', 'commands');
    if (fs.existsSync(hubCommandsDir)) {
      for (const file of files) {
        const hubPath = path.join(hubCommandsDir, file);
        if (fs.existsSync(hubPath)) {
          const hubContent = fs.readFileSync(hubPath, 'utf8');
          hubBlocksCache.set(file, extractExtensionBlocks(hubContent));
        }
      }
    }
  }

  for (const file of files) {
    const filePath = path.join(commandsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const header = content.match(HEADER_REGEX);

    if (!header || header[1].toUpperCase() !== 'EXTENSIBLE') continue;
    extensibleCount++;

    // Extract working tree blocks
    const currentBlocks = extractExtensionBlocks(content);

    if (currentBlocks.size === 0) {
      // Don't skip — proceed to comparison so we can detect if committed
      // blocks had content (upstream removal vs user content loss)
    }

    // Build list of git refs to check
    const refsToCheck = ['HEAD'];
    for (let i = 1; i <= deep; i++) {
      refsToCheck.push(`HEAD~${i}`);
    }

    const relPath = path.relative(projectDir, filePath).replace(/\\/g, '/');

    for (const ref of refsToCheck) {
      const committedContent = getGitFileContent(ref, relPath, projectDir);
      if (committedContent === null) continue; // File not in this ref — skip

      const committedBlocks = extractExtensionBlocks(committedContent);

      for (const [blockName, committedValue] of committedBlocks) {
        const normalizedCommitted = normalizeBlockWhitespace(committedValue);
        if (!normalizedCommitted) continue; // Empty in committed — nothing to lose

        const currentValue = currentBlocks.get(blockName);

        if (currentValue === undefined) {
          // Block marker removed entirely from working tree
          const hubBlocks = hubBlocksCache.get(file);
          if (hubBlocks && !hubBlocks.has(blockName)) {
            findings.push(`${file}: extension block '${blockName}' removed by upstream (was present in ${ref})`);
            hasWarning = true;
          } else {
            findings.push(`${file}: extension block '${blockName}' lost — was present in ${ref} but missing from working tree`);
            hasFailure = true;
          }
          continue;
        }

        const normalizedCurrent = normalizeBlockWhitespace(currentValue);
        if (!normalizedCurrent && normalizedCommitted) {
          // Content was emptied — check if upstream removal
          const hubBlocks = hubBlocksCache.get(file);
          if (hubBlocks && !hubBlocks.has(blockName)) {
            findings.push(`${file}: extension block '${blockName}' removed by upstream (content was present in ${ref})`);
            hasWarning = true;
          } else {
            findings.push(`${file}: extension block '${blockName}' content lost — had content in ${ref} but empty in working tree`);
            hasFailure = true;
          }
        }
      }
    }
  }

  if (extensibleCount === 0) {
    return { pass: true, status: 'WARN', findings: ['No EXTENSIBLE commands found'] };
  }

  if (hasFailure) {
    return { pass: false, status: 'FAIL', findings };
  }

  if (hasWarning) {
    return { pass: true, status: 'WARN', findings };
  }

  findings.push(`${extensibleCount} extensible commands checked, all blocks intact`);
  return { pass: true, status: 'PASS', findings };
}

/**
 * Check that user-created (non-symlinked) scripts still exist.
 *
 * @param {string} projectDir - Path to project root
 * @returns {{ pass: boolean, status: string, findings: string[] }}
 */
function checkCustomScripts(projectDir) {
  const findings = [];
  const scriptsDir = path.join(projectDir, '.claude', 'scripts');

  if (!fs.existsSync(scriptsDir)) {
    return { pass: true, status: 'WARN', findings: ['No .claude/scripts/ directory found'] };
  }

  const customScripts = [];

  function scanDir(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      try {
        const stat = fs.lstatSync(fullPath);
        if (stat.isSymbolicLink()) continue; // Skip symlinked files/dirs
        if (stat.isDirectory()) {
          scanDir(fullPath);
        } else {
          customScripts.push(fullPath);
        }
      } catch {
        // Skip inaccessible files
      }
    }
  }

  scanDir(scriptsDir);

  if (customScripts.length === 0) {
    return { pass: true, status: 'WARN', findings: ['No custom scripts found (nothing to verify)'] };
  }

  const missing = customScripts.filter(f => !fs.existsSync(f));
  if (missing.length > 0) {
    for (const f of missing) {
      findings.push(`Missing custom script: ${path.relative(projectDir, f)}`);
    }
    return { pass: false, status: 'FAIL', findings };
  }

  findings.push(`${customScripts.length} custom scripts verified`);
  return { pass: true, status: 'PASS', findings };
}

/**
 * Normalize command content for diff comparison by stripping extension block
 * content while preserving markers. This allows comparing template structure
 * without being affected by user customizations in extension blocks.
 */
function normalizeForDiff(content) {
  return content.replace(EXTENSION_BLOCK_REGEX, '<!-- USER-EXTENSION-START: $1 -->\n<!-- USER-EXTENSION-END: $1 -->');
}

/**
 * Check for command version drift between project and hub source.
 * Uses version-header comparison as a fast path when both files have version
 * numbers, and falls back to diff-based comparison for bare markers.
 *
 * @param {string} projectDir - Path to project root
 * @param {string} hubDir - Path to hub root
 * @returns {{ pass: boolean, status: string, findings: string[] }}
 */
function checkCommandVersionDrift(projectDir, hubDir) {
  const findings = [];
  const projectCommandsDir = path.join(projectDir, '.claude', 'commands');
  const hubCommandsDir = path.join(hubDir, '.claude', 'commands');

  if (!fs.existsSync(projectCommandsDir)) {
    return { pass: false, status: 'FAIL', findings: ['No .claude/commands/ directory in project'] };
  }

  if (!fs.existsSync(hubCommandsDir)) {
    return { pass: true, status: 'WARN', findings: ['Hub commands directory not found — cannot compare versions'] };
  }

  const projectFiles = fs.readdirSync(projectCommandsDir).filter(f => f.endsWith('.md'));
  let staleCount = 0;

  for (const file of projectFiles) {
    const projectPath = path.join(projectCommandsDir, file);
    const hubPath = path.join(hubCommandsDir, file);

    if (!fs.existsSync(hubPath)) continue; // Project-only file, skip

    const projectContent = fs.readFileSync(projectPath, 'utf8');
    const hubContent = fs.readFileSync(hubPath, 'utf8');

    const projectHeader = projectContent.match(HEADER_REGEX);
    const hubHeader = hubContent.match(HEADER_REGEX);

    // Fast path: if both have version numbers, compare versions directly
    const projectVersion = projectHeader ? projectHeader[2] || null : null;
    const hubVersion = hubHeader ? hubHeader[2] || null : null;

    if (projectVersion && hubVersion) {
      if (projectVersion !== hubVersion) {
        findings.push(`${file}: project v${projectVersion} < hub v${hubVersion}`);
        staleCount++;
      }
      continue;
    }

    // Default path: diff-based comparison (handles bare markers and no-marker files)
    const normalizedProject = normalizeForDiff(projectContent);
    const normalizedHub = normalizeForDiff(hubContent);

    if (normalizedProject !== normalizedHub) {
      findings.push(`${file}: content differs from hub (diff comparison)`);
      staleCount++;
    }
  }

  if (staleCount > 0) {
    return { pass: true, status: 'DRIFT', findings };
  }

  findings.push(`${projectFiles.length} commands at current hub version`);
  return { pass: true, status: 'PASS', findings };
}

/**
 * Check symlink health for expected hub-linked directories.
 *
 * @param {string} projectDir - Path to project root
 * @returns {{ pass: boolean, status: string, findings: string[] }}
 */
function checkSymlinkHealth(projectDir) {
  const findings = [];
  let hasFailure = false;
  let hasWarning = false;
  let validCount = 0;

  for (const relPath of EXPECTED_SYMLINKS) {
    const fullPath = path.join(projectDir, relPath);

    // Check if path exists at all
    if (!fs.existsSync(fullPath)) {
      findings.push(`${relPath}: not found`);
      hasWarning = true;
      continue;
    }

    // Check if it's a symlink
    let stat;
    try {
      stat = fs.lstatSync(fullPath);
    } catch {
      findings.push(`${relPath}: cannot read`);
      hasFailure = true;
      continue;
    }

    if (!stat.isSymbolicLink()) {
      // Not a symlink — could be a direct directory (framework-hosted)
      // This is acceptable for self-hosted repos
      validCount++;
      continue;
    }

    // Check symlink target
    let target;
    try {
      target = fs.readlinkSync(fullPath);
    } catch {
      findings.push(`${relPath}: cannot read symlink target`);
      hasFailure = true;
      continue;
    }

    // Resolve target and check it exists
    const resolvedTarget = path.resolve(path.dirname(fullPath), target);
    if (!fs.existsSync(resolvedTarget)) {
      findings.push(`${relPath}: symlink target does not exist (${target})`);
      hasFailure = true;
      continue;
    }

    // Check target has files
    try {
      const entries = fs.readdirSync(resolvedTarget);
      if (entries.length === 0) {
        findings.push(`${relPath}: symlink target is empty (${target})`);
        hasWarning = true;
        continue;
      }
    } catch {
      findings.push(`${relPath}: cannot read symlink target contents`);
      hasFailure = true;
      continue;
    }

    validCount++;
  }

  if (hasFailure) {
    return { pass: false, status: 'FAIL', findings };
  }

  if (hasWarning) {
    return { pass: true, status: 'WARN', findings };
  }

  findings.push(`${validCount}/${EXPECTED_SYMLINKS.length} symlinks valid`);
  return { pass: true, status: 'PASS', findings };
}

/**
 * Check for stale .gh-pmu.yml references in project commands.
 * After the .gh-pmu.yml → .gh-pmu.json migration (#1566), user project
 * command files may still contain references to the old YAML filename.
 *
 * Reports both stale files (still referencing .yml) and migrated files
 * (already using .json) to give a complete migration picture.
 *
 * @param {string} projectDir - Path to project root
 * @param {string|null} hubDir - Path to hub root (null if no hub detected)
 * @returns {{ pass: boolean, status: string, findings: string[] }}
 */
function checkStaleConfigReferences(projectDir, hubDir) {
  const findings = [];
  const projectCommandsDir = path.join(projectDir, '.claude', 'commands');

  if (!fs.existsSync(projectCommandsDir)) {
    return { pass: true, status: 'PASS', findings: ['No .claude/commands/ directory — nothing to check'] };
  }

  const projectFiles = fs.readdirSync(projectCommandsDir).filter(f => f.endsWith('.md'));
  const staleFiles = [];
  const migratedFiles = [];

  for (const file of projectFiles) {
    // Skip check-upgrade.md — its .gh-pmu.yml references are spec text
    // documenting the stale config detection feature, not actual config usage (#1582)
    if (file === 'check-upgrade.md') continue;

    const projectPath = path.join(projectCommandsDir, file);
    const projectContent = fs.readFileSync(projectPath, 'utf8');

    const ymlRefs = (projectContent.match(/\.gh-pmu\.yml/g) || []).length;

    if (ymlRefs > 0) {
      // Project still has .gh-pmu.yml references
      if (hubDir) {
        const hubPath = path.join(hubDir, '.claude', 'commands', file);
        if (fs.existsSync(hubPath)) {
          const hubContent = fs.readFileSync(hubPath, 'utf8');
          const hubHasJson = hubContent.includes('.gh-pmu.json');
          if (hubHasJson) {
            staleFiles.push({ file, count: ymlRefs });
          }
          // If hub also has .yml, both are pre-migration — not flagged
        } else {
          // No hub counterpart — flag as stale anyway
          staleFiles.push({ file, count: ymlRefs });
        }
      } else {
        // No hub dir — flag all .yml refs as stale
        staleFiles.push({ file, count: ymlRefs });
      }
    } else if (hubDir) {
      // No .yml refs — check if this file references .gh-pmu.json (migrated)
      const hubPath = path.join(hubDir, '.claude', 'commands', file);
      if (fs.existsSync(hubPath)) {
        const hubContent = fs.readFileSync(hubPath, 'utf8');
        const hubHasJson = hubContent.includes('.gh-pmu.json');
        const projectHasJson = projectContent.includes('.gh-pmu.json');
        if (projectHasJson && hubHasJson) {
          migratedFiles.push(file);
        }
      }
    }
  }

  if (staleFiles.length === 0 && migratedFiles.length === 0) {
    return { pass: true, status: 'PASS', findings: ['No .gh-pmu.yml references found'] };
  }

  if (staleFiles.length === 0) {
    findings.push(`All commands migrated to .gh-pmu.json (${migratedFiles.length} files)`);
    return { pass: true, status: 'PASS', findings };
  }

  // Has stale files — WARN status
  for (const { file, count } of staleFiles) {
    findings.push(`${file}: stale .gh-pmu.yml reference (${count} occurrence${count > 1 ? 's' : ''})`);
  }
  for (const file of migratedFiles) {
    findings.push(`${file}: migrated to .gh-pmu.json`);
  }

  return { pass: true, status: 'WARN', findings };
}

/**
 * Get list of committable (non-symlinked) files/dirs that are modified
 * after a hub upgrade. Symlinked directories point to the hub and
 * should not be staged — only copied files are project-owned.
 *
 * @param {string} projectDir - Path to project root
 * @returns {string[]} Relative paths suitable for git add
 */
function getCommitableFiles(projectDir) {
  const candidates = ['.claude/commands', 'framework-config.json'];
  const result = [];

  for (const rel of candidates) {
    const full = path.join(projectDir, rel);
    if (!fs.existsSync(full)) continue;
    try {
      if (fs.lstatSync(full).isSymbolicLink()) continue;
    } catch {
      continue;
    }
    result.push(rel);
  }

  return result;
}

/**
 * Read the hub version from framework-config.json.
 * Used for commit messages: "chore: upgrade hub to vX.Y.Z"
 *
 * @param {string} projectDir - Path to project root
 * @returns {string|null} Version string (e.g., "0.53.1") or null if unavailable
 */
function getHubVersion(projectDir) {
  try {
    const configPath = path.join(projectDir, 'framework-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return config.frameworkVersion || null;
  } catch {
    return null;
  }
}

/**
 * Determine overall result from individual check results.
 * Distinguishes version drift (informational) from genuine integrity failures.
 *
 * @param {Array<{name: string, pass: boolean, status: string, findings: string[]}>} checkResults
 * @returns {{ exitCode: number, statusLabel: string, hasDrift: boolean, overallPass: boolean }}
 */
function determineOverallResult(checkResults) {
  const hasFailure = checkResults.some(r => !r.pass);
  const hasDrift = checkResults.some(r => r.status === 'DRIFT');

  if (hasFailure) {
    return { exitCode: 1, statusLabel: 'FAIL', hasDrift, overallPass: false };
  }

  if (hasDrift) {
    return { exitCode: 0, statusLabel: 'NEEDS UPDATE', hasDrift, overallPass: true };
  }

  return { exitCode: 0, statusLabel: 'PASS', hasDrift: false, overallPass: true };
}

// ======================================
//  Module exports
// ======================================

module.exports = {
  checkExtensionIntegrity,
  checkCustomScripts,
  checkCommandVersionDrift,
  checkStaleConfigReferences,
  checkSymlinkHealth,
  determineOverallResult,
  getCommitableFiles,
  getHubVersion,
  extractExtensionBlocks,
  normalizeBlockWhitespace,
  EXTENSION_BLOCK_REGEX,
  HEADER_REGEX,
  EXPECTED_SYMLINKS,
};

// ======================================
//  CLI entry point (when run directly)
// ======================================

if (require.main === module) {
  const projectDir = process.cwd();
  const args = process.argv.slice(2);
  const commitFlag = args.includes('--commit');
  const noCommitFlag = args.includes('--no-commit');
  const deepIdx = args.indexOf('--deep');
  const deepValue = deepIdx !== -1 && args[deepIdx + 1] ? parseInt(args[deepIdx + 1], 10) : 0;

  console.log('/check-upgrade — Post-upgrade verification\n');

  // Detect hub directory from symlink targets
  let hubDir = null;
  const rulesLink = path.join(projectDir, '.claude', 'rules');
  try {
    const target = fs.readlinkSync(rulesLink);
    // Symlink target points to hub's .claude/rules — resolve to hub root
    hubDir = path.resolve(path.dirname(rulesLink), target, '..', '..');
  } catch {
    // Not a symlink — self-hosted repo, hubDir stays null
  }

  const checks = [
    { name: 'Extension Integrity', fn: () => checkExtensionIntegrity(projectDir, { deep: deepValue, hubDir }) },
    { name: 'Custom Scripts', fn: () => checkCustomScripts(projectDir) },
    { name: 'Symlink Health', fn: () => checkSymlinkHealth(projectDir) },
  ];

  // Version Drift and Stale Config References require hubDir
  if (hubDir) {
    checks.push({ name: 'Version Drift', fn: () => checkCommandVersionDrift(projectDir, hubDir) });
  }
  checks.push({ name: 'Stale Config References', fn: () => checkStaleConfigReferences(projectDir, hubDir) });

  const statusIcon = { PASS: '\u2705', WARN: '\u26A0\uFE0F', FAIL: '\u274C', DRIFT: '\u26A0\uFE0F' };
  const checkResults = [];

  for (const check of checks) {
    const result = check.fn();
    const icon = statusIcon[result.status] || '?';
    console.log(`  ${icon} ${check.name} — ${result.findings[0] || result.status}`);
    checkResults.push({ name: check.name, ...result });
  }

  const overall = determineOverallResult(checkResults);
  const overallPass = overall.overallPass;

  // Version drift informational message
  if (overall.hasDrift) {
    const projectVersion = getHubVersion(projectDir);
    let hubVersion = null;
    if (hubDir) {
      hubVersion = getHubVersion(hubDir);
    }
    if (projectVersion && hubVersion) {
      console.log(`\n  Project commands are at v${projectVersion} but hub is at v${hubVersion}. Run px-manager to refresh.`);
    } else if (projectVersion) {
      console.log(`\n  Project commands are at v${projectVersion} but hub has a newer version. Run px-manager to refresh.`);
    }
  }

  console.log(`\nOverall: ${overall.statusLabel}`);

  // Structured JSON output for AI consumption
  const changedFiles = overallPass ? getCommitableFiles(projectDir) : [];
  const hubVersion = getHubVersion(projectDir);
  const jsonOutput = {
    checks: checkResults,
    overallPass,
    commitReady: overallPass && !noCommitFlag,
    changedFiles,
    hubVersion,
    commitFlag,
    noCommitFlag,
  };
  console.log('\n---JSON---');
  console.log(JSON.stringify(jsonOutput));

  // --no-commit: skip commit with message
  if (noCommitFlag) {
    console.log('\nSkipping commit (--no-commit).');
    process.exit(overallPass ? 0 : 1);
  }

  // Auto-commit when --commit flag provided and all checks pass
  if (commitFlag && overallPass) {
    const files = getCommitableFiles(projectDir);
    if (files.length > 0) {
      const msg = hubVersion
        ? `chore: upgrade hub to v${hubVersion}`
        : 'chore: upgrade hub';
      try {
        execSync(`git add ${files.join(' ')}`, { cwd: projectDir, stdio: 'pipe' });
        execSync(`git commit -m "${msg}"`, { cwd: projectDir, stdio: 'pipe' });
        console.log('\nCommitted upgraded files.');
      } catch (err) {
        console.error(`\nCommit failed: ${err.message}`);
      }
    }
  }

  process.exit(overallPass ? 0 : 1);
}
