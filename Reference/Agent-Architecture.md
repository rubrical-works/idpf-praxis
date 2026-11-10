# Agent Architecture
**Version:** v0.117.0
**Source:** Reference/Agent-Architecture.md
**Purpose:** One contract for every framework-spawned subagent, every `.claude/agents/` definition and every spawning call site — cite it, never re-derive it. **On demand, not auto-loaded:** read when writing a definition, a brief builder (`buildMemberBrief()`, `planTier3()`, a review dispatcher) or a spawn request. Why not a rule: `Construction/Design-Decisions/2026-11-01-agent-architecture-reference-not-rule.md`.
## Role Contract
Every instance is an instance of a declared **role** with six parts; a call site that cannot name all six has not defined its subagent.
### Identity
Agent type `.claude/agents/idpf/<name>.md`; its `tools` allowlist is the enforced restriction; model and effort in frontmatter. `idpf-` prefix so none shadows a user's agent (finding 13).
### Instructions
**Inherit** `CLAUDE.md` and the auto-loaded rules, or declare `omitClaudeMd: true` (also drops `MEMORY.md`, finding 1) and carry only what body and brief supply. Inherit for the session's own kind of work (`idpf-implementer`); omit for a fixed procedure (`idpf-diff-reviewer`, `idpf-code-reviewer`), carrying every rule it depends on.
### Context
SessionStart never reaches a subagent (finding 2). Every brief carries: the **absolute** `frameworkPath` (relative resolves against the worktree or project, not the framework root); the run's flags and review mode; the repository from `.gh-pmu.json`; the issue context; the **specialist** — absolute path via `.claude/scripts/shared/lib/specialist-resolver.js` `resolveSpecialist()`, with a Read-first directive; the **domains** (`activeDomains`). Resolved at spawn, never baked into a definition. Each `idpf-*` body self-resolves the specialist when its brief names none. None available (unconfigured, announce-only, missing file) → work without it; the parent reports it once per run.
### Scope
Writes only: its worktree, its one output file, one issue through its finalize script, or nothing.
### Ownership
Parent-only, never the instance: gates, peer announcements, `gh pmu move`, push/merge/rebase, merge-back, closing reports. Stated in full in every definition body.
### Return
JSON validated against a schema before it enters the parent's context, roster or gate. Failing or empty → an error for that instance, never a guessed verdict.
## Host Constraints on Subagents
**Status:** `Verified` (hands-on), `Docs`, `Superseded`, `Untested`. **Host version:** Claude Code version observed; re-probe before relying on one.
| # | Finding | Status | Host version |
|---|---|---|---|
| 1 | `general-purpose` inherits `CLAUDE.md`, `.claude/rules/` and the `MEMORY.md` index; `omitClaudeMd: true` receives none of them. | Verified | 2.1.225; re-observed, `omitClaudeMd` included, on 2.1.312; omit/inherit re-probed on 2.1.316 (2026-11-01) |
| 2 | `SessionStart` does not fire for subagents; startup's charter, config, branch and specialist must be handed over in the brief. | Verified | 2.1.225 |
| 3 | Pool = inherited pool narrowed by two filters. Filter 1 (all) removes `AskUserQuestion`, `EnterPlanMode`, `ExitPlanMode`, `EndConversation`, `ScheduleWakeup`, `TaskOutput`, `WaitForMcpServers`, `Workflow`, and `Agent` at the depth limit. Filter 2 (background only, the default) reduces built-ins to a keep-list. | Docs (corroborated by observation) | 2.1.225; filter 1 re-probed (background) on 2.1.316 |
| 4 | Task tools (`TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate`) cannot be given by any route: inherited foreground, inherited background, allowlisted — the last drops them **silently**. | Verified (3 routes) | 2.1.225; allowlisted and inherited-background routes re-probed on 2.1.316 — dropped silently; interactive 2.1.316 offers no foreground spawn (#3531) — headless foreground: #3532 |
| 5 | So `/work` and every task-list-driven workflow cannot be delegated; delegate ACs, not workflows. | Verified | 2.1.225 |
| 6 | Filter 1's documented list is **not exhaustive** — never reason from it. | Verified | 2.1.225 |
| 7 | A foreground subagent held the cron tools the docs call teammate-only. | Verified | 2.1.225; interactive 2.1.316 offers no foreground spawn, so not reproducible interactively (#3531) |
| 8 | `TaskStop` is not task-list family; present foreground and background. Match task tools by exact name. | Verified | 2.1.225; re-probed on 2.1.316 (`TaskStop` kept when task tools dropped) |
| 9 | Foreground vs background: 24 vs 17 built-ins; background loses `Cron*`, `Artifact`, `DesignSync`, `RemoteTrigger`, `ReportFindings`, `PushNotification`. | Verified | 2.1.225; background pool re-probed on 2.1.316 (foreground not probed); interactive 2.1.316 offers no foreground spawn (#3531) |
| 10 | `Skill` works from a subagent, so skill limits are instructions, not tool lists. `skills:` preloads; `tools: Skill` grants invocation. | Verified | 2.1.225 |
| 11 | ~~Registry built at session start.~~ A mid-session definition registers later, no restart: not found at 0 s–1 min 48 s, working by 3 min 18 s. | Superseded | 2.1.225 (original); superseded on 2.1.312; re-probed on 2.1.316 — registered between 3 min 6 s and 3 min 17 s, after a turn boundary |
| 12 | `effort` frontmatter (`low`/`medium`/`high`/`xhigh`/`max`), alongside `permissionMode`, `mcpServers`, `hooks`, `maxTurns`, `skills`, `initialPrompt`, `memory`, `background`, `isolation`, `color`. | Docs | 2.1.225 |
| 13 | Nesting to three layers; `Agent` withheld at the limit. Discovery walks up from cwd; nearest definition wins on collision. | Docs | 2.1.225 |
| 14 | Teammates said to keep task tools; forks to inherit the parent's exact pool. | Untested | 2.1.225 (documentation read) |
**Also on 2.1.312:** an unregistered type fails loudly (`Agent type '<name>' not found. Available agents: …`), never a silent `general-purpose` run; an unquoted ` #` in `description` truncates it.
## Fallback When a Type Is Absent

A typed spawn whose type is not registered fails with `Agent type '<name>' not found`, never a silent `general-purpose` run, so no run fails because a type is missing: the parent re-spawns the same request as `general-purpose` with the same brief and reports once per run, per role, that the role's tool restrictions and instruction setting are not in effect (for `idpf-diff-reviewer`, its cost saving too). The reason comes from disk: a definition file under `.claude/agents/idpf/` that exists is not registered yet this session; one that does not is missing from this project. `.claude/scripts/shared/lib/subagent-fallback.js` makes the decision and writes the report, and every typed request a framework builder emits carries the step as `onNotFound` — or, in a `/work --concurrent` run, the run's one `spawn-not-found` template, which applies to every spawn step.

## Delegation Policy
| Delegable | Not delegable |
|---|---|
| One AC, scoped to named files | `/work`, `/done`, `/prepare-release`, `/merge-branch` — task-list-driven or issue-state-advancing workflows |
| Research, exploration, code-path discovery | Anything needing `AskUserQuestion` |
| Advisory skills (`tdd-process`, `test-writing-patterns`) | Writes to generated trees (`.claude/commands/`, `.min-mirror/`, `.claude/rules/`) without parent regeneration |
| Read-only `gh` queries; one issue's review via `review-finalize.js` (`idpf-issue-reviewer`) | Board moves, pushes, merges, peer announcements |
**`/work` is not delegable — a platform fact:** its step machine is the task list, and task tools are unavailable to a subagent by every route tried (findings 4, 5). Delegated, it loses compaction recovery, skip reporting and its STOP boundary. `/work --concurrent` complies: members implement ACs, the parent owns every step and gate.
## Definition Contract
Every definition under `.claude/agents/` (top level and `idpf/`):
**Frontmatter:** `name` equal to the filename stem; `description`, quoted when it contains ` #`; `tools` as a minimal allowlist, never a task tool (exact name, so `TaskStop` is not flagged); `model`; `effort` where it matters; `omitClaudeMd` stated where the role omits.
**Body:** a bootstrap read-list, or for an omitting role the rules it carries; a generated-versus-source warning where it edits this repository; boundaries and the ownership list; its return format, naming the schema the parent validates.
`framework-dev.md` is the dev-only reference implementation, at the top level outside the deployed `idpf/` folder.
**End of Agent Architecture**
