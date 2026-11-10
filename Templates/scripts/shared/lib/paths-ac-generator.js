// Rubrical Works (c) 2026
/**
 * @framework-script 0.117.0
 * @description Generate acceptance criteria from behavioral paths discovered by /paths.
 * Only applies to enhancement issues. Produces ACs with inline path references.
 * @checksum sha256:placeholder
 *
 * @module .claude/scripts/shared/lib/paths-ac-generator
 */

const GROUPING_THRESHOLD = 6;
const ENHANCEMENT_TYPES = ['enhancement'];

/**
 * Share of a path's significant words that must appear in one existing AC for
 * the path to count as a duplicate of it (#3539). A fixed count of 3 words
 * dropped 25 genuinely new paths on #3538, because a long, domain-heavy path
 * shares 3 domain words with almost any AC. Measured on that fixture
 * (tests/fixtures/paths-ac-dedup-3538.json): the AC-restating path scores 0.64,
 * the highest path no AC expresses scores 0.50.
 */
const DUPLICATE_WORD_SHARE = 0.6;

/**
 * Fewest shared significant words a duplicate needs, on top of the share
 * (#3562). The share alone skipped a one- or two-word path whenever an AC
 * shared one or two of its words — `Rejects empty input` against `Empty input
 * shows a placeholder` is 2 of 3. A symmetric measure does not fix it: on the
 * #3538 fixture Jaccard scores the AC-restating path 0.39 and a path no AC
 * expresses 0.43, so no threshold separates them; the count does (7 vs 2).
 * Alone, a count of 3 is the #3539 failure, so it never stands without the share.
 */
const DUPLICATE_MIN_WORDS = 3;

/**
 * Words too common in path and AC prose to say anything about coverage.
 * Only words longer than 3 characters need listing; shorter ones never count.
 */
const STOP_WORDS = new Set([
  'that', 'this', 'with', 'from', 'into', 'when', 'then', 'than', 'each',
  'every', 'only', 'never', 'also', 'both', 'same', 'after', 'before', 'still',
  'does', 'their', 'them', 'they', 'have', 'were', 'been', 'being', 'instead',
  'rather', 'whatever', 'however', 'exactly', 'today',
  // Every AC is about the issue it sits in, so the word says nothing about coverage.
  'issue'
]);

const { matchCheckboxLine } = require('./checkbox-scan');

/** A generated AC's path reference, e.g. `(path 5)` or `(paths 1-3)`. */
const PATH_REF = /\(paths? [\d-]+\)/g;

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
 * Split text into lowercase whole words longer than 3 characters. Hyphenated
 * and underscored identifiers (`step-wise`, `labelAssigned`) stay one word.
 * Whole words, not substrings (#3539): `cycle` must not match `cycles`.
 * @param {string} text
 * @returns {string[]}
 */
function significantWords(text) {
  const words = String(text).toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .map(w => w.replace(/^[-_]+|[-_]+$/g, ''));
  return [...new Set(words.filter(w => w.length > 3 && !STOP_WORDS.has(w)))];
}

/**
 * Check if a path description restates an existing AC line: at least
 * DUPLICATE_WORD_SHARE of the path's significant words appear in the AC, and
 * at least DUPLICATE_MIN_WORDS of them (#3562).
 * @param {string} pathDesc - Path description
 * @param {string} acLine - Existing AC line
 * @returns {boolean}
 */
function fuzzyMatch(pathDesc, acLine) {
  const pathWords = significantWords(pathDesc);
  if (pathWords.length === 0) return false;
  const acWords = new Set(significantWords(String(acLine).replace(PATH_REF, '')));
  const matchCount = pathWords.filter(w => acWords.has(w)).length;
  return matchCount >= DUPLICATE_MIN_WORDS && matchCount / pathWords.length >= DUPLICATE_WORD_SHARE;
}

/**
 * Generate acceptance criteria from discovered behavioral paths.
 * @param {Object<string, string[]>} pathsByCategory - Paths grouped by category name
 * @param {string} issueType - Issue type (enhancement, bug, story, epic)
 * @param {string[]} [existingACs] - Existing AC lines from the issue body
 * @returns {{acs: string[], grouped: boolean, skipped: boolean, markdown: string, report: string, duplicatesSkipped: number, duplicates: Array<{path: string, pathNumber: number, matchedAc: string}>}}
 *   `duplicates` names every skipped path and the existing AC it matched, so the
 *   decision can be seen and contested (#3539); `report` lists them too.
 */
function generateACsFromPaths(pathsByCategory, issueType, existingACs = []) {
  if (!ENHANCEMENT_TYPES.includes(issueType)) {
    return {
      acs: [],
      grouped: false,
      skipped: true,
      markdown: '',
      report: 'AC generation skipped (not an enhancement issue)',
      duplicatesSkipped: 0,
      duplicates: []
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
  const duplicates = [];
  let pathNumber = 0;

  const categoryACs = {};

  for (const { category, description } of allPaths) {
    pathNumber++;

    // Deduplication check against existing ACs
    const matchedAc = existingACs.find(ac => fuzzyMatch(description, ac));
    if (matchedAc !== undefined) {
      duplicates.push({ path: description, pathNumber, matchedAc });
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
  const duplicatesSkipped = duplicates.length;
  let report = `Added ${addedCount} acceptance criteria from ${totalPaths} paths`;
  if (duplicatesSkipped > 0) {
    const lines = duplicates.map(d => {
      const checkbox = matchCheckboxLine(d.matchedAc);
      return `  Path ${d.pathNumber} "${d.path}" matches: ${checkbox ? checkbox.text : d.matchedAc.trim()}`;
    });
    report += ` (${duplicatesSkipped} duplicates skipped)\n${lines.join('\n')}`;
  }

  return {
    acs,
    grouped: shouldGroup,
    skipped: false,
    markdown,
    report,
    duplicatesSkipped,
    duplicates
  };
}

module.exports = { generateACsFromPaths, formatPathRef };
