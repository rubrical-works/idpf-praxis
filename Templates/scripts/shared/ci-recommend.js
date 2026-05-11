#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.91.1
 * @description Analyze a project and generate CI improvement recommendations based on detected languages, test tooling, deployment targets, and deprecated action versions. Produces structured recommendation objects consumed by ci-recommend-ui.js and ci-apply.js.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

const { analyzeProject } = require('./ci-analyze.js');

const RECOMMENDATION_TYPES = ['Add', 'Remove', 'Alter', 'Improve'];

/**
 * Deprecated action versions — map old to recommended.
 */
const DEPRECATED_ACTIONS = {
  'actions/checkout@v1': 'actions/checkout@v4',
  'actions/checkout@v2': 'actions/checkout@v4',
  'actions/checkout@v3': 'actions/checkout@v4',
  'actions/setup-node@v1': 'actions/setup-node@v4',
  'actions/setup-node@v2': 'actions/setup-node@v4',
  'actions/setup-node@v3': 'actions/setup-node@v4',
  'actions/setup-python@v2': 'actions/setup-python@v5',
  'actions/setup-python@v3': 'actions/setup-python@v5',
  'actions/setup-python@v4': 'actions/setup-python@v5',
  'actions/cache@v1': 'actions/cache@v4',
  'actions/cache@v2': 'actions/cache@v4',
  'actions/cache@v3': 'actions/cache@v4',
  'actions/upload-artifact@v2': 'actions/upload-artifact@v4',
  'actions/upload-artifact@v3': 'actions/upload-artifact@v4'
};

/**
 * EOL or outdated Node.js versions.
 */
const OUTDATED_NODE_VERSIONS = ['10', '12', '14', '16'];

/**
 * Inventory all workflow files in a project.
 * @param {string} projectDir - Path to project root
 * @returns {Array<{ file: string, fileName: string, name: string, triggers: string[], jobs: Array, raw: string }>}
 */
function inventoryWorkflows(projectDir) {
  const workflowsDir = path.join(projectDir, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) return [];

  const files = fs.readdirSync(workflowsDir)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

  return files.map(fileName => {
    const filePath = path.join(workflowsDir, fileName);
    const raw = fs.readFileSync(filePath, 'utf8');
    let parsed = null;
    try {
      parsed = yaml.parse(raw);
    } catch (_e) {
      // Invalid YAML — return minimal entry
      return { file: filePath, fileName, name: fileName, triggers: [], jobs: [], raw };
    }

    if (!parsed) {
      return { file: filePath, fileName, name: fileName, triggers: [], jobs: [], raw };
    }

    // Extract name
    const name = parsed.name || fileName;

    // Extract triggers
    let triggers = [];
    if (parsed.on) {
      if (typeof parsed.on === 'string') triggers = [parsed.on];
      else if (Array.isArray(parsed.on)) triggers = parsed.on;
      else triggers = Object.keys(parsed.on);
    }

    // Extract jobs
    const jobs = [];
    if (parsed.jobs && typeof parsed.jobs === 'object') {
      for (const [jobName, jobDef] of Object.entries(parsed.jobs)) {
        if (!jobDef || typeof jobDef !== 'object') continue;

        const steps = Array.isArray(jobDef.steps) ? jobDef.steps : [];
        const hasCache = steps.some(s =>
          s && s.uses && /actions\/cache/i.test(s.uses)
        ) || steps.some(s =>
          s && s.with && s.with.cache
        );

        const matrix = jobDef.strategy && jobDef.strategy.matrix
          ? jobDef.strategy.matrix
          : null;

        const runsOn = jobDef['runs-on'] || null;
        const usesReusable = typeof jobDef.uses === 'string';

        jobs.push({
          name: jobName,
          runsOn,
          steps,
          stepCount: steps.length,
          hasCache,
          matrix,
          usesReusable
        });
      }
    }

    return { file: filePath, fileName, name, triggers, jobs, raw };
  });
}

/**
 * Analyze gaps between current workflows and best practices.
 * @param {string} projectDir - Path to project root
 * @returns {Array<{ type: string, description: string, impact: string, feature?: string, file?: string }>}
 */
function analyzeGaps(projectDir) {
  const recommendations = [];
  const workflows = inventoryWorkflows(projectDir);
  const analysis = analyzeProject(projectDir);

  // Check each workflow for issues
  for (const wf of workflows) {
    // --- Alter: Deprecated actions ---
    for (const job of wf.jobs) {
      for (const step of job.steps) {
        if (step && step.uses) {
          const actionRef = step.uses;
          const upgrade = DEPRECATED_ACTIONS[actionRef];
          if (upgrade) {
            recommendations.push({
              type: 'Alter',
              description: `Upgrade deprecated ${actionRef} to ${upgrade} in ${wf.fileName}`,
              impact: 'Security and compatibility improvements',
              file: wf.fileName
            });
          }
        }
      }
    }

    // --- Alter: Outdated Node versions ---
    for (const job of wf.jobs) {
      for (const step of job.steps) {
        if (step && step.uses && /actions\/setup-node/i.test(step.uses) && step.with) {
          const nodeVersion = String(step.with['node-version'] || '');
          if (OUTDATED_NODE_VERSIONS.includes(nodeVersion)) {
            recommendations.push({
              type: 'Alter',
              description: `Node.js ${nodeVersion} is EOL — upgrade to 18+ in ${wf.fileName}`,
              impact: 'Security: EOL versions no longer receive patches',
              file: wf.fileName
            });
          }
        }
      }

      // Check matrix for outdated versions too
      if (job.matrix && job.matrix['node-version']) {
        const versions = Array.isArray(job.matrix['node-version'])
          ? job.matrix['node-version']
          : [job.matrix['node-version']];
        for (const v of versions) {
          if (OUTDATED_NODE_VERSIONS.includes(String(v))) {
            recommendations.push({
              type: 'Alter',
              description: `Node.js ${v} in matrix is EOL — remove or replace with 18+ in ${wf.fileName}`,
              impact: 'Security: EOL versions no longer receive patches',
              file: wf.fileName
            });
          }
        }
      }
    }

    // --- Improve: Missing concurrency groups on PR workflows ---
    if (wf.triggers.includes('pull_request') && !wf.raw.includes('concurrency')) {
      recommendations.push({
        type: 'Improve',
        description: `Add concurrency groups to ${wf.fileName} to cancel superseded PR runs`,
        impact: 'Efficiency: reduces wasted CI minutes on superseded commits',
        feature: 'concurrency-groups',
        file: wf.fileName
      });
    }

    // --- Improve: Missing paths-ignore on push/PR workflows ---
    const hasPaths = wf.raw.includes('paths-ignore') || wf.raw.includes('paths:');
    if (!hasPaths && (wf.triggers.includes('push') || wf.triggers.includes('pull_request'))) {
      const hasTestingJob = wf.jobs.some(j =>
        j.steps.some(s => s && s.run && /test|jest|pytest|cargo test|go test/i.test(s.run))
      );
      if (hasTestingJob) {
        recommendations.push({
          type: 'Improve',
          description: `Add paths-ignore to ${wf.fileName} to skip CI for docs-only changes`,
          impact: 'Efficiency: avoids unnecessary CI runs for documentation changes',
          feature: 'paths-ignore',
          file: wf.fileName
        });
      }
    }
  }

  // --- Improve: Missing artifact retention ---
  for (const wf of workflows) {
    for (const job of wf.jobs) {
      for (const step of job.steps) {
        if (step && step.uses && /actions\/upload-artifact/.test(step.uses)) {
          const hasRetention = step.with && step.with['retention-days'];
          if (!hasRetention) {
            recommendations.push({
              type: 'Improve',
              description: `Add retention-days to upload-artifact in ${wf.fileName} to avoid exhausting free-tier quota`,
              impact: 'Cost: default 90-day retention can exhaust 500 MB free quota in a few builds',
              feature: 'artifact-retention',
              file: wf.fileName
            });
          }
        }
      }
    }
  }

  // --- Add: Missing caching ---
  const hasAnyCaching = workflows.some(wf =>
    wf.jobs.some(j => j.hasCache)
  );
  if (!hasAnyCaching && analysis.buildSystem.length > 0) {
    recommendations.push({
      type: 'Add',
      description: 'Add dependency caching to speed up CI runs',
      impact: 'Performance: typically reduces install time by 50-70%',
      feature: 'dependency-caching'
    });
  }

  // --- Add: Missing security audit ---
  const hasAudit = workflows.some(wf =>
    wf.raw.includes('npm audit') || wf.raw.includes('pip-audit') ||
    wf.raw.includes('cargo audit') || wf.raw.includes('dependency-audit')
  );
  if (!hasAudit && analysis.buildSystem.length > 0) {
    recommendations.push({
      type: 'Add',
      description: 'Add dependency audit step to detect vulnerable packages',
      impact: 'Security: catches known vulnerabilities in dependencies',
      feature: 'dependency-audit'
    });
  }

  // --- Add: Missing security scanning ---
  const hasCodeQL = workflows.some(wf =>
    wf.raw.includes('codeql') || wf.raw.includes('CodeQL')
  );
  if (!hasCodeQL && analysis.languages.length > 0) {
    recommendations.push({
      type: 'Add',
      description: 'Add CodeQL analysis for automated security scanning',
      impact: 'Security: detects common vulnerability patterns in code',
      feature: 'codeql-analysis'
    });
  }

  // --- Add: Missing cross-OS testing ---
  const hasCrossOS = workflows.some(wf =>
    wf.jobs.some(j => j.matrix && j.matrix.os && Array.isArray(j.matrix.os) && j.matrix.os.length > 1)
  );
  if (!hasCrossOS && workflows.length > 0) {
    recommendations.push({
      type: 'Add',
      description: 'Add cross-OS testing to verify compatibility on Ubuntu, Windows, macOS',
      impact: 'Reliability: catches platform-specific issues early',
      feature: 'cross-os-testing'
    });
  }

  return recommendations;
}

// CLI entry point
if (require.main === module) {
  const dir = process.argv[2] || process.cwd();
  const recs = analyzeGaps(dir);
  if (recs.length === 0) {
    console.log('Your CI configuration looks good — no recommendations.');
  } else {
    console.log(`Found ${recs.length} recommendation(s):\n`);
    recs.forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.type}] ${r.description}`);
      console.log(`     Impact: ${r.impact}`);
    });
  }
}

module.exports = { inventoryWorkflows, analyzeGaps, RECOMMENDATION_TYPES };
