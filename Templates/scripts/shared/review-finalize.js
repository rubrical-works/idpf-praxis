#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.117.0
 * @description Consolidate all review cleanup into a single script call. Updates issue body metadata (review count, reviewed-by), formats and posts the review comment with findings, and assigns labels (reviewed/pending) to the reviewed issue only — never to its sub-issues (#2869).
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

// Spawns bounded via lib/exec.js (#2469) — aliased to the original name
// so call sites are unchanged.
const { execTimedAsync } = require('./lib/exec.js');
const fs = require('fs');

const execAsync = execTimedAsync;
const EXEC_OPTS = { encoding: 'utf-8' };

// ─── Shared Constants ───

const { EMOJI, SECTION_HEADERS, REVIEW_TYPES, REVIEWS_MARKER_PATTERN } = require('./lib/review-format');
// The /work Step 4c parser, reused so "declared" means here exactly what the
// gate that consumes the declaration will read (#2891). No second parser.
const { parseDeclaredScope } = require('./scope-drift-check.js');
const { extractAcceptanceCriteria } = require('./lib/checkbox-scan.js');
const { computeReviewHash, writeReviewHash } = require('./lib/review-body-hash.js');

// Header verb per review type, inverted from REVIEW_TYPES rather than copied
// (#2594). REVIEW_TYPES is the same table REVIEW_HEADER_PATTERN's alternation
// is built from, so deriving the verb here means the header we *write* and the
// header /resolve-review *reads* cannot drift apart. A second hand-maintained
// copy would reintroduce exactly the divergence this fixes.
const REVIEW_VERBS = Object.fromEntries(
  Object.entries(REVIEW_TYPES).map(([verb, type]) => [type, verb])
);

// Every issue-shaped type (bug/enhancement/story/epic/generic) and any
// unrecognized or absent value resolves here — which is the header every
// review carried before this change, so existing behavior is preserved.
const DEFAULT_REVIEW_VERB = 'Issue';

function reviewVerb(type) {
  return (typeof type === 'string' && REVIEW_VERBS[type]) || DEFAULT_REVIEW_VERB;
}

const TYPE_LABELS = {
  bug: 'Bug',
  enhancement: 'Enhancement',
  story: 'Story',
  epic: 'Epic',
  generic: 'Generic',
  // prd / proposal / test-plan draw their label from the same inverted table
  // that drives the header, so `**Type:**` and the header verb cannot disagree.
  ...REVIEW_VERBS,
};

// ─── Argument Parsing ───

function parseArgs(args) {
  let issue = null;
  let findingsFile = null;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '-F') {
      findingsFile = args[i + 1] || null;
      i += 2;
    } else {
      const cleaned = arg.replace(/^#/, '');
      const num = parseInt(cleaned, 10);
      if (!isNaN(num) && num > 0 && String(num) === cleaned) {
        issue = num;
      }
      i += 1;
    }
  }

  if (issue === null) {
    return { error: { code: 'MISSING_ARGUMENT', message: 'No issue number provided. Usage: node review-finalize.js <issue> -F <findings.json>' } };
  }
  if (!findingsFile) {
    return { error: { code: 'MISSING_FINDINGS_FILE', message: 'No findings file specified. Use -F <path>.' } };
  }

  return { issue, findingsFile };
}

// ─── Findings File Parsing ───

function parseFindingsFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { error: { code: 'FILE_NOT_FOUND', message: `Findings file not found: ${filePath}` } };
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return { data };
  } catch (e) {
    return { error: { code: 'INVALID_JSON', message: `Failed to parse findings file: ${e.message}` } };
  }
}

// ─── Findings Normalization (#1828) ───

/**
 * Normalize alternate field names to the canonical schema before validation.
 * Accepts common aliases the AI may produce when the schema isn't explicit.
 * Mutates and returns the same object.
 */
function normalizeFindings(data) {
  if (!data || typeof data !== 'object') return data;

  // Top-level field aliases (from findings-schema.json alternateFields)
  const alternates = findingsSchema.alternateFields || {};
  for (const [alt, canonical] of Object.entries(alternates)) {
    if (data[alt] !== undefined && data[canonical] === undefined) {
      data[canonical] = data[alt];
      delete data[alt];
    }
  }

  // criteria → findings structure transformation
  if (data.criteria && !data.findings) {
    const autoEvaluated = [];
    const userEvaluated = [];

    // criteria.common: keyed object → autoEvaluated array
    if (data.criteria.common && typeof data.criteria.common === 'object') {
      for (const [id, entry] of Object.entries(data.criteria.common)) {
        autoEvaluated.push({
          id,
          criterion: entry.name || entry.criterion || id,
          status: entry.status || entry.result || 'skip',
          evidence: entry.evidence || '',
        });
      }
    }

    // criteria.typeSpecific: keyed object → autoEvaluated array (appended)
    if (data.criteria.typeSpecific && typeof data.criteria.typeSpecific === 'object') {
      for (const [id, entry] of Object.entries(data.criteria.typeSpecific)) {
        autoEvaluated.push({
          id,
          criterion: entry.name || entry.criterion || id,
          status: entry.status || entry.result || 'skip',
          evidence: entry.evidence || '',
        });
      }
    }

    // criteria.extensions: keyed object → userEvaluated or autoEvaluated
    if (data.criteria.extensions && typeof data.criteria.extensions === 'object') {
      for (const [id, entry] of Object.entries(data.criteria.extensions)) {
        autoEvaluated.push({
          id,
          criterion: entry.name || entry.criterion || id,
          status: entry.status || entry.result || 'skip',
          evidence: entry.evidence || '',
        });
      }
    }

    data.findings = { autoEvaluated, userEvaluated };
    delete data.criteria;
  }

  // Normalize finding entry field aliases (from findings-schema.json alternateFields)
  if (data.findings && typeof data.findings === 'object') {
    for (const key of ['autoEvaluated', 'userEvaluated']) {
      const arr = data.findings[key];
      if (Array.isArray(arr)) {
        for (const entry of arr) {
          for (const [alt, canonical] of Object.entries(alternates)) {
            if (entry[alt] !== undefined && entry[canonical] === undefined) {
              entry[canonical] = entry[alt];
              delete entry[alt];
            }
          }
        }
      }
    }
  }

  // Normalize recommendation shorthand values (#1958)
  if (typeof data.recommendation === 'string') {
    const RECOMMENDATION_ALIASES = {
      'ready': 'Ready for work',
      'minor': 'Needs minor revision',
      'revision': 'Needs revision',
      'rework': 'Needs major rework',
    };
    const lower = data.recommendation.toLowerCase().trim();
    if (RECOMMENDATION_ALIASES[lower]) {
      data.recommendation = RECOMMENDATION_ALIASES[lower];
    }
  }

  return data;
}

// ─── Findings Validation (#1825) ───

const findingsSchema = require('./lib/findings-schema.json');
const REQUIRED_FIELDS = findingsSchema.required;

function validateFindings(findings) {
  if (!findings || typeof findings !== 'object') {
    return {
      ok: false,
      error: {
        code: 'INVALID_FINDINGS',
        message: 'Findings data is null or not an object',
        missingFields: REQUIRED_FIELDS,
      },
    };
  }

  const missing = [];
  for (const field of REQUIRED_FIELDS) {
    if (findings[field] === undefined || findings[field] === null) {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      error: {
        code: 'INVALID_FINDINGS',
        message: `Findings JSON is missing required fields: ${missing.join(', ')}. Expected schema: { issue, title, reviewNumber, type, findings: { autoEvaluated: [], userEvaluated: [] }, recommendation }`,
        missingFields: missing,
      },
    };
  }

  return { ok: true };
}

// ─── Body Metadata Update ───

function updateBodyReviewCount(body) {
  if (!body) return '**Reviews:** 1\n';

  // Only a standalone marker line counts (#2880). A marker quoted in prose is
  // left exactly as written; with no standalone line, one is appended below.
  // Only the digits change, so the line keeps its own spacing and line ending.
  const match = REVIEWS_MARKER_PATTERN.exec(body);
  if (match) {
    const line = match[0].replace(match[1], String(parseInt(match[1], 10) + 1));
    return body.slice(0, match.index) + line + body.slice(match.index + match[0].length);
  }

  // Append Reviews field at end
  return body.trimEnd() + '\n**Reviews:** 1\n';
}

// ─── Files-to-modify Post-condition (#2891) ───

// The types rule 09 § 2a-ii runs for (Bug, Enhancement, Story; NOT epic).
const FILES_TO_MODIFY_TYPES = new Set(['bug', 'enhancement', 'story']);

/**
 * Report whether the body finalize read carries an authored declaration.
 *
 * Rule 09 § 2a-ii (b) writes `**Files to modify:**` into the body before this
 * script runs, and is model-executed: nothing returned an outcome, so a skipped
 * write was silent and surfaced only later as a /work Step 4c halt or an
 * `undeclared` concurrency classification (#2888, #2882, #3239). This checks
 * the post-condition from the body itself — never whether the step "ran".
 *
 * Declared means `parseDeclaredScope(body).authoredPaths` is non-empty, the
 * same scope the always-protected guard reads, so a `### Files Changed`
 * section, inline header text, or a header naming no backticked path all
 * count as missing.
 *
 * @param {{ type: string, body: string|null }} params - `body` null when the
 *   read failed.
 * @returns {{ filesToModifyMissing: boolean|null }} null for an out-of-scope
 *   type or an unread body: unknown is not missing.
 */
function checkFilesToModify({ type, body }) {
  if (!FILES_TO_MODIFY_TYPES.has(type) || typeof body !== 'string') {
    return { filesToModifyMissing: null };
  }
  const { authoredPaths } = parseDeclaredScope(body);
  return { filesToModifyMissing: !(authoredPaths && authoredPaths.length > 0) };
}

// ─── Acceptance-criteria Coverage (#3541) ───

// Issue-shaped types carry acceptance criteria; prd/proposal/test-plan are
// reviewed by their own commands and never reach this check.
const AC_COVERAGE_TYPES = new Set(['bug', 'enhancement', 'story', 'epic', 'generic']);
const AC_STATUSES = new Set(['pass', 'warn', 'fail', 'gate']);
const AC_PHASES = new Set(['implementation', 'review', 'release']);

/** Comparable criterion text: no markdown emphasis or code ticks, one space, lower case. */
function normalizeAcText(text) {
  return String(text == null ? '' : text)
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Does `acVerdicts` cover every acceptance criterion in the body, one verdict
 * each? Matched by 1-based index plus normalized text, so a verdict for the
 * wrong criterion at a real index counts that index missing AND the entry
 * extra. A review that sampled the criteria is rejected here, before any
 * comment, label or `**Reviews:**` write (#3541; ordering per #3374/#3401).
 *
 * @param {{ type: string, body: string|null, acVerdicts: object[]|undefined }} params
 * @returns {{ ok: boolean, checked: boolean, criteriaCount: number, sectionFound: boolean,
 *   missing: number[], extra: number[], invalid: number[], error?: object }}
 */
function checkAcCoverage({ type, body, acVerdicts }) {
  const skipped = { ok: true, checked: false, criteriaCount: 0, sectionFound: false, missing: [], extra: [], invalid: [] };
  if (!AC_COVERAGE_TYPES.has(type) || typeof body !== 'string') return skipped;

  const { items, sectionFound } = extractAcceptanceCriteria(body);
  const verdicts = Array.isArray(acVerdicts) ? acVerdicts : [];
  const covered = new Set();
  const extra = [];
  const invalid = [];

  for (const v of verdicts) {
    const index = Number(v && v.index);
    const item = Number.isInteger(index) && index >= 1 ? items[index - 1] : undefined;
    if (!item || covered.has(index) || normalizeAcText(item.text) !== normalizeAcText(v.text)) {
      extra.push(Number.isFinite(index) ? index : v && v.index);
      continue;
    }
    covered.add(index);
    if (!AC_STATUSES.has(v.status) || !AC_PHASES.has(v.phase)) invalid.push(index);
  }
  const missing = items.map((_, i) => i + 1).filter((i) => !covered.has(i));

  const result = { ok: true, checked: true, criteriaCount: items.length, sectionFound, missing, extra, invalid };
  if (missing.length === 0 && extra.length === 0 && invalid.length === 0) return result;

  const parts = [];
  if (missing.length) parts.push(`missing verdicts for criteria ${missing.join(', ')}`);
  if (extra.length) parts.push(`verdicts matching no criterion at index ${extra.join(', ')}`);
  if (invalid.length) parts.push(`unknown status or phase at index ${invalid.join(', ')}`);
  return {
    ...result,
    ok: false,
    error: {
      code: 'AC_COVERAGE_INCOMPLETE',
      message: `acVerdicts does not cover the ${items.length} acceptance criteria in the body of the issue: ${parts.join('; ')}. ` +
        'Record one verdict per criterion (index, text as written, status pass|warn|fail|gate, phase, evidence) and re-run. Nothing was posted.',
      missing,
      extra,
      invalid,
    },
  };
}

// Not a `- <emoji> criterion — evidence` line, so resolve-preamble.js does not
// parse it as a finding; and never the bare header shape, so it cannot be
// mistaken for a declaration if pasted into a body.
const FILES_TO_MODIFY_MISSING_LINE =
  '⚠️ No top-level `Files to modify:` / `Files:` block with backticked paths was in the issue body at finalize — ' +
  'rule 09 § 2a-ii (b) did not leave one. /work Step 4c has no authored scope to compare against.';

// ─── Comment Formatting ───

/**
 * The hidden criterion-id marker on a finding line (#3544): resolve-preamble.js
 * reads it back so /resolve-review classifies by id, not display name. Empty
 * when the finding carries no well-formed id.
 */
function findingIdMarker(f) {
  // Flat class, no nested quantifier (security/detect-unsafe-regex).
  return f && typeof f.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(f.id) ? ` <!-- id: ${f.id} -->` : '';
}

const AC_VERDICTS_HEADER = '### Acceptance Criteria Verdicts';

/** A table cell: one line, pipes escaped. */
function cell(value) {
  return String(value == null ? '' : value).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

/**
 * The per-AC verdict table (#3541) as comment lines; `[]` when there are no
 * verdicts. Non-pass rows (fail, warn, gate) first, each group in index order.
 */
function formatAcVerdictTable(acVerdicts) {
  if (!Array.isArray(acVerdicts) || acVerdicts.length === 0) return [];
  const byIndex = (a, b) => (Number(a.index) || 0) - (Number(b.index) || 0);
  const nonPass = acVerdicts.filter((v) => v && v.status !== 'pass').sort(byIndex);
  const pass = acVerdicts.filter((v) => v && v.status === 'pass').sort(byIndex);
  const lines = [AC_VERDICTS_HEADER, '', '| # | Status | Criterion | Phase | Evidence |', '|---|---|---|---|---|'];
  for (const v of [...nonPass, ...pass]) {
    const emoji = EMOJI[v.status] || EMOJI.skip;
    lines.push(`| ${cell(v.index)} | ${emoji} | ${cell(v.text)} | ${cell(v.phase)} | ${cell(v.evidence)} |`);
  }
  lines.push('');
  return lines;
}

const REPAIRS_HEADER = '### Repairs';

/** The pre-finalize repairs table (#3544) as comment lines; `[]` when none. */
function formatRepairsTable(repairs) {
  if (!Array.isArray(repairs) || repairs.length === 0) return [];
  const lines = [REPAIRS_HEADER, '', '| Criterion | Result | Before | After |', '|---|---|---|---|'];
  for (const r of repairs) {
    if (!r) continue;
    const before = typeof r.before === 'string' && r.before.trim() ? cell(r.before) : '(absent)';
    lines.push(`| \`${cell(r.criterion)}\` | ✅ repaired | ${before} | ${cell(r.after)} |`);
  }
  lines.push('');
  return lines;
}

function formatReviewComment(findings, options = {}) {
  const date = new Date().toISOString().slice(0, 10);
  const typeLabel = TYPE_LABELS[findings.type] || findings.type || 'Generic';
  const extensions = findings.extensions && findings.extensions.length > 0
    ? findings.extensions.join(', ')
    : 'None';

  const lines = [];
  lines.push(`## ${reviewVerb(findings.type)} Review #${findings.reviewNumber} — ${date}`);
  lines.push('');
  lines.push(`**Issue:** #${findings.issue} — ${findings.title}`);
  lines.push(`**Type:** ${typeLabel}`);
  lines.push(`**Total Reviews:** ${findings.reviewNumber}`);
  lines.push(`**Extensions Applied:** ${extensions}`);
  lines.push('');
  if (options.filesToModifyMissing === true) {
    lines.push(FILES_TO_MODIFY_MISSING_LINE);
    lines.push('');
  }
  lines.push(SECTION_HEADERS.findings);
  lines.push('');

  // Auto-Evaluated
  lines.push(SECTION_HEADERS.autoEvaluated);
  const autoFindings = (findings.findings && findings.findings.autoEvaluated) || [];
  if (autoFindings.length === 0) {
    lines.push('- (none)');
  } else {
    for (const f of autoFindings) {
      const emoji = EMOJI[f.status] || EMOJI.skip;
      lines.push(`- ${emoji} ${f.criterion} — ${f.evidence}${findingIdMarker(f)}`);
    }
  }
  lines.push('');

  // User-Evaluated
  lines.push(SECTION_HEADERS.userEvaluated);
  const userFindings = (findings.findings && findings.findings.userEvaluated) || [];
  if (userFindings.length === 0) {
    lines.push('- (none)');
  } else {
    for (const f of userFindings) {
      const emoji = EMOJI[f.status] || EMOJI.skip;
      lines.push(`- ${emoji} ${f.criterion} — ${f.evidence}${findingIdMarker(f)}`);
    }
  }
  lines.push('');

  // Per-AC verdicts (#3541): one row per acceptance criterion, non-pass rows
  // first so the criteria that need attention lead. Table rows never match
  // resolve-preamble.js's `- <emoji> criterion — evidence` finding shape, so
  // they are a record of coverage, not a second findings list.
  lines.push(...formatAcVerdictTable(findings.acVerdicts));

  // Pre-finalize repairs (#3544): what the review wrote into the body itself,
  // before and after, so each can be reverted. Table rows, not finding lines.
  lines.push(...formatRepairsTable(findings.repairs));

  // Suggestions (#2717)
  //
  // Findings that are not criteria: they carry no `status`, so they cannot be
  // classified, and before this they were accepted by the schema and dropped
  // without trace. Rendered between Findings and Recommendation so a parser
  // reading by section header finds them outside the recommendation block.
  //
  // Guarded on Array.isArray AND length, NOT modeled on `extensions` above:
  // that one falls back to the literal 'None' and pushes its line
  // unconditionally, which here would emit a heading over a placeholder — the
  // empty section this must never produce. Absent, empty, and non-array all
  // push nothing at all.
  const suggestions = Array.isArray(findings.suggestions) ? findings.suggestions : [];
  if (suggestions.length > 0) {
    lines.push(SECTION_HEADERS.suggestions);
    lines.push('');
    for (const s of suggestions) lines.push(`- ${s}`);
    lines.push('');
  }

  // Recommendation
  lines.push(SECTION_HEADERS.recommendation);
  lines.push(`**${findings.recommendation}** — ${findings.recommendationReason || ''}`);

  return lines.join('\n');
}

// ─── Label Determination ───

/**
 * The LABEL predicate. Deliberately looser than the GATE predicate in
 * review-ac-checkoff.js, which tests startsWith('Ready for') (#2694).
 *
 * They disagree on exactly one value: `Ready with minor revisions` earns the
 * `reviewed` label here — it HAS been reviewed — but must not earn the
 * `PRD reviewed` gate, because it is not yet decomposable. Do not unify them;
 * unifying either way trades one correct behavior for a broken one.
 * Rationale: Construction/Design-Decisions/2026-08-30-review-clean-predicates-diverge-deliberately.md
 */
function determineLabel(recommendation) {
  if (!recommendation) return 'pending';
  return recommendation.startsWith('Ready') ? 'reviewed' : 'pending';
}

/**
 * The label for a whole findings document (#3544). When the review repaired
 * anything, the label follows the criteria, not the recommendation string: a
 * review whose only non-pass criteria were all repaired earns `reviewed`, and
 * any non-pass criterion left unrepaired is `pending`. With no repairs this is
 * determineLabel(recommendation), unchanged.
 *
 * @param {{ findings?: object, repairs?: object[], recommendation?: string }} findings
 * @returns {'reviewed'|'pending'}
 */
// Recommendations that say the issue must change before work: a repair can
// never outrank them.
const BLOCKING_RECOMMENDATIONS = new Set(['Needs revision', 'Needs major rework']);

function decideReviewLabel(findings) {
  const repairs = Array.isArray(findings && findings.repairs) ? findings.repairs : [];
  if (repairs.length === 0) return determineLabel(findings && findings.recommendation);
  // A repair never masks a remaining problem: a blocking recommendation, an
  // unrepaired non-pass criterion, or a warn/fail acceptance-criterion verdict
  // — which is where rule 09 2a-vi's re-check over the repaired body lands.
  if (BLOCKING_RECOMMENDATIONS.has(findings.recommendation)) return 'pending';
  const nonPass = (x) => x && (x.status === 'warn' || x.status === 'fail');
  const verdicts = Array.isArray(findings.acVerdicts) ? findings.acVerdicts : [];
  if (verdicts.some(nonPass)) return 'pending';
  const repaired = new Set(repairs.map((r) => r && r.criterion));
  const f = (findings && findings.findings) || {};
  const all = [...(f.autoEvaluated || []), ...(f.userEvaluated || [])];
  const remaining = all.filter((x) => nonPass(x) && !repaired.has(x.id));
  return remaining.length === 0 ? 'reviewed' : 'pending';
}

/**
 * Swap the review outcome label, reporting a failure instead of absorbing it.
 *
 * Previously inline in main(): `if (labelResult.ok) labelAssigned = '...'` and
 * nothing on the else branch, so a failed swap produced `labelAssigned: null`
 * inside an `ok: true` envelope — the same value a run that never reached the
 * label step produces. One value, two unrelated meanings, no way to tell them
 * apart (#2694; same class as #2682).
 *
 * That mattered because review-state.js classifies "Reviews marker >= 1 with
 * no label" as `indeterminate`, which passes gates by design (#2577). The
 * fail-open is intentional; inheriting it from an *undetected* failure is not.
 *
 * `exec` is injected so the failure path is testable — execSafe is module-local
 * and main() is not exported, so there was nothing to drive a failure through.
 *
 * @param {{ issue: number, label: 'reviewed'|'pending', exec: Function }} params
 * @returns {Promise<{ labelAssigned: string|null, labelError: string|null }>}
 */
async function applyReviewLabel({ issue, label, exec }) {
  const [add, remove] = label === 'reviewed' ? ['reviewed', 'pending'] : ['pending', 'reviewed'];
  const result = await exec(`gh issue edit ${issue} --add-label=${add} --remove-label=${remove}`);
  if (result && result.ok) return { labelAssigned: label, labelError: null };
  const detail = (result && result.message) || 'unknown error';
  return {
    labelAssigned: null,
    labelError: `Failed to assign "${label}" label to #${issue}: ${detail}`,
  };
}

// ─── Envelope Builders ───

/**
 * The review is recorded only when its body marker was written and its comment
 * posted (#3054). Returns null when both succeeded, else the error naming each
 * step that failed and why.
 *
 * @param {{issue: number|string, bodyExport: object, bodyEditResult: object|null, commentResult: object}} steps
 * @returns {{code: string, message: string, failed: string[]}|null}
 */
function checkReviewRecorded({ issue, bodyExport, bodyEditResult, commentResult }) {
  const failed = [];
  const why = (r) => (r && r.message) || 'unknown error';
  const commentOk = Boolean(commentResult && commentResult.ok);
  if (!bodyExport || !bodyExport.ok) failed.push(`body export (${why(bodyExport)})`);
  // The edit runs only after the comment posts (#3374); skipped is not failed.
  else if (commentOk && (!bodyEditResult || !bodyEditResult.ok)) failed.push(`body edit (${why(bodyEditResult)})`);
  if (!commentOk) failed.push(`review comment (${why(commentResult)})`);
  if (!failed.length) return null;
  return {
    code: 'REVIEW_NOT_RECORDED',
    message: `Review of #${issue} not recorded — failed: ${failed.join('; ')}. No label applied.`,
    failed,
  };
}

function buildSuccessResult(data) {
  return {
    ok: true,
    bodyUpdated: data.bodyUpdated,
    commentPosted: data.commentPosted,
    commentUrl: data.commentUrl || null,
    labelAssigned: data.labelAssigned,
    // Present-and-null, never absent (#2694): a caller must not have to tell an
    // envelope that predates this field from a run where the swap succeeded.
    labelError: data.labelError || null,
    // Present-and-null, never absent (#2891): true/false only for a
    // bug/enhancement/story review whose body was read.
    filesToModifyMissing: typeof data.filesToModifyMissing === 'boolean' ? data.filesToModifyMissing : null,
    closingNotification: data.closingNotification || null,
  };
}

function buildErrorResult(error) {
  return {
    ok: false,
    error,
  };
}

// ─── Execution Helpers ───

/**
 * Post the review comment and write the incremented Reviews marker (#3401).
 *
 * The comment posts only once the body has been read: a failed export cannot
 * be recorded, so a comment then would be an orphan. The marker is written only
 * once the comment exists (#3374). If that edit fails, the comment just posted
 * is deleted, since the retry the failure calls for posts it again — leaving
 * one `## Issue Review #N` comment rather than two. A failed delete is returned
 * as `commentRemoveError` for the caller to report.
 *
 * @param {{issue: number, bodyExport: {ok: boolean, output?: string}, comment: string,
 *          exec: (cmd: string) => Promise<{ok: boolean, output?: string, message?: string}>}} args
 * @returns {Promise<{commentResult: object, commentPosted: boolean, commentUrl: string|null,
 *          bodyEditResult: object|null, bodyUpdated: boolean, commentRemoved: boolean,
 *          commentRemoveError: string|null}>}
 */
async function postAndCount({ issue, bodyExport, comment, exec }) {
  const out = {
    commentResult: null, commentPosted: false, commentUrl: null,
    bodyEditResult: null, bodyUpdated: false, commentRemoved: false, commentRemoveError: null,
  };
  if (!bodyExport || !bodyExport.ok) {
    out.commentResult = { ok: false, message: 'not posted — the issue body could not be read' };
    return out;
  }

  const tmpCommentFile = `.tmp-${issue}-review-comment.${process.pid}.md`;
  fs.writeFileSync(tmpCommentFile, comment);
  out.commentResult = await exec(`gh issue comment ${issue} -F ${tmpCommentFile}`);
  try { fs.unlinkSync(tmpCommentFile); } catch (_e) { /* ignore */ }
  if (!out.commentResult.ok) return out;
  out.commentPosted = true;
  const urlMatch = String(out.commentResult.output || '').match(/(https:\/\/\S+)/);
  if (urlMatch) out.commentUrl = urlMatch[1];

  const tmpBodyFile = `.tmp-${issue}-body.${process.pid}.md`;
  // The body hash rides the same write as the **Reviews:** increment (#3543),
  // computed over the body this review read; review-state.js compares it later.
  const counted = updateBodyReviewCount(bodyExport.output);
  fs.writeFileSync(tmpBodyFile, writeReviewHash(counted, computeReviewHash(bodyExport.output)));
  out.bodyEditResult = await exec(`gh pmu edit ${issue} -F ${tmpBodyFile}`);
  try { fs.unlinkSync(tmpBodyFile); } catch (_e) { /* ignore */ }
  out.bodyUpdated = out.bodyEditResult.ok;
  if (out.bodyUpdated) return out;

  const id = out.commentUrl && (out.commentUrl.match(/#issuecomment-(\d+)/) || [])[1];
  const removal = id
    ? await exec(`gh api -X DELETE repos/{owner}/{repo}/issues/comments/${id}`)
    : { ok: false, message: 'the posted comment\'s id was not in gh\'s output' };
  out.commentRemoved = removal.ok;
  if (removal.ok) out.commentPosted = false;
  else out.commentRemoveError = removal.message || 'unknown error';
  return out;
}

async function execSafe(cmd) {
  try {
    const { stdout } = await execAsync(cmd, EXEC_OPTS);
    return { ok: true, output: stdout.trim() };
  } catch (e) {
    return { ok: false, message: e.stderr ? e.stderr.toString().trim() : e.message };
  }
}

/**
 * Build context-aware closing notification based on review outcome and issue status.
 *
 * Outcome takes precedence over status: unresolved findings block progress
 * regardless of where the issue sits on the board, so a 'pending' review routes
 * to /resolve-review even from in_progress/in_review. Omitting `outcome` yields
 * the pre-#2565 status-only behavior.
 *
 * @param {number} issue - Issue number
 * @param {string} title - Issue title
 * @param {string} status - Normalized status (e.g., 'in_progress', 'backlog')
 * @param {string} [outcome] - Review outcome label from determineLabel ('pending'|'reviewed')
 * @returns {string} Closing notification text
 */
function buildClosingNotification(issue, title, status, outcome) {
  const header = `---\nReview complete: #${issue} — ${title}`;
  const footer = '---';

  if (outcome === 'pending') {
    return `${header}\nRun /resolve-review #${issue} to address the findings.\n${footer}`;
  }
  if (status === 'in_progress' || status === 'in_review') {
    return `${header}\nSay "done" or run /done #${issue} to close this issue.\n${footer}`;
  }
  return `${header}\nSay "work #${issue}" to start working on this issue.\n${footer}`;
}

// ─── Main ───

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    const result = buildErrorResult(args.error);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(1);
  }

  const { issue, findingsFile } = args;

  // Parse findings
  const findingsResult = parseFindingsFile(findingsFile);
  if (findingsResult.error) {
    const result = buildErrorResult(findingsResult.error);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(1);
  }
  const findings = normalizeFindings(findingsResult.data);

  // Validate required fields before proceeding (#1825)
  const validation = validateFindings(findings);
  if (!validation.ok) {
    const result = buildErrorResult(validation.error);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(1);
  }

  // Read the body first; the **Reviews:** increment is written only after the
  // comment posts (#3374). Edited first, a failed comment left the marker with
  // no label — `indeterminate`, which the /work gate passes — and a retry
  // counted the one review twice.
  let bodyUpdated = false;
  let bodyEditResult = null;
  const bodyExport = await execSafe(`gh pmu view ${issue} --body-stdout`);

  // Every acceptance criterion carries a verdict (#3541), checked before any
  // write: a rejected review posts no comment, swaps no label and leaves the
  // **Reviews:** marker untouched.
  const coverage = checkAcCoverage({ type: findings.type, body: bodyExport.ok ? bodyExport.output : null, acVerdicts: findings.acVerdicts });
  if (!coverage.ok) {
    const result = { ...buildErrorResult(coverage.error), bodyUpdated: false, commentPosted: false, commentUrl: null, labelAssigned: null, labelError: null };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(1);
  }

  // 2a-ii (b) post-condition (#2891), from the body read above — after the
  // model's pre-finalize writes, before this script's own.
  const { filesToModifyMissing } = checkFilesToModify({ type: findings.type, body: bodyExport.ok ? bodyExport.output : null });
  if (filesToModifyMissing) {
    process.stderr.write(`Warning: #${issue} has no Files to modify declaration after review (rule 09 § 2a-ii (b)).\n`);
  }

  // Post the comment and write the Reviews marker it stands for (#3374, #3401).
  const comment = formatReviewComment(findings, { filesToModifyMissing });
  const recorded = await postAndCount({ issue, bodyExport, comment, exec: execSafe });
  const { commentResult, commentPosted, commentUrl } = recorded;
  bodyEditResult = recorded.bodyEditResult;
  bodyUpdated = recorded.bodyUpdated;
  if (recorded.commentRemoveError) {
    process.stderr.write(`Warning: the review comment for #${issue} could not be removed after the body edit failed (${recorded.commentRemoveError}); delete ${commentUrl} before retrying.\n`);
  }

  // Fail closed (#3054): the label is what review-state.js reads as "reviewed",
  // so it is applied only once the comment and the Reviews marker it stands for
  // exist. Either failing is the whole result, never an ok:true footnote.
  const notRecorded = checkReviewRecorded({ issue, bodyExport, bodyEditResult, commentResult });
  if (notRecorded) {
    const result = {
      ...buildErrorResult(notRecorded),
      bodyUpdated,
      commentPosted,
      commentUrl,
      labelAssigned: null,
      labelError: null,
    };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(1);
  }

  // Assign label
  const label = decideReviewLabel(findings);
  const { labelAssigned, labelError } = await applyReviewLabel({ issue, label, exec: execSafe });
  if (labelError) {
    // Reported, never swallowed. A dropped label leaves the Reviews marker at
    // >= 1 with no label, which review-state.js classifies `indeterminate` —
    // a verdict that passes by design (#2577). Silently absorbing the failure
    // would hand the downstream gate a fail-open it cannot see (#2694).
    process.stderr.write(`Warning: ${labelError}\n`);
  }

  // No label propagation to sub-issues (#2869). An epic review used to end
  // here by listing the epic's children and stamping the EPIC's verdict onto
  // each — a `reviewed` label with no comment, no `**Reviews:**` marker and
  // no findings behind it, which review-state.js read as reviewed-clean and
  // the /work gate passed silently. Since #2869 an epic expands into the
  // multi-issue set (rule 09 § 2a-iii) and every child reaches this script
  // through its own finalize, so each label is earned by the review that
  // wrote it. A child not reached keeps no label and classifies never-reviewed.
  // tests/scripts/shared/review-finalize-epic-propagation.test.js pins this.

  // Findings file cleanup is owned by the caller (#2396) — the /review-issue
  // spec chains `&& rm .tmp-<issue>-findings.json`. Do not delete here or
  // the caller's rm fails with "No such file or directory" and its
  // non-zero exit masks the script's success.

  // Query issue status for context-aware closing notification
  let issueStatus = '';
  const statusResult = await execSafe(`gh pmu view ${issue} --json=status`);
  if (statusResult.ok) {
    try {
      const parsed = JSON.parse(statusResult.output);
      issueStatus = (parsed.status || '').toLowerCase().replace(/\s+/g, '_');
    } catch (_e) { /* fall through to default */ }
  }

  // Build closing notification — `label` carries the review outcome, so a
  // pending review routes to /resolve-review rather than the status-derived arm.
  const closingNotification = buildClosingNotification(issue, findings.title, issueStatus, label);

  const result = buildSuccessResult({
    bodyUpdated,
    commentPosted,
    commentUrl,
    labelAssigned,
    labelError,
    filesToModifyMissing,
    closingNotification,
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

// ─── Module Guard ───

if (require.main === module) {
  main().catch(err => {
    const result = buildErrorResult({
      code: 'UNEXPECTED',
      message: err.message,
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(1);
  });
}

module.exports = {
  postAndCount,
  parseArgs,
  parseFindingsFile,
  normalizeFindings,
  validateFindings,
  updateBodyReviewCount,
  formatReviewComment,
  reviewVerb,
  determineLabel,
  decideReviewLabel,
  applyReviewLabel,
  checkReviewRecorded,
  checkFilesToModify,
  checkAcCoverage,
  buildClosingNotification,
  buildSuccessResult,
  buildErrorResult,
  EMOJI,
  SECTION_HEADERS,
};
