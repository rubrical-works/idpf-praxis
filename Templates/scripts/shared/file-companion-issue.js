// Rubrical Works (c) 2026
/**
 * @framework-script 0.103.0
 *
 * File an issue into a COMPANION repository and onto that repository's own
 * project board (#2775).
 *
 * THE DEFECT THIS REPLACES. `--target <owner/name>` ran
 * `gh pmu create -R <owner/name>`. gh-pmu takes the REPOSITORY from `-R` but
 * the PROJECT from the local `.gh-pmu.json` (`client.GetProject(cfg.Project...)`)
 * and exposes no override flag, so every cross-repo filing created the issue in
 * the companion and added it to THIS repo's board. Observed 2026-09-04 filing
 * px-manager#1155: the issue landed on Project-Varia (`rubrical-worker/7`)
 * rather than the px-manager board (`rubrical-worker/46`), while the command
 * reported that board fields were not set -- true, and it concealed that a
 * board had been polluted.
 *
 * WHY THE BARE `gh issue create` IS CORRECT HERE, AND ONLY HERE. Rule 02
 * (#2724) mandates `gh pmu create` for LOCAL filings, because the bare form
 * files an issue that never reaches the project board: invisible to
 * `gh pmu sub list`, to epic closure, to `/done`'s sub-issue checks and to
 * every board-driven gate. On a COMPANION filing the local board is precisely
 * what must NOT be touched -- so the property that makes the bare form wrong
 * locally is exactly what makes it right here. Board membership is then added
 * explicitly, to the companion's board, by this helper.
 *
 * NEVER GUESS AN OPTION ID. Field and option ids come from the companion's own
 * board via `gh project field-list`. A field or option name that does not
 * resolve is reported UNSET, never set to a guess: a guessed id files onto the
 * wrong column silently, which is worse than an unset field plus a line saying
 * so. That is #2665's contract, preserved here.
 *
 * WHY A SCRIPT AND NOT PROSE IN THE TWO SPECS. `/bug` and `/enhancement` both
 * need this sequence, and a sequence carried in prose is re-derived on every
 * invocation and can be asserted only as TEXT -- never exercised. Two specs
 * carrying it separately is also two places for it to drift. Same precedent as
 * `branch-review-gate.js`, `decideSweep`/`decideFlagSweep`, `decideStart` and
 * `deriveAnnouncementIssues`.
 *
 * Node built-ins and `gh` only, per the runtime dependency contract in
 * `04-deployment-awareness.md`.
 */

'use strict';

const { execFileSync } = require('child_process');

/** `owner/number`, matching companion-projects.js BOARD_PATTERN. */
const BOARD_PATTERN = /^[A-Za-z0-9._-]+\/\d+$/;

/** `owner/name`. */
const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

/**
 * Spawn bound for every `gh` call (#2469).
 *
 * Network-bound rather than local, so more generous than a git call -- but
 * still bounded: unbounded, a hung `gh` would leave the caller wedged after the
 * issue was already created, which is the worst point to stall.
 */
const GH_TIMEOUT_MS = 30000;

/** Default runner. Isolated so tests never touch the network. */
function defaultRunGh(args) {
  return execFileSync('gh', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: GH_TIMEOUT_MS,
  });
}

/** First line of an error message, for a report that stays one line. */
function firstLine(err) {
  return (err && err.message ? String(err.message) : String(err)).split('\n')[0];
}

/** Parse JSON, or return null. Never throws. */
function parseJson(raw) {
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

/** The trailing number of a GitHub issue URL. */
function issueNumberFromUrl(url) {
  const m = /\/issues\/(\d+)\s*$/.exec(String(url || '').trim());
  return m ? Number(m[1]) : null;
}

/**
 * File an issue into a companion repository, and onto its board when one is
 * registered.
 *
 * @param {object}   a
 * @param {string}   a.repo       Companion `owner/name`.
 * @param {string}   a.title
 * @param {string}   a.bodyFile   Path to the body file. `-F`/`--body-file`
 *   always, never inline `--body` (Windows shell safety).
 * @param {string[]} [a.labels]
 * @param {string}   [a.assignee]
 * @param {string}   [a.status]   Status ALIAS, e.g. `backlog`.
 * @param {string}   [a.priority] Priority ALIAS, e.g. `p2`.
 * @param {string}   [a.board]    Companion board `owner/number`, or null.
 * @param {object}   [a.fields]   The companion's `.gh-pmu.json` fields map.
 * @param {Function} [a.runGh]    Injectable `gh` runner, for tests.
 * @returns {{ok: boolean, issue: {number: number|null, url: string}|null,
 *            board: {added: boolean, owner: string|null, number: number|null,
 *                    fields: {set: string[], unset: string[]}},
 *            errors: string[]}}
 *
 * NEVER THROWS. Every failure is reported in the envelope, because the caller
 * is a command spec that must report rather than crash.
 */
function fileCompanionIssue(a) {
  const args = a || {};
  const runGh = typeof args.runGh === 'function' ? args.runGh : defaultRunGh;
  const errors = [];
  const board = { added: false, owner: null, number: null, fields: { set: [], unset: [] } };

  const fail = (msg) => {
    errors.push(msg);
    return { ok: false, issue: null, board, errors };
  };

  if (!REPO_PATTERN.test(String(args.repo || ''))) {
    return fail(`Target repository must be owner/name (got "${args.repo}").`);
  }
  // VALIDATED BEFORE ANYTHING IS CREATED. A malformed board discovered after
  // the issue exists leaves a filed issue on no board and no way to retry
  // without duplicating it.
  if (args.board !== null && args.board !== undefined && args.board !== ''
      && !BOARD_PATTERN.test(String(args.board))) {
    return fail(`Board must be owner/number (got "${args.board}").`);
  }

  // ── 1. Create the issue. Bare `gh issue create`, deliberately: see header. ──
  const createArgs = ['issue', 'create', '-R', String(args.repo),
    '--title', String(args.title || ''), '--body-file', String(args.bodyFile || '')];
  for (const label of (Array.isArray(args.labels) ? args.labels : [])) {
    createArgs.push('--label', String(label));
  }
  if (args.assignee) createArgs.push('--assignee', String(args.assignee));

  let url;
  try {
    url = String(runGh(createArgs)).trim().split('\n').filter(Boolean).pop();
  } catch (err) {
    return fail(`Issue creation failed in ${args.repo}: ${firstLine(err)}`);
  }
  if (!url) return fail(`Issue creation in ${args.repo} returned no URL.`);

  const issue = { number: issueNumberFromUrl(url), url };

  // No board registered -> stop here, having touched no project at all. This
  // is the correct outcome, not a degraded one.
  if (!args.board) {
    return { ok: true, issue, board, errors };
  }

  const [boardOwner, boardNumberRaw] = String(args.board).split('/');
  const boardNumber = Number(boardNumberRaw);
  board.owner = boardOwner;
  board.number = boardNumber;

  // ── 2. Add the item to the COMPANION board. ──
  let itemId = null;
  try {
    const added = parseJson(runGh([
      'project', 'item-add', String(boardNumber),
      '--owner', boardOwner, '--url', url, '--format', 'json',
    ]));
    itemId = added && added.id ? added.id : null;
    if (!itemId) throw new Error('item-add returned no item id');
    board.added = true;
  } catch (err) {
    // The issue EXISTS. Reporting this as a total failure would send the
    // caller to file it again and create a duplicate.
    errors.push(`Issue created, but adding it to ${args.board} failed: ${firstLine(err)}`);
    return { ok: true, issue, board, errors };
  }

  const fields = args.fields;
  if (!fields || typeof fields !== 'object') {
    return { ok: true, issue, board, errors };
  }

  // ── 3. Resolve the board's own field and option ids. ──
  let projectNodeId = null;
  let fieldList = null;
  try {
    const view = parseJson(runGh([
      'project', 'view', String(boardNumber), '--owner', boardOwner, '--format', 'json',
    ]));
    projectNodeId = view && view.id ? view.id : null;
    const listed = parseJson(runGh([
      'project', 'field-list', String(boardNumber), '--owner', boardOwner, '--format', 'json',
    ]));
    fieldList = listed && Array.isArray(listed.fields) ? listed.fields : null;
  } catch (err) {
    errors.push(`Board fields were not set on ${args.board}: ${firstLine(err)}`);
    return { ok: true, issue, board, errors };
  }
  if (!projectNodeId || !fieldList) {
    errors.push(`Board fields were not set on ${args.board}: the board's fields could not be read.`);
    return { ok: true, issue, board, errors };
  }

  // ── 4. Set each requested field, or report it unset. ──
  const wanted = [
    { key: 'status', alias: args.status },
    { key: 'priority', alias: args.priority },
  ];

  for (const { key, alias } of wanted) {
    const spec = fields[key];
    if (!spec || !spec.field) continue;           // the companion does not use this field
    if (alias === undefined || alias === null || alias === '') continue;

    const optionName = spec.values ? spec.values[alias] : undefined;
    if (!optionName) {
      board.fields.unset.push(spec.field);
      errors.push(`${spec.field} was not set: "${alias}" is not a value in the companion's ${key} map.`);
      continue;
    }

    const field = fieldList.find((f) => f && f.name === spec.field);
    if (!field || !field.id) {
      board.fields.unset.push(spec.field);
      errors.push(`${spec.field} was not set: the board has no field named "${spec.field}".`);
      continue;
    }

    const option = (field.options || []).find((o) => o && o.name === optionName);
    if (!option || !option.id) {
      // NEVER GUESS. An id invented here files onto the wrong column silently.
      board.fields.unset.push(spec.field);
      errors.push(`${spec.field} was not set: the board has no option named "${optionName}".`);
      continue;
    }

    try {
      runGh([
        'project', 'item-edit',
        '--id', itemId,
        '--project-id', projectNodeId,
        '--field-id', field.id,
        '--single-select-option-id', option.id,
      ]);
      board.fields.set.push(spec.field);
    } catch (err) {
      board.fields.unset.push(spec.field);
      errors.push(`${spec.field} was not set on ${args.board}: ${firstLine(err)}`);
    }
  }

  return { ok: true, issue, board, errors };
}

module.exports = {
  BOARD_PATTERN,
  REPO_PATTERN,
  GH_TIMEOUT_MS,
  fileCompanionIssue,
};
