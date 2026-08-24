#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.97.0
 * @description Switch between branch contexts with interactive selection or direct branch name. Lists open branch trackers, validates target branch exists, performs git checkout, and updates active label. Used by /switch-branch command.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

// Spawns bounded via lib/exec.js (#2469) — aliased to the original names
// so call sites are unchanged.
const { execFileTimed: execFileSync } = require('./lib/exec.js');
const { ensureActiveLabel, getTrackerForBranch } = require('./lib/active-label');
const { validateBranchName } = require('./lib/input-validation');
// Constant only. fetchUpstream() itself is not reusable here: it derives remote
// and merge ref from `git config branch.<branch>.remote`/`.merge`, neither of
// which exists for a branch with no local ref — exactly this issue's case, where
// it returns false immediately (#2512).
const { FETCH_TIMEOUT_MS } = require('./branch-sync-check');

function exec(cmd) {
    try {
        const parts = cmd.split(/\s+/);
        return execFileSync(parts[0], parts.slice(1), { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch (_e) {
        return null;
    }
}

// Variant of exec() that reports *why* a command failed (#2511). exec()
// collapses failure and empty output to the same `null`, which is fine for the
// git callers that only ask "did this work", but hides a `gh pmu` error behind
// "No open branches found." Kept separate rather than folded into exec():
// three of exec()'s five call sites treat null as the contract — branchExists()
// most explicitly — so changing the shared helper would ripple through every
// git path in this file for a defect scoped to one of them.
function execResult(cmd) {
    try {
        const parts = cmd.split(/\s+/);
        const stdout = execFileSync(parts[0], parts.slice(1), { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
        return { ok: true, stdout: String(stdout).trim(), stderr: '' };
    } catch (e) {
        // execFileSync throws only on non-zero exit or spawn failure, so this
        // branch *is* the failure signal. A tool that reported an error while
        // exiting 0 would not land here — see the KNOWN LIMIT test.
        const stderr = e && e.stderr ? String(e.stderr).trim() : '';
        return { ok: false, stdout: '', stderr: stderr || (e && e.message) || 'unknown error' };
    }
}

// Returns { ok: true, branches } or { ok: false, error }. The caller must not
// read an empty `branches` as "no branches exist" without checking `ok` first.
function getOpenBranches() {
    // Note: gh pmu branch list has no JSON support, parse text output
    // Format: "VERSION      CODENAME        TRACKER    STATUS"
    const result = execResult('gh pmu branch list');
    if (!result.ok) {
        return { ok: false, error: result.stderr, branches: [] };
    }

    const lines = result.stdout.split('\n').slice(2); // Skip header rows
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
    return { ok: true, branches };
}

function getCurrentBranch() {
    return exec('git branch --show-current');
}

// Prefer 'origin'; fall back to whatever remote is configured.
function getDefaultRemote() {
    const remotes = exec('git remote');
    if (!remotes) return null;
    const list = remotes.split('\n').map(r => r.trim()).filter(Boolean);
    if (list.length === 0) return null;
    return list.includes('origin') ? 'origin' : list[0];
}

// Best-effort refresh of one remote-tracking ref, so a stale ref does not
// produce a false negative. Follows fetchUpstream()'s discipline
// (branch-sync-check.js:41-65): single ref, bounded, non-interactive,
// failure-tolerant. A bare `git fetch` would pull every branch on the remote,
// and an unbounded one reintroduces the hang #2518 landed to fix.
function fetchRemoteRef(remote, branch) {
    try {
        execFileSync('git', ['fetch', '--quiet', remote, branch], {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: FETCH_TIMEOUT_MS,
            // A credential prompt would block until the timeout fires; refusing
            // it turns that into an immediate, catchable failure.
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
        });
        return true;
    } catch (_e) {
        // Accuracy degrades, availability does not: the possibly-stale
        // remote-tracking ref is still consulted below.
        return false;
    }
}

// Resolves local refs first, then the remote-tracking ref. A tracker whose
// branch was pushed but never checked out locally has no local ref, so a
// local-only lookup reported it nonexistent while the no-argument listing
// showed it as available (#2512).
function branchExists(branch) {
    if (exec(`git rev-parse --verify ${branch}`) !== null) {
        return true;
    }

    const remote = getDefaultRemote();
    if (!remote) return false;

    fetchRemoteRef(remote, branch);
    return exec(`git rev-parse --verify refs/remotes/${remote}/${branch}`) !== null;
}

// `git branch -r` includes the symbolic ref line `origin/HEAD -> origin/main`,
// which is not a branch, and prefixes every entry with the remote name. Neither
// is a valid argument to this command, so both are removed before display.
function getRemoteBranchCandidates() {
    const raw = exec('git branch -r --format=%(refname:short)');
    if (!raw) return [];
    const out = [];
    for (const line of raw.split('\n')) {
        const entry = line.trim();
        if (!entry || entry.includes('->')) continue;
        const slash = entry.indexOf('/');
        if (slash === -1) continue; // bare remote name: the HEAD symref
        const name = entry.slice(slash + 1);
        if (!name || name === 'HEAD' || name === 'main') continue;
        out.push(name);
    }
    return out;
}

function main() {
    const args = process.argv.slice(2);
    // Accept any argument as a branch name (generic {prefix}/{name} detection)
    const rawBranch = args.find(a => a.includes('/')) || args[0] || null;
    const targetBranch = rawBranch ? validateBranchName(rawBranch) : null;

    console.log('=== Switch Branch ===\n');

    const currentBranch = getCurrentBranch();
    console.log(`Current branch: ${currentBranch}\n`);

    // Step 1: No argument — list available branches
    if (!targetBranch) {
        const listing = getOpenBranches();

        // Report the failure instead of the empty list. Suggesting "create a
        // branch" here is what makes the masked error dangerous: acting on it
        // opens a second tracker for a branch that already has one (#2511).
        if (!listing.ok) {
            console.log(`Failed to list branches: ${listing.error}`);
            console.log('\nThis is a `gh pmu` failure, not an empty branch list —');
            console.log('open branch trackers may well exist. Resolve the error above and retry.');
            return;
        }

        const branches = listing.branches;
        if (branches.length === 0) {
            console.log('No open branches found.');
            console.log('\nCreate one with: gh pmu branch start --name "release/vX.Y.Z"');
            return;
        }

        console.log('Available Branches:');
        branches.forEach((b, i) => {
            const name = b.name || b.version || b;
            const branch = b.branch || name;
            const marker = currentBranch === branch ? ' ← current' : '';
            console.log(`  [${i + 1}] ${name}${marker}`);
        });

        console.log('\nUsage: /switch-branch <branch>');
        console.log('Example: /switch-branch release/v2.0.0\n');
        return;
    }

    // Step 2: Switch to specified branch
    if (!branchExists(targetBranch)) {
        console.log(`Branch '${targetBranch}' does not exist.`);
        console.log('\nAvailable branches:');
        const allBranches = exec('git branch --format=%(refname:short)');
        const localList = allBranches
            ? allBranches.split('\n').map(b => b.trim()).filter(b => b && b !== 'main')
            : [];
        // On a fresh clone the local list is empty, which previously left the
        // user with an empty listing under "Available branches" (#2512).
        const candidates = Array.from(new Set([...localList, ...getRemoteBranchCandidates()]));
        if (candidates.length > 0) {
            candidates.forEach(b => console.log(`  ${b}`));
        } else {
            console.log('  (none found)');
        }
        return;
    }

    if (currentBranch === targetBranch) {
        console.log(`Already on branch '${targetBranch}'.`);
    } else {
        console.log(`Switching to branch '${targetBranch}'...`);
        const switchResult = exec(`git checkout ${targetBranch}`);
        if (switchResult !== null) {
            console.log(`✓ Switched to ${targetBranch}`);
        } else {
            console.log('✗ Failed to switch branch. Check for uncommitted changes.');
            return;
        }
    }

    console.log('\n✓ Context switched to branch: ' + targetBranch);

    // Update active label on branch tracker
    const tracker = getTrackerForBranch();
    if (tracker) {
        ensureActiveLabel(tracker);
    }
}

if (require.main === module) {
    main();
}

module.exports = { main, getOpenBranches, getCurrentBranch, branchExists };
