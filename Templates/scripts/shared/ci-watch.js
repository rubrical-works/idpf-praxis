#!/usr/bin/env node
// Rubrical Works (c) 2026

/**
 * @framework-script 0.116.0
 * @description Monitor GitHub Actions workflow runs by commit SHA with configurable polling intervals (default 60s) and timeout (default 5min, or `--timeout auto` sized from recent job durations). Returns structured JSON with run status, conclusion, and URL. Multiple exit codes for scripting. Used by /done background CI monitoring.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { sanitizeShellArg } = require('./lib/shell-safe.js');

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
    case '--timeout': {
      const value = argv[++i];
      args.timeout = value === 'auto' ? 'auto' : parseInt(value, 10);
      break;
    }
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
    args.error = 'Missing required --sha argument. Usage: node ci-watch.js --sha <commit> [--timeout <seconds>|auto] [--poll <seconds>] [--max-wait <seconds>] [--branch <name>]';
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
  const parts = cmd.split(/\s+/);
  return execFileSync(parts[0], parts.slice(1), { encoding: 'utf-8', timeout: 5000 });
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
  return execFileSync('gh', args.split(/\s+/), { encoding: 'utf-8', timeout: 30000 });
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

// --- Timeout Derivation (--timeout auto, #3321) ---

/**
 * Bounds for `--timeout auto`. The derived timeout is the longest job duration
 * seen in recent history × `factor`, clamped to [`minSeconds`, `maxSeconds`];
 * `minSeconds` is also the fallback when history cannot be read.
 */
const AUTO_TIMEOUT = Object.freeze({
  minSeconds: 600,
  maxSeconds: 1800,
  factor: 1.5,
  historyLimit: 50,
  runsPerWorkflow: 5
});

/**
 * Seconds one job ran, from `startedAt` → `completedAt`, or null when either is
 * missing or the span is not positive (a skipped job carries a zero date).
 * @param {Object} job - Job from `gh run view --json jobs`
 * @returns {number|null}
 */
function jobDurationSeconds(job) {
  if (!job || !job.startedAt || !job.completedAt) return null;
  const seconds = (Date.parse(job.completedAt) - Date.parse(job.startedAt)) / 1000;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/**
 * Derive the watch timeout from recent completed runs of the given workflows.
 *
 * Each run is measured by its longest job on the latest attempt (`gh run view
 * --json jobs` reports the latest attempt's jobs), never by the run's
 * `createdAt` → `updatedAt` span: a re-run stretches that span across the first
 * attempt, the wait and the re-run, which says nothing about how long CI takes.
 *
 * @param {string[]} workflowNames - Names of the runs the watched commit triggered
 * @param {Function} [runGh] - gh CLI runner (injectable for testing)
 * @returns {{ seconds: number, source: 'history'|'default', reason?: string,
 *   longestJobSeconds?: number, runsSampled?: number }}
 */
function deriveTimeout(workflowNames, runGh = defaultRunGh) {
  const fallback = (reason) => ({ seconds: AUTO_TIMEOUT.minSeconds, source: 'default', reason });

  let listed;
  try {
    listed = JSON.parse(runGh(`run list --status completed --limit ${AUTO_TIMEOUT.historyLimit} --json databaseId,name`));
  } catch (err) {
    return fallback(`run history could not be read: ${err.message}`);
  }
  if (!Array.isArray(listed)) return fallback('run history could not be read: unexpected response');

  const wanted = new Set(workflowNames);
  const perWorkflow = new Map();
  const sample = [];
  for (const run of listed) {
    if (!run || !wanted.has(run.name)) continue;
    const count = perWorkflow.get(run.name) || 0;
    if (count >= AUTO_TIMEOUT.runsPerWorkflow) continue;
    perWorkflow.set(run.name, count + 1);
    sample.push(run.databaseId);
  }

  let longest = 0;
  let runsSampled = 0;
  for (const runId of sample) {
    let jobs;
    try {
      jobs = JSON.parse(runGh(`run view ${runId} --json jobs`)).jobs || [];
    } catch {
      continue;
    }
    const durations = jobs.map(jobDurationSeconds).filter((s) => s !== null);
    if (durations.length === 0) continue;
    runsSampled += 1;
    longest = Math.max(longest, ...durations);
  }

  if (runsSampled === 0) return fallback('no completed job durations in recent run history');

  const seconds = Math.min(AUTO_TIMEOUT.maxSeconds,
    Math.max(AUTO_TIMEOUT.minSeconds, Math.ceil(longest * AUTO_TIMEOUT.factor)));
  return { seconds, source: 'history', longestJobSeconds: longest, runsSampled };
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
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // Escape all regex-special chars (except *)
    .replace(/\*\*\//g, '\x01')     // **/ → placeholder 1
    .replace(/\*\*/g, '\x02')       // ** → placeholder 2
    .replace(/\*/g, '[^/]*')        // * matches within a single segment
    .replace(/\x01/g, '(.*/)?')     // restore: **/ matches zero or more directories
    .replace(/\x02/g, '.*');        // restore: trailing ** matches everything

  const regex = new RegExp('^' + regexStr + '$');
  return regex.test(filePath);
}

// --- Workflow Detection ---

/**
 * Check if any GitHub Actions workflow has a push trigger with branch patterns.
 * Tag-only push triggers (e.g., push: tags: ['v*']) are excluded.
 * A bare `on: push` (no branches or tags) is treated as push+branches (triggers on all branches).
 *
 * @param {Object} [deps] - Injectable dependencies for testing
 * @param {Function} [deps.readDir] - Returns array of filenames in workflows dir
 * @param {Function} [deps.readFile] - Returns file content given a filename
 * @param {string} [deps.workflowsDir] - Path to .github/workflows/
 * @returns {boolean} True if at least one workflow triggers on push with branches
 */
function hasPushWorkflows({ readDir, readFile, workflowsDir } = {}) {
  const dir = workflowsDir || path.join(process.cwd(), '.github', 'workflows');

  const defaultReadDir = () => {
    return fs.readdirSync(dir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
  };

  const defaultReadFile = (filename) => {
    return fs.readFileSync(path.join(dir, filename), 'utf-8');
  };

  const listFiles = readDir || defaultReadDir;
  const getContent = readFile || defaultReadFile;

  let files;
  try {
    files = listFiles();
  } catch {
    return false;
  }

  if (files.length === 0) return false;

  for (const file of files) {
    try {
      const content = getContent(file);
      if (hasPushBranchTrigger(content)) return true;
    } catch {
      // Skip unreadable files
    }
  }

  return false;
}

/**
 * Check if workflow YAML content contains a push trigger that runs on branch pushes.
 * Uses line-by-line parsing (no YAML library dependency).
 *
 * Patterns detected:
 *   on: push: branches: [...]            → true (push with branches)
 *   on: push: tags: [...]                → false (tag-only)
 *   on: push: branches + tags            → true (branches present)
 *   on: push:                            → true (bare push = all branches)
 *   on: push: paths / paths-ignore only  → true (path-filtered push = all branches, #2897)
 *   on: push                             → true (scalar, #2897)
 *   on: [push, pull_request]             → true (flow sequence containing push, #2897)
 *   on: pull_request: / on: [pull_request] → false (no push trigger)
 *
 * In GitHub Actions, omitting `branches` under `push:` means ALL branches; only
 * `tags` / `tags-ignore` WITHOUT `branches` restricts a push trigger to tags.
 * Path filters narrow which pushes run, not which refs are eligible, so they
 * never affect this verdict. Scalar and flow-sequence forms cannot carry
 * filters, so both mean all branches. Flow-mapping `on: {push: …}` is not
 * recognized (out of scope for #2897).
 *
 * @param {string} content - Raw YAML content
 * @returns {boolean}
 */
function hasPushBranchTrigger(content) {
  const lines = content.split('\n');
  let inOn = false;
  let inPush = false;
  let pushIndent = -1;
  let hasBranches = false;
  let hasTags = false;

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (trimmed === '' || trimmed.trimStart().startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;

    // Detect `on:` — block form, or a scalar / flow-sequence value on the same line
    const onMatch = /^on\s*:\s*(.*)$/.exec(trimmed);
    if (onMatch) {
      const value = onMatch[1].replace(/\s+#.*$/, '').trim();
      if (value === '') {
        inOn = true;
        continue;
      }
      const unquote = (v) => v.trim().replace(/^['"]|['"]$/g, '');
      if (value.startsWith('[')) {
        const items = value.replace(/^\[|\]$/g, '').split(',').map(unquote);
        return items.includes('push');
      }
      return unquote(value) === 'push';
    }

    if (inOn && !inPush) {
      // Look for `push:` inside `on:` block
      if (/^\s+push\s*:/.test(line)) {
        inPush = true;
        pushIndent = indent;
        continue;
      }
      // Another top-level key under on: (like pull_request:) — skip
      if (indent === 0) {
        inOn = false;
        continue;
      }
    }

    if (inPush) {
      // If we're back at push indent or lower, push block is over
      if (indent <= pushIndent) {
        break;
      }

      // Only branch and tag keys decide eligibility; paths / paths-ignore are
      // orthogonal and deliberately ignored (#2897).
      if (/^\s+branches(-ignore)?\s*:/.test(line)) {
        hasBranches = true;
      }
      if (/^\s+tags(-ignore)?\s*:/.test(line)) {
        hasTags = true;
      }
    }
  }

  if (!inPush) return false;

  // Tag-only: tags / tags-ignore present with no branches filter
  return hasBranches || !hasTags;
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
 *
 * Starts from an explicit `'unknown'` rather than `'success'` (#2541). The
 * previous default was fail-open in the one component whose entire job is
 * detecting failure: an empty or truncated result set read as a clean pass,
 * so an enumeration bug upstream surfaced as a confident green rather than a
 * visible "don't know". Only a non-empty set can reach `'success'`;
 * `mapExitCode('unknown')` falls through to 1, so an unsubstantiated verdict
 * never reaches the caller as exit 0.
 *
 * `superseded` (#3242) lists cancelled runs dropped by
 * dropSupersededCancellations; the key is present only when non-empty, so
 * output for a run set with no superseded run is unchanged.
 *
 * `extra` (#3321) carries envelope-level fields such as `watchTimeout`, merged
 * after `workflows`; omitted, the output is unchanged.
 *
 * @param {Array<Object>} results - Array of run result objects
 * @param {Array<Object>} [superseded] - Superseded cancelled runs, each with `supersededBy`
 * @param {Object} [extra] - Additional top-level envelope fields
 * @returns {string} JSON string with overall conclusion
 */
function formatMultiOutput(results, superseded = [], extra = {}) {
  const out = { overall: overallConclusion(results), workflows: results };
  if (Array.isArray(superseded) && superseded.length > 0) out.superseded = superseded;
  Object.assign(out, extra);
  return JSON.stringify(out, null, 2);
}

/**
 * GitHub run conclusions named, in code, as not a failure (#2892). A run
 * concluding `neutral` or `skipped` ran nothing it could fail. Every conclusion
 * absent from this list is not-success — so a conclusion GitHub introduces
 * later fails closed instead of reading as green.
 */
const NON_FAILING_CONCLUSIONS = Object.freeze(['success', 'neutral', 'skipped']);

/**
 * GitHub run conclusions that mean the run itself failed (#2892). `timed_out`
 * is GitHub's job time limit, distinct from ci-watch's own `timeout`, which is
 * only the watch deadline and says nothing about the run's result.
 */
const FAILING_CONCLUSIONS = Object.freeze(['failure', 'timed_out', 'startup_failure']);

/**
 * Classify one run conclusion into the vocabulary `overall` uses (#2892).
 * @param {string} conclusion - GitHub conclusion, or ci-watch's `timeout`
 * @returns {'success'|'failure'|'cancelled'|'timeout'|'unknown'}
 */
function classifyConclusion(conclusion) {
  if (NON_FAILING_CONCLUSIONS.includes(conclusion)) return 'success';
  if (FAILING_CONCLUSIONS.includes(conclusion)) return 'failure';
  if (conclusion === 'cancelled') return 'cancelled';
  if (conclusion === 'timeout') return 'timeout';
  return 'unknown';
}

/**
 * The strongest non-success classification found, else success (#2892).
 *
 * Starts from `'unknown'` for an empty set (#2541) and never assumes success:
 * `success` is reached only when every run classifies as non-failing. Priority
 * is failure > cancelled > timeout > unknown > success — so `action_required`
 * or an unrecognized conclusion beside passing runs yields `unknown`, which
 * `mapExitCode` sends to 1, rather than the false green the old loop produced.
 *
 * @param {Array<Object>} results - Run result objects carrying `conclusion`
 * @returns {string} Overall conclusion
 */
function overallConclusion(results) {
  if (!Array.isArray(results) || results.length === 0) return 'unknown';
  const classes = results.map((r) => classifyConclusion(r && r.conclusion));
  for (const c of ['failure', 'cancelled', 'timeout', 'unknown']) {
    if (classes.includes(c)) return c;
  }
  return 'success';
}

/**
 * Conclusions that prove a run of a workflow executed to a verdict (#3242):
 * success, neutral, or any failing conclusion. `cancelled` and `skipped` are
 * deliberately absent — neither ran the workflow, so neither can stand in for
 * a cancelled sibling.
 */
const SUPERSEDING_CONCLUSIONS = Object.freeze(['success', 'neutral', ...FAILING_CONCLUSIONS]);

/**
 * Drop cancelled runs superseded by a sibling run of the same workflow (#3242).
 *
 * A branch push and a PR opened on it start `push` and `pull_request` runs of
 * the same workflows on one SHA, and a concurrency group cancels the earlier
 * ones. Without this step the cancelled run outranks the sibling that executed
 * (failure > cancelled > ... > success), so a green PR run reads as cancelled.
 *
 * Per workflow name: when any run executed to a verdict (SUPERSEDING_CONCLUSIONS),
 * that workflow's cancelled runs move to `superseded`, each naming the sibling
 * that replaced it. Only cancelled runs are ever dropped — a failed run always
 * stays — and a workflow whose runs were all cancelled or skipped keeps its
 * cancelled runs, so it still decides `overall`.
 *
 * @param {Array<Object>} results - Run result objects carrying `name` and `conclusion`
 * @returns {{ kept: Array<Object>, superseded: Array<Object> }}
 */
function dropSupersededCancellations(results) {
  if (!Array.isArray(results)) return { kept: [], superseded: [] };
  const executed = new Map();
  for (const r of results) {
    if (r && SUPERSEDING_CONCLUSIONS.includes(r.conclusion) && !executed.has(r.name)) {
      executed.set(r.name, r);
    }
  }
  const kept = [];
  const superseded = [];
  for (const r of results) {
    const sibling = r && r.conclusion === 'cancelled' ? executed.get(r.name) : undefined;
    if (sibling) {
      superseded.push({
        ...r,
        supersededBy: { runId: sibling.runId, name: sibling.name, event: sibling.event, conclusion: sibling.conclusion }
      });
    } else {
      kept.push(r);
    }
  }
  return { kept, superseded };
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
 * The real clock. Injectable as `clock` so a test can run an 1800-second watch
 * on virtual time (#3321).
 */
const REAL_CLOCK = Object.freeze({ now: () => Date.now(), sleep });

/**
 * Extend the shared deadline once, for `--timeout auto` only (#3321).
 *
 * Applies when a tracked run was still unfinished at the deadline (collected
 * with the watch's own `timeout` conclusion) and no extension has been used.
 * The extension is the derived timeout, cut so the watch as a whole never
 * passes `AUTO_TIMEOUT.maxSeconds`; a derived timeout already at the clamp gets
 * none. The timed-out runs are dropped from `collected` so the next pass waits
 * on them again, and the extension is recorded on `watchTimeout.extension`.
 *
 * @param {Object|null} watchTimeout - The auto envelope field, or null for a numeric timeout
 * @param {Map<number, Object>} collected - Results collected so far, by run id
 * @param {{ at: number }} deadline - The shared deadline, moved in place
 * @returns {boolean} True when the deadline was extended
 */
function extendOnce(watchTimeout, collected, deadline) {
  if (!watchTimeout || watchTimeout.extension) return false;
  const unfinished = [...collected.entries()].filter(([, r]) => r.conclusion === 'timeout').map(([id]) => id);
  if (unfinished.length === 0) return false;
  const seconds = Math.min(watchTimeout.seconds, AUTO_TIMEOUT.maxSeconds - watchTimeout.seconds);
  if (seconds <= 0) return false;
  deadline.at += seconds * 1000;
  for (const id of unfinished) collected.delete(id);
  watchTimeout.extension = { seconds, totalSeconds: watchTimeout.seconds + seconds, runIds: unfinished };
  return true;
}

/**
 * Phase 1: Wait for runs to appear for a commit
 * @param {string} sha - Commit SHA (should be full 40-char)
 * @param {Object} options - { poll, maxWait, branch, runGh, clock }
 * @returns {Promise<Array<Object>>} Found runs (may be empty)
 */
async function waitForRuns(sha, { poll = 10, maxWait = 60, branch, runGh = defaultRunGh, clock = REAL_CLOCK } = {}) {
  const deadline = clock.now() + maxWait * 1000;

  while (clock.now() < deadline) {
    const runs = findRuns(sha, runGh, { branch });
    if (runs.length > 0) {
      return runs;
    }
    await clock.sleep(poll * 1000);
  }

  return [];
}

/**
 * Phase 2: Wait for a specific run to complete
 * @param {number} runId - Run database ID
 * @param {Object} options - { poll, timeout, runGh, clock }
 * @returns {Promise<Object>} Run details when completed, or timeout marker
 */
async function waitForCompletion(runId, { poll = 15, timeout = 300, runGh = defaultRunGh, clock = REAL_CLOCK } = {}) {
  const deadline = clock.now() + timeout * 1000;

  while (clock.now() < deadline) {
    const run = getRun(runId, runGh);
    if (run.status === 'completed') {
      return run;
    }
    await clock.sleep(poll * 1000);
  }

  // Deadline reached — fetch once more. A run that completed meanwhile, or was
  // already complete when reached with no time left on the shared deadline
  // (timeout 0, #3355), keeps its real conclusion; only an unfinished run is
  // stamped timeout.
  const run = getRun(runId, runGh);
  if (run.status === 'completed') return run;
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

  // The triggering event (push, pull_request, …) comes from `run list`, not
  // `run view`; carried so a superseded run can name its sibling (#3242).
  if (run.event) result.event = run.event;

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
 * @param {Object} options - { timeout (seconds or 'auto'), poll, maxWait, branch, runGh, execCmd, clock }
 * @returns {Promise<{ output: string, exitCode: number }>}
 */
async function watch(sha, { timeout = 300, poll = 15, maxWait = 60, branch = null, runGh = defaultRunGh, execCmd = defaultExecCmd, clock = REAL_CLOCK } = {}) {
  // Resolve short SHA to full 40-char for reliable --commit matching
  const fullSha = resolveSha(sha, execCmd);
  // Detect branch for fallback if not explicitly provided
  const effectiveBranch = branch || getCurrentBranch(execCmd);

  // Phase 1: Wait for runs to appear
  const runs = await waitForRuns(fullSha, { poll: 10, maxWait, branch: effectiveBranch, runGh, clock });

  // Every output path carries `overall` and `workflows` (#2892), so a caller
  // passes stdout unaltered as `ciResult`. The single- and zero-run shapes keep
  // their existing top-level fields alongside, for callers reading those.
  if (runs.length === 0) {
    const result = { found: false, conclusion: 'no-run-found', overall: 'no-run-found', workflows: [] };
    return { output: formatOutput(result), exitCode: mapExitCode('no-run-found') };
  }

  // `--timeout auto` (#3321): size the deadline from recent job durations of
  // the workflows this commit triggered. A numeric timeout is used as given,
  // gets no extension and adds nothing to the envelope.
  let watchTimeout = null;
  let timeoutSeconds = timeout;
  if (timeout === 'auto') {
    watchTimeout = { ...deriveTimeout([...new Set(runs.map(r => r.name))], runGh), extension: null };
    timeoutSeconds = watchTimeout.seconds;
  }
  const timeoutField = watchTimeout ? { watchTimeout } : {};

  // Phase 2 & 3: Wait for each tracked run to complete, collect results, then
  // re-enumerate (#2541).
  //
  // The first non-empty poll is a snapshot, not the run set. GitHub routinely
  // staggers creation by a second or two — on commit 5eab8b4e, Gitleaks and
  // Semgrep were created at 21:19:08Z and Tests at 21:19:10Z. Iterating the
  // snapshot dropped Tests entirely, and a dropped run is indistinguishable
  // from a passing one in the output.
  //
  // Termination therefore takes TWO conditions, not one: every tracked run has
  // completed AND a fresh lookup surfaces no run IDs not already tracked. One
  // re-list is not sufficient — a run can appear during the second pass as
  // easily as the first. The whole loop stays bounded by `timeout`.
  const tracked = new Map(runs.map(r => [r.databaseId, r]));
  const collected = new Map();
  const deadline = { at: clock.now() + timeoutSeconds * 1000 };

  for (;;) {
    for (const runId of tracked.keys()) {
      if (collected.has(runId)) continue;
      // Each run gets the time left before the shared deadline, not the full
      // timeout, so the timeout bounds the watch as a whole (#3298).
      const remaining = Math.max(0, Math.ceil((deadline.at - clock.now()) / 1000));
      const completed = await waitForCompletion(runId, { poll, timeout: remaining, runGh, clock });
      const listed = tracked.get(runId);
      collected.set(runId, collectResults({ event: listed && listed.event, ...completed }, runGh));
    }

    // Past the deadline every tracked run is already resolved (waitForCompletion
    // returns a 'timeout' conclusion rather than hanging), so stopping here
    // leaves nothing unaccounted for — unless the one extension applies.
    if (clock.now() >= deadline.at) {
      if (extendOnce(watchTimeout, collected, deadline)) continue;
      break;
    }

    const fresh = findRuns(fullSha, runGh, { branch: effectiveBranch });
    let discovered = false;
    for (const run of fresh) {
      if (!tracked.has(run.databaseId)) {
        tracked.set(run.databaseId, run);
        discovered = true;
      }
    }
    if (!discovered) break;
  }

  // A cancelled run whose workflow has a sibling that executed on this SHA
  // does not decide the verdict (#3242); it is reported under `superseded`.
  const { kept: results, superseded } = dropSupersededCancellations([...collected.values()]);
  const supersededField = superseded.length > 0 ? { superseded } : {};

  // Single run: its own fields plus overall/workflows (#2892). The exit code
  // follows `overall`, so one classification decides it on every path —
  // previously a raw `timed_out` or `skipped` reached mapExitCode unclassified.
  if (results.length === 1) {
    const overall = overallConclusion(results);
    return {
      output: formatOutput({ ...results[0], overall, workflows: results, ...supersededField, ...timeoutField }),
      exitCode: mapExitCode(overall)
    };
  }

  const overall = overallConclusion(results);
  return {
    output: formatMultiOutput(results, superseded, timeoutField),
    exitCode: mapExitCode(overall)
  };
}

// --- CLI Entry Point ---

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));

  if (args.error) {
    console.error(args.error);
    process.exit(1);
  }

  // Validate user-supplied arguments before shell interpolation
  args.sha = sanitizeShellArg(args.sha, 'commit SHA');
  if (args.branch) {
    args.branch = sanitizeShellArg(args.branch, 'branch name');
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
  hasPushWorkflows,
  formatOutput,
  formatMultiOutput,
  classifyConclusion,
  overallConclusion,
  dropSupersededCancellations,
  SUPERSEDING_CONCLUSIONS,
  NON_FAILING_CONCLUSIONS,
  FAILING_CONCLUSIONS,
  AUTO_TIMEOUT,
  jobDurationSeconds,
  deriveTimeout,
  extendOnce,
  findRuns,
  getRun,
  getFailedSteps,
  waitForRuns,
  waitForCompletion,
  collectResults,
  matchesGlob,
  watch
};
