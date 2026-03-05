// Rubrical Systems (c) 2026
/**
 * @framework-script 0.58.0
 * generate-test-plan.js - Generate test plan skeleton from branch issues
 * @module scripts/shared/generate-test-plan
 *
 * Usage:
 *   node .claude/scripts/shared/generate-test-plan.js [version]
 *
 * Examples:
 *   node .claude/scripts/shared/generate-test-plan.js v0.33.0
 *   node .claude/scripts/shared/generate-test-plan.js           # Auto-detects version
 *
 * Prerequisites:
 *   - gh CLI installed and authenticated
 *   - gh-pmu extension installed
 *   - Active branch with assigned issues
 *
 * Output:
 *   Creates Construction/Test-Plans/{version}-test-plan.md
 */

const { execSync } = require('child_process');
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
 * Get issues assigned to current branch
 * @returns {Array<Object>} Array of issue objects with number, title, body
 */
function getBranchIssues() {
  const branch = getCurrentBranch();
  if (!branch) {
    console.error('Not on a branch');
    return [];
  }

  // Use gh pmu to get issues for current branch
  const output = exec(`gh pmu branch list --json=name,issues`);
  if (!output) {
    return [];
  }

  try {
    const branches = JSON.parse(output);
    const currentBranchData = branches.find(b => b.name === branch);
    if (!currentBranchData || !currentBranchData.issues) {
      return [];
    }

    // Fetch full issue details for each issue number
    const issues = [];
    for (const issueNum of currentBranchData.issues) {
      const issueData = exec(`gh issue view ${issueNum} --json=number,title,body,labels`);
      if (issueData) {
        try {
          issues.push(JSON.parse(issueData));
        } catch {
          // Skip malformed issue data
        }
      }
    }
    return issues;
  } catch {
    return [];
  }
}

/**
 * Extract acceptance criteria from issue body
 * @param {string} body - Issue body markdown
 * @returns {Array<Object>} Array of criteria objects {text, checked}
 */
function extractAcceptanceCriteria(body) {
  if (!body) return [];

  const criteria = [];
  const lines = body.split('\n');

  let inAcceptanceCriteria = false;

  for (const line of lines) {
    // Check for acceptance criteria section header
    if (/^#+\s*(acceptance\s*criteria|criteria|requirements)/i.test(line)) {
      inAcceptanceCriteria = true;
      continue;
    }

    // Check for next section header (end of acceptance criteria)
    if (inAcceptanceCriteria && /^#+\s/.test(line) && !/acceptance|criteria|requirements/i.test(line)) {
      inAcceptanceCriteria = false;
      continue;
    }

    // Parse checkbox items (only when inside acceptance criteria section)
    if (inAcceptanceCriteria) {
      const checkboxMatch = line.match(/^\s*-\s*\[([ xX])\]\s*(.+)/);
      if (checkboxMatch) {
        criteria.push({
          text: checkboxMatch[2].trim(),
          checked: checkboxMatch[1].toLowerCase() === 'x',
        });
      }
    }
  }

  return criteria;
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
  const firstParagraph = issue.body?.split('\n\n')[0]?.replace(/^#+.*\n?/, '').trim();
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
  md += `- idpf-praxis-dist ${version} for distribution verification\n`;
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

  // Get issues from branch
  const issues = getBranchIssues();
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
  getVersion,
  getCurrentBranch,
  getBranchIssues,
  extractAcceptanceCriteria,
  getPriority,
  generateTestCase,
  generateTestPlan,
};
