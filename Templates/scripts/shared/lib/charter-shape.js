#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.114.0
 * @description Charter shape analysis for the /charter --refresh shape step (#3418).
 * @checksum sha256:placeholder
 *
 * A charter grows: In Scope bullets turn into paragraphs carrying history and
 * exclusions, Current Focus turns into a changelog and board snapshot. Long
 * In Scope bullets also defeat the scope check, which matches on shared words
 * (charter-scope.js), so an exclusion written inside an In Scope bullet
 * becomes a reason to accept the work it excludes.
 *
 * This module measures CHARTER.md against the intended summary shape and
 * reports; it never writes. The spec (`/charter --refresh`) proposes the
 * slimmed charter from this report, shows a diff and applies only on consent.
 *
 * The In Scope item count is reported for information and is never a finding:
 * the 3–5 count in the inception question is for a v1 charter, not a limit.
 *
 * Built-ins only: deployed with `.claude/scripts/shared/lib/` (runtime
 * dependency contract, rule 04).
 *
 * CLI: node .claude/scripts/shared/lib/charter-shape.js [--root <dir>] [--latest-tag <tag>|--no-tag] [--propose]
 *   → {"exists", "inShape", "inScope", "currentFocus", "staleness", "findings", "summary"[, "proposal"]}, exit 0
 *   --propose adds {proposed, cuts, relocations, audit} when the charter is out of shape. Never writes.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { parseCharterSections } = require('./charter-scope');
const { escapeRegExp } = require('./input-validation');

/**
 * The shape the step targets — the sections CommandsSrc/charter.md defines
 * today. One declared place, so a change of target shape (#2937) is one edit.
 */
const TARGET_SHAPE = ['Vision', 'Tech Stack', 'In Scope', 'Key Entities', 'Current Focus', 'Out of Scope'];

/** Declared thresholds. A one-line capability rarely needs more than this. */
const SHAPE_THRESHOLDS = {
  inScopeBulletWords: 25,
};

/**
 * Phrases that state an exclusion. "not" alone is deliberately absent: it is
 * ordinary prose ("search that does not block typing"), not an exclusion.
 */
const EXCLUSION_PHRASES = [
  'out of scope', 'stays out', 'stay out', 'not in scope', 'excluded', 'is not part of', 'are not part of',
  'does not include', 'do not include', 'not included', 'deferred to',
];

const VERSION_RE = /\bv?(\d+)\.(\d+)\.(\d+)\b/g;
const DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/;
const HISTORY_RE = /\b(shipped|released|delivered|landed|merged|completed in|incident)\b/i;
// Board state is a count beside a status ("Backlog: 14", "3 in progress"). A
// status word with any digit elsewhere on the line is not: "v0.113.0 in
// progress" names a release, and its digits are a version, not a count (#3429).
// A date part ("2026-10-24") or an issue reference ("#3247") is not a count
// either: '-', '#', '/' and ':' neighbors rule a number out (#3437). The one
// ':' a count may follow is the status word's own ("Backlog:14"), which the
// status branch consumes itself, so that branch's count drops ':' from its
// lookbehind (#3442).
const COUNT = String.raw`(?<![\w.#/:-])\d+(?![\w.\-/:])`;
const LABELED_COUNT = String.raw`(?<![\w.#/-])\d+(?![\w.\-/:])`;
const BOARD_STATUS = 'backlog|in progress|in review|ready|done|open issues?';
const BOARD_RE = new RegExp(String.raw`\b(${BOARD_STATUS})\b\s*[:(]?\s*${LABELED_COUNT}|${COUNT}\s+(issues?|open|in progress|in review|ready|done|stories|bugs)\b`, 'i');

/** Release history: a history verb, or a date beside a version. */
function isHistory(line) {
  return HISTORY_RE.test(line) || (DATE_RE.test(line) && versionsIn(line).length > 0);
}

/**
 * Board state, the one kind of line removed with no destination (#2931). A
 * line that is also history is never board state: removing it would delete
 * history (#3437).
 */
function isBoardState(line) {
  return BOARD_RE.test(line) && !isHistory(line);
}

/**
 * Number of whitespace-separated words in `text`.
 * @param {string} text
 * @returns {number}
 */
function wordCount(text) {
  return String(text || '').split(/\s+/).filter(Boolean).length;
}

/**
 * The first EXCLUSION_PHRASES entry `text` contains (case-insensitive), or
 * null when it states no exclusion.
 * @param {string} text
 * @returns {string|null}
 */
function exclusionPhrase(text) {
  const lower = String(text || '').toLowerCase();
  return EXCLUSION_PHRASES.find((p) => lower.includes(p)) || null;
}

/**
 * Code spans replaced by placeholders, and the inverse. The one masking
 * helper the analysis, the proposal trigger, reshapeBullet and the audit
 * share (#3437): a span is an identifier, so `out of scope` inside one is
 * not an exclusion and `a. B` inside one is not a sentence break — and all
 * four must agree, or --refresh reports a shape problem with no proposal.
 * @param {string} text
 * @returns {{masked: string, unmask: (s: string) => string}}
 */
function maskCode(text) {
  const spans = [];
  const masked = String(text || '').replace(/`[^`]*`/g, (m) => `\u0000${spans.push(m) - 1}\u0000`);
  return { masked, unmask: (s) => s.replace(/\u0000(\d+)\u0000/g, (_m, i) => spans[Number(i)]) };
}

/** exclusionPhrase outside code spans. */
function statesExclusion(text) {
  return exclusionPhrase(maskCode(text).masked);
}

function versionsIn(text) {
  const out = [];
  for (const m of String(text || '').matchAll(VERSION_RE)) out.push([Number(m[1]), Number(m[2]), Number(m[3])]);
  return out;
}

/**
 * Versions in `text` written the way the project's tags are: v-prefixed when
 * the latest tag is (or when no tag is known), bare otherwise. A dependency
 * version ("Node 22.0.0") is not a release and must not decide staleness
 * (#3429).
 * @param {string} text
 * @param {string|null} latestTag
 * @returns {number[][]}
 */
function releaseVersionsIn(text, latestTag) {
  const prefixed = !latestTag || /^v/i.test(latestTag);
  const out = [];
  for (const m of String(text || '').matchAll(VERSION_RE)) {
    if (/^v/i.test(m[0]) === prefixed) out.push([Number(m[1]), Number(m[2]), Number(m[3])]);
  }
  return out;
}

function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/**
 * The nearest tag reachable from HEAD (`git describe --tags --abbrev=0`) —
 * not the highest-numbered tag in the repository. On a branch cut before a
 * later release this is the older tag, so staleness is judged against what
 * the branch contains. Null when git fails, times out, or no tag is reachable.
 * @param {string} root - repository directory
 * @returns {string|null}
 */
function latestGitTag(root) {
  try {
    // Bounded (#2469): a hung git must not stall the caller; a timeout reads as no tag.
    return execSync('git describe --tags --abbrev=0', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim() || null;
  } catch (_e) {
    return null;
  }
}

/**
 * Measure a charter against the target shape.
 * @param {string|null} charterText - CHARTER.md content, or null when absent
 * @param {{latestTag?: string|null, thresholds?: object}} [opts]
 */
function analyzeCharterShape(charterText, opts = {}) {
  if (charterText === null || charterText === undefined) {
    return { exists: false, inShape: null, findings: [], summary: 'No CHARTER.md — nothing to shape.' };
  }
  const thresholds = { ...SHAPE_THRESHOLDS, ...(opts.thresholds || {}) };
  const { inScope, currentFocus } = parseCharterSections(charterText);
  const findings = [];

  const overThreshold = inScope
    .map((item) => ({ item, words: wordCount(item) }))
    .filter((b) => b.words > thresholds.inScopeBulletWords);
  for (const b of overThreshold) {
    findings.push({ kind: 'bullet-length', item: b.item, detail: `${b.words} words (threshold ${thresholds.inScopeBulletWords})` });
  }

  // A one-line capability is one sentence; a second sentence is detail.
  const multiSentence = inScope.filter((item) => splitSentences(item).length > 1);
  for (const item of multiSentence) {
    if (!overThreshold.some((b) => b.item === item)) findings.push({ kind: 'bullet-sentences', item, detail: `${splitSentences(item).length} sentences` });
  }

  const exclusions = inScope
    .map((item) => ({ item, phrase: statesExclusion(item) }))
    .filter((e) => e.phrase);
  for (const e of exclusions) findings.push({ kind: 'exclusion-in-scope', item: e.item, detail: `"${e.phrase}"` });

  const board = currentFocus.filter(isBoardState);
  const history = currentFocus.filter((line) => !board.includes(line) && isHistory(line));
  for (const line of history) findings.push({ kind: 'focus-history', item: line, detail: 'release history in Current Focus' });
  for (const line of board) findings.push({ kind: 'focus-board', item: line, detail: 'board or issue counts in Current Focus' });

  const latestTag = opts.latestTag === undefined ? null : opts.latestTag;
  const mentioned = currentFocus.flatMap((line) => releaseVersionsIn(line, latestTag)).sort(compareVersions);
  const newest = mentioned.length ? mentioned[mentioned.length - 1] : null;
  const latest = latestTag ? versionsIn(latestTag)[0] || null : null;
  const staleness = {
    latestTag: latestTag || null,
    newestMentioned: newest ? newest.join('.') : null,
    verifiable: Boolean(latest),
    stale: Boolean(newest && latest && compareVersions(newest, latest) < 0),
  };
  if (staleness.stale) {
    findings.push({ kind: 'stale-version', item: staleness.newestMentioned, detail: `Current Focus names ${staleness.newestMentioned}; latest tag is ${latestTag}` });
  }

  const inShape = findings.length === 0;
  const summary = inShape
    ? `CHARTER.md is already in shape (${inScope.length} In Scope items) — nothing to change.`
    : `CHARTER.md shape: ${findings.length} finding(s) — ${[...new Set(findings.map((f) => f.kind))].join(', ')}.`;

  return {
    exists: true,
    inShape,
    inScope: { count: inScope.length, overThreshold, multiSentence, exclusions },
    currentFocus: { count: currentFocus.length, history, board },
    staleness,
    findings,
    summary,
  };
}

// ── Proposal, homes and the removal audit ─────────────────────────────────────

/** Where a cut passage goes when no existing document already holds it. */
const RELOCATION_TARGETS = {
  detail: 'Inception/Scope-Boundaries.md',
  history: 'Inception/Milestones.md',
};

function normalize(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').replace(/[\s.;:,]+$/, '').trim();
}

/**
 * A period after one of these does not end a sentence: "Hooks, e.g. startup"
 * is one sentence, and splitting it gave a false finding and a proposal cut
 * at "Hooks, e.g" (#3429).
 */
const ABBREVIATIONS = ['e.g', 'i.e', 'etc', 'vs', 'cf', 'incl', 'approx', 'viz', 'esp'];
// Full escape (#3446, CodeQL js/incomplete-sanitization): escaping only `.`
// was correct for today's list but not for an entry with another metacharacter.
const NOT_ABBREVIATION = ABBREVIATIONS.map((a) => `(?<!\\b${escapeRegExp(a)}\\.)`).join('');
const SENTENCE_BREAK = new RegExp(`${NOT_ABBREVIATION}(?<=[.!?])\\s+`, 'i');
const CLAUSE_BREAK = new RegExp(`${NOT_ABBREVIATION}(?<=[.!?;])\\s+`, 'i');

/**
 * Sentences end at . ! or ? — a semicolon, often inside an aside, does not end
 * one, and neither does a break inside a code span (maskCode, #3437).
 */
function splitSentences(text) {
  const { masked, unmask } = maskCode(text);
  return masked.split(SENTENCE_BREAK).map((s) => unmask(s.trim())).filter(Boolean);
}

/** Clauses for reshaping: sentences, further split at a semicolon. Asides are extracted first. */
function splitClauses(text) {
  return String(text || '').split(CLAUSE_BREAK).map((s) => s.trim()).filter(Boolean);
}

/** Path of the first source whose content holds the passage, else null. */
function findExistingHome(passage, sources) {
  const needle = normalize(passage);
  if (!needle) return null;
  for (const s of sources || []) {
    if (normalize(s.content).includes(needle)) return s.path;
  }
  return null;
}

function homed(cut, sources) {
  const home = findExistingHome(cut.text, sources);
  if (home) return { ...cut, disposition: 'pointer', destination: home };
  return { ...cut, disposition: 'relocate', destination: RELOCATION_TARGETS[cut.kind] };
}

/**
 * The text with each balanced top-level parenthetical removed, `onAside`
 * called with its content (#3437): "Sync engine (local cache (IndexedDB) and
 * merge)" is one aside, not an inner "IndexedDB". An empty `()` attached to a
 * word or a code span — an unbackticked call, `init()`, or `` `init`() `` — is left in place; any other empty
 * aside is dropped. An unbalanced `(` leaves the rest of the text as it is.
 * @param {string} text - code spans already masked
 * @param {(inner: string) => void} onAside
 * @returns {string}
 */
function extractAsides(text, onAside) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '(') { out += text[i++]; continue; }
    let depth = 0;
    let j = i;
    for (; j < text.length; j++) {
      if (text[j] === '(') depth++;
      else if (text[j] === ')' && --depth === 0) break;
    }
    if (j >= text.length) return out + text.slice(i);
    const inner = text.slice(i + 1, j);
    // A masked code span ends in its \u0000 placeholder, so `init`() is
    // attached too (#3442).
    if (!inner.trim() && i > 0 && /[\w\u0000]/.test(text[i - 1])) {
      out += text.slice(i, j + 1);
    } else {
      out = out.replace(/\s+$/, '');
      if (inner.trim()) onAside(inner);
    }
    i = j + 1;
  }
  return out;
}

/**
 * Split one In Scope bullet into its capability line and its cuts.
 * Parentheticals and extra sentences are cut; exclusions are moved to Out of
 * Scope. Items are shortened, never merged: broader wording matches more.
 */
function reshapeBullet(bullet, sources) {
  const cuts = [];
  // Code spans are masked first (maskCode, shared with the analysis, the
  // trigger and the audit — #3437): `fn()` is an identifier, not an aside
  // (#3429), and `out of scope` inside a span is not an exclusion.
  const { masked, unmask } = maskCode(bullet);
  // Asides next, from the whole bullet, so a semicolon inside one is never a split.
  const bare = extractAsides(masked, (inner) => {
    const kind = exclusionPhrase(inner) ? 'exclusion' : 'detail';
    cuts.push({ kind, text: unmask(inner.trim()) });
  });
  // Clauses are judged masked and unmasked only for output.
  const pieces = splitClauses(bare);
  const remainders = pieces.map(unmask);
  let capability = null;
  pieces.forEach((p, i) => {
    const r = remainders[i];
    if (exclusionPhrase(p)) cuts.push({ kind: 'exclusion', text: r.replace(/[\s.;]+$/, '') });
    else if (capability === null) capability = r.replace(/[\s.;:,]+$/, '');
    else cuts.push({ kind: 'detail', text: r });
  });
  const moved = (c) => ({ ...c, section: 'In Scope', disposition: 'moved', destination: 'CHARTER.md Out of Scope' });
  // No capability clause and an exclusion anywhere — asides included: the
  // bullet names nothing in scope, so it leaves In Scope entirely (#3429) and
  // moves as ONE item, its qualifying asides with it (#3437). Judged over
  // every piece: an aside-only exclusion "(Mobile apps are out of scope.)"
  // has no clauses at all, and stayed in In Scope while also being moved.
  if (capability === null && cuts.some((c) => c.kind === 'exclusion')) {
    const text = pieces.length === 0 && cuts.length === 1 ? cuts[0].text : bullet.trim();
    return { capability: null, cuts: [moved({ kind: 'exclusion', text: text.replace(/[\s.;]+$/, '') })] };
  }
  const resolved = cuts.map((c) => (c.kind === 'exclusion' ? moved(c) : homed({ ...c, section: 'In Scope' }, sources)));
  return { capability: capability === null ? bullet : capability, cuts: resolved };
}

/**
 * Lines of `text` with each one's own terminator, and the dominant ending —
 * the more frequent of CRLF and LF, LF on a tie.
 * @param {string} text
 * @returns {{lines: string[], ends: string[], dominant: string}}
 */
function splitLines(text) {
  const parts = String(text).split(/(\r\n|\n)/);
  const lines = [];
  const ends = [];
  for (let k = 0; k < parts.length; k += 2) {
    lines.push(parts[k]);
    ends.push(parts[k + 1] || '');
  }
  const crlf = ends.filter((e) => e === '\r\n').length;
  return { lines, ends, dominant: crlf > ends.filter((e) => e === '\n').length ? '\r\n' : '\n' };
}

/**
 * Insert lines at `at`, each ending with `eol`. Inserting after a last line
 * that has no terminator gives that line one, and the last inserted line
 * takes its place as the unterminated end of the file.
 */
function insertLines(out, at, texts, eol) {
  const entries = texts.map((text) => ({ text, eol }));
  if (at === out.length && out.length && out[out.length - 1].eol === '') {
    out[out.length - 1].eol = eol;
    entries[entries.length - 1].eol = '';
  }
  out.splice(at, 0, ...entries);
}

/**
 * Propose a slimmed charter. Pure: returns the proposed text and every cut
 * with its disposition — `moved` (exclusion → Out of Scope), `pointer` (an
 * existing document holds it; nothing is copied), `relocate` (found nowhere;
 * destination named), `removed` (board state, per #2931).
 * @param {string} charterText
 * @param {{sources?: Array<{path: string, content: string}>, thresholds?: object}} [opts]
 */
function proposeShape(charterText, opts = {}) {
  const sources = opts.sources || [];
  const thresholds = { ...SHAPE_THRESHOLDS, ...(opts.thresholds || {}) };
  // Lines are matched without their terminators — on a CRLF charter the
  // heading match never fired (#3429) — and each keeps its own: rewriting
  // every line to one ending put untouched lines in the consent diff (#3437).
  // Only inserted lines take the dominant ending.
  const { lines, ends, dominant } = splitLines(charterText);
  const cuts = [];
  const moved = [];
  let section = null;
  let lastOutOfScope = -1;
  const out = [];

  lines.forEach((line, idx) => {
    const keep = (text) => out.push({ text, eol: ends[idx] });
    const heading = line.match(/^##\s+(.*)$/);
    if (heading) {
      section = /^In Scope/i.test(heading[1]) ? 'in' : /^Out of Scope/i.test(heading[1]) ? 'out' : /^Current Focus/i.test(heading[1]) ? 'focus' : null;
      // The heading and every non-blank line under it mark where moved
      // exclusions go — a prose-only section is still the section (#3437).
      if (section === 'out') lastOutOfScope = out.length;
      keep(line);
      return;
    }
    const bullet = line.match(/^(\s*[-*]\s+)(.*\S)\s*$/);
    if (!bullet || !section) {
      if (section === 'out' && line.trim()) lastOutOfScope = out.length;
      keep(line);
      return;
    }
    const text = bullet[2];
    if (section === 'in' && (wordCount(text) > thresholds.inScopeBulletWords || statesExclusion(text) || splitSentences(text).length > 1)) {
      const r = reshapeBullet(text, sources);
      cuts.push(...r.cuts);
      moved.push(...r.cuts.filter((c) => c.disposition === 'moved').map((c) => c.text));
      if (r.capability !== null) keep(`${bullet[1]}${r.capability}`);
      return;
    }
    if (section === 'focus' && isBoardState(text)) {
      cuts.push({ section: 'Current Focus', kind: 'board', text, disposition: 'removed', destination: null });
      return;
    }
    if (section === 'focus' && isHistory(text)) {
      cuts.push(homed({ section: 'Current Focus', kind: 'history', text }, sources));
      return;
    }
    if (section === 'out') lastOutOfScope = out.length;
    keep(line);
  });

  if (moved.length) {
    const added = moved.map((m) => `- ${m}`);
    if (lastOutOfScope >= 0) insertLines(out, lastOutOfScope + 1, added, dominant);
    else insertLines(out, out.length, ['## Out of Scope', ...added], dominant);
  }
  return { proposed: cuts.length ? out.map((o) => o.text + o.eol).join('') : String(charterText), cuts };
}

/**
 * Contents each relocation destination would have after the cuts land. Only
 * `relocate` cuts are copied; a `pointer` cut already has a home. Never writes.
 * @param {Array} cuts
 * @param {Object<string,string>} existing - current destination contents
 * @returns {Object<string,string>} destination path → new content
 */
function planRelocations(cuts, existing = {}) {
  const plan = {};
  for (const c of cuts) {
    if (c.disposition !== 'relocate') continue;
    if (!(c.destination in plan)) {
      const base = existing[c.destination] || '';
      plan[c.destination] = `${base}${base && !base.endsWith('\n') ? '\n' : ''}\n## Relocated from CHARTER.md\n`;
    }
    plan[c.destination] += `- ${c.text}\n`;
  }
  return plan;
}

function bulletSentences(charterText) {
  const { inScope, currentFocus } = parseCharterSections(charterText);
  return [...inScope, ...currentFocus].flatMap(splitSentences);
}

/**
 * Every sentence the proposal removed must be accounted for: still in the
 * charter, at its named destination, or listed as removed. Returns the
 * sentences that are not — the silent drops.
 * @param {{before: string, after: string, cuts: Array, destinations: Object<string,string>}} args
 */
function auditRemovals({ before, after, cuts, destinations }) {
  const afterNorm = normalize(after);
  const accounted = (cuts || []).filter((c) => {
    // Re-judged here, whatever classified the cut (#3437): only board state may
    // leave with no destination.
    if (c.disposition === 'removed') return isBoardState(c.text);
    if (c.disposition === 'moved') return afterNorm.includes(normalize(c.text));
    return Boolean(c.destination && normalize((destinations || {})[c.destination]).includes(normalize(c.text)));
  }).map((c) => normalize(c.text));

  const unaccounted = [];
  for (const sentence of bulletSentences(before)) {
    let residual = normalize(sentence);
    if (afterNorm.includes(residual)) continue;
    for (const t of accounted) if (t && residual.includes(t)) residual = residual.split(t).join(' ');
    // An aside whose content was accounted for leaves its brackets, and maybe
    // its closing punctuation: "(Mobile apps are out of scope.)" → "( .)" (#3437).
    residual = normalize(residual.replace(/\(\s*[.;:,]?\s*\)/g, ' ').replace(/^[\s.;:,]+/, ''));
    if (!residual || afterNorm.includes(residual)) continue;
    unaccounted.push(sentence);
  }
  return { unaccounted };
}

/** Where a cut passage may already live: searched before anything is relocated. */
const HOME_SOURCES = ['CHANGELOG.md', 'PRD', 'Construction/Design-Decisions', 'Proposal', 'Inception'];

/**
 * Read every markdown file under HOME_SOURCES (directories recursively).
 * Missing paths are skipped. Returns [{path, content}] with root-relative,
 * forward-slash paths.
 *
 * No path is looked up before it is read (#3446, CodeQL js/file-system-race):
 * a directory is listed directly, ENOTDIR means it is a file, and a file
 * that vanishes before its read is skipped like one that never existed.
 */
function gatherSources(root) {
  const out = [];
  const visit = (rel) => {
    const abs = path.join(root, rel);
    let names;
    try {
      names = fs.readdirSync(abs);
    } catch (err) {
      if (err.code !== 'ENOTDIR') return;
      if (!/\.md$/i.test(rel)) return;
      try {
        out.push({ path: rel, content: fs.readFileSync(abs, 'utf8') });
      } catch (readErr) {
        if (readErr.code !== 'ENOENT') throw readErr;
      }
      return;
    }
    for (const name of names.sort()) visit(path.posix.join(rel, name));
  };
  for (const rel of HOME_SOURCES) visit(rel);
  return out;
}

/**
 * Contract tests that pin CHARTER.md text (#3456). A cut the proposal calls
 * harmless can remove a string a test asserts, and the project learned that
 * only from a red CI run after the commit. A test declares its non-code
 * subject with `@subject` in its leading comment block — the grammar
 * `Reference/Contract-Test-Classification.md` states, read here directly:
 * the skill that owns its reader is copied into a project, so a deployed
 * shared script cannot assume it is present.
 */
const PIN_SUBJECT = 'CHARTER.md';
/** Shorter literals ('utf8', 'x') occur by chance in prose; only longer ones pin. */
const MIN_PINNED_LITERAL = 8;
const TEST_FILE_RE = /(\.(test|spec)\.[cm]?[jt]sx?$)|(_test\.(go|py|rb)$)|(^test_.*\.py$)|(_spec\.rb$)/i;
const TEST_DIR_RE = /^(tests?|__tests__|spec)$/i;
const CODE_EXT_RE = /\.([cm]?[jt]sx?|py|rb|go|java|kt|cs|php|rs|swift)$/i;
const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage', 'dist', 'build', 'out', 'vendor', '.next', 'target', '.venv', 'venv', '__pycache__']);
const MAX_TEST_BYTES = 512 * 1024;

/** The comments before the first line of code: `//`, `/* … *\/` and `#` lines. */
function leadingCommentBlock(text) {
  const lines = String(text).replace(/^#!.*\n/, '').split(/\r?\n/);
  const block = [];
  let inBlock = false;
  for (const line of lines) {
    const t = line.trim();
    if (inBlock) {
      block.push(t);
      if (t.includes('*/')) inBlock = false;
      continue;
    }
    if (!t) continue;
    if (t.startsWith('//') || t.startsWith('#')) { block.push(t); continue; }
    if (t.startsWith('/*')) { block.push(t); inBlock = !t.includes('*/', 2); continue; }
    break;
  }
  return block.join('\n');
}

function declaresSubject(text, subject = PIN_SUBJECT) {
  const re = /@subject\s+(\S+)/g;
  let m;
  while ((m = re.exec(leadingCommentBlock(text)))) {
    if (m[1].replace(/^\.\//, '') === subject) return true;
  }
  return false;
}

const ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };

/** One escape sequence at `s[i]` (the char after `\`): [value, chars consumed]. */
function unescapeAt(s, i) {
  const c = s[i];
  if (c === 'u' && /^[0-9a-f]{4}/i.test(s.slice(i + 1, i + 5))) return [String.fromCharCode(parseInt(s.slice(i + 1, i + 5), 16)), 5];
  if (c === 'x' && /^[0-9a-f]{2}/i.test(s.slice(i + 1, i + 3))) return [String.fromCharCode(parseInt(s.slice(i + 1, i + 3), 16)), 3];
  return [ESCAPES[c] !== undefined ? ESCAPES[c] : c, 1];
}

/**
 * Every string literal in a test file, unescaped — `'…'`, `"…"` and the static
 * parts of `` `…` `` — skipping comments, so an apostrophe in prose opens no
 * string. `#` starts a comment only in the languages where it does.
 */
function stringLiterals(text, { hashComments = false } = {}) {
  const s = String(text);
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && s[i + 1] === '*') { const end = s.indexOf('*/', i + 2); i = end === -1 ? s.length : end + 2; continue; }
    if (c === '#' && hashComments) { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c !== "'" && c !== '"' && c !== '`') { i++; continue; }
    let value = '';
    i++;
    while (i < s.length && s[i] !== c) {
      if (s[i] === '\\') { const [v, n] = unescapeAt(s, i + 1); value += v; i += 1 + n; continue; }
      if (c === '`' && s[i] === '$' && s[i + 1] === '{') {
        // An interpolation ends one static part; its expression is skipped.
        out.push(value);
        value = '';
        let depth = 0;
        for (i += 1; i < s.length; i++) {
          if (s[i] === '{') depth++;
          else if (s[i] === '}' && --depth === 0) { i++; break; }
        }
        continue;
      }
      if (c !== '`' && s[i] === '\n') break; // an unterminated quote is not a literal
      value += s[i++];
    }
    i++;
    out.push(value);
  }
  return out.filter((v) => v.trim().length >= MIN_PINNED_LITERAL);
}

/**
 * Test files under `root` whose leading comment block declares
 * `@subject CHARTER.md`, with their string literals. A file is a test by name
 * (`*.test.js`, `test_*.py`, …) or by a code file inside a test directory.
 * Symlinked directories are not followed: in a hub-installed project they
 * lead into the shared hub. Read with no prior lookup, as gatherSources is.
 * @returns {Array<{path: string, literals: string[]}>}
 */
function findPinningTests(root) {
  const out = [];
  const visit = (rel, inTestDir) => {
    let entries;
    try {
      entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const childRel = rel ? path.posix.join(rel, e.name) : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) visit(childRel, inTestDir || TEST_DIR_RE.test(e.name));
        continue;
      }
      if (!e.isFile() || !CODE_EXT_RE.test(e.name)) continue;
      if (!TEST_FILE_RE.test(e.name) && !inTestDir) continue;
      let content;
      try {
        content = fs.readFileSync(path.join(root, childRel), 'utf8');
      } catch {
        continue;
      }
      if (content.length > MAX_TEST_BYTES || !declaresSubject(content)) continue;
      out.push({ path: childRel, literals: stringLiterals(content, { hashComments: /\.(py|rb)$/i.test(e.name) }) });
    }
  };
  visit('', false);
  return out;
}

/** The literals of each pinning test that occur within the text a cut removes. */
function pinnedBy(cut, tests) {
  const removed = String(cut.text || '');
  const hits = [];
  for (const t of tests) {
    // A literal pinning the whole sentence keeps its full stop; a cut may not.
    const literals = [...new Set(t.literals.filter((l) => removed.includes(l) || removed.includes(l.replace(/[\s.;:,]+$/, ''))))];
    if (literals.length) hits.push({ test: t.path, literals });
  }
  return hits;
}

/**
 * The full proposal for a project root: cuts with dispositions, the
 * relocation plan, and the removal audit. Every cut carries `pinnedBy` — the
 * contract tests holding a string it removes (#3456), empty when none.
 * Advisory: a pinned cut is still proposed. Writes nothing.
 */
function proposeForRoot(root, text) {
  const sources = gatherSources(root);
  const shaped = proposeShape(text, { sources });
  const { proposed } = shaped;
  const tests = findPinningTests(root);
  const cuts = shaped.cuts.map((c) => ({ ...c, pinnedBy: pinnedBy(c, tests) }));
  const existing = {};
  for (const dest of Object.values(RELOCATION_TARGETS)) {
    const abs = path.join(root, dest);
    if (fs.existsSync(abs)) existing[dest] = fs.readFileSync(abs, 'utf8');
  }
  const relocations = planRelocations(cuts, existing);
  const destinations = { ...existing, ...relocations };
  for (const s of sources) if (!(s.path in destinations)) destinations[s.path] = s.content;
  return { proposed, cuts, relocations, audit: auditRemovals({ before: text, after: proposed, cuts, destinations }) };
}

function parseArgs(argv) {
  const opts = { root: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') opts.root = argv[++i];
    else if (argv[i] === '--latest-tag') opts.latestTag = argv[++i];
    else if (argv[i] === '--no-tag') opts.latestTag = null;
    else if (argv[i] === '--propose') opts.propose = true;
  }
  return opts;
}

module.exports = {
  analyzeCharterShape,
  proposeShape,
  findExistingHome,
  planRelocations,
  auditRemovals,
  latestGitTag,
  gatherSources,
  proposeForRoot,
  findPinningTests,
  stringLiterals,
  leadingCommentBlock,
  PIN_SUBJECT,
  MIN_PINNED_LITERAL,
  HOME_SOURCES,
  wordCount,
  exclusionPhrase,
  SHAPE_THRESHOLDS,
  TARGET_SHAPE,
  EXCLUSION_PHRASES,
  RELOCATION_TARGETS,
};

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  const file = path.join(opts.root, 'CHARTER.md');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const latestTag = opts.latestTag === undefined ? latestGitTag(opts.root) : opts.latestTag;
  const report = analyzeCharterShape(text, { latestTag });
  // --propose adds the proposal; still writes nothing — the spec applies it
  // only after the user confirms the diff.
  if (opts.propose && text !== null && !report.inShape) report.proposal = proposeForRoot(opts.root, text);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}
