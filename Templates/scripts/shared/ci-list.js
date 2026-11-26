#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.123.0
 * @description List available CI features with enabled/disabled status. Detects active features by scanning workflow YAML files and formats output with status indicators. Part of the /ci --list subcommand.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

/**
 * List available CI features with enabled/disabled status
 * @param {string} projectDir - Path to project root
 * @returns {string} Formatted output
 */
function listCIFeatures(projectDir = process.cwd()) {
  const registry = loadFeatureRegistry();
  const workflowsPath = path.join(projectDir, '.github', 'workflows');

  // Detect which features are enabled
  const enabledFeatures = detectEnabledFeatures(workflowsPath, registry);

  // Format output
  return formatFeatureList(registry, enabledFeatures);
}

/**
 * Load the CI features registry
 * @param {string} [overridePath] - Optional path to registry file (for testing)
 * @returns {Object} Feature registry
 */
function loadFeatureRegistry(overridePath) {
  const registryPath = overridePath || path.join(__dirname, '..', '..', 'metadata', 'ci-features.json');

  if (!fs.existsSync(registryPath)) {
    throw new Error('CI features registry not found. Please reinstall the framework.');
  }

  const content = fs.readFileSync(registryPath, 'utf8');
  const { $schema, ...registry } = JSON.parse(content);
  return registry;
}

/**
 * Detect which features are currently enabled in workflow files
 * @param {string} workflowsPath - Path to .github/workflows directory
 * @param {Object} registry - Feature registry
 * @returns {Set<string>} Set of enabled feature IDs
 */
function detectEnabledFeatures(workflowsPath, registry) {
  const enabledFeatures = new Set();

  if (!fs.existsSync(workflowsPath)) {
    return enabledFeatures;
  }

  // Get all workflow files
  const files = fs.readdirSync(workflowsPath)
    .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'));

  if (files.length === 0) {
    return enabledFeatures;
  }

  // Read and parse all workflow files
  const workflowContents = [];
  for (const file of files) {
    try {
      const filePath = path.join(workflowsPath, file);
      const content = fs.readFileSync(filePath, 'utf8');
      workflowContents.push({ file, content, parsed: yaml.parse(content) });
    } catch (_error) {
      // Skip malformed files
      continue;
    }
  }

  // Check each feature's detection patterns
  for (const [featureId, feature] of Object.entries(registry)) {
    if (isFeatureEnabled(workflowContents, feature)) {
      enabledFeatures.add(featureId);
    }
  }

  return enabledFeatures;
}

/**
 * Features whose presence is a workflow shape no regex over the file can
 * judge, keyed by feature id. A detector here replaces the feature's
 * detectionPatterns for /ci --list, /ci --add and /ci remove (#3852) — a
 * regex is satisfied by a comment or a step's with: block.
 *
 * trigger-scope (#3795): schedule + workflow_dispatch alone matched any
 * weekly maintenance job. The check is ci-recommend.js triggerScopeApplied —
 * a scanner step plus paths:-filtered push/pull_request plus schedule and
 * dispatch, the scanners read from SCANNER_STEPS itself. Required lazily:
 * ci-recommend.js requires this module at load. Its ci-features.json
 * detectionPatterns entry is the never-matching placeholder `(?!)`, kept only
 * because the registry schema requires the key: a scanner list copied there
 * drifted from SCANNER_STEPS with nothing to catch it.
 */
const STRUCTURAL_DETECTORS = {
  'trigger-scope': (parsed) => {
    if (!parsed || typeof parsed !== 'object') return false;
    const { triggerScopeApplied } = require('./ci-recommend.js');
    const jobs = parsed.jobs && typeof parsed.jobs === 'object'
      ? Object.values(parsed.jobs).map(job => ({ steps: (job && Array.isArray(job.steps)) ? job.steps : [] }))
      : [];
    return triggerScopeApplied({ on: parsed.on, jobs });
  }
};

/**
 * Judge a feature in one workflow's text by its structural detector (#3852).
 * @param {string} featureId - Feature identifier
 * @param {string} content - Raw workflow YAML
 * @returns {boolean|null} null when the feature has no structural detector
 *   (the caller falls back to detectionPatterns); false for unparseable YAML
 */
function detectStructurally(featureId, content) {
  const detector = STRUCTURAL_DETECTORS[featureId];
  if (!detector) return null;
  let parsed;
  try { parsed = yaml.parse(content); } catch { return false; }
  return detector(parsed);
}

/**
 * Check if a feature is enabled based on workflow content
 * @param {Array} workflowContents - Array of {file, content, parsed} objects
 * @param {Object} feature - Feature definition
 * @returns {boolean} True if feature is detected
 */
function isFeatureEnabled(workflowContents, feature) {
  const structural = STRUCTURAL_DETECTORS[feature.id];
  if (structural) {
    return workflowContents.some(workflow => structural(workflow.parsed));
  }

  const patterns = feature.detectionPatterns.yaml || [];

  for (const workflow of workflowContents) {
    for (const pattern of patterns) {
      // Check raw content for pattern match (safe regex from registry data)
      let regex;
      try { regex = new RegExp(pattern, 'i'); } catch { continue; }
      if (regex.test(workflow.content)) {
        return true;
      }

      // Also check parsed structure for specific paths
      if (pattern.includes('.')) {
        const pathParts = pattern.split('.');
        if (checkNestedPath(workflow.parsed, pathParts)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Check if a nested path exists in an object
 * @param {Object} obj - Object to check
 * @param {Array<string>} pathParts - Path parts to check
 * @returns {boolean} True if path exists
 */
function checkNestedPath(obj, pathParts) {
  let current = obj;

  for (const part of pathParts) {
    if (!current || typeof current !== 'object') {
      return false;
    }

    if (part in current) {
      current = current[part];
    } else {
      return false;
    }
  }

  return current !== undefined;
}

/**
 * Format the feature list for display
 * @param {Object} registry - Feature registry
 * @param {Set<string>} enabledFeatures - Set of enabled feature IDs
 * @returns {string} Formatted output
 */
function formatFeatureList(registry, enabledFeatures) {
  const lines = [];

  lines.push('');
  lines.push('Available CI Features:');
  lines.push('');

  // Group features by tier
  const tiers = {
    v1: { title: 'v1 — High Value Features', features: [] },
    v2: { title: 'v2 — Medium Value Features', features: [] }
  };

  for (const [featureId, feature] of Object.entries(registry)) {
    tiers[feature.tier].features.push({ featureId, ...feature });
  }

  // Display each tier
  for (const [_tier, group] of Object.entries(tiers)) {
    if (group.features.length === 0) continue;

    lines.push(`## ${group.title}`);
    lines.push('');

    for (const feature of group.features) {
      const status = enabledFeatures.has(feature.featureId) ? '✓ enabled' : '✗ disabled';
      const statusPadded = status.padEnd(12);
      lines.push(`  ${statusPadded}  ${feature.name}`);
      lines.push(`                  ${feature.description}`);
      lines.push('');
    }
  }

  // Summary
  const totalFeatures = Object.keys(registry).length;
  const enabledCount = enabledFeatures.size;
  lines.push(`${enabledCount} of ${totalFeatures} features enabled`);
  lines.push('');

  return lines.join('\n');
}

// CLI entry point
if (require.main === module) {
  const result = listCIFeatures();
  console.log(result);
}

module.exports = { listCIFeatures, loadFeatureRegistry, detectStructurally, STRUCTURAL_DETECTORS };
