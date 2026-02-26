/**
 * @framework-script 0.53.1
 * done-verify.js - Diff verification for /done command
 *
 * Analyzes commits referencing an issue to detect hallucinated completions.
 * Detects: comment-only changes, EOF-only appends, suspect patterns.
 *
 * Usage: node done-verify.js --issue <number>
 */

const { execSync } = require('child_process');

/**
 * Safe shell execution — returns trimmed output or null on failure
 */
function execSyncSafe(cmd) {
    try {
        return execSync(cmd, { encoding: 'utf-8' }).trim();
    } catch {
        return null;
    }
}

/**
 * Check if a line content (after +/- prefix removal) is a comment.
 * Detects HTML, JS, CSS, shell/YAML, and multi-line comment markers.
 * Returns false for empty/whitespace-only lines (use isWhitespaceLine for those).
 */
function isCommentLine(line) {
    if (typeof line !== 'string') return false;
    const trimmed = line.trim();
    if (trimmed.length === 0) return false;

    // HTML comments: <!-- ... -->
    if (/^<!--[\s\S]*-->$/.test(trimmed)) return true;
    if (/^<!--/.test(trimmed)) return true;
    if (/-->$/.test(trimmed) && !/<[^!]/.test(trimmed)) return true;

    // JS single-line: // ...
    if (/^\/\//.test(trimmed)) return true;

    // JS/CSS multi-line: /* ... */, * ..., */
    if (/^\/\*/.test(trimmed)) return true;
    if (/^\*\//.test(trimmed)) return true;
    if (/^\*\s/.test(trimmed) || trimmed === '*') return true;

    // Shell/YAML/Python comments: # ...
    if (/^#\s/.test(trimmed) || trimmed === '#') return true;

    return false;
}

/**
 * Check if a line is whitespace-only or empty
 */
function isWhitespaceLine(line) {
    if (typeof line !== 'string') return false;
    return line.trim().length === 0;
}

/**
 * Parse a git stat line into structured data.
 * Example input: " review-prd.md | 6 ++++++"
 * Returns { file, insertions, deletions } or null if not a file stat line.
 */
function parseStatLine(line) {
    if (typeof line !== 'string' || !line.trim()) return null;

    // Match: " filename | N +++---" pattern
    const match = line.match(/^\s*(.+?)\s*\|\s*(\d+)\s*([+-]*)\s*$/);
    if (!match) return null;

    const file = match[1].trim();
    const changes = parseInt(match[2], 10);
    const symbols = match[3] || '';

    // Filter out summary lines like "3 files changed, 141 insertions(+)"
    if (file.includes('file') && file.includes('changed')) return null;

    const plusCount = (symbols.match(/\+/g) || []).length;
    const minusCount = (symbols.match(/-/g) || []).length;
    const total = plusCount + minusCount;

    let insertions, deletions;
    if (total === 0) {
        insertions = changes;
        deletions = 0;
    } else {
        insertions = Math.round(changes * plusCount / total);
        deletions = Math.round(changes * minusCount / total);
    }

    return { file, insertions, deletions };
}

/**
 * Classify all diff lines for a single file's changes.
 * Returns analysis of whether changes are comment-only and/or EOF-only.
 */
function classifyDiffLines(rawDiff) {
    const result = {
        commentOnly: false,
        eofOnly: false,
        isNewFile: false,
        substantiveAdditions: 0,
        commentAdditions: 0
    };

    if (!rawDiff || typeof rawDiff !== 'string') return result;

    const lines = rawDiff.split('\n');
    let hasRemovals = false;
    let lastAdditionIndex = -1;
    let lastContextIndex = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Detect new file marker
        if (line.startsWith('new file mode')) {
            result.isNewFile = true;
            continue;
        }

        // Skip diff headers
        if (line.startsWith('diff --git') || line.startsWith('index ') ||
            line.startsWith('--- ') || line.startsWith('+++ ') ||
            line.startsWith('@@')) {
            continue;
        }

        if (line.startsWith('-')) {
            hasRemovals = true;
            continue;
        }

        if (line.startsWith('+')) {
            const content = line.substring(1);
            lastAdditionIndex = i;

            if (isCommentLine(content) || isWhitespaceLine(content)) {
                result.commentAdditions++;
            } else {
                result.substantiveAdditions++;
            }
            continue;
        }

        // Context line (starts with space or is empty non-header)
        if (line.startsWith(' ') || (line === '' && i > 0)) {
            lastContextIndex = i;
        }
    }

    const totalAdditions = result.commentAdditions + result.substantiveAdditions;

    // commentOnly: all additions are comments/whitespace, and there are some
    if (totalAdditions > 0 && result.substantiveAdditions === 0) {
        result.commentOnly = true;
    }

    // eofOnly: no removals and additions are at the end (no context lines after last addition)
    if (!hasRemovals && totalAdditions > 0 && lastAdditionIndex > lastContextIndex) {
        result.eofOnly = true;
    }

    return result;
}

/**
 * Find all commits referencing an issue number.
 * Filters out merge commits.
 */
function findCommitsForIssue(issueNumber) {
    const output = execSyncSafe(
        `git log --all --grep="#${issueNumber}" --format="%H|%s"`
    );

    if (!output) return [];

    return output.split('\n')
        .filter(line => line.trim())
        .map(line => {
            const pipeIdx = line.indexOf('|');
            if (pipeIdx === -1) return null;
            return {
                hash: line.substring(0, pipeIdx),
                message: line.substring(pipeIdx + 1)
            };
        })
        .filter(c => c !== null)
        .filter(c => !c.message.startsWith('Merge'));
}

/**
 * Get the stat output for a commit (file changes summary)
 */
function getCommitStat(hash) {
    return execSyncSafe(`git show --stat --format="" ${hash}`);
}

/**
 * Get the diff for a specific file in a commit
 */
function getFileDiff(hash, file) {
    return execSyncSafe(`git show ${hash} -- "${file}"`);
}

/**
 * Analyze a single commit — stat + per-file diff classification.
 * Returns { hash, message, files: [{file, insertions, deletions, commentOnly, eofOnly, ...}] }
 */
function analyzeCommit(hash) {
    // Get commit message
    const logOutput = execSyncSafe(`git log -1 --format="%H|%s" ${hash}`);
    let message = '';
    if (logOutput) {
        const pipeIdx = logOutput.indexOf('|');
        if (pipeIdx !== -1) message = logOutput.substring(pipeIdx + 1);
    }

    // Get stat
    const statOutput = getCommitStat(hash);
    const files = [];

    if (statOutput) {
        const statLines = statOutput.split('\n');
        for (const line of statLines) {
            const parsed = parseStatLine(line);
            if (!parsed) continue;

            // Get detailed diff for this file
            const diffOutput = getFileDiff(hash, parsed.file);
            const classification = classifyDiffLines(diffOutput || '');

            files.push({
                file: parsed.file,
                insertions: parsed.insertions,
                deletions: parsed.deletions,
                commentOnly: classification.commentOnly,
                eofOnly: classification.eofOnly,
                isNewFile: classification.isNewFile,
                substantiveAdditions: classification.substantiveAdditions,
                commentAdditions: classification.commentAdditions
            });
        }
    }

    return {
        hash: hash.substring(0, 7),
        message,
        files
    };
}

/**
 * Generate human-readable warnings from analyzed commits.
 * Returns array of warning strings.
 */
function generateWarnings(analyzedCommits) {
    const warnings = [];

    for (const commit of analyzedCommits) {
        for (const file of commit.files) {
            // New files are expected to be all-insertions — skip warning
            if (file.isNewFile) continue;

            if (file.commentOnly) {
                warnings.push(
                    `${file.file}: all changes are comments (+${file.commentAdditions} lines, 0 substantive)`
                );
            } else if (file.eofOnly && file.deletions === 0) {
                warnings.push(
                    `${file.file}: EOF-only append (+${file.insertions} lines, all at end of file)`
                );
            }
        }
    }

    return warnings;
}

/**
 * Main verification entry point.
 * Returns structured JSON with commit analysis and warnings.
 */
function verify(issueNumber) {
    const commits = findCommitsForIssue(issueNumber);

    if (commits.length === 0) {
        return {
            issue: issueNumber,
            commits: [],
            warnings: [`No commits found referencing #${issueNumber}`],
            newFiles: [],
            substantiveFiles: 0,
            commentOnlyFiles: 0
        };
    }

    const analyzedCommits = commits.map(c => analyzeCommit(c.hash));
    const warnings = generateWarnings(analyzedCommits);

    // Count files across all commits
    let substantiveFiles = 0;
    let commentOnlyFiles = 0;
    const newFiles = [];
    const seenFiles = new Set();

    for (const commit of analyzedCommits) {
        for (const file of commit.files) {
            if (seenFiles.has(file.file)) continue;
            seenFiles.add(file.file);

            if (file.isNewFile) {
                newFiles.push(file.file);
            }

            if (file.commentOnly) {
                commentOnlyFiles++;
            } else {
                substantiveFiles++;
            }
        }
    }

    return {
        issue: issueNumber,
        commits: analyzedCommits,
        warnings,
        newFiles,
        substantiveFiles,
        commentOnlyFiles
    };
}

async function main() {
    const args = process.argv.slice(2);
    const issueIdx = args.indexOf('--issue');
    if (issueIdx === -1 || issueIdx + 1 >= args.length) {
        console.error('Usage: node done-verify.js --issue <number>');
        process.exit(1);
    }
    const issueNumber = parseInt(args[issueIdx + 1], 10);
    if (isNaN(issueNumber)) {
        console.error('Error: Issue number must be a valid integer');
        process.exit(1);
    }
    const result = verify(issueNumber);
    console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
    main();
}

module.exports = {
    execSyncSafe,
    isCommentLine,
    isWhitespaceLine,
    parseStatLine,
    classifyDiffLines,
    findCommitsForIssue,
    getCommitStat,
    getFileDiff,
    analyzeCommit,
    generateWarnings,
    verify
};
