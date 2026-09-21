#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.105.0
 * @description Detect whether the optional third-party diagram-design skill (cathrynlavery/diagram-design, MIT) is installed — as a project skill, a user skill, or a Claude Code plugin — so /create-prd Phase 5.5a can offer it as a diagram style. Read-only; never throws; every failure resolves to found:false with a stated reason.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SKILL_NAME = 'diagram-design';
const PLUGIN_KEY_PREFIX = `${SKILL_NAME}@`;

/**
 * Where each probe found the skill. Callers compare against these, never prose.
 */
const SOURCES = Object.freeze({
  PROJECT: 'project',
  USER: 'user',
  PLUGIN: 'plugin',
});

// ─── Helpers ───

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch (_e) {
    return false;
  }
}

/**
 * Paths compared for project ownership. Windows paths are case-insensitive and
 * the registry stores them with backslashes, so both sides are normalised the
 * same way before comparison.
 */
function samePath(a, b, platform) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const norm = p => {
    const r = path.resolve(p).replace(/[\\/]+$/, '');
    return platform === 'win32' ? r.toLowerCase() : r;
  };
  return norm(a) === norm(b);
}

/**
 * `installed_plugins.json` is undocumented internal state. Observed 2026-09-21:
 * `{ version: 2, plugins: { "<name>@<marketplace>": [ {scope, installPath, ...} ] } }`.
 * Only a user-scope record has been observed; a project-scope record is assumed
 * to name its project in `projectPath` — unverified, so a project record that
 * does not carry one simply never matches and the user-scope record is used.
 */
function probePlugin(cwd, homeDir, platform) {
  const registry = path.join(homeDir, '.claude', 'plugins', 'installed_plugins.json');
  let raw;
  try {
    raw = fs.readFileSync(registry, 'utf8');
  } catch (_e) {
    return { found: false, reason: `plugin registry not found at ${registry}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { found: false, reason: `plugin registry is not valid JSON (${e.message})` };
  }
  const plugins = parsed && typeof parsed === 'object' ? parsed.plugins : null;
  if (!plugins || typeof plugins !== 'object' || Array.isArray(plugins)) {
    return { found: false, reason: 'plugin registry has an unexpected shape (no plugins object)' };
  }
  const key = Object.keys(plugins).find(k => k.startsWith(PLUGIN_KEY_PREFIX));
  if (!key) {
    return { found: false, reason: `no ${PLUGIN_KEY_PREFIX}* entry in the plugin registry` };
  }
  const records = plugins[key];
  if (!Array.isArray(records)) {
    return { found: false, reason: `plugin registry entry ${key} is not an array of install records` };
  }
  const valid = records.filter(r => r && typeof r === 'object' && typeof r.installPath === 'string');
  const projectRecord = valid.find(r => r.scope === 'project' && samePath(r.projectPath, cwd, platform));
  const userRecord = valid.find(r => r.scope === 'user');
  const record = projectRecord || userRecord;
  if (!record) {
    return { found: false, reason: `plugin registry entry ${key} has no user-scope record or project-scope record for this project` };
  }
  const skillPath = path.join(record.installPath, 'skills', SKILL_NAME, 'SKILL.md');
  if (!isFile(skillPath)) {
    return { found: false, reason: `plugin ${key} (${record.scope} scope) install path lacks ${skillPath}` };
  }
  return { found: true, skillPath };
}

// ─── Detection ───

/**
 * Probe, in order: project skill, user skill, plugin registry. The first hit
 * wins. Never throws — any failure is folded into `reason`.
 *
 * @param {{cwd?: string, homeDir?: string, platform?: string}} [opts]
 * @returns {{found: boolean, source: string|null, skillPath: string|null, reason: string}}
 */
function detectDiagramDesign(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const homeDir = opts.homeDir || os.homedir();
  const platform = opts.platform || process.platform;
  const misses = [];

  try {
    const projectSkill = path.join(cwd, '.claude', 'skills', SKILL_NAME, 'SKILL.md');
    if (isFile(projectSkill)) {
      return { found: true, source: SOURCES.PROJECT, skillPath: projectSkill, reason: 'project skill found' };
    }
    misses.push(`no project skill at ${projectSkill}`);

    const userSkill = path.join(homeDir, '.claude', 'skills', SKILL_NAME, 'SKILL.md');
    if (isFile(userSkill)) {
      return { found: true, source: SOURCES.USER, skillPath: userSkill, reason: 'user skill found' };
    }
    misses.push(`no user skill at ${userSkill}`);

    const plugin = probePlugin(cwd, homeDir, platform);
    if (plugin.found) {
      return { found: true, source: SOURCES.PLUGIN, skillPath: plugin.skillPath, reason: 'plugin install found' };
    }
    misses.push(plugin.reason);
  } catch (e) {
    misses.push(`detection failed: ${e.message}`);
  }

  return { found: false, source: null, skillPath: null, reason: misses.join('; ') };
}

module.exports = { detectDiagramDesign, SOURCES, SKILL_NAME };

if (require.main === module) {
  process.stdout.write(JSON.stringify(detectDiagramDesign(), null, 2) + '\n');
}
