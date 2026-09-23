#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.106.0
 * @description Compose peer announcements for /work and /done lifecycle events and resolve which discovered peers can receive them. Composition only — delivery is the SendMessage tool call the command spec instructs, because slash commands can call tools and this helper cannot. Pure and synchronous: no socket, no spawn, no filesystem write, and no path that can throw into the sequence that called it.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

/**
 * WHY THIS HELPER DOES NOT SEND ANYTHING (#2662, settled by #2660).
 *
 * `SendMessage` is a *tool*. Slash commands can call tools; a Node subprocess
 * cannot. So the command spec performs delivery and this helper decides only
 * *what* to say and *to whom*.
 *
 * This was originally a split of convenience, with `ci-watch.js` expected to
 * gain a socket transport for event 4. The #2660 spike REFUTED that: six
 * candidate `message` shapes were each accepted by the server — held open,
 * zero bytes back, no error — and the recipient received none of them. So
 * there is no second delivery path to build, and every event in this file is
 * delivered the same way, by a slash command calling the tool.
 *
 * The split is what makes "fire-and-forget" (AC5) a structural property rather
 * than a promise: there is no delivery call here to block on, and no handle to
 * await. It is also what makes AC7 cheap — a composer with no I/O has almost
 * nothing left to throw about, and what remains is caught at the boundary.
 */

/**
 * The skip notice must name WHY, and there are two independent whys (#2672).
 *
 * Shared with `peers-check.js` rather than restated here: this notice once
 * hardcoded "carry no messaging address" for every skipped peer, including
 * headless `-p` sessions that HAVE an address and are merely absent from
 * `ListAgents`. A relative require under `shared/lib`, per the runtime
 * dependency contract — never an external package.
 */
const { summarizeUnreachable } = require('./lib/peer-unreachable-reasons.js');
// Pure routing decision (#2915). The presence reading and the resolved lever are
// SUPPLIED by the caller, so this module still reads no file and spawns nothing.
const { routeRecipients, ROUTED_SKIP_REASON } = require('./lib/announce-routing.js');

/**
 * One classification of a run conclusion, shared with the producer (#2892).
 * `formatCiResolved` names failing workflows by the same rule `ci-watch.js`
 * uses to compute `overall`, so the sentence and the verdict cannot disagree.
 * ci-watch.js runs its CLI only under `require.main === module`, so requiring
 * it has no side effect.
 */
const { classifyConclusion } = require('./ci-watch.js');

const EVENTS = Object.freeze({
  WORK_STARTED: 'work-started',
  WORK_COMPLETED: 'work-completed',
  PUSH_STARTED: 'push-started',
  CI_TERMINAL: 'ci-terminal',
  PUSH_REJECTED: 'push-rejected',
  // The review half of the workflow (#2695). The five events above cover
  // /work -> /done -> CI, so a peer could see an issue being IMPLEMENTED
  // but not REVIEWED — even though a review rewrites the labels and body
  // markers that /work Step 3 Review-State Gate reads before it starts.
  REVIEW_STARTED: 'review-started',
  REVIEW_RESOLVED: 'review-resolved',
  // The review half's only TERMINAL closer (#2722). `review-started` and
  // `review-resolved` are non-terminal on purpose and stay that way; this one
  // describes the one review outcome that is settled rather than open-ended.
  REVIEW_PASSED: 'review-passed',
  // The other closer for `review-started`, and deliberately NOT terminal
  // (#2781). Every review ends `reviewed` or `pending`, and until this event
  // the second ending emitted nothing at all — so a peer that heard a review
  // begin heard silence indefinitely, in a vocabulary where silence already
  // means three incompatible things (#2674). Observed three times in one
  // /overwatch session, on #2777, #2769 and #2774.
  //
  // #2722 declined this and its reason is ANSWERED, not overridden: "adding
  // one would assert a completeness the sender cannot have." True of a
  // TERMINAL pending event; untrue of a non-terminal one. Closing an opener
  // and promising what follows are separate axes — #2716 already separated
  // them when it moved `armed` out of the terminal outcomes so a follow-up
  // could come. The sender knows the review finished and found something;
  // whether resolution follows is left open, which is exactly #2722's point
  // about `pending` being open-ended, preserved rather than contradicted.
  REVIEW_FINDINGS: 'review-findings',
  // The CI half's real closer (#2716). Before this, the outcome reached
  // exactly ONE session — the one that armed the watch, via its own
  // background-task notification — while every other session in the working
  // directory was told a run was coming and then told, correctly, that nothing
  // more would be said. Observed twice on real pushes (2026-08-31), where a
  // second session had to volunteer a duplicate watch to learn the result at
  // all. Both happened to be green, which is the point: a red run would have
  // been just as silent, and /work defers every push to /done so one push
  // carries whatever issues are in flight across every session.
  //
  // This does NOT reopen #2660. `ci-watch.js` still cannot send. The emitter
  // is the ARMING SESSION, which is back in a command context — with
  // `SendMessage` available — when its background task completes.
  CI_RESOLVED: 'ci-resolved',
  // Scratch board fixtures exist (#2827). /qa outcome 3 can provision the
  // issues a manual check declares under `### Fixtures`, behind consent, and
  // then hand off to /work on them. Between those two moments a peer in the
  // same working directory sees a fresh `ready` epic with unreviewed children
  // — exactly what a session looking for work would pick up. The event names
  // the numbers so a receiver leaves them alone. Non-terminal: a teardown
  // follows on PASS, or a FAIL leaves them standing as the reproduction, and
  // the sender cannot promise which.
  FIXTURES_PROVISIONED: 'fixtures-provisioned',
  // Branch-operation notices (#2960). The four commands that change what every
  // session in the directory is standing on — a merge to main, a tag push, a
  // branch deletion — announce before their first irreversible step. One name
  // per command because /overwatch classifies by event NAME and never parses a
  // payload field. Routed as a FORCED broadcast (announce-routing.js), so a
  // working peer hears it directly rather than through a monitor whose relay
  // vocabulary has no such message. Record-only and non-pairing: a notice, not
  // an opener, so no peer is left holding one; none is terminal, because
  // finality at send would assert an operation that has not happened yet.
  BRANCH_MERGE_STARTING: 'branch-merge-starting',
  BETA_STARTING: 'beta-starting',
  RELEASE_STARTING: 'release-starting',
  BRANCH_DESTROY_STARTING: 'branch-destroy-starting',
});

/** The events above that are branch-operation notices; mirrors announce-ledger.js. */
const BRANCH_OPERATION_EVENTS = new Set([
  EVENTS.BRANCH_MERGE_STARTING,
  EVENTS.BETA_STARTING,
  EVENTS.RELEASE_STARTING,
  EVENTS.BRANCH_DESTROY_STARTING,
]);

/** Branch operations that act on a tag, so a notice without one cannot name its step. */
const TAGGED_BRANCH_OPERATIONS = new Set([EVENTS.BETA_STARTING, EVENTS.RELEASE_STARTING]);

/**
 * Outcomes the terminal event can carry (#2663).
 *
 * EVERY event 3 must be followed by exactly one terminal event, on every path.
 * `armed` is terminal too — and that is the consequence of the #2660
 * refutation, not an oversight. `ci-watch.js` is neither a slash command nor a
 * hook, so it cannot call `SendMessage`, and the raw-socket send was refuted:
 * six candidate shapes were all accepted by the server and none delivered.
 * Nothing will ever follow the arming event, so it says so rather than leaving
 * a peer holding a promise that cannot be kept.
 */
const TERMINAL_OUTCOMES = Object.freeze({
  // Genuinely terminal: no watch was armed, so there is nothing that could
  // follow. These keep the finality wording unchanged.
  'skipped-no-workflows': { degraded: false, terminal: true },
  'skipped-paths-ignore': { degraded: false, terminal: true },
  // No longer terminal (#2716). A `ci-resolved` may follow these, so claiming
  // otherwise is a promise the channel now breaks. Leaving the old wording in
  // place while adding a follow-up would be WORSE than the gap it fixes: a
  // peer told nothing follows, then sent something, learns the announcements
  // cannot be trusted.
  armed: { degraded: false, terminal: false },
  'armed-degraded': { degraded: true, terminal: false },
});

const KNOWN_EVENTS = new Set(Object.values(EVENTS));

// ─── Recipients ───

/**
 * Split discovered peers into those that can receive and those that cannot.
 *
 * Availability is evaluated **per peer**. A session launched with
 * `DO_NOT_TRACK=1` registers normally and carries no messaging address; it is a
 * real peer worth naming and cannot be sent to. Treating the set as all-or-
 * nothing is the failure this split exists to prevent: one unaddressable peer
 * must never suppress an announcement the others could have received.
 */
function resolveRecipients(peers) {
  const recipients = [];
  const skipped = [];

  if (!Array.isArray(peers)) return { recipients, skipped };

  for (const p of peers) {
    // A malformed entry is skipped, never fatal — the registry is undocumented
    // internal state and its shape is not ours to rely on.
    if (!p || typeof p !== 'object' || !Number.isFinite(Number(p.pid))) continue;
    (p.addressable === true ? recipients : skipped).push(p);
  }

  return { recipients, skipped };
}

// ─── Formatters ───

function describeIssues(issues) {
  return issues.map((n) => `#${n}`).join(', ');
}

function formatWorkStarted({ issues }) {
  return `Starting work on ${describeIssues(issues)} in this working directory.`;
}

/**
 * One commit entry to the identifier a peer can act on.
 *
 * Returns '' for anything unusable so the caller can distinguish "no entry
 * yielded an identifier" from "there were no commits" — two different facts
 * that the old `.filter(Boolean)` collapsed into the same empty string.
 */
function commitLabel(entry) {
  if (typeof entry === 'string') {
    return entry.trim().split(/\s+/)[0] || '';
  }
  if (entry && entry.sha) {
    return String(entry.sha);
  }
  return '';
}

/**
 * THE `commits` CONTRACT (#2671). One shape, and it is the caller's.
 *
 * `commits` is an array of `git log --oneline` LINES — strings whose first
 * whitespace-delimited token is the abbreviated sha:
 *
 *   ['eaebf883 Refs #2662 - peer-announce composer', ...]
 *
 * That is what every real caller produces, because every caller is a slash
 * command: `/work` Step 6 and `/done` Step 2 build the list with
 * `git log --oneline --grep="Refs #N"`. A shell caller cannot cheaply hand a
 * Node helper an array of objects, so the object shape was never reachable
 * from production — it existed only in this file's own expectations and in the
 * test fixtures, which is why 237 tests passed while the only real caller
 * rendered an empty list behind a correct count.
 *
 * Entries that are `{ sha }` objects are still accepted. That is deliberate
 * tolerance, not a second contract: the failure being fixed here is an entry
 * VANISHING SILENTLY, so no plausible entry shape may map to nothing without
 * the sentence saying so.
 *
 * The empty case is the other half of this formatter (AC4).
 *
 * "Completed #2661" with an empty commit list reads as work that landed. It did
 * not, and a peer acting on that belief is exactly the misattribution this
 * epic exists to prevent. The zero case gets its own sentence rather than a
 * count of zero appended to the same one.
 */
/**
 * THE VERIFICATION SEAM (#2790). Injected, because this file may not spawn.
 *
 * Observed live: a `work-completed` named `0a08fd7f` — not a current object,
 * not a reflog entry, not dangling, so never a commit in that repository at
 * all — while the real second commit for the same issue (`e3ea5f02`) went
 * unnamed. The two share no prefix, so a transcription typo does not explain
 * it. A model-composed list does, and this helper had no means to falsify one:
 * `formatWorkCompleted` rendered whatever array it was handed.
 *
 * The obvious fix — check each sha against the object store here — collides
 * with the documented property at the top of this file: no spawn, and no path
 * that can throw into the sequence that called it. An advisory channel that
 * can fail a command has become a gate. So the check is a PREDICATE THE CALLER
 * SUPPLIES, and the spawn stays in `announce.js`, which is allowed one.
 *
 * Three outcomes, and they must stay distinguishable:
 *   - no predicate       -> `verified: false`. Wording unchanged, so a direct
 *                           caller sees no new prose; the envelope says the
 *                           claim is unchecked, which is what an auditor reads.
 *   - predicate threw    -> same as no predicate. A caller bug must not reach
 *                           the STOP sequence, and must not silently delete
 *                           identifiers either.
 *   - predicate answered -> `verified: true`, and anything it rejected is
 *                           NAMED IN THE ENVELOPE but not asserted in the text.
 *
 * Dropping an identifier silently would reproduce the defect one level along:
 * a peer cannot distinguish "there was one commit" from "there were two and we
 * declined to name one". So the sentence says the omission happened.
 */
function partitionCommits(list, verifyCommit) {
  const labels = list.map(commitLabel).filter(Boolean);
  if (typeof verifyCommit !== 'function') {
    return { verified: false, named: labels, unresolved: [] };
  }
  const named = [];
  const unresolved = [];
  try {
    for (const label of labels) {
      if (verifyCommit(label)) named.push(label);
      else unresolved.push(label);
    }
  } catch {
    // Unverified, not unnamed. A predicate that throws tells us nothing about
    // the shas, so falling back to "name none" would turn a caller bug into a
    // silently emptied announcement — #2671 by another route.
    return { verified: false, named: labels, unresolved: [] };
  }
  return { verified: true, named, unresolved };
}

/**
 * Appended when the commit list came from the caller rather than from git
 * (#2888). `verified` proves each named identifier exists, never that the list
 * is complete, and a peer reads only the prose — `announce.js`'s top-level
 * `commitSource` never reaches it. Absent or `derived` adds nothing, so every
 * existing sentence is unchanged.
 */
const SUPPLIED_COMMITS_CLAUSE = ' The commit list was supplied by the caller, not derived from git, so it may be incomplete.';

function formatWorkCompleted({ issues, commits, verifyCommit, commitPartition, commitSource }) {
  const sentence = composeWorkCompleted({ issues, commits, verifyCommit, commitPartition });
  return commitSource === 'supplied' ? `${sentence}${SUPPLIED_COMMITS_CLAUSE}` : sentence;
}

function composeWorkCompleted({ issues, commits, verifyCommit, commitPartition }) {
  const list = Array.isArray(commits) ? commits : [];
  const subject = describeIssues(issues);

  if (list.length === 0) {
    return `Finished on ${subject} with no commits — nothing landed in this working directory.`;
  }

  const { named, unresolved } = commitPartition || partitionCommits(list, verifyCommit);
  const plural = list.length === 1 ? 'commit' : 'commits';
  const head = `Finished on ${subject} — ${list.length} ${plural} in this working directory`;

  // A count in front of an empty list is the #2671 defect verbatim: the
  // sentence ended in ": ." and named nothing. If no entry yields an
  // identifier, say that rather than trailing off. Two distinct causes now
  // land here and they are NOT the same fact: nothing parseable was handed in,
  // versus everything handed in failed to resolve against the object store.
  if (named.length === 0) {
    if (unresolved.length > 0) {
      return `${head}, but no identifier resolved in this repository; none is named.`;
    }
    return `${head} (commit identifiers unavailable).`;
  }

  const body = `${head}: ${named.join(', ')}.`;
  if (unresolved.length === 0) return body;

  const n = unresolved.length;
  return `${body} ${n} further ${n === 1 ? 'identifier' : 'identifiers'} did not resolve`
    + ` in this repository and ${n === 1 ? 'is' : 'are'} not named.`;
}

/**
 * Review lifecycle (#2695). Both state, never instruct — the receiver is
 * given a fact, not a task.
 *
 * Neither is terminal. A terminal event promises that nothing follows, and
 * these promise nothing either way: a review may be followed by
 * /resolve-review, by work, or by nothing at all. Marking them terminal
 * would assert a completeness the sender cannot know — clause 5.
 */
function formatReviewStarted({ issues }) {
  return `Reviewing ${describeIssues(issues)} in this working directory.`;
}

function formatReviewResolved({ issues }) {
  return `Resolving review findings on ${describeIssues(issues)} in this working directory.`;
}

/**
 * The review half's terminal event (#2722).
 *
 * The two formatters above are non-terminal because their outcome is
 * unknown, and that reasoning is correct for what they describe. It leaves
 * one outcome unannounced that is NOT open-ended: a review ending `Ready for
 * work`. There, something specific is true — the issue is available — and
 * without this event no peer is told, so the only way to learn it was to ask
 * the holding session and wait for a human-paced reply.
 *
 * Terminal, and it SAYS so. A `terminal: true` flag no reader of the message
 * ever sees is not a closer; the sentence is what lets a peer stop waiting.
 *
 * The `pending` counterpart is `formatReviewFindings` below, added by #2781.
 * It is NOT terminal, which is what reconciles it with the paragraph this
 * replaces: `pending` genuinely is open-ended — /resolve-review, abandonment
 * or nothing may follow — so its announcement closes the `review-started`
 * opener without claiming anything about what comes next.
 *
 * States, never instructs: availability is a fact about the issue, not a
 * task handed to the receiver. This event confers no claim and no ownership.
 */
function formatReviewPassed({ issues }) {
  return `Review passed on ${describeIssues(issues)} — Ready for work; available to be picked up in this working directory. No further announcement will follow.`;
}

/**
 * The pending verdict (#2781). Closes `review-started`; promises nothing.
 *
 * Wording carries three properties, each load-bearing:
 *
 *  - It states the review FINISHED, which is what closes the opener.
 *  - It states findings are UNRESOLVED, the fact worth sending: `/work`'s
 *    Step 3 Review-State Gate halts an unattended `--nonstop` run on exactly
 *    this state, so a peer that cannot learn the verdict cannot anticipate
 *    the halt.
 *  - It does NOT carry the "No further announcement will follow" sentence
 *    every terminal payload ends with. That omission is the whole of the
 *    #2722 reconciliation: resolution may follow, and claiming otherwise
 *    would be the completeness the sender cannot have.
 *
 * States, never instructs: no second-person direction, no task handed over.
 * The receiver is told what the board now says, not what to do about it.
 */
function formatReviewFindings({ issues }) {
  return `Review finished on ${describeIssues(issues)} — findings unresolved; the issue is not ready to be picked up. A resolution cycle may or may not follow.`;
}

function formatPushStarted({ issues }) {
  return `Pushing ${describeIssues(issues)} from this working directory.`;
}

/**
 * The terminal event. Wording is chosen so a peer can stop waiting.
 *
 * **It states, it never instructs.** An earlier draft ended "check the run
 * yourself" and was caught from the RECEIVING end during the #2659 E3 run: that
 * hands the receiver a task, which violates clause 1 of the governing principle
 * ("a peer message informs; it never instructs"). The URL is still carried —
 * removing the instruction must not remove the fact — but what the reader does
 * with it is the reader's business, not this message's.
 */
function formatCiTerminal({ issues, outcome, runUrl }) {
  const subject = describeIssues(issues);
  // Punctuation travels with the content it introduces (#2673). Held apart,
  // an absent runUrl left the colon introducing nothing: "CI is in progress:."
  const url = runUrl ? `: ${runUrl}` : '';
  switch (outcome) {
    case 'skipped-no-workflows':
      return `Pushed ${subject}. No CI will start — no push-triggered workflows. No further announcement will follow.`;
    case 'skipped-paths-ignore':
      return `Pushed ${subject}. No CI will start — every changed path matched paths-ignore. No further announcement will follow.`;
    // Clause 5 (#2679). This event fires at ARMING time, before any run is
    // known to exist — ci-watch.js has exit code 3 precisely for "no CI run
    // triggered", so the paths-ignore pre-check is a heuristic, not a
    // guarantee. With no URL the only fact available is that a watch was
    // armed; asserting a running build there is a dispatch decision rendered
    // as a claim about the world, the same shape as #2674. A URL means a run
    // demonstrably exists, so the stronger claim is earned rather than assumed.
    // The follow-up is stated as CONDITIONAL, never promised (#2716). It is
    // emitted by the arming session when its background task completes, and
    // that re-invocation is measured only for an interactive session — so the
    // wording commits to nothing it cannot keep, and says plainly that silence
    // is not a verdict. This is the #2674 dispatch-vs-delivery rule applied one
    // level up: the sender cannot observe whether the closer ever goes out.
    case 'armed-degraded':
      return runUrl
        ? `Pushed ${subject}. CI is in progress (degraded: the pushed range could not be resolved, so the watch may not match the push)${url}. ${FOLLOW_UP_CAVEAT}`
        : `Pushed ${subject}. A CI watch is armed (degraded: the pushed range could not be resolved, so the watch may not match the push); whether a run started is not known yet. ${FOLLOW_UP_CAVEAT}`;
    case 'armed':
    default:
      return runUrl
        ? `Pushed ${subject}. CI is in progress${url}. ${FOLLOW_UP_CAVEAT}`
        : `Pushed ${subject}. A CI watch is armed; whether a run started is not known yet. ${FOLLOW_UP_CAVEAT}`;
  }
}

/**
 * What the armed outcomes say instead of claiming finality (#2716).
 *
 * Held as a constant because both armed branches and their two runUrl variants
 * must say the SAME thing — four call sites, and a wording that drifts between
 * them is a wording a receiver cannot rely on.
 *
 * "Absence is not a verdict" is the load-bearing half. The arming session emits
 * the closer only if it is re-invoked when its background task completes; that
 * is measured for an interactive session and not established for a headless
 * one. A peer that reads silence as "green" has drawn exactly the conclusion
 * this channel must never license.
 */
const FOLLOW_UP_CAVEAT =
  'A result announcement follows if this session is re-invoked when the watch completes; '
  + 'that is not guaranteed, so the absence of one is not a verdict.';

/**
 * The CI closer (#2716).
 *
 * Carries what `ci-watch.js` already returns — `overall` plus `workflows[]`
 * with their `failedSteps[]` — so no new payload shape is invented for it.
 *
 * **A missing result never reads as success.** An absent payload and a green
 * one are different facts; rendering the first as the second is the #2674
 * shape, a dispatch decision presented as a claim about the world. It states
 * that the outcome could not be read, and stays terminal so the peer still
 * stops waiting.
 */
/**
 * `ci-watch.js` returns `failedSteps` as `{ name, conclusion }` objects, not
 * strings. Joining them directly rendered `Tests ([object Object])` on every
 * real red run — the step name is the one detail a peer cannot cheaply recover
 * itself, so losing it defeats the announcement. Both shapes are accepted:
 * the object form is what the producer emits, the string form is what callers
 * and older fixtures pass. An entry with no usable name is dropped rather than
 * stringified, so the wording degrades to the workflow name alone.
 */
function stepNames(failedSteps) {
  if (!Array.isArray(failedSteps)) return [];
  return failedSteps
    .map((step) => (typeof step === 'string' ? step : step && step.name))
    .filter((name) => typeof name === 'string' && name.length > 0);
}

/**
 * The `overall` values `formatCiResolved` can render truthfully (#2892).
 *
 * `buildAnnouncement` refuses every other value, so the formatter has no
 * fall-through: before this, anything not `success` reached the failure branch
 * and was announced as a terminal red — `cancelled` and `timeout` natively from
 * `ci-watch.js`, `no-run-found` from a translating caller. The next unmapped
 * value is refused loudly rather than announced wrongly.
 */
const CI_RESOLVED_OUTCOMES = Object.freeze(['success', 'failure', 'cancelled', 'timeout', 'no-run-found']);

/** Names of the workflows whose own conclusion classifies as `kind`. */
function workflowsClassifiedAs(workflows, kind) {
  return workflows
    .filter((w) => w && classifyConclusion(w.conclusion) === kind)
    .map((w) => String(w.name || 'unnamed workflow'));
}

function formatCiResolved({ issues, ciResult }) {
  const subject = describeIssues(issues);
  const result = ciResult && typeof ciResult === 'object' ? ciResult : null;

  if (!result || typeof result.overall !== 'string') {
    return `CI finished for ${subject}, but the outcome could not be read. No further announcement will follow.`;
  }

  const workflows = Array.isArray(result.workflows) ? result.workflows : [];

  if (result.overall === 'success') {
    const names = workflows.map((w) => w && w.name).filter(Boolean);
    const detail = names.length > 0 ? ` (${names.join(', ')})` : '';
    return `CI passed for ${subject}${detail}. No further announcement will follow.`;
  }

  // Only what was observed: no run appeared within the wait window. A branch
  // filter, paths-ignore or a disabled workflow are all possible and none was
  // established, so none is named.
  if (result.overall === 'no-run-found') {
    return `No CI run was found for ${subject} within the wait window; the cause was not determined. No further announcement will follow.`;
  }

  if (result.overall === 'cancelled') {
    const names = workflowsClassifiedAs(workflows, 'cancelled');
    const detail = names.length > 0 ? ` (${names.join(', ')})` : '';
    return `CI was cancelled for ${subject}${detail}; it was stopped before producing a result. No further announcement will follow.`;
  }

  // ci-watch's `timeout` is its watch deadline, not the run's result: the run
  // may still pass or fail, and this session will not observe which.
  if (result.overall === 'timeout') {
    const names = workflowsClassifiedAs(workflows, 'timeout');
    const detail = names.length > 0 ? ` (${names.join(', ')})` : '';
    return `The CI watch for ${subject} stopped waiting before the run finished${detail}; its result was not observed. No further announcement will follow.`;
  }

  // Naming the failed step is what makes a red actionable rather than merely
  // alarming — it is the one detail a peer cannot cheaply recover itself.
  const failures = workflows
    .filter((w) => w && classifyConclusion(w.conclusion) === 'failure')
    .map((w) => {
      const steps = stepNames(w.failedSteps);
      return steps.length > 0 ? `${w.name} (${steps.join(', ')})` : String(w.name || 'unnamed workflow');
    });

  const detail = failures.length > 0
    ? ` Failed: ${failures.join('; ')}.`
    : ' No failing workflow was named.';

  return `CI FAILED for ${subject}.${detail} No further announcement will follow.`;
}

/**
 * The correction. It must not imply the work is gone — the commits are still
 * in the local tree, and a peer told otherwise may take destructive action.
 */
function formatPushRejected({ issues }) {
  return `Correction: ${describeIssues(issues)} did NOT land — the push was rejected non-fast-forward. The commits remain local; nothing reached the remote.`;
}

/**
 * Scratch fixtures on the board (#2827). States three facts a peer needs to
 * not act on them: which numbers, that they are scratch, and that a /work run
 * on them is expected from the provisioning session. It instructs only in the
 * negative — "do not pick them up" — because that is the one action a peer
 * could take that damages the check.
 */
function formatFixturesProvisioned({ issues, fixtures }) {
  const qa = describeIssues(issues);
  const numbers = fixtures.numbers.map((n) => `#${n}`);
  let set;
  let target;
  if (fixtures.shape === 'tree' && Number.isFinite(Number(fixtures.root))) {
    const children = numbers.filter((n) => n !== `#${fixtures.root}`);
    set = children.length
      ? `#${fixtures.root} with sub-issues ${children.join(', ')}`
      : `#${fixtures.root}`;
    target = `#${fixtures.root}`;
  } else {
    set = `${numbers.join(', ')} (a selection)`;
    target = numbers.join(' ');
  }
  return `Scratch fixtures provisioned for QA ${qa} in this working directory: ${set}. `
    + `Not real work items — do not pick them up. A /work run on ${target} is expected next from the session that created them; `
    + '/qa tears them down once the check is recorded.';
}

/**
 * Branch-operation notices (#2960).
 *
 * Each names the command, the branch and every irreversible step it is about
 * to take, because the step is what a peer on that branch needs: a commit made
 * after a merge or a deletion is stranded. `/merge-branch` names the remote
 * deletion its Step 3.3 performs, not only the merge — the deletion is the step
 * that strands a peer's later push.
 *
 * States, never instructs, and never claims the operation happened: each is
 * "about to", and each ends by saying no follow-up is sent whether or not the
 * operation completes. That sentence is about the CHANNEL, not about finality —
 * a peer must not wait for a closer that record-only events never send.
 */
const BRANCH_NOTICE_TAIL = 'One-time notice: no follow-up announcement is sent, whether or not the operation completes.';

function trackerClause(op) {
  return Number.isInteger(Number(op.tracker)) && Number(op.tracker) > 0 ? ` #${Number(op.tracker)}` : '';
}

function formatBranchMergeStarting({ branchOperation: op }) {
  const b = `\`${op.branch}\``;
  return `/merge-branch is about to merge ${b} into main, close its branch tracker${trackerClause(op)}, `
    + `and delete ${b} on the remote and locally, in this working directory. `
    + `A commit made on ${b} after this point does not reach main through this merge. ${BRANCH_NOTICE_TAIL}`;
}

function formatBetaStarting({ branchOperation: op }) {
  return `/prepare-beta is about to push tag \`${op.tag}\` from \`${op.branch}\` in this working directory; `
    + `the branch is not merged to main. ${BRANCH_NOTICE_TAIL}`;
}

function formatReleaseStarting({ branchOperation: op }) {
  const b = `\`${op.branch}\``;
  return `/prepare-release is about to merge ${b} into main, close its branch tracker${trackerClause(op)}, `
    + `push tag \`${op.tag}\` — which starts the distribution deploy — and then delete ${b} on the remote and locally, `
    + `in this working directory. ${BRANCH_NOTICE_TAIL}`;
}

function formatBranchDestroyStarting({ branchOperation: op }) {
  const b = `\`${op.branch}\``;
  return `/destroy-branch is about to delete ${b} on the remote and locally — commits not merged to main are discarded — `
    + `close its branch tracker${trackerClause(op)} as not planned, and remove its release artifacts, `
    + `in this working directory. ${BRANCH_NOTICE_TAIL}`;
}

const FORMATTERS = Object.freeze({
  [EVENTS.WORK_STARTED]: formatWorkStarted,
  [EVENTS.WORK_COMPLETED]: formatWorkCompleted,
  [EVENTS.PUSH_STARTED]: formatPushStarted,
  [EVENTS.CI_TERMINAL]: formatCiTerminal,
  [EVENTS.CI_RESOLVED]: formatCiResolved,
  [EVENTS.PUSH_REJECTED]: formatPushRejected,
  [EVENTS.REVIEW_STARTED]: formatReviewStarted,
  [EVENTS.REVIEW_RESOLVED]: formatReviewResolved,
  [EVENTS.REVIEW_PASSED]: formatReviewPassed,
  [EVENTS.REVIEW_FINDINGS]: formatReviewFindings,
  [EVENTS.FIXTURES_PROVISIONED]: formatFixturesProvisioned,
  [EVENTS.BRANCH_MERGE_STARTING]: formatBranchMergeStarting,
  [EVENTS.BETA_STARTING]: formatBetaStarting,
  [EVENTS.RELEASE_STARTING]: formatReleaseStarting,
  [EVENTS.BRANCH_DESTROY_STARTING]: formatBranchDestroyStarting,
});

/**
 * Events after which no peer should still be waiting.
 *
 * REVIEW_PASSED joins the CI/push terminals; REVIEW_STARTED, REVIEW_RESOLVED
 * and REVIEW_FINDINGS deliberately do not (#2722, #2781). The asymmetry is
 * the feature: making the review events agree would delete the only terminal
 * closer the review half has.
 *
 * REVIEW_FINDINGS is the case that shows membership here is about FINALITY,
 * not about closing an opener (#2781). It closes `review-started` exactly as
 * REVIEW_PASSED does, and is absent from this set because a resolution cycle
 * may follow it. A future edit adding it here would re-assert the
 * completeness #2722 correctly refused.
 */
// CI_TERMINAL remains a member because two of its four outcomes are still
// terminal; the per-outcome `terminal` flag in TERMINAL_OUTCOMES is what
// decides an individual armed announcement, and buildAnnouncement consults it.
// Membership here is a coarse "this event CAN close a cycle", not a promise
// that every instance does (#2716).
const TERMINAL_EVENTS = new Set([
  EVENTS.CI_TERMINAL,
  EVENTS.CI_RESOLVED,
  EVENTS.PUSH_REJECTED,
  EVENTS.REVIEW_PASSED,
]);

// ─── Composition ───

/**
 * WHY EVERY DISPATCH CARRIES A CAVEAT (#2674).
 *
 * A `/work` event-1 announcement was dispatched, held by the receiving
 * session because the two sessions' permission mode classes did not match, and
 * never delivered — while `shouldSend: true` and a successful `SendMessage`
 * led the sending session to report it as landed.
 *
 * The obvious fix — detect the mismatch and mark the peer unreachable — is
 * CLOSED, and that was settled by measurement rather than assumed. The session
 * registry exposes no permission, mode, bypass or approval field (19 fields
 * read across five live entries), `peerFeatures` is identical for every
 * session, and `ListAgents` surfaces only name, kind, status and start time.
 *
 * It is closed on principle too, not just today's field list. Recipient
 * disposition is a property of each SEND, resolved after the fact and
 * sometimes only by timeout — not an attribute of the PEER discoverable when
 * the registry is scanned. A denial is a decision and an expiry is silence,
 * yet both reach the sender as the same terminal "not delivered".
 *
 * So the helper stops claiming what it cannot know. The caveat names all three
 * outcomes because a narrower wording ("pending approval") would be false for
 * the expiry case, which is the one that resolves without anyone deciding
 * anything.
 */
const DISPATCH_CAVEAT = 'delivery is not confirmed — a receiving session may hold, decline, or let a message expire';

/**
 * Why targeted routing fell back to broadcast, as a clause (#2915). Keyed by
 * announce-routing.js FALLBACK_REASONS; the stale marker reasons are named
 * verbatim so the notice points at the same state the startup Peers row shows.
 */
function describeFallback(reason) {
  switch (reason) {
    case 'no-marker': return 'no live overwatch';
    case 'monitor-not-addressable': return 'the live overwatch is not an addressable peer';
    case 'monitor-name-ambiguous': return 'another peer shares the overwatch name, so it cannot be addressed safely';
    default: return `the overwatch marker is ${reason}`;
  }
}

/**
 * Name a malformed `peers` value precisely enough to locate the mistake (#2678).
 *
 * `typeof` alone reports "object" for an array-like, for the CLI envelope and
 * for `envelope.data` alike, which is the granularity that made the original
 * defect unreadable. Arrays never reach here — the caller checks first — so the
 * distinction that matters is envelope-shaped vs anything else.
 */
function describeMalformed(peers) {
  if (peers && typeof peers === 'object') {
    if (Object.prototype.hasOwnProperty.call(peers, 'data')) return 'the peers-check envelope';
    if (Object.prototype.hasOwnProperty.call(peers, 'peers')) return 'the peers-check result object';
    return 'an object';
  }
  return `a ${typeof peers}`;
}

function inert(notice) {
  return {
    shouldSend: false,
    event: null,
    issues: [],
    commitCount: 0,
    text: '',
    recipients: [],
    skipped: [],
    terminal: false,
    degraded: false,
    notice,
  };
}

/**
 * Compose one announcement.
 *
 * Returns a plain object every time. There is no throwing path: every failure
 * mode resolves to an inert result carrying a stated `notice`, because the
 * callers are `/work` Step 3 and Step 6 and `/done` Step 2, and an advisory
 * channel that can fail those has become a gate (AC7).
 *
 * `shouldSend` is a DISPATCH decision, not a delivery guarantee. It answers
 * "is there anyone to send to", and nothing more — the send may still be held,
 * declined or left to expire by the receiving session, none of which is
 * observable here (#2674). A caller that reads `shouldSend: true` and reports
 * the peer as informed has drawn a conclusion this value does not support.
 *
 * `peers` is what `peers-check.js` returned. `null` means the registry was
 * unavailable, which is a different fact from an empty array (no peers found)
 * and is reported as such — the caller should be able to tell "nobody is here"
 * from "I could not look".
 */
function buildAnnouncement(options) {
  try {
    if (!options || typeof options !== 'object') {
      return inert('Peer announcement skipped: no announcement options supplied.');
    }

    const { event, peers } = options;

    if (!KNOWN_EVENTS.has(event)) {
      return inert(`Peer announcement skipped: unknown event ${JSON.stringify(event)}.`);
    }

    const issues = Array.isArray(options.issues)
      ? options.issues.filter((n) => Number.isFinite(Number(n)))
      : [];
    // A branch operation may run with no tracker issue (#2960): it is keyed by
    // its branch, so the issue list may be empty and the branch may not.
    const branchOp = BRANCH_OPERATION_EVENTS.has(event);
    if (branchOp) {
      const op = options.branchOperation;
      if (!op || typeof op !== 'object' || typeof op.branch !== 'string' || op.branch.trim() === '') {
        return inert('Peer announcement skipped: no branch to name — pass `branchOperation` ({branch, tag, tracker}).');
      }
      if (TAGGED_BRANCH_OPERATIONS.has(event) && (typeof op.tag !== 'string' || op.tag.trim() === '')) {
        return inert(`Peer announcement skipped: ${event} names the tag it pushes — pass \`branchOperation.tag\`.`);
      }
    } else if (issues.length === 0) {
      return inert('Peer announcement skipped: no issue numbers supplied.');
    }

    if (peers === null || peers === undefined) {
      return inert('Peer announcement skipped: session registry unavailable.');
    }

    // THREE FACTS, THREE SENTENCES (#2678).
    //
    // Before this branch existed, anything that was not null/undefined fell
    // through to `resolveRecipients`, whose own `!Array.isArray` guard returns
    // two empty arrays without comment. `recipients.length === 0 &&
    // skipped.length === 0` then selected the no-peers wording — so a caller
    // that passed the whole CLI envelope, or `envelope.data`, or a string
    // plucked from it, was told "no peers in this working directory" while two
    // peers were live and reachable. The reader cannot tell that apart from an
    // empty directory, and the observed consequence was a session asserting
    // that a peer had exited, contradicted by its own next command.
    //
    // The remedy is named in the message on purpose: the likely error is an
    // unwrapping mistake, and the message is read by whoever made it.
    // `checkPeers()` returns `peers` at the top level while the CLI wraps it as
    // `data.peers`, which is what makes the mistake easy to make and invisible
    // once made.
    //
    // Widening the null/undefined branch instead would have been wrong: "I
    // could not look" and "I was handed the wrong thing" are different facts
    // with different fixes, and collapsing them repeats the defect one level up.
    if (!Array.isArray(peers)) {
      return inert(
        `Peer announcement skipped: peers argument was ${describeMalformed(peers)}, not an array `
        + '— pass `data.peers` from peers-check.js, not the whole envelope.'
      );
    }

    // A terminal event with an outcome nobody recognizes must not emit: a
    // wrong terminal is worse than a missing one, because it tells a peer to
    // stop waiting for something that may still be coming.
    let degraded = false;
    // Terminality is EVENT-level for every event but this one. CI_TERMINAL's
    // armed outcomes stopped being terminal in #2716 while its skip outcomes
    // stayed terminal, so the flag has to come from the outcome spec rather
    // than from set membership — otherwise an armed announcement would still
    // tell a peer to stop waiting for the closer that is now coming.
    let terminal = TERMINAL_EVENTS.has(event);
    if (event === EVENTS.CI_TERMINAL) {
      const spec = TERMINAL_OUTCOMES[options.outcome];
      if (!spec) return inert(`Peer announcement skipped: unknown outcome ${JSON.stringify(options.outcome)}.`);
      degraded = spec.degraded;
      terminal = spec.terminal;
    }

    // CI_RESOLVED is equally terminal and needs the same refusal (#2764).
    // Without it `formatCiResolved`'s fallback SENT "the outcome could not be
    // read" — so a caller holding a green result told every peer the run was
    // unreadable, terminally, leaving no correction possible.
    //
    // The reachable cause is a FIELD NAME, not a corrupt payload: `ci-watch.js`
    // stdout carries `overall` and `workflows` and the /done spec named them
    // with no wrapper, so a session following the spec passed them flat. The notice therefore names `ciResult` — the caller has
    // to change a key, and a notice that only said "unreadable" would not say
    // which one.
    if (event === EVENTS.CI_RESOLVED) {
      const ci = options.ciResult;
      if (!ci || typeof ci !== 'object' || typeof ci.overall !== 'string') {
        return inert(
          'Peer announcement skipped: CI outcome could not be read — pass ci-watch.js stdout unaltered '
          + 'under `ciResult` (it carries overall and workflows on every path), not as top-level fields.'
        );
      }
      // A readable value the formatter cannot render truthfully is refused,
      // not sent to the failure branch (#2892) — the same reasoning as the
      // CI_TERMINAL unknown-outcome guard above.
      if (!CI_RESOLVED_OUTCOMES.includes(ci.overall)) {
        return inert(
          `Peer announcement skipped: CI outcome ${JSON.stringify(ci.overall)} is not one ci-resolved can report `
          + `truthfully (expected one of ${CI_RESOLVED_OUTCOMES.join(', ')}).`
        );
      }
    }

    // FIXTURES_PROVISIONED without numbers is nothing a peer can act on: the
    // whole content of the event is which issues to leave alone (#2827).
    if (event === EVENTS.FIXTURES_PROVISIONED) {
      const f = options.fixtures;
      if (!f || typeof f !== 'object' || !Array.isArray(f.numbers) || f.numbers.length === 0) {
        return inert(
          'Peer announcement skipped: no fixtures to name — pass the qa-fixtures.js envelope data '
          + 'under `fixtures` ({shape, root, numbers}).'
        );
      }
    }

    const commits = Array.isArray(options.commits) ? options.commits : [];
    // Partitioned once, here, so the envelope and the sentence cannot disagree
    // about which identifiers were asserted (#2790).
    const commitPartition = partitionCommits(commits, options.verifyCommit);
    // Routing runs AFTER availability (#2915): it narrows the addressable set,
    // never widens it. Absent `broadcast` is today's behavior, unchanged.
    const routed = routeRecipients({
      ...resolveRecipients(peers),
      broadcast: options.broadcast,
      presence: options.presence,
      // Branch operations reach every addressable peer whatever the lever (#2960).
      force: branchOp ? 'branch-operation' : undefined,
    });
    const { recipients, skipped, routing } = routed;
    const branchOperation = branchOp
      ? { ...options.branchOperation, branch: options.branchOperation.branch.trim() }
      : undefined;
    const text = FORMATTERS[event]({
      branchOperation,
      issues,
      commits,
      commitPartition,
      commitSource: options.commitSource,
      outcome: options.outcome,
      runUrl: options.runUrl,
      ciResult: options.ciResult,
      fixtures: options.fixtures,
    });

    const base = {
      event,
      issues,
      commitCount: commits.length,
      text,
      recipients,
      skipped,
      terminal,
      degraded,
      // Whether the shas in `text` were checked against the object store, and
      // which were rejected. `verified: false` is NOT a failure — it is the
      // absence of a check, and an auditor must be able to tell the two apart.
      verified: commitPartition.verified,
      unresolvedCommits: commitPartition.unresolved,
      routing,
    };

    // Routed-away peers are REACHABLE; only the rest are summarized as
    // unreachable. Mixing them would describe a routed peer as "not reachable
    // for an unrecorded reason", which is false.
    const unreachableSkipped = skipped.filter((p) => !(p && p.skipReason === ROUTED_SKIP_REASON));
    const routedCount = skipped.length - unreachableSkipped.length;
    const unreachableClause = unreachableSkipped.length > 0
      ? ` ${unreachableSkipped.length} peer(s) skipped: ${summarizeUnreachable(unreachableSkipped)}.`
      : '';

    if (recipients.length === 0) {
      // Said ONCE, not once per skipped peer. Repeating it per peer turns a
      // one-line advisory into a wall in the common multi-session case.
      const notice = skipped.length > 0
        ? `Peer announcement skipped: no addressable peer (${summarizeUnreachable(skipped)}).`
        : 'Peer announcement skipped: no peers in this working directory.';
      return { ...base, shouldSend: false, notice };
    }

    if (routing.applied === 'targeted') {
      // A targeted send must never read like "no peers" — it names the monitor.
      const notice = `Dispatched to 1 peer — routed to overwatch ${routing.monitorName} (#${routing.monitorPid}); `
        + `${DISPATCH_CAVEAT}. ${routedCount} peer(s) not sent to: routed to the overwatch.${unreachableClause}`;
      return { ...base, shouldSend: true, notice };
    }

    // Dispatch is the only fact available here, so it is the only one stated.
    // A forced broadcast is named as a decision, never as a fallback (#2960).
    let route = '';
    if (routing.forced) {
      route = ` — forced broadcast for a branch operation, bypassing targeted routing (${routing.forced})`;
    } else if (routing.fallbackReason) {
      route = ` — targeted routing fell back to broadcast (${describeFallback(routing.fallbackReason)}; ${routing.fallbackReason})`;
    }
    const dispatch = `Dispatched to ${recipients.length} peer(s)${route}; ${DISPATCH_CAVEAT}.`;
    const notice = `${dispatch}${unreachableClause}`;

    return { ...base, shouldSend: true, notice };
  } catch (err) {
    // Belt and braces. Nothing above should reach here, and if it ever does the
    // caller still gets an inert result rather than an exception mid-STOP.
    return inert(`Peer announcement skipped: ${err && err.message ? err.message : 'composition failed'}.`);
  }
}

module.exports = {
  buildAnnouncement,
  resolveRecipients,
  formatWorkStarted,
  formatWorkCompleted,
  partitionCommits,
  formatPushStarted,
  formatCiTerminal,
  formatPushRejected,
  formatReviewStarted,
  formatReviewResolved,
  formatReviewPassed,
  EVENTS,
  BRANCH_OPERATION_EVENTS,
  TERMINAL_OUTCOMES,
  TERMINAL_EVENTS,
};
