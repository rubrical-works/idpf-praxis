// Rubrical Works (c) 2026
/**
 * @framework-script 0.96.0
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
      // Template markers indicate unfilled placeholder
      const isTemplate = /\{\{[A-Z_]+\}\}/.test(content) || /TODO: Fill in/i.test(content);
      charterStatus = isTemplate ? 'Pending' : 'Active';
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
    specialist,
    specialistPath,
  };
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
      if (dep?.state === 'missing') {
        lines.push(`- Dependencies: ${e('⚠️ node_modules not installed — run npm ci')}`);
      } else if (dep?.state === 'partial') {
        lines.push(`- Dependencies: ${e(`⚠️ ${dep.missing.length} of ${dep.total} packages missing — run npm ci`)}`);
      } else if (dep?.state === 'stale') {
        lines.push(`- Dependencies: ${w('⚠️ node_modules stale vs lockfile')}`);
      } else if (r.error === 'timeout') {
        lines.push(`- Dependencies: ${e('⚠️ check timed out')}`);
      } else if (r.status === 'error') {
        lines.push(`- Dependencies: ${e(`⚠️ check failed to run (${r.error || `exit ${r.exitCode}`})`)}`);
      }
      // healthy → omit, matching branch-sync's up-to-date. Dependency health is
      // a transient condition, not an identity assertion like config-integrity,
      // and a ✅ line on every session is noise in the overwhelmingly common case.
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
  const INLINE_RENDERED = new Set(['config-integrity', 'branch-sync', 'dependency']);
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
  if (info.charterStatus === 'Active') {
    instructions.push('Read `CHARTER.md` and emit a concise prose summary of what this project is and its current focus. Note any mismatch you observe between the charter and current repository state.');
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
    // Deliberately narrower than #2001, which offered rebase/merge/skip here.
    // A history-rewrite prompt at session start commits the user before they
    // have seen the divergence. Reinstating that choice is a separate issue.
    instructions.push(
      `Branch \`${sync.branch}\` has diverged from its upstream (${sync.ahead} ahead, ${sync.behind} behind). Report the divergence and make no offer — a fast-forward is impossible, and choosing between rebase and merge is out of scope for session startup.`
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
    const detail = {
      missing: 'no packages are installed',
      partial: `${deps.missing?.length} of ${deps.total} declared packages are missing (${(deps.missing || []).join(', ')})`,
      stale: 'the lockfile is newer than the installed tree',
    }[deps.state];

    // Naming the downstream failure matters: without it the user hits a jest
    // error at the first acceptance criterion and reads it as a broken test
    // rather than as dependencies that were never installed.
    instructions.push(
      `Dependencies are not fully installed — ${detail}. Offer to run \`npm ci\`: ask the user, and on acceptance run it and report the result. Declining leaves the tree untouched; note that test-running gates (\`/work\` Step 3 scoped runs and Step 4f's full sweep) will fail until it is installed. Do not run \`npm ci\` without asking.`
    );
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

  // Filter to existing scripts (graceful degradation)
  const validChecks = checks.filter((c) => fs.existsSync(path.join(cwd, c.script)));

  const checkResults = validChecks.length > 0 ? await runChecksParallel(validChecks) : [];

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
