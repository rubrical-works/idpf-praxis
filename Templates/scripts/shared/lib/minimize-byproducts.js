#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.113.0
 * minimize-byproducts.js — Name the files a minimized source drags into a
 * change, so a review can declare them up front (#3275).
 *
 * Editing a minimized source is never a one-file change: regenerating it
 * rewrites its outputs and the minimize sidecars, and a command source also
 * moves the extension registry. Those paths are deterministic consequences of
 * the source, yet an undeclared one halts the scope-drift gate at Step 4c of
 * `/work` — `.claude/metadata/extension-points.json` is always-protected, so
 * only the authored `Files to modify:` declaration licenses it. `/review-issue`
 * 2a-ii (b) calls this helper and appends what it returns to that declaration.
 *
 *   | Declared source                 | Byproducts                                     |
 *   |---------------------------------|------------------------------------------------|
 *   | `CommandsSrc/<n>.md`            | `.claude/commands/<n>.md`, Stage 2 mirror path |
 *   |                                 | (unless Stage 2-excluded), the records file,   |
 *   |                                 | `.claude/metadata/extension-points.json`, and  |
 *   |                                 | the targets file only when untracked (#3352)   |
 *   | tracked rule source             | `.claude/rules/<dest>` (env dev/both), mirror  |
 *   |                                 | (env both/deployed), the records file          |
 *   | any other tracked source        | `.min-mirror/<src>`, the records file          |
 *   | untracked source                | nothing                                        |
 *
 * A run writes `minimize-targets.json` only when it adds a source's first
 * `files{}` entry; every run writes `minimize-records.json` (#3326, #3352).
 *
 * The output mapping mirrors `.claude/scripts/framework/minimize-helper.js`
 * `resolveExpectedOutputs()`; a parity test pins the two together. It is
 * re-implemented here rather than required because minimize-helper.js is
 * dev-only (it exits when its config is absent) and this file ships.
 *
 * Inert by construction in a user project: `minimize-targets.json` lives under
 * `.claude/scripts/framework/`, which never ships, so every input yields `[]`.
 *
 * Built-ins only (runtime dependency contract, #2418). Never throws for a
 * missing or unreadable file — an unreadable sidecar is treated as absent.
 *
 * CLI: node .claude/scripts/shared/lib/minimize-byproducts.js <path>...
 *      → JSON array of repo-relative byproduct paths on stdout.
 */

const fs = require('fs');
const path = require('path');

const FRAMEWORK_DIR = '.claude/scripts/framework';
const TARGETS_REL = `${FRAMEWORK_DIR}/minimize-targets.json`;
const RECORDS_REL = `${FRAMEWORK_DIR}/minimize-records.json`;
const CONFIG_REL = `${FRAMEWORK_DIR}/minimize-config.json`;
const EXTENSION_POINTS_REL = '.claude/metadata/extension-points.json';
const COMMANDS_SRC = 'CommandsSrc/';
const COMMANDS_DIR = '.claude/commands/';

function norm(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '');
}

function readJson(root, rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  } catch (_e) {
    return null;
  }
}

function hasWholeFileMarker(root, rel) {
  try {
    const head = fs.readFileSync(path.join(root, rel), 'utf8').slice(0, 4000);
    return /<!--\s*FRAMEWORK-ONLY\s*-->/.test(head);
  } catch (_e) {
    return false;
  }
}

/** Same exclusion set minimize-helper.js isExcluded() applies to a Stage 1 path. */
function isStage2Excluded(root, config, stage1, source) {
  if ((config.excludedFiles || []).includes(stage1)) return true;
  if ((config.excludedCommands || []).includes(stage1)) return true;
  for (const dir of config.excludedDirectories || []) {
    if (stage1 === dir || stage1.startsWith(`${dir}/`)) return true;
  }
  for (const p of config.excludedPatterns || []) {
    if (new RegExp(p, 'i').test(stage1)) return true;
  }
  return hasWholeFileMarker(root, stage1) || hasWholeFileMarker(root, source);
}

function remap(config, rel) {
  for (const [from, to] of Object.entries(config.pathRemappings || {})) {
    const f = norm(from);
    if (rel === f || rel.startsWith(`${f}/`)) return to + rel.slice(f.length);
  }
  return rel;
}

function ruleIndex(manifest) {
  const index = new Map();
  const rules = (manifest && manifest.deploymentFiles && manifest.deploymentFiles.rules) || [];
  for (const rule of rules) {
    const src = norm(rule.src);
    if (!index.has(src)) index.set(src, []);
    index.get(src).push(rule);
  }
  return index;
}

function outputsFor(source, ctx) {
  if (source.startsWith(COMMANDS_SRC) && source.endsWith('.md')) {
    const stage1 = COMMANDS_DIR + source.slice(COMMANDS_SRC.length);
    const out = [stage1];
    if (!isStage2Excluded(ctx.root, ctx.config, stage1, source)) {
      out.push(`.min-mirror/${remap(ctx.config, stage1)}`);
    }
    // A run writes the targets file only when it adds the source's first
    // files{} entry (#3352); every run writes its record.
    if (!Object.prototype.hasOwnProperty.call(ctx.tracked, source)) out.push(TARGETS_REL);
    out.push(RECORDS_REL, EXTENSION_POINTS_REL);
    return out;
  }
  if (!Object.prototype.hasOwnProperty.call(ctx.tracked, source)) return [];
  const out = [];
  const rules = ctx.rules.get(source);
  if (rules && rules.length) {
    let owesMirror = false;
    for (const rule of rules) {
      if (rule.env === 'dev' || rule.env === 'both') out.push(`.claude/rules/${rule.dest}`);
      if (rule.env === 'both' || rule.env === 'deployed') owesMirror = true;
    }
    if (owesMirror) out.push(`.min-mirror/${source}`);
  } else {
    out.push(`.min-mirror/${source}`);
  }
  // Tracked already, so its run touches only the records file (#3352).
  out.push(RECORDS_REL);
  return out;
}

/**
 * Byproducts of a declared set of sources: the de-duplicated union, in first-
 * seen order, with any path already in `sources` left out.
 *
 * @param {string[]} sources  Repo-relative declared paths
 * @param {object} [opts]     `{root}` — project root (default `process.cwd()`)
 * @returns {string[]}
 */
function resolveByproducts(sources, opts = {}) {
  const root = opts.root || process.cwd();
  const targets = readJson(root, TARGETS_REL);
  if (!targets || typeof targets !== 'object') return [];
  const ctx = {
    root,
    tracked: (targets.files && typeof targets.files === 'object') ? targets.files : {},
    config: readJson(root, CONFIG_REL) || {},
    rules: ruleIndex(readJson(root, 'framework-manifest.json')),
  };
  const declared = new Set((sources || []).map(norm));
  const result = [];
  for (const src of declared) {
    for (const p of outputsFor(src, ctx)) {
      if (!declared.has(p) && !result.includes(p)) result.push(p);
    }
  }
  return result;
}

module.exports = { resolveByproducts };

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(resolveByproducts(process.argv.slice(2)), null, 2)}\n`);
}
