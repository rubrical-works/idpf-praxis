#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.123.0
 * @description Sort a review's Pass 2 findings for --accept (#3879): each needsUserInput finding is `accept` (applied through the Accept-suggestion path) or `hold` (asked through AskUserQuestion), with the reason. Shared by /review-issue Step 3c and /resolve-review Pass 2, so the two cannot disagree about which findings are held.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * Precedence, first match wins:
 *   1. metadata  — the criterion carries `alwaysAsk: { reason }` in
 *                  review-criteria.json (its type) or review-mode-criteria.json.
 *                  Always held; no judgment can accept it.
 *   2. runtime   — the suggestion asserts runtime behavior that was not run.
 *                  Held, never accepted as unverified.
 *   3. judgment  — the caller holds it and states why. A hold with no reason
 *                  is rejected (`HOLD_WITHOUT_REASON`), never treated as one.
 *   4. default   — accepted.
 * Unreadable criteria metadata holds every finding: a policy that cannot be
 * read must not turn into "accept everything".
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TYPE_FILE = '.claude/metadata/review-criteria.json';
const MODE_FILE = '.claude/metadata/review-mode-criteria.json';

const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

/**
 * criterion id → always-ask reason, for one issue type. A type-specific entry
 * wins over the common one with the same id. Unknown type → every type's
 * entries, so a flag is never missed for want of a type.
 *
 * @returns {{index: Map<string, string>, error: string|null}}
 */
function alwaysAskIndex(root, type) {
  const index = new Map();
  let typeData;
  let modeData;
  try {
    typeData = JSON.parse(fs.readFileSync(path.join(root, TYPE_FILE), 'utf8'));
    modeData = JSON.parse(fs.readFileSync(path.join(root, MODE_FILE), 'utf8'));
  } catch (err) {
    return { index, error: err.message };
  }
  for (const [id, c] of Object.entries((modeData && modeData.criteria) || {})) {
    if (c && c.alwaysAsk && nonEmpty(c.alwaysAsk.reason)) index.set(id, c.alwaysAsk.reason);
  }
  const groups = (typeData && typeData.typeSpecific) || {};
  const typed = type && groups[type] ? [groups[type]] : Object.values(groups);
  for (const g of typed) {
    for (const c of (g && g.criteria) || []) {
      if (c && c.id && c.alwaysAsk && nonEmpty(c.alwaysAsk.reason)) index.set(c.id, c.alwaysAsk.reason);
    }
  }
  return { index, error: null };
}

/**
 * @param {object} input
 * @param {Array<{id: string, criterion?: string}>} input.findings - the envelope's needsUserInput findings
 * @param {Object<string, {hold: boolean, reason?: string}>} [input.judgments] - the caller's judgment holds, by criterion id
 * @param {Object<string, {asserts: boolean, ran: boolean, why?: string}>} [input.runtime] - per id: does the suggestion assert runtime behavior, and was it run
 * @param {string} [input.type] - the issue type
 * @param {string} [input.root] - project root
 * @returns {{ok: boolean, decisions: Array<{id: string, criterion: string, decision: 'accept'|'hold', source: string, reason: string}>,
 *   errors: Array<{code: string, id: string, message: string}>}}
 */
function classifyAccept({ findings, judgments, runtime, type, root = process.cwd() } = {}) {
  // `null` is how a hand-written input says "none" — read it as empty, never
  // a TypeError. A present value of the wrong shape is the caller's error.
  findings = findings == null ? [] : findings;
  judgments = judgments == null ? {} : judgments;
  runtime = runtime == null ? {} : runtime;
  if (!Array.isArray(findings)) throw new TypeError('findings must be an array');
  if (typeof judgments !== 'object' || typeof runtime !== 'object') throw new TypeError('judgments and runtime must be objects keyed by criterion id');
  const { index, error } = alwaysAskIndex(root, type);
  const decisions = [];
  const errors = [];
  for (const finding of findings) {
    const id = finding.id;
    const criterion = finding.criterion || id;
    const decide = (decision, source, reason) => decisions.push({ id, criterion, decision, source, reason });
    const judged = judgments[id];
    const run = runtime[id];
    if (error) {
      decide('hold', 'metadata-unreadable', `the always-ask metadata could not be read (${error}), so nothing is accepted without asking`);
    } else if (index.has(id)) {
      decide('hold', 'metadata', index.get(id));
    } else if (run && run.asserts && !run.ran) {
      decide('hold', 'runtime', `the suggestion asserts runtime behavior that could not be run${nonEmpty(run.why) ? `: ${run.why}` : ''}`);
    } else if (judged && judged.hold) {
      if (nonEmpty(judged.reason)) {
        decide('hold', 'judgment', judged.reason.trim());
      } else {
        errors.push({ code: 'HOLD_WITHOUT_REASON', id, message: `A judgment hold on ${criterion} states no reason; give the specific reason it needs the user's input, or let it be accepted.` });
      }
    } else {
      decide('accept', 'default', 'no always-ask flag, no unrun runtime assertion and no judgment hold');
    }
  }
  return { ok: errors.length === 0, decisions, errors };
}

/**
 * CLI: `node accept-classifier.js --input <file>` — the file holds
 * `{findings, judgments?, runtime?, type?}`; prints the result as JSON and
 * exits 1 when it is not ok.
 */
function main(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--input');
  if (i === -1 || !argv[i + 1]) {
    process.stdout.write(JSON.stringify({ ok: false, decisions: [], errors: [{ code: 'MISSING_ARGUMENT', id: null, message: 'Usage: node accept-classifier.js --input <file>' }] }, null, 2) + '\n');
    return 1;
  }
  let input;
  try {
    input = JSON.parse(fs.readFileSync(argv[i + 1], 'utf8'));
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, decisions: [], errors: [{ code: 'INVALID_INPUT', id: null, message: err.message }] }, null, 2) + '\n');
    return 1;
  }
  let result;
  try {
    result = classifyAccept({ ...input, root: process.cwd() });
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, decisions: [], errors: [{ code: 'INVALID_INPUT', id: null, message: err.message }] }, null, 2) + '\n');
    return 1;
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return result.ok ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = { classifyAccept, alwaysAskIndex, main };
