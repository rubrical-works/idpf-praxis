#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.101.0
 * @description Dedupe and rate-limit guards bounding /hall-monitor's --auto-create (#2768). Pure and synchronous: no I/O, no spawn, no filesystem write, and no throwing path. Decides only WHETHER filing is permitted; the monitor owns the decision to act and performs the filing itself.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

/**
 * WHY THESE GUARDS EXIST (#2768).
 *
 * `--auto-create` files bugs from an unattended loop. Two failure modes follow
 * directly from that, and neither is a judgment call, so both are data in
 * `.claude/metadata/hall-monitor-signals.json` rather than prose in the spec:
 *
 *   DEDUPE     A monitor observing a STANDING condition re-derives the same
 *              finding on every tick. Without dedupe one condition becomes one
 *              issue per tick, indefinitely.
 *
 *   RATE LIMIT An analysis that goes wrong should file a bounded number of
 *              issues, not an unbounded one. The cap is the blast radius.
 *
 * Both are evaluated against state the CALLER supplies. This helper reads no
 * file and writes none: the runtime dependency contract makes an undeclared
 * require a module-load crash, and a guard that can crash the loop it guards
 * has become the outage it was meant to prevent.
 */

/**
 * Why there is no throwing path.
 *
 * `/hall-monitor` is advisory — it observes and reports, and must never abort
 * because a guard disliked its input. Every malformed shape resolves to a
 * refusal carrying a stated reason, the same discipline `peer-announce.js`
 * applies for the same reason.
 */

const DEFAULT_FINGERPRINT_FIELDS = ['kind', 'subject'];

/**
 * Reduce a finding to a stable identity for dedupe.
 *
 * `detail` is deliberately EXCLUDED by default. It is the part most likely to
 * be reworded between ticks while the finding is the same one ("no announcing
 * session" → "still no announcing session"), so including it would defeat
 * dedupe on exactly the findings dedupe exists for.
 *
 * @param {Object} finding - {kind, subject, ...}
 * @param {string[]} [fields] - fingerprint fields; defaults to kind + subject
 * @returns {string} stable fingerprint; '' for input carrying no usable fields
 */
function fingerprintFinding(finding, fields) {
  if (!finding || typeof finding !== 'object') return '';
  const keys = Array.isArray(fields) && fields.length > 0 ? fields : DEFAULT_FINGERPRINT_FIELDS;
  return keys
    .map((k) => {
      const v = finding[k];
      return (typeof v === 'string' || typeof v === 'number') ? `${k}=${v}` : `${k}=`;
    })
    .join('|');
}

/**
 * Decide whether one finding may be auto-filed.
 *
 * ORDER IS LOAD-BEARING: dedupe is checked before the cap. A repeat finding at
 * a full cap must report as a repeat, not as rate-limiting — the two have
 * different remedies, and naming the wrong one sends the reader somewhere
 * useless.
 *
 * @param {Object} options
 * @param {Object} options.finding  - the candidate finding
 * @param {Array}  options.filings  - [{fingerprint, at}] already filed this session
 * @param {number} options.now      - epoch ms
 * @param {Object} options.signals  - parsed hall-monitor-signals.json
 * @returns {{allowed: boolean, reason: string, fingerprint: string}}
 */
function evaluateAutoCreate(options) {
  try {
    if (!options || typeof options !== 'object') {
      return { allowed: false, reason: 'no-options', fingerprint: '' };
    }

    const { finding, signals } = options;

    // Absent or malformed signals REFUSE rather than permit. Failing open here
    // would silently remove both guards and leave an unbounded filer — the
    // outcome they exist to prevent. This is the opposite of the advisory
    // fail-open elsewhere, and deliberately so: the cost of a wrong refusal is
    // an unfiled bug a human still sees in the report; the cost of a wrong
    // permission is issue spam nobody asked for.
    const auto = signals && typeof signals === 'object' ? signals.autoCreate : null;
    if (!auto || typeof auto !== 'object') {
      return { allowed: false, reason: 'signals-unreadable', fingerprint: '' };
    }

    const dedupe = auto.dedupe && typeof auto.dedupe === 'object' ? auto.dedupe : {};
    const rateLimit = auto.rateLimit && typeof auto.rateLimit === 'object' ? auto.rateLimit : {};

    const fingerprint = fingerprintFinding(finding, dedupe.fingerprintFields);
    if (!fingerprint || !finding || typeof finding !== 'object') {
      return { allowed: false, reason: 'finding-unreadable', fingerprint };
    }

    const filings = Array.isArray(options.filings) ? options.filings : [];
    const now = Number.isFinite(options.now) ? options.now : Date.now();

    const windowMinutes = Number.isFinite(dedupe.windowMinutes) ? dedupe.windowMinutes : 0;
    const windowMs = windowMinutes * 60 * 1000;
    const duplicate = filings.some((f) => (
      f && f.fingerprint === fingerprint && Number.isFinite(f.at) && (now - f.at) <= windowMs
    ));
    if (duplicate) {
      return { allowed: false, reason: 'duplicate', fingerprint };
    }

    const cap = Number.isFinite(rateLimit.maxPerSession) ? rateLimit.maxPerSession : 0;
    if (filings.length >= cap) {
      return { allowed: false, reason: 'rate-limited', fingerprint };
    }

    return { allowed: true, reason: 'permitted', fingerprint };
  } catch {
    // Unreachable by construction; present so the contract above holds even if
    // a future edit introduces a throwing path.
    return { allowed: false, reason: 'guard-error', fingerprint: '' };
  }
}

module.exports = { fingerprintFinding, evaluateAutoCreate, DEFAULT_FINGERPRINT_FIELDS };
