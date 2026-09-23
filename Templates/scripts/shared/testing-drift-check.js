#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.106.0
 * @description Session-start check for tech-stack-dependent test configuration (#2903). Reports stack drift by delegating to charter-testing-audit.js, and reports framework-config.json testCoverageAudit overrides that no longer fit the imported tdd-refactor-coverage-audit skill. Read-only and advisory: it names /charter refresh as the remedy for drift and never prompts or writes.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * TWO FINDINGS, ONE CHECK.
 *
 *   Stack drift — `charter-testing-audit.js` `audit()` already detects a newly
 *   gained (key x role) with no suite and orphaned suites. It had no automatic
 *   caller (#2854 built it for "a developer or CI job"), so drift was found only
 *   by someone who already suspected it. This check is that caller; it does not
 *   re-derive detection.
 *
 *   Coverage-audit overrides — a STATIC reading of `testCoverageAudit`, the
 *   imported conventions and `git ls-files`. The coverage audit is never run:
 *   it reads `git diff <since>..HEAD`, and a session start has no commit range.
 *
 * WHAT AN OVERRIDE MEANS DEPENDS ON THE IMPORTED AUDIT. idpf-skills-dev#335
 * moved test classification ahead of the skip lists: `ignoredSourcePatterns`
 * now governs sources only, `excludePaths` is the one rule that skips a test,
 * and every skip is listed in `diagnostics.skippedTestFiles`. Before that fix an
 * ignore entry matching tests HID them; after it the same entry is either a
 * no-op (it matches only tests) or still doing real work (it also keeps sources
 * out — this repository's `tests/**` keeps three helpers out). So the verdict is
 * keyed on the imported script's CAPABILITY, read from its source, not on a
 * version number: the release carrying #335 was not known when this was written,
 * and a version comparison would silently misclassify a local build.
 *
 * NO ROW IS AN ALL-CLEAR ONLY WHEN SOMETHING WAS LOOKED AT. A project with no
 * `testCoverageAudit` block has nothing to evaluate and reports `none`. A project
 * WITH overrides whose skill is absent, or whose tracked files cannot be listed,
 * reports `undetermined` — never `clean`.
 *
 * Node built-ins and colocated files only, per the runtime dependency contract
 * in `04-deployment-awareness.md`. The imported skill script is required by
 * absolute path from the project, which is where a copied skill lives.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SKILL_REL = path.join('.claude', 'skills', 'tdd-refactor-coverage-audit');
const CONVENTIONS_REL = path.join('resources', 'test-coverage-conventions.json');
const AUDIT_SCRIPT_REL = path.join('scripts', 'test-coverage-audit.js');

/** Present in the imported audit's source only from idpf-skills-dev#335 on. */
const POST_335_MARKER = 'skippedTestFiles';

/** Pinned reason vocabulary. Callers compare against these, never against prose. */
const REASONS = Object.freeze({
  AUDIT_FAILED: 'drift-audit-failed',
  SKILL_NOT_IMPORTED: 'skill-not-imported',
  CAPABILITY_UNREADABLE: 'audit-capability-unreadable',
  TRACKED_FILES_UNAVAILABLE: 'tracked-files-unavailable',
  CONFIG_UNREADABLE: 'framework-config-unreadable',
});

const REASON_TEXT = Object.freeze({
  [REASONS.AUDIT_FAILED]: 'charter-testing-audit failed',
  [REASONS.SKILL_NOT_IMPORTED]: 'tdd-refactor-coverage-audit is not imported',
  [REASONS.CAPABILITY_UNREADABLE]: 'the imported coverage audit script could not be read',
  [REASONS.TRACKED_FILES_UNAVAILABLE]: 'tracked files could not be listed',
  [REASONS.CONFIG_UNREADABLE]: 'framework-config.json could not be read',
});

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const firstLine = (err) => String((err && err.message) || err).split('\n')[0];

function defaultAudit(cwd) {
  return require('./charter-testing-audit.js').audit(cwd);
}

function defaultListTrackedFiles(cwd) {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
  });
  return out.split('\0').filter(Boolean);
}

// ─── Stack drift ───

function checkDrift(cwd, auditFn) {
  let result;
  try {
    result = auditFn(cwd);
  } catch (err) {
    return { state: 'undetermined', reason: REASONS.AUDIT_FAILED, detail: firstLine(err), newlyGained: [], orphaned: [] };
  }
  const newlyGained = Array.isArray(result && result.newlyGained) ? result.newlyGained : [];
  const orphaned = Array.isArray(result && result.orphaned) ? result.orphaned : [];
  if (!result || (result.verdict !== 'clean' && result.verdict !== 'drift')) {
    return { state: 'undetermined', reason: REASONS.AUDIT_FAILED, detail: 'no verdict', newlyGained: [], orphaned: [] };
  }
  return { state: result.verdict, reason: null, detail: null, newlyGained, orphaned };
}

// ─── Coverage-audit overrides ───

function readOverride(cwd) {
  const raw = fs.readFileSync(path.join(cwd, 'framework-config.json'), 'utf8');
  const cfg = JSON.parse(raw);
  return isPlainObject(cfg.testCoverageAudit) ? cfg.testCoverageAudit : null;
}

const listOf = (override, key) =>
  (Array.isArray(override[key]) ? override[key].filter((p) => typeof p === 'string') : []);

/** Load the imported skill: conventions, the audit's glob helpers, and its skip-rule contract. */
function loadSkill(cwd) {
  const skillDir = path.join(cwd, SKILL_REL);
  let conventions;
  try {
    conventions = JSON.parse(fs.readFileSync(path.join(skillDir, CONVENTIONS_REL), 'utf8'));
  } catch {
    return { error: REASONS.SKILL_NOT_IMPORTED };
  }
  const scriptPath = path.join(skillDir, AUDIT_SCRIPT_REL);
  let source;
  let helpers;
  try {
    source = fs.readFileSync(scriptPath, 'utf8');
    // Borrow the audit's own matching rather than re-deriving it: a second copy
    // of the glob semantics is how this check and the audit would disagree.
    helpers = require(scriptPath);
  } catch {
    return { error: REASONS.CAPABILITY_UNREADABLE };
  }
  if (typeof helpers.matchAny !== 'function' || typeof helpers.testShapeGlobs !== 'function') {
    return { error: REASONS.CAPABILITY_UNREADABLE };
  }
  return {
    conventions,
    helpers,
    contract: source.includes(POST_335_MARKER) ? 'classifies-before-skip' : 'skips-before-classify',
  };
}

function checkOverrides(cwd, listTrackedFiles) {
  let override;
  try {
    override = readOverride(cwd);
  } catch {
    return { state: 'undetermined', reason: REASONS.CONFIG_UNREADABLE, contract: null, findings: [] };
  }
  const ignored = override ? listOf(override, 'ignoredSourcePatterns') : [];
  const excluded = override ? listOf(override, 'excludePaths') : [];
  const additional = override && isPlainObject(override.additionalLanguages) ? override.additionalLanguages : {};
  if (ignored.length === 0 && excluded.length === 0 && Object.keys(additional).length === 0) {
    return { state: 'none', reason: null, contract: null, findings: [] };
  }

  const skill = loadSkill(cwd);
  if (skill.error) return { state: 'undetermined', reason: skill.error, contract: null, findings: [] };
  const { conventions, helpers, contract } = skill;
  const bundled = isPlainObject(conventions.languages) ? conventions.languages : {};
  const findings = [];

  // (b) narrowing language override — any audit. mergeConfig replaces a
  // same-key language wholesale, so an override whose testPatterns are a strict
  // subset of the bundled entry's NARROWS pairing (#2866). Equal sets narrow
  // nothing and are not reported.
  for (const [name, def] of Object.entries(additional)) {
    const mine = isPlainObject(def) && Array.isArray(def.testPatterns) ? def.testPatterns : null;
    const theirs = isPlainObject(bundled[name]) && Array.isArray(bundled[name].testPatterns) ? bundled[name].testPatterns : null;
    if (!mine || !theirs) continue;
    const missing = theirs.filter((p) => !mine.includes(p));
    if (missing.length > 0 && mine.every((p) => theirs.includes(p))) {
      findings.push({
        kind: 'narrowing-language',
        list: 'additionalLanguages',
        entry: name,
        count: missing.length,
        detail: `additionalLanguages.${name} replaces the bundled entry and narrows pairing — it drops ${missing.length} of ${theirs.length} bundled testPatterns`,
      });
    }
  }

  // List-based shapes need the tracked files; an additionalLanguages-only
  // override never lists them.
  const listEntries = contract === 'classifies-before-skip'
    ? ignored.map((entry) => ({ list: 'ignoredSourcePatterns', entry }))
    : [...ignored.map((entry) => ({ list: 'ignoredSourcePatterns', entry })), ...excluded.map((entry) => ({ list: 'excludePaths', entry }))];

  if (listEntries.length > 0) {
    let files;
    try {
      files = listTrackedFiles(cwd);
    } catch {
      return { state: 'undetermined', reason: REASONS.TRACKED_FILES_UNAVAILABLE, contract, findings };
    }
    // A match against any language's test shape implies that language is
    // present in the tree, so "test-shaped for a detected language" holds by
    // construction.
    const shapes = Object.values(bundled)
      .concat(Object.values(additional))
      .filter((d) => isPlainObject(d) && Array.isArray(d.testPatterns))
      .map((d) => helpers.testShapeGlobs(d.testPatterns));
    const isTest = (f) => shapes.some((globs) => helpers.matchAny(f, globs));

    for (const { list, entry } of listEntries) {
      const matches = files.filter((f) => helpers.matchAny(f, [entry]));
      const tests = matches.filter(isTest);
      if (contract === 'classifies-before-skip') {
        // (a) no-op ignore. Zero matches is not reported: the entry may
        // anticipate a future path. An entry that also matches a real source is
        // doing work and is not reported. excludePaths is never evaluated here —
        // it is the documented way to skip a test.
        if (matches.length > 0 && tests.length === matches.length) {
          findings.push({
            kind: 'no-op-ignore', list, entry, count: tests.length,
            detail: `ignoredSourcePatterns entry \`${entry}\` matches only test files (${tests.length}), so it keeps no source out and does nothing — remove it`,
          });
        }
      } else if (tests.length > 0) {
        // (a') hiding skip. A live effect with a named remedy, not staleness.
        findings.push({
          kind: 'hiding-skip', list, entry, count: tests.length,
          detail: `${list} entry \`${entry}\` hides ${tests.length} test file(s) from flow/contract classification until the tdd-refactor-coverage-audit update carrying idpf-skills-dev#335 is imported`,
        });
      }
    }
  }

  return { state: findings.length > 0 ? 'findings' : 'clean', reason: null, contract, findings };
}

// ─── Public API ───

/**
 * @param {string} cwd - Project root
 * @param {{auditFn?: Function, listTrackedFiles?: Function}} [deps] - injectable for tests
 */
function checkTestingDrift(cwd, deps = {}) {
  const auditFn = deps.auditFn || defaultAudit;
  const listTrackedFiles = deps.listTrackedFiles || defaultListTrackedFiles;
  return {
    drift: checkDrift(cwd, auditFn),
    overrides: checkOverrides(cwd, listTrackedFiles),
  };
}

const WARN = '⚠️ ';
const undeterminedText = (reason, detail) =>
  `could not be determined (${REASON_TEXT[reason] || reason}${detail ? `: ${detail}` : ''}) — the absence of information, not an all-clear`;

/**
 * The row text the startup hook renders verbatim. `null` means no row.
 * Owned here so the wording has one home; the hook only prefixes the label.
 */
function formatRows(result) {
  const rows = { drift: null, overrides: null };
  const d = result && result.drift;
  if (d && d.state === 'drift') {
    const parts = [];
    if (d.newlyGained.length > 0) {
      parts.push(`${d.newlyGained.length} detected pair(s) with no declared suite (${d.newlyGained.map((p) => `${p.key}/${p.role}`).join(', ')})`);
    }
    if (d.orphaned.length > 0) {
      parts.push(`${d.orphaned.length} orphaned suite(s) matching no file (${d.orphaned.map((s) => `${s.id} ${s.role}`).join(', ')})`);
    }
    rows.drift = `${WARN}${parts.join('; ')} — remedy: /charter refresh`;
  } else if (d && d.state === 'undetermined') {
    rows.drift = WARN + undeterminedText(d.reason, d.detail);
  }

  const o = result && result.overrides;
  const details = o && Array.isArray(o.findings) ? o.findings.map((f) => f.detail) : [];
  if (o && o.state === 'undetermined') {
    // Findings gathered before the step that could not complete are still facts;
    // the remainder is named as undetermined rather than dropped.
    rows.overrides = details.length > 0
      ? `${WARN}${details.join('; ')}; the rest ${undeterminedText(o.reason)}`
      : WARN + undeterminedText(o.reason);
  } else if (o && o.state === 'findings') {
    rows.overrides = WARN + details.join('; ');
  }
  return rows;
}

if (require.main === module) {
  let result;
  try {
    result = checkTestingDrift(process.cwd());
  } catch (err) {
    // Never throws in practice; if it does, fail open to an explicit undetermined.
    result = {
      drift: { state: 'undetermined', reason: REASONS.AUDIT_FAILED, detail: firstLine(err), newlyGained: [], orphaned: [] },
      overrides: { state: 'undetermined', reason: REASONS.CAPABILITY_UNREADABLE, contract: null, findings: [] },
    };
  }
  process.stdout.write(JSON.stringify({ success: true, data: { ...result, rows: formatRows(result) } }) + '\n');
}

module.exports = { checkTestingDrift, formatRows, REASONS, POST_335_MARKER };
