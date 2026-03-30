# Planning Approaches: Top-Down vs Bottom-Up

**Version:** 1.0
**Date:** 2026-01-25
**Applies to:** IDPF-Agile

---

## Overview

IDPF-Agile supports two complementary planning approaches that can be used independently or combined throughout a project's lifecycle:

| Approach | Philosophy | Best For |
|----------|------------|----------|
| **Top-Down** | Plan first, then execute | Clear requirements, complex systems, compliance needs |
| **Bottom-Up** | Start working, let structure emerge | Exploration, rapid iteration, evolving scope |

Neither approach is "better" — they serve different needs and can coexist in the same project.

---

## Top-Down Planning (Formal)

### Flow

```
┌─────────────┐
│   Proposal  │  ← Idea captured with implementation criteria
└──────┬──────┘
       ↓
┌─────────────┐
│   /paths    │  ← Scenario paths discovered collaboratively (optional)
└──────┬──────┘
       ↓
┌─────────────┐
│  /catalog-  │  ← Existing screens cataloged, mockups designed (optional)
│  screens +  │
│  /mockups   │
└──────┬──────┘
       ↓
┌─────────────┐
│     PRD     │  ← Requirements elaborated, user stories drafted
└──────┬──────┘
       ↓
┌─────────────┐
│  /create-   │  ← Epics and stories generated from PRD
│   backlog   │
└──────┬──────┘
       ↓
┌─────────────┐
│   Epics +   │  ← Structured work items ready for execution
│   Stories   │
└──────┬──────┘
       ↓
┌─────────────┐
│    Work     │  ← Implementation follows plan
└─────────────┘
```

### Commands

| Step | Command | Output |
|------|---------|--------|
| Capture idea | `proposal:` trigger | `Proposal/{name}.md` + Issue |
| Discover scenarios | `/paths #N` (optional) | `## Path Analysis` in proposal |
| Catalog existing UI | `/catalog-screens` (optional) | `Mockups/{Name}/Specs/` |
| Design screen mockups | `/mockups #N` (optional) | `Mockups/{Name}/AsciiScreens/`, `Screens/` |
| Elaborate requirements | `/create-prd` | `PRD/PRD-{name}.md` |
| Generate work items | `/create-backlog` | Epics + Stories in GitHub |
| Execute | `work #N` | Implementation |

### When to Use

- **Regulatory/compliance requirements** — Need documented requirements traceability
- **Complex integrations** — Multiple systems, APIs, or teams involved
- **Significant investment** — Large features justifying upfront planning
- **Stakeholder alignment** — Need formal sign-off before implementation
- **New domains** — Unfamiliar territory requiring research and design

### Characteristics

| Aspect | Top-Down |
|--------|----------|
| **Planning overhead** | Higher (PRD, acceptance criteria, test plans) |
| **Scope clarity** | High — defined before work begins |
| **Change handling** | Formal — update PRD, re-plan |
| **Audit trail** | Complete — full documentation chain |
| **Risk** | Late discovery of implementation issues |

---

## Bottom-Up Planning (Agile)

### Flow

```
┌─────────────┐
│ Story Idea  │  ← Direct from conversation or observation
└──────┬──────┘
       ↓
┌─────────────┐
│ /add-story  │  ← Creates epic if needed, adds story
└──────┬──────┘
       ↓
┌─────────────┐
│    Work     │  ← Immediate implementation
└──────┬──────┘
       ↓
┌─────────────┐
│   Refine    │  ← Scope emerges, add more stories
└──────┬──────┘
       ↓
┌─────────────┐
│   Epic      │  ← Structure crystallizes organically
│  Matures    │
└─────────────┘
```

### Commands

| Step | Command | Output |
|------|---------|--------|
| Start working | `/add-story` | Story (+ Epic if needed) |
| Add more | `/add-story #epic` | Additional stories |
| Work | `work #N` | Implementation |
| Repeat | — | Epic scope grows organically |

### When to Use

- **Exploratory work** — "Let's try this and see"
- **Small enhancements** — Not worth full PRD treatment
- **Urgent fixes** — Need to act now, document later
- **Prototyping** — Learning through building
- **Maintenance** — Bug fixes and small improvements
- **Evolving requirements** — Scope unclear until you start

### Characteristics

| Aspect | Bottom-Up |
|--------|-----------|
| **Planning overhead** | Minimal (just story + acceptance criteria) |
| **Scope clarity** | Emerges — discovered through work |
| **Change handling** | Natural — just add/modify stories |
| **Audit trail** | Issues + commits (lighter documentation) |
| **Risk** | Scope creep, missing big picture |

---

## Hybrid Approaches

Real projects often blend both approaches. Here are common patterns:

### Pattern 1: Top-Down Start, Bottom-Up Maintenance

```
Project Start                     Maturity
────────────────────────────────────────────────►
│                                               │
│  ┌─────────────────┐   ┌─────────────────┐   │
│  │   Top-Down      │   │   Bottom-Up     │   │
│  │   PRD → Backlog │   │   /add-story    │   │
│  └─────────────────┘   └─────────────────┘   │
│                                               │
│  Core features         Enhancements, fixes    │
│  designed upfront      added organically      │
```

**Use case:** New product development. Start with formal requirements for core features, then iterate with bottom-up additions as users provide feedback.

### Pattern 2: Bottom-Up Discovery, Top-Down Formalization

```
Discovery                         Implementation
────────────────────────────────────────────────►
│                                               │
│  ┌─────────────────┐   ┌─────────────────┐   │
│  │   Bottom-Up     │   │   Top-Down      │   │
│  │   Explore/Spike │   │   PRD → Build   │   │
│  └─────────────────┘   └─────────────────┘   │
│                                               │
│  Prototype,            Formal spec once       │
│  learn constraints     approach proven        │
```

**Use case:** Technical uncertainty. Spike with quick stories to prove feasibility, then write formal PRD once the approach is validated.

### Pattern 3: Parallel Tracks

```
┌───────────────────────────────────────────────┐
│  Track A (Top-Down)                           │
│  Major feature: PRD → /create-backlog → Work  │
├───────────────────────────────────────────────┤
│  Track B (Bottom-Up)                          │
│  Bug fixes: /add-story → Work                 │
├───────────────────────────────────────────────┤
│  Track C (Bottom-Up)                          │
│  Tech debt: /add-story → Work                 │
└───────────────────────────────────────────────┘
```

**Use case:** Ongoing development. New features follow formal planning while maintenance work uses lightweight approach.

**Scaling up:** When multiple epics are ready to execute in parallel, use `/plan-workstreams` to create dedicated branches with conflict-aware grouping. See [Concurrent Workstreams](../02-Advanced/Concurrent-Workstreams.md) for the full workflow.

---

## Project Lifecycle Integration

Different phases of a project naturally favor different approaches:

### Inception Phase

| Activity | Approach | Rationale |
|----------|----------|-----------|
| Initial vision | Top-Down | Charter establishes boundaries |
| Technical spikes | Bottom-Up | Explore unknowns quickly |
| Core architecture | Top-Down | Foundational decisions need thought |

### Construction Phase

| Activity | Approach | Rationale |
|----------|----------|-----------|
| Major features | Top-Down | Complexity warrants planning |
| Bug fixes | Bottom-Up | Quick turnaround needed |
| Refactoring | Bottom-Up | Scope emerges from code |
| New integrations | Top-Down | External dependencies need spec |

### Transition Phase

| Activity | Approach | Rationale |
|----------|----------|-----------|
| Release prep | Top-Down | Formal checklist, verification |
| Last-minute fixes | Bottom-Up | Urgency over ceremony |
| Documentation | Top-Down | Completeness required |

---

## Decision Framework

Use this flowchart to choose an approach:

```
                    ┌─────────────────────┐
                    │ Is the scope clear? │
                    └──────────┬──────────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
             YES                                NO
              │                                 │
              ▼                                 ▼
    ┌─────────────────┐               ┌─────────────────┐
    │ Is it complex   │               │   Bottom-Up     │
    │ or high-stakes? │               │   Start small,  │
    └────────┬────────┘               │   learn, expand │
             │                        └─────────────────┘
    ┌────────┴────────┐
    │                 │
   YES                NO
    │                 │
    ▼                 ▼
┌─────────────┐  ┌─────────────┐
│  Top-Down   │  │  Bottom-Up  │
│  Full PRD   │  │  /add-story │
└─────────────┘  └─────────────┘
```

### Quick Reference

| Situation | Approach |
|-----------|----------|
| "We need to build X" (X is well-defined) | Top-Down |
| "Let's figure out how to do X" | Bottom-Up |
| "The client requires documentation" | Top-Down |
| "Quick fix needed" | Bottom-Up |
| "This will touch 5+ systems" | Top-Down |
| "Small improvement idea" | Bottom-Up |

---

## Charter's Role

The project charter (`CHARTER.md`) supports both approaches:

### For Top-Down

- Provides scope boundaries for PRD validation
- Links proposals to project goals
- Ensures formal work aligns with vision

### For Bottom-Up

- `/add-story` checks charter compliance
- Warns if story may be out of scope
- Prevents organic growth from drifting off-mission

The charter acts as a **guardrail**, not a gate — it guides both approaches toward project goals.

---

## Anti-Patterns to Avoid

### 1. "All Top-Down, All the Time"

**Symptom:** Every small fix requires a PRD
**Problem:** Overhead kills velocity
**Fix:** Reserve formal planning for complex/high-stakes work

### 2. "All Bottom-Up, No Structure"

**Symptom:** Endless stories, no cohesive features
**Problem:** Scope creep, no completion criteria
**Fix:** Group related stories into epics, define epic-level acceptance criteria

### 3. "Mixing Without Intention"

**Symptom:** Random mix of approaches, no pattern
**Problem:** Confusion about process expectations
**Fix:** Explicitly choose approach per track/feature, document the choice

### 4. "Process Over Progress"

**Symptom:** Debating which approach instead of working
**Problem:** Analysis paralysis
**Fix:** Default to bottom-up for small work, top-down for large; adjust if needed

---

## Summary

| Aspect | Top-Down | Bottom-Up |
|--------|----------|-----------|
| **Trigger** | `proposal:` → PRD → backlog | `/add-story` |
| **Epic source** | Generated from PRD | Created on-demand |
| **Planning** | Upfront | Just-in-time |
| **Scope** | Fixed before work | Emerges during work |
| **Best for** | Clear, complex, formal | Unclear, simple, agile |
| **Documentation** | Heavy (PRD, test plan) | Light (issues, commits) |

**The Agile Principle:** *"Responding to change over following a plan"*

IDPF-Agile embraces this by supporting both planned work (when valuable) and emergent work (when appropriate). Use the right tool for the job.

---

**End of Planning Approaches Guide**
