# Cross-Session Messaging
**Version:** v0.105.0
**Source:** Reference/Cross-Session-Messaging.md
**Purpose:** Forensics and provenance for cross-session messaging: peer discovery, reachability and liveness, what the session registry contains, and why each lever behaves as it does.
## How This Relates to Rule 03
**Disposition (c), #2945.** `.claude/rules/03-startup.md` § Peers Row keeps what the `Peers:` row says per state and the behavioural contract a session follows when a message arrives. This document holds the observations, measurements and reasoning behind it.
**Nothing auto-loads this document** — not a rule, no `deploymentFiles.rules` entry, no command or hook reads it. Read it on investigation: a `Peers:` row that looks wrong, a lever behaving unexpectedly, or before changing the subsystem. A session that never opens it still behaves correctly; the rule carries every instruction.
Rejected: **(a) Reference-only** — drops overlap relay, receipt recording and quiet narration from deployed sessions, where on-demand documents are never loaded (`FrameworkReview/Deployed-File-Loading-Audit.md`); **(b) rule-stated trigger** — still relies on the model choosing to read; no inbound-message hook event is verified.
## Project Config — Why (#2702, #2774)
`peers` registers only when `discovery` resolves true, read through `cross-session-config.js` `readCrossSessionConfig(cwd)` — six consumers share the absence rule, and the copy that drifts is the one nobody re-reads.
**Why `.claude/x-session.json` (#2774):** `framework-config.json` is committed team state rewritten by six other commands, while how loud one developer wants inbound announcements is per-developer preference. It sits under `.claude/` — a real directory in deployed projects, unlike the `.claude/metadata/` junction. The deprecated key stays readable as fallback until the next `/x-session-config` write moves it; a run reading it says so.
**Why `discovery: false` gets a row:** absence already means *no peers found*; reusing it for *did not look* makes a configured project indistinguishable from a lone one — different facts, different remedies.
**Why `none` + configured shows a row #2661 said it should not:** silence is justified only for an unconfigured lone session. The row and `/x-session-config`'s opening display are the only places effective state surfaces, because emitters deliberately print no per-invocation skip notice. Here the silence **is** the requested behaviour, surfaced where the setting lives rather than where it fires.
**`enabled: false` is reported under its own key** — the key the user set, not one false downstream of it.
## The Session Layer — `IDPF_X_SESSION` (#2705)
Project levers are committed state shared by every session, so they cannot express a per-session decision; one made there would be committed and silence exactly the concurrent sessions the channel coordinates.
**One resolution path:** the same `resolveCrossSessionConfig()`, with an injectable env bag (default `process.env`) so tests need not mutate the real environment.
**Why all-or-nothing:** per-lever tuning is a project decision (`/x-session-config --off <levers>`); a value grammar would need its own parse, validation and unrecognised-lever rule for a quick per-session mute.
**Why an unrecognised value leaves messaging on:** same polarity as `tmpCleanup`, opposite of `verificationMode`'s fail-into-strict. For a gate strictness is safe; for a messaging opt-out the "safe" direction is silence, and a typo that silently mutes a session is undetectable by anyone — dispatch is invisible from the sending side (#2674), no peer can tell a muted session from a quiet one, and the muted session is told nothing. A typo must leave you audible and told.
**The resolver names the deciding layer** — `environment`, `project-config`, `default`. `crossSessionMessaging: {}` reports `default`: an empty object turns nothing off, and claiming otherwise breaks empty-equals-absent.
**Why the row must not name a config key:** the override zeroes `discovery` as the config keys do, but *disabled by config* sends the reader to a file without the setting; they find nothing wrong and the session stays muted with no explanation. Naming the wrong cause is worse than silence.
**Why no receiving-side opt-out:** accept/hold/decline/expire is the receiver's decision, undetectable from the sender (#2674). The registry exposes no permission, mode, bypass or approval field, so a session cannot advertise *do not message me* and senders could not honour it.
## Inbound Narration — `noticeNarration` (#2735, #2769)
The one **reception** lever; every other governs emission.
**A live marker only lowers verbosity** — it is evidence more suppression is wanted, never less. Liveness is reused from `peers-check.js` via `overwatch-presence.js` `readPresence(cwd)`, so narration and the `Peers:` row agree by construction.
**The monitor applies it to itself** (`readPresence` is `active: true` for its own `pid`); the self carve-out belongs to `decideStart`, a different question.
**Why quiet keeps the one-line acknowledgement:** it is receiver-side narration the sender never sees; removing it removes *this user's* only evidence anything arrived.
**Why the rule must state it — the memory half does not ship:** `/x-session-config --quiet` writes the lever and a per-project memory artefact in Claude Code's per-user, per-machine store — neither project state nor a framework surface. In a deployed project that path may not exist, so the lever may be the only half present, and a lever with no stated behaviour does nothing.
**Not implied by `discovery: false`** (that is about announcing **to** undiscovered peers; a session with discovery off still receives). **Forced off by `enabled: false`.** Distinct from `notices` (sender-side dispatch caveats) — a different axis.
**Targeted routing (#2915):** under `broadcast: false` announcements go to the live `/overwatch` alone, so other working sessions receive none. Costs: a peer's `work-started` never arrives, so silence is not evidence no peer is working; and a monitor that holds, declines or lets messages expire is undetectable from the sender (#2674) — no session hears the announcements and nobody is told. Routing falls back to broadcast only for a missing, stale, unaddressable or ambiguously named monitor, never one simply not reading.
**Why `/x-session-config` reports effective routing (#2971):** the lever is intent; routing is decided per announcement from the marker as it stands. Observed 2026-09-21: a startup `Peers:` row showed a stale marker, a monitor started 45 minutes later and the ledger switched to targeted within a minute, yet the session kept reporting "no monitor running" and `--show` only repeated the setting. The reverse is worse — a crashed monitor silently turns every announcement back into a broadcast while the setting reads targeted. So `--show` and a bare run run the same `routeRecipients()` decision `announce.js` runs and report `targeted`, `fallback` with its reason, or `undetermined` — never a second marker check (two definitions of "targeted" drift). A failed discovery or marker read is `undetermined`, never `targeted`: an unverified "targeted" is the false all-clear the line exists to remove.
## Receipt Replies and Overlap Notices (#2922, #2914)
A live `/overwatch` sends one **receipt reply** per announcement routed to it, making receipt observable. Never "acknowledgement" — taken by receiver-side narration.
**Unknown ledger id: reported, never recorded** — applying it to the latest entry would attribute the receipt to whichever announcement was last. `lib/overwatch-receipt.js` `parseReceipt()` reads the id from the first line (`Receipt from /overwatch: … (ledger: <id>)`).
**A receipt confirms one hop and nothing else.** `dispatch: sent` = the `SendMessage` succeeded; `receipt: received` = the monitor read it. Nothing about acting on it or relays; the ledger keeps the two axes separate.
**Why an overlap notice is relayed in full under quiet narration:** a message whose first line begins `Overlap notice from /overwatch:` went to this session alone because its issue declares files another in-flight issue declares — the one inbound message actionable for the receiver, which a one-line acknowledgement would bury. The monitor already analysed it; the notice names both issues, both sessions and the shared files. No reply obligation.
## Reachability
**Seen is not reachable.** An entry with `messagingSocketPath: null` is a real peer editing the same files that can receive nothing. Evaluated per peer.
**`DO_NOT_TRACK=1` is not the cause of `no-messaging-address` — a build change, not a platform difference (#2685).** Named on a WSL2 observation at **2.1.247** (2026-08-27). Re-measured 2026-08-30 on WSL2 at **2.1.251**: non-null `messagingSocketPath` (`/run/user/1000/cc-socks/<pid>.sock`, three spawns, `claude --version` and socket read in one run), matching native-POSIX 2.1.251 (#2680). Platforms agree; only builds differ.
Asymmetric: non-null on WSL2 past 2.1.247 is conclusive; null would attribute to platform only at ≥ 2.1.251.
**Only the documented cause was wrong.** `no-messaging-address` derives from a null `messagingSocketPath` whatever sets it. **No condition has been observed to null it on a current build** — an absent observation, not a claim none exists; naming another plausible cause repeats the defect one level deeper.
**Registry and `ListAgents` disagree; `ListAgents` governs sending.** Observed 2026-08-28: a `claude -p` session registers with a non-null socket path and is absent from `ListAgents`; `SendMessage` addresses by `ListAgents` name, so a socket path is necessary, not sufficient. `kind` reads `interactive` for both; `entrypoint` discriminates (`sdk-cli` vs `cli`). An absent `entrypoint` is not `sdk-cli` — older builds omit it, as `pidDomain` was omitted.
### Delivery dispositions (#2674)
Reachability is a discovery-time fact about a **peer**; delivery is a per-send outcome the receiver decides afterwards:
| Recipient disposition | What the sender sees |
|---|---|
| accepted | delivered |
| held, then approved | delivered, later |
| held, then denied | a delivery notice, after the fact |
| held, then expired unapproved | a delivery notice, after the fact |
Observed 2026-08-28: an event-1 announcement was held on a **permission-mode-class** mismatch while the sender's row read the peer reachable. It was — it was not *delivered to*.
**Not a third `unreachableReason`, and must not become one.** The registry exposes no permission/mode/bypass/approval field (19 fields, five live entries), `peerFeatures` is identical for every session, `ListAgents` surfaces only name, kind, status, start time — undetectable in advance. Denial and expiry both reach the sender as one terminal *not delivered* — a property of the **send**, not the **peer**. `peer-announce.js` states the dispatch and names the outcomes it cannot distinguish.
## The Session Registry Is Undocumented Internal State
Discovery reads `<claude-config-dir>/sessions/<pid>.json`. **Every field was observed, not specified**; any release may change it. Check `version` and `peerProtocol` first when the row misbehaves after an upgrade.
Observed, all `peerProtocol: 1`: **2.1.250**, **2.1.247** (win32); **2.1.251**, **2.1.250**, **2.1.247**, **2.1.231** (WSL2 Linux); **2.1.250**, **2.1.197** (Debian 12 container, glibc).
Container rows are **install-and-run** only (#2669): both install and start and `<home>/.claude/sessions` is created, but with no credentials no session processes, so no entry is written — they show the registry path resolves, not that a peer was discovered.
**Reading the registry races the session.** The entry is deleted on exit, so a fixed sleep after a short `-p` prompt reads an empty directory — indistinguishable from never written. Poll while the process is alive.
**Four allowlisted socket locations (#2669):** `XDG_RUNTIME_DIR || CLAUDE_CODE_TMPDIR || <tmpdir>`, then `<dir>/cc-socks/<pid>.sock`, falling back to `/tmp/cc-socks-<uid>/<pid>.sock` past the 103-byte `sun_path` limit. **An absent `XDG_RUNTIME_DIR` does not null `messagingSocketPath`** — observed at `/tmp/cc-socks/<pid>.sock` — so a session without logind is **not** `no-messaging-address`.
Two directory properties that both bit: `<pid>.<hash>.key` files sit **alongside** the JSON, so reads filter by extension; `procStart` is a **string** while both platform sources yield a number, so strict `===` reports every live peer dead — an empty list indistinguishable from "no peers".
### Liveness is platform-specific, and says so
| Platform | `livenessBasis` | Signal |
|---|---|---|
| linux | `pid-and-procstart` | PID exists **and** `/proc/<pid>/stat` field 22 matches registry `procStart` |
| win32 | `pid-existence` | PID exists only |
Node exposes no process creation time on Windows; a FILETIME read means spawning PowerShell/`wmic` inside a startup check. Declined — win32 emits `WIN32_LIVENESS_PID_ONLY` so the weaker basis is never passed off as the stronger. Rationale: `Construction/Design-Decisions/2026-08-28-win32-peer-liveness-pid-existence-only.md`.
Linux ticks are **boot-relative**: an entry surviving a reboot can collide with a live start value. `startedAt` is compared against `os.uptime()`; anything predating the boot is excluded, and no `startedAt` fails closed.
### Availability matrix
| Who | Discoverable? | Reachable? |
|---|---|---|
| Same cwd, same machine, same user | Yes | Only with a messaging address |
| **Different** cwd | No — matched on exact `cwd` | n/a |
| Sibling worktree or second clone | **No** — different `cwd`, deliberately | n/a |
| **Different machine** | **No** | **No** |
| Another user, same machine | **No — no cross-user path** | **No** |
Last two rows are not limitations awaiting a fix: scope is one machine, one user, one working directory, corroborated by the per-UID POSIX socket path.
**End of Cross-Session Messaging**
