// Rubrical Works (c) 2026
/**
 * @framework-script 0.123.0
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

/*
 * Kill tracking (#3876). A hook the harness stops at its `timeout` is killed,
 * and a killed process never fires `exit`, so the exit recorder alone wrote
 * nothing and the hook kept reading healthy. A hook installed with
 * `trackKills` writes a per-run marker `<hook>.<pid>.running` at start and
 * removes it on exit; a marker left behind by a process that is no longer
 * running is a run that never reached exit, and the next assessment records it
 * as a failure. Opt-in, because the marker is a write per run and a hook that
 * runs on every tool call (measure-tap.js) must keep writing only on a change.
 */
const MARKER_SUFFIX = '.running';
const KILLED_MESSAGE = 'killed or timed out';

function runMarkerPath(root, hookName, pid) {
  return path.join(heartbeatDir(root), `${hookName}.${pid}${MARKER_SUFFIX}`);
}

/** Write this run's marker. Returns its path, or null when it could not be written. */
function writeRunMarker(root, hookName, { pid = process.pid, now = new Date() } = {}) {
  try {
    if (!nonEmpty(root) || typeof hookName !== 'string' || !SAFE_NAME.test(hookName) || hookName.startsWith('.')) return null;
    fs.mkdirSync(heartbeatDir(root), { recursive: true });
    const file = runMarkerPath(root, hookName, pid);
    fs.writeFileSync(file, JSON.stringify({ hook: hookName, pid, startedAt: now.toISOString() }) + '\n');
    return file;
  } catch (_) {
    return null;
  }
}

/** The pids of every run marker this hook has in the heartbeat directory. */
function listRunMarkers(root, hookName) {
  let entries;
  try {
    entries = fs.readdirSync(heartbeatDir(root));
  } catch (_) {
    return [];
  }
  const prefix = `${hookName}.`;
  const found = [];
  for (const f of entries) {
    if (!f.startsWith(prefix) || !f.endsWith(MARKER_SUFFIX)) continue;
    const middle = f.slice(prefix.length, f.length - MARKER_SUFFIX.length);
    if (/^\d+$/.test(middle)) found.push({ pid: Number(middle), file: path.join(heartbeatDir(root), f) });
  }
  return found;
}

/** Signal 0 tests for existence; EPERM means it exists under another user. */
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return Boolean(e && e.code === 'EPERM');
  }
}

/*
 * The longest a hook run can legitimately last (#3886): the longest framework
 * hook timeout (worktree-create-hook.js, 600 s — also Claude Code's default
 * hook timeout) plus a 5-minute margin. A marker older than this is a killed
 * run even when its pid answers signal 0, because a killed hook's pid can be
 * reused by an unrelated live process — quickly, on Windows — and liveness
 * alone would then trust the marker forever.
 */
const MAX_RUN_MS = (600 + 300) * 1000;

/** When the marker's run started, in ms: its recorded `startedAt`, else the file's mtime, else null. */
function markerStartMs(file) {
  let startedAt = null;
  try { startedAt = JSON.parse(fs.readFileSync(file, 'utf8')).startedAt || null; } catch (_) { /* unreadable marker */ }
  const parsed = startedAt ? Date.parse(startedAt) : NaN;
  if (Number.isFinite(parsed)) return { startedAt, startMs: parsed };
  try { return { startedAt, startMs: fs.statSync(file).mtimeMs }; } catch (_) { return { startedAt, startMs: null }; }
}

/**
 * Record each marker whose process is gone — or which is older than any hook
 * may run (`MAX_RUN_MS`), whatever its pid answers — as a killed run, and
 * remove it. A recent marker whose process is still running is a run in
 * progress — never a failure, and left in place. The marker is unlinked before
 * the failure is recorded, so two sessions sweeping at once count it once:
 * only the one whose unlink succeeds records it.
 * @returns {number} killed runs recorded
 */
function sweepKilledRuns(root, hookName, { isAlive = pidAlive, now = new Date(), maxRunMs = MAX_RUN_MS } = {}) {
  let recorded = 0;
  for (const { pid, file } of listRunMarkers(root, hookName)) {
    const { startedAt, startMs } = markerStartMs(file);
    const expired = startMs !== null && now.getTime() - startMs > maxRunMs;
    if (!expired && isAlive(pid)) continue;
    try { fs.unlinkSync(file); } catch (_) { continue; }
    const detail = startedAt ? ` (pid ${pid}, started ${startedAt})` : ` (pid ${pid})`;
    const r = beat(hookName, { ok: false, error: `${KILLED_MESSAGE}${detail}` }, { root, now, pid });
    if (r.written) recorded += 1;
  }
  return recorded;
}

/**
 * Wire a hook to record its outcome when its process exits.
 *
 * Exit code 0 records success; any other exit records failure with the error
 * that caused it when one was thrown. `uncaughtExceptionMonitor` observes
 * without handling, so the hook's own failure behavior — exit code, stderr,
 * any handler it registers — is exactly what it was. A hook whose catch
 * swallows an error to fail open calls `fail(err)`, because its exit code
 * will be 0.
 *
 * `okCodes` (#2997) lets a hook declare exit codes that mean it did its job —
 * a PreToolUse hook that blocks by exiting 2 succeeded, and keying on 0 alone
 * would report it failing on every block. An uncaught exception is recorded as
 * a failure whatever the exit code.
 *
 * `trackKills` (#3876) writes a per-run marker at install, removed on exit, so
 * a run killed before exit — a hook timeout — is recorded by the next
 * `assessHooks()`. The marker is anchored to the root known at install; the
 * exit handler removes that same file whatever `setCwd` later supplies.
 *
 * @param {string} hookName
 * @param {{okCodes?: number[], trackKills?: boolean}} [opts]
 * @returns {{fail: (err: unknown) => void, setCwd: (cwd: string) => void}}
 */
function installHeartbeat(hookName, { proc = process, env = process.env, okCodes = [0], trackKills = false } = {}) {
  let failed = false;
  let inputCwd = null;
  let captured = null;
  let marker = null;
  const root = () => resolveProjectRoot({ env, cwd: inputCwd, fallback: proc.cwd() });

  try {
    if (trackKills) marker = writeRunMarker(root(), hookName, { pid: proc.pid });
    proc.on('uncaughtExceptionMonitor', (err) => { captured = err; });
    proc.on('exit', (code) => {
      if (marker) { try { fs.unlinkSync(marker); } catch (_) { /* already gone */ } }
      if (failed) return;
      const ok = Array.isArray(okCodes) && okCodes.includes(code) && !captured;
      if (ok) beat(hookName, { ok: true }, { root: root() });
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
 *
 * Before a hook's record is read, its run markers are swept (#3876): a marker
 * whose process is gone is recorded as a killed-or-timed-out failure. This is
 * the one write an assessment makes, and only when such a marker exists.
 */
function assessHooks({ root, hooksDir, hookFiles, loadCheck: check = loadCheck, isAlive = pidAlive, now = new Date() }) {
  const hooks = hookFiles.map((file) => {
    const name = path.basename(file, '.js');
    const load = check(path.join(hooksDir, file));
    sweepKilledRuns(root, name, { isAlive, now });
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
  runMarkerPath,
  writeRunMarker,
  listRunMarkers,
  pidAlive,
  sweepKilledRuns,
  MAX_RUN_MS,
  KILLED_MESSAGE,
  relativeRequires,
  loadCheck,
  hookFilesFromManifest,
  assessHooks,
  formatHealthRow,
};
