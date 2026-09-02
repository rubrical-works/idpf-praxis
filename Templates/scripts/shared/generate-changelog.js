#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.100.2
 * @description Generate a Keep a Changelog formatted entry from categorized commits. Accepts piped input from analyze-commits.js or reads commits directly. Groups changes by type (Added, Changed, Fixed, Removed) with issue references. Used by /prepare-release.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const git = require('./lib/git');
const out = require('./lib/output');

function showHelp() {
    console.log(`
generate-changelog.js - Generate CHANGELOG entry from commits

Usage:
  node generate-changelog.js [options]
  node analyze-commits.js | node generate-changelog.js --version v0.8.0

Options:
  --version <version>   Version for header (required)
  --date <date>         Date for header (default: today YYYY-MM-DD)
  --quiet               Suppress non-output messages
  --help                Show this help message

Output format (Keep a Changelog):
  ## [0.8.0] - 2025-12-14

  ### Added
  - New feature description

  ### Fixed
  - Bug fix description

Examples:
  node generate-changelog.js --version v0.8.0
  node analyze-commits.js | node generate-changelog.js --version v0.8.0
`);
}

/**
 * Read a JSON envelope from stdin.
 *
 * Previously this resolved null after a fixed 100ms if no data had arrived
 * yet. analyze-commits.js spawns git once per commit and routinely takes
 * longer than that, so the piped input was silently discarded and the script
 * fell back to its own analysis — nondeterministic, and the fallback loses the
 * deploymentScope classification that populates the Internal section (#2465).
 *
 * Now: a TTY resolves null immediately (nothing is being piped); a non-TTY is
 * read to 'end' with no timer at all. Malformed JSON rejects rather than
 * resolving null, so bad input is reported instead of silently triggering the
 * fallback path.
 *
 * @param {object} [deps] - `stdin` override for tests
 * @returns {Promise<object|null>} parsed envelope, or null when nothing was piped
 */
async function readStdin(deps = {}) {
    const stdin = deps.stdin || process.stdin;

    return new Promise((resolve, reject) => {
        let data = '';

        if (stdin.isTTY) {
            resolve(null);
            return;
        }

        stdin.setEncoding('utf8');
        stdin.on('data', chunk => data += chunk);
        stdin.on('error', err => reject(new Error(`Failed to read stdin: ${err.message}`)));
        stdin.on('end', () => {
            if (!data.trim()) {
                resolve(null);
                return;
            }
            try {
                resolve(JSON.parse(data));
            } catch (err) {
                reject(new Error(`Failed to parse JSON from stdin: ${err.message}`));
            }
        });
    });
}

/**
 * Pull the commit list out of whatever shape arrived on stdin.
 *
 * analyze-commits.js emits {success, message, data:{lastTag, commits, summary}},
 * but main() read `analysis.commits` — undefined — so generateChangelog's
 * for-of threw "commits is not iterable" on every real pipe (#2465). The bare
 * `commits` shape is still accepted for hand-built input and the internal
 * fallback path.
 *
 * @param {object|null} analysis
 * @returns {Array<object>|null} the commits array, or null when absent
 */
function extractCommits(analysis) {
    if (!analysis) return null;
    if (analysis.data && Array.isArray(analysis.data.commits)) {
        return analysis.data.commits;
    }
    if (Array.isArray(analysis.commits)) {
        return analysis.commits;
    }
    return null;
}

function formatDate(dateStr) {
    if (dateStr) return dateStr;
    const now = new Date();
    return now.toISOString().split('T')[0];
}

function generateChangelog(commits, version, date) {
    const sections = {
        added: [],
        changed: [],
        deprecated: [],
        removed: [],
        fixed: [],
        security: [],
        internal: []
    };

    // Categorize commits — dev-only commits go to Internal
    for (const commit of commits) {
        const entry = `- ${capitalizeFirst(commit.message)}`;

        // Dev-only commits grouped under Internal
        if (commit.deploymentScope === 'dev-only') {
            sections.internal.push(entry);
            continue;
        }

        switch (commit.type) {
            case 'feat':
                sections.added.push(entry);
                break;
            case 'fix':
                sections.fixed.push(entry);
                break;
            case 'docs':
            case 'style':
            case 'refactor':
            case 'perf':
            case 'chore':
                sections.changed.push(entry);
                break;
            case 'security':
                sections.security.push(entry);
                break;
            default:
                // Put other commits in changed
                if (commit.message) {
                    sections.changed.push(entry);
                }
        }

        // Breaking changes get special mention
        if (commit.breaking) {
            const breakingEntry = `- **BREAKING:** ${capitalizeFirst(commit.message)}`;
            if (!sections.changed.includes(breakingEntry)) {
                sections.changed.unshift(breakingEntry);
            }
        }
    }

    // Build markdown
    const cleanVersion = version.replace(/^v/, '');
    let md = `## [${cleanVersion}] - ${date}\n`;

    if (sections.added.length > 0) {
        md += `\n### Added\n${sections.added.join('\n')}\n`;
    }

    if (sections.changed.length > 0) {
        md += `\n### Changed\n${sections.changed.join('\n')}\n`;
    }

    if (sections.deprecated.length > 0) {
        md += `\n### Deprecated\n${sections.deprecated.join('\n')}\n`;
    }

    if (sections.removed.length > 0) {
        md += `\n### Removed\n${sections.removed.join('\n')}\n`;
    }

    if (sections.fixed.length > 0) {
        md += `\n### Fixed\n${sections.fixed.join('\n')}\n`;
    }

    if (sections.security.length > 0) {
        md += `\n### Security\n${sections.security.join('\n')}\n`;
    }

    if (sections.internal.length > 0) {
        md += `\n### Internal\n${sections.internal.join('\n')}\n`;
    }

    return md;
}

function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

async function main() {
    const flags = out.parseFlags();

    if (flags.help) {
        showHelp();
        process.exit(0);
    }

    // Parse options
    const version = out.getFlag(flags.args, '--version');
    const date = formatDate(out.getFlag(flags.args, '--date'));

    if (!version) {
        out.error('Version is required. Use --version <version>');
        process.exit(1);
    }

    // Try to read piped input
    const analysis = await readStdin();
    let commits = extractCommits(analysis);

    // If no piped input, analyze commits ourselves. Note this fallback cannot
    // set deploymentScope, so the Internal section stays empty — which is why
    // silently landing here on a slow pipe was a real defect (#2465).
    if (commits === null) {
        if (analysis) {
            out.error('Piped input did not contain a commits array (expected data.commits)');
            process.exit(1);
        }

        if (!git.isGitRepo()) {
            out.error('Not a git repository');
            process.exit(1);
        }

        const tag = git.getLatestTag();
        const rawCommits = git.getCommitsSince(tag);
        commits = rawCommits.map(commit => {
            const parsed = git.parseConventionalCommit(commit.message);
            return {
                hash: commit.hash,
                type: parsed.type,
                scope: parsed.scope,
                message: parsed.message,
                breaking: parsed.breaking
            };
        });
    }

    // Generate changelog
    const changelog = generateChangelog(commits, version, date);

    // Output markdown directly (not JSON)
    console.log(changelog);

    process.exit(0);
}

// --- Module Guard ---
// Without this, requiring the module for tests executes main() — and its
// process.exit(1) on a missing --version kills the test runner (#2465).
if (require.main === module) {
    main().catch(err => {
        out.error(err && err.message ? err.message : String(err));
        process.exit(1);
    });
}

module.exports = { readStdin, extractCommits, generateChangelog, formatDate, capitalizeFirst };
