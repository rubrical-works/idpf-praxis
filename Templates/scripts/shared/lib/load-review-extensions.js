// Rubrical Works (c) 2026
/**
 * @framework-script 0.63.1
 * Extension loading error messages and utilities for /review-issue and /code-review
 * Referenced by .claude/commands/review-issue.md Step 2b
 * Referenced by .claude/commands/code-review.md Step 5c (#1767)
 *
 * Error handling: all errors fall back to standard review only (non-blocking).
 */

const fs = require('fs');
const path = require('path');

const ERRORS = {
  REGISTRY_NOT_FOUND: 'Review extensions registry not found. Run hub update or check installation.',
  REGISTRY_MALFORMED: 'Review extensions registry is malformed. Run hub update or check installation.',
  CRITERIA_NOT_FOUND: (domain) => `Warning: Review criteria file not found for '${domain}'. Skipping domain. Update hub to resolve.`,
  ALL_MISSING: 'No review criteria files found. Running standard review only.',
  UNKNOWN_EXTENSION: (id) => `Unknown extension: ${id}. Available: security, accessibility, performance, chaos, contract, qa, seo, privacy`
};

const AVAILABLE_EXTENSIONS = ['security', 'accessibility', 'performance', 'chaos', 'contract', 'qa', 'seo', 'privacy'];

/**
 * Extract "Code Review Questions" section from criteria file content.
 * @param {string} content - Full content of a review criteria markdown file
 * @returns {string[]} Array of question strings (bullet items)
 */
function extractCodeReviewQuestions(content) {
  const lines = content.split('\n');
  const questions = [];
  let inSection = false;

  for (const line of lines) {
    // Detect start of Code Review Questions section
    if (/^##\s+Code Review Questions/.test(line)) {
      inSection = true;
      continue;
    }

    // Detect next section (any ## heading) — end of our section
    if (inSection && /^##\s+/.test(line)) {
      break;
    }

    // Collect bullet items within the section
    if (inSection && /^\s*-\s+/.test(line)) {
      questions.push(line.replace(/^\s*-\s+/, '').trim());
    }
  }

  return questions;
}

/**
 * Load code review extension criteria for specified domains.
 * @param {string} projectDir - Path to the project directory
 * @param {string[]} domainIds - Domain IDs to load, or ['all']
 * @returns {object} { ok, domains, warnings, error? }
 */
function loadCodeReviewExtensions(projectDir, domainIds) {
  const registryPath = path.join(projectDir, '.claude', 'metadata', 'review-extensions.json');
  const warnings = [];

  // Load registry
  if (!fs.existsSync(registryPath)) {
    return { ok: false, domains: {}, warnings, error: ERRORS.REGISTRY_NOT_FOUND };
  }

  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  } catch (_err) {
    return { ok: false, domains: {}, warnings, error: ERRORS.REGISTRY_MALFORMED };
  }

  // Resolve 'all' to all registered extensions
  let requestedIds = domainIds;
  if (requestedIds.length === 1 && requestedIds[0] === 'all') {
    requestedIds = Object.keys(registry.extensions);
  }

  const domains = {};

  for (const id of requestedIds) {
    const ext = registry.extensions[id];
    if (!ext) {
      warnings.push(ERRORS.UNKNOWN_EXTENSION(id));
      continue;
    }

    // Read criteria file
    const criteriaPath = path.join(projectDir, ext.source);
    try {
      const content = fs.readFileSync(criteriaPath, 'utf-8');
      const questions = extractCodeReviewQuestions(content);

      if (questions.length > 0) {
        domains[id] = {
          description: ext.description,
          framework: ext.framework || null,
          questions,
        };
      } else {
        warnings.push(`No Code Review Questions found in ${ext.source}. Skipping '${id}'.`);
      }
    } catch (_err) {
      warnings.push(ERRORS.CRITERIA_NOT_FOUND(id));
    }
  }

  return { ok: true, domains, warnings };
}

module.exports = { ERRORS, AVAILABLE_EXTENSIONS, extractCodeReviewQuestions, loadCodeReviewExtensions };
