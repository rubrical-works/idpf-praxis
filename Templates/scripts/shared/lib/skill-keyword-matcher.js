// Rubrical Works (c) 2026
/**
 * @framework-script 0.72.0
 * @description Match skill keywords against content text for skill suggestion phases. Exports loadSkillKeywords() and matchSkills(). Used by /create-prd, /create-backlog, and /add-story for automated skill discovery.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * lib/skill-keyword-matcher.js
 *
 * Usage:
 *   node lib/skill-keyword-matcher.js --content "story text" --installed skill1,skill2
 *   node lib/skill-keyword-matcher.js --content-file path/to/content.txt --installed skill1,skill2
 *
 * Output: JSON array of {skill, matchedKeywords} objects, or [] when no matches.
 */

const fs = require('fs');
const path = require('path');

/**
 * Load skill-keywords.json from the metadata directory.
 * @param {string} metadataPath - Path to the .claude/metadata directory
 * @returns {object|null} Parsed JSON data, or null on error
 */
function loadSkillKeywords(metadataPath) {
    const filePath = path.join(metadataPath, 'skill-keywords.json');
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        // Silent fallback: registry unavailable — skill matching disabled
        if (process.env.DEBUG) console.error(`[DEBUG skill-keyword-matcher] Failed to load ${filePath}: ${e.message}`);
        return null;
    }
}

/**
 * Match skills against content text.
 * Pure function — no I/O.
 *
 * @param {string} content - Text to match against (story titles, AC, PRD content)
 * @param {string} installed - Comma-separated list of already-installed skill names to exclude
 * @param {object|null} data - Parsed skill-keywords.json data
 * @returns {Array<{skill: string, matchedKeywords: string[]}>}
 */
function matchSkills(content, installed, data) {
    if (!data || !content) return [];

    const lowerContent = content.toLowerCase();
    const installedSet = new Set(
        (installed || '').split(',').map(s => s.trim()).filter(Boolean)
    );
    const results = [];
    const addedSkills = new Set();

    // Match against skillKeywords entries
    const skillKeywords = data.skillKeywords || {};
    for (const [skill, keywords] of Object.entries(skillKeywords)) {
        if (installedSet.has(skill)) continue;
        const matched = keywords.filter(kw => lowerContent.includes(kw.toLowerCase()));
        if (matched.length > 0) {
            results.push({ skill, matchedKeywords: matched });
            addedSkills.add(skill);
        }
    }

    // Match against groupKeywords (group-level triggers → multiple skills)
    const groupKeywords = data.groupKeywords || {};
    for (const [, groupData] of Object.entries(groupKeywords)) {
        const keywords = groupData.keywords || [];
        const skills = groupData.skills || [];
        const matched = keywords.filter(kw => lowerContent.includes(kw.toLowerCase()));
        if (matched.length > 0) {
            for (const skill of skills) {
                if (installedSet.has(skill)) continue;
                if (addedSkills.has(skill)) continue;
                results.push({ skill, matchedKeywords: matched });
                addedSkills.add(skill);
            }
        }
    }

    return results;
}

// CLI entrypoint
if (require.main === module) {
    const args = process.argv.slice(2);
    let content = '';
    let installed = '';
    let metadataPath = path.join(__dirname, '..', '..', '..', 'metadata');

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--content' && i + 1 < args.length) {
            content = args[++i];
        } else if (args[i] === '--content-file' && i + 1 < args.length) {
            try {
                content = fs.readFileSync(args[++i], 'utf8');
            } catch (_e) {
                // Missing content file → no content, return empty
            }
        } else if (args[i] === '--installed' && i + 1 < args.length) {
            installed = args[++i];
        } else if (args[i] === '--metadata-path' && i + 1 < args.length) {
            metadataPath = args[++i];
        }
    }

    const data = loadSkillKeywords(metadataPath);
    if (!data) {
        console.log('[]');
        process.exit(0);
    }

    const results = matchSkills(content, installed, data);
    console.log(JSON.stringify(results));
}

module.exports = { loadSkillKeywords, matchSkills };
