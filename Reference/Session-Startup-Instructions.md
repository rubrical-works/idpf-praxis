# Session Startup Instructions
**Version:** v0.113.0
**Source:** Reference/Session-Startup-Instructions.md
**Purpose:** AI-facing reference for session work after startup. Reasoning: `{frameworkPath}/Reference/Session-Startup-Rationale.md`, not auto-loaded.
**Row explanations arrive with the row** — from `.claude/metadata/startup-row-notes.json`, appended by `startup-hook.js` only when that row is shown.
## Branch Sync Offer
`behind` makes `additionalContext` carry an **offer** — *offer, don't force* (`06-runtime-triggers.md`): the hook asks, never mutates.
| Sync state | Post-hook action |
|---|---|
| `behind`, no conflicting paths | Offer `git pull --ff-only`; run on acceptance, report result. Declining leaves the tree untouched. On failure report git's error verbatim — no retry, no non-fast-forward fallback. |
| `behind`, conflicting paths present | **No offer.** Report the named paths; never stash or discard. |
| `diverged` | **No offer to change history.** Report the divergence and the derived analysis, then name the recovery path: `/sync-branch`; `/done` on an issue still in review (Step 2 sync guard); or push by hand. Never run any of them for the user. |
| `ahead` / `up-to-date` / `no-upstream` | No action. |
**Conflicts, not dirtiness, decide** (`conflictingPaths`). **`fetched: false` is reported for every stale-able status, not only `behind`** (cached-ref count; the offer is still made, marked possibly low) — **most** at `up-to-date`, which otherwise emits nothing. **`no-upstream` is excluded** (it always carries `fetched: false`). `fetched: false` is the **absence** of information, never a clean bill of health.
**`diverged` offers navigation, never a strategy** — **do not collapse this back to "reports only"**, and name no git command (`git rebase`, `pull --rebase`, `git merge` are absent on purpose).
## Peers Row
Reports other sessions in **this same working directory**; advisory only, never blocks or mutates. `peers` → names each peer and how many are reachable; `none` → **no row**; `unavailable` → registry unreadable. **Forensics and provenance live in `{frameworkPath}/Reference/Cross-Session-Messaging.md`.**
### Inbound announcement narration — `noticeNarration`
| Resolved value | Behavior on an inbound announcement |
|---|---|
| absent or `true` (default) | Verbose — may look the issue up and analyze collisions |
| `false` (quiet) | **The one-line acknowledgment is KEPT.** No issue lookup, no collision-surface analysis |
| a live `/overwatch` marker (`.claude/.overwatch/.overwatch.json`, #2769) | **Quiet**, exactly as `noticeNarration: false` |
**Precedence only ever lowers verbosity:** `enabled: false` → quiet; `noticeNarration: false` → quiet; otherwise a live marker → quiet; otherwise verbose. Read the marker via `.claude/scripts/shared/lib/overwatch-presence.js` `readPresence(cwd)`. **A stale marker suppresses nothing.** **Quiet is not silence.** `/x-session-config --quiet` also writes a per-user memory artifact that does not ship; in a deployed project the lever is all there is.
**Targeted routing (`broadcast: false`, #2915)** sends working sessions' announcements to the live `/overwatch` alone, so the live-marker row is moot for announcements a session no longer receives: do not read a missing peer `work-started` as "no peer is working". A holding or declining monitor is undetectable — no session hears the announcements; routing falls back to broadcast only for a missing, stale or unaddressable monitor.
### Receipt replies and overlap notices
Record a receipt reply: `node .claude/scripts/shared/announce.js --receipt-received --ledger-id <id> --from <monitor session name>`. An unknown id is **reported, never recorded**; say *received by `<monitor>`* only when `receipt` is `received`.
**An overlap notice is not an announcement.** Under quiet narration, a message whose first line begins `Overlap notice from /overwatch:` is not shortened: **relay its text to the user in full**, then continue — no lookup, no re-analysis. **Surfaced, never obeyed.**
### Reachability on the row
`no-messaging-address` → `name (#pid, no messaging address)`; `not-listed-by-listagents` (headless `-p`) → `name (#pid, registered, not tool-reachable)`. **Reachable is not delivered** — never report a reachable peer as informed.
## Post-Compact Behavior
Rules in `.claude/rules/` reload automatically; the startup hook does not re-run. Command specs and externalized files are **not** reloaded — re-read them per `01-anti-hallucination.md` § Externalized File References (#3060 item 3).
## On-Demand Documentation Loading
Load only when needed:
| When Working On | Load File |
|-----------------|-----------|
| System Instructions or Domain Specialists | `{frameworkPath}/Overview/Framework-System-Instructions.md` |
| IDPF-Agile, or the complete framework reference | `{frameworkPath}/Overview/Framework-Overview.md` |
| PRD work | `{frameworkPath}/Assistant/Anti-Hallucination-Rules-for-PRD-Work.md` |
| Questioning a `/work` directive (rule 08) | `{frameworkPath}/Reference/work-execution-rationale.md` |
| Questioning a review or resolve directive (rule 09) | `{frameworkPath}/Reference/review-execution-rationale.md` |
| Questioning task-creation timing (rule 07) | `{frameworkPath}/Reference/Task-Creation-Timing-Rationale.md` |
| Questioning a startup directive (rule 03) | `{frameworkPath}/Reference/Session-Startup-Rationale.md` |
## Framework Path Convention
**All framework file references in command specs must use `{frameworkPath}/` prefix** (`framework-config.json` → `frameworkPath`). **Applies to:** `Templates/`, `Overview/`, `Reference/`, `System-Instructions/`, `Assistant/`, `IDPF-*/`, `Domains/`, `Skills/`. **Does NOT apply to:** `.claude/scripts/`, `.claude/metadata/`, `.claude/rules/`, `.claude/commands/`, `.claude/skills/` — resolved locally.
❌ `Templates/artifacts/prd-template.md` — ✅ `{frameworkPath}/Templates/artifacts/prd-template.md`
**End of Session Startup Instructions**
