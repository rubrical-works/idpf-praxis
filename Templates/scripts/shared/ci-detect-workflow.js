#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.123.0
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
  'trigger-scope': 'security',
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
  let tagOnlyPush = false;
  try {
    const parsed = yaml.parse(content);
    if (parsed && parsed.name) name = parsed.name;
    if (parsed && parsed.on) {
      if (typeof parsed.on === 'string') triggers = [parsed.on];
      else if (Array.isArray(parsed.on)) triggers = parsed.on;
      else {
        triggers = Object.keys(parsed.on);
        const push = parsed.on.push;
        tagOnlyPush = !!(push && (push.tags || push['tags-ignore'])
          && !push.branches && !push['branches-ignore']);
      }
    }
  } catch (_e) {
    // Ignore parse errors for classification
  }

  return {
    categories: Array.from(categories),
    name,
    triggers,
    tagOnlyPush
  };
}

/**
 * Triggers that never run a workflow on a code change (#3789). A workflow
 * listening to nothing else is a release, maintenance or nightly job — e.g. a
 * workflow_dispatch publish — and a testing feature added to it (an OS or Node
 * matrix) multiplies that job instead of the PR tests.
 */
const NON_CHANGE_TRIGGERS = ['workflow_dispatch', 'schedule'];

/**
 * Categories whose features run on code changes (#3851): a testing matrix,
 * a dependency audit or a CodeQL scan belongs in a push/pull_request workflow,
 * never in a release, maintenance or nightly job.
 */
const CODE_CHANGE_CATEGORIES = ['testing', 'security'];

/**
 * Whether a classified workflow runs only manually or on a schedule.
 * @param {{ triggers: string[] }} classification
 * @returns {boolean}
 */
function isManualOrScheduledOnly(classification) {
  const triggers = classification.triggers || [];
  return triggers.length > 0 && triggers.every(t => NON_CHANGE_TRIGGERS.includes(t));
}

/**
 * Whether a classified workflow is a release job that never runs on a code
 * change (#3851): deployment-classified, with no pull_request trigger and a push
 * trigger, if any, restricted to tags — e.g. a deploy-on-tag workflow.
 * @param {{ categories: string[], triggers: string[], tagOnlyPush?: boolean }} classification
 * @returns {boolean}
 */
function isReleaseOnly(classification) {
  if (!(classification.categories || []).includes('deployment')) return false;
  const triggers = classification.triggers || [];
  if (triggers.length === 0) return false;
  if (triggers.includes('pull_request') || triggers.includes('pull_request_target')) return false;
  return !triggers.includes('push') || !!classification.tagOnlyPush;
}

/**
 * Whether a classified workflow is a deploy job (#3851): deployment-classified
 * and not triggered by a pull request, e.g. a deploy on push to main.
 * @param {{ categories: string[], triggers: string[] }} classification
 * @returns {boolean}
 */
function isDeployJob(classification) {
  if (!(classification.categories || []).includes('deployment')) return false;
  const triggers = classification.triggers || [];
  return !triggers.includes('pull_request') && !triggers.includes('pull_request_target');
}

/**
 * A new-file name for the category that does not overwrite an existing workflow.
 * @param {string} targetCategory
 * @param {string[]} existing - file names already in .github/workflows
 * @returns {string}
 */
function newFileName(targetCategory, existing) {
  const base = CATEGORY_FILE_NAMES[targetCategory] || 'ci.yml';
  if (!existing.includes(base)) return base;
  const stem = base.replace(/\.yml$/, '');
  let n = 2;
  while (existing.includes(`${stem}-${n}.yml`)) n++;
  return `${stem}-${n}.yml`;
}

/**
 * Suggest the best workflow file for a given feature.
 * For a testing- or security-category feature, a workflow triggered only by
 * workflow_dispatch and/or schedule is never selected (#3789, #3851).
 * @param {string} projectDir - Path to project root
 * @param {string} featureId - The CI feature identifier
 * @returns {{ file: string|null, createNew: boolean, suggestedName: string|null, classification: object|null }}
 */
function suggestWorkflowForFeature(projectDir, featureId) {
  const workflowsDir = path.join(projectDir, '.github', 'workflows');
  const targetCategory = FEATURE_CATEGORY_MAP[featureId] || 'general';
  const createNew = (existing) => ({
    file: null,
    createNew: true,
    suggestedName: newFileName(targetCategory, existing),
    classification: null
  });

  // Check if workflows directory exists
  if (!fs.existsSync(workflowsDir)) return createNew([]);

  // Read and classify all workflow files
  const files = fs.readdirSync(workflowsDir)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

  if (files.length === 0) return createNew([]);

  const classifications = [];
  for (const file of files) {
    const filePath = path.join(workflowsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const classification = classifyWorkflow(file, content);
    classifications.push({ file: filePath, fileName: file, ...classification });
  }

  const candidates = CODE_CHANGE_CATEGORIES.includes(targetCategory)
    ? classifications.filter(c => !isManualOrScheduledOnly(c) && !isReleaseOnly(c))
    : classifications;
  if (candidates.length === 0) return createNew(files);

  const selected = (c) => ({
    file: c.file,
    createNew: false,
    suggestedName: null,
    classification: { categories: c.categories, name: c.name, triggers: c.triggers }
  });

  // For a code-change feature, a deploy job — deployment-classified and never
  // triggered by a pull request — is never a target at any step (#3851, #3863). The
  // exclusion is trigger-based: a pull_request CI workflow whose text merely
  // mentions release tags stays eligible.
  const codeChange = CODE_CHANGE_CATEGORIES.includes(targetCategory);
  const isFallback = (c) => !codeChange || !isDeployJob(c);

  // Single candidate — auto-select, unless it is such a deploy job
  if (candidates.length === 1 && isFallback(candidates[0])) return selected(candidates[0]);

  // Exact category match, then a general workflow, then the first CI/test
  // workflow — every step searches the fallbacks, so a deploy job the
  // single-candidate step refused cannot be selected here instead (#3863)
  const fallbacks = candidates.filter(isFallback);
  const match = fallbacks.find(c => c.categories.includes(targetCategory))
    || fallbacks.find(c => c.categories.includes('general'))
    || fallbacks.find(c => c.categories.includes('testing'));
  if (match) return selected(match);

  // Last resort: suggest creating new
  return createNew(files);
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

module.exports = { detectTargetWorkflow, classifyWorkflow, suggestWorkflowForFeature, isManualOrScheduledOnly };
