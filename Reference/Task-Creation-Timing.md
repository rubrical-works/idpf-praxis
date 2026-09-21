# Task Creation Timing for Routed Commands
**Version:** v0.105.0
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
**"Single batch" is a claim about emission as well as timing** — see § Emission. Creating every remaining task at the right *moment*, one round trip at a time, satisfies half this instruction and not the other half.
### On Redirect or Early Exit
- Mark the preamble task as completed
- Do NOT create tasks for the original command's remaining steps
- Redirected command creates its own tasks
## Emission: One Message, Not N Round Trips
**"Single batch" constrains both *when* tasks are created and *how* they are emitted.** Independent `TaskCreate` calls belong in **one message as parallel tool calls** — not one call per message.
**N sequential calls satisfy the timing requirement and fail the emission requirement.** That is the reading the surrounding wording invites: the Anti-Pattern section contrasts "single batch" with creating tasks incrementally *as each step is reached*, and justifies it on compaction recovery. A session can emit every task at the correct moment, one round trip at a time, and be fully compliant with the timing rule while paying N round trips. Stated explicitly because the instruction reads as satisfied either way — which is why the cost persisted unnamed through #1829, #2129, #2281 and #2308.
**The same rule governs `TaskUpdate`.** Status transitions that fall together — closing one step and opening the next — are independent calls and belong in one message. Clearest case is the **prune** at the STOP boundary (`/work` Step 6, `/review-issue` Step 4, `/proposal` Step 7): every deletion is independent, none depends on another's result, and the work is already finished when they run. Emit them together.
**Batching reduces round trips, not task count.** A 19-task prune stays 19 calls, travelling in one message. Whether fewer steps should be tracked at all is a separate question this rule does not answer — #2037 answered it "yes" for a command with no routing ambiguity, but this rule exists for commands that have one, where the task list is the compaction recovery point.
### Why `05-windows-shell.md` does not prohibit this
That rule says *"NEVER batch a command that can fail with unrelated tool calls"* — one failure cancels its siblings and the survivors report only `Sibling tool call errored`. **It is a rule about `Bash`**: commands whose failure is environment-dependent — network calls, destructive operations, anything touching a remote or the filesystem.
Task tools have no such failure surface. They mutate an in-session list, spawn no shell, touch no network, and cannot fail for a reason unrelated to their own arguments. The hazard the prohibition guards against does not reach them.
Written down rather than left implicit because a reader who knows #1425, #1164 or #1087 — parallel `Bash` calls causing sibling-error cascades on Windows, deliberately serialised — will raise the objection. The answer is that those issues concern a different tool with a different failure surface, not that the hazard was weighed again and dismissed.
### Measured basis
Recorded so a future reader can tell whether it still holds. Full `/work 2789 --assign` run in `idpf-praxis-dev`, 2026-09-06:
| Block | Calls | Interval |
|---|---:|---:|
| Phase 1 preamble create | 1 | 8.4s |
| Phase 2 bulk create | 14 | 71.6s |
| Interleaved `TaskUpdate` (`in_progress` → `completed`) | 26 | 146.3s |
| Per-AC subtask create | 4 | 26.0s |
| Step 6 prune | 21 | 46.1s |
| **Total** | **66** | **298.3s** |
**Every figure in that column is an INTERVAL, not execution time — the whole reading of this table.** An interval is wall-clock from one call to the next, so it contains the model’s generation for that turn as well as the call. Task-tool *execution* is a small fraction: measured on `/work 2787` with `/idpf-measure` (2026-09-07, recorded on #2801), 19 `TaskCreate` calls executed in **433ms** against **55.85s** of interval, and all task-tool execution across that run was **1.19s of 856s**. The table measures the cost of a **round trip** — which is why one message removes it, and why smaller calls cannot.
66 calls — 19 `TaskCreate` + 47 `TaskUpdate` — is **37.3% of a 799.5s run**, one with no user-wait intervals because every gate resolved without prompting.
**Do not compare that total against subprocess time.** Every subprocess in the same run — preamble, `branch-sync-check`, `review-state`, `log-changed-files`, `scope-drift-check`, the entire Step 4f sweep — totalled 292s **of execution**, against which 298.3s of interval is not a larger number but a different quantity. An earlier revision drew that comparison and concluded the bookkeeping "cost slightly more than all of them combined"; #2793 then quoted the figure onward as a task-tool cost, which is how a units error propagates (#2806). The interval cost is real and worth removing — 1.19s of execution is not.
**Two caveats, pulling opposite ways.** The 8.4s Phase 1 row also contains the `TaskList` probe and its reasoning, so the mutation-only share is a little lower — roughly 36–37%. And the absence of user-wait matters the other way: a run containing an `AskUserQuestion` gate inflates the denominator and *understates* the share.
**Not enforceable, and deliberately not attempted.** Tool-call emission is not observable from inside the repository, so nothing can detect a session that reads this section and still emits sequentially. `tests/commands/task-cleanup-parity.test.js` asserts prune **parity across command specs**, not emission, and must not be read as a guard for this behaviour. If the harness ever exposes per-turn call counts, this becomes assertable and is worth revisiting.
## Applicable Commands
| Command | Routing Decision | Possible Paths |
|---------|-----------------|----------------|
| `/review-issue` | `context.redirect`, `earlyExit` | review-proposal, review-prd, review-test-plan |
| `/resolve-review` | `earlyExit`, `context.type` | No findings -> early exit; epic -> expand children first, epic last, per-member tasks in one batch after the epic's preamble (#2872) |
| `/review-proposal` | `earlyExit` | Already reviewed -> early exit |
| `/review-prd` | `earlyExit` | Already reviewed -> early exit |
| `/review-test-plan` | `earlyExit` | Already reviewed -> early exit |
| `/work` | `context.type` | Epic, standard, branch tracker |
| `/done` | `context.issue.labels`, `discovery` | Epic detection, discovery mode |
Commands without routing decisions (e.g., `/bug`, `/enhancement`, `/proposal`) may create all tasks upfront.
§ Emission applies to every command in this table and to those outside it — it governs how task calls are emitted, independent of whether a command has a routing decision.
## Anti-Pattern: Incremental One-at-a-Time
Creating tasks one-at-a-time is **NOT recommended**. After compaction, the task list must represent the full remaining workflow. Correct pattern:
1. Create preamble task (Phase 1)
2. Run preamble
3. If routing confirms path -> bulk create all remaining tasks (Phase 2), **emitted in one message** per § Emission
4. Work tasks sequentially, marking each complete — batching the status updates that fall together
**Two distinct anti-patterns share the phrase "one at a time."** This section rejects creating tasks *at the wrong moment* — deferring each until its step is reached, losing the recovery picture. § Emission rejects creating them *in the wrong shape* — all at the right moment, one round trip apiece. A session can avoid this one and still commit the other.
## Post-Compaction Behavior
Task list reflects the confirmed workflow. Re-read the command spec and resume from the first incomplete task. No re-routing needed.
**End of Task Creation Timing for Routed Commands**
