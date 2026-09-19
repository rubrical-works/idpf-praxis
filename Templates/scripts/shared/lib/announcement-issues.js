// Rubrical Works (c) 2026
/**
 * @framework-script 0.104.0
 *
 * Which issues a `/done` push announcement names (#2772).
 *
 * THE DEFECT. Events 3 (`push-started`), 4 (`ci-terminal`) and 6
 * (`ci-resolved`) derived their `issues` array from the ISSUE BATCH being
 * processed rather than the COMMIT RANGE actually pushed. The two normally
 * coincide, so nothing looked wrong -- but `/work` commits per acceptance
 * criterion and defers every push to `/done`, so one push routinely carries
 * several issues' commits. Any unpushed commit whose `Refs #N` was absent from
 * the batch shipped UNANNOUNCED, and the omission was undetectable from either
 * side: the sender composed a well-formed message, and the receiver had no way
 * to know a name was missing.
 *
 * Observed 2026-09-04. A peer closed #2766 in the ~90 seconds between the
 * discovery call and the batch call, so the batch correctly skipped it -- while
 * its four commits were already on the branch and went out in the same atomic
 * push. All three announcements named only #2763 and #2765. CI happened to be
 * green; had it been red on one of those four commits, nobody reading the
 * announcement would have thought to look at #2766.
 *
 * The trigger is broader than that instance: it is ANY unpushed commit whose
 * `Refs #N` is not in the current batch. A concurrent close is one route; an
 * earlier `/done` whose push was skipped, or commits made outside a `/work`
 * run, are others.
 *
 * A UNION, NOT A REPLACEMENT. A batch member with no commits in the range is
 * still named. "We closed this" is worth announcing even when nothing landed
 * for it, and dropping it would trade one silent gap for a different one.
 *
 * ANCHORING IS INHERITED, NEVER REIMPLEMENTED. `issueRefGrepPattern()` answers
 * "is N referenced?", not "which issues are referenced?", so candidates are
 * harvested loosely from the log and then CONFIRMED through that helper. The
 * loose scan only ever PROPOSES; every membership decision goes through the
 * shared boundary rule that stops `#245` matching `#2453` (#2467, #2753). A
 * local regex making the decision here would be the third independently
 * constructed form of that rule, which is what #2753 retired.
 *
 * WHY A HELPER AND NOT PROSE IN `done.md`. A derivation living only in a
 * command spec can be asserted as TEXT and never EXERCISED --
 * `done-ci-announcement.test.js` matches spec strings across the three pipeline
 * stages, which cannot show that a range yields the right set. Same precedent
 * as `branch-review-gate.js`, `decideSweep`/`decideFlagSweep`, and
 * `decideStart` in `overwatch-presence.js`.
 *
 * Node built-ins and relative `shared/lib` requires only, per the runtime
 * dependency contract in `04-deployment-awareness.md`.
 */

'use strict';

const { execFileSync } = require('child_process');

const { issueRefGrepPattern } = require('./issue-ref-match.js');

/** The keywords that constitute attribution. */
const KEYWORDS = ['Refs', 'Fixes', 'Closes'];

/**
 * Spawn bound for every git call here (#2469).
 *
 * Generous relative to the work — a `git log` over one push's range is
 * sub-second — because the cost of firing early is a degraded announcement,
 * while the cost of never firing is a hung /done.
 */
const GIT_TIMEOUT_MS = 10000;

/**
 * Default git runner: returns stdout, or throws.
 *
 * Injectable so tests can construct a range directly rather than building a
 * throwaway repository, and so this module can be exercised deterministically.
 */
function defaultRunGit(args, cwd) {
  return execFileSync('git', args, {
    cwd: cwd || process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    // BOUNDED, per the #2469 spawn-timeout contract. `git log` over a push-sized
    // range is sub-second, so this only ever fires on a genuinely stuck git —
    // an index.lock contention or a hung filter. Unbounded, that would hang the
    // enclosing /done indefinitely at the announcement step, which is the worst
    // possible place for an ADVISORY channel to block. On timeout execFileSync
    // throws and the caller degrades to the batch, exactly as it does for any
    // other git failure.
    timeout: GIT_TIMEOUT_MS,
  });
}

/** Unique, ascending, numeric. */
function sortedUnique(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

/**
 * Derive the set of issues a push announcement should name.
 *
 * @param {object}   opts
 * @param {string}   opts.base    Pre-push remote tip, as pinned by /done Step 2.2.
 * @param {string}   opts.head    Pushed head (normally `@{u}` after the push).
 * @param {number[]} opts.batch   The issue batch this run processed.
 * @param {string}   [opts.cwd]   Repository root.
 * @param {Function} [opts.runGit] Injectable git runner, for tests.
 * @returns {number[]} Sorted, deduplicated union of the batch and every issue
 *   attributed by a commit in `base..head`.
 *
 * NEVER THROWS, and degrades to the batch. This gates an ADVISORY channel: a
 * helper that threw would abort the enclosing `/done` sequence, which is far
 * worse than an announcement naming only the batch -- which is exactly what it
 * named before this issue. An unresolvable base degrades the same way rather
 * than guessing a range, on the same reasoning /done Step 3 uses when the
 * pushed range cannot be resolved: an invented range would announce commits
 * that may not be in this push at all.
 */
function deriveAnnouncementIssues(opts) {
  const o = opts || {};
  const batch = Array.isArray(o.batch) ? o.batch : [];
  const fromBatch = batch
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0);

  // No usable range -> the batch is the whole answer. Reported by returning it
  // rather than by throwing, so the caller's announcement still goes out.
  if (typeof o.base !== 'string' || !o.base || typeof o.head !== 'string' || !o.head) {
    return sortedUnique(fromBatch);
  }

  const runGit = typeof o.runGit === 'function' ? o.runGit : defaultRunGit;
  const range = `${o.base}..${o.head}`;

  let corpus;
  try {
    // `%B` is the full message, so a `Refs #N` on a body line counts exactly as
    // one on the subject. `--no-merges` matches the selection /done Step 1b
    // already uses for attribution.
    corpus = runGit(['log', range, '--format=%B', '--no-merges'], o.cwd);
  } catch {
    return sortedUnique(fromBatch);
  }
  if (typeof corpus !== 'string' || corpus === '') return sortedUnique(fromBatch);

  // PROPOSE. A loose scan for keyword-prefixed numbers; it decides nothing.
  const candidates = new Set();
  const scan = /\b(?:Refs|Fixes|Closes)\s+#(\d+)/gi;
  let m;
  while ((m = scan.exec(corpus)) !== null) {
    const n = Number(m[1]);
    if (Number.isInteger(n) && n > 0) candidates.add(n);
  }

  // CONFIRM. Each candidate is re-tested through the shared boundary-anchored
  // pattern, so the rule that separates #245 from #2453 is inherited rather
  // than duplicated. Cheap: the candidate set is the issues in one push.
  const confirmed = [];
  for (const n of candidates) {
    let hits;
    try {
      hits = runGit(
        ['log', range, '--format=%H', '--no-merges', `--grep=${issueRefGrepPattern(String(n), { keywords: KEYWORDS })}`],
        o.cwd
      );
    } catch {
      // One failed confirmation must not discard the rest. Skipping the
      // candidate is the conservative direction: it can only shrink the set
      // back toward the batch, never invent a name.
      continue;
    }
    if (typeof hits === 'string' && hits.trim() !== '') confirmed.push(n);
  }

  return sortedUnique([...fromBatch, ...confirmed]);
}

module.exports = {
  KEYWORDS,
  GIT_TIMEOUT_MS,
  deriveAnnouncementIssues,
};
