#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.63.1
 * statusline-check.js
 *
 * Detects whether a Claude Code status line is configured in user-level
 * or project-level settings. Read-only — never modifies settings files.
 *
 * Usage:
 *   node statusline-check.js
 *
 * Returns JSON: { configured: boolean, source?: string }
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
