#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.101.0
 * @description Classify an issue's review state for the /work review-state gate (#2577).
 * Returns exactly one of never-reviewed, findings-pending, reviewed-clean, or indeterminate,
 * reading the two signals the review subsystem already writes: the reviewed/pending labels
 * from review-finalize.js determineLabel(), and the `**Reviews:** N` body marker from
 * updateBodyReviewCount(). Emits a JSON verdict on stdout. Exits 0 on any classification
 * (indeterminate included — the gate fails open), 2 on bad arguments.
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const { execTimed } = require('./lib/exec.js');

/**
 * The four verdicts. Exactly one is returned per classification — the caller's
 * behavior matrix in the /work review-state gate is keyed on these values.
 */
const STATES = {
  NEVER_REVIEWED: 'never-reviewed',
  FINDINGS_PENDING: 'findings-pending',
  REVIEWED_CLEAN: 'reviewed-clean',
  INDETERMINATE: 'indeterminate'
};

function parseArgs(argv) {
  const out = { issue: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--issue' && argv[i + 1]) out.issue = parseInt(argv[++i], 10);
  }
  if (!out.issue || Number.isNaN(out.issue)) {
    return { error: 'Missing or invalid --issue <number> argument.' };
  }
  return out;
}

/**
 * Read the `**Reviews:** N` marker review-finalize.js writes into the issue body.
 *
 * Returns null — not 0 — when the body is unreadable. The distinction is
 * load-bearing: 0 means "readable body, no review recorded" (a genuine
 * never-reviewed signal), while null means "cannot tell" and must route to
 * indeterminate rather than being folded into never-reviewed.
 *
 * @param {string|null|undefined} body - Issue body
 * @returns {number|null} Review count, or null when the body is unreadable
 */
function parseReviewCount(body) {
  if (typeof body !== 'string') return null;
  const match = body.match(/\*\*Reviews:\*\*\s*(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function labelNames(labels) {
  if (!Array.isArray(labels)) return null;
  return labels.map(l => (typeof l === 'string' ? l : l && l.name)).filter(Boolean);
}

/**
 * Classify a single issue's review state.
 *
 * Labels are consulted before body metadata because they are the signal
 * review-finalize.js writes last and always: a body edit can fail after the
 * label lands, but not the reverse.
 *
 * @param {object} issue - Issue object with `labels` and `body`
 * @returns {{state: string, reason: string, signals: object}} Verdict
 */
function classifyReviewState(issue) {
  const indeterminate = (reason, signals) => ({
    state: STATES.INDETERMINATE,
    reason,
    signals: signals || { hasReviewedLabel: null, hasPendingLabel: null, reviewCount: null }
  });

  if (!issue || typeof issue !== 'object') {
    return indeterminate('Issue data absent or not an object.');
  }

  const names = labelNames(issue.labels);
  if (names === null) {
    return indeterminate('Issue labels missing or not an array.');
  }

  const hasReviewedLabel = names.includes('reviewed');
  const hasPendingLabel = names.includes('pending');
  const reviewCount = parseReviewCount(issue.body);
  const signals = { hasReviewedLabel, hasPendingLabel, reviewCount };

  // review-finalize.js adds one review label while removing the other, so both
  // present means a writer outside the review path set one of them.
  if (hasReviewedLabel && hasPendingLabel) {
    return indeterminate('Contradictory labels: both `reviewed` and `pending` present.', signals);
  }

  if (hasPendingLabel) {
    return {
      state: STATES.FINDINGS_PENDING,
      reason: 'Label `pending` — a review completed with findings still unresolved.',
      signals
    };
  }

  if (hasReviewedLabel) {
    return {
      state: STATES.REVIEWED_CLEAN,
      reason: 'Label `reviewed` — a review completed with no unresolved findings.',
      signals
    };
  }

  if (reviewCount === null) {
    return indeterminate('Issue body unreadable and no review label present.', signals);
  }

  if (reviewCount > 0) {
    // The body records a review; the labels cannot say whether it left
    // findings. Picking either state would be wrong roughly half the time.
    return indeterminate(
      `Body records ${reviewCount} review(s) but carries no \`reviewed\`/\`pending\` label.`,
      signals
    );
  }

  return {
    state: STATES.NEVER_REVIEWED,
    reason: 'No review label and no `**Reviews:**` marker — never reviewed.',
    signals
  };
}

function fetchIssue(issueNumber, execFn = execTimed) {
  const raw = execFn(`gh issue view ${issueNumber} --json=number,labels,body`, {
    encoding: 'utf8'
  });
  return JSON.parse(typeof raw === 'string' ? raw : String(raw));
}

/**
 * Fetch and classify. Never throws: a fetch or parse failure is reported as
 * indeterminate with a warning, so a GitHub outage degrades the gate to
 * "proceed" rather than blocking work (the fail-open choice, AC9 of #2577).
 */
function run(issueNumber, execFn = execTimed) {
  const warnings = [];
  let issue = null;

  try {
    issue = fetchIssue(issueNumber, execFn);
  } catch (e) {
    warnings.push(`Could not read issue #${issueNumber}: ${e.message}`);
  }

  const verdict = issue
    ? classifyReviewState(issue)
    : {
      state: STATES.INDETERMINATE,
      reason: 'Issue could not be read.',
      signals: { hasReviewedLabel: null, hasPendingLabel: null, reviewCount: null }
    };

  return {
    ok: true,
    issue: issueNumber,
    state: verdict.state,
    reason: verdict.reason,
    signals: verdict.signals,
    warnings
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    process.stderr.write(args.error + '\n');
    process.exit(2);
  }
  process.stdout.write(JSON.stringify(run(args.issue), null, 2) + '\n');
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  STATES,
  parseArgs,
  parseReviewCount,
  labelNames,
  classifyReviewState,
  fetchIssue,
  run
};
