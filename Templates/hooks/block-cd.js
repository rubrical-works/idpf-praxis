#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.115.0
 * block-cd.js
 *
 * PreToolUse hook that blocks working-directory changes in the Bash and
 * PowerShell tools (#3017).
 *
 * Both tools persist cwd between calls. A `cd` (or `Set-Location`) into a
 * subdirectory silently corrupts all subsequent relative paths,
 * causing scripts and commands to fail with misleading errors.
 *
 * This hook reads tool_input.command, checks if it starts with a
 * cwd-changing command as a standalone command (not substring), and
 * returns a deny decision if matched.
 */

const DENY_REASON =
  'The `cd` command is blocked because it silently changes the working directory for all subsequent shell calls, breaking relative paths. ' +
  'Use absolute paths instead (e.g., `ls /full/path/to/dir`), or pass the directory to the command directly (e.g., `git -C /path log`).';

/**
 * Check if a command string starts with a working-directory change as a
 * standalone command, in either shell the hook is registered for (#3017).
 * Matched case-insensitively — PowerShell names are case-insensitive.
 * Must match: cd, cd /, cd .., cd "path", cd ~, Set-Location, sl, chdir,
 *   Push-Location, pushd, and the space-less built-ins cd.. and cd\
 * Must NOT match: abcd, lcd, cdir, echo cd, Get-Location, slack
 */
function isCdCommand(command) {
  const trimmed = command.trimStart();
  // A cwd-changing name at start, followed by end-of-string, whitespace, or shell operators
  if (/^(?:cd|chdir|sl|set-location|pushd|push-location)(?:\s|$|;|&|\|)/i.test(trimmed)) {
    return true;
  }
  // PowerShell's space-less built-ins: `cd..` and `cd\`
  return /^cd(?:\.\.|\\)/i.test(trimmed);
}

// Heartbeat (#2917): records this hook's outcome under the project root for the
// startup Hook Health row. Installed only when run as the hook — the test suite
// requires this module and must not write a heartbeat for its own process.
let heartbeat = { fail() {}, setCwd() {} };
if (require.main === module) {
  try { heartbeat = require('../scripts/shared/lib/hook-heartbeat.js').installHeartbeat('block-cd'); } catch (_) { /* reported by the load check */ }
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let data;
  try {
    data = JSON.parse(input);
  } catch {
    // Can't parse input — allow by default (silent)
    return;
  }

  heartbeat.setCwd(data?.cwd);
  const command = data.tool_input?.command;
  if (typeof command !== 'string') {
    return;
  }

  if (isCdCommand(command)) {
    console.log(JSON.stringify({
      decision: 'block',
      reason: DENY_REASON
    }));
  }
  // Silent return = allow
}

main().catch((err) => {
  // Errors should not block the tool — fail open. Recorded, not raised (#2917).
  heartbeat.fail(err);
});

if (typeof module !== 'undefined') {
  module.exports = { isCdCommand, DENY_REASON };
}
