#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.114.0
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
 * Resolve the gh pmu version from a hook-supplied --pmu-version=<first line of
 * `gh pmu --version`> (#2907), probing only when that value cannot settle it.
 * Absent flag → probe, as before. Parseable → use it, no probe. Empty or
 * unparseable → probe: the hook's safeExec turns a timeout into '', so an empty
 * value means "the hook could not tell", not "gh pmu is not installed".
 * @param {string[]} argv
 * @param {() => string|null} [probe]
 * @returns {{ version: string|null, versionSource: 'hook'|'probe' }}
 */
function resolvePmuVersion(argv, probe = getPmuVersion) {
  const flag = argv.find((a) => a.startsWith('--pmu-version='));
  if (flag !== undefined) {
    const match = flag.slice('--pmu-version='.length).match(/(\d+\.\d+\.\d+)/);
    if (match) return { version: match[1], versionSource: 'hook' };
  }
  return { version: probe(), versionSource: 'probe' };
}

/**
 * Run gh pmu config verify and return { exitCode, stderr, reason }.
 * Exit code 2 = critical drift (gh-pmu >= version with #792).
 *
 * `exitCode: null` means the command never reported an exit — it timed out or
 * could not be spawned — and `reason` says which (#3054 item 8). It used to be
 * mapped to 1 and reported as drift: a false verdict, not a missing one.
 */
function runConfigVerify(exec = execSync) {
  try {
    exec('gh pmu config verify', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000
    });
    return { exitCode: 0, stderr: '', reason: null };
  } catch (err) {
    if (typeof err.status !== 'number') {
      const reason = err.code === 'ETIMEDOUT' || err.signal ? 'timed out' : `could not run (${err.code || err.message})`;
      return { exitCode: null, stderr: (err.stderr || '').toString(), reason };
    }
    return { exitCode: err.status, stderr: (err.stderr || '').toString(), reason: null };
  }
}

/**
 * The envelope for a config verify result — verified, critical drift, drift,
 * or unverified when the check could not run (#3054 item 8).
 */
function buildVerifyEnvelope({ exitCode, stderr, reason }, version, versionSource) {
  if (exitCode === null) {
    return {
      success: true,
      message: `Could not verify config integrity — gh pmu config verify ${reason}.`,
      data: { status: 'unverified', reason, version, versionSource }
    };
  }
  if (exitCode === 0) {
    return {
      success: true,
      message: 'Config integrity verified.',
      data: { status: 'verified', version, versionSource }
    };
  }
  if (exitCode === 2) {
    // Exit code 2 = critical drift (gh-pmu#792)
    return {
      success: true,
      message: 'Critical config drift detected — project identity fields changed.',
      data: { status: 'critical_drift', fields: parseCriticalFields(stderr), version, versionSource }
    };
  }
  return {
    success: true,
    message: 'Config drift detected — run gh pmu config verify for details.',
    data: { status: 'drift', exitCode, version, versionSource }
  };
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

/**
 * Run the check and print its envelope. The version probe, the exec that runs
 * `gh pmu config verify` and the printer are injectable so tests drive the real
 * path; the test-only flags that once short-circuited to canned output are
 * gone (#3328).
 * @param {string[]} [args]
 * @param {{ probe?: () => string|null, exec?: Function, log?: (s: string) => void }} [deps]
 */
function main(args = process.argv.slice(2), deps = {}) {
  const { probe = getPmuVersion, exec = execSync, log = console.log } = deps;

  // Check gh pmu availability
  const { version, versionSource } = resolvePmuVersion(args, probe);
  if (!version) {
    log(JSON.stringify({
      success: true,
      message: 'gh pmu not available — skipping config integrity check.',
      data: { status: 'skipped', reason: 'gh pmu not available', versionSource }
    }));
    return;
  }

  // Version gate
  if (compareSemver(version, MIN_VERSION) < 0) {
    log(JSON.stringify({
      success: true,
      message: `gh pmu ${version} does not support config verify — skipping.`,
      data: { status: 'skipped', reason: `gh pmu version ${version} < ${MIN_VERSION}`, versionSource }
    }));
    return;
  }

  // Run config verify
  log(JSON.stringify(buildVerifyEnvelope(runConfigVerify(exec), version, versionSource)));
}

// #2615: guarded so requiring this module does not run the integrity check and
// print its envelope. Exports the pure helpers, which is what lets them be
// asserted behaviorally instead of by source text.
if (require.main === module) {
  main();
}

module.exports = {
  buildVerifyEnvelope,
  compareSemver,
  getPmuVersion,
  main,
  parseCriticalFields,
  resolvePmuVersion,
  runConfigVerify
};
