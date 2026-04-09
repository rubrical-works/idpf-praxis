#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.85.0
 * @description Check branch sync status with upstream. Detects behind, ahead,
 *   diverged, and no-upstream states. Non-blocking; used during session startup.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const { execSync } = require('child_process');

/**
 * Parse the output of `git rev-list --left-right --count HEAD...@{upstream}`.
 * @param {string|null} output - Tab-separated "ahead\tbehind" string
 * @returns {{ status: string, ahead: number, behind: number } | null}
 */
function parseSyncStatus(output) {
  if (!output) return null;

  const trimmed = String(output).trim();
  const match = trimmed.match(/^\s*(\d+)\s+(\d+)\s*$/);
  if (!match) return null;

  const ahead = parseInt(match[1], 10);
  const behind = parseInt(match[2], 10);

  let status;
  if (ahead === 0 && behind === 0) {
    status = 'up-to-date';
  } else if (ahead > 0 && behind > 0) {
    status = 'diverged';
  } else if (behind > 0) {
    status = 'behind';
  } else {
    status = 'ahead';
  }

  return { status, ahead, behind };
}

/**
 * Detect the sync status of the current branch with its upstream.
 * @returns {{ branch: string, status: string, ahead: number, behind: number } | null}
 */
function detectBranchSync() {
  let branch;
  try {
    branch = execSync('git branch --show-current', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch {
    return null;
  }

  try {
    const output = execSync('git rev-list --left-right --count HEAD...@{upstream}', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const parsed = parseSyncStatus(output);
    if (!parsed) {
      return { branch, status: 'no-upstream', ahead: 0, behind: 0 };
    }
    return { branch, ...parsed };
  } catch {
    return { branch, status: 'no-upstream', ahead: 0, behind: 0 };
  }
}

// ======================================
//  Main Entry Point
// ======================================

if (require.main === module) {
  const result = detectBranchSync();

  if (!result) {
    console.log(JSON.stringify({
      success: false,
      message: 'Could not determine branch sync status.',
      data: { skipped: true }
    }));
    process.exit(0);
  }

  if (result.status === 'up-to-date' || result.status === 'no-upstream') {
    console.log(JSON.stringify({
      success: true,
      message: result.status === 'up-to-date'
        ? `Branch '${result.branch}' is up to date with upstream.`
        : `Branch '${result.branch}' has no upstream tracking branch.`,
      data: { ...result, skipped: result.status === 'no-upstream' }
    }));
    process.exit(0);
  }

  console.log(JSON.stringify({
    success: true,
    message: `Branch '${result.branch}' is ${result.status} upstream.`,
    data: result
  }));
}

module.exports = {
  parseSyncStatus,
  detectBranchSync
};
