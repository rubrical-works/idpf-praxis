#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.105.0
 * @description Derive, compose and record a /work, review-lifecycle, branch-operation or /done push-group peer announcement in one call. For /work it runs the `git log --grep` itself so the commit payload is never transcribed, and verifies every identifier against the object store; for the review events it makes the --force suppression and the labelAssigned verdict mapping its own decisions. Every composed announcement is recorded to the sender-side ledger. Delivery remains the caller's SendMessage tool call — this script, like peer-announce.js, cannot send.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

/**
 * WHY THIS EXISTS (#2790).
 *
 * `peer-announce.js` renders whatever `commits` array it is handed and — by a
 * deliberate, documented property — cannot check one: no spawn, and no path
 * that throws into the sequence that called it. Its contract comment says the
 * caller builds the list with `git log --oneline --grep="Refs #N"`.
 *
 * That instruction was PROSE, and the caller executing it is a model. Observed
 * live: a `work-completed` naming `0a08fd7f`, which is not a current object,
 * not a reflog entry and not dangling — so never a commit in that repository —
 * while the real `e3ea5f02` for the same issue went unnamed. The two share no
 * prefix, so a transcription typo does not explain it. A composed-rather-than-
 * derived list does.
 *
 * This script is the seam that removes the transcription step. It is allowed
 * the spawn `peer-announce.js` is not, because it is not inside the STOP
 * sequence — it is a subprocess the STOP sequence invokes, whose failure is a
 * non-zero exit and a warning, not an exception mid-prune.
 *
 * THE SAME SEAM, FOR THE REVIEW EVENTS (#2871). Rule 09 had the session
 * compose `review-started`, `review-passed`, `review-findings` and
 * `review-resolved` itself, so two decisions existed only as sentences: that
 * `review-started` is suppressed under `--force`, and which verdict event a
 * finalize result means. Observed: a `review-started` announced for an issue
 * that could only have been re-reviewed with `--force`. The decisions now live
 * here, and the rule passes inputs rather than choosing events.
 *
 * WHAT IT STILL CANNOT DO. It cannot send. `SendMessage` is a tool, and a Node
 * subprocess cannot call one — settled by the #2660 spike, which refuted the
 * socket transport six ways. So the division is unchanged: this composes, the
 * command spec delivers. What changes is that the payload is now derived and
 * verified before it is handed over, and the composition is recorded so a
 * dispatch that never happens is attributable afterwards.
 */

const { execFileSync } = require('child_process');

const { buildAnnouncement, EVENTS } = require('./peer-announce.js');
const { issueRefGrepPattern } = require('./lib/issue-ref-match.js');
const ledger = require('./lib/announce-ledger.js');
const { appendLedgerId } = require('./lib/overwatch-receipt.js');

const WORK_EVENTS = Object.freeze({
  'work-started': EVENTS.WORK_STARTED,
  'work-completed': EVENTS.WORK_COMPLETED,
});

const REVIEW_EVENTS = Object.freeze({
  'review-started': EVENTS.REVIEW_STARTED,
  'review-passed': EVENTS.REVIEW_PASSED,
  'review-findings': EVENTS.REVIEW_FINDINGS,
  'review-resolved': EVENTS.REVIEW_RESOLVED,
});

/**
 * The events this script composes.
 *
 * Narrow by design, and widened once, deliberately (#2871). #2790 kept it to
 * the /work pair on the grounds that the review and CI events have different
 * payloads and pairing rules, and that a wider surface "would be a wrapper
 * with nothing to add". The payload half stands — the review events carry no
 * commits, so nothing here derives any for them, and they are recorded to the
 * ledger as record-only entries rather than paired. The "nothing to add" half
 * did not hold for the review events: what they gain is the seam #2790 made,
 * moving event selection out of prose — the `--force` suppression of
 * `review-started` and the `labelAssigned` → verdict mapping.
 *
 * The push group joined in #2972, and the "nothing to add" argument that kept
 * it out turned out to be wrong. This script derives none of the push-group
 * payloads: the issue set comes from `deriveAnnouncementIssues`, and the CI
 * result from `ci-watch.js`, both passed in unchanged. What it does add is the
 * part that was missing. Composed by `/done` directly, the push group never
 * received targeted routing (#2915), so every peer heard three messages per
 * push, and it never reached the ledger, so no receipt reply could be recorded
 * against it.
 */
/**
 * `/done`'s push group (#2972). Routed like the work events. No
 * `FORCED_REASONS` entry, unlike #2960: a push changes only the remote copy of
 * a branch every session here already shares, so no peer's footing moves. The
 * `groups.push` gate stays in `/done`, resolved once per invocation, because
 * one read across the three events is what keeps them one unit. A second read
 * here per event could disagree with it.
 */
const PUSH_EVENTS = Object.freeze({
  'push-started': EVENTS.PUSH_STARTED,
  'ci-terminal': EVENTS.CI_TERMINAL,
  'ci-resolved': EVENTS.CI_RESOLVED,
  'push-rejected': EVENTS.PUSH_REJECTED,
});
/**
 * Branch-operation notices (#2960), composed here for the same reason the
 * review events are: the decisions live in code, not in four command specs.
 * Two decisions are new. The GATE is the master switch alone — no announcement
 * group applies, so `groups` is ignored while `enabled: false`, IDPF_X_SESSION
 * and `discovery: false` still silence it (the last by construction: no peers
 * were discovered to broadcast to). The KEY is the branch, because a branch
 * operation may run with no tracker issue.
 */
const BRANCH_EVENTS = Object.freeze({
  'branch-merge-starting': EVENTS.BRANCH_MERGE_STARTING,
  'beta-starting': EVENTS.BETA_STARTING,
  'release-starting': EVENTS.RELEASE_STARTING,
  'branch-destroy-starting': EVENTS.BRANCH_DESTROY_STARTING,
});

/** Branch events that push a tag, so they cannot be composed without one. */
const TAGGED_BRANCH_EVENTS = Object.freeze(['beta-starting', 'release-starting']);

const SUPPORTED = Object.freeze({ ...WORK_EVENTS, ...REVIEW_EVENTS, ...BRANCH_EVENTS, ...PUSH_EVENTS });

const hasOwn = (obj, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);

/**
 * Finalize's `labelAssigned` → the verdict event (#2781's mapping, moved into
 * code by #2871). `determineLabel()` returns exactly one of `reviewed` |
 * `pending`, so the label IS the verdict and the caller never chooses one.
 */
const VERDICT_BY_LABEL = Object.freeze({
  reviewed: 'review-passed',
  pending: 'review-findings',
});

/**
 * Which verdict event a finalize result means, or why there is none.
 *
 * `null` is the #2694 case: the label swap failed, so no verdict happened and
 * announcing one would report an outcome that did not occur. Any other value
 * is not something finalize returns; guessing a verdict from it would be worse
 * than saying nothing, so it says why instead.
 *
 * @param {string|null} labelAssigned
 * @returns {{event: string|null, reason: string|null}}
 */
function selectVerdictEvent(labelAssigned) {
  if (labelAssigned === null) {
    return {
      event: null,
      reason: 'Nothing announced: finalize reported labelAssigned null — the label swap failed (#2694), '
        + 'so announcing a verdict would report an outcome that did not happen.',
    };
  }
  if (!hasOwn(VERDICT_BY_LABEL, labelAssigned)) {
    return {
      event: null,
      reason: `Nothing announced: labelAssigned ${JSON.stringify(labelAssigned)} is not a value finalize `
        + 'returns (reviewed, pending or null), so no verdict is guessed from it.',
    };
  }
  return { event: VERDICT_BY_LABEL[labelAssigned], reason: null };
}

/** Why `review-started` sends nothing under `--force` (rule 09 Step 1c). */
const FORCE_SUPPRESSION_REASON = 'review-started suppressed under --force: /resolve-review Step 4 re-enters '
  + '/review-issue with --force, and that resolution cycle is already announced, so this would describe a '
  + 'nested re-review as a fresh one. Nothing was sent. The verdict event that closes the review is not '
  + 'suppressed.';

/**
 * Bounded, per the #2469 spawn-timeout contract.
 *
 * Not a formality here. Both call sites run inside sequences that must not
 * stall: `deriveCommits` is invoked from the Step 6 STOP sequence, and the
 * verifier from composition. `git log` on a large history and `git cat-file`
 * against a repository whose object store is mid-repack are both slow paths,
 * and an unbounded spawn in an advisory channel is the shape that turns it
 * into a gate — the one property this whole subsystem is built to avoid.
 */
const GIT_TIMEOUT_MS = 10000;

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd: cwd || process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: GIT_TIMEOUT_MS,
  });
}

/**
 * The refs a working branch may have been cut from, in lookup order.
 * `origin/HEAD` is resolved first and prepended when it exists.
 */
const BASE_REF_CANDIDATES = Object.freeze(['origin/main', 'origin/master', 'main', 'master']);

/**
 * Where this branch left the default branch — the lower bound of the commit
 * range a `work-completed` may name (#2888).
 *
 * Observed: `Finished on #2873 — 2 commits`, one from this run and one
 * (`e25996f2`) already merged to main and shipped in v0.102.0 before the
 * branch existed. The search ran over ALL history, so any issue touched in an
 * earlier session had its old commits announced as if they had just landed.
 * Object-store verification cannot catch it: both identifiers are real.
 *
 * The merge-base with the DEFAULT branch, not `@{upstream}`: a working
 * branch's upstream is itself, pushed, so `@{u}..HEAD` would drop this run's
 * commits the moment an earlier `/done` pushed them — the opposite error.
 *
 * Every candidate that resolves is measured and the NEAREST merge-base wins.
 * A stale local `main` gives an older merge-base than a fetched `origin/main`,
 * and the commits between the two — released ones included — would fall back
 * inside the range. The nearest branch point is never too wide.
 *
 * No candidate resolves → `ok: false`. The fallback is NOT all history: that
 * is the defect, and a named-nothing announcement with a warning is honest
 * where an unbounded one is not.
 */
function resolveCommitBase(options = {}) {
  const { cwd } = options;
  const refs = [];
  try {
    const sym = git(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], cwd).trim();
    if (sym) refs.push(sym.replace(/^refs\/remotes\//, ''));
  } catch { /* no origin/HEAD — the fixed candidates still apply */ }
  for (const ref of BASE_REF_CANDIDATES) if (!refs.includes(ref)) refs.push(ref);

  let nearest = null;
  for (const ref of refs) {
    try {
      git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd);
      const base = git(['merge-base', 'HEAD', ref], cwd).trim();
      if (!base) continue;
      const distance = Number(git(['rev-list', '--count', `${base}..HEAD`], cwd).trim());
      if (!Number.isFinite(distance)) continue;
      if (!nearest || distance < nearest.distance) nearest = { base, ref, distance };
    } catch {
      // Ref absent, or no common history with HEAD — not a candidate.
    }
  }

  if (!nearest) {
    return {
      ok: false,
      error: `no base branch could be resolved (looked for ${refs.join(', ')}), so commits were not searched `
        + '— an unbounded search would name commits from earlier runs (#2888)',
    };
  }
  return { ok: true, base: nearest.base, ref: nearest.ref };
}

/**
 * The commit set for one issue, straight out of git.
 *
 * `execFileSync` with an argument array, never a shell string: the grep
 * pattern carries BRE metacharacters (`\(`, `\|`) and a shell would be a
 * second place for them to be mangled — and an injection surface for anything
 * that ever reaches this with a non-numeric issue. `issueRefGrepPattern`
 * throws on a non-numeric issue, which is caught below.
 *
 * TWO BOUNDARIES, and they are not the same thing. The ISSUE-NUMBER boundary
 * comes from the shared helper (#2467): an unanchored grep makes `Refs #116`
 * collect every `Refs #1169`. The COMMIT-RANGE boundary is `<base>..HEAD` from
 * `resolveCommitBase` (#2888): without it a correctly anchored grep still
 * collects the same issue's commits from earlier, already-released runs. This
 * comment once said "boundary-anchored" of the first alone, which read as if
 * the range were bounded when it was not.
 */
function deriveCommits(issue, options = {}) {
  try {
    const pattern = issueRefGrepPattern(issue);
    const boundary = resolveCommitBase(options);
    if (!boundary.ok) {
      return { ok: false, commits: [], shas: [], error: boundary.error };
    }
    const range = `${boundary.base}..HEAD`;
    const raw = git(['log', '--oneline', `--grep=${pattern}`, range], options.cwd);
    const commits = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    return {
      ok: true,
      commits,
      shas: commits.map((l) => l.split(/\s+/)[0]).filter(Boolean),
      base: boundary.base,
      baseRef: boundary.ref,
      range,
    };
  } catch (err) {
    return {
      ok: false,
      commits: [],
      shas: [],
      error: err && err.message ? err.message : 'git log failed',
    };
  }
}

/**
 * A predicate that answers "is this identifier a commit in this repository".
 *
 * Handed to `buildAnnouncement` as `verifyCommit`, which is the injection seam
 * that keeps the spawn out of the pure composer.
 *
 * Near-tautological on the derived path — git named them — and kept anyway for
 * two reasons: it also guards a caller-supplied list, and it is the assertion
 * a test can make against a real object store rather than against a fixture
 * array, which AC4 requires and #2671 is the precedent for.
 *
 * `git cat-file -t` rather than `rev-parse`: `rev-parse` resolves refs and
 * would answer true for a branch name that happens to look like a sha prefix.
 */
function makeCommitVerifier(options = {}) {
  return function verifyCommit(sha) {
    if (typeof sha !== 'string' || !/^[0-9a-f]{4,40}$/i.test(sha.trim())) return false;
    try {
      return git(['cat-file', '-t', sha.trim()], options.cwd).trim() === 'commit';
    } catch {
      return false;
    }
  };
}

/**
 * The envelope for a decision to send nothing.
 *
 * Same shape as a composed one, so a caller reading `announcement.shouldSend`
 * and `announcement.notice` needs no second branch, plus `suppressed` and
 * `reason` at the top so the decision is visible without parsing a notice.
 * Nothing is recorded: nothing was composed, so there is no dispatch to audit.
 */
function suppressedResult({ event, issue, reason, warnings }) {
  return {
    ok: true,
    event,
    issue,
    suppressed: true,
    reason,
    commitSource: 'not-applicable',
    announcement: {
      shouldSend: false,
      event,
      issues: issue === null || issue === undefined ? [] : [issue],
      commitCount: 0,
      text: '',
      recipients: [],
      skipped: [],
      terminal: false,
      degraded: false,
      notice: reason,
    },
    ledgerId: null,
    dispatchReport: 'Nothing was composed, so there is no dispatch outcome to record.',
    warnings,
  };
}

/**
 * Derive, verify, compose and record — one call, so none of the four can be
 * skipped independently of the others.
 *
 * That coupling is the design. The recording is what makes AC3 answerable
 * after the fact, and a recording step the caller could omit separately would
 * fail exactly when the announcement step failed, which is the case it exists
 * to detect.
 *
 * `labelAssigned` replaces `event` for the review verdict (#2871): the caller
 * passes what finalize returned and this picks the event. Passing both is
 * refused — accepting an event beside the label would hand the choice back to
 * the caller. `force` suppresses `review-started` only.
 */
/**
 * The routing inputs for this working directory (#2915): the resolved
 * `broadcast` lever and the overwatch presence reading. Read here, not in
 * peer-announce.js, which stays pure. Any failure resolves to broadcast — the
 * behaviour every session had before routing existed.
 */
function readRouting(cwd) {
  try {
    const { readCrossSessionConfig } = require('./lib/cross-session-config.js');
    const state = readCrossSessionConfig(cwd || process.cwd());
    if (state.broadcast !== false) return { broadcast: true, presence: null };
    const { readPresence } = require('./lib/overwatch-presence.js');
    return { broadcast: false, presence: readPresence(cwd || process.cwd()) };
  } catch {
    return { broadcast: true, presence: null };
  }
}

/**
 * The owning Claude session's pid, for the ledger's `sessionPid` (#2896).
 *
 * `CLAUDE_PID`, the source `peers-check.js` and `overwatch-presence.js`
 * use to recognise their own session, so ledger pids match the startup
 * `Peers:` row — and the one that fixed the identical `/idpf-measure` defect
 * (#2796). Not `process.pid`: this script is a child spawned per
 * announcement, so its pid identifies nothing past its own exit.
 * `CLAUDE_CODE_SESSION_ID` was not chosen because the field is a pid, and
 * renaming it would strand ledgers already on disk.
 *
 * The env bag is injected. #2808 and #2809 are tests that read the ambient
 * `CLAUDE_PID`, passed inside a Claude Code session and failed in CI.
 *
 * Unset or not a positive integer → `null`, which the ledger records as
 * unidentified and `reconcile` never counts as a session.
 */
function resolveSessionPid(env = process.env) {
  const raw = env && env.CLAUDE_PID;
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const pid = Number(trimmed);
  return pid > 0 ? pid : null;
}

/**
 * Whether a branch-operation notice may be emitted (#2960): the master switch
 * alone. `groups` is deliberately not consulted — these events belong to none —
 * but the resolver's cascade still applies, so `enabled: false`,
 * `IDPF_X_SESSION=off` and `discovery: false` each silence them. Read through
 * the shared resolver, never re-derived: the discovery implication is the part
 * a local copy gets wrong. A resolver failure resolves to enabled, the same
 * answer as an absent key.
 */
function branchOperationGate(cwd, env) {
  let state;
  try {
    const { readCrossSessionConfig } = require('./lib/cross-session-config.js');
    state = readCrossSessionConfig(cwd || process.cwd(), env);
  } catch {
    return { emit: true, reason: null };
  }
  if (!state.enabled) {
    const cause = state.source === 'environment'
      ? `IDPF_X_SESSION=${state.envOverride && state.envOverride.value} (this session only)`
      : 'crossSessionMessaging enabled: false';
    return { emit: false, reason: `Nothing sent: cross-session messaging is off by the master switch (${cause}); branch-operation notices honour it.` };
  }
  if (!state.discovery) {
    return { emit: false, reason: 'Nothing sent: discovery is off, so no peers were discovered to broadcast a branch-operation notice to.' };
  }
  return { emit: true, reason: null };
}

/** Compose one branch-operation notice (#2960). */
function composeBranchOperation({ name, resolved, issue, branch, tag, peers, cwd, routing: suppliedRouting, env, warnings }) {
  const branchName = typeof branch === 'string' ? branch.trim() : '';
  if (!branchName) {
    return { ok: false, error: `${name} needs the branch it acts on — pass --branch <name>.`, warnings };
  }
  const tagName = typeof tag === 'string' ? tag.trim() : '';
  if (TAGGED_BRANCH_EVENTS.includes(name) && !tagName) {
    return { ok: false, error: `${name} names the tag it pushes — pass --tag <vX.Y.Z>.`, warnings };
  }
  let tracker = null;
  if (issue !== undefined && issue !== null) {
    tracker = Number(issue);
    if (!Number.isInteger(tracker) || tracker <= 0) {
      return { ok: false, error: `Invalid issue ${JSON.stringify(issue)}.`, warnings };
    }
  }

  const gate = branchOperationGate(cwd, env);
  if (!gate.emit) return suppressedResult({ event: name, issue: tracker, reason: gate.reason, warnings });

  const routingInputs = suppliedRouting && typeof suppliedRouting === 'object' ? suppliedRouting : readRouting(cwd);
  const announcement = buildAnnouncement({
    event: resolved,
    issues: tracker ? [tracker] : [],
    peers,
    branchOperation: { branch: branchName, tag: tagName || null, tracker },
    broadcast: routingInputs.broadcast,
    presence: routingInputs.presence,
  });

  const recorded = ledger.record(
    { event: name, issues: tracker ? [tracker] : [], branch: branchName },
    { cwd, sessionPid: resolveSessionPid(env) }
  );
  if (!recorded.ok) {
    warnings.push(`Announcement was not recorded to the ledger (${recorded.error}); its dispatch cannot be audited.`);
  }
  if (recorded.ok && announcement && typeof announcement.text === 'string' && announcement.text) {
    announcement.text = appendLedgerId(announcement.text, recorded.id);
  }

  return {
    ok: true,
    event: name,
    issue: tracker,
    branch: branchName,
    commitSource: 'not-applicable',
    routing: announcement.routing || null,
    announcement,
    ledgerId: recorded.ok ? recorded.id : null,
    dispatchReport: recorded.ok
      ? `After sending, close the outcome out: node .claude/scripts/shared/announce.js --dispatch-result sent|failed --ledger-id ${recorded.id} [--detail "<error>"]`
      : 'No ledger id — the dispatch outcome cannot be recorded for this event.',
    warnings,
  };
}

/**
 * Compose one push-group announcement (#2972).
 *
 * Takes `issues` as a list, the set `deriveAnnouncementIssues` produced over
 * the pushed range, because one push routinely carries several issues' commits
 * (#2772). A payload `buildAnnouncement` refuses (an unknown `ci-terminal`
 * outcome, a `ci-resolved` with no readable `ciResult`) is returned as refused
 * and NOT recorded. Nothing was composed, so there is no send to audit, and a
 * `pending` row would read as a dispatch that was dropped.
 */
function composePush({ name, resolved, issues, outcome, runUrl, ciResult, peers, cwd, routing: suppliedRouting, env, warnings }) {
  const list = (Array.isArray(issues) ? issues : [issues]).map(Number);
  if (list.length === 0 || !list.every((n) => Number.isInteger(n) && n > 0)) {
    return { ok: false, error: `${name} needs at least one valid issue number — got ${JSON.stringify(issues)}.`, warnings };
  }

  const routingInputs = suppliedRouting && typeof suppliedRouting === 'object' ? suppliedRouting : readRouting(cwd);
  const announcement = buildAnnouncement({
    event: resolved,
    issues: list,
    peers,
    outcome,
    runUrl,
    ciResult,
    broadcast: routingInputs.broadcast,
    presence: routingInputs.presence,
  });

  const composed = announcement && typeof announcement.text === 'string' && announcement.text !== '';
  let recorded = { ok: false, error: 'nothing was composed' };
  if (composed) {
    recorded = ledger.record({ event: name, issues: list }, { cwd, sessionPid: resolveSessionPid(env) });
    if (!recorded.ok) {
      warnings.push(`Announcement was not recorded to the ledger (${recorded.error}); its dispatch cannot be audited.`);
    } else {
      announcement.text = appendLedgerId(announcement.text, recorded.id);
    }
  }

  return {
    ok: true,
    event: name,
    issues: list,
    commitSource: 'not-applicable',
    routing: announcement.routing || null,
    announcement,
    ledgerId: recorded.ok ? recorded.id : null,
    dispatchReport: recorded.ok
      ? `After sending, close the outcome out: node .claude/scripts/shared/announce.js --dispatch-result sent|failed --ledger-id ${recorded.id} [--detail "<error>"]`
      : composed
        ? 'No ledger id — the dispatch outcome cannot be recorded for this event.'
        : 'Nothing was composed, so there is no dispatch outcome to record.',
    warnings,
  };
}

function compose({ event, issue, issues, peers, cwd, commits: supplied, force = false, labelAssigned, routing: suppliedRouting, env = process.env, branch, tag, outcome, runUrl, ciResult } = {}) {
  const warnings = [];
  const hasLabel = labelAssigned !== undefined;

  // The push group is keyed by an issue SET, not one issue (#2972).
  if (event && hasOwn(PUSH_EVENTS, event)) {
    if (hasLabel) {
      return { ok: false, error: 'Pass an event or a labelAssigned, not both.', warnings };
    }
    return composePush({
      name: event, resolved: PUSH_EVENTS[event], issues: issues !== undefined ? issues : issue,
      outcome, runUrl, ciResult, peers, cwd, routing: suppliedRouting, env, warnings,
    });
  }

  // Branch-operation notices are keyed by branch and gated differently (#2960),
  // so they take their own path before the issue-number checks below.
  if (event && hasOwn(BRANCH_EVENTS, event)) {
    if (hasLabel) {
      return { ok: false, error: 'Pass an event or a labelAssigned, not both.', warnings };
    }
    return composeBranchOperation({
      name: event, resolved: BRANCH_EVENTS[event], issue, branch, tag, peers, cwd, routing: suppliedRouting, env, warnings,
    });
  }

  if (event && hasLabel) {
    return {
      ok: false,
      error: 'Pass an event or a labelAssigned, not both — the verdict event is derived from the label, never chosen beside it.',
      warnings,
    };
  }

  const issueNumber = Number(issue);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    return { ok: false, error: `Invalid issue ${JSON.stringify(issue)}.`, warnings };
  }

  let name = event;
  if (!name && hasLabel) {
    const verdict = selectVerdictEvent(labelAssigned);
    if (!verdict.event) {
      return suppressedResult({ event: null, issue: issueNumber, reason: verdict.reason, warnings });
    }
    name = verdict.event;
  }

  const resolved = hasOwn(SUPPORTED, name) ? SUPPORTED[name] : undefined;
  if (!resolved) {
    return { ok: false, error: `Unsupported event ${JSON.stringify(name)} — expected one of ${Object.keys(SUPPORTED).join(', ')}.`, warnings };
  }

  if (resolved === EVENTS.REVIEW_STARTED && force) {
    return suppressedResult({ event: name, issue: issueNumber, reason: FORCE_SUPPRESSION_REASON, warnings });
  }

  let commits = [];
  let commitSource = 'not-applicable';
  if (resolved === EVENTS.WORK_COMPLETED) {
    if (Array.isArray(supplied)) {
      commits = supplied;
      commitSource = 'supplied';
      warnings.push(
        'Commit list was supplied rather than derived; every identifier is still verified against '
        + 'the object store, but completeness is the caller\'s claim, not this script\'s.'
      );
    } else {
      const derived = deriveCommits(issueNumber, { cwd });
      if (derived.ok) {
        commits = derived.commits;
        commitSource = 'derived';
      } else {
        commitSource = 'unavailable';
        warnings.push(`Commit list could not be derived from git (${derived.error}); announcing with no commits.`);
      }
    }
  }

  const routingInputs = suppliedRouting && typeof suppliedRouting === 'object'
    ? suppliedRouting
    : readRouting(cwd);

  const announcement = buildAnnouncement({
    event: resolved,
    issues: [issueNumber],
    commits,
    commitSource,
    peers,
    verifyCommit: makeCommitVerifier({ cwd }),
    broadcast: routingInputs.broadcast,
    presence: routingInputs.presence,
  });

  if (announcement.unresolvedCommits && announcement.unresolvedCommits.length > 0) {
    warnings.push(
      `${announcement.unresolvedCommits.length} identifier(s) did not resolve in this repository `
      + `and were not named: ${announcement.unresolvedCommits.join(', ')}.`
    );
  }

  const recorded = ledger.record({ event: name, issues: [issueNumber] }, { cwd, sessionPid: resolveSessionPid(env) });
  if (!recorded.ok) {
    warnings.push(`Announcement was not recorded to the ledger (${recorded.error}); pairing cannot be audited for this event.`);
  }

  // #2922: stamp the composed text with its ledger id, at the END of the first
  // line, so a /overwatch receipt reply can name the entry it received and
  // the sender can record it. Every existing consumer is unaffected: the
  // monitor classifies events by the start of the line.
  if (recorded.ok && announcement && typeof announcement.text === 'string') {
    announcement.text = appendLedgerId(announcement.text, recorded.id);
  }

  return {
    ok: true,
    event: name,
    issue: issueNumber,
    commitSource,
    // Where the announcement went and, for a fallback, why (#2915). Top-level
    // so a caller can tell a targeted send from "no peers" without parsing text.
    routing: announcement.routing || null,
    announcement,
    ledgerId: recorded.ok ? recorded.id : null,
    // AC3. The caller has one more thing to do after SendMessage returns, and
    // an instruction it can read is worth more than an instruction in a rule
    // file it may have compacted away.
    dispatchReport: recorded.ok
      ? `After sending, close the outcome out: node .claude/scripts/shared/announce.js --dispatch-result sent|failed --ledger-id ${recorded.id} [--detail "<error>"]`
      : 'No ledger id — the dispatch outcome cannot be recorded for this event.',
    warnings,
  };
}

/**
 * Record what became of the send.
 *
 * `failed` is the load-bearing case. The rule already said "if the send itself
 * fails, report it and proceed", and in the observed run nothing was reported
 * on either side — which is indistinguishable from a send that never happened.
 * Recording it makes the difference recoverable at Step 6a.
 */
function closeDispatch({ ledgerId, result, detail, cwd } = {}) {
  const updated = ledger.updateDispatch(ledgerId, { result, detail }, { cwd });
  if (!updated.ok) {
    return { ok: false, error: updated.error, report: `Dispatch outcome NOT recorded: ${updated.error}` };
  }
  const report = result === 'failed'
    ? `Peer announcement dispatch FAILED and was recorded${detail ? ` (${detail})` : ''}. Work continues — the channel is advisory.`
    : `Peer announcement dispatch recorded as ${result}.`;
  return { ok: true, report };
}

/**
 * Record a receipt reply against its ledger entry (#2922).
 *
 * Called by the session that RECEIVES the reply, which is usually after the
 * command that sent the announcement has ended — so this is an entry point of
 * its own rather than part of the compose path.
 */
function recordReceipt({ ledgerId, from, cwd } = {}) {
  const updated = ledger.updateReceipt(ledgerId, { from }, { cwd });
  if (!updated.ok) {
    return { ok: false, error: updated.error, report: `Receipt NOT recorded: ${updated.error}` };
  }
  return {
    ok: true,
    report: `Announcement received by ${from || 'the overwatch'} — recorded. This confirms that hop only; it claims nothing about sessions the monitor relays to.`,
  };
}

function parseArgs(argv) {
  const out = {
    event: null, issue: null, dispatchResult: null, ledgerId: null, receiptReceived: false, from: null,
    detail: null, force: false, schema: false, branch: null, tag: null, unrecognizedFlags: [],
    issues: null, outcome: null, runUrl: null, ciResultFile: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--event' && argv[i + 1]) out.event = argv[++i];
    else if (a === '--issue' && argv[i + 1]) out.issue = parseInt(argv[++i], 10);
    else if (a === '--dispatch-result' && argv[i + 1]) out.dispatchResult = argv[++i];
    else if (a === '--ledger-id' && argv[i + 1]) out.ledgerId = argv[++i];
    else if (a === '--receipt-received') out.receiptReceived = true;
    else if (a === '--from' && argv[i + 1]) out.from = argv[++i];
    else if (a === '--detail' && argv[i + 1]) out.detail = argv[++i];
    else if (a === '--branch' && argv[i + 1] !== undefined && !/^--/.test(argv[i + 1])) out.branch = argv[++i];
    else if (a === '--tag' && argv[i + 1] !== undefined && !/^--/.test(argv[i + 1])) out.tag = argv[++i];
    // The push group (#2972): the derived issue set, and each event's payload.
    else if (a === '--issues' && argv[i + 1] !== undefined && !/^--/.test(argv[i + 1])) {
      out.issues = argv[++i].split(',').map((s) => s.trim().replace(/^#/, '')).filter(Boolean).map((s) => Number(s));
    }
    else if (a === '--outcome' && argv[i + 1] !== undefined && !/^--/.test(argv[i + 1])) out.outcome = argv[++i];
    else if (a === '--run-url' && argv[i + 1] !== undefined && !/^--/.test(argv[i + 1])) out.runUrl = argv[++i];
    else if (a === '--ci-result-file' && argv[i + 1] !== undefined && !/^--/.test(argv[i + 1])) out.ciResultFile = argv[++i];
    else if (a === '--force') out.force = true;
    // finalize's labelAssigned, verbatim. The literal `null` is the #2694
    // failed-swap value, so it is read as null rather than as a label named
    // "null". A following flag is never swallowed as the value.
    else if (a === '--label-assigned' && argv[i + 1] !== undefined && !/^--/.test(argv[i + 1])) {
      const value = argv[++i];
      out.labelAssigned = value === 'null' ? null : value;
    }
    else if (a === '--schema') out.schema = true;
    // Reported, never silently dropped — `02-github-workflow.md`'s pass-through
    // convention at the script layer. A dropped flag narrows the result with
    // nothing for the user to notice.
    else if (/^--[a-zA-Z]/.test(a)) out.unrecognizedFlags.push(a);
  }

  // The three entry points that are not a composition: they carry a ledger id,
  // not an event, so the event/issue validation below does not apply to them.
  if (out.schema || out.dispatchResult || out.receiptReceived) return out;

  const hasLabel = Object.prototype.hasOwnProperty.call(out, 'labelAssigned');
  if (out.event && hasLabel) {
    return { ...out, error: 'Pass --event or --label-assigned, not both — the verdict event is derived from the label.' };
  }
  if (!out.event && !hasLabel) {
    return { ...out, error: `Missing --event <${Object.keys(SUPPORTED).join('|')}> or --label-assigned <reviewed|pending|null>.` };
  }
  if (out.event && !hasOwn(SUPPORTED, out.event)) {
    return { ...out, error: `Unsupported --event ${JSON.stringify(out.event)} — expected one of ${Object.keys(SUPPORTED).join(', ')}.` };
  }
  // A push-group event is keyed by the derived issue set (#2972). --issue is
  // accepted as a one-issue set.
  if (out.event && hasOwn(PUSH_EVENTS, out.event)) {
    if (!out.issues && out.issue && !Number.isNaN(out.issue)) out.issues = [out.issue];
    if (!out.issues || out.issues.length === 0 || out.issues.some((n) => !Number.isInteger(n) || n <= 0)) {
      return { ...out, error: `Missing or invalid --issues <N,N,...> for ${out.event} — pass the set deriveAnnouncementIssues returned.` };
    }
    if (out.event === 'ci-terminal' && !out.outcome) {
      return { ...out, error: 'Missing --outcome <armed|armed-degraded|skipped-no-workflows|skipped-paths-ignore> for ci-terminal.' };
    }
    if (out.event === 'ci-resolved' && !out.ciResultFile) {
      return { ...out, error: 'Missing --ci-result-file <path> for ci-resolved — write ci-watch.js stdout to a file, unaltered.' };
    }
    return out;
  }
  // A branch-operation notice is keyed by branch; --issue names its tracker
  // when there is one (#2960).
  if (out.event && hasOwn(BRANCH_EVENTS, out.event)) {
    if (!out.branch) return { ...out, error: `Missing --branch <name> for ${out.event}.` };
    if (out.issue !== null && Number.isNaN(out.issue)) return { ...out, error: 'Invalid --issue <number>.' };
    return out;
  }
  if (!out.issue || Number.isNaN(out.issue)) return { ...out, error: 'Missing or invalid --issue <number>.' };
  return out;
}

function readPeers(cwd) {
  try {
    const { checkPeers } = require('./peers-check.js');
    const result = checkPeers({ cwd: cwd || process.cwd() });
    return { peers: result.peers || [], warnings: [] };
  } catch (err) {
    return { peers: [], warnings: [`Peers could not be discovered (${err && err.message ? err.message : 'unknown'}); composing with no recipients.`] };
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.schema) {
    process.stdout.write(JSON.stringify({
      usage: [
        'announce.js --event work-started|work-completed --issue <N>',
        'announce.js --event review-started|review-resolved --issue <N> [--force]',
        'announce.js --label-assigned reviewed|pending|null --issue <N>   (the review verdict: finalize\'s labelAssigned selects review-passed, review-findings or nothing)',
        'announce.js --event branch-merge-starting|branch-destroy-starting --branch <name> [--issue <tracker>]   (forced broadcast, master switch only — #2960)',
        'announce.js --event beta-starting|release-starting --branch <name> --tag <vX.Y.Z> [--issue <tracker>]',
        'announce.js --event push-started|push-rejected --issues <N,N,...>   (/done push group, routed like the work events — #2972)',
        'announce.js --event ci-terminal --issues <N,N,...> --outcome armed|armed-degraded|skipped-no-workflows|skipped-paths-ignore [--run-url <url>]',
        'announce.js --event ci-resolved --issues <N,N,...> --ci-result-file <path to ci-watch.js stdout, unaltered>',
        'announce.js --dispatch-result sent|failed|skipped --ledger-id <id> [--detail "<text>"]',
        'announce.js --receipt-received --ledger-id <id> [--from <monitor session name>]   (a /overwatch receipt reply arrived for that announcement)',
      ],
      envelope: {
        ok: 'boolean',
        event: 'string|null — the event composed; null when a labelAssigned selected none',
        suppressed: 'true when the script decided to send nothing (review-started under --force, labelAssigned null or unrecognised)',
        reason: 'string — why nothing was sent, when suppressed',
        commitSource: 'derived | supplied | unavailable | not-applicable',
        routing: '{broadcast, applied: broadcast|targeted, monitorPid, monitorName, fallbackReason} — where the announcement went (#2915)',
        announcement: 'the peer-announce.js envelope, including text, recipients, shouldSend, notice, verified, unresolvedCommits',
        ledgerId: 'string|null — pass back with --dispatch-result',
        receipt: 'ledger axis beside dispatch: unconfirmed until a /overwatch receipt reply is recorded with --receipt-received, then received (#2922)',
        dispatchReport: 'the exact command that closes the dispatch outcome out',
        warnings: 'string[] — relay verbatim',
      },
    }, null, 2) + '\n');
    process.exit(0);
  }

  if (args.error) {
    process.stderr.write(args.error + '\n');
    process.exit(2);
  }

  if (args.receiptReceived) {
    const result = recordReceipt({ ledgerId: args.ledgerId, from: args.from });
    process.stdout.write(JSON.stringify({ ...result, unrecognizedFlags: args.unrecognizedFlags }, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
  }

  if (args.dispatchResult) {
    const result = closeDispatch({
      ledgerId: args.ledgerId, result: args.dispatchResult, detail: args.detail,
    });
    process.stdout.write(JSON.stringify({ ...result, unrecognizedFlags: args.unrecognizedFlags }, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
  }

  const { peers, warnings: peerWarnings } = readPeers();
  const input = { event: args.event, issue: args.issue, peers, force: args.force, branch: args.branch, tag: args.tag };
  if (args.event && hasOwn(PUSH_EVENTS, args.event)) {
    input.issues = args.issues;
    input.outcome = args.outcome || undefined;
    input.runUrl = args.runUrl || undefined;
    if (args.ciResultFile) {
      // ci-watch.js stdout, unaltered (#2892). An unreadable file is passed as
      // no result, which buildAnnouncement refuses by name rather than
      // announcing the run as unreadable.
      try {
        input.ciResult = JSON.parse(require('fs').readFileSync(args.ciResultFile, 'utf8'));
      } catch (err) {
        peerWarnings.push(`CI result file ${args.ciResultFile} could not be read as JSON (${err.message}).`);
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(args, 'labelAssigned')) input.labelAssigned = args.labelAssigned;
  const result = compose(input);
  result.warnings = [...peerWarnings, ...result.warnings];
  if (args.unrecognizedFlags.length > 0) {
    result.warnings.push(`Unrecognized flag(s) ignored: ${args.unrecognizedFlags.join(', ')}.`);
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) main();

module.exports = {
  SUPPORTED,
  readRouting,
  REVIEW_EVENTS,
  BRANCH_EVENTS,
  PUSH_EVENTS,
  branchOperationGate,
  VERDICT_BY_LABEL,
  selectVerdictEvent,
  resolveSessionPid,
  resolveCommitBase,
  deriveCommits,
  makeCommitVerifier,
  compose,
  closeDispatch,
  recordReceipt,
  parseArgs,
};
