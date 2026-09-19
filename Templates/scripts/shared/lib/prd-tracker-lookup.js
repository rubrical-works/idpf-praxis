// Rubrical Works (c) 2026
/**
 * @framework-script 0.104.0
 * @description Resolve the PRD tracker issue for a test-plan approval issue. Exports resolvePrdTracker(). Tries the explicit PRD Tracker marker, then a tracker referencing the approval issue, then the PRD file path. Never throws; a miss is a not-found result.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * prd-tracker-lookup.js
 *
 * THE LINK RUNS THE WRONG WAY, which is the whole reason this is not a regex.
 *
 * A test-plan approval issue cites the PRD **file** (`**PRD:** PRD/{name}/
 * PRD-{name}.md`), not the tracker issue. The tracker cites the approval issue
 * (`- [ ] Test plan approved (see #{n})`). So resolving tracker-from-approval
 * means searching the other side, and there is no single field to read.
 *
 * WHY THREE STRATEGIES AND NOT ONE
 *
 *   marker    — `**PRD Tracker:** #N` in the approval body. Exact, free, and
 *               the only one that cannot mis-resolve. Usually ABSENT today:
 *               `/create-prd` does not write it into the approval issue, and
 *               making it do so is deliberately out of scope for #2786, since
 *               every existing approval issue would still lack it. When it is
 *               there, nothing else runs.
 *   reference — a `prd`-labelled issue whose body names this approval issue.
 *               The link the tracker template actually writes.
 *   path      — a `prd`-labelled issue whose body names the same PRD file.
 *               Weakest: two trackers for one PRD path would both match, so
 *               it runs last and reports the ambiguity rather than picking.
 *
 * NEVER THROWS. The caller is a command spec that must report and continue —
 * a test plan whose PRD tracker cannot be found is not a reason to refuse the
 * review (Extract Mode PRDs have no tracker at all). A miss returns
 * `tracker: null` with a reason; a failed search returns `ok: false` with the
 * error, and those two are kept distinct because they mean different things:
 * "there is no tracker" versus "we could not look".
 */

'use strict';

/** Matches the explicit marker `work-preamble.js` parsePrdTracker also reads. */
const MARKER = /\*\*PRD Tracker:\*\*\s*#(\d+)/;

/** Matches the `**PRD:** <path>` citation in an approval issue body. */
const PRD_PATH = /\*\*PRD:\*\*\s*(\S+)/;

/**
 * Default search: every `prd`-labelled issue, open or closed.
 *
 * Closed included on purpose — a PRD tracker is routinely closed once its
 * backlog is created, and a closed tracker's review state is exactly as
 * relevant to a test plan derived from it as an open one's.
 */
function defaultRunGh() {
  const { execFileSync } = require('child_process');
  try {
    // BOUNDED (#2469). This runs inside a review command's critical path, so
    // an unbounded spawn freezes the review with no feedback and no upper
    // bound — and a timeout here is not a failure mode worth avoiding: it
    // resolves to `ok: false`, which the gate reports and proceeds past.
    const out = execFileSync('gh', [
      'issue', 'list', '--label', 'prd', '--state', 'all',
      '--limit', '200', '--json', 'number,body'
    ], { encoding: 'utf-8', timeout: 15000 });
    return { ok: true, issues: JSON.parse(out) };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

const result = (over) => Object.assign({
  ok: true,
  tracker: null,
  strategy: null,
  prdPath: null,
  candidates: [],
  reason: '',
  warnings: []
}, over);

/**
 * @param {object} [input]
 * @param {number|string} [input.approvalIssue] The test-plan approval issue number.
 * @param {string} [input.body] That issue's body.
 * @param {Function} [input.runGh] Injectable search, for tests.
 * @returns {{ok: boolean, tracker: number|null, strategy: string|null,
 *            prdPath: string|null, candidates: number[], reason: string,
 *            warnings: string[]}}
 */
function resolvePrdTracker(input) {
  const args = input || {};
  const body = typeof args.body === 'string' ? args.body : '';
  const approval = Number(args.approvalIssue);
  const runGh = typeof args.runGh === 'function' ? args.runGh : defaultRunGh;

  // ── 1. Explicit marker. Exact, so nothing else is consulted. ──
  const marked = body.match(MARKER);
  if (marked) {
    return result({
      tracker: parseInt(marked[1], 10),
      strategy: 'marker',
      prdPath: (body.match(PRD_PATH) || [])[1] || null,
      reason: 'Approval issue names its PRD tracker explicitly.'
    });
  }

  const prdPath = (body.match(PRD_PATH) || [])[1] || null;

  // Nothing to search on: no marker, no approval number, no path.
  if (!Number.isFinite(approval) && !prdPath) {
    return result({ reason: 'No PRD tracker could be resolved — the approval issue names neither a tracker nor a PRD path.' });
  }

  const search = runGh();
  if (!search || search.ok !== true || !Array.isArray(search.issues)) {
    const error = (search && search.error) || 'PRD tracker search returned no usable result.';
    return result({
      ok: false,
      prdPath,
      reason: 'The PRD tracker search could not be completed.',
      warnings: [error]
    });
  }

  const issues = search.issues.filter((i) => i && Number.isFinite(Number(i.number)));

  // ── 2. A tracker referencing this approval issue. ──
  if (Number.isFinite(approval)) {
    const ref = new RegExp(`#${approval}(?!\\d)`);
    const hits = issues.filter((i) => ref.test(String(i.body || '')));
    if (hits.length > 0) {
      return result({
        tracker: Number(hits[0].number),
        strategy: 'reference',
        prdPath,
        candidates: hits.map((i) => Number(i.number)),
        reason: `PRD tracker #${hits[0].number} references approval issue #${approval}.`
      });
    }
  }

  // ── 3. The PRD file path. Weakest, so it runs last and names ambiguity. ──
  if (prdPath) {
    const hits = issues.filter((i) => String(i.body || '').includes(prdPath));
    if (hits.length > 0) {
      const candidates = hits.map((i) => Number(i.number));
      return result({
        tracker: Number(hits[0].number),
        strategy: 'path',
        prdPath,
        candidates,
        reason: hits.length === 1
          ? `PRD tracker #${hits[0].number} names the same PRD path.`
          : `${hits.length} PRD trackers name ${prdPath}; using #${hits[0].number}. Verify before relying on the gate verdict.`,
        warnings: hits.length > 1 ? ['ambiguous-path-match'] : []
      });
    }
  }

  return result({
    prdPath,
    reason: 'No PRD tracker was found for this approval issue — it may be an Extract Mode PRD, which creates none.'
  });
}

module.exports = { resolvePrdTracker, MARKER, PRD_PATH };

if (require.main === module) {
  console.log('prd-tracker-lookup.js — no standalone execution');
}
