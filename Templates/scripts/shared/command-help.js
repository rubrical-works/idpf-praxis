#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.113.0
 * @description `--help` for a deployed command (#3030): resolve the command's
 *   docs URL from the single base in `.claude/metadata/command-docs.json` and
 *   open it in the default browser through `openBrowserCrossPlatform`
 *   (lib/local-server.js). When no browser can be launched the URL is printed
 *   instead. Performs no other action.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * Usage: node .claude/scripts/shared/command-help.js <command> [--no-open]
 *
 * WHY ONE BASE. The docs are expected to move from the GitHub-rendered
 * Docs/Commands/ pages to a rubrical.works page per command. A URL written into
 * each of 46 specs would make that move 46 edits; here it is one value.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'metadata', 'command-docs.json');
const COMMAND_NAME = /^[a-z][a-z0-9-]*$/;

/**
 * @param {string} [configPath]
 * @returns {{baseUrl: string, pathTemplate: string}}
 */
function loadDocsConfig(configPath = CONFIG_PATH) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (typeof config.baseUrl !== 'string' || !config.baseUrl) throw new Error(`${configPath}: baseUrl is required`);
  if (typeof config.pathTemplate !== 'string' || !config.pathTemplate.includes('{command}')) {
    throw new Error(`${configPath}: pathTemplate must contain {command}`);
  }
  return config;
}

/**
 * @param {string} command  Command name, with or without a leading `/`.
 * @param {{baseUrl: string, pathTemplate: string}} config
 * @returns {string}
 */
function resolveDocsUrl(command, config) {
  const name = String(command || '').replace(/^\//, '');
  if (!COMMAND_NAME.test(name)) throw new Error(`"${command}" is not a command name`);
  return config.baseUrl + config.pathTemplate.replace('{command}', name);
}

/**
 * Open the docs page; a launch failure is reported, not raised.
 * @param {string} command
 * @param {{open?: function, config?: object}} [opts]  `open` defaults to openBrowserCrossPlatform.
 * @returns {Promise<{ok: true, opened: boolean, url: string, message: string}>}
 */
async function openDocs(command, opts = {}) {
  const url = resolveDocsUrl(command, opts.config || loadDocsConfig());
  const open = opts.open || require('./lib/local-server.js').openBrowserCrossPlatform;
  let result;
  try {
    result = await open(url);
  } catch (err) {
    result = { ok: false, error: err };
  }
  const name = String(command).replace(/^\//, '');
  if (result && result.ok) {
    return { ok: true, opened: true, url, message: `Opened the /${name} docs: ${url}` };
  }
  return { ok: true, opened: false, url, message: `Could not open a browser. The /${name} docs are at: ${url}` };
}

async function main(argv = process.argv.slice(2)) {
  const command = argv.find((a) => !a.startsWith('--'));
  if (!command) {
    console.error('Usage: node .claude/scripts/shared/command-help.js <command> [--no-open]');
    return 1;
  }
  try {
    if (argv.includes('--no-open')) {
      console.log(`The /${command.replace(/^\//, '')} docs are at: ${resolveDocsUrl(command, loadDocsConfig())}`);
      return 0;
    }
    console.log((await openDocs(command)).message);
    return 0;
  } catch (err) {
    console.error(err.message);
    return 1;
  }
}

if (require.main === module) {
  main().then((code) => process.exit(code));
}

module.exports = {
  loadDocsConfig,
  resolveDocsUrl,
  openDocs,
  main,
};
