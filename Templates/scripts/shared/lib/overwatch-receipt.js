// Rubrical Works (c) 2026
/**
 * @framework-script 0.105.0
 * @description Receipt replies (#2922): the ledger-id suffix an announcement carries, the /overwatch decision to reply to one sender that it received an announcement, and the sender-side parse of that reply. Pure — it composes text and decides; sending stays with the command spec.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * WHY. Under targeted routing (#2915) a working session's announcements go to
 * the live monitor alone, and #2674 establishes that dispatch is not delivery:
 * a monitor that holds, declines or never processes them is undetectable from
 * the sender. The monitor is the one receiver whose job is reading
 * announcements, so it is the one place where replying costs nothing it is not
 * already doing. The reply narrows exactly one gap — whether the monitor
 * received the message — and claims nothing about any session the monitor
 * relays to.
 *
 * NAMING. A *receipt reply*, never an "acknowledgement": rule 03 already uses
 * "one-line acknowledgement" for what a receiving session prints to its own
 * user, and reusing the word would blur local narration with a message sent
 * back to the sender.
 *
 * Node built-ins only — nothing is required here at all.
 */

'use strict';

/** The reply's first-line marker. A reply is recognisable, and never replied to. */
const RECEIPT_PREFIX = 'Receipt from /overwatch:';

/** The overlap notice's marker (overwatch-overlap.js), which is also never replied to. */
const OVERLAP_PREFIX = 'Overlap notice from /overwatch:';

/** `mu39pjrp-olu243ie` — the ledger's own id shape: base36 time, a dash, base36 entropy. */
const LEDGER_ID = /^[A-Za-z0-9-]{3,64}$/;
const SUFFIX = /\s\(ledger: ([A-Za-z0-9-]{3,64})\)\s*$/;

const firstLine = (text) => String(text).split('\n')[0];

function usableId(id) {
  return typeof id === 'string' && LEDGER_ID.test(id.trim()) ? id.trim() : null;
}

/**
 * Stamp a composed announcement with its ledger id.
 *
 * The id goes at the END of the first line so every existing consumer keeps
 * working: the monitor classifies events by the words at the start of the line,
 * and the overlap notice is matched by its own prefix. Idempotent — stamping a
 * text that already carries one changes nothing.
 */
function appendLedgerId(text, id) {
  const body = typeof text === 'string' ? text : '';
  const ledgerId = usableId(id);
  if (!body || !ledgerId) return body;
  const lines = body.split('\n');
  if (SUFFIX.test(lines[0])) return body;
  lines[0] = `${lines[0].replace(/\s+$/, '')} (ledger: ${ledgerId})`;
  return lines.join('\n');
}

/** The ledger id a message carries, from its first line only. */
function parseLedgerId(text) {
  if (typeof text !== 'string' || text === '') return null;
  const m = SUFFIX.exec(firstLine(text));
  return m ? m[1] : null;
}

function issuesIn(text) {
  const found = [];
  const pattern = /#(\d+)\b/g;
  let m;
  while ((m = pattern.exec(firstLine(text))) !== null) {
    const n = Number(m[1]);
    if (!found.includes(n)) found.push(n);
  }
  return found;
}

/**
 * Should the monitor reply to this inbound message, and with what?
 *
 * Accepts only an announcement carrying a ledger id — which is exactly the set
 * `announce.js` records, so a reply always has an entry to be recorded against.
 * Refuses, with a reason: a message from a sender predating the suffix, the
 * monitor's own overlap notice, a receipt reply, and anything with no sender
 * address to reply to.
 *
 * @returns {{reply: boolean, reason: string, to: string|null, ledgerId: string|null, issues: number[], text: string|null}}
 */
function decideReceipt({ text, from, event } = {}) {
  const no = (reason) => ({ reply: false, reason, to: null, ledgerId: null, issues: [], text: null });
  if (typeof text !== 'string' || text.trim() === '') return no('no-text');
  const head = firstLine(text);
  if (head.startsWith(RECEIPT_PREFIX)) return no('receipt-reply');
  if (head.startsWith(OVERLAP_PREFIX)) return no('overlap-notice');
  const ledgerId = parseLedgerId(text);
  if (!ledgerId) return no('no-ledger-id');
  const to = typeof from === 'string' && from.trim() !== '' ? from.trim() : null;
  if (!to) return no('no-sender');

  const issues = issuesIn(text);
  const label = typeof event === 'string' && event.trim() !== '' ? event.trim() : 'announcement';
  const subject = issues.length > 0 ? ` for ${issues.map((n) => `#${n}`).join(', ')}` : '';
  return {
    reply: true,
    reason: 'announcement',
    to,
    ledgerId,
    issues,
    // The id stays at the END of the line, which is where parseLedgerId reads
    // it — so a reply is parseable by the same rule as an announcement.
    text: appendLedgerId(
      `${RECEIPT_PREFIX} received your ${label}${subject} — read, not acted on; this confirms only that the monitor received it.`,
      ledgerId,
    ),
  };
}

/** The sender side: is this inbound message a receipt reply, and for which ledger entry? */
function parseReceipt(text) {
  if (typeof text !== 'string' || !firstLine(text).startsWith(RECEIPT_PREFIX)) {
    return { ok: false, reason: 'not-a-receipt-reply', ledgerId: null };
  }
  const ledgerId = parseLedgerId(text);
  if (!ledgerId) return { ok: false, reason: 'no-ledger-id', ledgerId: null };
  return { ok: true, reason: 'receipt-reply', ledgerId };
}

module.exports = {
  RECEIPT_PREFIX,
  OVERLAP_PREFIX,
  appendLedgerId,
  parseLedgerId,
  decideReceipt,
  parseReceipt,
};
