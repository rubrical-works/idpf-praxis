// Rubrical Works (c) 2026
/**
 * @framework-script 0.104.0
 *
 * Stale `.tmp-*` scratch-file sweep for the startup hook (#2771).
 *
 * Every command that writes a scratch file ends with an `rm` step, and that
 * step is skipped whenever the command errors out, the session is interrupted,
 * or compaction lands between the write and the remove. Ad hoc investigation
 * files have no owning command and no `rm` step at all. Because `.tmp-*` is
 * gitignored, `git status` never shows the leak, so nothing ever prompts a
 * cleanup and the files accumulate silently — 13 of them at the root when this
 * was filed, aged one to four days.
 *
 * THIS IS THE ONE STARTUP STEP THAT MUTATES THE TREE. `06-runtime-triggers.md`
 * says *offer, don't force*, and every other startup check is advisory. The
 * exception is deliberate and narrow, and the narrowness is carried here rather
 * than in the caller: the target set is name-pattern-matched, direct children
 * of the project root only, never a directory, never git-tracked, and at least
 * a day old. A day-old scratch file belongs to no live command.
 *
 * CONSEQUENTLY THE INTERESTING CODE IS WHAT IT REFUSES TO DELETE. Deleting is
 * irreversible; not deleting costs a file that persists to the next session.
 * Every ambiguous case therefore resolves toward keeping the file, including
 * the one with no acceptance criterion of its own: if the git query fails, the
 * helper cannot prove a candidate is untracked, so it skips EVERY candidate
 * with reason `tracked-unknown` rather than assuming the repo is clean. That
 * also means a directory which is not a git repository is never swept — an
 * acceptable price, since the framework requires git throughout.
 *
 * NODE BUILT-INS ONLY, AND NO RELATIVE REQUIRES EITHER. It is called from
 * `startup-hook.js`, so every module load is paid on every session start; and
 * as a deployed helper under the runtime-dependency contract
 * (`04-deployment-awareness.md`) an undeclared external `require` would crash
 * at module load in every user project. The glob matcher below is vendored for
 * the same reason `scope-drift-check.js` vendors one — `minimatch` is not in
 * `runtimeNpmDependencies`.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DAY_MS = 86400000;

/**
 * Fallback used when the signals file is absent or unreadable. Deliberately
 * identical to the shipped `.claude/metadata/tmp-cleanup-signals.json`, so a
 * project whose metadata directory did not deploy behaves as one whose did
 * rather than sweeping on different terms.
 */
const DEFAULT_SIGNALS = Object.freeze({
  patterns: ['.tmp-*'],
  minAgeMs: DAY_MS,
  reportWhenNothingRemoved: false,
});

const SIGNALS_REL_PATH = path.join('.claude', 'metadata', 'tmp-cleanup-signals.json');

/** Longest candidate batch handed to a single `git ls-files` invocation. */
const GIT_PATHSPEC_CHUNK = 100;

// ─────────────────────────────────────────────────────────────────────────────
// Vendored glob matching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Translate a basename glob (`*` and `?` only) into an anchored RegExp.
 *
 * The patterns this consumes are framework-authored and shaped like `.tmp-*`,
 * so character classes, brace expansion and `**` are out of scope — supporting
 * them would widen what a config edit can select, in a helper that deletes.
 *
 * @param {string} pattern
 * @returns {RegExp}
 */
function globToRegExp(pattern) {
  let out = '';
  for (const ch of pattern) {
    if (ch === '*') out += '[^/\\\\]*';
    else if (ch === '?') out += '[^/\\\\]';
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Signals
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read the sweep signals for a project, falling back to `DEFAULT_SIGNALS`.
 *
 * Re-read from disk at every use per rule `01` — after compaction the file's
 * contents are no longer in context and acting on remembered thresholds is
 * exactly what externalizing them was meant to prevent.
 *
 * @param {string} [cwd] - Project root
 * @returns {{patterns: string[], minAgeMs: number, reportWhenNothingRemoved: boolean}}
 */
function loadSignals(cwd = process.cwd()) {
  try {
    const raw = fs.readFileSync(path.join(cwd, SIGNALS_REL_PATH), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      patterns: Array.isArray(parsed.patterns) ? parsed.patterns : DEFAULT_SIGNALS.patterns,
      minAgeMs: Number.isFinite(parsed.minAgeMs) ? parsed.minAgeMs : DEFAULT_SIGNALS.minAgeMs,
      reportWhenNothingRemoved: parsed.reportWhenNothingRemoved === true,
    };
  } catch {
    return { ...DEFAULT_SIGNALS };
  }
}

/**
 * Whether the sweep is enabled for a project, given its parsed config.
 *
 * **Absent means enabled**, matching `crossSessionMessaging`'s absence rule: a
 * config records only what was turned OFF, so the sweep arrives switched on in
 * every project already on disk without anyone editing a file.
 *
 * **Only the literal `false` disables it.** The polarity is deliberately the
 * opposite of `resolveVerificationMode`, which fails an unrecognised value INTO
 * the strict gate because the risk there is a typo relaxing a check. Here the
 * risk runs the other way: the sweep emits no row when it removes nothing, so a
 * disabled sweep and a clean one look identical, and a typo that silently
 * disabled it would leave a user believing a cleanup runs when it does not.
 *
 * Takes the parsed config rather than a cwd, so the startup hook — which has
 * already parsed `framework-config.json` — can apply the rule without loading
 * the ajv-backed config helper. That module costs ~41ms at require time, paid
 * synchronously on every session start before any check is even spawned.
 * `framework-config.js` `resolveTmpCleanup(cwd)` is the cwd-taking wrapper
 * around this same predicate, so there is one absence rule, not two.
 *
 * @param {object|null|undefined} config - Parsed framework-config.json
 * @returns {boolean}
 */
function isEnabled(config) {
  return !(config && config.tmpCleanup === false);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tracked-status query
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which of `names` git reports as tracked in `cwd`.
 *
 * Returns `null` — not an empty set — when the query could not be run at all.
 * The distinction is the whole safety property: an empty set means *git was
 * asked and said none of these are tracked*, `null` means *git was not able to
 * answer*, and collapsing the two would delete files on the strength of a
 * failed command. Same shape as `undeterminable` vs `[]` in the GitHub token
 * check (#2661).
 *
 * @param {string} cwd
 * @param {string[]} names - Basenames of direct children
 * @returns {Set<string>|null}
 */
function queryTracked(cwd, names) {
  const tracked = new Set();
  for (let i = 0; i < names.length; i += GIT_PATHSPEC_CHUNK) {
    const chunk = names.slice(i, i + GIT_PATHSPEC_CHUNK);
    let stdout;
    try {
      stdout = execFileSync('git', ['ls-files', '-z', '--', ...chunk], {
        cwd,
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
    } catch {
      return null;
    }
    for (const entry of stdout.split('\0')) {
      if (entry) tracked.add(entry);
    }
  }
  return tracked;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decide which direct children of `cwd` are stale scratch files.
 *
 * Pure over the injected clock: `now` is supplied by the caller so the
 * threshold boundary is testable without waiting a day.
 *
 * Never throws. An unreadable directory, malformed signals and a failed git
 * query all resolve to *nothing is stale*, which is the direction that cannot
 * destroy anything.
 *
 * @param {string} cwd - Project root
 * @param {object} signals - `{patterns, minAgeMs}`; anything else selects nothing
 * @param {number} now - Epoch milliseconds
 * @returns {{stale: Array<{name: string, ageMs: number}>, skipped: Array<{name: string, reason: string}>}}
 */
function findStale(cwd, signals, now) {
  const empty = { stale: [], skipped: [] };

  const patterns = signals && Array.isArray(signals.patterns) ? signals.patterns : null;
  if (!patterns || patterns.length === 0) return empty;

  const minAgeMs = signals && Number.isFinite(signals.minAgeMs) ? signals.minAgeMs : null;
  if (minAgeMs === null || minAgeMs < 0) return empty;

  let entries;
  try {
    entries = fs.readdirSync(cwd, { withFileTypes: true });
  } catch {
    return empty;
  }

  const matchers = patterns
    .filter((p) => typeof p === 'string' && p.length > 0)
    .map(globToRegExp);
  if (matchers.length === 0) return empty;

  // A name that never matched a pattern was never a candidate. Listing it in
  // `skipped` would make every unrelated file in the project root a reported
  // skip, drowning the three reasons that actually mean something.
  const candidates = entries.filter((e) => matchers.some((m) => m.test(e.name)));
  if (candidates.length === 0) return empty;

  const stale = [];
  const skipped = [];

  const files = [];
  for (const entry of candidates) {
    if (entry.isDirectory()) {
      skipped.push({ name: entry.name, reason: 'directory' });
    } else if (!entry.isFile()) {
      // Symlink, socket, device. Not a scratch file this helper wrote.
      skipped.push({ name: entry.name, reason: 'not-a-regular-file' });
    } else {
      files.push(entry.name);
    }
  }
  if (files.length === 0) return { stale, skipped };

  const tracked = queryTracked(cwd, files);
  if (tracked === null) {
    for (const name of files) skipped.push({ name, reason: 'tracked-unknown' });
    return { stale, skipped };
  }

  for (const name of files) {
    if (tracked.has(name)) {
      skipped.push({ name, reason: 'tracked' });
      continue;
    }
    let stat;
    try {
      stat = fs.statSync(path.join(cwd, name));
    } catch {
      // Vanished between readdir and stat — another session's cleanup, or the
      // owning command's own `rm` finally running. Nothing to do either way.
      skipped.push({ name, reason: 'unreadable' });
      continue;
    }
    const ageMs = now - stat.mtimeMs;
    // ">=" — "one day old or older" puts the boundary on the stale side.
    if (ageMs >= minAgeMs) {
      stale.push({ name, ageMs });
    } else {
      skipped.push({ name, reason: 'too-young' });
    }
  }

  return { stale, skipped };
}

/**
 * Delete the files `findStale` selected.
 *
 * Never throws: a failure is data, not an exception, because the caller is a
 * startup hook whose contract is that the Session Initialized block renders no
 * matter what. One failure does not abandon the rest of the list.
 *
 * @param {string} cwd - Project root
 * @param {Array<{name: string}>} stale
 * @returns {{removed: string[], failed: Array<{name: string, error: string}>}}
 */
function removeStale(cwd, stale) {
  const removed = [];
  const failed = [];
  if (!Array.isArray(stale)) return { removed, failed };

  for (const item of stale) {
    const name = item && item.name;
    if (typeof name !== 'string' || name.length === 0) {
      failed.push({ name: String(name), error: 'invalid entry' });
      continue;
    }
    // Defence in depth. Every name reaching here came from `readdirSync`, so it
    // is already a basename — but this function deletes, and it is exported,
    // so it does not rely on its only current caller staying its only caller.
    if (name !== path.basename(name) || name.includes('/') || name.includes('\\')) {
      failed.push({ name, error: 'refused: not a direct child name' });
      continue;
    }
    try {
      fs.unlinkSync(path.join(cwd, name));
      removed.push(name);
    } catch (err) {
      failed.push({ name, error: err && err.message ? err.message : String(err) });
    }
  }

  return { removed, failed };
}

/**
 * Render the `Trash:` row body for the Session Initialized block.
 *
 * Returns `''` when there is nothing to say, and the caller omits the row
 * entirely — the same convention the `Peers` row uses for a lone session and
 * `dependency` uses for healthy. A line every startup reporting that nothing
 * needed cleaning is noise in a block of short factual status lines.
 *
 * @param {{removed: string[], failed: Array<{name: string, error: string}>, oldestAgeMs?: number}} result
 * @param {object} signals
 * @returns {string} Row body, or `''` for no row
 */
function formatTrashRow(result, signals) {
  const removed = (result && result.removed) || [];
  const failed = (result && result.failed) || [];
  const patterns = (signals && Array.isArray(signals.patterns) ? signals.patterns : DEFAULT_SIGNALS.patterns).join(', ');

  const parts = [];

  if (removed.length > 0) {
    const noun = removed.length === 1 ? 'file' : 'files';
    const age = Number.isFinite(result.oldestAgeMs)
      ? ` (oldest ${formatAge(result.oldestAgeMs)})`
      : '';
    parts.push(`removed ${removed.length} stale ${patterns} ${noun}${age}`);
  }

  if (failed.length > 0) {
    const noun = failed.length === 1 ? 'file' : 'files';
    const detail = failed.map((f) => `${f.name}: ${f.error}`).join('; ');
    parts.push(`${failed.length} stale ${patterns} ${noun} could not be removed — ${detail}`);
  }

  if (parts.length === 0) {
    return signals && signals.reportWhenNothingRemoved === true
      ? `no stale ${patterns} files to remove`
      : '';
  }

  return parts.join('; ');
}

/**
 * Whole-day age label (`4d`), floored. Sub-day ages are reported as `<1d`,
 * which only arises when a project lowers `minAgeMs` below a day.
 *
 * @param {number} ms
 * @returns {string}
 */
function formatAge(ms) {
  const days = Math.floor(ms / DAY_MS);
  return days >= 1 ? `${days}d` : '<1d';
}

module.exports = {
  findStale,
  removeStale,
  isEnabled,
  formatTrashRow,
  formatAge,
  loadSignals,
  DEFAULT_SIGNALS,
  DAY_MS,
  SIGNALS_REL_PATH,
};
