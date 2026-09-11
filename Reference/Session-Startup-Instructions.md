# Session Startup Instructions
**Version:** v0.102.0
**Source:** Reference/Session-Startup-Instructions.md
AI-facing reference for session work after startup. Not a procedural checklist — see the hook source for procedure; block format lives in its render function.
## Startup is Hook-Driven
`.claude/hooks/startup-hook.js` runs startup deterministically: gathers session info, runs eight checks (upgrade, statusline, config-integrity, branch-sync, dependency, task-tools, gh-auth, peers) in parallel on a staged 15s/30s/45s/60s ladder, emits the **Session Initialized** block to:
- **stderr** — colored copy for debug/transcript inspection. **Not** auto-surfaced in the Claude Code UI (hook exits 0; upstream docs cover stderr only for exit 2 — do not rely on it). Claude's echo is the only channel reaching the user.
- **`additionalContext`** — plain text in Claude's context: the block plus a verbatim-echo instruction, and post-hook actions (charter read + summary when active, domain specialist load, `/charter` if pending). The charter summary **is** a post-hook content read: when `charterStatus` is `Active`, Claude reads `CHARTER.md` after echoing the block and emits a concise prose summary. The block carries only the `Charter Status:` line (#2484 reversed #2475's precomputed `Charter Vision:`/`Charter Focus:` lines, clipped at 200 chars).
**Six of eight run unconditionally; `upgrade` and `peers` do not.** Two gates, on unrelated conditions — the registered count is a function of **two** settings, not one.
| Check | Registered when |
|---|---|
| statusline, config-integrity, branch-sync, dependency, task-tools, gh-auth | always |
| `upgrade` | `framework-config.json` `selfHosted` is not `true` |
| `peers` | `crossSessionMessaging.discovery` resolves true (#2702) |
Deployed project + discovery on → eight; self-hosted + discovery on → seven; self-hosted + discovery off → six. **Never read a row count as a check count without knowing both settings** — this paragraph previously read "six of seven; `upgrade` does not", false the moment #2702 gated `peers`, and read as asserting `peers` was unconditional.
Condition is on **registration**, not output: a skipped check contributes **no row** to the block, not an empty or "skipped" one. Row count alone cannot distinguish skipped from failed-to-run. **Exception:** `peers` with `discovery: false` **does** emit a row saying it did not look — absence there would otherwise be indistinguishable from "no peers found" (see below).
## Branch Sync Offer
`behind` makes `additionalContext` carry an **offer**, not just a status line — `06-runtime-triggers.md` *offer, don't force*: the hook asks, never mutates.
| Sync state | Post-hook action |
|---|---|
| `behind`, no conflicts | Offer `git pull --ff-only`; run on acceptance, report result. Declining leaves the tree untouched. On failure report git's error verbatim, continue — no retry, no non-fast-forward fallback. |
| `behind`, conflicts | **No offer.** Report the named paths; a fast-forward would abort, and stashing or discarding destroys work. |
| `diverged` | **No offer to change history.** Report the divergence, then name the recovery path: run `/done` on the issue still in review, whose Step 2 sync guard resolves it, or push by hand. Never run either for the user. |
| `ahead` / `up-to-date` / `no-upstream` | No action. |
**Conflicts, not dirtiness, are the discriminator.** `branch-sync-check.js` intersects `git status --porcelain` against `git diff --name-only HEAD..@{upstream}` into `conflictingPaths`. A dirty tree not touching the incoming diff fast-forwards cleanly and still gets the offer; keying on dirtiness would refuse a safe update in the common case.
**`fetched` separates a verified from a cached count.** The check fetches the upstream ref first: a branch goes stale for the same reason its tracking ref does, so the cached ref is wrong exactly when the offer matters. Best-effort (own timeout, `GIT_TERMINAL_PROMPT=0`); failure sets `fetched: false` and still offers, marked as possibly low.
**`fetched: false` is reported for every stale-able status, not only `behind` (#2687).** Block and `additionalContext` both emit an unverified row for `up-to-date`, `ahead`, `behind`, `diverged`, naming the cached remote-tracking ref. It matters **most** at `up-to-date` — the one status that otherwise emits nothing, so a stale all-clear is indistinguishable from a verified one. Observed on `idpf/0.99.0`: expired `gh` token, HTTPS remote, no `credential.helper`; 3 commits behind for a whole session with no row at any point. `fetched: false` is the **absence** of information, never a clean bill of health.
**`no-upstream` is excluded, deliberately.** `fetchUpstream()` returns `false` whenever no remote/mergeRef is configured, so that status *always* carries `fetched: false`; a caveat there reports configuration as fetch failure. The envelope `message` carries the same qualification while `success` and `status` stay unchanged — consumers key off `status`, so this is wording, not contract.
**`diverged` offers navigation, never a strategy (#2668).** #2001 offered rebase/merge/skip — a history rewrite chosen before the user sees the divergence — so #2518 removed it and reported only. #2668 restored an offer of a **different kind**: the hook names *where* the divergence gets resolved (`/done` Step 2's sync guard, or a manual push), naming no git command and asking for no strategy.
This answers #2518's two recorded objections rather than overriding them. **Sequencing/consent:** naming a recovery path is not a history rewrite, so nothing commits the user when they know least about what diverged. **Non-assertability:** the text is a *fixed string*, assertable per-state like every other branch-sync state — it was the "either offer nothing or offer a choice" formulation, not the offer itself, that had no assertable outcome.
**Do not collapse this back to "reports only"** — that described the #2518 state and is now false; a reader acting on it drops the recovery path, which is the whole of #2668. Equally do not widen it into a git command: `git rebase`, `pull --rebase` and `git merge` are absent on purpose, and a guard test asserts their absence.
## GitHub Token Row (#2689)
Reports whether the authenticated token holds the scopes this project's `gh pmu` workflow needs. `GitHub Workflow: Active via gh pmu version X` derives from `gh pmu --version` alone — proves the extension is **installed**, says nothing about board read/write.
**The failure is silent and mid-workflow.** `gh pmu` warns to stderr and **exits 0**, so consumers see a degraded result, not an error: board reads return empty, every `gh pmu move` fails, startup already said healthy. `/work`'s Pre-Work Status Gate reads null status as "not in progress" and moves anyway; Step 2b's filter matches nothing and reworks finished sub-issues; the Review-State Gate's `indeterminate` fail-open (#2577) becomes a blanket bypass.
| `state` | Row |
|---|---|
| `verified` | **No row** — the common case; matches `dependency` healthy, `task-tools` enabled-locally |
| `missing-scopes` | Names each missing scope, the consequence, and the exact remediation |
| `undeterminable` | Says scopes could not be determined, and that this is **not** an all-clear and **not** a missing scope |
**Required scopes derive from `.gh-pmu.json`, never hardcoded** — and deliberately only `repo` and `project`. A `project` block implies **write-level** `project`, not `read:project`: `gh pmu move` **writes** board fields, so a read-only token reads the board fine and fails every transition. `read:org`/`workflow` are **not** asserted — nothing in that file says whether the owner is an org or whether CI files will be touched, so requiring them would report `missing-scopes` against a correctly-privileged user-owned board.
**No `.gh-pmu.json` → requires nothing, returns `verified`, spawns no `gh`.** That is the opt-out, and why this check is registered **unconditionally** alongside `dependency`/`task-tools` rather than gated like `peers`: discovery is a project decision (#2702), token privilege is not — a project cannot opt out of needing the scopes its own config declares.
**`undeterminable` is never a gap — the check's most load-bearing property.** A fine-grained PAT returns no scope information at all, so `null` (told nothing) and `[]` (told, none) must stay distinguishable; collapsing them fails a correctly-privileged token — the `procStart` string-vs-number defect (#2661) in a new costume. No API exposes a fine-grained PAT's permission set (same finding in `04-deployment-awareness.md`), so it is terminal, not a step toward a better answer.
**An env token changes the remedy, not just the diagnosis.** `GH_TOKEN`/`GITHUB_TOKEN` overrides the stored login and `gh auth refresh` **cannot modify it**, so the row names the env var and does **not** name the refresh command at all — not even to say it would not work. A reader skimming a row runs the command they see, not the sentence qualifying it.
**Fails open, always.** Own 5s timeout, under the ladder's first 15s stage; timeout, network failure and logged-out `gh` all resolve to `undeterminable`, never `missing-scopes` — different problems, different remedies. Advisory and read-only: never blocks startup, never mutates, never runs a remediation itself (`06-runtime-triggers.md` — offer, don't force).
## Peers Row (#2661)
Reports other sessions in **this same working directory**, so a concurrent worker is visible before you edit files it may also be editing. Advisory only — never blocks startup, never mutates the tree, no ownership probe/halting gate/path-scope enforcement (those are Station, #2640).
| `state` | Row |
|---|---|
| `peers` | Names each peer and how many are reachable |
| `none` | **No row** — a lone session is the common case; a line every startup is noise |
| `unavailable` | Registry unreadable — discovery inactive |
### Gated by project config (#2702)
The `peers` check is **registered** only when `discovery` resolves true; the hook reads `readCrossSessionConfig(cwd)` from `.claude/scripts/shared/lib/cross-session-config.js` onto `info.crossSessionMessaging` and never re-derives the defaults inline. **Absence means enabled at every level** — no file, `{}`, or any omitted key inside it.
**The levers live in `.claude/x-session.json` since #2774**, not in `framework-config.json` — that file is committed team state six other commands rewrite, and how loud one developer wants inbound announcements is a per-developer preference. It sits directly under `.claude/`, a real directory in deployed projects rather than the hub junction `.claude/metadata/` is. The deprecated `crossSessionMessaging` key is **still read** as the fallback link, still accepted by `framework-config.schema.json`, and moved across by the next `/x-session-config` write; a run that read it says so, because that project is mid-migration and the line is what makes it visible.
| Resolved state | Row |
|---|---|
| `discovery` false | **A row, not silence.** Names the config key, states the registry was not read and peers were not looked for, carries the resolver's implication. The check does not run — nothing is scanned |
| `enabled` false | Same row, cause reported as `crossSessionMessaging.enabled: false` — the key the user set, not the one false downstream of it |
| Any group off, discovery on | Normal row plus the effective state — **including when `state` is `none`**, which otherwise emits nothing |
| Fully enabled | Unchanged from the table above |
**`discovery: false` must NEVER render as an absent row.** The table above already assigns absence the meaning *no peers found*; reusing it for *did not look* makes a configured project indistinguishable from a lone one — different facts, different remedies, and the whole reason the row exists.
**The `none` + configured case is why a row appears where #2661 said it should not.** That silence is justified for an *unconfigured* lone session and only there. This row and `/x-session-config`'s opening display are the **only** two places effective state surfaces, because the emitters deliberately print no per-invocation skip notice — announcing the suppression every run is the noise the setting removes.
**The upstream monitor is governed separately** by `upstreamMonitor`, via `upstream-monitor.js` `armingDecision()`, reported once at arm time. `discovery: false` does **not** disable it — it polls the git upstream, not peers.
### The session layer above the project config — `IDPF_X_SESSION` (#2705)
Every key above is **project** state: `framework-config.json` is git-tracked and shared by every session in the working directory, so it cannot express a decision scoped to one session for that session's life. A per-session choice made there would be committed, silencing exactly the concurrent sessions the channel exists to coordinate. `IDPF_X_SESSION` is that missing layer, at the top of the chain:
```
IDPF_X_SESSION  >  framework-config.json crossSessionMessaging  >  enabled by default
```
An **absent** variable changes nothing — absence-means-enabled gains a layer, not an exception. Read through the same `resolveCrossSessionConfig()` every consumer already calls, so there is one resolution path; the second argument is an injectable env bag defaulting to `process.env`, which lets tests exercise the matrix without mutating the real environment.
**All-or-nothing.** A recognised off-value resolves *exactly* as `crossSessionMessaging.enabled: false` — discovery, notices, upstream monitor, narration, all three groups. No lever list: per-lever tuning is a project decision via `/x-session-config --off <levers>`, and a value grammar would need its own parse, validation and unrecognised-lever rule for a quick per-session mute.
**Only `off`, `0` and `false` suppress**, case-insensitive after trimming; empty or whitespace-only counts as **absent**. **Any other value leaves messaging enabled and is reported as unrecognised.** Same polarity as `tmpCleanup`, deliberately opposite `verificationMode`, which fails an unknown value *into* strict. For a gate, failing into strictness is safe; for a messaging opt-out the analogous "safe" direction is silence, and a typo that silently mutes a session is undetectable by anyone — dispatch is already invisible from the sending side (#2674), so no peer can distinguish a muted session from a quiet one and the muted session is told nothing either. A typo must leave you audible and told.
**The resolver names which layer decided** — `environment`, `project-config`, or `default` — so consumers report the source rather than infer it. `crossSessionMessaging: {}` reports `default`, not `project-config`: an empty object turns nothing off, and claiming it would break the property that an empty object and an absent one resolve identically.
| Resolved state | Row |
|---|---|
| Suppressed by `IDPF_X_SESSION` | **A row naming the variable** — its value, that it was **not** written to `framework-config.json`, and that unsetting it restores discovery next session |
| Unrecognised value | **No suppression row.** Messaging stays enabled and discovery runs; the value is reported through `implications` |
**The row must not name a config key here.** The override zeroes `discovery` exactly as the config keys do, so the same branch fires — but reporting *disabled by config (`crossSessionMessaging.enabled: false`)* sends the reader to edit a file that does not contain the setting; they find nothing wrong and the session stays muted with no explanation left. Naming the cause is this row's whole function, so naming the **wrong** cause is worse than the silence it replaces.
**Emission only — there is no receiving-side opt-out.** Whether a dispatched message is accepted, held, declined or left to expire is the receiving session's decision, undetectable from the sender (#2674). The registry exposes no permission, mode, bypass or approval field, so a session cannot advertise *do not message me* and senders could not honour it if it could. `IDPF_X_SESSION` stops **this** session emitting; it promises nothing about what reaches it. The one receive-side lever is `noticeNarration` below, which governs narration verbosity, not acceptance.
### Inbound announcement narration — `noticeNarration` (#2735)
Every other `crossSessionMessaging` lever governs **emission**. This one governs **reception**: how verbosely this session narrates an announcement it receives.
| Resolved value | Behaviour on an inbound announcement |
|---|---|
| absent or `true` (default) | Verbose — may look the issue up, enumerate likely files, analyse the collision surface |
| `false` (quiet) | **One-line acknowledgement KEPT**; commentary not — no issue lookup, no likely-files enumeration, no collision-surface analysis |
| a live `.hall-monitor.json` marker (#2769) | **Quiet**, exactly as `noticeNarration: false`. A `/hall-monitor` session is live here and already doing the analysis; N sessions repeating it is the duplication that command removes. |

**Precedence — it only ever LOWERS verbosity:** `enabled: false` → quiet regardless; `noticeNarration: false` → quiet regardless; otherwise a live marker → quiet; otherwise (no marker, or a stale one) → verbose. A marker is evidence that *more* suppression is wanted, never less, so it can never turn a project that chose quiet back into a loud one. Read it via `.claude/scripts/shared/lib/hall-monitor-presence.js` `readPresence(cwd)` on an inbound announcement; never re-derive liveness, which is reused from `peers-check.js` so this and the `Peers:` row agree by construction.
**It applies to every session that reads it, the monitor included** — `readPresence` reports `active: true` for a marker whose `pid` is the caller, which is correct here. The self carve-out belongs to `decideStart`, which must not refuse a monitor on its own marker: a different question, a different function.
**A stale marker suppresses nothing.** `active` is true only for `live`; `stale-pid`, `stale-boot`, `malformed` and `cwd-mismatch` narrate verbosely and are named on the `Peers:` row so a crashed monitor is visible.
**Quiet is not silence, and that distinction is the contract.** The acknowledgement is the only evidence the sender has that anything landed — dispatch is undetectable from the sending side (#2674) — so suppressing it removes the one signal the protocol does provide. Quiet trims what the protocol never asked for.
**Why the rule states this: the memory half does not ship.** `--quiet` writes the config lever *and* a per-project memory artefact, but that artefact lives in Claude Code's per-user, per-machine store — neither project state nor a framework surface. In a deployed project that path differs and may not exist, so the lever may be the only half present, and a lever with no stated behaviour is a setting that does nothing. This section is what makes it mean something there.
**Not implied by `discovery: false`** — that implication is about announcing **to** peers never discovered and says nothing about narrating what is **received**; a session can still receive with its own discovery off. It **is** forced off by `enabled: false`. **Distinct from `notices`**, which suppresses sender-side dispatch caveats: different axis, not a stronger version of the same one.
**Config and memory can disagree, silently.** A lever reading quiet with the artefact absent is a suppression that quietly stopped working — indistinguishable from one never set. `/x-session-config --show` reports both and names the drift.
**Seen is not reachable.** Availability is **per peer**, and there are **two** independent ways to be unreachable — the row names which.
| `unreachableReason` | Cause | Row |
|---|---|---|
| `no-messaging-address` | Entry carries `messagingSocketPath: null`. **What sets it null is not attributed** — see below | `name (#pid, no messaging address)` |
| `not-listed-by-listagents` | headless `-p` (`entrypoint: sdk-cli`) — **has** an address, absent from `ListAgents` | `name (#pid, registered, not tool-reachable)` |
**`DO_NOT_TRACK=1` is not the cause; the correction is a build change, not a platform difference (#2685).** The row named it on a WSL2 observation at **2.1.247**. Re-measured 2026-08-30 on WSL2 at **2.1.251**: `DO_NOT_TRACK=1` registers a **non-null** `messagingSocketPath` (`/run/user/1000/cc-socks/<pid>.sock`, three spawns, `claude --version` and socket read in one run), matching the native-POSIX 2.1.251 result that first contradicted it (#2680). Both platforms agree; only the builds differ, so the 2.1.247 recording is stale and WSL2 was never an outlier.
**The direction is asymmetric.** Non-null on WSL2 at any build past 2.1.247 is conclusive — same platform, changed behaviour. Null would have attributed to *platform* only at ≥ 2.1.251; earlier, the change could still land in 2.1.250 or 2.1.251 and stay confounded.
**Only the documented cause was ever wrong.** `no-messaging-address` derives from `messagingSocketPath` being null and is correct whatever sets it. **No condition has been observed to null it on a current build** — stated as an absent observation, not as a claim none exists. Naming another plausible cause here would reproduce this defect one level deeper.
**Reading the registry races the session.** The entry is deleted on exit, so a fixed sleep after a short `-p` prompt reads an empty directory — indistinguishable from "no entry was ever written". Poll while the process is alive.
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
## Trash Row (#2771)
Reports stale `.tmp-*` scratch files removed from the project root. **The one startup step that mutates the tree** — every other check is advisory and read-only, so this section exists mainly to say why the exception is here and how far it reaches.
| Outcome | Row |
|---|---|
| Files removed | `Trash: removed 12 stale .tmp-* files (oldest 4d)` |
| A removal failed | `Trash: 1 stale .tmp-* file could not be removed — <name>: <error>` |
| Nothing removed, nothing failed | **No row** — the common case; matches `Peers` `none`, `dependency` healthy, `gh-auth` verified |
| `tmpCleanup: false` | **No row.** The sweep does not run — nothing is scanned |
**Why the leak needs sweeping at all.** Every command writing a scratch file ends with an `rm`, and that step is skipped whenever the command errors, the session is interrupted, or compaction lands between the write and the remove; ad hoc investigation files have no owning command and no `rm` step at all. Because `.tmp-*` is gitignored, `git status` never shows any of it — the one tool everyone looks at is blind by construction, so nothing ever prompts a cleanup. Observed at authoring: 13 files, one to four days old, belonging to seven closed issues, one open issue and four investigations.
**Delete, not offer — the deliberate exception to *offer, don't force*.** `06-runtime-triggers.md` governs artifacts a user might want; this is a set nobody wants, by construction. And the hook speaks through `additionalContext`, so an "offer" is Claude asking a question *after* the block: a turn spent on every session start, for files whose only property is that they were abandoned. Prompting here adds the noise a hook should remove.
**What makes that safe is the refusal set, not a prompt.** A candidate survives if it is a directory, not a regular file, git-tracked, younger than `minAgeMs`, or if the git query itself failed — that last one skips **every** candidate, because "git could not answer" must stay distinguishable from "git said none are tracked". Deleting is irreversible; keeping costs a file that survives to the next session, so every ambiguous case resolves toward keeping. **The age gate is the load-bearing one**: it stops the sweep touching a scratch file belonging to a command running right now in a peer session sharing the working directory.
**Thresholds are metadata, not prose** — `.claude/metadata/tmp-cleanup-signals.json`, re-read from disk at use. Its schema is deliberately stricter than a config file usually needs: three literal characters before any wildcard, no path separator, and a one-hour floor on `minAgeMs`. Those bounds exist because this config drives deletion, so a one-character typo must not be able to widen it.
**Opt out with `tmpCleanup: false`** in `framework-config.json` (absent means enabled, as everywhere else). Read through `framework-config.js` `resolveTmpCleanup()`, which delegates to the predicate in `tmp-cleanup.js` — one absence rule, reachable from both the hook (which cannot afford the ajv load on every session start) and ordinary consumers. **Only the literal `false` disables**, the opposite polarity from `verificationMode`'s fail-into-strict: here a silently-honoured typo would leave a user believing a cleanup runs when it does not, and nothing would report it, since a disabled sweep and a clean one both emit no row.
**Best-effort, never a gate.** Runs after the check ladder resolves — so it never delays a check or shares their timeout budget — and before the block renders, since its outcome is a row. A failure resolves to no row rather than an exception: the Session Initialized block renders regardless. That collapse of *failed* into *found nothing* is acceptable here and only here, because both mean no files were deleted, which is the fact the row would have reported.
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
