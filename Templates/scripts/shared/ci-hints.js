#!/usr/bin/env node

/**
 * @framework-script 0.48.1
 * CI Contextual Hints
 *
 * Generates state-aware hints that guide users toward logical next actions
 * after each /ci subcommand. One hint per invocation, no urgency language.
 *
 * Proposal reference: Proposal/Implemented/CI-Workflow-Management-Command.md
 * (10 hint mappings in the "Contextual Hints" section)
 */

/**
 * Related feature mapping — for each CI feature, the most complementary one.
 * Used by the `add` subcommand hint to suggest a follow-up.
 */
const RELATED_FEATURES = {
  'cross-os-testing':     { feature: 'concurrency-groups', reason: 'cancel superseded runs' },
  'multi-node-versions':  { feature: 'dependency-caching', reason: 'cache per version' },
  'paths-ignore':         { feature: 'concurrency-groups', reason: 'cancel superseded runs' },
  'concurrency-groups':   { feature: 'paths-ignore', reason: 'skip docs-only changes' },
  'dependency-caching':   { feature: 'dependency-audit', reason: 'scan cached deps for vulnerabilities' },
  'dependency-audit':     { feature: 'codeql-analysis', reason: 'deeper code-level scanning' },
  'deploy-on-tag':        { feature: 'conventional-commits', reason: 'enforce commit format for releases' },
  'codeql-analysis':      { feature: 'dependency-audit', reason: 'complement with dependency scanning' },
  'coverage-upload':      { feature: 'multi-node-versions', reason: 'track coverage across versions' },
  'conventional-commits': { feature: 'stale-cleanup', reason: 'automate issue maintenance' },
  'stale-cleanup':        { feature: 'conventional-commits', reason: 'enforce commit format' },
};

/**
 * Get a contextual hint based on the subcommand and its result state.
 *
 * @param {Object} context
 * @param {string} context.subcommand - 'status' | 'add' | 'remove' | 'list' | 'validate' | 'recommend'
 * @param {string} [context.feature] - Feature ID (for add/remove)
 * @param {boolean} [context.isFirstFeature] - True if this is the first feature added
 * @param {number} [context.enabledCount] - Number of enabled features (for list)
 * @param {number} [context.totalCount] - Total number of features (for list)
 * @param {number} [context.issueCount] - Number of validation issues (for validate)
 * @param {boolean} [context.applied] - Whether recommendations were applied (for recommend)
 * @returns {string} A single hint string, or empty string for unknown subcommands
 */
function getHint(context) {
  switch (context.subcommand) {
    case 'status':
      return 'Tip: Run /ci recommend to get improvement suggestions for your workflows.';

    case 'add':
      return getAddHint(context);

    case 'remove':
      return 'Run /ci validate to verify your workflows are still correct.';

    case 'list':
      return getListHint(context);

    case 'validate':
      return getValidateHint(context);

    case 'recommend':
      return getRecommendHint(context);

    default:
      return '';
  }
}

/**
 * Hint for /ci add — first feature gets extensions recipe hint,
 * otherwise suggests a related feature.
 */
function getAddHint(context) {
  if (context.isFirstFeature) {
    return 'Tip: Use /extensions recipes ci to add CI gates to your release workflow.';
  }

  const related = RELATED_FEATURES[context.feature];
  if (related) {
    return `You added ${context.feature}. Related: /ci add ${related.feature} (${related.reason}).`;
  }

  // Fallback for unknown features
  return 'Run /ci list to see all available features.';
}

/**
 * Hint for /ci list — varies based on whether all features are enabled.
 */
function getListHint(context) {
  const { enabledCount, totalCount } = context;

  if (enabledCount >= totalCount) {
    return 'All available features are enabled. Run /ci validate to check for issues.';
  }

  const available = totalCount - enabledCount;
  return `${available} features available. Run /ci recommend for project-specific suggestions.`;
}

/**
 * Hint for /ci validate — varies based on whether issues were found.
 */
function getValidateHint(context) {
  const { issueCount } = context;

  if (issueCount > 0) {
    const plural = issueCount === 1 ? 'issue' : 'issues';
    return `Found ${issueCount} ${plural}. Run /ci recommend to see suggested fixes.`;
  }

  return 'No issues found. Your workflows look good.';
}

/**
 * Hint for /ci recommend — varies based on whether changes were applied.
 */
function getRecommendHint(context) {
  if (context.applied) {
    return 'Run /ci validate to verify the changes. Use /extensions recipes ci to add CI gates to release commands.';
  }

  return 'You can apply individual features later with /ci add <feature>.';
}

// CLI entry point
if (require.main === module) {
  // Demo: show all hint scenarios
  const scenarios = [
    { subcommand: 'status' },
    { subcommand: 'add', feature: 'cross-os-testing', isFirstFeature: true },
    { subcommand: 'add', feature: 'cross-os-testing', isFirstFeature: false },
    { subcommand: 'remove', feature: 'codeql-analysis' },
    { subcommand: 'list', enabledCount: 4, totalCount: 11 },
    { subcommand: 'list', enabledCount: 11, totalCount: 11 },
    { subcommand: 'validate', issueCount: 3 },
    { subcommand: 'validate', issueCount: 0 },
    { subcommand: 'recommend', applied: true },
    { subcommand: 'recommend', applied: false },
  ];

  for (const ctx of scenarios) {
    console.log(`[${ctx.subcommand}] ${getHint(ctx)}`);
  }
}

module.exports = { getHint, RELATED_FEATURES };
