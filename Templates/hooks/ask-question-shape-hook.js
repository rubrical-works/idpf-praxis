#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.119.0
 * ask-question-shape-hook.js
 *
 * PreToolUse hook (matcher: AskUserQuestion) for a call over the tool's own
 * hard limits (#3233, #3463): more than `maxOptions` options, or a `header`
 * over `maxHeaderLength` characters (#3198). The tool rejects both as
 * "Invalid tool parameters" without saying which, so the hook acts first.
 *
 * A header over the limit is rewritten, not blocked (#3638). The header is
 * only the chip label above the question, so the hook trims it — at a word
 * boundary where one falls within the limit, a hard cut otherwise — and lets
 * the call through with every other field unchanged. No hook error reaches
 * the user and the model does not retry.
 *
 * More than `maxOptions` options still blocks: the hook cannot choose which
 * options to merge or drop. A call with both problems blocks and names both,
 * as does an over-long header with nothing to trim to (whitespace only). The
 * correction names each offending question and the remedy for each kind of
 * problem, each once (#3452), then the pointer (#3440).
 *
 * It does not act on question length or block content (a table, list items,
 * several paragraphs) — not since #3463. Those were convention: the tool
 * accepts them, and every such block surfaced to the user as a hook error.
 * The convention (context printed first as markdown, a one-sentence
 * question, previews) lives in Reference/AskUserQuestion-Shape.md, which the
 * correction's closing pointer names.
 *
 * Rewrite shape: `{hookSpecificOutput: {hookEventName: 'PreToolUse',
 * permissionDecision: 'ask', updatedInput}}` on stdout, exit 0, with
 * `updatedInput` the whole tool input. Probed hands-on (#3638 comment,
 * 2026-11-12, Claude Code 2.1.323): `ask` shows the prompt with the rewritten
 * header; `allow` shows no prompt and the call returns unanswered (#3447).
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
    && Number.isInteger(rules.maxOptions)
    && Number.isInteger(rules.maxHeaderLength)
    && rules.remedy && typeof rules.remedy.header === 'string' && typeof rules.remedy.options === 'string'
    && typeof rules.pointer === 'string' && rules.pointer.length > 0;
}

/**
 * Every hard limit one question exceeds, as short phrases, each tagged with
 * the kind of fix it needs (#3452).
 * @param {object} question - one entry of the AskUserQuestion `questions` array
 * @param {object} rules - the loaded shape rules (`maxOptions`, `maxHeaderLength`, …)
 * @returns {{text: string, kind: 'options'|'header'}[]}
 */
function problemsWith(question, rules) {
  const problems = [];
  if (Array.isArray(question.options) && question.options.length > rules.maxOptions) {
    problems.push({ kind: 'options', text: `it has ${question.options.length} options (the tool accepts at most ${rules.maxOptions} options)` });
  }
  if (typeof question.header === 'string' && question.header.length > rules.maxHeaderLength) {
    problems.push({ kind: 'header', text: `its header "${question.header}" is ${question.header.length} characters (the tool accepts at most ${rules.maxHeaderLength} characters)` });
  }
  return problems;
}

/**
 * The remedies for one question's problems, each kind once, in kind order.
 * @param {{kind: string, text: string}[]} problems - what `problemsWith` returned
 * @param {object} rules - the loaded shape rules, whose `remedy` texts are filled in
 * @returns {string[]}
 */
function remediesFor(problems, rules) {
  const fill = (s) => s.replace(/\{maxHeaderLength\}/g, rules.maxHeaderLength).replace(/\{maxOptions\}/g, rules.maxOptions);
  return ['options', 'header']
    .filter((k) => problems.some((p) => p.kind === k))
    .map((k) => fill(rules.remedy[k]));
}

/**
 * A header cut to at most `max` characters (#3638): at the last word boundary
 * within the limit, or a hard cut when the first word alone is over it. The
 * result has no surrounding whitespace; it is '' only when the header is
 * whitespace throughout, which leaves nothing to trim to. The limit counts
 * UTF-16 code units, as the tool's does; a cut never splits a surrogate pair.
 * @param {string} header
 * @param {number} max
 * @returns {string}
 */
function trimHeader(header, max) {
  const text = header.trim();
  if (text.length <= max) return text;
  // A cut through an astral character (an emoji) drops the whole character.
  const head = text.slice(0, max).replace(/[\uD800-\uDBFF]$/, '');
  // The cut falls between words: the whole head is kept.
  if (/\s/.test(text[max])) return head.trimEnd();
  const boundary = head.search(/\s+\S*$/);
  return boundary > 0 ? head.slice(0, boundary) : head;
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
  // A header problem alone is rewritten (#3638); anything else blocks.
  let mustBlock = false;
  const rewritten = questions.map((question, i) => {
    if (!question || typeof question !== 'object') return question;
    const problems = problemsWith(question, rules);
    if (problems.length === 0) return question;
    const remedies = remediesFor(problems, rules).join(' ');
    findings.push(`Question ${i + 1} ("${String(question.header || '').slice(0, 40)}"): ${problems.map((p) => p.text).join('; ')}. ${remedies}`);
    const header = problems.some((p) => p.kind === 'header') ? trimHeader(question.header, rules.maxHeaderLength) : question.header;
    if (header === '' || problems.some((p) => p.kind !== 'header')) mustBlock = true;
    return Object.assign({}, question, { header });
  });
  if (findings.length === 0) return SILENT;

  if (!mustBlock) {
    // `ask`, never `allow`: with `allow` no prompt is shown (#3447, #3638 probe).
    const hookSpecificOutput = {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      updatedInput: Object.assign({}, input.tool_input, { questions: rewritten }),
    };
    return { code: 0, stdout: JSON.stringify({ hookSpecificOutput }), stderr: '' };
  }

  // Findings, their remedy and one pointer — never the whole convention (#3440).
  const reason = [
    'AskUserQuestion blocked: the call exceeds a limit the tool itself enforces (ask-question-shape.json).',
    ...findings,
    rules.pointer,
  ].join('\n');
  return { code: 0, stdout: JSON.stringify({ decision: 'block', reason }), stderr: '' };
}

module.exports = { respond, loadRules, problemsWith, trimHeader, DATA_FILE };

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
