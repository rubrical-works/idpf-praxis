#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.122.0
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
const { withFallback, fallbackReason, formatFallbackReport } = require('./subagent-fallback.js');

/**
 * The parent's flags, unchanged, with `--step-wise` present exactly once
 * (#3805): a dispatched reviewer never enters /review-issue's Step 3c resolve
 * pass. A flag the parent already passed keeps its position; otherwise
 * `--step-wise` is appended.
 *
 * @param {string[]} flags
 * @returns {string[]}
 */
function withStepWise(flags) {
  return flags.includes('--step-wise') ? [...flags] : [...flags, '--step-wise'];
}

/** The review mode framework-config.json declares, or the solo default with the reason it applied. */
function configReviewMode(root) {
  // The framework default is solo; a brief that fell back to it says why, so
  // a corrupt config never reads as a deliberate solo setting.
  try {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'framework-config.json'), 'utf8'));
    // Not an object is unreadable here too, as resolveBriefContext() treats it.
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('framework-config.json is not an object');
    return typeof config.reviewMode === 'string' ? config.reviewMode : 'solo (default — framework-config.json declares none)';
  } catch {
    return 'solo (default — framework-config.json could not be read)';
  }
}

/**
 * The Step 2b answers block (#3805). A reviewer has no AskUserQuestion, so the
 * parent asks the subjective questions and the brief carries the answers.
 * Solo mode asks none, so it embeds none — whatever was passed.
 */
function answerLines(reviewMode, answers) {
  if (!answers || /^solo\b/.test(reviewMode)) return [];
  const pairs = Array.isArray(answers)
    ? answers.map((a) => [a && a.criterion, a && a.answer])
    : Object.entries(answers);
  const items = pairs.filter(([c, a]) => c && a !== undefined && a !== null && a !== '');
  if (items.length === 0) return [];
  // A free-text answer (an AskUserQuestion "Other" reply) may hold line
  // breaks; each answer stays on its own bullet, so it can never read as a
  // top-level brief field such as `- Review mode:` or `- Flags:`.
  const oneLine = (v) => String(v).replace(/\s*[\r\n]+\s*/g, ' ').trim();
  return [
    '- Step 2b answers (asked by the parent; record them as userEvaluated, never re-ask):',
    ...items.map(([c, a]) => `  - ${oneLine(c)}: ${oneLine(a)}`),
  ];
}

/**
 * @param {object} input
 * @param {number} input.issue
 * @param {string} input.root          the project root
 * @param {string} [input.repo]        owner/name from .gh-pmu.json
 * @param {string[]} [input.flags]     the run's /review-issue flags, passed through
 * @param {string} [input.reviewMode]  the review mode the parent resolved; overrides framework-config.json
 * @param {object|Array<{criterion: string, answer: string}>} [input.answers]  Step 2b answers the parent asked; embedded outside solo mode only
 * @returns {{description: string, subagent_type: string, prompt: string, onNotFound?: string, specialistNotice: string|null, findingsPath: string}}
 */
function buildIssueReviewerRequest({ issue, root, repo, flags = [], reviewMode: resolvedMode, answers }) {
  const ctx = resolveBriefContext({ root });
  const reviewMode = typeof resolvedMode === 'string' && resolvedMode ? resolvedMode : configReviewMode(root);

  const lines = [
    `Review issue #${issue} through /review-issue Steps 1–3, as your definition (idpf-issue-reviewer) states, and reply with your JSON result.`,
    '',
    ...briefContextLines(ctx),
    `- Review mode: ${reviewMode}`,
    ...(repo ? [`- Repository: ${repo}`] : []),
    `- Flags: ${withStepWise(flags).join(' ')}`,
    ...answerLines(reviewMode, answers),
  ];
  const request = withFallback({ description: `Review issue #${issue}`, subagent_type: 'idpf-issue-reviewer', prompt: lines.join('\n') });
  // The reviewer's scratch is keyed by its one issue (rule 09 Step 3), so two
  // reviewers dispatched in one run never share a path (#3805). Carried beside
  // the request, not in the prompt, so /work's brief is unchanged.
  return { ...request, specialistNotice: ctx.notice, findingsPath: `.tmp-${issue}-findings.json` };
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

const REVIEWER_ROLE = 'idpf-issue-reviewer';
const REVIEWER_MODEL = 'sonnet';

/**
 * The spawn requests for a concurrent /review-issue run (#3805): one reviewer
 * per issue, each on Sonnet. With the `idpf-issue-reviewer` type absent, each
 * request is `general-purpose` with `model: "sonnet"` — the model the role
 * definition would have set — and `fallbackNotice` reports the fallback once
 * for the run, not per request. A typed request carries `model` too, so a
 * runtime not-found re-spawn (`subagent-fallback.js`) keeps it.
 *
 * @param {object} input
 * @param {number[]} input.issues
 * @param {string} input.root
 * @param {string} [input.repo]
 * @param {string[]} [input.flags]
 * @param {string} [input.reviewMode]
 * @param {object|Array<{criterion: string, answer: string}>} [input.answers]
 * @param {boolean} [input.typeAvailable]  defaults to whether the role's definition file is on disk
 * @returns {{requests: object[], fallbackNotice: string|null}}
 */
function planIssueReviewerDispatch({ issues, root, repo, flags = [], reviewMode, answers, typeAvailable }) {
  const available = typeof typeAvailable === 'boolean' ? typeAvailable : fallbackReason(REVIEWER_ROLE, root) === 'not-registered';
  const requests = [...new Set(issues)].map((issue) => {
    const request = { ...buildIssueReviewerRequest({ issue, root, repo, flags, reviewMode, answers }), model: REVIEWER_MODEL };
    if (available) return request;
    const { onNotFound, ...rest } = request;
    return { ...rest, subagent_type: 'general-purpose' };
  });
  const fallbackNotice = available ? null : formatFallbackReport([{ role: REVIEWER_ROLE, reason: fallbackReason(REVIEWER_ROLE, root) }]);
  return { requests, fallbackNotice };
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

module.exports = { buildIssueReviewerRequest, buildWorkReviewRequest, planIssueReviewerDispatch };
