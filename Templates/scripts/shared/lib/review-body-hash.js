// Rubrical Works (c) 2026
/**
 * @framework-script 0.120.0
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
 *   | the `## Approval Decisions` section        | /review-test-plan Step 5a (#3635) |
 *   | `**Doc judgment:**` lines                  | /work Step 3b                   |
 *   | the `**Review gate bypassed:**` note       | tree-review-gate.js (#3552)     |
 *   | the `**Processing Order:**` section        | /work Step 2c (#3655)           |
 *   | CRLF line endings, blank-line runs         | the GitHub web editor (#3064)   |
 *
 * Lines inside a fenced code block are author content (#3580): none of the
 * workflow-write exclusions above (the marker, `**Reviews:**`, checkbox state,
 * gate suffixes, `### Files Changed`, `## Approval Decisions`,
 * `**Doc judgment:**`, the bypass note, Processing Order)
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
// work-preamble.js PO_BOLD / PO_HEADING / PO_ITEM and the section-end rule of
// its findProcessingOrderSection (#3655), matched here for the same reason.
// A bold header with text after it is the inline form: that line alone. Else
// the section runs over list items carrying a `#N`, blank lines between them
// included, and ends at the first other line — a heading, prose, or an item
// with no `#N` — which is author content.
const PO_BOLD = /^\s*\*\*Processing Order:\*\*\s*(.*)$/;
const PO_HEADING = /^\s*#{1,6}\s+Processing Order:?\s*$/;
const PO_ITEM = /^\s*(?:\d+[.)]|[-*+])\s+/;
const PO_ANY_HEADING = /^\s*#{1,6}\s/;
const PO_REF = /#\d+/;

/** True for a line that continues an open Processing Order section. */
function continuesProcessingOrder(line) {
  if (line.trim() === '') return true;
  return PO_ITEM.test(line) && !PO_ANY_HEADING.test(line) && PO_REF.test(line);
}
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
// Workflow-written sections, each skipped from its heading to the next
// unfenced heading at `closesAt` level or above. Approval Decisions carries a
// `###` heading per gate, so it closes on level 2, never on its own children.
const SKIPPED_SECTIONS = [
  { heading: /^###[ \t]+Files Changed[ \t]*$/, closesAt: 3 },
  { heading: /^##[ \t]+Approval Decisions[ \t]*$/, closesAt: 2 },
];
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
  // The open skipped section, or null.
  let skipping = null;
  // An open Processing Order section (#3655); a fenced line always ends it.
  let inOrder = false;
  const lines = normalizeEol(body).split('\n').map((raw) => raw.replace(/[ \t]+$/, ''));
  // Fenced lines are quoted author content (#3580): no workflow rule applies
  // to them, and a fenced heading neither opens nor closes a skipped section.
  const fenced = computeFenceMask(lines);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (skipping) {
      const h = fenced[i] ? null : line.match(HEADING);
      if (!h || h[1].length > skipping.closesAt) continue;
      skipping = null;
    }
    if (inOrder) {
      if (!fenced[i] && continuesProcessingOrder(line)) continue;
      inOrder = false;
    }
    if (fenced[i]) { out.push(line); continue; }
    const opened = SKIPPED_SECTIONS.find((s) => s.heading.test(line));
    if (opened) { skipping = opened; continue; }
    const order = PO_BOLD.exec(line);
    if (order || PO_HEADING.test(line)) {
      // The inline form is its header line alone; lines below it are author content.
      inOrder = !(order && order[1].trim());
      continue;
    }
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

/**
 * Index of the real marker line — the first unfenced line matching
 * MARKER_LINE — or -1. Found the same way normalizeForHash excludes it, so a
 * marker quoted inside a code fence is author content, never read or
 * rewritten as the real one (#3620). `lines` may still carry a trailing `\r`.
 */
function findMarkerLine(lines) {
  const bare = lines.map((l) => l.replace(/\r$/, ''));
  const fenced = computeFenceMask(bare);
  return bare.findIndex((l, i) => !fenced[i] && MARKER_LINE.test(l));
}

/** The recorded hash, or null when the body carries no unfenced marker. */
function readReviewHash(body) {
  if (typeof body !== 'string') return null;
  const lines = body.split('\n');
  const at = findMarkerLine(lines);
  return at === -1 ? null : lines[at].match(MARKER_PATTERN)[1];
}

/**
 * Write the marker: replace an existing unfenced one in place, else put it on
 * the line after the first unfenced `**Reviews:** N`, else append it. Never two
 * markers; a marker or `**Reviews:**` line quoted inside a code fence is left
 * untouched.
 */
function writeReviewHash(body, hash) {
  const marker = `<!-- review-hash: ${hash} -->`;
  const text = typeof body === 'string' ? body : '';
  const existing = text.split('\n');
  const found = findMarkerLine(existing);
  if (found !== -1) {
    existing[found] = existing[found].replace(MARKER_PATTERN, marker);
    return existing.join('\n');
  }
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(eol);
  // Anchor on an unfenced `**Reviews:**` line only: a marker inserted after a
  // fenced example would sit inside the fence, where reads ignore it (#3620).
  const fenced = computeFenceMask(lines.map((l) => l.replace(/\r$/, '')));
  const at = lines.findIndex((l, i) => !fenced[i] && REVIEWS_LINE.test(l.replace(/\r$/, '').replace(/[ \t]+$/, '')));
  if (at !== -1) {
    lines.splice(at + 1, 0, marker);
    return lines.join(eol);
  }
  return `${text.trimEnd()}${eol}${marker}${eol}`;
}

module.exports = { computeReviewHash, readReviewHash, writeReviewHash, normalizeForHash, stripGateSuffix, MARKER_PATTERN };
