/**
 * @framework-script 0.92.0
 *
 * Living Style Guide showcase resume helper (#2432, Story 1.3).
 *
 * Reads the append-only `decisions.json` (JSONL) written by `showcase-server.js`,
 * compares it against an applied-cursor sidecar (`<bundleDir>/.applied.json`), and
 * dispatches pending decisions to per-command apply functions. Each application:
 *
 *   - design-system: mutates `Design-System/idpf-design.tokens.json` by stamping a
 *                    `$lifecycle: "accepted" | "rejected" | "annotated"` field on
 *                    the token addressed by `(category, itemId)`. Notes recorded
 *                    under `$lifecycleNote` for annotate decisions.
 *   - mockups:       appends a per-decision row to `Mockups/.showcase-applied.jsonl`
 *                    (project convention for /mockups artifacts).
 *   - catalog-screens: appends a per-decision row to `Mockups/.showcase-applied.jsonl`
 *                    (catalog screens live under `Mockups/{name}/Specs/`).
 *
 * Stale-decision detection (AC1.3.5): when a decision references an itemId not
 * present in the current artifact, the apply is skipped and reported as `stale`.
 *
 * Idempotency (AC1.6.3): pending = decisions[cursor..]. After apply, cursor is
 * advanced to decisions.length, so re-running applies nothing.
 *
 * Rubrical Works (c) 2026
 */

'use strict';

const fs = require('fs');
const path = require('path');

const APPLIED_SIDECAR = '.applied.json';
const TOKENS_PATH = 'Design-System/idpf-design.tokens.json';
const MOCKUPS_APPLIED = 'Mockups/.showcase-applied.jsonl';

// ─── decisions.json reader ────────────────────────────────────────────────

function readDecisions(decisionsPath) {
  if (!fs.existsSync(decisionsPath)) return [];
  const raw = fs.readFileSync(decisionsPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line));
    } catch (_) {
      // Skip malformed lines — surface in caller logging if desired
    }
  }
  return out;
}

// ─── applied-cursor sidecar ───────────────────────────────────────────────

function readAppliedCursor(appliedPath) {
  if (!fs.existsSync(appliedPath)) return { lastAppliedIndex: 0, lastAppliedAt: null };
  try {
    const parsed = JSON.parse(fs.readFileSync(appliedPath, 'utf8'));
    return {
      lastAppliedIndex: typeof parsed.lastAppliedIndex === 'number' ? parsed.lastAppliedIndex : 0,
      lastAppliedAt: parsed.lastAppliedAt || null,
    };
  } catch (_) {
    return { lastAppliedIndex: 0, lastAppliedAt: null };
  }
}

function writeAppliedCursor(appliedPath, index) {
  fs.mkdirSync(path.dirname(appliedPath), { recursive: true });
  fs.writeFileSync(appliedPath, JSON.stringify({
    lastAppliedIndex: index,
    lastAppliedAt: new Date().toISOString(),
  }, null, 2) + '\n');
}

// ─── Pending detection (AC1.3.2 trigger condition) ───────────────────────

function selectPendingDecisions(decisions, cursor) {
  const start = cursor && typeof cursor.lastAppliedIndex === 'number' ? cursor.lastAppliedIndex : 0;
  if (start >= decisions.length) return [];
  return decisions.slice(start).map((d, i) => ({ index: start + i, decision: d }));
}

/**
 * Should the command auto-resume on this invocation? (AC1.3.2)
 *
 * Triggers when there ARE pending decisions in the log. Caller still has the
 * option to ignore (e.g., when --showcase was passed — the launching command
 * runs the server, not the resume path).
 */
function shouldResume(decisionsPath, appliedPath) {
  const decisions = readDecisions(decisionsPath);
  if (decisions.length === 0) return false;
  const cursor = readAppliedCursor(appliedPath);
  return cursor.lastAppliedIndex < decisions.length;
}

// ─── Per-command apply functions ─────────────────────────────────────────

// Design-system: stamp $lifecycle on the addressed token. Token addressing
// follows decisions.schema.json itemId convention: "<group>.<name>" (e.g.,
// "color.primary"). For backwards-compat we also accept itemId == bare token
// name when category maps unambiguously.
function applyDesignSystem(decision, opts) {
  const tokensPath = opts && opts.tokensPath ? opts.tokensPath : path.resolve((opts && opts.projectRoot) || process.cwd(), TOKENS_PATH);
  if (!fs.existsSync(tokensPath)) {
    return { ok: false, action: 'stale', reason: 'tokens-file-missing', tokensPath };
  }
  let tokens;
  try {
    tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
  } catch (err) {
    return { ok: false, action: 'error', reason: 'tokens-parse-failed', error: err.message };
  }
  // Resolve token by itemId — supports "group.name" addressing.
  const itemId = decision.itemId;
  const dotIdx = itemId.indexOf('.');
  const group = dotIdx >= 0 ? itemId.slice(0, dotIdx) : null;
  const name = dotIdx >= 0 ? itemId.slice(dotIdx + 1) : itemId;
  let target = null;
  if (group && tokens[group] && typeof tokens[group] === 'object' && tokens[group][name]) {
    target = tokens[group][name];
  } else {
    // Fallback: scan known categories matching decision.category
    const candidates = decision.category === 'color'         ? ['color']
                     : decision.category === 'typography'    ? ['typography', 'font']
                     : decision.category === 'spacing-layout'? ['spacing', 'sizing', 'layout']
                     : decision.category === 'motion'        ? ['motion', 'animation', 'duration']
                     : [];
    for (const g of candidates) {
      if (tokens[g] && typeof tokens[g] === 'object' && tokens[g][name]) {
        target = tokens[g][name];
        break;
      }
    }
  }
  if (!target || typeof target !== 'object') {
    return { ok: true, action: 'stale', reason: `token not found: ${itemId}` };
  }
  target.$lifecycle = decision.decision;
  if (decision.decision === 'annotate' && decision.note) {
    target.$lifecycleNote = decision.note;
  }
  fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2) + '\n');
  return { ok: true, action: 'applied', itemId };
}

function appendAuditLog(opts, decision, source) {
  const auditPath = opts && opts.auditPath ? opts.auditPath : path.resolve((opts && opts.projectRoot) || process.cwd(), MOCKUPS_APPLIED);
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  const row = { ...decision, source, appliedAt: new Date().toISOString() };
  fs.appendFileSync(auditPath, JSON.stringify(row) + '\n');
  return auditPath;
}

function applyMockups(decision, opts) {
  // Mockups don't have a standard inline status surface; record applied decisions
  // in a project-level audit log under Mockups/. The /mockups runtime is expected
  // to read this on next invocation and reflect status (Story 1.3 follow-up
  // surface integration — out of scope for this story per PRD).
  const auditPath = appendAuditLog(opts, decision, 'mockups');
  return { ok: true, action: 'applied', auditPath, itemId: decision.itemId };
}

function applyCatalogScreens(decision, opts) {
  const auditPath = appendAuditLog(opts, decision, 'catalog-screens');
  return { ok: true, action: 'applied', auditPath, itemId: decision.itemId };
}

const PER_COMMAND_APPLIERS = {
  'design-system': applyDesignSystem,
  'mockups': applyMockups,
  'catalog-screens': applyCatalogScreens,
};

function applyDecision(commandName, decision, opts) {
  const fn = PER_COMMAND_APPLIERS[commandName];
  if (!fn) {
    return { ok: false, action: 'error', reason: `unknown command: ${commandName}` };
  }
  return fn(decision, opts);
}

// ─── Orchestrator (AC1.3.4 reporting) ─────────────────────────────────────

/**
 * Apply pending decisions for one command, write the cursor, and return a per-decision
 * report. Idempotent: re-running with no new appended decisions yields a no-op.
 *
 * @param {object} opts
 * @param {string} opts.commandName            'design-system' | 'mockups' | 'catalog-screens'
 * @param {string} opts.decisionsPath          Path to decisions.json (JSONL)
 * @param {string} [opts.appliedPath]          Path to .applied.json sidecar (default: bundleDir/.applied.json)
 * @param {string} [opts.bundleDir]            For default appliedPath resolution
 * @param {string} [opts.projectRoot]          For per-command applier path resolution
 * @param {string} [opts.tokensPath]           Override design-system tokens path
 * @param {string} [opts.auditPath]            Override mockups/catalog audit log path
 * @param {boolean} [opts.commitCursor=true]   Persist cursor after apply (false for dry runs)
 * @returns {object} { applied, stale, errors, total, cursor }
 */
function applyPending(opts) {
  if (!opts || !opts.commandName) throw new TypeError('applyPending: opts.commandName required');
  if (!opts.decisionsPath) throw new TypeError('applyPending: opts.decisionsPath required');
  const appliedPath = opts.appliedPath
    || (opts.bundleDir ? path.join(opts.bundleDir, APPLIED_SIDECAR) : null)
    || path.join(path.dirname(opts.decisionsPath), APPLIED_SIDECAR);
  const decisions = readDecisions(opts.decisionsPath);
  const cursor = readAppliedCursor(appliedPath);
  const pending = selectPendingDecisions(decisions, cursor);

  const applied = [];
  const stale = [];
  const errors = [];

  // Filter pending to those targeting THIS command's category set.
  const categoryToCommand = {
    'color': 'design-system',
    'typography': 'design-system',
    'spacing-layout': 'design-system',
    'motion': 'design-system',
    'ui-components': 'catalog-screens',
    'iconography': 'catalog-screens',
    'imagery-illustration': 'mockups',
    'voice-tone': 'mockups',
    'accessibility-patterns': 'mockups',
  };

  for (const { index, decision } of pending) {
    const targetCommand = categoryToCommand[decision.category];
    if (targetCommand !== opts.commandName) {
      // Not this command's category — skip without advancing cursor for this command.
      // (Cursor still advances at the end because the source-of-truth is the log,
      // not per-command. Stories 1.3/1.4 own a single shared decisions.json.)
      continue;
    }
    const result = applyDecision(opts.commandName, decision, opts);
    const entry = { index, decision, result };
    if (result.ok && result.action === 'applied') applied.push(entry);
    else if (result.action === 'stale') stale.push(entry);
    else errors.push(entry);
  }

  const newCursor = decisions.length;
  if (opts.commitCursor !== false && newCursor !== cursor.lastAppliedIndex) {
    writeAppliedCursor(appliedPath, newCursor);
  }

  return {
    applied, stale, errors,
    total: pending.length,
    cursor: { before: cursor.lastAppliedIndex, after: newCursor, written: opts.commitCursor !== false },
  };
}

/**
 * Format a per-decision report line for CLI output (AC1.3.4).
 *
 *   "color/palette-warm accepted → tokens.json updated"
 *   "ui-components/btn-ghost rejected → audit log appended"
 *   "color/old-token rejected → stale (token not found: color.old-token); skipped"
 */
function formatReportLines(result) {
  const lines = [];
  for (const { decision, result: r } of result.applied) {
    const action = r.itemId ? r.itemId : `${decision.category}/${decision.itemId}`;
    if (decision.category.startsWith('color') || ['typography','spacing-layout','motion'].includes(decision.category)) {
      lines.push(`${action} ${decision.decision} → tokens.json updated`);
    } else {
      lines.push(`${action} ${decision.decision} → audit log appended`);
    }
  }
  for (const { decision, result: r } of result.stale) {
    lines.push(`${decision.category}/${decision.itemId} ${decision.decision} → stale (${r.reason}); skipped`);
  }
  for (const { decision, result: r } of result.errors) {
    lines.push(`${decision.category}/${decision.itemId} ${decision.decision} → error: ${r.reason || (r.error && r.error.message) || 'unknown'}`);
  }
  return lines;
}

module.exports = {
  readDecisions,
  readAppliedCursor,
  writeAppliedCursor,
  selectPendingDecisions,
  shouldResume,
  applyDecision,
  applyDesignSystem,
  applyMockups,
  applyCatalogScreens,
  applyPending,
  formatReportLines,
  PER_COMMAND_APPLIERS,
  APPLIED_SIDECAR,
  TOKENS_PATH,
  MOCKUPS_APPLIED,
};
