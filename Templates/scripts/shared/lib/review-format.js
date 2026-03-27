// Rubrical Works (c) 2026
/**
 * @framework-script 0.75.0
 * @description Shared review format constants, emoji markers, section headers, and regex patterns for deterministic comment formatting and parsing. Exports EMOJI, SECTION_HEADERS, PATTERNS, and formatting helpers. Used by review-finalize.js and resolve-preamble.js.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * Shared Review Format Constants
 */

// ─── Emoji Markers (derived from findings-schema.json) ───

const findingsSchema = require('./findings-schema.json');
const EMOJI = { ...findingsSchema.statusEmoji };

// ─── Section Headers ───

const SECTION_HEADERS = {
  findings: '### Findings',
  autoEvaluated: '#### Auto-Evaluated',
  userEvaluated: '#### User-Evaluated',
  recommendation: '### Recommendation',
  strengths: '**Strengths:**',
  concerns: '**Concerns:**',
  recommendations: '**Recommendations:**',
};

// ─── Review Comment Header Patterns ───

// Matches: ## Issue Review #1 — 2026-03-12
// Matches: ## Proposal Review #2 — 2026-03-12
// Matches: ## PRD Review #1 — 2026-03-12
// Matches: ## Test Plan Review #3 — 2026-03-12
const REVIEW_HEADER_PATTERN = /^## (Issue|Proposal|PRD|Test Plan) Review #(\d+)\s*—\s*(\d{4}-\d{2}-\d{2})/m;

// Matches malformed headers: ## Issue Review #undefined — 2026-03-13
const MALFORMED_REVIEW_HEADER_PATTERN = /^## (Issue|Proposal|PRD|Test Plan) Review #(undefined|NaN|null)\s*—\s*(\d{4}-\d{2}-\d{2})/m;

// ─── Review Types ───

const REVIEW_TYPES = {
  'Issue': 'issue',
  'Proposal': 'proposal',
  'PRD': 'prd',
  'Test Plan': 'test-plan',
};

// ─── Finding Line Pattern ───

// Matches: - ✅ Title — evidence
// Matches: - ❌ Title — what's missing
// Matches: - ⚠️ Title — concern
const FINDING_LINE_PATTERN = /^- (✅|❌|⚠️|⊘)\s+(.+?)\s*—\s*(.+)$/;

// ─── Recommendation Pattern ───

// Matches: **Ready for work** — explanation
// Matches: **Needs revision** — explanation
const RECOMMENDATION_PATTERN = /^\*\*(.+?)\*\*\s*—\s*(.*)$/m;

// ─── Named Emoji Exports ───

const EMOJI_PASS = EMOJI.pass;
const EMOJI_WARN = EMOJI.warn;
const EMOJI_FAIL = EMOJI.fail;

// ─── Named Section Exports ───

const SECTION_AUTO_EVALUATED = SECTION_HEADERS.autoEvaluated;
const SECTION_USER_EVALUATED = SECTION_HEADERS.userEvaluated;
const SECTION_RECOMMENDATION = SECTION_HEADERS.recommendation;

// ─── Formatting Functions ───

const EMOJI_MAP = { pass: EMOJI.pass, fail: EMOJI.fail, warn: EMOJI.warn, skip: EMOJI.skip };

function formatFindingLine(status, criterion, evidence) {
  const emoji = EMOJI_MAP[status] || EMOJI.skip;
  return `- ${emoji} ${criterion} — ${evidence}`;
}

// ─── Parsing Functions ───

function parseFindingLines(text) {
  const findings = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const match = line.match(FINDING_LINE_PATTERN);
    if (match) {
      const emojiChar = match[1];
      let status = 'unknown';
      if (emojiChar === EMOJI.pass) status = 'pass';
      else if (emojiChar === EMOJI.fail) status = 'fail';
      else if (emojiChar === EMOJI.warn) status = 'warn';
      else if (emojiChar === EMOJI.skip) status = 'skip';
      findings.push({ status, criterion: match[2], detail: match[3] });
    }
  }
  return findings;
}

function parseReviewComment(commentBody) {
  const result = { autoEvaluated: [], userEvaluated: [], recommendation: null };

  // Split into sections
  const autoIdx = commentBody.indexOf(SECTION_HEADERS.autoEvaluated);
  const userIdx = commentBody.indexOf(SECTION_HEADERS.userEvaluated);
  const recIdx = commentBody.indexOf(SECTION_HEADERS.recommendation);

  if (autoIdx !== -1) {
    const endIdx = userIdx !== -1 ? userIdx : (recIdx !== -1 ? recIdx : commentBody.length);
    const section = commentBody.slice(autoIdx, endIdx);
    result.autoEvaluated = parseFindingLines(section);
  }

  if (userIdx !== -1) {
    const endIdx = recIdx !== -1 ? recIdx : commentBody.length;
    const section = commentBody.slice(userIdx, endIdx);
    result.userEvaluated = parseFindingLines(section);
  }

  if (recIdx !== -1) {
    const section = commentBody.slice(recIdx);
    const match = section.match(RECOMMENDATION_PATTERN);
    if (match) {
      result.recommendation = match[1];
    }
  }

  return result;
}

// ─── Auto-Fix Classification ───

// Criteria IDs whose failures can be auto-fixed by the model
const AUTO_FIXABLE_CRITERIA = [
  'title-clear',
  'labels-correct',
  'priority-set',
  'ac-present',
  'ac-present-testable',
  'repro-steps',
  'expected-actual',
  'environment-info',
  'proposed-fix-described',
  'proposed-solution',
  'canonical-template',
];

module.exports = {
  EMOJI,
  EMOJI_PASS,
  EMOJI_WARN,
  EMOJI_FAIL,
  SECTION_HEADERS,
  SECTION_AUTO_EVALUATED,
  SECTION_USER_EVALUATED,
  SECTION_RECOMMENDATION,
  REVIEW_HEADER_PATTERN,
  MALFORMED_REVIEW_HEADER_PATTERN,
  REVIEW_TYPES,
  FINDING_LINE_PATTERN,
  RECOMMENDATION_PATTERN,
  AUTO_FIXABLE_CRITERIA,
  formatFindingLine,
  parseReviewComment,
};

if (require.main === module) {
  console.log('review-format.js — no standalone execution');
}
