#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.112.0
 * declared-scope-check.js — Back the `files-to-modify-declared` review
 * criterion: is the issue's `Files to modify:` declaration at top level, and
 * does it parse to paths? (#3279)
 *
 * #3239's `**Files to modify:**` block sat inside step 1 of its Steps to
 * Reproduce. `parseDeclaredScope` needs the header on its own line, so it found
 * no section and raised no warning; `concurrency-plan` classified the issue
 * `undeclared` and sent it to the sequential tail although it overlapped
 * nothing. Two reviews passed it.
 *
 * The parse itself is `scope-drift-check.js` `parseDeclaredScope` — reused, not
 * re-implemented, so the one-block rule (#2813) and the empty-declaration
 * warning (#2523) have one owner. This file adds only what the parser cannot
 * see: the header text appearing where it is not a top-level header.
 *
 *   | Body shape                                   | status | evidence                    |
 *   |----------------------------------------------|--------|-----------------------------|
 *   | top-level block naming backticked paths      | pass   | the authored paths          |
 *   | header off its own line / inside a list item | warn   | each misplaced line         |
 *   | top-level header, no backticked path         | warn   | parseDeclaredScope warning  |
 *   | no declaration at all                        | warn   | "no top-level declaration"  |
 *
 * Header text quoted in an inline code span or a fenced code block is
 * discussion, not a declaration, and is ignored. Only `authoredPaths` count: a
 * `### Files Changed` section is written by `/work`, never by the author.
 *
 * Built-ins and shared siblings only (runtime dependency contract, #2418).
 *
 * CLI: node .claude/scripts/shared/lib/declared-scope-check.js --body-file <path>
 *      (or the body on stdin) → JSON result on stdout.
 */

const fs = require('fs');
const { parseDeclaredScope } = require('../scope-drift-check.js');
const { computeFenceMask } = require('./checkbox-scan.js');

const HEADER_TEXT = /\*\*files(?: to modify)?:\*\*|files to modify:/i;
const OWN_LINE_HEADER = /^\*\*files(?: to modify)?:\*\*$/i;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/;

const REASON_TEXT = {
  'not-on-own-line': 'header is not on its own line',
  'inside-list-item': 'header is inside a list item'
};

/**
 * Find every `Files to modify:` / `Files:` header that is not a top-level
 * header on its own line.
 *
 * @param {string} body
 * @returns {{ line: number, reason: string, text: string }[]} 1-based lines
 */
function findMisplacedHeaders(body) {
  if (!body || typeof body !== 'string') return [];
  const lines = body.split(/\r?\n/);
  const fenced = computeFenceMask(lines);
  const out = [];

  lines.forEach((raw, i) => {
    if (fenced[i]) return;
    // Balanced inline code spans are quotation, not structure.
    const line = raw.replace(/`[^`\n]*`/g, '');
    if (!HEADER_TEXT.test(line)) return;

    const trimmed = line.trim();
    let reason = null;
    if (!OWN_LINE_HEADER.test(trimmed)) {
      reason = 'not-on-own-line';
    } else if (/^\s/.test(line)) {
      reason = 'inside-list-item';
    } else if (i > 0 && LIST_ITEM.test(lines[i - 1])) {
      // No blank line between a list item and the header: a lazy continuation
      // of that item in markdown, not a block of its own.
      reason = 'inside-list-item';
    }
    if (reason) out.push({ line: i + 1, reason, text: raw.trim() });
  });
  return out;
}

/**
 * @param {string} body issue body
 * @returns {{ status: 'pass'|'warn', paths: string[], misplaced: object[],
 *   warnings: string[], evidence: string }}
 */
function checkDeclaredScope(body) {
  const text = typeof body === 'string' ? body : '';
  const parsed = parseDeclaredScope(text);
  const paths = parsed.authoredPaths || [];
  const warnings = parsed.warnings || [];
  const misplaced = findMisplacedHeaders(text);

  const parts = [];
  for (const m of misplaced) {
    parts.push(`Files to modify header not at top level (line ${m.line}: ${REASON_TEXT[m.reason]})`);
  }
  parts.push(...warnings);
  if (paths.length === 0 && misplaced.length === 0 && warnings.length === 0) {
    parts.push('No top-level Files to modify declaration found');
  }
  if (paths.length > 0) {
    parts.push(`Declared: ${paths.map((p) => `\`${p}\``).join(', ')}`);
  }

  const status = paths.length > 0 && misplaced.length === 0 && warnings.length === 0 ? 'pass' : 'warn';
  return { status, paths, misplaced, warnings, evidence: parts.join('; ') };
}

function main(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--body-file');
  const body = i !== -1 && argv[i + 1]
    ? fs.readFileSync(argv[i + 1], 'utf8')
    : fs.readFileSync(0, 'utf8');
  process.stdout.write(JSON.stringify(checkDeclaredScope(body), null, 2) + '\n');
}

if (require.main === module) main();

module.exports = { checkDeclaredScope, findMisplacedHeaders };
