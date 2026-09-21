#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.105.0
 * @description Session-start self-test for framework hooks (#2917). Load-checks each deployed Claude Code hook named in framework-manifest.json and reads its project-local heartbeat, then reports any hook that cannot load or has consecutive failures as the Hook Health row. Read-only and advisory.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * WHICH HOOKS. The `.js` entries of `framework-manifest.json`
 * `deploymentFiles.scripts.hooks` — present in this repository and at the hub
 * framework root of every deployed install. Settings are deliberately not read:
 * this repository wires hooks in `.claude/settings.local.json`, deployed projects
 * in `.claude/settings.json`, and a hook registered in settings but absent from
 * the manifest is not a framework hook this check vouches for. It is not
 * checked, and rule 03 says so.
 *
 * WHAT IS CHECKED. `node --check` and a load of each hook's relative
 * dependencies, in separate processes — enough to catch a syntax error or a
 * missing module (the #2328 class) without executing the hook. A failure inside
 * a hook's own logic surfaces through that hook's heartbeat instead.
 *
 * It runs inside the startup hook's parallel ladder, before the startup hook
 * records its own heartbeat, so the row reports the state before this session.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const hb = require('./lib/hook-heartbeat.js');

/** This script lives at <framework root>/.claude/scripts/shared (dev) or <hub>/Templates/scripts/shared (deployed). */
const FALLBACK_MANIFEST = path.resolve(__dirname, '..', '..', '..', 'framework-manifest.json');

/** The manifest under framework-config.json's frameworkPath, else the framework root this script lives under. */
function resolveManifestPath(cwd) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(cwd, 'framework-config.json'), 'utf8'));
    if (typeof config.frameworkPath === 'string' && config.frameworkPath.trim() !== '') {
      return path.resolve(cwd, config.frameworkPath, 'framework-manifest.json');
    }
  } catch (_) { /* no config: use the fallback */ }
  return FALLBACK_MANIFEST;
}

function checkHookHealth(cwd, { manifestPath, loadCheck } = {}) {
  const file = manifestPath || resolveManifestPath(cwd);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    const result = { state: 'undetermined', reason: `framework-manifest.json unreadable at ${file}`, hooks: [] };
    return { ...result, row: hb.formatHealthRow(result) };
  }
  const hookFiles = hb.hookFilesFromManifest(manifest);
  if (!hookFiles) {
    const result = { state: 'undetermined', reason: 'framework-manifest.json declares no deploymentFiles.scripts.hooks list', hooks: [] };
    return { ...result, row: hb.formatHealthRow(result) };
  }
  const result = hb.assessHooks({
    root: cwd,
    hooksDir: path.join(cwd, '.claude', 'hooks'),
    hookFiles,
    ...(loadCheck ? { loadCheck } : {}),
  });
  return { ...result, reason: null, row: hb.formatHealthRow(result) };
}

if (require.main === module) {
  let data;
  try {
    data = checkHookHealth(process.cwd());
  } catch (err) {
    const result = { state: 'undetermined', reason: `hook health check failed: ${err && err.message}`, hooks: [] };
    data = { ...result, row: hb.formatHealthRow(result) };
  }
  process.stdout.write(JSON.stringify({ success: true, data }) + '\n');
}

module.exports = { checkHookHealth, resolveManifestPath };
