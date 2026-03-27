#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.74.0
 * @description Unified skill lifecycle management with subcommands: list (show installed/available), install (deploy from packages), remove (uninstall), info (show skill details). Uses symlink-based per-skill deployment. Successor to install-skill.js with improved architecture.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');

/**
 * Load defaultSkills from skill-keywords.json metadata.
 * @param {string} projectDir - Path to the project directory
 * @returns {string[]} Array of default skill names, or empty array if unavailable
 */
function getDefaultSkills(projectDir) {
  const keywordsPath = path.join(projectDir, '.claude', 'metadata', 'skill-keywords.json');
  if (!fs.existsSync(keywordsPath)) {
    return [];
  }
  try {
    const data = JSON.parse(fs.readFileSync(keywordsPath, 'utf-8'));
    return Array.isArray(data.defaultSkills) ? data.defaultSkills : [];
  } catch (_err) {
    return [];
  }
}

/**
 * Check if a skill is a framework default.
 * @param {string} projectDir - Path to the project directory
 * @param {string} skillName - Name of the skill to check
 * @returns {boolean} True if the skill is in defaultSkills
 */
function isDefaultSkill(projectDir, skillName) {
  return getDefaultSkills(projectDir).includes(skillName);
}

/**
 * List available and installed skills.
 * @param {string} projectDir - Path to the project directory
 * @param {object} [options] - Options
 * @param {boolean} [options.verbose] - Include category and invocation mode
 * @returns {object} { ok, skills, installedCount, totalCount, error? }
 */
function listSkills(projectDir, options = {}) {
  const registryPath = path.join(projectDir, '.claude', 'metadata', 'skill-registry.json');
  const configPath = path.join(projectDir, 'framework-config.json');

  // Registry is required
  if (!fs.existsSync(registryPath)) {
    return { ok: false, error: 'Skill registry not found. Ensure .claude/metadata/skill-registry.json exists.' };
  }

  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  } catch (_err) {
    return { ok: false, error: 'Skill registry is not valid JSON.' };
  }

  // Config is optional — missing means no skills installed
  let projectSkills = [];
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      projectSkills = Array.isArray(config.projectSkills) ? config.projectSkills : [];
    } catch (_err) {
      // Invalid config — treat as no skills installed
    }
  }

  const defaults = getDefaultSkills(projectDir);

  const skills = registry.skills.map(entry => {
    const skill = {
      name: entry.name,
      description: entry.description,
      installed: projectSkills.includes(entry.name),
      isDefault: defaults.includes(entry.name),
      category: entry.category || null,
    };

    if (options.verbose) {
      skill.invocationMode = entry.invocationMode || 'auto';
    }

    return skill;
  });

  const installedCount = skills.filter(s => s.installed).length;

  return {
    ok: true,
    skills,
    installedCount,
    totalCount: skills.length,
  };
}

/**
 * Load registry and config for skill operations.
 * @param {string} projectDir - Path to the project directory
 * @returns {object} { ok, registry, projectSkills, configPath, error? }
 */
function loadContext(projectDir) {
  const registryPath = path.join(projectDir, '.claude', 'metadata', 'skill-registry.json');
  const configPath = path.join(projectDir, 'framework-config.json');

  if (!fs.existsSync(registryPath)) {
    return { ok: false, error: 'Skill registry not found.' };
  }

  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  } catch (_err) {
    return { ok: false, error: 'Skill registry is not valid JSON.' };
  }

  let config = {};
  let projectSkills = [];
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      projectSkills = Array.isArray(config.projectSkills) ? config.projectSkills : [];
    } catch (_err) {
      // Invalid config — treat as empty
    }
  }

  return { ok: true, registry, config, projectSkills, configPath };
}

/**
 * Get the symlink type for the current platform.
 * @returns {string} 'junction' on Windows, 'dir' elsewhere
 */
function getSymlinkType() {
  return process.platform === 'win32' ? 'junction' : 'dir';
}

/**
 * Install a skill by creating a symlink from project to hub.
 * @param {string} projectDir - Path to the project directory
 * @param {string} hubDir - Path to the hub directory
 * @param {string} skillName - Name of the skill to install
 * @returns {object} { status, reason?, installedCount?, totalCount? }
 */
function installSkill(projectDir, hubDir, skillName) {
  const ctx = loadContext(projectDir);
  if (!ctx.ok) {
    return { status: 'failed', reason: ctx.error };
  }

  // Validate skill exists in registry (sole source of truth)
  const registryEntry = ctx.registry.skills.find(s => s.name === skillName);
  if (!registryEntry) {
    return { status: 'failed', reason: `Skill '${skillName}' not found in registry.` };
  }

  const skillsDir = path.join(projectDir, '.claude', 'skills');
  const symlinkPath = path.join(skillsDir, skillName);
  const hubSkillPath = path.join(hubDir, '.claude', 'skills', skillName);

  // Resolve to absolute for Windows junction compatibility
  const target = path.resolve(hubSkillPath);
  const symlinkType = getSymlinkType();

  // Ensure .claude/skills directory exists
  fs.mkdirSync(skillsDir, { recursive: true });

  // Step 1: Create symlink (before config write)
  try {
    fs.symlinkSync(target, symlinkPath, symlinkType);
  } catch (err) {
    return { status: 'failed', reason: `Symlink creation failed: ${err.message}` };
  }

  // Step 2: Update config (after symlink success)
  try {
    const newSkills = [...ctx.projectSkills];
    if (!newSkills.includes(skillName)) {
      newSkills.push(skillName);
    }
    newSkills.sort();

    const updatedConfig = { ...ctx.config, projectSkills: newSkills };
    fs.writeFileSync(ctx.configPath, JSON.stringify(updatedConfig, null, 2) + '\n');

    return {
      status: 'installed',
      installedCount: newSkills.length,
      totalCount: ctx.registry.skills.length,
      postInstall: registryEntry.postInstall || null,
    };
  } catch (err) {
    // Config write failed — remove orphaned symlink
    try {
      fs.rmSync(symlinkPath, { recursive: true, force: true });
    } catch (_cleanupErr) {
      // Best effort cleanup
    }
    return { status: 'failed', reason: `Config write failed: ${err.message}` };
  }
}

/**
 * Remove an installed skill by removing its symlink and updating config.
 * @param {string} projectDir - Path to the project directory
 * @param {string} skillName - Name of the skill to remove
 * @returns {object} { status, reason?, installedCount?, totalCount?, warnings? }
 */
function removeSkill(projectDir, skillName) {
  const ctx = loadContext(projectDir);
  if (!ctx.ok) {
    return { status: 'failed', reason: ctx.error };
  }

  // Verify skill is currently installed
  if (!ctx.projectSkills.includes(skillName)) {
    return { status: 'failed', reason: `Skill '${skillName}' is not installed.` };
  }

  const symlinkPath = path.join(projectDir, '.claude', 'skills', skillName);
  const warnings = [];
  const skillIsDefault = isDefaultSkill(projectDir, skillName);

  // Warn if removing a default skill
  if (skillIsDefault) {
    warnings.push(`'${skillName}' is a default skill and will be re-added on next charter refresh.`);
  }

  // Step 1: Remove symlink (broken symlink is non-fatal)
  try {
    fs.rmSync(symlinkPath, { recursive: true, force: true });
  } catch (err) {
    warnings.push(`Symlink removal warning: ${err.message}`);
  }

  // Step 2: Update config (always, even if symlink was already broken)
  const newSkills = ctx.projectSkills.filter(s => s !== skillName);
  const updatedConfig = { ...ctx.config, projectSkills: newSkills };
  fs.writeFileSync(ctx.configPath, JSON.stringify(updatedConfig, null, 2) + '\n');

  return {
    status: 'removed',
    isDefault: skillIsDefault,
    installedCount: newSkills.length,
    totalCount: ctx.registry.skills.length,
    warnings,
  };
}

/**
 * Get detailed info about a skill.
 * @param {string} projectDir - Path to the project directory
 * @param {string} skillName - Name of the skill
 * @returns {object} { ok, name, description, category, invocationMode, suggests, triggerConditions, files, installed, error? }
 */
function skillInfo(projectDir, skillName) {
  const ctx = loadContext(projectDir);
  if (!ctx.ok) {
    return { ok: false, error: ctx.error };
  }

  const entry = ctx.registry.skills.find(s => s.name === skillName);
  if (!entry) {
    return { ok: false, error: `Skill '${skillName}' not found in registry.` };
  }

  const skillDir = path.join(projectDir, '.claude', 'skills', skillName);
  const skillMdPath = path.join(skillDir, 'SKILL.md');

  // Read trigger conditions from SKILL.md
  let triggerConditions = '';
  try {
    triggerConditions = fs.readFileSync(skillMdPath, 'utf-8');
  } catch (_err) {
    // Skill may not be installed locally — try hub path
  }

  // List resource files
  let files = [];
  try {
    const entries = fs.readdirSync(skillDir, { withFileTypes: true });
    files = entries.filter(e => e.isFile()).map(e => e.name);
  } catch (_err) {
    // Directory may not exist
  }

  return {
    ok: true,
    name: entry.name,
    description: entry.description,
    category: entry.category || null,
    invocationMode: entry.invocationMode || 'auto',
    suggests: entry.suggests || [],
    triggerConditions,
    files,
    installed: ctx.projectSkills.includes(skillName),
  };
}

/**
 * Get the post-install hook for a skill (if defined in registry).
 * @param {string} projectDir - Path to the project directory
 * @param {string} skillName - Name of the skill
 * @returns {string|null} Hook script path or null
 */
function getPostInstallHook(projectDir, skillName) {
  const ctx = loadContext(projectDir);
  if (!ctx.ok) return null;

  const entry = ctx.registry.skills.find(s => s.name === skillName);
  if (!entry || !entry.postInstall) return null;

  return entry.postInstall;
}

/**
 * Validate a registry entry against the enhanced schema.
 * @param {object} entry - Registry entry to validate
 * @returns {object} { valid, errors? }
 */
function validateRegistryEntry(entry) {
  const errors = [];

  if (!entry.name || typeof entry.name !== 'string') {
    errors.push('name is required and must be a string');
  }
  if (!entry.description || typeof entry.description !== 'string') {
    errors.push('description is required and must be a string');
  }
  if (entry.category !== undefined && typeof entry.category !== 'string') {
    errors.push('category must be a string');
  }
  if (entry.suggests !== undefined && !Array.isArray(entry.suggests)) {
    errors.push('suggests must be an array of strings');
  }
  if (entry.postInstall !== undefined && typeof entry.postInstall !== 'string') {
    errors.push('postInstall must be a string');
  }
  if (entry.relevantTechStack !== undefined && !Array.isArray(entry.relevantTechStack)) {
    errors.push('relevantTechStack must be an array of strings');
  }
  if (entry.invocationMode !== undefined) {
    if (!['auto', 'direct-only'].includes(entry.invocationMode)) {
      errors.push('invocationMode must be "auto" or "direct-only"');
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/**
 * Interactive mode action options.
 */
const INTERACTIVE_ACTIONS = [
  { label: 'Install', description: 'Install skills from the hub' },
  { label: 'Remove', description: 'Remove installed skills' },
  { label: 'Skill info', description: 'View details about a skill' },
  { label: 'Done', description: 'Exit skill management' },
];

/**
 * Parse command arguments into a structured command object.
 * @param {string[]} args - Command arguments
 * @returns {object} { mode, skillName?, verbose? }
 */
function parseCommand(args) {
  // Bug #1814: Handle string input (split into array)
  if (typeof args === 'string') {
    args = args.trim().split(/\s+/);
  }
  if (!args || args.length === 0) {
    return { mode: 'list' };
  }

  // Bug #1765: When invoked via command spec with "$ARGUMENTS", the shell
  // passes all args as a single string. Split if we get one token with spaces.
  if (args.length === 1 && args[0].includes(' ')) {
    args = args[0].split(/\s+/);
  }

  const subcommand = args[0];
  const verbose = args.includes('--verbose');
  const remaining = args.filter(a => a !== '--verbose' && a !== subcommand);

  switch (subcommand) {
    case 'list':
      return { mode: 'list', verbose };
    case 'install':
      return { mode: 'install', skillName: remaining[0] || null, verbose };
    case 'remove':
      return { mode: 'remove', skillName: remaining[0] || null, verbose };
    case 'info':
      return { mode: 'info', skillName: remaining[0] || null, verbose };
    default:
      return { mode: 'interactive' };
  }
}

/**
 * Get data for interactive mode display (grouped by installed/available).
 * @param {string} projectDir - Path to the project directory
 * @returns {object} { installed, available }
 */
function interactiveData(projectDir) {
  const result = listSkills(projectDir);
  if (result.ok === false) {
    return { installed: [], available: [], error: result.error };
  }

  return {
    installed: result.skills.filter(s => s.installed),
    available: result.skills.filter(s => !s.installed),
  };
}

/**
 * Sync skill symlinks for a project based on projectSkills config.
 * Used by hub installer during project setup/update.
 * @param {string} projectDir - Path to the project directory
 * @param {string} hubDir - Path to the hub directory
 * @returns {object} { created, skipped, removed, errors }
 */
function syncSkillSymlinks(projectDir, hubDir) {
  const configPath = path.join(projectDir, 'framework-config.json');
  const skillsDir = path.join(projectDir, '.claude', 'skills');
  const symlinkType = getSymlinkType();

  let projectSkills = [];
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      projectSkills = Array.isArray(config.projectSkills) ? config.projectSkills : [];
    } catch (_err) {
      // Invalid config
    }
  }

  // Check if .claude/skills is an old directory-level symlink
  if (fs.existsSync(skillsDir)) {
    try {
      const stat = fs.lstatSync(skillsDir);
      if (stat.isSymbolicLink()) {
        // Old model — remove directory symlink
        fs.rmSync(skillsDir, { force: true });
      }
    } catch (_err) {
      // Not a symlink or doesn't exist
    }
  }

  // Ensure skills directory exists
  fs.mkdirSync(skillsDir, { recursive: true });

  let created = 0;
  let skipped = 0;
  const errors = [];

  for (const skillName of projectSkills) {
    const symlinkPath = path.join(skillsDir, skillName);
    const hubSkillPath = path.join(hubDir, '.claude', 'skills', skillName);
    const target = path.resolve(hubSkillPath);

    // Skip if symlink already exists
    if (fs.existsSync(symlinkPath)) {
      try {
        const stat = fs.lstatSync(symlinkPath);
        if (stat.isSymbolicLink()) {
          skipped++;
          continue;
        }
      } catch (_err) {
        // Check failed, try to create anyway
      }
    }

    try {
      fs.symlinkSync(target, symlinkPath, symlinkType);
      created++;
    } catch (err) {
      errors.push({ skill: skillName, error: err.message });
    }
  }

  return { created, skipped, removed: 0, errors };
}

/**
 * Migrate from directory-level symlink to per-skill symlinks.
 * @param {string} projectDir - Path to the project directory
 * @param {string} hubDir - Path to the hub directory
 * @returns {object} { migrated, preserved, symlinkCount, errors }
 */
function migrateSkillSymlinks(projectDir, hubDir) {
  const skillsDir = path.join(projectDir, '.claude', 'skills');
  const configPath = path.join(projectDir, 'framework-config.json');
  const symlinkType = getSymlinkType();

  // Check if .claude/skills is an old directory-level symlink
  let isOldModel = false;
  try {
    if (fs.existsSync(skillsDir)) {
      const stat = fs.lstatSync(skillsDir);
      isOldModel = stat.isSymbolicLink();
    }
  } catch (_err) {
    // Not accessible
  }

  if (!isOldModel) {
    return { migrated: false, preserved: 0, symlinkCount: 0, errors: [] };
  }

  // Read projectSkills from config
  let projectSkills = [];
  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      projectSkills = Array.isArray(config.projectSkills) ? config.projectSkills : [];
    } catch (_err) {
      // Invalid config
    }
  }

  // If projectSkills is empty, discover skills from the old symlinked directory
  let skillsToPreserve = projectSkills;
  if (skillsToPreserve.length === 0) {
    try {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      skillsToPreserve = entries.filter(e => e.isDirectory()).map(e => e.name);
    } catch (_err) {
      skillsToPreserve = [];
    }
  }

  // Remove old directory symlink
  try {
    fs.rmSync(skillsDir, { force: true });
  } catch (_err) {
    // Best effort
  }

  // Create skills directory
  fs.mkdirSync(skillsDir, { recursive: true });

  // Create individual symlinks
  let created = 0;
  const errors = [];
  for (const skillName of skillsToPreserve) {
    const symlinkPath = path.join(skillsDir, skillName);
    const hubSkillPath = path.join(hubDir, '.claude', 'skills', skillName);
    const target = path.resolve(hubSkillPath);

    try {
      fs.symlinkSync(target, symlinkPath, symlinkType);
      created++;
    } catch (err) {
      errors.push({ skill: skillName, error: err.message });
    }
  }

  // Update projectSkills if we discovered from directory
  if (projectSkills.length === 0 && skillsToPreserve.length > 0) {
    config.projectSkills = skillsToPreserve.sort();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  }

  return {
    migrated: true,
    preserved: skillsToPreserve.length,
    symlinkCount: created,
    errors,
  };
}

/**
 * Match tech stack keywords against registry entries.
 * @param {object} registry - Skill registry (with skills array)
 * @param {string[]} techStack - Tech stack keywords from charter
 * @returns {object} { direct: [], suggested: [] }
 */
function matchSkillsToTechStack(registry, techStack) {
  const lowerStack = techStack.map(t => t.toLowerCase());
  const direct = [];
  const suggestedNames = new Set();

  for (const skill of registry.skills) {
    const skillTech = (skill.relevantTechStack || []).map(t => t.toLowerCase());
    const hasMatch = lowerStack.some(t => skillTech.includes(t));

    if (hasMatch) {
      direct.push(skill);
      // Collect suggested companions
      if (Array.isArray(skill.suggests)) {
        for (const s of skill.suggests) {
          suggestedNames.add(s);
        }
      }
    }
  }

  // Resolve suggested skills (exclude already-matched ones)
  const directNames = new Set(direct.map(s => s.name));
  const suggested = registry.skills.filter(
    s => suggestedNames.has(s.name) && !directNames.has(s.name)
  );

  return { direct, suggested };
}

/**
 * Merge skill recommendations with existing projectSkills (additive).
 * @param {string[]} existing - Current projectSkills
 * @param {object} matches - From matchSkillsToTechStack
 * @returns {string[]} Merged, sorted, deduplicated skill names
 */
function mergeSkillRecommendations(existing, matches) {
  const all = new Set(existing);
  for (const s of matches.direct) all.add(s.name);
  for (const s of matches.suggested) all.add(s.name);
  return [...all].sort();
}

/**
 * Determine invocation mode from SKILL.md content.
 * @param {string} skillMdContent - Content of SKILL.md
 * @returns {string} 'Direct only' or 'Auto-trigger'
 */
/**
 * Check installed skills for available updates against the catalog.
 * @param {string} projectDir - Path to the project directory
 * @returns {object} { ok, updates: [{ name, installed, available }], error? }
 */
function checkUpdates(projectDir) {
  const catalogPath = path.join(projectDir, '.claude', 'metadata', 'skill-catalog.json');
  const registryPath = path.join(projectDir, '.claude', 'metadata', 'skill-registry.json');
  const configPath = path.join(projectDir, 'framework-config.json');

  // Try catalog first, fall back to registry
  let source;
  let sourceName;
  if (fs.existsSync(catalogPath)) {
    try {
      source = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
      sourceName = 'catalog';
    } catch (_err) {
      // Fall through to registry
    }
  }
  if (!source && fs.existsSync(registryPath)) {
    try {
      source = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
      sourceName = 'registry';
    } catch (_err) {
      return { ok: false, error: 'Could not read skill catalog or registry.' };
    }
  }
  if (!source) {
    return { ok: false, error: 'No skill catalog or registry found.' };
  }

  // Get installed skills and their versions from SKILL.md frontmatter
  let projectSkills = [];
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      projectSkills = Array.isArray(config.projectSkills) ? config.projectSkills : [];
    } catch (_err) { /* empty */ }
  }

  if (projectSkills.length === 0) {
    return { ok: true, updates: [], source: sourceName };
  }

  const updates = [];
  for (const skillName of projectSkills) {
    const catalogEntry = source.skills.find(s => s.name === skillName);
    if (!catalogEntry || !catalogEntry.version) continue;

    // Get installed version from SKILL.md in the project's skill directory
    const skillMdPath = path.join(projectDir, '.claude', 'skills', skillName, 'SKILL.md');
    let installedVersion = null;
    if (fs.existsSync(skillMdPath)) {
      try {
        const content = fs.readFileSync(skillMdPath, 'utf-8');
        const match = content.match(/^version:\s*"?([^"\n]+)"?/m);
        if (match) installedVersion = match[1];
      } catch (_err) { /* empty */ }
    }

    if (installedVersion && catalogEntry.version !== installedVersion) {
      updates.push({
        name: skillName,
        installed: installedVersion,
        available: catalogEntry.version
      });
    }
  }

  return { ok: true, updates, source: sourceName };
}

function getInvocationMode(skillMdContent) {
  if (skillMdContent.includes('disable-model-invocation: true')) {
    return 'Direct only';
  }
  return 'Auto-trigger';
}

module.exports = {
  listSkills,
  installSkill,
  removeSkill,
  skillInfo,
  checkUpdates,
  getPostInstallHook,
  validateRegistryEntry,
  matchSkillsToTechStack,
  mergeSkillRecommendations,
  getDefaultSkills,
  isDefaultSkill,
  getInvocationMode,
  syncSkillSymlinks,
  migrateSkillSymlinks,
  parseCommand,
  interactiveData,
  getSymlinkType,
  INTERACTIVE_ACTIONS,
};

// CLI entry point — enables direct invocation through symlinks
if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = parseCommand(args);
  const projectDir = process.cwd();

  try {
    switch (cmd.mode) {
      case 'list': {
        const result = listSkills(projectDir, { verbose: cmd.verbose });
        console.log(JSON.stringify(result));
        break;
      }
      case 'install': {
        if (!cmd.skillName) {
          console.log(JSON.stringify({ status: 'failed', reason: 'Skill name required.' }));
          process.exit(1);
        }
        // hubDir must be resolved by the caller (command spec) — use frameworkPath
        const configPath = path.join(projectDir, 'framework-config.json');
        let hubDir = projectDir;
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          if (config.frameworkPath) {
            hubDir = path.resolve(projectDir, config.frameworkPath);
          }
        }
        const result = installSkill(projectDir, hubDir, cmd.skillName);
        console.log(JSON.stringify(result));
        break;
      }
      case 'remove': {
        if (!cmd.skillName) {
          console.log(JSON.stringify({ status: 'failed', reason: 'Skill name required.' }));
          process.exit(1);
        }
        const result = removeSkill(projectDir, cmd.skillName);
        console.log(JSON.stringify(result));
        break;
      }
      case 'info': {
        if (!cmd.skillName) {
          console.log(JSON.stringify({ status: 'failed', reason: 'Skill name required.' }));
          process.exit(1);
        }
        const result = skillInfo(projectDir, cmd.skillName);
        console.log(JSON.stringify(result));
        break;
      }
      default:
        console.log(JSON.stringify({ status: 'failed', reason: `Unknown mode: ${cmd.mode}` }));
        process.exit(1);
    }
  } catch (err) {
    console.log(JSON.stringify({ status: 'failed', reason: err.message }));
    process.exit(1);
  }
}
