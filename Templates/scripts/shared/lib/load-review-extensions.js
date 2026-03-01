/**
 * @framework-script 0.55.0
 * Extension loading error messages and utilities for /review-issue
 * Referenced by .claude/commands/review-issue.md Step 2b
 *
 * Error handling: all errors fall back to standard review only (non-blocking).
 */

const ERRORS = {
  REGISTRY_NOT_FOUND: 'Review extensions registry not found. Run hub update or check installation.',
  REGISTRY_MALFORMED: 'Review extensions registry is malformed. Run hub update or check installation.',
  CRITERIA_NOT_FOUND: (domain) => `Warning: Review criteria file not found for '${domain}'. Skipping domain. Update hub to resolve.`,
  ALL_MISSING: 'No review criteria files found. Running standard review only.',
  UNKNOWN_EXTENSION: (id) => `Unknown extension: ${id}. Available: security, accessibility, performance, chaos, contract, qa, seo, privacy`
};

const AVAILABLE_EXTENSIONS = ['security', 'accessibility', 'performance', 'chaos', 'contract', 'qa', 'seo', 'privacy'];

module.exports = { ERRORS, AVAILABLE_EXTENSIONS };
