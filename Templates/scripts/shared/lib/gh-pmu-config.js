// Rubrical Works (c) 2026
/**
 * @framework-script 0.101.0
 * @description Resolves the issue-creation assignee for `gh pmu create`
 * (#2489, rewritten in #2599). Holds the default in JS and takes a
 * per-invocation override; reads no configuration file.
 *
 * Resolution order:
 *   1. The caller-supplied override, when it is a non-empty string
 *   2. `@me` otherwise
 *
 * **Why nothing is read from `.gh-pmu.json` (#2599).** The default used to live
 * in that file under `defaults.assignee`. `.gh-pmu.json` is owned by the
 * `gh pmu` extension, which does not recognise that key — it was read by the
 * framework, not by `gh pmu` — so any `gh pmu` operation that re-serialises the
 * config drops it. That happened once, silently, and one drop is enough: every
 * issue created afterwards resolves from a key that is no longer there, and the
 * helper cannot tell an absent key from a deliberately-unset one. Removing the
 * dependency removes the failure mode; containing it would not. The cost is
 * accepted: a project that always wants a non-`@me` assignee must name it on
 * each invocation.
 *
 * There is deliberately **no `project.owner` fallback**. `project.owner` is the
 * *board* owner and may be an organisation login, which does not resolve as an
 * assignee. Since gh-pmu v1.5.1 (gh-pmu#895) an unresolvable `--assignee`
 * aborts issue creation with exit 1 before the createIssue mutation, so such a
 * fallback would turn a working default into a hard failure.
 *
 * CLI:
 *   node gh-pmu-config.js --assignee           # prints the default
 *   node gh-pmu-config.js --assignee <login>   # prints <login>
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

/** Assignee used when the caller supplies no override. */
const DEFAULT_ASSIGNEE = '@me';

/**
 * Resolve the assignee to pass to `gh pmu create --assignee`.
 *
 * Always returns a usable value; the flag is never omitted. An explicitly
 * supplied login that does not resolve is gh-pmu's error to raise, not
 * something to paper over here — callers must let that exit code surface.
 *
 * @param {string} [override] Login supplied for this invocation.
 * @returns {string} The trimmed override, or `@me`.
 */
function resolveAssignee(override) {
  if (typeof override !== 'string') return DEFAULT_ASSIGNEE;
  const trimmed = override.trim();
  return trimmed === '' ? DEFAULT_ASSIGNEE : trimmed;
}

if (require.main === module) {
  const i = process.argv.indexOf('--assignee');
  if (i !== -1) {
    // The token after --assignee is a value only if it is not itself a flag;
    // `--assignee --verbose` must print the default, not assign to "--verbose".
    const next = process.argv[i + 1];
    const override = next && !next.startsWith('--') ? next : undefined;
    process.stdout.write(resolveAssignee(override) + '\n');
  } else {
    process.stdout.write('Usage: gh-pmu-config.js --assignee [login]\n');
    process.exitCode = 1;
  }
}

module.exports = { DEFAULT_ASSIGNEE, resolveAssignee };
