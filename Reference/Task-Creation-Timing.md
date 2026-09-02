# Task Creation Timing for Routed Commands
**Version:** v0.100.1
**Purpose:** Prevent orphaned tasks when commands have routing decisions.
## Availability Precondition
**Task tools may not exist in the session.** `TaskCreate`/`TaskGet`/`TaskList`/`TaskUpdate` are gated by remote flag `tengu_rosy_wren` (default off); local override `CLAUDE_CODE_ENABLE_TODO_TOOLS=true` in `~/.claude/settings.json` `env`. Server-side rollout — availability differs between sessions with no local change, which reads as intermittent breakage rather than a feature flag.
**Probe before Phase 1.** Call `TaskList` once. Succeeds → follow this document as written. Tool absent:
1. Track steps with an **inline checklist** — same steps, same order, same one-per-step discipline.
2. **State explicitly, once, that the `TaskList`-based compaction-recovery guarantee does not hold.** Everything below treats the task list as the recovery point; an inline checklist lives in the context window, which is exactly what compaction discards.
3. Resuming after compaction: re-read the command spec and re-derive position from issue state, commits, and checked ACs — not from a checklist that may no longer be present.
Saying so is the load-bearing part: a silently absent step machine is indistinguishable from one that was never needed, and surfaces later as work resumed from the wrong step. The startup hook reports this on its `Task Tools:` row when not enabled locally (#2593).
## Two-Phase Task Creation
### Phase 1: Preamble Task Only
Before routing logic, create **only** the preamble/setup task:
```
TaskCreate: "Run preamble for #N"
```
Do NOT create tasks for subsequent steps yet.
### Phase 2: Bulk Create After Routing
After preamble confirms workflow path (no redirect, no early exit, no type change):
- Create tasks for **all remaining** workflow steps in a single batch
- These serve as the compaction recovery point
### On Redirect or Early Exit
- Mark the preamble task as completed
- Do NOT create tasks for the original command's remaining steps
- Redirected command creates its own tasks
## Applicable Commands
| Command | Routing Decision | Possible Paths |
|---------|-----------------|----------------|
| `/review-issue` | `context.redirect`, `earlyExit` | review-proposal, review-prd, review-test-plan |
| `/resolve-review` | `earlyExit` | No findings -> early exit |
| `/review-proposal` | `earlyExit` | Already reviewed -> early exit |
| `/review-prd` | `earlyExit` | Already reviewed -> early exit |
| `/review-test-plan` | `earlyExit` | Already reviewed -> early exit |
| `/work` | `context.type` | Epic, standard, branch tracker |
| `/done` | `context.issue.labels`, `discovery` | Epic detection, discovery mode |
Commands without routing decisions (e.g., `/bug`, `/enhancement`, `/proposal`) may create all tasks upfront.
## Anti-Pattern: Incremental One-at-a-Time
Creating tasks one-at-a-time is **NOT recommended**. After compaction, the task list must represent the full remaining workflow. Correct pattern:
1. Create preamble task (Phase 1)
2. Run preamble
3. If routing confirms path -> bulk create all remaining tasks (Phase 2)
4. Work tasks sequentially, marking each complete
## Post-Compaction Behavior
Task list reflects the confirmed workflow. Re-read the command spec and resume from the first incomplete task. No re-routing needed.
**End of Task Creation Timing for Routed Commands**
