#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.107.0
 * shell-safety-hook.js
 *
 * PreToolUse hook (matcher: Bash) that emits Git Bash corrections only for the
 * command shape about to run (#2997). The corrections were sections of the
 * always-on 05-windows-shell rule, read in every session though each applies
 * to a handful of commands; they now live in
 * .claude/metadata/shell-pattern-corrections.json.
 *
 *   advise → stdout {hookSpecificOutput: {hookEventName, additionalContext}},
 *            exit 0; the call proceeds.
 *   block  → the correction on stderr, exit 2; Claude Code blocks the call and
 *            shows stderr as the reason. Reserved for shapes that are always
 *            wrong on Git Bash (`date /t`, `taskkill /F`).
 *
 * Fails open, always: unparseable input, no command, unreadable or malformed
 * data, or a detector that will not compile contribute nothing — a hook on
 * every Bash call must never be the reason a correct command is stopped.
 * Node built-ins only (deployed hooks resolve from the hub, #2418).
 */

const fs = require('fs');
const path = require('path');

// Anchored to __dirname: in a deployed project .claude/hooks/ and
// .claude/metadata/ are both hub junctions.
const DATA_FILE = path.resolve(__dirname, '..', 'metadata', 'shell-pattern-corrections.json');

const SILENT = Object.freeze({ code: 0, stdout: '', stderr: '' });

/** The corrections data, or null when it cannot be read. Never throws. */
function loadCorrections() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (_e) {
    return null;
  }
}

/**
 * The matching corrections for a command, split by disposition.
 * @param {string} command
 * @param {object|null} data
 * @returns {{block: string[], advise: string[]}}
 */
function matchCorrections(command, data) {
  const result = { block: [], advise: [] };
  const entries = data && data.corrections;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return result;
  for (const entry of Object.values(entries)) {
    if (!entry || typeof entry.text !== 'string' || !entry.detector) continue;
    let re;
    try {
      re = new RegExp(entry.detector.source, typeof entry.detector.flags === 'string' ? entry.detector.flags : '');
    } catch (_e) {
      continue; // one broken detector disables only itself
    }
    if (!re.test(command)) continue;
    if (entry.disposition === 'block') result.block.push(entry.text);
    else if (entry.disposition === 'advise') result.advise.push(entry.text);
  }
  return result;
}

/**
 * The hook's whole decision as data, so it can be asserted without a process.
 * @param {string} rawInput - hook stdin
 * @param {object|null} data - parsed corrections
 * @returns {{code: number, stdout: string, stderr: string}}
 */
function respond(rawInput, data) {
  let input;
  try {
    input = JSON.parse(rawInput);
  } catch (_e) {
    return SILENT;
  }
  const command = input && input.tool_input && input.tool_input.command;
  if (typeof command !== 'string' || command.length === 0) return SILENT;

  const { block, advise } = matchCorrections(command, data);
  if (block.length > 0) {
    return { code: 2, stdout: '', stderr: `${block.join('\n\n')}\n` };
  }
  if (advise.length > 0) {
    const additionalContext = [
      'Git Bash correction for the command about to run (from shell-pattern-corrections.json):',
      '',
      advise.join('\n\n')
    ].join('\n');
    return {
      code: 0,
      stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext } }),
      stderr: ''
    };
  }
  return SILENT;
}

module.exports = { respond, matchCorrections, loadCorrections, DATA_FILE };

if (require.main === module) {
  // Heartbeat (#2917). okCodes [0, 2]: exit 2 is this hook's SUCCESS path for a
  // block, and the default (0 only) would put a working hook on the startup
  // Hook Health row every time it stopped a `date /t` (#2997).
  let heartbeat = { fail() {}, setCwd() {} };
  try { heartbeat = require('../scripts/shared/lib/hook-heartbeat.js').installHeartbeat('shell-safety-hook', { okCodes: [0, 2] }); } catch (_) { /* reported by the load check */ }

  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => {
    try {
      try { heartbeat.setCwd(JSON.parse(raw).cwd); } catch (_e) { /* cwd is best-effort */ }
      const r = respond(raw, loadCorrections());
      if (r.stdout) process.stdout.write(`${r.stdout}\n`);
      if (r.stderr) process.stderr.write(r.stderr);
      process.exitCode = r.code;
    } catch (err) {
      // Fail open: never block a command because the hook broke.
      heartbeat.fail(err);
      process.exitCode = 0;
    }
  });
}
