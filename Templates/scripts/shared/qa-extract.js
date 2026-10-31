#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.116.0
 * @description Auto-create QA sub-issues for unverifiable ACs in a /work issue. Reads
 * qa-config.json for keyword triggers, fetches the parent issue body via gh pmu, matches
 * unchecked AC lines against keywords (case-insensitive), and creates a labeled sub-issue
 * per match via gh pmu sub create. Returns a JSON envelope listing matches and sub-issue
 * numbers. Spec replacement for /work Step 4a (#2318).
 *
 * Usage: node qa-extract.js --issue <N> [--dry-run] [--fill <path>]
 *        node qa-extract.js --check-routes <path>   (#3362: /qa's Outcome 3 gate —
 *          a JSON map of automationRoutes id → reason; prints validateRouteAnswers'
 *          result, exits 0 valid, 1 invalid, 2 unreadable)
 *
 * Output (JSON envelope on stdout):
 *   { ok, issueNumber, matched: [{ acText, keyword, subIssueNumber, annotation, fillPath, fillSources, placement }],
 *     skipped: [acText], alreadyGated: [{ acText, marker }], errors: [], warnings: [] }
 *   `skipped` = no keyword matched; `alreadyGated` = the AC already carries a marker from
 *   .claude/metadata/ac-gate-markers.json and is never extracted again (#3161).
 *
 * Fill field types (#2976). `steps`: a non-empty string, or a non-empty array of
 * non-empty strings rendered as a numbered list. `expectedResult`, `fixtures`: a
 * non-empty string. Any other supplied value is not applied — it falls back to
 * derivation (fixtures: no section) and is named with its AC in `warnings`.
 * `fillPath` is `caller` only when steps and expectedResult both came from the fill,
 * `partial-caller` when one did; `fillSources` gives each field's source.
 *
 * Body population (#2549). The QA sub-issue is the closure gate for an unverifiable AC
 * (Option A, #2472), so a body with empty Steps to Perform / Expected Result gives the
 * tester nothing to act on and makes an un-performed QA indistinguishable from a
 * performed one. Values are resolved in three tiers, first hit wins:
 *
 *   1. `caller`     — --fill <path>, a JSON map of acText -> { steps, expectedResult }.
 *                     Composed upstream by /work Step 4a, which has the parent issue in
 *                     context. Highest quality. A tier-1 value that is missing, blank, or
 *                     whitespace-only falls through per field rather than per AC.
 *   2. `derived`    — deterministic rewrite of the AC itself: the action clause becomes
 *                     step 1, the assertion clause becomes the expected result. When no
 *                     assertion is separable, the expected result names the AC's subject
 *                     and the observation its verb demands.
 *   3. `degenerate` — an AC too short or unstructured to yield an action clause: the full
 *                     AC text becomes step 1 and the expected result quotes it.
 *
 * QA_PLACEHOLDER is reached only when all three produce nothing, which happens only when
 * the AC text is empty or is a bare label. It is a last resort, not the default output.
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { execSync, execFileSync } = require('child_process');
const { extractAcceptanceCriteria } = require('./lib/checkbox-scan.js');

const CONFIG_PATH = path.join(__dirname, 'lib', 'qa-config.json');
const GATE_MARKERS_PATH = path.join(__dirname, '..', '..', 'metadata', 'ac-gate-markers.json');

function parseArgs(argv) {
  const out = { issue: null, dryRun: false, fill: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--issue' && argv[i + 1]) out.issue = parseInt(argv[++i], 10);
    else if (argv[i] === '--dry-run') out.dryRun = true;
    else if (argv[i] === '--fill' && argv[i + 1]) out.fill = argv[++i];
    else if (argv[i] === '--check-routes' && argv[i + 1]) out.checkRoutes = argv[++i];
  }
  if (out.checkRoutes) return { checkRoutes: out.checkRoutes };
  if (!out.issue || Number.isNaN(out.issue)) {
    return { error: 'Missing or invalid --issue <number> argument.' };
  }
  return out;
}

/** Lower-cased, trimmed, trailing punctuation dropped, curly apostrophes straightened. */
function normalizeReason(text) {
  return String(text).toLowerCase().replace(/[‘’]/g, "'").trim().replace(/[.!?;:,\s]+$/, '').replace(/\s+/g, ' ');
}

/**
 * May this route-answer set hand a check to a person (#3362)? Every route in
 * `config.automationRoutes` needs a specific reason it cannot reach the check:
 * a route that is missing, blank, or answered with a `genericReasons` entry
 * is a problem, and any problem makes the set invalid. /qa runs this before
 * Outcome 3 (invalid → Outcome 2); extract() runs it before filing.
 *
 * @param {Object<string, string>|null} answers route id → reason
 * @param {{automationRoutes: Array<{id: string, name: string}>, genericReasons?: string[]}} config
 * @returns {{valid: boolean, problems: Array<{route: string, problem: 'missing'|'empty'|'generic', reason?: string}>,
 *   routes: Array<{id: string, name: string, reason: string|null}>}}
 */
function validateRouteAnswers(answers, config) {
  const given = answers && typeof answers === 'object' ? answers : {};
  const generic = new Set((config.genericReasons || []).map(normalizeReason));
  const problems = [];
  const routes = (config.automationRoutes || []).map(({ id, name }) => {
    const reason = typeof given[id] === 'string' ? given[id] : null;
    if (reason === null) problems.push({ route: id, problem: 'missing' });
    else if (reason.trim() === '') problems.push({ route: id, problem: 'empty' });
    else if (generic.has(normalizeReason(reason))) problems.push({ route: id, problem: 'generic', reason });
    return { id, name, reason };
  });
  return { valid: problems.length === 0, problems, routes };
}

function loadConfig(configPath = CONFIG_PATH) {
  const raw = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(raw);
  if (!Array.isArray(config.keywords) || config.keywords.length === 0) {
    throw new Error('qa-config.json has no keywords');
  }
  return config;
}

/**
 * Extract unchecked acceptance-criteria lines from an issue body.
 * @param {string} body - Raw issue body markdown
 * @returns {string[]} AC text (stripped of leading checkbox)
 */
function extractUncheckedAcs(body) {
  if (!body) return [];
  // #2600: reads through the shared fence-aware scanner. This path WRITES TO
  // GITHUB — a fenced `- [ ]` here did not inflate a number, it filed a real QA
  // sub-issue for a line that was never a criterion, leaving a durable artifact
  // someone has to find and close.
  // #3048: and only the Acceptance Criteria section is read. A keyword-matching
  // box under Definition of Done or Testing considerations is not a criterion;
  // a body with no such section has no criteria to extract.
  return extractAcceptanceCriteria(body).items
    .filter((box) => !box.checked)
    .map((box) => box.text);
}

/**
 * Return the first keyword (from config.keywords) that appears in the AC text,
 * case-insensitive. Returns null if no keyword matches.
 */
function findMatchingKeyword(acText, keywords) {
  const lowered = acText.toLowerCase();
  for (const kw of keywords) {
    if (lowered.includes(kw.toLowerCase())) return kw;
  }
  return null;
}

function renderBody(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? String(vars[key]) : `{${key}}`));
}

// ─── Body population (#2549) ───

/** Last resort. Reached only when an AC carries no text at all — see the file JSDoc. */
const QA_PLACEHOLDER = '(to be filled in during QA)';

/** Adverbs that qualify how the tester works, not what they do. */
const MANUAL_ADVERB = /^(manually|visually)\s+/i;

/** Leading list labels: "AC1: ", "AC 3. ", "AC:". */
const AC_LABEL = /^AC\s*\d*\s*[:.\-—]\s*/i;

/**
 * Structural breaks after which an AC states its assertion rather than its action.
 * The EARLIEST occurrence wins, not the first listed — the assertion begins at the
 * first structural break, whichever kind it happens to be.
 */
const ASSERTION_SPLITTERS = [
  ' that ',
  ' — ',
  ' -- ',
  '; ',
  ' and confirm ',
  ' and verify ',
  ' and check ',
  ' and validate ',
  ' and ensure ',
];

/**
 * What the tester records, keyed by the AC's verb. Matched longest-first so
 * "smoke test" is not shadowed by "test".
 *
 * Each value is a bare predicate, joined to the subject with a colon rather than a
 * copula. A subject lifted verbatim out of an AC may be singular or plural and nothing
 * here can tell which, so "<subject> is confirmed" produces "The dark theme contrast
 * ratios is confirmed". The colon form has no agreement to get wrong.
 */
const OBSERVATION_BY_VERB = {
  'smoke test': 'passes without defects',
  'click through': 'completes without error',
  'walk through': 'completes without error',
  'exploratory test': 'surfaces no defects',
  'test': 'passes without defects',
  'verify': 'confirmed',
  'confirm': 'confirmed',
  'validate': 'confirmed',
  'check': 'confirmed',
  'review': 'confirmed',
};

const VERBS_LONGEST_FIRST = Object.keys(OBSERVATION_BY_VERB).sort((a, b) => b.length - a.length);

function capitalizeFirst(s) {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

function sentence(s) {
  const t = capitalizeFirst(s.trim());
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** Strip the manual adverb and present the remainder as an instruction. */
function toImperative(text) {
  return capitalizeFirst(text.replace(MANUAL_ADVERB, '').trim());
}

/** The clause after the first structural break, or null when none is separable. */
function splitAssertion(action) {
  const lower = action.toLowerCase();
  let at = -1;
  let width = 0;
  for (const sp of ASSERTION_SPLITTERS) {
    const i = lower.indexOf(sp);
    if (i > -1 && (at === -1 || i < at)) {
      at = i;
      width = sp.length;
    }
  }
  if (at === -1) return null;
  const tail = action.slice(at + width).trim().replace(/^that\s+/i, '');
  return tail.length > 0 ? tail : null;
}

/**
 * No separable assertion: name the AC's subject and the observation its verb demands.
 * "Verify the collapsed row at a narrow width" -> "The collapsed row at a narrow width:
 * confirmed." Weaker than a real assertion clause, but it tells the tester what they are
 * looking at and what counts as done — which a placeholder does not.
 */
function subjectObservation(action) {
  const lower = action.toLowerCase();
  const verb = VERBS_LONGEST_FIRST.find((v) => lower.startsWith(`${v} `)) || null;
  const subject = verb ? action.slice(verb.length).trim() : action;
  const observation = verb ? OBSERVATION_BY_VERB[verb] : 'confirmed';
  return sentence(`${subject}: ${observation}`);
}

/**
 * Derive steps/expectedResult from the AC text alone.
 * @param {string|null} acText
 * @returns {{steps: string, expectedResult: string, path: 'derived'|'degenerate'|'placeholder'}}
 */
function deriveFill(acText) {
  const raw = typeof acText === 'string' ? acText.trim() : '';
  if (!raw) {
    return { steps: QA_PLACEHOLDER, expectedResult: QA_PLACEHOLDER, path: 'placeholder' };
  }

  const text = raw.replace(AC_LABEL, '').trim();
  if (!text) {
    return { steps: QA_PLACEHOLDER, expectedResult: QA_PLACEHOLDER, path: 'placeholder' };
  }

  const action = toImperative(text);

  // Fewer than three words leaves a bare verb with nothing to act on. Reproduce the AC
  // verbatim rather than emitting a confidently-wrong instruction built from one word.
  if (action.split(/\s+/).filter(Boolean).length < 3) {
    return {
      steps: raw,
      expectedResult: sentence(`the acceptance criterion "${text}" holds when checked by hand`),
      path: 'degenerate',
    };
  }

  const assertion = splitAssertion(action);
  return {
    steps: action,
    expectedResult: assertion ? sentence(assertion) : subjectObservation(action),
    path: 'derived',
  };
}

/** True for a caller value substantial enough to override derivation. */
function usableFillValue(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/** `steps` alone may also be a list — numbered steps are naturally an array (#2976). */
function usableStepsValue(v) {
  return usableFillValue(v) || (Array.isArray(v) && v.length > 0 && v.every(usableFillValue));
}

/** A leading list number the caller already wrote: "1. ", "2) ". */
const LEADING_STEP_NUMBER = /^\d+[.)]\s+/;

/**
 * Fully numbered steps, ready to drop under `### Steps to Perform` (#2976). The
 * template carries no number of its own, so every tier numbers here: an array
 * becomes "1. …\n2. …" with any caller number replaced, a string gets "1. "
 * unless it already starts with one.
 */
function numberSteps(steps) {
  if (Array.isArray(steps)) {
    return steps
      .map((s, i) => `${i + 1}. ${s.trim().replace(LEADING_STEP_NUMBER, '')}`)
      .join('\n');
  }
  const text = steps.trim();
  return LEADING_STEP_NUMBER.test(text) ? text : `1. ${text}`;
}

/** What each fill field accepts, for the rejection warning (#2976). */
const FILL_FIELD_TYPES = {
  steps: 'a non-empty string or a non-empty array of non-empty strings',
  expectedResult: 'a non-empty string',
  fixtures: 'a non-empty string',
};

function describeValue(v) {
  if (Array.isArray(v)) return v.length === 0 ? 'an empty array' : 'an array with a blank or non-string item';
  if (typeof v === 'string') return 'a blank string';
  return `a ${typeof v}`;
}

/**
 * Caller fill wins over derivation, per field. A fill naming only `steps` keeps the
 * derived `expectedResult` rather than blanking it — a half-supplied fill is a partial
 * improvement, not an instruction to discard the other half.
 *
 * A supplied field that fails its type check falls back like an absent one, but is
 * reported in `warnings` naming the AC and the field (#2976): before, an array `steps`
 * was dropped with nothing said while `path` still read `caller`. `path` is `caller`
 * only when both `steps` and `expectedResult` came from the caller; any mix is
 * `partial-caller`, and `fillSources` says which field came from where.
 */
function resolveFill(acText, fill) {
  const derivedRaw = deriveFill(acText);
  const derived = {
    ...derivedRaw,
    steps: numberSteps(derivedRaw.steps),
    fixtures: null,
    fillSources: { steps: 'derived', expectedResult: 'derived' },
    warnings: [],
  };
  const entry = fill && typeof fill === 'object' ? fill[acText] : null;
  if (!entry || typeof entry !== 'object') return derived;

  const warnings = [];
  const accept = (field, usable) => {
    const v = entry[field];
    if (v === undefined || v === null) return false;
    if (usable(v)) return true;
    warnings.push(
      `Fill for AC "${acText}": field "${field}" rejected — expected ${FILL_FIELD_TYPES[field]}, got ${describeValue(v)}; ` +
      (field === 'fixtures' ? 'no ### Fixtures section written.' : 'fell back to derivation.')
    );
    return false;
  };

  const stepsFromCaller = accept('steps', usableStepsValue);
  const expectedFromCaller = accept('expectedResult', usableFillValue);
  // The `### Fixtures` declaration qa-fixtures.js provisions (#2827). Caller-
  // only: nothing derives board state from AC text, and an absent value means
  // no section at all — a heading with no items is an invalid declaration.
  const fixturesFromCaller = accept('fixtures', usableFillValue);

  const fillSources = {
    steps: stepsFromCaller ? 'caller' : 'derived',
    expectedResult: expectedFromCaller ? 'caller' : 'derived',
  };
  let path = derived.path;
  if (stepsFromCaller && expectedFromCaller) path = 'caller';
  else if (stepsFromCaller || expectedFromCaller) path = 'partial-caller';

  return {
    steps: stepsFromCaller ? numberSteps(entry.steps) : derived.steps,
    expectedResult: expectedFromCaller ? entry.expectedResult.trim() : derived.expectedResult,
    fixtures: fixturesFromCaller ? entry.fixtures.trim() : null,
    path,
    fillSources,
    warnings,
  };
}

/**
 * Appended to a rendered body when the fill declares fixtures. A config may
 * override the template; the default keeps the heading qa-fixtures.js reads.
 */
const DEFAULT_FIXTURES_TEMPLATE = '\n\n### Fixtures\n{fixtures}';

/**
 * Read a --fill JSON map. A missing or malformed file degrades to null so extraction
 * still runs on derivation — a broken optional input must not cost the caller the
 * sub-issues themselves.
 */
function loadFillFile(filePath, readFn = (p) => fs.readFileSync(p, 'utf8')) {
  // #3048: a fill file that cannot be used is named in `warnings`, never
  // dropped — every AC otherwise falls back to derived steps while the run
  // reports success, the silent rejection #2976 ruled out for fill fields.
  const unusable = (reason) => ({ fill: null, warning: `fill file ${filePath} could not be used: ${reason}; every AC falls back to derived steps` });
  let raw;
  try {
    raw = readFn(filePath);
  } catch (e) {
    return unusable(e && e.code === 'ENOENT' ? 'not found (ENOENT)' : `unreadable (${e && e.message ? e.message : e})`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return unusable(`not valid JSON (${e.message})`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return unusable('JSON is not an object keyed by AC text');
  }
  return { fill: parsed, warning: null };
}

function fetchIssue(issueNumber, execFn = execSync) {
  // `branch` is consumed by placeSubIssue (#2821): a QA sub-issue inherits the
  // parent's branch, because the verification it carries is evidence about the
  // parent's change and belongs on the same workstream.
  const raw = execFn(`gh pmu view ${issueNumber} --json=body,title,branch`, { encoding: 'utf8' });
  return JSON.parse(raw);
}

// QA filing lives in lib/qa-issue.js (#3453), the one place a `qa-required`
// issue is created: sub-issue creation, the separate move to qa_required and
// the branch placement through assign-branch.js. Re-exported below so callers
// and tests that import them from here keep working.
const {
  QA_STATUS_ALIAS, createSubIssue, setSubIssueStatus, placeSubIssue,
} = require('./lib/qa-issue.js');

/**
 * The parent's sub-issues as `{number, title, state}` (#3268), for the retry
 * dedupe in extract(). `gh pmu sub list --json` is a bare boolean flag here.
 */
function listSubIssues(parentIssue, execFileFn = execFileSync) {
  const raw = execFileFn('gh', ['pmu', 'sub', 'list', String(parentIssue), '--json'], { encoding: 'utf8' });
  const data = JSON.parse(raw);
  return (data.children || []).map((c) => ({ number: c.number, title: c.title, state: c.state }));
}

/**
 * The gate markers an unchecked AC may already carry (#3161), read from
 * ac-gate-markers.json so this script declares none of its own.
 * @returns {Array<{id: string, pattern: RegExp}>}
 */
function loadGateMarkers(markersPath = GATE_MARKERS_PATH) {
  const data = JSON.parse(fs.readFileSync(markersPath, 'utf8'));
  return (data.markers || []).map((m) => ({ id: m.id, pattern: new RegExp(m.pattern) }));
}

/** The id of the first marker the AC carries, or null. */
function findGateMarker(acText, markers) {
  const hit = markers.find((m) => m.pattern.test(acText));
  return hit ? hit.id : null;
}

function buildAnnotation(format, acText, subIssueNumber) {
  return format
    .replace('{acText}', acText)
    .replace('{subIssueNumber}', String(subIssueNumber));
}

async function extract({ issueNumber, config, fetchFn, createFn, existingFn, placeFn, writeTemp, unlinkTemp, dryRun, fill = null, fillWarning = null, gateMarkers = loadGateMarkers() }) {
  // placeFn is injected, never defaulted to the live implementation. Every
  // other dependency here follows that rule and main() supplies all of them;
  // a live default would let any caller that forgot the stub reach `gh`
  // silently — which is precisely what a test suite must not do.
  if (!dryRun && typeof placeFn !== 'function') {
    throw new Error('extract requires placeFn — placement is not optional (#2821)');
  }
  const issue = fetchFn(issueNumber);
  const body = issue.body || '';
  const parentTitle = issue.title || '';
  const parentBranch = issue.branch || null;
  const acs = extractUncheckedAcs(body);

  const matched = [];
  const skipped = [];
  const unfiled = [];
  const alreadyGated = [];
  const errors = [];
  const warnings = fillWarning ? [fillWarning] : [];

  // The parent's existing QA sub-issues (#3268). Injected like every other
  // dependency; a failed read is a warning and dedupe is skipped for the run.
  let existing = [];
  if (typeof existingFn === 'function') {
    try {
      existing = existingFn(issueNumber) || [];
    } catch (e) {
      warnings.push(`existing QA sub-issues of #${issueNumber} could not be read (${e.message}); a retry may file duplicates`);
    }
  }

  for (const acText of acs) {
    // An AC that already points at its gate is not extracted again (#3161):
    // the keyword `QA:` otherwise matches the AC's own `→ QA: #N` annotation
    // and files a duplicate QA sub-issue. Reported apart from `skipped`, which
    // means "no keyword matched".
    const marker = findGateMarker(acText, gateMarkers);
    if (marker) {
      alreadyGated.push({ acText, marker });
      continue;
    }
    const keyword = findMatchingKeyword(acText, config.keywords);
    if (!keyword) {
      skipped.push(acText);
      continue;
    }
    // #3268: this script files sub-issues but never annotates the parent, so a
    // retry before annotation (compaction, a partial failure) filed every AC
    // again. An open QA sub-issue already titled for this AC is reused: its
    // annotation is returned for the caller to apply, and nothing is created.
    const prior = existing.find((s) => s && s.title === `QA: ${acText}` && String(s.state || 'OPEN').toUpperCase() === 'OPEN');
    if (prior) {
      matched.push({ acText, keyword, subIssueNumber: prior.number, annotation: buildAnnotation(config.annotationFormat, acText, prior.number), existing: true });
      continue;
    }
    // #3362: a keyword match proposes a QA issue; it files one only once every
    // automation route has a specific reason it cannot reach the check (the
    // AC's `routes` in the fill). Unanswered, the AC is reported in `unfiled`
    // for the caller to automate in-run or answer and re-run — never filed.
    if (Array.isArray(config.automationRoutes) && config.automationRoutes.length > 0) {
      const entry = fill && Object.prototype.hasOwnProperty.call(fill, acText) ? fill[acText] : null;
      const check = validateRouteAnswers(entry && entry.routes, config);
      if (!check.valid) {
        unfiled.push({ acText, keyword, problems: check.problems });
        continue;
      }
    }
    if (dryRun) {
      matched.push({ acText, keyword, subIssueNumber: null, annotation: null });
      continue;
    }
    try {
      // Resolved content reaches gh only as temp-file body text (-F), never as an
      // argument, so caller-supplied and AC-derived strings stay inert data (#2456).
      const { steps, expectedResult, fixtures, path: fillPath, fillSources, warnings: fillWarnings } =
        resolveFill(acText, fill);
      for (const w of fillWarnings) warnings.push(w);
      let bodyText = renderBody(config.bodyTemplate, {
        acDescription: acText,
        parentIssue: issueNumber,
        parentTitle,
        steps,
        expectedResult
      });
      if (fixtures) {
        bodyText += renderBody(config.fixturesTemplate || DEFAULT_FIXTURES_TEMPLATE, { fixtures });
      }
      // A creation path: no sub-issue number exists yet, so a random suffix
      // (rule 05), never the parent's number — two sessions extracting one
      // issue shared the fixed name (#3268).
      const tmpPath = `.tmp-qa-body-${crypto.randomBytes(4).toString('hex')}.md`;
      writeTemp(tmpPath, bodyText);
      try {
        const subIssueNumber = createFn(issueNumber, `QA: ${acText}`, tmpPath);
        const annotation = buildAnnotation(config.annotationFormat, acText, subIssueNumber);
        // Placement runs per sub-issue, immediately after creation, so a
        // failure names the issue it belongs to rather than the batch.
        const placed = await placeFn({ subIssueNumber, parentBranch });
        for (const w of placed.warnings) warnings.push(w);
        matched.push({ acText, keyword, subIssueNumber, annotation, fillPath, fillSources, placement: placed.placement });
      } finally {
        unlinkTemp(tmpPath);
      }
    } catch (e) {
      errors.push({ acText, keyword, message: e.message });
    }
  }

  // `ok` tracks creation, not placement. An unplaced sub-issue is a real gate
  // that is merely harder to reach, so it is a warning; failing the run would
  // suggest nothing was created when something was.
  return { ok: errors.length === 0, issueNumber, matched, skipped, unfiled, alreadyGated, errors, warnings };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    process.stderr.write(args.error + '\n');
    process.exit(2);
  }
  if (args.checkRoutes) {
    // #3362: /qa's Outcome 3 gate — a JSON map of route id → reason.
    let answers = null;
    try {
      answers = JSON.parse(fs.readFileSync(args.checkRoutes, 'utf8'));
    } catch (e) {
      process.stderr.write(`--check-routes ${args.checkRoutes} could not be read: ${e.message}\n`);
      process.exit(2);
    }
    const result = validateRouteAnswers(answers, loadConfig());
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.valid ? 0 : 1);
  }
  try {
    const config = loadConfig();
    const loaded = args.fill ? loadFillFile(args.fill) : { fill: null, warning: null };
    const result = await extract({
      issueNumber: args.issue,
      config,
      fetchFn: (n) => fetchIssue(n),
      createFn: (p, t, b) => createSubIssue(p, t, b),
      existingFn: (p) => listSubIssues(p),
      placeFn: (a) => placeSubIssue(a),
      writeTemp: (p, c) => fs.writeFileSync(p, c),
      unlinkTemp: (p) => { try { fs.unlinkSync(p); } catch { /* best-effort */ } },
      dryRun: args.dryRun,
      fill: loaded.fill,
      fillWarning: loaded.warning
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
  } catch (e) {
    process.stderr.write(e.message + '\n');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((e) => {
    process.stderr.write((e && e.message ? e.message : String(e)) + '\n');
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  loadConfig,
  validateRouteAnswers,
  loadGateMarkers,
  findGateMarker,
  extractUncheckedAcs,
  findMatchingKeyword,
  renderBody,
  buildAnnotation,
  extract,
  fetchIssue,
  createSubIssue,
  setSubIssueStatus,
  placeSubIssue,
  QA_STATUS_ALIAS,
  deriveFill,
  resolveFill,
  loadFillFile,
  listSubIssues,
  QA_PLACEHOLDER,
  DEFAULT_FIXTURES_TEMPLATE
};
