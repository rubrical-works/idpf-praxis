#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.66.1
 * @description Recommend semver bump based on commit types. Classifies commits via conventional commit prefixes (feat:, fix:) with fallback to issue label lookup via GitHub API. Returns major/minor/patch recommendation with rationale. Used by /prepare-release version determination.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const { execSync } = require('child_process');

function parseVersion(tag) {
    const match = tag.replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match) return null;
    return { major: parseInt(match[1]), minor: parseInt(match[2]), patch: parseInt(match[3]) };
}

function incVersion(v, type) {
    if (type === 'major') return `${v.major + 1}.0.0`;
    if (type === 'minor') return `${v.major}.${v.minor + 1}.0`;
    return `${v.major}.${v.minor}.${v.patch + 1}`;
}

/**
 * Extract issue numbers from commit messages.
 * Matches patterns: Refs #NNN, Part of #NNN, Fixes #NNN, Closes #NNN, Resolves #NNN
 * @param {string} message - Commit message
 * @returns {number[]} Array of issue numbers found
 */
function extractIssueNumbers(message) {
    if (!message) return [];
    const matches = message.match(/#(\d+)/g);
    if (!matches) return [];
    return matches.map(m => parseInt(m.slice(1)));
}

/**
 * Classify commit type based on issue labels.
 * @param {string[]} labels - Array of label names from the issue
 * @returns {'feature'|'fix'|'other'} Classification
 */
function classifyByIssueLabels(labels) {
    if (!labels || labels.length === 0) return 'other';
    const featureLabels = ['enhancement', 'story', 'epic'];
    const fixLabels = ['bug'];
    if (labels.some(l => featureLabels.includes(l))) return 'feature';
    if (labels.some(l => fixLabels.includes(l))) return 'fix';
    return 'other';
}

/**
 * Classify commit type based on keyword heuristics in the message.
 * Keywords must be word-bounded (not substrings).
 * @param {string} message - Commit message
 * @returns {'feature'|'fix'|'other'} Classification
 */
function classifyByKeywords(message) {
    if (!message) return 'other';
    const lower = message.toLowerCase();
    const featureKeywords = ['add', 'implement', 'new', 'create', 'introduce'];
    const fixKeywords = ['fix', 'resolve', 'repair', 'patch', 'correct'];
    for (const kw of featureKeywords) {
        if (new RegExp(`\\b${kw}\\b`).test(lower)) return 'feature';
    }
    for (const kw of fixKeywords) {
        if (new RegExp(`\\b${kw}\\b`).test(lower)) return 'fix';
    }
    return 'other';
}

/**
 * Classify a single commit message.
 *
 * Classification priority:
 * 1. Conventional commit prefixes (feat:, fix:, feat!:, BREAKING CHANGE)
 * 2. Refs #NNN → issue label lookup (if lookupLabels provided)
 * 3. Keyword heuristics as fallback
 *
 * @param {string} message - Commit message
 * @param {function} [lookupLabels] - Optional fn(issueNumber) → string[] of labels
 * @returns {'breaking'|'feature'|'fix'|'other'} Classification
 */
function classifyCommit(message, lookupLabels) {
    if (!message) return 'other';

    // 1. Check for breaking changes
    if (message.includes('BREAKING CHANGE') || /^\w+!:/.test(message)) {
        return 'breaking';
    }

    // 2. Check for conventional commit prefixes
    if (/^feat[(:]/i.test(message)) return 'feature';
    if (/^fix[(:]/i.test(message)) return 'fix';
    if (/^(chore|docs|refactor|style|test|ci|build|perf)[(:]/i.test(message)) return 'other';

    // 3. Try Refs #NNN → issue label lookup
    const issueNumbers = extractIssueNumbers(message);
    if (issueNumbers.length > 0 && lookupLabels) {
        for (const num of issueNumbers) {
            try {
                const labels = lookupLabels(num);
                if (labels && labels.length > 0) {
                    const classification = classifyByIssueLabels(labels);
                    if (classification !== 'other') return classification;
                }
            } catch {
                // Graceful fallback — continue to keyword heuristics
            }
        }
    }

    // 4. Keyword heuristic fallback
    return classifyByKeywords(message);
}

/**
 * Look up issue labels via gh CLI.
 * @param {number} issueNumber
 * @returns {string[]} Array of label names, or empty array on failure
 */
function lookupIssueLabels(issueNumber) {
    try {
        const output = execSync(
            `gh issue view ${issueNumber} --json labels --jq="[.labels[].name]"`,
            { encoding: 'utf8', timeout: 5000 }
        ).trim();
        return JSON.parse(output);
    } catch {
        return [];
    }
}

async function main() {
    try {
        // Get last semantic version tag (v*.*.*), ignoring branch names
        let lastTag;
        try {
            lastTag = execSync('git tag -l "v*" --sort=-v:refname', {
                encoding: 'utf8'
            }).trim().split('\n')[0];

            if (!lastTag) {
                throw new Error('No version tags found');
            }
        } catch {
            console.log(JSON.stringify({
                success: true,
                message: 'No previous version. Recommend v0.1.0 or v1.0.0.',
                data: { recommendedVersion: 'v0.1.0', reason: 'initial-release' }
            }));
            return;
        }

        const current = parseVersion(lastTag);
        if (!current) {
            console.log(JSON.stringify({
                success: false,
                message: `Could not parse version from tag: ${lastTag}`
            }));
            process.exit(1);
        }

        const rawLog = execSync(`git log ${lastTag}..HEAD --pretty=format:"%s"`, {
            encoding: 'utf8'
        }).trim();

        const lines = rawLog ? rawLog.split('\n') : [];
        let hasBreaking = false, hasFeatures = false;

        for (const line of lines) {
            const type = classifyCommit(line, lookupIssueLabels);
            if (type === 'breaking') hasBreaking = true;
            if (type === 'feature') hasFeatures = true;
            // fix commits default to patch (no flag needed)
        }

        let bump, reason;
        if (hasBreaking) {
            bump = 'major';
            reason = 'breaking change(s)';
        } else if (hasFeatures) {
            bump = 'minor';
            reason = 'new feature(s)';
        } else {
            bump = 'patch';
            reason = 'fixes and maintenance';
        }

        const next = incVersion(current, bump);
        const recommendedVersion = `v${next}`;

        console.log(JSON.stringify({
            success: true,
            message: `Recommend ${recommendedVersion} (${bump}): ${reason}`,
            data: { recommendedVersion, bumpType: bump, reason, lastTag }
        }));

    } catch (err) {
        console.log(JSON.stringify({
            success: false,
            message: `Version recommendation failed: ${err.message}`
        }));
        process.exit(1);
    }
}

// Export for testing; run main() only when executed directly
if (require.main === module) {
    main();
}

module.exports = {
    parseVersion,
    incVersion,
    extractIssueNumbers,
    classifyByKeywords,
    classifyByIssueLabels,
    classifyCommit,
    lookupIssueLabels
};
