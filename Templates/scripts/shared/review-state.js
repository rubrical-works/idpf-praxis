#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.120.0
 * @description Classify an issue's review state for the /work review-state gate (#2577).
 * Returns exactly one of never-reviewed, findings-pending, reviewed-clean, stale-reviewed (#3543) or indeterminate,
 * reading the two signals the review subsystem already writes: the reviewed/pending labels
 * from review-finalize.js determineLabel(), and the `**Reviews:** N` body marker from
 * updateBodyReviewCount(). Emits a JSON verdict on stdout. Exits 0 on any classification
 * (indeterminate included — the gate fails open), 2 on bad arguments.
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const { execTimed } = require('./lib/exec.js');
const {
  REVIEWS_MARKER_PATTERN,
  REVIEW_HEADER_PATTERN,
  MALFORMED_REVIEW_HEADER_PATTERN,
  REVIEW_TYPES,
  RECOMMENDATION_PATTERN,
} = require('./lib/review-format.js');

const { computeReviewHash, readReviewHash } = require('./lib/review-body-hash.js');
const { validateIssueNumber } = require('./lib/input-validation.js');

/**
 * The five verdicts. Exactly one is returned per classification — the caller's
 * behavior matrix in the /work review-state gate is keyed on these values.
 * `stale-reviewed` (#3543): a `reviewed` label whose recorded body hash no
 * longer matches the body — the issue was rewritten after its review.
 */
const STATES = {
  NEVER_REVIEWED: 'never-reviewed',
  FINDINGS_PENDING: 'findings-pending',
  REVIEWED_CLEAN: 'reviewed-clean',
  STALE_REVIEWED: 'stale-reviewed',
  INDETERMINATE: 'indeterminate'
};

function parseArgs(argv) {
  let raw = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--issue' && argv[i + 1]) raw = argv[++i];
  }
  // #3668: validateIssueNumber, not parseInt — '12abc' and '-5' reached the
  // relabel write (`gh issue edit ${issueNumber}`) as 12 and -5.
  try {
    return { issue: validateIssueNumber(raw === null ? NaN : raw) };
  } catch {
    return { error: 'Missing or invalid --issue <number> argument.' };
  }
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
  // Standalone marker line only (#2880). A quoted marker read as a recorded
  // review let a bare `reviewed` label classify reviewed-clean, defeating
  // #2869's rule that a label with no marker counts for nothing.
  const match = body.match(REVIEWS_MARKER_PATTERN);
  return match ? parseInt(match[1], 10) : 0;
}

// ─── Review comments (moved from resolve-preamble.js, #3632) ───
// review-state.js reads the latest review's recommendation to tell a stale
// issue relabeled `pending` from a findings-pending one, and resolve-preamble.js
// requires this file for the same check — so the parsers live here, once.

/**
 * The highest-numbered review comment.
 * @param {Array<{body: string}>} comments
 * @returns {{found: boolean, malformed?: boolean, reviewType?: string, reviewNumber?: number, body?: string}}
 */
function findLatestReview(comments) {
  if (!comments || comments.length === 0) {
    return { found: false };
  }

  let latest = null;
  let malformedFound = false;

  for (const comment of comments) {
    const body = comment && typeof comment.body === 'string' ? comment.body : '';
    const match = body.match(REVIEW_HEADER_PATTERN);
    if (match) {
      const rawType = match[1];
      const reviewNumber = parseInt(match[2], 10);
      const reviewType = REVIEW_TYPES[rawType] || rawType.toLowerCase();

      if (!latest || reviewNumber > latest.reviewNumber) {
        latest = { found: true, reviewType, reviewNumber, body };
      }
    } else if (body.match(MALFORMED_REVIEW_HEADER_PATTERN)) {
      // Track malformed reviews — only report if no well-formed review found
      malformedFound = true;
    }
  }

  if (!latest && malformedFound) {
    return { found: true, malformed: true };
  }

  return latest || { found: false };
}

/**
 * The `### Recommendation` line of a review comment body.
 * @param {string} body
 * @returns {{recommendation: string|null, reason: string|null}}
 */
function extractRecommendation(body) {
  const recIdx = body.indexOf('### Recommendation');
  if (recIdx === -1) {
    return { recommendation: null, reason: null };
  }

  const recSection = body.slice(recIdx);
  const match = recSection.match(RECOMMENDATION_PATTERN);
  if (match) {
    return { recommendation: match[1], reason: match[2] || null };
  }

  return { recommendation: null, reason: null };
}

/**
 * The latest review comment's recommendation, or null when comments are
 * absent or carry no well-formed review.
 * @param {Array<{body: string}>|undefined} comments
 * @returns {string|null}
 */
function latestReviewRecommendation(comments) {
  if (!Array.isArray(comments)) return null;
  const latest = findLatestReview(comments);
  if (!latest.found || latest.malformed) return null;
  return extractRecommendation(latest.body).recommendation;
}

function labelNames(labels) {
  if (!Array.isArray(labels)) return null;
  return labels.map(l => (typeof l === 'string' ? l : l && l.name)).filter(Boolean);
}

/**
 * Classify a single issue's review state.
 *
 * Labels are consulted first because they are the signal review-finalize.js
 * writes last and always. A `pending` label decides on its own — it only ever
 * makes the gate stricter. A `reviewed` label decides only when the body's
 * `**Reviews:** N` marker corroborates it (#2869): the two are written in one
 * finalize run, so a label with no marker was not written by a review.
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
    // A stale issue relabelStale() swapped to `pending` (#3632): the body has
    // moved past the recorded hash and the latest review recommended Ready,
    // so no finding is outstanding — it still needs the re-review
    // `stale-reviewed` gets, not the resolve offer `findings-pending` gets.
    // Without comments the recommendation is unknown and `pending` decides.
    const latestRecommendation = latestReviewRecommendation(issue.comments);
    if (typeof latestRecommendation === 'string' && latestRecommendation.startsWith('Ready')) {
      const recorded = readReviewHash(issue.body);
      if (recorded !== null && recorded !== computeReviewHash(issue.body)) {
        return {
          state: STATES.STALE_REVIEWED,
          reason: 'Label `pending` from a stale-review relabel: the latest review recommended Ready, but the body has changed since — re-review before work.',
          signals: { ...signals, hashRecorded: true, hashMatches: false, latestRecommendation, relabeled: true },
          warnings: []
        };
      }
      // The same relabel, with the body edited back to the text the Ready
      // review hashed (#3666): no finding is outstanding and nothing in the
      // body is new, so it is reviewed-clean. review-finalize.js never writes
      // `pending` beside a Ready recommendation, so this is the stale swap,
      // and `restoreReviewed` asks classifyAndRelabel to swap it back.
      if (recorded !== null) {
        return {
          state: STATES.REVIEWED_CLEAN,
          reason: 'Label `pending` from a stale-review relabel, but the body matches the hash the Ready review recorded again — reviewed, no unresolved findings.',
          signals: { ...signals, hashRecorded: true, hashMatches: true, latestRecommendation, restoreReviewed: true },
          warnings: []
        };
      }
    }
    return {
      state: STATES.FINDINGS_PENDING,
      reason: 'Label `pending` — a review completed with findings still unresolved.',
      signals
    };
  }

  if (hasReviewedLabel) {
    // A `reviewed` label is trusted only when the body corroborates it (#2869).
    // review-finalize.js writes the `**Reviews:** N` marker and the label in
    // the same run, so a label with no marker behind it was written by
    // something other than a recorded review — until #2869, the epic
    // propagation block stamping the epic's verdict onto every child. Read
    // as reviewed-clean, that label passed the /work gate silently on stories
    // nobody had reviewed. It is never-reviewed rather than indeterminate
    // because indeterminate fails open and never prompts, which reproduces
    // the symptom under a different name. An unreadable body stays
    // indeterminate: "cannot tell" is not "never".
    if (reviewCount === null) {
      return indeterminate('Label `reviewed` present but the issue body is unreadable.', signals);
    }
    if (reviewCount === 0) {
      return {
        state: STATES.NEVER_REVIEWED,
        reason: 'Label `reviewed` with no `**Reviews:**` marker — the label was written without a recorded review, so it counts for nothing.',
        signals
      };
    }
    // The body hash the review recorded (#3543). A mismatch means the body was
    // rewritten after the review — new criteria, a changed design — which the
    // label alone cannot show. No marker is a review from before the hash
    // existed: reviewed-clean with an `unhashed` warning, so every existing
    // issue does not turn stale at once.
    const recorded = readReviewHash(issue.body);
    const hashMatches = recorded === null ? null : recorded === computeReviewHash(issue.body);
    const hashed = { ...signals, hashRecorded: recorded !== null, hashMatches };
    if (hashMatches === false) {
      return {
        state: STATES.STALE_REVIEWED,
        reason: 'Label `reviewed`, but the body has changed since the review recorded its hash — re-review before work.',
        signals: hashed,
        warnings: []
      };
    }
    // The latest recommendation rides along (#3637): `reviewed` is earned by
    // any "Ready…" recommendation, but /review-prd withholds the PRD reviewed
    // box from "Ready with minor revisions", and create-backlog-review-gate.js
    // needs the string to tell that from a failed box write. Null when the
    // comments are absent or carry no well-formed review.
    return {
      state: STATES.REVIEWED_CLEAN,
      reason: 'Label `reviewed` — a review completed with no unresolved findings.',
      signals: { ...hashed, latestRecommendation: latestReviewRecommendation(issue.comments) },
      warnings: recorded === null ? ['unhashed'] : []
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

/**
 * Make a stale review visible where people and label readers look (#3632):
 * for a `stale-reviewed` verdict on an issue carrying `reviewed`, remove
 * `reviewed` and add `pending`. Any other verdict, or a stale issue already
 * carrying `pending` from an earlier swap, makes no call. Never throws — a
 * failed swap comes back as `warning`, and the caller's verdict is unchanged.
 * A relabel is not a review verdict and announces nothing.
 *
 * @param {number} issueNumber
 * @param {{state: string, signals?: object}} verdict - classifyReviewState() result
 * @param {Function} [execFn]
 * @returns {{swapped: boolean, removed?: string, added?: string, alreadyPending?: boolean, warning: string|null}}
 */
function relabelStale(issueNumber, verdict, execFn = execTimed) {
  if (!verdict || verdict.state !== STATES.STALE_REVIEWED) return { swapped: false, warning: null };
  const signals = verdict.signals || {};
  if (signals.hasPendingLabel) return { swapped: false, alreadyPending: true, warning: null };
  if (!signals.hasReviewedLabel) return { swapped: false, warning: null };
  try {
    execFn(`gh issue edit ${issueNumber} --remove-label reviewed --add-label pending`, { encoding: 'utf8' });
    return { swapped: true, removed: 'reviewed', added: 'pending', warning: null };
  } catch (e) {
    return {
      swapped: false,
      warning: `Could not relabel stale-reviewed #${issueNumber} from \`reviewed\` to \`pending\`: ${e.message}`
    };
  }
}

/**
 * Undo a stale-review relabel whose cause is gone (#3666): for a verdict
 * flagged `restoreReviewed`, remove `pending` and add `reviewed` back. Any
 * other verdict makes no call. Never throws — a failed swap comes back as
 * `warning`, and the caller's verdict is unchanged.
 *
 * @param {number} issueNumber
 * @param {{state: string, signals?: object}} verdict - classifyReviewState() result
 * @param {Function} [execFn]
 * @returns {{swapped: boolean, removed?: string, added?: string, warning: string|null}}
 */
function restoreReviewed(issueNumber, verdict, execFn = execTimed) {
  if (!verdict || !verdict.signals || !verdict.signals.restoreReviewed) return { swapped: false, warning: null };
  try {
    execFn(`gh issue edit ${issueNumber} --remove-label pending --add-label reviewed`, { encoding: 'utf8' });
    return { swapped: true, removed: 'pending', added: 'reviewed', warning: null };
  } catch (e) {
    return {
      swapped: false,
      warning: `Could not restore #${issueNumber} from \`pending\` to \`reviewed\`: ${e.message}`
    };
  }
}

function fetchIssue(issueNumber, execFn = execTimed) {
  // `comments` lets classifyReviewState recognize a relabeled stale issue (#3632).
  const raw = execFn(`gh issue view ${issueNumber} --json=number,labels,body,comments`, {
    encoding: 'utf8'
  });
  return JSON.parse(typeof raw === 'string' ? raw : String(raw));
}

/**
 * Read the issue, never throwing: a fetch or parse failure comes back as a
 * null issue with a warning.
 */
function tryFetch(issueNumber, execFn) {
  try {
    return { issue: fetchIssue(issueNumber, execFn), warnings: [] };
  } catch (e) {
    return { issue: null, warnings: [`Could not read issue #${issueNumber}: ${e.message}`] };
  }
}

const UNREADABLE_VERDICT = Object.freeze({
  state: STATES.INDETERMINATE,
  reason: 'Issue could not be read.',
  signals: { hasReviewedLabel: null, hasPendingLabel: null, reviewCount: null }
});

function envelope(issueNumber, verdict, warnings) {
  return {
    ok: true,
    issue: issueNumber,
    state: verdict.state,
    reason: verdict.reason,
    signals: verdict.signals,
    warnings: [...warnings, ...(verdict.warnings || [])]
  };
}

/**
 * Fetch and classify. Never throws: a fetch or parse failure is reported as
 * indeterminate with a warning, so a GitHub outage degrades the gate to
 * "proceed" rather than blocking work (the fail-open choice, AC9 of #2577).
 */
function run(issueNumber, execFn = execTimed) {
  const { issue, warnings } = tryFetch(issueNumber, execFn);
  return envelope(issueNumber, issue ? classifyReviewState(issue) : UNREADABLE_VERDICT, warnings);
}

/**
 * The one classify-and-relabel rule (#3666) — the command line, the /work
 * preamble and the tree review gate all call it, so the three cannot drift.
 * Classify the issue; a stale-reviewed verdict is relabeled reviewed → pending,
 * and a reverted relabel (restoreReviewed) pending → reviewed, through `execFn`. `relabel` is the swap result, or null when the verdict
 * calls for none. Called through module.exports so tests can observe it.
 *
 * @param {object} issue - Issue object with `number`, `labels`, `body` (and `comments`)
 * @param {Function} [execFn]
 * @returns {{verdict: object, relabel: object|null}}
 */
function classifyAndRelabel(issue, execFn = execTimed) {
  const verdict = classifyReviewState(issue);
  const number = issue && issue.number;
  if (verdict.state === STATES.STALE_REVIEWED) {
    return { verdict, relabel: module.exports.relabelStale(number, verdict, execFn) };
  }
  if (verdict.signals && verdict.signals.restoreReviewed) {
    return { verdict, relabel: module.exports.restoreReviewed(number, verdict, execFn) };
  }
  return { verdict, relabel: null };
}

/**
 * The command line's call: fetch, then classifyAndRelabel (#3632, #3666).
 * `relabel` is the swap made, or null when none was called for; a failed
 * swap joins `warnings` and changes nothing else.
 */
function runAndRelabel(issueNumber, execFn = execTimed) {
  const { issue, warnings } = tryFetch(issueNumber, execFn);
  if (!issue) return { ...envelope(issueNumber, UNREADABLE_VERDICT, warnings), relabel: null };
  const { verdict, relabel } = module.exports.classifyAndRelabel({ ...issue, number: issueNumber }, execFn);
  const out = envelope(issueNumber, verdict, warnings);
  return {
    ...out,
    relabel,
    warnings: relabel && relabel.warning ? [...out.warnings, relabel.warning] : out.warnings
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    process.stderr.write(args.error + '\n');
    process.exit(2);
  }
  process.stdout.write(JSON.stringify(runAndRelabel(args.issue), null, 2) + '\n');
  process.exit(0);
}

module.exports = {
  STATES,
  parseArgs,
  parseReviewCount,
  labelNames,
  classifyReviewState,
  findLatestReview,
  extractRecommendation,
  latestReviewRecommendation,
  relabelStale,
  restoreReviewed,
  classifyAndRelabel,
  fetchIssue,
  run,
  runAndRelabel
};

// After the exports (#3680): runAndRelabel calls module.exports.classifyAndRelabel,
// which is still the empty default object if main() runs above this assignment.
if (require.main === module) main();
