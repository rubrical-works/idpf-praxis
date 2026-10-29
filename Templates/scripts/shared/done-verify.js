// Rubrical Works (c) 2026
/**
 * @framework-script 0.114.0
 * @description Analyze commits referencing an issue to detect hallucinated or incomplete work. Examines diffs for comment-only changes, EOF-only appends, and suspect patterns (e.g., TODO placeholders, empty function bodies). Parallelizes per-commit and per-file git operations for performance. Used by /done verification phase.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

// Spawns bounded via lib/exec.js (#2469) — aliased to the original name
// so call sites are unchanged.
const { execTimedAsync, execFileTimedAsync } = require('./lib/exec.js');
const { issueRefGrepPattern } = require('./lib/issue-ref-match.js');

const execAsync = execTimedAsync;
const EXEC_OPTS = { encoding: 'utf-8' };

/**
 * Safe async shell execution — returns trimmed output or null on failure
 */
async function execSafe(cmd) {
    try {
        const { stdout } = await execAsync(cmd, EXEC_OPTS);
        return stdout.trim();
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
    if (/^--!?>$/.test(trimmed)) return true;

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
 * TWO SELECTIONS, DELIBERATELY DIFFERENT (#2753). Do not merge them.
 *
 * `findCommitsForIssue` answers "should /done ask the user to confirm?" and is
 * deliberately the widest of the five call sites — a bare `#N`, no keyword,
 * `--all`. Breadth is the correct bias there: a gate that errs toward asking
 * is safer than one that errs toward silence.
 *
 * `findAttributedCommitsForIssue` answers "which files did THIS issue change?"
 * and is keyword-anchored. That question wants precision, and one selection
 * cannot serve both — before the split, a commit that merely mentioned an
 * issue in prose had its files reported as that issue's. Observed on real
 * history: 28a36f4d carries `Refs #2701` and mentions #2718 twice in its body,
 * so #2718's reported file list gained #2701's design-decision file.
 *
 * The file list is what a user reads when deciding whether to approve a
 * `--force-move` past the diff gate, so a misattribution there degrades the
 * one decision the gate exists to inform.
 */

/**
 * Find all commits referencing an issue number.
 * Filters out merge commits.
 *
 * CONFIRMATION-GATE SELECTION — keyword-less on purpose. See the note above.
 */
async function findCommitsForIssue(issueNumber) {
    // Boundary-anchored (#2467). This call site is the widest of the five: it
    // greps a bare `#N` with no keyword prefix and with --all, so #245 matched
    // #2453 across every ref. The boundary stops the prefix cross-match; the
    // keyword-less form is retained deliberately, because this gate must see
    // Fixes/Closes/Resolves and plain mentions alike, not only `Refs #N`.
    const output = await execSafe(
        `git log --all --grep="${issueRefGrepPattern(issueNumber, { keyword: null })}" --format="%H|%s"`
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
 * Find the commits an issue may be CREDITED with — keyword-anchored.
 * Filters out merge commits.
 *
 * ATTRIBUTION SELECTION. See the note above `findCommitsForIssue`.
 *
 * Anchored on Refs/Fixes/Closes via the shared helper's `keywords` option
 * rather than an inline alternation: an inline one already existed in /done
 * Step 1b, built independently, which is how five call sites drift apart.
 *
 * A second git invocation rather than post-filtering the gate's output,
 * because `--format=%H|%s` yields the SUBJECT only, and a commit can carry
 * `Refs #N` in its body. Filtering on the subject would drop legitimately
 * attributed commits — a quieter defect than the one being fixed.
 */
async function findAttributedCommitsForIssue(issueNumber) {
    const pattern = issueRefGrepPattern(issueNumber, {
        keywords: ['Refs', 'Fixes', 'Closes']
    });
    const output = await execSafe(
        `git log --all --grep="${pattern}" --format="%H|%s"`
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
 * Parse one `git show --numstat` line: "<ins>\t<del>\t<path>".
 * A binary file reports "-\t-\t<path>" and is counted as 0/0.
 * Returns { file, insertions, deletions } or null.
 */
function parseNumstatLine(line) {
    if (typeof line !== 'string') return null;
    const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!match) return null;
    return {
        file: match[3].trim(),
        insertions: match[1] === '-' ? 0 : parseInt(match[1], 10),
        deletions: match[2] === '-' ? 0 : parseInt(match[2], 10)
    };
}

/**
 * Get the per-file change counts for a commit. --numstat, not --stat
 * (#3059): --stat abbreviates a long path to `.../lib/x.js`, so the per-file
 * diff for that name came back empty and comment-only detection never fired.
 * --no-renames (#3296): with rename detection on, a moved file is reported as
 * `src/{old.js => new.js}`, which names no file and diffs empty the same way.
 * -z (#3377): without it git C-quotes a name holding a space or a non-ASCII
 * byte (`"src/caf\303\251.js"`), which also names no file. Records are then
 * NUL-terminated; split them with splitNumstat.
 */
async function getCommitStat(hash) {
    return execSafe(`git show --numstat -z --no-renames --format="" ${hash}`);
}

/**
 * Split `--numstat -z` output into "<ins>\t<del>\t<path>" records (#3377).
 * A newline-separated (non -z) output still splits, so a caller handed either
 * form reads it the same way.
 */
function splitNumstat(output) {
    // The one caller passes a non-empty string, so no falsy guard (#3446, CodeQL #22).
    return output.split(output.includes('\0') ? '\0' : '\n')
        .map((rec) => rec.replace(/^\n+/, ''))
        .filter(Boolean);
}

/**
 * Get the diff for a specific file in a commit. argv, not a shell string
 * (#3290): the path comes from a commit, and git's --numstat quoting escapes
 * only " and \, so a name holding `$(...)` or a backtick would execute.
 */
async function getFileDiff(hash, file) {
    try {
        const { stdout } = await execFileTimedAsync('git', ['show', hash, '--', file], EXEC_OPTS);
        return stdout.trim();
    } catch {
        return null;
    }
}

/**
 * Analyze a single commit — stat + per-file diff classification.
 * Parallelizes per-file diff retrieval.
 * Returns { hash, message, files: [{file, insertions, deletions, commentOnly, eofOnly, ...}] }
 */
async function analyzeCommit(hash) {
    // Get commit message and stat in parallel
    const [logOutput, statOutput] = await Promise.all([
        execSafe(`git log -1 --format="%H|%s" ${hash}`),
        getCommitStat(hash)
    ]);

    let message = '';
    if (logOutput) {
        const pipeIdx = logOutput.indexOf('|');
        if (pipeIdx !== -1) message = logOutput.substring(pipeIdx + 1);
    }

    const files = [];

    if (statOutput) {
        const statLines = splitNumstat(statOutput);
        const parsedFiles = statLines.map(parseNumstatLine).filter(Boolean);

        // Parallelize per-file diff retrieval
        const diffResults = await Promise.all(
            parsedFiles.map(async (parsed) => {
                const diffOutput = await getFileDiff(hash, parsed.file);
                const classification = classifyDiffLines(diffOutput || '');
                return {
                    file: parsed.file,
                    insertions: parsed.insertions,
                    deletions: parsed.deletions,
                    commentOnly: classification.commentOnly,
                    eofOnly: classification.eofOnly,
                    isNewFile: classification.isNewFile,
                    substantiveAdditions: classification.substantiveAdditions,
                    commentAdditions: classification.commentAdditions
                };
            })
        );

        files.push(...diffResults);
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
 * Parallelizes per-commit analysis.
 * Returns structured JSON with commit analysis and warnings.
 */
async function verify(issueNumber) {
    // Both selections run: the wide one for the gate, the anchored one for
    // attribution (#2753). Keeping the wide count on the envelope is what
    // stops a later narrowing of attribution from quietly narrowing the gate.
    const [referencingCommits, commits] = await Promise.all([
        findCommitsForIssue(issueNumber),
        findAttributedCommitsForIssue(issueNumber)
    ]);
    const referencingCommitCount = referencingCommits.length;

    if (commits.length === 0) {
        // Distinguish "nothing references this issue at all" from "commits
        // mention it but none claims it". The second is the more interesting
        // state and used to be invisible: the wide set made it look attributed.
        const warning = referencingCommitCount > 0
            ? `No commits are attributed to #${issueNumber} by Refs/Fixes/Closes, though ${referencingCommitCount} commit(s) mention it`
            : `No commits found referencing #${issueNumber}`;

        return {
            issue: issueNumber,
            commits: [],
            referencingCommitCount,
            warnings: [warning],
            newFiles: [],
            substantiveFiles: 0,
            commentOnlyFiles: 0
        };
    }

    // Parallelize per-commit analysis
    const analyzedCommits = await Promise.all(
        commits.map(c => analyzeCommit(c.hash))
    );
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
        referencingCommitCount,
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
    const result = await verify(issueNumber);
    console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
    main();
}

module.exports = {
    execSafe,
    isCommentLine,
    isWhitespaceLine,
    parseNumstatLine,
    classifyDiffLines,
    findCommitsForIssue,
    findAttributedCommitsForIssue,
    getCommitStat,
    getFileDiff,
    analyzeCommit,
    generateWarnings,
    verify
};
