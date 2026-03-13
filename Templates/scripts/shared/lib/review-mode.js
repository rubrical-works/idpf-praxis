// Rubrical Works (c) 2026
const fs = require('fs');
const path = require('path');

/**
 * @framework-script 0.63.0
 * Review Mode Helper Functions
 *
 * Provides utilities for filtering review criteria based on project's reviewMode configuration.
 */

let _criteriaCache = null;

/**
 * Load criteria mapping from metadata
 * @returns {Object} Criteria mapping configuration
 */
function loadCriteriaMapping() {
  if (_criteriaCache) {
    return _criteriaCache;
  }

  const criteriaPath = path.join(__dirname, '..', '..', '..', 'metadata', 'review-mode-criteria.json');

  if (!fs.existsSync(criteriaPath)) {
    console.warn('Warning: review-mode-criteria.json not found. All criteria will be evaluated.');
    return { modes: {}, criteria: {} };
  }

  const content = fs.readFileSync(criteriaPath, 'utf8');
  _criteriaCache = JSON.parse(content);
  return _criteriaCache;
}

/**
 * Load framework configuration
 * @param {string} projectDir - Project directory (defaults to cwd)
 * @returns {Object} Framework configuration
 */
function loadFrameworkConfig(projectDir = process.cwd()) {
  const configPath = path.join(projectDir, 'framework-config.json');

  if (!fs.existsSync(configPath)) {
    return { reviewMode: 'solo' }; // Default
  }

  const content = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(content);

  return config;
}

/**
 * Get the current review mode for the project
 * @param {string} projectDir - Project directory (defaults to cwd)
 * @param {string|null} modeOverride - Transient mode override (does not modify config)
 * @returns {string} Review mode ('solo', 'team', or 'enterprise')
 */
function getReviewMode(projectDir = process.cwd(), modeOverride = null) {
  const validModes = ['solo', 'team', 'enterprise'];

  // If override provided, validate and return (transient — never touches config)
  if (modeOverride != null) {
    if (!validModes.includes(modeOverride)) {
      throw new Error(`Invalid mode "${modeOverride}". Valid options: ${validModes.join(', ')}`);
    }
    return modeOverride;
  }

  const config = loadFrameworkConfig(projectDir);
  const mode = config.reviewMode || 'solo';

  // Validate config mode (lenient — warn and default)
  if (!validModes.includes(mode)) {
    console.warn(`Warning: Invalid reviewMode "${mode}". Defaulting to "solo".`);
    return 'solo';
  }

  return mode;
}

/**
 * Check if a criterion should be evaluated for the current review mode
 * @param {string} criterionId - Criterion identifier (e.g., 'story-sizing')
 * @param {string} projectDir - Project directory (defaults to cwd)
 * @param {string|null} modeOverride - Transient mode override
 * @returns {boolean} True if criterion applies to current mode
 */
function shouldEvaluate(criterionId, projectDir = process.cwd(), modeOverride = null) {
  const criteria = loadCriteriaMapping();
  const currentMode = getReviewMode(projectDir, modeOverride);

  // If criterion not found in mapping, evaluate it (safer default)
  if (!criteria.criteria || !criteria.criteria[criterionId]) {
    return true;
  }

  const criterion = criteria.criteria[criterionId];
  return criterion.modes && criterion.modes.includes(currentMode);
}

/**
 * Get all criteria that apply to the current review mode
 * @param {string} projectDir - Project directory (defaults to cwd)
 * @param {string|null} modeOverride - Transient mode override
 * @returns {Array<Object>} Array of applicable criteria
 */
function getApplicableCriteria(projectDir = process.cwd(), modeOverride = null) {
  const criteria = loadCriteriaMapping();
  const currentMode = getReviewMode(projectDir, modeOverride);

  if (!criteria.criteria) {
    return [];
  }

  const applicable = [];
  for (const [id, criterion] of Object.entries(criteria.criteria)) {
    if (criterion.modes && criterion.modes.includes(currentMode)) {
      applicable.push({ id, ...criterion });
    }
  }

  return applicable;
}

/**
 * Check if a criterion is classified as objective (auto-evaluable)
 * @param {string} criterionId - Criterion identifier (e.g., 'title-clear')
 * @returns {boolean} True if criterion is objective, false if subjective or unknown
 */
function isObjective(criterionId) {
  const criteria = loadCriteriaMapping();

  if (!criteria.criteria || !criteria.criteria[criterionId]) {
    return false; // Unknown criteria default to subjective (safer — asks user)
  }

  return criteria.criteria[criterionId].type === 'objective';
}

/**
 * Get all objective criteria applicable to the current review mode
 * @param {string} projectDir - Project directory (defaults to cwd)
 * @param {string|null} modeOverride - Transient mode override
 * @returns {Array<Object>} Array of objective criteria with id, name, autoCheck
 */
function getObjectiveCriteria(projectDir = process.cwd(), modeOverride = null) {
  return getApplicableCriteria(projectDir, modeOverride).filter(c => c.type === 'objective');
}

/**
 * Get all subjective criteria applicable to the current review mode
 * @param {string} projectDir - Project directory (defaults to cwd)
 * @param {string|null} modeOverride - Transient mode override
 * @returns {Array<Object>} Array of subjective criteria with id, name
 */
function getSubjectiveCriteria(projectDir = process.cwd(), modeOverride = null) {
  return getApplicableCriteria(projectDir, modeOverride).filter(c => c.type === 'subjective');
}

/**
 * Get criteria that are filtered out for the current mode
 * @param {string} projectDir - Project directory (defaults to cwd)
 * @param {string|null} modeOverride - Transient mode override
 * @returns {Array<Object>} Array of filtered criteria
 */
function getFilteredCriteria(projectDir = process.cwd(), modeOverride = null) {
  const criteria = loadCriteriaMapping();
  const currentMode = getReviewMode(projectDir, modeOverride);

  if (!criteria.criteria) {
    return [];
  }

  const filtered = [];
  for (const [id, criterion] of Object.entries(criteria.criteria)) {
    if (criterion.modes && !criterion.modes.includes(currentMode)) {
      filtered.push({ id, ...criterion });
    }
  }

  return filtered;
}

module.exports = {
  getReviewMode,
  shouldEvaluate,
  isObjective,
  getApplicableCriteria,
  getObjectiveCriteria,
  getSubjectiveCriteria,
  getFilteredCriteria,
  loadCriteriaMapping,
  loadFrameworkConfig
};
