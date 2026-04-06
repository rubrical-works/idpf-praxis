# Task Creation Timing for Routed Commands
**Version:** v0.83.0
**Purpose:** Prevent orphaned tasks when commands have routing decisions.
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
