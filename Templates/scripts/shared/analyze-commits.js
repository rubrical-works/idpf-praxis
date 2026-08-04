#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.95.0
 * @description Parse git commits since the last semver tag and categorize by conventional commit type (feat, fix, chore, etc.). Extracts type, scope, breaking change flags, and issue references. Used by /prepare-release and piped into generate-changelog.js.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

// Spawns bounded via lib/exec.js (#2469) — aliased to the original names
// so call sites are unchanged.
const { execTimed: execSync, execFileTimed: execFileSync } = require('./lib/exec.js');
const { classifyCommit } = require('./lib/deployment-scope');
const { validateTag } = require('./lib/input-validation');

/**
 * Build validated `git log` array-args for the commit range since lastTag.
 * lastTag comes from `git tag` output; a hostile tag from a compromised remote
 * would otherwise inject via string interpolation (#2456). Validate it and
 * return discrete args so git is invoked without a shell.
 * @param {string} lastTag
 * @returns {string[]} execFileSync args for `git`
 */
function buildLogArgs(lastTag) {
  const safeTag = validateTag(lastTag);
  return ['log', `${safeTag}..HEAD`, '--pretty=format:%H|%s'];
}

function parseConventionalCommit(message) {
    // Split into two patterns to avoid nested quantifiers flagged by safe-regex
    const withScope = message.match(/^(\w+)\(([\w-]+)\)(!)?: (.+)/);
    if (withScope) {
        const [, type, scope, bang, msg] = withScope;
        return { type, scope, message: msg, breaking: !!bang || message.includes('BREAKING CHANGE') };
    }
    const withoutScope = message.match(/^(\w+)(!)?: (.+)/);
    if (!withoutScope) {
        return { type: 'other', scope: null, message, breaking: false };
    }
    const [, type, bang, msg] = withoutScope;
    const breaking = !!bang || message.includes('BREAKING CHANGE');
    return { type, scope: null, message: msg, breaking };
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
                message: 'No previous tags found',
                data: { lastTag: null, commits: [], summary: { total: 0 } }
            }));
            return;
        }

        const rawLog = execFileSync('git', buildLogArgs(lastTag), {
            encoding: 'utf8'
        }).trim();

        if (!rawLog) {
            console.log(JSON.stringify({
                success: true,
                message: `No commits since ${lastTag}`,
                data: { lastTag, commits: [], summary: { total: 0 } }
            }));
            return;
        }

        const commits = rawLog.split('\n').map(line => {
            const [hash, ...rest] = line.split('|');
            const message = rest.join('|');
            const parsed = parseConventionalCommit(message);
            // Get changed files for deployment scope classification
            let files = [];
            try {
                const filesRaw = execSync(`git diff-tree --no-commit-id --name-only -r ${hash}`, {
                    encoding: 'utf8'
                }).trim();
                files = filesRaw ? filesRaw.split('\n') : [];
            } catch { /* ignore — scope defaults to dev-only */ }
            const deploymentScope = classifyCommit(files);
            return { hash: hash.substring(0, 7), ...parsed, files, deploymentScope };
        });

        const summary = {
            total: commits.length,
            feat: commits.filter(c => c.type === 'feat').length,
            fix: commits.filter(c => c.type === 'fix').length,
            breaking: commits.filter(c => c.breaking).length
        };

        console.log(JSON.stringify({
            success: true,
            message: `Analyzed ${summary.total} commits since ${lastTag}`,
            data: { lastTag, commits, summary }
        }));

    } catch (err) {
        console.log(JSON.stringify({
            success: false,
            message: `Commit analysis failed: ${err.message}`
        }));
        process.exit(1);
    }
}

if (require.main === module) main();

module.exports = { buildLogArgs };
