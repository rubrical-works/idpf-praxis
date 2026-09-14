#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.103.0
 * @description Derive, compose and record a /work or review-lifecycle peer announcement in one call. For /work it runs the `git log --grep` itself so the commit payload is never transcribed, and verifies every identifier against the object store; for the review events it makes the --force suppression and the labelAssigned verdict mapping its own decisions. Every composed announcement is recorded to the sender-side ledger. Delivery remains the caller's SendMessage tool call — this script, like peer-announce.js, cannot send.
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
 * The CI and push events stay out. `/done` composes them with payloads — CI
 * results, push ranges — this script has no derivation for, so for them it
 * would still be a wrapper with nothing to add.
 */
const SUPPORTED = Object.freeze({ ...WORK_EVENTS, ...REVIEW_EVENTS });

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
 * The commit set for one issue, straight out of git.
 *
 * `execFileSync` with an argument array, never a shell string: the grep
 * pattern carries BRE metacharacters (`\(`, `\|`) and a shell would be a
 * second place for them to be mangled — and an injection surface for anything
 * that ever reaches this with a non-numeric issue. `issueRefGrepPattern`
 * throws on a non-numeric issue, which is caught below.
 *
 * Boundary-anchored via the shared helper (#2467): an unbounded grep makes
 * `Refs #116` collect every `Refs #1169`, and this payload is exactly where
 * that misattribution would be announced to peers as fact.
 */
function deriveCommits(issue, options = {}) {
  try {
    const pattern = issueRefGrepPattern(issue);
    const raw = git(['log', '--oneline', `--grep=${pattern}`], options.cwd);
    const commits = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    return {
      ok: true,
      commits,
      shas: commits.map((l) => l.split(/\s+/)[0]).filter(Boolean),
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
      issues: [issue],
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
function compose({ event, issue, peers, cwd, commits: supplied, force = false, labelAssigned } = {}) {
  const warnings = [];
  const hasLabel = labelAssigned !== undefined;

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

  const announcement = buildAnnouncement({
    event: resolved,
    issues: [issueNumber],
    commits,
    peers,
    verifyCommit: makeCommitVerifier({ cwd }),
  });

  if (announcement.unresolvedCommits && announcement.unresolvedCommits.length > 0) {
    warnings.push(
      `${announcement.unresolvedCommits.length} identifier(s) did not resolve in this repository `
      + `and were not named: ${announcement.unresolvedCommits.join(', ')}.`
    );
  }

  const recorded = ledger.record({ event: name, issues: [issueNumber] }, { cwd });
  if (!recorded.ok) {
    warnings.push(`Announcement was not recorded to the ledger (${recorded.error}); pairing cannot be audited for this event.`);
  }

  return {
    ok: true,
    event: name,
    issue: issueNumber,
    commitSource,
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

function parseArgs(argv) {
  const out = {
    event: null, issue: null, dispatchResult: null, ledgerId: null,
    detail: null, force: false, schema: false, unrecognizedFlags: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--event' && argv[i + 1]) out.event = argv[++i];
    else if (a === '--issue' && argv[i + 1]) out.issue = parseInt(argv[++i], 10);
    else if (a === '--dispatch-result' && argv[i + 1]) out.dispatchResult = argv[++i];
    else if (a === '--ledger-id' && argv[i + 1]) out.ledgerId = argv[++i];
    else if (a === '--detail' && argv[i + 1]) out.detail = argv[++i];
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

  if (out.schema || out.dispatchResult) return out;

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
        'announce.js --dispatch-result sent|failed|skipped --ledger-id <id> [--detail "<text>"]',
      ],
      envelope: {
        ok: 'boolean',
        event: 'string|null — the event composed; null when a labelAssigned selected none',
        suppressed: 'true when the script decided to send nothing (review-started under --force, labelAssigned null or unrecognised)',
        reason: 'string — why nothing was sent, when suppressed',
        commitSource: 'derived | supplied | unavailable | not-applicable',
        announcement: 'the peer-announce.js envelope, including text, recipients, shouldSend, notice, verified, unresolvedCommits',
        ledgerId: 'string|null — pass back with --dispatch-result',
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

  if (args.dispatchResult) {
    const result = closeDispatch({
      ledgerId: args.ledgerId, result: args.dispatchResult, detail: args.detail,
    });
    process.stdout.write(JSON.stringify({ ...result, unrecognizedFlags: args.unrecognizedFlags }, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
  }

  const { peers, warnings: peerWarnings } = readPeers();
  const input = { event: args.event, issue: args.issue, peers, force: args.force };
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
  REVIEW_EVENTS,
  VERDICT_BY_LABEL,
  selectVerdictEvent,
  deriveCommits,
  makeCommitVerifier,
  compose,
  closeDispatch,
  parseArgs,
};
