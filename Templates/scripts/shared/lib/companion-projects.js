// Rubrical Works (c) 2026
/**
 * Companion project registry — validate / register / deregister / list.
 *
 * CHARTER.md's `Companion Repositories` table is the source of truth;
 * `domain-entities.json` is generated from it (#2209). This module owns the
 * table's parse and rewrite so that `/charter update` delegates rather than
 * restating the logic as prose, and so `generate-domain-entities.js` consumes
 * the same parser. One parser with two callers cannot drift; two parsers
 * eventually do.
 *
 * Deliberately NOT a second registry. Two lists of the same repositories drift,
 * and `domain-entities.json` is already the generated, schema-validated copy.
 * Deliberately not `.gh-pmu.json` either: its `repositories[]` array is
 * gh-pmu's own and is integrity-sealed by `.gh-pmu.checksum`.
 *
 * Dependency contract: Node built-ins only. This file is symlinked into user
 * projects from the hub framework root, so an undeclared external `require`
 * would throw MODULE_NOT_FOUND at module load.
 *
 * @framework-script 0.101.0
 * Refs #2665
 */

const { execFileSync } = require('child_process');

/** Canonical column order for the Companion Repositories table. The first
 *  three are the #2209 shape and must keep their positions -- a legacy charter
 *  carrying only those three still parses. */
const COMPANION_COLUMNS = [
  'Repository', 'Responsibility', 'Relationship', 'Repo', 'Board', 'Searchable', 'File Issues'
];

/** `owner/name`: exactly two non-empty segments of GitHub-legal characters. */
const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

/** A project board as `owner/number`. */
const BOARD_PATTERN = /^[A-Za-z0-9._-]+\/\d+$/;

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
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map(c => c.trim());
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
 * Returns null when the section or its table is absent -- callers report that
 * rather than creating a section, since inventing charter structure is a
 * larger promise than filling a table.
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
function parseCompanionTable(content) {
  const t = locateTable(String(content || ''));
  if (!t) return { entries: [], sectionFound: false };

  const entries = [];
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
      fileIssues: parseBool(cells[6])
    });
  }
  return { entries, sectionFound: true };
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
    formatBool(entry.fileIssues)
  ].join(' | ') + ' |';
}

function extendedHeaderRows() {
  return [
    '| ' + COMPANION_COLUMNS.join(' | ') + ' |',
    '|' + COMPANION_COLUMNS.map(() => '---').join('|') + '|'
  ];
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

  const t = locateTable(source);
  if (!t) {
    return {
      ok: false,
      content: source,
      action: null,
      errors: ['No Companion Repositories section with a table was found in the charter.']
    };
  }

  const { entries } = parseCompanionTable(source);
  const targetRepo = String(entry.repo).trim();
  const existingIdx = entries.findIndex(e => e.repo && e.repo === targetRepo);

  const merged = existingIdx === -1
    ? { ...entry, repo: targetRepo }
    : { ...entries[existingIdx], ...entry, repo: targetRepo };

  const next = entries.slice();
  if (existingIdx === -1) next.push(merged); else next[existingIdx] = merged;

  const rebuilt = t.lines.slice(0, t.headerIdx)
    .concat(extendedHeaderRows())
    .concat(next.map(renderRow))
    .concat(t.lines.slice(t.endIdx));

  return {
    ok: true,
    content: rebuilt.join('\n'),
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

  const t = locateTable(source);
  if (!t) {
    return {
      ok: false,
      content: source,
      action: 'not-found',
      errors: ['No Companion Repositories section with a table was found in the charter.']
    };
  }

  const { entries } = parseCompanionTable(source);
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

  return { ok: true, content: rebuilt.join('\n'), action: 'removed', errors: [] };
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
 *   verified: false, reachable: null   -- could not check; claim is labelled
 *
 * The third is the one that matters. Registration proceeds regardless: dropping
 * the entry loses a legitimate registration because the network was down, and
 * recording it as reachable asserts something never checked. Labelling it says
 * exactly what is known, which is rule 01's claim-labelling contract.
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
      reason: `"${wanted}" is not a registered companion repository. Register it with /charter update --register-proj.`
    };
  }
  if (!entry.fileIssues) {
    return {
      ok: false,
      repo: wanted,
      entry,
      reason: `"${wanted}" is registered but not marked for issue filing (fileIssues is false). Enable it with /charter update --register-proj.`
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
  if (!e.board) {
    return { resolved: false, fields: null, reason: 'no board is registered for this companion' };
  }
  const reader = options.reader || defaultBoardConfigReader;
  try {
    const cfg = reader(e);
    const fields = cfg && cfg.fields;
    if (!fields || Object.keys(fields).length === 0) {
      return { resolved: false, fields: null, reason: 'target configuration carries no fields map' };
    }
    return { resolved: true, fields, reason: null };
  } catch (err) {
    const reason = (err && err.message ? String(err.message) : String(err)).split('\n')[0];
    return { resolved: false, fields: null, reason };
  }
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
  splitTableRow,
  REPO_PATTERN,
  BOARD_PATTERN,
  parseCompanionTable,
  listCompanions,
  validateCompanion,
  registerCompanion,
  deregisterCompanion,
  formatCompanionList,
  verifyReachability,
  resolveFilingTarget,
  resolveBoardFields,
  formatUnresolvedBoardFields
};
