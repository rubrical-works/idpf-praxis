// Rubrical Works (c) 2026
/**
 * @framework-script 0.101.0
 *
 * Resolver for the `crossSessionMessaging` project config (#2702).
 *
 * Cross-session peer messaging had no project-level off switch. Every session
 * in a working directory emitted all seven announcement events, was scanned for
 * peers at startup, and armed a background upstream poller, with nothing a
 * project could set to decline any of it. The environment-level kill switches
 * `DO_NOT_TRACK` / `DISABLE_TELEMETRY` /
 * `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` exist but are Claude Code runtime
 * switches: all-or-nothing, not project state, and with no local override.
 *
 * THE ONE RULE: absence means enabled, at every level.
 *
 *   no `crossSessionMessaging` key   -> everything enabled
 *   `crossSessionMessaging: {}`      -> everything enabled
 *   an omitted key inside the object -> that lever enabled
 *
 * So a config records only what was turned OFF, and a group added by a future
 * release is on by default in every existing project with no config edit. Get
 * this backwards -- default a missing key to false -- and every project that
 * never wrote the object silently loses a channel nobody asked to disable.
 *
 * WHY A RESOLVER RATHER THAN INLINE CHECKS. Six consumers gate on this
 * (`/work`, `/done`, `/review-issue`, `/resolve-review`, `startup-hook.js`,
 * `upstream-monitor.js`). Each one re-deriving "missing means enabled" is six
 * copies of a rule that has to stay identical; the `discovery: false` group
 * implication below is exactly the kind of thing five of them would get right
 * and the sixth would not. Consumers read this and report what it returns.
 *
 * WHY IT LIVES IN framework-config.json, not .claude/metadata/. That directory
 * is a read-only hub junction in PHM-deployed projects, so a deployed project
 * could not disable a poller running inside it. `framework-config.json` is the
 * only project-writable surface -- the same reasoning that put `reviewSweep`
 * there (#2564).
 *
 * SCOPE: this governs EMISSION, with exactly one deliberate exception.
 * Whether a dispatched message is accepted, held, declined, or left to expire
 * is the receiving session's permission-mode decision, undetectable from the
 * sender (#2674). No setting here can promise delivery, and nothing in this
 * module should be read as doing so.
 *
 * THE EXCEPTION is `noticeNarration` (#2735), which governs how verbosely THIS
 * session narrates an announcement it RECEIVES. It sits here rather than in a
 * sibling top-level key so that it inherits one resolver, one absence rule and
 * the `--on`/`--off` idiom; a parallel key would have re-implemented all three,
 * and a second copy of the absence rule is precisely what this module exists to
 * prevent. The trade is recorded rather than hidden: the emission-only framing
 * above is now true of every lever except this one, and a reader who assumes
 * otherwise will look for a receive-side setting that does not exist elsewhere.
 * It is also why `discovery: false` does NOT imply it -- see resolveCrossSessionConfig.
 *
 * Node built-ins only -- in fact no requires at all -- per the runtime
 * dependency contract in `04-deployment-awareness.md`.
 */

'use strict';

/** Top-level boolean levers, in display order. */
const LEVERS = ['enabled', 'discovery', 'notices', 'upstreamMonitor', 'noticeNarration'];

/** Announcement groups, in event order. */
const GROUPS = ['work', 'push', 'review'];

/**
 * True only for an exact `false`.
 *
 * Deliberately not truthiness. A hand-edited `"false"` (the string) is a value
 * the schema rejects, so treating it as off would have the fail-open path and
 * the schema disagreeing about the same file: one silently disabling the
 * channel, the other refusing to write it. Only a real boolean `false` counts,
 * and everything else -- absent, `true`, or junk -- resolves to enabled.
 */
function isOff(value) {
  return value === false;
}

/** A non-null, non-array object. `typeof null === 'object'` is the trap here. */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Resolve the effective cross-session messaging state.
 *
 * @param {object} config  The whole `framework-config.json` object. Reads
 *   `config.crossSessionMessaging`; pass the config, not the inner object.
 * @returns {{
 *   enabled: boolean, discovery: boolean, notices: boolean,
 *   upstreamMonitor: boolean,
 *   groups: {work: boolean, push: boolean, review: boolean},
 *   fullyEnabled: boolean, implications: string[]
 * }}
 *
 * Never throws. This gates an ADVISORY channel: a resolver that threw would
 * turn a malformed config into a failed `/work` run, which is a far worse
 * outcome than an announcement too many. Malformed input resolves to fully
 * enabled -- the same answer as an absent key, because that is what it is.
 */
function resolveCrossSessionConfig(config) {
  const raw = isPlainObject(config) ? config.crossSessionMessaging : undefined;
  const xsm = isPlainObject(raw) ? raw : {};
  const rawGroups = isPlainObject(xsm.groups) ? xsm.groups : {};

  const state = {
    // Fresh objects every call. Consumers annotate and report this; a shared
    // default would let one caller's mutation leak into the next caller's
    // answer.
    enabled: !isOff(xsm.enabled),
    discovery: !isOff(xsm.discovery),
    notices: !isOff(xsm.notices),
    upstreamMonitor: !isOff(xsm.upstreamMonitor),
    // The one RECEIVE-side lever (#2735). Named so that `true` is today's
    // behaviour: a lever called `quietNotices` would invert the absence rule
    // above and silently make every project that never wrote this object go
    // quiet — the exact failure the header warns about, one key down.
    noticeNarration: !isOff(xsm.noticeNarration),
    groups: {
      work: !isOff(rawGroups.work),
      push: !isOff(rawGroups.push),
      review: !isOff(rawGroups.review),
    },
    fullyEnabled: true,
    implications: [],
  };

  // Master switch: false disables every other lever, groups included.
  if (!state.enabled) {
    state.discovery = false;
    state.notices = false;
    state.upstreamMonitor = false;
    state.noticeNarration = false;
    for (const g of GROUPS) state.groups[g] = false;
    state.implications.push(
      'enabled is off, so every other lever resolves off: discovery, notices, '
      + 'the upstream monitor, and all three announcement groups.'
    );
  } else if (!state.discovery) {
    // Announcing to peers that were never discovered is not meaningful, so
    // discovery:false implies all three groups off. REPORTED, not silently
    // applied: the user set one key and got four effects, and that should be
    // visible at the moment it needs explaining.
    //
    // The upstream monitor is deliberately NOT folded in -- it polls the git
    // upstream, not peers, and disabling it here would take out an unrelated
    // feature on a setting that never mentioned it. `noticeNarration` is left
    // alone for the same reason and one more: it is RECEIVE-side. This branch
    // reasons about announcing TO peers never discovered, which says nothing
    // about how this session narrates what it RECEIVES -- and a session can
    // still receive announcements with its own discovery off.
    for (const g of GROUPS) state.groups[g] = false;
    state.implications.push(
      'discovery is off, so all three announcement groups resolve off — '
      + 'announcing to peers that were never discovered is not meaningful. '
      + 'The upstream monitor is unaffected; it polls the git upstream, not peers.'
    );
  }

  // Per AC 11: "not fully enabled" is any group off, or the master switch off.
  // Both of the branches above already zero the groups, so this one expression
  // covers all three ways of getting there.
  state.fullyEnabled = state.enabled && GROUPS.every((g) => state.groups[g]);

  return state;
}

/**
 * One-line effective-state summary, for the startup `Peers:` row and for
 * `/x-session-config`'s opening display.
 *
 * This exists because a disabled group emits nothing and prints no
 * per-invocation skip notice -- the suppression is the user's own choice, and
 * a notice on every `/work` would be the noise the feature exists to remove.
 * That makes it an invisible setting unless something states it where the
 * setting lives, which is what this line is for. It is the deliberate
 * exception to "a gate that quietly does nothing is indistinguishable from one
 * that passed": here the silence IS the requested behaviour.
 *
 * @param {object} state  A state from resolveCrossSessionConfig.
 * @returns {string}
 */
function formatEffectiveState(state) {
  if (!isPlainObject(state)) return 'cross-session messaging: fully enabled (no configuration)';

  const groups = isPlainObject(state.groups) ? state.groups : {};
  const off = [];

  if (state.enabled === false) return 'cross-session messaging: disabled by config (enabled: false)';

  if (state.discovery === false) {
    // Name the cause, not its four effects. discovery:false already zeroes
    // every group, so enumerating them here would read as four independent
    // decisions the user did not make.
    off.push('discovery (which also silences all announcements)');
  } else {
    for (const g of GROUPS) {
      if (groups[g] === false) off.push(`${g} announcements`);
    }
  }
  if (state.notices === false) off.push('notices');
  if (state.upstreamMonitor === false) off.push('upstream monitor');
  if (state.noticeNarration === false) off.push('notice narration (quiet)');

  if (off.length === 0) return 'cross-session messaging: fully enabled';
  return `cross-session messaging: partially disabled by config — off: ${off.join(', ')}`;
}

module.exports = {
  LEVERS,
  GROUPS,
  resolveCrossSessionConfig,
  formatEffectiveState,
};

// CLI mode. Command specs are prose executed by an LLM, so the invocation they
// carry has to be short enough to be copied correctly every time: a four-line
// `node -e` repeated across /work, /done, /review-issue and /resolve-review is
// four chances to paraphrase it into something that reads the wrong shape --
// the #2678 failure mode, one level down. One line, one output shape.
//
//   node .claude/scripts/shared/lib/cross-session-config.js
//
// Prints the resolved state as JSON, plus a `summary` line for display. Exits
// 0 whatever it finds: an unreadable config resolves to fully enabled, which
// is an answer, not an error.
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');

  let config = {};
  try {
    config = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'framework-config.json'), 'utf8')
    );
  } catch {
    config = {};
  }

  const state = resolveCrossSessionConfig(config);
  process.stdout.write(
    JSON.stringify({ ...state, summary: formatEffectiveState(state) }, null, 2) + '\n'
  );
}
