#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.91.1
 * @description Check .gh-pmu.json config integrity via gh pmu config verify.
 * Gates on gh-pmu >= 1.3.1 (config verify was introduced in that version).
 * Non-blocking; used during session startup.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const { execSync } = require('child_process');

const MIN_VERSION = '1.3.1';

/**
 * Compare two semver version strings.
 * @returns {number} Negative if a < b, 0 if equal, positive if a > b
 */
function compareSemver(a, b) {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Get gh pmu version string, or null if not installed.
 */
function getPmuVersion() {
  try {
    const out = execSync('gh pmu --version', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000
    });
    const match = out.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Run gh pmu config verify and return { exitCode, stderr }.
 * Exit code 2 = critical drift (gh-pmu >= version with #792).
 */
function runConfigVerify() {
  try {
    execSync('gh pmu config verify', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000
    });
    return { exitCode: 0, stderr: '' };
  } catch (err) {
    return { exitCode: err.status || 1, stderr: (err.stderr || '') };
  }
}

/**
 * Parse critical field changes from stderr output.
 * Looks for the structured alert box from gh-pmu#792.
 */
function parseCriticalFields(stderr) {
  const fields = [];
  const fieldPattern = /^\s+(project\.owner|project\.number|repositories\[0\]):\s+(.+?)\s+→\s+(.+?)\s*$/gm;
  let match;
  while ((match = fieldPattern.exec(stderr)) !== null) {
    fields.push({ field: match[1], from: match[2], to: match[3] });
  }
  return fields;
}

function main() {
  const args = process.argv.slice(2);

  // Simulation flags for testing
  if (args.includes('--simulate-no-pmu')) {
    console.log(JSON.stringify({
      success: true,
      message: 'gh pmu not available — skipping config integrity check.',
      data: { status: 'skipped', reason: 'gh pmu not available' }
    }));
    return;
  }

  if (args.includes('--simulate-old-version')) {
    console.log(JSON.stringify({
      success: true,
      message: 'gh pmu version too old — skipping config integrity check.',
      data: { status: 'skipped', reason: 'gh pmu version < 1.3.1' }
    }));
    return;
  }

  if (args.includes('--simulate-critical-drift')) {
    console.log(JSON.stringify({
      success: true,
      message: 'Critical config drift detected — project identity fields changed.',
      data: {
        status: 'critical_drift',
        fields: [
          { field: 'project.number', from: '7', to: '42' },
          { field: 'project.owner', from: 'rubrical-works', to: 'other-owner' }
        ]
      }
    }));
    return;
  }

  // Check gh pmu availability
  const version = getPmuVersion();
  if (!version) {
    console.log(JSON.stringify({
      success: true,
      message: 'gh pmu not available — skipping config integrity check.',
      data: { status: 'skipped', reason: 'gh pmu not available' }
    }));
    return;
  }

  // Version gate
  if (compareSemver(version, MIN_VERSION) < 0) {
    console.log(JSON.stringify({
      success: true,
      message: `gh pmu ${version} does not support config verify — skipping.`,
      data: { status: 'skipped', reason: `gh pmu version ${version} < ${MIN_VERSION}` }
    }));
    return;
  }

  // Run config verify
  const { exitCode, stderr } = runConfigVerify();

  if (exitCode === 0) {
    console.log(JSON.stringify({
      success: true,
      message: 'Config integrity verified.',
      data: { status: 'verified', version }
    }));
  } else if (exitCode === 2) {
    // Exit code 2 = critical drift (gh-pmu#792)
    const fields = parseCriticalFields(stderr);
    console.log(JSON.stringify({
      success: true,
      message: 'Critical config drift detected — project identity fields changed.',
      data: { status: 'critical_drift', fields, version }
    }));
  } else {
    console.log(JSON.stringify({
      success: true,
      message: 'Config drift detected — run gh pmu config verify for details.',
      data: { status: 'drift', exitCode, version }
    }));
  }
}

main();
