#!/usr/bin/env node

/**
 * @framework-script 0.48.1
 * CI Watch — Monitor GitHub Actions workflow runs by commit SHA
 *
 * Polls for CI run status and reports structured JSON results.
 * Used by /done (Step 6b) for background monitoring and /ci watch for manual use.
 *
 * Usage: node ci-watch.js --sha <commit> [--timeout <seconds>] [--poll <seconds>] [--max-wait <seconds>] [--branch <name>]
 *
 * Exit codes:
 *   0 = all runs passed
 *   1 = one or more runs failed
 *   2 = timeout waiting for completion
 *   3 = no run found for commit
 *   4 = one or more runs cancelled
 *
 * Refs: #1358
 */

const { execSync } = require('child_process');

// --- Argument Parsing ---

/**
 * Parse CLI arguments
 * @param {string[]} argv - Command line arguments (process.argv.slice(2))
 * @returns {{ sha: string, timeout: number, poll: number, maxWait: number, branch: string|null, error?: string }}
 */
function parseArgs(argv) {
  const args = { sha: null, timeout: 300, poll: 15, maxWait: 60, branch: null };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
    case '--sha':
      args.sha = argv[++i];
      break;
    case '--timeout':
      args.timeout = parseInt(argv[++i], 10);
      break;
    case '--poll':
      args.poll = parseInt(argv[++i], 10);
      break;
    case '--max-wait':
      args.maxWait = parseInt(argv[++i], 10);
      break;
    case '--branch':
      args.branch = argv[++i];
      break;
    }
  }

  if (!args.sha) {
    args.error = 'Missing required --sha argument. Usage: node ci-watch.js --sha <commit> [--timeout <seconds>] [--poll <seconds>] [--max-wait <seconds>] [--branch <name>]';
  }

  return args;
}

// --- Command Execution ---

/**
 * Default command executor
 * @param {string} cmd - Full command to execute
 * @returns {string} stdout
 */
function defaultExecCmd(cmd) {
  return execSync(cmd, { encoding: 'utf-8', timeout: 5000 });
}

/**
 * Resolve a potentially short SHA to full 40-char SHA
 * @param {string} sha - Commit SHA (short or full)
 * @param {Function} [execCmd] - Command executor (injectable for testing)
 * @returns {string} Full 40-char SHA, or original if resolution fails
 */
function resolveSha(sha, execCmd = defaultExecCmd) {
  if (/^[0-9a-f]{40}$/.test(sha)) return sha;
  try {
    return execCmd(`git rev-parse ${sha}`).trim();
  } catch {
    return sha;
  }
}

/**
 * Get the current git branch name
 * @param {Function} [execCmd] - Command executor (injectable for testing)
 * @returns {string|null} Branch name or null if unavailable
 */
function getCurrentBranch(execCmd = defaultExecCmd) {
  try {
    return execCmd('git branch --show-current').trim();
  } catch {
    return null;
  }
}

// --- GitHub CLI Interaction ---

/**
 * Default gh CLI runner
 * @param {string} args - Arguments to pass to `gh`
 * @returns {string} stdout
 */
function defaultRunGh(args) {
  return execSync(`gh ${args}`, { encoding: 'utf-8', timeout: 30000 });
}

/**
 * Find workflow runs for a commit SHA, with optional branch-based fallback
 * @param {string} sha - Commit SHA (should be full 40-char for reliable matching)
 * @param {Function} [runGh] - gh CLI runner (injectable for testing)
 * @param {Object} [options] - { branch: string } for fallback lookup
 * @returns {Array<Object>} Array of run objects
 */
function findRuns(sha, runGh = defaultRunGh, { branch } = {}) {
  // Try commit-based lookup first
  try {
    const output = runGh(`run list --commit ${sha} --json databaseId,name,status,conclusion,headSha,event`);
    const runs = JSON.parse(output);
    if (runs.length > 0) return runs;
  } catch { /* fall through to branch fallback */ }

  // Branch-based fallback: query by branch, filter by headSha
  if (!branch) return [];
  try {
    const output = runGh(`run list --branch ${branch} --json databaseId,name,status,conclusion,headSha,event`);
    const runs = JSON.parse(output);
    return runs.filter(r => r.headSha === sha);
  } catch {
    return [];
  }
}

/**
 * Get details of a specific run
 * @param {number} runId - Run database ID
 * @param {Function} [runGh] - gh CLI runner (injectable for testing)
 * @returns {Object} Run details
 */
function getRun(runId, runGh = defaultRunGh) {
  const output = runGh(`run view ${runId} --json databaseId,name,status,conclusion,createdAt,updatedAt,url`);
  return JSON.parse(output);
}

/**
 * Get failed steps from a run's jobs
 * @param {number} runId - Run database ID
 * @param {Function} [runGh] - gh CLI runner (injectable for testing)
 * @returns {Array<{name: string, conclusion: string}>}
 */
function getFailedSteps(runId, runGh = defaultRunGh) {
  const output = runGh(`run view ${runId} --json jobs`);
  const data = JSON.parse(output);
  const failed = [];

  for (const job of (data.jobs || [])) {
    for (const step of (job.steps || [])) {
      if (step.conclusion === 'failure') {
        failed.push({ name: step.name, conclusion: step.conclusion });
      }
    }
  }

  return failed;
}

// --- Pure Logic Functions ---

/**
 * Map conclusion string to exit code
 * @param {string} conclusion - Run conclusion or special status
 * @returns {number} Exit code (0=pass, 1=fail, 2=timeout, 3=no-run, 4=cancelled)
 */
function mapExitCode(conclusion) {
  const map = {
    'success': 0,
    'failure': 1,
    'timeout': 2,
    'no-run-found': 3,
    'cancelled': 4
  };
  return map[conclusion] ?? 1; // Unknown conclusions default to failure
}

/**
 * Compute human-readable duration between two ISO timestamps
 * @param {string} startISO - Start timestamp
 * @param {string} endISO - End timestamp
 * @returns {string} Duration like "2m 15s"
 */
function computeDuration(startISO, endISO) {
  const ms = new Date(endISO) - new Date(startISO);
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

/**
 * Check if monitoring should be skipped based on paths-ignore patterns
 * @param {string[]} changedFiles - List of changed file paths
 * @param {string[]|undefined} pathsIgnore - Glob patterns from workflow paths-ignore
 * @returns {boolean} True if all changed files match paths-ignore (CI won't trigger)
 */
function shouldSkipMonitoring(changedFiles, pathsIgnore) {
  // Fail-open: if no paths-ignore, assume CI will trigger
  if (!pathsIgnore || pathsIgnore.length === 0) {
    return false;
  }

  // Check if every changed file matches at least one ignore pattern
  return changedFiles.every(file => {
    return pathsIgnore.some(pattern => matchesGlob(file, pattern));
  });
}

/**
 * Simple glob matching for paths-ignore patterns
 * Supports: **, *, exact match
 * @param {string} filePath - File path to check
 * @param {string} pattern - Glob pattern
 * @returns {boolean}
 */
function matchesGlob(filePath, pattern) {
  // Convert glob to regex using placeholders to avoid re-matching
  let regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*\//g, '\x01')     // **/ → placeholder 1
    .replace(/\*\*/g, '\x02')       // ** → placeholder 2
    .replace(/\*/g, '[^/]*')        // * matches within a single segment
    .replace(/\x01/g, '(.*/)?')     // restore: **/ matches zero or more directories
    .replace(/\x02/g, '.*');        // restore: trailing ** matches everything

  const regex = new RegExp('^' + regexStr + '$');
  return regex.test(filePath);
}

// --- Output Formatting ---

/**
 * Format a single run result as JSON string
 * @param {Object} result - Run result object
 * @returns {string} JSON string
 */
function formatOutput(result) {
  return JSON.stringify(result, null, 2);
}

/**
 * Format multiple workflow results as JSON string
 * @param {Array<Object>} results - Array of run result objects
 * @returns {string} JSON string with overall conclusion
 */
function formatMultiOutput(results) {
  // Determine overall conclusion: failure > cancelled > timeout > success
  let overall = 'success';
  for (const r of results) {
    if (r.conclusion === 'failure') {
      overall = 'failure';
      break; // Failure is highest priority
    }
    if (r.conclusion === 'cancelled' && overall !== 'failure') {
      overall = 'cancelled';
    }
    if (r.conclusion === 'timeout' && overall === 'success') {
      overall = 'timeout';
    }
  }

  return JSON.stringify({ overall, workflows: results }, null, 2);
}

// --- Polling Logic ---

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Phase 1: Wait for runs to appear for a commit
 * @param {string} sha - Commit SHA (should be full 40-char)
 * @param {Object} options - { poll, maxWait, branch, runGh }
 * @returns {Promise<Array<Object>>} Found runs (may be empty)
 */
async function waitForRuns(sha, { poll = 10, maxWait = 60, branch, runGh = defaultRunGh } = {}) {
  const deadline = Date.now() + maxWait * 1000;

  while (Date.now() < deadline) {
    const runs = findRuns(sha, runGh, { branch });
    if (runs.length > 0) {
      return runs;
    }
    await sleep(poll * 1000);
  }

  return [];
}

/**
 * Phase 2: Wait for a specific run to complete
 * @param {number} runId - Run database ID
 * @param {Object} options - { poll, timeout, runGh }
 * @returns {Promise<Object>} Run details when completed, or timeout marker
 */
async function waitForCompletion(runId, { poll = 15, timeout = 300, runGh = defaultRunGh } = {}) {
  const deadline = Date.now() + timeout * 1000;

  while (Date.now() < deadline) {
    const run = getRun(runId, runGh);
    if (run.status === 'completed') {
      return run;
    }
    await sleep(poll * 1000);
  }

  // Timeout — get whatever state we have
  const run = getRun(runId, runGh);
  run.conclusion = 'timeout';
  return run;
}

/**
 * Phase 3: Collect full results for a completed run
 * @param {Object} run - Completed run object
 * @param {Function} [runGh] - gh CLI runner
 * @returns {Object} Structured result
 */
function collectResults(run, runGh = defaultRunGh) {
  const result = {
    found: true,
    conclusion: run.conclusion,
    runId: run.databaseId,
    name: run.name,
    url: run.url
  };

  if (run.createdAt && run.updatedAt) {
    result.duration = computeDuration(run.createdAt, run.updatedAt);
  }

  if (run.conclusion === 'failure') {
    result.failedSteps = getFailedSteps(run.databaseId, runGh);
  } else {
    result.failedSteps = [];
  }

  return result;
}

/**
 * Main watch function — orchestrates all three phases for a single commit
 * @param {string} sha - Commit SHA (short or full)
 * @param {Object} options - { timeout, poll, maxWait, branch, runGh, execCmd }
 * @returns {Promise<{ output: string, exitCode: number }>}
 */
async function watch(sha, { timeout = 300, poll = 15, maxWait = 60, branch = null, runGh = defaultRunGh, execCmd = defaultExecCmd } = {}) {
  // Resolve short SHA to full 40-char for reliable --commit matching
  const fullSha = resolveSha(sha, execCmd);
  // Detect branch for fallback if not explicitly provided
  const effectiveBranch = branch || getCurrentBranch(execCmd);

  // Phase 1: Wait for runs to appear
  const runs = await waitForRuns(fullSha, { poll: 10, maxWait, branch: effectiveBranch, runGh });

  if (runs.length === 0) {
    const result = { found: false, conclusion: 'no-run-found' };
    return { output: formatOutput(result), exitCode: mapExitCode('no-run-found') };
  }

  // Phase 2 & 3: Wait for each run to complete, collect results
  const results = [];
  for (const run of runs) {
    const completed = await waitForCompletion(run.databaseId, { poll, timeout, runGh });
    const result = collectResults(completed, runGh);
    results.push(result);
  }

  // Single run: simple output. Multiple: multi-workflow output.
  if (results.length === 1) {
    return {
      output: formatOutput(results[0]),
      exitCode: mapExitCode(results[0].conclusion)
    };
  }

  const multiOutput = JSON.parse(formatMultiOutput(results));
  return {
    output: formatMultiOutput(results),
    exitCode: mapExitCode(multiOutput.overall)
  };
}

// --- CLI Entry Point ---

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));

  if (args.error) {
    console.error(args.error);
    process.exit(1);
  }

  watch(args.sha, { timeout: args.timeout, poll: args.poll, maxWait: args.maxWait, branch: args.branch })
    .then(({ output, exitCode }) => {
      console.log(output);
      process.exit(exitCode);
    })
    .catch(err => {
      console.error(`ci-watch error: ${err.message}`);
      process.exit(1);
    });
}

// --- Exports ---

module.exports = {
  parseArgs,
  resolveSha,
  getCurrentBranch,
  mapExitCode,
  computeDuration,
  shouldSkipMonitoring,
  formatOutput,
  formatMultiOutput,
  findRuns,
  getRun,
  getFailedSteps,
  waitForRuns,
  waitForCompletion,
  collectResults,
  watch
};
