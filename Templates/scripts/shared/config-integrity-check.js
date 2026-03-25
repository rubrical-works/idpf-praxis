#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.71.2
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
 * Run gh pmu config verify and return exit code.
 */
function runConfigVerify() {
  try {
    execSync('gh pmu config verify', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000
    });
    return 0;
  } catch (err) {
    return err.status || 1;
  }
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
  const exitCode = runConfigVerify();

  if (exitCode === 0) {
    console.log(JSON.stringify({
      success: true,
      message: 'Config integrity verified.',
      data: { status: 'verified', version }
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
