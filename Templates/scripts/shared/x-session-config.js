// Rubrical Works (c) 2026
/**
 * @framework-script 0.100.0
 *
 * Mechanics for `/x-session-config` (#2702) — the project-level cross-session
 * messaging config editor.
 *
 * WHY A SCRIPT RATHER THAN SPEC PROSE. The command shipped twice as prose: once
 * as an interactive walk of seven prompts, once as a flag grammar the model
 * re-implemented on every invocation. Nothing in it needs judgment — argument
 * parsing, lever validation, conflict detection, applying booleans over a
 * resolved base, the write, and the output shape are all deterministic, and two
 * of the pieces (`resolveCrossSessionConfig`, `framework-config.js`) were
 * already JavaScript. Re-deriving the write each run is how the
 * `write(cwd, config)` / `validate(config, cwd)` argument reversal got hit
 * live; a script gets that right once and keeps it right.
 *
 * WHAT STAYS IN THE SPEC: the recorded decisions — groups rather than
 * per-event toggles, emission rather than delivery, the superseded interactive
 * walk, explicit-over-implied. A reader of this file will not find them in an
 * arguments table, and they are what stop the next reader re-deriving a
 * rejected design.
 *
 * THE LOAD-BEARING PROPERTY: a rejected invocation writes NOTHING. An error
 * that still mutated the config would be worse than no validation at all,
 * because a user reading "error" reasonably concludes the file was left alone.
 * Every rejection path returns before the write.
 *
 * Node built-ins and relative `shared/lib` requires only, per the runtime
 * dependency contract in `04-deployment-awareness.md` — this is symlinked into
 * user projects, where an undeclared external require is a MODULE_NOT_FOUND at
 * module load.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const cfgHelper = require('./lib/framework-config.js');
const { resolveCrossSessionConfig, formatEffectiveState } = require('./lib/cross-session-config.js');

/**
 * Every lever the flags accept, in display order.
 *
 * The last three address `groups.work` / `groups.push` / `groups.review` and
 * are named WITHOUT the prefix: there is no other `work` or `push` to confuse
 * them with, and `--off groups.push` is more to type and more to get wrong.
 */
const LEVERS = ['enabled', 'discovery', 'notices', 'upstreamMonitor', 'work', 'push', 'review'];

/** The three that live under `groups`. */
const GROUP_LEVERS = ['work', 'push', 'review'];

const TOP_LEVERS = LEVERS.filter((l) => !GROUP_LEVERS.includes(l));

/**
 * Parse `--on` / `--off`.
 *
 * Accepts both `--off push` and `--off=push`; the Windows shell guidance
 * prefers the `=` form for string flags, so the parser takes the form the
 * surrounding documentation recommends.
 *
 * @param {string[]} argv
 * @returns {{ok: boolean, on: string[], off: string[], errors: string[]}}
 */
function parseArgs(argv) {
  const out = { ok: true, mode: 'write', on: [], off: [], errors: [] };
  const list = Array.isArray(argv) ? argv : [];

  // `--help` short-circuits everything, INCLUDING lever validation. The most
  // likely reason to type it is not knowing the lever names, so
  // `--help --off nonsense` must print help rather than complain about
  // `nonsense`. It also wins over `--show` and over the mutation flags: someone
  // asking what the flags mean should not have the thing they were unsure
  // about performed as the answer.
  if (list.some((a) => String(a) === '--help' || String(a) === '-h')) {
    return { ok: true, mode: 'help', on: [], off: [], errors: [] };
  }

  const wantsShow = list.some((a) => String(a) === '--show');
  if (wantsShow) out.mode = 'show';

  const expand = (raw) => raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => (s === 'all' ? LEVERS.slice() : [s]));

  for (let i = 0; i < list.length; i++) {
    const arg = String(list[i]);
    let flag = null;
    let value = null;

    const eq = arg.indexOf('=');
    if (arg.startsWith('--') && eq !== -1) {
      flag = arg.slice(0, eq);
      value = arg.slice(eq + 1);
    } else if (arg === '--show') {
      continue; // already recorded as the mode
    } else if (arg === '--on' || arg === '--off') {
      flag = arg;
      // A following token that is itself a flag is NOT this flag's value:
      // `--off --on push` must be a valueless `--off`, not `--off "--on"`.
      const next = list[i + 1];
      if (next === undefined || String(next).startsWith('--')) {
        out.errors.push(`${arg} was given without a value.`);
        out.ok = false;
        continue;
      }
      value = String(next);
      i++;
    } else {
      // Unknown flags are rejected, never ignored: silently dropping
      // `--disable` would report success having changed nothing.
      out.errors.push(`Unknown argument: ${arg}. Valid flags are --on and --off.`);
      out.ok = false;
      continue;
    }

    if (flag !== '--on' && flag !== '--off') {
      out.errors.push(`Unknown argument: ${flag}. Valid flags are --on and --off.`);
      out.ok = false;
      continue;
    }
    if (value === '') {
      out.errors.push(`${flag} was given without a value.`);
      out.ok = false;
      continue;
    }

    const names = expand(value);
    if (names.length === 0) {
      out.errors.push(`${flag} was given without a value.`);
      out.ok = false;
      continue;
    }
    for (const n of names) {
      if (!LEVERS.includes(n)) {
        // Deliberately not fuzzy-matched. A near-miss that silently configures
        // the wrong lever is worse than an error.
        out.errors.push(`Unknown lever: ${n}. Valid levers are ${LEVERS.join(', ')}.`);
        out.ok = false;
        continue;
      }
      const bucket = flag === '--on' ? out.on : out.off;
      if (!bucket.includes(n)) bucket.push(n);
    }
  }

  for (const n of out.on) {
    if (out.off.includes(n)) {
      out.errors.push(`Lever '${n}' was named in both --on and --off.`);
      out.ok = false;
    }
  }

  // `--show` and the mutation flags are opposite intents. Silently honouring
  // one would produce output that looks like a write but was not — exactly the
  // ambiguity the rest of this command's error handling exists to prevent — so
  // the combination is refused and the message names both halves.
  if (wantsShow && (out.on.length > 0 || out.off.length > 0)) {
    out.errors.push(
      '--show cannot be combined with --on or --off: --show reports the current '
      + 'state without writing, while --on/--off change it. Run them separately.'
    );
    out.ok = false;
  }

  return out;
}

/**
 * Usage text for `--help`.
 *
 * Built from LEVERS rather than hand-listed, so a lever added to the constant
 * cannot go undocumented — a help text that omits a real flag is worse than
 * none, since it reads as authoritative.
 */
function helpText() {
  return [
    '/x-session-config — configure cross-session peer messaging for this project.',
    '',
    'Usage:',
    '  x-session-config                    write the resolved object, then show it',
    '  x-session-config --off <levers>     turn levers off, then write and show',
    '  x-session-config --on  <levers>     turn levers on, then write and show',
    '  x-session-config --show             show the resolved state, WRITE NOTHING',
    '  x-session-config --help             this text, WRITE NOTHING',
    '',
    `Levers: ${LEVERS.join(', ')}`,
    '  Comma-separated, or the literal `all`. The last three address',
    '  groups.work / groups.push / groups.review.',
    '',
    'Notes:',
    '  Every invocation except --show and --help writes the complete',
    '  seven-lever object, a bare invocation included, so the first run in an',
    '  unconfigured project produces a diff and is idempotent thereafter.',
    '  --show cannot be combined with --on or --off.',
    '  An absent object resolves to fully enabled at every level.',
    '',
    'Examples:',
    '  x-session-config --off push',
    '  x-session-config --off work,review',
    '  x-session-config --on all',
  ].join('\n');
}

/** Read the seven-lever shape out of a resolved state, dropping derived fields. */
function toObject(state) {
  return {
    enabled: state.enabled,
    discovery: state.discovery,
    notices: state.notices,
    upstreamMonitor: state.upstreamMonitor,
    groups: {
      work: state.groups.work,
      push: state.groups.push,
      review: state.groups.review,
    },
  };
}

/** Flat lever view of the seven-lever object, for change detection. */
function flatten(obj) {
  const flat = {};
  for (const l of TOP_LEVERS) flat[l] = obj[l];
  for (const l of GROUP_LEVERS) flat[l] = obj.groups[l];
  return flat;
}

/**
 * Apply `--on` / `--off` over a seven-lever object.
 *
 * `--off` first, then `--on`. The order is immaterial in practice because a
 * lever named in both is rejected at parse time, but fixing it keeps the
 * behaviour defined rather than incidental.
 */
function applyLevers(object, { on = [], off = [] } = {}) {
  const next = { ...object, groups: { ...object.groups } };
  const set = (lever, value) => {
    if (GROUP_LEVERS.includes(lever)) next.groups[lever] = value;
    else next[lever] = value;
  };
  for (const l of off) set(l, false);
  for (const l of on) set(l, true);
  return next;
}

/**
 * Parse, apply, write, and report.
 *
 * @param {{cwd?: string, argv?: string[]}} [opts]
 * @returns {{ok: boolean, changed: string[], object: object|null,
 *            summary: string, implications: string[], errors: string[]}}
 *
 * Never throws. Every failure path returns `ok: false` with the config
 * untouched.
 */
function run({ cwd = process.cwd(), argv = [] } = {}) {
  const fail = (errors) => ({
    ok: false, changed: [], object: null, summary: '', implications: [], errors,
  });

  const parsed = parseArgs(argv);
  if (!parsed.ok) return fail(parsed.errors);

  // Usage is not project state. Refusing to explain the flags because the
  // project is unconfigured would withhold the text exactly when it is most
  // needed, so this returns before the config is even looked for.
  if (parsed.mode === 'help') {
    return {
      ok: true, changed: [], object: null, summary: '', implications: [],
      errors: [], help: helpText(),
    };
  }

  const configPath = path.join(cwd, 'framework-config.json');
  if (!fs.existsSync(configPath)) {
    // Reported, never created: this command owns one key, not the file.
    return fail([`No framework-config.json at ${cwd}.`]);
  }

  let config;
  try {
    config = cfgHelper.read(cwd);
  } catch (err) {
    return fail([`framework-config.json could not be read: ${err.message}`]);
  }
  if (config === null || typeof config !== 'object') {
    return fail(['framework-config.json did not parse as an object.']);
  }

  // Base is the RESOLVED state, not the file's literal contents, so a partial
  // hand-written object is completed rather than discarded.
  const before = toObject(resolveCrossSessionConfig(config));

  // `--show` returns here, BEFORE any write. It reports exactly what a bare
  // invocation would have written, which is what makes it a preview rather
  // than a second opinion — and it must not materialise the object on an
  // absent key, the case a byte-comparison against an already-written file
  // would miss.
  if (parsed.mode === 'show') {
    const shown = resolveCrossSessionConfig(config);
    return {
      ok: true,
      changed: [],
      object: toObject(shown),
      summary: formatEffectiveState(shown),
      implications: shown.implications,
      errors: [],
    };
  }

  const after = applyLevers(before, parsed);

  const beforeFlat = flatten(before);
  const afterFlat = flatten(after);
  const changed = LEVERS.filter((l) => beforeFlat[l] !== afterFlat[l]);

  const next = { ...config, crossSessionMessaging: after };

  try {
    // write() validates against the schema first and throws rather than
    // writing on failure. Note the argument order: write(cwd, config), the
    // REVERSE of validate(config, cwd).
    cfgHelper.write(cwd, next);
  } catch (err) {
    return fail([`Write refused: ${err.message}`]);
  }

  // Read back from disk rather than reporting what was computed. With an
  // unconditional write the two cannot disagree, and reading back is what
  // makes that structural instead of asserted.
  let state;
  try {
    cfgHelper._resetCache();
    state = resolveCrossSessionConfig(cfgHelper.read(cwd));
  } catch {
    state = resolveCrossSessionConfig(next);
  }

  return {
    ok: true,
    changed,
    object: toObject(state),
    summary: formatEffectiveState(state),
    implications: state.implications,
    errors: [],
  };
}

module.exports = { LEVERS, GROUP_LEVERS, parseArgs, applyLevers, toObject, helpText, run };

if (require.main === module) {
  const envelope = run({ cwd: process.cwd(), argv: process.argv.slice(2) });
  // --help prints the text itself. Wrapping usage in a JSON envelope would
  // make the one mode written for a human to read the hardest one to read.
  if (envelope.help) process.stdout.write(envelope.help + '\n');
  else process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
  process.exit(envelope.ok ? 0 : 1);
}
