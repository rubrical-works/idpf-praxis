#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.67.0
 * @description Modify a workflow YAML file safely, preserving comments and structure. Supports adding top-level keys, inserting steps into jobs, and merging configuration blocks. Used by ci-add.js and ci-remove.js for non-destructive YAML edits.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

/**
 * Modify a workflow YAML file safely, preserving comments and structure.
 * @param {string} filePath - Path to the workflow YAML file
 * @param {Object} operation - The modification operation
 * @param {Object} [operation.addTopLevel] - Add a top-level key
 * @param {string} operation.addTopLevel.key - The key name
 * @param {string} operation.addTopLevel.yaml - YAML content to add
 * @param {Object} [operation.addStep] - Add a step to a job
 * @param {string} operation.addStep.job - Target job name
 * @param {string} operation.addStep.yaml - YAML step content
 * @param {string} [operation.addStep.position] - 'end', 'start', or 'before-last'
 * @returns {{ success: boolean, message: string }}
 */
function modifyWorkflow(filePath, operation) {
  // Read original content
  const original = fs.readFileSync(filePath, 'utf8');

  // Create backup before modification
  createBackup(filePath);

  // Parse with comment preservation
  const doc = yaml.parseDocument(original);

  if (operation.addTopLevel) {
    addTopLevelKey(doc, operation.addTopLevel.key, operation.addTopLevel.yaml);
  }

  if (operation.addStep) {
    addStepToJob(doc, operation.addStep.job, operation.addStep.yaml, operation.addStep.position || 'before-last');
  }

  if (operation.setJobProperty) {
    setJobProperty(doc, operation.setJobProperty.job, operation.setJobProperty.path, operation.setJobProperty.value);
  }

  // Serialize back to string
  const output = doc.toString();

  // Validate before writing
  validateYaml(output);

  // Write using fs (no heredocs — Windows safe)
  fs.writeFileSync(filePath, output);

  return { success: true, message: `Modified ${path.basename(filePath)}` };
}

/**
 * Add a top-level key to a YAML document.
 * @param {yaml.Document} doc - The parsed YAML document
 * @param {string} key - Key name to add
 * @param {string} yamlContent - YAML string for the value
 */
function addTopLevelKey(doc, key, yamlContent) {
  // Parse the new content to get the value
  const parsed = yaml.parseDocument(yamlContent);

  // Extract the value — if yamlContent is a mapping with our key, use its value
  // Otherwise treat the whole thing as the value
  let value;
  const contents = parsed.contents;
  if (contents && (contents instanceof yaml.YAMLMap || contents.items)) {
    // Check if this is a single-key mapping matching our key
    const firstItem = contents.items[0];
    if (firstItem && firstItem.key && String(firstItem.key) === key) {
      value = firstItem.value;
    } else {
      value = contents;
    }
  } else {
    value = contents;
  }

  // Set the key on the document
  doc.set(key, value ? value.toJSON() : yaml.parse(yamlContent));
}

/**
 * Add a step to a specific job in the workflow.
 * @param {yaml.Document} doc - The parsed YAML document
 * @param {string} jobName - Name of the job
 * @param {string} stepYaml - YAML content for the step(s)
 * @param {string} position - Where to insert: 'start', 'end', or 'before-last'
 */
function addStepToJob(doc, jobName, stepYaml, position) {
  const jobs = doc.get('jobs');
  if (!jobs) {
    throw new Error('No jobs found in workflow');
  }

  // Navigate to the job's steps using the document model
  const jobNode = doc.getIn(['jobs', jobName]);
  if (!jobNode) {
    throw new Error(`Job "${jobName}" not found in workflow`);
  }

  // Parse the step(s) — wrap in array if needed
  let stepContent = stepYaml.trim();
  if (!stepContent.startsWith('-')) {
    stepContent = '- ' + stepContent;
  }

  // Parse as array items
  const stepsArray = yaml.parse(`steps:\n${stepContent.split('\n').map(l => '  ' + l).join('\n')}`);
  const newSteps = stepsArray.steps;

  // Get existing steps — doc.getIn returns YAMLSeq node, not plain array
  const existingStepsNode = doc.getIn(['jobs', jobName, 'steps']);
  if (!existingStepsNode) {
    doc.setIn(['jobs', jobName, 'steps'], newSteps);
    return;
  }

  // Convert YAMLSeq to plain JS array
  const existingSteps = existingStepsNode.toJSON
    ? existingStepsNode.toJSON()
    : (Array.isArray(existingStepsNode) ? existingStepsNode : []);

  if (existingSteps.length === 0) {
    doc.setIn(['jobs', jobName, 'steps'], newSteps);
    return;
  }

  // Insert at position
  if (position === 'start') {
    doc.setIn(['jobs', jobName, 'steps'], [...newSteps, ...existingSteps]);
  } else if (position === 'before-last') {
    const updated = [...existingSteps];
    const insertIndex = Math.max(0, updated.length - 1);
    updated.splice(insertIndex, 0, ...newSteps);
    doc.setIn(['jobs', jobName, 'steps'], updated);
  } else {
    // 'end' or default
    doc.setIn(['jobs', jobName, 'steps'], [...existingSteps, ...newSteps]);
  }
}

/**
 * Set a property on a specific job in the workflow.
 * @param {yaml.Document} doc - The parsed YAML document
 * @param {string} jobName - Name of the job
 * @param {string[]} propPath - Path within the job (e.g., ['strategy', 'matrix', 'os'])
 * @param {*} value - The value to set
 */
function setJobProperty(doc, jobName, propPath, value) {
  const fullPath = ['jobs', jobName, ...propPath];
  doc.setIn(fullPath, value);
}

/**
 * Create a timestamped backup of a workflow file.
 * @param {string} filePath - Path to the workflow file
 */
function createBackup(filePath) {
  const dir = path.dirname(filePath);
  const backupDir = path.join(dir, '.backup');
  const fileName = path.basename(filePath);

  fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('Z', '').substring(0, 15);
  const backupName = `${fileName}.${timestamp}.bak`;

  fs.copyFileSync(filePath, path.join(backupDir, backupName));

  // Clean up old backups
  cleanupBackups(backupDir, fileName);
}

/**
 * Keep only the last 5 backups for a given workflow file.
 * @param {string} backupDir - Path to backup directory
 * @param {string} fileName - Original workflow file name
 */
function cleanupBackups(backupDir, fileName) {
  if (!fs.existsSync(backupDir)) return;

  const backups = fs.readdirSync(backupDir)
    .filter(f => f.startsWith(fileName + '.') && f.endsWith('.bak'))
    .sort(); // Alphabetical sort = chronological for ISO timestamps

  // Keep last 5, delete the rest
  const toDelete = backups.slice(0, Math.max(0, backups.length - 5));

  for (const file of toDelete) {
    fs.unlinkSync(path.join(backupDir, file));
  }
}

/**
 * Validate that a string is valid YAML.
 * @param {string} content - YAML string to validate
 * @throws {Error} If YAML is invalid
 */
function validateYaml(content) {
  try {
    yaml.parse(content);
  } catch (err) {
    throw new Error(`YAML validation failed: ${err.message}`);
  }
}

// CLI entry point
if (require.main === module) {
  console.log('ci-modify.js - YAML-safe workflow modification library');
  console.log('This module is used programmatically by /ci add and /ci remove.');
}

module.exports = { modifyWorkflow, createBackup, cleanupBackups, validateYaml, setJobProperty };
