#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

/**
 * @framework-script 0.49.1
 * Validate GitHub Actions workflow files
 * @param {string} projectDir - Path to project root
 * @returns {string} Formatted validation results
 */
function validateWorkflows(projectDir = process.cwd()) {
  const workflowsPath = path.join(projectDir, '.github', 'workflows');

  if (!fs.existsSync(workflowsPath)) {
    return 'No .github/workflows/ directory found.\n';
  }

  const files = fs.readdirSync(workflowsPath)
    .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'));

  if (files.length === 0) {
    return 'No workflow files found in .github/workflows/\n';
  }

  // Validate each file
  const findings = [];
  for (const file of files) {
    const filePath = path.join(workflowsPath, file);
    const fileFindings = validateWorkflowFile(file, filePath);
    findings.push(...fileFindings);
  }

  return formatFindings(findings, files.length);
}

/**
 * Validate a single workflow file
 * @param {string} filename - Workflow filename
 * @param {string} filePath - Full path to workflow file
 * @returns {Array} Array of finding objects
 */
function validateWorkflowFile(filename, filePath) {
  const findings = [];
  let content;
  let parsed;

  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    findings.push({
      file: filename,
      severity: 'error',
      message: `Failed to read file: ${error.message}`
    });
    return findings;
  }

  // Check for empty file
  if (content.trim().length === 0) {
    findings.push({
      file: filename,
      severity: 'error',
      message: 'Workflow file is empty'
    });
    return findings;
  }

  // Try to parse YAML
  try {
    parsed = yaml.parse(content);
  } catch (error) {
    findings.push({
      file: filename,
      severity: 'error',
      message: `YAML syntax error: ${error.message}`
    });
    return findings;
  }

  // Check if parsed content is valid
  if (!parsed || typeof parsed !== 'object') {
    findings.push({
      file: filename,
      severity: 'error',
      message: 'Invalid workflow structure (only comments or empty)'
    });
    return findings;
  }

  // Validate workflow structure
  if (!parsed.name) {
    findings.push({
      file: filename,
      severity: 'warning',
      message: 'Workflow missing "name" field'
    });
  }

  if (!parsed.on) {
    findings.push({
      file: filename,
      severity: 'error',
      message: 'Workflow missing "on" trigger'
    });
  }

  if (!parsed.jobs) {
    findings.push({
      file: filename,
      severity: 'error',
      message: 'Workflow missing "jobs" section'
    });
  }

  // Check for anti-patterns
  findings.push(...checkAntiPatterns(filename, parsed, content));

  // Check for security issues
  findings.push(...checkSecurityIssues(filename, content));

  return findings;
}

/**
 * Check for common anti-patterns
 * @param {string} filename - Workflow filename
 * @param {Object} parsed - Parsed YAML object
 * @param {string} content - Raw file content
 * @returns {Array} Array of findings
 */
function checkAntiPatterns(filename, parsed, content) {
  const findings = [];

  // Check for deprecated action versions
  const deprecatedActions = [
    { pattern: /actions\/checkout@v[12]\b/, message: 'Using deprecated actions/checkout@v2 or v1, upgrade to v4' },
    { pattern: /actions\/setup-node@v[12]\b/, message: 'Using deprecated actions/setup-node@v2 or v1, upgrade to v4' },
    { pattern: /actions\/cache@v[12]\b/, message: 'Using deprecated actions/cache@v2 or v1, upgrade to v3' }
  ];

  for (const check of deprecatedActions) {
    if (check.pattern.test(content)) {
      findings.push({
        file: filename,
        severity: 'warning',
        message: check.message
      });
    }
  }

  // Check for missing concurrency on PR workflows
  if (parsed.on) {
    const hasPullRequest =
      parsed.on === 'pull_request' ||
      parsed.on.includes?.('pull_request') ||
      parsed.on.pull_request !== undefined;

    if (hasPullRequest && !parsed.concurrency) {
      findings.push({
        file: filename,
        severity: 'warning',
        message: 'PR-triggered workflow missing concurrency group (can cause redundant runs)'
      });
    }
  }

  // Check for overly permissive permissions
  if (parsed.permissions === 'write-all') {
    findings.push({
      file: filename,
      severity: 'warning',
      message: 'Overly permissive permissions: write-all (use specific permissions instead)'
    });
  }

  return findings;
}

/**
 * Check for security issues
 * @param {string} filename - Workflow filename
 * @param {string} content - Raw file content
 * @returns {Array} Array of findings
 */
function checkSecurityIssues(filename, content) {
  const findings = [];

  // Check for hardcoded secrets/tokens
  const secretPatterns = [
    { pattern: /ghp_[a-zA-Z0-9]{36}/, message: 'Hardcoded GitHub personal access token detected' },
    { pattern: /ghs_[a-zA-Z0-9]{36}/, message: 'Hardcoded GitHub OAuth token detected' },
    { pattern: /(sk|pk)_live_[a-zA-Z0-9]{24,}/, message: 'Hardcoded Stripe API key detected' },
    { pattern: /AKIA[0-9A-Z]{16}/, message: 'Hardcoded AWS access key detected' },
    { pattern: /(password|secret|token|key)\s*[:=]\s*["'][^"'\s]+["']/, message: 'Possible hardcoded secret in workflow' }
  ];

  for (const check of secretPatterns) {
    if (check.pattern.test(content)) {
      findings.push({
        file: filename,
        severity: 'error',
        message: `Security: ${check.message}`
      });
    }
  }

  return findings;
}

/**
 * Format findings for display
 * @param {Array} findings - Array of finding objects
 * @param {number} fileCount - Number of files validated
 * @returns {string} Formatted output
 */
function formatFindings(findings, fileCount) {
  const lines = [];

  lines.push('');
  lines.push(`Validating ${fileCount} workflow file${fileCount !== 1 ? 's' : ''}...`);
  lines.push('');

  if (findings.length === 0) {
    lines.push('✓ No issues found');
    lines.push('');
    return lines.join('\n');
  }

  // Group findings by severity
  const errors = findings.filter(f => f.severity === 'error');
  const warnings = findings.filter(f => f.severity === 'warning');
  const infos = findings.filter(f => f.severity === 'info');

  let findingNumber = 1;

  if (errors.length > 0) {
    lines.push('## Errors');
    lines.push('');
    for (const finding of errors) {
      lines.push(`${findingNumber}. [ERROR] ${finding.file}`);
      lines.push(`   ${finding.message}`);
      lines.push('');
      findingNumber++;
    }
  }

  if (warnings.length > 0) {
    lines.push('## Warnings');
    lines.push('');
    for (const finding of warnings) {
      lines.push(`${findingNumber}. [WARNING] ${finding.file}`);
      lines.push(`   ${finding.message}`);
      lines.push('');
      findingNumber++;
    }
  }

  if (infos.length > 0) {
    lines.push('## Info');
    lines.push('');
    for (const finding of infos) {
      lines.push(`${findingNumber}. [INFO] ${finding.file}`);
      lines.push(`   ${finding.message}`);
      lines.push('');
      findingNumber++;
    }
  }

  // Summary
  lines.push(`Found ${findings.length} issue${findings.length !== 1 ? 's' : ''}: ${errors.length} error${errors.length !== 1 ? 's' : ''}, ${warnings.length} warning${warnings.length !== 1 ? 's' : ''}, ${infos.length} info`);
  lines.push('');

  return lines.join('\n');
}

// CLI entry point
if (require.main === module) {
  const result = validateWorkflows();
  console.log(result);

  // Exit with error code if errors found
  if (result.includes('[ERROR]')) {
    process.exit(1);
  }
}

module.exports = { validateWorkflows };
