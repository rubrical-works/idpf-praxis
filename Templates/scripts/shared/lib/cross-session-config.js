// Rubrical Works (c) 2026
/**
 * @framework-script 0.103.0
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
 * WHERE IT LIVES, AND WHY THAT MOVED (#2702, then #2774). #2702 put the object
 * in `framework-config.json` because `.claude/metadata/` is a read-only hub
 * junction in PHM-deployed projects, so a deployed project could not disable a
 * poller running inside it -- the same reasoning that put `reviewSweep` there
 * (#2564). That argument covered `.claude/metadata/` and NOT `.claude/` itself,
 * which is a real directory in deployed projects. #2774 moves the object to
 * `.claude/x-session.json`: still project-writable, but per-developer and
 * gitignored, so a personal quiet setting no longer lands in team history or is
 * carried forever as a local diff to a file six other commands rewrite.
 *
 * The legacy key is still READ, and reported when it is what answered. It stays
 * accepted by `framework-config.schema.json` (marked deprecated) until a
 * project's next `/x-session-config` write moves the values across -- removing
 * it from the schema outright would invalidate every unmigrated project's
 * config and block every other writer of that file.
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
 * Node built-ins only, per the runtime dependency contract in
 * `04-deployment-awareness.md`. `resolveCrossSessionConfig` and
 * `formatEffectiveState` are pure and require nothing; `readCrossSessionConfig`
 * requires `fs` and `path` lazily at the call, both built-ins. No external
 * package is used, declared or otherwise.
 *
 * TWO ENTRY POINTS, and the split is deliberate:
 *
 *   resolveCrossSessionConfig(config, env)  pure; caller supplies the config
 *   readCrossSessionConfig(cwd, env)        does the file I/O and the chain
 *
 * Six consumers already pass an already-loaded config to the pure form. Making
 * that function read files would have changed the contract under all six at
 * once, so the chain is a wrapper instead.
 */

'use strict';

/** Top-level boolean levers, in display order. */
const LEVERS = ['enabled', 'discovery', 'notices', 'upstreamMonitor', 'noticeNarration'];

/** Announcement groups, in event order. */
const GROUPS = ['work', 'push', 'review'];

/**
 * The session-scoped emission opt-out (#2705).
 *
 * Framework-owned namespace, deliberately not `CLAUDE_CODE_`: that is
 * Anthropic's product namespace and could collide with a future product
 * setting. The name matches the rest of the subsystem -- the
 * `/x-session-config` command, and the `.claude/x-session.json` file #2774
 * introduces.
 */
const ENV_VAR = 'IDPF_X_SESSION';

/**
 * The only values that suppress, matched case-insensitively after trimming.
 *
 * ANYTHING ELSE LEAVES MESSAGING ENABLED and is reported as unrecognised. This
 * is the opposite polarity to `verificationMode`, which fails an unknown value
 * INTO strict, and the difference is deliberate rather than an inconsistency:
 * for a gate, failing into strictness is safe. For a messaging opt-out the
 * analogous "safe" direction is silence, and a typo that silently mutes a
 * session is undetectable by anyone -- dispatch is already invisible from the
 * sending side (#2674), so no peer can distinguish a muted session from a quiet
 * one, and the muted session is told nothing either. A typo must leave you
 * audible and told.
 */
const ENV_OFF_VALUES = ['off', '0', 'false'];

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
 * Classify the environment variable into one of three outcomes (#2705).
 *
 * The three are kept distinct because they call for different reporting, and
 * collapsing any two loses something a user needs:
 *
 *   absent       -> changes nothing, says nothing
 *   recognised   -> suppresses everything, and says so
 *   unrecognised -> suppresses NOTHING, and says so loudly
 *
 * An empty or whitespace-only value counts as ABSENT, not unrecognised. An
 * exported-but-empty variable is how a shell wrapper commonly records "unset";
 * reporting it as a typo produces a warning nobody can act on, about a value
 * that expresses no intent.
 *
 * @param {object} env  An environment bag, normally `process.env`.
 * @returns {{variable: string, value: string|null, recognised: boolean, applied: boolean}}
 */
function readEnvOverride(env) {
  const bag = isPlainObject(env) ? env : {};
  const raw = bag[ENV_VAR];

  if (typeof raw !== 'string' || raw.trim() === '') {
    return { variable: ENV_VAR, value: null, recognised: false, applied: false };
  }

  const recognised = ENV_OFF_VALUES.includes(raw.trim().toLowerCase());
  // `value` reports the raw string, untrimmed and uncased, so a report can
  // quote back exactly what was set. Matching is what tolerates the whitespace,
  // not the record of what the user typed.
  return { variable: ENV_VAR, value: raw, recognised, applied: recognised };
}

/**
 * Resolve the effective cross-session messaging state.
 *
 * PRECEDENCE (#2705):
 *
 *   IDPF_X_SESSION  >  framework-config.json crossSessionMessaging  >  enabled
 *
 * An absent variable changes nothing, which preserves the absence-means-enabled
 * rule at every level rather than adding an exception to it. #2774 inserts
 * `.claude/x-session.json` between the environment and the legacy config key;
 * the environment stays at the top of the chain either way, so that change is
 * additive here rather than a reordering.
 *
 * @param {object} config  The whole `framework-config.json` object. Reads
 *   `config.crossSessionMessaging`; pass the config, not the inner object.
 * @param {object} [env=process.env]  Environment bag. Injectable so that tests
 *   need not mutate the real process environment, and so a developer who
 *   exports IDPF_X_SESSION in their own shell does not turn the suite red.
 * @returns {{
 *   enabled: boolean, discovery: boolean, notices: boolean,
 *   upstreamMonitor: boolean, noticeNarration: boolean,
 *   groups: {work: boolean, push: boolean, review: boolean},
 *   fullyEnabled: boolean, implications: string[],
 *   source: 'environment'|'project-config'|'default',
 *   envOverride: {variable: string, value: string|null, recognised: boolean, applied: boolean}
 * }}
 *
 * Never throws. This gates an ADVISORY channel: a resolver that threw would
 * turn a malformed config into a failed `/work` run, which is a far worse
 * outcome than an announcement too many. Malformed input resolves to fully
 * enabled -- the same answer as an absent key, because that is what it is.
 */
function resolveCrossSessionConfig(config, env) {
  const raw = isPlainObject(config) ? config.crossSessionMessaging : undefined;
  const xsm = isPlainObject(raw) ? raw : {};
  const rawGroups = isPlainObject(xsm.groups) ? xsm.groups : {};
  const envOverride = readEnvOverride(env === undefined ? process.env : env);

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
    // Which layer DETERMINED the effective state -- not merely which layers
    // were present. Callers name it rather than infer it; inferring means
    // re-deriving the precedence chain at each of six call sites, which is the
    // duplication this module exists to prevent.
    //
    // `crossSessionMessaging: {}` reports `default`, not `project-config`. An
    // empty object turns nothing off, so claiming it as the deciding source
    // would send a reader to a config key that says nothing -- and it would
    // break the #2702 property that an empty object and an absent one resolve
    // identically, which is the whole absence-means-enabled contract.
    source: 'default',
    envOverride,
  };

  // The project config decided something only if it actually turned a lever
  // off. Computed from the resolved values rather than from key presence, so a
  // key explicitly set to `true` counts as deciding nothing -- which is what it
  // does, absence and `true` being the same answer under the absence rule.
  if (
    LEVERS.some((lever) => state[lever] === false)
    || GROUPS.some((group) => state.groups[group] === false)
  ) {
    state.source = 'project-config';
  }

  // THE ENVIRONMENT LAYER (#2705). Applied before the master switch below so
  // that it reuses that exact path: all-or-nothing, identical in effect to
  // `enabled: false`, with no value grammar of its own. Per-lever tuning stays
  // a project decision through `/x-session-config --off <levers>`.
  if (envOverride.applied) {
    state.enabled = false;
    state.source = 'environment';
    state.implications.push(
      `${ENV_VAR}=${envOverride.value} is set, so cross-session messaging is off for `
      + 'this session only. It is all-or-nothing — discovery, notices, the upstream '
      + 'monitor, notice narration and all three announcement groups — and it was NOT '
      + 'written to framework-config.json, so no other session is affected.'
    );
  } else if (envOverride.value !== null) {
    // Set, but not a value that means anything. Messaging stays ENABLED and the
    // value is reported. Suppressing here would make a typo mute a session that
    // nobody -- not the user, not any peer -- could detect was muted.
    state.implications.push(
      `${ENV_VAR} is set to "${envOverride.value}", which is unrecognised, so it was `
      + `ignored and cross-session messaging remains enabled. Recognised off-values are `
      + `${ENV_OFF_VALUES.map((v) => `\`${v}\``).join(', ')} (case-insensitive).`
    );
  }

  // Master switch: false disables every other lever, groups included.
  if (!state.enabled) {
    state.discovery = false;
    state.notices = false;
    state.upstreamMonitor = false;
    state.noticeNarration = false;
    for (const g of GROUPS) state.groups[g] = false;
    // Only claim the CONFIG key is off when the config key is what turned it
    // off. Under an environment override the cascade is identical but the cause
    // is not, and a user told "enabled is off" goes looking in a file that does
    // not contain it -- the env implication above already stated the cascade.
    if (state.source !== 'environment') {
      state.implications.push(
        'enabled is off, so every other lever resolves off: discovery, notices, '
        + 'the upstream monitor, and all three announcement groups.'
      );
    }
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

/** Where the object lives in a project, relative to the project root (#2774). */
const X_SESSION_REL_PATH = '.claude/x-session.json';

/** Read and parse a JSON file, or return undefined. Never throws (#2774). */
function readJsonOrUndefined(filePath) {
  const fs = require('fs');
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Resolve the effective state from a project on disk, applying the full
 * precedence chain (#2774):
 *
 *   IDPF_X_SESSION  >  .claude/x-session.json  >  framework-config.json
 *                      crossSessionMessaging   >  absence means enabled
 *
 * WHY A SEPARATE ENTRY POINT rather than teaching resolveCrossSessionConfig to
 * read files: that function is pure and every existing consumer passes it an
 * already-loaded config. Making it do I/O would change the contract under six
 * call sites at once. This wraps it instead.
 *
 * THE NEW FILE WINS OUTRIGHT — the two are never merged. A half-migrated
 * project must not resolve to a blend of two files nobody wrote; once
 * `.claude/x-session.json` exists it is the whole answer, and the legacy key is
 * inert until `/x-session-config` strips it.
 *
 * WHY THE LEGACY READ IS REPORTED rather than silently honoured: the key is
 * deprecated and will be moved on the next `/x-session-config` write. A project
 * still reading it is in a transitional state, and the one line saying so is
 * what makes that visible before the move happens rather than after.
 *
 * @param {string} cwd  Project root.
 * @param {object} [env=process.env]  Environment bag; injectable for tests.
 * @returns {object} A resolveCrossSessionConfig state, with `source` extended to
 *   include `'x-session-json'` and a `legacy` boolean.
 *
 * Never throws. A missing, unreadable or malformed file resolves the same way
 * an absent one does — this gates an ADVISORY channel, and a corrupt preference
 * file must not turn into a failed `/work` run.
 */
function readCrossSessionConfig(cwd, env) {
  const path = require('path');
  const root = typeof cwd === 'string' && cwd ? cwd : process.cwd();

  const xSessionPath = path.join(root, X_SESSION_REL_PATH);
  const fs = require('fs');
  const xSessionExists = (() => {
    try { return fs.existsSync(xSessionPath); } catch { return false; }
  })();
  const xSession = xSessionExists ? readJsonOrUndefined(xSessionPath) : undefined;
  const xSessionMalformed = xSessionExists && !isPlainObject(xSession);

  const frameworkConfig = readJsonOrUndefined(path.join(root, 'framework-config.json'));
  const legacyRaw = isPlainObject(frameworkConfig)
    ? frameworkConfig.crossSessionMessaging
    : undefined;

  // The resolver takes a WHOLE config and reads `.crossSessionMessaging` off
  // it, so the new file is wrapped to look like one. Wrapping rather than
  // reaching into the resolver keeps one code path for both locations.
  const usingNewFile = isPlainObject(xSession);
  const forResolver = usingNewFile
    ? { crossSessionMessaging: xSession }
    : (isPlainObject(frameworkConfig) ? frameworkConfig : {});

  const state = resolveCrossSessionConfig(forResolver, env);

  // `source` is already `environment`, `project-config` or `default` from the
  // pure resolver. Only the middle value needs re-labelling, and only when the
  // decision actually came from the new file — an empty new file decides
  // nothing and keeps `default`, exactly as `crossSessionMessaging: {}` does.
  if (state.source === 'project-config' && usingNewFile) {
    state.source = 'x-session-json';
  }

  state.legacy = state.source === 'project-config' && isPlainObject(legacyRaw);

  if (xSessionMalformed) {
    state.implications.push(
      `${X_SESSION_REL_PATH} could not be read as an object, so it was ignored and `
      + 'the legacy framework-config.json crossSessionMessaging key was used instead. '
      + 'Cross-session messaging is advisory, so a malformed preference file degrades '
      + 'rather than failing the command that read it.'
    );
  }

  if (state.legacy) {
    state.implications.push(
      'Cross-session settings were read from the deprecated crossSessionMessaging key '
      + `in framework-config.json. The next \`/x-session-config\` run moves them to `
      + `${X_SESSION_REL_PATH} and strips the key.`
    );
  }

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

  // The environment case is checked FIRST and names the variable, because the
  // two surfaces that render this line -- the startup `Peers:` row and
  // `/x-session-config`'s opening display -- are the only places effective
  // state ever surfaces. Falling through to "disabled by config" here would
  // send a user to a file that does not contain the setting, on the one
  // channel that exists to tell them where it does live.
  if (state.source === 'environment') {
    const value = isPlainObject(state.envOverride) ? state.envOverride.value : null;
    const variable = (isPlainObject(state.envOverride) && state.envOverride.variable) || ENV_VAR;
    return `cross-session messaging: disabled for this session by ${variable}=${value} `
      + '(not written to any config file)';
  }

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
  ENV_VAR,
  ENV_OFF_VALUES,
  X_SESSION_REL_PATH,
  resolveCrossSessionConfig,
  readCrossSessionConfig,
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
  // Goes through readCrossSessionConfig, so the four command specs that shell
  // out to this line get the full precedence chain without any of them
  // changing (#2774). That is the whole reason the CLI exists: one invocation,
  // one output shape, and the chain resolved in exactly one place.
  const state = readCrossSessionConfig(process.cwd());
  process.stdout.write(
    JSON.stringify({ ...state, summary: formatEffectiveState(state) }, null, 2) + '\n'
  );
}
