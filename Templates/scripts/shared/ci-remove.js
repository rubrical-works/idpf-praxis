#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const { loadFeatureRegistry } = require('./ci-list.js');
const { createBackup, validateYaml } = require('./ci-modify.js');

/**
 * @framework-script 0.49.0
 * Top-level keys associated with features that can be cleanly removed.
 */
const FEATURE_TOP_LEVEL_KEYS = {
  'concurrency-groups': 'concurrency'
};

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
        const regex = new RegExp(pattern, 'i');
        if (regex.test(content)) {
          matchedPatterns.push(pattern);
        }
      }

      if (matchedPatterns.length > 0) {
        return { file: filePath, patterns: matchedPatterns };
      }
    } catch (e) {
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
function removeCIFeature(projectDir, featureId, options = {}) {
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

  try {
    // Create backup before modification
    createBackup(found.file);

    // Read and parse with comment preservation
    const original = fs.readFileSync(found.file, 'utf8');
    const doc = yaml.parseDocument(original);

    // Determine removal strategy based on feature type
    const topLevelKey = FEATURE_TOP_LEVEL_KEYS[featureId];

    if (topLevelKey) {
      // Remove the top-level key
      doc.delete(topLevelKey);
    } else {
      // For step-based features, remove matching steps from jobs
      removeFeatureSteps(doc, registry[featureId]);
    }

    // Serialize and validate
    const output = doc.toString();
    validateYaml(output);

    // Write
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
 * Remove steps matching a feature's detection patterns from all jobs.
 * @param {yaml.Document} doc - The parsed YAML document
 * @param {Object} feature - Feature definition with detectionPatterns
 */
function removeFeatureSteps(doc, feature) {
  const parsed = doc.toJSON();
  if (!parsed || !parsed.jobs) return;

  for (const jobName of Object.keys(parsed.jobs)) {
    const steps = parsed.jobs[jobName].steps;
    if (!Array.isArray(steps)) continue;

    const filteredSteps = steps.filter(step => {
      const stepStr = JSON.stringify(step);
      for (const pattern of feature.detectionPatterns.yaml) {
        try {
          const regex = new RegExp(pattern, 'i');
          if (regex.test(stepStr)) return false; // Remove this step
        } catch (e) {
          // If pattern is not a valid regex for step matching, skip
        }
      }
      return true; // Keep this step
    });

    if (filteredSteps.length !== steps.length) {
      doc.setIn(['jobs', jobName, 'steps'], filteredSteps);
    }
  }
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
