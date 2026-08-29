# Session Startup Instructions
**Version:** v0.99.0
**Source:** Reference/Session-Startup-Instructions.md
AI-facing reference for session work after startup. Not a procedural checklist — see the hook source for procedure; block format lives in its render function.
## Startup is Hook-Driven
`.claude/hooks/startup-hook.js` runs startup deterministically: gathers session info, runs seven checks (upgrade, statusline, config-integrity, branch-sync, dependency, task-tools, peers) in parallel on a staged 15s/30s/45s/60s ladder, emits the **Session Initialized** block to:
- **stderr** — colored copy for debug/transcript inspection. **Not** auto-surfaced in the Claude Code UI (hook exits 0; upstream docs cover stderr only for exit 2 — do not rely on it). Claude's echo is the only channel reaching the user.
- **`additionalContext`** — plain text in Claude's context: the block plus a verbatim-echo instruction, and post-hook actions (charter read + summary when active, domain specialist load, `/charter` if pending). The charter summary **is** a post-hook content read: when `charterStatus` is `Active`, Claude reads `CHARTER.md` after echoing the block and emits a concise prose summary. The block carries only the `Charter Status:` line (#2484 reversed #2475's precomputed `Charter Vision:`/`Charter Focus:` lines, clipped at 200 chars).
**Six of seven run unconditionally; `upgrade` does not.** Registered only when `framework-config.json` `selfHosted` is not `true` — self-hosted runs six checks, a deployed project seven. Condition is on **registration**, not output: a skipped check contributes **no row** to the block, not an empty or "skipped" one. Row count alone cannot distinguish skipped from failed-to-run — check `selfHosted` before concluding a check broke.
## Branch Sync Offer
`behind` makes `additionalContext` carry an **offer**, not just a status line — `06-runtime-triggers.md` *offer, don't force*: the hook asks, never mutates.
| Sync state | Post-hook action |
|---|---|
| `behind`, no conflicts | Offer `git pull --ff-only`; run on acceptance, report result. Declining leaves the tree untouched. On failure report git's error verbatim, continue — no retry, no non-fast-forward fallback. |
| `behind`, conflicts | **No offer.** Report the named paths; a fast-forward would abort, and stashing or discarding destroys work. |
| `diverged` | **No offer.** Report the divergence only. |
| `ahead` / `up-to-date` / `no-upstream` | No action. |
**Conflicts, not dirtiness, are the discriminator.** `branch-sync-check.js` intersects `git status --porcelain` against `git diff --name-only HEAD..@{upstream}` into `conflictingPaths`. A dirty tree not touching the incoming diff fast-forwards cleanly and still gets the offer; keying on dirtiness would refuse a safe update in the common case.
**`fetched` separates a verified from a cached count.** The check fetches the upstream ref first: a branch goes stale for the same reason its tracking ref does, so the cached ref is wrong exactly when the offer matters. Best-effort (own timeout, `GIT_TERMINAL_PROMPT=0`); failure sets `fetched: false` and still offers, marked as possibly low.
**`diverged` is deliberately narrow.** An earlier implementation offered rebase/merge/skip — a history rewrite chosen before the user sees the divergence.
## Peers Row (#2661)
Reports other sessions in **this same working directory**, so a concurrent worker is visible before you edit files it may also be editing. Advisory only — never blocks startup, never mutates the tree, no ownership probe/halting gate/path-scope enforcement (those are Station, #2640).
| `state` | Row |
|---|---|
| `peers` | Names each peer and how many are reachable |
| `none` | **No row** — a lone session is the common case; a line every startup is noise |
| `unavailable` | Registry unreadable — discovery inactive |
**Seen is not reachable.** Availability is **per peer**, and there are **two** independent ways to be unreachable — the row names which.
| `unreachableReason` | Cause | Row |
|---|---|---|
| `no-messaging-address` | `DO_NOT_TRACK=1` — registers, no address | `name (#pid, no messaging address)` |
| `not-listed-by-listagents` | headless `-p` (`entrypoint: sdk-cli`) — **has** an address, absent from `ListAgents` | `name (#pid, registered, not tool-reachable)` |
**Registry discovery and `ListAgents` disagree; `ListAgents` governs sending.** Observed 2026-08-28: a `claude -p` session registers with a non-null `messagingSocketPath` and is absent from `ListAgents`. `SendMessage` addresses by `ListAgents` name, so such a peer cannot be sent to — a non-null socket path is **necessary but not sufficient**. `kind` reads `interactive` for both; **`entrypoint` discriminates** (`sdk-cli` vs `cli`). An *absent* `entrypoint` is not read as `sdk-cli` — older builds omit it, as `pidDomain` was omitted, and absence must not manufacture unreachability.
**Reachable is still not delivered — outside this vocabulary by construction (#2674).** Both reasons above are *discovery-time* facts about a **peer**. Whether a dispatched message arrives is a *per-send* outcome the receiver decides afterwards:

| Recipient disposition | Sender sees |
|---|---|
| accepted | delivered |
| held, then approved | delivered, later |
| held, then denied | a delivery notice, after the fact |
| held, then expired unapproved | a delivery notice, after the fact |

Observed 2026-08-28: an event-1 announcement was held on a **permission-mode-class** mismatch while the sender's row read the peer reachable. It was — it was not *delivered to*.

**Not a third `unreachableReason`, and must not become one.** The registry exposes no permission/mode/bypass/approval field (19 fields, five live entries), `peerFeatures` is identical for every session, and `ListAgents` surfaces only name, kind, status, start time — so it is undetectable in advance. Nor would a new field make it one: a denial is a decision and an expiry is silence, yet both reach the sender as the same terminal *not delivered* — a property of the **send**, not the **peer**. `peer-announce.js` therefore states the dispatch and names the outcomes it cannot distinguish.
**The registry is undocumented internal state.** Reads `<claude-config-dir>/sessions/<pid>.json`; every field was **observed, not specified**, and any release may change it. Entries carry `version` and `peerProtocol` — check those first when the row misbehaves after an upgrade. Observed, all `peerProtocol: 1`: **2.1.250**, **2.1.247** (win32); **2.1.251**, **2.1.250**, **2.1.247**, **2.1.231** (WSL2 Linux); **2.1.250**, **2.1.197** (Debian 12 container, glibc). Container rows are **install-and-run only** (#2669) — both install and start and `<home>/.claude/sessions` is created, but with no credentials no session begins processing, so no entry is ever written; they establish that the registry path resolves, not that a peer was discovered.
**The messaging socket has four allowlisted locations, not one (#2669).** Derived as `XDG_RUNTIME_DIR || CLAUDE_CODE_TMPDIR || <tmpdir>`, then `<dir>/cc-socks/<pid>.sock`, falling back to `/tmp/cc-socks-<uid>/<pid>.sock` past the 103-byte `sun_path` limit. **An absent `XDG_RUNTIME_DIR` does not yield a null `messagingSocketPath`** — observed live at `/tmp/cc-socks/<pid>.sock`. A session without logind is therefore **not** `no-messaging-address`; assuming so mis-attributes the row's cause.
Two easy-to-miss directory properties, both already bitten: `<pid>.<hash>.key` files sit **alongside** the JSON, so reads filter by extension; and `procStart` is a **string** while both platform sources yield a number, so strict `===` reports every live peer dead — an empty list indistinguishable from "no peers".
**Liveness is platform-specific, and says so.**
| Platform | `livenessBasis` | Signal |
|---|---|---|
| linux | `pid-and-procstart` | PID exists **and** `/proc/<pid>/stat` field 22 matches registry `procStart` |
| win32 | `pid-existence` | PID exists only |
Node exposes no process creation time on Windows; reading a FILETIME means spawning PowerShell/`wmic` inside a startup check. Trade declined — win32 emits `WIN32_LIVENESS_PID_ONLY` so the weaker basis is never passed off as the stronger. Rationale: `Construction/Design-Decisions/2026-08-28-win32-peer-liveness-pid-existence-only.md`.
Linux ticks are **boot-relative**: an entry surviving a reboot can collide with a live start value. `startedAt` is compared against `os.uptime()`; anything predating the boot is excluded, and no `startedAt` fails closed.
**Availability matrix**
| Who | Discoverable? | Reachable? |
|---|---|---|
| Same cwd, same machine, same user | Yes | Only with a messaging address |
| **Different** cwd | No — matched on exact `cwd` | n/a |
| Sibling worktree or second clone | **No** — different `cwd`, deliberately | n/a |
| **Different machine** | **No** | **No** |
| Another user, same machine | **No — no cross-user path** | **No** |
Last two rows are not limitations awaiting a fix: scope is one machine, one user, one working directory, corroborated by the per-UID POSIX socket path.
## Post-Compact Behavior
**No re-reading required.** `.claude/rules/` reload automatically after compaction; the hook does not re-run — Claude resumes from in-memory context.
## On-Demand Documentation Loading
Load only when needed. Paths use `frameworkPath` from `framework-config.json` (relative to root).
| When Working On | Load File |
|---|---|
| System Instructions or Domain Specialists | `{frameworkPath}/Overview/Framework-System-Instructions.md` |
| IDPF-Agile, or the complete framework reference | `{frameworkPath}/Overview/Framework-Overview.md` |
| PRD work | `{frameworkPath}/Assistant/Anti-Hallucination-Rules-for-PRD-Work.md` |
## Framework Path Convention
**All framework file references in command specs must use the `{frameworkPath}/` prefix**, read from `framework-config.json` → `frameworkPath`. Self-hosted: `"."` → project root. User projects: hub install root (`C:\ProgramData\Praxis Hub Manager\framework_root_X.Y.Z`).
**Applies to:** `Templates/`, `Overview/`, `Reference/`, `System-Instructions/`, `Assistant/`, `IDPF-*/`, `Domains/`, `Skills/`
**Does NOT apply to:** `.claude/scripts/`, `.claude/metadata/`, `.claude/rules/`, `.claude/commands/`, `.claude/skills/` — symlinked (or copied, for skills/commands) to user projects; resolve locally.
❌ `Templates/artifacts/prd-template.md` — ✅ `{frameworkPath}/Templates/artifacts/prd-template.md`
**End of Session Startup Instructions**
