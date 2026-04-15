# Why Todo Lists in Every Command

**Date:** 2026-02-08
**Topic:** The role of mandatory todo generation in IDPF command execution

---

## The Pattern

Every IDPF command -- from `/work` to `/prepare-release` to `/review-issue` -- begins with the same instruction:

> **REQUIRED:** Before executing this command, parse the workflow steps in this spec, then generate a todo list.

This is not optional. It is not a suggestion. It appears in all 19 command specifications. The question is: why does a framework for AI assistants insist on a practice that looks like busywork?

---

## What It Accomplishes

### 1. Forces the Assistant to Read Before Acting

The most immediate effect of "generate a todo list from this spec" is that the assistant must actually parse the entire command specification before executing any step. Without this requirement, an AI assistant will often begin executing after reading the first few steps, losing awareness of later phases, STOP boundaries, and extension points.

The todo list is a **comprehension gate**. If the assistant cannot produce an accurate todo list, it has not understood the command. The list itself is proof of reading.

### 2. Makes the Execution Plan Visible to the User

A todo list created before work begins gives the user a complete picture of what is about to happen. This serves several purposes:

- **Informed consent.** The user can see all phases before any action is taken, and intervene if something looks wrong.
- **Scope awareness.** Multi-phase commands like `/prepare-release` involve 5+ phases with dozens of sub-steps. Without a visible plan, the user has no way to know what the assistant intends to do next.
- **Expectation setting.** Long-running commands benefit from the user knowing where they are in the process.

### 3. Survives Context Compaction

AI assistants operating in long sessions will experience context compaction -- older messages are summarized or dropped to free up the context window. When this happens mid-command, the assistant loses its place.

Every IDPF command includes:

> **Post-Compaction:** If resuming after context compaction, re-read this spec and regenerate todos.

The todo list is designed to be **ephemeral and regenerable**. It is not persisted across sessions. It exists to anchor the assistant's position within a workflow during the current execution. After compaction, the assistant re-reads the spec, regenerates the list, checks which items are complete, and resumes from the correct position.

This directly addresses the "amnesiac with a search engine" critique of AI assistants. The todo list is a **breadcrumb trail** through complex workflows.

### 4. Prevents Step Skipping

Complex commands have steps that are easy to skip:

- Extension points that may or may not be active
- Conditional phases that depend on issue type (epic vs. story vs. bug)
- Verification steps that feel redundant but catch real errors
- STOP boundaries where the assistant must pause for user input

When every step is an explicit todo item, skipping one becomes visible. The assistant must mark it complete or explain why it was skipped. This creates **accountability at the step level** rather than trusting the assistant to remember all phases.

### 5. Structures Epic and Batch Workflows

The `/work` command demonstrates the most sophisticated use of todo lists. When working an epic, the auto-TASK system generates a list from sub-issues:

```
- [ ] #101: Implement authentication module
- [ ] #102: Add session management
- [ ] #103: Create login UI
```

Each sub-issue follows its own workflow cycle (in_progress, work, acceptance criteria, in_review, STOP, done) before the next begins. The todo list is the **state tracker** that prevents the assistant from batch-processing sub-issues or losing track of which ones remain.

For standard issues, acceptance criteria checkboxes are extracted directly from the issue body and become todo items. This maps the definition of done into an executable checklist.

### 6. Integrates Extension Points

IDPF commands support user-customizable extension blocks:

```markdown
<!-- USER-EXTENSION-START: pre-work -->
Run linting before starting work
<!-- USER-EXTENSION-END: pre-work -->
```

The todo generation rules state: "For each non-empty USER-EXTENSION block, add a todo item." This ensures that user customizations are not silently skipped. An extension that exists but never appears in the todo list would be invisible -- the todo system makes extensions first-class workflow steps.

### 7. Constrains Scope Creep

An AI assistant without a todo list will often "helpfully" add steps that were not specified: extra refactoring, unsolicited documentation, additional test cases. The todo list anchors the assistant to exactly the steps defined in the command spec plus any active extensions.

If the assistant wants to do something that is not on the list, the absence is conspicuous. This aligns with the anti-hallucination principle: **do what was specified, not what seems helpful.**

---

## The Deeper Principle

The todo list requirement reflects a fundamental design philosophy in IDPF: **externalize the assistant's execution state into something the user can see and the assistant can recover.**

AI assistants have no durable working memory within a session. They cannot reliably track "I'm on step 7 of 12" across long conversations, especially after compaction. The todo list moves this tracking out of the model's implicit state and into an explicit, visible artifact.

This is the same principle behind:

- **Checklists in aviation** -- Pilots use checklists not because they don't know how to fly, but because complex procedures under cognitive load benefit from external state tracking.
- **Kanban boards in agile** -- Teams externalize work state because human working memory is unreliable across interruptions.
- **Transaction logs in databases** -- Systems externalize state changes because in-memory state is volatile.

IDPF applies this principle to AI assistants: the context window is volatile working memory, so critical execution state must be externalized.

---

## What Would Happen Without It

Remove the todo list requirement and several failure modes emerge:

1. **Silent step skipping.** The assistant executes steps 1-4, loses context of step 5 (a STOP boundary), and proceeds directly to step 6. The user never knows a checkpoint was missed.

2. **Post-compaction disorientation.** After compaction, the assistant has no record of progress. It either restarts the entire command (wasting work) or guesses where it was (risking errors).

3. **Extension amnesia.** User-defined extensions are skipped because the assistant forgot they existed after processing the core steps.

4. **Invisible scope.** The user cannot tell whether the assistant is 20% or 80% through a complex command. There is no way to estimate remaining work or identify what comes next.

5. **Epic workflow collapse.** Without a list of sub-issues to process sequentially, the assistant is likely to batch-close them, skip per-issue STOP boundaries, or lose track of which sub-issues remain.

---

## Summary

The todo list is not a productivity feature. It is a **reliability mechanism** -- a way to make AI-assisted workflows predictable, recoverable, and transparent despite the fundamental volatility of the context window. Every IDPF command generates one because every IDPF command is complex enough to fail without one.
