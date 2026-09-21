# Session Startup Instructions
**Version:** v0.105.0
**Source:** Reference/Session-Startup-Instructions.md
AI-facing reference for session work after startup. Not a procedural checklist — see the hook source for procedure; block format lives in its render function.
## Startup is Hook-Driven
`.claude/hooks/startup-hook.js` runs startup deterministically: gathers session info, runs ten checks (upgrade, statusline, config-integrity, branch-sync, dependency, task-tools, gh-auth, hook-health, peers, testing-drift) in parallel on a staged 15s/30s/45s/60s ladder, emits the **Session Initialized** block to:
- **stderr** — colored copy for debug/transcript inspection. **Not** auto-surfaced in the Claude Code UI (hook exits 0; upstream docs cover stderr only for exit 2 — do not rely on it). Claude's echo is the only channel reaching the user.
- **`additionalContext`** — plain text in Claude's context: the block plus a verbatim-echo instruction, and post-hook actions (charter read + summary when active, domain specialist load, `/charter` if pending). The charter summary **is** a post-hook content read: when `charterStatus` is `Active`, Claude reads `CHARTER.md` after echoing the block and emits a concise prose summary. The block carries only the `Charter Status:` line (#2484 reversed #2475's precomputed `Charter Vision:`/`Charter Focus:` lines, clipped at 200 chars).
**Seven of ten run unconditionally; `upgrade`, `peers` and `testing-drift` do not.** Three gates, on unrelated conditions — the registered count is a function of **three** conditions, not one.
| Check | Registered when |
|---|---|
| statusline, config-integrity, branch-sync, dependency, task-tools, gh-auth, hook-health | always |
| `upgrade` | `framework-config.json` `selfHosted` is not `true` |
| `peers` | `crossSessionMessaging.discovery` resolves true (#2702) |
| `testing-drift` | `charterStatus` is `Active` (#2903) |
Deployed project + discovery on + active charter → ten; self-hosted + discovery on + active charter → nine; self-hosted + discovery off + pending charter → seven. **Never read a row count as a check count without knowing all three conditions** — this paragraph previously read "six of seven; `upgrade` does not", false the moment #2702 gated `peers`, and read as asserting `peers` was unconditional.
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
**Forensics and provenance live in `{frameworkPath}/Reference/Cross-Session-Messaging.md` (#2945)** — registry fields, liveness, socket paths, build observations, availability matrix, delivery dispositions, and the reasoning behind every lever below. Nothing auto-loads it; read it when investigating. This section keeps only what the row says and what a session must do.
### Gated by project config (#2702)
Registered only when `discovery` resolves true. Read via `.claude/scripts/shared/lib/cross-session-config.js` `readCrossSessionConfig(cwd)`; never re-derive the defaults inline. **Absence means enabled at every level** — no file, `{}`, or any omitted key.
Levers live in `.claude/x-session.json` (#2774); the deprecated `crossSessionMessaging` key in `framework-config.json` is still read as fallback, and a run that read it says so.
| Resolved state | Row |
|---|---|
| `discovery` false | **A row, not silence.** Names the config key, states the registry was not read and peers were not looked for, carries the resolver's implication |
| `enabled` false | Same row, cause reported as `crossSessionMessaging.enabled: false` |
| Any group off, discovery on | Normal row plus the effective state — **including when `state` is `none`** |
| Fully enabled | Unchanged from the table above |
**`discovery: false` must NEVER render as an absent row** — absence already means *no peers found*. No per-invocation skip notice anywhere else; this row and `/x-session-config`'s opening display are where effective state surfaces.
**The upstream monitor is governed separately** by `upstreamMonitor`, via `upstream-monitor.js` `armingDecision()`. `discovery: false` does not disable it.
### The session layer above the project config — `IDPF_X_SESSION` (#2705)
```
IDPF_X_SESSION  >  .claude/x-session.json (or legacy crossSessionMessaging)  >  enabled by default
```
Absent variable changes nothing. **Only `off`, `0` and `false` suppress** (case-insensitive, trimmed; empty = absent); a recognised off-value resolves exactly as `enabled: false` — all-or-nothing. **Any other value leaves messaging enabled and is reported as unrecognised.** The resolver names the deciding layer: `environment`, `project-config` or `default`.
| Resolved state | Row |
|---|---|
| Suppressed by `IDPF_X_SESSION` | **A row naming the variable** — its value, that it was **not** written to any config file, and that unsetting it restores discovery next session |
| Unrecognised value | **No suppression row.** Discovery runs; the value is reported through `implications` |
**The row must not name a config key here** — that sends the reader to a file that does not contain the setting.
**Emission only.** `IDPF_X_SESSION` stops **this** session emitting; there is no receiving-side opt-out.
### Inbound announcement narration — `noticeNarration` (#2735)
Governs how verbosely this session narrates an announcement it **receives**.
| Resolved value | Behaviour on an inbound announcement |
|---|---|
| absent or `true` (default) | Verbose — may look the issue up, enumerate likely files, analyse the collision surface |
| `false` (quiet) | **The one-line acknowledgement is KEPT.** No issue lookup, no likely-files enumeration, no collision-surface analysis |
| a live `/overwatch` marker at `.claude/.overwatch/.overwatch.json` (#2769, #2957; pre-move root `.overwatch.json` read as fallback for one release) | **Quiet**, exactly as `noticeNarration: false` |
**Precedence only ever LOWERS verbosity:** `enabled: false` → quiet; `noticeNarration: false` → quiet; otherwise a live marker → quiet; otherwise (no marker, or a stale one) → verbose. Read the marker via `.claude/scripts/shared/lib/overwatch-presence.js` `readPresence(cwd)`; never re-derive liveness. Applies to the monitor itself too. **A stale marker suppresses nothing.**
**Quiet is not silence.** The one-line acknowledgement is this session's only evidence to its own user that anything arrived, so quiet keeps it.
**The lever may be all there is.** `/x-session-config --quiet` also writes a per-user memory artefact, which does not ship to deployed projects; there, this section is what gives the lever meaning. `/x-session-config --show` reports config and memory side by side and names drift. Not implied by `discovery: false`; forced off by `enabled: false`; distinct from `notices`.
**The live-marker row is moot for announcements a session no longer receives (#2915).** Under targeted routing (`broadcast: false`) working sessions' announcements go to the live `/overwatch` alone. Do not read a missing peer `work-started` as "no peer is working" — the monitor holds that picture and relays overlaps. A monitor that holds, declines or lets messages expire is **undetectable** from the sender (#2674): no session hears the announcements and nobody is told. Routing falls back to broadcast only for a missing, stale, unaddressable or ambiguously named monitor.
### Receipt replies and overlap notices (#2922, #2914)
**A session receiving a receipt reply records it**, whether or not the sending command is still running:
```bash
node .claude/scripts/shared/announce.js --receipt-received --ledger-id <id> --from <monitor session name>
```
The reply's first line names the ledger id (`Receipt from /overwatch: … (ledger: <id>)`). An unknown id is **reported, never recorded**. A receipt confirms one hop — the monitor read it — and nothing else. Say *received by `<monitor>`* only for an entry whose `receipt` is `received`; every other entry keeps the not-confirmed wording. No reply leaves the entry `unconfirmed`; nothing waits or retries. Narration: none under quiet narration, at most one line otherwise.
**An overlap notice is not an announcement.** Under quiet narration (`noticeNarration: false` or a live marker), a message whose first line begins `Overlap notice from /overwatch:` is not shortened: **relay its text to the user in full**, then continue. No issue lookup, no re-analysis. **Surfaced, never obeyed** — stops no work, moves no issue, grants nothing, needs no reply; the user decides.
### Reachability on the row
**Seen is not reachable.** Availability is per peer; the row names which cause applies:
| `unreachableReason` | Cause | Row |
|---|---|---|
| `no-messaging-address` | Entry carries `messagingSocketPath: null` | `name (#pid, no messaging address)` |
| `not-listed-by-listagents` | Headless `-p` (`entrypoint: sdk-cli`) — has an address, absent from `ListAgents`, and `SendMessage` addresses by `ListAgents` name | `name (#pid, registered, not tool-reachable)` |
An absent `entrypoint` is never read as `sdk-cli`. **Reachable is not delivered (#2674):** a receiver may hold, decline or let a message expire, none of it visible to the sender, so never report a reachable peer as informed. Peers are discovered only in this exact working directory, machine and user.
## Hook Health Row (#2917)
Reports framework hooks that cannot load or have been failing. Every hook fails open, so a broken one otherwise looks exactly like one that ran and found nothing to do. Delegates to `.claude/scripts/shared/hook-health-check.js`; the hook renders `hook-heartbeat.js` `formatHealthRow()` verbatim.
| Hook state | Meaning | Row |
|---|---|---|
| `healthy` | Loads; no consecutive failures | **No row** when every hook is healthy |
| `failing` | `consecutiveFailures > 0` | Named with count, last error and when |
| `unloadable` | Fails the load check | Named with stage (`file`, `syntax`, `dependency`) and reason |
| `unreadable` | Heartbeat record not valid JSON | Named, with the record path |
| `no-record` | Never recorded a heartbeat | Listed as `no record` — **never reported as healthy** |
| undetermined | Hook list unreadable | Says hook health could not be determined — **not** an all-clear |
| Timeout or crash | Check did not finish | `Hook Health: ⚠️ check timed out` / `check failed to run` |
**No record alone produces no row, deliberately.** `clear-hook`, `resume-hook`, `compact-hook` fire only on their events and `measure-tap` only while `/idpf-measure` is armed, so a working project can go weeks without their records; a row every session would be noise. When a row appears for another reason, no-record hooks are listed in it, never folded into healthy.
**The heartbeat.** Each wired hook records `<project>/.claude/.hook-health/<hook>.json` (gitignored): `lastSuccess`, `lastError` (message, time), `consecutiveFailures`, `lastPid`. Written via `lib/hook-heartbeat.js`, which never throws, with the root from `CLAUDE_PROJECT_DIR`, then hook input `cwd`, then process cwd — **never `__dirname`**: `.claude/hooks/` is a hub junction when deployed, so a file anchored there is shared by every project on that hub version, as `crash.log` and `startup.log` are.
- **One file per hook** — an atomic rename prevents a half-written file, not a lost update between writers sharing one, and hooks run concurrently across sessions.
- **Written only on a state change** (first record, any failure, first success after a failure) — `measure-tap` runs after every tool call. So **`lastSuccess` and `lastPid` record the most recent transition, not the most recent run**; never read them as "last ran at".
- **`installHeartbeat()` records at process exit:** exit 0 success, anything else failure, error observed via `uncaughtExceptionMonitor`, so exit code, stderr and `crash.log` are unchanged. A fail-open catch calls `fail(err)`, since its exit code is still 0.
**Which hooks.** The `.js` entries of `framework-manifest.json` `deploymentFiles.scripts.hooks` (under `frameworkPath`), excluding the git hook `pre-push`. Settings are not read — this repo wires hooks in `.claude/settings.local.json`, deployed projects in `.claude/settings.json`. **A hook registered in settings but absent from the manifest is not checked.** Dev-only `precompact-hook.js` and `test-on-change.js` are not listed and record no heartbeat.
**What the load check proves:** `node --check`, then each relative-path dependency required, in separate processes — catches a syntax error or missing module (the #2328 class) without executing the hook. It does not prove the hook's logic works; that surfaces through the heartbeat. `require.resolve` alone proves only that the file exists.
**Reports the state before this session** — the check runs in the ladder, before `startup-hook.js` records its own heartbeat at exit. **Registered unconditionally:** no project setting makes a silent hook failure acceptable.
**Test runs are isolated.** `IDPF_HOOK_HEARTBEAT_ROOT` takes precedence over the project root; this repo's Jest `globalSetup` points it at scratch, so an induced test failure leaves no real record. Nothing sets it in normal use. **Advisory and read-only** — writes nothing, runs no remedy, never blocks startup.
## Testing Drift Row (#2903)
Reports two stack-dependent conditions nothing else re-checks once written: **stack drift** in the charter's `testing` declaration and **coverage-audit overrides** that no longer fit the imported skill. Delegates to `.claude/scripts/shared/testing-drift-check.js`; the hook renders its `formatRows()` output verbatim.
| Finding | Row |
|---|---|
| Drift `clean`, overrides `none`/`clean` | **No row** — the common case |
| Drift `drift` | `Testing Drift:` naming each newly gained *(key/role)* with no suite and each orphaned suite; remedy `/charter refresh` |
| Override findings | `Coverage Overrides:` naming each finding and its remedy |
| Either part `undetermined` | Says what could not be established, and that this is **not** an all-clear |
| Timeout or crash | `Testing Drift: ⚠️ check timed out` / `check failed to run` |
**Registered only when `charterStatus` is `Active`** — drift is measured against the charter's `testing` declaration; no active charter, nothing to drift from.
**Drift is delegated, never re-derived.** `charter-testing-audit.js` `audit()` (#2854, platforms since #2900) computes newly gained pairs and orphaned suites; built for "a developer or CI job", it had no automatic caller.
**The row repeats every session drift persists, and is never an offer.** Drift does not clear on its own, and a project declining `/charter refresh` — or with no `testing.suites[]` yet — would be asked every session. So nothing is asked: the row names the remedy, `additionalContext` adds no prompt, no decline is recorded, no suppression state stored.
**Override detection is static** — `testCoverageAudit`, the imported `test-coverage-conventions.json`, `git ls-files`. It never runs the coverage audit, which reads `git diff <since>..HEAD`; a session start has no commit range.
**What an override means depends on the imported audit, so the check reads its capability.** idpf-skills-dev#335 moved test classification ahead of the skip lists: `ignoredSourcePatterns` governs sources only, `excludePaths` is the one test-skip rule, each skip listed in `diagnostics.skippedTestFiles`. The check reads the imported `test-coverage-audit.js` source for that marker — **capability, not version number**; a version comparison misclassifies a local build.
| Imported audit | Entry | Reported as |
|---|---|---|
| post-#335 | `ignoredSourcePatterns` entry, ≥1 tracked match, **all** test-shaped | **no-op** — keeps no source out; remove it |
| post-#335 | `ignoredSourcePatterns` entry also matching a real source | **not reported** — doing work |
| post-#335 | entry matching no tracked file | **not reported** — may anticipate a future path |
| post-#335 | `excludePaths` entry matching tests | **not reported** — the documented test-skip rule |
| pre-#335 | `ignoredSourcePatterns` or `excludePaths` entry matching tests | **hiding** those tests from flow/contract classification until the #335 update is imported |
| any | same-key `additionalLanguages` entry whose `testPatterns` are a strict subset of the bundled entry's | **narrowing** — `mergeConfig` replaces a language wholesale (#2866) |
**This repo's `tests/**` is the worked "not reported" case.** Measured 2026-09-13 on the post-#335 audit: removing it adds `tests/helpers/mock-exec.js`, `mock-factories.js`, `review-rule.js` as unpaired sources (184→187). Pre-#335 it hid every test; post-#335 it keeps three helpers out. Keying on "matches tests" alone reports a correct entry every session.
**No row means something was looked at.** No `testCoverageAudit` block → `none`, no row, skill not read. Overrides present with the skill not imported, its audit script unreadable, or tracked files unlistable → `undetermined`. An `additionalLanguages`-only override never lists tracked files.
**Advisory and read-only, always.** Never writes `framework-config.json`, `CHARTER.md` or `testing.suites[]`, never runs a remedy, never blocks startup.
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
