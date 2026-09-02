// Rubrical Works (c) 2026
/**
 * @framework-script 0.100.0
 *
 * Fence-aware checkbox and section scanning for issue bodies (#2600).
 *
 * Six scripts under `.claude/scripts/shared/` each scanned issue bodies for
 * checkboxes with a bare global regex. Two independent blindnesses, both live:
 *
 *   fence-blind    a `- [ ]` quoted inside a code fence counted as a criterion.
 *                  #2594 returned 10 items where 7 existed; the 3 extras were a
 *                  lifecycle checklist the bug report quoted as evidence.
 *   section-blind  every checkbox anywhere in the body counted, regardless of
 *                  section. #2503 returned 22 where 13 existed -- the 9 extras
 *                  came from Documentation, Edge Cases and Definition of Done,
 *                  the last of which contains `- [ ] All acceptance criteria
 *                  met`, i.e. a checkbox asserting the criteria are met,
 *                  returned AS one of the criteria.
 *
 * Section-blindness is the half that fires on every story on every `/work` run.
 * The fenced case needs a body that quotes a checklist, which is rarer. Neither
 * fix subsumes the other, so this module does both.
 *
 * Why the framework side moves and not `gh pmu`: `gh pmu move --status
 * in_review` already ignores fenced checkboxes. The two therefore parsed the
 * same body by different rules, and because `gh pmu` was the correct one, the
 * `in_review` transition always succeeded and nothing ever surfaced the
 * overcount.
 *
 * BUILT BY LIFTING, NOT REWRITING. `extractSection` came from
 * `scope-drift-check.js` (#2523), which already had fence tracking AND section
 * anchoring -- the exact pair needed -- exported from nowhere. Writing a fresh
 * implementation here would have made three copies of the thing this module
 * exists to deduplicate. `scope-drift-check.js` now consumes this module and
 * its second, duplicate fence loop is gone: net fence implementations under
 * `.claude/scripts/shared/`, 2 -> 1.
 *
 * DEPENDENCY-FREE BY INHERITANCE. `scope-drift-check.js` is pinned
 * dependency-free by `04-deployment-awareness.md` and a file-scoped test. It
 * consumes this module, so this module may require nothing -- not even a Node
 * built-in. Guarded by a test asserting the require list is empty.
 */

// ─── Fence masking ───

const FENCE_RE = /^\s*(`{3,}|~{3,})/;

/**
 * Split a body into lines with any trailing CR removed.
 *
 * GitHub issue bodies submitted through the web form carry CRLF, and the
 * regexes replaced by this module tolerated it only by accident: `/^- \[([ x])\]
 * (.+)$/gm` matched because `$` under the `m` flag also anchors before a CRLF
 * pair. A line-split scanner has no such luck -- `.` does not match CR, so a
 * naive `split('\n')` leaves a trailing CR that defeats every line-anchored
 * pattern here and returns ZERO items on a CRLF body.
 *
 * Caught by the #2503 fixture, which `gh pmu view --body-stdout` wrote as CRLF
 * on Windows. Worth naming: zero is the failure mode this module exists to
 * prevent, and it would have arrived by way of the fix.
 *
 * @param {string} text
 * @returns {string[]}
 */
function splitLines(text) {
  return text.split(/\r?\n/);
}

/**
 * Mark every line that sits inside (or is) a fenced code block.
 *
 * An opening fence that never closes is treated as LITERAL TEXT, so the
 * remainder of the body is still scanned. This deliberately departs from
 * CommonMark, which runs an unclosed block to end of document.
 *
 * The trade is asymmetric. Issue bodies are hand-written and unbalanced
 * backticks are common; running an unclosed fence to the end would swallow the
 * real acceptance-criteria section and return zero. A zero passes every
 * downstream gate vacuously -- no per-AC subtasks, nothing for Step 4 to
 * verify, no unchecked boxes for Step 4b's force-move prohibition, and a clean
 * Step 6a audit. That is strictly worse than the overcount this module was
 * written to fix, because an overcount is visible and a vacuous pass is not.
 *
 * @param {string[]} lines
 * @returns {boolean[]} parallel array; true = inside or on a fence
 */
function computeFenceMask(lines) {
  const mask = new Array(lines.length).fill(false);
  let openIndex = -1;
  let openMarker = '';
  let openIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(FENCE_RE);
    if (!m) continue;
    const run = m[1];
    const indent = m[0].length - run.length;

    if (openIndex === -1) {
      openIndex = i;
      openMarker = run;
      openIndent = indent;
      continue;
    }
    // Three conditions, each earning its place:
    //
    //   same character   a ~~~ never closes a ```; without this a body mixing
    //                    fence styles closes early and leaks the quoted boxes.
    //   at least as long a ``` inside a ```` block is content, not a closer.
    //   indent <= +3     a fence marker indented 4+ spaces past its opener is
    //                    CONTENT, per CommonMark. This is the nested case, and
    //                    it is not hypothetical: #2600's own body quotes an
    //                    indented reproduction containing ``` markers, and
    //                    without this rule the inner marker closed the outer
    //                    fence and exposed the very checkbox the fence was
    //                    hiding. The bound is relative rather than absolute so
    //                    a fence legitimately indented inside a list item still
    //                    opens and closes normally.
    if (run[0] === openMarker[0]
        && run.length >= openMarker.length
        && indent <= openIndent + 3) {
      for (let j = openIndex; j <= i; j++) mask[j] = true;
      openIndex = -1;
      openMarker = '';
      openIndent = 0;
    }
  }
  // openIndex !== -1 here means an unpaired opening fence; leave it unmasked.
  return mask;
}

// ─── Section extraction (lifted from scope-drift-check.js, #2409/#2523) ───

/**
 * Line-based section extraction.
 *
 * Replaces a single regex with `[\s\S]*?` plus an alternation whose branches
 * share prefixes (`\n##` vs `\n###`), which the safe-regex2 heuristic flags as
 * a catastrophic-backtracking risk.
 *
 * `isTerminator` receives (line, index, lines) so a rule can look ahead; the
 * extra arguments are ignored by single-argument terminators.
 *
 * `options.fenceAware` skips header matches inside fences and `options.pickBest`
 * selects among multiple matches -- both from #2523, where a body that
 * *discusses* the header format shadowed its own declaration. Defaults
 * reproduce the original first-match, fence-blind behavior exactly.
 *
 * @param {string} body
 * @param {(line: string) => boolean} isHeader
 * @param {(line: string, index: number, lines: string[]) => boolean} isTerminator
 * @param {{ fenceAware?: boolean, pickBest?: ((section: string) => boolean)|null }} [options]
 * @returns {string} the section body, or '' when no header matched
 */
function extractSection(body, isHeader, isTerminator, options = {}) {
  const { fenceAware = false, pickBest = null } = options;
  if (!body || typeof body !== 'string') return '';
  const lines = splitLines(body);
  const mask = fenceAware ? computeFenceMask(lines) : null;

  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    if (mask && mask[i]) continue;
    if (isHeader(lines[i])) starts.push(i);
  }
  if (starts.length === 0) return '';

  const sections = starts.map((start) => {
    const collected = [];
    for (let j = start + 1; j < lines.length; j++) {
      // A terminator quoted inside a fence must not end the section -- the
      // header search already ignores fences, and a half-fence-aware scan is
      // the bug this module exists to remove.
      if (!(mask && mask[j]) && isTerminator(lines[j], j, lines)) break;
      collected.push(lines[j]);
    }
    return collected.join('\n');
  });

  if (pickBest) {
    const chosen = sections.find(pickBest);
    if (chosen !== undefined) return chosen;
  }
  return sections[0];
}

/**
 * True when `isHeader` matches a line outside any fence.
 *
 * Replaces the second, duplicate fence loop that `scope-drift-check.js`
 * carried in `hasFilesToModifyHeader`.
 *
 * @param {string} body
 * @param {(line: string) => boolean} isHeader
 * @returns {boolean}
 */
function hasHeader(body, isHeader) {
  if (!body || typeof body !== 'string') return false;
  const lines = splitLines(body);
  const mask = computeFenceMask(lines);
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) continue;
    if (isHeader(lines[i])) return true;
  }
  return false;
}

// ─── Checkbox scanning ───

const CHECKBOX_RE = /^\s*-\s*\[([ xX])\]\s*(.*)$/;

/**
 * Match one line as a checkbox, or return null.
 *
 * Exported for callers that already carry their own section-anchoring loop and
 * only need the checkbox definition to be shared -- `generate-test-plan.js` and
 * `mockup-ac-generator.js` each scope to an acceptance-criteria section by
 * different rules, and replacing those rules wholesale would change behaviour
 * their consumers depend on. Pairing this with `computeFenceMask` gives them
 * fence awareness without touching their section semantics.
 *
 * @param {string} line
 * @returns {{ text: string, checked: boolean }|null}
 */
function matchCheckboxLine(line) {
  if (typeof line !== 'string') return null;
  const m = line.match(CHECKBOX_RE);
  return m ? { text: m[2].trim(), checked: m[1] !== ' ' } : null;
}

/**
 * Every checkbox line outside a fence, in document order.
 *
 * @param {string} text
 * @returns {Array<{ text: string, checked: boolean, line: number }>}
 */
function scanCheckboxes(text) {
  if (!text || typeof text !== 'string') return [];
  const lines = splitLines(text);
  const mask = computeFenceMask(lines);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) continue;
    const box = matchCheckboxLine(lines[i]);
    if (!box) continue;
    out.push({ ...box, line: i });
  }
  return out;
}

// ─── Acceptance-criteria section ───

/**
 * The heading forms this repo actually emits. Anchoring on the bold form alone
 * returns ZERO criteria for every story, because the canonical story template
 * (`/add-story` Phase 3) emits the `###` form -- a worse failure than the
 * overcount, since every downstream gate then passes vacuously.
 *
 * `terminator` per form:
 *   bold     ends at the next `**bold**` marker or any `##`/`###` heading
 *   heading  ends at the next heading of the SAME OR HIGHER level, or at a
 *            `**bold**` marker -- `**Files to modify:**` immediately follows
 *            `### Acceptance Criteria` in the story template, so the bold
 *            terminator is the common case here, not an edge case
 *
 * Exported so a structural test can assert this list against a sweep of what
 * `CommandsSrc/` and `Templates/` emit, catching a fourth form before it
 * silently returns zero.
 */
const ACCEPTANCE_CRITERIA_HEADINGS = [
  { id: 'bold', pattern: /^\s*\*\*acceptance criteria:?\*\*\s*$/, level: null },
  { id: 'h3', pattern: /^\s*###\s+acceptance criteria\s*$/, level: 3 },
  { id: 'h2', pattern: /^\s*##\s+acceptance criteria\s*$/, level: 2 },
  // #2697. /create-backlog names the epic section "Success Criteria", so an
  // epic reached every heading-anchored consumer with ZERO visible criteria
  // — and rule 08 Step 3 notes an empty AC list passes downstream gates
  // VACUOUSLY rather than by succeeding, which on epics was the normal case.
  //
  // Extending the parser was chosen over renaming the section: a rename
  // strands every PRD and every epic already authored against the current
  // heading, none of which this retrofits.
  //
  // Global by design, not by accident: any body carrying this heading now
  // yields criteria, not only epics. A section named for criteria should
  // parse as criteria wherever it appears.
  { id: 'success-h2', pattern: /^\s*##\s+success criteria\s*$/, level: 2 }
];

function headingLevel(line) {
  const m = line.match(/^\s*(#{1,6})\s+\S/);
  return m ? m[1].length : null;
}

/**
 * True only for a bold SECTION HEADER — a bold run alone on its line.
 *
 * The distinction is load-bearing and cost a real regression to find. The
 * terminator must fire on `**Files to modify:**`, which follows
 * `### Acceptance Criteria` in the story template. It must NOT fire on an
 * inline bold lead-in such as
 * `**Scope note (verified):** a sweep of CommandsSrc/ ...`, which appears
 * INSIDE the acceptance-criteria section of real stories.
 *
 * Matching merely "starts with **" terminated #2505's section at its first
 * line and returned ZERO criteria — the vacuous-pass failure this module was
 * written to prevent, reintroduced by the fix. Requiring the bold run to be the
 * whole line separates a header from a sentence that begins boldly.
 *
 * @param {string} line
 * @returns {boolean}
 */
function isBoldMarker(line) {
  return /^\s*\*\*[^*]+\*\*:?\s*$/.test(line);
}

/**
 * Acceptance criteria scoped to their own section and free of fenced quotes.
 *
 * Returns `sectionFound` alongside the items so a caller can tell "this issue
 * has no acceptance-criteria section" from "it has one that parsed to nothing".
 * Without that signal a proposal issue -- which correctly has none -- is
 * indistinguishable from a story whose parse silently failed. Follows
 * `extractFilesToModifySection`'s `{ paths, sectionFound }` (#2523 Mode 3)
 * rather than inventing a convention.
 *
 * @param {string|null|undefined} body
 * @returns {{ items: Array<{ text: string, checked: boolean }>, sectionFound: boolean }}
 */
function extractAcceptanceCriteria(body) {
  if (!body || typeof body !== 'string') return { items: [], sectionFound: false };

  for (const form of ACCEPTANCE_CRITERIA_HEADINGS) {
    const isHeader = (line) => form.pattern.test(line.toLowerCase());
    if (!hasHeader(body, isHeader)) continue;

    const isTerminator = (line) => {
      const level = headingLevel(line);
      if (level !== null) {
        // The bold form has no level of its own, so any heading ends it.
        return form.level === null ? true : level <= form.level;
      }
      return isBoldMarker(line);
    };

    const section = extractSection(body, isHeader, isTerminator, { fenceAware: true });
    return {
      items: scanCheckboxes(section).map(({ text, checked }) => ({ text, checked })),
      sectionFound: true
    };
  }

  return { items: [], sectionFound: false };
}

module.exports = {
  computeFenceMask,
  extractSection,
  isBoldMarker,
  hasHeader,
  matchCheckboxLine,
  scanCheckboxes,
  extractAcceptanceCriteria,
  ACCEPTANCE_CRITERIA_HEADINGS
};
