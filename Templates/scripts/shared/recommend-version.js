#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.100.2
 * @description Recommend semver bump based on commit types. Classifies commits via conventional commit prefixes (feat:, fix:) with fallback to issue label lookup via GitHub API. Returns major/minor/patch recommendation with rationale. Used by /prepare-release version determination, and by /prepare-beta with --prerelease for prerelease lines.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

// Spawns bounded via lib/exec.js (#2469) — aliased to the original names
// so call sites are unchanged.
const { execTimed: execSync } = require('./lib/exec.js');

/** Semver prerelease/build identifier characters. */
const PRERELEASE_IDENTIFIER = /^[0-9A-Za-z-]+$/;

/**
 * Parse a version tag into its components.
 *
 * The prerelease segment is **captured**, not discarded (#2585). The previous
 * regex was unanchored and had no prerelease group, so `v0.20.0-beta.4` reduced
 * to `0.20.0` with no warning and a beta line was indistinguishable from the
 * stable release it descends from.
 *
 * Anchoring alone would have been the wrong fix: with no capture group, `$`
 * returns null for every prerelease tag, and main() exits 1 on null — that
 * hard-fails /prepare-release and /prepare-beta in any repo whose newest tag is
 * a beta. Capture and anchor together, or neither.
 *
 * @param {string} tag - Version tag, with or without the `v` prefix
 * @returns {{major:number,minor:number,patch:number,prerelease:string|null}|null}
 */
function parseVersion(tag) {
    // Build metadata is stripped before matching, and the optional prerelease
    // segment is a separate flat pattern rather than `(?:-…+)?`. A `?` wrapping
    // a `+` is star height 2, which `security/detect-unsafe-regex` rejects as an
    // error in this repo. The `?` makes catastrophic backtracking unreachable —
    // it matches at most once, so there is no ambiguity to explore — but the
    // rule is a hard CI gate, so the pattern is kept flat instead of suppressed.
    const core = String(tag).replace(/^v/, '').split('+')[0];
    const stable = core.match(/^(\d+)\.(\d+)\.(\d+)$/);
    const prerelease = stable ? null : core.match(/^(\d+)\.(\d+)\.(\d+)-([0-9A-Za-z.-]+)$/);
    const match = stable || prerelease;
    if (!match) return null;
    return {
        major: parseInt(match[1]),
        minor: parseInt(match[2]),
        patch: parseInt(match[3]),
        prerelease: match[4] || null
    };
}

function incVersion(v, type) {
    if (type === 'major') return `${v.major + 1}.0.0`;
    if (type === 'minor') return `${v.major}.${v.minor + 1}.0`;
    return `${v.major}.${v.minor}.${v.patch + 1}`;
}

/**
 * Produce the next prerelease version.
 *
 * Two distinct cases, both in the script's remit (#2585 AC3):
 * - **Continuing a line.** The last tag already carries the requested
 *   identifier, so the core is held and the counter advances:
 *   `v0.20.0-beta.4` → `v0.20.0-beta.5`. A counterless segment (`-beta`) is
 *   treated as counter 0, which is also its semver ordering.
 * - **Opening a line.** The last tag is stable, or carries a different
 *   identifier. From a stable tag the core is bumped by `type` first, so the
 *   beta precedes the release it leads to: `v0.20.0` + minor →
 *   `v0.21.0-beta.1`. From a different identifier the core is held —
 *   `v0.20.0-alpha.3` → `v0.20.0-beta.1` — because alpha and beta are stages of
 *   one release, not successive releases.
 *
 * @param {{major:number,minor:number,patch:number,prerelease:string|null}} v
 * @param {'major'|'minor'|'patch'} type - Bump type, used only when opening a line from a stable tag
 * @param {string} [identifier='beta'] - Prerelease identifier
 * @returns {string} Version string without the `v` prefix
 */
function incPrerelease(v, type, identifier = 'beta') {
    const core = v.prerelease
        ? `${v.major}.${v.minor}.${v.patch}`
        : incVersion(v, type);

    if (v.prerelease) {
        // Split rather than `(?:\.(\d+))?` — same flat-pattern reason as
        // parseVersion. A counterless segment (`-beta`) is counter 0, which is
        // also its semver ordering against `-beta.1`.
        const withCounter = v.prerelease.match(/^([0-9A-Za-z-]+)\.(\d+)$/);
        const bare = withCounter ? null : v.prerelease.match(/^[0-9A-Za-z-]+$/);
        const name = withCounter ? withCounter[1] : (bare ? bare[0] : null);
        if (name === identifier) {
            const counter = withCounter ? parseInt(withCounter[2], 10) : 0;
            return `${core}-${identifier}.${counter + 1}`;
        }
    }

    return `${core}-${identifier}.1`;
}

/**
 * Determine prerelease context from the caller's arguments (#2585 AC4).
 *
 * The caller decides, not the last tag. Inference from git state cannot resolve
 * the case that matters most — last tag stable, operator opening a beta line —
 * because nothing in the repository distinguishes it from an ordinary release.
 * `/prepare-beta` knows; the script does not.
 *
 * @param {string[]} argv - Arguments after the script name
 * @returns {{prerelease:boolean, identifier:string|null}}
 * @throws {Error} If the identifier is not a valid semver identifier
 */
function parsePrereleaseArg(argv = []) {
    const index = argv.findIndex(a => a === '--prerelease' || a.startsWith('--prerelease='));
    if (index === -1) return { prerelease: false, identifier: null };

    let identifier = 'beta';
    const token = argv[index];
    if (token.startsWith('--prerelease=')) {
        identifier = token.slice('--prerelease='.length);
    } else {
        const next = argv[index + 1];
        // A following flag is an adjacent argument, not this flag's value.
        if (next && !next.startsWith('-')) identifier = next;
    }

    if (!PRERELEASE_IDENTIFIER.test(identifier)) {
        throw new Error(`Invalid prerelease identifier: ${String(identifier).substring(0, 30)}`);
    }
    return { prerelease: true, identifier };
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
    // Split into two patterns rather than one optional-scope pattern (#2603).
    // /^\w+(\([^)]*\))?!:/ is rejected by security/detect-unsafe-regex, and so
    // are the non-capturing and bounded-type variants -- it is the optionality
    // the rule objects to, not the capture or the unbounded \w+. lib/git.js
    // already splits for the same reason, under the same comment.
    if (message.includes('BREAKING CHANGE')) return 'breaking';
    if (/^\w+!:/.test(message)) return 'breaking';
    if (/^\w+\([^)]*\)!:/.test(message)) return 'breaking';

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
        const { prerelease, identifier } = parsePrereleaseArg(process.argv.slice(2));

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
            // Degenerate case of opening a prerelease line: there is no tag to
            // bump from, so the identifier is appended to the initial version.
            const initial = prerelease ? `v0.1.0-${identifier}.1` : 'v0.1.0';
            console.log(JSON.stringify({
                success: true,
                message: `No previous version. Recommend ${initial}${prerelease ? '' : ' or v1.0.0'}.`,
                data: { recommendedVersion: initial, reason: 'initial-release' }
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

        const next = prerelease
            ? incPrerelease(current, bump, identifier)
            : incVersion(current, bump);
        const recommendedVersion = `v${next}`;

        // The discarded segment is reported rather than swallowed. Stable
        // recommendation from a prerelease tag is unchanged (#2585 AC6) — what
        // changes is that the operator is told, instead of having to notice.
        const warnings = [];
        if (!prerelease && current.prerelease) {
            warnings.push(
                `Last tag ${lastTag} is a prerelease. Recommending a stable version from its ` +
                `${current.major}.${current.minor}.${current.patch} core; the -${current.prerelease} ` +
                `segment does not affect the bump. Pass --prerelease to continue the prerelease line.`
            );
        }

        console.log(JSON.stringify({
            success: true,
            message: `Recommend ${recommendedVersion} (${bump}): ${reason}`,
            warnings,
            data: {
                recommendedVersion,
                bumpType: bump,
                reason,
                lastTag,
                lastTagPrerelease: current.prerelease,
                prerelease: prerelease ? identifier : null
            }
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
    incPrerelease,
    parsePrereleaseArg,
    extractIssueNumbers,
    classifyByKeywords,
    classifyByIssueLabels,
    classifyCommit,
    lookupIssueLabels
};
