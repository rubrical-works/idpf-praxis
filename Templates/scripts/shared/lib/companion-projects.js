// Rubrical Works (c) 2026
/**
 * Companion project registry — validate / register / deregister / list.
 *
 * CHARTER.md's `Companion Repositories` table is the source of truth (#2209).
 * This module owns the table's parse and rewrite so that `/charter --update`
 * delegates rather than restating the logic as prose, and so
 * `charter-entities.js` consumes the same parser. One parser with two callers cannot drift; two parsers
 * eventually do.
 *
 * Deliberately NOT a second registry. Two lists of the same repositories drift;
 * the generated JSON copy that once existed was retired for exactly that (#3420).
 * Deliberately not `.gh-pmu.json` either: its `repositories[]` array is
 * gh-pmu's own and is integrity-sealed by `.gh-pmu.checksum`.
 *
 * Dependency contract: Node built-ins only. This file is symlinked into user
 * projects from the hub framework root, so an undeclared external `require`
 * would throw MODULE_NOT_FOUND at module load.
 *
 * @framework-script 0.115.0
 * Refs #2665
 */

const { execFileSync } = require('child_process');

/** Canonical column order for the Companion Repositories table. The first
 *  three are the #2209 shape and must keep their positions -- a legacy charter
 *  carrying only those three still parses. */
const COMPANION_COLUMNS = [
  'Repository', 'Responsibility', 'Relationship', 'Repo', 'Board', 'Searchable', 'File Issues', 'Direction'
];

/**
 * Which way a companion relates to this repo (#3422). `upstream`: this repo
 * consumes it; `downstream`: it consumes this repo; `bidirectional`: both.
 * An empty cell, an absent column or an unrecognized value reads as
 * `bidirectional` -- the behavior before the column existed -- with
 * `directionDeclared: false`, so a default is never mistaken for a choice.
 */
const DIRECTIONS = ['upstream', 'downstream', 'bidirectional'];
const DEFAULT_DIRECTION = 'bidirectional';

/** `owner/name`: exactly two non-empty segments of GitHub-legal characters. */
const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

/** A project board as `owner/number`. */
const BOARD_PATTERN = /^[A-Za-z0-9._-]+\/\d+$/;

/** Entry fields rendered as free text into a table cell. */
const TEXT_FIELDS = ['name', 'responsibility', 'relationship', 'repo', 'board'];

const SECTION_HEADING = /###?\s+Companion Repositories[^\n]*/;

/**
 * Split one markdown table row into positional cells, PRESERVING empties.
 *
 * The obvious `split('|').map(trim).filter(Boolean)` drops empty cells, which
 * silently shifts every column after a gap -- an empty `Board` would make
 * `Searchable` read the `File Issues` value. Positional parsing is required,
 * and the bug is invisible until a row happens to have a hole in it.
 */
function splitTableRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !isEscapedPipeAt(s, s.length - 1)) s = s.slice(0, -1);

  // Split on UNESCAPED pipes only (#3218). A run of n backslashes before a
  // pipe is the inverse of `escapeCell`: n odd -> a literal pipe preceded by
  // (n-1)/2 backslashes; n even -> n/2 backslashes, then a cell boundary.
  // Backslashes not followed by a pipe are kept verbatim, so a hand-written
  // cell such as `C:\path` parses exactly as before.
  const cells = [];
  let cell = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] === '\\') {
      let j = i;
      while (j < s.length && s[j] === '\\') j++;
      const run = j - i;
      if (s[j] === '|') {
        cell += '\\'.repeat(Math.floor(run / 2));
        if (run % 2 === 1) { cell += '|'; i = j + 1; continue; }
        i = j;                                     // even run: pipe is a boundary
        continue;
      }
      cell += s.slice(i, j);
      i = j;
      continue;
    }
    if (s[i] === '|') { cells.push(cell); cell = ''; i++; continue; }
    cell += s[i];
    i++;
  }
  cells.push(cell);
  return cells.map(c => c.trim());
}

/** True when the pipe at `idx` is preceded by an odd run of backslashes. */
function isEscapedPipeAt(s, idx) {
  let n = 0;
  for (let k = idx - 1; k >= 0 && s[k] === '\\'; k--) n++;
  return n % 2 === 1;
}

/**
 * Escape a field for a table cell (#3218): every pipe becomes `\|`, and the
 * backslashes immediately before it are doubled so a literal `\|` survives
 * the round trip. Unescaped, a pipe shifts every later column -- the entry
 * re-parses without its repo, and `deregisterCompanion` cannot find it.
 */
function escapeCell(value) {
  return String(value).replace(/(\\*)\|/g, (_m, bs) => bs + bs + '\\|');
}

function isSeparatorRow(line) {
  return /^\|?\s*:?-{2,}/.test(line.trim());
}

/** Accepts the spellings a human writes in a charter table. */
function parseBool(cell) {
  if (cell === undefined || cell === null) return false;
  return /^(yes|y|true|x|✓)$/i.test(String(cell).trim());
}

function formatBool(value) {
  return value ? 'yes' : 'no';
}

/**
 * Locate the Companion Repositories table.
 * Returns null when the section or its table is absent. Read-only callers
 * report that; `registerCompanion` creates a wholly absent section first
 * (#3193) but still refuses a heading with no table under it.
 */
function locateTable(content) {
  const lines = content.split('\n');
  const headingIdx = lines.findIndex(l => SECTION_HEADING.test(l));
  if (headingIdx === -1) return null;

  let headerIdx = -1;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^#{1,6}\s/.test(l)) break;              // next section, no table found
    if (l.trim().startsWith('|')) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return null;

  const sepIdx = headerIdx + 1;
  if (sepIdx >= lines.length || !isSeparatorRow(lines[sepIdx])) return null;

  let endIdx = sepIdx + 1;
  while (endIdx < lines.length && lines[endIdx].trim().startsWith('|')) endIdx++;

  return { lines, headingIdx, headerIdx, sepIdx, firstRowIdx: sepIdx + 1, endIdx };
}

/**
 * Parse the Companion Repositories table into entries.
 * @returns {{entries: Array<object>, sectionFound: boolean}}
 *
 * `sectionFound` is reported separately from an empty `entries` array for the
 * same reason `/work` Step 3 distinguishes NO_ACCEPTANCE_CRITERIA_SECTION from
 * EMPTY_ACCEPTANCE_CRITERIA_SECTION: "no table" and "an empty table" have
 * different causes, and collapsing them hides one of them.
 */
function parseDirection(cell) {
  const raw = String(cell == null ? '' : cell).trim();
  const value = raw.toLowerCase();
  if (DIRECTIONS.includes(value)) return { direction: value, directionDeclared: true, unrecognized: null };
  return { direction: DEFAULT_DIRECTION, directionDeclared: false, unrecognized: raw || null };
}

function parseCompanionTable(content) {
  const t = locateTable(String(content || ''));
  if (!t) return { entries: [], sectionFound: false, warnings: [] };

  const entries = [];
  const warnings = [];
  for (let i = t.firstRowIdx; i < t.endIdx; i++) {
    const cells = splitTableRow(t.lines[i]);
    const name = (cells[0] || '').replace(/`/g, '').trim();
    if (!name) continue;
    entries.push({
      name,
      responsibility: cells[1] || '',
      relationship: cells[2] || '',
      repo: cells[3] || '',
      board: cells[4] || '',
      searchable: parseBool(cells[5]),
      fileIssues: parseBool(cells[6]),
      ...(({ direction, directionDeclared }) => ({ direction, directionDeclared }))(parseDirection(cells[7]))
    });
    const { unrecognized } = parseDirection(cells[7]);
    if (unrecognized) {
      warnings.push(`Companion ${cells[3] || name}: Direction "${unrecognized}" is not one of ${DIRECTIONS.join(', ')}; read as ${DEFAULT_DIRECTION}.`);
    }
  }
  return { entries, sectionFound: true, warnings };
}

/**
 * Every empty Companion Repositories cell, by companion and column (#3422).
 * A column an older table lacks counts as empty. /charter --refresh prompts
 * for exactly these on every run; a filled cell is never listed.
 * @returns {Array<{repo: string, name: string, column: string}>}
 */
function emptyCompanionCells(content) {
  const t = locateTable(String(content || '').replace(/\r\n/g, '\n'));
  if (!t) return [];
  const out = [];
  for (let i = t.firstRowIdx; i < t.endIdx; i++) {
    const cells = splitTableRow(t.lines[i]);
    const name = (cells[0] || '').replace(/`/g, '').trim();
    if (!name) continue;
    const repo = cells[3] || '';
    COMPANION_COLUMNS.forEach((column, idx) => {
      if (idx === 0) return;
      if (!String(cells[idx] == null ? '' : cells[idx]).trim()) out.push({ repo, name, column });
    });
  }
  return out;
}

/** Read-only view; consumers (prior-art sweep, cross-repo filing) use this. */
function listCompanions(content) {
  return parseCompanionTable(content).entries;
}

/**
 * Validate one entry. Returns every failure rather than the first, so a caller
 * fixing a malformed entry sees the whole problem in one pass.
 */
function validateCompanion(entry) {
  const errors = [];
  const e = entry || {};

  // A line break ends the table row (#3218): everything after it lands in
  // CHARTER.md as free lines -- headings included -- and the row re-parses
  // without its repo. Checked on the RAW value, before any trim: the repo and
  // board checks below trim first, so a trailing newline would pass them.
  for (const field of TEXT_FIELDS) {
    if (/[\r\n]/.test(String(e[field] == null ? '' : e[field]))) {
      errors.push(`Field "${field}" must not contain a line break (CR or LF).`);
    }
  }

  if (!String(e.name || '').trim()) {
    errors.push('A repository name is required.');
  }
  const repo = String(e.repo || '').trim();
  if (!REPO_PATTERN.test(repo)) {
    errors.push(`Repository identity must be owner/name (got ${repo ? `"${repo}"` : 'nothing'}).`);
  }
  const board = String(e.board || '').trim();
  if (board && !BOARD_PATTERN.test(board)) {
    errors.push(`Board must be owner/number (got "${board}").`);
  }
  if (e.direction !== undefined && e.direction !== null && e.direction !== '' && !DIRECTIONS.includes(e.direction)) {
    errors.push(`Direction must be one of ${DIRECTIONS.join(', ')} (got "${e.direction}").`);
  }
  return { ok: errors.length === 0, errors };
}

function renderRow(entry) {
  return '| ' + [
    entry.name,
    entry.responsibility || '',
    entry.relationship || '',
    entry.repo || '',
    entry.board || '',
    formatBool(entry.searchable),
    formatBool(entry.fileIssues),
    // An undeclared direction stays an empty cell: writing the default would
    // turn it into a choice nobody made (#3422).
    entry.directionDeclared === false ? '' : (entry.direction || '')
  ].map(escapeCell).join(' | ') + ' |';
}

function extendedHeaderRows() {
  return [
    '| ' + COMPANION_COLUMNS.join(' | ') + ' |',
    '|' + COMPANION_COLUMNS.map(() => '---').join('|') + '|'
  ];
}

/**
 * Insert an empty `## Companion Repositories` section (heading + extended
 * header rows) into a charter that has none (#3193).
 *
 * Placed before the charter's trailing `---` rule when one follows a heading,
 * otherwise appended at the end. Only a `---` after the first heading counts,
 * so a YAML frontmatter fence is never mistaken for the trailing rule.
 */
function insertCompanionSection(content) {
  const lines = content.split('\n');
  const firstHeading = lines.findIndex(l => /^#{1,6}\s/.test(l));

  let ruleIdx = -1;
  if (firstHeading !== -1) {
    for (let i = lines.length - 1; i > firstHeading; i--) {
      if (lines[i].trim() === '---') { ruleIdx = i; break; }
    }
  }

  const section = ['## Companion Repositories', ''].concat(extendedHeaderRows());

  if (ruleIdx !== -1) {
    const before = lines.slice(0, ruleIdx);
    while (before.length && before[before.length - 1].trim() === '') before.pop();
    return before.concat([''], section, [''], lines.slice(ruleIdx)).join('\n');
  }

  // Append: keep the charter's trailing-newline shape.
  const body = lines.slice();
  let trailing = 0;
  while (body.length && body[body.length - 1].trim() === '') { body.pop(); trailing++; }
  const tail = trailing > 0 ? [''] : [];
  return body.concat(body.length ? [''] : [], section, tail).join('\n');
}

/**
 * The charter's line ending plus its LF-normalized text.
 *
 * Rewriters work in LF and re-join with `eol`: rows built here are LF-only,
 * so splicing them among CRLF lines leaves mixed endings (#3193, #3205).
 * One helper for every rewriter -- #3193 fixed register inline and left
 * deregister carrying the same defect.
 */
function detectLineEnding(source) {
  const text = String(source || '');
  return {
    eol: text.includes('\r\n') ? '\r\n' : '\n',
    normalized: text.replace(/\r\n/g, '\n')
  };
}

/**
 * Add or update a companion entry, keyed on `repo`.
 *
 * A duplicate `repo` UPDATES in place. Appending would leave two rows claiming
 * one identity, after which every consumer keyed on `repo` silently depends on
 * iteration order.
 *
 * @returns {{ok: boolean, content: string, action: 'added'|'updated'|null, errors: string[]}}
 *          `content` is returned unchanged on failure; the caller persists it.
 */
function registerCompanion(content, entry) {
  const source = String(content || '');
  const validation = validateCompanion(entry);
  if (!validation.ok) {
    return { ok: false, content: source, action: null, errors: validation.errors };
  }

  // An absent section is CREATED (#3193): a charter predating the section, or
  // one generated by `/charter` inception, otherwise could never register its
  // first companion. A heading present WITHOUT a table still refuses -- that
  // section carries hand-written content this function would have to guess
  // around, which is the larger promise `locateTable` declines to make.
  const { eol, normalized } = detectLineEnding(source);
  const working = SECTION_HEADING.test(normalized) ? normalized : insertCompanionSection(normalized);
  const t = locateTable(working);
  if (!t) {
    return {
      ok: false,
      content: source,
      action: null,
      errors: ['No Companion Repositories section with a table was found in the charter.']
    };
  }

  const { entries } = parseCompanionTable(working);
  const targetRepo = String(entry.repo).trim();
  const existingIdx = entries.findIndex(e => e.repo && e.repo === targetRepo);

  const merged = existingIdx === -1
    ? { ...entry, repo: targetRepo }
    : { ...entries[existingIdx], ...entry, repo: targetRepo };
  if (entry.direction) merged.directionDeclared = true;

  const next = entries.slice();
  if (existingIdx === -1) next.push(merged); else next[existingIdx] = merged;

  const rebuilt = t.lines.slice(0, t.headerIdx)
    .concat(extendedHeaderRows())
    .concat(next.map(renderRow))
    .concat(t.lines.slice(t.endIdx));

  return {
    ok: true,
    content: rebuilt.join(eol),
    action: existingIdx === -1 ? 'added' : 'updated',
    errors: []
  };
}

/**
 * Remove a companion entry by `repo`.
 *
 * A `repo` that is not present returns `ok: false` with `action: 'not-found'`.
 * Reporting it as success would let a caller announce a deregistration that
 * never happened -- the same class of defect as #2670's silent epic-move skip.
 */
function deregisterCompanion(content, repo) {
  const source = String(content || '');
  const target = String(repo || '').trim();
  const { eol, normalized } = detectLineEnding(source);

  const t = locateTable(normalized);
  if (!t) {
    return {
      ok: false,
      content: source,
      action: 'not-found',
      errors: ['No Companion Repositories section with a table was found in the charter.']
    };
  }

  const { entries } = parseCompanionTable(normalized);
  const idx = entries.findIndex(e => e.repo && e.repo === target);
  if (idx === -1) {
    return {
      ok: false,
      content: source,
      action: 'not-found',
      errors: [`No companion registered with repo "${target}".`]
    };
  }

  const next = entries.filter((_e, i) => i !== idx);
  const rebuilt = t.lines.slice(0, t.headerIdx)
    .concat(extendedHeaderRows())
    .concat(next.map(renderRow))
    .concat(t.lines.slice(t.endIdx));

  return { ok: true, content: rebuilt.join(eol), action: 'removed', errors: [] };
}

/**
 * Render the registry for `--list-proj`.
 *
 * The empty case prints a line rather than nothing: an empty stdout is
 * indistinguishable from the command having failed to run.
 */
function formatCompanionList(entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (list.length === 0) {
    return 'No companion repositories registered.';
  }
  const lines = ['Registered companion repositories:'];
  for (const e of list) {
    const caps = [];
    caps.push(`searchable: ${formatBool(e.searchable)}`);
    caps.push(`file issues: ${formatBool(e.fileIssues)}`);
    caps.push(`direction: ${e.direction || DEFAULT_DIRECTION}${e.directionDeclared ? '' : ' (undeclared)'}`);
    if (e.board) caps.push(`board: ${e.board}`);
    lines.push(`  ${e.repo || '(no repo)'}  ${e.name ? '— ' + e.name + ' ' : ''}(${caps.join(', ')})`);
  }
  return lines.join('\n');
}

/**
 * Check that a repo is reachable, FAILING OPEN.
 *
 * Three outcomes, deliberately distinguishable:
 *   verified: true,  reachable: true   -- checked, and it is there
 *   verified: true,  reachable: false  -- checked, and it is not
 *   verified: false, reachable: null   -- could not check; claim is labeled
 *
 * The third is the one that matters. Registration proceeds regardless: dropping
 * the entry loses a legitimate registration because the network was down, and
 * recording it as reachable asserts something never checked. Labeling it says
 * exactly what is known, which is rule 01's claim-labeling contract.
 *
 * Never throws -- a registration must not fail because a verification helper
 * did.
 */
function verifyReachability(repo, options = {}) {
  const target = String(repo || '').trim();
  const base = { repo: target, reachable: null, verified: false, label: null, reason: null };

  if (!REPO_PATTERN.test(target)) {
    return { ...base, label: 'unverifiable — not a well-formed owner/name', reason: 'malformed repo identity' };
  }

  const runner = options.runner || defaultReachabilityRunner;
  try {
    const result = runner(target);
    if (result && result.ok) return { ...base, reachable: true, verified: true };
    return {
      ...base,
      reachable: false,
      verified: true,
      reason: (result && result.reason) || 'repository not found'
    };
  } catch (err) {
    const reason = (err && err.message ? String(err.message) : String(err)).split('\n')[0];
    return { ...base, label: `unverifiable — ${reason}`, reason };
  }
}

/**
 * Resolve a cross-repo filing target.
 *
 * Two refusals, deliberately distinguished, because the fix differs:
 *   unregistered      -> register it first
 *   fileIssues: false -> it IS registered, and was marked read-only on
 *                        purpose; searchable-but-not-filable is the common
 *                        case, so this is usually correct rather than an
 *                        oversight
 * Collapsing them into one "cannot file there" would send a user to the
 * wrong remedy half the time.
 */
function resolveFilingTarget(charterContent, target) {
  const wanted = String(target || '').trim();
  if (!wanted) {
    return { ok: false, repo: '', entry: null, reason: 'No target repository was given.' };
  }

  const entries = listCompanions(charterContent);
  const entry = entries.find(e => e.repo && e.repo === wanted);

  if (!entry) {
    return {
      ok: false,
      repo: wanted,
      entry: null,
      reason: `"${wanted}" is not a registered companion repository. Register it with /charter --update --register-proj.`
    };
  }
  if (!entry.fileIssues) {
    return {
      ok: false,
      repo: wanted,
      entry,
      reason: `"${wanted}" is registered but not marked for issue filing (fileIssues is false). Enable it with /charter --update --register-proj.`
    };
  }
  return { ok: true, repo: wanted, entry, reason: null };
}

/**
 * Resolve the target board's field IDs from the companion's own
 * configuration.
 *
 * Unresolved is NOT an error: the issue is still created, and the fields that
 * could not be set are named. Guessing a field ID writes an issue onto the
 * wrong board column silently, which is worse than an issue with unset fields
 * and a line saying so.
 */
function resolveBoardFields(entry, options = {}) {
  const e = entry || {};

  // BOARD COORDINATES ARE RETURNED ALONGSIDE THE FIELDS MAP (#2775).
  //
  // Before this, the return carried the fields map and nothing else, and the
  // specs said "set them" -- on what item, on which board, with what command?
  // Nothing named a mechanism, so a fully registered companion was still filed
  // onto the LOCAL board. `file-companion-issue.js` needs `owner`/`number` to
  // call `gh project item-add`, and getting them from here rather than
  // re-splitting the charter cell at each call site keeps one parse.
  //
  // `board` is populated whenever the charter row has one, INCLUDING on the
  // unresolved paths: a caller that could not read the fields map may still
  // legitimately add the item to the board without setting fields, and that is
  // a better outcome than not adding it at all.
  const board = parseBoardCoordinates(e.board);

  if (!e.board) {
    return {
      resolved: false, fields: null, board: null,
      reason: 'no board is registered for this companion',
    };
  }
  const reader = options.reader || defaultBoardConfigReader;
  try {
    const cfg = reader(e);
    const fields = cfg && cfg.fields;
    if (!fields || Object.keys(fields).length === 0) {
      return {
        resolved: false, fields: null, board,
        reason: 'target configuration carries no fields map',
      };
    }
    return { resolved: true, fields, board, reason: null };
  } catch (err) {
    const reason = (err && err.message ? String(err.message) : String(err)).split('\n')[0];
    return { resolved: false, fields: null, board, reason };
  }
}

/**
 * Split a charter `Board` cell into `{owner, number}` (#2775).
 *
 * Returns null for anything that is not `owner/number`. The validator already
 * rejects a malformed cell at registration time, so this is the read-side
 * guard for a hand-edited charter -- and returning null rather than a partial
 * object keeps "no usable board" a single condition for the caller.
 */
function parseBoardCoordinates(board) {
  if (typeof board !== 'string' || !BOARD_PATTERN.test(board)) return null;
  const [owner, number] = board.split('/');
  return { owner, number: Number(number) };
}

/** The line a command prints when board fields could not be resolved. Names
 *  what was NOT set, so an unset field never passes for a set one. */
function formatUnresolvedBoardFields(repo, resolution) {
  const why = (resolution && resolution.reason) || 'unknown reason';
  return `Issue created in ${repo}. Board fields (status, priority) were not set — ${why}. `
    + 'Set them on the companion board directly.';
}

/** Default reader. Isolated so tests never touch the filesystem. */
function defaultBoardConfigReader(entry) {
  const raw = execFileSync('gh', ['api', `repos/${entry.repo}/contents/.gh-pmu.json`, '--jq', '.content'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15000,
    encoding: 'utf8'
  });
  return JSON.parse(Buffer.from(String(raw).trim(), 'base64').toString('utf8'));
}

/** Default runner. Isolated so tests never touch the network. */
function defaultReachabilityRunner(repo) {
  execFileSync('gh', ['repo', 'view', repo, '--json', 'name'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15000
  });
  return { ok: true };
}

module.exports = {
  COMPANION_COLUMNS,
  DIRECTIONS,
  DEFAULT_DIRECTION,
  emptyCompanionCells,
  splitTableRow,
  REPO_PATTERN,
  BOARD_PATTERN,
  parseCompanionTable,
  listCompanions,
  validateCompanion,
  detectLineEnding,
  registerCompanion,
  deregisterCompanion,
  formatCompanionList,
  verifyReachability,
  resolveFilingTarget,
  resolveBoardFields,
  parseBoardCoordinates,
  formatUnresolvedBoardFields
};
