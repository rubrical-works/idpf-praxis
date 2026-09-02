#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.100.2
 * @description Report other Claude Code sessions running in this same working directory at session startup. Reads the session registry (<claude-config-dir>/sessions/<pid>.json) with Node built-ins only, matches peers on exact cwd, excludes the calling session and dead entries, and distinguishes peers that carry a messaging address from those that do not. Read-only; never opens a socket and never mutates the working tree.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Shared reason vocabulary (#2672) — see lib/peer-unreachable-reasons.js.
const { rowLabel } = require('./lib/peer-unreachable-reasons.js');

/**
 * The registry is UNDOCUMENTED INTERNAL STATE of Claude Code. Every field read
 * here was observed, not specified, and any release may change or remove it.
 *
 * Observed shape (2026-08-28, win32 2.1.250; earlier on WSL2 Linux 2.1.231 and
 * 2.1.247 — all `peerProtocol: 1`):
 *
 *   { pid, sessionId, cwd, startedAt, procStart, version, peerProtocol,
 *     kind, entrypoint, pidDomain, messagingSocketPath, name, status,
 *     updatedAt }
 *
 * Two properties of the directory matter and are easy to miss:
 *   - `<pid>.<hash>.key` files sit alongside the `<pid>.json` entries, so the
 *     read filters by extension. Parsing everything would fail on every start.
 *   - `procStart` is a STRING ("134323961952732187") while both platform
 *     sources yield a NUMBER. See procStartMatches.
 */
const OBSERVED_VERSIONS = Object.freeze([
  '2.1.250 (win32)',
  '2.1.247 (win32)',
  '2.1.231 (WSL2 Linux)',
  '2.1.247 (WSL2 Linux)',
]);

const PEER_PROTOCOL_OBSERVED = 1;

// ─── Path comparison ───

/**
 * Fold a cwd for comparison.
 *
 * win32 filesystems are case-insensitive and accept either separator, so
 * `E:/Projects/x`, `E:\Projects\x` and `e:\projects\x\` are one directory.
 * POSIX is case-SENSITIVE — folding case there would merge two genuinely
 * different directories and report a peer that is editing other files.
 */
function normalizeCwd(cwd, platform) {
  if (typeof cwd !== 'string' || cwd === '') return null;
  let out = cwd.replace(/[\\/]+/g, '/').replace(/\/+$/, '');
  if (platform === 'win32') out = out.toLowerCase();
  return out === '' ? '/' : out;
}

function sameCwd(a, b, platform) {
  const na = normalizeCwd(a, platform);
  const nb = normalizeCwd(b, platform);
  return na !== null && nb !== null && na === nb;
}

// ─── Liveness ───

/**
 * Compare a registry `procStart` against a platform-read one.
 *
 * The registry stores it as a string; `/proc/<pid>/stat` field 22 and the
 * Windows FILETIME both arrive as numbers (or BigInt, which exceeds 2^53 and
 * so cannot be a plain number without precision loss). A strict `===` is
 * therefore false for EVERY live peer, and the symptom is an empty peer list —
 * indistinguishable from "no peers" unless something asserts otherwise.
 * Both sides are stringified before comparing.
 */
function procStartMatches(registryValue, platformValue) {
  if (registryValue === null || registryValue === undefined) return false;
  if (platformValue === null || platformValue === undefined) return false;
  return String(registryValue).trim() === String(platformValue).trim();
}

/**
 * Does this PID exist?
 *
 * Signal 0 performs the permission and existence checks without delivering
 * anything. EPERM means the process exists but is owned by someone else —
 * still existence, so it counts. Available on both platforms, no spawn.
 */
function defaultPidExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e && e.code === 'EPERM';
  }
}

/**
 * Field 22 of a `/proc/<pid>/stat` line — starttime, in clock ticks since boot.
 *
 * Field 2 is the comm name and may itself contain spaces and parentheses
 * (`(weird name (x))`), so the parse starts after the LAST ')' rather than
 * splitting the whole line. Returns null rather than a wrong field when the
 * line has no closing paren at all.
 */
function parseProcStat(line) {
  if (typeof line !== 'string') return null;
  const close = line.lastIndexOf(')');
  if (close === -1) return null;
  const fields = line.slice(close + 2).trim().split(/\s+/);
  // After the comm field, index 0 is field 3 (state); field 22 is index 19.
  const starttime = fields[19];
  return starttime === undefined || starttime === '' ? null : starttime;
}

/**
 * Linux: read the process start stamp. Absent /proc, or an unreadable entry,
 * yields null — which fails closed, since a null never matches.
 */
function defaultReadProcStartLinux(pid) {
  try {
    return parseProcStat(fs.readFileSync(`/proc/${pid}/stat`, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Liveness basis, by platform — the deliberate asymmetry at the heart of this
 * helper (#2661).
 *
 * linux (`pid-and-procstart`): existence AND a matching start stamp, so a
 * recycled PID cannot pass as its predecessor.
 *
 * win32 (`pid-existence`): existence only. Node exposes no process creation
 * time on Windows — `os` offers `uptime()` and nothing else — so reading a
 * FILETIME would require spawning PowerShell or wmic inside a startup check.
 * That trade was declined: one spawn per startup to close a window that needs
 * a dead session's PID to be recycled AND land on another live process between
 * two registry writes. The weaker basis is REPORTED (`WIN32_LIVENESS_PID_ONLY`)
 * rather than passed off as the stronger one.
 *
 * The basis is chosen before any comparison happens, so comparing a FILETIME
 * against a tick count is unreachable, not merely unwritten.
 */
function livenessBasisFor(platform) {
  return platform === 'win32' ? 'pid-existence' : 'pid-and-procstart';
}

// ─── Registry ───

/**
 * Read every `<pid>.json` in the registry directory.
 *
 * Distinguishes "directory absent" (→ unavailable) from "directory present but
 * empty" (→ none): they mean different things to a reader and only the first
 * is a degraded state. A malformed or unreadable entry is skipped, never fatal.
 */
function readRegistry(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return { available: false, entries: [], warnings: [] };
  }

  const entries = [];
  const warnings = [];

  for (const name of names) {
    // `.key` files live here too. Filtering by extension keeps them from
    // registering as malformed entries on every single startup.
    if (!name.endsWith('.json')) continue;
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    } catch {
      warnings.push('MALFORMED_ENTRY');
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      warnings.push('MALFORMED_ENTRY');
      continue;
    }
    entries.push(parsed);
  }

  return { available: true, entries, warnings };
}

// ─── Check ───

/**
 * Identify live peer sessions sharing this working directory.
 *
 * Everything the check depends on is injectable so tests never touch the real
 * registry or probe a real process: `registryDir`, `platform`, `cwd`, `env`,
 * `pidExists`, `readProcStart`, `bootTimeMs`.
 *
 * RETURN SHAPE — `peers` IS AT THE TOP LEVEL HERE, AND NOT UNDER `data` (#2678).
 *
 *   checkPeers().peers          // this function
 *   JSON.parse(cli output).data.peers   // the CLI block at the foot of this file
 *
 * The two deliberately differ. `{success, message, data}` is the transport
 * envelope every check script hands `startup-hook.js`, and it belongs to the
 * CLI, not to the function. Nothing in this repo `require`s this module outside
 * its own tests — the hook spawns the script — so the envelope is what callers
 * actually see, and every spec instructing `data.peers` invokes the CLI
 * immediately above that instruction.
 *
 * Written down because the divergence is invisible at the call site and its
 * failure is silent. A caller that requires the module and follows a spec
 * literally reads `undefined`, and an `|| []` beside it turns that into a
 * genuine empty array before anything downstream can object. That is exactly
 * how a session came to announce "no peers in this working directory" while two
 * were live and reachable, then inferred that a peer had exited — a claim its
 * own next command contradicted. `peer-announce.js` now rejects a non-array
 * `peers` by name, but it cannot see an empty array that a caller manufactured.
 */
function checkPeers(options = {}) {
  const platform = options.platform || process.platform;
  const homeDir = options.homeDir || os.homedir();
  const registryDir = options.registryDir || path.join(homeDir, '.claude', 'sessions');
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;
  const readProcStart = options.readProcStart || defaultReadProcStartLinux;
  const pidExists = options.pidExists || defaultPidExists;
  const livenessBasis = livenessBasisFor(platform);

  // Linux tick values are boot-relative, so an entry is only comparable if it
  // was written during the current boot. os.uptime() is seconds since boot.
  const bootTimeMs = options.bootTimeMs !== undefined
    ? options.bootTimeMs
    : Date.now() - os.uptime() * 1000;

  const warnings = [];

  const rawSelf = env.CLAUDE_PID;
  const selfPid = rawSelf === undefined || rawSelf === null || String(rawSelf).trim() === ''
    ? null
    : Number(String(rawSelf).trim());
  if (selfPid === null || Number.isNaN(selfPid)) {
    // Stated, not inferred. Without it the calling session appears in its own
    // peer list and a lone session renders `1` instead of `none` — a wrong
    // answer that looks exactly like a right one.
    warnings.push('CLAUDE_PID_UNSET');
  }

  if (livenessBasis === 'pid-existence') {
    // A known-weaker signal that says so. Silence here would let a PID-only
    // verdict read as the same guarantee linux gives.
    warnings.push('WIN32_LIVENESS_PID_ONLY');
  }

  const registry = readRegistry(registryDir);
  warnings.push(...registry.warnings);

  const base = {
    registryDir,
    platform,
    livenessBasis,
    selfPid: selfPid === null || Number.isNaN(selfPid) ? null : selfPid,
    peers: [],
    addressableCount: 0,
    warnings,
  };

  if (!registry.available) {
    return { ...base, state: 'unavailable' };
  }

  const peers = [];

  for (const entry of registry.entries) {
    if (typeof entry.cwd !== 'string') continue;
    if (!sameCwd(entry.cwd, cwd, platform)) continue;

    const pid = Number(entry.pid);
    if (!Number.isFinite(pid)) continue;
    if (base.selfPid !== null && pid === base.selfPid) continue;

    // Existence is the floor on both platforms.
    if (!pidExists(pid)) continue;

    if (livenessBasis === 'pid-and-procstart') {
      // The stamp is boot-relative: an entry that survived a reboot can collide
      // with a live process's tick value. Absent a startedAt there is no way to
      // tell which boot it belongs to, so it fails closed.
      const startedAt = Number(entry.startedAt);
      if (!Number.isFinite(startedAt) || startedAt < bootTimeMs) continue;
      if (!procStartMatches(entry.procStart, readProcStart(pid))) continue;
    }

    // Registered is not reachable, and there are TWO independent ways to be
    // unreachable. Collapsing them into one boolean is what made the first
    // implementation over-promise (#2660 spike, #2661 reopened).
    //
    //   no-messaging-address        DO_NOT_TRACK=1 — registers, carries no address
    //   not-listed-by-listagents    a `-p` (sdk-cli) session — carries an address,
    //                               yet ListAgents does not list it, and
    //                               SendMessage addresses peers by ListAgents
    //                               name. Observed 2026-08-28.
    //
    // `kind` cannot discriminate the second case: it reads `interactive` for
    // headless and interactive sessions alike. `entrypoint` is the field that
    // does. An ABSENT entrypoint is not read as sdk-cli — older builds may omit
    // it, exactly as pidDomain was omitted, and absence must not manufacture
    // unreachability.
    const socket = entry.messagingSocketPath;
    const hasMessagingAddress = typeof socket === 'string' && socket.trim() !== '';
    const entrypoint = typeof entry.entrypoint === 'string' ? entry.entrypoint : null;
    const toolListed = entrypoint !== 'sdk-cli';

    let unreachableReason = null;
    if (!hasMessagingAddress) unreachableReason = 'no-messaging-address';
    else if (!toolListed) unreachableReason = 'not-listed-by-listagents';

    const addressable = unreachableReason === null;

    peers.push({
      pid,
      name: typeof entry.name === 'string' ? entry.name : `pid ${pid}`,
      cwd: entry.cwd,
      addressable,
      hasMessagingAddress,
      unreachableReason,
      entrypoint,
      kind: typeof entry.kind === 'string' ? entry.kind : null,
      status: typeof entry.status === 'string' ? entry.status : null,
      // Absent on older builds (observed missing on WSL2 2.1.231, present at
      // 2.1.247). Carried when present; nothing here requires it.
      pidDomain: typeof entry.pidDomain === 'string' ? entry.pidDomain : null,
      version: typeof entry.version === 'string' ? entry.version : null,
      peerProtocol: Number.isFinite(Number(entry.peerProtocol)) ? Number(entry.peerProtocol) : null,
    });
  }

  peers.sort((a, b) => a.pid - b.pid);

  return {
    ...base,
    peers,
    addressableCount: peers.filter((p) => p.addressable).length,
    state: peers.length === 0 ? 'none' : 'peers',
  };
}

// ─── Rendering ───

/**
 * One `Peers:` row.
 *
 * Addressability is rendered per peer, never summarised into a single verdict:
 * a run may have some peers that can receive an announcement and some that
 * cannot, and collapsing that into one word is what conflates "seen" with
 * "reachable".
 */
function formatPeersRow(result) {
  if (!result || result.state === 'unavailable') {
    return 'unavailable — session registry not readable';
  }
  if (result.state === 'none' || result.peers.length === 0) {
    return 'none';
  }

  // Vocabulary is shared with the announcement skip notice (#2672). Both
  // surfaces describe the same two reasons; a local copy here is how they
  // drifted apart the first time.
  const rendered = result.peers
    .map((p) => (p.addressable
      ? `${p.name} (#${p.pid})`
      : `${p.name} (#${p.pid}, ${rowLabel(p.unreachableReason)})`))
    .join(', ');

  const { addressableCount } = result;
  const total = result.peers.length;
  const suffix = addressableCount === total
    ? `${total} reachable`
    : `${addressableCount} reachable of ${total}`;

  return `${rendered} — ${suffix}`;
}

const MESSAGES = {
  peers: (r) => `${r.peers.length} peer session(s) in this working directory.`,
  none: () => 'No other sessions in this working directory.',
  unavailable: () => 'Session registry unavailable.',
};

// The CLI wraps the result; `checkPeers()` above does not (#2678). Peers are at
// `data.peers` for anything reading this output, and at `.peers` for anything
// calling the function. Changing either shape breaks the other's callers, so
// change both or neither.
if (require.main === module) {
  const result = checkPeers();
  process.stdout.write(JSON.stringify({
    success: true,
    message: MESSAGES[result.state](result),
    data: { ...result, row: formatPeersRow(result) },
  }) + '\n');
}

module.exports = {
  checkPeers,
  readRegistry,
  normalizeCwd,
  sameCwd,
  procStartMatches,
  formatPeersRow,
  parseProcStat,
  livenessBasisFor,
  defaultPidExists,
  defaultReadProcStartLinux,
  MESSAGES,
  OBSERVED_VERSIONS,
  PEER_PROTOCOL_OBSERVED,
};
