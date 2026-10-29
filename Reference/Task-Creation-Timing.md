# Task Creation Timing for Routed Commands
**Version:** v0.114.0
**Source:** Reference/Task-Creation-Timing.md
**Purpose:** Prevent orphaned tasks when commands have routing decisions.
## Availability Precondition
Task tools (`TaskCreate`/`TaskGet`/`TaskList`/`TaskUpdate`) are gated by remote flag `tengu_rosy_wren`; local override `CLAUDE_CODE_ENABLE_TODO_TOOLS=true` in `~/.claude/settings.json` `env`. **Probe before Phase 1:** call `TaskList` once. Absent → track steps with an **inline checklist** (same steps, same order), **say once that the `TaskList` compaction-recovery guarantee does not hold**, and after compaction re-derive position from commits, issue status and checked ACs. Saying so is load-bearing: a silently absent step machine looks like one never needed.
## Two-Phase Task Creation
**Phase 1:** create **only** the preamble task (`Run preamble for #N`). **Phase 2:** after the preamble confirms the path (no redirect, early exit or type change), bulk-create **all remaining** tasks in a single batch — the compaction recovery point. **Redirect/early exit:** mark the preamble complete, create no remaining tasks; a redirected command creates its own.
## Emission: One Message, Not N Round Trips
"Single batch" constrains *how* as well as *when*: independent `TaskCreate` calls go in **one message as parallel tool calls**, never one per message. **Same for `TaskUpdate`** — transitions that fall together, and every STOP-boundary prune (`/work` Step 6, `/review-issue` Step 4, `/proposal` Step 7), travel in one message. Batching cuts round trips, not task count.
Why, how it was measured, and why nothing enforces it: `{frameworkPath}/Reference/Task-Creation-Timing-Rationale.md` (#2998, not auto-loaded).
## Applicable Commands
| Command | Routing Decision | Possible Paths |
|---------|-----------------|----------------|
| `/review-issue` | `context.redirect`, `earlyExit` | review-proposal, review-prd, review-test-plan |
| `/resolve-review` | `earlyExit`, `context.type` | No findings -> early exit; epic -> expand children first, epic last, per-member tasks in one batch after the epic's preamble |
| `/review-proposal`, `/review-prd`, `/review-test-plan` | `earlyExit` | Already reviewed -> early exit |
| `/work` | `context.type` | Epic, standard, branch tracker |
| `/done` | `context.issue.labels`, `discovery` | Epic detection, discovery mode |
Commands without routing decisions (`/bug`, `/enhancement`, `/proposal`) may create all tasks upfront. § Emission applies to every command.
## Post-Compaction Behavior
Re-read the command spec and resume from the first incomplete task. No re-routing needed.
**End of Task Creation Timing for Routed Commands**
