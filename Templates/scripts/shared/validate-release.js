#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.67.1
 * @description UserPromptSubmit hook that enforces branch-gated work requirements. Blocks 'work #N' commands when the target issue lacks branch assignment and provides branch context awareness for branch-aware workflows. Registered as a Claude Code hook.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const { execSync } = require('child_process');

let input = '';

process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
    try {
        const data = JSON.parse(input);
        const prompt = (data.prompt || '').trim();

        // Match "work #N" or "work N" pattern
        const match = prompt.match(/^work\s+#?(\d+)/i);

        if (!match) {
            // Not a work command, allow
            process.exit(0);
        }

        const issueNumber = match[1];

        try {
            // Query issue's Branch field via gh pmu view
            const result = execSync(
                `gh pmu view ${issueNumber} --json=fieldValues`,
                { encoding: 'utf-8', timeout: 10000 }
            );

            const issueData = JSON.parse(result);
            const branch = issueData.fieldValues?.Branch;

            if (!branch || branch === '' || branch === 'null') {
                // No branch assigned - block with actionable message
                const output = {
                    decision: 'block',
                    reason: `Issue #${issueNumber} has no branch assignment.\n\nUse: /assign-branch #${issueNumber} release/vX.Y.Z\n\nOr use: gh pmu move ${issueNumber} --branch "release/vX.Y.Z"`
                };
                console.log(JSON.stringify(output));
                process.exit(0);
            }

            // Branch assigned - allow and provide branch context
            // Derive branch name (e.g., "v2.0.0" -> "release/v2.0.0")
            const branchName = branch.startsWith('release/') || branch.startsWith('patch/')
                ? branch
                : `release/${branch}`;

            let contextMessage = `[BRANCH-AWARE WORK]\n`;
            contextMessage += `Issue #${issueNumber} is assigned to branch: ${branch}\n`;
            contextMessage += `\nBEFORE working on this issue:\n`;
            contextMessage += `1. Check current branch: git branch --show-current\n`;
            contextMessage += `2. If not on '${branchName}', switch to it: git checkout ${branchName}\n`;
            contextMessage += `3. NEVER commit directly to main branch\n`;

            const output = {
                decision: 'allow',
                reason: `Issue #${issueNumber} assigned to branch: ${branch}`,
                hookSpecificOutput: {
                    hookEventName: 'UserPromptSubmit',
                    additionalContext: contextMessage
                }
            };
            console.log(JSON.stringify(output));
            process.exit(0);

        } catch (_error) {
            // Error checking - allow and let downstream handle (fail-open per AC-003.5)
            const output = {
                decision: 'allow',
                reason: `Could not verify branch assignment for #${issueNumber} (fail-open)`
            };
            console.log(JSON.stringify(output));
            process.exit(0);
        }

    } catch (_e) {
        // JSON parse error or other issue - allow (fail-open)
        process.exit(0);
    }
});
