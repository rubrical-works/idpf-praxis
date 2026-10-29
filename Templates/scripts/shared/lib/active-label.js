#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.114.0
 * @description Manage the 'active' label on branch tracker issues, ensuring at most one open tracker holds it. Exports ensureActiveLabel() and removeActiveLabelOnly(). Used by create-branch.js and destroy-branch.js.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * lib/active-label.js
 *
 * Usage (CLI):
 *   node active-label.js ensure <tracker-number>
 *   node active-label.js remove <tracker-number>
 *
 * Usage (module):
 *   const { ensureActiveLabel, removeActiveLabelOnly } = require('./lib/active-label');
 */

// Spawns bounded via lib/exec.js (#2469) — aliased to the original names
// so call sites are unchanged.
const { execTimed: execSync } = require('./exec.js');

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
 * Every open tracker carrying the 'active' label (#3160). Unlike
 * findActiveTracker this returns them all, so a caller can refuse an
 * ambiguous label rather than act on whichever one gh listed first.
 * @returns {number[]|null} Issue numbers, [] when none, null when the lookup failed
 */
function findActiveTrackers() {
    const output = execSafe('gh issue list --label=branch --label=active --state=open --json=number');
    if (output === null) return null;
    try {
        return JSON.parse(output).map(issue => issue.number);
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
 * Removes the label from every other tracker first (#3063).
 * Idempotent — no edit when it is already the only active tracker.
 * Never throws.
 *
 * @param {number} trackerNum - Tracker issue number to make active
 */
function ensureActiveLabel(trackerNum) {
    if (!trackerNum) return;

    try {
        // Every active tracker, not the first gh lists (#3063): two concurrent
        // ensures can leave two labeled, and clearing one left the other.
        // null = lookup failed: nothing known to clear, the target still gets it.
        const active = findActiveTrackers() || [];

        for (const other of active) {
            if (other !== trackerNum) execSafe(`gh issue edit ${other} --remove-label=active`);
        }

        if (!active.includes(trackerNum)) {
            execSafe(`gh issue edit ${trackerNum} --add-label=active`);
        }
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
    findActiveTrackers,
    getAllOpenTrackers,
    getTrackerForBranch,
    ensureActiveLabel,
    removeActiveLabelOnly,
    runCli
};
