# Task Creation Timing — Rationale
**Version:** v0.113.0
**Source:** Reference/Task-Creation-Timing-Rationale.md
**Purpose:** Reasoning and measurements behind rule 07 (`Reference/Task-Creation-Timing.md`), moved out of the always-on rule in #2998. **Not a rule** — never auto-loaded, never registered under `deploymentFiles.rules`; ships as an ordinary `Reference/` document.
## Why "single batch" names emission explicitly
**N sequential calls satisfy the timing requirement and fail the emission requirement.** That is the reading the surrounding wording invites: the Anti-Pattern section contrasts "single batch" with creating tasks incrementally *as each step is reached*, and justifies it on compaction recovery. A session can emit every task at the correct moment, one round trip at a time, and be fully compliant with the timing rule while paying N round trips. Stated explicitly because the instruction reads as satisfied either way — which is why the cost persisted unnamed through #1829, #2129, #2281 and #2308.
**Whether fewer steps should be tracked at all** is a separate question the rule does not answer — #2037 answered it "yes" for a command with no routing ambiguity, but the rule exists for commands that have one, where the task list is the compaction recovery point.
## Why `05-windows-shell.md` does not prohibit this
That rule says *"NEVER batch a command that can fail with unrelated tool calls"* — one failure cancels its siblings and the survivors report only `Sibling tool call errored`. **It is a rule about `Bash`**: commands whose failure is environment-dependent — network calls, destructive operations, anything touching a remote or the filesystem.
Task tools have no such failure surface. They mutate an in-session list, spawn no shell, touch no network, and cannot fail for a reason unrelated to their own arguments. The hazard the prohibition guards against does not reach them.
Written down rather than left implicit because a reader who knows #1425, #1164 or #1087 — parallel `Bash` calls causing sibling-error cascades on Windows, deliberately serialized — will raise the objection. The answer is that those issues concern a different tool with a different failure surface, not that the hazard was weighed again and dismissed.
## Measured basis
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
**Do not compare that total against subprocess time.** Every subprocess in the same run — preamble, `branch-sync-check`, `review-state`, `log-changed-files`, `scope-drift-check`, the entire Step 4f sweep — totaled 292s **of execution**, against which 298.3s of interval is not a larger number but a different quantity. An earlier revision drew that comparison and concluded the bookkeeping "cost slightly more than all of them combined"; #2793 then quoted the figure onward as a task-tool cost, which is how a units error propagates (#2806). The interval cost is real and worth removing — 1.19s of execution is not.
**Two caveats, pulling opposite ways.** The 8.4s Phase 1 row also contains the `TaskList` probe and its reasoning, so the mutation-only share is a little lower — roughly 36–37%. And the absence of user-wait matters the other way: a run containing an `AskUserQuestion` gate inflates the denominator and *understates* the share.
**Not enforceable, and deliberately not attempted.** Tool-call emission is not observable from inside the repository, so nothing can detect a session that reads this section and still emits sequentially. `tests/commands/task-cleanup-parity.test.js` asserts prune **parity across command specs**, not emission, and must not be read as a guard for this behavior. If the harness ever exposes per-turn call counts, this becomes assertable and is worth revisiting.
## Two anti-patterns, one phrase
Creating tasks one-at-a-time is **NOT recommended**. After compaction, the task list must represent the full remaining workflow; creating each task only as its step is reached loses that picture. The correct pattern is in rule 07.
**Two distinct anti-patterns share the phrase "one at a time."** This section rejects creating tasks *at the wrong moment* — deferring each until its step is reached, losing the recovery picture. § Emission rejects creating them *in the wrong shape* — all at the right moment, one round trip apiece. A session can avoid this one and still commit the other.
**End of Task Creation Timing — Rationale**
