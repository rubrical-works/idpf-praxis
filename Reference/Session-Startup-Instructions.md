# Session Startup Instructions
**Version:** v0.98.0
**Source:** Reference/Session-Startup-Instructions.md
AI-facing reference for session work after startup. Not a procedural checklist — see the hook source for procedure; block format lives in its render function.
## Startup is Hook-Driven
`.claude/hooks/startup-hook.js` runs startup deterministically: gathers session info, runs six checks (upgrade, statusline, config-integrity, branch-sync, dependency, task-tools) in parallel on a staged 15s/30s/45s/60s ladder, emits the **Session Initialized** block to:
- **stderr** — colored copy for debug/transcript inspection. **Not** auto-surfaced in the Claude Code UI (hook exits 0; upstream docs cover stderr only for exit 2 — do not rely on it). Claude's echo is the only channel reaching the user.
- **`additionalContext`** — plain text in Claude's context: the block plus a verbatim-echo instruction, and post-hook actions (charter read + summary when active, domain specialist load, `/charter` if pending). The charter summary **is** a post-hook content read: when `charterStatus` is `Active`, Claude reads `CHARTER.md` after echoing the block and emits a concise prose summary. The block carries only the `Charter Status:` line (#2484 reversed #2475's precomputed `Charter Vision:`/`Charter Focus:` lines, clipped at 200 chars).
**Five of six run unconditionally; `upgrade` does not.** Registered only when `framework-config.json` `selfHosted` is not `true` — self-hosted runs five checks, a deployed project six. Condition is on **registration**, not output: a skipped check contributes **no row** to the block, not an empty or "skipped" one. Row count alone cannot distinguish skipped from failed-to-run — check `selfHosted` before concluding a check broke.
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
