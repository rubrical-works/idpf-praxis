#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.74.0
 * @description Detect whether a Claude Code status line is configured in user-level or project-level settings.json. Returns JSON with configuration status and source path. Read-only utility used during session startup to determine if statusline-setup agent should run.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Detection ───

function checkStatusLine(options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const projectDir = options.projectDir || process.cwd();
  const force = options.force || false;

  if (force) {
    return { configured: false };
  }

  const locations = [
    path.join(homeDir, '.claude', 'settings.json'),
    path.join(projectDir, '.claude', 'settings.json'),
    path.join(projectDir, '.claude', 'settings.local.json'),
  ];

  for (const loc of locations) {
    try {
      const raw = fs.readFileSync(loc, 'utf-8');
      const data = JSON.parse(raw);
      if (data.statusLine) {
        return { configured: true, source: loc };
      }
    } catch (_e) {
      // File doesn't exist or isn't valid JSON — skip
    }
  }

  return { configured: false };
}

// ─── Main ───

if (require.main === module) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const result = checkStatusLine({ force });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

module.exports = { checkStatusLine };
