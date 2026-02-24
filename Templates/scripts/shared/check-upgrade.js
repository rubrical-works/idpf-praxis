#!/usr/bin/env node
/**
 * @framework-script 0.51.1
 * check-upgrade.js — Post-upgrade verification for IDPF user projects
 *
 * Exports 4 check functions for verifying hub upgrade integrity:
 *   - checkExtensionIntegrity(projectDir)
 *   - checkCustomScripts(projectDir)
 *   - checkCommandVersionDrift(projectDir, hubDir)
 *   - checkSymlinkHealth(projectDir)
 *
 * Each function returns { pass: boolean, status: 'PASS'|'WARN'|'FAIL', findings: string[] }
 *
 * @see https://github.com/rubrical-studios/idpf-praxis/issues/1501
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
 * Check extension block integrity in EXTENSIBLE commands.
 * Verifies USER-EXTENSION blocks exist and contain content.
 * Compares against git state to detect post-upgrade content loss.
 *
 * @param {string} projectDir - Path to project root
 * @returns {{ pass: boolean, status: string, findings: string[] }}
 */
function checkExtensionIntegrity(projectDir) {
  const findings = [];
  const commandsDir = path.join(projectDir, '.claude', 'commands');

  if (!fs.existsSync(commandsDir)) {
    return { pass: false, status: 'FAIL', findings: ['No .claude/commands/ directory found'] };
  }

  const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));
  let extensibleCount = 0;
  let hasFailure = false;
  let hasWarning = false;

  for (const file of files) {
    const filePath = path.join(commandsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const header = content.match(HEADER_REGEX);

    if (!header || header[1].toUpperCase() !== 'EXTENSIBLE') continue;
    extensibleCount++;

    // Extract extension blocks
    const blocks = [];
    let match;
    const regex = new RegExp(EXTENSION_BLOCK_REGEX.source, EXTENSION_BLOCK_REGEX.flags);
    while ((match = regex.exec(content)) !== null) {
      blocks.push({ name: match[1], content: match[2] });
    }

    if (blocks.length === 0) {
      findings.push(`${file}: No extension blocks found in EXTENSIBLE command`);
      hasWarning = true;
      continue;
    }

    // Check for empty blocks (may be intentional but worth noting)
    const emptyBlocks = blocks.filter(b => !b.content.trim());
    if (emptyBlocks.length === blocks.length) {
      // All blocks empty — expected for uncustomized commands
      continue;
    }

    // Check git state for content loss
    try {
      const relPath = path.relative(projectDir, filePath).replace(/\\/g, '/');
      const diff = execSync(`git diff HEAD -- "${relPath}"`, {
        cwd: projectDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (diff.includes('USER-EXTENSION-START') && diff.startsWith('-')) {
        findings.push(`${file}: Extension block content may have been lost (git diff shows removal)`);
        hasFailure = true;
      }
    } catch {
      // Git not available or not initialized — skip git check
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
 * Check for command version drift between project and hub source.
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
  let noVersionCount = 0;

  for (const file of projectFiles) {
    const projectPath = path.join(projectCommandsDir, file);
    const hubPath = path.join(hubCommandsDir, file);

    if (!fs.existsSync(hubPath)) continue; // Project-only file, skip

    const projectContent = fs.readFileSync(projectPath, 'utf8');
    const hubContent = fs.readFileSync(hubPath, 'utf8');

    const projectHeader = projectContent.match(HEADER_REGEX);
    const hubHeader = hubContent.match(HEADER_REGEX);

    if (!projectHeader || !hubHeader) {
      noVersionCount++;
      continue;
    }

    const projectVersion = projectHeader[2] || null;
    const hubVersion = hubHeader[2] || null;

    if (projectVersion && hubVersion && projectVersion !== hubVersion) {
      findings.push(`${file}: project v${projectVersion} < hub v${hubVersion}`);
      staleCount++;
    }
  }

  if (staleCount > 0) {
    return { pass: false, status: 'FAIL', findings };
  }

  if (noVersionCount > 0) {
    findings.push(`${noVersionCount} commands have no version header (cannot compare)`);
    return { pass: true, status: 'WARN', findings };
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

// ======================================
//  Module exports
// ======================================

module.exports = {
  checkExtensionIntegrity,
  checkCustomScripts,
  checkCommandVersionDrift,
  checkSymlinkHealth,
  EXTENSION_BLOCK_REGEX,
  HEADER_REGEX,
  EXPECTED_SYMLINKS,
};

// ======================================
//  CLI entry point (when run directly)
// ======================================

if (require.main === module) {
  const projectDir = process.cwd();
  console.log('/check-upgrade — Post-upgrade verification\n');

  const checks = [
    { name: 'Extension Integrity', fn: () => checkExtensionIntegrity(projectDir) },
    { name: 'Custom Scripts', fn: () => checkCustomScripts(projectDir) },
    { name: 'Symlink Health', fn: () => checkSymlinkHealth(projectDir) },
  ];

  const statusIcon = { PASS: '\u2705', WARN: '\u26A0\uFE0F', FAIL: '\u274C' };
  let overallPass = true;

  for (const check of checks) {
    const result = check.fn();
    const icon = statusIcon[result.status] || '?';
    console.log(`  ${icon} ${check.name} — ${result.findings[0] || result.status}`);
    if (!result.pass) overallPass = false;
  }

  console.log(`\nOverall: ${overallPass ? 'PASS' : 'FAIL'}`);
  process.exit(overallPass ? 0 : 1);
}
