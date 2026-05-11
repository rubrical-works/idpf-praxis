#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.91.1
 * @description Delete expired GitHub Actions artifacts with throttled API calls to avoid rate limits. Supports age-based filtering (default 30 days) and --dry-run mode. Used by /prepare-release cleanup phase.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const gh = require('./lib/gh');
const out = require('./lib/output');

const DEFAULT_DAYS = 7;
const DEFAULT_THRESHOLD = 100;
const DEFAULT_DELAY_MS = 1000;
const RATE_LIMIT_BACKOFF_MS = 30000;
const RATE_LIMIT_MAX_RETRIES = 3;

function showHelp() {
    console.log(`
cleanup-artifacts.js - Clean up old GitHub Actions artifacts

Usage:
  node cleanup-artifacts.js
  node cleanup-artifacts.js --days 14
  node cleanup-artifacts.js --dry-run
  node cleanup-artifacts.js --threshold 50

Options:
  --days <n>            Age cutoff in days (default: ${DEFAULT_DAYS})
  --threshold <n>       Skip cleanup if total count <= threshold (default: ${DEFAULT_THRESHOLD})
  --delay <ms>          Delay between deletes in ms (default: ${DEFAULT_DELAY_MS})
  --dry-run             Show what would be deleted without making changes
  --quiet               Suppress non-JSON output
  --help                Show this help message

This script:
1. Checks total artifact count against threshold (skips if at/below)
2. Lists all artifacts via paginated API calls
3. Filters to artifacts older than --days cutoff
4. Deletes with throttled API calls (--delay ms between each)
5. Detects rate limits (403/429) and backs off automatically
`);
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if an error message indicates a rate limit
 * @param {string} message - Error message
 * @returns {boolean}
 */
function isRateLimitError(message) {
    return /rate limit/i.test(message) ||
        /HTTP 429/.test(message) ||
        /HTTP 403/.test(message) ||
        /secondary rate/i.test(message) ||
        /abuse detection/i.test(message);
}

/**
 * List all artifacts with manual pagination
 * @param {string} repo - Repository in owner/repo format
 * @returns {Array} All artifacts
 */
function listArtifacts(repo) {
    const artifacts = [];
    let page = 1;
    const perPage = 100;

    while (true) {
        // Quote URL to protect & from Windows cmd.exe shell interpretation
        const data = gh.execJson(
            `api "repos/${repo}/actions/artifacts?per_page=${perPage}&page=${page}"`
        );

        if (!data.artifacts || data.artifacts.length === 0) break;

        artifacts.push(...data.artifacts);

        if (data.artifacts.length < perPage) break;
        page++;
    }

    return artifacts;
}

/**
 * Get total artifact count (single API call)
 * @param {string} repo - Repository in owner/repo format
 * @returns {number} Total artifact count
 */
function getArtifactCount(repo) {
    const data = gh.execJson(
        `api repos/${repo}/actions/artifacts?per_page=1`
    );
    return data.total_count || 0;
}

/**
 * Delete a single artifact with rate limit retry
 * @param {string} repo - Repository in owner/repo format
 * @param {number} artifactId - Artifact ID to delete
 * @returns {{deleted: boolean, rateLimited: boolean, error: string|null}}
 */
function deleteArtifact(repo, artifactId) {
    for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
        try {
            gh.exec(`api -X DELETE repos/${repo}/actions/artifacts/${artifactId}`);
            return { deleted: true, rateLimited: false, error: null };
        } catch (err) {
            const msg = err.message || '';

            if (isRateLimitError(msg) && attempt < RATE_LIMIT_MAX_RETRIES) {
                const backoffMs = RATE_LIMIT_BACKOFF_MS * (attempt + 1);
                out.warn(`Rate limit hit, backing off ${backoffMs / 1000}s (attempt ${attempt + 1}/${RATE_LIMIT_MAX_RETRIES})...`);
                // Synchronous sleep via lib/gh pattern
                const { spawnSync } = require('child_process');
                if (process.platform === 'win32') {
                    spawnSync('ping', ['-n', Math.ceil(backoffMs / 1000) + 1, '127.0.0.1'], { stdio: 'ignore' });
                } else {
                    spawnSync('sleep', [backoffMs / 1000], { stdio: 'ignore' });
                }
                continue;
            }

            return {
                deleted: false,
                rateLimited: isRateLimitError(msg),
                error: msg
            };
        }
    }

    return { deleted: false, rateLimited: true, error: 'Rate limit exceeded after max retries' };
}

async function main() {
    const flags = out.parseFlags();

    if (flags.help) {
        showHelp();
        process.exit(0);
    }

    const days = parseInt(out.getFlag(flags.args, '--days') || String(DEFAULT_DAYS), 10);
    const threshold = parseInt(out.getFlag(flags.args, '--threshold') || String(DEFAULT_THRESHOLD), 10);
    const delayMs = parseInt(out.getFlag(flags.args, '--delay') || String(DEFAULT_DELAY_MS), 10);
    const dryRun = out.hasFlag(flags.args, '--dry-run');

    if (isNaN(days) || days < 1) {
        out.error('--days must be a positive number');
        process.exit(1);
    }
    if (isNaN(threshold) || threshold < 0) {
        out.error('--threshold must be a non-negative number');
        process.exit(1);
    }
    if (isNaN(delayMs) || delayMs < 0) {
        out.error('--delay must be a non-negative number');
        process.exit(1);
    }

    const repo = gh.getCurrentRepo();
    if (!repo) {
        out.error('Could not determine repository. Run from a git repository.');
        process.exit(1);
    }

    out.info(`Checking artifacts for ${repo}...`);

    // Step 1: Check total count against threshold
    const totalCount = getArtifactCount(repo);
    out.info(`Total artifacts: ${totalCount}`);

    if (totalCount <= threshold) {
        out.success(`Artifact count (${totalCount}) is at or below threshold (${threshold}). Skipping cleanup.`);
        console.log(JSON.stringify({
            success: true,
            message: `Artifact count (${totalCount}) at or below threshold (${threshold}), cleanup skipped`,
            data: {
                before: totalCount,
                after: totalCount,
                deleted: 0,
                skipped: true,
                threshold
            }
        }));
        process.exit(0);
    }

    // Step 2: List all artifacts
    out.info('Listing all artifacts (paginated)...');
    const allArtifacts = listArtifacts(repo);

    // Step 3: Filter by cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffISO = cutoffDate.toISOString();

    const toDelete = allArtifacts.filter(a => a.created_at < cutoffISO);
    const toKeep = allArtifacts.length - toDelete.length;

    out.info(`Found ${toDelete.length} artifacts older than ${days} days (keeping ${toKeep})`);

    if (toDelete.length === 0) {
        out.success('No artifacts to delete.');
        console.log(JSON.stringify({
            success: true,
            message: 'No artifacts older than cutoff date',
            data: {
                before: allArtifacts.length,
                after: allArtifacts.length,
                deleted: 0,
                skipped: false,
                days,
                cutoffDate: cutoffISO
            }
        }));
        process.exit(0);
    }

    if (dryRun) {
        out.info('Dry run — no deletions will be performed');
        for (const artifact of toDelete) {
            out.info(`  Would delete: ${artifact.name} (id: ${artifact.id}, created: ${artifact.created_at})`);
        }
        console.log(JSON.stringify({
            success: true,
            message: `Dry run: would delete ${toDelete.length} artifacts`,
            data: {
                before: allArtifacts.length,
                after: allArtifacts.length - toDelete.length,
                deleted: 0,
                wouldDelete: toDelete.length,
                dryRun: true,
                days,
                cutoffDate: cutoffISO
            }
        }));
        process.exit(0);
    }

    // Step 4: Delete with throttling
    out.info(`Deleting ${toDelete.length} artifacts (${delayMs}ms delay between calls)...`);

    let deletedCount = 0;
    const errors = [];

    for (let i = 0; i < toDelete.length; i++) {
        const artifact = toDelete[i];

        // Throttle: wait before each delete (except first)
        if (i > 0) {
            await sleep(delayMs);
        }

        const result = deleteArtifact(repo, artifact.id);

        if (result.deleted) {
            deletedCount++;
            out.progress(`Deleted ${deletedCount}/${toDelete.length}: ${artifact.name}`);
        } else {
            errors.push({ id: artifact.id, name: artifact.name, error: result.error });

            if (result.rateLimited) {
                out.warn(`Rate limit exhausted after retries. Stopping at ${deletedCount}/${toDelete.length} deletions.`);
                break;
            }
        }
    }

    out.clearProgress();

    // Step 5: Report results
    const afterCount = allArtifacts.length - deletedCount;

    if (errors.length > 0) {
        out.warn(`Completed with ${errors.length} error(s)`);
    }

    if (deletedCount > 0) {
        out.success(`Deleted ${deletedCount} artifacts (${allArtifacts.length} → ${afterCount})`);
    }

    console.log(JSON.stringify({
        success: errors.length === 0,
        message: `Deleted ${deletedCount}/${toDelete.length} artifacts`,
        data: {
            before: allArtifacts.length,
            after: afterCount,
            deleted: deletedCount,
            skipped: false,
            days,
            cutoffDate: cutoffISO,
            delayMs,
            errors: errors.length > 0 ? errors : undefined
        }
    }));

    process.exit(errors.length > 0 ? 1 : 0);
}

main();
