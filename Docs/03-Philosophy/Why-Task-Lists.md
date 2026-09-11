# Why Task Lists in Every Command

**Date:** 2026-08-02
**Counts verified:** 2026-09-10
**Topic:** The role of mandatory task creation in IDPF command execution

> Supersedes *Why Todo Lists in Every Command* (2026-02-08). IDPF migrated from `TodoWrite` to the `TaskCreate` / `TaskUpdate` / `TaskList` tools across issues #2224–#2241, and renamed the auto-todo signal to auto-task in #2325. The philosophy survived that migration intact. Two of the mechanics inverted — see [What Changed](#what-changed-from-todo-lists).

---

## The Pattern

Most IDPF commands — `/work`, `/prepare-release`, `/review-issue`, `/done` — open with a task-creation contract. Today 34 of 56 command specifications reference `TaskCreate`, alongside `.claude/rules/07-task-creation-timing.md`, `.claude/rules/08-work-execution.md` and `.claude/rules/09-review-execution.md`.

For a routed command such as `/review-issue`, the instruction reads:

> **REQUIRED:** This is a routed command — use two-phase task creation:
>
> 1. **Phase 1 — Preamble task only:** Create a single task for the preamble/setup step using `TaskCreate`. Do NOT create tasks for subsequent workflow steps yet.
> 2. **Phase 2 — Bulk create after routing:** After the preamble confirms the workflow path (no redirect, no early exit), bulk-create tasks for all remaining workflow steps using `TaskCreate`.

This is not optional. The question is why a framework for AI assistants insists on a practice that looks like busywork.

---

## First, the Precondition: the Tools May Not Be There

Everything below assumes `TaskCreate` / `TaskUpdate` / `TaskList` exist in the session. Since **#2593** that is not guaranteed.

The task tools are gated behind a remote feature flag — `tengu_rosy_wren`, **default off** — with a local override via `CLAUDE_CODE_ENABLE_TODO_TOOLS=true` in `~/.claude/settings.json`. Because the flag is server-side, availability can differ between two sessions on the same machine with no local change, which reads as intermittent breakage rather than as a feature flag.

Rules `07` and `08` therefore both open with the same contract: **call `TaskList` once before Phase 1.**

- **Present** → the document below applies as written.
- **Absent** → track the same steps in the same order with an **inline checklist**, and **say once, explicitly, that the `TaskList`-based compaction-recovery guarantee does not hold.**

That announcement is the load-bearing part, and it is why this section comes before the argument rather than after it. An inline checklist lives in the context window — which is precisely what compaction discards. So the central claim of this document, *"the list persists through compaction and is read back,"* is **conditional on the tools being available**, and silently false when they are not.

A step machine that is quietly absent is indistinguishable from one that was never needed. It surfaces later as work resumed from the wrong step, and nobody can tell why. When the tools are missing, position is re-derived from durable state instead — issue status, `Refs #N` commits, and checked acceptance criteria — never from a checklist that may no longer be present.

The startup hook reports this on its `Task Tools:` row when the local override is not enabled.

---

## Two-Phase Creation: Why Not Everything Upfront

The obvious design — parse the whole spec, create every task, start working — is wrong for any command that makes a routing decision, and it is worth understanding why before the benefits make sense.

`/review-issue` does not know what it is reviewing until its preamble runs. The issue may be a proposal, a PRD, or a test plan, each redirecting to a different command. `/work` branches on whether the target is a standard issue, an epic, or a branch tracker. `/done` branches on labels and discovery mode.

Creating the full task list before routing produces **orphaned tasks**: a list describing a workflow that will never execute, left behind when control transfers to another command. After compaction, that stale list is actively misleading — it is the assistant's primary recovery signal, and it points at the wrong workflow.

So the contract splits:

| Phase | Action | Rationale |
|-------|--------|-----------|
| **1** | Create only the preamble task | Every downstream gate depends on parsed context |
| **2** | After routing confirms the path, bulk-create all remaining steps | The list becomes the compaction recovery point |
| **On redirect / early exit** | Mark preamble complete, create nothing further | The redirected command creates its own tasks |

`.claude/rules/07-task-creation-timing.md` also names the opposite failure. Creating tasks **one at a time** as work proceeds is explicitly an anti-pattern: after compaction the list must represent the *full remaining workflow*, not just the step in flight.

**Two distinct failures share the phrase "one at a time,"** and the rule separates them. The one above is a failure of *timing* — deferring each task until its step is reached, losing the recovery picture. The other is a failure of *shape*: creating every task at the correct moment but emitting one tool call per message. A session can avoid the first and still commit the second, which is why the rule states the emission requirement separately — independent `TaskCreate` calls belong in **one message as parallel tool calls**.

The cost is per round trip rather than per call. Measured on a `/work` run: 19 `TaskCreate` calls executed in 433 ms against 55.85 s of interval, where an interval is wall-clock between calls and therefore contains the model's generation for that turn. Batching collapses those round trips; it does not reduce the number of tasks. Nothing in the repository can detect a session that reads the rule and emits sequentially anyway — tool-call emission is not observable from inside the project, and the rule says so rather than implying a guard exists.

Commands without routing decisions — `/bug`, `/enhancement`, `/proposal` — may still create all tasks upfront. The two-phase rule is a response to branching, not a universal ceremony.

---

## What It Accomplishes

### 1. Forces the Assistant to Read Before Acting

The assistant must parse the specification before executing it. Without this, an AI assistant will often begin executing after reading the first few steps, losing awareness of later phases, STOP boundaries, and extension points.

The task list is a **comprehension gate**. If the assistant cannot produce an accurate list, it has not understood the command. The list is proof of reading.

`08-work-execution.md` sharpens this: every `TaskCreate` must include a `description` explaining *why* the step exists. The subject says what; the description says why. A step you cannot justify is a step you did not understand.

### 2. Makes the Execution Plan Visible to the User

A task list created before work begins shows the user what is about to happen:

- **Informed consent.** All phases are visible before action is taken, and can be interrupted.
- **Scope awareness.** `/prepare-release` spans multiple phases and dozens of sub-steps.
- **Expectation setting.** Long-running commands benefit from a visible position indicator.

### 3. Survives Context Compaction

AI assistants in long sessions experience compaction — older messages are summarized or dropped. When this happens mid-command, the assistant loses its place.

**This is where the task model differs most from its predecessor.** Under `TodoWrite`, the guidance was to re-read the spec and *regenerate* the list. Under tasks, the list **persists through compaction** and is read back:

> Post-compaction: re-read rule, `TaskList` — first `in_progress` (or first `pending`) is resume point. No re-routing.
> — `.claude/rules/08-work-execution.md`

The distinction matters. A regenerated list has no memory of what was finished; it recovers the *shape* of the workflow but not the *position* within it. A persisted list carries completion state, so resumption is a lookup rather than a reconstruction. Routing is not repeated, because the surviving list already encodes the confirmed path.

For epics and branch trackers this is the primary recovery signal — the `in_progress` sub-issue parent identifies exactly where work stopped, with `gh pmu sub list` as fallback.

### 4. Prevents Step Skipping

Complex commands have steps that are easy to skip: conditional extension points, phases that depend on issue type, verification steps that feel redundant, STOP boundaries.

Tasks make omission visible, and the rule goes further than visibility — **silent omission is forbidden**. A conditional step must either be created as a task or explicitly skipped with a one-line note:

```
Skipped: Step Xa (condition: <cond> not met)
```

Never simply absent. The difference between "this step did not apply" and "this step was forgotten" is exactly what an execution record exists to preserve.

### 5. Structures Epic and Batch Workflows

`/work` demonstrates the most sophisticated use. Working an epic or branch tracker, Step 2b creates one parent task per remaining sub-issue:

```
Sub-issue #101: Implement authentication module
Sub-issue #102: Add session management
Sub-issue #103: Create login UI
```

Each parent is marked `in_progress` when its turn begins and `completed` after it reaches review. As work proceeds, per-acceptance-criterion subtasks nest beneath the active parent:

```
  AC: Login form validates required fields
  AC: Session token expires after 24h
```

The subtasks are created when Step 3 begins and cleared before the next sub-issue's begin. The hierarchy is what makes compaction recovery self-describing: `TaskList` alone shows which sub-issue is active and which criteria remain, without re-querying GitHub.

### 6. Integrates Extension Points

Extensible IDPF commands support user-customizable extension blocks:

```markdown
<!-- USER-EXTENSION-START: pre-create -->
Run linting before creating the issue
<!-- USER-EXTENSION-END: pre-create -->
```

Each non-empty extension block becomes a task. An extension that exists but never appears in the list would be invisible — task creation makes user customizations first-class workflow steps.

**This applies to the 18 EXTENSIBLE commands, not to all of them.** `/work` and `/review-issue` are both **MANAGED** and carry no extension points: `/work`'s four were retired in 0.88.0 when it consolidated from the `/workit` hybrid shell (#2368), and `/review-issue`'s three followed in 0.101.0 (#2746) — never filled in practice, and targeted by none of the 28 extension recipes. A MANAGED command is hub-owned with no per-project customization surface, so there is no extension block for a task to represent. The names survive in `extension-points.json` under `deprecatedExtensionPoints` so a project that once used one gets a clear answer rather than silence.

### 7. Constrains Scope Creep

An AI assistant without an execution record will often "helpfully" add steps that were not specified: extra refactoring, unsolicited documentation, additional test cases. The task list anchors the assistant to exactly the steps in the spec plus any active extensions.

If the assistant wants to do something not on the list, the absence is conspicuous. This aligns with the anti-hallucination principle: **do what was specified, not what seems helpful.**

---

## What Changed From Todo Lists

The migration was not a rename. Tasks are a richer structure, and several properties are genuinely new:

| Property | Todo lists | Tasks |
|----------|-----------|-------|
| State | Checked or unchecked | `pending` → `in_progress` → `completed`, plus `deleted` |
| Ownership | None | `owner` field — which agent claimed the work |
| Dependencies | None | `blocks` / `blockedBy` — a task cannot start until its blockers resolve |
| Rationale | Implicit | `description` required, explaining why the step exists |
| Post-compaction | Regenerate from spec | Read `TaskList`; resume from first incomplete |
| Lifecycle end | Abandoned | Explicitly pruned at the STOP boundary |

That last row is the other inversion. The predecessor doc described the list as ephemeral and never persisted. Tasks persist, which means they must be **deliberately cleaned up**. `/work` Step 6 makes pruning part of the STOP sequence: enumerate via `TaskList`, delete every task owned by this invocation, and — critically — leave tasks created outside it alone. User TODOs are not the framework's to discard.

A persistent record that is never cleared becomes noise, and noise after compaction is indistinguishable from signal.

---

## The Deeper Principle

The requirement reflects a design philosophy that outlived the tooling change: **externalize the assistant's execution state into something the user can see and the assistant can recover.**

AI assistants have no durable working memory within a session. They cannot reliably track "I'm on step 7 of 12" across long conversations, especially after compaction. Tasks move this tracking out of the model's implicit state into an explicit, inspectable artifact.

This is the same principle behind:

- **Checklists in aviation** — pilots use checklists not because they cannot fly, but because complex procedures under cognitive load benefit from external state tracking.
- **Kanban boards in agile** — teams externalize work state because human working memory is unreliable across interruptions.
- **Transaction logs in databases** — systems externalize state changes because in-memory state is volatile.

IDPF applies this to AI assistants: the context window is volatile working memory, so critical execution state must be externalized. The move from todos to tasks strengthened the analogy — a transaction log that records only *what* to do, and not *how far you got*, is not much of a log.

---

## What Would Happen Without It

1. **Silent step skipping.** The assistant executes steps 1–4, loses context of step 5 (a STOP boundary), and proceeds to step 6. The user never learns a checkpoint was missed.

2. **Post-compaction disorientation.** With no surviving record, the assistant either restarts the command — discarding completed work — or guesses its position. The persisted task list is what makes resumption a lookup instead of a guess.

3. **Orphaned workflows.** Without two-phase creation, a routed command leaves behind a task list for a path it never took, and post-compaction recovery follows it confidently in the wrong direction.

4. **Extension amnesia.** User-defined extensions are skipped because the assistant forgot they existed after processing the core steps.

5. **Invisible scope.** The user cannot tell whether the assistant is 20% or 80% through a complex command.

6. **Epic workflow collapse.** Without per-sub-issue parents, the assistant is likely to batch-process sub-issues, skip per-issue STOP boundaries, or lose track of which remain.

---

## Summary

The task list is not a productivity feature. It is a **reliability mechanism** — a way to make AI-assisted workflows predictable, recoverable, and transparent despite the volatility of the context window.

The migration from todo lists changed the mechanics without disturbing the reasoning. What improved is the fidelity of the record: tasks carry state, ownership, dependencies, and rationale, so a list recovered after compaction reports not merely what the workflow *is* but how far through it the assistant had travelled.

---

**Related:** [Finite Context and Framework Discipline](Finite-Context-Windows.md) — why context is volatile and what IDPF does about it. [Intentional Friction](Intentional-Friction.md) — why STOP boundaries exist. [Context Engineering](Context-Engineering.md) — how IDPF decides what belongs in the model's head.
