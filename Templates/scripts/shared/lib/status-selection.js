// Rubrical Works (c) 2026
/**
 * @framework-script 0.122.0
 * @description Select issues by board status for a multi-issue command. Exports resolveStatusIssues() (the gh pmu list query /work --status and /review-issue --status share), main() (a read-only CLI, `--status <status>`, printing { issues } or { error } as JSON; #3815) and classifyError() (the gh error classifier work-preamble.js re-exports). Status validation and typed-number merging live in review-preamble.js selectByStatus().
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * status-selection.js (#3811)
 *
 * `resolveStatusIssues` lived in work-preamble.js until #3811 moved it here so
 * review-preamble.js resolves `--status` through the same function rather than
 * a copy. work-preamble.js re-exports it, so `/work --status` is unchanged.
 */

'use strict';

const { execFileTimedAsync } = require('./exec.js');

const EXEC_OPTS = { encoding: 'utf-8' };

/**
 * Classify a gh / gh pmu error message into a specific error code. The one
 * definition: work-preamble.js imports and re-exports it (#3811), so the two
 * status paths can never classify the same failure differently.
 * @param {string} errorMessage - Raw error message or stderr content
 * @param {string} defaultCode - Default code if no pattern matches
 * @returns {string} Classified error code
 */
function classifyError(errorMessage, defaultCode) {
  if (!errorMessage) return defaultCode;
  const msg = errorMessage.toLowerCase();
  if (msg.includes('etimedout') || msg.includes('timed out') || msg.includes('timeout')) return 'TIMEOUT';
  if (msg.includes('rate limit')) return 'RATE_LIMIT';
  if (msg.includes('authentication required') || msg.includes('auth login') || msg.includes('not logged')) return 'AUTH_FAILED';
  if (msg.includes('unknown command') && msg.includes('pmu')) return 'PMU_MISSING';
  return defaultCode;
}

/**
 * Resolve issue numbers from a status query.
 * @param {string} status - the status alias passed to `gh pmu list --status`
 * @param {object} [deps]
 * @param {Function} [deps.exec] - execFile-shaped async spawn override for tests
 * @returns {Promise<{ issues: number[] } | { error: { code: string, message: string } }>}
 */
async function resolveStatusIssues(status, deps = {}) {
  const exec = deps.exec || execFileTimedAsync;
  const errorMsg = `Failed to query issues in "${status}" status`;
  let output;
  try {
    const { stdout } = await exec('gh', ['pmu', 'list', '--status', status, '--json=number,title'], EXEC_OPTS);
    output = String(stdout).trim();
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().trim() : e.message;
    return { error: { code: classifyError(msg, 'STATUS_QUERY_FAILED'), message: `${errorMsg}: ${msg}` } };
  }
  let raw;
  try {
    raw = JSON.parse(output);
  } catch (_e) {
    return { error: { code: 'INVALID_RESPONSE', message: `${errorMsg}: could not parse JSON` } };
  }
  // #3784: gh pmu 1.8.0 returns { items: [...] }; older versions a bare array.
  // #3815: any other shape is an error, never an empty selection.
  const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.items) ? raw.items : null);
  if (list === null) {
    return {
      error: {
        code: 'UNRECOGNIZED_RESPONSE_SHAPE',
        message: `${errorMsg}: gh pmu list returned ${describeShape(raw)}, expected an array or { items: [...] }`
      }
    };
  }
  const issues = list.map(i => i.number);
  return { issues };
}

/**
 * Describe a parsed JSON value's shape for an error message.
 * @param {*} value
 * @returns {string}
 */
function describeShape(value) {
  if (value === null) return 'null';
  if (typeof value !== 'object') return typeof value;
  const keys = Object.keys(value);
  return keys.length === 0 ? 'an object with no keys' : `an object with keys [${keys.join(', ')}]`;
}

/**
 * CLI: `node status-selection.js --status <status>`. Read-only — its one
 * spawn is `gh pmu list`. Prints `{ "issues": [...] }` or `{ "error": {...} }`
 * as JSON; exits 0 on issues, 1 on a query error, 2 on a usage error.
 * @param {string[]} [argv]
 * @param {object} [deps]
 * @param {Function} [deps.exec] - spawn override, passed to resolveStatusIssues
 * @param {Function} [deps.write] - output sink (defaults to stdout)
 * @returns {Promise<number>} exit code
 */
async function main(argv = process.argv.slice(2), deps = {}) {
  const write = deps.write || ((s) => process.stdout.write(s));
  let status = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--status') status = argv[++i] || null;
    else if (argv[i].startsWith('--status=')) status = argv[i].slice('--status='.length) || null;
  }
  if (!status) {
    write(JSON.stringify({ error: { code: 'USAGE', message: 'Usage: status-selection.js --status <status>' } }, null, 2) + '\n');
    return 2;
  }
  const result = await resolveStatusIssues(status, { exec: deps.exec });
  write(JSON.stringify(result, null, 2) + '\n');
  return result.error ? 1 : 0;
}

module.exports = {
  resolveStatusIssues,
  classifyError,
  main
};

if (require.main === module) {
  main().then((code) => { process.exitCode = code; });
}
