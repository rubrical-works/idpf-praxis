# IDPF-Agile Is Not Vibe Coding

**Date:** 2026-02-08
**Topic:** The relationship between IDPF-Agile, vibe coding, and the framework that bridges them

---

## What Vibe Coding Is

Vibe coding is the practice of telling an AI what you want and letting it build. No requirements document. No acceptance criteria. No test plan. No branch strategy. You describe the vibe — "make me a landing page with a dark aesthetic and smooth animations" — and the AI produces code. If it looks right, you keep it. If not, you say "no, more like this" and it tries again.

The term captures something real about how people interact with AI coding assistants. The AI is fast. The feedback loop is tight. You can go from idea to working prototype in minutes. The process feels like sketching — loose, iterative, driven by feel rather than specification.

Vibe coding works. It works for prototypes, explorations, throwaway scripts, learning exercises, and personal projects where the cost of being wrong is low. It is how many people first experience AI-assisted development, and it is genuinely productive for a class of work that traditional process frameworks ignore.

---

## Why IDPF-Agile Is Not Vibe Coding

IDPF-Agile is, in almost every way, the opposite of vibe coding. Every design decision in the framework exists to prevent exactly the behaviors that vibe coding relies on.

### Vibe coding starts with code. IDPF-Agile starts with a charter.

Before any code exists, IDPF-Agile requires a project charter: vision, tech stack, scope boundaries, constraints. This is the antithesis of "just start building." The charter exists because an AI assistant without one will make plausible-sounding architectural decisions that may contradict your actual intent — and you won't discover this until the codebase is large enough that changing direction is expensive.

### Vibe coding iterates by feel. IDPF-Agile iterates by acceptance criteria.

In vibe coding, "done" means "looks right to me." In IDPF-Agile, "done" means every acceptance criterion checkbox has been verified, the issue has been moved to `in_review`, and the user has explicitly said "done." The assistant cannot declare completion on its own, cannot skip criteria it finds difficult, and cannot move past the STOP boundary without human consent.

### Vibe coding trusts the AI's judgment. IDPF-Agile constrains it.

Vibe coding gives the AI creative latitude. IDPF-Agile gives it a todo list parsed from a command specification, anti-hallucination rules that forbid inventing features or assuming requirements, and STOP boundaries that halt execution at every major transition. The framework assumes the AI will confidently do the wrong thing if you don't tell it when to stop — because it will.

### Vibe coding has no friction. IDPF-Agile is intentional friction.

Every gate in IDPF-Agile — proposal before implementation, review before PRD, branch assignment before work, explicit "done" before closure — exists to prevent a specific failure mode that emerges when AI assistants operate without constraints. The friction is not accidental overhead. It is the mechanism that makes AI-assisted development reliable on projects where reliability matters.

---

## But IDPF Already Has a Vibe Framework

Here is where the story gets interesting. IDPF does not reject vibe coding. It contains a dedicated framework for it: **IDPF-Vibe**.

IDPF-Vibe is a three-phase framework designed for projects with unclear requirements:

```
Phase 1: VIBE          Explore, prototype, discover
Phase 2: EVOLUTION     Pause, analyze, generate as-built docs
Phase 3: STRUCTURED    Transition to IDPF-Agile
```

During the Vibe phase, nearly everything IDPF-Agile enforces is deliberately absent:

| IDPF-Agile Requires | IDPF-Vibe Omits |
|---------------------|-----------------|
| Formal requirements document | Features emerge from conversation |
| User stories with acceptance criteria | Natural language descriptions |
| TDD (RED-GREEN-REFACTOR) | Just get it working |
| Sprint planning and velocity | Continuous, fluid iteration |
| GitHub issues and project tracking | No project structure |
| Branch strategy | No branching enforced |
| Definition of done | "Works" is sufficient |
| Code review workflow | No formal review |

This is vibe coding. It is explicitly, architecturally, intentionally vibe coding — with one critical addition.

---

## The Exit Ramp

IDPF-Vibe is not vibe coding forever. It is vibe coding **with an exit ramp**.

The Evolution Point (Phase 2) is triggered when the project feels mature — typically when 3-5 features are working and the architecture has stabilized. At this point, the framework does something unusual: it analyzes everything built during the vibe phase and generates an **as-built PRD** — a requirements document written after the code, describing what actually exists rather than what was planned.

This is the inverse of IDPF-Agile's flow. Agile says: requirements first, then code. Vibe says: code first, then requirements. Both end up with documented, tested, structured software. They arrive from opposite directions.

After the Evolution Point, the project transitions to IDPF-Agile. Tests are added for code written during the vibe phase. Remaining features follow TDD. The full machinery of issues, branches, reviews, and releases engages.

### The One-Way Door

The transition is **irreversible**. You can evolve from Vibe to Agile. You cannot go back.

```
VIBE ──► AGILE    (valid)
AGILE ──X► VIBE   (invalid — quality standards never decrease)
```

This is the framework's strongest statement about vibe coding: it is a valid starting point, but it is not a destination. You vibe your way in. You do not vibe your way back out.

---

## The Real Question

The debate between vibe coding and structured development is usually framed as a choice: either you plan or you explore, either you have process or you have speed, either you write tests or you move fast.

IDPF rejects this framing. It provides both frameworks because the real question is not "which approach is better?" but "which approach is appropriate right now?"

### When to Vibe

- Requirements are genuinely unclear and cannot be clarified by discussion alone
- The fastest way to understand the problem is to build something
- The cost of being wrong is low (prototype, exploration, learning)
- Architecture needs to be discovered through experimentation
- You are one person with an AI, not a team with stakeholders

### When to Structure

- Requirements are known or can be defined
- The cost of being wrong is high (production system, shared codebase, users)
- Multiple people need to understand what was built and why
- The project will be maintained beyond the current session
- Reliability matters more than speed of initial delivery

### When to Transition

- You started vibing and now the project is real
- Features are working but untested
- Architecture has stabilized and you can describe it
- The cost of the next bug is higher than the cost of adding process
- You need to bring other people (or future-you) into the project

---

## How IDPF-Agile Could Be Vibe Coding

It cannot. But it can be the thing that vibe coding becomes.

The honest version of "IDPF-Agile as vibe coding" would look like this: you skip the charter, skip the proposal, skip the PRD, skip the backlog, skip the branch assignment, skip the TDD cycles, skip the acceptance criteria, skip the STOP boundaries, and just tell the AI what to build. This is possible — every gate can be manually overridden. But what remains is not IDPF-Agile. It is an AI assistant with no guardrails, which is where the problems documented in the Intentional Friction guide begin.

What IDPF offers instead is more honest: **start with vibe coding if that's what the project needs, but build the exit ramp into the process from the beginning.** IDPF-Vibe is not IDPF-Agile with the friction removed. It is a distinct framework that acknowledges exploration as a legitimate development phase and provides a structured path from exploration to discipline.

The insight is that vibe coding and structured development are not opposing philosophies. They are phases. Most projects that start as vibes — "let me just try this" — eventually reach a point where they need tests, documentation, and a release process. The question is whether that transition is planned or chaotic.

IDPF plans it.

---

## The Deeper Pattern

Both IDPF-Agile and IDPF-Vibe are responses to the same underlying problem: AI assistants are powerful but context-limited, eager but uncritical, fast but amnesiac. The two frameworks address this problem at different points in a project's lifecycle:

- **IDPF-Vibe** says: the AI's eagerness is an asset during exploration. Channel it. Let the AI build fast, try things, pivot. But track what it builds, and when the exploration is done, capture the knowledge before it's lost to context limits.

- **IDPF-Agile** says: the AI's eagerness is a liability during production work. Constrain it. Force verification, explicit consent, and human judgment at every transition. The AI is the fastest coder on the team, but the human is the only one who knows when to stop.

Neither framework is complete without the other. Vibe without structure produces prototypes that never mature. Structure without vibe produces process that never ships. The full IDPF ecosystem — Vibe for exploration, Agile for production, Evolution Point for the transition — is designed to support the complete lifecycle of AI-assisted development.

Vibe coding is not the enemy. Vibe coding without an exit strategy is.

---

**End of IDPF-Agile Is Not Vibe Coding**
