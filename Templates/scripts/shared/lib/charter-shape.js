#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.120.0
 * @description Charter shape analysis for the /charter --refresh shape step (#3418).
 * @checksum sha256:placeholder
 *
 * A charter grows: In Scope bullets turn into paragraphs carrying history and
 * exclusions. An exclusion written inside an In Scope bullet belongs in Out of
 * Scope, where the scope call reads it as one. Current Focus is a retired
 * section (contract version 2, #3643): its history and board findings are
 * retired with it, and the legacy detection reports the section itself.
 *
 * The module has two halves with different safety pictures:
 *
 * - Analysis and proposal (analyzeCharterShape, proposeShape, proposeForRoot)
 *   are read-only: they measure CHARTER.md against the intended summary shape
 *   and report. The spec (`/charter --refresh`) proposes the slimmed charter
 *   from this report, shows a diff and applies only on consent.
 * - The in-place repair half writes (#3648, #3654). runLosslessRepair writes
 *   CHARTER.md, moves the living documents with `git mv` (a plain move when
 *   untracked) and writes Inventory Notes and the Key Decisions record without
 *   a prompt — nothing it touches is lost. applyTableRewrite rewrites CHARTER.md
 *   and applyDeletions removes sections and files (`git rm` when tracked) only
 *   on consent. planRepair and planDeletions are their read-only dry runs.
 *
 * The In Scope item count is reported for information and is never a finding:
 * the 3–5 count in the inception question is for a v1 charter, not a limit.
 *
 * Built-ins only: deployed with `.claude/scripts/shared/lib/` (runtime
 * dependency contract, rule 04).
 *
 * CLI: node .claude/scripts/shared/lib/charter-shape.js [flags]
 * One JSON document on stdout. A thrown error prints {"ok": false, "error"}, exit 1.
 * Modes, first match wins (--locate, --plan, --repair, --rewrite-tables, --delete); none → analysis:
 *   --root <dir>          project root (default: the working directory). Every mode.
 *   --latest-tag <tag>    analysis: the release tag staleness is measured against (default: git describe).
 *   --no-tag              analysis: no tag — staleness is not measured.
 *   --propose             analysis: adds "proposal" {proposed, cuts, relocations, audit} when out of shape.
 *                         Read-only. Analysis output: {"exists", "inShape", "inScope", "currentFocus",
 *                         "staleness", "findings", "summary"[, "proposal"]}, exit 0.
 *   --plan                read-only dry run of the whole repair → {"ok", "writes": false, "lossless", "rewrite",
 *                         "deletions"}; a failing dry-run step is "ok": false with the step's "error" inside
 *                         lossless.steps, exit 1; else exit 0.
 *   --repair              WRITES: runs the lossless steps → {"ok", "alreadyRepaired", "steps", "summary"};
 *                         a failing step is status "error", later steps "not-run", exit 1; else exit 0.
 *   --locate <file>       read-only: where a living document is → {"path", "legacy", "message"}, exit 0;
 *                         an unknown name → {"ok": false, "error", "accepted"}, exit 1.
 *   --rewrite-tables      WRITES CHARTER.md — the consented table rewrite → {"status", "tables", "message"}, exit 0.
 *   --delete <id,id,...>  WRITES — deletes exactly the consented plan ids → {"deleted", "kept", "refused",
 *                         "inceptionRemoved"}, exit 0.
 *   --today <YYYY-MM-DD>  --repair/--plan: the date in the Key Decisions record's file name.
 *   --destination <name>=<path>  --repair/--plan, repeatable: a chosen destination for a colliding
 *                         document (Architecture.md, Constraints.md, Test-Strategy.md) or Key-Decisions.
 */

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');
const { parseCharterSections } = require('./charter-scope');
const { escapeRegExp } = require('./input-validation');
const { loadCharterContract, checkContractShape, headingMatches } = require('./charter-template');

/**
 * The shape the step targets — the charter contract's `requiredSections`
 * (#3481). One declared place, so a change of target shape (#2937) is one edit
 * to the contract.
 */
const TARGET_SHAPE = [...loadCharterContract().requiredSections];

/** Declared thresholds, from the contract. A one-line capability rarely needs more. */
const SHAPE_THRESHOLDS = { ...loadCharterContract().shapeThresholds };

/**
 * Phrases that state an exclusion. "not" alone is deliberately absent: it is
 * ordinary prose ("search that does not block typing"), not an exclusion.
 */
const EXCLUSION_PHRASES = [
  'out of scope', 'stays out', 'stay out', 'not in scope', 'excluded', 'is not part of', 'are not part of',
  'does not include', 'do not include', 'not included', 'deferred to',
];

const VERSION_RE = /\bv?(\d+)\.(\d+)\.(\d+)\b/g;

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

/** Bullets under a legacy `## Current Focus` heading; [] when there is none. */
function currentFocusBullets(charterText) {
  const m = String(charterText || '').match(/^##\s+Current Focus[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/im);
  if (!m) return [];
  return m[1].split('\n').map((l) => l.match(/^\s*[-*]\s+(.*\S)\s*$/)).filter(Boolean).map((x) => x[1]);
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
  const { inScope } = parseCharterSections(charterText);
  // Read here, not by the scope helper (#3653): Current Focus is a retired
  // section, read only by this legacy analysis for its stale-version signal.
  const currentFocus = currentFocusBullets(charterText);
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
    currentFocus: { count: currentFocus.length },
    staleness,
    findings,
    summary,
  };
}

// ── Proposal, homes and the removal audit ─────────────────────────────────────

/**
 * Where a cut passage goes when no existing document already holds it. Both
 * are design-decision notes (#3650): the lifecycle files that held them are
 * retired with Inception/.
 */
const RELOCATION_TARGETS = {
  detail: 'Construction/Design-Decisions/charter-scope-notes.md',
  history: 'Construction/Design-Decisions/charter-history-notes.md',
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
 * Scope. A short founding list of broad capabilities is fine (#3643): the
 * scope call is a judgment over the bullets, not a word match.
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
 * destination named). Current Focus is retired (#3643) and never cut here.
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
      section = /^In Scope/i.test(heading[1]) ? 'in' : /^Out of Scope/i.test(heading[1]) ? 'out' : null;
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
  return parseCharterSections(charterText).inScope.flatMap(splitSentences);
}

/**
 * Every sentence the proposal removed must be accounted for: still in the
 * charter, or at its named destination. Returns the
 * sentences that are not — the silent drops.
 * @param {{before: string, after: string, cuts: Array, destinations: Object<string,string>}} args
 */
function auditRemovals({ before, after, cuts, destinations }) {
  const afterNorm = normalize(after);
  const accounted = (cuts || []).filter((c) => {
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
const HOME_SOURCES = ['CHANGELOG.md', 'PRD', 'Construction/Design-Decisions', 'Proposal', 'Project'];

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
/**
 * Files the pinning walk examines before it stops (#3474). It runs on every
 * --propose over the whole project tree; past the cap the proposal says the
 * walk was truncated rather than reading on without bound.
 */
const MAX_PINNING_WALK_FILES = 20000;
/** Scratch and worktree copies (`.tmp-wt-*`) hold duplicates of the project's tests (#3474). */
const SCRATCH_DIR_PREFIX = '.tmp-';

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
  // Measured after stripping what pinnedBy() strips (#3474): '........' is
  // eight characters but strips to '', and every cut includes ''.
  return out.filter((v) => stripTrailing(v).trim().length >= MIN_PINNED_LITERAL);
}

/** Trailing whitespace and sentence punctuation, which a cut may not carry. */
function stripTrailing(literal) {
  return literal.replace(/[\s.;:,]+$/, '');
}

/**
 * Test files under `root` whose leading comment block declares
 * `@subject CHARTER.md`, with their string literals. A file is a test by name
 * (`*.test.js`, `test_*.py`, …) or by a code file inside a test directory.
 * Symlinked directories are not followed: in a hub-installed project they
 * lead into the shared hub. Read with no prior lookup, as gatherSources is.
 * `.tmp-*` directories are skipped, and the walk stops after `maxFiles` files
 * (#3474), reporting `truncated`.
 * @param {string} root
 * @param {{maxFiles?: number}} [opts]
 * @returns {{tests: Array<{path: string, literals: string[]}>, truncated: boolean}}
 */
function walkPinningTests(root, { maxFiles = MAX_PINNING_WALK_FILES } = {}) {
  const out = [];
  let seen = 0;
  let truncated = false;
  const visit = (rel, inTestDir) => {
    let entries;
    try {
      entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (truncated) return;
      const childRel = rel ? path.posix.join(rel, e.name) : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(SCRATCH_DIR_PREFIX)) visit(childRel, inTestDir || TEST_DIR_RE.test(e.name));
        continue;
      }
      if (!e.isFile()) continue;
      if (++seen > maxFiles) { truncated = true; return; }
      if (!CODE_EXT_RE.test(e.name)) continue;
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
  return { tests: out, truncated };
}

/** The pinning tests alone: walkPinningTests() without the truncation flag. */
function findPinningTests(root, opts) {
  return walkPinningTests(root, opts).tests;
}

/** The literals of each pinning test that occur within the text a cut removes. */
function pinnedBy(cut, tests) {
  const removed = String(cut.text || '');
  const hits = [];
  for (const t of tests) {
    // A literal pinning the whole sentence keeps its full stop; a cut may not.
    const literals = [...new Set(t.literals.filter((l) => removed.includes(l) || removed.includes(stripTrailing(l))))];
    if (literals.length) hits.push({ test: t.path, literals });
  }
  return hits;
}

/**
 * The full proposal for a project root: cuts with dispositions, the
 * relocation plan, and the removal audit. Every cut carries `pinnedBy` — the
 * contract tests holding a string it removes (#3456), empty when none.
 * Advisory: a pinned cut is still proposed. Writes nothing.
 * `pinningWalkTruncated` says the pinning walk hit its cap (#3474), so a
 * test past it was not read and an empty `pinnedBy` is not a clean bill.
 */
function proposeForRoot(root, text, { maxPinningWalkFiles } = {}) {
  const sources = gatherSources(root);
  const shaped = proposeShape(text, { sources });
  const { proposed } = shaped;
  const { tests, truncated: pinningWalkTruncated } = walkPinningTests(root, { maxFiles: maxPinningWalkFiles });
  const cuts = shaped.cuts.map((c) => ({ ...c, pinnedBy: pinnedBy(c, tests) }));
  const existing = {};
  for (const dest of Object.values(RELOCATION_TARGETS)) {
    const abs = path.join(root, dest);
    if (fs.existsSync(abs)) existing[dest] = fs.readFileSync(abs, 'utf8');
  }
  const relocations = planRelocations(cuts, existing);
  const destinations = { ...existing, ...relocations };
  for (const s of sources) if (!(s.path in destinations)) destinations[s.path] = s.content;
  return { proposed, cuts, relocations, audit: auditRemovals({ before: text, after: proposed, cuts, destinations }), pinningWalkTruncated };
}

// ---------------------------------------------------------------------------
// In-place repair — the lossless steps (#3648)
//
// A legacy project is repaired where it stands. These steps lose nothing, so
// they run without a prompt; the table rewrite and the deletions ask first and
// are not here. Every step checks before it acts, so a second run changes
// nothing and a run that stopped part-way resumes at the first step not done.
// Sections are copied out of Charter-Details.md, never cut from it: the file
// itself is retired by the consent-gated deletion, which names where each part
// of it went.
// ---------------------------------------------------------------------------

const CHARTER_DETAILS = 'Inception/Charter-Details.md';
/** Founding sections Charter-Details.md supplies, in charter order after Vision. */
const DETAILS_SECTIONS = ['Problem Statement', 'Target Users'];
const COMPANION_HEADING = 'Companion Repositories';
/** headingSpan option: look a contract section up by the contract's heading rule (#3687). */
const CONTRACT_HEADING = Object.freeze({ contract: true });

function readText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

function eolOf(text) {
  return /\r\n/.test(text) ? '\r\n' : '\n';
}

/**
 * The `{start, end}` line span of the heading `name` at `depth` hashes, up to
 * the next heading of that depth or shallower; null when absent.
 *
 * `opts.contract` matches by the charter contract's own heading rule
 * (charter-template.js `headingMatches` — case-insensitive, `<name> ` prefix
 * tolerated), so a contract section found by detection is found here too
 * (#3687). Without it the heading must equal `name` exactly.
 */
function headingSpan(lines, name, depth, opts = {}) {
  const exact = new RegExp(`^#{${depth}}\\s+${escapeRegExp(name)}\\s*$`);
  const atDepth = new RegExp(`^#{${depth}}\\s+(.+?)\\s*#*\\s*$`);
  const isHeading = opts.contract
    ? (l) => {
      const m = l.match(atDepth);
      return !!m && headingMatches(m[1], name);
    }
    : (l) => exact.test(l);
  const stop = new RegExp(`^#{1,${depth}}\\s`);
  // A `#` line inside a fenced code block is content, never a heading.
  const fenced = fencedLines(lines);
  const start = lines.findIndex((l, i) => !fenced[i] && isHeading(l));
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && (fenced[end] || !stop.test(lines[end]))) end++;
  return { start, end };
}

/** Per line: true when it sits inside (or opens or closes) a fenced code block. */
function fencedLines(lines) {
  const out = new Array(lines.length).fill(false);
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      out[i] = true;
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
    } else if (m) {
      out[i] = true;
      fence = m[1];
    }
  }
  return out;
}

/** A span's body lines with the blank lines at either edge removed. */
function spanBody(lines, span) {
  const body = lines.slice(span.start + 1, span.end);
  while (body.length && !body[0].trim()) body.shift();
  while (body.length && !body[body.length - 1].trim()) body.pop();
  return body;
}

/** Writes `## name` + body at `at`, with one blank line either side. */
function insertSection(lines, at, name, body) {
  const block = [`## ${name}`, '', ...body, ''];
  if (at > 0 && lines[at - 1].trim()) block.unshift('');
  lines.splice(at, 0, ...block);
}

/**
 * Lossless step 1: copy Problem Statement and Target Users from
 * Charter-Details.md into CHARTER.md after Vision, and promote Companion
 * Repositories from `###` to a `##` section of its own at the end of the file.
 * A section CHARTER.md already holds is left alone; one nothing supplies is
 * reported missing, never invented.
 */
function repairCharterSections(root, opts = {}) {
  const id = 'charter-sections';
  const file = path.join(root, 'CHARTER.md');
  const text = readText(file);
  if (text === null) return { id, status: 'blocked', message: 'No CHARTER.md — nothing to repair. Run /charter to create one.' };
  const eol = eolOf(text);
  const lines = text.split(/\r?\n/);
  const details = readText(path.join(root, CHARTER_DETAILS));
  const detailLines = details === null ? null : details.split(/\r?\n/);
  const added = [];
  const missing = [];
  let previous = 'Vision';
  for (const name of DETAILS_SECTIONS) {
    if (headingSpan(lines, name, 2, CONTRACT_HEADING)) {
      previous = name;
      continue;
    }
    const source = detailLines && headingSpan(detailLines, name, 2, CONTRACT_HEADING);
    const body = source ? spanBody(detailLines, source) : [];
    if (!body.length) {
      missing.push(name);
      continue;
    }
    const anchor = headingSpan(lines, previous, 2, CONTRACT_HEADING);
    insertSection(lines, anchor ? anchor.end : Math.min(1, lines.length), name, body);
    added.push(name);
    previous = name;
  }
  let promoted = false;
  const companion = headingSpan(lines, COMPANION_HEADING, 3);
  if (companion) {
    const body = spanBody(lines, companion);
    lines.splice(companion.start, companion.end - companion.start);
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    lines.push('', `## ${COMPANION_HEADING}`, '', ...body, '');
    promoted = true;
  }
  const changed = added.length > 0 || promoted;
  if (changed && !opts.dryRun) fs.writeFileSync(file, lines.join(eol));
  const parts = [];
  if (added.length) parts.push(`copied ${added.join(' and ')} from ${CHARTER_DETAILS}`);
  if (promoted) parts.push(`promoted ${COMPANION_HEADING} to ##`);
  if (missing.length) {
    const why = details === null ? `no ${CHARTER_DETAILS} supplies them` : `${CHARTER_DETAILS} does not hold them`;
    parts.push(`missing: ${missing.join(', ')} — ${why}; fill them with /charter --update`);
  }
  const status = changed ? (opts.dryRun ? 'would' : 'done') : missing.length ? 'missing' : 'already';
  return { id, status, added, missing, promoted, message: parts.length ? parts.join('; ') : 'already repaired' };
}

/** The living documents that leave Inception/ for the phase-neutral Project/. */
const PROJECT_DOCUMENTS = ['Architecture.md', 'Constraints.md', 'Test-Strategy.md'];
const PROJECT_DIR = 'Project';

/** Bounds every git call the repair makes (spawn timeout contract, #2469). */
const GIT_TIMEOUT_MS = 30000;

/** True when `rel` is tracked by a git repository at `root`. */
function gitTracked(root, rel) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', rel], { cwd: root, stdio: 'pipe', timeout: GIT_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

/** A user-chosen destination, kept inside the project root; null when unsafe. */
function safeDestination(root, rel) {
  if (typeof rel !== 'string' || !rel.trim() || path.isAbsolute(rel)) return null;
  const abs = path.resolve(root, rel);
  const back = path.relative(path.resolve(root), abs);
  if (!back || back.startsWith('..') || path.isAbsolute(back)) return null;
  return back.split(path.sep).join('/');
}

/**
 * Lossless step 2: move Architecture.md, Constraints.md and Test-Strategy.md
 * from Inception/ to Project/ — `git mv` for a tracked file so its history
 * follows it, a plain move otherwise. A file already at its destination is a
 * collision: reported, nothing moved over it, until the user names another
 * destination through `opts.destinations` (`{ 'Architecture.md': 'Project/…' }`).
 */
function moveProjectDocuments(root, opts = {}) {
  const id = 'project-documents';
  const chosen = opts.destinations || {};
  const moved = [];
  const collisions = [];
  const rejected = [];
  for (const file of PROJECT_DOCUMENTS) {
    const source = `Inception/${file}`;
    if (!fs.existsSync(path.join(root, source))) continue;
    let target = `${PROJECT_DIR}/${file}`;
    if (chosen[file] !== undefined) {
      const safe = safeDestination(root, chosen[file]);
      if (!safe) {
        rejected.push({ file, destination: chosen[file], reason: 'outside the project root' });
        continue;
      }
      target = safe;
    }
    if (fs.existsSync(path.join(root, target))) {
      collisions.push({ file, source, target });
      continue;
    }
    // Each document records its own method: one tracked and one untracked
    // file in the same run are reported as `git mv` and `move` (#3663).
    const method = gitTracked(root, source) ? 'git mv' : 'move';
    if (!opts.dryRun) {
      fs.mkdirSync(path.dirname(path.join(root, target)), { recursive: true });
      if (method === 'git mv') execFileSync('git', ['mv', '--', source, target], { cwd: root, stdio: 'pipe', timeout: GIT_TIMEOUT_MS });
      else fs.renameSync(path.join(root, source), path.join(root, target));
    }
    moved.push({ file, source, target, method });
  }
  // The step-level method summarizes the moves: one method, or `mixed`.
  const methods = [...new Set(moved.map((m) => m.method))];
  const method = methods.length === 0 ? null : methods.length === 1 ? methods[0] : 'mixed';
  const parts = [];
  if (moved.length) parts.push(`moved ${moved.map((m) => `${m.source} → ${m.target} (${m.method})`).join(', ')}`);
  for (const c of collisions) parts.push(`collision: ${c.target} already exists — ${c.source} not moved; choose another destination`);
  for (const x of rejected) parts.push(`destination ${x.destination} for ${x.file} rejected: ${x.reason}`);
  const status = collisions.length || rejected.length ? 'collision' : moved.length ? (opts.dryRun ? 'would' : 'done') : 'already';
  return { id, status, method, moved, collisions, rejected, message: parts.length ? parts.join('; ') : 'already repaired' };
}

const INVENTORY_HEADING = 'Inventory Notes';
const INVENTORY_INTRO = 'Explanatory notes copied from the `CHARTER.md` tables by the in-place repair, keyed by entity or layer name.';

/**
 * The cells of one markdown table row. An escaped pipe (`\|`) or a pipe inside
 * a code span belongs to its cell, so a note holding one is copied whole.
 */
function tableCells(line) {
  const row = line.trim().replace(/^\|/, '');
  const cells = [];
  let cell = '';
  let inCode = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '\\' && row[i + 1] === '|') {
      cell += '\\|';
      i++;
    } else if (ch === '`') {
      inCode = !inCode;
      cell += ch;
    } else if (ch === '|' && !inCode) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.trim()) cells.push(cell.trim());
  return cells;
}

/** The header and body rows of the first table in a `##` section; null when absent. */
function sectionTable(lines, name) {
  const span = headingSpan(lines, name, 2, CONTRACT_HEADING);
  if (!span) return null;
  const rows = lines.slice(span.start + 1, span.end).filter((l) => l.trim().startsWith('|'));
  if (rows.length < 2) return null;
  return { header: tableCells(rows[0]), rows: rows.slice(2).map(tableCells) };
}

const withoutCode = (cell) => cell.replace(/`[^`]*`/g, ' ');

/** A Location cell carries a note when prose remains beside its paths and its `(excludes …)` syntax. */
function locationNote(cell) {
  const rest = withoutCode(cell).replace(/\(excludes?\s+[^)]*\)/gi, ' ');
  return rest.split(/[\s,]+/).some((t) => /[a-z]/i.test(t) && !/[/*]/.test(t) && !/^[\w-]+\.\w+$/.test(t));
}

/** A Count cell carries a note when it is not a number, `TBD` or empty. */
const countNote = (cell) => !/^(\d+|tbd|)$/i.test(withoutCode(cell).trim());

/** A Tech Stack cell carries a note when it explains: a parenthesis, a dash, a colon or a semicolon. */
const technologyNote = (cell) => /[(;:—–]|\s-\s/.test(withoutCode(cell));

/** Notes found in the charter's Key Entities and Tech Stack cells, keyed by row name. */
function cellNotes(charterLines) {
  const notes = { 'Key Entities': [], 'Tech Stack': [] };
  const entities = sectionTable(charterLines, 'Key Entities');
  if (entities) {
    for (const row of entities.rows) {
      const name = row[0];
      if (!name) continue;
      const carries = entities.header.some((col, i) => i > 0 && row[i] && (/count/i.test(col) ? countNote(row[i]) : locationNote(row[i])));
      if (!carries) continue;
      const text = entities.header.map((col, i) => (i > 0 && row[i] ? `${col}: ${row[i]}` : null)).filter(Boolean).join('; ');
      notes['Key Entities'].push(`- **${name}** — ${text}`);
    }
  }
  const stack = sectionTable(charterLines, 'Tech Stack');
  if (stack) {
    for (const row of stack.rows) {
      const tech = row.slice(1).filter(Boolean).join(' | ');
      if (row[0] && tech && technologyNote(tech)) notes['Tech Stack'].push(`- **${row[0]}** — ${tech}`);
    }
  }
  return notes;
}

/**
 * Lossless step 3: copy every explanatory note found in a Key Entities or Tech
 * Stack cell into `Project/Architecture.md § Inventory Notes`, under its entity
 * or layer name. A copy — the tables are not touched — so nothing is lost if
 * the table rewrite is declined. A note already present is not written twice.
 */
function copyInventoryNotes(root, opts = {}, ctx = {}) {
  const id = 'inventory-notes';
  const charter = readText(path.join(root, 'CHARTER.md'));
  if (charter === null) return { id, status: 'blocked', copied: [], message: 'No CHARTER.md — no table to read.' };
  const notes = cellNotes(charter.split(/\r?\n/));
  const all = [...notes['Key Entities'], ...notes['Tech Stack']];
  if (!all.length) return { id, status: 'already', copied: [], message: 'already repaired — no table cell carries a note' };
  const target = `${PROJECT_DIR}/Architecture.md`;
  const abs = path.join(root, target);
  let text = readText(abs);
  // Under a dry run step 2 has only planned its move: read the document it would move.
  const pending = opts.dryRun && (ctx.moved || []).some((m) => m.file === 'Architecture.md' && m.target === target);
  if (pending) text = readText(path.join(root, 'Inception/Architecture.md'));
  else if (fs.existsSync(path.join(root, 'Inception/Architecture.md'))) {
    return { id, status: 'blocked', copied: [], message: `waits for Inception/Architecture.md to reach ${target} (step project-documents)` };
  }
  if (text === null) text = '# Architecture\n';
  const eol = eolOf(text);
  const lines = text.split(/\r?\n/);
  const copied = [];
  if (!headingSpan(lines, INVENTORY_HEADING, 2)) {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    lines.push('', `## ${INVENTORY_HEADING}`, '', INVENTORY_INTRO, '');
  }
  for (const group of ['Key Entities', 'Tech Stack']) {
    const missing = notes[group].filter((n) => !lines.includes(n));
    if (!missing.length) continue;
    const section = headingSpan(lines, INVENTORY_HEADING, 2);
    const sub = lines.slice(section.start, section.end).findIndex((l) => l.trim() === `### ${group}`);
    if (sub === -1) {
      let at = section.end;
      while (at > section.start + 1 && !lines[at - 1].trim()) at--;
      lines.splice(at, 0, '', `### ${group}`, '', ...missing);
    } else {
      let at = section.start + sub + 1;
      while (at < section.end && !/^#{1,3}\s/.test(lines[at])) at++;
      while (at > section.start + sub + 1 && !lines[at - 1].trim()) at--;
      lines.splice(at, 0, ...missing);
    }
    copied.push(...missing);
  }
  if (!copied.length) return { id, status: 'already', copied, message: 'already repaired' };
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  lines.push('');
  if (opts.dryRun) return { id, status: 'would', copied, message: `would copy ${copied.length} table note(s) to ${target} § ${INVENTORY_HEADING}` };
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, lines.join(eol));
  return { id, status: 'done', copied, message: `copied ${copied.length} table note(s) to ${target} § ${INVENTORY_HEADING}` };
}

const DECISIONS_DIR = 'Construction/Design-Decisions';
const KEY_DECISIONS = 'Key Decisions';
/** Marks the design decision this step wrote, so a re-run finds it whatever its date. */
const KEY_DECISIONS_MARKER = '<!-- charter-repair: key-decisions -->';
/** The `--destination` key that names where Key Decisions go on a collision. */
const KEY_DECISIONS_KEY = 'Key-Decisions';

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Directories never searched for the Key Decisions marker: tooling and dependencies, not project documents. */
const MARKER_SKIP_DIRS = new Set(['node_modules']);

/** The first line of the design decision this step writes. */
const KEY_DECISIONS_TITLE = '# Key Decisions from the founding charter';

/**
 * Whether `text` is the copy this step wrote, not a document that quotes its
 * marker (#3674): the marker and the step's title each on a line of their own
 * outside a code fence, and — while Charter-Details.md still holds the
 * section — every non-blank line of that section present in the copy.
 */
function isKeyDecisionsCopy(text, body) {
  if (text === null) return false;
  const lines = text.split(/\r?\n/);
  const fenced = fencedLines(lines);
  const own = new Set(lines.filter((l, i) => !fenced[i]).map((l) => l.trim()));
  if (!own.has(KEY_DECISIONS_MARKER) || !own.has(KEY_DECISIONS_TITLE)) return false;
  const all = new Set(lines.map((l) => l.trim()));
  return body.every((l) => !l.trim() || all.has(l.trim()));
}

/**
 * The project-relative path of the Key Decisions copy this step wrote, or
 * null. Looked for in Construction/Design-Decisions/ first, then at a chosen
 * destination, then across the project's other Markdown files — a destination
 * chosen on an earlier run is found without being named again. A file that
 * only quotes the marker is not the copy (#3674): `body` is the section still
 * in Charter-Details.md, and the copy must hold it.
 */
function findKeyDecisionsCopy(root, chosen, body = []) {
  const holds = (rel) => isKeyDecisionsCopy(readText(path.join(root, rel)), body);
  const dir = path.join(root, DECISIONS_DIR);
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.md') && holds(`${DECISIONS_DIR}/${name}`)) return `${DECISIONS_DIR}/${name}`;
    }
  }
  if (chosen && chosen.endsWith('.md') && holds(chosen)) return chosen;
  const walk = (rel) => {
    let entries;
    try {
      entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      return null;
    }
    for (const e of entries) {
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (e.name.startsWith('.') || MARKER_SKIP_DIRS.has(e.name) || child === DECISIONS_DIR) continue;
        const found = walk(child);
        if (found) return found;
      } else if (e.isFile() && e.name.endsWith('.md') && child !== CHARTER_DETAILS && holds(child)) {
        return child;
      }
    }
    return null;
  };
  return walk('');
}

/**
 * Lossless step 4: copy the Charter-Details.md Key Decisions section into a
 * design decision of its own — under Construction/Design-Decisions/, or at the
 * destination the user chose. A decision this step already wrote — found by
 * its marker, wherever it was written — means the step is done.
 */
function moveKeyDecisions(root, opts = {}) {
  const id = 'key-decisions';
  const chosen = (opts.destinations || {})[KEY_DECISIONS_KEY];
  const safeChosen = chosen === undefined ? null : safeDestination(root, chosen);
  const details = readText(path.join(root, CHARTER_DETAILS));
  const lines = details === null ? null : details.split(/\r?\n/);
  const span = lines && headingSpan(lines, KEY_DECISIONS, 2);
  const body = span ? spanBody(lines, span) : [];
  const found = findKeyDecisionsCopy(root, safeChosen, body);
  if (found) return { id, status: 'already', target: found, message: 'already repaired' };
  if (!body.length) return { id, status: 'already', target: null, message: `already repaired — no ${KEY_DECISIONS} section to move` };
  const date = opts.today === undefined ? todayIso() : opts.today;
  // The date becomes part of a file name: only a calendar date is accepted.
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { id, status: 'blocked', target: null, message: `--today must be a YYYY-MM-DD date; got ${JSON.stringify(date)} — ${KEY_DECISIONS} not moved` };
  }
  let target = `${DECISIONS_DIR}/${date}-charter-key-decisions.md`;
  if (chosen !== undefined) {
    if (!safeChosen) return { id, status: 'collision', target: null, message: `destination ${chosen} for ${KEY_DECISIONS} rejected: outside the project root` };
    target = safeChosen;
  }
  if (fs.existsSync(path.join(root, target))) {
    return { id, status: 'collision', target, message: `collision: ${target} already exists — ${KEY_DECISIONS} not moved; choose another destination and re-run with --destination ${KEY_DECISIONS_KEY}=<path>` };
  }
  const text = [
    KEY_DECISIONS_TITLE,
    '',
    `**Date:** ${date}`,
    `**Source:** \`${CHARTER_DETAILS}\` § ${KEY_DECISIONS}, moved here by the in-place charter repair (\`/charter --refresh\`).`,
    '',
    ...body,
    '',
    KEY_DECISIONS_MARKER,
    '',
  ].join(eolOf(details));
  if (opts.dryRun) return { id, status: 'would', target, message: `would move ${KEY_DECISIONS} to ${target}` };
  const abs = path.join(root, target);
  // A chosen destination may sit in a directory of its own that does not exist yet.
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text);
  return { id, status: 'done', target, message: `moved ${KEY_DECISIONS} to ${target}` };
}

/** The lossless steps, in the order they run. */
const LOSSLESS_STEPS = ['charter-sections', 'project-documents', 'inventory-notes', 'key-decisions'];
const STEP_RUNNERS = {
  'charter-sections': repairCharterSections,
  'project-documents': moveProjectDocuments,
  'inventory-notes': copyInventoryNotes,
  'key-decisions': moveKeyDecisions,
};

/**
 * Runs every lossless step in order and reports each. Writes only what a step
 * finds undone; asks nothing, rewrites no table and deletes nothing.
 * @param {string} root project root
 * `opts.dryRun` reports each step as `would` and writes nothing.
 * @param {{today?: string, destinations?: Object<string, string>, dryRun?: boolean}} [opts]
 */
function runLosslessRepair(root, opts = {}) {
  // Step 3 reads step 2's moves, so a dry run can follow a move it only planned.
  // A step that throws (a failed git mv, a timeout, an fs error) is recorded as
  // status 'error' with its message, and the steps after it are not run — each
  // reads what the earlier ones wrote. The steps already done stay reported.
  const steps = [];
  const ctx = {};
  let failed = null;
  for (const id of LOSSLESS_STEPS) {
    if (failed) {
      steps.push({ id, status: 'not-run', message: `not run: ${failed} failed` });
      continue;
    }
    let step;
    try {
      step = STEP_RUNNERS[id](root, opts, ctx);
    } catch (err) {
      failed = id;
      step = { id, status: 'error', message: `error: ${err && err.message ? err.message : String(err)}` };
    }
    if (id === 'project-documents' && !failed) ctx.moved = step.moved;
    steps.push(step);
  }
  const alreadyRepaired = steps.every((s) => s.status === 'already');
  const summary = alreadyRepaired ? 'already repaired' : steps.map((s) => `${s.id}: ${s.message}`).join('\n');
  return { ok: !failed, alreadyRepaired, steps, summary };
}

// ---------------------------------------------------------------------------
// In-place repair — the consent-gated half (#3654)
//
// Two kinds of change are shown first and run only on consent: the table
// rewrite (shown BEFORE / AFTER) and each deletion (shown with its length and
// where its content went). Nothing here runs from runLosslessRepair.
// ---------------------------------------------------------------------------

/** The `{start, end}` line span of the first table inside a `##` section. */
function tableSpan(lines, name) {
  const span = headingSpan(lines, name, 2, CONTRACT_HEADING);
  if (!span) return null;
  let start = span.start + 1;
  while (start < span.end && !lines[start].trim().startsWith('|')) start++;
  if (start >= span.end) return null;
  let end = start;
  while (end < span.end && lines[end].trim().startsWith('|')) end++;
  return end - start >= 2 ? { start, end } : null;
}

const rowOf = (cells) => `| ${cells.join(' | ')} |`;

/** A separator row keeping only the columns at `keep`, each segment as written. */
function separatorOf(line, keep) {
  const segs = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
  return `|${keep.map((i) => segs[i] !== undefined ? segs[i] : '---').join('|')}|`;
}

/** A Location cell reduced to its paths and any `(excludes …)` annotation. */
function locationOnly(cell) {
  const exclusion = (withoutCode(cell).match(/\(excludes?\s+[^)]*\)/i) || [])[0];
  // The paths counted lead the cell; prose follows a parenthesis, a dash or a
  // sentence break, and a code span inside that prose is not a counted path.
  const spans = [];
  let lead = cell.replace(/`[^`]*`/g, (m) => `\u0000${spans.push(m) - 1}\u0000`);
  let prev;
  do {
    prev = lead;
    lead = lead.replace(/\s*\([^()]*\)/g, '');
  } while (lead !== prev);
  lead = lead.split(/\s+[—–]\s|\s+-\s|[.;:]\s/)[0];
  let paths = (lead.match(/\u0000\d+\u0000/g) || []).map((t) => spans[Number(t.slice(1, -1))]);
  if (!paths.length) paths = lead.split(/[\s,]+/).filter((t) => /[/*]/.test(t) || /^[\w-]+\.\w+$/.test(t));
  // Prose first: the paths are the code spans it names, wherever they sit.
  if (!paths.length) paths = spans.filter((s) => /[/*]|\.\w+`$/.test(s));
  if (!paths.length) return cell;
  return [paths.join(', '), exclusion].filter(Boolean).join(' ');
}

/**
 * A Tech Stack cell reduced to technology names: parentheses, a trailing
 * dash clause and version tokens go; code spans and names (`Node.js`, `i18n`,
 * `S3`) stay. Where a name ends and a version begins is a judgment, which is
 * why this is proposed BEFORE / AFTER and never applied silently.
 */
function technologyOnly(cell) {
  const spans = [];
  let s = cell.replace(/`[^`]*`/g, (m) => `\u0000${spans.push(m) - 1}\u0000`);
  let prev;
  do {
    prev = s;
    s = s.replace(/\s*\([^()]*\)/g, '');
  } while (s !== prev);
  s = s.replace(/\s+[—–]\s.*$/, '').replace(/\s+-\s.*$/, '').replace(/\s*[:;]\s.*$/, '');
  // One character class, no nested quantifier (security/detect-unsafe-regex):
  // a version token is a digit followed by digits, dots and x — 41, 24.x, 3.12.
  s = s.replace(/(^|\s)v?\d[\d.x]*(?=\s|$|[,+/])/gi, '$1');
  s = s.replace(/\s+([,])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => spans[Number(i)]);
}

/** The rewritten table lines for one section; null when there is nothing to rewrite. */
function rewriteTable(lines, name) {
  const span = tableSpan(lines, name);
  if (!span) return null;
  const header = tableCells(lines[span.start]);
  const sep = lines[span.start + 1];
  const body = lines.slice(span.start + 2, span.end).map(tableCells);
  let after;
  if (name === 'Key Entities') {
    const loc = header.findIndex((h) => /location/i.test(h));
    if (loc === -1) return null;
    const keep = [0, loc];
    after = [rowOf(keep.map((i) => header[i])), separatorOf(sep, keep),
      ...body.map((r) => rowOf([r[0] || '', locationOnly(r[loc] || '')]))];
  } else {
    after = [lines[span.start], sep, ...body.map((r) => rowOf([r[0] || '', ...r.slice(1).map(technologyOnly)]))];
  }
  return { span, before: lines.slice(span.start, span.end).join('\n'), after: after.join('\n'), afterLines: after };
}

const REWRITE_TABLES = ['Key Entities', 'Tech Stack'];

/** BEFORE / AFTER for each charter table. Writes nothing. */
function planTableRewrite(charterText) {
  const lines = String(charterText || '').split(/\r?\n/);
  const tables = [];
  for (const name of REWRITE_TABLES) {
    const r = rewriteTable(lines, name);
    if (r) tables.push({ name, before: r.before, after: r.after, changed: r.before !== r.after });
  }
  return { tables, changed: tables.some((t) => t.changed) };
}

/**
 * Applies the table rewrite — only with `consent`. The notes the rewrite drops
 * are copied to Inventory Notes first; when they cannot be copied the rewrite
 * is refused, so a declined-then-accepted rewrite never loses or repeats one.
 */
function applyTableRewrite(root, { consent } = {}) {
  const file = path.join(root, 'CHARTER.md');
  const text = readText(file);
  if (text === null) return { status: 'blocked', message: 'No CHARTER.md — nothing to rewrite.' };
  const plan = planTableRewrite(text);
  if (!plan.changed) return { status: 'already', tables: plan.tables, message: 'already repaired — the tables hold names and paths only' };
  if (!consent) return { status: 'declined', tables: plan.tables, message: 'table rewrite declined — both tables left as they are' };
  const notes = copyInventoryNotes(root);
  if (notes.status === 'blocked') return { status: 'blocked', tables: plan.tables, message: `table rewrite refused: its notes cannot be copied yet — ${notes.message}` };
  const lines = text.split(/\r?\n/);
  for (const name of REWRITE_TABLES) {
    const r = rewriteTable(lines, name);
    if (r && r.before !== r.after) lines.splice(r.span.start, r.span.end - r.span.start, ...r.afterLines);
  }
  fs.writeFileSync(file, lines.join(eolOf(text)));
  return { status: 'done', tables: plan.tables, message: 'rewrote Key Entities to Entity | Location and Tech Stack to technology names' };
}

/** The charter's legacy sections and where their content went. */
const LEGACY_SECTIONS = ['Current Focus', 'Architecture'];

/** The disposition table for Inception/ files; any file it does not name has no destination. */
const INCEPTION_DISPOSITION = {
  'Milestones.md': { destination: 'derived', detail: 'milestones are the board' },
  'Tech-Stack.md': { destination: 'derived', detail: 'the charter Tech Stack table names the stack; manifests hold the versions' },
  'Scope-Boundaries.md': { destination: 'derived', detail: "its dated log is git history; the charter's In Scope and Out of Scope state the scope" },
};

/** Where each `##` part of Charter-Details.md went, and whether it is there now. */
function detailsParts(root, text) {
  const lines = text.split(/\r?\n/);
  const charter = (readText(path.join(root, 'CHARTER.md')) || '').split(/\r?\n/);
  const decided = moveKeyDecisions(root, { dryRun: true });
  const fenced = fencedLines(lines);
  const parts = [];
  lines.forEach((l, i) => {
    const m = !fenced[i] && l.match(/^##\s+(.+?)\s*$/);
    if (!m) return;
    const part = m[1];
    // The contract heading rule, as the repair's source lookup reads it (#3687).
    const section = DETAILS_SECTIONS.find((n) => headingMatches(part, n));
    if (section) {
      parts.push({ part, destination: 'moved', to: `CHARTER.md § ${section}`, present: !!headingSpan(charter, section, 2, CONTRACT_HEADING) });
    } else if (part === KEY_DECISIONS) {
      parts.push({ part, destination: 'moved', to: decided.target || DECISIONS_DIR, present: decided.status === 'already' && !!decided.target });
    } else if (/^Vision\b/.test(part)) {
      parts.push({ part, destination: 'derived', to: 'a duplicate of CHARTER.md § Vision', present: true });
    } else {
      parts.push({ part, destination: 'nowhere', to: null, present: true });
    }
  });
  return parts;
}

function listFiles(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const child = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFiles(dir, child));
    else out.push(child);
  }
  return out.sort();
}

/**
 * Every deletion the repair would offer: each legacy charter section and each
 * remaining Inception/ file, with its length and where its content went
 * (`derived`, `moved` or `nowhere`). Writes nothing. A living document step 2
 * has still to move is not offered — it is moved, never deleted.
 */
function planDeletions(root) {
  const items = [];
  const charterText = readText(path.join(root, 'CHARTER.md'));
  if (charterText !== null) {
    const lines = charterText.split(/\r?\n/);
    const archDoc = readText(path.join(root, PROJECT_DIR, 'Architecture.md')) || readText(path.join(root, 'Inception', 'Architecture.md')) || '';
    for (const name of LEGACY_SECTIONS) {
      const span = headingSpan(lines, name, 2, CONTRACT_HEADING);
      if (!span) continue;
      const text = lines.slice(span.start, span.end).join('\n');
      let destination = 'derived';
      let detail = "the board's open epics and PRD trackers show the current themes";
      if (name === 'Architecture') {
        const held = /^#{2,3}\s+Deployment Architecture\b/m.test(archDoc);
        destination = held ? 'moved' : 'nowhere';
        detail = held ? 'Project/Architecture.md § Deployment Architecture holds the fuller version' : 'no Project/Architecture.md § Deployment Architecture holds it';
      }
      items.push({ id: `section:${name}`, kind: 'section', path: `CHARTER.md § ${name}`, lines: span.end - span.start, bytes: Buffer.byteLength(text), destination, detail, verified: true });
    }
  }
  const inc = path.join(root, 'Inception');
  const pending = [];
  if (fs.existsSync(inc)) {
    for (const rel of listFiles(inc)) {
      const p = `Inception/${rel}`;
      if (PROJECT_DOCUMENTS.includes(rel)) {
        pending.push(p);
        continue;
      }
      const raw = fs.readFileSync(path.join(inc, rel));
      const bytes = raw.length;
      // A file's length is reported in lines and bytes, like a section's; a binary file counts as one line.
      const lines = Math.max(1, raw.toString('latin1').split(/\r?\n/).filter((l, i, a) => i < a.length - 1 || l).length);
      if (rel === 'Charter-Details.md') {
        const parts = detailsParts(root, readText(path.join(inc, rel)));
        const nowhere = parts.filter((x) => x.destination === 'nowhere');
        const detail = parts.map((x) => `${x.part} → ${x.to || 'nowhere'}`).join('; ');
        items.push({
          id: `file:${p}`, kind: 'file', path: p, lines, bytes, parts, detail,
          destination: nowhere.length ? 'nowhere' : 'moved',
          verified: parts.every((x) => x.present),
        });
        continue;
      }
      const d = INCEPTION_DISPOSITION[rel] || { destination: 'nowhere', detail: 'not in the disposition table — no destination' };
      items.push({ id: `file:${p}`, kind: 'file', path: p, lines, bytes, destination: d.destination, detail: d.detail, verified: true });
    }
  }
  return { items, pending };
}

/**
 * Deletes exactly the consented items of the current plan. An id the plan does
 * not hold is refused, as is a `moved` item whose content has not reached its
 * destination. Inception/ is removed only when it is empty.
 * @param {{consent?: string[]}} [opts]
 */
function applyDeletions(root, { consent } = {}) {
  const plan = planDeletions(root);
  const byId = new Map(plan.items.map((i) => [i.id, i]));
  const wanted = Array.isArray(consent) ? consent : [];
  const hadInception = fs.existsSync(path.join(root, 'Inception'));
  const deleted = [];
  const refused = [];
  const sections = [];
  for (const id of wanted) {
    const item = byId.get(id);
    if (!item) {
      refused.push({ id, reason: 'not in the deletion plan' });
      continue;
    }
    if (!item.verified) {
      refused.push({ id, reason: `content not yet at its destination (${item.detail}) — run the lossless steps first` });
      continue;
    }
    if (item.kind === 'section') {
      sections.push(item);
      continue;
    }
    const rel = item.path;
    if (gitTracked(root, rel)) execFileSync('git', ['rm', '-q', '--', rel], { cwd: root, stdio: 'pipe', timeout: GIT_TIMEOUT_MS });
    else fs.unlinkSync(path.join(root, rel));
    deleted.push(id);
  }
  if (sections.length) {
    const file = path.join(root, 'CHARTER.md');
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    for (const item of sections) {
      const span = headingSpan(lines, item.id.slice('section:'.length), 2, CONTRACT_HEADING);
      if (!span) continue;
      lines.splice(span.start, span.end - span.start);
      deleted.push(item.id);
    }
    fs.writeFileSync(file, lines.join(eolOf(text)));
  }
  const inc = path.join(root, 'Inception');
  // `git rm` of the last tracked file removes the empty directory itself.
  if (fs.existsSync(inc) && listFiles(inc).length === 0) fs.rmSync(inc, { recursive: true });
  const inceptionRemoved = hadInception && !fs.existsSync(inc);
  const kept = plan.items.map((i) => i.id).filter((id) => !deleted.includes(id) && !refused.some((r) => r.id === id));
  return { deleted, kept, refused, inceptionRemoved };
}

/**
 * The whole repair as a dry run — `/charter --refresh --dry-run`: every
 * lossless step it would take, the table rewrite and every deletion. Writes
 * nothing.
 */
function planRepair(root, opts = {}) {
  const lossless = runLosslessRepair(root, { ...opts, dryRun: true });
  // A dry-run step that failed makes the plan a failure: the CLI exits 1 on it.
  return {
    ok: lossless.ok,
    writes: false,
    lossless,
    rewrite: planTableRewrite(readText(path.join(root, 'CHARTER.md')) || ''),
    deletions: planDeletions(root),
  };
}

/**
 * Where a reader finds a living project document (#3650): `Project/<file>`.
 * A project that still holds only the legacy `Inception/<file>` is reported
 * as the legacy shape, naming `/charter --refresh` — the old path is never
 * returned, so a reader neither fails nor silently reads a stale copy. This is
 * the one place outside the repair that names the legacy directory.
 * @param {string} root project root
 * @param {string} file one of PROJECT_DOCUMENTS, bare or as its `Project/` path
 *   (`Project/Architecture.md`) — the path is what a spec reader types (#3661)
 * @returns {{path: string|null, legacy: boolean, message: string|null}}
 */
function locateProjectDocument(root, file) {
  const prefix = `${PROJECT_DIR}/`;
  if (typeof file === 'string') {
    const slashed = file.replace(/\\/g, '/').replace(/^\.\//, '');
    if (slashed.startsWith(prefix) && PROJECT_DOCUMENTS.includes(slashed.slice(prefix.length))) file = slashed.slice(prefix.length);
  }
  if (!PROJECT_DOCUMENTS.includes(file)) {
    throw new Error(`locateProjectDocument: expected one of ${PROJECT_DOCUMENTS.join(', ')}; got ${JSON.stringify(file)}`);
  }
  const current = `${PROJECT_DIR}/${file}`;
  if (fs.existsSync(path.join(root, current))) return { path: current, legacy: false, message: null };
  if (fs.existsSync(path.join(root, 'Inception', file))) {
    return {
      path: null,
      legacy: true,
      message: `${current} not found; this project still has the legacy Inception/${file} — run /charter --refresh to move it to ${PROJECT_DIR}/`,
    };
  }
  return { path: null, legacy: false, message: null };
}

function parseArgs(argv) {
  const opts = { root: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') opts.root = argv[++i];
    else if (argv[i] === '--latest-tag') opts.latestTag = argv[++i];
    else if (argv[i] === '--no-tag') opts.latestTag = null;
    else if (argv[i] === '--propose') opts.propose = true;
    else if (argv[i] === '--repair') opts.repair = true;
    else if (argv[i] === '--plan') opts.plan = true;
    else if (argv[i] === '--locate') opts.locate = argv[++i];
    else if (argv[i] === '--rewrite-tables') opts.rewriteTables = true;
    else if (argv[i] === '--delete') opts.del = String(argv[++i] || '').split(',').map((x) => x.trim()).filter(Boolean);
    else if (argv[i] === '--today') opts.today = argv[++i];
    else if (argv[i] === '--destination') {
      // --destination Architecture.md=Project/Architecture-Inception.md
      const [file, ...rest] = String(argv[++i] || '').split('=');
      opts.destinations = { ...(opts.destinations || {}), [file]: rest.join('=') };
    }
  }
  return opts;
}

// ── legacy-shape detection (#3647) ───────────────────────────────────────────

/** The row's words for each stored-value kind; the rule itself is the contract's. */
const STORED_VALUE_LABELS = {
  'count-column': (v) => `Count column in ${v.section}`,
  'number-cell': (v) => `number in ${v.section} (${v.text})`,
  version: (v) => `version in ${v.section} (${v.text})`,
  // The count and its noun, not the whole aside: "(5 workflows: …)" → "(5 workflows)".
  'parenthesized-quantity': (v) => `quantity in ${v.section} (${(v.text.match(/\d[\d,]*\+?\s+[A-Za-z][\w-]*/) || [v.text])[0]})`,
  'counted-noun': (v) => `count in ${v.section} (${v.text})`,
};

/** Plural nouns for a grouped phrase, by stored-value kind. */
const GROUP_NOUNS = {
  'number-cell': 'numbers',
  version: 'versions',
  'parenthesized-quantity': 'quantities',
  'counted-noun': 'counts',
};
const GROUP_EXAMPLES = 3;

/**
 * Row phrases for legacy items: several stored values of one kind in one
 * section become one phrase with their number and the first examples, so a
 * heavily legacy charter still reads as one row. Everything else keeps its
 * own label. Order of first appearance is kept.
 * @param {Array<{kind: string, section?: string, text?: string, label: string}>} items
 * @returns {string[]}
 */
function summarizeLegacyItems(items) {
  const groups = new Map();
  for (const i of items || []) {
    const key = GROUP_NOUNS[i.kind] && i.section ? `${i.kind}\u0000${i.section}` : `\u0001${groups.size}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  }
  return [...groups.values()].map((g) => {
    if (g.length === 1) return g[0].label;
    const examples = g.slice(0, GROUP_EXAMPLES).map((i) => (i.kind === 'parenthesized-quantity' ? i.label.replace(/^.*\((.*)\)$/, '$1') : i.text));
    return `${g.length} ${GROUP_NOUNS[g[0].kind]} in ${g[0].section} (${examples.join(', ')}${g.length > GROUP_EXAMPLES ? ', …' : ''})`;
  });
}

/**
 * What still makes a project legacy-shaped, for the startup Charter Health
 * row: a retired section, a required section missing (Problem Statement and
 * Target Users until both exist), a stored count or version, and an
 * `Inception/` directory. The first three are the contract's shape rule
 * (charter-template.js checkContractShape, the `storedValues` rule the
 * structural tests read); the last is one directory check. Local reads only —
 * no child process, no network — so it fits the startup hook's ladder.
 * @param {string} charterText
 * @param {string} root - project root
 * @returns {{legacy: boolean, items: Array<{kind: string, item?: string, section?: string, text?: string, label: string}>}}
 */
function detectLegacyShape(charterText, root) {
  const shape = checkContractShape(charterText);
  const items = [
    ...shape.retiredSections.map((s) => ({ kind: 'retired-section', item: s, label: `${s} section` })),
    ...shape.missingSections.map((s) => ({ kind: 'missing-section', item: s, label: `no ${s} section` })),
    ...shape.storedValues.map((v) => ({ ...v, label: STORED_VALUE_LABELS[v.kind](v) })),
  ];
  let inception = false;
  try {
    inception = fs.statSync(path.join(root, 'Inception')).isDirectory();
  } catch (_e) {
    inception = false;
  }
  if (inception) items.push({ kind: 'inception-directory', label: 'Inception/ directory' });
  return { legacy: items.length > 0, items };
}

module.exports = {
  detectLegacyShape,
  summarizeLegacyItems,
  analyzeCharterShape,
  proposeShape,
  findExistingHome,
  planRelocations,
  auditRemovals,
  latestGitTag,
  gatherSources,
  proposeForRoot,
  runLosslessRepair,
  LOSSLESS_STEPS,
  planTableRewrite,
  applyTableRewrite,
  planDeletions,
  applyDeletions,
  planRepair,
  locateProjectDocument,
  findPinningTests,
  stringLiterals,
  leadingCommentBlock,
  PIN_SUBJECT,
  MIN_PINNED_LITERAL,
  MAX_PINNING_WALK_FILES,
  HOME_SOURCES,
  wordCount,
  exclusionPhrase,
  SHAPE_THRESHOLDS,
  TARGET_SHAPE,
  EXCLUSION_PHRASES,
  RELOCATION_TARGETS,
};

/**
 * The CLI dispatch. Every path ends in one JSON envelope on stdout: a thrown
 * error (a failed git mv or git rm, a timeout, an fs error) is caught by the
 * caller and printed as `{ok: false, error}` with exit 1 (#3663, #3623).
 */
function runCli(argv) {
  const opts = parseArgs(argv);
  const emit = (o) => {
    process.stdout.write(JSON.stringify(o, null, 2) + '\n');
    // A repair that stopped on a failing step still prints its step report.
    process.exit(o && o.ok === false ? 1 : 0);
  };
  // --plan writes nothing. --rewrite-tables and --delete are the consented
  // actions: the spec runs them only after the user has agreed to each.
  if (opts.locate !== undefined) {
    // An unknown name is a JSON envelope naming the accepted names, never an
    // uncaught stack trace (#3661).
    let located;
    try {
      located = locateProjectDocument(opts.root, opts.locate);
    } catch (err) {
      process.stdout.write(JSON.stringify({ ok: false, error: err.message, accepted: PROJECT_DOCUMENTS }, null, 2) + '\n');
      process.exit(1);
    }
    emit(located);
  }
  if (opts.plan) emit(planRepair(opts.root, opts));
  if (opts.repair) emit(runLosslessRepair(opts.root, opts));
  if (opts.rewriteTables) emit(applyTableRewrite(opts.root, { consent: true }));
  if (opts.del) emit(applyDeletions(opts.root, { consent: opts.del }));
  const file = path.join(opts.root, 'CHARTER.md');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const latestTag = opts.latestTag === undefined ? latestGitTag(opts.root) : opts.latestTag;
  const report = analyzeCharterShape(text, { latestTag });
  // --propose adds the proposal; still writes nothing — the spec applies it
  // only after the user confirms the diff.
  if (opts.propose && text !== null && !report.inShape) report.proposal = proposeForRoot(opts.root, text);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

if (require.main === module) {
  try {
    runCli(process.argv.slice(2));
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, error: err && err.message ? err.message : String(err) }, null, 2) + '\n');
    process.exit(1);
  }
}
