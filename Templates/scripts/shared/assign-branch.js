#!/usr/bin/env node
// Rubrical Systems (c) 2026
/**
 * @framework-script 0.61.0
 * assign-branch.js
 *
 * Interactive script to assign issues to branches.
 * Used by /assign-branch slash command.
 *
 * Implements: REQ-007 (Assign-Branch Command)
 *
 * Usage:
 *   node assign-branch.js                     # Interactive mode
 *   node assign-branch.js release/v1.0 123    # Direct assignment
 *   node assign-branch.js --add-ready         # Assign all ready issues (immediate)
 *
 * Flags:
 *   --add-ready   Assign all unassigned ready issues (immediate, no listing)
 *   --timing      Show timing information for performance debugging
 *
 * Performance notes:
 *   - Branch discovery uses label-based query (~0.8s) via getAllOpenTrackers()
 *   - gh pmu commands use local caching in .gh-pmu.json (~50ms when cached)
 *   - Parallel sub-issue count fetching for backlog listing
 */

const { exec, execSync } = require('child_process');
const { promisify } = require('util');
const { getAllOpenTrackers } = require('./lib/active-label.js');

const execAsync = promisify(exec);

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
        return execSync(cmd, { encoding: 'utf-8' }).trim();
    } catch {
        return null;
    }
}

async function execAsyncSafe(cmd) {
    try {
        const { stdout } = await execAsync(cmd, { encoding: 'utf-8' });
        return stdout.trim();
    } catch {
        return null;
    }
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
        const tag = execSyncSafe('git describe --tags --abbrev=0 2>/dev/null');
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
    try {
        const result = await execAsyncSafe(`gh issue view ${issueNumber} --json labels -q ".labels[].name"`);
        return result ? result.split('\n').filter(l => l.trim()) : [];
    } catch (err) {
        if (showTiming) console.log(`  ⚠ getIssueLabels(${issueNumber}) failed: ${err.message}`);
    }
    return [];
}

/**
 * Expand epic issues into their sub-issues for bulk assignment.
 * When an issue with the 'epic' label is passed, fetches its sub-issues
 * and adds them to the issue list. Returns both the expanded list and
 * a Set of sub-issue numbers (for tracker linking exclusion).
 *
 * @param {number[]} issueNumbers - Issue numbers from args
 * @returns {Promise<{expanded: number[], epicSubIssues: Set<number>}>}
 */
async function expandEpicSubIssues(issueNumbers) {
    const expanded = [];
    const epicSubIssues = new Set();

    for (const num of issueNumbers) {
        expanded.push(num);
        const labels = await getIssueLabels(num);
        if (!labels.some(l => l.toLowerCase() === 'epic')) continue;

        // Fetch sub-issues for this epic
        const result = await execAsyncSafe(`gh pmu sub list ${num} --json`);
        const data = safeJsonParse(result);
        const children = data && data.children ? data.children : [];

        if (children.length > 0) {
            console.log(`  ↳ Epic #${num}: expanding ${children.length} sub-issues`);
            for (const child of children) {
                expanded.push(child.number);
                epicSubIssues.add(child.number);
            }
        }
    }

    return { expanded, epicSubIssues };
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
    const result = await execAsyncSafe(`gh pmu sub list ${issueNumber} --json`);
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
    const result = await execAsyncSafe(cmd);

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

async function assignToBranch(issueNumber, branch, useCurrent = false) {
    try {
        const branchArg = useCurrent ? 'current' : `"${branch}"`;
        const displayBranch = useCurrent ? `${branch} (current)` : branch;
        console.log(`  → Assigning #${issueNumber} to ${displayBranch}`);
        const moveResult = await execAsyncSafe(`gh pmu move ${issueNumber} --branch ${branchArg} 2>&1`);
        if (moveResult && moveResult.includes('unknown flag')) {
            console.log(`    (Note: gh pmu --branch not supported, manual assignment needed)`);
            return false;
        }
        return true;
    } catch (err) {
        if (showTiming) console.log(`  ⚠ assignToBranch(${issueNumber}) failed: ${err.message}`);
        return false;
    }
}

/**
 * Link a single issue to the branch tracker as a sub-issue.
 * Logs success or failure (never swallows errors silently).
 * @returns {boolean} true if linked, false if failed or skipped
 */
async function linkToTracker(issueNumber, tracker) {
    try {
        const { stdout } = await execAsync(
            `gh pmu sub add ${tracker} ${issueNumber} 2>&1`,
            { encoding: 'utf-8' }
        );
        const output = (stdout || '').trim();
        if (output.includes('already') && (output.includes('parent') || output.includes('sub-issue'))) {
            console.log(`    ⚠ #${issueNumber} already has a parent — skipped`);
            return false;
        }
        console.log(`    ↳ Linked #${issueNumber} to tracker #${tracker}`);
        return true;
    } catch (err) {
        const errMsg = err.stderr || err.message || 'unknown error';
        console.log(`    ⚠ Failed to link #${issueNumber} to tracker #${tracker}: ${errMsg}`);
        return false;
    }
}

/**
 * Link multiple issues to a tracker sequentially.
 * Sequential execution avoids race condition when multiple sub-issue
 * additions target the same parent (GitHub sub-issue API limitation).
 */
async function linkAllToTracker(issueNumbers, tracker) {
    if (!tracker || issueNumbers.length === 0) return;
    console.log(`\nLinking to tracker #${tracker}...`);
    let linked = 0;
    for (const num of issueNumbers) {
        if (await linkToTracker(num, tracker)) {
            linked++;
        }
    }
    console.log(`  ${linked}/${issueNumbers.length} linked to tracker #${tracker}`);
}

async function main() {
    let args = process.argv.slice(2);

    // Handle space-separated arguments passed as a single string (from skill invocation)
    // e.g., "#789 #790 #788" gets passed as one arg instead of three separate args
    if (args.length === 1 && args[0].includes(' ')) {
        args = args[0].split(/\s+/).filter(a => a.trim());
    }

    // Parse args - order-independent parsing
    const addReady = args.includes('--add-ready');
    showTiming = args.includes('--timing');

    // Auto-detect: arguments starting with # are issues, prefix/name patterns are branches
    let branch = args.find(a => !a.startsWith('-') && !a.match(/^#?\d+$/) && a.includes('/'));
    let issueNumbers = args.filter(a => a.match(/^#?\d+$/)).map(a => parseInt(a.replace('#', ''), 10));
    const userInput = args.find(a => !a.startsWith('-') && !a.includes('/') && !a.match(/^#?\d+$/));

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
        const labels = issueNumbers.length > 0 ? await getIssueLabels(issueNumbers[0]) : [];

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

    // Step 3: Single-branch shortcut - if only one branch and issues/flags provided, use current
    if (!branch && currentBranch && (issueNumbers.length > 0 || addReady)) {
        branch = currentBranch;
        console.log(`Using current branch: ${branch}\n`);
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
        console.log('  /assign-branch prefix/name #issue  # Assign to specific branch');
        console.log('');
        console.log('Examples:');
        if (currentBranch) {
            console.log(`  /assign-branch --add-ready          # Most common workflow`);
            console.log(`  /assign-branch #123`);
            console.log(`  /assign-branch #123 #124 #125`);
        }
        console.log(`  /assign-branch ${branches[0].version} #123\n`);
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

    // Step 5b: Expand epic issues into sub-issues
    const { expanded, epicSubIssues } = await expandEpicSubIssues(issueNumbers);
    issueNumbers = expanded;

    // Step 6: Confirm if large selection
    if (issueNumbers.length >= LARGE_SELECTION_THRESHOLD) {
        console.log(`WARNING: About to assign ${issueNumbers.length} issues to ${branch}.`);
        console.log('If this is too many, cancel and specify individual issue numbers.\n');
    }

    // Step 7: Assign issues (use --branch current when single branch)
    let totalAssigned = 0;
    const useCurrent = (currentBranch && branch === currentBranch);

    // Resolve branch tracker from discovered branches (correct for target branch,
    // not just active branch — fixes multi-branch bug #1515)
    const branchEntry = branches.find(b => b.name === branch);
    const tracker = branchEntry ? branchEntry.tracker : null;

    console.log(`Assigning to ${branch}${useCurrent ? ' (current)' : ''}:\n`);

    // Collect issue numbers for deferred tracker linking (serialized post-pass)
    const issuesToLink = [];

    // For parallel assignment (when multiple issues)
    if (issueNumbers.length > PARALLEL_THRESHOLD) {
        startTimer('parallelAssign');
        for (let i = 0; i < issueNumbers.length; i += PARALLEL_BATCH_SIZE) {
            const batch = issueNumbers.slice(i, i + PARALLEL_BATCH_SIZE);
            const results = await Promise.all(
                batch.map(num => assignToBranch(num, branch, useCurrent).then(assigned => ({ num, assigned })))
            );

            for (const r of results) {
                if (r.assigned) {
                    totalAssigned++;
                    issuesToLink.push(r.num);
                }
            }
        }
        endTimer('parallelAssign');
    } else {
        // Sequential for small batches (simpler output)
        for (const num of issueNumbers) {
            if (await assignToBranch(num, branch, useCurrent)) {
                totalAssigned++;
                issuesToLink.push(num);
            }
        }
    }

    console.log(`\n✓ ${totalAssigned} issues assigned to ${branch}${useCurrent ? ' (current)' : ''}`);

    // Phase 2: Sequential tracker linking (avoids race condition on same parent)
    // Epic sub-issues are excluded — they already have the epic as parent
    const linkableIssues = issuesToLink.filter(num => !epicSubIssues.has(num));
    if (tracker && linkableIssues.length > 0) {
        await linkAllToTracker(linkableIssues, tracker);
    }
    endTimer('total');
}

// Run main only when executed directly (not when required for testing)
if (require.main === module) {
    main().catch(console.error);
}

// Export functions for testing
module.exports = {
    getLastVersion,
    getIssueLabels,
    generateBranchSuggestions,
    getSubIssueCountAsync,
    getOpenBranches,
    getIssuesByStatus,
    assignToBranch,
    linkToTracker,
    linkAllToTracker,
    expandEpicSubIssues,
    hasBranchAssigned,
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
