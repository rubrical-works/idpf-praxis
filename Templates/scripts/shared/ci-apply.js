#!/usr/bin/env node
// Rubrical Systems (c) 2026

const fs = require('fs');
const path = require('path');

/**
 * @framework-script 0.60.0
 * CI Apply Recommendations
 *
 * Orchestrates the application of selected CI recommendations.
 * Handles confirmation, sequential execution, error recovery, and reporting.
 */

/**
 * Format a confirmation summary listing all selected changes.
 * @param {Array<{ type: string, description: string, impact: string }>} recommendations
 * @returns {string} Formatted confirmation summary
 */
function formatConfirmationSummary(recommendations) {
  const count = recommendations.length;
  const lines = [];

  lines.push(`About to apply ${count} change${count === 1 ? '' : 's'}:\n`);

  for (let i = 0; i < recommendations.length; i++) {
    const rec = recommendations[i];
    lines.push(`  ${i + 1}. [${rec.type}] ${rec.description}`);
  }

  lines.push('');
  lines.push('Confirm to proceed, or cancel to abort all changes.');

  return lines.join('\n');
}

/**
 * Apply selected recommendations sequentially.
 * @param {string} projectDir - Path to project root
 * @param {Array} recommendations - Selected recommendations to apply
 * @param {{ confirmed?: boolean }} [options={}] - Options (confirmed: false to simulate cancel)
 * @returns {Array<{ recommendation: object, status: 'applied'|'failed', detail?: string, error?: string }>}
 */
function applyRecommendations(projectDir, recommendations, options = {}) {
  // Handle cancellation
  if (options.confirmed === false) {
    return [];
  }

  // Handle empty list
  if (recommendations.length === 0) {
    return [];
  }

  const results = [];
  const workflowsDir = path.join(projectDir, '.github', 'workflows');

  for (const rec of recommendations) {
    try {
      const result = applySingleRecommendation(projectDir, workflowsDir, rec);
      results.push(result);
    } catch (err) {
      results.push({
        recommendation: rec,
        status: 'failed',
        error: err.message
      });
    }
  }

  return results;
}

/**
 * Apply a single recommendation.
 * @param {string} projectDir
 * @param {string} workflowsDir
 * @param {object} rec
 * @returns {{ recommendation: object, status: string, detail?: string, error?: string }}
 */
function applySingleRecommendation(projectDir, workflowsDir, rec) {
  switch (rec.type) {
    case 'Alter':
      return applyAlter(workflowsDir, rec);
    case 'Add':
      return applyAdd(projectDir, rec);
    case 'Improve':
      return applyImprove(projectDir, rec);
    case 'Remove':
      return applyRemove(workflowsDir, rec);
    default:
      return {
        recommendation: rec,
        status: 'failed',
        error: `Unknown recommendation type: ${rec.type}`
      };
  }
}

/**
 * Apply an Alter recommendation (action version upgrade).
 */
function applyAlter(workflowsDir, rec) {
  if (!rec.file || !rec.actionRef || !rec.upgrade) {
    return {
      recommendation: rec,
      status: 'failed',
      error: 'Missing file, actionRef, or upgrade in recommendation'
    };
  }

  const filePath = path.join(workflowsDir, rec.file);
  if (!fs.existsSync(filePath)) {
    return {
      recommendation: rec,
      status: 'failed',
      error: `Workflow file not found: ${rec.file}`
    };
  }

  let content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes(rec.actionRef)) {
    return {
      recommendation: rec,
      status: 'failed',
      error: `Action ${rec.actionRef} not found in ${rec.file}`
    };
  }

  content = content.replace(new RegExp(escapeRegExp(rec.actionRef), 'g'), rec.upgrade);
  fs.writeFileSync(filePath, content, 'utf8');

  return {
    recommendation: rec,
    status: 'applied',
    detail: `Upgraded ${rec.actionRef} to ${rec.upgrade} in ${rec.file}`
  };
}

/**
 * Apply an Add recommendation (add CI feature).
 * Delegates to ci-add infrastructure when available.
 */
function applyAdd(projectDir, rec) {
  if (!rec.feature) {
    return {
      recommendation: rec,
      status: 'failed',
      error: 'No feature specified for Add recommendation'
    };
  }

  // Delegate to ci-add if available
  try {
    const { addFeatureToWorkflow } = require('./ci-add.js');
    const result = addFeatureToWorkflow(projectDir, rec.feature);
    return {
      recommendation: rec,
      status: 'applied',
      detail: result.detail || `Added ${rec.feature}`
    };
  } catch (err) {
    return {
      recommendation: rec,
      status: 'failed',
      error: `Failed to add ${rec.feature}: ${err.message}`
    };
  }
}

/**
 * Apply an Improve recommendation.
 * Similar to Add — many improvements map to CI features.
 */
function applyImprove(projectDir, rec) {
  if (rec.feature) {
    return applyAdd(projectDir, rec);
  }

  return {
    recommendation: rec,
    status: 'failed',
    error: 'Improve recommendation has no associated feature'
  };
}

/**
 * Apply a Remove recommendation.
 */
function applyRemove(workflowsDir, rec) {
  if (!rec.file) {
    return {
      recommendation: rec,
      status: 'failed',
      error: 'No file specified for Remove recommendation'
    };
  }

  // Delegate to ci-remove if available
  try {
    const { removeFeatureFromWorkflow } = require('./ci-remove.js');
    const result = removeFeatureFromWorkflow(path.dirname(workflowsDir), rec.feature);
    return {
      recommendation: rec,
      status: 'applied',
      detail: result.detail || `Removed ${rec.feature} from ${rec.file}`
    };
  } catch (err) {
    return {
      recommendation: rec,
      status: 'failed',
      error: `Failed to remove: ${err.message}`
    };
  }
}

/**
 * Format the final apply report.
 * @param {Array<{ recommendation: object, status: string, detail?: string, error?: string }>} results
 * @returns {string} Formatted report
 */
function formatApplyReport(results) {
  if (results.length === 0) {
    return 'No changes made (cancelled or empty selection).';
  }

  const applied = results.filter(r => r.status === 'applied');
  const failed = results.filter(r => r.status === 'failed');
  const lines = [];

  lines.push(`\nApply complete: ${applied.length} applied, ${failed.length} failed.\n`);

  if (applied.length > 0) {
    lines.push('Applied:');
    for (const r of applied) {
      lines.push(`  ✓ ${r.detail || r.recommendation.description}`);
    }
  }

  if (failed.length > 0) {
    lines.push('Failed:');
    for (const r of failed) {
      lines.push(`  ✗ ${r.recommendation.description}: ${r.error}`);
    }
  }

  return lines.join('\n');
}

/**
 * Escape a string for use in a regular expression.
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// CLI entry point
if (require.main === module) {
  console.log('ci-apply: Use via /ci recommend workflow.');
}

module.exports = { formatConfirmationSummary, applyRecommendations, formatApplyReport };
