#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.92.0
 * @description Analyze a project to detect languages, test tooling, deployment targets, and current CI configuration. Generates structured project profile used by ci-recommend.js to produce CI improvement recommendations. Part of the /ci recommend subcommand.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');

const { detectLanguages, detectPrimaryLanguage } = require('./ci-detect-lang.js');

/**
 * Test tooling indicators per language ecosystem.
 */
const TEST_TOOLING_JS = ['jest', 'mocha', 'vitest', 'ava', 'tape', 'jasmine'];

/**
 * Deployment action patterns to detect in workflow files.
 */
const DEPLOY_PATTERNS = [
  { pattern: /npm publish/i, type: 'npm-publish', label: 'npm publish' },
  { pattern: /actions\/deploy-pages|github-pages-deploy-action|peaceiris\/actions-gh-pages/i, type: 'github-pages', label: 'GitHub Pages' },
  { pattern: /docker\/build-push-action|docker push|docker buildx/i, type: 'docker', label: 'Docker registry' },
  { pattern: /aws-actions\/configure-aws|aws s3|aws deploy/i, type: 'aws', label: 'AWS' },
  { pattern: /google-github-actions|gcloud/i, type: 'gcp', label: 'Google Cloud' },
  { pattern: /azure\/webapps-deploy|azure\/login/i, type: 'azure', label: 'Azure' },
  { pattern: /pypi.*upload|twine upload/i, type: 'pypi', label: 'PyPI' },
  { pattern: /cargo publish/i, type: 'crates-io', label: 'crates.io' }
];

/**
 * Detect test tooling for a project.
 * @param {string} projectDir - Path to project root
 * @returns {string[]} Array of detected test tool identifiers
 */
function detectTestTooling(projectDir) {
  const detected = new Set();

  // Check package.json for JS/TS test tooling
  const pkgPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {})
      };
      for (const tool of TEST_TOOLING_JS) {
        if (allDeps[tool]) detected.add(tool);
      }
      // Detect node:test from test script
      const testScript = (pkg.scripts && pkg.scripts.test) || '';
      if (/node\s+--test|node:test/.test(testScript)) {
        detected.add('node:test');
      }
    } catch (_e) {
      // Malformed package.json — skip JS tooling detection
    }
  }

  // Check Python test tooling
  const requirementsPath = path.join(projectDir, 'requirements.txt');
  if (fs.existsSync(requirementsPath)) {
    try {
      const content = fs.readFileSync(requirementsPath, 'utf8');
      if (/^pytest/m.test(content)) detected.add('pytest');
      if (/^unittest/m.test(content)) detected.add('unittest');
    } catch (_e) { /* skip */ }
  }

  const pyprojectPath = path.join(projectDir, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    try {
      const content = fs.readFileSync(pyprojectPath, 'utf8');
      if (/\[tool\.pytest\]|\bpytest\b/.test(content)) detected.add('pytest');
    } catch (_e) { /* skip */ }
  }

  // Go has built-in testing
  if (fs.existsSync(path.join(projectDir, 'go.mod'))) {
    detected.add('go test');
  }

  // Rust has built-in testing
  if (fs.existsSync(path.join(projectDir, 'Cargo.toml'))) {
    detected.add('cargo test');
  }

  return Array.from(detected);
}

/**
 * Detect build systems for a project.
 * @param {string} projectDir - Path to project root
 * @returns {string[]} Array of detected build system identifiers
 */
function detectBuildSystem(projectDir) {
  const detected = new Set();

  // npm/yarn/pnpm from package.json with scripts
  const pkgPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.scripts && Object.keys(pkg.scripts).length > 0) {
        detected.add('npm');
      }
    } catch (_e) {
      // Malformed — still count as npm project
    }
  }

  // Makefile
  if (fs.existsSync(path.join(projectDir, 'Makefile'))) {
    detected.add('make');
  }

  // Go
  if (fs.existsSync(path.join(projectDir, 'go.mod'))) {
    detected.add('go');
  }

  // Rust / Cargo
  if (fs.existsSync(path.join(projectDir, 'Cargo.toml'))) {
    detected.add('cargo');
  }

  // Gradle
  if (fs.existsSync(path.join(projectDir, 'build.gradle')) ||
      fs.existsSync(path.join(projectDir, 'build.gradle.kts'))) {
    detected.add('gradle');
  }

  // Maven
  if (fs.existsSync(path.join(projectDir, 'pom.xml'))) {
    detected.add('maven');
  }

  return Array.from(detected);
}

/**
 * Detect deployment targets from existing workflow files.
 * @param {string} projectDir - Path to project root
 * @returns {Array<{ type: string, label: string, file: string }>}
 */
function detectDeploymentTargets(projectDir) {
  const workflowsDir = path.join(projectDir, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) return [];

  const files = fs.readdirSync(workflowsDir)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

  const targets = [];
  const seen = new Set();

  for (const file of files) {
    const filePath = path.join(workflowsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    for (const dp of DEPLOY_PATTERNS) {
      if (dp.pattern.test(content) && !seen.has(dp.type)) {
        seen.add(dp.type);
        targets.push({ type: dp.type, label: dp.label, file });
      }
    }
  }

  return targets;
}

/**
 * Run full project analysis.
 * @param {string} projectDir - Path to project root
 * @returns {{ languages: string[], primaryLanguage: string, testTooling: string[], buildSystem: string[], deploymentTargets: Array }}
 */
function analyzeProject(projectDir) {
  return {
    languages: detectLanguages(projectDir),
    primaryLanguage: detectPrimaryLanguage(projectDir),
    testTooling: detectTestTooling(projectDir),
    buildSystem: detectBuildSystem(projectDir),
    deploymentTargets: detectDeploymentTargets(projectDir)
  };
}

/**
 * Format a human-readable stack report.
 * @param {{ languages: string[], primaryLanguage: string, testTooling: string[], buildSystem: string[], deploymentTargets: Array }} analysis
 * @returns {string}
 */
function formatStackReport(analysis) {
  const lines = [];

  // Language
  if (analysis.languages.length === 0) {
    lines.push('Language: Unknown (no recognized manifest files)');
  } else if (analysis.languages.length === 1) {
    lines.push(`Language: ${capitalize(analysis.languages[0])}`);
  } else {
    lines.push(`Languages: ${analysis.languages.map(capitalize).join(', ')}`);
  }

  // Test tooling
  if (analysis.testTooling.length > 0) {
    lines.push(`Test Tooling: ${analysis.testTooling.join(', ')}`);
  } else {
    lines.push('Test Tooling: None detected');
  }

  // Build system
  if (analysis.buildSystem.length > 0) {
    lines.push(`Build System: ${analysis.buildSystem.join(', ')}`);
  } else {
    lines.push('Build System: None detected');
  }

  // Deployment targets
  if (analysis.deploymentTargets.length > 0) {
    const labels = analysis.deploymentTargets.map(t => t.label);
    lines.push(`Deployment Targets: ${labels.join(', ')}`);
  } else {
    lines.push('Deployment Targets: None detected');
  }

  return lines.join('\n');
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// CLI entry point
if (require.main === module) {
  const dir = process.argv[2] || process.cwd();
  const analysis = analyzeProject(dir);
  console.log(formatStackReport(analysis));
}

module.exports = { analyzeProject, detectTestTooling, detectBuildSystem, detectDeploymentTargets, formatStackReport };
