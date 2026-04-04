// Rubrical Works (c) 2026
/**
 * @framework-script 0.81.1
 * @description Classifies changed files as test or source for /work Step 4c.
 * Exports isTestFile() for path classification and formatFilesChanged() for
 * generating the markdown "Files Changed" section with test/source separation.
 *
 * @module .claude/scripts/shared/lib/classify-changed-files
 */

/**
 * Test file detection patterns:
 * - *.test.* or *.spec.* (e.g., parser.test.ts, App.spec.js)
 * - Files under __tests__/, test/, or tests/ directories
 */
const TEST_PATTERNS = [
  /\.test\.[^.]+$/,
  /\.spec\.[^.]+$/,
  /(^|[/\\])__tests__[/\\]/,
  /(^|[/\\])tests?[/\\]/,
];

/**
 * Determine if a file path is a test file.
 * @param {string} filePath - Relative file path
 * @returns {boolean}
 */
function isTestFile(filePath) {
  return TEST_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Parse git log --name-status output and format as markdown with test/source separation.
 * @param {string} gitOutput - Output from `git log --name-status --grep="Refs #N" --pretty=format:"" | sort -u | grep -v "^$"`
 * @returns {string} Markdown formatted "Files Changed" section, or empty string if no files
 */
function formatFilesChanged(gitOutput) {
  if (!gitOutput || !gitOutput.trim()) return '';

  const categories = { A: { label: 'Added', source: [], tests: [] }, M: { label: 'Modified', source: [], tests: [] }, D: { label: 'Deleted', source: [], tests: [] } };

  for (const line of gitOutput.trim().split('\n')) {
    const match = line.match(/^([AMD])\t(.+)$/);
    if (!match) continue;
    const [, status, filePath] = match;
    if (!categories[status]) continue;
    const bucket = isTestFile(filePath) ? 'tests' : 'source';
    categories[status][bucket].push(filePath);
  }

  const sections = [];
  for (const cat of Object.values(categories)) {
    if (cat.source.length === 0 && cat.tests.length === 0) continue;
    let section = `**${cat.label}:**`;
    if (cat.source.length > 0) {
      section += '\n- Source:';
      for (const f of cat.source) section += `\n  - \`${f}\``;
    }
    if (cat.tests.length > 0) {
      section += '\n- Tests:';
      for (const f of cat.tests) section += `\n  - \`${f}\``;
    }
    sections.push(section);
  }

  if (sections.length === 0) return '';
  return `### Files Changed\n${sections.join('\n\n')}`;
}

module.exports = { isTestFile, formatFilesChanged };
