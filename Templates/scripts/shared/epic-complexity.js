// Rubrical Works (c) 2026
/**
 * @framework-script 0.83.0
 * @description Epic complexity classifier for /work --nonstop. Scans sub-issue titles for functional vs restyle signals and returns classification with strictTDD flag.
 * @checksum sha256:placeholder
 *
 * @module .claude/scripts/shared/epic-complexity
 */
const path = require('path');
const { validateIssueNumber } = require('./lib/input-validation.js');

const SIGNALS_PATH = path.join(__dirname, '../../metadata/epic-complexity-signals.json');

/**
 * Load complexity signals from JSON config
 * @returns {{ functional: string[], restyle: string[] }}
 */
function loadSignals() {
  return require(SIGNALS_PATH);
}

/**
 * Classify an epic's complexity based on sub-issue titles
 * @param {Array<{title: string, body: string}>} subIssues
 * @param {object} [signals] - Optional signals override (for testing)
 * @returns {{ classification: 'functional'|'restyle', strictTDD: boolean, signals: string[] }}
 */
function classifyEpic(subIssues, signals) {
  if (!signals) {
    signals = loadSignals();
  }

  // Empty sub-issues → conservative functional
  if (!subIssues || subIssues.length === 0) {
    return { classification: 'functional', strictTDD: true, signals: [] };
  }

  const matchedSignals = [];

  // Check each sub-issue title for functional indicators
  for (const issue of subIssues) {
    const title = (issue.title || '').toLowerCase();
    if (!title) continue;

    for (const keyword of signals.functional) {
      if (title.includes(keyword.toLowerCase())) {
        matchedSignals.push(keyword);
      }
    }
  }

  // Any functional signal → functional (conservative)
  if (matchedSignals.length > 0) {
    return {
      classification: 'functional',
      strictTDD: true,
      signals: [...new Set(matchedSignals)],
    };
  }

  // Check if ALL sub-issues match restyle patterns
  const allRestyle = subIssues.every((issue) => {
    const title = (issue.title || '').toLowerCase();
    if (!title) return false;
    return signals.restyle.some((keyword) => title.includes(keyword.toLowerCase()));
  });

  if (allRestyle) {
    return { classification: 'restyle', strictTDD: false, signals: [] };
  }

  // No functional signals but not all restyle → conservative functional
  return { classification: 'functional', strictTDD: true, signals: [] };
}

// CLI mode: node epic-complexity.js <issue-number>
if (require.main === module) {
  const issueArg = process.argv[2];
  if (!issueArg) {
    console.log(JSON.stringify({ ok: false, error: 'Usage: epic-complexity.js <issue-number>' }));
    process.exit(1);
  }
  validateIssueNumber(issueArg);

  const { execFileSync } = require('child_process');
  try {
    const output = execFileSync('gh', ['pmu', 'sub', 'list', issueArg, '--json'], { encoding: 'utf8' });
    const data = JSON.parse(output);
    const subIssues = (data.children || []).map((c) => ({ title: c.title || '', body: '' }));
    const result = classifyEpic(subIssues);
    console.log(JSON.stringify({ ok: true, ...result }));
  } catch (err) {
    console.log(JSON.stringify({ ok: false, error: err.message }));
    process.exit(1);
  }
}

module.exports = { classifyEpic, loadSignals };
