# Sequential Workflow vs. Agent Swarm

**Date:** 2026-09-10
**Topic:** How IDPF's one-session, gated, externalized-state model compares to fanning a task out across parallel agents — and why IDPF uses a swarm internally while refusing to use one for certain work

---

## Two Operating Models

Handed a task, there are two broadly different shapes an AI-assisted system can take.

**Fan out.** Spawn N agents, give each a slice, merge the results. Parallelism is the point. Coordination happens in the orchestrator's context and in the agents' return values.

**Work sequentially through gates.** One session, one issue at a time, each step consuming the previous step's verdict. Coordination happens on disk — in issues, commits, and metadata files.

IDPF is the second. This document is about what that buys and what it costs, and it is a *different* question from the one `Requirements-Over-Execution.md` answers. That document asks **where in the lifecycle** to invest automation. This one asks **what shape the execution takes** once you are in it.

---

## The Structural Difference

**A swarm keeps coordination in context. IDPF keeps it on disk.**

Everything else follows from that sentence.

A worked example from this repository. During `/review-issue`, Step 2a-ii derives a `**Files to modify:**` list and writes it **into the GitHub issue body** — not into its return value, not into the review comment alone. Rule `09-review-execution.md` states the reason directly:

> Write into the **issue body** — review output alone leaves `scope-drift-check.js` unable to see it.

That list is a message from a review command to a `/work` gate that will run later. Possibly in a different session. Possibly after a compaction has discarded every token of the review that produced it. It travels through GitHub because context cannot be relied upon to still exist when the reader arrives.

A swarm passes that in a return value. The orchestrator merges, the run ends, and the coordination evaporates. The artifacts survive; the reasoning that produced them does not.

This is not a minor implementation detail. It is the property that makes the rest of IDPF's behaviour possible — compaction recovery, cross-session handoff, and the ability for a human to reconstruct what happened weeks later.

---

## Axis by Axis

| | IDPF | Swarm |
|---|---|---|
| Concurrency | Sequential by design | Parallel by design |
| Where state lives | GitHub issues, project board, git history, metadata JSON | Context windows and return values |
| Survives compaction | Yes — resume from issue status and `Refs #N` commits | No — orchestrator context *is* the state |
| Verification cadence | Per AC, per sub-issue, at review, at done | Typically once, at merge |
| Attribution | `Refs #N` per commit; three separate gates key off it | Whatever the merged diff reveals |
| Wall clock | Slow | Fast |
| Token cost | Lower | Substantially higher |
| Failure blast radius | One issue, one commit range, revertible | N parallel edits colliding at merge |
| Human intervention points | Many — STOP boundaries, `AskUserQuestion` gates | Typically two: kickoff and merge |

---

## Where Each Genuinely Wins

### Swarms win on breadth

"Which of these 200 files use the deprecated pattern?" There is no dependency between the reads. Sequential processing is simply the wrong shape — it converts an embarrassingly parallel problem into a serial one for no benefit. Fan-out is correct, and IDPF offers nothing better for it.

The general rule: **when the sub-tasks are independent and cheap to verify in bulk, parallelism is free value.**

### IDPF wins on depth with dependencies

Consider a real `/enhancement` → `/review-issue` → `/resolve-review` cycle. Every step consumed the previous step's *judgment*:

1. A prior-art sweep searched the codebase and issue history.
2. It surfaced a guard test asserting a bound that the proposed change would violate.
3. That finding changed the review recommendation from pass to needs-revision.
4. The recommendation produced a specific finding for the user to answer.
5. The answer became a new acceptance criterion.

No parallelization was available at any point. Step N+1 could not begin until step N's verdict existed. A swarm handed the same task would have produced a plausible patch and never found the guard test, because nothing in the fan-out would have been positioned to ask the question that found it.

The general rule: **when step N+1 depends on step N's judgment, parallelism buys nothing and costs coherence.**

---

## IDPF Already Contains a Swarm

The framework is not opposed to agent delegation. It uses it — along a specific and deliberately drawn line:

> **Execution is delegable. Judgment and interaction are not.**

Three places in the codebase enforce this:

**`/work` spawns implementation Agents, then distrusts them.** Rule `08-work-execution.md` imposes a Sub-Agent Review Gate after any Agent returns: `git diff --name-only`, then read each modified file and verify the changes match the current acceptance criterion. The rule is explicit that the gate is *"NOT satisfied by agent summaries or passing tests alone — file content must be read and verified."* Delegation moves the typing, not the responsibility.

**`/overwatch --auto-create` delegates bug filing to stay responsive.** Filing is multi-step — sweep, compose, create — and running it inline blocks the monitor. As the spec puts it, *"a monitor that stops monitoring while it files has stopped being one."* So filing goes to a subagent.

**But the same command refuses to delegate an offer**, and the refusal is enforced by tooling rather than policy. The `framework-dev` agent declares `Read, Write, Edit, Glob, Grep, Bash, Skill` — and has no `AskUserQuestion`. A subagent therefore *cannot* make an offer, even if instructed to. `.claude/metadata/overwatch-signals.json` records the asymmetry plainly:

> Bug filing is non-interactive and therefore delegable; an enhancement offer is not. The asymmetry is enforced by the tool boundary, not by preference.

That is the cleanest statement of IDPF's position on swarms available anywhere in the repository.

---

## The Most Telling Design Choice

IDPF has a full multi-session story. Sessions discover each other in the same working directory, and eleven lifecycle events are broadcast between them — work started, work completed, push started, review passed, review findings, and more.

And the entire channel is **deliberately non-coordinating.**

Announcements are advisory and fire-and-forget. Nothing waits on delivery. Nothing blocks on a peer. Rule `08-work-execution.md` states the constraint as a principle:

> An advisory channel that can fail a command has become a gate.

Dispatch is explicitly not delivery: a receiving session may hold, decline, or let a message expire, and none of that is observable from the sending side. The sender says so in its own notice rather than claiming the peer was informed.

This is a framework with a swarm available, choosing **visibility over coordination**. Sessions are made aware of each other without being made dependent on each other. The bet is that inter-agent coordination is precisely where swarms break, so the channel provides the awareness and declines the coupling.

---

## The Costs, Stated Honestly

Sequential gating is not free, and two costs are real.

**Wall clock.** A small enhancement through creation, review, resolution and re-review is four commands and a meaningful stretch of time. A swarm would have produced *something* far sooner.

**Bookkeeping overhead.** The framework measures its own. Rule `07-task-creation-timing.md` records a full `/work 2789` run costing 66 task-tool calls across 298.3 seconds — 37.3% of a 799.5-second run. That figure carries a caveat the rule states emphatically, having already had a units error propagate onward once: those are **intervals, not execution time**. An interval is wall-clock from one call to the next, so it contains the model's generation for that turn as well as the call itself. A separately instrumented run — `/work 2787`, measured with `/idpf-measure` — put actual task-tool execution at 433ms for 19 `TaskCreate` calls against 55.85s of interval, and 1.19s of task-tool execution across an 856-second run. The cost is per *round trip*, not per tool call, which is why batching calls into one message removes it and why the raw percentage overstates what the bookkeeping itself consumes.

**Context budget.** The deployed rule set is roughly 112,595 bytes — about 43,000 tokens — loaded before the user's first message. That is a quarter of a 200k window spent on instructions, paid every session, whether or not any given rule is consulted.

A swarm pays none of these. It pays tokens instead, and gives up the audit trail.

---

## Practical Guidance

**Reach for a swarm when** the work is wide, the sub-tasks are independent, verification is cheap in bulk, and being wrong is inexpensive. Codebase sweeps, multi-file pattern searches, gathering candidates across many directories.

**Reach for IDPF when** the work is narrow and dependent, being wrong is expensive, and someone will need to reconstruct the decision later. Anything touching shared contracts, deployed artifacts, or state other sessions rely on.

**The honest caveat** applies to both. IDPF's gates are procedural — they are instructions to a model, not enforcement by code. The framework buys legibility and checkpoints; it does not buy guarantees. A swarm buys throughput and gives up both. Neither substitutes for the one boundary that *is* enforced, which is the user's tool-permission mode.

---

## Summary

| Question | Answer |
|---|---|
| What is the core difference? | Swarms keep coordination in context; IDPF keeps it on disk |
| Why does that matter? | Context is discarded at compaction and at run end; disk is not |
| Does IDPF reject agent delegation? | No — it delegates execution and refuses to delegate judgment or interaction |
| How is that refusal enforced? | By the tool boundary: delegable agents have no `AskUserQuestion` |
| Does IDPF coordinate across sessions? | It broadcasts, deliberately without coordinating — advisory, never a gate |
| What does sequential cost? | Wall clock, round-trip bookkeeping, and ~43k tokens of rules per session |
| What does a swarm cost? | Attribution, compaction survival, and the audit trail |

---

**See also:**
- `Requirements-Over-Execution.md` — the complementary axis: where in the lifecycle to invest, and how IDPF output could feed an execution pipeline
- `Intentional-Friction.md` — why each individual gate and STOP boundary exists
- `Context-Engineering.md` — how the context budget referenced above is managed
- `Why-Task-Lists.md` — the task list as compaction recovery point
