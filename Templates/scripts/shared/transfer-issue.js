#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.114.0
 * @description Transfer an issue between branches or remove it from branch assignment. Validates source and target branches, updates gh pmu branch field, and reports the transfer. Used by /transfer-issue command.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

// Spawns bounded via lib/exec.js (#2469) — aliased to the original names
// so call sites are unchanged.
const { execFileTimed: execFileSync } = require('./lib/exec.js');
const { validateIssueNumber, validateBranchName } = require('./lib/input-validation.js');

function exec(cmd) {
    try {
        const parts = cmd.split(/\s+/);
        return execFileSync(parts[0], parts.slice(1), { encoding: 'utf-8' }).trim();
    } catch (_e) {
        return null;
    }
}

function getIssueDetails(issueNumber, execFn = exec) {
    try {
        const result = execFn(`gh pmu view ${issueNumber} --json=fieldValues`);
        if (result) {
            return JSON.parse(result);
        }
    } catch {
        // Intentionally ignored
    }
    return null;
}

function getOpenBranches(execFn = exec) {
    try {
        // Note: gh pmu branch list has no JSON support, parse text output
        // Format: "VERSION      CODENAME        TRACKER    STATUS"
        const result = execFn('gh pmu branch list');
        if (result) {
            const lines = result.split('\n').slice(2); // Skip header rows
            const branches = [];
            for (const line of lines) {
                if (!line.trim()) continue;
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 4) {
                    const name = parts[0];
                    const status = parts[parts.length - 1];
                    if (status === 'Active') {
                        branches.push({ name, status });
                    }
                }
            }
            return branches;
        }
    } catch {
        // Intentionally ignored
    }
    return [];
}

/**
 * Parse the command's arguments. /transfer-issue passes "$ARGUMENTS" as ONE
 * string, so a single argument is split on whitespace exactly as
 * assign-branch.js does (#3059); before, it was never split and every
 * invocation printed usage.
 * @param {string[]} argv
 * @returns {{issueNumber: number|null, newBranch: string|null, removeFromBranch: boolean}}
 */
function parseArgs(argv) {
    let args = argv;
    if (args.length === 1 && /\s/.test(args[0])) {
        args = args[0].split(/\s+/).filter(a => a.trim());
    }
    const issueArg = args.find(a => /^#?\d+$/.test(a));
    const branchAt = args.indexOf('--branch');
    return {
        issueNumber: issueArg ? validateIssueNumber(issueArg.replace('#', '')) : null,
        newBranch: branchAt >= 0 && args[branchAt + 1] ? args[branchAt + 1] : null,
        removeFromBranch: args.includes('--remove-branch')
    };
}

/**
 * The branch name to move to. A name that already carries a prefix
 * (`idpf/0.109.0`, `patch/0.1.1`) is used as given — prefixing `release/`
 * onto it named a branch that does not exist (#3059). Only a bare name
 * (`v1.2.0`) gets the historical `release/` prefix.
 * @param {string} name
 * @returns {string}
 */
function resolveBranchName(name) {
    return name.includes('/') ? name : `release/${name}`;
}

/**
 * @param {string[]} argv
 * @param {{exec?: function(string): (string|null), log?: function(string): void}} [deps]
 */
function run(argv, deps = {}) {
    const execFn = deps.exec || exec;
    const log = deps.log || console.log;
    const { issueNumber, newBranch, removeFromBranch } = parseArgs(argv);

    log('=== Transfer Issue ===\n');

    if (!issueNumber) {
        log('Usage: /transfer-issue #123 [options]');
        log('\nOptions:');
        log('  --branch <name>     Transfer to different branch');
        log('  --remove-branch     Remove from current branch (back to backlog)');
        return;
    }

    // Get current issue details
    const issue = getIssueDetails(issueNumber, execFn);
    if (!issue) {
        log(`Issue #${issueNumber} not found or error fetching.`);
        return;
    }

    // `gh pmu view --json=fieldValues` carries the title as fieldValues.Title;
    // there is no top-level `title` (#3059).
    const fields = issue.fieldValues || {};
    const currentBranch = fields.Branch || '(none)';

    log(`Issue #${issueNumber}: ${fields.Title || '(untitled)'}`);
    log(`Current branch: ${currentBranch}`);
    log('');

    // Handle actions
    if (removeFromBranch) {
        log('Removing from branch...');
        // gh pmu may not support removing branch field directly
        // This would need to be implemented in gh pmu
        log('Note: Use gh pmu move to update branch assignment.');
        log('Example: gh pmu move ' + issueNumber + ' --branch ""');
        return;
    }

    if (newBranch) {
        log(`Transferring to branch: ${newBranch}...`);
        validateBranchName(newBranch);
        const branchName = resolveBranchName(newBranch);
        const result = execFn(`gh pmu move ${issueNumber} --branch ${branchName}`);
        if (result !== null) {
            log(`✓ Issue #${issueNumber} transferred to ${branchName}`);
        } else {
            log('Note: Branch transfer may require gh pmu --branch support.');
            log(`Manual: gh pmu move ${issueNumber} --branch "${branchName}"`);
        }
        return;
    }

    // No action specified - show transfer options
    log('--- Transfer Options ---');
    const branches = getOpenBranches(execFn);
    if (branches.length > 0) {
        log('\nAvailable branches:');
        branches.forEach(b => {
            const name = b.name || b.version || b;
            const marker = currentBranch === name ? ' ← current' : '';
            log(`  - ${name}${marker}`);
        });
    }

    log('\nTo transfer:');
    log(`  /transfer-issue #${issueNumber} --branch <branch>`);
    log(`  /transfer-issue #${issueNumber} --remove-branch`);
}

function main() {
    run(process.argv.slice(2));
}

// #2615: guarded so requiring this module does not perform or print
// issue-transfer work.
if (require.main === module) {
    main();
}

module.exports = {
    getIssueDetails,
    getOpenBranches,
    parseArgs,
    resolveBranchName,
    run
};
