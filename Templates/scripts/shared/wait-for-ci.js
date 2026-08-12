#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.96.2
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
const GH_CALL_TIMEOUT = 30000;    // 30s per gh call — a hung call must not eat the budget
const MAX_FETCH_ATTEMPTS = 3;     // consecutive gh failures before aborting

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

// --- Argument Parsing ---

/**
 * Parse the CLI arguments the /work rule and release flows actually pass.
 * Previously main() never read process.argv at all, so `--branch` and
 * `--timeout` were silently discarded and the gate inspected whatever run was
 * newest repo-wide (#2464).
 *
 * Accepts both `--flag value` and `--flag=value`. Unknown arguments are an
 * error rather than a no-op, so a future spec/script drift surfaces loudly.
 *
 * @param {string[]} argv - Arguments after the node/script pair
 * @returns {{ok: true, branch: string|null, commit: string|null, timeoutMs: number}
 *          |{ok: false, error: string}}
 */
function parseArgs(argv) {
    const result = { ok: true, branch: null, commit: null, timeoutMs: DEFAULT_TIMEOUT };
    let timeoutSeen = null;

    for (let i = 0; i < argv.length; i++) {
        const token = argv[i];
        let name = token;
        let value = null;

        const eq = token.indexOf('=');
        if (token.startsWith('--') && eq !== -1) {
            name = token.slice(0, eq);
            value = token.slice(eq + 1);
        }

        if (name !== '--branch' && name !== '--commit' && name !== '--sha' && name !== '--timeout') {
            return { ok: false, error: `Unknown argument: ${token}` };
        }

        if (value === null) {
            value = argv[i + 1];
            i++;
        }

        if (value === undefined || value === '' || String(value).startsWith('--')) {
            return { ok: false, error: `Missing value for ${name}` };
        }

        if (name === '--branch') {
            result.branch = value;
        } else if (name === '--commit' || name === '--sha') {
            result.commit = value;
        } else {
            timeoutSeen = value;
        }
    }

    if (timeoutSeen !== null) {
        // Seconds on the wire (the /work rule passes --timeout 300), ms internally.
        const seconds = Number(timeoutSeen);
        if (!Number.isFinite(seconds) || seconds <= 0) {
            return { ok: false, error: `Invalid --timeout value: ${timeoutSeen}` };
        }
        result.timeoutMs = Math.min(seconds * 1000, MAX_CAP);
    }

    return result;
}

/**
 * Reject a branch name or SHA that could break out of its double quotes in the
 * gh command line. Branch names legitimately contain `/`, `.`, `_` and `-`.
 * @param {string} value
 * @param {string} label
 * @returns {string} the validated value
 * @throws {Error} when the value carries shell metacharacters
 */
function assertShellSafe(value, label) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9._\-/]+$/.test(value)) {
        throw new Error(`Unsafe ${label}: ${String(value).substring(0, 40)}`);
    }
    return value;
}

/**
 * Build the `gh run list` command for the requested scope. headBranch/headSha
 * are requested so selectRun() can re-check what gh returned rather than
 * trusting the filter blindly.
 * @param {{branch: string|null, commit: string|null, limit?: number}} opts
 * @returns {string}
 */
function buildRunListCommand({ branch, commit, limit = 10 }) {
    let cmd = `gh run list --limit ${Number(limit)}`;
    if (branch) {
        cmd += ` --branch "${assertShellSafe(branch, 'branch name')}"`;
    }
    if (commit) {
        cmd += ` --commit "${assertShellSafe(commit, 'commit sha')}"`;
    }
    cmd += ' --json databaseId,status,conclusion,name,headBranch,headSha';
    return cmd;
}

/**
 * Whether a single run is in the requested scope. gh is asked to filter, but
 * the returned rows are re-checked so a gh version that ignores a flag cannot
 * silently reintroduce the original bug.
 * @param {object} run
 * @param {{branch: string|null, commit: string|null}} filter
 * @returns {boolean}
 */
function matchesFilter(run, { branch, commit }) {
    if (branch && run.headBranch !== branch) return false;
    if (commit && run.headSha !== commit) return false;
    return true;
}

/**
 * Pick the run the verdict should be keyed to.
 * @param {Array<object>} runs
 * @param {{branch: string|null, commit: string|null}} filter
 * @returns {object|null} the newest matching run, or null when none match
 */
function selectRun(runs, filter) {
    if (!runs || runs.length === 0) {
        return null;
    }

    return runs.find(r => matchesFilter(r, filter)) || null;
}

// --- Main ---

/**
 * Run the CI gate and return an exit code.
 * @param {string[]} argv - Arguments after the node/script pair
 * @param {object} [deps] - Injectable boundaries: `fetchRuns(cmd)` and `sleep(ms)`
 * @returns {Promise<number>} process exit code
 */
async function run(argv = [], deps = {}) {
    const fetchRuns = deps.fetchRuns || defaultFetchRuns;
    const wait = deps.sleep || sleep;

    const parsed = parseArgs(argv);
    if (!parsed.ok) {
        console.log(JSON.stringify({
            success: false,
            message: parsed.error,
            data: { status: 'bad_arguments' }
        }));
        return EXIT_CODES.FAILURE;
    }

    const filter = { branch: parsed.branch, commit: parsed.commit };
    const startTime = Date.now();
    let timeout = parsed.timeoutMs;

    try {
        const command = buildRunListCommand(filter);
        let consecutiveFailures = 0;

        while (true) {
            const elapsed = Date.now() - startTime;

            // A timed-out or transiently-failing gh call must not fail the gate
            // outright — but it must not retry forever either (#2464).
            let runs;
            try {
                runs = await fetchRuns(command);
                consecutiveFailures = 0;
            } catch (fetchErr) {
                consecutiveFailures++;
                if (consecutiveFailures >= MAX_FETCH_ATTEMPTS) {
                    console.log(JSON.stringify({
                        success: false,
                        message: `CI check failed: gh unavailable after ${consecutiveFailures} attempts (${fetchErr.message})`,
                        data: { status: 'gh_unavailable', attempts: consecutiveFailures }
                    }));
                    return EXIT_CODES.FAILURE;
                }
                console.error(`gh call failed (${fetchErr.message}) — retry ${consecutiveFailures}/${MAX_FETCH_ATTEMPTS}`);
                await wait(POLL_INTERVAL);
                continue;
            }

            const target = selectRun(runs, filter);

            if (!target) {
                const scope = parsed.branch || parsed.commit
                    ? ` for ${parsed.commit ? `commit ${parsed.commit}` : `branch ${parsed.branch}`}`
                    : '';
                console.log(JSON.stringify({
                    success: false,
                    message: `No CI runs found${scope}`,
                    data: { status: 'no_runs', branch: parsed.branch, commit: parsed.commit }
                }));
                return EXIT_CODES.NO_RUNS;
            }

            if (target.status === 'completed') {
                if (target.conclusion === 'success') {
                    console.log(JSON.stringify({
                        success: true,
                        message: 'CI workflow completed successfully',
                        data: { runId: target.databaseId, branch: target.headBranch, sha: target.headSha }
                    }));
                    return EXIT_CODES.SUCCESS;
                }
                console.log(JSON.stringify({
                    success: false,
                    message: `CI workflow failed: ${target.conclusion}`,
                    data: {
                        runId: target.databaseId,
                        conclusion: target.conclusion,
                        branch: target.headBranch,
                        sha: target.headSha
                    }
                }));
                return EXIT_CODES.FAILURE;
            }

            // Check if we've exceeded current timeout
            if (elapsed >= timeout) {
                // Check for running jobs before giving up — scoped to the runs
                // that matched the filter, not everything gh returned.
                const { hasRunning, runningJobs } = checkRunningJobs(
                    runs.filter(r => matchesFilter(r, filter))
                );
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
                    return EXIT_CODES.TIMEOUT_RUNNING;
                } else {
                    // No jobs running — standard timeout
                    console.log(JSON.stringify({
                        success: false,
                        message: 'CI workflow did not complete in time',
                        data: { status: 'timeout', timeoutMs: timeout }
                    }));
                    return EXIT_CODES.TIMEOUT;
                }
            }

            const elapsedSec = Math.round(elapsed / 1000);
            console.error(`Waiting for CI... (${elapsedSec}s)`);
            await wait(POLL_INTERVAL);
        }

    } catch (err) {
        console.log(JSON.stringify({
            success: false,
            message: `CI check failed: ${err.message}`
        }));
        return EXIT_CODES.FAILURE;
    }
}

/**
 * Default polling boundary — shells out to gh and parses the JSON rows.
 *
 * The timeout is the point: without it a hung gh call blocks the event loop
 * indefinitely and the adaptive-timeout logic — which only runs *between*
 * polls — can never fire, making the 5/10-minute contract unenforceable
 * (#2464).
 *
 * @param {string} command
 * @param {object} [deps] - `execSync` override for tests
 * @returns {Array<object>}
 */
function defaultFetchRuns(command, deps = {}) {
    const exec = deps.execSync || execSync;
    const runsJson = exec(command, { encoding: 'utf8', timeout: GH_CALL_TIMEOUT });
    return JSON.parse(runsJson);
}

// --- Module Guard ---

if (require.main === module) {
    run(process.argv.slice(2)).then(code => process.exit(code));
}

// --- Exports (for testing) ---

module.exports = {
    run,
    parseArgs,
    buildRunListCommand,
    selectRun,
    matchesFilter,
    defaultFetchRuns,
    checkRunningJobs,
    getAdaptiveTimeout,
    EXIT_CODES,
    DEFAULT_TIMEOUT,
    POLL_INTERVAL,
    EXTENSION_MS,
    MAX_CAP,
    GH_CALL_TIMEOUT,
    MAX_FETCH_ATTEMPTS
};
