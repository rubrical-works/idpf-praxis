// Rubrical Works (c) 2026
/**
 * Background upstream-push monitor (#2667).
 *
 * A SCHEDULER around `branch-sync-check.js`, plus a surfacing contract. It
 * does not fetch, does not time out, and does not derive status — that helper
 * already does all three, already bounds its fetch at 10s with
 * GIT_TERMINAL_PROMPT=0, and is already tested. A second copy of that logic
 * would drift from the first, silently, because both would keep producing
 * plausible answers.
 *
 * Reaches what the peer channel structurally cannot: another machine, and
 * actors that are not Claude sessions at all — a human pushing from a plain
 * terminal. The git remote is the only substrate shared across that boundary.
 *
 * ADVISORY ONLY. It never pulls, rebases, merges or stashes; it never gates a
 * command; it never mutates the working tree. An advisory channel that can
 * fail a command has become a gate.
 *
 * Two contracts here are easy to mistake for preferences and are neither:
 *
 *   1. It emits on TRANSITION, never per poll. The Monitor host automatically
 *      stops a monitor that produces too many events, so a per-poll emitter is
 *      not merely noisy — it gets disarmed, silently removing the warning this
 *      exists to give.
 *   2. It skips entirely while a /done push is in flight. A fetch in that
 *      window advances refs/remotes/origin/<branch> out from under the base
 *      /done pinned at Step 2.2.
 *
 * Host, alternatives and the AC-8 reasoning:
 * Construction/Design-Decisions/2026-08-30-upstream-push-monitor-host-and-push-window.md
 *
 * @framework-script 0.100.0
 * Refs #2667
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { resolveCrossSessionConfig } = require('./lib/cross-session-config.js');

const CONFIG_RELATIVE = '.claude/metadata/upstream-monitor.json';
const SYNC_HELPER_RELATIVE = '.claude/scripts/shared/branch-sync-check.js';
const FRAMEWORK_CONFIG_RELATIVE = 'framework-config.json';

/** Repo root, derived from this file's location (…/.claude/scripts/shared). */
function repoRoot() {
  return path.join(__dirname, '..', '..', '..');
}

/**
 * Read the scheduling contract from disk.
 * Intervals are metadata, not prose, so they are tunable without a spec edit.
 */
function loadConfig(root = repoRoot()) {
  return JSON.parse(fs.readFileSync(path.join(root, CONFIG_RELATIVE), 'utf8'));
}

/**
 * Next poll interval.
 *
 * The floor is enforced LAST and unconditionally, so no input path — a wrong
 * config, a negative carry-over, a backoff calculation — can produce an
 * interval below it. Each poll costs above a second of wall time, so a
 * sub-floor interval spends more than the staleness it prevents.
 */
function nextInterval(currentSeconds, changed, config) {
  const p = config.polling;
  const floor = p.floorSeconds;
  const max = p.backoff.maxIntervalSeconds;

  let next;
  if (changed || currentSeconds === null || currentSeconds === undefined) {
    next = p.defaultIntervalSeconds;
  } else {
    next = Math.min(currentSeconds * p.backoff.factor, max);
  }
  if (!Number.isFinite(next)) next = p.defaultIntervalSeconds;
  return Math.min(Math.max(next, floor), max);
}

/**
 * Has anything worth an event changed?
 *
 * `ahead` is deliberately NOT in the transition key. It moves on every local
 * commit, so keying on it would emit an event per commit during ordinary work
 * — chatty enough to get the monitor stopped by the host, to report something
 * the user just did themselves.
 */
function isTransition(previous, current, config) {
  if (!previous) return config.emission.alwaysEmitFirstResult;
  if (!current) return false;
  return config.emission.transitionKey.some(k => previous[k] !== current[k]);
}

/**
 * Render one event.
 *
 * `fetched: false` is the ABSENCE of information, never a clean bill of
 * health, and it matters most at `up-to-date` — the one status that otherwise
 * reports nothing, so a stale all-clear is indistinguishable from a verified
 * one. `no-upstream` is excluded because it ALWAYS carries fetched:false, so a
 * caveat there would report configuration as fetch failure (#2687's carve-out,
 * inherited rather than re-derived).
 */
function formatEvent(data, config) {
  const parts = [`Upstream ${data.branch}: ${data.status}`];
  if (data.ahead) parts.push(`ahead ${data.ahead}`);
  if (data.behind) parts.push(`behind ${data.behind}`);

  let text = parts.join(', ');

  if (data.fetched === false && data.status !== 'no-upstream') {
    text += ` — ${config.unverifiedFetch.wording}`;
  }
  if (data.conflictingPaths && data.conflictingPaths.length) {
    text += `; conflicting paths: ${data.conflictingPaths.join(', ')}`;
  }
  // A diverged branch names where the divergence gets resolved (#2719,
  // Option C). Not a preference between two defensible answers:
  // `surfacing.inheritsFrom` already declared that this monitor inherits
  // rule 03 §Branch Sync Offer, and #2668 changed what that section says on
  // `diverged` — startup now names the recovery path. Emitting status and
  // counts alone contradicted the declared inheritance, so #2719 removed an
  // inconsistency rather than picking a side.
  //
  // Per-state, and appended LAST so it composes with the unverified-fetch
  // caveat above rather than clobbering it: `diverged` is inside #2687’s
  // stale-able set, so one poll can carry both.
  //
  // The wording NAMES NO GIT COMMAND. That is #2518’s sequencing/consent
  // constraint, which binds harder here than at startup because the
  // interruption is unsolicited — naming a recovery path is not a history
  // rewrite, but naming a rewrite command mid-session commits the user to
  // one before they have seen what diverged. It is a FIXED STRING read from
  // config, which is #2518’s non-assertability constraint: "offer nothing or
  // offer a choice" had no assertable outcome, and a fixed string is
  // assertable per state.
  const recovery = config.surfacing && config.surfacing.divergedRecovery;
  if (data.status === 'diverged' && recovery && recovery.wording) {
    text += ` — ${recovery.wording}`;
  }
  return text;
}

/**
 * Is a /done push in flight?
 *
 * Detected by `.tmp-push-base-*.txt`, which /done Step 2.2 writes immediately
 * after pinning the remote tip and Step 3 removes once it has consumed the
 * range. Its presence IS the unsafe interval — no new lock state to keep in
 * sync with anything.
 *
 * Never throws: an advisory monitor must not die because a directory read
 * failed.
 */
function isPushInFlight(root = repoRoot(), config = loadConfig()) {
  const prefix = config.pushWindow.skipWhileGlob.replace(/\*.*$/, '');
  const suffix = '.txt';
  try {
    return fs.readdirSync(root).some(f => f.startsWith(prefix) && f.endsWith(suffix));
  } catch {
    return false;
  }
}

/**
 * The scheduler's decision for one tick. Pure: no I/O, no clock, no git — so
 * it is testable with injected inputs, which is AC-6's mechanism.
 *
 * `lastReason` suppresses a repeated skip notice. A /done push spans several
 * poll intervals, and re-announcing the same skip each time is exactly the
 * chattiness the host stops monitors for.
 */
function decide({ previous, current, pushInFlight, config, lastReason } = {}) {
  if (pushInFlight) {
    const repeat = lastReason === 'push-in-flight';
    return {
      poll: false,
      emit: !repeat,
      reason: 'push-in-flight',
      text: repeat ? null : 'Upstream poll skipped: a /done push is in flight (pinned base present). Fetching now would move the ref that push is rebasing onto.'
    };
  }

  if (!current) {
    return { poll: true, emit: false, reason: 'no-result', text: null };
  }

  if (!previous) {
    return { poll: true, emit: true, reason: 'first-observation', text: formatEvent(current, config) };
  }

  if (isTransition(previous, current, config)) {
    return { poll: true, emit: true, reason: 'transition', text: formatEvent(current, config) };
  }

  return { poll: true, emit: false, reason: 'no-transition', text: null };
}

/**
 * Run one poll through branch-sync-check.js.
 *
 * Returns the envelope's `data`, or null when the helper could not be read.
 * Null is a missing observation, never a clean one — `decide` treats it as
 * nothing to report rather than as up-to-date.
 */
function poll(root = repoRoot(), config = loadConfig(root)) {
  try {
    // Bounds THIS subprocess, which is not the same thing as the fetch
    // timeout AC-2 forbids reimplementing: branch-sync-check.js still owns
    // its own 10s fetch bound and this wrapper does not set one. This margin
    // simply guarantees the child cannot outlive its own internal bound and
    // hang the monitor — an unbounded spawn in a long-running poller never
    // recovers, and the feature dies silently rather than loudly.
    const spawnBoundMs = (config.polling.fetchBoundSeconds + 5) * 1000;
    const raw = execFileSync('node', [path.join(root, SYNC_HELPER_RELATIVE)], {
      cwd: root,
      encoding: 'utf8',
      timeout: spawnBoundMs,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const envelope = JSON.parse(raw);
    return envelope && envelope.data ? envelope.data : null;
  } catch {
    return null;
  }
}

/**
 * Whether this project wants the poller at all (#2702).
 *
 * TWO CONFIG FILES, TWO QUESTIONS, DELIBERATELY SEPARATE.
 * `.claude/metadata/upstream-monitor.json` answers HOW the monitor behaves
 * once running -- intervals, backoff, the push window -- and stays there.
 * That directory is a read-only hub junction in PHM-deployed projects, so it
 * structurally cannot carry a project decision: a deployed project could not
 * edit it to disable a poller running inside itself. WHETHER the monitor arms
 * is therefore read from `framework-config.json`, the only project-writable
 * surface.
 *
 * REPORTED ONCE BECAUSE IT IS ASKED ONCE. This runs at arm time, before any
 * loop exists; `decide()` runs every poll and has no path to this refusal. If
 * the reason could surface from `decide()`, "reports the reason once" would
 * become "reports it forever" -- and the host auto-stops a monitor that emits
 * too much, which would silently remove the very warning the feature exists
 * to give.
 *
 * @param {{root?: string, frameworkConfig?: object}} [opts]
 *   `frameworkConfig` short-circuits the disk read (used by tests and by any
 *   caller that already holds the config).
 * @returns {{arm: boolean, reason: string, notice: string|null}}
 *
 * Never throws, and fails OPEN: an unreadable, absent or malformed config
 * arms. Refusing to arm on a config the schema would have rejected trades a
 * loud problem for a silent one.
 */
function armingDecision({ root = repoRoot(), frameworkConfig } = {}) {
  let config = frameworkConfig;
  if (config === undefined) {
    try {
      config = JSON.parse(
        fs.readFileSync(path.join(root, FRAMEWORK_CONFIG_RELATIVE), 'utf8')
      );
    } catch {
      config = {};
    }
  }

  const state = resolveCrossSessionConfig(config);

  if (state.upstreamMonitor) {
    return { arm: true, reason: 'enabled', notice: null };
  }

  // Name the key the user actually set. `enabled: false` zeroes every lever,
  // so pointing at `upstreamMonitor` there would send them to a key they
  // never touched.
  const key = state.enabled === false
    ? 'crossSessionMessaging.enabled: false'
    : 'crossSessionMessaging.upstreamMonitor: false';

  return {
    arm: false,
    reason: 'disabled-by-config',
    notice: `Upstream push monitor not armed: disabled by project config (${key} in framework-config.json). `
      + 'No upstream polling will run in this session; branch staleness will surface only at the '
      + 'next /work Step 1c or /done Step 2 sync check.',
  };
}

module.exports = {
  armingDecision,
  loadConfig,
  nextInterval,
  isTransition,
  formatEvent,
  isPushInFlight,
  decide,
  poll
};
