#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.116.0
 * @description Interactive issue-to-branch assignment. Lists unassigned issues and open branches, supports direct assignment via arguments, and --add-ready flag for bulk-assigning all unassigned 'ready' status issues to the current branch. Used by /assign-branch command.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

// The sync site routes through lib/exec.js (#2469). The two callback-form
// execFile sites keep the raw import — lib/exec.js exposes promise wrappers, not
// callback ones — and carry an explicit budget instead, which is the other half
// of the contract. Both were unbounded: `gh pmu sub add` with no ceiling, and
// bulk --add-ready multiplies the exposure by the number of issues.
const { execFile } = require('child_process');
const { execFileTimed: execFileSync, DEFAULT_TIMEOUT_MS } = require('./lib/exec.js');
const { getAllOpenTrackers, findActiveTrackers } = require('./lib/active-label.js');
const { validateIssueNumber } = require('./lib/input-validation.js');
const { findRetired, wantsHelp, helpEnvelope } = require('./lib/command-args.js');

// Timing helper
let showTiming = false;
const timers = {};

function startTimer(name) {
    if (showTiming) timers[name] = Date.now();
}

function endTimer(name) {
    if (showTiming && timers[name]) {
        console.log(`  ⏱ ${name}: ${Date.now() - timers[name]}ms`);
    }
}

// Configuration constants
const LARGE_SELECTION_THRESHOLD = 20;  // Warn when assigning more issues than this
const PARALLEL_BATCH_SIZE = 5;         // Number of issues to assign in parallel
const PARALLEL_THRESHOLD = 3;          // Use parallel assignment above this count

function execSyncSafe(cmd) {
    try {
        const parts = cmd.split(/\s+/);
        return execFileSync(parts[0], parts.slice(1), { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch {
        return null;
    }
}

async function execAsyncSafe(cmd, args) {
    return new Promise((resolve) => {
        execFile(cmd, args, { encoding: 'utf-8', timeout: DEFAULT_TIMEOUT_MS }, (err, stdout) => {
            if (err) return resolve(null);
            resolve((stdout || '').trim());
        });
    });
}

/**
 * Safely parse JSON response, returning null if invalid
 * Validates response looks like JSON before parsing to catch
 * gh-pmu help text output (which starts with "Specify one or more...")
 */
function safeJsonParse(str) {
    if (!str || typeof str !== 'string') return null;
    const trimmed = str.trim();
    // JSON must start with { or [
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return null;
    }
    try {
        return JSON.parse(trimmed);
    } catch {
        return null;
    }
}

/**
 * Get the last version from git tags
 */
function getLastVersion() {
    try {
        const tag = execSyncSafe('git describe --tags --abbrev=0');
        if (tag) {
            const match = tag.match(/v?(\d+)\.(\d+)\.(\d+)/);
            if (match) {
                return {
                    major: parseInt(match[1], 10),
                    minor: parseInt(match[2], 10),
                    patch: parseInt(match[3], 10),
                    raw: tag
                };
            }
        }
    } catch (err) {
        if (showTiming) console.log(`  ⚠ getLastVersion failed: ${err.message}`);
    }
    return null;
}

/**
 * Get issue labels for a given issue number
 */
async function getIssueLabels(issueNumber) {
    for (let attempt = 0; attempt < 2; attempt++) {
        const result = await execAsyncSafe('gh', ['issue', 'view', String(issueNumber), '--json', 'labels']);
        if (result) {
            try {
                const data = JSON.parse(result);
                const labels = (data.labels || []).map(l => l.name).filter(Boolean);
                return { labels, loaded: true };
            } catch {
                // fall through to retry
            }
        }
        if (attempt === 0) {
            console.log(`  ⚠ getIssueLabels(#${issueNumber}): first attempt failed, retrying...`);
        }
    }
    console.log(`  ⚠ getIssueLabels(#${issueNumber}): retry failed — epic label detection unavailable`);
    return { labels: [], loaded: false };
}

/**
 * Fetch labels once per issue (#3283). The branch-tracker check and epic
 * expansion read the same labels, so main() builds this map once and hands it
 * to both rather than letting each fetch every issue again. Fetches run
 * concurrently, at most PARALLEL_BATCH_SIZE in flight — the same bound the
 * assignment batches use. Order does not matter: each fetch is independent.
 *
 * @param {number[]} issueNumbers
 * @returns {Promise<Map<number, {labels: string[], loaded: boolean}>>}
 */
async function fetchLabelMap(issueNumbers) {
    const map = new Map();
    const queue = [...new Set(issueNumbers)];
    let next = 0;
    async function worker() {
        while (next < queue.length) {
            const num = queue[next++];
            map.set(num, await getIssueLabels(num));
        }
    }
    const workers = Math.min(PARALLEL_BATCH_SIZE, queue.length);
    await Promise.all(Array.from({ length: workers }, worker));
    return map;
}

/**
 * Expand epic issues into their sub-issues for bulk assignment.
 * When an issue with the 'epic' label is passed, fetches its sub-issues
 * and adds them to the issue list. Returns both the expanded list and
 * a Set of sub-issue numbers (for tracker linking exclusion).
 *
 * @param {number[]} issueNumbers - Issue numbers from args
 * @param {Map<number, {labels: string[], loaded: boolean}>} [labelMap] - Labels
 *   already fetched by fetchLabelMap; fetched here when omitted
 * @returns {Promise<{expanded: number[], epicSubIssues: Set<number>}>}
 */
async function expandEpicSubIssues(issueNumbers, labelMap) {
    const expanded = [];
    const epicSubIssues = new Set();
    const labelsByIssue = labelMap || await fetchLabelMap(issueNumbers);

    for (const num of issueNumbers) {
        expanded.push(num);
        const { labels, loaded } = labelsByIssue.get(num) || await getIssueLabels(num);

        if (!loaded) {
            console.log(`  ⚠ Epic #${num}: label detection failed — assign sub-issues manually`);
            continue;
        }

        // Canary: detect malformed label entries (e.g., from corrupted jq output)
        const validLabelPattern = /^[a-z0-9][a-z0-9 _-]*$/i;
        const malformed = labels.filter(l => !validLabelPattern.test(l));
        if (malformed.length > 0) {
            console.log(`  ⚠ Epic #${num}: malformed labels detected: ${malformed.join(', ')} — label data may be corrupted`);
        }

        if (!labels.some(l => l.toLowerCase() === 'epic')) continue;

        // Fetch sub-issues for this epic
        const result = await execAsyncSafe('gh', ['pmu', 'sub', 'list', String(num), '--json']);
        const data = safeJsonParse(result);
        const children = data && data.children ? data.children : [];

        if (children.length > 0) {
            const childNums = children.map(c => `#${c.number}`).join(', ');
            console.log(`  ↳ Epic #${num}: expanded ${children.length} sub-issues (${childNums})`);
            for (const child of children) {
                expanded.push(child.number);
                epicSubIssues.add(child.number);
            }
        } else {
            console.log(`  ⚠ Epic #${num}: has no sub-issues to expand`);
        }
    }

    return { expanded, epicSubIssues };
}

/**
 * Classify an expansion result for reporting purposes.
 * @param {object} opts
 * @param {number} opts.issueNumber
 * @param {boolean} opts.isEpic - Whether the issue has the epic label
 * @param {boolean} opts.labelsLoaded - Whether labels were successfully fetched
 * @param {Array} opts.children - Sub-issues found
 * @returns {{ status: string, count: number, warning: string|null }}
 */
function classifyExpansionResult({ issueNumber, isEpic, labelsLoaded, children }) {
    if (!labelsLoaded) {
        return {
            status: 'label_failed',
            count: 0,
            warning: `Epic #${issueNumber}: label detection failed — assign sub-issues manually`
        };
    }

    if (!isEpic) {
        return { status: 'not_epic', count: 0, warning: null };
    }

    if (children.length === 0) {
        return {
            status: 'no_children',
            count: 0,
            warning: `Epic #${issueNumber}: has no sub-issues to expand`
        };
    }

    return { status: 'expanded', count: children.length, warning: null };
}

/**
 * Identify which of the given issue numbers are branch trackers (have the
 * 'branch' label). Used to reject assignment operations targeting trackers
 * (#2403). Failed label fetches are treated as non-tracker — getIssueLabels
 * already emits a warning, so this function does not block on transient
 * fetch failures.
 *
 * @param {number[]} issueNumbers
 * @param {Map<number, {labels: string[], loaded: boolean}>} [labelMap] - Labels
 *   already fetched by fetchLabelMap; fetched here when omitted
 * @returns {Promise<number[]>} Issue numbers that are branch trackers
 */
async function findBranchTrackers(issueNumbers, labelMap) {
    const trackers = [];
    const labelsByIssue = labelMap || await fetchLabelMap(issueNumbers);
    for (const num of issueNumbers) {
        const { labels } = labelsByIssue.get(num) || await getIssueLabels(num);
        if (labels.some(l => l.toLowerCase() === 'branch')) {
            trackers.push(num);
        }
    }
    return trackers;
}

/**
 * Generate branch name suggestions based on context
 */
function generateBranchSuggestions(lastVersion, userInput, labels) {
    const suggestions = [];
    const hasBugLabel = labels.some(l => l.toLowerCase() === 'bug' || l.toLowerCase() === 'hotfix');
    const hasFeatureLabel = labels.some(l => ['enhancement', 'feature', 'epic', 'story'].includes(l.toLowerCase()));

    if (lastVersion) {
        const nextPatch = `v${lastVersion.major}.${lastVersion.minor}.${lastVersion.patch + 1}`;
        suggestions.push({
            branch: `patch/${nextPatch}`,
            description: `Next patch version (bug fixes only)`,
            recommended: hasBugLabel && !hasFeatureLabel
        });

        const nextMinor = `v${lastVersion.major}.${lastVersion.minor + 1}.0`;
        suggestions.push({
            branch: `release/${nextMinor}`,
            description: `Next minor version (new features)`,
            recommended: hasFeatureLabel && !hasBugLabel
        });

        const nextMajor = `v${lastVersion.major + 1}.0.0`;
        suggestions.push({
            branch: `release/${nextMajor}`,
            description: `Next major version (breaking changes)`
        });
    }

    if (userInput && !userInput.includes('/')) {
        const cleanName = userInput.replace(/^v/, '').replace(/[^a-zA-Z0-9.-]/g, '-');
        if (hasBugLabel) {
            suggestions.push({ branch: `patch/${cleanName}`, description: `Your input with patch prefix` });
        } else {
            suggestions.push({ branch: `release/${cleanName}`, description: `Your input with release prefix` });
        }
    }

    if (userInput && userInput.includes('/')) {
        suggestions.unshift({ branch: userInput, description: `Your specified branch`, recommended: true });
    }

    if (suggestions.length > 0 && !suggestions.some(s => s.recommended)) {
        suggestions[0].recommended = true;
    }

    return suggestions;
}

/**
 * Get sub-issue count - async version for parallel fetching
 */
async function getSubIssueCountAsync(issueNumber) {
    // Note: gh pmu sub list uses --json as boolean flag, not field selector
    const result = await execAsyncSafe('gh', ['pmu', 'sub', 'list', String(issueNumber), '--json']);
    const data = safeJsonParse(result);
    if (!data) return 0;
    if (data.children) return data.children.length;
    if (Array.isArray(data)) return data.length;
    return 0;
}

/**
 * Get open branches via label-based query (~0.8s).
 * Uses getAllOpenTrackers() to fetch all open branch tracker issues and parse
 * branch names from their titles. Returns tracker numbers alongside branch data
 * for correct tracker linking (fixes multi-branch bug where the old approach
 * always returned the active branch's tracker).
 */
function getOpenBranches() {
    startTimer('getOpenBranches');
    const trackers = getAllOpenTrackers();
    const branches = trackers.map(t => ({ version: t.branch, name: t.branch, tracker: t.number }));
    endTimer('getOpenBranches');
    return branches;
}

/**
 * Resolve the branch for an assignment that names none (#3160). One open
 * tracker is used as before, active or not. With 2+, the tracker carrying the
 * `active` label wins — but only when exactly one does and it is open; anything
 * else is ambiguous, never a guess.
 *
 * @param {{branches: Array<{name: string, tracker: number}>, activeTrackers: number[]|null}} input
 *   `activeTrackers` is findActiveTrackers(): null when the lookup failed.
 * @returns {{branch: string, source: 'single'|'active'}|{branch: null, ambiguous: true,
 *   reason: 'no-active'|'multiple-active'|'active-not-open'|'active-lookup-failed'}}
 */
function resolveImplicitBranch({ branches, activeTrackers }) {
    if (branches.length === 1) return { branch: branches[0].name, source: 'single' };
    const ambiguous = (reason) => ({ branch: null, ambiguous: true, reason });
    if (activeTrackers === null) return ambiguous('active-lookup-failed');
    if (activeTrackers.length === 0) return ambiguous('no-active');
    if (activeTrackers.length > 1) return ambiguous('multiple-active');
    const active = branches.find(b => b.tracker === activeTrackers[0]);
    return active ? { branch: active.name, source: 'active' } : ambiguous('active-not-open');
}

const AMBIGUITY_REASONS = {
    'no-active': 'no open tracker carries the active label',
    'multiple-active': 'more than one open tracker carries the active label',
    'active-not-open': 'the active-labeled tracker is not among the open trackers',
    'active-lookup-failed': 'the active-label lookup failed',
};

/**
 * Report an ambiguous implicit branch and fail (#3160). It used to print help
 * and exit 0, which a caller such as /work --assign read as an assignment.
 * Written to stderr so performAssignment() carries it into ASSIGN_FAILED.
 *
 * @param {{reason: string}} resolution
 * @param {Array<{name: string}>} branches
 * @param {{error: Function, exitCode: number}} [io] process-like sink; defaults to console + process
 */
function reportUnresolvedBranch(resolution, branches, io = { error: console.error, set exitCode(v) { process.exitCode = v; } }) {
    io.error(`BRANCH_AMBIGUOUS: ${AMBIGUITY_REASONS[resolution.reason] || resolution.reason}. No issues were assigned.`);
    io.error(`Open branches: ${branches.map(b => b.name).join(', ')}`);
    io.error('Re-run with --branch <name>.');
    io.exitCode = 1;
}

/**
 * Check if an issue has a branch/release field assigned
 * Checks multiple field names for compatibility across projects
 */
function hasBranchAssigned(issue) {
    const fv = issue.fieldValues;
    if (!fv) return false;
    // Check common field names (case-sensitive as returned by GitHub)
    return !!(fv.Branch || fv.Release || fv.branch || fv.release);
}

/**
 * Get issues by status (gh pmu handles caching internally)
 * @param {string} status - Status to query (default: 'backlog')
 */
async function getIssuesByStatus(status = 'backlog') {
    startTimer(`getIssuesByStatus(${status})`);
    const cmd = `gh pmu list --status ${status} --json=number,title,fieldValues`;
    const result = await execAsyncSafe('gh', ['pmu', 'list', '--status', status, '--json=number,title,fieldValues']);

    if (showTiming) {
        console.log(`  📋 Command: ${cmd}`);
        console.log(`  📋 Result length: ${result ? result.length : 'null'}`);
        if (result && result.length < 500) {
            console.log(`  📋 Result preview: ${result.substring(0, 200)}...`);
        }
    }

    const data = safeJsonParse(result);

    if (showTiming) {
        console.log(`  📋 Parsed data: ${data ? 'success' : 'null/failed'}`);
    }

    if (data) {
        const items = data.items || data || [];
        if (showTiming) {
            console.log(`  📋 Items found: ${items.length}`);
        }
        const filtered = items.filter(i => !hasBranchAssigned(i));
        if (showTiming) {
            console.log(`  📋 After filtering (no branch): ${filtered.length}`);
        }
        endTimer(`getIssuesByStatus(${status})`);
        return filtered;
    }

    if (showTiming) {
        console.log(`  ⚠️ No data returned from gh pmu list`);
    }
    endTimer(`getIssuesByStatus(${status})`);
    return [];
}

/**
 * Assign one issue to a branch. `execAsyncSafe` resolves null when
 * `gh pmu move` exits non-zero, so null is a failure — logged and returned
 * false, matching removeFromBranch (#3359, from #3054 item 3).
 * @returns {Promise<boolean>} true only when the move succeeded
 */
async function assignToBranch(issueNumber, branch, useCurrent = false) {
    try {
        const branchArg = useCurrent ? 'current' : branch;
        const displayBranch = useCurrent ? `${branch} (current)` : branch;
        console.log(`  → Assigning #${issueNumber} to ${displayBranch}`);
        const moveResult = await execAsyncSafe('gh', ['pmu', 'move', String(issueNumber), '--branch', branchArg]);
        if (moveResult === null) {
            console.log(`    ⚠ Failed to assign #${issueNumber} to ${displayBranch}`);
            return false;
        }
        return true;
    } catch (err) {
        console.log(`    ⚠ Failed to assign #${issueNumber}: ${err.message}`);
        return false;
    }
}

/**
 * Assign several issues in one `gh pmu move <N1> <N2> … --branch <b>` call
 * (#3359). A non-zero exit does not say which issue failed, so it falls back
 * to per-issue moves — in parallel batches above PARALLEL_THRESHOLD — and each
 * failing issue is named by assignToBranch.
 * @returns {Promise<number[]>} the issues actually assigned, in input order
 */
async function assignIssuesToBranch(issueNumbers, branch, useCurrent = false) {
    if (issueNumbers.length === 0) return [];
    const branchArg = useCurrent ? 'current' : branch;
    const displayBranch = useCurrent ? `${branch} (current)` : branch;

    // gh-pmu refuses a multi-issue move without --yes ("use --yes to confirm
    // bulk update of N issues") before updating anything.
    const confirm = issueNumbers.length > 1 ? ['--yes'] : [];
    startTimer('batchAssign');
    const batched = await execAsyncSafe('gh', ['pmu', 'move', ...issueNumbers.map(String), '--branch', branchArg, ...confirm]);
    endTimer('batchAssign');
    if (batched !== null) {
        for (const num of issueNumbers) console.log(`  → Assigned #${num} to ${displayBranch}`);
        return [...issueNumbers];
    }

    console.log(`  ⚠ Batched move failed — assigning one issue at a time to find the failures`);
    const assigned = [];
    startTimer('perIssueAssign');
    if (issueNumbers.length > PARALLEL_THRESHOLD) {
        for (let i = 0; i < issueNumbers.length; i += PARALLEL_BATCH_SIZE) {
            const batch = issueNumbers.slice(i, i + PARALLEL_BATCH_SIZE);
            const results = await Promise.all(
                batch.map(num => assignToBranch(num, branch, useCurrent).then(ok => ({ num, ok })))
            );
            for (const r of results) if (r.ok) assigned.push(r.num);
        }
    } else {
        for (const num of issueNumbers) {
            if (await assignToBranch(num, branch, useCurrent)) assigned.push(num);
        }
    }
    endTimer('perIssueAssign');
    return assigned;
}

/**
 * GitHub's refusal once a parent holds its maximum of sub-issues (#3404):
 * "Parent cannot have more than 100 sub-issues". A platform limit, not a
 * transient failure, so it is reported once per run rather than per child.
 */
const SUB_ISSUE_LIMIT_PATTERN = /cannot have more than (\d+) sub-issues/i;
const DEFAULT_SUB_ISSUE_LIMIT = 100;

/**
 * The link outcome every link path returns and `--link-json` prints (#3405).
 * `reasons` maps each `failed` child to its failure text; `limitSize` is the
 * limit GitHub named when any child landed in `limit`.
 * @returns {{linked: number, already: number, failed: number[], limit: number[], limitSize: number|null, reasons: Object<string, string>}}
 */
function emptyLinkOutcome() {
    return { linked: 0, already: 0, failed: [], limit: [], limitSize: null, reasons: {} };
}

/**
 * The sub-issue limit a gh-pmu failure message names, or null when the
 * failure is anything else.
 * @param {string} text
 * @returns {number|null}
 */
function subIssueLimitIn(text) {
    const m = SUB_ISSUE_LIMIT_PATTERN.exec(String(text || ''));
    return m ? Number(m[1]) : null;
}

/**
 * Link a single issue to the branch tracker as a sub-issue. Logs success or
 * failure (never swallows errors silently); a sub-issue-limit refusal is left
 * to the caller's one warning.
 * @returns {Promise<{result: 'linked'|'failed'|'limit', limit?: number, reason?: string}>}
 */
function linkOneToTracker(issueNumber, tracker) {
    return new Promise((resolve) => {
        execFile('gh', ['pmu', 'sub', 'add', String(tracker), String(issueNumber)],
            { encoding: 'utf-8', timeout: DEFAULT_TIMEOUT_MS }, (err, stdout, stderr) => {
                if (err) {
                    const errMsg = (stderr || err.message || 'unknown error').trim();
                    const limit = subIssueLimitIn(errMsg);
                    if (limit) return resolve({ result: 'limit', limit });
                    console.log(`    ⚠ Failed to link #${issueNumber} to tracker #${tracker}: ${errMsg}`);
                    return resolve({ result: 'failed', reason: errMsg });
                }
                const output = (stdout || '').trim();
                if (output.includes('already') && (output.includes('parent') || output.includes('sub-issue'))) {
                    console.log(`    ⚠ #${issueNumber} already has a parent — skipped`);
                    return resolve({ result: 'failed', reason: output });
                }
                console.log(`    ↳ Linked #${issueNumber} to tracker #${tracker}`);
                resolve({ result: 'linked' });
            });
    });
}

/**
 * Link a single issue to the branch tracker as a sub-issue.
 * @returns {Promise<boolean>} true if linked, false if failed, skipped or refused at the limit
 */
async function linkToTracker(issueNumber, tracker) {
    return (await linkOneToTracker(issueNumber, tracker)).result === 'linked';
}

/**
 * Whether this gh-pmu's `sub add` takes several children (gh-pmu 1.8.0,
 * gh-pmu#945), read from the `<child-issue>...` usage line of its help. The
 * framework enforces no minimum gh-pmu version, so an older one — or a help
 * call that fails — means the per-child loop.
 * @returns {Promise<boolean>}
 */
async function detectMultiChildSubAdd() {
    const help = await execAsyncSafe('gh', ['pmu', 'sub', 'add', '--help']);
    return !!help && /<child-issue>\.\.\./.test(help);
}

/**
 * Parse a multi-child `gh pmu sub add` run: one `✓ #N: <title>`,
 * `✓ #N: already linked` or `✗ #N: <reason>` line per child (gh-pmu 1.8.0).
 * The header and summary lines carry no `#N:` marker and are skipped.
 * @param {string} output - stdout of the run, whether it exited zero or not
 * @returns {Map<number, {result: 'linked'|'already'|'failed', detail: string}>}
 */
function parseSubAddBatchOutput(output) {
    const results = new Map();
    for (const line of String(output || '').split(/\r?\n/)) {
        const m = line.match(/^\s*([✓✗])\s+#(\d+):\s*(.*)$/);
        if (!m) continue;
        const detail = m[3].trim();
        let result = 'failed';
        if (m[1] === '✓') result = detail === 'already linked' ? 'already' : 'linked';
        results.set(Number(m[2]), { result, detail });
    }
    return results;
}

/**
 * Link several issues in one `gh pmu sub add <tracker> <children…>` call.
 * gh-pmu links every child it can and exits non-zero if any failed, so the
 * per-child lines are read either way and nothing is retried: a retry would
 * only meet the same different-parent refusal.
 */
function linkBatchToTracker(issueNumbers, tracker) {
    return new Promise((resolve) => {
        execFile('gh', ['pmu', 'sub', 'add', String(tracker), ...issueNumbers.map(String)],
            { encoding: 'utf-8', timeout: DEFAULT_TIMEOUT_MS }, (err, stdout, stderr) => {
                const parsed = parseSubAddBatchOutput(stdout);
                const outcome = emptyLinkOutcome();
                for (const num of issueNumbers) {
                    const r = parsed.get(num);
                    if (r && r.result === 'linked') {
                        outcome.linked++;
                        console.log(`    ↳ Linked #${num} to tracker #${tracker}`);
                    } else if (r && r.result === 'already') {
                        outcome.already++;
                        console.log(`    ↳ #${num} already linked to tracker #${tracker}`);
                    } else {
                        const reason = r ? r.detail
                            : ((stderr || '').trim() || (err && err.message) || 'no result reported');
                        const limit = subIssueLimitIn(reason);
                        if (limit) {
                            outcome.limit.push(num);
                            outcome.limitSize = limit;
                            continue;
                        }
                        outcome.failed.push(num);
                        outcome.reasons[num] = reason;
                        console.log(`    ⚠ Failed to link #${num} to tracker #${tracker}: ${reason}`);
                    }
                }
                resolve(outcome);
            });
    });
}

/**
 * Link issues to a tracker. With multi-child `sub add` (detected once per
 * run) and more than one issue, one call; otherwise sequentially, one child
 * per call — sequential avoids the race when several sub-issue additions
 * target the same parent (GitHub sub-issue API limitation).
 * @param {number[]} issueNumbers
 * @param {number} tracker
 * A child GitHub refuses because the tracker is at its sub-issue limit lands
 * in `limit`, not `failed` (#3404): its Branch field is already set, so the
 * run continues and the exit code is unchanged — one warning names it.
 * @param {{multiChild?: boolean}} [options] - skip detection when already known
 * @returns {Promise<ReturnType<typeof emptyLinkOutcome>>}
 */
async function linkAllToTracker(issueNumbers, tracker, options = {}) {
    let outcome = emptyLinkOutcome();
    if (!tracker || issueNumbers.length === 0) return outcome;
    console.log(`\nLinking to tracker #${tracker}...`);

    const multiChild = issueNumbers.length > 1 &&
        (options.multiChild !== undefined ? options.multiChild : await detectMultiChildSubAdd());
    if (multiChild) {
        startTimer('batchLink');
        outcome = await linkBatchToTracker(issueNumbers, tracker);
        endTimer('batchLink');
    } else {
        for (const num of issueNumbers) {
            const one = await linkOneToTracker(num, tracker);
            if (one.result === 'linked') {
                outcome.linked++;
            } else if (one.result === 'limit') {
                outcome.limit.push(num);
                outcome.limitSize = one.limit;
            } else {
                outcome.failed.push(num);
                outcome.reasons[num] = one.reason;
            }
        }
    }

    const limitLabel = `GitHub's ${outcome.limitSize || DEFAULT_SUB_ISSUE_LIMIT} sub-issue limit`;
    if (outcome.limit.length > 0) {
        const nums = outcome.limit.map(n => `#${n}`).join(', ');
        console.log(`  ⚠ Tracker #${tracker} is at ${limitLabel}: ${nums} not linked. ` +
            'Their Branch field is set, but they are not tracker sub-issues, so `gh pmu sub list` ' +
            'and branch close will not see them.');
    }
    const notes = [];
    if (outcome.already > 0) notes.push(`${outcome.already} already linked`);
    if (outcome.limit.length > 0) notes.push(`${outcome.limit.length} not linked: tracker at ${limitLabel}`);
    if (outcome.failed.length > 0) notes.push(`${outcome.failed.length} failed`);
    const noteText = notes.length > 0 ? ` (${notes.join('; ')})` : '';
    console.log(`  ${outcome.linked + outcome.already}/${issueNumbers.length} linked to tracker #${tracker}${noteText}`);
    return outcome;
}

/**
 * The mutating phases of an assignment (#3359): one batched move, then one
 * link pass over the issues actually assigned — a failed move is neither
 * counted nor linked. Epic sub-issues are not linked: the epic is their parent.
 * @returns {Promise<{assigned: number[], link: ReturnType<typeof emptyLinkOutcome>}>}
 */
async function assignAndLink({ issueNumbers, branch, useCurrent, tracker, epicSubIssues }) {
    const assigned = await assignIssuesToBranch(issueNumbers, branch, useCurrent);
    console.log(`\n✓ ${assigned.length} issues assigned to ${branch}${useCurrent ? ' (current)' : ''}`);

    const linkable = assigned.filter(num => !epicSubIssues.has(num));
    const link = tracker && linkable.length > 0
        ? await linkAllToTracker(linkable, tracker)
        : emptyLinkOutcome();
    return { assigned, link };
}

/**
 * Order-independent argument parsing (#3030). Issue numbers stay bare; the
 * branch is `--branch <name>` (or `--branch=<name>`). A positional
 * prefix/name token — the retired form — is refused naming `--branch`, and
 * `--help` anywhere returns `{ help: true }` before anything else is read.
 * @param {string[]} args
 */
function parseAssignArgs(args) {
    if (wantsHelp(args)) return { help: true };
    const retired = findRetired('assign-branch', args);
    if (retired) {
        const token = args.find((a, i) => !a.startsWith('-') && a.includes('/') && args[i - 1] !== '--branch');
        return { error: { code: 'RETIRED_ARGUMENT', message: `${retired.message} (got \`${token}\`)` } };
    }

    let branch;
    let branchIndex = -1;
    const eq = args.findIndex(a => a.startsWith('--branch='));
    if (eq !== -1) {
        branch = args[eq].slice('--branch='.length);
    } else {
        branchIndex = args.indexOf('--branch');
        if (branchIndex !== -1) branch = args[branchIndex + 1];
    }
    if ((eq !== -1 || branchIndex !== -1) && (!branch || branch.startsWith('-'))) {
        return { error: { code: 'MISSING_ARGUMENT', message: '--branch requires a branch name.' } };
    }

    // Deduplicated: a repeated number is always the same issue, so a repeat can only
    // produce a redundant second assignment — which the script then reports as a
    // second issue assigned, overstating what it did (#2554).
    const issueNumbers = [...new Set(
        args.filter(a => a.match(/^#?\d+$/)).map(a => validateIssueNumber(a.replace('#', '')))
    )];
    // The token after `--branch` is its value, never free-text user input.
    const branchValueIndex = branchIndex === -1 ? -1 : branchIndex + 1;
    const userInput = args.find((a, i) => i !== branchValueIndex && !a.startsWith('-') && !a.includes('/') && !a.match(/^#?\d+$/));

    const confirmRemove = args.includes('--confirm-remove');
    return {
        branch,
        issueNumbers,
        userInput,
        addReady: args.includes('--add-ready'),
        confirmRemove,
        remove: args.includes('--remove') || confirmRemove,
        timing: args.includes('--timing'),
        linkJson: args.includes('--link-json'),
    };
}

/**
 * Split space-separated arguments passed as a single string (from skill invocation),
 * e.g. "#789 #790 #788" arriving as one arg instead of three. Anything else is
 * returned unchanged.
 * @param {string[]} args
 * @returns {string[]}
 */
function splitQuotedArgs(args) {
    if (args.length === 1 && args[0].includes(' ')) {
        return args[0].split(/\s+/).filter(a => a.trim());
    }
    return args;
}

async function main() {
    const args = splitQuotedArgs(process.argv.slice(2));

    const parsed = parseAssignArgs(args);
    if (parsed.help) {
        console.log(JSON.stringify(helpEnvelope('assign-branch'), null, 2));
        return;
    }
    if (parsed.error) {
        console.error(`Error: ${parsed.error.message}`);
        process.exit(1);
        return;
    }
    const addReady = parsed.addReady;
    const confirmRemoveFlag = parsed.confirmRemove;
    const removeFlag = parsed.remove;
    showTiming = parsed.timing;
    let branch = parsed.branch;
    let issueNumbers = parsed.issueNumbers;
    const userInput = parsed.userInput;

    // Handle --remove mode
    if (removeFlag) {
        console.log('=== Assign-Branch --remove ===\n');
        if (issueNumbers.length === 0) {
            console.log('Error: --remove requires at least one issue number.');
            console.log('Usage: /assign-branch #N --remove');
            return;
        }

        // Show affected issues for confirmation. De-duplicated: an epic named
        // beside its own children expands them a second time (#3373).
        const { expanded: rawExpanded, epicSubIssues } = await expandEpicSubIssues(issueNumbers);
        const expanded = [...new Set(rawExpanded.map(Number))];
        console.log(`Issues to remove from branch (${expanded.length} total):`);
        for (const num of expanded) {
            const marker = epicSubIssues.has(num) ? ' (sub-issue)' : '';
            console.log(`  #${num}${marker}`);
        }
        console.log('');

        // --confirm-remove is the other side of the CONFIRM_REMOVE gate (#2814).
        // Without it main() printed the gate and returned, and removeIssues was
        // exported but never called from main() — so the only way to complete a
        // removal was to require() the module and call the export by hand.
        if (confirmRemoveFlag) {
            const result = await removeIssues(issueNumbers);
            console.log(JSON.stringify(result, null, 2));
            endTimer('total');
            // Exit non-zero when any removal failed, so a caller can tell.
            if (result.removed < result.total) process.exitCode = 1;
            return;
        }

        // Output for command spec to present confirmation via AskUserQuestion
        console.log('CONFIRM_REMOVE');
        console.log(JSON.stringify({ issues: expanded, epicSubIssues: [...epicSubIssues] }));
        console.log('');
        // The original numbers, not the expansion: --confirm-remove expands
        // epics again, so passing the children too processed them twice (#3373).
        console.log(`To complete: node .claude/scripts/shared/assign-branch.js ${issueNumbers.map(n => `${n}`).join(' ')} --confirm-remove`);
        endTimer('total');
        return;
    }

    console.log('=== Assign-Branch ===\n');
    startTimer('total');

    // Step 1: Get open branches via label-based query (~0.8s)
    const branches = getOpenBranches();
    const currentBranch = branches.length === 1 ? branches[0].version : null;

    // Step 2: Handle no branches case
    if (branches.length === 0) {
        console.log('NO_BRANCH_FOUND');
        console.log('');

        const lastVersion = getLastVersion();
        const labelsResult = issueNumbers.length > 0 ? await getIssueLabels(issueNumbers[0]) : { labels: [], loaded: false };
        const labels = labelsResult.labels;

        console.log(`CONTEXT:`);
        console.log(`  Last version: ${lastVersion ? lastVersion.raw : '(none)'}`);
        if (issueNumbers.length > 0) {
            console.log(`  Issue: #${issueNumbers[0]}`);
            console.log(`  Labels: ${labels.length > 0 ? labels.join(', ') : '(none)'}`);
        }
        if (userInput) {
            console.log(`  User input: ${userInput}`);
        }
        console.log('');

        const suggestions = generateBranchSuggestions(lastVersion, userInput, labels);

        if (suggestions.length > 0) {
            console.log('SUGGESTIONS:');
            suggestions.forEach((s, i) => {
                const recMarker = s.recommended ? ' (recommended)' : '';
                console.log(`${i + 1}|${s.branch}|${s.description}${recMarker}`);
            });
        } else {
            console.log('SUGGESTIONS:');
            console.log('1|release/v1.0.0|Initial release');
            console.log('2|patch/v0.0.1|Initial patch');
        }

        console.log('');
        console.log('ACTION_REQUIRED: Use AskUserQuestion to let user select a branch, then run:');
        console.log('  gh pmu branch start --name "<selected-branch>"');
        endTimer('total');
        return;
    }

    // Step 3: No --branch named but there is something to assign — one open
    // tracker is used as before; with 2+, the active-labeled one (#3160).
    // An ambiguous result fails non-zero instead of falling through to help.
    if (!branch && (issueNumbers.length > 0 || addReady)) {
        const resolution = resolveImplicitBranch({
            branches,
            activeTrackers: branches.length > 1 ? findActiveTrackers() : null,
        });
        if (resolution.ambiguous) {
            reportUnresolvedBranch(resolution, branches);
            endTimer('total');
            return;
        }
        branch = resolution.branch;
        console.log(resolution.source === 'active'
            ? `Using active branch: ${branch}\n`
            : `Using current branch: ${branch}\n`);
    }

    // Step 3a: Validate the branch token against the open-tracker list (#2554)
    // Branch detection is a shape heuristic ("contains a slash"), so any slash-bearing
    // token that reaches args wins the find() — a slash-command name like /work
    // forwarded from chat text is indistinguishable from a real branch by shape alone.
    // Membership in getOpenBranches() is the only check that tells the two apart, and
    // it runs before any mutation so a rejected token cannot be written to an issue.
    if (branch && !branches.some(b => b.name === branch)) {
        console.error(`Error: "${branch}" is not an open branch. No issues were assigned.`);
        console.error(`Open branches: ${branches.map(b => b.name).join(', ')}`);
        endTimer('total');
        process.exit(1);
        return;
    }

    // Step 4: Show help if no branch determined
    if (!branch) {
        console.log('Open Branches:');
        branches.forEach((r, i) => {
            const name = r.name || r.version || r;
            const currentMarker = (branches.length === 1) ? ' (current)' : '';
            console.log(`  ${i + 1}. ${name}${currentMarker}`);
        });
        console.log('');
        console.log('Usage:');
        if (branches.length === 1) {
            // Show quick workflow first when there's a current branch
            console.log('  /assign-branch --add-ready         # Quick: assign all ready issues');
            console.log('  /assign-branch #issue              # Assign single issue');
            console.log('  /assign-branch #issue #issue ...   # Assign multiple issues');
        } else {
            console.log('  /assign-branch --add-ready         # Assign all ready issues to current');
        }
        console.log('  /assign-branch #issue --branch <name>  # Assign to specific branch');
        console.log('');
        console.log('Examples:');
        if (currentBranch) {
            console.log(`  /assign-branch --add-ready          # Most common workflow`);
            console.log(`  /assign-branch #123`);
            console.log(`  /assign-branch #123 #124 #125`);
        }
        console.log(`  /assign-branch #123 --branch ${branches[0].version}\n`);
        endTimer('total');
        return;
    }

    // Step 5: Get issues to assign
    if (issueNumbers.length === 0) {
        // Handle --add-ready: assign all Ready issues immediately
        if (addReady) {
            const ready = await getIssuesByStatus('ready');

            if (ready.length === 0) {
                console.log('No unassigned ready issues found.');
                endTimer('total');
                return;
            }

            issueNumbers = ready.map(i => i.number);
            console.log(`Assigning all ${issueNumbers.length} ready issues to ${branch}...\n`);
        } else {
            // Handle backlog listing (no issues specified, no --add-ready)
            const backlog = await getIssuesByStatus('backlog');

            if (backlog.length === 0) {
                console.log('No unassigned backlog issues found.');
                endTimer('total');
                return;
            }

            // Group by type for display
            const epics = backlog.filter(i => i.labels?.includes('epic'));
            const bugs = backlog.filter(i => i.labels?.includes('bug'));
            const enhancements = backlog.filter(i => i.labels?.includes('enhancement'));
            const stories = backlog.filter(i => i.labels?.includes('story'));
            const other = backlog.filter(i =>
                !['epic', 'bug', 'enhancement', 'story'].some(l => i.labels?.includes(l))
            );

            console.log(`Unassigned backlog issues (${backlog.length} total):\n`);

            // Fetch sub-issue counts in parallel for epics
            if (epics.length > 0) {
                console.log('── Epics ──');
                startTimer('epicSubCounts');
                const subCounts = await Promise.all(
                    epics.map(i => getSubIssueCountAsync(i.number))
                );
                endTimer('epicSubCounts');
                epics.forEach((i, idx) => {
                    console.log(`  #${i.number} - ${i.title} (${subCounts[idx]} sub-issues)`);
                });
            }

            if (bugs.length > 0) {
                console.log('\n── Bugs ──');
                bugs.forEach(i => console.log(`  #${i.number} - ${i.title}`));
            }

            if (enhancements.length > 0) {
                console.log('\n── Enhancements ──');
                enhancements.forEach(i => console.log(`  #${i.number} - ${i.title}`));
            }

            if (stories.length > 0) {
                console.log('\n── Stories ──');
                stories.forEach(i => console.log(`  #${i.number} - ${i.title}`));
            }

            if (other.length > 0) {
                console.log('\n── Other ──');
                other.forEach(i => console.log(`  #${i.number} - ${i.title}`));
            }

            console.log('\n---');
            console.log(`To assign specific issues: /assign-branch ${branch} #N #M ...`);
            endTimer('total');
            return;
        }
    }

    // Step 5a: Reject branch trackers as assignment targets (#2403)
    // Branch trackers are container issues, not units of implementation work;
    // assigning one to a branch is always a user mistake. Detected before any
    // mutation (epic expansion, assignment, tracker linking).
    // Labels are fetched once here and shared with Step 5b's epic expansion (#3283).
    const labelMap = await fetchLabelMap(issueNumbers);
    const trackerHits = await findBranchTrackers(issueNumbers, labelMap);
    if (trackerHits.length > 0) {
        for (const num of trackerHits) {
            console.error(`Error: Issue #${num} is a branch tracker and cannot be assigned. Target the sub-issues on the branch instead.`);
        }
        endTimer('total');
        process.exit(1);
        return;
    }

    // Step 5b: Expand epic issues into sub-issues
    // Deduplicated again after expansion: parse-time dedup cannot see a sub-issue the
    // user names explicitly *and* that expansion pulls in via its epic — those arrive
    // as two distinct tokens and only collide once the epic is expanded (#2554).
    const { expanded, epicSubIssues } = await expandEpicSubIssues(issueNumbers, labelMap);
    issueNumbers = [...new Set(expanded)];

    // Step 6: Confirm if large selection
    if (issueNumbers.length >= LARGE_SELECTION_THRESHOLD) {
        console.log(`WARNING: About to assign ${issueNumbers.length} issues to ${branch}.`);
        console.log('If this is too many, cancel and specify individual issue numbers.\n');
    }

    // Step 7: Assign issues (use --branch current when single branch)
    const useCurrent = (currentBranch && branch === currentBranch);

    // Resolve branch tracker from discovered branches (correct for target branch,
    // not just active branch — fixes multi-branch bug #1515)
    const branchEntry = branches.find(b => b.name === branch);
    const tracker = branchEntry ? branchEntry.tracker : null;

    console.log(`Assigning to ${branch}${useCurrent ? ' (current)' : ''}:\n`);

    // One gh call per phase (#3359): a batched move, then a batched link of
    // the issues that were actually assigned.
    const { assigned, link } = await assignAndLink({ issueNumbers, branch, useCurrent, tracker, epicSubIssues });
    // Machine-readable link outcome on request (#3405): work-preamble reads it,
    // since a limit-only outcome exits 0 (#3404) and the exit code cannot say so.
    if (parsed.linkJson) console.log(`LINK_OUTCOME ${JSON.stringify({ tracker: tracker || null, ...link })}`);
    // Fewer assigned than requested is a failure (#3373): work-preamble reads
    // exit 0 as "assigned", so `/work --assign` reported moves that never happened.
    const failed = issueNumbers.filter(num => !assigned.includes(num));
    if (failed.length > 0) {
        console.error(`Error: ${failed.length} of ${issueNumbers.length} issue(s) were not assigned to ${branch}: ${failed.map(n => `#${n}`).join(', ')}`);
        process.exitCode = 1;
    }
    endTimer('total');
}

// ============================================================================
// REMOVE FROM BRANCH (--remove flag)
// ============================================================================

/**
 * Map issues to the open branch tracker that lists them as children.
 *
 * `gh pmu sub remove` takes <parent-issue> <child-issue>..., and an issue does
 * not carry a usable back-pointer to its parent, so the mapping is built from
 * the tracker side: one `gh pmu sub list` per open tracker, once per run
 * rather than once per issue.
 *
 * An issue that no open tracker claims is left unmapped. Guessing a tracker
 * would unlink the issue from a branch it was never on.
 *
 * @param {number[]} issueNumbers - Issues to resolve
 * @returns {Promise<Map<number, number>>} child issue number -> tracker number
 */
async function resolveTrackerForIssues(issueNumbers) {
    const map = new Map();
    const wanted = new Set(issueNumbers.map(Number));
    if (wanted.size === 0) return map;

    for (const { tracker } of getOpenBranches()) {
        if (!tracker) continue;
        const raw = await execAsyncSafe('gh', ['pmu', 'sub', 'list', String(tracker), '--json']);
        const data = safeJsonParse(raw);
        const children = data && Array.isArray(data.children) ? data.children : [];
        for (const child of children) {
            const num = Number(child && child.number);
            if (wanted.has(num) && !map.has(num)) map.set(num, tracker);
        }
    }

    return map;
}

/**
 * Remove a single issue from its branch assignment.
 * Unlinks from tracker, removes assigned label, clears branch field, sets status to backlog.
 *
 * Each operation's result is inspected. `execAsyncSafe` resolves `null` on
 * failure and a (possibly empty) string on success, so the test is against
 * `null` specifically — a successful command with no stdout returns `''`,
 * which is falsy and must not be read as a failure.
 *
 * An operation string is recorded only for an operation that actually
 * completed. Before #2814 all three were pushed unconditionally and every
 * return value was discarded, so the envelope for a wholly failed removal was
 * indistinguishable from a successful one.
 *
 * @param {number} issueNumber - Issue to remove
 * @param {number|null} trackerNumber - Parent branch tracker, from resolveTrackerForIssues
 * @returns {{ ok: boolean, operations: string[], error?: string }}
 */
async function removeFromBranch(issueNumber, trackerNumber) {
    const operations = [];
    const failures = [];
    try {
        // Unlink from branch tracker sub-issues. --force because interactive
        // stdin is unavailable and gh-pmu prompts for confirmation here.
        if (trackerNumber) {
            const unlinked = await execAsyncSafe(
                'gh',
                ['pmu', 'sub', 'remove', String(trackerNumber), String(issueNumber), '--force']
            );
            if (unlinked === null) {
                failures.push(`unlink #${issueNumber} from tracker #${trackerNumber}`);
            } else {
                operations.push(`unlink #${issueNumber} from tracker #${trackerNumber}`);
            }
        } else {
            // Nothing to unlink is not a failure, but it is not an unlink
            // either — say which, rather than claiming one happened.
            operations.push(`no branch tracker found for #${issueNumber} (nothing to unlink)`);
        }

        // Remove assigned label
        const unlabeled = await execAsyncSafe('gh', ['issue', 'edit', String(issueNumber), '--remove-label', 'assigned']);
        if (unlabeled === null) {
            failures.push(`remove assigned label from #${issueNumber}`);
        } else {
            operations.push(`remove assigned label from #${issueNumber}`);
        }

        // Clear branch field and set status to backlog — `--backlog` does both,
        // so the operation names both (#3359)
        const moved = await execAsyncSafe('gh', ['pmu', 'move', String(issueNumber), '--backlog']);
        const backlogOp = `clear Branch field and set status to backlog for #${issueNumber}`;
        if (moved === null) {
            failures.push(backlogOp);
        } else {
            operations.push(backlogOp);
        }

        if (failures.length > 0) {
            return { ok: false, operations, error: `Failed: ${failures.join('; ')}` };
        }
        return { ok: true, operations };
    } catch (err) {
        return { ok: false, operations, error: err.message };
    }
}

/**
 * Remove multiple issues from branch assignment.
 * Handles epic expansion — if an issue is an epic, all sub-issues are also removed.
 * @param {number[]} issueNumbers - Issues to remove
 * @returns {{ removed: number, total: number, results: object[] }}
 */
async function removeIssues(issueNumbers) {
    if (issueNumbers.length === 0) {
        return { removed: 0, total: 0, results: [] };
    }

    // Expand epics to include sub-issues, once each (#3373): an epic named
    // beside its children would otherwise remove every child twice.
    const { expanded: rawExpanded } = await expandEpicSubIssues(issueNumbers);
    const expanded = [...new Set(rawExpanded.map(Number))];

    // Resolve every parent tracker once for the run, not once per issue.
    const trackers = await resolveTrackerForIssues(expanded);

    const results = [];
    let removed = 0;

    for (const num of expanded) {
        const result = await removeFromBranch(num, trackers.get(Number(num)) || null);
        results.push({ issue: num, ...result });
        if (result.ok) removed++;
    }

    return { removed, total: expanded.length, results };
}

// Run main only when executed directly (not when required for testing)
if (require.main === module) {
    main().catch(console.error);
}

// Export functions for testing
module.exports = {
    getLastVersion,
    getIssueLabels,
    fetchLabelMap,
    generateBranchSuggestions,
    getSubIssueCountAsync,
    getOpenBranches,
    getIssuesByStatus,
    assignToBranch,
    assignIssuesToBranch,
    assignAndLink,
    detectMultiChildSubAdd,
    parseSubAddBatchOutput,
    resolveTrackerForIssues,
    removeFromBranch,
    removeIssues,
    linkToTracker,
    linkAllToTracker,
    expandEpicSubIssues,
    classifyExpansionResult,
    findBranchTrackers,
    hasBranchAssigned,
    parseAssignArgs,
    splitQuotedArgs,
    resolveImplicitBranch,
    reportUnresolvedBranch,
    main,
    // Export helpers for testing
    execSyncSafe,
    execAsyncSafe,
    safeJsonParse,
    startTimer,
    endTimer,
    // Export configuration constants
    LARGE_SELECTION_THRESHOLD,
    PARALLEL_BATCH_SIZE,
    PARALLEL_THRESHOLD,
    // Export for mocking
    setShowTiming: (value) => { showTiming = value; }
};
