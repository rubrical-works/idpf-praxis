#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.122.0
 * @description Charter entity extraction and derived counts (#3420, #3644).
 * Reads the Key Entities and Companion Repositories tables from CHARTER.md in
 * memory and counts each Key Entities row against disk when asked. Nothing
 * stores or verifies a count (#3644): the charter's Entity | Location rows
 * declare what to count, and the count is derived at the moment it is shown.
 * Formerly generate-domain-entities.js;
 * the generated domain-entities.json it wrote is retired, and
 * removeRetiredEntitiesFile() deletes a leftover copy.
 * @checksum sha256:placeholder
 */

const fs = require('fs');
const path = require('path');
const { parseCompanionTable } = require('./lib/companion-projects.js');
const { loadCharterContract } = require('./lib/charter-template.js');
const { escapeRegExp } = require('./lib/input-validation.js');

/**
 * The Key Entities section heading, regex-escaped, from the charter contract
 * (#3481). Read at call time, never at require time (#3482): a missing or
 * malformed contract throws from the call, with its code, not from require.
 */
const keyEntitiesHeading = () => escapeRegExp(loadCharterContract().keyEntities.heading);

/**
 * Extract entities from a Key Entities markdown table.
 *
 * Each row becomes one entity keyed by its name, lowercased with whitespace
 * hyphenated. A row whose key is already taken is kept under a suffixed key
 * (`name-2`, …) with a `warnings` entry, never overwriting the first (#3707).
 * Nothing here is a count: a legacy Count cell is carried as `count` only so a
 * repair can compare against it (#3644); counts come from deriveEntityCounts().
 *
 * @param {string} content - CHARTER.md text
 * @returns {Object<string, {description: string, count?: number, locations?: string[],
 *   countSource?: {exclude: string[]}, warnings?: string[], relationships: Array}>}
 *   Entities by key; `{}` when the section or a table with at least one row is absent
 */
function extractEntities(content) {
  const entities = {};
  // Find the Key Entities section (heading from the charter contract, #3481)
  // and extract the table
  const KEY_ENTITIES_HEADING = keyEntitiesHeading();
  let sectionMatch = content.match(new RegExp(String.raw`##\s+${KEY_ENTITIES_HEADING}[^\n]*\n([\s\S]*?)(?=\n##\s)`));
  // Fallback: Key Entities is the last section
  if (!sectionMatch) {
    sectionMatch = content.match(new RegExp(String.raw`##\s+${KEY_ENTITIES_HEADING}[^\n]*\n([\s\S]*)`));
  }
  if (!sectionMatch) return entities;
  const tableLines = sectionMatch[1].split('\n').filter(l => l.startsWith('|'));
  // A header, a separator and at least one row.
  if (tableLines.length < 3) return entities;
  const rows = tableLines;
  // Columns are found by header (#3644): the target table is Entity | Location,
  // a legacy one Entity | Count | Location. With no recognizable Location
  // header, the last column is the location, as it always was — unless that
  // column is Count.
  // Cells are positional: an empty cell keeps its column, so an empty Location
  // is a row with no location, not a row shifted one column left.
  const cellsOf = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
  const header = cellsOf(rows[0]);
  const countCol = header.findIndex(h => /^count$/i.test(h));
  let locationCol = header.findIndex(h => /^location/i.test(h));
  // The last-column fallback never lands on the Count column (#3671): a legacy
  // Entity | Count table has no location, not a count cell read as a path.
  if (locationCol === -1) locationCol = header.length - 1 === countCol ? -1 : header.length - 1;
  // Skip header and separator rows
  for (let i = 2; i < rows.length; i++) {
    const cells = cellsOf(rows[i]);
    if (cells.length >= 2 && cells[0]) {
      const name = cells[0];
      const baseKey = name.toLowerCase().replace(/\s+/g, '-');
      let key = baseKey;
      const entity = { description: name };
      // Two rows whose names normalize to one key would overwrite each other,
      // silently dropping the first from the counts (#3707). The later row is
      // kept under a suffixed key and carries a warning naming the clash.
      if (entities[baseKey]) {
        let n = 2;
        while (entities[`${baseKey}-${n}`]) n++;
        key = `${baseKey}-${n}`;
        entity.warnings = [`duplicate entity name "${name}": same key as "${entities[baseKey].description}"; kept as ${key}`];
      }

      // A legacy Count cell is read so a repair can compare against it; it is
      // never used as a count (#3644).
      if (countCol > 0 && cells[countCol] && cells[countCol].match(/^\d+$/)) {
        entity.count = parseInt(cells[countCol], 10);
      }

      // Parse location if present — split comma-separated locations
      // Only split on commas outside parentheses to preserve annotations
      if (locationCol > 0 && cells[locationCol]) {
        const locationRaw = cells[locationCol].replace(/`/g, '').trim();
        if (locationRaw) {
          const { locations, exclude } = parseLocationWithExclusions(locationRaw);
          entity.locations = locations;
          if (exclude.length > 0) {
            entity.countSource = { exclude };
          }
        }
      }

      entity.relationships = [];
      entities[key] = entity;
    }
  }

  return entities;
}

/**
 * Extract companion repositories from a Companion Repositories table
 * and add them as external entities.
 *
 * Row parsing is delegated to companion-projects.js, which is also what
 * `/charter --update --register-proj` writes through. One parser with two
 * callers cannot drift; two parsers of the same table eventually do -- and
 * the drift would be silent, because both would still produce entities.
 *
 * The parser is positional and preserves empty cells. The earlier
 * implementation here split on `|` and dropped empties, which was harmless
 * while the table had exactly three always-populated columns and becomes a
 * column-shift bug the moment an optional column (Board) is left blank.
 */
function extractCompanionRepos(content, entities) {
  const { entries, sectionFound } = parseCompanionTable(content);
  if (!sectionFound) return;

  for (const row of entries) {
    const repoName = row.name;
    const key = repoName.toLowerCase().replace(/\s+/g, '-');

    const entity = {
      description: `${repoName} — ${row.responsibility}`,
      external: true,
      locations: [repoName],
      // Always emitted, so a consumer never has to tell absent from false.
      // A charter that does not declare them defaults both to false, which
      // is the safe direction: nothing becomes searchable or filable by
      // omission.
      searchable: row.searchable,
      fileIssues: row.fileIssues,
      relationships: []
    };

    // repo and board are omitted rather than emitted empty: an absent
    // owner/name is genuinely unknown, and "" would satisfy a truthiness
    // check while failing every gh invocation built from it.
    if (row.repo) entity.repo = row.repo;
    if (row.board) entity.board = row.board;

    entities[key] = entity;

    // If relationship column mentions a connection, try to infer
    if (row.relationship) {
      for (const [entityKey, other] of Object.entries(entities)) {
        if (entityKey === key || other.external) continue;
        const desc = other.description.toLowerCase();
        const rel = row.relationship.toLowerCase();
        if (rel.includes(desc) ||
            desc.split(/\s+/).some(w => w.length > 4 && rel.includes(w))) {
          entities[key].relationships.push({
            type: 'interacts-with',
            target: entityKey,
            evidence: row.relationship
          });
          break;
        }
      }
    }
  }
}

/**
 * Parse a location string, extracting exclusion annotations.
 * "Domains/ (excludes Guides/, Templates/)" → { locations: ["Domains/"], exclude: ["Guides/", "Templates/"] }
 * "Domains/ (excludes Guides/, Templates/ infrastructure dirs)" → same exclude list; prose after a path is dropped
 * ".claude/commands/ (19 extensible, 19 managed)" → { locations: [".claude/commands/ (19 extensible, 19 managed)"], exclude: [] }
 */
function parseLocationWithExclusions(locationRaw) {
  // Match "(excludes X, Y)" or "(excludes X)" pattern
  const excludeMatch = locationRaw.match(/\(excludes?\s+([^)]+)\)/i);
  if (excludeMatch) {
    // Remove the exclusion annotation from the location string
    const cleaned = locationRaw.replace(/\s*\(excludes?\s+[^)]+\)/, '').trim();
    // Each entry is reduced to its path token: "Templates/ infrastructure dirs"
    // → "Templates/". Trailing prose otherwise survives into the exclude list
    // and matches no directory name, so the path is silently counted (#2919).
    const exclude = excludeMatch[1].split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean);
    return {
      locations: splitOutsideParens(cleaned),
      exclude
    };
  }
  return {
    locations: splitOutsideParens(locationRaw),
    exclude: []
  };
}

/**
 * Split a string on commas, but only those outside parentheses.
 * "IDPF-Agile/, IDPF-Vibe/" → ["IDPF-Agile/", "IDPF-Vibe/"]
 * ".claude/commands/ (19 extensible, 19 managed)" → [".claude/commands/ (19 extensible, 19 managed)"]
 */
function splitOutsideParens(str) {
  const parts = [];
  let current = '';
  let depth = 0;
  for (const ch of str) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      current = '';
      continue;
    }
    current += ch;
  }
  const trimmed = current.trim();
  if (trimmed) parts.push(trimmed);
  return parts;
}

/**
 * Characters that make a location a glob rather than a path (#2597).
 */
const GLOB_CHARS = /[*?]/;

/**
 * Bounds on a glob walk.
 *
 * A `**` pattern has no natural stopping point, and this helper is symlinked
 * into user projects whose trees it has never seen. Exceeding either bound is
 * reported as unresolvable rather than as a partial count — a truncated walk
 * that returns a number is the same class of false signal this issue is about.
 */
const GLOB_WALK_MAX_DEPTH = 12;
const GLOB_WALK_MAX_ENTRIES = 50000;

/**
 * Vendored glob matcher (#2597).
 *
 * Modeled on `globToRegex` in `scope-drift-check.js`, the worked precedent for
 * exactly this: `minimatch` is not in `runtimeNpmDependencies`, so requiring it
 * here would crash at module load in every deployed project (the runtime
 * dependency contract in 04-deployment-awareness.md). Twenty-odd lines is well
 * under the threshold where declaring a dependency pays.
 *
 * `**` crosses directory separators; a single `*` and `?` do not.
 */
function globToRegex(pattern) {
  let re = '^';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        i += 2;
        // `**/` is zero or more whole segments, as in scope-drift-check.js
        // (#3621): emitting `.*` and consuming the `/` lost the segment
        // boundary, so `**/x.js` counted myx.js too (#3688). A bare trailing
        // `**` stays `.*`.
        if (pattern[i] === '/') {
          re += '(?:.*/)?';
          i++;
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
        i++;
      }
    } else if (c === '?') {
      re += '[^/]';
      i++;
    } else if ('.+^$()|{}[]\\'.includes(c)) {
      re += '\\' + c;
      i++;
    } else {
      re += c;
      i++;
    }
  }
  re += '$';
  return new RegExp(re);
}

/**
 * Split a glob location into the deepest directory that is a literal path and
 * the pattern relative to it.
 *
 * Walking from the static prefix is what lets a pattern cost a subtree rather
 * than the whole project, and it is also what makes "base does not exist" a
 * distinguishable outcome from "matched nothing".
 */
function splitGlobLocation(location) {
  const segments = location.split(/[\\/]+/).filter(s => s !== '');
  const staticSegments = [];
  let i = 0;
  while (i < segments.length && !GLOB_CHARS.test(segments[i])) {
    staticSegments.push(segments[i]);
    i++;
  }
  const patternSegments = segments.slice(i);
  const isAbsolute = /^([a-zA-Z]:)?[\\/]/.test(location);
  let base = staticSegments.join('/');
  if (isAbsolute && !/^[a-zA-Z]:/.test(base)) base = '/' + base;
  return { base: base || '.', pattern: patternSegments.join('/') };
}

/**
 * Collect paths under absBase matching pattern, relative to the base.
 *
 * Returns null when a bound is exceeded, which the caller turns into an
 * unresolvable result. Both files and directories are eligible: a Key Entities
 * location may legitimately name either.
 */
function collectGlobMatches(fs, path, absBase, pattern) {
  const regex = globToRegex(pattern);
  const maxDepth = pattern.includes('**')
    ? GLOB_WALK_MAX_DEPTH
    : pattern.split('/').length;

  const matches = [];
  let seen = 0;
  const stack = [{ dir: absBase, rel: '', depth: 0 }];

  while (stack.length > 0) {
    const { dir, rel, depth } = stack.pop();
    if (depth >= maxDepth) continue;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // An unreadable subdirectory mid-walk: skip it rather than failing the
      // whole location. The base resolved, which is all `resolved` claims.
      continue;
    }

    for (const dirent of entries) {
      seen++;
      if (seen > GLOB_WALK_MAX_ENTRIES) return null;

      const childRel = rel ? rel + '/' + dirent.name : dirent.name;
      if (regex.test(childRel)) matches.push(childRel);
      if (dirent.isDirectory()) {
        stack.push({ dir: path.join(dir, dirent.name), rel: childRel, depth: depth + 1 });
      }
    }
  }

  return matches;
}

/** Reason recorded for a location that resolves outside the project root (#3707). */
const OUTSIDE_ROOT_REASON = 'location resolves outside the project root';

/**
 * True when `absPath` lies outside `root`. A charter location is a path in
 * this project; a `..` or absolute path escaping it is not counted, so a
 * charter can never be used to probe the size of directories beyond the root.
 *
 * @param {string} root
 * @param {string} absPath - Already resolved against root
 * @returns {boolean}
 */
function isOutsideRoot(root, absPath) {
  const rel = path.relative(path.resolve(root), absPath);
  return rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel);
}

/**
 * Count each Key Entities row against the filesystem (#3644). Nothing is
 * compared: the charter stores no count, so the count shown is the one derived
 * now. A legacy `count` an entity still carries is ignored.
 *
 * **A count that could not be derived is reported as such, never as zero**
 * (#2597): a missing path, a missing glob base, a file location or a row with
 * no location yields `counted: false`, `count: null` and a reason.
 *
 * Location kinds:
 *   - **glob** (contains `*` or `?`) — expanded from its static prefix and
 *     counted. A base directory that does not exist cannot be counted; a base
 *     that exists and matches nothing is a counted zero.
 *   - **file** — yields no item count (#2919).
 *   - **directory** — immediate children, files and subdirectories alike.
 *   - **anything else** — not counted, with a reason.
 *   - **outside the project root** (a `..` or absolute path escaping it, or a
 *     glob whose base does) — not counted, whatever kind it is (#3707).
 *
 * All-or-nothing per row: one location that cannot be counted leaves the row
 * not counted, so a partial total is never shown as the count.
 *
 * @param {object} entities - Entities object from extractEntities()
 * @param {{root?: string}} [options] - Project root locations resolve against (default: process.cwd())
 * @returns {Array<{entity: string, description: string, count: number|null, counted: boolean,
 *   locations: string[], excludesApplied: boolean, unresolved: Array<{location: string, reason: string}>}>}
 */
function deriveEntityCounts(entities, options = {}) {
  const root = options.root || process.cwd();
  const results = [];

  for (const [key, entity] of Object.entries(entities)) {
    const locations = entity.locations || [];
    const excludes = (entity.countSource && entity.countSource.exclude) || [];
    const excludesApplied = excludes.length > 0;
    const excludeNames = excludes.map(e => e.replace(/\/$/, ''));
    const notExcluded = (name) => !excludeNames.includes(name);
    const unresolved = [];
    let totalCount = 0;

    if (locations.length === 0) unresolved.push({ location: '', reason: 'no location in the Key Entities row' });

    for (const location of locations) {
      // Strip parenthetical annotations for path resolution
      const cleanLoc = location.replace(/\s*\([^)]*\)\s*$/, '').trim();

      // An annotation-only Location (e.g. `(see below)`) strips to nothing;
      // path.resolve(root, '') would count the project root itself (#3783).
      if (!cleanLoc) {
        unresolved.push({ location, reason: 'no path in the Location' });
        continue;
      }

      if (GLOB_CHARS.test(cleanLoc)) {
        const { base, pattern } = splitGlobLocation(cleanLoc);
        const absBase = path.resolve(root, base);
        if (isOutsideRoot(root, absBase)) {
          unresolved.push({ location, reason: OUTSIDE_ROOT_REASON });
          continue;
        }

        let baseStat;
        try {
          baseStat = fs.statSync(absBase);
        } catch {
          unresolved.push({ location, reason: 'glob base directory not found: ' + base });
          continue;
        }
        if (!baseStat.isDirectory()) {
          unresolved.push({ location, reason: 'glob base is not a directory: ' + base });
          continue;
        }

        const matches = collectGlobMatches(fs, path, absBase, pattern);
        if (matches === null) {
          unresolved.push({
            location,
            reason: 'glob expansion exceeded ' + GLOB_WALK_MAX_ENTRIES +
              ' entries; refusing to report a truncated count'
          });
          continue;
        }
        totalCount += matches.filter(m => notExcluded(m.split('/').pop())).length;
        continue;
      }

      const fullPath = path.resolve(root, cleanLoc);
      if (isOutsideRoot(root, fullPath)) {
        unresolved.push({ location, reason: OUTSIDE_ROOT_REASON });
        continue;
      }
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        unresolved.push({ location, reason: 'path does not exist on disk' });
        continue;
      }

      if (stat.isDirectory()) {
        // Count immediate children (files or subdirectories). An unreadable
        // directory is not counted, with its reason (#3647) — one entity, not
        // the whole check.
        let entries;
        try {
          entries = fs.readdirSync(fullPath);
        } catch (err) {
          unresolved.push({ location, reason: `directory could not be read (${err.code || 'error'})` });
          continue;
        }
        if (excludes.length > 0) entries = entries.filter(notExcluded);
        totalCount += entries.length;
      } else if (stat.isFile()) {
        // A file yields no item count (#2919): a registry file holds its items
        // inside, so counting it as 1 would be a wrong number, not a count.
        unresolved.push({ location, reason: 'file location yields no item count' });
      } else {
        unresolved.push({ location, reason: 'not a file or directory' });
      }
    }

    const counted = unresolved.length === 0;
    const result = {
      entity: key,
      description: entity.description || key,
      // null, never 0: a row that could not be counted has no count (#2597).
      count: counted ? totalCount : null,
      counted,
      locations,
      excludesApplied,
      unresolved
    };
    // Extraction warnings (a duplicate entity name, #3707) travel with the row.
    if (entity.warnings && entity.warnings.length) result.warnings = entity.warnings.slice();
    results.push(result);
  }

  return results;
}

/** The heading of the block bare `/charter` and `/charter --refresh` show (#3644). */
const COUNTS_HEADING = 'Key Entities — counts (derived now, not stored)';

/**
 * The derived counts block: one line per Key Entities row, a row that could
 * not be counted named with its reason — never shown as zero. A row's
 * extraction warnings follow it, one indented line each. Shown, never
 * written to a file.
 *
 * @param {ReturnType<typeof deriveEntityCounts>|null|undefined} results - deriveEntityCounts() output
 * @returns {string} The heading plus one line per row (and per warning), newline-joined
 */
function formatCountsBlock(results) {
  const rows = results || [];
  const width = Math.max(0, ...rows.map(r => String(r.description).length));
  const lines = [COUNTS_HEADING];
  for (const r of rows) {
    const name = String(r.description).padEnd(width);
    if (r.counted) {
      lines.push(`  ${name}  ${String(r.count).padStart(4)}   ${(r.locations || []).join(', ')}`);
    } else {
      const why = (r.unresolved || []).map(u => (u.location ? `${u.location}: ${u.reason}` : u.reason)).join('; ');
      lines.push(`  ${name}  not counted — ${why}`);
    }
    for (const w of r.warnings || []) lines.push(`    warning: ${w}`);
  }
  return lines.join('\n');
}

/**
 * One line for the startup Charter Health row: each counted row, and the not-counted tally.
 *
 * @param {ReturnType<typeof deriveEntityCounts>|null|undefined} results - deriveEntityCounts() output
 * @returns {string} A single line, no newline
 */
function summarizeCounts(results) {
  const rows = results || [];
  const counted = rows.filter(r => r.counted).map(r => `${r.description} ${r.count}`);
  const missed = rows.filter(r => !r.counted).map(r => r.description);
  let line = `Key Entities (derived): ${counted.length ? counted.join(' · ') : 'none counted'}`;
  if (missed.length) line += `; ${missed.length} not counted (${missed.join(', ')})`;
  return line;
}

const ENTITIES_FILENAME = 'domain-entities.json';

/**
 * True when the file at `file` is the generator's output: valid JSON whose
 * `generatedFrom` is "CHARTER.md". Unreadable or unparseable content is not.
 *
 * @param {string} file
 * @returns {boolean}
 */
function isGeneratedEntitiesFile(file) {
  try {
    // A re-saved copy may carry a BOM, which JSON.parse rejects (#3439).
    const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    return data !== null && typeof data === 'object' && data.generatedFrom === 'CHARTER.md';
  } catch (_err) {
    return false;
  }
}

/**
 * Delete a retired domain-entities.json at the project root (#3420).
 *
 * The file was generated from CHARTER.md and is no longer read or written, so
 * deleting it loses nothing: a rollback can rebuild it from the charter. That
 * is what makes deleting it at startup, outside any upgrade, safe; a retired
 * file that is NOT derived must not be removed this way. A regular file is
 * therefore removed only when it parses and carries `generatedFrom:
 * "CHARTER.md"`, which the generator wrote from its first version (#3428);
 * anything else of that name is the user's own and is left, with
 * `reason: 'not-generated'`. A link is removed itself and never followed into
 * the shared state it may point at.
 *
 * Callers: the startup hook, before it reads git status, so the session block
 * reports the deletion as dirty; and every /charter mode.
 *
 * @param {string} projectRoot
 * @returns {{removed: boolean, path: string, reason?: 'not-generated'|'not-regular-file'|'unlink-failed', error?: string}}
 */
function removeRetiredEntitiesFile(projectRoot) {
  const target = path.join(path.resolve(projectRoot), ENTITIES_FILENAME);
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch (_err) {
    return { removed: false, path: target };
  }
  if (stat.isDirectory()) return { removed: false, path: target };
  // A FIFO or device of that name would block the read at session start.
  if (!stat.isSymbolicLink() && !stat.isFile()) {
    return { removed: false, path: target, reason: 'not-regular-file' };
  }
  if (!stat.isSymbolicLink() && !isGeneratedEntitiesFile(target)) {
    return { removed: false, path: target, reason: 'not-generated' };
  }
  try {
    fs.unlinkSync(target);
  } catch (err) {
    // A directory junction or link refuses unlink on Windows; rmdir removes
    // the link and leaves its target alone. Any other failure is reported with
    // the unlink error itself: the cleanup is advisory and must not abort its
    // caller (#3439).
    if (!stat.isSymbolicLink() || !linksToDirectory(target)) {
      return { removed: false, path: target, reason: 'unlink-failed', error: err.code || err.message };
    }
    try {
      fs.rmdirSync(target);
    } catch (_rmdirErr) {
      return { removed: false, path: target, reason: 'unlink-failed', error: err.code || err.message };
    }
  }
  return { removed: true, path: target };
}

/** True when `link` resolves to a directory; a dangling link does not. */
function linksToDirectory(link) {
  try {
    return fs.statSync(link).isDirectory();
  } catch (_err) {
    return false;
  }
}

module.exports = {
  extractEntities,
  extractCompanionRepos,
  deriveEntityCounts,
  formatCountsBlock,
  summarizeCounts,
  removeRetiredEntitiesFile,
  ENTITIES_FILENAME,
};
