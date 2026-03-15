# Framework Development Reference
**Version:** v0.63.1
**Purpose:** Detailed reference for IDPF development frameworks (2 frameworks: Agile, Vibe)

## PRD Creation (Pre-Development)
> **Note:** The `IDPF-PRD` framework was deprecated in v0.24 and replaced by the `create-prd` skill.
**Skill Location:** `Skills/create-prd/SKILL.md`
**Command:** `/create-prd`

### Purpose
Transform proposals into implementation-ready PRDs or extract PRDs from existing codebases. The `create-prd` skill provides a streamlined, conversational workflow compared to the multi-phase IDPF-PRD framework.

### Workflow Modes
| Mode | Command | Purpose |
|------|---------|---------|
| **Promote** | `/create-prd Proposal/Feature.md` | Transform proposal to PRD |
| **Extract** | `/create-prd extract` | Extract PRD from codebase |
| **Interactive** | `/create-prd` | Prompt for mode selection |

### Key Features
- **Charter Validation:** Compares proposals against CHARTER.md scope
- **Dynamic Questions:** Context-aware gap filling (not static worksheets)
- **Story Transformation:** Converts implementation details to user stories
- **Priority Validation:** Ensures meaningful MoSCoW distribution
- **UML Diagrams:** Optional `.drawio.svg` diagram generation
- **Single Session:** Complete PRD in one conversation (vs. multi-phase)

### Integration Points
- Inputs: `Proposal/*.md`, `Inception/` artifacts, `CHARTER.md`
- Outputs: `PRD/{name}/PRD-{name}.md` with optional `Diagrams/`
- Downstream: `Create-Backlog` generates GitHub issues from PRD
- Related: `codebase-analysis` skill for extraction mode

## IDPF-Agile Framework
**Location:** `IDPF-Agile/` (Agile-Core.md, Agile-Commands.md, Agile-Best-Practices.md, Agile-Templates.md, Agile-Transitions.md)
**Type:** Story-Driven Development with TDD Cycles

### Purpose
Implement agile software development methodology with AI assistance, organizing work around user stories, GitHub-native backlog management, and continuous TDD iteration.

### Key Components
**Terminology:**
- Product Backlog: All user stories for the project (managed via GitHub issues)
- User Story: Feature described from user perspective with acceptance criteria
- Story Points: Relative effort estimate (Fibonacci: 1, 2, 3, 5, 8, 13, 21)
- Epic: Large feature area containing multiple related stories
- Definition of Done (DoD): Completion checklist for stories
**Workflow Stages:**
1. **Product Backlog Creation**: Generate stories from PRD, organize into epics
2. **Story Selection**: Select stories from Ready backlog
3. **Story Development**: Implement using TDD cycles (RED-GREEN-REFACTOR)
4. **Story Review**: Validate acceptance criteria
5. **Done**: Mark story complete, proceed to next story or release
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
**Agile Commands:**
- **Backlog Operations**: Create-Backlog, Add-Story, Prioritize-Backlog, Split-Story
- **Story Workflow**: Use `work #N` and `done` triggers (per GitHub-Workflow.md)
- **Development Commands**: Run-Tests, Show-Coverage
- **Release Lifecycle**: Create-Branch, Prepare-Release, Merge-Branch, Destroy-Branch
- **Special Scenarios**: Pivot
- **Utility Commands**: List-Commands, Help
**Metrics Tracked:**
- Story points completed
- Acceptance criteria pass rate
- TDD cycle completion

### When to Use
- Building products with evolving requirements
- Iterative delivery with regular feedback
- Feature prioritization based on user value
- Medium to large projects
- Requirements are well-defined or will emerge from PRD process

### Integration Points
- Uses TDD cycles (RED-GREEN-REFACTOR)
- Requires appropriate System Instructions
- Can receive projects from IDPF-Vibe evolution
- Follows same Claude Code communication protocol
- Terminal framework (can transition to IDPF-LTS for maintenance)

### GitHub Project Template
See `Reference/GitHub-Project-Template-Agile.md` for:
- Views: Backlog, Epics, All Work
- Labels: epic, story, bug, enhancement, tech-debt
- Custom Fields: Status, Priority, Story Points (optional)
- Issue hierarchy: Epic → Story with sub-issues (gh pmu sub extension)

## IDPF-Vibe Framework
**Location:** `IDPF-Vibe/`
**Core Framework Revision:** 4.0
**Type:** Exploratory Development → Structured Evolution

### Purpose
Enable exploratory development phase without formal requirements, then evolve into IDPF-Agile when project direction crystallizes.

### Architecture
**Core Framework:**
- Vibe-to-Structured-Core-Framework.md (Rev 4.0): Platform-agnostic workflow
**Platform-Specific Frameworks:**
- Vibe-to-Structured-Desktop-Framework.md (Rev 2): Windows, macOS, Linux applications
- Vibe-to-Structured-Mobile-Framework.md (Rev 3): iOS, Android, cross-platform mobile
- Vibe-to-Structured-Web-Framework.md (Rev 2): Frontend, backend, full-stack web
- Vibe-to-Structured-Game-Framework.md (Rev 1): Godot, Unity, Unreal, browser games
- Vibe-to-Structured-Embedded-Framework.md (Rev 1): Arduino, ESP32, STM32, simulator-based
- Vibe-to-Structured-Newbie-Framework.md (Rev 1): Beginner-friendly with Skills integration

### Three-Phase Workflow
**Phase 1: VIBE PHASE**
- Exploratory, rapid iteration development
- Natural language prompts ("Try-This", "Show-Me", "Run-It")
- No formal requirements or testing required
- Focus on discovery and experimentation
- Capture what works, discard what doesn't
**Vibe Commands:**
- Vibe-Start: Begin exploratory development
- Try-This: Experiment with idea
- Show-Me: Display current state
- That-Works: Keep current implementation
- Undo-That: Revert last change
- Run-It: Execute and test
- Vibe-Status: Progress check
- Vibe-End: Pause/save snapshot (resume later)
- Ready-to-Structure: Trigger evolution
- Vibe-Abandon: Stop project entirely
**Phase 2: EVOLUTION POINT**
- Triggered when: User says "Ready-to-Structure" or project feels complete
- ASSISTANT transitions to IDPF-Agile
**Evolution to IDPF-Agile:**
- Generates: As-built Product Backlog with completed stories (Done)
- Documents: Vibe features as Story 0.x (completed) + Pending stories (backlog)
- Status: "Ready for Story Development" or "No pending stories - project complete"
**Phase 3: AGILE PHASE**
- Switch to IDPF-Agile framework
- All new development follows TDD (RED-GREEN-REFACTOR)
- Add tests for existing vibe-phase code
- Complete remaining stories with full rigor

### Platform Coverage
**Desktop (Rev 2):**
- CLI tools, GUI applications, system utilities
- Technologies: Python, Ruby, JavaScript (Node/Electron), C#, Rust
- Platform-specific: Windows (PowerShell), macOS (Terminal), Linux (bash)
**Mobile (Rev 3):**
- iOS (Swift/SwiftUI), Android (Kotlin/Jetpack Compose), React Native, Flutter
- Simulators/emulators for testing without physical devices
- Prerequisites verification: Xcode, Android Studio, SDK tools
**Web (Rev 2):**
- Frontend: React, Vue, Svelte, vanilla JS/HTML/CSS
- Backend: Node.js (Express), Python (Flask/Django), Ruby (Rails)
- Full-stack: Next.js, Remix, SvelteKit, Nuxt
- Databases: SQLite, PostgreSQL, MongoDB
**Game (Rev 1):**
- Godot Engine (GDScript/C#), Unity (C#), Unreal (C++/Blueprints)
- Browser games (Phaser, PixiJS, Three.js)
- Terminal games (Python curses, Ruby TTY)
- Play-testing focused iteration
**Embedded (Rev 1):**
- Microcontrollers: Arduino, ESP32, STM32, Raspberry Pi
- RTOS: FreeRTOS, Zephyr
- Simulators: Wokwi (web-based), QEMU, Renode, SimulIDE
- No physical hardware required during development
**Newbie (Rev 1):**
- Target: Complete beginners
- Technologies: Python (Flask) or Ruby (Sinatra), vanilla HTML/CSS/JS, SQLite
- Skills Integration: flask-setup, sinatra-setup, common-errors, sqlite-integration, beginner-testing
- Extra explanations, progressive learning, simplified patterns

### When to Use
- Starting with unclear requirements
- Need exploration phase first
- Prototyping before formalizing
- Requirements will emerge from experimentation
- Evolves to IDPF-Agile when ready

### Integration Points
- Requires Vibe Agent System Instructions (Core + Platform-specific)
- Evolves to IDPF-Agile (terminal framework)
- Uses beginner Skills for Newbie framework
- Follows Claude Code two-tool workflow strictly

## Framework Transition Flow
```
IDPF-Vibe → IDPF-Agile (terminal)
```
**Transition Path:**
- **IDPF-Vibe** (exploratory) evolves to **IDPF-Agile** (structured)
- **IDPF-Agile** is the terminal framework - projects remain in Agile through completion
**No direct entry to Agile:**
- Use `/create-prd` first to generate requirements, then create backlog in Agile
- Or use IDPF-Vibe for exploration, then evolve to Agile

## Command Model Classification
Commands specify a `model:` field in their YAML frontmatter to run on an appropriate model tier. This three-tier system optimizes cost and capacity while preserving output quality.

### Three-Tier Model
| Tier | Frontmatter | Use Case | Cost vs Opus |
|------|-------------|----------|--------------|
| **Haiku** | `model: haiku` | Procedural commands — script-driven, template-filling, sequential CLI | ~15x cheaper |
| **Sonnet** | `model: sonnet` | Analytical commands — structured evaluation against criteria, spec-driven workflows | ~5x cheaper |
| **Opus** | *(no field)* | Creative commands — code generation, content creation, complex reasoning | Session default |
The model switch happens **inline** — no `context: fork` required. The session transparently swaps to the specified model, then reverts to the session default after the command completes. Conversation history and ToolSearch capability are preserved.

### Classification Criteria
| Tier | Qualifies When |
|------|---------------|
| **Haiku** | >80% mechanical — preamble-driven, template-filling, deterministic CLI sequences, no content evaluation |
| **Sonnet** | >80% structured evaluation — criteria matching, multi-step specs with conditional branching, structured output. Full instruction compliance required (no fabrication) |
| **Opus** | Requires creative reasoning — code generation, TDD cycles, content writing, architectural judgment, scope decomposition |

### Complete Classification (40 commands)

#### Haiku — Procedural (7 commands)
| Command | Rationale |
|---------|-----------|
| `/assign-branch` | Script-driven branch assignment |
| `/bug` | Template filling: title + body → create issue |
| `/destroy-branch` | Confirmation gate + cleanup commands |
| `/enhancement` | Template filling: title + body → create issue |
| `/playwright-check` | Status checks + Bash remediation |
| `/switch-branch` | Script wrapper: list branches, checkout |
| `/transfer-issue` | Script wrapper: transfer between branches |

#### Sonnet — Analytical (27 commands)
| Command | Rationale |
|---------|-----------|
| `/audit-hallucination` | Systematic verification against anti-hallucination criteria |
| `/audit-minimization` | Systematic comparison of minimized vs source files |
| `/bad-test-review` | Evaluate tests against charter and requirements |
| `/change-domain-expert` | Selection UI with 12+ options, config read/write, role validation |
| `/check-upgrade` | Multi-check validation: hub detection, extension integrity, symlink health |
| `/ci` | YAML validation + pattern matching to CI features |
| `/code-review` | Parallel review agents with structured output |
| `/complete-prd` | Epic discovery, nested story iteration, state aggregation |
| `/create-branch` | Multi-step: validation, state checking, tracker issue creation |
| `/done` | AC verification, diff reading, CI monitoring, multi-issue processing |
| `/extensions` | 6 subcommand modes, registry fallback, content extraction |
| `/gap-analysis` | Industry gap analysis against framework criteria → structured proposal |
| `/merge-branch` | Multi-phase: gate checks, PR creation, approval, merge, cleanup |
| `/minimize-files` | 852-line two-pass minimization, run-type detection, skill packaging, registry generation |
| `/pivot` | Evaluates each story against keep/archive/close criteria |
| `/plan-workstreams` | Module boundary analysis + conflict risk scoring |
| `/prepare-beta` | Multi-phase: branch verification, change analysis, gating, tag creation |
| `/prepare-release` | Version analysis is structured, CHANGELOG follows patterns |
| `/proposal` | Structured workflow with conditional branching, user provides content via prompts |
| `/resolve-review` | Structured resolution with decision tree |
| `/review-issue` | Structured evaluation against type-specific criteria |
| `/review-prd` | Structured evaluation with tracked review history |
| `/review-proposal` | Structured evaluation with tracked review history |
| `/review-test-plan` | Structured evaluation against PRD requirements |
| `/self-diag` | 6-dimension framework integrity audit |
| `/skill-validate` | Pre-release skill validation checklist |
| `/split-story` | Structured 8-phase workflow, user provides creative decisions |

#### Opus — Creative (6 commands)
| Command | Rationale |
|---------|-----------|
| `/add-story` | Story creation requires charter compliance and scope judgment |
| `/charter` | Mixed-mode: creation/extraction require codebase understanding |
| `/create-backlog` | PRD decomposition into epics/stories requires architectural judgment |
| `/create-prd` | Requirement structuring and content generation from proposals |
| `/manage-skills` | Skill lifecycle management (list, install, remove, info) |
| `/work` | TDD cycles, code generation, complex multi-step reasoning |

### Adding a Model Tier to a Command
Add the `model:` field to the YAML frontmatter:
```yaml
---
version: "v0.63.1"
description: Command description (project)
model: sonnet
---
```
Valid values: `haiku`, `sonnet`. Omit the field entirely for Opus (session default).

### When to Use Each Tier
**Haiku** — procedural commands with no content evaluation:
- Script pre-computes decisions; model just parses and branches
- Template-filling with user input (no content generation)
- Deterministic CLI command sequences
**Sonnet** — analytical commands with structured evaluation:
- Multi-step specs with criteria matching and conditional branching
- Structured output (review findings, audit reports, validation results)
- Full instruction compliance verified (no fabrication or shortcut-taking)
**Opus** — creative commands requiring deep reasoning:
- Code generation and TDD cycles (`/work`)
- Content creation and requirement structuring (`/create-prd`, `/create-backlog`)
- Scope decomposition and architectural judgment (`/add-story`, `/charter`)
**End of Framework Development Reference**
