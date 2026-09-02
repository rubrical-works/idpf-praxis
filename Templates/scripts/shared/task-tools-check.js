#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.100.2
 * @description Detect whether the Claude Code task tools (TaskCreate/TaskGet/TaskList/TaskUpdate) are locally enabled at session startup. Reads CLAUDE_CODE_ENABLE_TODO_TOOLS from process env and from the user and project settings tiers, and notes whether the gate cache mentions the remote flag. Detection is read-only; the only write path is the explicit --enable invocation.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * The local override. Note it is NOT `CLAUDE_CODE_ENABLE_TASKS`, which gates a
 * different predicate that already defaults on — setting that one changes
 * nothing here, and four sessions were spent on it before the gate was decoded.
 */
const ENV_VAR = 'CLAUDE_CODE_ENABLE_TODO_TOOLS';

/**
 * The remote rollout flag the host consults, default false. Named here only so
 * its presence in the gate cache can be reported; nothing in this file reads or
 * attempts to influence its value.
 */
const GATE_FLAG = 'tengu_rosy_wren';

/**
 * Pinned reason vocabulary. The state is deliberately coarse (three values a
 * status row can render); the reason is what a caller branches on when it needs
 * to know WHY. Callers compare against these constants, never against prose.
 */
const REASONS = Object.freeze({
  PROCESS_ENV: 'local-override-process-env',
  USER_SETTINGS: 'local-override-user-settings',
  PROJECT_SETTINGS: 'local-override-project-settings',
  GATE_CACHED: 'no-local-override-gate-cached',
  GATE_UNREADABLE: 'no-local-override-gate-unreadable',
  NO_SIGNAL: 'no-local-override-no-gate-signal',
});

// ─── Helpers ───

/**
 * Read + parse JSON, distinguishing "not there" from "there but broken".
 * The caller needs that difference: an absent settings file is the normal
 * case and is safe to create, a malformed one is a file we must not clobber.
 */
function readJsonFile(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (_e) {
    return { status: 'absent', value: null, error: null };
  }
  try {
    return { status: 'ok', value: JSON.parse(raw), error: null };
  } catch (e) {
    return { status: 'malformed', value: null, error: e.message };
  }
}

/**
 * Settings files carry env values as strings, and a user may reasonably write
 * `true`, `"true"`, or `"1"`. An explicit `false` is a deliberate opt-out and
 * must not read as enablement — hence a truthy allowlist rather than a
 * presence check.
 */
function isEnabledValue(value) {
  if (value === true) return true;
  if (typeof value !== 'string') return false;
  return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function overrideIn(settingsValue) {
  if (!settingsValue || typeof settingsValue !== 'object') return false;
  const env = settingsValue.env;
  if (!env || typeof env !== 'object') return false;
  return isEnabledValue(env[ENV_VAR]);
}

/**
 * Recursive key search rather than a fixed path lookup.
 *
 * ~/.claude.json is an undocumented Claude Code internal whose shape can change
 * with any release. Only the flag's PRESENCE is load-bearing here, so keying on
 * a nested path would turn a harmless reshuffle into a wrong answer. Depth is
 * bounded because a cache that deep is already a shape we do not understand.
 */
function containsKey(node, key, depth = 0) {
  if (depth > 12 || node === null || typeof node !== 'object') return false;
  if (!Array.isArray(node) && Object.prototype.hasOwnProperty.call(node, key)) return true;
  for (const child of Object.values(node)) {
    if (containsKey(child, key, depth + 1)) return true;
  }
  return false;
}

function userSettingsPath(homeDir) {
  return path.join(homeDir, '.claude', 'settings.json');
}

// ─── Detection ───

/**
 * Report on the enabling CONDITION, not on the tools themselves.
 *
 * A Node process cannot introspect Claude Code's live session tool registry —
 * there is no API for it, and this is not the process holding the registry.
 * What is observable is the override and the gate cache, so that is what is
 * reported, and the vocabulary is chosen so no return value overclaims:
 * `remote-gate-only` says availability depends on a flag this check cannot read
 * authoritatively, NOT that the tools are missing.
 *
 * Read-only by construction. The only write path in this file is enableLocally().
 */
function checkTaskTools(options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const projectDir = options.projectDir || process.cwd();
  const env = options.env || process.env;

  const settingsFile = userSettingsPath(homeDir);
  const userSettings = readJsonFile(settingsFile);

  // Project tier: `.local` is the higher-precedence override of the pair, but
  // for a presence question either one enabling is enough.
  const projectSettings = readJsonFile(path.join(projectDir, '.claude', 'settings.json'));
  const projectLocal = readJsonFile(path.join(projectDir, '.claude', 'settings.local.json'));

  const signals = {
    processEnv: isEnabledValue(env[ENV_VAR]),
    userSettings: overrideIn(userSettings.value),
    projectSettings: overrideIn(projectSettings.value) || overrideIn(projectLocal.value),
    gateCache: null,
  };

  const base = {
    settingsPath: settingsFile,
    settingsParse: userSettings.status,
    settingsError: userSettings.error,
    signals,
  };

  // Ordered by precedence, so the reason names the source that actually decided
  // it rather than the first one that happened to be true.
  if (signals.processEnv) {
    return { ...base, state: 'enabled-locally', reason: REASONS.PROCESS_ENV };
  }
  if (signals.userSettings) {
    return { ...base, state: 'enabled-locally', reason: REASONS.USER_SETTINGS };
  }
  if (signals.projectSettings) {
    return { ...base, state: 'enabled-locally', reason: REASONS.PROJECT_SETTINGS };
  }

  const gateCache = readJsonFile(path.join(homeDir, '.claude.json'));

  if (gateCache.status === 'malformed') {
    // Unreadable is not evidence of absence, but it is not evidence of presence
    // either. Report the weaker state and let the reason carry the nuance —
    // both non-enabled states resolve to the same remedy anyway.
    signals.gateCache = null;
    return { ...base, signals, state: 'disabled', reason: REASONS.GATE_UNREADABLE };
  }

  signals.gateCache = gateCache.status === 'ok' && containsKey(gateCache.value, GATE_FLAG);

  return signals.gateCache
    ? { ...base, signals, state: 'remote-gate-only', reason: REASONS.GATE_CACHED }
    : { ...base, signals, state: 'disabled', reason: REASONS.NO_SIGNAL };
}

// ─── Write path (explicit --enable only) ───

/**
 * Add the override to the user-tier settings file.
 *
 * User tier is the only target: it survives a relaunch and is not owned by
 * Praxis Hub Manager, so writing it cannot be clobbered by a hub update or land
 * in a project repo. Reached only from an explicit `--enable` invocation —
 * never from detection, and never from the hook, which offers and does not act.
 *
 * A malformed file is refused, not repaired. Tolerating one for DETECTION and
 * rewriting one are different acts: the second discards whatever the user was
 * midway through writing, and the safe move is to report and let them fix it.
 */
function enableLocally(options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const file = userSettingsPath(homeDir);
  const existing = readJsonFile(file);

  if (existing.status === 'malformed') {
    return {
      ok: false,
      changed: false,
      path: file,
      error: `${file} exists but does not parse as JSON: ${existing.error}`,
    };
  }

  const settings = existing.status === 'ok' && existing.value && typeof existing.value === 'object'
    ? existing.value
    : {};

  if (isEnabledValue((settings.env || {})[ENV_VAR])) {
    // Already set. Returning without writing keeps the operation genuinely
    // idempotent — a rewrite would reformat the user's file and show up as a
    // diff in their dotfiles for no change in behavior.
    return { ok: true, changed: false, path: file, error: null };
  }

  const updated = { ...settings, env: { ...settings.env, [ENV_VAR]: 'true' } };

  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(updated, null, 2)}\n`);
  } catch (e) {
    return { ok: false, changed: false, path: file, error: e.message };
  }

  return { ok: true, changed: true, path: file, error: null };
}

// ─── Main ───

const REMEDY = `add ${ENV_VAR}=true to ~/.claude/settings.json env, then relaunch`;

const MESSAGES = {
  'enabled-locally': () => 'Task tools enabled locally.',
  'remote-gate-only': () => `Not enabled locally — availability rides a remote flag; to pin it on, ${REMEDY}.`,
  disabled: () => `Not enabled locally — to enable, ${REMEDY}.`,
};

if (require.main === module) {
  if (process.argv.includes('--enable')) {
    const result = enableLocally();
    if (!result.ok) {
      // stderr + non-zero exit: this is the one path in the file that can fail
      // in a way the caller must not treat as "enabled".
      process.stderr.write(`${result.error}\n`);
      process.stdout.write(JSON.stringify({ success: false, data: result }) + '\n');
      process.exit(1);
    }
    process.stdout.write(JSON.stringify({
      success: true,
      message: result.changed
        ? `Enabled ${ENV_VAR} in ${result.path} — takes effect on relaunch.`
        : `${ENV_VAR} was already enabled in ${result.path}.`,
      data: result,
    }) + '\n');
  } else {
    const result = checkTaskTools();
    process.stdout.write(JSON.stringify({
      success: true,
      message: MESSAGES[result.state](result),
      data: result,
    }) + '\n');
  }
}

module.exports = {
  checkTaskTools,
  enableLocally,
  userSettingsPath,
  MESSAGES,
  REASONS,
  REMEDY,
  ENV_VAR,
  GATE_FLAG,
};
