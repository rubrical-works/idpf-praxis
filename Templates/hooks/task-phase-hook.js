#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.118.0
 * task-phase-hook.js
 *
 * PreToolUse and PostToolUse hook (matcher: Bash) that reminds the model of
 * rule 07's two-phase task creation at the moment a routed command runs its
 * preamble script (#3610). One script, registered for both events; it reads
 * `hook_event_name`.
 *
 *   PreToolUse  → names the Phase 1 task subject for the command(s) that run
 *                 the invoked preamble script.
 *   PostToolUse → parses the preamble's JSON envelope from `tool_response` and
 *                 names the Phase 2 task list for the command the preamble
 *                 chose — nothing when a stop signal matches (failure,
 *                 redirect, early exit).
 *
 * Remind, never block: a hook cannot read the session's task list
 * (Construction/Design-Decisions/2026-11-11-task-phase-hook.md). Output is
 * `{hookSpecificOutput: {hookEventName, additionalContext}}`, exit 0.
 *
 * Acts only on an invoked node script — `node …/work-preamble.js --issue 5` —
 * never on a mention (`cat work-preamble.js`, a grep of it). Every map, list
 * and sentence is .claude/metadata/routed-command-tasks.json, re-read on each
 * call. Fails open, always: unparseable input, an unrecognized command, an
 * unparseable envelope, or missing or malformed data emit nothing. Node
 * built-ins only (deployed hooks resolve from the hub, #2418).
 */

const fs = require('fs');
const path = require('path');

// Anchored to __dirname: in a deployed project .claude/hooks/ and
// .claude/metadata/ are both hub junctions.
const CLAUDE_DIR = path.resolve(__dirname, '..');
const DATA_FILE = path.join(CLAUDE_DIR, 'metadata', 'routed-command-tasks.json');

const SILENT = Object.freeze({ code: 0, stdout: '', stderr: '' });

/** Parsed JSON at a path, or null. Never throws. */
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_e) {
    return null;
  }
}

/** The routed-command data, or null when it cannot be read. */
function loadData() {
  return readJson(DATA_FILE);
}

/** True when the data carries every field the hook reads. */
function usable(data) {
  return !!data
    && data.scripts && typeof data.scripts === 'object'
    && Array.isArray(data.stopSignals)
    && data.commands && typeof data.commands === 'object'
    && data.text && ['phase1', 'unavailable', 'phase2', 'extensions', 'trackerOmitted'].every((k) => typeof data.text[k] === 'string');
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every routed preamble script the command invokes as a node script, with the
 * arguments that follow it in the same command segment.
 * `node` must start a command segment (start, or after ; & | ( or a newline),
 * optionally behind VAR=value assignments — so a quoted mention inside grep,
 * echo or cat never matches, and a separator inside quotes starts no segment.
 * A quoted script path may contain spaces (#3615).
 * @returns {{script: string, args: string[]}[]}
 */
function findInvocations(command, data) {
  if (typeof command !== 'string' || !data || !data.scripts) return [];
  const names = Object.keys(data.scripts);
  if (names.length === 0) return [];
  const re = new RegExp(
    '(?:^|[;&|(\\n])\\s*(?:[A-Za-z_][A-Za-z0-9_]*=\\S*\\s+)*node(?:\\.exe)?\\s+(?:-{1,2}\\S+\\s+)*'
    // A quoted path may hold a space (a user-chosen hub path, #3615); try it before the unquoted form.
    + '(?:"[^"]*[\\\\/]|\'[^\']*[\\\\/]|["\']|[^\\s"\';&|]*[\\\\/])?(' + names.map(escapeRe).join('|') + ')["\']?(?=$|[\\s;&|)])([^;&|\\n]*)',
    'g'
  );
  const quoted = quotedPositions(command);
  const found = [];
  let m;
  while ((m = re.exec(command)) !== null) {
    // A separator inside a quoted argument starts no segment (#3615).
    if (quoted[m.index]) continue;
    found.push({ script: m[1], args: tokenize(m[2]) });
  }
  return found;
}

/**
 * Per character of a command: true when it sits inside a single- or
 * double-quoted string (a backslash escapes the next character outside
 * single quotes). The opening and closing quotes themselves are not inside.
 * @returns {boolean[]}
 */
function quotedPositions(command) {
  const inside = new Array(command.length).fill(false);
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) { quote = null; continue; }
      inside[i] = true;
      if (c === '\\' && quote === '"' && i + 1 < command.length) inside[++i] = true;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '\\') {
      i++;
    }
  }
  return inside;
}

/** Shell-ish tokens, quotes stripped; stops at a redirect. */
function tokenize(s) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(s || '')) !== null) {
    const t = m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3];
    if (m[3] !== undefined && /^\d*>/.test(t)) break;
    out.push(t);
  }
  return out;
}

/** The issue numbers the arguments name: --issue N, --issues "N,N", or the first positional number. */
function parseIssues(args) {
  const nums = (s) => String(s).split(/[,\s]+/).map((x) => x.replace(/^#/, '')).filter((x) => /^\d+$/.test(x));
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const eq = /^--(issues?)=(.*)$/.exec(a);
    if (eq) return nums(eq[2]);
    if ((a === '--issue' || a === '--issues') && i + 1 < args.length) return nums(args[i + 1]);
  }
  for (let i = 0; i < args.length; i++) {
    if (/^#?\d+$/.test(args[i]) && (i === 0 || !/^-/.test(args[i - 1]))) return nums(args[i]);
  }
  return [];
}

function phase1Subject(command, issues, data) {
  const entry = data.commands[command];
  if (!entry || typeof entry.phase1 !== 'string') return null;
  const forIssue = issues.length ? ` for ${issues.map((n) => `#${n}`).join(', ')}` : '';
  return entry.phase1.replace(/\{forIssue\}/g, forIssue);
}

/** additionalContext for PreToolUse, or null. */
function preContext(invocations, data) {
  const lines = [];
  for (const inv of invocations) {
    const commands = (data.scripts[inv.script] && data.scripts[inv.script].commands) || [];
    const issues = parseIssues(inv.args);
    const subjects = [...new Set(commands.map((c) => phase1Subject(c, issues, data)).filter(Boolean))];
    if (subjects.length === 0) continue;
    // Commands sharing one script share one subject today; name each if not.
    if (subjects.length === 1) {
      lines.push(data.text.phase1.replace(/\{commands\}/g, commands.join(' / ')).replace(/\{subject\}/g, subjects[0]));
    } else {
      for (const c of commands) {
        const s = phase1Subject(c, issues, data);
        if (s) lines.push(data.text.phase1.replace(/\{commands\}/g, c).replace(/\{subject\}/g, s));
      }
    }
  }
  if (lines.length === 0) return null;
  return [...new Set(lines), data.text.unavailable].join('\n');
}

/** The preamble envelope from tool_response, or null. */
function parseEnvelope(toolResponse) {
  let text = null;
  if (typeof toolResponse === 'string') text = toolResponse;
  else if (toolResponse && typeof toolResponse === 'object') {
    if (typeof toolResponse.stdout === 'string') text = toolResponse.stdout;
    else if (typeof toolResponse.output === 'string') text = toolResponse.output;
  }
  if (!text || !text.trim()) return null;
  const tryParse = (s) => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
    } catch (_e) {
      return null;
    }
  };
  const whole = tryParse(text.trim());
  if (whole) return whole;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? tryParse(text.slice(start, end + 1)) : null;
}

function getPath(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

/** The first stop signal the envelope matches for this script, or null. */
function matchStop(envelope, script, data) {
  for (const s of data.stopSignals) {
    if (!s || typeof s.path !== 'string') continue;
    if (Array.isArray(s.scripts) && !s.scripts.includes(script)) continue;
    const v = getPath(envelope, s.path);
    if (Object.prototype.hasOwnProperty.call(s, 'equals') && v === s.equals) return s;
    if (s.truthy === true && v) return s;
    if (typeof s.pattern === 'string' && typeof v === 'string') {
      try {
        if (new RegExp(s.pattern).test(v)) return s;
      } catch (_e) { /* a broken pattern disables only itself */ }
    }
  }
  return null;
}

/** The command a preamble served, chosen from its envelope. */
function chooseCommand(script, envelope, data) {
  const entry = data.scripts[script];
  if (!entry || !Array.isArray(entry.commands) || entry.commands.length === 0) return null;
  if (entry.byContextType) {
    const type = getPath(envelope, 'context.type');
    if (typeof type === 'string' && entry.byContextType[type]) return entry.byContextType[type];
    return entry.default || entry.commands[0];
  }
  return entry.commands[0];
}

/**
 * A data-declared `.claude/…` path resolved inside CLAUDE_DIR, or null.
 * Absolute paths, paths outside `.claude/` and any `..` escape are refused,
 * never read (Step 4g review of #3610).
 */
function resolveClaudePath(rel) {
  if (typeof rel !== 'string' || path.isAbsolute(rel) || !/^\.claude[\\/]/.test(rel)) return null;
  const full = path.resolve(CLAUDE_DIR, rel.replace(/^\.claude[\\/]/, ''));
  return full.startsWith(CLAUDE_DIR + path.sep) ? full : null;
}

const line = (t) => `- ${t.subject}${t.condition && t.condition !== 'always' ? ` (if ${t.condition})` : ''}`;

/** The Phase 2 lines for a command, or null when its source cannot be read. */
function phase2Lines(command, envelope, args, data) {
  const entry = data.commands[command];
  const p2 = entry && entry.phase2;
  if (!p2) return null;
  if (typeof p2.file === 'string') {
    const file = resolveClaudePath(p2.file);
    const defs = file ? readJson(file) : null;
    if (!defs || !Array.isArray(defs.tasks)) return null;
    const type = getPath(envelope, 'context.type');
    const tracker = Array.isArray(p2.trackerTypes) && p2.trackerTypes.includes(type);
    const omit = new Set(tracker ? (p2.trackerOmitScopes || []) : []);
    const unless = p2.trackerOmitScopesUnlessFlag;
    if (tracker && unless && !args.includes(unless.flag)) (unless.scopes || []).forEach((s) => omit.add(s));
    const kept = defs.tasks.filter((t) => t && typeof t.subject === 'string' && !omit.has(t.scope));
    const out = kept.map(line);
    const dropped = defs.tasks.length - kept.length;
    if (dropped > 0) out.push(data.text.trackerOmitted.replace(/\{count\}/g, String(dropped)));
    return out;
  }
  if (Array.isArray(p2.tasks)) {
    const out = p2.tasks.filter((t) => t && typeof t.subject === 'string').map(line);
    if (p2.extensions === true) out.push(data.text.extensions);
    return out;
  }
  return null;
}

/** additionalContext for PostToolUse, or null. */
function postContext(invocations, toolResponse, data) {
  const inv = invocations[0];
  const envelope = parseEnvelope(toolResponse);
  if (!envelope || matchStop(envelope, inv.script, data)) return null;
  const command = chooseCommand(inv.script, envelope, data);
  if (!command) return null;
  const lines = phase2Lines(command, envelope, inv.args, data);
  if (!lines || lines.length === 0) return null;
  return [data.text.phase2.replace(/\{command\}/g, command), ...lines].join('\n');
}

/**
 * The hook's whole decision as data, so it can be asserted without a process.
 * @param {string} rawInput - hook stdin
 * @param {object|null} data - parsed routed-command-tasks.json
 * @returns {{code: number, stdout: string, stderr: string}}
 */
function respond(rawInput, data) {
  if (!usable(data)) return SILENT;
  let input;
  try {
    input = JSON.parse(rawInput);
  } catch (_e) {
    return SILENT;
  }
  const command = input && input.tool_input && input.tool_input.command;
  const invocations = findInvocations(command, data);
  if (invocations.length === 0) return SILENT;

  const event = input.hook_event_name;
  let additionalContext = null;
  if (event === 'PreToolUse') additionalContext = preContext(invocations, data);
  else if (event === 'PostToolUse') additionalContext = postContext(invocations, input.tool_response, data);
  if (!additionalContext) return SILENT;
  return {
    code: 0,
    stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext } }),
    stderr: '',
  };
}

module.exports = { respond, loadData, findInvocations, parseIssues, parseEnvelope, DATA_FILE };

if (require.main === module) {
  // Heartbeat (#2917): records this hook's outcome for the startup Hook Health row.
  let heartbeat = { fail() {}, setCwd() {} };
  try { heartbeat = require('../scripts/shared/lib/hook-heartbeat.js').installHeartbeat('task-phase-hook'); } catch (_) { /* reported by the load check */ }

  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => {
    try {
      try { heartbeat.setCwd(JSON.parse(raw).cwd); } catch (_e) { /* cwd is best-effort */ }
      const r = respond(raw, loadData());
      if (r.stdout) process.stdout.write(`${r.stdout}\n`);
      process.exitCode = r.code;
    } catch (err) {
      // Fail open: never stop a command because the hook broke.
      heartbeat.fail(err);
      process.exitCode = 0;
    }
  });
}
