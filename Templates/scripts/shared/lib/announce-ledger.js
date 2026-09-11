// Rubrical Works (c) 2026
/**
 * @framework-script 0.102.0
 *
 * Sender-side record of peer announcements, and the opener/closer
 * reconciliation over it (#2790).
 *
 * WHY THIS EXISTS. Symptom 1 of #2790 was a `work-completed` for sub-issue
 * #1165 with no matching `work-started`, among twelve sub-issues of one
 * `--nonstop` run. Nothing could say which side had failed: #2674 establishes
 * that dispatch is not delivery, so "the sender never composed an opener",
 * "the sender composed one and the send failed" and "the receiver held,
 * declined or expired it" are three different facts that reach an observer as
 * the same silence. The receiving side cannot separate them and never will —
 * the registry exposes no permission, mode or approval field.
 *
 * What CAN be separated is the first two from the third, and only the sender
 * is positioned to do it. This file is that record. It answers exactly one
 * question — did this working directory compose an opener for #N, and what
 * became of the send — and deliberately answers nothing about delivery, which
 * stays unknowable by design.
 *
 * WHY A FILE RATHER THAN THE ISSUE BODY. The record has to survive the run
 * that wrote it without mutating anything a human reads. An issue-body marker
 * would put advisory bookkeeping into the permanent record of what shipped,
 * and would need a `gh` round trip per event inside a sequence whose whole
 * contract is that it never blocks. A gitignored `.tmp-*` file costs an append.
 *
 * SCOPE, and it is the same shape as `/idpf-measure`'s tap. The file is
 * project-scoped with no per-session form, so every session in the working
 * directory appends to it. Reconciliation therefore names the session pids it
 * saw rather than pretending it isolated one — see `reconcile`.
 *
 * RECORD-ONLY ENTRIES (#2871). The review events are recorded too, so a
 * review announcement composed but never sent is as attributable as a /work
 * one — but they are never reconciled. They carry `recordOnly: true`, a
 * default read leaves them out, and `reconcile` ignores them even when handed
 * them, so the /work pairing audit reads exactly what it read before.
 *
 * Runtime dependency contract: Node built-ins only.
 */

const fs = require('fs');
const path = require('path');

const LEDGER_FILENAME = '.tmp-announce-ledger.jsonl';

/**
 * The events this ledger tracks, and only these.
 *
 * Deliberately NOT `Object.values(EVENTS)` from `peer-announce.js`. The
 * pairing contract this file exists to check is the /work one — every opener
 * has exactly one closer, per sub-issue (#2699). The review and CI events have
 * their own pairing rules (`review-findings` is non-terminal, `armed` stopped
 * being terminal in #2716), so folding them in would give one reconciliation
 * three incompatible notions of "paired".
 */
const OPENER = 'work-started';
const CLOSER = 'work-completed';
const TRACKED_EVENTS = Object.freeze([OPENER, CLOSER]);

/**
 * Events recorded for attribution but never reconciled (#2871).
 *
 * `Construction/Design-Decisions/2026-09-06-announcement-integrity-seams.md`
 * declined one ledger reconciling every event, for the reason given above
 * TRACKED_EVENTS, and that decision stands: these are NOT added to it. What the
 * review events needed was the record — whether an announcement was composed
 * and what became of its send — not a pairing verdict with a meaning of
 * "paired" that does not fit them.
 */
const RECORD_ONLY_EVENTS = Object.freeze([
  'review-started',
  'review-passed',
  'review-findings',
  'review-resolved',
]);

const DISPATCH_STATES = Object.freeze(['pending', 'sent', 'failed', 'skipped']);

/** Dispatch states that mean "this announcement did not go out". */
const NOT_DISPATCHED = Object.freeze(['pending', 'failed']);

function ledgerPath(cwd = process.cwd()) {
  return path.join(cwd, LEDGER_FILENAME);
}

function newId() {
  // Enough entropy to be unique within one working directory's run, and short
  // enough to paste into a report. No crypto import for a bookkeeping key.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeIssues(issues) {
  if (!Array.isArray(issues)) return [];
  return issues
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * Append one composed announcement.
 *
 * Records `dispatch: 'pending'` — composed is not dispatched, and the two must
 * not collapse. An entry that never reaches `sent` is precisely AC3's failure
 * mode, so the initial state has to be the pessimistic one; starting at 'sent'
 * would make a swallowed dispatch failure indistinguishable from a success.
 *
 * Never throws. This is called from inside the Step 3 gate sequence and the
 * Step 6 STOP sequence, neither of which an advisory record may abort.
 */
function record(entry, options = {}) {
  try {
    const event = entry && entry.event;
    const recordOnly = RECORD_ONLY_EVENTS.includes(event);
    if (!TRACKED_EVENTS.includes(event) && !recordOnly) {
      return {
        ok: false,
        error: `Untracked event ${JSON.stringify(event)} — the ledger records ${TRACKED_EVENTS.join(' and ')}, `
          + `and ${RECORD_ONLY_EVENTS.join(', ')} as record-only.`,
      };
    }
    const issues = normalizeIssues(entry.issues);
    if (issues.length === 0) {
      return { ok: false, error: 'No usable issue number on the entry.' };
    }

    const row = {
      id: newId(),
      ts: new Date().toISOString(),
      event,
      issues,
      sessionPid: Number.isFinite(Number(options.sessionPid)) ? Number(options.sessionPid) : process.pid,
      dispatch: 'pending',
      detail: null,
    };
    if (recordOnly) row.recordOnly = true;

    fs.appendFileSync(ledgerPath(options.cwd || process.cwd()), `${JSON.stringify(row)}\n`, 'utf8');
    return { ok: true, id: row.id, entry: row };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : 'ledger write failed' };
  }
}

/**
 * Read the ledger.
 *
 * `exists: false` and an empty ledger are different facts and stay separate:
 * a project that never armed the channel and one whose entries were cleared
 * both read as zero entries, and only the first has never recorded anything.
 *
 * A malformed line is COUNTED and skipped. The file is appended to by every
 * session in the working directory, so a torn write is a live possibility and
 * must not discard the well-formed lines around it.
 *
 * Record-only entries are left out unless `includeRecordOnly` is set (#2871),
 * and are never counted malformed: they are well-formed rows this reader was
 * simply not asked for. The default is what every pre-#2871 caller receives.
 */
function readLedger(options = {}) {
  const file = ledgerPath(options.cwd || process.cwd());
  const includeRecordOnly = options.includeRecordOnly === true;
  const empty = { entries: [], malformed: 0, exists: false, path: file };
  let raw;
  try {
    if (!fs.existsSync(file)) return empty;
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return { ...empty, error: err && err.message ? err.message : 'ledger read failed' };
  }

  const entries = [];
  let malformed = 0;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      const isRow = parsed && typeof parsed === 'object';
      if (isRow && TRACKED_EVENTS.includes(parsed.event)) entries.push(parsed);
      else if (isRow && RECORD_ONLY_EVENTS.includes(parsed.event)) {
        if (includeRecordOnly) entries.push(parsed);
      } else malformed += 1;
    } catch {
      malformed += 1;
    }
  }
  return { entries, malformed, exists: true, path: file };
}

/**
 * Close out a recorded announcement with what actually happened to the send.
 *
 * Rewrites the whole file rather than appending a second row: the question the
 * audit asks is "what became of this opener", and two rows for one event make
 * that a join rather than a lookup. The file is small — one line per
 * announcement per run — so the rewrite is cheaper than the ambiguity.
 *
 * Reads record-only entries too (#2871). The rewrite is built from what was
 * read, so a tracked-only read would delete every review entry on the first
 * close-out — and a review entry has to be closable here itself.
 *
 * An unknown id is REFUSED, never applied to the most recent entry. Guessing
 * would attribute a failure to whichever announcement happened to be last,
 * which is the misattribution this whole issue is about.
 */
function updateDispatch(id, outcome = {}, options = {}) {
  const result = outcome.result;
  if (!DISPATCH_STATES.includes(result)) {
    return { ok: false, error: `Unknown dispatch result ${JSON.stringify(result)} — expected one of ${DISPATCH_STATES.join(', ')}.` };
  }
  const { entries, exists } = readLedger({ ...options, includeRecordOnly: true });
  if (!exists) return { ok: false, error: 'No ledger to update.' };

  let found = false;
  for (const e of entries) {
    if (e.id === id) {
      e.dispatch = result;
      if (outcome.detail !== undefined) e.detail = outcome.detail;
      found = true;
    }
  }
  if (!found) return { ok: false, error: `No ledger entry with id ${JSON.stringify(id)}.` };

  try {
    const file = ledgerPath(options.cwd || process.cwd());
    fs.writeFileSync(file, entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : 'ledger rewrite failed' };
  }
}

/**
 * Reconcile openers against closers for a known set of issues.
 *
 * FOUR outcomes, and collapsing any two of them is what makes an audit useless:
 *
 *   paired         both events recorded — the expected state
 *   missingOpener  a closer with no opener. THE OBSERVED DEFECT (#1165)
 *   missingCloser  an opener with no closer. The run halted, or was still
 *                  going — reported, but a different problem
 *   unrecorded     neither event recorded. NOT a defect: the channel may be
 *                  off, or the run may predate this ledger. Calling it a
 *                  dropped opener would make the audit cry wolf on every
 *                  project that never enabled messaging
 *
 * `undispatched` is the orthogonal axis and answers AC3 after the fact: an
 * entry composed but left `pending`, or explicitly `failed`, went nowhere.
 * That is a sender-side fact the sender can state, unlike delivery.
 *
 * Tracked events only, whatever it is handed (#2871): a record-only review
 * entry left `pending` would otherwise surface as an undispatched /work
 * announcement, and the audit would change without its caller changing.
 *
 * Never throws — the caller is `nonstop-audit.js`, whose other two audits must
 * still render if this one cannot.
 */
function reconcile({ entries, issues } = {}) {
  const list = (Array.isArray(entries) ? entries : [])
    .filter((e) => e && TRACKED_EVENTS.includes(e.event));
  const wanted = normalizeIssues(issues);

  const paired = [];
  const missingOpener = [];
  const missingCloser = [];
  const unrecorded = [];
  const undispatched = [];

  for (const issue of wanted) {
    const mine = list.filter((e) => Array.isArray(e.issues) && e.issues.includes(issue));
    const openers = mine.filter((e) => e.event === OPENER);
    const closers = mine.filter((e) => e.event === CLOSER);

    for (const e of mine) {
      if (NOT_DISPATCHED.includes(e.dispatch)) {
        undispatched.push({ issue, event: e.event, dispatch: e.dispatch, detail: e.detail || null, id: e.id });
      }
    }

    if (openers.length === 0 && closers.length === 0) unrecorded.push(issue);
    else if (openers.length === 0) missingOpener.push(issue);
    else if (closers.length === 0) missingCloser.push(issue);
    else paired.push(issue);
  }

  const sessionPids = [...new Set(list.map((e) => e.sessionPid).filter((p) => Number.isFinite(p)))];
  const caveats = [];
  if (sessionPids.length > 1) {
    caveats.push(
      `Ledger entries come from more than one session (${sessionPids.join(', ')}); the ledger is project-scoped `
      + 'with no per-session form, so these results are not isolated to one run.'
    );
  }

  const problems = [];
  if (missingOpener.length > 0) {
    problems.push(`no work-started recorded for ${missingOpener.map((n) => `#${n}`).join(', ')} despite a work-completed`);
  }
  if (missingCloser.length > 0) {
    problems.push(`no work-completed recorded for ${missingCloser.map((n) => `#${n}`).join(', ')}`);
  }
  if (undispatched.length > 0) {
    problems.push(`${undispatched.length} announcement(s) composed but not dispatched`);
  }

  const ok = missingOpener.length === 0 && missingCloser.length === 0 && undispatched.length === 0;

  return {
    ok,
    paired,
    missingOpener,
    missingCloser,
    unrecorded,
    undispatched,
    sessionPids,
    caveats,
    message: ok
      ? `Announcement pairing OK (${paired.length} paired, ${unrecorded.length} unrecorded).`
      : `Announcement pairing: ${problems.join('; ')}. Advisory only — does not block.`,
  };
}

module.exports = {
  LEDGER_FILENAME,
  TRACKED_EVENTS,
  RECORD_ONLY_EVENTS,
  DISPATCH_STATES,
  OPENER,
  CLOSER,
  ledgerPath,
  record,
  readLedger,
  updateDispatch,
  reconcile,
};
