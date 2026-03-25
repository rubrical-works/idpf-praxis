#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.73.0
 * @description Poll GitHub Actions workflow status with timeout. Monitors workflow runs by commit SHA with 60-second polling intervals and 5-minute default timeout. Returns structured JSON with run status, conclusion, and URL. Used by /prepare-release CI gate.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const { execSync } = require('child_process');

const TIMEOUT = 300000; // 5 minutes
const POLL_INTERVAL = 60000; // 60 seconds

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    const startTime = Date.now();

    try {
        while (Date.now() - startTime < TIMEOUT) {
            const runsJson = execSync('gh run list --limit 5 --json databaseId,status,conclusion', {
                encoding: 'utf8'
            });

            const runs = JSON.parse(runsJson);
            const latestRun = runs[0];

            if (latestRun && latestRun.status === 'completed') {
                if (latestRun.conclusion === 'success') {
                    console.log(JSON.stringify({
                        success: true,
                        message: 'CI workflow completed successfully',
                        data: { runId: latestRun.databaseId }
                    }));
                    return;
                }
                console.log(JSON.stringify({
                    success: false,
                    message: `CI workflow failed: ${latestRun.conclusion}`,
                    data: { runId: latestRun.databaseId, conclusion: latestRun.conclusion }
                }));
                process.exit(1);
            }

            const elapsed = Math.round((Date.now() - startTime) / 1000);
            console.error(`Waiting for CI... (${elapsed}s)`);
            await sleep(POLL_INTERVAL);
        }

        console.log(JSON.stringify({
            success: false,
            message: 'CI workflow did not complete in time',
            data: { status: 'timeout', timeoutMs: TIMEOUT }
        }));
        process.exit(1);

    } catch (err) {
        console.log(JSON.stringify({
            success: false,
            message: `CI check failed: ${err.message}`
        }));
        process.exit(1);
    }
}

main();
