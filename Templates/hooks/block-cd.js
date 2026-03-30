#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.77.2
 * block-cd.js
 *
 * PreToolUse hook that blocks `cd` commands in the Bash tool.
 *
 * Claude's Bash tool persists cwd between calls. A `cd` into a
 * subdirectory silently corrupts all subsequent relative paths,
 * causing scripts and commands to fail with misleading errors.
 *
 * This hook reads the Bash tool_input.command, checks if it starts
 * with `cd` as a standalone command (not substring), and returns
 * a deny decision if matched.
 */

const DENY_REASON =
  'The `cd` command is blocked because it silently changes the working directory for all subsequent Bash calls, breaking relative paths. ' +
  'Use absolute paths instead (e.g., `ls /full/path/to/dir`), or pass the directory to the command directly (e.g., `git -C /path log`).';

/**
 * Check if a command string starts with `cd` as a standalone command.
 * Must match: cd, cd /, cd .., cd "path", cd 'path', cd ~
 * Must NOT match: abcd, lcd, cdir, echo cd
 */
function isCdCommand(command) {
  const trimmed = command.trimStart();
  // Match `cd` at start, followed by end-of-string, whitespace, or shell operators
  return /^cd(?:\s|$|;|&|\|)/.test(trimmed);
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

main().catch(() => {
  // Errors should not block the tool — fail open
});

if (typeof module !== 'undefined') {
  module.exports = { isCdCommand, DENY_REASON };
}
