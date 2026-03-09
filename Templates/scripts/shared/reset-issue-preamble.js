#!/usr/bin/env node
// Rubrical Systems (c) 2026
/**
 * @framework-script 0.60.0
 * reset-issue-preamble.js
 *
 * Analyzes an issue to determine what /reset-issue would do.
 * Returns structured JSON with reset scope and actions.
 *
 * Usage:
 *   node reset-issue-preamble.js --issue N
 *   node reset-issue-preamble.js --issue N --dry-run
 */

const { exec: execCb } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(execCb);
const SCHEMA_VERSION = 1;
const EXEC_OPTS = { encoding: 'utf-8' };

const ALLOWED_LABELS = ['enhancement', 'prd', 'proposal'];
const REVIEW_PATTERNS = [
  /^## Issue Review/m,
  /^## Proposal Review/m,
  /^## PRD Review/m
];

// ─── Helpers ───

async function ghExec(cmd) {
  try {
    const { stdout } = await execAsync(`gh ${cmd}`, EXEC_OPTS);
    return stdout.trim();
  } catch (err) {
    throw new Error(err.stderr || err.message);
  }
}

async function ghJSON(cmd) {
  const raw = await ghExec(cmd);
  return JSON.parse(raw);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { issue: null, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--issue' && args[i + 1]) {
      result.issue = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--dry-run') {
      result.dryRun = true;
    }
  }
  return result;
}

// ─── Analysis ───

function analyzeBody(body) {
  const checkedBoxes = (body.match(/\[x\]/gi) || []).length;
  const uncheckedBoxes = (body.match(/\[ \]/g) || []).length;
  const reviewsMatch = body.match(/\*\*Reviews:\*\*\s*(\d+)/);
  const reviewCount = reviewsMatch ? parseInt(reviewsMatch[1], 10) : 0;

  const autoSections = [];
  if (/#### Proposed Solution/m.test(body)) autoSections.push('Proposed Solution');
  if (/#### Proposed Fix/m.test(body)) autoSections.push('Proposed Fix');

  // Check for PRD reference (proposal issues)
  const prdIssueMatch = body.match(/PRD:\s*#(\d+)/i) || body.match(/PRD issue[:\s]*#(\d+)/i);
  const prdIssue = prdIssueMatch ? parseInt(prdIssueMatch[1], 10) : null;

  const prdFileMatch = body.match(/PRD\/([A-Za-z0-9_-]+)\/PRD-[A-Za-z0-9_-]+\.md/);
  const prdDir = prdFileMatch ? `PRD/${prdFileMatch[1]}` : null;

  return {
    checkedBoxes,
    uncheckedBoxes,
    totalBoxes: checkedBoxes + uncheckedBoxes,
    reviewCount,
    autoSections,
    prdIssue,
    prdDir
  };
}

async function findReviewComments(issueNumber, owner, repo) {
  try {
    const comments = await ghJSON(
      `api repos/${owner}/${repo}/issues/${issueNumber}/comments --paginate`
    );
    const reviewComments = comments.filter(c =>
      REVIEW_PATTERNS.some(p => p.test(c.body))
    );
    return reviewComments.map(c => ({ id: c.id, preview: c.body.split('\n')[0].slice(0, 80) }));
  } catch {
    return [];
  }
}

function findTestPlanFiles(issueNumber) {
  const testPlanDir = path.join(process.cwd(), 'Construction', 'Test-Plans');
  if (!fs.existsSync(testPlanDir)) return [];

  const files = fs.readdirSync(testPlanDir).filter(f => f.endsWith('.md'));
  const matching = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(testPlanDir, file), 'utf-8');
    if (content.includes(`#${issueNumber}`) || content.includes(`#${issueNumber} `)) {
      matching.push(path.join('Construction', 'Test-Plans', file));
    }
  }
  return matching;
}

// ─── Main ───

async function main() {
  const { issue, dryRun } = parseArgs();

  if (!issue) {
    console.log(JSON.stringify({
      ok: false, version: SCHEMA_VERSION,
      errors: [{ code: 'MISSING_ISSUE', message: 'Usage: reset-issue-preamble.js --issue N' }]
    }));
    return;
  }

  // Load repo config
  let owner, repo;
  try {
    const config = JSON.parse(fs.readFileSync('.gh-pmu.json', 'utf-8'));
    const repoStr = config.repositories?.[0] || '';
    [owner, repo] = repoStr.split('/');
  } catch {
    console.log(JSON.stringify({
      ok: false, version: SCHEMA_VERSION,
      errors: [{ code: 'NO_CONFIG', message: '.gh-pmu.json not found or invalid' }]
    }));
    return;
  }

  // Fetch issue
  let issueData;
  try {
    issueData = await ghJSON(
      `pmu view ${issue} --json=number,title,labels,body,state`
    );
  } catch (err) {
    console.log(JSON.stringify({
      ok: false, version: SCHEMA_VERSION,
      errors: [{ code: 'ISSUE_NOT_FOUND', message: `Issue #${issue} not found: ${err.message}` }]
    }));
    return;
  }

  // Validate type
  const labels = (issueData.labels || []).map(l => l.name || l);
  const matchedLabel = labels.find(l => ALLOWED_LABELS.includes(l));
  if (!matchedLabel) {
    console.log(JSON.stringify({
      ok: false, version: SCHEMA_VERSION,
      errors: [{
        code: 'INVALID_TYPE',
        message: `Only enhancement, prd, proposal issues can be reset. Issue #${issue} has labels: ${labels.join(', ')}`
      }]
    }));
    return;
  }

  // Analyze scope
  const bodyAnalysis = analyzeBody(issueData.body || '');
  const reviewComments = await findReviewComments(issue, owner, repo);
  const testPlanFiles = findTestPlanFiles(issue);
  const hasReviewedLabel = labels.includes('reviewed');

  const scope = {
    issue: {
      number: issueData.number,
      title: issueData.title,
      type: matchedLabel,
      state: issueData.state
    },
    body: bodyAnalysis,
    reviewComments,
    testPlanFiles,
    hasReviewedLabel,
    dryRun
  };

  console.log(JSON.stringify({
    ok: true,
    version: SCHEMA_VERSION,
    scope
  }));
}

main().catch(err => {
  console.log(JSON.stringify({
    ok: false, version: SCHEMA_VERSION,
    errors: [{ code: 'UNEXPECTED', message: err.message }]
  }));
});
