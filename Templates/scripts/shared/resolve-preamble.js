#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.117.0
 * @description Consolidate /resolve-review setup into a single script call. Parses review comments from the issue, extracts individual findings with severity and status, classifies each as auto-fixable or requiring user input, reports the issue's type so an epic can be expanded, and returns structured envelope for LLM-driven resolution.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const {
  EMOJI,
  SECTION_HEADERS,
  REVIEW_HEADER_PATTERN,
  MALFORMED_REVIEW_HEADER_PATTERN,
  REVIEW_TYPES,
  FINDING_LINE_PATTERN,
  RECOMMENDATION_PATTERN,
  FINDING_ID_PATTERN,
} = require('./lib/review-format');
const { repairEntry } = require('./lib/review-repair.js');
const fs = require('fs');
const path = require('path');
const { getIssueType, REDIRECT_LABELS } = require('./lib/issue-type.js');
const { normalizeEol } = require('./lib/normalize-eol.js');

// ─── Argument Parsing ───

function parseArgs(args) {
  if (!args || args.length === 0) {
    return { error: { code: 'MISSING_ARGUMENT', message: 'No issue number provided. Usage: node resolve-preamble.js <issue>' } };
  }

  const cleaned = args[0].replace(/^#/, '');
  const num = parseInt(cleaned, 10);
  if (isNaN(num) || num <= 0) {
    return { error: { code: 'INVALID_ARGUMENT', message: `Invalid issue number: ${args[0]}` } };
  }

  // Flag-shaped tokens after the issue number are collected and reported,
  // never fatal and never silently dropped (#3545) — the review-preamble.js
  // contract and 02-github-workflow.md's pass-through convention, so a
  // `--step-wise` passed here is visible rather than lost.
  const unrecognizedFlags = args.slice(1).filter((a) => /^--[A-Za-z]/.test(a));
  const result = { issue: num };
  if (unrecognizedFlags.length > 0) result.unrecognizedFlags = unrecognizedFlags;
  return result;
}

/** Put the parsed `unrecognizedFlags` on the envelope — always an array. */
function reportUnrecognizedFlags(envelope, args) {
  envelope.unrecognizedFlags = (args && args.unrecognizedFlags) || [];
  return envelope;
}

// ─── Issue Type (#2872) ───

/**
 * The issue's type, from the classifier review-preamble.js uses.
 *
 * `/resolve-review <epic>` has to expand the epic into its children before any
 * finding is classified, and it could not: this script read comments only, so
 * an epic looked like any other issue and only its own comment was resolved.
 *
 * Same source and same fallback as review-preamble.js — `getIssueType`, then a
 * redirect label's own name, then `generic` — so the two halves of one review
 * cycle cannot disagree about what an issue is. A second classifier here is
 * how they would.
 *
 * @param {{labels?: Array<{name: string}>}} issueData
 * @returns {string}
 */
function resolveIssueType(issueData) {
  const data = issueData && typeof issueData === 'object' ? issueData : {};
  const { type } = getIssueType(data);
  if (type) return type;
  const redirect = (data.labels || [])
    .map((l) => (l && l.name) || '')
    .find((name) => Object.prototype.hasOwnProperty.call(REDIRECT_LABELS, name));
  return redirect || 'generic';
}

// ─── Review Comment Matching ───

function findLatestReview(comments) {
  if (!comments || comments.length === 0) {
    return { found: false };
  }

  let latest = null;
  let malformedFound = false;

  for (const comment of comments) {
    const match = comment.body.match(REVIEW_HEADER_PATTERN);
    if (match) {
      const rawType = match[1];
      const reviewNumber = parseInt(match[2], 10);
      const reviewType = REVIEW_TYPES[rawType] || rawType.toLowerCase();

      if (!latest || reviewNumber > latest.reviewNumber) {
        latest = { found: true, reviewType, reviewNumber, body: comment.body };
      }
    } else if (comment.body.match(MALFORMED_REVIEW_HEADER_PATTERN)) {
      // Track malformed reviews — only report if no well-formed review found
      malformedFound = true;
    }
  }

  if (!latest && malformedFound) {
    return { found: true, malformed: true };
  }

  return latest || { found: false };
}

// ─── Finding Parsing ───

/**
 * Map a finding emoji to its status. An unmapped emoji is `'unknown'`, never
 * `'skip'` (#2989): skip no longer reaches the user, so a skip fallback would
 * silently drop any line the parser cannot map, where `'unknown'` still routes
 * to needsUserInput. Unreachable while FINDING_LINE_PATTERN matches only the
 * four mapped emoji; this keeps it safe if the two ever drift.
 */
function statusForEmoji(emoji) {
  const emojiToStatus = {
    [EMOJI.pass]: 'pass',
    [EMOJI.fail]: 'fail',
    [EMOJI.warn]: 'warn',
    [EMOJI.skip]: 'skip',
  };
  return emojiToStatus[emoji] || 'unknown';
}

function parseFindings(body) {
  const findings = [];
  // A CRLF comment would leave `\r` before FINDING_LINE_PATTERN's `$` (#3064).
  const lines = normalizeEol(body).split('\n');

  for (const line of lines) {
    const match = line.match(FINDING_LINE_PATTERN);
    if (match) {
      const emoji = match[1];
      const criterion = match[2];
      const status = statusForEmoji(emoji);
      // The criterion id finalize appends as a hidden marker (#3544).
      const idMatch = match[3].match(FINDING_ID_PATTERN);
      const evidence = idMatch ? match[3].replace(FINDING_ID_PATTERN, '').trimEnd() : match[3];

      const finding = { status, criterion, evidence };
      if (idMatch) finding.id = idMatch[1];
      findings.push(finding);
    }
  }

  return findings;
}

// ─── Suggestions (#2717) ───

/**
 * Read the `### Suggestions` section back out of a review comment.
 *
 * Suggestions are findings that are NOT criteria: free text, no `status`, no
 * criterion id. Before #2717 `review-finalize.js` discarded them at write time;
 * surfacing them here is the other half, because rendering alone still leaves
 * the resolve cycle blind — a suggestion-only defect passed through
 * `/resolve-review` untouched and emerged under a clean "Ready for work".
 *
 * **Not a fourth classification, deliberately.** `classifyFindings` sorts on
 * `f.status`, derived from the finding emoji. Suggestions have no status, so
 * placing them in autoFixable / needsUserInput / passed would mean inventing
 * one — and its `warn, skip, or unknown` fallback would silently swallow them
 * into needsUserInput, asserting a severity nobody expressed. They travel as a
 * sibling key that `/resolve-review` reports and never auto-applies.
 *
 * Bounded by the next `###` heading rather than by a blank line: the section is
 * rendered with a blank line after its heading, so a blank-line terminator
 * would return nothing at all.
 *
 * @param {string} body - Review comment body
 * @returns {string[]} Suggestion strings in document order; `[]` when the
 *   section is absent or empty.
 */
function parseSuggestions(body) {
  if (typeof body !== 'string') return [];
  const lines = normalizeEol(body).split('\n');
  const start = lines.findIndex((l) => l.trim() === SECTION_HEADERS.suggestions);
  if (start === -1) return [];

  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{2,4}\s/.test(line.trim())) break;   // next section
    const m = line.match(/^-\s+(.*\S)\s*$/);
    // Emoji-prefixed lines are criteria findings, never suggestions. They
    // cannot appear inside this section as rendered, but a hand-edited comment
    // is not guaranteed to respect that.
    if (m && !FINDING_LINE_PATTERN.test(line)) out.push(m[1]);
  }
  return out;
}

// ─── Recommendation Extraction ───

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

// ─── Classification ───

function slugify(criterion) {
  return criterion
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Display name → criterion id, from the criteria metadata (#3544). Names are
 * compared lower-cased with punctuation dropped, so "AC present and testable?"
 * finds `ac-present-testable` where its slug never could. Built once; a
 * missing file contributes nothing.
 */
let _namesToIds = null;
function nameKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function criterionNameIndex(root = process.cwd()) {
  if (_namesToIds) return _namesToIds;
  const index = new Map();
  const read = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); } catch { return null; } };
  const typeSpecific = (read('.claude/metadata/review-criteria.json') || {}).typeSpecific || {};
  for (const t of Object.values(typeSpecific)) {
    for (const c of t.criteria || []) if (c && c.id && c.name) index.set(nameKey(c.name), c.id);
  }
  const common = (read('.claude/metadata/review-mode-criteria.json') || {}).criteria || {};
  for (const [id, c] of Object.entries(common)) if (c && c.name) index.set(nameKey(c.name), id);
  _namesToIds = index;
  return index;
}

/** The finding's criterion id: its marker, else its metadata name, else its slug. */
function resolveCriterionId(f) {
  if (f.id) return f.id;
  return criterionNameIndex().get(nameKey(f.criterion)) || slugify(f.criterion);
}

const ISSUE_TYPES = new Set(['bug', 'enhancement', 'story', 'epic', 'generic']);

/**
 * Sort findings into passed / autoFixable / needsUserInput. The bucket is
 * decided by the shared repair data (`review-repair.js` `repairEntry`, #3544)
 * from the criterion **id**, for warn and fail alike — never from a slug of
 * the display name, which drifts between reviews. Only a `preFinalize: true`
 * entry is auto-fixable; a `preFinalize: false` one is user input carrying
 * `repair: { kind, description }` (#3548).
 *
 * @param {object[]} findings
 * @param {{ type?: string }} [ctx] - the issue type, when known, filters entries
 */
function classifyFindings(findings, ctx = {}) {
  const passed = [];
  const autoFixable = [];
  const needsUserInput = [];
  const type = ISSUE_TYPES.has(ctx.type) ? ctx.type : undefined;

  for (const raw of findings) {
    const f = { ...raw, id: resolveCriterionId(raw) };
    // skip joins pass (#2989): a ⊘ is a deliberate no-action — the prior-art
    // `recommend` advisory, a `flag-only`/`off` opt-out, a pre-feature
    // `not-applicable` — so asking the user to resolve it is a question that
    // declining cannot answer. `passed` rather than a fourth bucket, following
    // #2717's precedent: nothing downstream distinguishes skip from pass, and a
    // new bucket would need a reader it does not have.
    const entry = (f.status === 'fail' || f.status === 'warn') ? repairEntry(f.id, { type }) : null;
    if (f.status === 'pass' || f.status === 'skip') {
      passed.push(f);
    } else if (entry && entry.preFinalize) {
      // A deterministic repair (priority, Depends on, Deployment Impact).
      autoFixable.push(f);
    } else if (entry) {
      // #3548: a content repair (preFinalize: false) needs content only the
      // user can approve — a decision, not an auto-fix. It is asked in Pass 2,
      // carrying the entry's description to shape the suggested change.
      needsUserInput.push({ ...f, repair: { kind: entry.kind, description: entry.description } });
    } else {
      // a non-repairable warn/fail, or an unknown status → needs user input
      needsUserInput.push(f);
    }
  }

  return { passed, autoFixable, needsUserInput };
}

// ─── Envelope Builders ───

function buildSuccessEnvelope(reviewInfo, classified, _findings, suggestions, issueType) {
  return {
    ok: true,
    version: 1,
    context: {
      reviewType: reviewInfo.reviewType,
      reviewNumber: reviewInfo.reviewNumber,
      // Always present (#2872): `generic` when unknown, never an absent key —
      // the same reasoning as `suggestions` below.
      type: typeof issueType === 'string' && issueType ? issueType : 'generic',
    },
    findings: classified,
    // Sibling of `findings`, not a member of it (#2717): these are
    // unclassified by construction. ALWAYS present, empty array included — an
    // absent key is indistinguishable from a producer that forgot to set it,
    // which is the exact shape of the defect this issue fixed.
    suggestions: Array.isArray(suggestions) ? suggestions : [],
    errors: [],
  };
}

function buildErrorEnvelope(errors) {
  return {
    ok: false,
    errors: Array.isArray(errors) ? errors : [errors],
  };
}

// ─── Main ───

async function main() {
  // Spawns bounded via lib/exec.js (#2469).
  const { execTimedAsync: execAsync } = require('./lib/exec.js');

  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    process.stdout.write(JSON.stringify(buildErrorEnvelope([args.error]), null, 2) + '\n');
    process.exit(1);
  }

  const { issue } = args;

  // Fetch comments and labels in one call — labels decide the type (#2872).
  let comments;
  let issueType;
  try {
    const { stdout } = await execAsync(
      `gh issue view ${issue} --json comments,labels`,
      { encoding: 'utf-8' }
    );
    const data = JSON.parse(stdout.trim());
    comments = data.comments || [];
    issueType = resolveIssueType(data);
  } catch (e) {
    process.stdout.write(JSON.stringify(buildErrorEnvelope([{
      code: 'FETCH_FAILED',
      message: `Failed to fetch comments for issue #${issue}: ${e.message}`,
    }]), null, 2) + '\n');
    process.exit(1);
  }

  // Find latest review
  const reviewResult = findLatestReview(comments);
  if (!reviewResult.found) {
    process.stdout.write(JSON.stringify(buildErrorEnvelope([{
      code: 'NO_REVIEW',
      message: `No review comments found on issue #${issue}`,
    }]), null, 2) + '\n');
    process.exit(1);
  }

  if (reviewResult.malformed) {
    process.stdout.write(JSON.stringify(buildErrorEnvelope([{
      code: 'MALFORMED_REVIEW',
      message: `Issue #${issue} has a malformed review comment (undefined values in header). Re-run /review-issue --force to generate a valid review.`,
    }]), null, 2) + '\n');
    process.exit(1);
  }

  // Parse findings from review body
  const findings = parseFindings(reviewResult.body);
  const recommendation = extractRecommendation(reviewResult.body);
  const classified = classifyFindings(findings, { type: issueType });

  const suggestions = parseSuggestions(reviewResult.body);

  const envelope = buildSuccessEnvelope(reviewResult, classified, findings, suggestions, issueType);
  envelope.recommendation = recommendation;
  reportUnrecognizedFlags(envelope, args);
  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
}

// ─── Module Guard ───

if (require.main === module) {
  main().catch(err => {
    process.stdout.write(JSON.stringify(buildErrorEnvelope([{
      code: 'UNEXPECTED',
      message: err.message,
    }]), null, 2) + '\n');
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  resolveIssueType,
  findLatestReview,
  parseFindings,
  parseSuggestions,
  classifyFindings,
  statusForEmoji,
  extractRecommendation,
  buildSuccessEnvelope,
  buildErrorEnvelope,
  reportUnrecognizedFlags,
};
