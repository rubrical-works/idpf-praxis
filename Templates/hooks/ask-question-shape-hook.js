#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.112.0
 * ask-question-shape-hook.js
 *
 * PreToolUse hook (matcher: AskUserQuestion) that blocks a question shaped to
 * be unreadable (#3233). Claude Code renders question text in bold, so context
 * stuffed into the question becomes a wall of bold text; the context belongs
 * in markdown printed before the call.
 *
 * Blocks, per question:
 *   - text longer than `maxQuestionLength`;
 *   - block content: a markdown table row, a list item, or several paragraphs;
 *   - more than `maxOptions` options or a `header` over `maxHeaderLength`
 *     characters — the tool's own hard limits (#3198), which it rejects
 *     as "Invalid tool parameters" without saying which.
 * The correction names each offending question and the remedy, which branches
 * on `multiSelect`: previews render for single-select questions only, so a
 * multi-select correction never suggests them. It also carries the
 * context-table convention, which the hook cannot check because it never sees
 * the text printed before the call.
 *
 * Block shape: `{decision: 'block', reason}` on stdout, exit 0 — the shape the
 * #3233 hands-on probe confirmed reaches the model.
 *
 * Limits and text: .claude/metadata/ask-question-shape.json. Fails open,
 * always: unparseable input, no questions, or missing or malformed data
 * allow the call. Node built-ins only (deployed hooks resolve from the hub,
 * #2418).
 */

const fs = require('fs');
const path = require('path');

// Anchored to __dirname: in a deployed project .claude/hooks/ and
// .claude/metadata/ are both hub junctions.
const DATA_FILE = path.resolve(__dirname, '..', 'metadata', 'ask-question-shape.json');

const SILENT = Object.freeze({ code: 0, stdout: '', stderr: '' });

/** The rules, or null when they cannot be read. Never throws. */
function loadRules() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (_e) {
    return null;
  }
}

/** True when the rules carry every field the checks need. */
function usable(rules) {
  return !!rules
    && Number.isInteger(rules.maxQuestionLength)
    && Number.isInteger(rules.maxOptions)
    && Number.isInteger(rules.maxHeaderLength)
    && rules.remedy && typeof rules.remedy.singleSelect === 'string' && typeof rules.remedy.multiSelect === 'string'
    && Array.isArray(rules.convention);
}

/**
 * Everything wrong with one question, as short phrases.
 * @returns {string[]}
 */
function problemsWith(question, rules) {
  const problems = [];
  const text = typeof question.question === 'string' ? question.question : '';
  if (text.length > rules.maxQuestionLength) {
    problems.push(`its text is ${text.length} characters (limit ${rules.maxQuestionLength})`);
  }
  if (/\n\s*\n/.test(text)) problems.push('it has several paragraphs');
  if (/^\s*\|.*\|\s*$/m.test(text)) problems.push('it contains a markdown table');
  if (/^\s*(?:[-*+]|\d+[.)])\s+\S/m.test(text)) problems.push('it contains list items');
  if (Array.isArray(question.options) && question.options.length > rules.maxOptions) {
    problems.push(`it has ${question.options.length} options (the tool accepts at most ${rules.maxOptions} options)`);
  }
  if (typeof question.header === 'string' && question.header.length > rules.maxHeaderLength) {
    problems.push(`its header "${question.header}" is ${question.header.length} characters (the tool accepts at most ${rules.maxHeaderLength} characters)`);
  }
  return problems;
}

/**
 * The hook's whole decision as data, so it can be asserted without a process.
 * @param {string} rawInput - hook stdin
 * @param {object|null} rules - parsed ask-question-shape.json
 * @returns {{code: number, stdout: string, stderr: string}}
 */
function respond(rawInput, rules) {
  if (!usable(rules)) return SILENT;
  let input;
  try {
    input = JSON.parse(rawInput);
  } catch (_e) {
    return SILENT;
  }
  const questions = input && input.tool_input && input.tool_input.questions;
  if (!Array.isArray(questions)) return SILENT;

  const findings = [];
  let anySingleSelect = false;
  questions.forEach((question, i) => {
    if (!question || typeof question !== 'object') return;
    const problems = problemsWith(question, rules);
    if (problems.length === 0) return;
    const multi = question.multiSelect === true;
    if (!multi) anySingleSelect = true;
    const remedy = multi ? rules.remedy.multiSelect : rules.remedy.singleSelect;
    findings.push(`Question ${i + 1} ("${String(question.header || '').slice(0, 40)}"): ${problems.join('; ')}. ${remedy}`);
  });
  if (findings.length === 0) return SILENT;

  // Previews render for single-select questions only: a correction about
  // multi-select questions alone carries no preview advice at all.
  const convention = anySingleSelect ? rules.convention : rules.convention.filter((line) => !/preview/i.test(line));
  const reason = [
    'AskUserQuestion blocked: the question text renders in bold, so it must be one short sentence (ask-question-shape.json).',
    ...findings,
    '',
    ...convention,
  ].join('\n');
  return { code: 0, stdout: JSON.stringify({ decision: 'block', reason }), stderr: '' };
}

module.exports = { respond, loadRules, problemsWith, DATA_FILE };

if (require.main === module) {
  // Heartbeat (#2917): records this hook's outcome for the startup Hook Health row.
  let heartbeat = { fail() {}, setCwd() {} };
  try { heartbeat = require('../scripts/shared/lib/hook-heartbeat.js').installHeartbeat('ask-question-shape-hook'); } catch (_) { /* reported by the load check */ }

  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => {
    try {
      try { heartbeat.setCwd(JSON.parse(raw).cwd); } catch (_e) { /* cwd is best-effort */ }
      const r = respond(raw, loadRules());
      if (r.stdout) process.stdout.write(`${r.stdout}\n`);
      process.exitCode = r.code;
    } catch (err) {
      // Fail open: never block a question because the hook broke.
      heartbeat.fail(err);
      process.exitCode = 0;
    }
  });
}
