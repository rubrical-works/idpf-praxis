#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.66.0
 * @description Script-driven CLI for extension point operations. Replaces AI-interpreted markdown specs for read-only subcommands (list, view, diff, validate), reducing execution from 3-16+ tool calls to 1 Bash call. Used by /extensions command.
 * @checksum sha256:placeholder
 *
 * @module .claude/scripts/shared/extensions-cli
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const COMMANDS_DIR = path.join(ROOT, '.claude', 'commands');
const METADATA_DIR = path.join(ROOT, '.claude', 'metadata');
const REGISTRY_PATH = path.join(METADATA_DIR, 'extension-points.json');

// ============================================================================
// REGISTRY LOADING
// ============================================================================

/**
 * Load the extension points registry.
 * @returns {{ registry: Object|null, error: string|null }}
 */
function loadRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) {
    return {
      registry: null,
      error: 'Fatal: .claude/metadata/extension-points.json not found. Re-link project via px-manager to repair.'
    };
  }

  try {
    const content = fs.readFileSync(REGISTRY_PATH, 'utf-8');
    return { registry: JSON.parse(content), error: null };
  } catch (e) {
    return {
      registry: null,
      error: `Fatal: Failed to parse extension-points.json: ${e.message}`
    };
  }
}

// ============================================================================
// hasContent COMPUTATION (runtime, project-local)
// ============================================================================

/**
 * Strip fenced code blocks from content to avoid matching patterns inside examples.
 * @param {string} content - File content
 * @returns {string} Content with fenced code blocks replaced
 */
function stripFencedCodeBlocks(content) {
  return content.replace(/^[ \t]*```[\s\S]*?^[ \t]*```/gm, '');
}

/**
 * Scan a command file for USER-EXTENSION blocks and compute hasContent.
 * @param {string} content - File content
 * @returns {Map<string, boolean>} Map of point name → hasContent
 */
function scanExtensionBlocks(content) {
  const result = new Map();
  const cleaned = stripFencedCodeBlocks(content);
  const startPattern = /<!--\s*USER-EXTENSION-START:\s*(\S+)\s*-->/g;
  let match;

  while ((match = startPattern.exec(cleaned)) !== null) {
    const name = match[1];
    const startIdx = match.index + match[0].length;

    const endPattern = new RegExp(
      `<!--\\s*USER-EXTENSION-END:\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-->`
    );
    const endMatch = cleaned.slice(startIdx).match(endPattern);

    if (endMatch) {
      const between = cleaned.slice(startIdx, startIdx + endMatch.index).trim();
      const stripped = between
        .replace(/<!--[\s\S]*?-->/g, '')
        .trim();
      result.set(name, stripped.length > 0);
    }
  }

  return result;
}

/**
 * Scan all command files for hasContent data.
 * @returns {Map<string, Map<string, boolean>>} Map of command name → (point name → hasContent)
 */
function scanAllCommandFiles() {
  const result = new Map();

  let entries;
  try {
    entries = fs.readdirSync(COMMANDS_DIR, { withFileTypes: true });
  } catch (_e) {
    return result;
  }

  for (const entry of entries) {
    const isFile = typeof entry.isFile === 'function' ? entry.isFile() : !entry.isDirectory();
    if (!isFile || !entry.name.endsWith('.md')) continue;

    const cmdName = entry.name.replace(/\.md$/, '');
    try {
      const content = fs.readFileSync(path.join(COMMANDS_DIR, entry.name), 'utf-8');
      result.set(cmdName, scanExtensionBlocks(content));
    } catch (_e) {
      // File unreadable — skip (command still appears with no blocks)
      result.set(cmdName, new Map());
    }
  }

  return result;
}

// ============================================================================
// LIST SUBCOMMAND
// ============================================================================

/**
 * Run the list subcommand.
 * @param {{ command: string|null, status?: boolean }} opts - Options
 * @returns {{ exitCode: number, output: string }}
 */
function runList(opts) {
  const { registry, error } = loadRegistry();
  if (error) {
    return { exitCode: 2, output: error };
  }

  const commands = registry.commands || {};
  let commandNames = Object.keys(commands);

  // Filter by command if specified
  if (opts.command) {
    commandNames = commandNames.filter(n => n === opts.command);
  }

  // Empty registry
  if (Object.keys(commands).length === 0) {
    return { exitCode: 0, output: 'No extensible commands found in registry.' };
  }

  // No match for filter (but registry has commands)
  if (commandNames.length === 0) {
    return { exitCode: 0, output: '' };
  }

  // Scan command files for hasContent
  const fileData = scanAllCommandFiles();

  // --status mode: compact X/. markers per extension point
  if (opts.status) {
    const lines = [];

    for (const cmdName of commandNames) {
      const cmd = commands[cmdName];
      const points = cmd.extensionPoints || [];
      const cmdBlocks = fileData.get(cmdName) || new Map();

      const filledCount = points.filter(ep => cmdBlocks.get(ep.name) || false).length;

      lines.push(`${cmdName} (${points.length} points, ${filledCount} filled)`);

      for (const ep of points) {
        const hasContent = cmdBlocks.get(ep.name) || false;
        const marker = hasContent ? 'X' : '.';
        lines.push(`  ${marker}  ${ep.name}`);
      }
      lines.push('');
    }

    return { exitCode: 0, output: lines.join('\n').trim() };
  }

  // Default tree output
  const lines = [];
  lines.push(`Extension Points (${registry.commandCount} commands, ${registry.extensionPointCount} points)`);
  lines.push('');

  for (const cmdName of commandNames) {
    const cmd = commands[cmdName];
    const points = cmd.extensionPoints || [];
    const cmdBlocks = fileData.get(cmdName) || new Map();

    lines.push(`${cmdName} (${cmd.type}) — ${cmd.description}`);

    if (points.length === 0) {
      lines.push('  (no extension points)');
    } else {
      for (const ep of points) {
        const hasContent = cmdBlocks.get(ep.name) || false;
        const marker = hasContent ? ' [HAS CONTENT]' : '';
        const purpose = ep.purpose ? ` — ${ep.purpose}` : '';
        lines.push(`  ${ep.name}${marker}${purpose}`);
      }
    }
    lines.push('');
  }

  return { exitCode: 0, output: lines.join('\n').trim() };
}

// ============================================================================
// VIEW SUBCOMMAND
// ============================================================================

/**
 * Extract the raw content of a specific extension point from a command file.
 * @param {string} content - File content
 * @param {string} pointName - Extension point name
 * @returns {{ found: boolean, content: string }}
 */
function extractPointContent(content, pointName) {
  const cleaned = stripFencedCodeBlocks(content);
  const escapedName = pointName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startPattern = new RegExp(
    `<!--\\s*USER-EXTENSION-START:\\s*${escapedName}\\s*-->`
  );
  const startMatch = cleaned.match(startPattern);
  if (!startMatch) {
    return { found: false, content: '' };
  }

  const startIdx = startMatch.index + startMatch[0].length;
  const endPattern = new RegExp(
    `<!--\\s*USER-EXTENSION-END:\\s*${escapedName}\\s*-->`
  );
  const endMatch = cleaned.slice(startIdx).match(endPattern);
  if (!endMatch) {
    return { found: false, content: '' };
  }

  const between = cleaned.slice(startIdx, startIdx + endMatch.index).trim();
  const stripped = between.replace(/<!--[\s\S]*?-->/g, '').trim();
  return { found: true, content: stripped };
}

/**
 * Run the view subcommand.
 * @param {{ target: string }} opts - Options (target = "command:point")
 * @returns {{ exitCode: number, output: string }}
 */
function runView(opts) {
  const target = opts.target || '';

  // Validate argument format
  const colonIdx = target.indexOf(':');
  if (colonIdx < 0) {
    return { exitCode: 2, output: 'Usage: extensions-cli.js view <command>:<point>' };
  }

  const cmdName = target.slice(0, colonIdx).trim();
  const pointName = target.slice(colonIdx + 1).trim();

  if (!cmdName || !pointName) {
    return { exitCode: 2, output: 'Usage: extensions-cli.js view <command>:<point>' };
  }

  // Load registry to validate command exists
  const { registry, error } = loadRegistry();
  if (error) {
    return { exitCode: 2, output: error };
  }

  const commands = registry.commands || {};
  if (!commands[cmdName]) {
    return { exitCode: 2, output: `Command '${cmdName}' not found in registry.` };
  }

  // Read the command file
  const filePath = path.join(COMMANDS_DIR, `${cmdName}.md`);
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (_e) {
    return { exitCode: 2, output: `Command file '${cmdName}.md' not found on disk.` };
  }

  // Extract the specific point
  const { found, content: pointContent } = extractPointContent(content, pointName);
  if (!found) {
    return { exitCode: 2, output: `Extension point '${pointName}' not found in command '${cmdName}'.` };
  }

  if (pointContent.length === 0) {
    return { exitCode: 0, output: `${cmdName}:${pointName}\n\n(Empty)` };
  }

  return { exitCode: 0, output: `${cmdName}:${pointName}\n\n${pointContent}` };
}

// ============================================================================
// VALIDATE SUBCOMMAND
// ============================================================================

const MANIFEST_PATH = path.join(ROOT, 'framework-manifest.json');

/**
 * Scan raw content for START markers (without stripping code blocks, to detect all).
 * Returns array of { name, startIdx, endIdx, hasEnd }.
 * @param {string} content - File content
 * @returns {Array<{ name: string, startIdx: number, endIdx: number|null, hasEnd: boolean }>}
 */
function scanRawBlocks(content) {
  const blocks = [];
  const cleaned = stripFencedCodeBlocks(content);
  const startPattern = /<!--\s*USER-EXTENSION-START:\s*(\S+)\s*-->/g;
  let match;

  while ((match = startPattern.exec(cleaned)) !== null) {
    const name = match[1];
    const startIdx = match.index + match[0].length;
    const endPattern = new RegExp(
      `<!--\\s*USER-EXTENSION-END:\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-->`
    );
    const endMatch = cleaned.slice(startIdx).match(endPattern);
    blocks.push({
      name,
      startIdx: match.index,
      endIdx: endMatch ? startIdx + endMatch.index + endMatch[0].length : null,
      hasEnd: !!endMatch
    });
  }

  return blocks;
}

/**
 * Run the validate subcommand.
 * Performs 7 checks across 3 categories.
 * @returns {{ exitCode: number, output: string }}
 */
function runValidate() {
  // Load registry
  const { registry, error } = loadRegistry();
  if (error) {
    return { exitCode: 2, output: error };
  }

  // Load manifest
  let manifest;
  try {
    const manifestContent = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    manifest = JSON.parse(manifestContent);
  } catch (e) {
    return { exitCode: 2, output: `Fatal: Failed to load framework-manifest.json: ${e.message}` };
  }

  const commands = registry.commands || {};
  const extensibleCommands = manifest.extensibleCommands || [];

  // Scan all command files
  const fileData = scanAllCommandFiles();

  // Collect per-command raw blocks for structural checks
  const rawBlocksByCommand = new Map();
  let entries;
  try {
    entries = fs.readdirSync(COMMANDS_DIR, { withFileTypes: true });
  } catch (_e) {
    entries = [];
  }
  for (const entry of entries) {
    const isFile = typeof entry.isFile === 'function' ? entry.isFile() : !entry.isDirectory();
    if (!isFile || !entry.name.endsWith('.md')) continue;
    const cmdName = entry.name.replace(/\.md$/, '');
    try {
      const content = fs.readFileSync(path.join(COMMANDS_DIR, entry.name), 'utf-8');
      rawBlocksByCommand.set(cmdName, scanRawBlocks(content));
    } catch (_e) {
      rawBlocksByCommand.set(cmdName, []);
    }
  }

  const checks = [];
  let passed = 0;
  let failed = 0;

  // ---- STRUCTURAL CHECKS ----

  // Check 1: Matching START/END pairs
  {
    const failures = [];
    for (const [cmdName, blocks] of rawBlocksByCommand) {
      for (const block of blocks) {
        if (!block.hasEnd) {
          failures.push(`${cmdName}: '${block.name}' has START but no END`);
        }
      }
    }
    if (failures.length === 0) {
      checks.push('Matching START/END pairs: PASS');
      passed++;
    } else {
      checks.push(`Matching START/END pairs: FAIL\n${failures.map(f => `  - ${f}`).join('\n')}`);
      failed++;
    }
  }

  // Check 2: Valid names [a-z][a-z0-9-]*
  {
    const namePattern = /^[a-z][a-z0-9-]*$/;
    const failures = [];
    for (const [cmdName, blocks] of rawBlocksByCommand) {
      for (const block of blocks) {
        if (!namePattern.test(block.name)) {
          failures.push(`${cmdName}: '${block.name}' is not valid (must match [a-z][a-z0-9-]*)`);
        }
      }
    }
    if (failures.length === 0) {
      checks.push('Valid extension point names: PASS');
      passed++;
    } else {
      checks.push(`Valid extension point names: FAIL\n${failures.map(f => `  - ${f}`).join('\n')}`);
      failed++;
    }
  }

  // Check 3: No nested blocks
  {
    const failures = [];
    for (const [cmdName, blocks] of rawBlocksByCommand) {
      for (let i = 0; i < blocks.length; i++) {
        if (!blocks[i].hasEnd || blocks[i].endIdx === null) continue;
        for (let j = 0; j < blocks.length; j++) {
          if (i === j) continue;
          if (blocks[j].startIdx > blocks[i].startIdx && blocks[j].startIdx < blocks[i].endIdx) {
            failures.push(`${cmdName}: '${blocks[j].name}' is nested inside '${blocks[i].name}'`);
          }
        }
      }
    }
    if (failures.length === 0) {
      checks.push('No nested extension blocks: PASS');
      passed++;
    } else {
      checks.push(`No nested extension blocks: FAIL\n${failures.map(f => `  - ${f}`).join('\n')}`);
      failed++;
    }
  }

  // ---- SYNCHRONIZATION CHECKS ----

  // Check 4: Registry to files — every registry point exists as a block in the command file
  {
    const failures = [];
    for (const [cmdName, cmd] of Object.entries(commands)) {
      const cmdBlocks = fileData.get(cmdName) || new Map();
      for (const ep of cmd.extensionPoints || []) {
        if (!cmdBlocks.has(ep.name)) {
          failures.push(`${cmdName}: registry point '${ep.name}' missing from file`);
        }
      }
    }
    if (failures.length === 0) {
      checks.push('Registry to files sync: PASS');
      passed++;
    } else {
      checks.push(`Registry to files sync: FAIL\n${failures.map(f => `  - ${f}`).join('\n')}`);
      failed++;
    }
  }

  // Check 5: Files to registry — every block in command files exists in registry
  {
    const failures = [];
    for (const [cmdName, cmdBlocks] of fileData) {
      const cmd = commands[cmdName];
      if (!cmd) continue; // Not an extensible command
      const registryNames = new Set((cmd.extensionPoints || []).map(ep => ep.name));
      for (const blockName of cmdBlocks.keys()) {
        if (!registryNames.has(blockName)) {
          failures.push(`${cmdName}: file block '${blockName}' not in registry`);
        }
      }
    }
    if (failures.length === 0) {
      checks.push('Files to registry sync: PASS');
      passed++;
    } else {
      checks.push(`Files to registry sync: FAIL\n${failures.map(f => `  - ${f}`).join('\n')}`);
      failed++;
    }
  }

  // ---- MANIFEST CHECKS ----

  // Check 6: Manifest to registry — all extensibleCommands in manifest have registry entries
  {
    const failures = [];
    for (const cmdName of extensibleCommands) {
      if (!commands[cmdName]) {
        failures.push(`manifest lists '${cmdName}' but not found in registry`);
      }
    }
    if (failures.length === 0) {
      checks.push('Manifest to registry sync: PASS');
      passed++;
    } else {
      checks.push(`Manifest to registry sync: FAIL\n${failures.map(f => `  - ${f}`).join('\n')}`);
      failed++;
    }
  }

  // Check 7: Registry to manifest — all registry commands appear in manifest
  {
    const failures = [];
    const manifestSet = new Set(extensibleCommands);
    for (const cmdName of Object.keys(commands)) {
      if (!manifestSet.has(cmdName)) {
        failures.push(`registry has '${cmdName}' but not in manifest extensibleCommands`);
      }
    }
    if (failures.length === 0) {
      checks.push('Registry to manifest sync: PASS');
      passed++;
    } else {
      checks.push(`Registry to manifest sync: FAIL\n${failures.map(f => `  - ${f}`).join('\n')}`);
      failed++;
    }
  }

  const lines = ['Extension Point Validation', ''];
  lines.push(...checks.map(c => `  ${c}`));
  lines.push('');
  lines.push(`${passed} checks passed, ${failed} failed`);

  return {
    exitCode: failed > 0 ? 1 : 0,
    output: lines.join('\n')
  };
}

// ============================================================================
// SUMMARY SUBCOMMAND (replaces matrix — Issue #1576)
// ============================================================================

/**
 * Run the summary subcommand.
 * Shows per-command filled/empty/total counts for extension points.
 * @returns {{ exitCode: number, output: string }}
 */
function runSummary() {
  const { registry, error } = loadRegistry();
  if (error) {
    return { exitCode: 2, output: error };
  }

  const commands = registry.commands || {};
  const commandNames = Object.keys(commands);

  if (commandNames.length === 0) {
    return { exitCode: 0, output: 'No extensible commands found in registry.' };
  }

  // Scan command files for hasContent
  const fileData = scanAllCommandFiles();

  // Compute per-command counts
  const rows = [];
  let totalPoints = 0;
  let totalFilled = 0;

  for (const cmdName of commandNames) {
    const cmd = commands[cmdName];
    const points = cmd.extensionPoints || [];
    const cmdBlocks = fileData.get(cmdName) || new Map();

    const filled = points.filter(ep => cmdBlocks.get(ep.name) || false).length;
    const empty = points.length - filled;

    rows.push({ name: cmdName, total: points.length, filled, empty });
    totalPoints += points.length;
    totalFilled += filled;
  }

  // Sort by filled count descending, then by total descending, then by name ascending
  rows.sort((a, b) => b.filled - a.filled || b.total - a.total || a.name.localeCompare(b.name));

  // Compute column width for command names
  const nameColWidth = Math.max(7, ...rows.map(r => r.name.length));

  // Build output
  const lines = [
    'Extension Point Summary',
    '',
    `${'Command'.padEnd(nameColWidth)}  Total  Filled  Empty`,
  ];

  for (const row of rows) {
    lines.push(
      `${row.name.padEnd(nameColWidth)}  ${String(row.total).padStart(5)}  ${String(row.filled).padStart(6)}  ${String(row.empty).padStart(5)}`
    );
  }

  lines.push('');
  lines.push(`Total: ${totalPoints} extension points across ${commandNames.length} commands (${totalFilled} filled)`);

  return { exitCode: 0, output: lines.join('\n') };
}

/**
 * Run the matrix subcommand (alias for summary).
 * Retained for backward compatibility.
 * @returns {{ exitCode: number, output: string }}
 */
function runMatrix() {
  return runSummary();
}

// ============================================================================
// RECIPES SUBCOMMAND
// ============================================================================

const RECIPES_PATH = path.join(METADATA_DIR, 'extension-recipes.json');

/**
 * Run the recipes subcommand.
 * @param {{ category: string|null }} opts - Options
 * @returns {{ exitCode: number, output: string }}
 */
function runRecipes(opts) {
  if (!fs.existsSync(RECIPES_PATH)) {
    return { exitCode: 2, output: 'Extension recipes file not found: .claude/metadata/extension-recipes.json' };
  }

  let recipes;
  try {
    const content = fs.readFileSync(RECIPES_PATH, 'utf-8');
    recipes = JSON.parse(content);
  } catch (e) {
    return { exitCode: 2, output: `Failed to parse extension-recipes.json: ${e.message}` };
  }

  const categories = recipes.categories || {};
  const categoryKeys = Object.keys(categories);

  // Filter by category if specified
  if (opts.category) {
    if (!categories[opts.category]) {
      return { exitCode: 0, output: `No recipes found for category '${opts.category}'.` };
    }
    const cat = categories[opts.category];
    const lines = [`${cat.name} — ${cat.description}`, ''];
    for (const recipe of cat.recipes || []) {
      lines.push(`  ${recipe.name} — ${recipe.description}`);
      if (recipe.extensionPoints && recipe.extensionPoints.length > 0) {
        lines.push(`    Points: ${recipe.extensionPoints.join(', ')}`);
      }
    }
    return { exitCode: 0, output: lines.join('\n') };
  }

  // Show all categories
  if (categoryKeys.length === 0) {
    return { exitCode: 0, output: 'No recipe categories found.' };
  }

  const lines = ['Extension Recipes', ''];
  for (const key of categoryKeys) {
    const cat = categories[key];
    lines.push(`${cat.name} — ${cat.description}`);
    for (const recipe of cat.recipes || []) {
      lines.push(`  ${recipe.name} — ${recipe.description}`);
    }
    lines.push('');
  }

  return { exitCode: 0, output: lines.join('\n').trim() };
}

// ============================================================================
// HELP SUBCOMMAND
// ============================================================================

/**
 * Run the help subcommand.
 * @returns {{ exitCode: number, output: string }}
 */
function runHelp() {
  const text = [
    'Usage: node extensions-cli.js <subcommand> [options]',
    '',
    'Subcommands:',
    '  list [--command X]       List all extension points (optionally filter by command)',
    '  list --status            List extension points with X/. filled/empty markers',
    '  view <command>:<point>   View content of a specific extension point',
    '  validate                 Validate extension point integrity (7 checks)',
    '  summary                  Per-command filled/empty/total counts',
    '  matrix                   Alias for summary',
    '  recipes [category]       Browse extension recipes by category',
    '  help                     Show this help message',
    '',
    'Exit codes:',
    '  0 = success',
    '  1 = validation failures found (validate subcommand)',
    '  2 = fatal error (missing registry, invalid arguments)'
  ];

  return { exitCode: 0, output: text.join('\n') };
}

// ============================================================================
// EDITOR INTEGRATION (Issue #1424)
// ============================================================================

const os = require('os');
const { spawnSync } = require('child_process');

/**
 * Detect the user's preferred editor from environment variables.
 * Checks $VISUAL first (graphical editors), then $EDITOR (terminal editors).
 * @returns {string|null} Editor command or null if none configured
 */
function detectEditor() {
  return process.env.VISUAL || process.env.EDITOR || null;
}

/**
 * Determine whether a subcommand should open output in an external editor.
 * List, summary, and matrix (alias) produce output too long for Claude Code display.
 * @param {string} subcommand - The subcommand name
 * @param {{ stdout?: boolean }} options - Parsed options
 * @returns {boolean}
 */
function shouldOpenInEditor(subcommand, options) {
  if (options && options.stdout) return false;
  return subcommand === 'list' || subcommand === 'matrix' || subcommand === 'summary';
}

/**
 * Write content to a temp file and open it in an editor.
 * @param {string} content - The content to write
 * @param {string} label - Label for the temp file name (e.g., 'list', 'matrix')
 * @param {Function} [spawnFn] - Spawn function (for testing; defaults to spawnSync)
 * @param {Object} [fsModule] - fs module (for testing; defaults to require('fs'))
 * @returns {string} Path to the temp file
 */
function writeAndOpenEditor(content, label, spawnFn, fsModule) {
  const _fs = fsModule || fs;
  const _spawn = spawnFn || spawnSync;
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `extensions-${label}-${Date.now()}.txt`);
  _fs.writeFileSync(tmpFile, content, 'utf-8');

  const editor = detectEditor();
  if (editor) {
    _spawn(editor, [tmpFile], { stdio: 'inherit' });
  }

  return tmpFile;
}

// ============================================================================
// ARGUMENT PARSING & MAIN
// ============================================================================

/**
 * Parse command-line arguments.
 * @param {string[]} args - process.argv.slice(2)
 * @returns {{ subcommand: string, args: string[], options: Object }}
 */
function parseArgs(args) {
  const subcommand = args[0] || 'help';
  const rest = args.slice(1);
  const options = {};
  const positional = [];

  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--command' && i + 1 < rest.length) {
      options.command = rest[i + 1];
      i++;
    } else if (rest[i] === '--stdout') {
      options.stdout = true;
    } else if (rest[i] === '--status') {
      options.status = true;
    } else if (rest[i] === '--help') {
      options.help = true;
    } else if (!rest[i].startsWith('--')) {
      positional.push(rest[i]);
    }
  }

  return { subcommand, args: positional, options };
}

/**
 * Main entry point.
 */
function main() {
  const { subcommand, args: posArgs, options } = parseArgs(process.argv.slice(2));

  let result;

  switch (subcommand) {
    case 'list':
      result = runList({ command: options.command || null, status: options.status || false });
      break;
    case 'view':
      result = runView({ target: posArgs[0] || '' });
      break;
    case 'validate':
      result = runValidate();
      break;
    case 'summary':
      result = runSummary();
      break;
    case 'matrix':
      result = runMatrix();
      break;
    case 'recipes':
      result = runRecipes({ category: posArgs[0] || null });
      break;
    case 'help':
      result = runHelp();
      break;
    default:
      result = { exitCode: 2, output: `Unknown subcommand: ${subcommand}\nRun: node extensions-cli.js help` };
      break;
  }

  if (result.output) {
    if (shouldOpenInEditor(subcommand, options) && result.exitCode === 0) {
      const editor = detectEditor();
      if (editor) {
        const tmpFile = writeAndOpenEditor(result.output, subcommand);
        console.log(`Opened in editor: ${tmpFile}`);
      } else {
        console.log('Warning: No editor configured. Set $VISUAL or $EDITOR environment variable.');
        console.log('See Docs/02-Advanced/Editor-Setup.md for configuration instructions.\n');
        console.log(result.output);
      }
    } else {
      console.log(result.output);
    }
  }
  process.exit(result.exitCode);
}

// Export for testing
module.exports = {
  loadRegistry,
  stripFencedCodeBlocks,
  scanExtensionBlocks,
  scanAllCommandFiles,
  extractPointContent,
  runList,
  runView,
  runValidate,
  runSummary,
  runMatrix,
  runRecipes,
  runHelp,
  parseArgs,
  detectEditor,
  shouldOpenInEditor,
  writeAndOpenEditor
};

// Run main only when executed directly
if (require.main === module) {
  main();
}
