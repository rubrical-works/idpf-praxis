#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.106.0
 * @description Resolve the issues `/bluf` briefs into one JSON envelope: fetch each number with `gh pmu view`, classify its type through lib/issue-type.js, expand an epic to its children behind a cap, and report every number it could not read rather than dropping it. Strictly read-only — it issues no mutating `gh` call of any kind. The brief itself is composed by the command spec from this envelope (#2932).
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

/**
 * THIS IS THE FETCH HALF, AND THE SPLIT IS THE VERIFICATION STORY.
 *
 * `/bluf` divides along the line that decides what can be tested. Everything
 * deterministic — resolving numbers, classifying types, enforcing the cap,
 * naming what could not be read — lives here and is ordinary Jest territory.
 * The *brief*, the prose a reader sees, is composed by the command spec and is
 * asserted nowhere, because no mechanism in this repository can assert that an
 * LLM's prose is accurate or well written. #2932 records that as
 * `verificationGate` option (c): name an honest weaker mechanism rather than
 * draft an aspirational one. Do not add a test here that claims to check a
 * brief's quality; it would be checking the fixture, not the command.
 *
 * READ-ONLY IS A CONTRACT, NOT AN INTENTION. Two suites sweep every command
 * this helper issues and fail on anything that is not `gh pmu view` or
 * `gh pmu sub list`. `/bluf` is a triage aid run across issues the user has
 * not opened, so a helper that edited one as a side effect would mutate the
 * board from a command nobody thinks of as a write.
 *
 * A NULL TYPE IS A TYPE, NOT A ROUTING DECISION. `getIssueType()` tests
 * `REDIRECT_LABELS` first and returns `{type: null, redirect}` for `prd`,
 * `proposal` and `test-plan` — it only reaches the four brief-able labels when
 * no redirect label is present. Those three are common in a backlog, so the
 * null case is the normal case for a mixed triage set, not an edge. This
 * helper keeps the null and discards the redirect: `/bluf` briefs such an
 * issue generically and routes nowhere.
 *
 * TWO FAILURE MODES, TWO ANSWERS, one principle — an absence must never read
 * as a finding. A number that cannot be read is reported in `unresolved` and
 * the remaining issues still resolve, because a triage pass over a stale list
 * is exactly where a deleted issue turns up. A failed epic enumeration leaves
 * the epic briefed alone with a warning, never as a childless epic: "`gh` was
 * down" and "this epic has no children" are different facts and a reader
 * acting on the second would be acting on the first.
 */

'use strict';

const { execTimed } = require('./lib/exec.js');
const { getIssueType } = require('./lib/issue-type.js');

const SCHEMA_VERSION = 1;

/**
 * Children briefed per epic, beyond which the rest are reported as not
 * reached. Six, matching `/review-issue` § 2a-iii rather than deriving a
 * looser number from this command's lower per-child cost: one cap for epic
 * expansion across the framework is worth more than a locally optimal one,
 * and a cap can be raised against a measurement later (#2932).
 */
const EXPANSION_CAP = 6;

/** The fields a brief draws on, in one round trip per issue. */
const VIEW_FIELDS = 'number,title,labels,body,status,priority,state';

// ─── arguments ───

/**
 * @param {string[]} argv
 * @returns {{issues?: number[], unrecognizedFlags?: string[], error?: string}}
 */
function parseArgs(argv) {
  const issues = [];
  const unrecognizedFlags = [];

  for (const arg of argv) {
    if (/^--[A-Za-z]/.test(arg)) {
      // Flag pass-through (`02-github-workflow.md`): a flag-shaped token is
      // never discarded, and an unrecognized one is reported rather than
      // treated as fatal — silent truncation gives the user nothing to notice.
      unrecognizedFlags.push(arg);
      continue;
    }
    const n = parseInt(String(arg).replace(/^#/, ''), 10);
    if (Number.isNaN(n)) {
      return { error: `Not an issue number: "${arg}". Usage: node bluf-preamble.js <issue> [<issue>...]` };
    }
    issues.push(n);
  }

  if (!issues.length) {
    // An empty argument list must not resolve to "every issue": that fans an
    // unbounded read across the board out of a typo.
    return { error: 'No issue numbers provided. Usage: node bluf-preamble.js <issue> [<issue>...]' };
  }

  return { issues, unrecognizedFlags };
}

// ─── fetching ───

function parseJSON(raw) {
  return JSON.parse(typeof raw === 'string' ? raw : String(raw));
}

/**
 * One issue, resolved. Returns null when it could not be read; the caller
 * records the number and reason rather than dropping it.
 */
function fetchIssue(number, execFn) {
  const raw = execFn(`gh pmu view ${number} --json=${VIEW_FIELDS}`, { encoding: 'utf8' });
  const data = parseJSON(raw);
  const labels = Array.isArray(data.labels) ? data.labels : [];
  const { type } = getIssueType({ labels });

  return {
    number: typeof data.number === 'number' ? data.number : number,
    title: typeof data.title === 'string' ? data.title : '',
    labels: labels.map((l) => (l && typeof l.name === 'string' ? l.name : String(l))),
    body: typeof data.body === 'string' ? data.body : '',
    status: typeof data.status === 'string' ? data.status : null,
    priority: typeof data.priority === 'string' ? data.priority : null,
    state: typeof data.state === 'string' ? data.state : null,
    // `redirect` is deliberately absent: `/bluf` reads, it never routes.
    type: type === undefined ? null : type
  };
}

/**
 * An epic's children, in board order, using the BARE `--json` flag and
 * reading `children[]` from the nested object it returns. The field-list form
 * errors on `sub list` (#2751), which is why this form is pinned by a test.
 */
function enumerateChildren(epic, execFn) {
  const raw = execFn(`gh pmu sub list ${epic} --json`, { encoding: 'utf8' });
  const data = parseJSON(raw);
  const children = Array.isArray(data && data.children) ? data.children : [];
  return children
    .filter((c) => c && typeof c.number === 'number')
    .map((c) => c.number);
}

// ─── the chain ───

/**
 * @param {{issues: number[]}} args
 * @param {Function} [execFn] — `(command, options) => stdout`; defaults to execTimed
 */
function run(args, execFn = execTimed) {
  const requested = (args && Array.isArray(args.issues)) ? args.issues : [];
  const issues = [];
  const unresolved = [];
  const notReached = [];
  const warnings = [];

  const resolve = (number) => {
    try {
      issues.push(fetchIssue(number, execFn));
      return true;
    } catch (e) {
      unresolved.push({ number, reason: e.message });
      return false;
    }
  };

  for (const number of requested) {
    if (!resolve(number)) continue;

    const resolved = issues[issues.length - 1];
    if (resolved.type !== 'epic') continue;

    let children;
    try {
      children = enumerateChildren(number, execFn);
    } catch (e) {
      // Briefed alone, and said so. Silence here would present a readable
      // epic as one with no children.
      warnings.push(`Could not enumerate children of #${number}: ${e.message} — briefed the epic alone.`);
      continue;
    }

    const reached = children.slice(0, EXPANSION_CAP);
    for (const child of children.slice(EXPANSION_CAP)) {
      notReached.push({ number: child, reason: `expansion cap (${EXPANSION_CAP})` });
    }
    for (const child of reached) resolve(child);
  }

  return {
    ok: true,
    version: SCHEMA_VERSION,
    data: { issues, unresolved, notReached, expansionCap: EXPANSION_CAP },
    warnings,
    errors: []
  };
}

// ─── entry ───

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    process.stdout.write(JSON.stringify({
      ok: false,
      version: SCHEMA_VERSION,
      data: null,
      warnings: [],
      errors: [{ code: 'BAD_ARGS', message: args.error }]
    }, null, 2) + '\n');
    process.exit(2);
  }

  const out = run(args);
  if (args.unrecognizedFlags && args.unrecognizedFlags.length) {
    out.warnings.push(`Unrecognized flag(s) ignored: ${args.unrecognizedFlags.join(', ')}`);
  }
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  process.exit(out.ok ? 0 : 1);
}

if (require.main === module) main();

module.exports = {
  EXPANSION_CAP,
  VIEW_FIELDS,
  parseArgs,
  fetchIssue,
  enumerateChildren,
  run
};
