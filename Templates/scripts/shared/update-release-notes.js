#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.79.0
 * @description Extract CHANGELOG section and update GitHub Release page with formatted notes. Transforms raw CHANGELOG entries into standardized release page format with title, date, summary, and category sections. Used by /prepare-release post-tag phase.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');
const { validateVersion } = require('./lib/input-validation.js');

/**
 * Escape special regex characters in a string so it can be safely
 * interpolated into a RegExp pattern as a literal match.
 * @param {string} str - The string to escape
 * @returns {string} - The escaped string
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if a GitHub release exists for the given version
 * @param {string} version - The version tag (e.g., v1.0.0)
 * @returns {boolean} - True if release exists, false otherwise
 */
function releaseExists(version) {
    try {
        execFileSync('gh', ['release', 'view', version, '--json', 'tagName'], {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe']
        });
        return true;
    } catch {
        return false;
    }
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Update or create a GitHub release with retry logic
 * Handles race conditions where GitHub Actions may create the release
 * @param {string} version - The version tag
 * @param {string} notesFile - Path to the release notes file
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @param {number} retryDelayMs - Delay between retries in ms (default: 2000)
 */
async function updateOrCreateRelease(version, notesFile, maxRetries = 3, retryDelayMs = 2000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            if (releaseExists(version)) {
                // Release exists - update it
                execFileSync('gh', ['release', 'edit', version, '--notes-file', notesFile], {
                    encoding: 'utf8',
                    stdio: ['pipe', 'pipe', 'pipe']
                });
                return { action: 'updated' };
            } else {
                // Release doesn't exist - create it
                execFileSync('gh', ['release', 'create', version, '--title', `Release ${version}`, '--notes-file', notesFile], {
                    encoding: 'utf8',
                    stdio: ['pipe', 'pipe', 'pipe']
                });
                return { action: 'created' };
            }
        } catch (err) {
            const errorMsg = err.message || '';

            // If "already exists" error, the release was created between our check and create
            // Retry with edit instead
            if (errorMsg.includes('already exists') && attempt < maxRetries) {
                await sleep(retryDelayMs);
                continue;
            }

            // If "release not found" on edit, it may not have propagated yet
            // Retry after delay
            if (errorMsg.includes('release not found') && attempt < maxRetries) {
                await sleep(retryDelayMs);
                continue;
            }

            // Final attempt or unrecoverable error
            if (attempt === maxRetries) {
                throw new Error(`Failed after ${maxRetries} attempts: ${err.message}`);
            }
        }
    }
}

/**
 * Get repository URL from git remote
 */
function getRepoUrl() {
    try {
        const remote = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
        // Convert SSH to HTTPS format if needed
        if (remote.startsWith('git@github.com:')) {
            return remote.replace('git@github.com:', 'https://github.com/').replace(/\.git$/, '');
        }
        return remote.replace(/\.git$/, '');
    } catch {
        return null;
    }
}

/**
 * Get previous tag before the current one
 */
function getPreviousTag(currentTag) {
    try {
        // Get all tags sorted by version, find the one before current
        const tags = execSync('git tag --sort=-v:refname', { encoding: 'utf8' })
            .trim()
            .split('\n')
            .filter(t => t.match(/^v\d+\.\d+\.\d+$/));

        const currentIndex = tags.indexOf(currentTag);
        if (currentIndex >= 0 && currentIndex < tags.length - 1) {
            return tags[currentIndex + 1];
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Count items in each category for summary generation
 */
function countCategoryItems(content) {
    const counts = {};
    const categoryRegex = /^### (\w+)/gm;
    let match;

    while ((match = categoryRegex.exec(content)) !== null) {
        const category = match[1];
        // Find the section content and count bullet points
        const sectionStart = match.index + match[0].length;
        const nextSection = content.slice(sectionStart).search(/^### \w+/m);
        const sectionContent = nextSection >= 0
            ? content.slice(sectionStart, sectionStart + nextSection)
            : content.slice(sectionStart);

        // Count top-level bullet points (lines starting with "- ")
        const items = sectionContent.match(/^- /gm) || [];
        counts[category] = items.length;
    }

    return counts;
}

/**
 * Generate summary based on category counts
 */
function generateSummary(counts) {
    const parts = [];

    if (counts.Added) {
        parts.push(`${counts.Added} new feature${counts.Added > 1 ? 's' : ''}`);
    }
    if (counts.Changed) {
        parts.push(`${counts.Changed} change${counts.Changed > 1 ? 's' : ''}`);
    }
    if (counts.Fixed) {
        parts.push(`${counts.Fixed} fix${counts.Fixed > 1 ? 'es' : ''}`);
    }
    if (counts.Removed) {
        parts.push(`${counts.Removed} removal${counts.Removed > 1 ? 's' : ''}`);
    }
    if (counts.Security) {
        parts.push(`${counts.Security} security update${counts.Security > 1 ? 's' : ''}`);
    }
    if (counts.Deprecated) {
        parts.push(`${counts.Deprecated} deprecation${counts.Deprecated > 1 ? 's' : ''}`);
    }
    if (counts.Documentation) {
        parts.push(`documentation updates`);
    }

    if (parts.length === 0) {
        return 'Maintenance release.';
    }

    // Determine release type
    const hasFeatures = counts.Added > 0;
    const hasOnlyFixes = !hasFeatures && counts.Fixed > 0;

    let prefix = '';
    if (hasOnlyFixes && Object.keys(counts).length <= 2) {
        prefix = 'Patch release with ';
    } else if (hasFeatures) {
        prefix = 'Feature release with ';
    } else {
        prefix = 'Release with ';
    }

    // Join parts with proper grammar
    if (parts.length === 1) {
        return prefix + parts[0] + '.';
    } else if (parts.length === 2) {
        return prefix + parts.join(' and ') + '.';
    } else {
        const last = parts.pop();
        return prefix + parts.join(', ') + ', and ' + last + '.';
    }
}

/**
 * Extract project name from CHARTER.md content
 * @param {string|null|undefined} charterContent - Raw content of CHARTER.md
 * @returns {string|null} - Project name or null if not found
 */
function getProjectName(charterContent) {
    if (!charterContent) return null;
    const match = charterContent.match(/^# Project Charter:\s*(.+)/m);
    if (!match) return null;
    return match[1].trim();
}

/**
 * Transform CHANGELOG content to release page format
 * @param {string} version - Version tag (e.g., v1.0.0)
 * @param {string} date - Release date (YYYY-MM-DD)
 * @param {string} rawContent - Raw CHANGELOG section content
 * @param {string|null} repoUrl - Repository URL for comparison link
 * @param {string|null} previousTag - Previous version tag for comparison link
 * @param {string|null} projectName - Project name from CHARTER.md (null = fallback)
 */
function transformToReleaseFormat(version, date, rawContent, repoUrl, previousTag, projectName) {
    // Promote heading levels: ### Category -> ## Category
    let content = rawContent.replace(/^### /gm, '## ');

    // Remove trailing horizontal rules
    content = content.replace(/\n---\s*$/, '');

    // Generate summary
    const counts = countCategoryItems(rawContent);
    const summary = generateSummary(counts);

    // Build formatted release notes
    const titleName = projectName || 'Release';
    let notes = `# ${titleName} ${version}\n\n`;
    notes += `**Release Date:** ${date}\n\n`;
    notes += `## Summary\n\n${summary}\n\n`;
    notes += content.trim();

    // Add comparison link if we have repo URL and previous tag
    if (repoUrl && previousTag) {
        notes += `\n\n---\n\n`;
        notes += `**Full Changelog:** [${previousTag}...${version}](${repoUrl}/compare/${previousTag}...${version})`;
    }

    return notes;
}

async function main() {
    // Get version from args or try to detect from latest tag
    let version = process.argv[2] ? validateVersion(process.argv[2]) : undefined;

    if (!version) {
        try {
            version = execSync('git describe --tags --abbrev=0', {
                encoding: 'utf8'
            }).trim();
        } catch {
            console.log(JSON.stringify({
                success: false,
                message: 'Version not provided and no tags found'
            }));
            process.exit(1);
        }
    }

    // Ensure version has 'v' prefix for consistency
    if (!version.startsWith('v')) {
        version = 'v' + version;
    }

    try {
        // Read CHANGELOG.md
        const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
        if (!fs.existsSync(changelogPath)) {
            console.log(JSON.stringify({
                success: false,
                message: 'CHANGELOG.md not found'
            }));
            process.exit(1);
        }

        const changelog = fs.readFileSync(changelogPath, 'utf8');
        const versionNum = version.replace('v', '');
        const escapedVersion = escapeRegex(versionNum);

        // Extract section for this version including the header (for date)
        const versionPattern = new RegExp(
            `## \\[${escapedVersion}\\]\\s*-\\s*(\\d{4}-\\d{2}-\\d{2})\\r?\\n([\\s\\S]*?)(?=## \\[|$)`
        );
        const match = changelog.match(versionPattern);

        if (!match) {
            console.log(JSON.stringify({
                success: false,
                message: `No changelog section found for ${version}`
            }));
            process.exit(1);
        }

        const date = match[1];
        const rawContent = match[2].trim();

        // Get repo URL and previous tag for comparison link
        const repoUrl = getRepoUrl();
        const previousTag = getPreviousTag(version);

        // Read project name from CHARTER.md
        const charterPath = path.join(process.cwd(), 'CHARTER.md');
        let projectName = null;
        if (fs.existsSync(charterPath)) {
            const charterContent = fs.readFileSync(charterPath, 'utf8');
            projectName = getProjectName(charterContent);
        }

        // Transform to release format
        const notes = transformToReleaseFormat(version, date, rawContent, repoUrl, previousTag, projectName);

        // Update GitHub release
        const notesFile = path.join(process.cwd(), `.tmp-release-notes.${process.pid}.${Date.now()}.md`);
        fs.writeFileSync(notesFile, notes);

        let result;
        try {
            result = await updateOrCreateRelease(version, notesFile);
        } finally {
            fs.unlinkSync(notesFile);
        }

        console.log(JSON.stringify({
            success: true,
            message: `${result.action === 'created' ? 'Created' : 'Updated'} release notes for ${version}`,
            data: {
                version,
                date,
                previousTag,
                action: result.action,
                summary: generateSummary(countCategoryItems(rawContent))
            }
        }));

    } catch (err) {
        console.log(JSON.stringify({
            success: false,
            message: `Failed to update release notes: ${err.message}`
        }));
        process.exit(1);
    }
}

// Export for testing
module.exports = {
    releaseExists,
    getPreviousTag,
    countCategoryItems,
    generateSummary,
    getProjectName,
    transformToReleaseFormat,
    updateOrCreateRelease,
    getRepoUrl,
    escapeRegex,
    main
};

if (require.main === module) {
    main();
}
