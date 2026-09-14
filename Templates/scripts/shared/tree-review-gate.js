#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.103.0
 * @description Run the /work Step 2b-ii tree-wide review gate chain as one call: enumerate an epic or branch tracker's children with the bare `gh pmu sub list N --json`, read each child's board status, classify every member through review-state.js, and hand the resolved set to branch-review-gate.js for the decision. `--record-bypass` writes the decline note into an epic body (never a branch tracker's). Every gh call goes through one injectable exec so the whole chain is testable against a mocked board (#2826).
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

/**
 * THIS IS A RUNNER, NOT A SECOND DECISION HELPER.
 *
 * `lib/branch-review-gate.js` owns the decision — which members gate, what
 * the prompt offers — and its header warns against "three helpers wearing one
 * name". This file adds no decision. It owns the I/O around that decision:
 * enumeration, per-member board status, per-member classification, and the
 * decline note. Until #2826 those four steps were prose in
 * `Reference/work-execution-conditional.md` § Step 2b-ii, executed by the
 * model, and the chain had no test. The prose is where the #2751 defect lived
 * (the field-list form of `--json` on `sub list` errors, so the gate classified
 * nothing and passed vacuously) and where QA #2755 could not be discharged,
 * because nothing in the repository can drive an interactive prompt.
 *
 * WHAT IS CALLER DATA, NOT A TYPE TEST. The epic gate classifies the root
 * (an epic is reviewed); the branch-tracker gate drops it (nothing reviews a
 * tracker). That difference is carried by `--tracker`, which sets
 * `isTracker: true` on the root member, exactly as the aggregator takes it.
 * There is no label check here. `--issues` supplies the selection shape
 * (#2750) for free: argv members, no root, `setShape: 'selection'`.
 *
 * TWO FAILURE MODES, TWO ANSWERS. A failed enumeration is `ok: false` — a
 * gate computing its scope from a call that errors would classify nothing and
 * pass vacuously, the failure indistinguishable from a clean run. A failed
 * per-member read is fail-open — that member is `indeterminate` (classifier)
 * or stays processable (board status), with a warning naming it — matching
 * #2577's decision that a `gh` outage must not stop an autonomous run.
 *
 * THE BYPASS NOTE IS A RECORD, NOT A FLAG (#2748 AC8). review-state.js reads
 * the `reviewed`/`pending` labels and the `**Reviews:** N` marker only, so
 * the note this writes cannot suppress the gate on a later run. That is the
 * mechanism the mocked suite's case (c) pins; do not make the classifier read
 * the body without revisiting it.
 */

'use strict';

const fs = require('fs');

const { execTimed } = require('./lib/exec.js');
const reviewState = require('./review-state.js');
const { evaluateBranchReviewGate } = require('./lib/branch-review-gate.js');

/** The line the decline note begins with; its presence is what makes a second decline a no-op. */
const BYPASS_NOTE_MARKER = '**Review gate bypassed:**';

const MODES = Object.freeze(['evaluate', 'record-bypass']);

// ─── arguments ───

function parseArgs(argv) {
  const out = { issue: null, mode: null, tracker: false, skipped: [], issues: null };
  const modesSeen = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--issue' && argv[i + 1] !== undefined) {
      out.issue = parseInt(argv[++i], 10);
    } else if (a === '--issues' && argv[i + 1] !== undefined) {
      out.issues = String(argv[++i]).split(',').map((s) => parseInt(s.trim(), 10));
    } else if (a === '--evaluate' || a === '--record-bypass') {
      modesSeen.push(a.slice(2));
    } else if (a === '--tracker') {
      out.tracker = true;
    } else if (a === '--skipped' && argv[i + 1] !== undefined) {
      try {
        const parsed = JSON.parse(argv[++i]);
        if (!Array.isArray(parsed)) return { error: '--skipped must be a JSON array.' };
        out.skipped = parsed;
      } catch (e) {
        // A skipped list that fails to parse must not resolve to "skip
        // nothing": that widens the gate to issues the run will never touch.
        return { error: `--skipped is not valid JSON: ${e.message}` };
      }
    }
  }

  if (modesSeen.length > 1) return { error: 'Pass exactly one of --evaluate or --record-bypass.' };
  out.mode = modesSeen[0] || 'evaluate';

  if (out.issues) {
    if (!out.issues.length || out.issues.some((n) => Number.isNaN(n))) {
      return { error: '--issues must be a comma-separated list of issue numbers.' };
    }
  } else if (!out.issue || Number.isNaN(out.issue)) {
    return { error: 'Missing or invalid --issue <number> argument (or --issues <a,b,c>).' };
  }

  return out;
}

// ─── the chain ───

function parseJSON(raw) {
  return JSON.parse(typeof raw === 'string' ? raw : String(raw));
}

/**
 * Enumerate the tree with the form that works (#2751): the BARE `--json`
 * flag, reading `children[]` from the nested object it returns. Throws on any
 * failure; the caller turns that into `ok: false`.
 */
function enumerateTree(issue, execFn) {
  const raw = execFn(`gh pmu sub list ${issue} --json`, { encoding: 'utf8' });
  const data = parseJSON(raw);
  const children = Array.isArray(data && data.children) ? data.children : [];
  return children
    .filter((c) => c && typeof c.number === 'number')
    .map((c) => ({ number: c.number, title: typeof c.title === 'string' ? c.title : '' }));
}

/**
 * Board status for one member. `gh pmu sub list` reports the GitHub state
 * only, never the board column, so this is one call per member. Fail-open:
 * an unreadable status returns null and the member stays processable, as
 * work-preamble.js's checkSubIssueStatuses does.
 */
function fetchBoardStatus(number, execFn, warnings) {
  try {
    const raw = execFn(`gh pmu view ${number} --json=status`, { encoding: 'utf8' });
    const data = parseJSON(raw);
    return typeof data.status === 'string' ? data.status : null;
  } catch (e) {
    warnings.push(`Could not read board status for #${number}: ${e.message} — kept processable.`);
    return null;
  }
}

/**
 * Classify one member. review-state.js never throws — a read failure comes
 * back as `indeterminate` with its own warning, which is relayed verbatim so
 * the caller can see why a member did not prompt.
 */
function classifyMember(number, execFn, warnings) {
  const verdict = reviewState.run(number, execFn);
  for (const w of verdict.warnings || []) warnings.push(w);
  return verdict.state;
}

/**
 * One resolved member in the shape branch-review-gate.js consumes, plus the
 * title for the caller's prompt. The root passes `fetchStatus: false`: its
 * own board status is not a processability question (an epic mid-run is
 * `in_progress` by construction) and the call would be one more read per run.
 */
function resolveMember({ number, title = '', isTracker = false, fetchStatus = true }, execFn, warnings) {
  return {
    number,
    title,
    boardStatus: fetchStatus ? fetchBoardStatus(number, execFn, warnings) : null,
    state: classifyMember(number, execFn, warnings),
    isTracker
  };
}

/**
 * Build the resolved member list and evaluate it.
 *
 * @returns {{ok: boolean, data: object|null, warnings: string[], errors: object[]}}
 */
function evaluateTree(args, execFn) {
  const warnings = [];
  const selection = Array.isArray(args.issues);
  const setShape = selection ? 'selection' : 'tree';
  const members = [];

  if (selection) {
    for (const number of args.issues) {
      members.push(resolveMember({ number }, execFn, warnings));
    }
  } else {
    let children;
    try {
      children = enumerateTree(args.issue, execFn);
    } catch (e) {
      return {
        ok: false,
        data: null,
        warnings,
        errors: [{
          code: 'ENUMERATION_FAILED',
          message: `Could not enumerate the sub-issues of #${args.issue}: ${e.message}`,
          suggestion: 'A gate that cannot see its scope must not pass. Check `gh pmu sub list ' +
            `${args.issue} --json` + '` by hand, then re-run.'
        }]
      };
    }

    // The root first. It is classified like any other member and dropped by
    // the aggregator when the caller declares it a tracker — no label check.
    members.push(resolveMember(
      { number: args.issue, isTracker: args.tracker === true, fetchStatus: false },
      execFn, warnings
    ));

    for (const child of children) {
      members.push(resolveMember({ number: child.number, title: child.title }, execFn, warnings));
    }
  }

  const verdict = evaluateBranchReviewGate({ members, skipped: args.skipped, setShape });
  for (const w of verdict.warnings || []) warnings.push(`branch-review-gate: ${w}`);

  return {
    ok: true,
    data: {
      issue: selection ? null : args.issue,
      issues: selection ? args.issues.slice() : null,
      mode: 'evaluate',
      tracker: args.tracker === true,
      setShape,
      gate: verdict.gate,
      options: verdict.options,
      prompts: verdict.prompts,
      reason: verdict.reason,
      processable: verdict.processable,
      neverReviewed: verdict.neverReviewed,
      findingsPending: verdict.findingsPending,
      indeterminate: verdict.indeterminate,
      unknown: verdict.unknown,
      clean: verdict.clean,
      members
    },
    warnings,
    errors: []
  };
}

// ─── the decline note ───

function isoDate(now) {
  const d = now instanceof Date ? now : new Date();
  return d.toISOString().slice(0, 10);
}

function composeNote(verdict, now) {
  const never = verdict.neverReviewed.length
    ? verdict.neverReviewed.map((n) => `#${n}`).join(', ')
    : 'none';
  const pending = verdict.findingsPending.length
    ? verdict.findingsPending.map((n) => `#${n}`).join(', ')
    : 'none';
  return `${BYPASS_NOTE_MARKER} ${isoDate(now)} — \`/work\` proceeded on decline past the ` +
    `tree-wide review gate (never reviewed: ${never}; unresolved findings: ${pending}). ` +
    'A record of the decision, not a suppression flag: the gate asks again on the next run (#2748 AC8).';
}

/**
 * Write the decline note into the EPIC body through the `--body-stdout` →
 * edit → `-F` → rm flow. Branch trackers and selections write nothing, and
 * say which; a body already carrying the marker is left alone.
 */
function recordBypass(args, execFn, options) {
  const io = (options && options.fs) || fs;
  const noWrite = (reason, extra) => ({
    ok: true,
    data: { issue: args.issue, mode: 'record-bypass', written: false, reason, ...extra },
    warnings: (extra && extra.warnings) || [],
    errors: []
  });

  if (Array.isArray(args.issues)) return noWrite('selection');
  if (args.tracker === true) return noWrite('branch-tracker');

  const evaluated = evaluateTree(args, execFn);
  if (!evaluated.ok) return evaluated;
  if (!evaluated.data.gate) return noWrite('gate-not-raised', { warnings: evaluated.warnings });

  const warnings = evaluated.warnings.slice();
  let body;
  try {
    body = String(execFn(`gh pmu view ${args.issue} --body-stdout`, { encoding: 'utf8' }));
  } catch (e) {
    return {
      ok: false,
      data: null,
      warnings,
      errors: [{ code: 'BYPASS_READ_FAILED', message: `Could not read the body of #${args.issue}: ${e.message}` }]
    };
  }

  if (body.includes(BYPASS_NOTE_MARKER)) {
    return noWrite('already-recorded', { warnings });
  }

  const note = composeNote(evaluated.data, options && options.now);
  const updated = `${body.replace(/\s+$/, '')}\n\n${note}\n`;
  const tmp = `.tmp-tree-review-gate-${args.issue}.md`;

  try {
    io.writeFileSync(tmp, updated, 'utf8');
    execFn(`gh pmu edit ${args.issue} -F ${tmp}`, { encoding: 'utf8' });
  } catch (e) {
    return {
      ok: false,
      data: null,
      warnings,
      errors: [{ code: 'BYPASS_WRITE_FAILED', message: `Could not write the bypass note into #${args.issue}: ${e.message}` }]
    };
  } finally {
    try { io.unlinkSync(tmp); } catch (_e) { /* best effort — the note is already on the board or never was */ }
  }

  return {
    ok: true,
    data: { issue: args.issue, mode: 'record-bypass', written: true, reason: 'recorded', note },
    warnings,
    errors: []
  };
}

// ─── entry ───

/**
 * @param {{issue: number|null, issues?: number[]|null, mode: string, tracker: boolean, skipped: Array}} args
 * @param {Function} [execFn] — `(command, options) => stdout`; defaults to execTimed
 * @param {{fs?: object, now?: Date}} [options] — test seams for the note writer
 */
function run(args, execFn = execTimed, options = {}) {
  const mode = args && MODES.includes(args.mode) ? args.mode : 'evaluate';
  if (mode === 'record-bypass') return recordBypass(args, execFn, options);
  return evaluateTree(args, execFn);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    process.stdout.write(JSON.stringify({ ok: false, data: null, warnings: [], errors: [{ code: 'BAD_ARGS', message: args.error }] }, null, 2) + '\n');
    process.exit(2);
  }
  const out = run(args);
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  process.exit(out.ok ? 0 : 1);
}

if (require.main === module) main();

module.exports = {
  BYPASS_NOTE_MARKER,
  MODES,
  parseArgs,
  enumerateTree,
  fetchBoardStatus,
  classifyMember,
  evaluateTree,
  composeNote,
  recordBypass,
  run
};
