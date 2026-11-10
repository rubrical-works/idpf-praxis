#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.117.0
 * @description Build the spawn request for one idpf-issue-reviewer: specialist, domains and absolute frameworkPath in the brief (#3501)
 *
 * Concurrent /review-issue (#3199) dispatches one reviewer per issue. A
 * reviewer gets no SessionStart context, so without this its review would run
 * without the project's specialist — reviewing #42 with different expertise
 * than `/review-issue 42` in the session, with nothing reporting it. The brief
 * carries the same project context every framework brief does
 * (`specialist-resolver.js` `resolveBriefContext()`), resolved at spawn time.
 *
 * The request is typed `idpf-issue-reviewer` and carries the #3500 not-found
 * step. `specialistNotice` is returned beside the request for the parent to
 * report once per run when no specialist could be used.
 *
 * Runtime dependencies: Node built-ins only.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { resolveBriefContext, briefContextLines } = require('./specialist-resolver.js');
const { withFallback } = require('./subagent-fallback.js');

/**
 * @param {object} input
 * @param {number} input.issue
 * @param {string} input.root          the project root
 * @param {string} [input.repo]        owner/name from .gh-pmu.json
 * @param {string[]} [input.flags]     the run's /review-issue flags, passed through
 * @returns {{description: string, subagent_type: string, prompt: string, onNotFound?: string, specialistNotice: string|null}}
 */
function buildIssueReviewerRequest({ issue, root, repo, flags = [] }) {
  const ctx = resolveBriefContext({ root });
  // The framework default is solo; a brief that fell back to it says why, so
  // a corrupt config never reads as a deliberate solo setting.
  let reviewMode = 'solo (default — framework-config.json declares none)';
  try {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'framework-config.json'), 'utf8'));
    // Not an object is unreadable here too, as resolveBriefContext() treats it.
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('framework-config.json is not an object');
    if (typeof config.reviewMode === 'string') reviewMode = config.reviewMode;
  } catch {
    reviewMode = 'solo (default — framework-config.json could not be read)';
  }

  const lines = [
    `Review issue #${issue} through /review-issue Steps 1–3, as your definition (idpf-issue-reviewer) states, and reply with your JSON result.`,
    '',
    ...briefContextLines(ctx),
    `- Review mode: ${reviewMode}`,
    ...(repo ? [`- Repository: ${repo}`] : []),
    `- Flags: ${flags.length ? flags.join(' ') : 'none'}`,
  ];
  const request = withFallback({ description: `Review issue #${issue}`, subagent_type: 'idpf-issue-reviewer', prompt: lines.join('\n') });
  return { ...request, specialistNotice: ctx.notice };
}

/**
 * The request `/work` spawns to review an issue before its first AC (#3537).
 * Always `--step-wise`: the review returns `pending` instead of opening
 * /review-issue's Step 3c resolve pass inside `/work`, and `/work` decides what
 * follows. A stale-reviewed issue adds `--force`, since its `reviewed` label
 * would otherwise early-exit the preamble.
 *
 * @param {{ issue: number, root: string, repo?: string, stale?: boolean }} input
 */
function buildWorkReviewRequest({ issue, root, repo, stale = false }) {
  const flags = stale ? ['--force', '--step-wise'] : ['--step-wise'];
  return buildIssueReviewerRequest({ issue, root, repo, flags });
}

function readRepo(root) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.gh-pmu.json'), 'utf8'));
    const repo = (cfg.repositories || [])[0];
    return typeof repo === 'string' ? repo : undefined;
  } catch {
    return undefined;
  }
}

/** CLI: `--issue N [--stale]` → `{ ok, request }` — the /work review step's spawn request. */
function main(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--issue');
  const issue = i !== -1 ? Number(argv[i + 1]) : NaN;
  if (!Number.isInteger(issue) || issue < 1) {
    process.stdout.write(JSON.stringify({ ok: false, error: 'Usage: issue-reviewer-brief.js --issue <N> [--stale]' }) + '\n');
    process.exit(1);
  }
  const root = process.cwd();
  const request = buildWorkReviewRequest({ issue, root, repo: readRepo(root), stale: argv.includes('--stale') });
  process.stdout.write(JSON.stringify({ ok: true, request }, null, 2) + '\n');
}

if (require.main === module) main();

module.exports = { buildIssueReviewerRequest, buildWorkReviewRequest };
