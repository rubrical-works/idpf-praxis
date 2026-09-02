#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.100.0
 * @description Roll review findings up onto the test-plan approval gates declared in
 * .claude/metadata/test-plan-approval-gates.json (#2711, epic #2693). Pure function of two
 * arguments — the gate map and a review findings JSON — returning, per gate, whether it is
 * checkable, whether it is resolvable at all, its backing criteria with observed status, and
 * a risk record for every gate that is not checkable. Performs no gh calls, no filesystem
 * writes and no prompting, so /review-test-plan (#2712) can render its confirmation prompt
 * from the returned record without re-reading the findings.
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

/**
 * The only status that satisfies a gate.
 *
 * `warn`, `fail` and `skip` all block. `skip` is the non-obvious one and is
 * deliberate: a skipped criterion produced no evidence about the gate, and
 * treating an absence of information as a pass is how an approval checklist
 * silently approves something nobody looked at.
 */
const SATISFYING_STATUS = 'pass';

/** Findings entries live under two keys; a criterion may be evaluated by either. */
function indexFindings(findings) {
  const index = new Map();
  const buckets = (findings && findings.findings) || {};
  for (const key of ['autoEvaluated', 'userEvaluated']) {
    const entries = Array.isArray(buckets[key]) ? buckets[key] : [];
    for (const e of entries) {
      if (!e || typeof e.id !== 'string') continue;
      // First writer wins: an id evaluated in both buckets keeps the automatic
      // reading rather than being silently overwritten by ordering.
      if (!index.has(e.id)) {
        index.set(e.id, {
          id: e.id,
          criterion: typeof e.criterion === 'string' ? e.criterion : e.id,
          status: typeof e.status === 'string' ? e.status : 'skip',
          evidence: typeof e.evidence === 'string' ? e.evidence : '',
        });
      }
    }
  }
  return index;
}

function formatBlocking(entries) {
  return entries.map((c) => `${c.id} (${c.status})`).join(', ');
}

/**
 * @param {object} gateMap  Parsed test-plan-approval-gates.json (or anything; degenerate
 *                          input yields an empty gate list rather than throwing).
 * @param {object} findings Parsed review findings JSON, as written by review-finalize.js.
 * @returns {{gates: Array, summary: {total:number, checkable:number, blocked:number, unresolvable:number}}}
 */
function computeApprovalGates(gateMap, findings) {
  const index = indexFindings(findings);
  const declared = gateMap && Array.isArray(gateMap.gates) ? gateMap.gates : [];

  const gates = declared.map((g) => {
    const ids = Array.isArray(g.criteria) ? g.criteria : [];

    const criteria = [];
    const missing = [];
    for (const id of ids) {
      const found = index.get(id);
      if (found) criteria.push({ ...found });
      else missing.push(id);
    }

    const blocking = criteria.filter((c) => c.status !== SATISFYING_STATUS);
    const resolvable = missing.length === 0;

    // A gate with no declared criteria has nothing backing it, so it cannot be
    // computed. #2710 asserts that state does not exist in the shipped gate
    // map; this keeps the helper honest if it ever does.
    const hasCriteria = ids.length > 0;
    const checkable = resolvable && hasCriteria && blocking.length === 0;

    let risk = null;
    if (!resolvable) {
      risk = {
        kind: 'unresolvable',
        reason: `Gate ${g.id} cannot be evaluated: no finding for ${missing.join(', ')}.`,
        criteria: [],
        missing: [...missing],
      };
    } else if (!hasCriteria) {
      risk = {
        kind: 'unresolvable',
        reason: `Gate ${g.id} declares no backing criteria, so nothing evaluates it.`,
        criteria: [],
        missing: [],
      };
    } else if (blocking.length > 0) {
      risk = {
        kind: 'blocked',
        reason: `Gate ${g.id} is blocked by ${formatBlocking(blocking)}.`,
        // Evidence is reproduced verbatim, not summarised: #2712 renders its
        // risk prompt from this record and must not re-open the findings JSON.
        criteria: blocking.map((c) => ({ ...c })),
        missing: [],
      };
    }

    return {
      id: g.id,
      text: typeof g.text === 'string' ? g.text : '',
      autoCheckable: g.autoCheckable === true,
      checkable,
      resolvable,
      criteria,
      missing,
      risk,
    };
  });

  return {
    gates,
    summary: {
      total: gates.length,
      checkable: gates.filter((g) => g.checkable).length,
      blocked: gates.filter((g) => g.risk && g.risk.kind === 'blocked').length,
      unresolvable: gates.filter((g) => g.risk && g.risk.kind === 'unresolvable').length,
    },
  };
}

module.exports = { computeApprovalGates, SATISFYING_STATUS };
