#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.71.1
 * @description Map CI features to appropriate workflow file categories and suggest workflow file names based on feature type classification (test, deploy, lint, security, etc.). Used by ci-add.js when creating new workflow files.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

/**
 * Feature-to-workflow-category mapping.
 * Determines which type of workflow file each feature belongs in.
 */
const FEATURE_CATEGORY_MAP = {
  'cross-os-testing': 'testing',
  'multi-node-versions': 'testing',
  'paths-ignore': 'general',
  'concurrency-groups': 'general',
  'dependency-caching': 'testing',
  'dependency-audit': 'security',
  'deploy-on-tag': 'deployment',
  'codeql-analysis': 'security',
  'coverage-upload': 'testing',
  'conventional-commits': 'quality',
  'stale-cleanup': 'maintenance'
};

/**
 * Suggested file names when creating new workflows.
 */
const CATEGORY_FILE_NAMES = {
  testing: 'ci.yml',
  security: 'security.yml',
  deployment: 'deploy.yml',
  quality: 'ci.yml',
  maintenance: 'stale.yml',
  general: 'ci.yml'
};

/**
 * Classify a workflow file by analyzing its name and content.
 * @param {string} fileName - The workflow file name
 * @param {string} content - The raw YAML content
 * @returns {{ categories: string[], name: string, triggers: string[] }}
 */
function classifyWorkflow(fileName, content) {
  const categories = new Set();
  const baseName = fileName.toLowerCase().replace(/\.(yml|yaml)$/, '');

  // Name-based classification
  if (/test|ci|check/.test(baseName)) categories.add('testing');
  if (/deploy|release|publish/.test(baseName)) categories.add('deployment');
  if (/security|codeql|scan/.test(baseName)) categories.add('security');
  if (/lint|quality/.test(baseName)) categories.add('quality');
  if (/stale|cleanup|maintenance/.test(baseName)) categories.add('maintenance');

  // Content-based classification
  const lowerContent = content.toLowerCase();
  if (/npm test|pytest|cargo test|go test|jest|mocha|vitest/.test(lowerContent)) categories.add('testing');
  if (/deploy|publish|release/.test(lowerContent) && /tags/.test(lowerContent)) categories.add('deployment');
  if (/codeql|security|audit/.test(lowerContent)) categories.add('security');
  if (/actions\/stale/.test(lowerContent)) categories.add('maintenance');

  // If nothing matched, mark as general
  if (categories.size === 0) categories.add('general');

  // Extract workflow name and triggers
  let name = baseName;
  let triggers = [];
  try {
    const parsed = yaml.parse(content);
    if (parsed && parsed.name) name = parsed.name;
    if (parsed && parsed.on) {
      if (typeof parsed.on === 'string') triggers = [parsed.on];
      else if (Array.isArray(parsed.on)) triggers = parsed.on;
      else triggers = Object.keys(parsed.on);
    }
  } catch (_e) {
    // Ignore parse errors for classification
  }

  return {
    categories: Array.from(categories),
    name,
    triggers
  };
}

/**
 * Suggest the best workflow file for a given feature.
 * @param {string} projectDir - Path to project root
 * @param {string} featureId - The CI feature identifier
 * @returns {{ file: string|null, createNew: boolean, suggestedName: string|null, classification: object|null }}
 */
function suggestWorkflowForFeature(projectDir, featureId) {
  const workflowsDir = path.join(projectDir, '.github', 'workflows');
  const targetCategory = FEATURE_CATEGORY_MAP[featureId] || 'general';

  // Check if workflows directory exists
  if (!fs.existsSync(workflowsDir)) {
    return {
      file: null,
      createNew: true,
      suggestedName: CATEGORY_FILE_NAMES[targetCategory] || 'ci.yml',
      classification: null
    };
  }

  // Read and classify all workflow files
  const files = fs.readdirSync(workflowsDir)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

  if (files.length === 0) {
    return {
      file: null,
      createNew: true,
      suggestedName: CATEGORY_FILE_NAMES[targetCategory] || 'ci.yml',
      classification: null
    };
  }

  // Single file — auto-select
  if (files.length === 1) {
    const filePath = path.join(workflowsDir, files[0]);
    const content = fs.readFileSync(filePath, 'utf8');
    const classification = classifyWorkflow(files[0], content);
    return {
      file: filePath,
      createNew: false,
      suggestedName: null,
      classification
    };
  }

  // Multiple files — find best match by category
  const classifications = [];
  for (const file of files) {
    const filePath = path.join(workflowsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const classification = classifyWorkflow(file, content);
    classifications.push({ file: filePath, fileName: file, ...classification });
  }

  // Find exact category match
  const exactMatch = classifications.find(c => c.categories.includes(targetCategory));
  if (exactMatch) {
    return {
      file: exactMatch.file,
      createNew: false,
      suggestedName: null,
      classification: { categories: exactMatch.categories, name: exactMatch.name, triggers: exactMatch.triggers }
    };
  }

  // Fallback: find general workflow
  const generalMatch = classifications.find(c => c.categories.includes('general'));
  if (generalMatch) {
    return {
      file: generalMatch.file,
      createNew: false,
      suggestedName: null,
      classification: { categories: generalMatch.categories, name: generalMatch.name, triggers: generalMatch.triggers }
    };
  }

  // Fallback: first CI/test workflow
  const ciMatch = classifications.find(c => c.categories.includes('testing'));
  if (ciMatch) {
    return {
      file: ciMatch.file,
      createNew: false,
      suggestedName: null,
      classification: { categories: ciMatch.categories, name: ciMatch.name, triggers: ciMatch.triggers }
    };
  }

  // Last resort: suggest creating new
  return {
    file: null,
    createNew: true,
    suggestedName: CATEGORY_FILE_NAMES[targetCategory] || 'ci.yml',
    classification: null
  };
}

/**
 * Get all workflow files with their classifications.
 * @param {string} projectDir - Path to project root
 * @returns {Array<{ file: string, fileName: string, categories: string[], name: string }>}
 */
function detectTargetWorkflow(projectDir) {
  const workflowsDir = path.join(projectDir, '.github', 'workflows');

  if (!fs.existsSync(workflowsDir)) return [];

  const files = fs.readdirSync(workflowsDir)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

  return files.map(file => {
    const filePath = path.join(workflowsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const classification = classifyWorkflow(file, content);
    return { file: filePath, fileName: file, ...classification };
  });
}

// CLI entry point
if (require.main === module) {
  const dir = process.argv[2] || process.cwd();
  const workflows = detectTargetWorkflow(dir);
  if (workflows.length === 0) {
    console.log('No workflow files found.');
  } else {
    for (const wf of workflows) {
      console.log(`${wf.fileName}: ${wf.categories.join(', ')} (${wf.name})`);
    }
  }
}

module.exports = { detectTargetWorkflow, classifyWorkflow, suggestWorkflowForFeature };
