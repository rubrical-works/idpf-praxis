// Rubrical Works (c) 2026
/**
 * @framework-script 0.112.0
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

// Outside the .tmp- namespace (#3063): the startup scratch sweep collects
// every .tmp-* file after 24h, so a long /work run lost its gate decisions.
const LEDGER_FILENAME = '.claude/.announce-ledger.jsonl';
// The pre-#3063 name, still read for one release and folded into the new
// file by the first update.
const LEGACY_LEDGER_FILENAME = '.tmp-announce-ledger.jsonl';

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
/**
 * Branch-operation notices (#2960): `/merge-branch`, `/prepare-beta`,
 * `/prepare-release` and `/destroy-branch` announce before their first
 * irreversible step. Record-only and non-pairing, like the review events: a
 * closer would have to fire on every abort path — a failed `gh pr merge`, a
 * declined `/destroy-branch` confirmation — and #2790 is the recorded case of a
 * closer skipped on exactly such a path.
 *
 * The one difference: a branch operation may run with no tracker issue, so an
 * entry may be keyed by `branch` instead. The /work events never may.
 */
const BRANCH_OPERATION_EVENTS = Object.freeze([
  'branch-merge-starting',
  'beta-starting',
  'release-starting',
  'branch-destroy-starting',
]);

/**
 * The /done push group (#2972). Record-only for the reason the review events
 * are: what they need is the record — composed, dispatch outcome, receipt —
 * not a pairing verdict. Their own "every opener has one closer" property is
 * `/done`'s single `groups.push` gate, which a ledger audit would restate
 * with a second, weaker definition.
 */
const PUSH_EVENTS = Object.freeze([
  'push-started',
  'ci-terminal',
  'ci-resolved',
  'push-rejected',
]);

/**
 * /work gate bookkeeping (#3271), record-only like the review events. A
 * `work-invocation` marks where one /work run on a root began for a session; a
 * `gate-decision` records a per-sub-issue Review-State or Pre-Work Status
 * decision. Neither is announced and neither enters the pairing.
 */
const GATE_EVENTS = Object.freeze(['work-invocation', 'gate-decision']);

const RECORD_ONLY_EVENTS = Object.freeze([
  'review-started',
  'review-passed',
  'review-findings',
  'review-resolved',
  ...BRANCH_OPERATION_EVENTS,
  ...PUSH_EVENTS,
  ...GATE_EVENTS,
]);

const DISPATCH_STATES = Object.freeze(['pending', 'sent', 'failed', 'skipped']);

/**
 * The RECEIPT axis (#2922), separate from dispatch and never folded into it.
 *
 * `dispatch: 'sent'` means the SendMessage call succeeded; it says nothing
 * about whether the receiver read the message (#2674). A receipt reply from a
 * live /overwatch is the one case where that becomes observable, and only
 * for that hop. `sent` + `unconfirmed` and `sent` + `received` are different
 * facts, so collapsing them would throw away the distinction this axis exists
 * to record.
 */
const RECEIPT_STATES = Object.freeze(['unconfirmed', 'received']);

/** Dispatch states that mean "this announcement did not go out". */
const NOT_DISPATCHED = Object.freeze(['pending', 'failed']);

/**
 * Dispatch states `record()` may write at composition time (#2990). `pending`
 * is a composition that is dispatchable and not yet closed out; `skipped` is
 * one that resolved `shouldSend: false` and so has nothing to close out. `sent`
 * and `failed` describe a send that has not happened when composing, so they
 * are refused here and reach an entry only through `updateDispatch`.
 */
const COMPOSITION_STATES = Object.freeze(['pending', 'skipped']);

function ledgerPath(cwd = process.cwd()) {
  return path.join(cwd, LEDGER_FILENAME);
}

function legacyLedgerPath(cwd = process.cwd()) {
  return path.join(cwd, LEGACY_LEDGER_FILENAME);
}

/**
 * Create `.claude/` under the working directory when it is missing — and only
 * that one level, so a working directory that does not exist still fails the
 * write rather than being created by it.
 */
function ensureLedgerDir(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
}

/**
 * Status-update rows (#3346). A dispatch or receipt outcome is APPENDED as one
 * of these, `ref` naming the entry it updates, and readLedger() folds it onto
 * that entry — last update wins per id. They are never entries themselves and
 * never counted malformed.
 *
 * Why append rather than rewrite: the ledger is shared by every session in the
 * working directory, and a read-modify-write of the whole file dropped any row
 * another session appended between the read and the write, tore the file for a
 * concurrent reader, and deleted every malformed line it could not parse. An
 * append touches no existing line. (The pre-#3063 legacy file is still read but
 * no longer folded into the new one: that fold was itself a whole-file write.)
 */
const DISPATCH_UPDATE = 'dispatch-update';
const RECEIPT_UPDATE = 'receipt-update';
const UPDATE_EVENTS = Object.freeze([DISPATCH_UPDATE, RECEIPT_UPDATE]);

/** Append one update row; `beforeWrite` is a test seam for the interleaving case. */
function appendUpdate(row, options = {}) {
  if (typeof options._beforeWrite === 'function') options._beforeWrite();
  const file = ledgerPath(options.cwd || process.cwd());
  ensureLedgerDir(file);
  fs.appendFileSync(file, `${JSON.stringify({ id: newId(), ts: new Date().toISOString(), ...row })}\n`, 'utf8');
}

/** Apply one update row to the entry it references. */
function foldUpdate(entry, update) {
  if (update.event === DISPATCH_UPDATE) {
    entry.dispatch = update.dispatch;
    if (Object.prototype.hasOwnProperty.call(update, 'detail')) entry.detail = update.detail;
  } else if (update.event === RECEIPT_UPDATE) {
    entry.receipt = 'received';
    entry.receiptFrom = update.receiptFrom;
    entry.receiptAt = update.receiptAt;
  }
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
/**
 * The owning session's pid, or `null` when the caller could not identify one
 * (#2896).
 *
 * No `process.pid` fallback. Inside announce.js that is a child process that
 * lives for one announcement, so every entry got a unique value and
 * `reconcile`'s multi-session caveat fired after any two announcements — true
 * of no single-session run, and identical in output to the real case. And no
 * `Number(...)` coercion guard: `Number(null)` is `0`, so an explicit `null`
 * used to be recorded as a pid. `reconcile` already filters to finite values,
 * so a `null` entry cannot manufacture a second session.
 */
function normalizeSessionPid(value) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

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
    const dispatch = entry.dispatch === undefined ? 'pending' : entry.dispatch;
    if (!COMPOSITION_STATES.includes(dispatch)) {
      return {
        ok: false,
        error: `Initial dispatch ${JSON.stringify(dispatch)} cannot be recorded at composition time — `
          + `expected one of ${COMPOSITION_STATES.join(', ')}; close a send out with updateDispatch.`,
      };
    }
    const issues = normalizeIssues(entry.issues);
    const branch = BRANCH_OPERATION_EVENTS.includes(event) && typeof entry.branch === 'string' && entry.branch.trim()
      ? entry.branch.trim()
      : null;
    if (issues.length === 0 && !branch) {
      return {
        ok: false,
        error: BRANCH_OPERATION_EVENTS.includes(event)
          ? 'No usable issue number or branch on the entry.'
          : 'No usable issue number on the entry.',
      };
    }

    const row = {
      id: newId(),
      ts: new Date().toISOString(),
      event,
      issues,
      sessionPid: normalizeSessionPid(options.sessionPid),
      // `pending` unless the caller composed a shouldSend:false announcement,
      // which is `skipped` from birth with its reason in `detail` (#2990).
      dispatch,
      // Composed is neither dispatched nor received; both axes start pessimistic.
      receipt: 'unconfirmed',
      detail: typeof entry.detail === 'string' && entry.detail ? entry.detail : null,
    };
    if (recordOnly) row.recordOnly = true;
    if (branch) row.branch = branch;
    // #3271: the gate bookkeeping fields, only on the events that carry them.
    if (GATE_EVENTS.includes(event)) {
      if (Number.isInteger(entry.root)) row.root = entry.root;
      if (typeof entry.gate === 'string') row.gate = entry.gate;
      if (typeof entry.decision === 'string') row.decision = entry.decision;
    }

    const file = ledgerPath(options.cwd || process.cwd());
    ensureLedgerDir(file);
    fs.appendFileSync(file, `${JSON.stringify(row)}\n`, 'utf8');
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
  const cwd = options.cwd || process.cwd();
  const file = ledgerPath(cwd);
  const includeRecordOnly = options.includeRecordOnly === true;
  const empty = { entries: [], malformed: 0, exists: false, path: file };
  let raw = '';
  try {
    // Legacy rows first: they were written before any row under the new name.
    const present = [legacyLedgerPath(cwd), file].filter((p) => fs.existsSync(p));
    if (present.length === 0) return empty;
    raw = present.map((p) => fs.readFileSync(p, 'utf8')).join('\n');
  } catch (err) {
    return { ...empty, error: err && err.message ? err.message : 'ledger read failed' };
  }

  const rows = [];
  const updates = [];
  let malformed = 0;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      const isRow = parsed && typeof parsed === 'object';
      if (isRow && TRACKED_EVENTS.includes(parsed.event)) rows.push(parsed);
      else if (isRow && RECORD_ONLY_EVENTS.includes(parsed.event)) rows.push(parsed);
      else if (isRow && UPDATE_EVENTS.includes(parsed.event) && typeof parsed.ref === 'string') updates.push(parsed);
      else malformed += 1;
    } catch {
      malformed += 1;
    }
  }
  // Fold every update onto its entry, in file order, BEFORE filtering, so a
  // record-only entry's updates apply whether or not it is returned (#3346).
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const u of updates) {
    const target = byId.get(u.ref);
    if (target) foldUpdate(target, u);
  }
  const entries = includeRecordOnly ? rows : rows.filter((r) => TRACKED_EVENTS.includes(r.event));
  return { entries, malformed, exists: true, path: file };
}

/**
 * Close out a recorded announcement with what actually happened to the send.
 *
 * Appends a `dispatch-update` row that readLedger() folds onto the entry
 * (#3346), so the question the audit asks — "what became of this opener" — is
 * still a lookup on the folded entry, and no other session's row is touched.
 * It used to rewrite the whole file, which lost concurrently appended rows.
 *
 * Reads record-only entries too (#2871), so a review entry is closable here.
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
  if (!entries.some((e) => e.id === id)) return { ok: false, error: `No ledger entry with id ${JSON.stringify(id)}.` };

  const row = { event: DISPATCH_UPDATE, ref: id, dispatch: result };
  if (outcome.detail !== undefined) row.detail = outcome.detail;
  try {
    appendUpdate(row, options);
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : 'ledger write failed' };
  }
}

/**
 * Record that a receipt reply arrived for one announcement (#2922).
 *
 * Touches the receipt axis only — a reply says the monitor read the message,
 * not that the send succeeded differently than recorded. An unknown id is
 * REFUSED and names itself, for the same reason updateDispatch refuses one:
 * applying it to the most recent entry would attribute a receipt to whichever
 * announcement happened to be last.
 */
function updateReceipt(id, details = {}, options = {}) {
  const { entries, exists } = readLedger({ ...options, includeRecordOnly: true });
  if (!exists) return { ok: false, error: 'No ledger to update.' };
  if (!entries.some((e) => e.id === id)) return { ok: false, error: `No ledger entry with id ${JSON.stringify(id)}.` };

  try {
    appendUpdate({
      event: RECEIPT_UPDATE,
      ref: id,
      receiptFrom: typeof details.from === 'string' && details.from.trim() !== '' ? details.from.trim() : null,
      receiptAt: new Date().toISOString(),
    }, options);
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : 'ledger write failed' };
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
/**
 * Mark the start of one /work invocation on `root` for this session (#3271).
 * Gate decisions recorded after it belong to this invocation.
 */
function recordInvocation({ root }, options = {}) {
  return record({ event: 'work-invocation', issues: [root], root, dispatch: 'skipped' }, options);
}

/** The decisions each recorded gate accepts — rule 08 Step 3 (#3294 F26). */
const GATE_DECISIONS = Object.freeze({
  'review-state': Object.freeze(['proceed', 'declined', 'stop', 'halt']),
  'pre-work-status': Object.freeze(['moved', 'already']),
});

/** Record one per-sub-issue gate decision for the current invocation (#3271). */
function recordGateDecision({ issue, gate, decision, root }, options = {}) {
  return record({ event: 'gate-decision', issues: [issue], root, gate, decision, dispatch: 'skipped' }, options);
}

/**
 * This invocation's recorded decision for `gate` on `issue`, or null (#3271).
 * "This invocation" is everything this session recorded for `root` after its
 * latest `work-invocation` — so a decision survives compaction (the run does
 * not record a new start), and a fresh /work run asks again.
 */
function findGateDecision({ entries, issue, gate, root, sessionPid }) {
  // A null pid is every session's pid: matching on it would let concurrent
  // sessions reuse each other's decisions (#3294 F25), so nothing is reused.
  if (sessionPid == null) return null;
  const hits = invocationWindow({ entries, root, sessionPid })
    .filter((e) => e.event === 'gate-decision' && e.gate === gate && Array.isArray(e.issues) && e.issues.includes(issue));
  return hits.length ? hits[hits.length - 1] : null;
}

/**
 * The entries recorded for `root` after its latest `work-invocation` — one
 * /work run's window (#3271). A known `sessionPid` narrows it to that
 * session; null leaves every session's entries in (#3294 F7). No invocation
 * recorded → an empty window.
 */
function invocationWindow({ entries, root, sessionPid = null }) {
  const mine = (Array.isArray(entries) ? entries : [])
    .filter((e) => e && e.root === root && (sessionPid == null || e.sessionPid === sessionPid));
  let start = -1;
  mine.forEach((e, i) => { if (e.event === 'work-invocation') start = i; });
  return start === -1 ? [] : mine.slice(start + 1);
}

function reconcile({ entries, issues, workEnabled = false } = {}) {
  const list = (Array.isArray(entries) ? entries : [])
    .filter((e) => e && TRACKED_EVENTS.includes(e.event));
  const wanted = normalizeIssues(issues);

  const paired = [];
  const missingOpener = [];
  const missingCloser = [];
  const unrecorded = [];
  const undispatched = [];
  const skipped = [];

  for (const issue of wanted) {
    const mine = list.filter((e) => Array.isArray(e.issues) && e.issues.includes(issue));
    const openers = mine.filter((e) => e.event === OPENER);
    const closers = mine.filter((e) => e.event === CLOSER);

    for (const e of mine) {
      if (NOT_DISPATCHED.includes(e.dispatch)) {
        undispatched.push({ issue, event: e.event, dispatch: e.dispatch, detail: e.detail || null, id: e.id });
      } else if (e.dispatch === 'skipped') {
        // Never a warning — nothing was meant to be sent (#2990). Counted so a
        // run whose every composition was skipped says so rather than falling
        // silent, which would read the same as a ledger never written.
        skipped.push({ issue, event: e.event, detail: e.detail || null, id: e.id });
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
  // #3271: with groups.work on, every processed child composes both events —
  // a `skipped` record when no peer listens. Neither recorded is the
  // doubly-missing case, which read like groups.work:false and passed.
  const unrecordedIsFinding = workEnabled === true && unrecorded.length > 0;
  if (unrecordedIsFinding) {
    problems.push(`no work-started or work-completed recorded for ${unrecorded.map((n) => `#${n}`).join(', ')} although groups.work is on`);
  }

  const ok = missingOpener.length === 0 && missingCloser.length === 0 && undispatched.length === 0 && !unrecordedIsFinding;

  return {
    ok,
    paired,
    missingOpener,
    missingCloser,
    unrecorded,
    undispatched,
    skipped,
    sessionPids,
    caveats,
    message: ok
      ? `Announcement pairing OK (${paired.length} paired, ${unrecorded.length} unrecorded, ${skipped.length} skipped — nothing to send).`
      : `Announcement pairing: ${problems.join('; ')}. ${skipped.length} skipped — nothing to send. Advisory only — does not block.`,
  };
}

module.exports = {
  LEDGER_FILENAME,
  LEGACY_LEDGER_FILENAME,
  TRACKED_EVENTS,
  RECORD_ONLY_EVENTS,
  BRANCH_OPERATION_EVENTS,
  PUSH_EVENTS,
  UPDATE_EVENTS,
  DISPATCH_STATES,
  OPENER,
  CLOSER,
  ledgerPath,
  normalizeSessionPid,
  record,
  readLedger,
  updateDispatch,
  updateReceipt,
  RECEIPT_STATES,
  reconcile,
  GATE_EVENTS,
  recordInvocation,
  recordGateDecision,
  findGateDecision,
  invocationWindow,
  GATE_DECISIONS,
  cli,
};

/**
 * CLI for the /work gate bookkeeping (#3271). The session pid is CLAUDE_PID,
 * the source announce.js uses, so entries match across one session.
 *   invocation --root R                       mark the start of a /work run
 *   gate --issue N --gate G --root R --decision D   record a decision
 *   gate --issue N --gate G --root R          look one up: {"decision": ...|null}
 */
function cli(argv, env = process.env, cwd = process.cwd()) {
  const [cmd, ...rest] = argv;
  const opt = {};
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('--')) continue;
    // A missing value must not swallow the next flag (#3294 F26).
    const value = rest[i + 1];
    if (value === undefined || value.startsWith('--')) return { ok: false, error: `${rest[i]} requires a value` };
    opt[rest[i].slice(2)] = value;
    i++;
  }
  const options = { cwd, sessionPid: normalizeSessionPid(env.CLAUDE_PID) };
  const root = Number(opt.root);
  if (!Number.isInteger(root) || root <= 0) return { ok: false, error: '--root <issue> is required' };
  if (cmd === 'invocation') return recordInvocation({ root }, options);
  if (cmd === 'gate') {
    const issue = Number(opt.issue);
    if (!Number.isInteger(issue) || !opt.gate) return { ok: false, error: '--issue <N> and --gate <name> are required' };
    const allowed = GATE_DECISIONS[opt.gate];
    if (!allowed) return { ok: false, error: `unknown gate ${JSON.stringify(opt.gate)}; expected one of ${Object.keys(GATE_DECISIONS).join(', ')}` };
    if (opt.decision !== undefined && !allowed.includes(opt.decision)) {
      return { ok: false, error: `--decision for ${opt.gate} must be one of ${allowed.join(', ')}` };
    }
    if (opt.decision) return recordGateDecision({ issue, gate: opt.gate, decision: opt.decision, root }, options);
    const found = findGateDecision({ entries: readLedger({ cwd, includeRecordOnly: true }).entries, issue, gate: opt.gate, root, sessionPid: options.sessionPid });
    return { ok: true, decision: found ? found.decision : null };
  }
  return { ok: false, error: `unknown command ${JSON.stringify(cmd)}; expected invocation or gate` };
}

if (require.main === module) {
  const result = cli(process.argv.slice(2));
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(result.ok ? 0 : 1);
}
