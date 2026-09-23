#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.106.0
 *
 * `/overwatch` per-project configuration (#2957): the resolver for
 * `.claude/.overwatch/config.json`, and the mechanics of `/overwatch --on`,
 * `--off` and `--show`.
 *
 * ONE RESOLVER. The file is read through `resolveOverwatchConfig()` and nowhere
 * else, the way `resolveCrossSessionConfig()` is the only reader of
 * `.claude/x-session.json`. An absent file or key resolves to the schema
 * default, which is the behavior before the file existed. A command-line flag
 * overrides the file. A schema-invalid file is REJECTED as a whole and reported:
 * half-reading it would apply the keys that happened to parse and silently drop
 * the rest.
 *
 * KEYS COME FROM THE SCHEMA. The toggleable keys are the `properties` of
 * `.claude/metadata/overwatch-config.schema.json`, so adding a key there makes
 * it toggleable with no spec edit, and a hand-kept list cannot drift from it.
 *
 * A CONFIG INVOCATION IS NOT A MONITOR. `--on`, `--off` and `--show` write or
 * report, then stop. They never touch the presence marker. `--show` would
 * otherwise take the monitor slot, and `--on` on win32 would need `--force`.
 * `startLoop` in the output is what the command spec branches on. Mixing
 * a config flag with a loop flag (`--auto-create`, `--force`) is rejected by
 * name, because one invocation cannot both configure and run.
 *
 * A REJECTED INVOCATION WRITES NOTHING, the same load-bearing property as
 * `x-session-config.js`: every rejection returns before the write.
 *
 * Node built-ins, relative `shared/lib` requires and the declared `ajv` only,
 * per the runtime dependency contract in `04-deployment-awareness.md`.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { readPresence, MARKER_DIR, MARKER_PATH } = require('./lib/overwatch-presence.js');

/** Repo-relative, POSIX. Lives beside the marker in `/overwatch`'s own directory. */
const CONFIG_PATH = `${MARKER_DIR}/config.json`;

const SCHEMA_FILE = path.join(__dirname, '..', '..', 'metadata', 'overwatch-config.schema.json');

/** The loop flags. Their presence makes an invocation a monitor run. */
const LOOP_FLAGS = { '--auto-create': 'autoCreate', '--force': 'force' };

let schemaCache = null;
function loadSchema() {
  if (!schemaCache) schemaCache = JSON.parse(fs.readFileSync(SCHEMA_FILE, 'utf8'));
  return schemaCache;
}

/** @returns {string[]} the toggleable keys, from the schema's properties. */
function configKeys() {
  return Object.keys(loadSchema().properties || {});
}

/** @returns {object} each key's schema default. */
function defaults() {
  const props = loadSchema().properties || {};
  const out = {};
  for (const k of Object.keys(props)) out[k] = props[k].default;
  return out;
}

let validator = null;
function validate(value) {
  if (!validator) {
    const Ajv = require('ajv');
    validator = new Ajv({ allErrors: true, strict: false }).compile(loadSchema());
  }
  const ok = validator(value);
  return { ok, errors: ok ? [] : validator.errors.map((e) => `${e.instancePath || '(root)'} ${e.message}`) };
}

const configFile = (cwd) => path.join(cwd, ...CONFIG_PATH.split('/'));

/**
 * Read the file as it is on disk.
 * @returns {{exists: boolean, ok: boolean, config: object|null, errors: string[]}}
 */
function readConfig(cwd) {
  let raw;
  try {
    raw = fs.readFileSync(configFile(cwd), 'utf8');
  } catch {
    return { exists: false, ok: true, config: null, errors: [] };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { exists: true, ok: false, config: null, errors: [`${CONFIG_PATH} is not valid JSON: ${err.message}`] };
  }
  const v = validate(parsed);
  if (!v.ok) {
    return { exists: true, ok: false, config: null, errors: v.errors.map((e) => `${CONFIG_PATH}: ${e}`) };
  }
  return { exists: true, ok: true, config: parsed, errors: [] };
}

/**
 * The single resolver. Precedence: flag > file > schema default.
 *
 * @param {string} cwd project root
 * @param {{flags?: object}} [options] flags given on this invocation, keyed by config key
 * @returns {{ok: boolean, values: object, sources: object, fileExists: boolean, errors: string[]}}
 */
function resolveOverwatchConfig(cwd, options) {
  const root = typeof cwd === 'string' && cwd ? cwd : process.cwd();
  const flags = (options && options.flags) || {};
  const file = readConfig(root);
  const base = defaults();
  const values = {};
  const sources = {};
  for (const key of configKeys()) {
    if (flags[key] !== undefined) {
      values[key] = flags[key];
      sources[key] = 'flag';
    } else if (file.ok && file.config && file.config[key] !== undefined) {
      values[key] = file.config[key];
      sources[key] = 'file';
    } else {
      values[key] = base[key];
      sources[key] = 'default';
    }
  }
  return { ok: file.ok, values, sources, fileExists: file.exists, errors: file.errors };
}

/**
 * Parse an `/overwatch` argument list.
 *
 * @param {string[]} argv
 * @returns {{ok: boolean, mode: 'loop'|'config'|'show', on: string[], off: string[],
 *            loopFlags: {autoCreate: boolean, force: boolean}, errors: string[]}}
 */
function parseArgs(argv) {
  const list = (Array.isArray(argv) ? argv : []).map(String);
  const out = { ok: true, mode: 'loop', on: [], off: [], loopFlags: { autoCreate: false, force: false }, errors: [] };
  const keys = configKeys();
  const expand = (raw) => raw.split(',').map((s) => s.trim()).filter(Boolean)
    .flatMap((s) => (s === 'all' ? keys.slice() : [s]));
  let show = false;
  const loopSeen = [];

  for (let i = 0; i < list.length; i++) {
    const arg = list[i];
    const eq = arg.indexOf('=');
    const flag = arg.startsWith('--') && eq !== -1 ? arg.slice(0, eq) : arg;
    if (flag === '--show' && eq === -1) {
      show = true;
    } else if (LOOP_FLAGS[flag] && eq === -1) {
      out.loopFlags[LOOP_FLAGS[flag]] = true;
      loopSeen.push(flag);
    } else if (flag === '--on' || flag === '--off') {
      let value = eq !== -1 ? arg.slice(eq + 1) : list[i + 1];
      if (eq === -1) {
        if (value === undefined || value.startsWith('--')) {
          out.errors.push(`${flag} was given without a value.`);
          continue;
        }
        i++;
      }
      const bucket = flag === '--on' ? out.on : out.off;
      for (const k of expand(value)) if (!bucket.includes(k)) bucket.push(k);
    } else {
      out.errors.push(`Unknown argument: ${arg}. /overwatch accepts --auto-create, --force, --on <keys>, --off <keys> and --show.`);
    }
  }

  const unknown = [...out.on, ...out.off].filter((k) => !keys.includes(k));
  for (const k of [...new Set(unknown)]) {
    out.errors.push(`Unknown config key: ${k}. Known keys (from overwatch-config.schema.json): ${keys.join(', ')}, or all.`);
  }
  for (const k of out.on.filter((key) => out.off.includes(key))) {
    out.errors.push(`${k} is named in both --on and --off.`);
  }

  const toggling = out.on.length > 0 || out.off.length > 0;
  if (show && toggling) {
    out.errors.push('--show cannot be combined with --on/--off: it would report a state the write was about to change.');
  }
  if ((show || toggling) && loopSeen.length > 0) {
    const cfgFlag = show ? '--show' : (out.on.length ? '--on' : '--off');
    for (const f of loopSeen) {
      out.errors.push(`${f} cannot be combined with ${cfgFlag}: a config invocation does not start the monitor.`);
    }
  }

  out.mode = show ? 'show' : (toggling ? 'config' : 'loop');
  out.ok = out.errors.length === 0;
  return out;
}

/**
 * Apply toggles over what is on disk and write the result. The caller has
 * already rejected invalid invocations; this still validates before writing.
 */
function applyToggles(cwd, { on, off }) {
  const current = readConfig(cwd);
  if (!current.ok) return { ok: false, errors: current.errors, config: null };
  const next = Object.assign({}, current.config || {});
  for (const k of on) next[k] = true;
  for (const k of off) next[k] = false;
  const v = validate(next);
  if (!v.ok) return { ok: false, errors: v.errors, config: null };
  fs.mkdirSync(path.dirname(configFile(cwd)), { recursive: true });
  fs.writeFileSync(configFile(cwd), JSON.stringify(next, null, 2) + '\n');
  return { ok: true, errors: [], config: next };
}

/**
 * CLI. Prints one JSON object. `startLoop` is true only for a valid loop
 * invocation; the command spec starts the monitor on nothing else.
 *
 * @param {string[]} argv
 * @param {{cwd?: string, write?: (s: string) => void}} [io]
 * @returns {number} exit code: 0 ok, 1 rejected
 */
function run(argv, io) {
  const cwd = (io && io.cwd) || process.cwd();
  const write = (io && io.write) || ((s) => process.stdout.write(s + '\n'));
  const emit = (obj, code) => { write(JSON.stringify(obj, null, 2)); return code; };

  const p = parseArgs(argv);
  if (!p.ok) {
    return emit({ ok: false, mode: p.mode, startLoop: false, errors: p.errors, written: false }, 1);
  }

  if (p.mode === 'config') {
    const r = applyToggles(cwd, p);
    if (!r.ok) return emit({ ok: false, mode: 'config', startLoop: false, errors: r.errors, written: false }, 1);
    return emit({ ok: true, mode: 'config', startLoop: false, written: true, path: CONFIG_PATH, config: r.config }, 0);
  }

  const resolved = resolveOverwatchConfig(cwd, {
    flags: p.mode === 'loop' && p.loopFlags.autoCreate ? { autoCreate: true } : {},
  });

  if (p.mode === 'show') {
    const presence = readPresence(cwd);
    return emit({
      ok: resolved.ok,
      mode: 'show',
      startLoop: false,
      written: false,
      path: CONFIG_PATH,
      fileExists: resolved.fileExists,
      keys: configKeys().map((key) => ({ key, value: resolved.values[key], source: resolved.sources[key] })),
      marker: {
        path: MARKER_PATH,
        answeredBy: presence.markerFile,
        reason: presence.reason,
        active: presence.active,
        pid: presence.pid,
      },
      errors: resolved.errors,
    }, 0);
  }

  return emit({
    ok: resolved.ok,
    mode: 'loop',
    startLoop: true,
    autoCreate: resolved.values.autoCreate,
    autoCreateSource: resolved.sources.autoCreate,
    force: p.loopFlags.force,
    errors: resolved.errors,
  }, 0);
}

if (require.main === module) {
  process.exitCode = run(process.argv.slice(2));
}

module.exports = {
  CONFIG_PATH,
  configKeys,
  defaults,
  readConfig,
  resolveOverwatchConfig,
  parseArgs,
  applyToggles,
  run,
};
