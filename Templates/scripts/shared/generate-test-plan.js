// Rubrical Works (c) 2026
/**
 * @framework-script 0.116.0
 * @description Generate a test plan skeleton markdown file from the issues assigned to the current git branch. Auto-detects version from branch name or accepts version parameter. Outputs to Construction/Test-Plans/ directory. Used by /prepare-release test plan generation.
 * @checksum sha256:placeholder
 *
 * @module scripts/shared/generate-test-plan
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

// Spawns bounded via lib/exec.js (#2469) — aliased to the original names
// so call sites are unchanged.
const { execTimed: execSync } = require('./lib/exec.js');
// #2600: a seventh scanner, not among the six the issue enumerated. AC6 says
// "every framework code path extracting checkboxes from an issue body", and
// this is one — it was fence-blind like the rest.
const { extractAcceptanceCriteria: sharedExtractAcceptanceCriteria } = require('./lib/checkbox-scan.js');
const { normalizeEol } = require('./lib/normalize-eol.js');
const fs = require('fs');
const path = require('path');

/**
 * Execute a shell command and return stdout
 * @param {string} cmd - Command to execute
 * @returns {string} Command output
 */
function exec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (_error) {
    return '';
  }
}

/**
 * Get current branch name
 * @returns {string} Branch name
 */
function getCurrentBranch() {
  return exec('git branch --show-current');
}

/**
 * Get version from branch name or argument
 * @param {string} [argVersion] - Version passed as argument
 * @returns {string} Version string (e.g., "v0.33.0")
 */
function getVersion(argVersion) {
  if (argVersion) {
    return argVersion.startsWith('v') ? argVersion : `v${argVersion}`;
  }

  const branch = getCurrentBranch();
  const match = branch.match(/v?\d+\.\d+\.\d+/);
  if (match) {
    return match[0].startsWith('v') ? match[0] : `v${match[0]}`;
  }

  // Try to get from framework-manifest.json
  try {
    const manifest = JSON.parse(fs.readFileSync('framework-manifest.json', 'utf8'));
    if (manifest.version && !manifest.version.includes('{{')) {
      return manifest.version.startsWith('v') ? manifest.version : `v${manifest.version}`;
    }
  } catch {
    // Fall through to placeholder
  }
  return 'vX.Y.Z';
}

/**
 * Run a command whose output the plan depends on, throwing on failure (#3054
 * item 10). `exec()` above turns every failure into '', which is right for the
 * branch and version probes and wrong here: '' read as "no issues" wrote an
 * empty test plan and exited 0.
 */
function execRequired(cmd, what) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    const detail = (error.stderr && error.stderr.toString().trim()) || error.message;
    throw new Error(`${what} failed: ${detail}`);
  }
}

/**
 * Get issues assigned to current branch
 * @returns {Array<Object>} Array of issue objects with number, title, body
 * @throws {Error} When the branch, its issue list or any issue cannot be read,
 *   or gh pmu's active branch is not the checked-out one.
 *   A branch with no issues is an empty array; a failure to look is a throw.
 */
function getBranchIssues() {
  const branch = getCurrentBranch();
  if (!branch) {
    throw new Error('Not on a branch');
  }

  // `gh pmu branch list` takes no flags; `branch current --json=name,issues`
  // is the form that exists, and its issues are {number,title,state} objects
  // rather than bare numbers (#3367).
  const output = execRequired(`gh pmu branch current --json=name,issues`, 'gh pmu branch current');
  let current;
  try {
    current = JSON.parse(output);
  } catch (err) {
    throw new Error(`gh pmu branch current returned unparseable output: ${err.message}`);
  }
  if (current.name !== branch) {
    throw new Error(`gh pmu's active branch is ${current.name}, but ${branch} is checked out`);
  }
  if (!Array.isArray(current.issues)) {
    return [];
  }

  // Fetch full issue details for each issue number
  const issues = [];
  for (const issueNum of current.issues.map(i => i.number)) {
    const issueData = execRequired(`gh issue view ${issueNum} --json=number,title,body,labels`, `gh issue view ${issueNum}`);
    try {
      issues.push(JSON.parse(issueData));
    } catch (err) {
      throw new Error(`gh issue view ${issueNum} returned unparseable output: ${err.message}`);
    }
  }
  return issues;
}

/**
 * Extract acceptance criteria from issue body
 * @param {string} body - Issue body markdown
 * @returns {Array<Object>} Array of criteria objects {text, checked}
 */
function extractAcceptanceCriteria(body) {
  // #2616: one section anchor, not three. This file used to accept bare
  // "criteria" and "requirements" headings that no other parser did, and #2600
  // left that divergence in place while unifying fences and checkboxes.
  //
  // The extra vocabulary is DELETED rather than pushed into the shared module:
  // measured across ~300 recent issue bodies plus CommandsSrc/, Templates/ and
  // tests/fixtures/, neither form had ever been used — 0 occurrences against
  // 230 acceptance-criteria headings. Widening the shared default would have
  // handed that tolerance to work-preamble.js, whose count drives three gates.
  //
  // Delegating also gains the bold form, which this file never accepted.
  return sharedExtractAcceptanceCriteria(body).items;
}

/**
 * Determine priority from labels
 * @param {Array<Object>} labels - Issue labels array
 * @returns {string} Priority level
 */
function getPriority(labels) {
  if (!labels || !Array.isArray(labels)) return 'Medium';

  const labelNames = labels.map(l => l.name?.toLowerCase() || '');

  if (labelNames.includes('p0') || labelNames.includes('critical')) return 'Critical';
  if (labelNames.includes('p1') || labelNames.includes('high')) return 'High';
  if (labelNames.includes('p2') || labelNames.includes('medium')) return 'Medium';
  if (labelNames.includes('p3') || labelNames.includes('low')) return 'Low';

  return 'Medium';
}

/**
 * Generate test case markdown for an issue
 * @param {Object} issue - Issue object
 * @param {number} index - Test case number
 * @returns {string} Markdown for test case
 */
function generateTestCase(issue, index) {
  const tcNum = index + 1;
  const priority = getPriority(issue.labels);
  const criteria = extractAcceptanceCriteria(issue.body);

  let md = `### TC-${tcNum}: ${issue.title}\n\n`;
  md += `**Priority:** ${priority}\n`;
  md += `**Issue:** #${issue.number}\n\n`;

  // Background section (first paragraph of issue body or generated)
  // A CRLF body has no `\n\n`, so the "first paragraph" would be all of it (#3064).
  const firstParagraph = normalizeEol(issue.body)?.split('\n\n')[0]?.replace(/^#+.*\n?/, '').trim();
  if (firstParagraph && firstParagraph.length > 20) {
    md += `**Background:** ${firstParagraph.substring(0, 200)}${firstParagraph.length > 200 ? '...' : ''}\n\n`;
  }

  md += `**Preconditions:**\n`;
  md += `- [ ] TODO: List preconditions\n\n`;

  md += `**Steps:**\n`;
  if (criteria.length > 0) {
    criteria.forEach((c, i) => {
      md += `${i + 1}. Verify: ${c.text}\n`;
    });
  } else {
    md += `1. TODO: Add test steps\n`;
  }
  md += '\n';

  md += `**Expected Results:**\n`;
  if (criteria.length > 0) {
    criteria.forEach((c) => {
      md += `- [ ] ${c.text}\n`;
    });
  } else {
    md += `- [ ] TODO: Add expected results\n`;
  }
  md += '\n';

  md += `**Status:** [ ] Pass / [ ] Fail\n\n`;
  md += `---\n\n`;

  return md;
}

/**
 * Generate full test plan document
 * @param {string} version - Version string
 * @param {Array<Object>} issues - Array of issues
 * @returns {string} Complete test plan markdown
 */
function generateTestPlan(version, issues) {
  const date = new Date().toISOString().split('T')[0];
  let md = `# Test Plan: ${version}\n\n`;
  md += `**Release Date:** ${date}\n`;
  md += `**Tester:** Manual Verification\n\n`;
  md += `---\n\n`;

  // Overview
  md += `## Overview\n\n`;
  md += `This test plan verifies the fixes and changes in ${version}:\n`;
  issues.forEach(issue => {
    md += `- **#${issue.number}**: ${issue.title}\n`;
  });
  md += '\n---\n\n';

  // Test Environment
  md += `## Test Environment\n\n`;
  md += `- Fresh project directory (not idpf-praxis) for deployment tests\n`;
  md += `- idpf-praxis ${version} for distribution verification\n`;
  md += `- Node.js 18+\n`;
  md += `- TODO: Add platform specifics\n\n`;
  md += `---\n\n`;

  // Test Cases
  md += `## Test Cases\n\n`;
  if (issues.length === 0) {
    md += `*No issues found for this branch. Add test cases manually.*\n\n`;
  } else {
    issues.forEach((issue, index) => {
      md += generateTestCase(issue, index);
    });
  }

  // Test Execution Table
  md += `## Test Execution\n\n`;
  md += `| Test Case | Tester | Date | Status | Notes |\n`;
  md += `|-----------|--------|------|--------|-------|\n`;
  issues.forEach((_, index) => {
    md += `| TC-${index + 1} | | | | |\n`;
  });
  if (issues.length === 0) {
    md += `| TC-1 | | | | |\n`;
  }
  md += '\n---\n\n';

  // Pass Criteria
  md += `## Pass Criteria\n\n`;
  md += `All test cases pass. Critical and High priority test cases are blocking.\n\n`;
  md += `---\n\n`;

  // Notes
  md += `## Notes\n\n`;
  md += `- Generated by \`generate-test-plan.js\` on ${date}\n`;
  md += `- Review and complete TODO items before testing\n`;
  md += `- Add verification commands specific to your environment\n\n`;
  md += `---\n\n`;

  return md;
}

/**
 * Main entry point
 */
function main() {
  const args = process.argv.slice(2);
  const version = getVersion(args[0]);

  console.log(`Generating test plan for ${version}...`);

  // Get issues from branch — a failure to read them writes no plan (#3054 item 10)
  let issues;
  try {
    issues = getBranchIssues();
  } catch (err) {
    console.error(`Error: ${err.message}. No test plan was written.`);
    return 1;
  }
  console.log(`Found ${issues.length} issue(s) assigned to branch`);

  // Generate test plan
  const testPlan = generateTestPlan(version, issues);

  // Ensure output directory exists
  const outputDir = path.join(process.cwd(), 'Construction', 'Test-Plans');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write test plan
  const outputPath = path.join(outputDir, `${version}-test-plan.md`);
  fs.writeFileSync(outputPath, testPlan);

  console.log(`Test plan created: ${outputPath}`);
  console.log('');
  console.log('Next steps:');
  console.log('1. Review and complete TODO items in the test plan');
  console.log('2. Add environment-specific verification commands');
  console.log('3. Execute tests and update status');

  return 0;
}

// Run if executed directly
if (require.main === module) {
  process.exit(main());
}

// Export for testing
module.exports = {
  main,
  getVersion,
  getCurrentBranch,
  getBranchIssues,
  extractAcceptanceCriteria,
  getPriority,
  generateTestCase,
  generateTestPlan,
};
