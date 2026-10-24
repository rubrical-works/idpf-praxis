#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.111.0
 * @description Poll GitHub Actions workflow status with adaptive timeout. Monitors workflow runs
 * by commit SHA with 15-second polling intervals and 5-minute default timeout. Detects running/queued
 * jobs and extends timeout by 30s increments up to a 15-minute hard cap. Returns structured JSON with
 * run status, conclusion, and URL. Used by /prepare-release CI gate and /work --wait.
 *
 * Before declaring NO_RUNS it waits out a registration window: GitHub registers a
 * push- or tag-triggered run a few seconds after the push, so an empty first poll
 * is re-polled every 15s for up to 90s, and a run appearing inside the window is
 * gated on (#2952). The no_runs payload reports how long it waited.
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
    TIMEOUT_RUNNING: 5 // Timeout, jobs still running (hit 15-min cap)
};

// --- Constants ---

const DEFAULT_TIMEOUT = 300000;   // 5 minutes
const POLL_INTERVAL = 15000;      // 15 seconds — a finished run is noticed within 15s (#2952)
// Registration window (#2952). An empty poll right after a push is usually a
// run GitHub has not registered yet, not a run that will never exist, so the
// gate re-polls before concluding NO_RUNS. Counted in time slept, not wall
// clock, so the bound holds however long each gh call takes.
const REGISTRATION_INTERVAL = 15000; // 15 seconds between empty polls
const REGISTRATION_WINDOW = 90000;   // give up after 90 seconds with no run
const EXTENSION_MS = 30000;       // 30 seconds per extension
const MAX_CAP = 900000;           // 15 minutes hard cap (#3022: the release waits request 900s)
const GH_CALL_TIMEOUT = 30000;    // 30s per gh call — a hung call must not eat the budget
const MAX_FETCH_ATTEMPTS = 3;     // consecutive gh failures before aborting

// --- Adaptive Timeout Logic ---

/**
 * Determine whether to extend the timeout based on running jobs.
 * @param {object} opts
 * @param {number} opts.elapsed - Elapsed time in ms
 * @param {number} opts.currentTimeout - Current timeout in ms
 * @param {boolean} opts.hasRunningJobs - Whether jobs are currently running/queued
 * @param {number} opts.maxCap - Maximum timeout cap in ms (default 900000)
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
 * A --timeout above MAX_CAP is clamped and the clamp is reported (#3022):
 * `requestedTimeoutMs`, `clamped` and `clampWarning` say what was asked for,
 * and run() writes the warning to stderr. A silent clamp let three release
 * specs describe a 15-minute budget the script never granted.
 *
 * @returns {{ok: true, branch: string|null, commit: string|null, timeoutMs: number,
 *           requestedTimeoutMs: number|null, clamped: boolean, clampWarning: string|null}
 *          |{ok: false, error: string}}
 */
function parseArgs(argv) {
    const result = { ok: true, branch: null, commit: null, timeoutMs: DEFAULT_TIMEOUT, requestedTimeoutMs: null, clamped: false, clampWarning: null };
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
        result.requestedTimeoutMs = seconds * 1000;
        result.timeoutMs = Math.min(result.requestedTimeoutMs, MAX_CAP);
        result.clamped = result.requestedTimeoutMs > MAX_CAP;
        if (result.clamped) {
            result.clampWarning = `--timeout ${seconds}s exceeds the ${MAX_CAP / 1000}s cap; waiting at most ${MAX_CAP / 1000}s.`;
        }
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
 * Expand an abbreviated `--commit`/`--sha` to the full SHA (#3165).
 *
 * `gh run list --commit` matches only a full SHA, and matchesFilter() compares
 * against GitHub's 40-character headSha, so a short value matched nothing and
 * the script exited NO_RUNS — which the rule reads as "continue". A 40-hex
 * value is returned untouched with no lookup, so a SHA absent from the local
 * object store keeps working; a shorter hex value goes through git; anything
 * else, or a value git cannot resolve, throws.
 *
 * @param {string} value
 * @param {object} [deps] - `execSync` override for tests
 * @returns {string} the full 40-character SHA
 * @throws {Error} naming the value when it cannot be resolved
 */
function resolveCommit(value, deps = {}) {
    if (/^[0-9a-f]{40}$/i.test(value)) return value;
    if (!/^[0-9a-f]{4,39}$/i.test(value)) {
        throw new Error(`--commit/--sha value "${value}" is not a commit SHA.`);
    }
    const exec = deps.execSync || execSync;
    let out;
    try {
        out = String(exec(`git rev-parse --verify "${value}^{commit}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).trim();
    } catch {
        throw new Error(`--commit/--sha value "${value}" does not resolve to a commit in this repository.`);
    }
    if (!/^[0-9a-f]{40}$/i.test(out)) {
        throw new Error(`--commit/--sha value "${value}" does not resolve to a commit in this repository.`);
    }
    return out;
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
 * Build the `gh run view` command that re-checks a tracked run by id (#3241).
 * Same fields as the listing, so the verdict code reads either shape.
 * @param {number|string} runId
 * @returns {string}
 * @throws {Error} when the id is not a plain positive integer
 */
function buildRunViewCommand(runId) {
    if (!/^[0-9]+$/.test(String(runId))) {
        throw new Error(`Unsafe run id: ${String(runId).substring(0, 40)}`);
    }
    return `gh run view ${runId} --json databaseId,status,conclusion,name,headBranch,headSha`;
}

/**
 * Whether the tracked run must be re-checked instead of trusting this poll's
 * selection (#3241).
 *
 * The branch-filtered listing is not stable right after a run is created: a
 * run the gate was already waiting on can drop out of it, leaving nothing,
 * only non-executing runs, or only some other completed run (a cancelled one
 * is still a candidate). None of those may decide the verdict while the
 * tracked run's own state is unknown. A different run still in flight is a
 * real newer target, so the gate follows it — the original in-flight rule.
 *
 * @param {object|null} target - this poll's selectRun() result
 * @param {number|null} trackedRunId
 * @returns {boolean}
 */
function needsTrackedRecheck(target, trackedRunId) {
    if (trackedRunId === null) return false;
    if (!target) return true;
    return target.databaseId !== trackedRunId && target.status === 'completed';
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
 * Conclusions meaning the workflow never executed (#2627).
 *
 * GitHub reports these on runs that were created and then did nothing — a
 * `pull_request_target` workflow whose job-level conditions excluded it, for
 * instance. Such a run carries no information about the tree, so it must not
 * supply the verdict.
 *
 * `cancelled` is deliberately NOT here. A cancelled run did start, and the
 * push/pull_request concurrency dedup (#2571) cancels on purpose — that is a
 * real signal about a real run, and a different question from this one.
 */
const NON_EXECUTING_CONCLUSIONS = new Set(['skipped', 'neutral']);

/**
 * Whether a run completed without ever executing.
 * @param {object} run
 * @returns {boolean}
 */
function isNonExecuting(run) {
    return run.status === 'completed' && NON_EXECUTING_CONCLUSIONS.has(run.conclusion);
}

/**
 * Pick the run the verdict should be keyed to.
 *
 * Runs that never executed are not candidates (#2627). Before this, the newest
 * matching run won outright: a Dependabot labeler that concluded `skipped` in
 * seconds displaced an `in_progress` `Tests` run and the gate exited 1 —
 * "CI workflow failed: skipped" — on a tree it had not examined.
 *
 * This narrows the candidate set a second time. #2464 narrowed it from
 * repo-wide to branch-scoped; branch scoping decides WHICH BRANCH answers and
 * cannot decide WHICH WORKFLOW answers, which is why that fix did not prevent
 * this one.
 *
 * @param {Array<object>} runs
 * @param {{branch: string|null, commit: string|null}} filter
 * @returns {object|null} the newest matching run that executed, or null
 */
function selectRun(runs, filter) {
    if (!runs || runs.length === 0) {
        return null;
    }

    const candidates = runs.filter(r => matchesFilter(r, filter) && !isNonExecuting(r));
    if (candidates.length === 0) {
        return null;
    }

    // A run still in flight outranks a completed one, regardless of age.
    //
    // Dropping the skipped run alone is NOT enough, and gets this exact
    // incident wrong in the opposite direction: on the observed four-run SHA
    // (skipped / success / in_progress / success) the next-newest candidate is
    // a green Semgrep, so the gate would exit 0 — reporting a PASS while the
    // real Tests run was still executing. That trades a spurious halt for a
    // spurious pass on the release merge gate, which is worse.
    //
    // Waiting is always safe here: the caller polls until the selected run
    // completes or the timeout fires, and both outcomes already have codes.
    // Same defect class as #2541, where a sibling gate drew its verdict from
    // the wrong run set and reported success while another workflow failed.
    const inFlight = candidates.find(r => r.status !== 'completed');
    return inFlight || candidates[0];
}

/**
 * The verdict for one commit: every executed run on it, not the one run
 * selectRun() keyed to (#3046).
 *
 * With every run complete, selectRun() returns the newest listed run, so a
 * green Semgrep listed above a red Tests on the same SHA passed the gate. The
 * group is the runs sharing `target`'s headSha — by default the newest
 * candidate's — so an older commit on the branch never fails a newer one.
 * Non-executing runs are excluded exactly as in selectRun() (#2627). Same
 * aggregation as verify-dist-deploy.js (#2552).
 *
 * @param {Array<object>} runs
 * @param {{branch: string|null, commit: string|null}} filter
 * @param {object} [target] - the run being tracked; defaults to selectRun()
 * @returns {{state: 'none'|'waiting'|'pass'|'fail', run: object|null, sha: string|null, failing: Array<object>}}
 */
function decideVerdict(runs, filter, target = selectRun(runs, filter)) {
    if (!target) return { state: 'none', run: null, sha: null, failing: [] };
    const group = (runs || []).filter(r =>
        matchesFilter(r, filter) && !isNonExecuting(r) && r.headSha === target.headSha);
    if (!group.some(r => r.databaseId === target.databaseId)) group.push(target);

    const inFlight = group.find(r => r.status !== 'completed');
    if (inFlight) return { state: 'waiting', run: inFlight, sha: target.headSha, failing: [] };

    // A cancelled run is superseded when another run of the same workflow on
    // this commit ran to a conclusion: that is the push/pull_request dedup
    // (#2571) cancelling a duplicate on purpose, not a failure of the tree.
    const superseded = (r) => r.conclusion === 'cancelled'
        && group.some(o => o !== r && o.name === r.name && o.conclusion !== 'cancelled');
    const failing = group.filter(r => r.conclusion !== 'success' && !superseded(r));
    return { state: failing.length ? 'fail' : 'pass', run: target, sha: target.headSha, failing };
}

// --- Main ---

/**
 * Run the CI gate and return an exit code.
 * @param {string[]} argv - Arguments after the node/script pair
 * @param {object} [deps] - Injectable boundaries: `fetchRuns(cmd)` and `sleep(ms)`
 * @returns {Promise<number>} process exit code
 */
/**
 * The exit-code contract, beside the code that implements it (#2765).
 *
 * The /work rule used to enumerate these five codes and their gate actions
 * in prose, where they could drift from EXIT_CODES without anything failing.
 * Mirrors work-preamble.js --schema: mutually exclusive with every other
 * argument, prints JSON, exits 0.
 */
function schema() {
    return {
        script: 'wait-for-ci.js',
        arguments: ['--branch <name>', '--commit <sha> | --sha <sha>', '--timeout <seconds>', '--schema'],
        exitCodes: [
            { code: EXIT_CODES.SUCCESS,         name: 'SUCCESS',         meaning: 'CI passed for the selected run.',                                                    ruleAction: 'continue' },
            { code: EXIT_CODES.FAILURE,         name: 'FAILURE',         meaning: 'CI failed, bad arguments, or gh unavailable after retries.',                          ruleAction: 'STOP' },
            { code: EXIT_CODES.TIMEOUT,         name: 'TIMEOUT',         meaning: 'Timeout with no jobs running.',                                                       ruleAction: 'STOP' },
            { code: EXIT_CODES.NO_RUNS,         name: 'NO_RUNS',         meaning: `No CI runs found for this branch/commit after a ${REGISTRATION_WINDOW / 1000}s registration window (re-polled every ${REGISTRATION_INTERVAL / 1000}s), or every matching run was non-executing.`, ruleAction: 'continue' },
            { code: EXIT_CODES.TIMEOUT_RUNNING, name: 'TIMEOUT_RUNNING', meaning: 'Timeout with jobs still running at the 15-minute cap; re-run --wait or check the run.', ruleAction: 'STOP' }
        ]
    };
}

async function run(argv = [], deps = {}) {
    const fetchRuns = deps.fetchRuns || defaultFetchRuns;
    const fetchRun = deps.fetchRun || defaultFetchRun;
    const wait = deps.sleep || sleep;

    if (argv.includes('--schema')) {
        if (argv.some(a => a !== '--schema')) {
            console.log(JSON.stringify({
                success: false,
                message: '--schema cannot be combined with other arguments.',
                data: { status: 'bad_arguments' }
            }));
            return EXIT_CODES.FAILURE;
        }
        console.log(JSON.stringify(schema(), null, 2));
        return EXIT_CODES.SUCCESS;
    }

    const parsed = parseArgs(argv);
    if (!parsed.ok) {
        console.log(JSON.stringify({
            success: false,
            message: parsed.error,
            data: { status: 'bad_arguments' }
        }));
        return EXIT_CODES.FAILURE;
    }

    if (parsed.commit) {
        try {
            parsed.commit = resolveCommit(parsed.commit, deps);
        } catch (e) {
            console.log(JSON.stringify({
                success: false,
                message: e.message,
                data: { status: 'bad_arguments' }
            }));
            return EXIT_CODES.FAILURE;
        }
    }

    if (parsed.clamped) {
        console.error(`Warning: ${parsed.clampWarning}`);
    }

    const filter = { branch: parsed.branch, commit: parsed.commit };
    const startTime = Date.now();
    let timeout = parsed.timeoutMs;

    try {
        const command = buildRunListCommand(filter);
        let consecutiveFailures = 0;
        let registrationWaited = 0;
        // Held from the first successful selection on (#3241): once the gate
        // is waiting on a run, that run's own state decides the verdict even
        // if the branch listing later stops returning it.
        let trackedRunId = null;

        while (true) {
            const elapsed = Date.now() - startTime;

            // A timed-out or transiently-failing gh call must not fail the gate
            // outright — but it must not retry forever either (#2464).
            let runs;
            let target;
            try {
                runs = await fetchRuns(command);
                target = selectRun(runs, filter);
                if (needsTrackedRecheck(target, trackedRunId)) {
                    const listed = (runs || []).find(r => r.databaseId === trackedRunId);
                    target = listed || await fetchRun(trackedRunId);
                }
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

            if (target) {
                trackedRunId = target.databaseId;
            }

            // Reached only while no run has ever been tracked: a tracked run
            // is re-checked by id above, never sent down the registration path.
            if (!target) {
                const scope = parsed.branch || parsed.commit
                    ? ` for ${parsed.commit ? `commit ${parsed.commit}` : `branch ${parsed.branch}`}`
                    : '';
                // Runs matched the filter but every one of them was non-executing.
                // Same exit code — there is still nothing to gate on — but the
                // operator needs to tell "nothing ran" from "nothing exists",
                // since only the first means a real run may still be coming.
                const nonExecuting = (runs || []).filter(r => matchesFilter(r, filter));
                if (nonExecuting.length > 0) {
                    console.log(JSON.stringify({
                        success: false,
                        message: `No CI runs executed${scope} (${nonExecuting.length} run(s) matched but concluded ${[...new Set(nonExecuting.map(r => r.conclusion))].join('/')})`,
                        data: {
                            status: 'no_executing_runs',
                            branch: parsed.branch,
                            commit: parsed.commit,
                            nonExecutingRunIds: nonExecuting.map(r => r.databaseId)
                        }
                    }));
                    return EXIT_CODES.NO_RUNS;
                }
                // Nothing matched at all. Keep polling until the registration
                // window is spent — a run that is about to exist must not read
                // as one that never will (#2952).
                if (registrationWaited < REGISTRATION_WINDOW) {
                    console.error(`No CI run registered${scope} yet — re-polling (${Math.round(registrationWaited / 1000)}s of ${REGISTRATION_WINDOW / 1000}s)`);
                    await wait(REGISTRATION_INTERVAL);
                    registrationWaited += REGISTRATION_INTERVAL;
                    continue;
                }
                console.log(JSON.stringify({
                    success: false,
                    message: `No CI runs found${scope} after waiting ${Math.round(registrationWaited / 1000)}s for one to register`,
                    data: {
                        status: 'no_runs',
                        branch: parsed.branch,
                        commit: parsed.commit,
                        waitedMs: registrationWaited,
                        registrationWindowMs: REGISTRATION_WINDOW
                    }
                }));
                return EXIT_CODES.NO_RUNS;
            }

            if (target.status === 'completed') {
                // The whole commit decides, not the run listed first (#3046).
                const verdict = decideVerdict(runs, filter, target);
                if (verdict.state === 'pass') {
                    console.log(JSON.stringify({
                        success: true,
                        message: 'CI workflow completed successfully',
                        data: { runId: target.databaseId, branch: target.headBranch, sha: target.headSha }
                    }));
                    return EXIT_CODES.SUCCESS;
                }
                if (verdict.state === 'fail') {
                    const failing = verdict.failing.map(f => ({ runId: f.databaseId, name: f.name, conclusion: f.conclusion }));
                    console.log(JSON.stringify({
                        success: false,
                        message: `CI workflow failed: ${failing.map(f => `${f.name} (${f.conclusion})`).join(', ')}`,
                        data: {
                            runId: verdict.failing[0].databaseId,
                            conclusion: verdict.failing[0].conclusion,
                            branch: target.headBranch,
                            sha: target.headSha,
                            failing
                        }
                    }));
                    return EXIT_CODES.FAILURE;
                }
                // 'waiting': a sibling on the same commit is still running —
                // fall through to the timeout and poll path below.
            }

            // Check if we've exceeded current timeout
            if (elapsed >= timeout) {
                // Check for running jobs before giving up — scoped to the runs
                // that matched the filter, not everything gh returned. A tracked
                // run re-checked by id is counted even when the listing dropped
                // it, or the gate would time out on a run still executing (#3241).
                const scoped = (runs || []).filter(r => matchesFilter(r, filter));
                if (!scoped.some(r => r.databaseId === target.databaseId)) {
                    scoped.push(target);
                }
                const { hasRunning, runningJobs } = checkRunningJobs(scoped);
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
                    // Hit 15-minute cap with jobs still running
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
 * polls — can never fire, making the 5/15-minute contract unenforceable
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

/**
 * Default by-id boundary for the tracked run (#3241). Same per-call timeout as
 * the listing, for the same reason.
 * @param {number} runId
 * @param {object} [deps] - `execSync` override for tests
 * @returns {object}
 */
function defaultFetchRun(runId, deps = {}) {
    const exec = deps.execSync || execSync;
    const runJson = exec(buildRunViewCommand(runId), { encoding: 'utf8', timeout: GH_CALL_TIMEOUT });
    return JSON.parse(runJson);
}

// --- Module Guard ---

if (require.main === module) {
    run(process.argv.slice(2)).then(code => process.exit(code));
}

// --- Exports (for testing) ---

module.exports = {
    run,
    schema,
    parseArgs,
    resolveCommit,
    buildRunListCommand,
    buildRunViewCommand,
    needsTrackedRecheck,
    selectRun,
    decideVerdict,
    matchesFilter,
    isNonExecuting,
    NON_EXECUTING_CONCLUSIONS,
    defaultFetchRuns,
    defaultFetchRun,
    checkRunningJobs,
    getAdaptiveTimeout,
    EXIT_CODES,
    DEFAULT_TIMEOUT,
    POLL_INTERVAL,
    REGISTRATION_INTERVAL,
    REGISTRATION_WINDOW,
    EXTENSION_MS,
    MAX_CAP,
    GH_CALL_TIMEOUT,
    MAX_FETCH_ATTEMPTS
};
