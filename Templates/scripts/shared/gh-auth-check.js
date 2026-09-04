#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.101.0
 * @description Verify at session startup that the authenticated GitHub token holds the scopes this project's gh pmu workflow actually needs. Required scopes are derived from .gh-pmu.json presence and content, never hardcoded. Read-only and advisory: it runs `gh auth status`, never a mutating command, and emits the `gh auth refresh` remediation as text rather than executing it.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * Exactly three states. Coarse on purpose — this is what a status row renders;
 * `reason` is what a caller branches on when it needs to know why.
 */
const STATES = Object.freeze({
  VERIFIED: 'verified',
  MISSING: 'missing-scopes',
  UNDETERMINABLE: 'undeterminable',
});

const REASONS = Object.freeze({
  NO_GH_PMU_CONFIG: 'no-gh-pmu-config',
  ALL_GRANTED: 'all-required-scopes-granted',
  SCOPES_MISSING: 'required-scopes-not-granted',
  NO_SCOPE_HEADER: 'no-scope-information-returned',
  COMMAND_FAILED: 'gh-auth-status-failed',
  TIMEOUT: 'gh-auth-status-timed-out',
});

/**
 * A network call inside a startup check must not hang the session. Well under
 * the hook's first 15s ladder stage, so a slow network degrades to
 * `undeterminable` before the ladder ever reports this check late (#2687 is the
 * precedent: report the unverified state, never present it as verified).
 */
const TIMEOUT_MS = 5000;

/**
 * Broader scopes subsume narrower ones. `project` is write-level and covers
 * everything `read:project` would; the reverse is false, which is the whole
 * point — `gh pmu move` WRITES board fields, so a token holding only
 * `read:project` reads the board fine and fails every status transition.
 */
const SCOPE_IMPLICATIONS = Object.freeze({
  project: ['read:project'],
  repo: ['public_repo', 'repo:status'],
  admin_org: ['read:org'],
});

// ─── Derivation ───

/**
 * What THIS project needs, read from what it declares.
 *
 * Deliberately narrow: only `repo` and `project` are derivable from
 * `.gh-pmu.json`. `read:org` and `workflow` are genuinely required in some
 * setups, but nothing in that file says whether the board owner is an org or a
 * user, and nothing says whether this session will touch CI files. Asserting
 * them anyway would report `missing-scopes` against a correctly-privileged
 * user-owned board — the same absence-manufacturing-a-false-negative failure
 * the fine-grained-PAT case guards against, arriving from the other direction.
 * A check that cries wolf gets ignored, and this one only fires when it is sure.
 */
function deriveRequiredScopes(projectDir) {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(path.join(projectDir, '.gh-pmu.json'), 'utf8'));
  } catch (_e) {
    // Absent or malformed both mean "no derivable requirement". A project not
    // using gh pmu has no board to lose access to, and a broken config is not
    // this check's problem to report — config-integrity-check.js owns that.
    return [];
  }
  if (!config || typeof config !== 'object') return [];

  const required = ['repo'];
  if (config.project && typeof config.project === 'object') {
    required.push('project');
  }
  return required;
}

/**
 * Parse the scope list out of `gh auth status`.
 *
 * Returns an array of scopes, or **null** when the output carries no scope
 * information at all. That distinction is the contract: a fine-grained PAT
 * prints no scope line, and reporting it as zero granted scopes would fail a
 * correctly-privileged token. `null` means "cannot tell"; `[]` means "told, and
 * it is none". No API exposes a fine-grained PAT's permission set, so `null` is
 * the honest terminal answer rather than a step toward a better one.
 */
function parseTokenScopes(stdout) {
  if (typeof stdout !== 'string') return null;
  const line = stdout.split('\n').find((l) => l.includes('Token scopes:'));
  if (!line) return null;

  const tail = line.slice(line.indexOf('Token scopes:') + 'Token scopes:'.length).trim();
  if (!tail || tail === 'none') return [];

  const scopes = tail
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
  return scopes;
}

/**
 * An environment token overrides the stored login, and `gh auth refresh` cannot
 * modify one. Naming it is what keeps the remediation honest.
 */
function detectEnvToken(env) {
  const source = env || {};
  if (source.GH_TOKEN) return 'GH_TOKEN';
  if (source.GITHUB_TOKEN) return 'GITHUB_TOKEN';
  return null;
}

function isSatisfied(required, granted) {
  const set = new Set(granted);
  if (set.has(required)) return true;
  for (const [broad, covers] of Object.entries(SCOPE_IMPLICATIONS)) {
    if (set.has(broad) && covers.includes(required)) return true;
  }
  return false;
}

function buildRemediation(missing, envToken) {
  if (missing.length === 0) return null;
  if (envToken) {
    // The refresh command is not named here AT ALL, not even to say it would
    // not work. It cannot modify an environment token, and a reader skimming a
    // startup row runs the command they see rather than the sentence
    // qualifying it. Naming only the env var keeps the one visible action the
    // correct one.
    return `${envToken} is set in the environment and overrides the stored login. `
      + `Reissue or replace that token with these scopes: ${missing.join(', ')}`;
  }
  return `gh auth refresh -h github.com ${missing.map((s) => `-s ${s}`).join(' ')}`;
}

// ─── Runner ───

/**
 * The one external call, isolated so tests inject a fake and never shell out.
 * `execFileSync` with an argument array — never a shell string — so nothing
 * here can be turned into a shell injection by a hostile scope name.
 */
function defaultRunner() {
  try {
    const stdout = execFileSync('gh', ['auth', 'status'], {
      encoding: 'utf8',
      timeout: TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GH_PAGER: '', NO_COLOR: '1' },
    });
    return { ok: true, stdout, error: null, timedOut: false };
  } catch (e) {
    // gh writes the status block to stdout even on a non-zero exit in some
    // versions, so it is passed through rather than discarded.
    return {
      ok: false,
      stdout: e.stdout ? String(e.stdout) : '',
      error: e.message,
      timedOut: e.killed === true || e.signal === 'SIGTERM' || /ETIMEDOUT/.test(e.message || ''),
    };
  }
}

// ─── Check ───

/**
 * Advisory, read-only, fail-open — the same contract as `peers` and
 * `branch-sync`. Never blocks startup, never mutates, never runs a remediation
 * itself (`06-runtime-triggers.md`: offer, don't force).
 *
 * Every failure path resolves to `undeterminable` rather than `missing-scopes`.
 * A network outage, a timeout, or a logged-out `gh` are all different problems
 * with different remedies, and reporting any of them as a scope gap sends the
 * user to a fix that will not help.
 */
function checkGhAuth(options = {}) {
  const projectDir = options.projectDir || process.cwd();
  const env = options.env || process.env;
  const runner = options.runner || defaultRunner;

  const required = deriveRequiredScopes(projectDir);
  const envToken = detectEnvToken(env);

  const base = {
    required,
    granted: null,
    missing: [],
    envToken,
    remediation: null,
  };

  // Nothing declared, nothing to verify. Checked before running `gh` at all, so
  // a project not using gh pmu costs no subprocess on every session start.
  if (required.length === 0) {
    return { ...base, state: STATES.VERIFIED, reason: REASONS.NO_GH_PMU_CONFIG };
  }

  let result;
  try {
    result = runner();
  } catch (e) {
    // A throwing runner is a failed observation like any other. This check is
    // advisory and must never be the thing that breaks session startup.
    return {
      ...base,
      state: STATES.UNDETERMINABLE,
      reason: REASONS.COMMAND_FAILED,
      error: e && e.message ? e.message : String(e),
    };
  }
  result = result || {};

  const scopes = parseTokenScopes(result.stdout);

  if (!result.ok && scopes === null) {
    return {
      ...base,
      state: STATES.UNDETERMINABLE,
      reason: result.timedOut ? REASONS.TIMEOUT : REASONS.COMMAND_FAILED,
      error: result.error || null,
    };
  }

  if (scopes === null) {
    // Ran fine, told us nothing — the fine-grained-PAT case.
    return { ...base, state: STATES.UNDETERMINABLE, reason: REASONS.NO_SCOPE_HEADER };
  }

  const missing = required.filter((r) => !isSatisfied(r, scopes));

  if (missing.length === 0) {
    return { ...base, granted: scopes, state: STATES.VERIFIED, reason: REASONS.ALL_GRANTED };
  }

  return {
    ...base,
    granted: scopes,
    missing,
    remediation: buildRemediation(missing, envToken),
    state: STATES.MISSING,
    reason: REASONS.SCOPES_MISSING,
  };
}

// ─── Main ───

const MESSAGES = {
  [STATES.VERIFIED]: (r) => (r.reason === REASONS.NO_GH_PMU_CONFIG
    ? 'No .gh-pmu.json — no board scopes required.'
    : `Token holds all required scopes (${r.required.join(', ')}).`),
  [STATES.MISSING]: (r) => `Token is missing ${r.missing.join(', ')} — ${r.remediation}`,
  [STATES.UNDETERMINABLE]: (r) => `Token scopes could not be determined (${r.reason}).`,
};

if (require.main === module) {
  const result = checkGhAuth();
  process.stdout.write(JSON.stringify({
    success: true,
    message: MESSAGES[result.state](result),
    data: result,
  }) + '\n');
}

module.exports = {
  checkGhAuth,
  deriveRequiredScopes,
  parseTokenScopes,
  detectEnvToken,
  isSatisfied,
  buildRemediation,
  STATES,
  REASONS,
  MESSAGES,
  TIMEOUT_MS,
};
