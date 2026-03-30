# Requirements Over Execution

**Date:** 2026-03-02
**Topic:** Why IDPF invests in upstream requirements quality while execution-focused systems assume it — and why the two approaches are complementary, not competing

---

## The Landscape

A growing number of AI-assisted development frameworks are being built on top of Claude Code. They share the same tools — Bash, Read, Edit, Agent, Skill — but make fundamentally different bets about where automation creates the most value.

Execution-focused systems (e.g., `levnikolaevich/claude-code-skills`) invest in automating the build-review-quality cycle. They assume you already have solid stories with acceptance criteria, technical notes, and a decomposed task list. Given that input, they orchestrate multi-agent pipelines that write code, run reviews, enforce quality gates, and merge results — all with minimal human intervention.

IDPF invests in the opposite end: ensuring the stories are solid in the first place.

---

## Where the Work Actually Lives

Consider the full lifecycle from idea to shipped code:

```
Ideation → Proposal → Requirements → Stories → Code → Review → Ship
```

Execution-focused systems draw a line after "Stories" and automate everything to the right. Their implicit contract is: **"Give me well-formed stories, and I'll build them."** The `story-validator.py` hook in levnikolaevich checks that 8 required sections exist in the story document — Overview, Context, Requirements, Technical Notes, Acceptance Criteria, Dependencies, Risks, Metadata — but it only checks structural presence, not quality. Are the acceptance criteria testable? Are the requirements complete? Is the scope aligned with the project charter? That's your problem.

IDPF draws the line differently. Six commands run before a single line of code is written:

```
/proposal → /review-proposal → /create-prd → /review-prd → /create-backlog → /review-issue
```

Each command has its own quality gates. `/review-proposal` checks charter alignment. `/create-prd` generates acceptance criteria and validates priority distribution. `/review-prd` scrutinizes completeness. `/create-backlog` transforms requirements into stories with traceable AC. `/review-issue` validates each story independently.

By the time `/work` starts, the story is over-specified by most standards. And that's the point.

---

## Why Upstream Investment Matters More for AI

Human developers can course-correct mid-implementation. They notice when requirements are vague, push back on missing acceptance criteria, and make judgment calls about ambiguous scope. The cost of a mediocre story is absorbed by the developer's experience and intuition.

AI doesn't do this. An AI assistant given a vague story will implement it eagerly, filling gaps with plausible assumptions. It won't push back on missing AC — it'll invent reasonable-sounding criteria and check them off. It won't flag scope ambiguity — it'll pick the interpretation that lets it produce the most output.

This asymmetry means **the quality of the input determines the quality of the output** far more for AI-assisted development than for human development. A weak story handed to a human developer produces mediocre code. A weak story handed to an AI pipeline produces confidently wrong code at high speed.

IDPF's upstream investment is insurance against this failure mode. Each review gate, each STOP boundary, each forced user interaction in the proposal-to-story pipeline exists to catch exactly the assumptions that an AI executor would silently accept.

---

## The Complementary Pipeline

The interesting observation is that these approaches aren't competing — they're complementary. IDPF's output is exactly what execution-focused systems need as input.

| Phase | IDPF | Execution Systems |
|-------|------|-------------------|
| Ideation → Proposal | `/proposal`, `/review-proposal` | (manual) |
| Proposal → Requirements | `/create-prd`, `/review-prd` | (manual) |
| Requirements → Stories | `/create-backlog`, `/review-issue` | (manual) |
| Story → Code → Review | `/work`, `/done` (manual orchestration) | Automated agent pipeline |
| Quality gates | Per-command STOP boundaries | Automated quality gate skills |

The gap in each system is where the other is strongest. IDPF produces vetted stories but orchestrates execution manually. Execution systems automate execution brilliantly but assume the stories are already vetted.

A combined pipeline would look like:

```
IDPF upstream                          Execution pipeline
─────────────────────                  ─────────────────────────
/proposal
  → /review-proposal
    → /create-prd
      → /review-prd
        → /create-backlog
          → /review-issue
            → READINESS GATE ─────────→ Epic Orchestrator
                                         → Story Worker (isolated)
                                           → Code → Review → Quality Gate
                                         → Story Worker (isolated)
                                           → Code → Review → Quality Gate
                                         → STOP (user approves)
```

The readiness gate is the critical bridge. It validates that each story has passed IDPF's review pipeline before the execution system touches it. Without this gate, the execution pipeline runs on unvetted input — which is precisely the optimistic assumption that makes execution-only systems fragile.

---

## What This Means for IDPF

### 1. The model switching problem hits upstream hardest

Model switching and context compaction cause the most damage during upstream commands, not execution. A `/create-prd` session involves iterative user interaction, gap analysis, progressive document construction, and diagram generation across 7+ phases. These are the longest, most stateful sessions — and the most likely to hit context limits.

File-based checkpoints (a technique borrowed from execution-focused systems) have their highest ROI here: letting `/create-prd` and `/create-backlog` resume after model switches rather than restarting from scratch.

### 2. Execution orchestration is lower priority than upstream resilience

Automating the `/work` → `/done` → next story cycle is valuable but secondary. By the time execution starts, the hard work — getting the requirements right — is done. The remaining manual steps are lightweight and benefit from human oversight.

The higher-priority investment is making the upstream pipeline resilient: checkpoint persistence, context isolation for long-running PRD sessions, and crash recovery for multi-story backlog creation.

### 3. IDPF could feed an execution pipeline rather than build one

Rather than reimplementing levnikolaevich's orchestration hierarchy, IDPF could define a **story output contract** — a specification for what a "ready" story looks like — and let execution systems consume it. This keeps IDPF focused on its strength (requirements quality) while enabling integration with any execution pipeline that accepts the contract.

The contract would be: a GitHub Issue with `story` label, `in_progress` status, branch assignment, and acceptance criteria — all things IDPF already enforces. The execution system reads the issue via API and proceeds. No kanban_board.md required.

---

## The Philosophical Position

IDPF bets that **getting the requirements right is harder and more valuable than automating the execution.** This is a deliberate tradeoff. It means IDPF projects feel slower to start — you can't just say "build me a user authentication system" and watch agents swarm. But it means the code that gets written is implementing the right thing, validated against a charter, reviewed for completeness, and traceable back to a specific requirement.

Execution-focused systems bet that **automating the build cycle is harder and more valuable.** This is also a valid tradeoff. It means you can process a backlog at machine speed — but only if someone (or some other system) did the hard upstream work first.

Neither bet is wrong. They're bets about different parts of the problem. The strongest system would combine both: IDPF's rigor upstream feeding an execution pipeline downstream, with a readiness gate ensuring the handoff is clean.

---

**See also:**
- `Intentional-Friction.md` — Why every STOP boundary exists
- `Context-Engineering.md` — How IDPF manages context budget
- `Proposal/Automated-Workflow-Orchestration-via-Agent-Delegation.md` — Technical proposal for the combined approach
