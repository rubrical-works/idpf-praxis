#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.115.0
 * @description Does integrating the upstream need a framework or skills upgrade
 *   on this machine? (#3033). Compares the upstream framework-config.json
 *   (`git show @{upstream}:framework-config.json`) with the local one:
 *   a higher upstream `frameworkVersion` (compareVersions from upgrade-check.js)
 *   or an upstream `projectSkills` entry with no local `.claude/skills/<name>/`
 *   is a required upgrade. Read-only. CLI prints `{ok, data}`.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * WHY BEFORE THE PULL. A teammate who upgrades through Praxis Hub Manager
 * commits the new `frameworkVersion` and any new `projectSkills` names, but not
 * the installed hub or the gitignored `.claude/skills/` directories. Integrating
 * those commits points this checkout at an install that is not here, and the
 * failure surfaces later as missing rules, scripts or skills, far from the pull
 * that caused it. /sync-branch asks this helper first and stops.
 *
 * WHAT IS NOT COMPARED. `frameworkPath` is an absolute, machine- and OS-specific
 * hub path; a teammate on another OS or hub location at the same version would
 * trip a path check falsely (px-manager#200, #1382). The version carries the
 * meaning.
 *
 * WHICH SIDE EXEMPTS. `selfHosted` is read from the LOCAL config only: the local
 * machine is the one that would lack the install, and a self-hosted checkout has
 * no installed framework root to compare against.
 *
 * WHAT "MISSING" MEANS. `findMissingSkills` treats a skill as missing when
 * `.claude/skills/<name>/` is not a directory, following symlinks, so a symlink
 * that does not resolve is missing. This is Praxis Hub Manager's `isBroken`
 * check, deliberately: the remedy this helper names is PHM, and a definition
 * PHM does not share would name a repair that does nothing. #3038 reuses it.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Required lazily, inside checkUpstreamUpgrade: the startup hook loads this
// module for findMissingSkills alone (#3038), and upgrade-check.js's own
// dependency chain is time paid synchronously on every session start.
const compareVersions = (a, b) => require('../upgrade-check.js').compareVersions(a, b);

/**
 * Names in `names` with no `.claude/skills/<name>/` directory under `cwd`.
 * Non-string and empty entries are ignored; a non-array yields [].
 *
 * @param {string} cwd
 * @param {unknown} names
 * @returns {string[]} missing names, in input order
 */
function findMissingSkills(cwd, names) {
  if (!Array.isArray(names)) return [];
  const missing = [];
  for (const name of names) {
    if (typeof name !== 'string' || name === '') continue;
    let isDir = false;
    try {
      isDir = fs.statSync(path.join(cwd, '.claude', 'skills', name)).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) missing.push(name);
  }
  return missing;
}

/**
 * @param {object} args
 * @param {string} args.cwd - project root, for the skills directory
 * @param {object|null} args.local - parsed local framework-config.json
 * @param {object|null} args.upstream - parsed upstream framework-config.json; null when absent
 * @returns {{required: boolean, exempt: boolean, framework: {from: string, to: string}|null,
 *   missingSkills: string[], warnings: string[]}}
 */
function checkUpstreamUpgrade({ cwd, local, upstream }) {
  const result = { required: false, exempt: false, framework: null, missingSkills: [], warnings: [] };
  const loc = local && typeof local === 'object' ? local : {};

  if (loc.selfHosted === true) {
    result.exempt = true;
    return result;
  }
  if (!upstream || typeof upstream !== 'object') return result;

  const from = loc.frameworkVersion;
  const to = upstream.frameworkVersion;
  if (from || to) {
    const cmp = compareVersions(to, from);
    if (cmp === null) {
      result.warnings.push(
        `frameworkVersion could not be compared: local ${JSON.stringify(from ?? null)}, upstream ${JSON.stringify(to ?? null)}`
      );
    } else if (cmp > 0) {
      result.framework = { from, to };
    }
  }

  result.missingSkills = findMissingSkills(cwd, upstream.projectSkills);
  result.required = result.framework !== null || result.missingSkills.length > 0;
  return result;
}

/** Parsed `@{upstream}:framework-config.json`, null when the file is absent there. */
function readUpstreamConfig(cwd, exec = execFileSync) {
  let text;
  try {
    text = exec('git', ['show', '@{upstream}:framework-config.json'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return { config: null, error: null };
  }
  try {
    return { config: JSON.parse(text), error: null };
  } catch (e) {
    return { config: null, error: `upstream framework-config.json is not valid JSON: ${e.message}` };
  }
}

function readLocalConfig(cwd) {
  try {
    return JSON.parse(fs.readFileSync(path.join(cwd, 'framework-config.json'), 'utf8'));
  } catch {
    return null;
  }
}

function main(cwd = process.cwd()) {
  const { config: upstream, error } = readUpstreamConfig(cwd);
  const data = checkUpstreamUpgrade({ cwd, local: readLocalConfig(cwd), upstream });
  if (error) data.warnings.push(error);
  console.log(JSON.stringify({ ok: true, data }));
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  checkUpstreamUpgrade,
  findMissingSkills,
  readUpstreamConfig,
  main,
};
