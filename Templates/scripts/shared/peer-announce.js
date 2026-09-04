#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.101.0
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
  // The review half's only CLOSER (#2722). The two events above are
  // non-terminal on purpose and stay that way; this one describes the one
  // review outcome that is settled rather than open-ended.
  REVIEW_PASSED: 'review-passed',
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
});

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
function formatWorkCompleted({ issues, commits }) {
  const list = Array.isArray(commits) ? commits : [];
  const subject = describeIssues(issues);

  if (list.length === 0) {
    return `Finished on ${subject} with no commits — nothing landed in this working directory.`;
  }

  const shas = list.map(commitLabel).filter(Boolean).join(', ');
  const plural = list.length === 1 ? 'commit' : 'commits';

  // A count in front of an empty list is the #2671 defect verbatim: the
  // sentence ended in ": ." and named nothing. If no entry yields an
  // identifier, say that rather than trailing off.
  if (!shas) {
    return `Finished on ${subject} — ${list.length} ${plural} in this working directory (commit identifiers unavailable).`;
  }

  return `Finished on ${subject} — ${list.length} ${plural} in this working directory: ${shas}.`;
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
 * There is deliberately NO counterpart for the `pending` outcome. `pending`
 * genuinely is open-ended — it may be followed by /resolve-review, by
 * abandonment, or by nothing — which is exactly the case the non-terminal
 * wording above was written for. Adding one would assert a completeness the
 * sender cannot have.
 *
 * States, never instructs: availability is a fact about the issue, not a
 * task handed to the receiver. This event confers no claim and no ownership.
 */
function formatReviewPassed({ issues }) {
  return `Review passed on ${describeIssues(issues)} — Ready for work; available to be picked up in this working directory. No further announcement will follow.`;
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

  // Naming the failed step is what makes a red actionable rather than merely
  // alarming — it is the one detail a peer cannot cheaply recover itself.
  const failures = workflows
    .filter((w) => w && w.conclusion && w.conclusion !== 'success')
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
});

/**
 * Events after which no peer should still be waiting.
 *
 * REVIEW_PASSED joins the CI/push terminals; REVIEW_STARTED and
 * REVIEW_RESOLVED deliberately do not (#2722). The asymmetry is the feature:
 * making all three review events agree would delete the only closer the
 * review half has.
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
    if (issues.length === 0) {
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

    // A terminal event with an outcome nobody recognises must not emit: a
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
    // emits `{overall, workflows, failedSteps}` on stdout and the /done spec
    // named those three fields with no wrapper, so a session following the spec
    // passed them flat. The notice therefore names `ciResult` — the caller has
    // to change a key, and a notice that only said "unreadable" would not say
    // which one.
    if (event === EVENTS.CI_RESOLVED) {
      const ci = options.ciResult;
      if (!ci || typeof ci !== 'object' || typeof ci.overall !== 'string') {
        return inert(
          'Peer announcement skipped: CI outcome could not be read — pass the result '
          + 'under `ciResult` ({overall, workflows, failedSteps}), not as top-level fields.'
        );
      }
    }

    const commits = Array.isArray(options.commits) ? options.commits : [];
    const { recipients, skipped } = resolveRecipients(peers);
    const text = FORMATTERS[event]({
      issues,
      commits,
      outcome: options.outcome,
      runUrl: options.runUrl,
      ciResult: options.ciResult,
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
    };

    if (recipients.length === 0) {
      // Said ONCE, not once per skipped peer. Repeating it per peer turns a
      // one-line advisory into a wall in the common multi-session case.
      const notice = skipped.length > 0
        ? `Peer announcement skipped: no addressable peer (${summarizeUnreachable(skipped)}).`
        : 'Peer announcement skipped: no peers in this working directory.';
      return { ...base, shouldSend: false, notice };
    }

    // Dispatch is the only fact available here, so it is the only one stated.
    const dispatch = `Dispatched to ${recipients.length} peer(s); ${DISPATCH_CAVEAT}.`;
    const notice = skipped.length > 0
      ? `${dispatch} ${skipped.length} peer(s) skipped: ${summarizeUnreachable(skipped)}.`
      : dispatch;

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
  formatPushStarted,
  formatCiTerminal,
  formatPushRejected,
  formatReviewStarted,
  formatReviewResolved,
  formatReviewPassed,
  EVENTS,
  TERMINAL_OUTCOMES,
  TERMINAL_EVENTS,
};
