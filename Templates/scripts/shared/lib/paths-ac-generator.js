// Rubrical Works (c) 2026
/**
 * @framework-script 0.92.0
 * @description Generate acceptance criteria from behavioral paths discovered by /paths.
 * Only applies to enhancement issues. Produces ACs with inline path references.
 * @checksum sha256:placeholder
 *
 * @module .claude/scripts/shared/lib/paths-ac-generator
 */

const GROUPING_THRESHOLD = 6;
const ENHANCEMENT_TYPES = ['enhancement'];

/**
 * Format a path reference for inline use in ACs.
 * @param {number} start - Path number (1-based)
 * @param {number} [end] - End of range (if grouping)
 * @returns {string} Formatted reference, e.g., "(path 5)" or "(paths 1-3)"
 */
function formatPathRef(start, end) {
  if (end !== undefined && end !== start) {
    return `(paths ${start}-${end})`;
  }
  return `(path ${start})`;
}

/**
 * Check if a path description fuzzy-matches an existing AC line.
 * Matches if the first 4+ significant words of the path appear in the AC.
 * @param {string} pathDesc - Path description
 * @param {string} acLine - Existing AC line
 * @returns {boolean}
 */
function fuzzyMatch(pathDesc, acLine) {
  const pathWords = pathDesc.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const acLower = acLine.toLowerCase();
  if (pathWords.length === 0) return false;
  const matchCount = pathWords.filter(w => acLower.includes(w)).length;
  return matchCount >= Math.min(pathWords.length, 3);
}

/**
 * Generate acceptance criteria from discovered behavioral paths.
 * @param {Object<string, string[]>} pathsByCategory - Paths grouped by category name
 * @param {string} issueType - Issue type (enhancement, bug, story, epic)
 * @param {string[]} [existingACs] - Existing AC lines from the issue body
 * @returns {{acs: string[], grouped: boolean, skipped: boolean, markdown: string, report: string, duplicatesSkipped: number}}
 */
function generateACsFromPaths(pathsByCategory, issueType, existingACs = []) {
  if (!ENHANCEMENT_TYPES.includes(issueType)) {
    return {
      acs: [],
      grouped: false,
      skipped: true,
      markdown: '',
      report: 'AC generation skipped (not an enhancement issue)',
      duplicatesSkipped: 0
    };
  }

  const allPaths = [];
  for (const [category, paths] of Object.entries(pathsByCategory)) {
    for (const desc of paths) {
      allPaths.push({ category, description: desc });
    }
  }

  const totalPaths = allPaths.length;
  const shouldGroup = totalPaths >= GROUPING_THRESHOLD;
  const acs = [];
  let duplicatesSkipped = 0;
  let pathNumber = 0;

  const categoryACs = {};

  for (const { category, description } of allPaths) {
    pathNumber++;

    // Deduplication check against existing ACs
    if (existingACs.some(ac => fuzzyMatch(description, ac))) {
      duplicatesSkipped++;
      continue;
    }

    const acLine = `- [ ] ${description} ${formatPathRef(pathNumber)}`;
    acs.push(acLine);

    if (shouldGroup) {
      if (!categoryACs[category]) categoryACs[category] = [];
      categoryACs[category].push(acLine);
    }
  }

  // Build markdown output
  let markdown = '';
  if (shouldGroup) {
    const sections = [];
    for (const [category, lines] of Object.entries(categoryACs)) {
      sections.push(`\n*${category}*\n${lines.join('\n')}`);
    }
    markdown = sections.join('\n');
  } else {
    markdown = acs.join('\n');
  }

  const addedCount = acs.length;
  const report = duplicatesSkipped > 0
    ? `Added ${addedCount} acceptance criteria from ${totalPaths} paths (${duplicatesSkipped} duplicates skipped)`
    : `Added ${addedCount} acceptance criteria from ${totalPaths} paths`;

  return {
    acs,
    grouped: shouldGroup,
    skipped: false,
    markdown,
    report,
    duplicatesSkipped
  };
}

module.exports = { generateACsFromPaths, formatPathRef };
