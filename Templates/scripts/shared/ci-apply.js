#!/usr/bin/env node
// Rubrical Works (c) 2026

const fs = require('fs');
const path = require('path');
const { readFileSafe } = require('./lib/shell-safe.js');
const { formatTarget } = require('./ci-recommend-ui.js');

/**
 * @framework-script 0.123.0
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
    // #3789: the confirmation names the workflow each Add will change
    const target = formatTarget(rec);
    if (target) lines.push(`     ${target}`);
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
      const failed = {
        recommendation: rec,
        status: 'failed',
        error: err.message
      };
      // A failed write keeps the backup; name where it is (#3793)
      if (err.backupPath) failed.backupPath = err.backupPath;
      results.push(failed);
    }
  }

  return results;
}

/**
 * Whether a recommendation's file stays inside the workflows directory (#3794).
 * @param {string} workflowsDir
 * @param {string} file - rec.file, relative to workflowsDir
 * @returns {boolean}
 */
function isInsideWorkflows(workflowsDir, file) {
  if (typeof file !== 'string' || file === '' || path.isAbsolute(file)) return false;
  const rel = path.relative(path.resolve(workflowsDir), path.resolve(workflowsDir, file));
  // A parent segment, not a '..' prefix (#3892): '..ci.yml' is a valid name.
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
}

/**
 * Apply a single recommendation.
 * @param {string} projectDir
 * @param {string} workflowsDir
 * @param {object} rec
 * @returns {{ recommendation: object, status: string, detail?: string, error?: string }}
 */
function applySingleRecommendation(projectDir, workflowsDir, rec) {
  // #3794: recommendations can now come from a file (ci-apply.js --input), so
  // rec.file is untrusted. It must resolve inside workflowsDir for every type;
  // one that escapes (`..` segments, an absolute path) is refused before any write.
  if (rec.file !== undefined && !isInsideWorkflows(workflowsDir, rec.file)) {
    return {
      recommendation: rec,
      status: 'failed',
      error: `Refused: ${rec.file} resolves outside .github/workflows`
    };
  }
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

// owner/repo[/path]@ref (#3869): name segments are GitHub's owner/repo
// characters; the ref excludes whitespace and the characters git forbids in
// a ref name, so it can never span a line. Checked piecewise rather than by
// one regex with a repeated group, which is a backtracking risk.
const NAME_SEGMENT = /^[A-Za-z0-9_.-]+$/;
const REF = /^[^\s~^:?*[\\]+$/;

/**
 * Whether a value is a single-line `owner/repo[/path]@ref` action reference.
 * @param {*} value
 * @returns {boolean}
 */
function isActionRef(value) {
  if (typeof value !== 'string') return false;
  const at = value.indexOf('@');
  if (at < 0) return false;
  const segments = value.slice(0, at).split('/');
  return segments.length >= 2
    && segments.every(s => NAME_SEGMENT.test(s))
    && REF.test(value.slice(at + 1));
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
  // #3869: both values come from --input and are written into the workflow,
  // so each must be a single-line action reference — a newline would let the
  // upgrade inject arbitrary YAML (new steps) into the file.
  for (const field of ['actionRef', 'upgrade']) {
    if (!isActionRef(rec[field])) {
      return {
        recommendation: rec,
        status: 'failed',
        error: `Refused: ${field} must be a single-line owner/repo[/path]@ref string. Nothing was written.`
      };
    }
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
  // #3897: anchored on the end of the ref, so `actions/checkout@v3` never
  // matches inside `actions/checkout@v3.5.2` or `@v3-beta`.
  const refPattern = new RegExp(escapeRegExp(rec.actionRef) + '(?![\\w.-])', 'g');
  if (!refPattern.test(content)) {
    return {
      recommendation: rec,
      status: 'failed',
      error: `Action ${rec.actionRef} not found in ${rec.file}`
    };
  }

  // A function replacement is inserted literally: a string one would expand
  // $&, $' and $` in rec.upgrade (#3869, as qa-extract.js #3826).
  // replace() resets lastIndex, so the test() above does not shift its start.
  content = content.replace(refPattern, () => rec.upgrade);
  // Validated and backed up before the write, as applyNodeVersionAlter does:
  // a failed write throws with err.backupPath, which applyRecommendations reports.
  const { validateYaml, writeWithBackup } = require('./ci-modify.js');
  validateYaml(content);
  writeWithBackup(filePath, content);

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
  const { validateYaml, writeWithBackup, serializeEdited } = require('./ci-modify.js');
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
  writeWithBackup(filePath, output);
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

  // #3789: the target is the one the user confirmed. A recommendation that
  // names none is refused — ci-add's guess is never applied unseen.
  if (!rec.file) {
    return {
      recommendation: rec,
      status: 'failed',
      error: `Refused: ${rec.type} recommendation for ${rec.feature} names no target workflow — `
        + 're-run /ci --recommend so it names one, or use /ci --add to choose the file. Nothing was written.'
    };
  }

  // Delegate to ci-add. Note: ci-add exports addCIFeature(projectDir, featureId, opts)
  // and returns { success, message, file?, feature? } — not { detail }.
  try {
    const { addCIFeature } = require('./ci-add.js');
    // The recommendation was made for rec.file; target it rather than letting
    // ci-add guess a workflow (#3370).
    let options = { skipConfirm: true, file: rec.file };
    const workflowsDir = path.join(projectDir, '.github', 'workflows');
    if (rec.createNew && !fs.existsSync(path.join(workflowsDir, rec.file))) {
      // ci-add creates a new workflow only through its own suggestion; let it,
      // but only when that suggestion is still the file the user confirmed.
      const { suggestWorkflowForFeature } = require('./ci-detect-workflow.js');
      const now = suggestWorkflowForFeature(projectDir, rec.feature);
      if (!now.createNew || now.suggestedName !== rec.file) {
        return {
          recommendation: rec,
          status: 'failed',
          error: `Refused: the workflows changed since ${rec.file} was recommended for ${rec.feature} `
            + `(now: ${now.createNew ? `new ${now.suggestedName}` : path.basename(now.file)}) — re-run /ci --recommend. Nothing was written.`
        };
      }
      options = { skipConfirm: true };
    }
    const result = addCIFeature(projectDir, rec.feature, options);
    if (!result.success) {
      const failed = {
        recommendation: rec,
        status: 'failed',
        error: result.message || `Failed to add ${rec.feature}`
      };
      if (result.backupPath) failed.backupPath = result.backupPath;
      return failed;
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
      const failed = {
        recommendation: rec,
        status: 'failed',
        error: result.message || `Failed to remove ${rec.feature}`
      };
      if (result.backupPath) failed.backupPath = result.backupPath;
      return failed;
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

/**
 * Read the value following a `--flag` argument.
 * @param {string[]} args
 * @param {string} flag
 * @returns {string|undefined}
 */
function flagValue(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

/**
 * List the --select tokens that are not a usable selection: anything but
 * "all", "none", or a whole number in 1..total. An empty value is one
 * rejected token, "(empty)".
 * @param {string} select - Raw --select value
 * @param {number} total - Number of recommendations
 * @returns {string[]} Rejected tokens, in input order
 */
function rejectedSelectionTokens(select, total) {
  const trimmed = select.trim().toLowerCase();
  if (trimmed === 'all' || trimmed === 'none') return [];
  if (trimmed === '') return ['(empty)'];
  return trimmed.split(',').map(t => t.trim()).filter(t => {
    if (!/^\d+$/.test(t)) return true;
    const n = Number(t);
    return n < 1 || n > total;
  }).map(t => (t === '' ? '(empty)' : t));
}

// CLI entry point (#3794):
//   ci-apply.js --input <recs.json> --select <"1,3"|all|none> [--dir <project>] [--dry-run]
// --input is the JSON `ci-recommend.js --json` writes. Only the selected
// recommendations are passed on; a missing --select is refused, never "all".
if (require.main === module) {
  const { parseSelection } = require('./ci-recommend-ui.js');
  const args = process.argv.slice(2);
  const input = flagValue(args, '--input');
  const select = flagValue(args, '--select');
  const dir = flagValue(args, '--dir') || process.cwd();
  if (!input || select === undefined) {
    console.error('Usage: ci-apply.js --input <recs.json> --select <"1,3"|all|none> [--dir <project>] [--dry-run]\n'
      + 'Both --input and --select are required; nothing is applied without an explicit selection.');
    process.exit(2);
  }
  let recommendations;
  try {
    const raw = readFileSafe(input);
    if (raw === null) throw new Error(`cannot read ${input}`);
    recommendations = JSON.parse(raw);
    if (!Array.isArray(recommendations)) throw new Error('expected a JSON array of recommendations');
    // #3869: refused before anything is selected, formatted or applied — a
    // null or primitive element otherwise crashes with a bare TypeError.
    const bad = recommendations.findIndex(r => r === null || typeof r !== 'object' || Array.isArray(r));
    if (bad >= 0) throw new Error(`element ${bad + 1} is not a recommendation object (got ${JSON.stringify(recommendations[bad])})`);
  } catch (err) {
    console.error(`ci-apply: invalid --input: ${err.message}`);
    process.exit(2);
  }
  // #3899: parseSelection drops tokens it cannot use, so a typo or a stale
  // index would apply a subset, or nothing, silently. Refuse instead.
  const rejected = rejectedSelectionTokens(select, recommendations.length);
  if (rejected.length > 0) {
    console.error(`ci-apply: invalid --select: rejected ${rejected.join(', ')} — expected "all", "none", `
      + `or comma-separated numbers from 1 to ${recommendations.length}.`);
    process.exit(2);
  }
  const selected = parseSelection(select, recommendations.length).map(i => recommendations[i]);
  if (args.includes('--dry-run')) {
    console.log(selected.length === 0
      ? 'No recommendations selected — nothing to apply.'
      : formatConfirmationSummary(selected));
  } else {
    const results = applyRecommendations(dir, selected, { confirmed: true });
    console.log(formatApplyReport(results));
    if (results.some(r => r.status === 'failed')) process.exitCode = 1;
  }
}

module.exports = { formatConfirmationSummary, applyRecommendations, formatApplyReport };
