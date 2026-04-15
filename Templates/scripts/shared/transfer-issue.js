#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.87.0
 * @description Transfer an issue between branches or remove it from branch assignment. Validates source and target branches, updates gh pmu branch field, and reports the transfer. Used by /transfer-issue command.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const { execFileSync } = require('child_process');
const { validateIssueNumber, validateBranchName } = require('./lib/input-validation.js');

function exec(cmd) {
    try {
        const parts = cmd.split(/\s+/);
        return execFileSync(parts[0], parts.slice(1), { encoding: 'utf-8' }).trim();
    } catch (_e) {
        return null;
    }
}

function getIssueDetails(issueNumber) {
    try {
        const result = exec(`gh pmu view ${issueNumber} --json=fieldValues`);
        if (result) {
            return JSON.parse(result);
        }
    } catch {
        // Intentionally ignored
    }
    return null;
}

function getOpenBranches() {
    try {
        // Note: gh pmu branch list has no JSON support, parse text output
        // Format: "VERSION      CODENAME        TRACKER    STATUS"
        const result = exec('gh pmu branch list');
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

function main() {
    const args = process.argv.slice(2);

    // Parse arguments
    const issueArg = args.find(a => a.match(/^#?\d+$/));
    const issueNumber = issueArg ? validateIssueNumber(issueArg.replace('#', '')) : null;

    const newBranch = args.find((a, i) => args[i - 1] === '--branch');
    const removeFromBranch = args.includes('--remove-branch');

    console.log('=== Transfer Issue ===\n');

    if (!issueNumber) {
        console.log('Usage: /transfer-issue #123 [options]');
        console.log('\nOptions:');
        console.log('  --branch <name>     Transfer to different branch');
        console.log('  --remove-branch     Remove from current branch (back to backlog)');
        return;
    }

    // Get current issue details
    const issue = getIssueDetails(issueNumber);
    if (!issue) {
        console.log(`Issue #${issueNumber} not found or error fetching.`);
        return;
    }

    const currentBranch = issue.fieldValues?.Branch || '(none)';

    console.log(`Issue #${issueNumber}: ${issue.title}`);
    console.log(`Current branch: ${currentBranch}`);
    console.log('');

    // Handle actions
    if (removeFromBranch) {
        console.log('Removing from branch...');
        // gh pmu may not support removing branch field directly
        // This would need to be implemented in gh pmu
        console.log('Note: Use gh pmu move to update branch assignment.');
        console.log('Example: gh pmu move ' + issueNumber + ' --branch ""');
        return;
    }

    if (newBranch) {
        console.log(`Transferring to branch: ${newBranch}...`);
        validateBranchName(newBranch);
        const branchName = newBranch.startsWith('release/') || newBranch.startsWith('patch/')
            ? newBranch
            : `release/${newBranch}`;
        const result = exec(`gh pmu move ${issueNumber} --branch ${branchName}`);
        if (result !== null) {
            console.log(`✓ Issue #${issueNumber} transferred to ${branchName}`);
        } else {
            console.log('Note: Branch transfer may require gh pmu --branch support.');
            console.log(`Manual: gh pmu move ${issueNumber} --branch "${branchName}"`);
        }
        return;
    }

    // No action specified - show transfer options
    console.log('--- Transfer Options ---');
    const branches = getOpenBranches();
    if (branches.length > 0) {
        console.log('\nAvailable branches:');
        branches.forEach(b => {
            const name = b.name || b.version || b;
            const marker = currentBranch === name ? ' ← current' : '';
            console.log(`  - ${name}${marker}`);
        });
    }

    console.log('\nTo transfer:');
    console.log(`  /transfer-issue #${issueNumber} --branch release/vX.Y.Z`);
    console.log(`  /transfer-issue #${issueNumber} --remove-branch`);
}

main();
