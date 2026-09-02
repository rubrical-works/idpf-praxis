#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.100.0
 * @description Auto-create QA sub-issues for unverifiable ACs in a /work issue. Reads
 * qa-config.json for keyword triggers, fetches the parent issue body via gh pmu, matches
 * unchecked AC lines against keywords (case-insensitive), and creates a labeled sub-issue
 * per match via gh pmu sub create. Returns a JSON envelope listing matches and sub-issue
 * numbers. Spec replacement for /work Step 4a (#2318).
 *
 * Usage: node qa-extract.js --issue <N> [--dry-run] [--fill <path>]
 *
 * Output (JSON envelope on stdout):
 *   { ok, issueNumber, matched: [{ acText, keyword, subIssueNumber, annotation, fillPath }], skipped: [acText], errors: [] }
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
const path = require('path');
const { execSync, execFileSync } = require('child_process');
const { scanCheckboxes } = require('./lib/checkbox-scan.js');

const CONFIG_PATH = path.join(__dirname, 'lib', 'qa-config.json');

function parseArgs(argv) {
  const out = { issue: null, dryRun: false, fill: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--issue' && argv[i + 1]) out.issue = parseInt(argv[++i], 10);
    else if (argv[i] === '--dry-run') out.dryRun = true;
    else if (argv[i] === '--fill' && argv[i + 1]) out.fill = argv[++i];
  }
  if (!out.issue || Number.isNaN(out.issue)) {
    return { error: 'Missing or invalid --issue <number> argument.' };
  }
  return out;
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
  return scanCheckboxes(body)
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

/**
 * Caller fill wins over derivation, per field. A fill naming only `steps` keeps the
 * derived `expectedResult` rather than blanking it — a half-supplied fill is a partial
 * improvement, not an instruction to discard the other half.
 */
function resolveFill(acText, fill) {
  const derived = deriveFill(acText);
  const entry = fill && typeof fill === 'object' ? fill[acText] : null;
  if (!entry || typeof entry !== 'object') return derived;

  const steps = usableFillValue(entry.steps) ? entry.steps.trim() : derived.steps;
  const expectedResult = usableFillValue(entry.expectedResult)
    ? entry.expectedResult.trim()
    : derived.expectedResult;

  const usedCaller = steps !== derived.steps || expectedResult !== derived.expectedResult;
  return { steps, expectedResult, path: usedCaller ? 'caller' : derived.path };
}

/**
 * Read a --fill JSON map. A missing or malformed file degrades to null so extraction
 * still runs on derivation — a broken optional input must not cost the caller the
 * sub-issues themselves.
 */
function loadFillFile(filePath, readFn = (p) => fs.readFileSync(p, 'utf8')) {
  try {
    const parsed = JSON.parse(readFn(filePath));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_e) {
    return null;
  }
}

function fetchIssue(issueNumber, execFn = execSync) {
  const raw = execFn(`gh pmu view ${issueNumber} --json=body,title`, { encoding: 'utf8' });
  return JSON.parse(raw);
}

// Title is `QA: ${acText}` verbatim from unchecked AC lines in (attacker-
// influenceable) issue bodies. Pass every value as a discrete execFileSync
// argument so the shell is never a trust boundary — backticks/$()/quotes in
// the title are inert data, not code (#2456). Do NOT reintroduce a shell
// string here.
function createSubIssue(parentIssue, title, bodyPath, execFileFn = execFileSync) {
  const args = ['pmu', 'sub', 'create', '--parent', String(parentIssue), '--title', title, '--label', 'qa-required', '-F', bodyPath];
  const raw = execFileFn('gh', args, { encoding: 'utf8' });
  const m = raw.match(/#(\d+)/);
  if (!m) throw new Error(`gh pmu sub create output did not include a sub-issue number:\n${raw}`);
  return parseInt(m[1], 10);
}

function buildAnnotation(format, acText, subIssueNumber) {
  return format
    .replace('{acText}', acText)
    .replace('{subIssueNumber}', String(subIssueNumber));
}

function extract({ issueNumber, config, fetchFn, createFn, writeTemp, unlinkTemp, dryRun, fill = null }) {
  const issue = fetchFn(issueNumber);
  const body = issue.body || '';
  const parentTitle = issue.title || '';
  const acs = extractUncheckedAcs(body);

  const matched = [];
  const skipped = [];
  const errors = [];

  for (const acText of acs) {
    const keyword = findMatchingKeyword(acText, config.keywords);
    if (!keyword) {
      skipped.push(acText);
      continue;
    }
    if (dryRun) {
      matched.push({ acText, keyword, subIssueNumber: null, annotation: null });
      continue;
    }
    try {
      // Resolved content reaches gh only as temp-file body text (-F), never as an
      // argument, so caller-supplied and AC-derived strings stay inert data (#2456).
      const { steps, expectedResult, path: fillPath } = resolveFill(acText, fill);
      const bodyText = renderBody(config.bodyTemplate, {
        acDescription: acText,
        parentIssue: issueNumber,
        parentTitle,
        steps,
        expectedResult
      });
      const tmpPath = `.tmp-qa-body-${issueNumber}.md`;
      writeTemp(tmpPath, bodyText);
      try {
        const subIssueNumber = createFn(issueNumber, `QA: ${acText}`, tmpPath);
        const annotation = buildAnnotation(config.annotationFormat, acText, subIssueNumber);
        matched.push({ acText, keyword, subIssueNumber, annotation, fillPath });
      } finally {
        unlinkTemp(tmpPath);
      }
    } catch (e) {
      errors.push({ acText, keyword, message: e.message });
    }
  }

  return { ok: errors.length === 0, issueNumber, matched, skipped, errors };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    process.stderr.write(args.error + '\n');
    process.exit(2);
  }
  try {
    const config = loadConfig();
    const result = extract({
      issueNumber: args.issue,
      config,
      fetchFn: (n) => fetchIssue(n),
      createFn: (p, t, b) => createSubIssue(p, t, b),
      writeTemp: (p, c) => fs.writeFileSync(p, c),
      unlinkTemp: (p) => { try { fs.unlinkSync(p); } catch { /* best-effort */ } },
      dryRun: args.dryRun,
      fill: args.fill ? loadFillFile(args.fill) : null
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
  } catch (e) {
    process.stderr.write(e.message + '\n');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  loadConfig,
  extractUncheckedAcs,
  findMatchingKeyword,
  renderBody,
  buildAnnotation,
  extract,
  fetchIssue,
  createSubIssue,
  deriveFill,
  resolveFill,
  loadFillFile,
  QA_PLACEHOLDER
};
