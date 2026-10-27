#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.113.0
 * @description Remove CI features from GitHub Actions workflow files. Locates feature configuration across workflow YAML files and cleanly removes associated sections (top-level keys, job steps, triggers). Part of the /ci remove subcommand.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const { loadFeatureRegistry } = require('./ci-list.js');
const { createBackup, validateYaml, serializeEdited } = require('./ci-modify.js');

/**
 * Top-level keys associated with features that can be cleanly removed.
 */
const FEATURE_TOP_LEVEL_KEYS = {
  'concurrency-groups': 'concurrency',
  'push-pr-dedup': 'concurrency'
};

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
 * Find which workflow file contains a given feature.
 * @param {string} projectDir - Path to project root
 * @param {string} featureId - Feature identifier
 * @returns {{ file: string, patterns: string[] }|null} File path where feature is found
 */
function findFeatureInWorkflows(projectDir, featureId) {
  const registry = loadFeatureRegistry();
  const feature = registry[featureId];
  if (!feature) return null;

  const workflowsDir = path.join(projectDir, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) return null;

  const files = fs.readdirSync(workflowsDir)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

  for (const file of files) {
    const filePath = path.join(workflowsDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const matchedPatterns = [];

      for (const pattern of feature.detectionPatterns.yaml) {
        let regex;
        try { regex = new RegExp(pattern, 'i'); } catch { continue; }
        if (regex.test(content)) {
          matchedPatterns.push(pattern);
        }
      }

      if (matchedPatterns.length > 0) {
        return { file: filePath, patterns: matchedPatterns };
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
  const found = findFeatureInWorkflows(projectDir, featureId);
  if (!found) {
    return {
      success: false,
      message: `Feature "${featureId}" is not currently enabled in any workflow file.`
    };
  }

  const feature = registry[featureId];
  const topLevelKey = FEATURE_TOP_LEVEL_KEYS[featureId];
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

    // Back up only once a change is certain, then write
    createBackup(found.file);
    fs.writeFileSync(found.file, output);

    return {
      success: true,
      message: `Removed "${registry[featureId].name}" from ${path.basename(found.file)}`,
      file: found.file,
      feature: featureId
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to remove feature: ${err.message}`
    };
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
