// Rubrical Works (c) 2026
/**
 * @framework-script 0.122.0
 * @description Multi-issue review aggregator (#3807): renders a `#N <state> (M/T)` progress line as each review result returns, then one closing roster in typed order naming every member's state and reviewer. Pure renderers; no aggregate verdict. A reviewer's raw reply becomes its member only through issue-reviewer-result-schema.json validation (#3806): a failed reply is an error under its issue with no verdict event, never retried; a skipped 2a-ii or 2a-iv write is flagged on its roster line.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

'use strict';

const { validateResult } = require('./subagent-result.js');

/**
 * A member result, as the parent session records it:
 *   { issue, kind, ... }
 * kind 'review'     — a finalized review: labelAssigned, recommendation, reviewNumber
 * kind 'error'      — the review errored: reason
 * kind 'redirect'   — handed to another review command: reason
 * kind 'early-exit' — already reviewed, nothing ran: reason
 * kind 'held'       — not reviewed this run (e.g. a test plan held behind its PRD): reason
 * kind 'skipped'    — not reviewed this run for another reason: reason
 */
const STATE_WORDS = {
  error: 'error',
  redirect: 'redirect',
  'early-exit': 'early exit',
  held: 'held',
  skipped: 'skipped',
};

/**
 * The one-word state a member is reported under. A review's state is the label
 * finalize assigned; a failed label swap (null) reads `unlabeled`, never
 * `reviewed`, so a swap failure cannot pass for a clean review.
 */
function stateOf(member) {
  if (!member || typeof member !== 'object') return 'error';
  if (member.kind === 'review') {
    return member.labelAssigned === 'reviewed' || member.labelAssigned === 'pending'
      ? member.labelAssigned
      : 'unlabeled';
  }
  return STATE_WORDS[member.kind] || 'error';
}

/** The usable members of a results list: non-array input and non-object entries yield none. */
function members(results) {
  return Array.isArray(results) ? results.filter((r) => r && typeof r === 'object') : [];
}

/**
 * `#N <state> (M/T)` — M is the member's position in completion order, T the
 * selection size.
 */
function formatProgressLine(member, completed, total) {
  return `#${member.issue} ${stateOf(member)} (${completed}/${total})`;
}

/**
 * Progress lines for results in the order they returned. `total` defaults to
 * the number of results; empty or non-array input yields no lines.
 */
function renderProgress(results, total) {
  const list = members(results);
  const t = Number.isInteger(total) && total > 0 ? total : list.length;
  return list.map((member, i) => formatProgressLine(member, i + 1, t));
}

/**
 * Who reviewed: a dispatched `idpf-issue-reviewer` subagent on Sonnet, or the
 * parent session inline. review-finalize.js writes the same label into the
 * review comment, so the roster and the comment cannot disagree.
 */
const REVIEWER_LABELS = Object.freeze({
  dispatched: 'idpf-issue-reviewer (sonnet)',
  inline: 'inline (session model)',
});

/** A reviewer key (`dispatched`/`inline`) or its full label → the label; anything else → null. */
function formatReviewerLabel(reviewer) {
  if (typeof reviewer !== 'string') return null;
  if (Object.prototype.hasOwnProperty.call(REVIEWER_LABELS, reviewer)) return REVIEWER_LABELS[reviewer];
  return Object.values(REVIEWER_LABELS).includes(reviewer) ? reviewer : null;
}

/**
 * `review: <label>`, plus `; resolved inline in N cycle(s)` when a resolve
 * pass followed — a resolved issue names both reviewers.
 */
function reviewerClause(member) {
  let clause = `review: ${formatReviewerLabel(member.reviewer) || 'reviewer unknown'}`;
  const cycles = member.resolve && Number.isInteger(member.resolve.cycles) ? member.resolve.cycles : null;
  if (cycles !== null && cycles > 0) clause += `; resolved inline in ${cycles} ${cycles === 1 ? 'cycle' : 'cycles'}`;
  return clause;
}

/**
 * Writes a review is expected to make before finalize, keyed by the result
 * field reporting them. An explicit `false` is shown on the roster line so a
 * skipped 2a-ii or 2a-iv write is visible (#3806); absent says nothing.
 */
const WRITE_FLAGS = Object.freeze([
  ['filesToModifyWritten', 'Files to modify not written (2a-ii)'],
  ['priorArtWritten', 'Prior Art not written (2a-iv)'],
]);

/**
 * One roster line. A review names its reviewer, recommendation, the label
 * assigned and the review number, then any write it skipped; every other kind
 * names its reason.
 */
function formatRosterLine(member) {
  const state = stateOf(member);
  if (member && member.kind === 'review') {
    const parts = [
      reviewerClause(member),
      member.recommendation || 'no recommendation',
      `label ${member.labelAssigned || 'none'}`,
      `review #${member.reviewNumber != null ? member.reviewNumber : '?'}`,
      ...WRITE_FLAGS.filter(([field]) => member[field] === false).map(([, text]) => text),
    ];
    return `#${member.issue} ${state} — ${parts.join(' · ')}`;
  }
  const reason = member && member.reason ? member.reason : 'no reason given';
  return `#${member.issue} ${state} — ${reason}`;
}

/**
 * Order results by the typed selection. A typed member with no result is listed
 * as an error, never dropped; a result outside typedOrder follows in the order
 * it was given. Without typedOrder the given order stands.
 */
function orderByTyped(results, typedOrder) {
  // Issue keys compare as integers: a typed order parsed from `#42` or `42`
  // arguments matches a result carrying 42. Each issue is listed once — the
  // first result for it wins — so a repeated result never doubles a line.
  const key = (n) => {
    const v = typeof n === 'number' ? n : parseInt(String(n).replace(/^#/, ''), 10);
    return Number.isInteger(v) ? v : n;
  };
  const byIssue = new Map();
  for (const r of results) if (!byIssue.has(key(r.issue))) byIssue.set(key(r.issue), r);
  const unique = [...byIssue.values()];
  if (!Array.isArray(typedOrder) || typedOrder.length === 0) return unique;
  const typed = [...new Set(typedOrder.map(key))];
  const ordered = typed.map((n) => byIssue.get(n) || { issue: n, kind: 'error', reason: 'no result returned' });
  const typedSet = new Set(typed);
  for (const r of unique) if (!typedSet.has(key(r.issue))) ordered.push(r);
  return ordered;
}

/**
 * The closing roster: a header, then one line per member in typed order.
 * There is deliberately no aggregate verdict — each member stands on its own.
 */
function renderRoster(results, options = {}) {
  const ordered = orderByTyped(members(results), options.typedOrder);
  return [
    `Review roster (${ordered.length} ${ordered.length === 1 ? 'issue' : 'issues'}, typed order):`,
    ...ordered.map((m) => `  ${formatRosterLine(m)}`),
  ];
}

const REVIEWER_ROLE = 'idpf-issue-reviewer';

/** subagent-result.js failure → the reason the roster prints under the issue. */
function failureReason(validation) {
  const detail = (validation.errors || []).join('; ');
  switch (validation.error) {
    case 'empty': return 'no result — the reviewer returned nothing';
    case 'not-json': return `result is not JSON — ${detail}`;
    case 'agent-error': return `reviewer crashed — ${detail}`;
    case 'schema': return `result failed validation — ${detail}`;
    default: return `${validation.error} — ${detail}`;
  }
}

/**
 * One reviewer's raw reply → its roster member (#3806). The reply is validated
 * against issue-reviewer-result-schema.json through subagent-result.js before
 * it can enter the roster. An empty, non-JSON, invalid or crashed reply, or a
 * result naming another issue, is `kind: 'error'` with the message as reason;
 * an `outcome: "error"` result keeps its `error` verbatim (a gh secondary rate
 * limit reads as gh printed it). No verdict is ever guessed for an error, and
 * nothing here retries: one reply in, one member out.
 *
 * @param {object} input
 * @param {number} input.issue          The issue this reviewer was dispatched for
 * @param {string} [input.text]         The reply text
 * @param {*}      [input.value]        An already-parsed result
 * @param {string} [input.agentError]   The Agent call's error, when it crashed
 * @param {string} [input.reviewer]     `dispatched` or `inline` (roster label key)
 * @param {string} [input.root]         Project root for the schema (default: cwd)
 * @returns {object} a roster member
 */
function memberFromReply({ issue, text, value, agentError, reviewer, root } = {}) {
  const base = reviewer === undefined ? { issue } : { issue, reviewer };
  const validation = validateResult({ role: REVIEWER_ROLE, text, value, agentError, instance: `#${issue}`, root });
  if (!validation.ok) return { ...base, kind: 'error', reason: failureReason(validation) };
  const result = validation.result;
  if (result.issue !== issue) {
    return { ...base, kind: 'error', reason: `result names #${result.issue}, not #${issue}` };
  }
  if (result.outcome === 'error') return { ...base, kind: 'error', reason: result.error };
  const member = {
    ...base,
    kind: 'review',
    labelAssigned: result.labelAssigned,
    recommendation: result.recommendation,
    reviewNumber: result.reviewNumber,
    filesToModifyWritten: result.filesToModifyWritten,
  };
  if (result.priorArtWritten !== undefined) member.priorArtWritten = result.priorArtWritten;
  if (result.commentUrl !== undefined) member.commentUrl = result.commentUrl;
  return member;
}

/**
 * Collect one member per issue from `dispatch(issue)`, which returns that
 * reviewer's reply `{ text | value | agentError }`. Each issue is dispatched
 * exactly once — a failure, a rate limit included, is reported, never retried —
 * and a throwing dispatch is that issue's crash alone; siblings are unaffected.
 */
function collectMembers(issues, dispatch, { root, reviewer } = {}) {
  return (Array.isArray(issues) ? issues : []).map((issue) => {
    let reply;
    try {
      reply = dispatch(issue) || {};
    } catch (e) {
      reply = { agentError: e && e.message ? e.message : String(e) };
    }
    return memberFromReply({ reviewer, root, ...reply, issue });
  });
}

/**
 * The label to pass to `announce.js --label-assigned` for a member, or null
 * when no verdict event is due: an error, a non-review kind, or a review whose
 * label swap failed (`labelAssigned: null`) emits nothing — rule 09 Step 3b.
 */
function verdictEventLabel(member) {
  if (!member || member.kind !== 'review') return null;
  return member.labelAssigned === 'reviewed' || member.labelAssigned === 'pending' ? member.labelAssigned : null;
}

module.exports = {
  memberFromReply,
  collectMembers,
  verdictEventLabel,
  WRITE_FLAGS,
  REVIEWER_LABELS,
  formatReviewerLabel,
  STATE_WORDS,
  stateOf,
  formatProgressLine,
  renderProgress,
  formatRosterLine,
  renderRoster,
};
