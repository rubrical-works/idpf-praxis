// Rubrical Works (c) 2026
/**
 * @framework-script 0.118.0
 * review-body-hash.js — The body hash a review records, so `review-state.js`
 * can tell a reviewed issue from one rewritten since its review (#3543).
 *
 * The `reviewed` label survives any later edit: #3538, #3199 and #3537 each
 * gained criteria or design sections after their last review and still read
 * reviewed-clean at the /work gate. `review-finalize.js` now records a hash of
 * the body in a hidden marker, written in the same body update as
 * `**Reviews:** N`; a mismatch is `stale-reviewed`.
 *
 * The hash covers what an author writes and excludes what the workflow writes
 * after a review, so working an issue never makes its review stale:
 *
 *   | Excluded                                   | Written by                      |
 *   |--------------------------------------------|---------------------------------|
 *   | `<!-- review-hash: … -->`                  | review-finalize.js (this file)  |
 *   | the `**Reviews:** N` line                  | review-finalize.js              |
 *   | checkbox state (`[x]` reads as `[ ]`)      | /work Step 4, /done             |
 *   | trailing `→ QA: #N` / `→ GATE: <phase>`    | /work Step 4a, 4b               |
 *   | the `### Files Changed` section            | /work Step 4c                   |
 *   | `**Doc judgment:**` lines                  | /work Step 3b                   |
 *   | the `**Review gate bypassed:**` note       | tree-review-gate.js (#3552)     |
 *   | CRLF line endings, blank-line runs         | the GitHub web editor (#3064)   |
 *
 * Lines inside a fenced code block are author content (#3580): none of the
 * workflow-write exclusions above (the marker, `**Reviews:**`, checkbox state,
 * gate suffixes, `### Files Changed`, `**Doc judgment:**`, the bypass note)
 * applies to them. Whitespace normalization still does: CRLF endings,
 * trailing whitespace and blank-line runs are normalized inside a fence too.
 *
 * Built-ins and shared siblings only (runtime dependency contract, #2418).
 */

const crypto = require('crypto');
const { normalizeEol } = require('./normalize-eol.js');
// The one checkbox definition (checkbox-scan.js) — never a second regex here.
const { matchCheckboxLine, computeFenceMask } = require('./checkbox-scan.js');

const MARKER_PATTERN = /<!-- review-hash: ([0-9a-f]+) -->/;
const MARKER_LINE = /^[ \t]*<!-- review-hash: [0-9a-f]+ -->[ \t]*$/;
const REVIEWS_LINE = /^\*\*Reviews:\*\*[ \t]*\d+[ \t]*$/;
const DOC_JUDGMENT_LINE = /^\*\*Doc judgment:\*\*/;
// tree-review-gate.js BYPASS_NOTE_MARKER, matched here rather than required:
// a lib loading a top-level script would invert the dependency direction.
const BYPASS_NOTE_LINE = /^\*\*Review gate bypassed:\*\*/;
// One trailing `→ QA: #N` / `→ GATE: <phase>` annotation. Applied in a loop
// rather than as a repeated group (security/detect-unsafe-regex).
const ONE_GATE_SUFFIX = /\s*→\s*(?:QA:\s*#\d+|GATE:\s*[A-Za-z-]+)\s*$/;

/** Strip every trailing gate annotation from an acceptance-criterion line. */
function stripGateSuffix(text) {
  let current = String(text);
  for (;;) {
    const next = current.replace(ONE_GATE_SUFFIX, '');
    if (next === current) return current;
    current = next;
  }
}
const FILES_CHANGED = /^###[ \t]+Files Changed[ \t]*$/;
const HEADING = /^(#{1,6})[ \t]/;
const HASH_LENGTH = 16;

/**
 * The body as the hash sees it: workflow writes removed, line endings and
 * blank-line runs normalized.
 * @param {string} body
 * @returns {string}
 */
function normalizeForHash(body) {
  if (typeof body !== 'string') return '';
  const out = [];
  let inFilesChanged = false;
  const lines = normalizeEol(body).split('\n').map((raw) => raw.replace(/[ \t]+$/, ''));
  // Fenced lines are quoted author content (#3580): no workflow rule applies
  // to them, and a fenced heading neither opens nor closes Files Changed.
  const fenced = computeFenceMask(lines);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inFilesChanged) {
      const h = fenced[i] ? null : line.match(HEADING);
      if (!h || h[1].length > 3) continue;
      inFilesChanged = false;
    }
    if (fenced[i]) { out.push(line); continue; }
    if (FILES_CHANGED.test(line)) { inFilesChanged = true; continue; }
    if (MARKER_LINE.test(line) || REVIEWS_LINE.test(line) || DOC_JUDGMENT_LINE.test(line) || BYPASS_NOTE_LINE.test(line)) continue;
    const box = matchCheckboxLine(line);
    if (box) {
      // Rebuilt unchecked, indentation kept: checkbox state is a workflow write.
      out.push(`${line.match(/^\s*/)[0]}- [ ] ${stripGateSuffix(box.text)}`);
      continue;
    }
    out.push(line);
  }
  return out.join('\n').replace(/\n{2,}/g, '\n\n').trim();
}

/** sha256 of the normalized body, first 16 hex characters. */
function computeReviewHash(body) {
  return crypto.createHash('sha256').update(normalizeForHash(body), 'utf8').digest('hex').slice(0, HASH_LENGTH);
}

/** The recorded hash, or null when the body carries no marker. */
function readReviewHash(body) {
  if (typeof body !== 'string') return null;
  const m = body.match(MARKER_PATTERN);
  return m ? m[1] : null;
}

/**
 * Write the marker: replace an existing one in place, else put it on the line
 * after `**Reviews:** N`, else append it. Never two markers.
 */
function writeReviewHash(body, hash) {
  const marker = `<!-- review-hash: ${hash} -->`;
  const text = typeof body === 'string' ? body : '';
  if (MARKER_PATTERN.test(text)) return text.replace(MARKER_PATTERN, marker);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(eol);
  const at = lines.findIndex((l) => REVIEWS_LINE.test(l.replace(/\r$/, '').replace(/[ \t]+$/, '')));
  if (at !== -1) {
    lines.splice(at + 1, 0, marker);
    return lines.join(eol);
  }
  return `${text.trimEnd()}${eol}${marker}${eol}`;
}

module.exports = { computeReviewHash, readReviewHash, writeReviewHash, normalizeForHash, stripGateSuffix, MARKER_PATTERN };
