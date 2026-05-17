/**
 * @framework-script 0.92.0
 *
 * Living Style Guide `--apply-decisions` runtime helper (#2433, Story 1.4).
 *
 * Provides the shared arg-parsing and headless apply-path used by the three
 * showcase-aware commands (`/design-system`, `/mockups`, `/catalog-screens`):
 *
 *   - parseShowcaseFlags(argv)        Detect --showcase / --apply-decisions; enforce mutex
 *   - runApplyDecisions(opts)         Headless apply via showcase-resume.applyPending,
 *                                     printing per-decision report lines on opts.stdout
 *
 * AC1.4.1: applies outcomes WITHOUT binding any port or launching a browser
 * (achieved by not requiring showcase-server.js or local-server.js).
 * AC1.4.2: passing both flags yields {error} from parseShowcaseFlags.
 * AC1.4.3: integration test sets process.stdout.isTTY=false; helper is unaffected
 *          by TTY state since it never spawns a child process.
 *
 * Rubrical Works (c) 2026
 */

'use strict';

const path = require('path');
const resume = require('./showcase-resume.js');

const SHOWCASE_FLAG = '--showcase';
const APPLY_FLAG = '--apply-decisions';

/**
 * Detect and validate showcase flags in an argv array. Argv may include any
 * other flags / positional args — only `--showcase` and `--apply-decisions`
 * are inspected here.
 *
 * @param {string[]} argv
 * @returns {{showcase: boolean, applyDecisions: boolean, error?: string}}
 */
function parseShowcaseFlags(argv) {
  const showcase = Array.isArray(argv) && argv.includes(SHOWCASE_FLAG);
  const applyDecisions = Array.isArray(argv) && argv.includes(APPLY_FLAG);
  if (showcase && applyDecisions) {
    return {
      showcase: true,
      applyDecisions: true,
      error:
        '--showcase and --apply-decisions are mutually exclusive. Use --showcase to launch the ' +
        'review surface, or --apply-decisions to apply pending decisions headlessly.',
    };
  }
  return { showcase, applyDecisions };
}

/**
 * Run the headless apply path for a single command.
 *
 * Never spawns a child process, never binds a port, never opens a browser. Safe in
 * non-TTY / CI contexts. Reads `decisions.json`, dispatches via showcase-resume's
 * per-command appliers, advances the cursor sidecar.
 *
 * @param {object} opts
 * @param {string} opts.commandName            'design-system' | 'mockups' | 'catalog-screens'
 * @param {string} [opts.decisionsPath]        Default: Design-System/showcase/decisions.json
 * @param {string} [opts.appliedPath]          Default: Design-System/showcase/.applied.json
 * @param {string} [opts.projectRoot]          For per-command applier path resolution
 * @param {NodeJS.WriteStream} [opts.stdout]   Where to write report lines (default process.stdout)
 * @param {NodeJS.WriteStream} [opts.stderr]   Where to write summary (default process.stderr)
 * @returns {object} { ok, summary, lines, result }
 */
function runApplyDecisions(opts) {
  if (!opts || !opts.commandName) {
    throw new TypeError('runApplyDecisions: opts.commandName required');
  }
  const projectRoot = opts.projectRoot || process.cwd();
  const decisionsPath = opts.decisionsPath
    || path.resolve(projectRoot, 'Design-System/showcase/decisions.json');
  const appliedPath = opts.appliedPath
    || path.resolve(projectRoot, 'Design-System/showcase/.applied.json');
  const stdout = opts.stdout || process.stdout;
  const stderr = opts.stderr || process.stderr;

  const result = resume.applyPending({
    commandName: opts.commandName,
    decisionsPath,
    appliedPath,
    projectRoot,
  });

  const lines = resume.formatReportLines(result);
  for (const line of lines) {
    stdout.write(line + '\n');
  }

  const summary = `${opts.commandName}: ${result.applied.length} applied, ${result.stale.length} stale, ${result.errors.length} error(s) out of ${result.total} pending.\n`;
  stderr.write(summary);

  return {
    ok: result.errors.length === 0,
    summary,
    lines,
    result,
  };
}

module.exports = {
  parseShowcaseFlags,
  runApplyDecisions,
  SHOWCASE_FLAG,
  APPLY_FLAG,
};
