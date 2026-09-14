// Rubrical Works (c) 2026
/**
 * @framework-script 0.103.0
 * Startup Hook — SessionStart:startup
 *
 * Deterministic session initialization. Runs in a real Node.js process before
 * Claude sees the session, so the output is guaranteed (not advisory).
 *
 * Output channels:
 *   - stderr: rendered Session Initialized block with ANSI colors. Surfaced
 *     directly in Claude Code's UI — visible to the user without depending on
 *     Claude to echo anything.
 *   - stdout: hookSpecificOutput JSON with additionalContext containing the
 *     same block as plain text plus explicit file-read instructions for any
 *     content-load steps Claude must perform.
 *
 * Replaces #2276 + #2280 (sentinel + task-list machinery). See #2290.
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process'); // eslint-disable-line no-unused-vars

// #2702: the hook reads the resolver rather than re-deriving "absence means
// enabled" inline. Six consumers gate on this object and the discovery-implies-
// groups rule is exactly the kind of thing five would get right and the sixth
// would not.
const {
  readCrossSessionConfig,
  formatEffectiveState,
} = require('../scripts/shared/lib/cross-session-config.js');

// #2771: stale `.tmp-*` scratch-file sweep. Required directly rather than
// through framework-config.js, which is the cwd-taking wrapper around the same
// opt-out predicate: that module pulls ajv, ~41ms paid synchronously on every
// session start before a single check is spawned. This one requires nothing
// but Node built-ins.
const tmpCleanup = require('../scripts/shared/lib/tmp-cleanup.js');

// #2769: the .hall-monitor.json presence marker. Read-only and advisory — this
// module never deletes, so a stale marker survives to be reported and is
// cleaned up by the next monitor's start-time overwrite, not by the hook.
const hallMonitorPresence = require('../scripts/shared/lib/hall-monitor-presence.js');

// ─────────────────────────────────────────────────────────────────────────────
// ANSI color helpers
// ─────────────────────────────────────────────────────────────────────────────

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
};

const heading = (s) => `${ANSI.bold}${ANSI.cyan}${s}${ANSI.reset}`;
const warn = (s) => `${ANSI.yellow}${s}${ANSI.reset}`;
const error = (s) => `${ANSI.red}${s}${ANSI.reset}`;

// ─────────────────────────────────────────────────────────────────────────────
// Synchronous session info gather (cheap, no child processes)
// ─────────────────────────────────────────────────────────────────────────────

function safeExec(cmd, timeoutMs = 5000) {
  try {
    // timeout guards session startup against a hung git (index.lock contention,
    // credential prompt) or a hung `gh pmu` extension. On timeout execSync throws
    // and the catch degrades to '' (#2457 defect 2).
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: timeoutMs,
    }).trim();
  } catch {
    return '';
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain specialist resolution (#2503, extracted to a shared module in #2504)
// ─────────────────────────────────────────────────────────────────────────────

// /change-domain-expert reaches the same injection surface mid-session and must
// apply the same allowlist and input validation. One implementation, two
// callers — see .claude/scripts/shared/lib/specialist-resolver.js.
const { resolveSpecialist, isSafeSpecialistName } = require('../scripts/shared/lib/specialist-resolver.js');

// Charter template detection is one rule shared with the /charter spec and
// Charter-Enforcement.md (#2893). This hook used to restate its own regex,
// matching only {{UPPER_SNAKE}}, so the bootstrap charter Praxis Hub Manager
// writes — {Capitalized Words} placeholders — reported Active.
const { isCharterTemplate } = require('../scripts/shared/lib/charter-template.js');

function gatherSessionInfo(cwd) {
  const date = new Date().toISOString().slice(0, 10);

  const repoRoot = safeExec('git rev-parse --show-toplevel') || cwd;
  const repoName = path.basename(repoRoot);

  const branch = safeExec('git branch --show-current') || '(detached)';
  const porcelain = safeExec('git status --porcelain');
  const cleanState = porcelain ? 'dirty' : 'clean';

  const config = readJson(path.join(cwd, 'framework-config.json')) || {};
  const {
    processFramework = 'Not configured',
    frameworkVersion = '',
    domainSpecialist = '',
    reviewMode = '',
    selfHosted = false,
    projectSkills = [],
    frameworkPath = '.',
  } = config;

  // Charter detection: file existence + template-marker check
  const charterPath = path.join(cwd, 'CHARTER.md');
  let charterStatus = 'Pending';
  if (fs.existsSync(charterPath)) {
    try {
      const content = fs.readFileSync(charterPath, 'utf8');
      charterStatus = isCharterTemplate(content) ? 'Pending' : 'Active';
    } catch {
      charterStatus = 'Pending';
    }
  }

  const ghPmuVersion = safeExec('gh pmu --version').split('\n')[0] || '';

  // Resolve the domain specialist. Config-on-disk is the single source of
  // truth (#2503): this runs on every session start, so a switch made in a
  // previous session — or a deactivation instruction that was lost to
  // compaction — cannot outlive the session that made it.
  const specialist = resolveSpecialist({ cwd, frameworkPath, domainSpecialist });
  const specialistPath = specialist.path;

  return {
    date,
    repoName,
    branch,
    cleanState,
    processFramework,
    frameworkVersion,
    domainSpecialist,
    reviewMode,
    selfHosted,
    projectSkills,
    frameworkPath,
    charterStatus,
    ghPmuVersion,
    // Reads .claude/x-session.json first, then the legacy framework-config.json
    // key, then the environment layer above both (#2774). Takes the project
    // root rather than the already-parsed config, because the chain spans two
    // files and the hook only loaded one of them.
    crossSessionMessaging: readCrossSessionConfig(cwd),
    // #2771. Read off the already-parsed config through the helper's own
    // predicate — never re-derived inline, for the reason crossSessionMessaging
    // records: a second copy of an absence rule is how the two drift.
    tmpCleanup: tmpCleanup.isEnabled(config),
    // #2769. Cheap: one stat and one JSON parse, no spawn, so it runs inline
    // with the rest of the synchronous gather rather than joining the check
    // ladder. Never throws.
    hallMonitor: hallMonitorPresence.readPresence(cwd),
    specialist,
    specialistPath,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stale scratch-file sweep (#2771)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remove stale `.tmp-*` scratch files from the project root.
 *
 * THE ONE STARTUP STEP THAT MUTATES THE TREE. Every other check is advisory,
 * per `06-runtime-triggers.md`'s *offer, don't force*. The exception is
 * deliberate: an `AskUserQuestion` at every session start, for files nobody
 * wants, is exactly the noise a hook should remove rather than add — and since
 * the hook communicates through `additionalContext`, the "offer" would be
 * Claude asking a question after the block, costing a turn on every start.
 * What makes that safe is not a prompt but what the helper refuses to touch.
 *
 * BEST-EFFORT AND SILENT ON FAILURE. Returning `null` rather than throwing is
 * the contract: the Session Initialized block must render no matter what, so a
 * sweep that cannot run degrades to no row, exactly as it does when there was
 * nothing to remove. That collapse is acceptable here and only here — a failed
 * sweep and a clean one both mean "no files were deleted", which is the fact
 * the row would have reported.
 *
 * @param {string} cwd - Project root
 * @param {{tmpCleanup?: boolean}} info - Session info carrying the resolved opt-out
 * @returns {{removed: string[], failed: Array<{name: string, error: string}>, oldestAgeMs?: number, signals: object}|null}
 */
function sweepStaleTempFiles(cwd, info) {
  try {
    // Disabled emits no row at all — not an "opted out" row. The suppression is
    // the user's own choice, and restating it every startup is the noise the
    // setting exists to remove (same decision as a disabled messaging group).
    if (info && info.tmpCleanup === false) return null;

    const signals = tmpCleanup.loadSignals(cwd);
    const { stale } = tmpCleanup.findStale(cwd, signals, Date.now());
    const { removed, failed } = tmpCleanup.removeStale(cwd, stale);

    const result = { removed, failed, signals };
    if (stale.length > 0) {
      result.oldestAgeMs = stale.reduce((max, s) => (s.ageMs > max ? s.ageMs : max), 0);
    }
    return result;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Parallel check execution with monotonic staged timeout ladder
// ─────────────────────────────────────────────────────────────────────────────

const TIMEOUT_STAGES = [15000, 30000, 45000, 60000]; // monotonic milestones from start

/**
 * Run all checks in parallel with monotonic staged timeout warnings.
 * - At each TIMEOUT_STAGES milestone, if checks are still pending, emit
 *   an ANSI-yellow warning to stderr naming each pending check.
 * - At the final stage (60s), kill remaining children and mark them
 *   as { status: 'error', error: 'timeout' }.
 *
 * Uses monotonic timestamps (Date.now()) so a check resolving between
 * deadlines does not desync the warning ladder.
 */
async function runChecksParallel(checks, stages = TIMEOUT_STAGES) {
  const startTs = Date.now();
  const pending = new Map(); // name → { promise, child, settled, result, resolve }

  for (const { name, script } of checks) {
    const handle = { settled: false, result: null, child: null, resolve: null };
    handle.promise = new Promise((resolve) => {
      // Capture resolve so the final-stage timeout handler can settle the
      // promise. Without this the 'exit' early-return on settled means a
      // timed-out check never resolves and Promise.all hangs forever (#2457).
      handle.resolve = resolve;
      const child = spawn('node', [script], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });
      handle.child = child;
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (c) => { stdout += c; });
      child.stderr?.on('data', (c) => { stderr += c; });
      child.on('error', (err) => {
        handle.settled = true;
        handle.result = { name, status: 'error', error: err.message };
        resolve(handle.result);
      });
      child.on('exit', (code) => {
        if (handle.settled) return; // already killed by timeout
        handle.settled = true;
        let parsed = null;
        try { parsed = stdout ? JSON.parse(stdout) : null; } catch { /* non-JSON */ }
        handle.result = { name, status: code === 0 ? 'ok' : 'error', exitCode: code, parsed, stderr };
        resolve(handle.result);
      });
    });
    pending.set(name, handle);
  }

  // Schedule monotonic warning ladder
  const warningTimers = stages.map((ms, idx) => {
    const isFinal = idx === stages.length - 1;
    return setTimeout(() => {
      const stillPending = [];
      for (const [name, h] of pending.entries()) {
        if (!h.settled) stillPending.push(name);
      }
      if (stillPending.length === 0) return;
      const elapsed = Math.round((Date.now() - startTs) / 1000);
      if (isFinal) {
        // Final stage: kill remaining and mark as timeout error
        for (const name of stillPending) {
          const h = pending.get(name);
          if (h && !h.settled && h.child) {
            try { h.child.kill('SIGKILL'); } catch { /* best-effort */ }
            h.settled = true;
            h.result = { name, status: 'error', error: 'timeout', elapsedSec: elapsed };
            // Settle the promise — the child's 'exit' handler early-returns on
            // settled, so without this call Promise.all would hang (#2457).
            if (h.resolve) h.resolve(h.result);
          }
        }
        process.stderr.write(error(`✗ Check(s) timed out after ${elapsed}s: ${stillPending.join(', ')}\n`));
      } else {
        process.stderr.write(warn(`⚠️  Check(s) still running after ${elapsed}s, extending: ${stillPending.join(', ')}\n`));
      }
    }, ms);
  });

  const results = await Promise.all(Array.from(pending.values()).map((h) => h.promise));
  warningTimers.forEach(clearTimeout);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Render Session Initialized block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Name the tree a dependency finding is about (#2639).
 *
 * `checkDependencies()` resolves a scope before doing anything else and
 * returns it, but every consumer here ignored it. In a PHM-deployed project
 * `scope` is `framework` and `root` is the hub framework root — never the cwd,
 * which is where an unqualified `npm ci` lands. One session read the warning,
 * offered `npm ci`, installed 478 packages into the project tree, and the
 * flagged condition was still there: the install was harmless and could not
 * possibly have resolved it.
 *
 * The dev repo is the single configuration where the omission was harmless —
 * `frameworkPath` is `.` and cwd IS the checked root — which is exactly why
 * this stayed invisible to the sessions most likely to notice it.
 */
function dependencyScopeLabel(scope) {
  return scope === 'framework' ? 'the framework root' : 'the project root';
}

function renderBlock(info, checkResults, opts = { color: true }) {
  const h = opts.color ? heading : (s) => s;
  const e = opts.color ? error : (s) => s;
  const w = opts.color ? warn : (s) => s;

  const lines = [];
  lines.push(h('Session Initialized'));
  lines.push(`- Date: ${info.date}`);
  lines.push(`- Repository: ${info.repoName}`);
  lines.push(`- Branch: ${info.branch} (${info.cleanState})`);
  lines.push(`- Process Framework: ${info.processFramework}${info.selfHosted ? ' (self-hosted)' : ''}`);
  if (info.frameworkVersion) lines.push(`- Framework Version: ${info.frameworkVersion}`);
  lines.push(`- Active Role: ${info.domainSpecialist || 'Not configured'}`);
  // #2503: a specialist that was configured but could not be loaded is worth a
  // line — the role is still announced above, so without this the user cannot
  // tell an injected specialist from a silently skipped one.
  if (info.specialist?.warning) lines.push(`- ${w(`Specialist: ⚠️ ${info.specialist.warning}`)}`);
  if (info.reviewMode) lines.push(`- Review Mode: ${info.reviewMode}`);

  // #2702. Read off `info`, not re-resolved here: renderBlock is called with
  // hand-made info objects across the test suite and by callers predating
  // #2702, and an absent value must behave exactly as it did before — no
  // suffix, no extra row, no throw.
  const messaging = info.crossSessionMessaging;

  // Check results
  for (const r of checkResults) {
    if (r.name === 'config-integrity') {
      if (r.status === 'ok' && r.parsed?.data?.status === 'verified') {
        lines.push(`- Config Integrity: ✅ Verified`);
      } else if (r.parsed?.data?.status === 'drift') {
        lines.push(`- Config Integrity: ${e('⚠️ Drift detected — run gh pmu config verify for details')}`);
      } else if (r.error === 'timeout') {
        lines.push(`- Config Integrity: ${e('⚠️ check timed out')}`);
      } else if (r.status === 'error') {
        // Non-timeout hard failure (non-zero exit, unparsable stdout, spawn
        // error). Without this branch the user got no signal (#2457 defect 3).
        lines.push(`- Config Integrity: ${e(`⚠️ check failed to run (${r.error || `exit ${r.exitCode}`})`)}`);
      }
      // skipped → omit
    }
    if (r.name === 'branch-sync') {
      const status = r.parsed?.data?.status;
      // `fetched: false` is the ABSENCE of information, not a clean bill of
      // health, and it matters MOST when the cached ref claims parity —
      // that is the case which otherwise emits no row at all, leaving a
      // stale all-clear indistinguishable from a verified one (#2687).
      //
      // `no-upstream` is excluded on purpose: fetchUpstream() returns false
      // whenever no remote or mergeRef is configured, so that status ALWAYS
      // carries fetched:false. A caveat there would report a configuration
      // state as a fetch failure.
      if (r.parsed?.data?.fetched === false && status && status !== 'no-upstream') {
        lines.push(`- Branch Sync: ${e('⚠️ unverified (upstream fetch failed; counts from a cached remote-tracking ref)')}`);
      }
      if (status === 'behind' || status === 'diverged') {
        const ahead = r.parsed?.data?.ahead || 0;
        const behind = r.parsed?.data?.behind || 0;
        lines.push(`- Branch Sync: ${e(`⚠️ ${status} (${ahead} ahead, ${behind} behind)`)}`);
      } else if (status === 'ahead') {
        const ahead = r.parsed?.data?.ahead || 0;
        lines.push(`- Branch Sync: ${w(`${ahead} commit(s) ahead of upstream`)}`);
      } else if (r.error === 'timeout') {
        lines.push(`- Branch Sync: ${e('⚠️ check timed out')}`);
      } else if (r.status === 'error') {
        // Non-timeout hard failure — surface it rather than silently omitting (#2457 defect 3).
        lines.push(`- Branch Sync: ${e(`⚠️ check failed to run (${r.error || `exit ${r.exitCode}`})`)}`);
      }
      // up-to-date / skipped → omit
    }
    if (r.name === 'dependency') {
      const dep = r.parsed?.data;
      // #2639: name the tree. A bare remedy leaves a hub-installed project's
      // reader to infer which of two trees the line is about, and the wrong
      // inference is the destructive one.
      const where = dependencyScopeLabel(dep?.scope);
      if (dep?.state === 'missing') {
        lines.push(`- Dependencies: ${e(`⚠️ node_modules not installed in ${where} — run npm ci`)}`);
      } else if (dep?.state === 'partial') {
        lines.push(`- Dependencies: ${e(`⚠️ ${dep.missing.length} of ${dep.total} packages missing in ${where} — run npm ci`)}`);
      } else if (dep?.state === 'stale') {
        lines.push(`- Dependencies: ${w(`⚠️ node_modules stale vs lockfile in ${where}`)}`);
      } else if (r.error === 'timeout') {
        lines.push(`- Dependencies: ${e('⚠️ check timed out')}`);
      } else if (r.status === 'error') {
        lines.push(`- Dependencies: ${e(`⚠️ check failed to run (${r.error || `exit ${r.exitCode}`})`)}`);
      }
      // healthy → omit, matching branch-sync's up-to-date. Dependency health is
      // a transient condition, not an identity assertion like config-integrity,
      // and a ✅ line on every session is noise in the overwhelmingly common case.
    }
    if (r.name === 'task-tools') {
      const tools = r.parsed?.data;
      // The remedy is carried in full on the row itself. This is the one line
      // the user may ever see about the condition — the offer below reaches
      // Claude, but a row pointing at a fix without naming it leaves a reader
      // who ignores the prompt with nothing to act on.
      if (tools?.state === 'disabled') {
        lines.push(`- Task Tools: ${e('⚠️ Not enabled locally — /work step tracking degrades to an inline checklist and compaction recovery is not guaranteed. To enable, add CLAUDE_CODE_ENABLE_TODO_TOOLS=true to ~/.claude/settings.json env, then relaunch.')}`);
      } else if (tools?.state === 'remote-gate-only') {
        // Deliberately not phrased as "unavailable". The remote flag may be on
        // right now; what the check knows is that nothing local pins it.
        lines.push(`- Task Tools: ${w('⚠️ No local override — availability rides a remote flag that can change between sessions, and compaction recovery is not guaranteed if it flips off. To pin it on, add CLAUDE_CODE_ENABLE_TODO_TOOLS=true to ~/.claude/settings.json env, then relaunch.')}`);
      } else if (r.error === 'timeout') {
        lines.push(`- Task Tools: ${e('⚠️ check timed out')}`);
      } else if (r.status === 'error') {
        lines.push(`- Task Tools: ${e(`⚠️ check failed to run (${r.error || `exit ${r.exitCode}`})`)}`);
      }
      // enabled-locally → omit, matching dependency's healthy.
    }
    if (r.name === 'gh-auth') {
      const auth = r.parsed?.data;
      // The remedy is carried in full on the row. `gh pmu` warns to stderr and
      // exits 0 on a scope failure, so this row is the only place the condition
      // is ever stated plainly — every other symptom looks like an empty board
      // field or a move that silently did nothing.
      if (auth?.state === 'missing-scopes') {
        lines.push(`- GitHub Token: ${e(`⚠️ missing ${auth.missing.join(', ')} — board reads return empty and \`gh pmu move\` cannot succeed. Fix: ${auth.remediation}`)}`);
      } else if (auth?.state === 'undeterminable') {
        // Never phrased as missing. A fine-grained PAT exposes no scope list at
        // all, so the honest report is that nothing was learned — presenting
        // that as a gap fails a correctly-privileged token (#2689 trap 1).
        lines.push(`- GitHub Token: ${w(`⚠️ scopes could not be determined (${auth.reason}) — this is the absence of information, not an all-clear and not a missing scope.`)}`);
      } else if (r.error === 'timeout') {
        lines.push(`- GitHub Token: ${e('⚠️ check timed out')}`);
      } else if (r.status === 'error') {
        lines.push(`- GitHub Token: ${e(`⚠️ check failed to run (${r.error || `exit ${r.exitCode}`})`)}`);
      }
      // verified → omit, matching dependency's healthy and task-tools'
      // enabled-locally. A correctly-scoped token is the overwhelmingly common
      // case and a ✅ line every session is noise.
    }
    if (r.name === 'peers') {
      const peers = r.parsed?.data;
      // #2702: a disabled group emits nothing and prints no per-invocation
      // skip notice — that suppression is the user's own choice. This suffix
      // is where the setting is made discoverable instead, so a configured
      // project is distinguishable from an unconfigured one.
      const messagingSuffix = messaging && !messaging.fullyEnabled
        ? ` — ${formatEffectiveState(messaging)}`
        : '';

      // #2769: a live `/hall-monitor` in this directory sets every session
      // here to quiet narration, so a session starting now must know that
      // BEFORE the first announcement arrives rather than inferring it
      // afterwards. A STALE marker is named too, and for the opposite reason:
      // a crashed monitor suppresses nothing, and without a row the user has
      // no way to tell that from a monitor doing its job.
      //
      // Read off `info`, never re-derived here — renderBlock is called with
      // hand-made info objects across the test suite and by callers predating
      // this, so an absent value must behave exactly as before: no text, no
      // throw. Same contract `trash` and `crossSessionMessaging` have.
      const hm = info.hallMonitor;
      let monitorSuffix = '';
      if (hm && hm.active) {
        monitorSuffix = ` — hall-monitor live (#${hm.pid})`;
      } else if (hm && typeof hm.reason === 'string' && hm.reason.startsWith('stale')) {
        monitorSuffix = ` — stale hall-monitor marker (#${hm.pid})`;
      }

      const suffix = `${messagingSuffix}${monitorSuffix}`;
      // The row carries the helper's own rendering verbatim. Re-deriving it
      // here would put the "seen vs reachable" distinction in two places, and
      // the copy that drifts is the one the user actually reads.
      if (peers?.state === 'peers') {
        lines.push(`- Peers: ${w(peers.row + suffix)}`);
      } else if (peers?.state === 'unavailable') {
        lines.push(`- Peers: ${w(`⚠️ session registry unavailable — peer discovery inactive${suffix}`)}`);
      } else if (r.error === 'timeout') {
        lines.push(`- Peers: ${e('⚠️ check timed out')}`);
      } else if (r.status === 'error') {
        lines.push(`- Peers: ${e(`⚠️ check failed to run (${r.error || `exit ${r.exitCode}`})`)}`);
      } else if (suffix) {
        // state `none` AND a configured state. The #2661 silence below is
        // justified only for an UNCONFIGURED lone session; keeping it here
        // would hide the configuration at the one place it is reported.
        lines.push(`- Peers: ${w(`none${suffix}`)}`);
      }
      // none → omit, matching dependency's healthy and task-tools' enabled.
      // A lone session is the overwhelmingly common case; a line every startup
      // announcing it is noise in a block of short factual status lines.
    }
    if (r.name === 'testing-drift') {
      // #2903. Rows carried verbatim from the helper's formatRows — the wording
      // has one home. Drift does not clear on its own, so the row repeats every
      // session it persists; it is a fact about the tree, never an offer.
      const rows = r.parsed?.data?.rows;
      if (rows?.drift) lines.push(`- Testing Drift: ${w(rows.drift)}`);
      if (rows?.overrides) lines.push(`- Coverage Overrides: ${w(rows.overrides)}`);
      if (!rows && r.error === 'timeout') {
        lines.push(`- Testing Drift: ${e('⚠️ check timed out')}`);
      } else if (!rows && r.status === 'error') {
        lines.push(`- Testing Drift: ${e(`⚠️ check failed to run (${r.error || `exit ${r.exitCode}`})`)}`);
      }
      // clean / none → omit, matching dependency's healthy.
    }
  }

  // Discovery disabled by config (#2702). The peers check is never registered
  // in this case, so no result reaches the loop above and the row has to be
  // emitted here. It must NOT be an absent row: `03-startup.md` already
  // assigns absence the meaning "no peers found", and reusing it for "did not
  // look" would make a configured project indistinguishable from a lone one.
  if (messaging && messaging.discovery === false
      && !checkResults.some((r) => r.name === 'peers')) {
    // Name the cause, then the consequence, then the implication the resolver
    // already authored. Routing this through formatEffectiveState instead said
    // "discovery" twice and led with the generic phrasing rather than the one
    // fact a reader needs: nothing was scanned.
    const implication = messaging.implications[0] || '';

    // An environment override zeroes `discovery` exactly as the config keys do,
    // so this branch fires for both — but the CAUSE differs and only one of the
    // two is in a file (#2705). Reporting "disabled by config
    // (crossSessionMessaging.enabled: false)" for a session-scoped override
    // sends the reader to edit framework-config.json, where they find nothing
    // wrong and no remaining explanation for a session that stays muted.
    if (messaging.source === 'environment') {
      const variable = (messaging.envOverride && messaging.envOverride.variable) || 'IDPF_X_SESSION';
      const value = messaging.envOverride ? messaging.envOverride.value : null;
      lines.push(`- Peers: ${w(`⚠️ discovery disabled for this session by ${variable}=${value} (not written to framework-config.json) — the session registry was not read and peers were not looked for. Unset it to restore discovery for the next session. ${implication}`.trim())}`);
    } else {
      const cause = messaging.enabled === false
        ? 'crossSessionMessaging.enabled: false'
        : 'crossSessionMessaging.discovery: false';
      lines.push(`- Peers: ${w(`⚠️ discovery disabled by config (${cause}) — the session registry was not read and peers were not looked for. ${implication}`.trim())}`);
    }
  }

  // Stale scratch-file sweep (#2771). Read off `info`, not re-run here:
  // renderBlock is called with hand-made info objects across the test suite and
  // by callers predating #2771, and an absent value must behave exactly as it
  // did before — no row, no throw. Same contract crossSessionMessaging has, and
  // the same reason a render function must never be the thing that deletes.
  if (info.trash) {
    const row = tmpCleanup.formatTrashRow(info.trash, info.trash.signals);
    // Empty string means nothing worth saying: no removals, no failures, and
    // the signals file did not ask for a row anyway. Omitting matches the Peers
    // row's `none` and the dependency check's healthy state.
    if (row) {
      // Warn-colored rather than plain: the tree was modified, which is worth
      // a reader's eye even though nothing went wrong.
      lines.push(`- Trash: ${w(row)}`);
    }
  }

  // Charter status
  if (info.charterStatus === 'Active') {
    // #2484: the block carries the status line only. The charter summary is a
    // post-hook read (see buildAdditionalContext) — #2475's precomputed
    // `Charter Vision:` / `Charter Focus:` lines clipped at 200 chars and
    // presented truncated sentences, which read as noise in a block of short
    // factual status lines.
    lines.push(`- Charter Status: Active`);
  } else {
    lines.push(`- ${e('Charter Status: Pending — /charter must run as the final startup action')}`);
  }

  // gh pmu version
  if (info.ghPmuVersion) {
    lines.push(`- GitHub Workflow: Active via ${info.ghPmuVersion}`);
  }

  // Project skills (if any)
  if (Array.isArray(info.projectSkills) && info.projectSkills.length > 0) {
    lines.push(`- Project Skills: ${info.projectSkills.join(', ')}`);
  }

  // Check failures (other than the checks rendered inline above, which already
  // emit their own timeout/error lines — listing one here too double-reports it)
  const INLINE_RENDERED = new Set(['config-integrity', 'branch-sync', 'dependency', 'task-tools', 'peers', 'gh-auth', 'testing-drift']);
  const failedOther = checkResults.filter((r) =>
    r.status === 'error' && !INLINE_RENDERED.has(r.name)
  );
  for (const r of failedOther) {
    lines.push(`- ${e(`⚠️ ${r.name}: ${r.error || `exit ${r.exitCode}`}`)}`);
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Build additionalContext (plain text + explicit instructions)
// ─────────────────────────────────────────────────────────────────────────────

function buildAdditionalContext(info, plainBlock, checkResults = []) {
  // The block must be visible to the user. Claude Code does not auto-surface
  // hook stderr in the UI, so we instruct Claude to echo the block verbatim
  // as the FIRST action of the response. The content is fully deterministic
  // (the hook computed it); only the display step depends on Claude.
  //
  // #2479: the display step remains model-dependent (no non-model channel puts
  // the hook's exact bytes on the user's screen — verified against Claude Code
  // hook docs). The observed failure collapsed a list to a summary and invented
  // a duplicate line, so the directive names both failure modes explicitly to
  // reduce lossy paraphrase. This hardens, it does not eliminate, the risk.
  const parts = [
    'DISPLAY THE FOLLOWING BLOCK VERBATIM AS YOUR FIRST RESPONSE — before any other action, commentary, or tool call. Reproduce every line exactly as written: do not summarize, collapse, or abbreviate any line; reproduce every list item in full; and do not add, invent, or duplicate lines. Render it as a code block for monospace alignment:',
    '',
    '```',
    plainBlock,
    '```',
    '',
  ];

  const instructions = [];

  // Drives both the role-adoption instruction and the appended content blob;
  // the two must never disagree about whether an injection is happening.
  const injectingSpecialist = info.specialist?.status === 'loaded';

  // #2484: charter summary is a post-hook read again, reversing #2475's
  // precompute. The tradeoff is deliberate — #2475 made the summary immune to
  // being silently skipped by a later model turn, but only by clipping it to
  // 200 chars per section, which produced truncated sentences. A read of
  // CHARTER.md yields full prose and can surface observations the clipped lines
  // could not (e.g. a Current Focus naming a version the working branch has
  // moved past). Listed first so the summary lands right after the block.
  //
  // #2637: the observation half existed; the handoff to the repair path did
  // not. `/charter refresh` runs verifyEntityCounts() and offers consent-gated
  // correction, so a reported-and-dropped mismatch — or one resolved by a hand
  // edit that bypasses that consent flow — was the only available outcome.
  //
  // Conditional on an actual observation, deliberately. An unconditional
  // "run /charter refresh" would print on every clean startup and train the
  // reader to ignore it, the same reason the Review-State Gate never prompts
  // on `reviewed-clean` (#2577). Recommend, never mutate: `06-runtime-triggers`
  // *offer, don't force*, and /charter's own "never auto-modify the charter
  // without user consent" contract.
  if (info.charterStatus === 'Active') {
    instructions.push('Read `CHARTER.md` and emit a concise prose summary of what this project is and its current focus. Note any mismatch you observe between the charter and current repository state. If you observe a mismatch, recommend that the user run `/charter refresh`, which re-verifies entity counts and offers consent-gated repair — recommend only, never make the change yourself.');
  }

  // #2503: the specialist is INJECTED, not pointed at. The former
  // `Read <path>` directive is what left the announced role without its
  // knowledge (#1977) — a directive can be skipped, content cannot. The blob
  // itself is appended after the numbered actions (see below) so it does not
  // separate the block from the instructions that act on it.
  if (injectingSpecialist) {
    instructions.push(`Adopt the active domain specialist role (${info.specialist.name}); its full instructions are appended below.`);
  }

  // Statusline: prompt setup when no statusLine configured. Restores the #1542
  // flow lost in the procedural→hook-driven startup migration (#2398).
  const statusline = checkResults.find((r) => r && r.name === 'statusline');
  if (statusline && statusline.parsed?.data?.configured === false) {
    instructions.push('Statusline is not configured — invoke the `statusline-setup` agent to configure it.');
  }

  // Branch sync: turn the passive warning line into an actionable offer (#2518).
  //
  // Restores a capability #2001 shipped and #2290 (1bdb451d) removed. It was
  // deleted silently because nothing asserted on the emitted text — the guard
  // in tests/hooks/startup-hook.test.js exists to make a second deletion fail
  // CI. Follows 06-runtime-triggers.md "offer, don't force": the hook never
  // mutates the working tree, it only instructs Claude to ask.
  const branchSync = checkResults.find((r) => r && r.name === 'branch-sync');
  const sync = branchSync?.parsed?.data;

  // Same contract as the block renderer above (#2687): report an
  // unverified fetch for every status that can be stale against an
  // upstream. `behind` is excluded here only because it already carries
  // the staleNote below -- adding a second caveat would duplicate it --
  // and `no-upstream` because it always carries fetched:false.
  if (sync && sync.fetched === false && sync.status
      && sync.status !== 'no-upstream' && sync.status !== 'behind') {
    instructions.push(
      `Branch sync could not be verified: the upstream fetch for \`${sync.branch}\` failed, so the reported status \`${sync.status}\` and its counts come from a cached remote-tracking ref. Report it as unverified rather than as a confirmed state — the branch may be behind without that showing here.`
    );
  }

  if (sync && sync.status === 'behind') {
    const conflicts = Array.isArray(sync.conflictingPaths) ? sync.conflictingPaths : [];

    if (conflicts.length > 0) {
      // A fast-forward would abort here, so there is nothing safe to offer.
      // Naming the paths is the actionable part; resolving them is the user's
      // call, and stashing or discarding on their behalf would destroy work.
      instructions.push(
        `Branch \`${sync.branch}\` is ${sync.behind} commit(s) behind its upstream, but these locally modified files also change in the incoming commits: ${conflicts.join(', ')}. Report this and make no update offer — a fast-forward would abort. Do not stash, discard, or revert the local changes; leave them for the user to resolve.`
      );
    } else {
      // `fetched: false` means the count came from a possibly stale
      // remote-tracking ref, so the true divergence may be larger. Still worth
      // offering — the pull is safe either way — but say so.
      const staleNote = sync.fetched === false
        ? ' (measured against a cached remote-tracking ref — the upstream fetch failed, so the real count may be higher)'
        : '';
      instructions.push(
        `Branch \`${sync.branch}\` is ${sync.behind} commit(s) behind its upstream${staleNote}. Offer to update from the remote: ask the user, and on acceptance run \`git pull --ff-only\` and report the result. Declining leaves the working tree untouched. If the pull fails, report the git error verbatim and continue the session — do not retry, and do not fall back to a non-fast-forward merge.`
      );
    }
  } else if (sync && sync.status === 'diverged') {
    // #2668 Option B: a NAVIGATION offer, not a strategy offer. Still narrower
    // than #2001, which offered rebase/merge/skip here.
    //
    // This answers #2518's two recorded objections rather than overriding them:
    //   1. sequencing/consent — naming where the divergence gets resolved is not
    //      a history rewrite, so the user is not committed to a strategy at the
    //      moment they know least about what diverged;
    //   2. non-assertability — the text is FIXED, so it is assertable per-state
    //      exactly like every other branch-sync state. "Either offer nothing or
    //      offer a choice" was the formulation that had no assertable outcome.
    //
    // No git command is named on purpose. The rebase that actually resolves this
    // belongs to `/done` Step 2, which has its own guard and runs when the user
    // is looking at the change — not at session start.
    const staleNote = sync.fetched === false
      ? ' (measured against a cached remote-tracking ref — the upstream fetch failed, so the real counts may be higher)'
      : '';
    instructions.push(
      `Branch \`${sync.branch}\` has diverged from its upstream (${sync.ahead} ahead, ${sync.behind} behind)${staleNote}. Report the divergence and make no offer to change history here — a fast-forward is impossible and picking a strategy at session start is out of scope. Point the user at the recovery path instead: run \`/done\` on the issue still in review, whose Step 2 sync guard resolves the divergence at the moment the change is in front of them, or push by hand. Do not run either for them.`
    );
  }
  // ahead / up-to-date / no-upstream / check absent → no instruction

  // Dependencies: offer `npm ci`, never run it (#2513).
  //
  // Same "offer, don't force" contract as the branch-sync offer above. `npm ci`
  // deletes node_modules wholesale, needs the network, and routinely takes
  // minutes against a ladder that starts warning at 15s — not something to
  // trigger from a session-start hook without asking.
  const dependency = checkResults.find((r) => r && r.name === 'dependency');
  const deps = dependency?.parsed?.data;

  if (deps && deps.state !== 'healthy') {
    // #2639: the scope was computed, returned, and in scope at this very line,
    // and none of the three detail strings used it. All were scope-free, so a
    // fix applied to one state would have looked complete.
    const root = deps.root || process.cwd();
    const where = `${dependencyScopeLabel(deps.scope)} \`${root}\``;

    const detail = {
      missing: `no packages are installed in ${where}`,
      partial: `${deps.missing?.length} of ${deps.total} declared packages are missing from ${where} (${(deps.missing || []).join(', ')})`,
      stale: `the lockfile in ${where} is newer than the installed tree`,
    }[deps.state];

    // Target the tree explicitly only when it is not the one an unqualified
    // `npm ci` would reach. The dev repo, where cwd IS the root, keeps the
    // original wording verbatim rather than gaining a redundant flag.
    let sameTree;
    try {
      sameTree = path.resolve(root) === path.resolve(process.cwd());
    } catch (_e) {
      sameTree = false;
    }
    const command = sameTree ? 'npm ci' : `npm ci --prefix "${root}"`;

    // Naming the downstream failure matters: without it the user hits a jest
    // error at the first acceptance criterion and reads it as a broken test
    // rather than as dependencies that were never installed.
    instructions.push(
      `Dependencies are not fully installed — ${detail}. Offer to run \`${command}\`: ask the user, and on acceptance run it and report the result. Declining leaves the tree untouched; note that test-running gates (\`/work\` Step 3 scoped runs and Step 4f's full sweep) will fail until it is installed. Do not run \`npm ci\` without asking.`
    );
  }

  // Task tools: offer the local override, never write it (#2593).
  //
  // Same "offer, don't force" contract as the two offers above. The asymmetry
  // worth noting is that this one's remedy is a WRITE to the user's own
  // dotfiles, which is why the write lives behind an explicit --enable
  // invocation of the check rather than anywhere in the hook: the hook that
  // detects a condition must not also be the thing that mutates it.
  const taskTools = checkResults.find((r) => r && r.name === 'task-tools');
  const tools = taskTools?.parsed?.data;

  if (tools && tools.state !== 'enabled-locally') {
    if (tools.settingsParse === 'malformed') {
      // Tolerating a malformed file for DETECTION and rewriting one are
      // different acts. Rewriting discards whatever the user was midway
      // through writing, so the safe move is to report and let them fix it.
      instructions.push(
        `The task-tool local override is not set, and \`~/.claude/settings.json\` exists but does not parse as JSON. Report that and make no offer to change it — rewriting a file in that state would discard whatever the user was midway through writing. Leave the file untouched.`
      );
    } else {
      // Phrasing constraint: never assert the tools are unavailable. The check
      // cannot know that — `remote-gate-only` means the remote flag may well be
      // on right now, and a confident wrong claim here is worse than no line.
      const stake = tools.state === 'remote-gate-only'
        ? 'Nothing local pins the task tools on: their availability rides a remote flag that can flip between sessions with no local change, and if it flips off, `/work` step tracking degrades to an inline checklist and the TaskList-based compaction-recovery guarantee stops holding'
        : 'Nothing local pins the task tools on, so `/work` step tracking may be degrading to an inline checklist and the TaskList-based compaction-recovery guarantee may not be holding';

      instructions.push(
        `${stake}. Offer to set the override: ask via \`AskUserQuestion\` with enabling recommended and leaving it off as the alternative, and on acceptance run \`node .claude/scripts/shared/task-tools-check.js --enable\` and report the result. Say plainly that the change takes effect on relaunch and does not repair the current session. Declining writes no file and records nothing durable — the offer recurs next session. Do not run the enable command without asking.`
      );
    }
  }

  // Charter pending instruction goes LAST so the user sees the full block first.
  if (info.charterStatus !== 'Active') {
    instructions.push('Charter is missing or template — invoke /charter as the FINAL action of startup, after displaying the Session Initialized block.');
  }

  if (instructions.length > 0) {
    parts.push('Post-startup actions (perform in order, AFTER displaying the block):');
    instructions.forEach((line, i) => parts.push(`${i + 1}. ${line}`));
  }

  // Specialist content goes last and is fenced by explicit BEGIN/END markers.
  // The markers are what let the model tell role instructions apart from the
  // surrounding hook directives — without them a specialist file's own
  // imperative prose reads as if the harness had issued it.
  if (injectingSpecialist) {
    const { name, content } = info.specialist;
    parts.push(
      '',
      `--- BEGIN DOMAIN SPECIALIST: ${name} ---`,
      content.trimEnd(),
      `--- END DOMAIN SPECIALIST: ${name} ---`
    );
  }

  return parts.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const cwd = process.cwd();
  const info = gatherSessionInfo(cwd);

  // Build the list of checks to run (skip upgrade-check if self-hosted)
  const checks = [];
  if (!info.selfHosted) {
    checks.push({ name: 'upgrade', script: '.claude/scripts/shared/upgrade-check.js' });
  }
  checks.push({ name: 'statusline', script: '.claude/scripts/shared/statusline-check.js' });
  checks.push({ name: 'config-integrity', script: '.claude/scripts/shared/config-integrity-check.js' });
  checks.push({ name: 'branch-sync', script: '.claude/scripts/shared/branch-sync-check.js' });
  checks.push({ name: 'dependency', script: '.claude/scripts/shared/dependency-check.js' });
  checks.push({ name: 'task-tools', script: '.claude/scripts/shared/task-tools-check.js' });
  // #2689: registered UNCONDITIONALLY, alongside dependency and task-tools —
  // deliberately NOT modelled on `peers` below. That one is gated because
  // discovery is a project decision (#2702); token privilege is not. A project
  // cannot opt out of needing the scopes its own .gh-pmu.json declares, and the
  // check derives its requirement from that file: a project without one
  // requires nothing and returns `verified` without spawning `gh` at all.
  checks.push({ name: 'gh-auth', script: '.claude/scripts/shared/gh-auth-check.js' });
  // #2702: discovery is a project decision. `false` means the check does not
  // run at all — not that it runs and its output is discarded — so no session
  // registry is read and nothing is scanned. renderBlock emits the
  // disabled-by-config Peers row in place of the result this would produce.
  if (info.crossSessionMessaging.discovery) {
    checks.push({ name: 'peers', script: '.claude/scripts/shared/peers-check.js' });
  }
  // #2903: drift is measured against the charter's testing declaration, so a
  // project without an active charter has nothing to drift from — gated on the
  // charter rather than registered unconditionally. The check never prompts and
  // never writes; its row names /charter refresh and nothing else.
  if (info.charterStatus === 'Active') {
    checks.push({ name: 'testing-drift', script: '.claude/scripts/shared/testing-drift-check.js' });
  }

  // Filter to existing scripts (graceful degradation)
  const validChecks = checks.filter((c) => fs.existsSync(path.join(cwd, c.script)));

  const checkResults = validChecks.length > 0 ? await runChecksParallel(validChecks) : [];

  // #2771: after the ladder resolves, before the block is rendered. After,
  // because the sweep must never delay a check or share their timeout budget;
  // before, because its outcome is a row in the block. Its own try/catch is
  // inside the helper — a failed sweep degrades to no row, never to a missing
  // Session Initialized block.
  info.trash = sweepStaleTempFiles(cwd, info);

  // Render block — colored for stderr, plain for additionalContext
  const coloredBlock = renderBlock(info, checkResults, { color: true });
  const plainBlock = renderBlock(info, checkResults, { color: false });

  // Emit to stderr (user-visible)
  process.stderr.write(coloredBlock + '\n');

  // Emit hookSpecificOutput to stdout (Claude's context)
  const additionalContext = buildAdditionalContext(info, plainBlock, checkResults);
  const hookOutput = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext,
    },
  };
  process.stdout.write(JSON.stringify(hookOutput) + '\n');
}

// Public API for testing
module.exports = {
  gatherSessionInfo,
  resolveSpecialist,
  isSafeSpecialistName,
  runChecksParallel,
  sweepStaleTempFiles,
  renderBlock,
  buildAdditionalContext,
  safeExec,
  ANSI,
  TIMEOUT_STAGES,
};

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(error(`startup-hook failed: ${err.message}\n`));
    // Still emit valid hookSpecificOutput so the harness gets a response
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `Session Initialized\n- Error: startup-hook failed: ${err.message}`,
      },
    }) + '\n');
    process.exit(0); // never block the session
  });
}
