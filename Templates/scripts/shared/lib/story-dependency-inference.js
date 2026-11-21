#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.122.0
 * story-dependency-inference.js — Infer PRD story `**Depends on:**` edges
 * from acceptance criteria, and refuse a cyclic graph (#3785)
 *
 * PRD stories carried no dependency field, so `/create-backlog` wrote
 * `none (not stated in the PRD)` for nearly every story and `/work
 * --concurrent` scheduled members before their prerequisites existed. This
 * is the ONE place the inference rule lives; `/create-prd`, `/create-backlog`
 * and `/add-story` run it rather than restating it.
 *
 * The rule (RULE below): story T depends on story S when an acceptance
 * criterion of T consumes, extends or calls an artifact — a backticked
 * helper, schema, field, flag or command — that an acceptance criterion of S
 * creates, or when T's criterion names `Story S` outright. An AC "creates"
 * the backticked artifact that is the object of a creation verb (adds,
 * creates, introduces, defines, …) — not every file it mentions; the first
 * story in PRD order to create an artifact owns it, and a use counts whole
 * or as one word of a longer backticked token. A story never depends on
 * itself.
 *
 * The output is a set of CANDIDATES: the calling command shows them to the
 * user, who confirms or edits before any line is written. A cycle in the
 * graph that would be written is reported, naming the stories, and is never
 * written — the cycle check delegates to `topo-order.js`, the same sort
 * `/work` orders members with.
 *
 * Story ids are PRD ids (`### Story 1.2`, formatted `Story 1.2`) or, for
 * `/add-story`, sibling issues (`### Story #123`, formatted `#123`) plus the
 * story about to be created (`### Story new`); an AC naming either form is
 * an edge.
 *
 * Pure over its inputs except the CLI wrapper, which reads one PRD file.
 */

const { topoOrder } = require('./topo-order.js');
const { extractAcceptanceCriteria } = require('./checkbox-scan.js');

const RULE = 'Story T depends on story S when an acceptance criterion of T consumes, extends or calls '
  + 'an artifact (a backticked helper, schema, field, flag or command) that an acceptance criterion '
  + 'of S creates, or names `Story S` directly. The first story in PRD order whose AC creates an '
  + 'artifact owns it; a story never depends on itself. `none` is written only when no edge applies.';

// A creation verb followed, within a short phrase on the same clause (no
// period, semicolon or other backtick between), by the backticked artifact
// it creates: `Adds helper \`lib/x.js\``, `exporting \`run()\``. Only that
// object is created — an existing file named later in the same AC
// (`registered in \`framework-manifest.json\``) is not.
const CREATION_RE = /\b(?:adds?|added|adding|creates?|created|creating|introduces?|introduced|defines?|defined|new|ships?|provides?|implements?|exports?|exporting|declares?|generates?)\b[^`.;]{0,40}?`([^`\n]+)`/gi;
const ARTIFACT_RE = /`([^`\n]+)`/g;
// A story id is a PRD id (`1.2`), a sibling issue (`#123`, `/add-story`) or
// the literal `new` (the story `/add-story` is about to create).
const STORY_REF_RE = /\bStory\s+(\d+\.\d+)\b|(?<![\w#])(#\d+)\b/g;
const STORY_HEADING_RE = /^###\s+Story\s+(#\d+|\d+\.\d+|new)\s*:?\s*(.*)$/;
const DEPENDS_LINE_RE = /^\*\*Depends on:\*\*\s*(.*)$/;

/**
 * Backticked tokens in an AC, trimmed; placeholders (`<...>`) are skipped.
 * @param {string} text
 * @returns {string[]}
 */
function extractArtifacts(text) {
  const out = [];
  for (const m of String(text || '').matchAll(ARTIFACT_RE)) {
    const token = m[1].trim();
    if (token.length < 2 || /^<.*>$/.test(token)) continue;
    if (!out.includes(token)) out.push(token);
  }
  return out;
}

/**
 * The artifacts an AC creates: the backticked object of each creation verb.
 * @param {string} text
 * @returns {string[]}
 */
function createdArtifacts(text) {
  const out = [];
  for (const m of String(text || '').matchAll(CREATION_RE)) {
    const token = m[1].trim();
    if (token.length < 2 || /^<.*>$/.test(token)) continue;
    if (!out.includes(token)) out.push(token);
  }
  return out;
}

/**
 * Parse a `**Depends on:**` value: `none`, or `Story X.Y` / `X.Y` entries.
 * A parenthetical note is ignored, as `depends-on.js` ignores it. Entries
 * are separated by `,`, `;` or the word `and`. An entry that is not a story
 * id is returned in `unreadable` — never dropped, so a stated line that
 * cannot be read is never mistaken for `none`.
 * @param {string} value
 * @returns {{none: boolean, ids: string[], unreadable: string[], raw: string}}
 */
function parseDependsValue(value) {
  const raw = String(value || '').trim();
  const clean = raw.replace(/\([^)]*\)/g, '').trim();
  if (/^none\b/i.test(clean)) return { none: true, ids: [], unreadable: [], raw };
  const ids = [];
  const unreadable = [];
  for (const part of clean.split(/[,;]|\band\b/i)) {
    const entry = part.trim();
    if (entry === '') continue;
    const m = entry.replace(/^Story\s+/i, '').match(/^(#\d+|\d+\.\d+)$/);
    if (!m) unreadable.push(entry);
    else if (!ids.includes(m[1])) ids.push(m[1]);
  }
  return { none: false, ids, unreadable, raw };
}

/**
 * Split a PRD into its stories.
 * @param {string} markdown - PRD text.
 * @returns {Array<{id: string, title: string, acceptanceCriteria: string[],
 *   dependsOn: {found: boolean, none: boolean, ids: string[], unreadable: string[], raw: string}}>}
 */
function parsePrdStories(markdown) {
  // Split into story blocks; each block ends at the next heading of level
  // 1–3 or a `---` rule. The acceptance criteria are read by checkbox-scan.js,
  // the one shared section/checkbox parser (#2616) — never re-derived here.
  const blocks = [];
  let current = null;
  for (const line of String(markdown || '').split(/\r?\n/)) {
    const heading = line.match(STORY_HEADING_RE);
    if (heading) {
      current = { id: heading[1], title: heading[2].trim(), lines: [] };
      blocks.push(current);
      continue;
    }
    if (!current) continue;
    if (/^#{1,3}\s/.test(line) || /^---\s*$/.test(line)) {
      current = null;
      continue;
    }
    current.lines.push(line);
  }

  return blocks.map(({ id, title, lines }) => {
    const body = lines.join('\n');
    const depLine = lines.map((l) => l.match(DEPENDS_LINE_RE)).find(Boolean);
    return {
      id,
      title,
      acceptanceCriteria: extractAcceptanceCriteria(body).items.map((i) => i.text.trim()),
      dependsOn: depLine
        ? { found: true, ...parseDependsValue(depLine[1]) }
        : { found: false, none: false, ids: [], unreadable: [], raw: '' },
    };
  });
}

/**
 * Check a story graph for a cycle through `topo-order.js`.
 * @param {Object<string, string[]>} graph - story id → ids it depends on.
 * @returns {{ok: boolean, order: string[], cycle: string[]|null, message: string|null,
 *   unknown: Array<{story: string, on: string}>}}
 *   `cycle` lists story ids in dependency order, first repeated last.
 *   `unknown` names edges to ids that are not stories in the graph; they are
 *   dropped from the check, never treated as satisfied silently.
 *   A story that depends on itself is a one-story cycle (`['1.1', '1.1']`):
 *   checked here, because topo-order.js reads a self-reference as an
 *   invalid entry rather than an edge and would otherwise sort it.
 */
function checkCycle(graph = {}) {
  const ids = Object.keys(graph);
  const self = ids.find((id) => (graph[id] || []).includes(id));
  if (self !== undefined) {
    const unknownEdges = ids.flatMap((id) => (graph[id] || [])
      .filter((on) => !ids.includes(on)).map((on) => ({ story: id, on })));
    return cycleResult([self, self], unknownEdges);
  }
  const numberOf = new Map(ids.map((id, i) => [id, i + 1]));
  const unknown = [];
  const members = ids.map((id) => {
    const deps = [];
    for (const on of graph[id] || []) {
      if (numberOf.has(on)) deps.push(`#${numberOf.get(on)}`);
      else unknown.push({ story: id, on });
    }
    const line = deps.length > 0 ? deps.join(', ') : 'none';
    return { number: numberOf.get(id), body: `**Depends on:** ${line}\n` };
  });
  const sorted = topoOrder({ members, tiebreak: members.map((m) => m.number) });
  const idOf = (n) => ids[n - 1];
  if (!sorted.ok) return cycleResult(sorted.cycle.map(idOf), unknown);
  return { ok: true, order: sorted.order.map(idOf), cycle: null, message: null, unknown };
}

function cycleResult(cycle, unknown) {
  return {
    ok: false,
    order: [],
    cycle,
    message: `Dependency cycle: ${cycle.map(label).join(' → ')}. `
      + 'No story can land first; nothing was written — break one edge and re-run.',
    unknown,
  };
}

/**
 * Infer candidate dependency edges for every story.
 * @param {ReturnType<typeof parsePrdStories>} stories
 * @returns {{ok: boolean, rule: string,
 *   candidates: Object<string, Array<{on: string, artifact: string|null, ac: string, reason: string}>>,
 *   edges: Object<string, string[]>, graph: Object<string, string[]>, missing: string[],
 *   cycle: string[]|null, message: string|null, order: string[],
 *   unknown: Array<{story: string, on: string}>, unreadable: Array<{story: string, entry: string}>,
 *   raw: Object<string, string>}}
 *   `edges` is the inferred graph for every story. `graph` is what would be
 *   written: a story's stated line where it has one, else its inferred
 *   edges — the graph the cycle check runs on. `missing` lists stories with
 *   no stated line (the ones `/create-backlog` must offer candidates for).
 *   `unknown` lists stated edges to a story not in the input; `unreadable`
 *   lists stated entries that are not a story id. Both are for the caller
 *   to show the user; neither is dropped or read as `none`.
 */
function inferDependencies(stories = []) {
  const ids = stories.map((s) => s.id);
  const owner = new Map();
  for (const s of stories) {
    for (const ac of s.acceptanceCriteria) {
      for (const a of createdArtifacts(ac)) if (!owner.has(a)) owner.set(a, s.id);
    }
  }

  const candidates = {};
  const edges = {};
  for (const s of stories) {
    const list = [];
    const seen = new Set();
    const add = (on, artifact, ac, reason) => {
      if (on === s.id || !ids.includes(on) || seen.has(on)) return;
      seen.add(on);
      list.push({ on, artifact, ac, reason });
    };
    for (const ac of s.acceptanceCriteria) {
      for (const m of ac.matchAll(STORY_REF_RE)) {
        const ref = m[1] || m[2];
        add(ref, null, ac, `AC names ${label(ref)}`);
      }
      for (const a of extractArtifacts(ac)) {
        // An owned artifact counts whole or as one word of a longer token
        // (`--dry-run` inside `/triage --dry-run`).
        const words = a.split(/\s+/);
        for (const [artifact, on] of owner) {
          if (artifact === a || words.includes(artifact)) {
            add(on, artifact, ac, `AC uses \`${artifact}\`, created by ${label(on)}`);
          }
        }
      }
    }
    candidates[s.id] = list;
    edges[s.id] = list.map((c) => c.on);
  }

  const graph = {};
  for (const s of stories) graph[s.id] = s.dependsOn && s.dependsOn.found ? s.dependsOn.ids : edges[s.id];
  const missing = stories.filter((s) => !(s.dependsOn && s.dependsOn.found)).map((s) => s.id);
  const unreadable = stories.flatMap((s) => ((s.dependsOn && s.dependsOn.unreadable) || [])
    .map((entry) => ({ story: s.id, entry })));
  const raw = Object.fromEntries(stories.map((s) => [s.id, (s.dependsOn && s.dependsOn.raw) || '']));
  const check = checkCycle(graph);
  return {
    ok: check.ok,
    rule: RULE,
    candidates,
    edges,
    graph,
    missing,
    cycle: check.cycle,
    message: check.message,
    order: check.order,
    unknown: check.unknown,
    unreadable,
    raw,
  };
}

/**
 * The `**Depends on:**` value for one story of an `inferDependencies`
 * result. A stated line with an entry that could not be read is returned
 * verbatim — never reformatted, and never collapsed to `none`.
 * @param {ReturnType<typeof inferDependencies>} result
 * @param {string} id
 * @returns {string}
 */
function formatStoryLine(result, id) {
  if ((result.unreadable || []).some((u) => u.story === id)) return result.raw[id];
  return formatDependsOn(result.graph[id] || []);
}

/**
 * Render a PRD-side `**Depends on:**` value.
 * @param {string[]} ids
 * @returns {string} `Story 1.1, Story 1.3` or `none`.
 */
function formatDependsOn(ids = []) {
  return ids.length > 0 ? ids.map(label).join(', ') : 'none';
}

/** `Story 1.2` for a PRD id; `#123` for an issue; `new` as is. */
function label(id) {
  return /^\d/.test(id) ? `Story ${id}` : id;
}

function main(argv) {
  const fs = require('fs');
  const i = argv.indexOf('--prd');
  if (i < 0 || !argv[i + 1]) {
    process.stderr.write('Usage: story-dependency-inference.js --prd <PRD.md>\n');
    return 2;
  }
  let text;
  try {
    text = fs.readFileSync(argv[i + 1], 'utf-8');
  } catch (err) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: err.message }, null, 2)}\n`);
    return 1;
  }
  const result = inferDependencies(parsePrdStories(text));
  result.lines = Object.fromEntries(Object.keys(result.graph).map((id) => [id, formatStoryLine(result, id)]));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.ok ? 0 : 1;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = {
  RULE,
  extractArtifacts,
  createdArtifacts,
  parseDependsValue,
  parsePrdStories,
  inferDependencies,
  checkCycle,
  formatDependsOn,
  formatStoryLine,
};
