#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.123.0
 * @description Remove CI features from GitHub Actions workflow files. Locates feature configuration across workflow YAML files and cleanly removes associated sections (top-level keys, job steps, triggers). Part of the /ci remove subcommand.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const { isDeepStrictEqual } = require('util');
const { loadFeatureRegistry, detectStructurally } = require('./ci-list.js');
const { writeWithBackup, validateYaml, serializeEdited } = require('./ci-modify.js');

/**
 * Top-level keys associated with features that can be cleanly removed.
 */
const FEATURE_TOP_LEVEL_KEYS = {
  'concurrency-groups': 'concurrency',
  'push-pr-dedup': 'concurrency'
};

/**
 * Features ci-add.js adds as a job of their own (its FEATURE_TYPE_MAP 'job'
 * entries, #3791). Removing one removes the job it added (#3850): filtering
 * its steps left a job of checkout, the language matrix and permissions.
 */
const JOB_FEATURES = new Set(['codeql-analysis']);

/** The action a `uses:` names, without its ref: `actions/checkout@v4` → `actions/checkout`. */
function actionName(uses) {
  return String(uses).split('@')[0].toLowerCase();
}

/**
 * Whether a job is the one a job feature added (#3850): it holds at least one
 * step the feature's removalPatterns match, and every other step is one of the
 * template job's own steps (by action, any ref). A job the user wrote with any
 * further step is theirs, and is left alone.
 * @param {*} job - The job as plain data
 * @param {Object} feature - Feature definition with removalPatterns and template
 * @returns {boolean}
 */
function isFeatureJob(job, feature) {
  if (!job || !Array.isArray(job.steps)) return false;
  const template = yaml.parse(feature.template.yaml) || {};
  const templateJob = Object.values(template.jobs || {})[0] || {};
  const ownActions = new Set((templateJob.steps || [])
    .filter((step) => step && typeof step.uses === 'string' && !stepMatches(step, feature.removalPatterns))
    .map((step) => actionName(step.uses)));
  let featureSteps = 0;
  for (const step of job.steps) {
    if (stepMatches(step, feature.removalPatterns)) { featureSteps++; continue; }
    if (!step || typeof step.uses !== 'string' || !ownActions.has(actionName(step.uses))) return false;
  }
  return featureSteps > 0;
}

/**
 * Names of the jobs in a workflow that a job feature added.
 * @param {*} parsed - The workflow as plain data
 * @param {Object} feature
 * @returns {string[]}
 */
function featureJobNames(parsed, feature) {
  const jobs = parsed && parsed.jobs && typeof parsed.jobs === 'object' ? parsed.jobs : {};
  return Object.keys(jobs).filter((name) => isFeatureJob(jobs[name], feature));
}

/**
 * Among the detected files, the first holding a job the feature added (#3850).
 * @param {Array<{ file: string, patterns: string[] }>} candidates
 * @param {Object} feature
 * @returns {{ file: string, patterns: string[] }|null}
 */
function findOwnedJob(candidates, feature) {
  for (const candidate of candidates) {
    try {
      if (featureJobNames(yaml.parse(fs.readFileSync(candidate.file, 'utf8')), feature).length) return candidate;
    } catch (_e) {
      continue;
    }
  }
  return null;
}

/**
 * Whether a top-level block is this feature's own (#3396). Both concurrency
 * features share the key, and push-pr-dedup is detected by pull_request.head.sha
 * anywhere in the file, so deleting the key on detection alone could remove the
 * other feature's block. push-pr-dedup owns a group keyed on the PR head SHA;
 * concurrency-groups owns any other concurrency block.
 * @param {string} featureId
 * @param {*} value - The key's value as plain data
 * @returns {boolean}
 */
function ownsTopLevelBlock(featureId, value) {
  if (FEATURE_TOP_LEVEL_KEYS[featureId] !== 'concurrency') return true;
  const group = value && typeof value === 'object' ? value.group : value;
  const dedup = /pull_request\.head\.sha/.test(String(group == null ? '' : group));
  return featureId === 'push-pr-dedup' ? dedup : !dedup;
}

/**
 * Find every workflow file in which a feature is detected, in directory order.
 * @param {string} projectDir - Path to project root
 * @param {string} featureId - Feature identifier
 * @returns {Array<{ file: string, patterns: string[] }>}
 */
function findAllFeatureWorkflows(projectDir, featureId) {
  const registry = loadFeatureRegistry();
  const feature = registry[featureId];
  if (!feature) return [];

  const workflowsDir = path.join(projectDir, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) return [];

  const found = [];

  const files = fs.readdirSync(workflowsDir)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

  for (const file of files) {
    const filePath = path.join(workflowsDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      // A workflow shape is judged on the parsed file, never a regex (#3852);
      // such a feature names no matched pattern.
      const structural = detectStructurally(featureId, content);
      if (structural !== null) {
        if (structural) found.push({ file: filePath, patterns: [] });
        continue;
      }
      const matchedPatterns = [];

      for (const pattern of feature.detectionPatterns.yaml) {
        let regex;
        try { regex = new RegExp(pattern, 'i'); } catch { continue; }
        if (regex.test(content)) {
          matchedPatterns.push(pattern);
        }
      }

      if (matchedPatterns.length > 0) {
        found.push({ file: filePath, patterns: matchedPatterns });
      }
    } catch (_e) {
      continue;
    }
  }

  return found;
}

/**
 * Find which workflow file contains a given feature.
 * @param {string} projectDir - Path to project root
 * @param {string} featureId - Feature identifier
 * @returns {{ file: string, patterns: string[] }|null} The first file where the feature is detected
 */
function findFeatureInWorkflows(projectDir, featureId) {
  return findAllFeatureWorkflows(projectDir, featureId)[0] || null;
}

/**
 * Among the detected files, the first whose top-level block is this feature's
 * own (#3410). Detection alone stopped at the first match, so a block owned by
 * the other concurrency feature hid this feature's block in a later file.
 * @param {Array<{ file: string, patterns: string[] }>} candidates
 * @param {string} featureId
 * @param {string} topLevelKey
 * @returns {{ file: string, patterns: string[] }|null}
 */
function findOwnedTopLevelBlock(candidates, featureId, topLevelKey) {
  for (const candidate of candidates) {
    try {
      const doc = yaml.parseDocument(fs.readFileSync(candidate.file, 'utf8'));
      if (doc.has(topLevelKey) && ownsTopLevelBlock(featureId, doc.toJS()[topLevelKey])) {
        return candidate;
      }
    } catch (_e) {
      continue;
    }
  }
  return null;
}

/**
 * Among the detected files, the first holding a job step the feature's
 * removalPatterns match (#3733). Detection is a whole-file regex, so a step
 * feature is detected where none of its steps is, and stopping at the first
 * detected file hid the removable step in a later one.
 * @param {Array<{ file: string, patterns: string[] }>} candidates
 * @param {Object} feature - Feature definition with removalPatterns
 * @returns {{ file: string, patterns: string[] }|null}
 */
function findOwnedStep(candidates, feature) {
  for (const candidate of candidates) {
    try {
      const parsed = yaml.parse(fs.readFileSync(candidate.file, 'utf8'));
      const jobs = parsed && parsed.jobs ? Object.values(parsed.jobs) : [];
      if (jobs.some((job) => job && Array.isArray(job.steps)
        && job.steps.some((step) => stepMatches(step, feature.removalPatterns)))) {
        return candidate;
      }
    } catch (_e) {
      continue;
    }
  }
  return null;
}

/**
 * Remove a CI feature from its workflow file.
 * @param {string} projectDir - Path to project root
 * @param {string} featureId - Feature identifier
 * @param {Object} [options] - Options
 * @param {boolean} [options.skipConfirm] - Skip user confirmation (for testing)
 * @returns {{ success: boolean, message: string, file?: string, feature?: string }}
 */
function removeCIFeature(projectDir, featureId, _options = {}) {
  // Validate feature name
  const registry = loadFeatureRegistry();
  if (!registry[featureId]) {
    return {
      success: false,
      message: `Unknown feature: "${featureId}". Available: ${Object.keys(registry).join(', ')}`
    };
  }

  // Find where the feature lives
  const feature = registry[featureId];
  const candidates = findAllFeatureWorkflows(projectDir, featureId);
  const topLevelKey = FEATURE_TOP_LEVEL_KEYS[featureId];
  const isJobFeature = JOB_FEATURES.has(featureId);
  // Refuse on the first detected file only when no detected file holds a block
  // (#3410), a step (#3733) or a job (#3850) this feature owns.
  let owned = null;
  if (topLevelKey) owned = findOwnedTopLevelBlock(candidates, featureId, topLevelKey);
  else if (isJobFeature) owned = findOwnedJob(candidates, feature);
  else if (feature.removalPatterns) owned = findOwnedStep(candidates, feature);
  const found = owned || candidates[0];
  if (!found) {
    return {
      success: false,
      message: `Feature "${featureId}" is not currently enabled in any workflow file.`
    };
  }

  // Detection runs regexes over the whole file, so a feature can be detected
  // where removal has no way to reach (#3045): report that, never "Removed".
  if (!topLevelKey && !feature.removalPatterns) {
    return {
      success: false,
      message: `Feature "${featureId}" is detected in ${path.basename(found.file)} but cannot be removed automatically — it is not a top-level key or a job step. Remove it by hand.`,
      file: found.file,
      feature: featureId
    };
  }

  try {
    // Read and parse with comment preservation
    const original = fs.readFileSync(found.file, 'utf8');
    const doc = yaml.parseDocument(original);

    if (isJobFeature) return removeFeatureJobs(found.file, original, doc, feature, featureId);

    let removed;
    if (topLevelKey) {
      if (doc.has(topLevelKey) && !ownsTopLevelBlock(featureId, doc.toJS()[topLevelKey])) {
        return {
          success: false,
          message: `Feature "${featureId}" is detected in ${path.basename(found.file)} but cannot be removed automatically — its top-level "${topLevelKey}" block belongs to another feature. Nothing was removed and the file is unchanged.`,
          file: found.file,
          feature: featureId
        };
      }
      removed = doc.has(topLevelKey);
      doc.delete(topLevelKey);
    } else {
      removed = removeFeatureSteps(doc, feature) > 0;
    }

    if (!removed) {
      return {
        success: false,
        message: `Feature "${featureId}" is detected in ${path.basename(found.file)} but no ${topLevelKey ? `top-level "${topLevelKey}" key` : 'job step matches its removalPatterns'}; nothing was removed and the file is unchanged.`,
        file: found.file,
        feature: featureId
      };
    }

    // Serialize, changing only the removed lines (#3425), and validate
    const output = serializeEdited(original, doc);
    validateYaml(output);

    // Back up only once a change is certain, then write; the backup is
    // deleted once the write validates (#3793)
    writeWithBackup(found.file, output);

    return {
      success: true,
      message: `Removed "${registry[featureId].name}" from ${path.basename(found.file)}`,
      file: found.file,
      feature: featureId
    };
  } catch (err) {
    const result = {
      success: false,
      message: `Failed to remove feature: ${err.message}`
    };
    // A failed write keeps the backup; name where it is (#3793)
    if (err.backupPath) result.backupPath = err.backupPath;
    return result;
  }
}

/**
 * Does a step belong to the feature? Each removalPatterns entry is tested
 * against its own step field only — `uses` against `step.uses`, `run` against
 * `step.run` (#3045). Matching detection patterns against the serialized step
 * deleted `run: npm run test:coverage` along with the coverage upload.
 * @param {Object} step - A parsed job step
 * @param {{uses?: string[], run?: string[]}} removalPatterns
 * @returns {boolean}
 */
function stepMatches(step, removalPatterns) {
  return ['uses', 'run'].some((field) => {
    const value = step && typeof step[field] === 'string' ? step[field] : null;
    if (value === null) return false;
    return (removalPatterns[field] || []).some((pattern) => {
      try { return new RegExp(pattern, 'i').test(value); } catch (_e) { return false; }
    });
  });
}

/**
 * Remove a feature's own steps from every job.
 * @param {yaml.Document} doc - The parsed YAML document
 * @param {Object} feature - Feature definition with removalPatterns
 * @returns {number} How many steps were removed
 */
function removeFeatureSteps(doc, feature) {
  const parsed = doc.toJSON();
  if (!parsed || !parsed.jobs) return 0;

  let removed = 0;
  for (const jobName of Object.keys(parsed.jobs)) {
    const steps = parsed.jobs[jobName] && parsed.jobs[jobName].steps;
    if (!Array.isArray(steps)) continue;

    const filteredSteps = steps.filter((step) => !stepMatches(step, feature.removalPatterns));
    if (filteredSteps.length !== steps.length) {
      removed += steps.length - filteredSteps.length;
      doc.setIn(['jobs', jobName, 'steps'], filteredSteps);
    }
  }
  return removed;
}

/**
 * Whether the text carries any YAML comment — a whole-line one or an inline
 * one after a value (#3895). Read from the parsed Document, not a line regex,
 * so `on: push # keep` counts and a `#` inside a quoted string does not.
 * @param {string} text - The file's text as read
 * @returns {boolean}
 */
function hasComment(text) {
  const doc = yaml.parseDocument(text);
  if (doc.commentBefore || doc.comment) return true;
  let found = false;
  yaml.visit(doc, (_key, node) => {
    if (node && (node.commentBefore || node.comment)) {
      found = true;
      return yaml.visit.BREAK;
    }
    return undefined;
  });
  return found;
}

/**
 * Whether a workflow, its feature jobs removed, is exactly the feature's
 * template.workflow (#3870): the same top-level keys and values and no
 * comment. Anything else is content the user wrote.
 * @param {string} original - The file's text as read
 * @param {yaml.Document} doc - The document with the feature's jobs deleted
 * @param {Object} feature - Registry entry
 * @returns {boolean}
 */
function matchesTemplateWorkflow(original, doc, feature) {
  const workflow = feature.template && feature.template.workflow;
  if (typeof workflow !== 'string') return false;
  if (hasComment(original)) return false;
  const { jobs: _jobs, ...rest } = doc.toJS() || {};
  const expected = yaml.parse(workflow) || {};
  return isDeepStrictEqual(rest, expected);
}

/**
 * The jobs, other than those being removed, whose `needs:` (a string or a
 * list) names one of the removed jobs (#3934).
 * @param {Object} workflow - The parsed workflow
 * @param {string[]} removed - Job names about to be deleted
 * @returns {string[]}
 */
function jobsNeeding(workflow, removed) {
  const jobs = (workflow && workflow.jobs) || {};
  return Object.keys(jobs).filter((name) => {
    if (removed.includes(name)) return false;
    const job = jobs[name];
    const needs = job && job.needs;
    const list = Array.isArray(needs) ? needs : (needs == null ? [] : [needs]);
    return list.some((n) => removed.includes(n));
  });
}

/**
 * Remove the jobs a job feature added (#3850), and the workflow file when that
 * leaves it with no job and it is the feature's template.workflow (#3870) — a
 * jobless workflow with content of its own is refused and left unchanged, with
 * no backup written either way. A job of the same name the user wrote is not the
 * feature's (isFeatureJob) and stays, so nothing is removed and the file is
 * unchanged.
 * @param {string} file - Workflow path
 * @param {string} original - The file's text as read
 * @param {yaml.Document} doc - The parsed document
 * @param {Object} feature - Registry entry
 * @param {string} featureId
 * @returns {{ success: boolean, message: string, file?: string, feature?: string, deletedFile?: boolean }}
 */
function removeFeatureJobs(file, original, doc, feature, featureId) {
  const base = path.basename(file);
  const names = featureJobNames(doc.toJS(), feature);
  if (!names.length) {
    return {
      success: false,
      message: `Feature "${featureId}" is detected in ${base} but no job there is the one it adds — a job with any step of its own is left alone. Nothing was removed and the file is unchanged.`,
      file,
      feature: featureId
    };
  }
  // #3934: a remaining job naming a removed job in `needs:` would reference a
  // job that no longer exists, and GitHub rejects the workflow. Refuse rather
  // than rewrite the user's `needs`.
  const dependents = jobsNeeding(doc.toJS(), names);
  if (dependents.length) {
    return {
      success: false,
      message: `Removing "${feature.name}" would delete job ${names.map((n) => `"${n}"`).join(', ')} from ${base}, but ${dependents.map((d) => `"${d}"`).join(', ')} ${dependents.length === 1 ? 'names it' : 'name it'} in needs:. Nothing was removed and the file is unchanged — remove those needs: entries first.`,
      file,
      feature: featureId
    };
  }

  for (const name of names) doc.deleteIn(['jobs', name]);

  const jobs = doc.get('jobs', true);
  if (!yaml.isMap(jobs) || jobs.items.length === 0) {
    // #3870: only a workflow /ci --add made from template.workflow is deleted;
    // one with content of its own is the user's, and is left as it was.
    if (!matchesTemplateWorkflow(original, doc, feature)) {
      return {
        success: false,
        message: `Removing "${feature.name}" would leave ${base} with no job, but the workflow has content of its own beyond what /ci --add creates. Nothing was removed and the file is unchanged — remove ${file} yourself if you no longer want it.`,
        file,
        feature: featureId
      };
    }
    fs.rmSync(file);
    return {
      success: true,
      message: `Removed "${feature.name}" and deleted ${base}, whose only job it was`,
      file,
      feature: featureId,
      deletedFile: true
    };
  }

  const output = serializeEdited(original, doc);
  validateYaml(output);
  writeWithBackup(file, output);
  return {
    success: true,
    message: `Removed "${feature.name}" from ${base} (job ${names.map((n) => `"${n}"`).join(', ')})`,
    file,
    feature: featureId
  };
}

// CLI entry point
if (require.main === module) {
  const featureId = process.argv[2];
  const projectDir = process.argv[3] || process.cwd();

  if (!featureId) {
    console.log('Usage: ci-remove.js <feature-id> [project-dir]');
    process.exit(1);
  }

  const result = removeCIFeature(projectDir, featureId, { skipConfirm: true });
  console.log(result.message);
  process.exit(result.success ? 0 : 1);
}

module.exports = { removeCIFeature, findFeatureInWorkflows };
