// Rubrical Works (c) 2026
/**
 * @framework-script 0.95.0
 * @description Reads `.gh-pmu.json` and resolves the issue-creation assignee
 * (#2489). Replaces the `--assignee @me` literal that was copied across seven
 * command specs and `create-epic.js`.
 *
 * Resolution order:
 *   1. `defaults.assignee` when set to a non-empty string
 *   2. `@me` otherwise
 *
 * There is deliberately **no `project.owner` fallback**. `project.owner` is the
 * *board* owner and may be an organisation login, which does not resolve as an
 * assignee. Since gh-pmu v1.5.1 (gh-pmu#895) an unresolvable `--assignee`
 * aborts issue creation with exit 1 before the createIssue mutation, so such a
 * fallback would turn a working default into a hard failure.
 *
 * The field is read here, not by `gh pmu` — gh-pmu has no config-defaults
 * behaviour for assignee (recorded in #436, still true at v1.5.1). It is an
 * unrecognised key from gh-pmu's perspective and is ignored by it.
 *
 * CLI:
 *   node gh-pmu-config.js --assignee   # prints the resolved assignee
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILENAME = '.gh-pmu.json';

/** Fallback assignee when `defaults.assignee` is unset. */
const DEFAULT_ASSIGNEE = '@me';

/**
 * Read and parse `.gh-pmu.json` from `cwd`.
 *
 * @param {string} [cwd] Directory containing the config. Defaults to process cwd.
 * @returns {object|null} Parsed config, or null when missing or unparseable.
 */
function readGhPmuConfig(cwd = process.cwd()) {
  try {
    const raw = fs.readFileSync(path.join(cwd, CONFIG_FILENAME), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_e) {
    // Missing or malformed config is not this helper's failure to report —
    // `gh pmu` surfaces it directly on the next invocation.
    return null;
  }
}

/**
 * Resolve the assignee to pass to `gh pmu create --assignee`.
 *
 * Always returns a usable value; the flag is never omitted. An explicitly
 * configured login that does not resolve is gh-pmu's error to raise, not
 * something to paper over here — callers must let that exit code surface.
 *
 * @param {string} [cwd] Directory containing `.gh-pmu.json`.
 * @returns {string} Configured login, or `@me`.
 */
function resolveAssignee(cwd = process.cwd()) {
  const config = readGhPmuConfig(cwd);
  const configured = config && config.defaults && config.defaults.assignee;
  if (typeof configured !== 'string') return DEFAULT_ASSIGNEE;
  const trimmed = configured.trim();
  return trimmed === '' ? DEFAULT_ASSIGNEE : trimmed;
}

if (require.main === module) {
  if (process.argv.includes('--assignee')) {
    process.stdout.write(resolveAssignee() + '\n');
  } else {
    process.stdout.write('Usage: gh-pmu-config.js --assignee\n');
    process.exitCode = 1;
  }
}

module.exports = { DEFAULT_ASSIGNEE, CONFIG_FILENAME, readGhPmuConfig, resolveAssignee };
