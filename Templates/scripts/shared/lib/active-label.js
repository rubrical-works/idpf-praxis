#!/usr/bin/env node
/**
 * @framework-script 0.53.0
 * lib/active-label.js
 *
 * Manages the 'active' label on branch tracker issues.
 * At most one open tracker holds the label at any time.
 *
 * Usage (CLI):
 *   node active-label.js ensure <tracker-number>
 *   node active-label.js remove <tracker-number>
 *
 * Usage (module):
 *   const { ensureActiveLabel, removeActiveLabelOnly } = require('./lib/active-label');
 */

const { execSync } = require('child_process');

const EXEC_OPTS = { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] };

/**
 * Safe exec wrapper — never throws
 * @param {string} cmd - Command to execute
 * @returns {string|null} Trimmed output or null on failure
 */
function execSafe(cmd) {
    try {
        return execSync(cmd, EXEC_OPTS).trim();
    } catch (_e) {
        return null;
    }
}

/**
 * Find the open tracker issue that currently has the 'active' label
 * @returns {number|null} Issue number or null
 */
function findActiveTracker() {
    const output = execSafe('gh issue list --label=branch --label=active --state=open --json=number --limit=5');
    if (!output) return null;
    try {
        const issues = JSON.parse(output);
        return issues.length > 0 ? issues[0].number : null;
    } catch (_e) {
        return null;
    }
}

/**
 * Get all open branch tracker issues with parsed branch names.
 * Uses `gh issue list --label=branch --state=open` for fast discovery (~0.8s)
 * instead of `gh pmu branch list` (~6s).
 *
 * Parses branch names from tracker titles (format: "Branch: prefix/name").
 * Trackers with malformed titles (no "Branch: " prefix) are skipped.
 *
 * @returns {Array<{number: number, branch: string}>} Open trackers with branch names
 */
function getAllOpenTrackers() {
    const output = execSafe('gh issue list --label=branch --state=open --json=number,title');
    if (!output) return [];
    try {
        const issues = JSON.parse(output);
        return issues
            .map(issue => {
                const match = issue.title.trim().match(/^Branch:\s*(.+)$/);
                if (!match) return null;
                return { number: issue.number, branch: match[1].trim() };
            })
            .filter(Boolean);
    } catch (_e) {
        return [];
    }
}

/**
 * Get the tracker issue number for the current branch
 * Parses "Tracker: #NNNN" from gh pmu branch current output
 * @returns {number|null} Tracker issue number or null
 */
function getTrackerForBranch() {
    const output = execSafe('gh pmu branch current');
    if (!output) return null;
    const match = output.match(/Tracker:\s*#(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}

/**
 * Ensure the given tracker has the 'active' label.
 * Removes the label from any other tracker first (atomic swap).
 * Idempotent — no-op if tracker already has the label.
 * Never throws.
 *
 * @param {number} trackerNum - Tracker issue number to make active
 */
function ensureActiveLabel(trackerNum) {
    if (!trackerNum) return;

    try {
        const currentActive = findActiveTracker();

        // Already active — no-op
        if (currentActive === trackerNum) return;

        // Remove from old tracker if one exists
        if (currentActive) {
            execSafe(`gh issue edit ${currentActive} --remove-label=active`);
        }

        // Add to new tracker
        execSafe(`gh issue edit ${trackerNum} --add-label=active`);
    } catch (_e) {
        // Non-throwing — label management is supplementary
    }
}

/**
 * Remove the 'active' label from a tracker issue.
 * Idempotent — removing a non-existent label is fine.
 * Never throws.
 *
 * @param {number} trackerNum - Tracker issue number
 */
function removeActiveLabelOnly(trackerNum) {
    if (!trackerNum) return;
    try {
        execSafe(`gh issue edit ${trackerNum} --remove-label=active`);
    } catch (_e) {
        // Non-throwing
    }
}

/**
 * CLI runner — exported for testability
 * @param {string[]} args - CLI arguments [subcommand, trackerNum]
 */
function runCli(args) {
    const [subcommand, trackerArg] = args;

    if (!subcommand || !['ensure', 'remove'].includes(subcommand)) {
        console.error('Usage: node active-label.js ensure|remove <tracker-number>');
        return;
    }

    const trackerNum = parseInt(trackerArg, 10);
    if (isNaN(trackerNum)) {
        console.error('Usage: node active-label.js ensure|remove <tracker-number>');
        return;
    }

    if (subcommand === 'ensure') {
        ensureActiveLabel(trackerNum);
        console.log(`Active label ensured on #${trackerNum}`);
    } else {
        removeActiveLabelOnly(trackerNum);
        console.log(`Active label removed from #${trackerNum}`);
    }
}

if (require.main === module) {
    runCli(process.argv.slice(2));
}

module.exports = {
    findActiveTracker,
    getAllOpenTrackers,
    getTrackerForBranch,
    ensureActiveLabel,
    removeActiveLabelOnly,
    runCli
};
