#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.92.0
 * @description Auto-create QA sub-issues for unverifiable ACs in a /work issue. Reads
 * qa-config.json for keyword triggers, fetches the parent issue body via gh pmu, matches
 * unchecked AC lines against keywords (case-insensitive), and creates a labeled sub-issue
 * per match via gh pmu sub create. Returns a JSON envelope listing matches and sub-issue
 * numbers. Spec replacement for /work Step 4a (#2318).
 *
 * Usage: node qa-extract.js --issue <N> [--dry-run]
 *
 * Output (JSON envelope on stdout):
 *   { ok, issueNumber, matched: [{ acText, keyword, subIssueNumber, annotation }], skipped: [acText], errors: [] }
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG_PATH = path.join(__dirname, 'lib', 'qa-config.json');

function parseArgs(argv) {
  const out = { issue: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--issue' && argv[i + 1]) out.issue = parseInt(argv[++i], 10);
    else if (argv[i] === '--dry-run') out.dryRun = true;
  }
  if (!out.issue || Number.isNaN(out.issue)) {
    return { error: 'Missing or invalid --issue <number> argument.' };
  }
  return out;
}

function loadConfig(configPath = CONFIG_PATH) {
  const raw = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(raw);
  if (!Array.isArray(config.keywords) || config.keywords.length === 0) {
    throw new Error('qa-config.json has no keywords');
  }
  return config;
}

/**
 * Extract unchecked acceptance-criteria lines from an issue body.
 * @param {string} body - Raw issue body markdown
 * @returns {string[]} AC text (stripped of leading checkbox)
 */
function extractUncheckedAcs(body) {
  if (!body) return [];
  const acs = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*- \[ \] (.+)$/);
    if (m) acs.push(m[1].trim());
  }
  return acs;
}

/**
 * Return the first keyword (from config.keywords) that appears in the AC text,
 * case-insensitive. Returns null if no keyword matches.
 */
function findMatchingKeyword(acText, keywords) {
  const lowered = acText.toLowerCase();
  for (const kw of keywords) {
    if (lowered.includes(kw.toLowerCase())) return kw;
  }
  return null;
}

function renderBody(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? String(vars[key]) : `{${key}}`));
}

function fetchIssue(issueNumber, execFn = execSync) {
  const raw = execFn(`gh pmu view ${issueNumber} --json=body,title`, { encoding: 'utf8' });
  return JSON.parse(raw);
}

function createSubIssue(parentIssue, title, bodyPath, execFn = execSync) {
  const cmd = `gh pmu sub create --parent ${parentIssue} --title ${JSON.stringify(title)} --label qa-required -F ${bodyPath}`;
  const raw = execFn(cmd, { encoding: 'utf8' });
  const m = raw.match(/#(\d+)/);
  if (!m) throw new Error(`gh pmu sub create output did not include a sub-issue number:\n${raw}`);
  return parseInt(m[1], 10);
}

function buildAnnotation(format, acText, subIssueNumber) {
  return format
    .replace('{acText}', acText)
    .replace('{subIssueNumber}', String(subIssueNumber));
}

function extract({ issueNumber, config, fetchFn, createFn, writeTemp, unlinkTemp, dryRun }) {
  const issue = fetchFn(issueNumber);
  const body = issue.body || '';
  const parentTitle = issue.title || '';
  const acs = extractUncheckedAcs(body);

  const matched = [];
  const skipped = [];
  const errors = [];

  for (const acText of acs) {
    const keyword = findMatchingKeyword(acText, config.keywords);
    if (!keyword) {
      skipped.push(acText);
      continue;
    }
    if (dryRun) {
      matched.push({ acText, keyword, subIssueNumber: null, annotation: null });
      continue;
    }
    try {
      const bodyText = renderBody(config.bodyTemplate, {
        acDescription: acText,
        parentIssue: issueNumber,
        parentTitle,
        steps: '(to be filled in during QA)',
        expectedResult: '(to be filled in during QA)'
      });
      const tmpPath = `.tmp-qa-body-${issueNumber}.md`;
      writeTemp(tmpPath, bodyText);
      try {
        const subIssueNumber = createFn(issueNumber, `QA: ${acText}`, tmpPath);
        const annotation = buildAnnotation(config.annotationFormat, acText, subIssueNumber);
        matched.push({ acText, keyword, subIssueNumber, annotation });
      } finally {
        unlinkTemp(tmpPath);
      }
    } catch (e) {
      errors.push({ acText, keyword, message: e.message });
    }
  }

  return { ok: errors.length === 0, issueNumber, matched, skipped, errors };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    process.stderr.write(args.error + '\n');
    process.exit(2);
  }
  try {
    const config = loadConfig();
    const result = extract({
      issueNumber: args.issue,
      config,
      fetchFn: (n) => fetchIssue(n),
      createFn: (p, t, b) => createSubIssue(p, t, b),
      writeTemp: (p, c) => fs.writeFileSync(p, c),
      unlinkTemp: (p) => { try { fs.unlinkSync(p); } catch { /* best-effort */ } },
      dryRun: args.dryRun
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
  } catch (e) {
    process.stderr.write(e.message + '\n');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  loadConfig,
  extractUncheckedAcs,
  findMatchingKeyword,
  renderBody,
  buildAnnotation,
  extract,
  fetchIssue
};
