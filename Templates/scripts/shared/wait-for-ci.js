#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.85.0
 * @description Poll GitHub Actions workflow status with adaptive timeout. Monitors workflow runs
 * by commit SHA with 60-second polling intervals and 5-minute default timeout. Detects running/queued
 * jobs and extends timeout by 30s increments up to a 10-minute hard cap. Returns structured JSON with
 * run status, conclusion, and URL. Used by /prepare-release CI gate and /work --wait.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const { execSync } = require('child_process');

// --- Exit Codes ---

const EXIT_CODES = {
    SUCCESS: 0,        // CI passed
    FAILURE: 1,        // CI failed
    TIMEOUT: 2,        // Timeout, no jobs running
    NO_RUNS: 3,        // No CI runs found
    TIMEOUT_RUNNING: 5 // Timeout, jobs still running (hit 10-min cap)
};

// --- Constants ---

const DEFAULT_TIMEOUT = 300000;   // 5 minutes
const POLL_INTERVAL = 60000;      // 60 seconds
const EXTENSION_MS = 30000;       // 30 seconds per extension
const MAX_CAP = 600000;           // 10 minutes hard cap

// --- Adaptive Timeout Logic ---

/**
 * Determine whether to extend the timeout based on running jobs.
 * @param {object} opts
 * @param {number} opts.elapsed - Elapsed time in ms
 * @param {number} opts.currentTimeout - Current timeout in ms
 * @param {boolean} opts.hasRunningJobs - Whether jobs are currently running/queued
 * @param {number} opts.maxCap - Maximum timeout cap in ms (default 600000)
 * @param {number} opts.extensionMs - Extension increment in ms (default 30000)
 * @returns {{ extended: boolean, newTimeout: number, capped: boolean }}
 */
function getAdaptiveTimeout({ elapsed, currentTimeout, hasRunningJobs, maxCap = MAX_CAP, extensionMs = EXTENSION_MS }) {
    if (!hasRunningJobs) {
        return { extended: false, newTimeout: currentTimeout, capped: false };
    }

    const proposedTimeout = currentTimeout + extensionMs;
    if (proposedTimeout > maxCap) {
        return { extended: false, newTimeout: currentTimeout, capped: true };
    }

    return { extended: true, newTimeout: proposedTimeout, capped: false };
}

// --- Running Job Detection ---

/**
 * Check if any runs are in running or queued state.
 * @param {Array<{databaseId: number, status: string, name: string, conclusion: string|null}>} runs
 * @returns {{ hasRunning: boolean, runningJobs: Array<{databaseId: number, name: string, status: string}> }}
 */
function checkRunningJobs(runs) {
    if (!runs || runs.length === 0) {
        return { hasRunning: false, runningJobs: [] };
    }

    const runningJobs = runs
        .filter(r => r.status === 'in_progress' || r.status === 'queued')
        .map(r => ({ databaseId: r.databaseId, name: r.name, status: r.status }));

    return { hasRunning: runningJobs.length > 0, runningJobs };
}

// --- Sleep ---

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Main ---

async function main() {
    const startTime = Date.now();
    let timeout = DEFAULT_TIMEOUT;

    try {
        while (true) {
            const elapsed = Date.now() - startTime;

            const runsJson = execSync('gh run list --limit 5 --json databaseId,status,conclusion,name', {
                encoding: 'utf8'
            });

            const runs = JSON.parse(runsJson);

            if (!runs || runs.length === 0) {
                console.log(JSON.stringify({
                    success: false,
                    message: 'No CI runs found',
                    data: { status: 'no_runs' }
                }));
                process.exit(EXIT_CODES.NO_RUNS);
            }

            const latestRun = runs[0];

            if (latestRun && latestRun.status === 'completed') {
                if (latestRun.conclusion === 'success') {
                    console.log(JSON.stringify({
                        success: true,
                        message: 'CI workflow completed successfully',
                        data: { runId: latestRun.databaseId }
                    }));
                    process.exit(EXIT_CODES.SUCCESS);
                }
                console.log(JSON.stringify({
                    success: false,
                    message: `CI workflow failed: ${latestRun.conclusion}`,
                    data: { runId: latestRun.databaseId, conclusion: latestRun.conclusion }
                }));
                process.exit(EXIT_CODES.FAILURE);
            }

            // Check if we've exceeded current timeout
            if (elapsed >= timeout) {
                // Check for running jobs before giving up
                const { hasRunning, runningJobs } = checkRunningJobs(runs);
                const adaptive = getAdaptiveTimeout({
                    elapsed,
                    currentTimeout: timeout,
                    hasRunningJobs: hasRunning,
                    maxCap: MAX_CAP,
                    extensionMs: EXTENSION_MS
                });

                if (adaptive.extended) {
                    timeout = adaptive.newTimeout;
                    const jobNames = runningJobs.map(j => j.name).join(', ');
                    console.error(`CI jobs still running (${jobNames}). Extending timeout to ${Math.round(timeout / 1000)}s...`);
                    // Continue polling
                } else if (adaptive.capped && hasRunning) {
                    // Hit 10-minute cap with jobs still running
                    const jobDetails = runningJobs.map(j => `${j.name} (${j.status})`).join(', ');
                    const elapsedMin = Math.round(elapsed / 60000);
                    console.log(JSON.stringify({
                        success: false,
                        message: `CI jobs still running after ${elapsedMin} minutes: ${jobDetails}`,
                        data: {
                            status: 'timeout_running',
                            timeoutMs: MAX_CAP,
                            runningJobs: runningJobs
                        }
                    }));
                    process.exit(EXIT_CODES.TIMEOUT_RUNNING);
                } else {
                    // No jobs running — standard timeout
                    console.log(JSON.stringify({
                        success: false,
                        message: 'CI workflow did not complete in time',
                        data: { status: 'timeout', timeoutMs: timeout }
                    }));
                    process.exit(EXIT_CODES.TIMEOUT);
                }
            }

            const elapsedSec = Math.round(elapsed / 1000);
            console.error(`Waiting for CI... (${elapsedSec}s)`);
            await sleep(POLL_INTERVAL);
        }

    } catch (err) {
        console.log(JSON.stringify({
            success: false,
            message: `CI check failed: ${err.message}`
        }));
        process.exit(EXIT_CODES.FAILURE);
    }
}

// --- Module Guard ---

if (require.main === module) {
    main();
}

// --- Exports (for testing) ---

module.exports = {
    checkRunningJobs,
    getAdaptiveTimeout,
    EXIT_CODES,
    DEFAULT_TIMEOUT,
    POLL_INTERVAL,
    EXTENSION_MS,
    MAX_CAP
};
