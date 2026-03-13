#!/usr/bin/env node
// Rubrical Works (c) 2026

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

/**
 * @framework-script 0.62.1
 * View workflow status - lists all GitHub Actions workflows
 * @param {string} projectDir - Path to project root
 * @returns {string} Formatted output
 */
function viewWorkflowStatus(projectDir = process.cwd()) {
  const workflowsPath = path.join(projectDir, '.github', 'workflows');

  // Check if .github/workflows/ exists
  if (!fs.existsSync(workflowsPath)) {
    return 'No .github/workflows/ directory found in this project.';
  }

  // Get all .yml and .yaml files
  const files = fs.readdirSync(workflowsPath)
    .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'));

  if (files.length === 0) {
    return 'No workflow files found in .github/workflows/';
  }

  // Parse each workflow file
  const workflows = [];
  for (const file of files) {
    const filePath = path.join(workflowsPath, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = yaml.parse(content);

      workflows.push({
        file,
        name: parsed.name || file,
        triggers: extractTriggers(parsed),
        os: extractOS(parsed),
        versions: extractVersions(parsed),
      });
    } catch (error) {
      workflows.push({
        file,
        name: file,
        error: `YAML parse error: ${error.message}`,
      });
    }
  }

  // Format as table
  return formatWorkflowTable(workflows);
}

/**
 * Extract trigger events from workflow
 */
function extractTriggers(workflow) {
  if (!workflow.on) {
    return '-';
  }

  if (typeof workflow.on === 'string') {
    return workflow.on;
  }

  if (Array.isArray(workflow.on)) {
    return workflow.on.join(', ');
  }

  if (typeof workflow.on === 'object') {
    return Object.keys(workflow.on).join(', ');
  }

  return '-';
}

/**
 * Extract OS targets from workflow jobs
 */
function extractOS(workflow) {
  if (!workflow.jobs) {
    return '-';
  }

  const osList = new Set();

  for (const job of Object.values(workflow.jobs)) {
    if (job['runs-on']) {
      if (typeof job['runs-on'] === 'string') {
        osList.add(job['runs-on']);
      } else if (Array.isArray(job['runs-on'])) {
        job['runs-on'].forEach(os => osList.add(os));
      }
    }

    // Check matrix strategy
    if (job.strategy?.matrix?.os) {
      const matrixOS = job.strategy.matrix.os;
      if (Array.isArray(matrixOS)) {
        matrixOS.forEach(os => osList.add(os));
      }
    }
  }

  return osList.size > 0 ? Array.from(osList).join(', ') : '-';
}

/**
 * Extract language versions from workflow
 */
function extractVersions(workflow) {
  if (!workflow.jobs) {
    return '-';
  }

  const versions = new Set();

  for (const job of Object.values(workflow.jobs)) {
    // Check for Node.js versions
    if (job.strategy?.matrix?.['node-version']) {
      const nodeVersions = job.strategy.matrix['node-version'];
      if (Array.isArray(nodeVersions)) {
        nodeVersions.forEach(v => versions.add(`Node ${v}`));
      }
    }

    // Check for Python versions
    if (job.strategy?.matrix?.['python-version']) {
      const pyVersions = job.strategy.matrix['python-version'];
      if (Array.isArray(pyVersions)) {
        pyVersions.forEach(v => versions.add(`Python ${v}`));
      }
    }

    // Check for Go versions
    if (job.strategy?.matrix?.['go-version']) {
      const goVersions = job.strategy.matrix['go-version'];
      if (Array.isArray(goVersions)) {
        goVersions.forEach(v => versions.add(`Go ${v}`));
      }
    }

    // Check steps for setup actions
    if (job.steps) {
      for (const step of job.steps) {
        if (step.uses?.includes('setup-node')) {
          const nodeVersion = step.with?.['node-version'];
          if (nodeVersion && !nodeVersion.includes('${{')) {
            versions.add(`Node ${nodeVersion}`);
          }
        }
        if (step.uses?.includes('setup-python')) {
          const pyVersion = step.with?.['python-version'];
          if (pyVersion && !pyVersion.includes('${{')) {
            versions.add(`Python ${pyVersion}`);
          }
        }
        if (step.uses?.includes('setup-go')) {
          const goVersion = step.with?.['go-version'];
          if (goVersion && !goVersion.includes('${{')) {
            versions.add(`Go ${goVersion}`);
          }
        }
      }
    }
  }

  return versions.size > 0 ? Array.from(versions).join(', ') : '-';
}

/**
 * Format workflows as a table
 */
function formatWorkflowTable(workflows) {
  const lines = [];

  lines.push('');
  lines.push('GitHub Actions Workflows:');
  lines.push('');
  lines.push('┌' + '─'.repeat(78) + '┐');
  lines.push('│ Name                  │ Triggers          │ OS              │ Versions        │');
  lines.push('├' + '─'.repeat(78) + '┤');

  for (const wf of workflows) {
    if (wf.error) {
      lines.push(`│ ${truncate(wf.name, 21)} │ ${truncate(wf.error, 51)} │`);
    } else {
      lines.push(
        `│ ${truncate(wf.name, 21)} │ ${truncate(wf.triggers, 17)} │ ${truncate(wf.os, 15)} │ ${truncate(wf.versions, 15)} │`
      );
    }
  }

  lines.push('└' + '─'.repeat(78) + '┘');
  lines.push('');

  return lines.join('\n');
}

/**
 * Truncate string to length, add ellipsis if needed
 */
function truncate(str, maxLen) {
  str = String(str);
  if (str.length <= maxLen) {
    return str.padEnd(maxLen, ' ');
  }
  return str.substring(0, maxLen - 3) + '...';
}

// CLI entry point
if (require.main === module) {
  const result = viewWorkflowStatus();
  console.log(result);
}

module.exports = { viewWorkflowStatus };
