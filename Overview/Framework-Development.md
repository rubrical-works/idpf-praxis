# Framework Development Reference
**Version:** v0.52.0
**Purpose:** Reference for IDPF development frameworks (2 frameworks: Agile, Vibe)
## PRD Creation (create-prd Skill)
> **Note:** IDPF-PRD deprecated in v0.24, replaced by `create-prd` skill.
**Location:** `Skills/create-prd/SKILL.md` | **Command:** `/create-prd`
### Workflow Modes
| Mode | Command | Purpose |
|------|---------|---------|
| **Promote** | `/create-prd Proposal/Feature.md` | Transform proposal to PRD |
| **Extract** | `/create-prd extract` | Extract PRD from codebase |
| **Interactive** | `/create-prd` | Prompt for mode selection |
### Key Features
- Charter validation against CHARTER.md
- Dynamic context-aware gap filling
- Story transformation from implementation details
- Priority validation (MoSCoW distribution)
- Optional UML diagram generation
- Single session completion
### Integration Points
- **Inputs:** `Proposal/*.md`, `Inception/` artifacts, `CHARTER.md`
- **Outputs:** `PRD/{name}/PRD-{name}.md` with optional `Diagrams/`
- **Downstream:** `Create-Backlog` generates GitHub issues from PRD
## IDPF-Agile Framework
**Location:** `IDPF-Agile/` | **Type:** Sprint-Based Development
### Key Components
**Terminology:** Product Backlog, Sprint Backlog, User Story, Story Points (Fibonacci), Sprint, Epic, Definition of Done, Velocity
**Workflow Stages:**
1. **Product Backlog Creation**: Generate stories, organize into epics
2. **Sprint Planning**: Select stories, set goal, estimate capacity
3. **Story Development**: Implement using TDD (RED-GREEN-REFACTOR)
4. **Sprint Review**: Validate completed stories
5. **Sprint Retrospective**: Process improvement, velocity analysis
**User Story Format:**
```
As a [user type]
I want [goal]
So that [benefit]

Acceptance Criteria:
- [ ] Criterion 1
- [ ] Criterion 2

Story Points: [estimate]
Priority: [High/Medium/Low]
Status: [Backlog/Selected/In Progress/In Review/Done]
```
**Commands:**
- Backlog: Create-Backlog, Add-Story, Prioritize-Backlog, Split-Story
- Sprint: Plan-Sprint, Sprint-Status, Sprint-Retro, End-Sprint
- Story Workflow: `work #N` and `done` triggers (per GitHub-Workflow.md)
- Development: Run-Tests, Show-Coverage
- Release: Open-Release, Prepare-Release, Close-Release
### When to Use
- Evolving requirements, iterative delivery
- Feature prioritization, medium/large projects
- Velocity tracking needed
### Integration Points
- Uses TDD cycles
- Can receive projects from Vibe evolution
- Terminal framework (no transitions out)
## IDPF-Vibe Framework
**Location:** `IDPF-Vibe/` | **Core Revision:** 4.0 | **Type:** Exploratory → Structured
### Architecture
**Core:** Vibe-to-Structured-Core-Framework.md (Rev 4.0)
**Platform-Specific:**
- Desktop (Rev 2): Windows, macOS, Linux
- Mobile (Rev 3): iOS, Android, cross-platform
- Web (Rev 2): Frontend, backend, full-stack
- Game (Rev 1): Godot, Unity, Unreal, browser
- Embedded (Rev 1): Arduino, ESP32, STM32, simulator-based
- Newbie (Rev 1): Beginner-friendly with Skills integration
### Three-Phase Workflow
**Phase 1: VIBE PHASE**
- Exploratory, rapid iteration
- Natural language prompts ("Try-This", "Show-Me", "Run-It")
- No formal requirements or testing required
**Vibe Commands:** Vibe-Start, Try-This, Show-Me, That-Works, Undo-That, Run-It, Vibe-Status, Vibe-End, Ready-to-Structure, Vibe-Abandon
**Phase 2: EVOLUTION POINT**
- Triggered: "Ready-to-Structure" or project complete
- Generates as-built Product Backlog
**Phase 3: AGILE PHASE**
- Switch to IDPF-Agile
- All new development follows TDD
- Add tests for existing code
### When to Use
- Unclear requirements, exploration needed
- Prototyping before formalizing
- Requirements emerge from experimentation
### Integration Points
- Requires Vibe Agent System Instructions
- Evolves to IDPF-Agile (terminal)
- Uses beginner Skills for Newbie framework
## Framework Transition Flow
```
IDPF-Vibe → IDPF-Agile (terminal)
```
**No direct entry to Agile:** Use `/create-prd` first or IDPF-Vibe for exploration, then evolve.
---
**End of Framework Development Reference**
