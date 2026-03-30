# Spike Workflow: Lightweight POC with /proposal

**Version:** 1.0
**Date:** 2026-02-17
**Applies to:** IDPF-Agile

---

## Overview

A **spike** is a time-boxed proof-of-concept to answer a specific technical question or validate an approach. IDPF-Agile supports spikes through a lightweight workflow that uses `/proposal` without escalating to a full PRD, review cycle, or backlog creation.

This is the fastest path from idea to working code while still maintaining issue tracking and branch isolation.

---

## When to Use a Spike

| Use a Spike When... | Use Full Planning When... |
|----------------------|---------------------------|
| "Can we even do this?" | "We know what to build" |
| Exploring a library or API | Integrating a proven approach |
| Validating a technical approach | Building production features |
| Answering a question with code | Delivering user-facing functionality |
| Time-boxed experiment (hours) | Multi-day planned work |
| Throwaway or learning code | Code that ships to users |

**Key distinction:** A spike's primary output is **knowledge**, not production code. The code may be kept, refactored, or discarded — the value is in proving (or disproving) feasibility.

---

## The Spike Workflow

```
┌──────────────┐
│  /proposal   │  ← Capture what you're exploring and why
└──────┬───────┘
       ↓
┌──────────────┐
│ /create-     │  ← Isolate work on its own branch
│   branch     │
└──────┬───────┘
       ↓
┌──────────────┐
│ work #N      │  ← Assign to branch + build the POC
│   --assign   │
└──────┬───────┘
       ↓
┌──────────────┐
│   Evaluate   │  ← Did it work? What did we learn?
└──────┬───────┘
       ↓
  ┌────┴────┐
  │         │
Keep     Discard
  │         │
  ↓         ↓
Merge    /destroy-
branch    branch
```

### Step-by-Step

#### 1. Create the Proposal

```
/proposal Evaluate Tailwind CSS for component theming
```

This creates:
- A proposal document in `Proposal/`
- A tracking issue on the project board

**Keep the proposal brief.** A spike proposal needs:
- What you're exploring
- Why (what question you're answering)
- What success looks like
- Time box (optional but recommended)

You don't need detailed implementation criteria, user stories, or acceptance criteria — those are for production work.

#### 2. Create a Branch

```
/create-branch
```

Use a descriptive prefix that signals this is exploratory:

```
spike/tailwind-theming-eval
```

Any prefix works (`spike/`, `idpf/`, `feature/`, `explore/`), but `spike/` communicates intent clearly to anyone reading the branch list.

#### 3. Work the Proposal

```
work #N --assign
```

The `--assign` flag links the proposal issue to the current branch and starts work in one step. This replaces the separate `/assign-branch #N` → `work #N` sequence.

The command will:
- Assign the issue to the current branch tracker
- Move the issue to `in_progress`
- Set up your working context

**Note:** If you need to assign issues to a branch you're not currently on, use `/assign-branch #N branch/name` directly.

**During the spike:**
- Focus on answering the question, not production quality
- Commit working checkpoints so you can revert if needed
- Take notes in the proposal file about what you learn

#### 4. Evaluate and Close

When the spike is complete, you have two paths:

**If the spike succeeded (keep the code):**
```
/done #N
/merge-branch
```

**If the spike succeeded (but code needs rewrite):**
```
/done #N
/destroy-branch
```
Then create a proper proposal or PRD for the production implementation, informed by what you learned.

**If the spike failed (approach doesn't work):**
```
/done #N
/destroy-branch
```
Document what you learned in the proposal file before closing — negative results are valuable.

---

## What You Skip

The spike workflow intentionally bypasses these steps from the full planning flow:

| Skipped Step | Why It's OK |
|--------------|-------------|
| `/review-proposal` | Spike scope is small enough to self-validate |
| `/create-prd` | No production requirements to elaborate |
| `/review-prd` | No PRD exists |
| `/create-backlog` | No epics/stories needed for a single exploration |
| `/review-test-plan` | Spikes don't require formal test plans |

**This is a deliberate trade-off:** less process overhead in exchange for the understanding that spike code may not be production-ready.

---

## Examples

### Example 1: Library Evaluation

> "Can we use Mermaid.js to render architecture diagrams in the browser?"

```
/proposal Evaluate Mermaid.js for browser-based architecture diagrams
/create-branch          → spike/mermaid-eval
work #150 --assign
```

Build a minimal page that renders a diagram. Answer: does it work? Is the output quality acceptable? What are the limitations?

### Example 2: API Feasibility

> "Can the GitHub GraphQL API give us the data we need for the dashboard?"

```
/proposal Test GitHub GraphQL API for dashboard data requirements
/create-branch          → spike/gh-graphql-dashboard
work #151 --assign
```

Write queries, test response shapes, measure rate limits. Answer: does the API provide what we need?

### Example 3: Performance Experiment

> "Would switching from JSON to MessagePack speed up our data transfer?"

```
/proposal Benchmark MessagePack vs JSON for data serialization
/create-branch          → spike/messagepack-bench
work #152 --assign
```

Build benchmarks, measure the difference. Answer: is the speedup worth the added dependency?

---

## Tips

- **Time-box aggressively.** A spike that runs for days is no longer a spike — it's unplanned work. Set a limit (e.g., 2-4 hours) and evaluate at the boundary.
- **Write down what you learn.** Update the proposal document with findings before closing. Future-you will thank present-you.
- **Don't gold-plate.** The point is to answer a question, not build a feature. Resist the urge to add error handling, tests, or polish to throwaway code.
- **One question per spike.** If you're exploring multiple things, create multiple spikes. Mixing concerns defeats the purpose.
- **It's OK to fail.** A spike that proves an approach *won't* work is just as valuable as one that proves it will. Document why and move on.

---

## Worktree Spikes (Even Lighter)

> **Status:** Not yet implemented. See Enhancement #1764 for worktree auto-detection.

For the quickest possible spike, you can use `claude --worktree` to get an isolated branch without any IDPF ceremony:

```
claude --worktree
# → lands on a new branch in an isolated worktree
# → (with #1764) startup detects orphan branch, offers to create tracker
work #N --assign
# → build the POC
```

This skips both `/proposal` and `/create-branch` — you go straight to code. The trade-off is no proposal document capturing what you're exploring or what you learned.

### Worktree Data Safety

Removing a worktree does **not** delete the branch or its commits — they remain in the repository. However, **uncommitted work is lost** when the worktree is cleaned up.

Since worktree sessions are often used for quick experiments, the risk of forgetting to commit is higher than normal. Protect your work:

- **Commit early, commit often** — working checkpoints, not polished commits
- **Push before exiting** — ensures work survives even if the local worktree is removed
- **Don't leave uncommitted changes** — if the session exits, anything not committed is gone

Enhancement #1764 includes exit-time safety checks that will warn about uncommitted or unpushed work before worktree cleanup.

### When to Use Worktree vs. Proposal Spike

| | Proposal Spike | Worktree Spike |
|---|---|---|
| **Creates** | Proposal doc + tracking issue + branch | Branch only (tracker via #1764) |
| **Documents** | What you're exploring, findings, outcome | Nothing unless you write it yourself |
| **Best for** | Spikes worth remembering | "Let me try something real quick" |
| **Cleanup** | `/done` + `/merge-branch` or `/destroy-branch` | Exit session, optionally remove worktree |

---

## Relationship to Other Workflows

| Workflow | Ceremony | Best For |
|----------|----------|----------|
| **Worktree Spike** (this doc) | None — worktree + code | "Let me try something real quick" |
| **Proposal Spike** (this doc) | Minimal — proposal + branch + work | Answering questions, POCs |
| **Bottom-Up** (`/add-story`) | Light — story + work | Small features, bug fixes |
| **Top-Down** (proposal → PRD → backlog) | Full — formal planning chain | Complex features, compliance |

A common pattern is **spike first, then plan:** run a spike to validate feasibility, then feed the findings into a proper `/proposal` → `/create-prd` → `/create-backlog` flow for the production implementation.

---

**End of Spike Workflow Guide**
