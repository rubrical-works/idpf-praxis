// Rubrical Works (c) 2026
/**
 * @framework-script 0.87.0
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

function safeExec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
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

  // Resolve domain specialist path (deterministic — Claude reads the file later)
  let specialistPath = null;
  if (domainSpecialist) {
    const basePath = path.join(cwd, frameworkPath, 'System-Instructions', 'Domain', 'Base', `${domainSpecialist}.md`);
    const packPath = path.join(cwd, frameworkPath, 'System-Instructions', 'Domain', 'Pack', `${domainSpecialist}.md`);
    if (fs.existsSync(basePath)) specialistPath = basePath;
    else if (fs.existsSync(packPath)) specialistPath = packPath;
  }

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
async function runChecksParallel(checks) {
  const startTs = Date.now();
  const pending = new Map(); // name → { promise, child, settled, result }

  for (const { name, script } of checks) {
    const handle = { settled: false, result: null, child: null };
    handle.promise = new Promise((resolve) => {
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
  const warningTimers = TIMEOUT_STAGES.map((ms, idx) => {
    const isFinal = idx === TIMEOUT_STAGES.length - 1;
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
      }
      // up-to-date / skipped → omit
    }
  }

  // Charter status
  if (info.charterStatus === 'Active') {
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

  // Check failures (other than config-integrity / branch-sync which are inline)
  const failedOther = checkResults.filter((r) =>
    r.status === 'error' && r.name !== 'config-integrity' && r.name !== 'branch-sync'
  );
  for (const r of failedOther) {
    lines.push(`- ${e(`⚠️ ${r.name}: ${r.error || `exit ${r.exitCode}`}`)}`);
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Build additionalContext (plain text + explicit instructions)
// ─────────────────────────────────────────────────────────────────────────────

function buildAdditionalContext(info, plainBlock) {
  // The block must be visible to the user. Claude Code does not auto-surface
  // hook stderr in the UI, so we instruct Claude to echo the block verbatim
  // as the FIRST action of the response. The content is fully deterministic
  // (the hook computed it); only the display step depends on Claude.
  const parts = [
    'DISPLAY THE FOLLOWING BLOCK VERBATIM AS YOUR FIRST RESPONSE — before any other action, commentary, or tool call. Render it as a code block for monospace alignment:',
    '',
    '```',
    plainBlock,
    '```',
    '',
  ];

  const instructions = [];

  if (info.charterStatus === 'Active') {
    instructions.push('Read CHARTER.md and provide a one-paragraph summary (vision + current focus) AFTER displaying the block above.');
  }

  if (info.specialistPath) {
    const rel = path.relative(process.cwd(), info.specialistPath).replace(/\\/g, '/');
    instructions.push(`Read \`${rel}\` to load the active domain specialist (${info.domainSpecialist}) into context.`);
  }

  // Charter pending instruction goes LAST so the user sees the full block first.
  if (info.charterStatus !== 'Active') {
    instructions.push('Charter is missing or template — invoke /charter as the FINAL action of startup, after displaying the Session Initialized block.');
  }

  if (instructions.length > 0) {
    parts.push('Post-startup actions (perform in order, AFTER displaying the block):');
    instructions.forEach((line, i) => parts.push(`${i + 1}. ${line}`));
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

  // Filter to existing scripts (graceful degradation)
  const validChecks = checks.filter((c) => fs.existsSync(path.join(cwd, c.script)));

  const checkResults = validChecks.length > 0 ? await runChecksParallel(validChecks) : [];

  // Render block — colored for stderr, plain for additionalContext
  const coloredBlock = renderBlock(info, checkResults, { color: true });
  const plainBlock = renderBlock(info, checkResults, { color: false });

  // Emit to stderr (user-visible)
  process.stderr.write(coloredBlock + '\n');

  // Emit hookSpecificOutput to stdout (Claude's context)
  const additionalContext = buildAdditionalContext(info, plainBlock);
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
  runChecksParallel,
  renderBlock,
  buildAdditionalContext,
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
