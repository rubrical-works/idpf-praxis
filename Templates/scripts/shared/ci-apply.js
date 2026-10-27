#!/usr/bin/env node
// Rubrical Works (c) 2026

const fs = require('fs');
const path = require('path');
const { readFileSafe } = require('./lib/shell-safe.js');

/**
 * @framework-script 0.113.0
 * @description Orchestrate application of selected CI recommendations with sequential execution, confirmation prompts, error recovery, and summary reporting. Accepts recommendation objects from ci-recommend.js and applies them via ci-add.js. Part of the /ci apply subcommand.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
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
    if (rec.tradeoff) lines.push(`     Gives up: ${rec.tradeoff}`);
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
  // #3397: ci-recommend emits one node-version rec per occurrence, and the
  // first apply rewrites them all. A later rec for the same (file, version,
  // target) in this run is that same change, already made — not a failure.
  // Across runs a stale rec still fails, since nothing here vouches for it.
  const nodeKey = (rec) => (rec.type === 'Alter' && rec.kind === 'node-version'
    ? JSON.stringify([rec.file, String(rec.nodeVersion), String(rec.upgrade)]) : null);
  const appliedNode = new Set();

  for (const rec of recommendations) {
    const key = nodeKey(rec);
    if (key && appliedNode.has(key)) {
      results.push({
        recommendation: rec,
        status: 'applied',
        detail: `Node.js ${rec.nodeVersion} in ${rec.file} already applied by an earlier recommendation in this run`
      });
      continue;
    }
    try {
      const result = applySingleRecommendation(projectDir, workflowsDir, rec);
      if (key && result.status === 'applied') appliedNode.add(key);
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
  // ci-recommend emits this when every NODE_EOL line is past end-of-life
  // (#3388): the fix is a code change, not a workflow edit, so it carries no
  // file or upgrade and is refused here with that remedy (#3411).
  if (rec.kind === 'node-eol-table') {
    return {
      recommendation: rec,
      status: 'failed',
      error: 'Not a workflow edit: add a newer Node.js LTS line (with its end-of-life date) to the NODE_EOL table in '
        + '.claude/scripts/shared/ci-recommend.js, then re-run /ci --recommend to get an upgrade target for the EOL pins'
    };
  }
  if (rec.kind === 'node-version') {
    return applyNodeVersionAlter(workflowsDir, rec);
  }
  if (!rec.file || !rec.actionRef || !rec.upgrade) {
    return {
      recommendation: rec,
      status: 'failed',
      error: 'Missing file, actionRef, or upgrade in recommendation'
    };
  }

  const filePath = path.join(workflowsDir, rec.file);
  let content = readFileSafe(filePath);
  if (content === null) {
    return {
      recommendation: rec,
      status: 'failed',
      error: `Workflow file not found: ${rec.file}`
    };
  }
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
 * Apply an EOL Node.js Alter (#3369): replace the version in every
 * actions/setup-node `with.node-version` and every `strategy.matrix.node-version`
 * list. Edited on the document so comments survive; validated and backed up
 * before the write, as ci-modify does. A matrix that already lists the target
 * drops the EOL entry rather than listing the target twice.
 */
function applyNodeVersionAlter(workflowsDir, rec) {
  if (!rec.file || !rec.nodeVersion || !rec.upgrade) {
    return { recommendation: rec, status: 'failed', error: 'Missing file, nodeVersion, or upgrade in recommendation' };
  }
  const filePath = path.join(workflowsDir, rec.file);
  const content = readFileSafe(filePath);
  if (content === null) {
    return { recommendation: rec, status: 'failed', error: `Workflow file not found: ${rec.file}` };
  }

  const yaml = require('yaml');
  const { validateYaml, createBackup, serializeEdited } = require('./ci-modify.js');
  const doc = yaml.parseDocument(content);
  const from = String(rec.nodeVersion);
  const to = String(rec.upgrade);
  let changed = 0;

  const jobs = doc.get('jobs');
  for (const jobPair of yaml.isMap(jobs) ? jobs.items : []) {
    const job = jobPair.value;
    if (!yaml.isMap(job)) continue;

    const matrix = job.getIn(['strategy', 'matrix', 'node-version'], true);
    if (yaml.isSeq(matrix)) {
      const hasTarget = matrix.items.some(n => String(yaml.isScalar(n) ? n.value : n) === to);
      for (let i = matrix.items.length - 1; i >= 0; i--) {
        const node = matrix.items[i];
        if (String(yaml.isScalar(node) ? node.value : node) !== from) continue;
        if (hasTarget) matrix.items.splice(i, 1);
        else matrix.items[i] = doc.createNode(Number(to));
        changed++;
      }
    }

    const steps = job.get('steps');
    for (const step of yaml.isSeq(steps) ? steps.items : []) {
      if (!yaml.isMap(step) || !/actions\/setup-node/.test(String(step.get('uses') || ''))) continue;
      if (String(step.getIn(['with', 'node-version'])) === from) {
        step.setIn(['with', 'node-version'], to);
        changed++;
      }
    }
  }

  if (changed === 0) {
    return { recommendation: rec, status: 'failed', error: `Node.js ${from} not found in ${rec.file}` };
  }
  const output = serializeEdited(content, doc);
  validateYaml(output);
  createBackup(filePath);
  fs.writeFileSync(filePath, output, 'utf8');
  return {
    recommendation: rec,
    status: 'applied',
    detail: `Replaced Node.js ${from} with ${to} in ${rec.file} (${changed} occurrence(s))`
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

  // Delegate to ci-add. Note: ci-add exports addCIFeature(projectDir, featureId, opts)
  // and returns { success, message, file?, feature? } — not { detail }.
  try {
    const { addCIFeature } = require('./ci-add.js');
    // The recommendation was made for rec.file; target it rather than letting
    // ci-add guess a workflow (#3370).
    const result = addCIFeature(projectDir, rec.feature, { skipConfirm: true, file: rec.file });
    if (!result.success) {
      return {
        recommendation: rec,
        status: 'failed',
        error: result.message || `Failed to add ${rec.feature}`
      };
    }
    return {
      recommendation: rec,
      status: 'applied',
      detail: result.message || `Added ${rec.feature}`
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
  if (!rec.feature) {
    return {
      recommendation: rec,
      status: 'failed',
      error: 'No feature specified for Remove recommendation'
    };
  }

  // Delegate to ci-remove. ci-remove exports removeCIFeature(projectDir, featureId, opts)
  // and returns { success, message, file?, feature? }. workflowsDir is
  // <projectDir>/.github/workflows, so projectDir is two levels up.
  try {
    const { removeCIFeature } = require('./ci-remove.js');
    const projectDir = path.dirname(path.dirname(workflowsDir));
    const result = removeCIFeature(projectDir, rec.feature, { skipConfirm: true });
    if (!result.success) {
      return {
        recommendation: rec,
        status: 'failed',
        error: result.message || `Failed to remove ${rec.feature}`
      };
    }
    return {
      recommendation: rec,
      status: 'applied',
      detail: result.message || `Removed ${rec.feature}`
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
  console.log('ci-apply: Use via /ci --recommend workflow.');
}

module.exports = { formatConfirmationSummary, applyRecommendations, formatApplyReport };
