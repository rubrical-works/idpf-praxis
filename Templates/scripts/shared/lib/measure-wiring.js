// Rubrical Works (c) 2026
/**
 * @framework-script 0.102.0
 * measure-wiring.js
 *
 * Self-wiring for `/idpf-measure` (#2794): registers the PostToolUse tap on
 * `--start` and removes it on `--stop`.
 *
 * ## Why self-wiring at all
 *
 * A permanently-registered tap would spawn a Node process on every tool call in
 * every session forever, whether or not anyone was measuring — roughly 95ms a
 * call, and worse downstream where nobody asked for it. A marker check inside
 * the hook does not help: the spawn IS the cost and it happens before the
 * hook's code runs. So the hook must not be registered unless collection is
 * armed, which makes wiring the one mutation this command performs outside its
 * own gitignored files, and the one whose failure is silent.
 *
 * ## Why settings.local.json
 *
 * `settings.json` is git-tracked in every PHM-bootstrapped project inspected
 * for AC3, so wiring there would commit a measurement hook into everyone's
 * checkout. `settings.local.json` is the personal counterpart — but the same
 * spike found it ABSENT in all three of those projects and git-TRACKED in this
 * one. Both states are handled: `--start` creates the file where it is missing
 * and modifies it where it exists, and `--stop` correspondingly deletes what it
 * created or restores byte-for-byte what it modified.
 *
 * ## Restore fidelity
 *
 * `unwire` prefers the raw text captured at wire time over re-serialising the
 * parsed object. Re-serialising reproduces the original only when the original
 * happened to use the same indentation and trailing newline; a verbatim restore
 * is byte-for-byte by construction. The surgical path is the fallback for a
 * crashed `--start` that never recorded one.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/** Relative to the project root. */
const SETTINGS_RELPATH = path.join('.claude', 'settings.local.json');

/**
 * Catch-all. Verified live: `.*` matched both `Bash` and `Read`. An explicit
 * alternation would silently under-report every tool nobody remembered to add,
 * which for a measurement instrument is the worst kind of wrong — the number
 * still looks plausible.
 */
const TAP_MATCHER = '.*';

const TAP_EVENT = 'PostToolUse';

/** Identifies our own entry for merge and surgical removal. */
const TAP_COMMAND = 'node "${CLAUDE_PROJECT_DIR}/.claude/hooks/measure-tap.js"';

const TAP_TIMEOUT = 5;

function settingsPath(root) {
  return path.join(root || process.cwd(), SETTINGS_RELPATH);
}

function readRaw(root) {
  try {
    return fs.readFileSync(settingsPath(root), 'utf8');
  } catch (_) {
    return null;
  }
}

function parseSettings(raw) {
  if (raw === null) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function isOurs(hook) {
  return Boolean(hook) && hook.command === TAP_COMMAND;
}

/** Is the tap currently registered? Never throws. */
function isWired(root) {
  const settings = parseSettings(readRaw(root));
  const groups = (settings.hooks && settings.hooks[TAP_EVENT]) || [];
  return groups.some((g) => Array.isArray(g.hooks) && g.hooks.some(isOurs));
}

/**
 * Register the tap.
 *
 * Merges into an existing group carrying the same matcher rather than adding a
 * second one, and is a no-op when already wired — together these are what make
 * a repeated `--start` idempotent rather than doubling the per-call cost.
 *
 * @returns {{created: boolean, previousRaw: string|null, alreadyWired: boolean}}
 *   `previousRaw` is the file's exact PRE-TAP contents, to be stored in the
 *   marker so `--stop` can restore it verbatim — and is `null` whenever this
 *   call did not create the wiring, because it then holds no clean baseline.
 */
function wire(root) {
  const previousRaw = readRaw(root);
  const created = previousRaw === null;

  // Already wired: this `--start` did not add the tap and has no pre-tap
  // baseline, so it must not offer one (#2807). Returning the file as it stands
  // hands `unwire` a backup that ALREADY CONTAINS the tap; the verbatim path
  // then writes it back, reinstating the tap while reporting success. That made
  // the wired state a fixed point — no arm/disarm cycle returned the tree to
  // clean, and the only escape was a hand edit.
  //
  // `null` routes `unwire` to its surgical path, which already exists and is
  // already tested: it removes `isOurs` entries only, drops emptied groups and
  // leaves co-tenants alone. Its docstring already covers this situation — a
  // `--start` that recorded no backup — and "already wired" is the same fact.
  // Surgical removal also handles a hand-wired tap correctly, since `isOurs`
  // matches only ours.
  //
  // Carrying a previous marker's `previousRaw` forward was considered and is
  // worse: that marker may be stale, absent, or from another session, and it
  // cannot help at all when the tap was added by hand.
  if (isWired(root)) {
    return { created: false, previousRaw: null, alreadyWired: true };
  }

  const settings = parseSettings(previousRaw);
  settings.hooks = settings.hooks || {};
  const groups = (settings.hooks[TAP_EVENT] = settings.hooks[TAP_EVENT] || []);

  const entry = { type: 'command', command: TAP_COMMAND, timeout: TAP_TIMEOUT };
  const existing = groups.find((g) => g.matcher === TAP_MATCHER);
  if (existing) {
    existing.hooks = Array.isArray(existing.hooks) ? existing.hooks : [];
    existing.hooks.push(entry);
  } else {
    groups.push({ matcher: TAP_MATCHER, hooks: [entry] });
  }

  fs.mkdirSync(path.dirname(settingsPath(root)), { recursive: true });
  fs.writeFileSync(settingsPath(root), JSON.stringify(settings, null, 2) + '\n');

  return { created, previousRaw, alreadyWired: false };
}

/**
 * Remove the tap.
 *
 * Three paths, in order of fidelity:
 *   created           -> delete the file; leaving an empty shell would be a
 *                        file the project never had.
 *   previousRaw known -> write it back verbatim: byte-for-byte by construction.
 *   neither           -> surgical removal of our own entry only. Used when
 *                        `--start` crashed before recording a backup. Empty
 *                        groups are dropped so no orphan matcher is left
 *                        behind, but co-tenants in the same group survive.
 */
function unwire(root, opts) {
  const o = opts || {};
  const target = settingsPath(root);

  if (o.created === true) {
    try {
      fs.unlinkSync(target);
    } catch (_) {
      // Already gone — the desired end state either way.
    }
    return { restored: 'deleted' };
  }

  if (typeof o.previousRaw === 'string') {
    try {
      fs.writeFileSync(target, o.previousRaw);
      return { restored: 'verbatim' };
    } catch (_) {
      return { restored: 'failed' };
    }
  }

  const raw = readRaw(root);
  if (raw === null) return { restored: 'absent' };

  const settings = parseSettings(raw);
  const groups = (settings.hooks && settings.hooks[TAP_EVENT]) || [];
  for (const g of groups) {
    if (Array.isArray(g.hooks)) g.hooks = g.hooks.filter((h) => !isOurs(h));
  }
  if (settings.hooks) {
    settings.hooks[TAP_EVENT] = groups.filter((g) => Array.isArray(g.hooks) && g.hooks.length > 0);
    if (settings.hooks[TAP_EVENT].length === 0) delete settings.hooks[TAP_EVENT];
  }

  try {
    fs.writeFileSync(target, JSON.stringify(settings, null, 2) + '\n');
    return { restored: 'surgical' };
  } catch (_) {
    return { restored: 'failed' };
  }
}

module.exports = {
  SETTINGS_RELPATH,
  TAP_MATCHER,
  TAP_EVENT,
  TAP_COMMAND,
  settingsPath,
  isWired,
  wire,
  unwire,
};
