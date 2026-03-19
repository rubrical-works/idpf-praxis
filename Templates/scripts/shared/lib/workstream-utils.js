// Rubrical Works (c) 2026
/**
 * @framework-script 0.66.2
 * @description Shared workstream metadata operations for branch lifecycle management. Exports loadWorkstreams(), saveWorkstreams(), validateTransition(), and status constants. Used by /merge-branch, /destroy-branch, and /plan-workstreams.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * workstream-utils.js — Shared Workstream Utility Library
 *
 * @see https://github.com/rubrical-works/idpf-praxis-dev/issues/1461
 */

'use strict';

const fs = require('fs');
const path = require('path');

const VALID_STATUSES = ['active', 'merged', 'destroyed'];

// Status transitions that are NOT allowed
const INVALID_TRANSITIONS = {
  destroyed: ['active'] // Cannot revive a destroyed workstream
};

/**
 * Load and parse .workstreams.json from a directory.
 * @param {string} dir - Directory containing .workstreams.json
 * @returns {object|null} Parsed metadata or null if file absent
 * @throws {SyntaxError} If JSON is malformed
 */
function loadWorkstreams(dir) {
  const filePath = path.join(dir, '.workstreams.json');
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * Check if a branch is a workstream member (any status).
 * @param {string} branchName - Branch to check
 * @param {object|null} metadata - Parsed .workstreams.json
 * @returns {boolean}
 */
function isWorkstreamBranch(branchName, metadata) {
  if (!metadata || !metadata.streams) return false;
  return metadata.streams.some(s => s.branch === branchName);
}

/**
 * Get active sibling workstream branch names.
 * @param {string} branchName - Branch to find siblings for
 * @param {object|null} metadata - Parsed .workstreams.json
 * @returns {string[]} Active sibling branch names
 */
function getSiblings(branchName, metadata) {
  if (!metadata || !metadata.streams) return [];
  return metadata.streams
    .filter(s => s.branch !== branchName && s.status === 'active')
    .map(s => s.branch);
}

/**
 * Get epic numbers assigned to a workstream branch.
 * @param {string} branchName - Branch to query
 * @param {object|null} metadata - Parsed .workstreams.json
 * @returns {number[]} Epic numbers (empty if not a workstream)
 */
function getOrphanedEpics(branchName, metadata) {
  if (!metadata || !metadata.streams) return [];
  const stream = metadata.streams.find(s => s.branch === branchName);
  if (!stream) return [];
  return [...(stream.epics || [])];
}

/**
 * Update the status of a workstream branch in .workstreams.json.
 * @param {string} branchName - Branch to update
 * @param {string} status - New status (active, merged, destroyed)
 * @param {string} dir - Directory containing .workstreams.json
 * @throws {Error} If status is invalid, transition is invalid, or branch not found
 */
function updateStatus(branchName, status, dir) {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid status "${status}". Valid statuses: ${VALID_STATUSES.join(', ')}`);
  }

  const filePath = path.join(dir, '.workstreams.json');
  const content = fs.readFileSync(filePath, 'utf8');
  const metadata = JSON.parse(content);

  const stream = metadata.streams.find(s => s.branch === branchName);
  if (!stream) {
    throw new Error(`Branch "${branchName}" not found in .workstreams.json`);
  }

  // Check for invalid transitions
  const blocked = INVALID_TRANSITIONS[stream.status];
  if (blocked && blocked.includes(status)) {
    throw new Error(`Cannot transition from "${stream.status}" to "${status}". Invalid transition.`);
  }

  stream.status = status;
  fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2) + '\n');
}

/**
 * Check if all workstreams are resolved (no active streams remain).
 * @param {object|null} metadata - Parsed .workstreams.json
 * @returns {boolean} True if no active streams
 */
function allResolved(metadata) {
  if (!metadata || !metadata.streams) return true;
  return !metadata.streams.some(s => s.status === 'active');
}

/**
 * Parse git worktree list output and find stale worktrees matching branch names.
 * @param {string[]} branchNames - Branch names to match against
 * @param {string} worktreeOutput - Output from `git worktree list`
 * @returns {Array<{path: string, branch: string}>} Matching stale worktrees
 */
function checkStaleWorktrees(branchNames, worktreeOutput) {
  if (!branchNames.length || !worktreeOutput.trim()) return [];

  const results = [];
  const lines = worktreeOutput.trim().split('\n');

  for (const line of lines) {
    // git worktree list format: /path/to/worktree  SHA [branch]
    const match = line.match(/^(.+?)\s+[0-9a-f]+\s+\[(.+?)\]/);
    if (!match) continue;

    const worktreePath = match[1].trim();
    const branch = match[2];

    if (branchNames.includes(branch)) {
      results.push({ path: worktreePath, branch });
    }
  }

  return results;
}

module.exports = {
  loadWorkstreams,
  isWorkstreamBranch,
  getSiblings,
  getOrphanedEpics,
  updateStatus,
  allResolved,
  checkStaleWorktrees
};

if (require.main === module) {
  // CLI usage placeholder
  console.log('workstream-utils.js — use as a library, not standalone');
}
