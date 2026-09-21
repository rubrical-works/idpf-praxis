// Rubrical Works (c) 2026
/**
 * @framework-script 0.105.0
 * @description Hook heartbeats (#2917): a per-hook, project-local health record of each framework hook's last success, last error and consecutive-failure count, the process-exit recorder hooks install, the load check the startup self-test runs, and the assessment the startup Hook Health row is rendered from.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * Why this exists: every framework hook fails open, and nothing reported when
 * one did, so a broken hook looked exactly like one that ran and found nothing
 * to do. The heartbeat makes the failure a recorded fact the startup hook can
 * surface.
 *
 * Location is the PROJECT root, never __dirname. In a deployed project
 * `.claude/hooks/` and `.claude/scripts/shared/` are junctions into the hub, so
 * a file anchored to this module's directory would be shared by every project
 * on that hub version — exactly how `crash.log` and `startup.log` behave.
 *
 * Contract, in the order it matters:
 *   1. Never throws. A heartbeat failure must not become a hook failure.
 *   2. One file per hook. An atomic rename stops a half-written file; it does
 *      not stop a lost update between two writers sharing one file, and hooks
 *      run concurrently across sessions in one working directory.
 *   3. Writes only on a state change — the first record, any failure, and the
 *      first success after a failure. measure-tap.js runs after every tool
 *      call; a write per success would be a disk write per call. So
 *      `lastSuccess` is the most recent transition to healthy, not the most
 *      recent run.
 *
 * Node built-ins only — deployed helpers may not require undeclared externals
 * (Reference/Deployment-Awareness.md § Runtime Dependency Contract).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DIR_PARTS = ['.claude', '.hook-health'];
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;
const MAX_MESSAGE = 300;
const LOAD_TIMEOUT_MS = 10000;

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * IDPF_HOOK_HEARTBEAT_ROOT, then CLAUDE_PROJECT_DIR, then the hook input's cwd,
 * then the process cwd.
 *
 * IDPF_HOOK_HEARTBEAT_ROOT exists for test runs. A suite that spawns a hook from
 * the repository root would otherwise record into the real heartbeat directory,
 * and a test that induces a failure would then surface as a real Hook Health
 * row. It redirects writes only; nothing sets it in normal use.
 */
function resolveProjectRoot({ env = process.env, cwd = null, fallback = process.cwd() } = {}) {
  return nonEmpty(env && env.IDPF_HOOK_HEARTBEAT_ROOT)
    || nonEmpty(env && env.CLAUDE_PROJECT_DIR)
    || nonEmpty(cwd)
    || fallback;
}

function heartbeatDir(root) {
  return path.join(root, ...DIR_PARTS);
}

function heartbeatPath(root, hookName) {
  return path.join(heartbeatDir(root), `${hookName}.json`);
}

/** `{status: 'absent'|'ok'|'malformed', record}` — absent and broken stay distinguishable. */
function readRecord(root, hookName) {
  let raw;
  try {
    raw = fs.readFileSync(heartbeatPath(root, hookName), 'utf8');
  } catch (_) {
    return { status: 'absent', record: null };
  }
  try {
    const record = JSON.parse(raw);
    if (!record || typeof record !== 'object') return { status: 'malformed', record: null };
    return { status: 'ok', record };
  } catch (_) {
    return { status: 'malformed', record: null };
  }
}

function messageOf(error) {
  let text;
  if (error instanceof Error) text = `${error.name}: ${error.message}`;
  else if (error === undefined || error === null) text = 'unknown error';
  else text = String(error);
  return text.split('\n')[0].slice(0, MAX_MESSAGE);
}

/**
 * Record one outcome for a hook. Returns `{written, reason}`; never throws.
 * @param {string} hookName - file basename without `.js`
 * @param {{ok: boolean, error?: unknown}} outcome
 * @param {{root?: string, now?: Date, pid?: number}} [opts]
 */
function beat(hookName, outcome = {}, opts = {}) {
  let tmp = null;
  try {
    if (typeof hookName !== 'string' || !SAFE_NAME.test(hookName) || hookName.startsWith('.')) {
      return { written: false, reason: 'invalid-hook-name' };
    }
    const root = nonEmpty(opts.root);
    if (!root) return { written: false, reason: 'no-root' };
    const now = (opts.now instanceof Date ? opts.now : new Date()).toISOString();
    const pid = Number.isInteger(opts.pid) ? opts.pid : process.pid;

    const prior = readRecord(root, hookName);
    const priorRecord = prior.status === 'ok' ? prior.record : null;
    let next;
    let reason;
    if (outcome.ok) {
      if (priorRecord && !(priorRecord.consecutiveFailures > 0)) return { written: false, reason: 'unchanged' };
      reason = priorRecord ? 'recovered' : 'first-record';
      next = {
        hook: hookName,
        lastSuccess: now,
        lastError: priorRecord ? priorRecord.lastError || null : null,
        consecutiveFailures: 0,
        lastPid: pid,
        updatedAt: now,
      };
    } else {
      reason = 'failure';
      next = {
        hook: hookName,
        lastSuccess: priorRecord ? priorRecord.lastSuccess || null : null,
        lastError: { message: messageOf(outcome.error), at: now },
        consecutiveFailures: ((priorRecord && priorRecord.consecutiveFailures) || 0) + 1,
        lastPid: pid,
        updatedAt: now,
      };
    }

    const file = heartbeatPath(root, hookName);
    fs.mkdirSync(heartbeatDir(root), { recursive: true });
    tmp = `${file}.${pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
    fs.renameSync(tmp, file);
    return { written: true, reason, record: next };
  } catch (e) {
    if (tmp) { try { fs.unlinkSync(tmp); } catch (_) { /* nothing to clean */ } }
    return { written: false, reason: 'write-failed', error: e && e.message };
  }
}

/**
 * Wire a hook to record its outcome when its process exits.
 *
 * Exit code 0 records success; any other exit records failure with the error
 * that caused it when one was thrown. `uncaughtExceptionMonitor` observes
 * without handling, so the hook's own failure behaviour — exit code, stderr,
 * any handler it registers — is exactly what it was. A hook whose catch
 * swallows an error to fail open calls `fail(err)`, because its exit code
 * will be 0.
 *
 * @param {string} hookName
 * @returns {{fail: (err: unknown) => void, setCwd: (cwd: string) => void}}
 */
function installHeartbeat(hookName, { proc = process, env = process.env } = {}) {
  let failed = false;
  let inputCwd = null;
  let captured = null;
  const root = () => resolveProjectRoot({ env, cwd: inputCwd, fallback: proc.cwd() });

  try {
    proc.on('uncaughtExceptionMonitor', (err) => { captured = err; });
    proc.on('exit', (code) => {
      if (failed) return;
      if (code === 0) beat(hookName, { ok: true }, { root: root() });
      else beat(hookName, { ok: false, error: captured || `exited with code ${code}` }, { root: root() });
    });
  } catch (_) { /* a heartbeat that cannot install records nothing; the hook is unaffected */ }

  return {
    fail(err) {
      failed = true;
      beat(hookName, { ok: false, error: err }, { root: root() });
    },
    setCwd(cwd) {
      if (nonEmpty(cwd)) inputCwd = cwd;
    },
  };
}

/** Relative module paths a source file requires. Built-ins and packages are not loaded. */
function relativeRequires(source) {
  const found = [];
  const pattern = /require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
  let m;
  while ((m = pattern.exec(String(source || ''))) !== null) {
    if (!found.includes(m[1])) found.push(m[1]);
  }
  return found;
}

function firstErrorLine(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.find((l) => /Error/.test(l)) || lines[0] || 'no output';
}

const DEP_LOADER = [
  'const deps = JSON.parse(process.argv[1]);',
  'for (const d of deps) {',
  '  try { require(d); } catch (e) {',
  "    process.stderr.write(d + ': ' + String(e).split('\\n')[0]);",
  '    process.exit(2);',
  '  }',
  '}',
  'process.exit(0);',
].join('\n');

/**
 * Can this hook load? `node --check` for syntax, then each relative dependency
 * required in a separate process. The hook itself is never executed — running
 * it would run its main() — so a failure inside the hook's own logic surfaces
 * through its heartbeat, not here.
 */
function loadCheck(hookFile, { timeoutMs = LOAD_TIMEOUT_MS } = {}) {
  let source;
  try {
    source = fs.readFileSync(hookFile, 'utf8');
  } catch (_) {
    return { ok: false, stage: 'file', reason: `hook file not found: ${hookFile}` };
  }

  const syntax = spawnSync(process.execPath, ['--check', hookFile], { encoding: 'utf8', timeout: timeoutMs });
  if (syntax.error || syntax.status !== 0) {
    return { ok: false, stage: 'syntax', reason: syntax.error ? syntax.error.message : firstErrorLine(syntax.stderr) };
  }

  const deps = relativeRequires(source).map((rel) => path.resolve(path.dirname(hookFile), rel));
  if (deps.length > 0) {
    const load = spawnSync(process.execPath, ['-e', DEP_LOADER, JSON.stringify(deps)], { encoding: 'utf8', timeout: timeoutMs });
    if (load.error || load.status !== 0) {
      return { ok: false, stage: 'dependency', reason: load.error ? load.error.message : firstErrorLine(load.stderr) };
    }
  }
  return { ok: true, stage: null, reason: null };
}

/** The `.js` entries of the manifest's deployed hook list; `null` when the list is absent. */
function hookFilesFromManifest(manifest) {
  const files = manifest && manifest.deploymentFiles && manifest.deploymentFiles.scripts
    && manifest.deploymentFiles.scripts.hooks && manifest.deploymentFiles.scripts.hooks.files;
  if (!Array.isArray(files)) return null;
  return files.filter((f) => typeof f === 'string' && f.endsWith('.js'));
}

/**
 * Classify each hook. Status precedence: unloadable, unreadable, no-record,
 * failing, healthy. A hook that has never beaten is `no-record` — never healthy.
 */
function assessHooks({ root, hooksDir, hookFiles, loadCheck: check = loadCheck }) {
  const hooks = hookFiles.map((file) => {
    const name = path.basename(file, '.js');
    const load = check(path.join(hooksDir, file));
    const rec = readRecord(root, name);
    let status;
    if (!load.ok) status = 'unloadable';
    else if (rec.status === 'malformed') status = 'unreadable';
    else if (rec.status === 'absent') status = 'no-record';
    else if (rec.record.consecutiveFailures > 0) status = 'failing';
    else status = 'healthy';
    return { name, status, load, record: rec.record };
  });
  const unhealthy = hooks.some((h) => ['unloadable', 'unreadable', 'failing'].includes(h.status));
  const noRecord = hooks.some((h) => h.status === 'no-record');
  const state = unhealthy ? 'unhealthy' : noRecord ? 'no-record-only' : 'healthy';
  return { state, hooks };
}

/**
 * The Hook Health row, or `null` for no row. No row when every hook is
 * healthy — and when the only non-healthy hooks have no record, because an
 * event-specific hook (clear, resume, compact, an unarmed measure tap) may
 * legitimately never have fired. When a row is emitted, no-record hooks are
 * listed as `no record`, never as healthy.
 */
function formatHealthRow(result) {
  if (!result) return null;
  if (result.state === 'undetermined') {
    return `⚠️ hook health could not be determined (${result.reason || 'unknown reason'}) — this is not an all-clear`;
  }
  if (result.state !== 'unhealthy') return null;
  const parts = [];
  for (const h of result.hooks) {
    if (h.status === 'unloadable') {
      parts.push(`${h.name}: fails load check (${h.load.stage}) — ${h.load.reason}`);
    } else if (h.status === 'failing') {
      const n = h.record.consecutiveFailures;
      const err = h.record.lastError || {};
      parts.push(`${h.name}: ${n} consecutive failure${n === 1 ? '' : 's'}, last error "${err.message}" at ${err.at}`);
    } else if (h.status === 'unreadable') {
      parts.push(`${h.name}: heartbeat record unreadable (.claude/.hook-health/${h.name}.json)`);
    }
  }
  const missing = result.hooks.filter((h) => h.status === 'no-record').map((h) => h.name);
  if (missing.length > 0) parts.push(`no record: ${missing.join(', ')}`);
  return `⚠️ ${parts.join('; ')}`;
}

module.exports = {
  resolveProjectRoot,
  heartbeatDir,
  heartbeatPath,
  readRecord,
  beat,
  installHeartbeat,
  relativeRequires,
  loadCheck,
  hookFilesFromManifest,
  assessHooks,
  formatHealthRow,
};
