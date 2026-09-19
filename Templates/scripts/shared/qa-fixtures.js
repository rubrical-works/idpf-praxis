#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.104.0
 * @description Provision, record, inspect and tear down the board fixtures a qa-required issue declares under `### Fixtures`, for /qa outcome 3 (#2827). `--provision` creates exactly the declared issues (a root with children, or a root-less selection), assigns children through assign-branch.js, labels `reviewed` items directly, and writes `**Fixtures created:**` into the QA body; `--teardown` deletes exactly the recorded numbers, children first; `--status` reports each recorded number as exists, deleted or unknown. One injectable exec, so the whole cycle runs against a mocked board. The consent gates live in the command spec, not here.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

/**
 * WHY A DECLARATION, NOT A RECIPE (#2762, #2827).
 *
 * The QA issues for the review gates carried prose recipes — create a scratch
 * epic, two children, attach them to a branch, leave one unreviewed, tear it
 * all down — and the recipe was wrong twice before anyone ran it: `--status
 * ready` needs `--branch`, and `gh pmu sub create` carries no branch flag at
 * all, so unassigned fixtures stopped the preamble at NO_BRANCH one step
 * before the gate they existed to reach. A declaration the helper validates
 * fails at provisioning time, loudly, instead of in a person's session.
 *
 * WHAT IS RECORDED, AND WHY TEARDOWN READS ONLY THAT. Every created number is
 * written back into the QA body under `**Fixtures created:**` before this
 * helper returns — including on a partial failure, so what exists is always
 * findable. Teardown deletes exactly those numbers and nothing derived from a
 * title, because a title search can match a real issue.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It asks no question — the two consent
 * gates (provision, teardown) are CommandsSrc/qa.md's, and the spec pins say
 * so. It never runs a review: a `reviewed` fixture gets the label applied
 * directly, and the envelope names that under `labelledDirectly` so nobody
 * mistakes it for a reviewed issue. It never touches a branch tracker or a
 * `qa-required` issue other than the one whose body it records into.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { execTimed } = require('./lib/exec.js');

const FIXTURES_HEADING = '### Fixtures';
const CREATED_MARKER = '**Fixtures created:**';
const SCHEMA_PATH = path.join(__dirname, '..', '..', 'metadata', 'qa-fixtures-schema.json');

const TYPES = Object.freeze(['epic', 'story', 'bug', 'enhancement']);
const MODES = Object.freeze(['provision', 'teardown', 'status']);

// Titles reach `gh` as shell arguments (#2456 is the precedent, in
// qa-extract.js). Rejecting metacharacters at parse time is what lets the
// commands below stay plain strings the mocked suite can match exactly.
const TITLE_PATTERN = /^[A-Za-z0-9 #()._:/,-]+$/;
const LABEL_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

// ─── arguments ───

function parseArgs(argv) {
  const out = { issue: null, mode: null };
  const modes = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--issue' && argv[i + 1] !== undefined) out.issue = parseInt(argv[++i], 10);
    else if (a === '--provision' || a === '--teardown' || a === '--status') modes.push(a.slice(2));
  }
  if (!out.issue || Number.isNaN(out.issue)) return { error: 'Missing or invalid --issue <number> argument.' };
  if (modes.length > 1) return { error: 'Pass exactly one of --provision, --teardown or --status.' };
  out.mode = modes[0] || 'status';
  return out;
}

// ─── the declaration ───

/**
 * Parse the `### Fixtures` section out of a QA body.
 *
 * Grammar, one item per line:
 *   - <type>: "<title>" [label:<name>]... [reviewed]
 * Indented two spaces, an item is a child of the preceding top-level item.
 * Line numbers in messages are relative to the section, heading = line 1.
 *
 * @returns {{ok: true, declaration: object} | {ok: false, code: string, message: string}}
 */
function parseFixturesSection(body) {
  const lines = String(body || '').split('\n');
  const start = lines.findIndex((l) => l.trim() === FIXTURES_HEADING);
  if (start === -1) {
    return { ok: false, code: 'NO_FIXTURES_SECTION', message: `No \`${FIXTURES_HEADING}\` section in the QA body.` };
  }

  const invalid = (lineNo, why) => ({
    ok: false,
    code: 'INVALID_FIXTURES',
    message: `${FIXTURES_HEADING} line ${lineNo}: ${why}`
  });

  const items = [];
  for (let i = start + 1; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i - start + 1;
    if (raw.trim() === '') continue;
    // The section ends at the next heading or bold-colon line.
    if (/^#{1,6}\s/.test(raw) || /^\*\*[^*]+:\*\*/.test(raw)) break;

    const m = raw.match(/^(\s*)- ([A-Za-z]+): "([^"]*)"(.*)$/);
    if (!m) return invalid(lineNo, `expected \`- <type>: "<title>" [label:<name>] [reviewed]\`, got: ${raw.trim()}`);
    const indent = m[1].length;
    const type = m[2].toLowerCase();
    const title = m[3];
    const rest = m[4].trim();

    if (!TYPES.includes(type)) return invalid(lineNo, `unknown type \`${type}\` — one of ${TYPES.join(', ')}`);
    if (!title.length) return invalid(lineNo, 'title is empty');
    if (!TITLE_PATTERN.test(title)) {
      return invalid(lineNo, `title \`${title}\` carries a character outside letters, digits, space and # ( ) . _ : / , - — titles are passed to gh as shell arguments`);
    }

    const labels = [type];
    let reviewed = false;
    for (const tok of rest.split(/\s+/).filter(Boolean)) {
      if (tok === 'reviewed') reviewed = true;
      else if (tok.startsWith('label:')) {
        const name = tok.slice('label:'.length);
        if (!LABEL_PATTERN.test(name)) return invalid(lineNo, `label \`${name}\` is not a valid label name`);
        labels.push(name);
      } else return invalid(lineNo, `unrecognised token \`${tok}\``);
    }

    const item = { type, title, labels, reviewed, children: [] };
    if (indent === 0) {
      items.push(item);
    } else if (indent <= 3) {
      if (!items.length) return invalid(lineNo, 'a child item appears before any root item');
      items[items.length - 1].children.push(item);
    } else {
      return invalid(lineNo, 'nested deeper than one level — a fixture is a root with children, or a flat list');
    }
  }

  if (!items.length) return invalid(1, 'the section declares no items');

  const withChildren = items.filter((it) => it.children.length > 0);
  let shape;
  if (withChildren.length === 0) {
    shape = 'selection';
  } else if (items.length === 1) {
    shape = 'tree';
  } else {
    return invalid(1, `a tree has exactly one root; ${items.length} top-level items were declared and at least one carries children`);
  }

  return { ok: true, declaration: { shape, items } };
}

let _validator = null;

/** Validate a parsed declaration against `.claude/metadata/qa-fixtures-schema.json`. */
function validateDeclaration(declaration) {
  if (!_validator) {
    // The schema declares draft 2020-12 (if/then, $defs), so the 2020 build —
    // a subpath of the declared `ajv` runtime dependency, as screen-catalog.js
    // and validate-screen-catalog.js already use.
    const Ajv = require('ajv/dist/2020').default;
    const ajv = new Ajv({ allErrors: true, strict: false });
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    _validator = ajv.compile(schema);
  }
  const ok = _validator(declaration);
  const errors = ok ? [] : (_validator.errors || []).map((e) => `${e.instancePath || '/'} ${e.message}`);
  return { ok: Boolean(ok), errors };
}

// ─── the record line ───

function isoDate(now) {
  const d = now instanceof Date ? now : new Date();
  return d.toISOString().slice(0, 10);
}

function formatCreatedLine({ shape, root, numbers, date }, now) {
  const when = date || isoDate(now);
  if (shape === 'tree') {
    const children = numbers.filter((n) => n !== root);
    const tail = children.length ? ` → ${children.map((n) => `#${n}`).join(', ')}` : '';
    return `${CREATED_MARKER} tree #${root}${tail} (${when})`;
  }
  return `${CREATED_MARKER} selection ${numbers.map((n) => `#${n}`).join(', ')} (${when})`;
}

const CREATED_LINE = /^\*\*Fixtures created:\*\* (tree|selection) ([^\n(]*)\((\d{4}-\d{2}-\d{2})\)[ \t]*$/m;

function parseCreatedLine(body) {
  const m = String(body || '').match(CREATED_LINE);
  if (!m) return { found: false, shape: null, root: null, numbers: [], date: null };
  const numbers = [...m[2].matchAll(/#(\d+)/g)].map((x) => parseInt(x[1], 10));
  const shape = m[1];
  return { found: true, shape, root: shape === 'tree' ? numbers[0] : null, numbers, date: m[3] };
}

function replaceOrInsertCreatedLine(body, line) {
  const base = String(body || '');
  if (CREATED_LINE.test(base)) return base.replace(CREATED_LINE, line);
  // Above the Prior Art / Reviews footer where one exists, so the record reads
  // as part of the QA body rather than after its metadata.
  const footer = base.match(/\n\*\*(Prior Art|Reviews):\*\*/);
  if (footer) {
    const at = base.indexOf(footer[0]);
    return `${base.slice(0, at).replace(/\s+$/, '')}\n\n${line}\n${base.slice(at)}`;
  }
  return `${base.replace(/\s+$/, '')}\n\n${line}\n`;
}

function stripCreatedLine(body) {
  return String(body || '').replace(/\n?[^\n]*\*\*Fixtures created:\*\*[^\n]*\n?/, '\n').replace(/\n{3,}/g, '\n\n');
}

// ─── envelopes ───

function failure(code, message, warnings, data) {
  return { ok: false, data: data || null, warnings, errors: [{ code, message }] };
}

// ─── board I/O ───

function readBody(issue, execFn) {
  return String(execFn(`gh pmu view ${issue} --body-stdout`, { encoding: 'utf8' }));
}

function writeBody(issue, body, execFn, io) {
  const tmp = `.tmp-qa-fixtures-${issue}.md`;
  io.writeFileSync(tmp, body, 'utf8');
  try {
    execFn(`gh pmu edit ${issue} -F ${tmp}`, { encoding: 'utf8' });
  } finally {
    try { io.unlinkSync(tmp); } catch (_e) { /* best effort */ }
  }
}

function issueNumberFrom(raw, what) {
  const m = String(raw).match(/#(\d+)/);
  if (!m) throw new Error(`${what} output did not include an issue number:\n${raw}`);
  return parseInt(m[1], 10);
}

function scratchBody(issue, title, now) {
  return `Scratch fixture for QA #${issue} — "${title}", created by \`/qa --provision\` on ${isoDate(now)}.\n\n` +
    `Not a real work item. \`node .claude/scripts/shared/qa-fixtures.js --issue ${issue} --teardown\` removes it once the check is recorded.\n`;
}

function resolveBranch(issue, execFn, warnings) {
  try {
    const raw = execFn(`gh pmu view ${issue} --json=branch`, { encoding: 'utf8' });
    const data = JSON.parse(String(raw));
    if (typeof data.branch === 'string' && data.branch.trim()) return data.branch.trim();
  } catch (e) {
    warnings.push(`Could not read the branch of #${issue}: ${e.message} — using the current branch.`);
  }
  return 'current';
}

// ─── provision ───

function provision(args, execFn, options) {
  const io = (options && options.fs) || fs;
  const now = options && options.now;
  const issue = args.issue;
  const warnings = [];
  const fail = (code, message, data) => failure(code, message, warnings, data);

  let body;
  try {
    body = readBody(issue, execFn);
  } catch (e) {
    return fail('BODY_READ_FAILED', `Could not read the body of #${issue}: ${e.message}`);
  }

  const existing = parseCreatedLine(body);
  if (existing.found) {
    return {
      ok: true,
      data: { issue, mode: 'provision', written: false, reason: 'already-recorded', shape: existing.shape, root: existing.root, numbers: existing.numbers, date: existing.date },
      warnings,
      errors: []
    };
  }

  const parsed = parseFixturesSection(body);
  if (!parsed.ok) return fail(parsed.code, parsed.message);
  const validated = validateDeclaration(parsed.declaration);
  if (!validated.ok) return fail('INVALID_FIXTURES', `${FIXTURES_HEADING} declaration rejected by the schema: ${validated.errors.join('; ')}`);

  const { shape, items } = parsed.declaration;
  const branch = resolveBranch(issue, execFn, warnings);
  const tmp = `.tmp-qa-fixture-${issue}.md`;
  const created = [];
  const numbers = [];
  const labelledDirectly = [];
  let root = null;
  let provisionError = null;

  const labelArgs = (labels) => labels.map((l) => `--label ${l}`).join(' ');
  const createTop = (item) => {
    io.writeFileSync(tmp, scratchBody(issue, item.title, now), 'utf8');
    const raw = execFn(`gh pmu create --title "${item.title}" ${labelArgs(item.labels)} --status ready --branch ${branch} -F ${tmp}`, { encoding: 'utf8' });
    return issueNumberFrom(raw, 'gh pmu create');
  };
  const createChild = (parent, item) => {
    io.writeFileSync(tmp, scratchBody(issue, item.title, now), 'utf8');
    const raw = execFn(`gh pmu sub create --parent ${parent} --title "${item.title}" ${labelArgs(item.labels)} -F ${tmp}`, { encoding: 'utf8' });
    const number = issueNumberFrom(raw, 'gh pmu sub create');
    // `sub create` carries no branch flag (#2762); assignment is a separate,
    // delegated step — never `gh pmu move --branch` by hand.
    const assignCmd = branch === 'current'
      ? `node .claude/scripts/shared/assign-branch.js ${number}`
      : `node .claude/scripts/shared/assign-branch.js ${branch} ${number}`;
    execFn(assignCmd, { encoding: 'utf8' });
    return number;
  };
  const markReviewed = (number) => {
    execFn(`gh issue edit ${number} --add-label reviewed`, { encoding: 'utf8' });
    labelledDirectly.push(number);
  };

  try {
    if (shape === 'tree') {
      const rootItem = items[0];
      root = createTop(rootItem);
      numbers.push(root);
      created.push({ number: root, title: rootItem.title, type: rootItem.type, parent: null });
      if (rootItem.reviewed) markReviewed(root);
      for (const child of rootItem.children) {
        const n = createChild(root, child);
        numbers.push(n);
        created.push({ number: n, title: child.title, type: child.type, parent: root });
        if (child.reviewed) markReviewed(n);
      }
    } else {
      for (const item of items) {
        const n = createTop(item);
        numbers.push(n);
        created.push({ number: n, title: item.title, type: item.type, parent: null });
        if (item.reviewed) markReviewed(n);
      }
    }
  } catch (e) {
    provisionError = e;
  } finally {
    try { io.unlinkSync(tmp); } catch (_e) { /* best effort */ }
  }

  const data = { issue, mode: 'provision', shape, root, numbers, created, labelledDirectly, branch, line: null, written: false };

  // Record whatever exists — on failure too, so teardown can find it.
  if (numbers.length) {
    const line = formatCreatedLine({ shape, root, numbers }, now);
    data.line = line;
    try {
      writeBody(issue, replaceOrInsertCreatedLine(body, line), execFn, io);
      data.written = true;
    } catch (e) {
      const msg = `Fixtures ${numbers.map((n) => `#${n}`).join(', ')} were created but the record could not be written into #${issue}: ${e.message}`;
      if (!provisionError) return fail('RECORD_FAILED', msg, data);
      warnings.push(msg);
    }
  }

  if (provisionError) {
    return fail('PROVISION_FAILED', `Provisioning stopped after ${numbers.length} issue(s): ${provisionError.message}`, data);
  }
  return { ok: true, data, warnings, errors: [] };
}

// ─── teardown ───

function teardown(args, execFn, options) {
  const io = (options && options.fs) || fs;
  const issue = args.issue;
  const warnings = [];
  const fail = (code, message, data) => failure(code, message, warnings, data);

  let body;
  try {
    body = readBody(issue, execFn);
  } catch (e) {
    return fail('BODY_READ_FAILED', `Could not read the body of #${issue}: ${e.message}`);
  }

  const record = parseCreatedLine(body);
  if (!record.found) {
    return fail('NO_FIXTURES_RECORDED', `#${issue} carries no \`${CREATED_MARKER}\` line — nothing to tear down, and a deletion set is never derived from titles.`);
  }

  // Children first: the record names the root first, so delete in reverse.
  const order = record.numbers.slice().reverse();
  const deleted = [];
  let failed = null;
  for (const n of order) {
    try {
      execFn(`gh issue delete ${n} --yes`, { encoding: 'utf8' });
      deleted.push(n);
    } catch (e) {
      failed = { number: n, message: e.message };
      break;
    }
  }
  const remaining = record.numbers.filter((n) => !deleted.includes(n));
  const data = { issue, mode: 'teardown', shape: record.shape, deleted, remaining, lineStripped: false };

  try {
    if (remaining.length) {
      const root = record.shape === 'tree' && remaining.includes(record.root) ? record.root : null;
      const shape = root === null && record.shape === 'tree' ? 'selection' : record.shape;
      writeBody(issue, replaceOrInsertCreatedLine(body, formatCreatedLine({ shape, root, numbers: remaining, date: record.date })), execFn, io);
    } else {
      writeBody(issue, stripCreatedLine(body), execFn, io);
      data.lineStripped = true;
    }
  } catch (e) {
    warnings.push(`The record in #${issue} could not be updated after teardown: ${e.message}`);
  }

  if (failed) {
    return fail('TEARDOWN_FAILED', `Could not delete #${failed.number}: ${failed.message}. Deleted ${deleted.map((n) => `#${n}`).join(', ') || 'nothing'}; still on the board: ${remaining.map((n) => `#${n}`).join(', ')}.`, data);
  }
  return { ok: true, data, warnings, errors: [] };
}

// ─── status ───

function status(args, execFn) {
  const issue = args.issue;
  const warnings = [];
  let body;
  try {
    body = readBody(issue, execFn);
  } catch (e) {
    return failure('BODY_READ_FAILED', `Could not read the body of #${issue}: ${e.message}`, warnings);
  }
  const record = parseCreatedLine(body);
  if (!record.found) {
    return { ok: true, data: { issue, mode: 'status', recorded: false, shape: null, root: null, issues: [] }, warnings, errors: [] };
  }
  const issues = record.numbers.map((n) => {
    try {
      execFn(`gh issue view ${n} --json state`, { encoding: 'utf8' });
      return { number: n, status: 'exists' };
    } catch (e) {
      const msg = String(e && e.message || '');
      return { number: n, status: /404|Could not resolve/i.test(msg) ? 'deleted' : 'unknown' };
    }
  });
  return { ok: true, data: { issue, mode: 'status', recorded: true, shape: record.shape, root: record.root, date: record.date, issues }, warnings, errors: [] };
}

// ─── entry ───

/**
 * @param {{issue: number, mode: 'provision'|'teardown'|'status'}} args
 * @param {Function} [execFn] — `(command, options) => stdout`; defaults to execTimed
 * @param {{fs?: object, now?: Date}} [options] — test seams for the temp-file writes and the date
 */
function run(args, execFn = execTimed, options = {}) {
  const mode = args && MODES.includes(args.mode) ? args.mode : 'status';
  if (mode === 'provision') return provision(args, execFn, options);
  if (mode === 'teardown') return teardown(args, execFn, options);
  return status(args, execFn);
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
  FIXTURES_HEADING,
  CREATED_MARKER,
  TYPES,
  MODES,
  parseArgs,
  parseFixturesSection,
  validateDeclaration,
  formatCreatedLine,
  parseCreatedLine,
  replaceOrInsertCreatedLine,
  stripCreatedLine,
  provision,
  teardown,
  status,
  run
};
