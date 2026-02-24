#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const { loadFeatureRegistry } = require('./ci-list.js');
const { modifyWorkflow } = require('./ci-modify.js');
const { suggestWorkflowForFeature } = require('./ci-detect-workflow.js');

/**
 * @framework-script 0.50.0
 * Feature types determine how the template is applied to the workflow.
 * 'top-level' features add a root-level YAML key (e.g., concurrency:).
 * 'step' features add a step to an existing job.
 * 'trigger' features modify the on: block.
 */
const FEATURE_TYPE_MAP = {
  'cross-os-testing': 'strategy',
  'multi-node-versions': 'strategy',
  'paths-ignore': 'trigger',
  'concurrency-groups': 'top-level',
  'dependency-caching': 'step',
  'dependency-audit': 'step',
  'deploy-on-tag': 'trigger',
  'codeql-analysis': 'step',
  'coverage-upload': 'step',
  'conventional-commits': 'step',
  'stale-cleanup': 'step'
};

/**
 * Top-level key for features that use addTopLevel operation.
 */
const TOP_LEVEL_KEY_MAP = {
  'concurrency-groups': 'concurrency'
};

/**
 * Validate a feature name against the registry.
 * @param {string} featureName - Feature identifier
 * @returns {{ valid: boolean, feature?: object, available?: string[] }}
 */
function validateFeatureName(featureName) {
  const registry = loadFeatureRegistry();
  const feature = registry[featureName];

  if (feature) {
    return { valid: true, feature };
  }

  return {
    valid: false,
    available: Object.keys(registry)
  };
}

/**
 * Check if a feature is already enabled in the workflow files.
 * @param {string} projectDir - Path to project root
 * @param {string} featureId - Feature identifier
 * @returns {boolean} True if feature is already enabled
 */
function isFeatureAlreadyEnabled(projectDir, featureId) {
  const registry = loadFeatureRegistry();
  const feature = registry[featureId];
  if (!feature) return false;

  const workflowsDir = path.join(projectDir, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) return false;

  const files = fs.readdirSync(workflowsDir)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
      for (const pattern of feature.detectionPatterns.yaml) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(content)) return true;
      }
    } catch (e) {
      continue;
    }
  }

  return false;
}

/**
 * Add a CI feature to the appropriate workflow file.
 * @param {string} projectDir - Path to project root
 * @param {string} featureId - Feature identifier
 * @param {Object} [options] - Options
 * @param {boolean} [options.skipConfirm] - Skip user confirmation (for testing)
 * @returns {{ success: boolean, message: string, file?: string, feature?: string }}
 */
function addCIFeature(projectDir, featureId, options = {}) {
  // Validate feature name
  const validation = validateFeatureName(featureId);
  if (!validation.valid) {
    return {
      success: false,
      message: `Unknown feature: "${featureId}". Available features: ${validation.available.join(', ')}`
    };
  }

  // Check if already enabled
  if (isFeatureAlreadyEnabled(projectDir, featureId)) {
    return {
      success: false,
      message: `Feature "${featureId}" is already enabled. Use /ci remove first if you want to reconfigure it.`
    };
  }

  // Find target workflow file
  const target = suggestWorkflowForFeature(projectDir, featureId);

  if (target.createNew) {
    // Create a minimal workflow file
    const workflowsDir = path.join(projectDir, '.github', 'workflows');
    fs.mkdirSync(workflowsDir, { recursive: true });
    const newFile = path.join(workflowsDir, target.suggestedName);
    fs.writeFileSync(newFile, `name: CI\non: push\n\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n`);
    target.file = newFile;
  }

  const registry = loadFeatureRegistry();
  const feature = registry[featureId];
  const featureType = FEATURE_TYPE_MAP[featureId] || 'step';
  const templateYaml = feature.template.yaml;

  try {
    let operation;

    if (featureType === 'top-level') {
      const key = TOP_LEVEL_KEY_MAP[featureId] || featureId;
      operation = { addTopLevel: { key, yaml: templateYaml } };
    } else if (featureType === 'trigger') {
      // Trigger modifications are applied as top-level 'on' changes
      operation = { addTopLevel: { key: 'on', yaml: templateYaml } };
    } else if (featureType === 'strategy') {
      // Strategy features modify job-level properties (strategy.matrix, runs-on)
      const firstJob = getFirstJobName(target.file);
      if (!firstJob) {
        return {
          success: false,
          message: `No jobs found in ${path.basename(target.file)} to modify strategy.`
        };
      }
      // Parse the template as structured data and apply as job properties
      const strategyData = yaml.parse(templateYaml);
      if (strategyData && strategyData.strategy) {
        operation = { setJobProperty: { job: firstJob, path: ['strategy'], value: strategyData.strategy } };
      } else {
        // Fallback: set the whole template as strategy
        operation = { setJobProperty: { job: firstJob, path: ['strategy'], value: strategyData } };
      }
    } else {
      // Step-type features — add to first test job
      const firstJob = getFirstJobName(target.file);
      if (!firstJob) {
        return {
          success: false,
          message: `No jobs found in ${path.basename(target.file)} to add step to.`
        };
      }
      operation = { addStep: { job: firstJob, yaml: templateYaml, position: 'before-last' } };
    }

    const result = modifyWorkflow(target.file, operation);

    return {
      success: true,
      message: `Added "${feature.name}" to ${path.basename(target.file)}`,
      file: target.file,
      feature: featureId
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to add feature: ${err.message}`
    };
  }
}

/**
 * Get the name of the first job in a workflow file.
 * @param {string} filePath - Path to workflow file
 * @returns {string|null} First job name or null
 */
function getFirstJobName(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = yaml.parse(content);
    if (parsed && parsed.jobs) {
      const jobNames = Object.keys(parsed.jobs);
      return jobNames.length > 0 ? jobNames[0] : null;
    }
  } catch (e) {
    // Ignore
  }
  return null;
}

// CLI entry point
if (require.main === module) {
  const featureId = process.argv[2];
  const projectDir = process.argv[3] || process.cwd();

  if (!featureId) {
    console.log('Usage: ci-add.js <feature-id> [project-dir]');
    process.exit(1);
  }

  const result = addCIFeature(projectDir, featureId, { skipConfirm: true });
  console.log(result.message);
  process.exit(result.success ? 0 : 1);
}

module.exports = { addCIFeature, validateFeatureName, isFeatureAlreadyEnabled };
