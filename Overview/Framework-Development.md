**Framework Development Reference**
**Version:** v0.67.1
Reference for IDPF development frameworks (2 frameworks: Agile, Vibe)
**PRD Creation (Pre-Development)**
> `IDPF-PRD` deprecated in v0.24, replaced by `create-prd` skill.
**Skill Location:** `Skills/create-prd/SKILL.md`
**Command:** `/create-prd`
Transform proposals into implementation-ready PRDs or extract PRDs from existing codebases.
**Workflow Modes:**
| Mode | Command | Purpose |
|------|---------|---------|
| **Promote** | `/create-prd Proposal/Feature.md` | Transform proposal to PRD |
| **Extract** | `/create-prd extract` | Extract PRD from codebase |
| **Interactive** | `/create-prd` | Prompt for mode selection |
**Key Features:**
- Charter Validation: Compares proposals against CHARTER.md scope
- Dynamic Questions: Context-aware gap filling
- Story Transformation: Converts implementation details to user stories
- Priority Validation: Ensures meaningful MoSCoW distribution
- UML Diagrams: Optional `.drawio.svg` generation
- Single Session: Complete PRD in one conversation
**Integration:**
- Inputs: `Proposal/*.md`, `Inception/` artifacts, `CHARTER.md`
- Outputs: `PRD/{name}/PRD-{name}.md` with optional `Diagrams/`
- Downstream: `Create-Backlog` generates GitHub issues from PRD
- Related: `codebase-analysis` skill for extraction mode
**IDPF-Agile Framework**
**Location:** `IDPF-Agile/` (Agile-Core.md, Agile-Commands.md, Agile-Best-Practices.md, Agile-Templates.md, Agile-Transitions.md)
**Type:** Story-Driven Development with TDD Cycles
Agile methodology with AI assistance: user stories, GitHub-native backlog, continuous TDD iteration.
**Terminology:**
- Product Backlog: All user stories (managed via GitHub issues)
- User Story: Feature from user perspective with acceptance criteria
- Story Points: Relative effort (Fibonacci: 1, 2, 3, 5, 8, 13, 21)
- Epic: Large feature area with multiple related stories
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
**Metrics:** Story points completed, AC pass rate, TDD cycle completion
**When to Use:**
- Building products with evolving requirements
- Iterative delivery with regular feedback
- Feature prioritization based on user value
- Medium to large projects
- Requirements well-defined or emerging from PRD process
**Integration:**
- Uses TDD cycles (RED-GREEN-REFACTOR)
- Requires appropriate System Instructions
- Can receive projects from IDPF-Vibe evolution
- Terminal framework (can transition to IDPF-LTS for maintenance)
**GitHub Project Template:** See `Reference/GitHub-Project-Template-Agile.md`
- Views: Backlog, Epics, All Work
- Labels: epic, story, bug, enhancement, tech-debt
- Custom Fields: Status, Priority, Story Points (optional)
- Issue hierarchy: Epic -> Story with sub-issues (gh pmu sub extension)
**IDPF-Vibe Framework**
**Location:** `IDPF-Vibe/`
**Core Framework Revision:** 4.0
**Type:** Exploratory Development -> Structured Evolution
Enable exploratory development without formal requirements, then evolve into IDPF-Agile when direction crystallizes.
**Core Framework:**
- Vibe-to-Structured-Core-Framework.md (Rev 4.0): Platform-agnostic workflow
**Platform-Specific Frameworks:**
- Desktop-Framework.md (Rev 2): Windows, macOS, Linux applications
- Mobile-Framework.md (Rev 3): iOS, Android, cross-platform mobile
- Web-Framework.md (Rev 2): Frontend, backend, full-stack web
- Game-Framework.md (Rev 1): Godot, Unity, Unreal, browser games
- Embedded-Framework.md (Rev 1): Arduino, ESP32, STM32, simulator-based
- Newbie-Framework.md (Rev 1): Beginner-friendly with Skills integration
**Phase 1: VIBE PHASE**
- Exploratory, rapid iteration development
- Natural language prompts ("Try-This", "Show-Me", "Run-It")
- No formal requirements or testing required
- Focus on discovery and experimentation
**Vibe Commands:** Vibe-Start, Try-This, Show-Me, That-Works, Undo-That, Run-It, Vibe-Status, Vibe-End, Ready-to-Structure, Vibe-Abandon
**Phase 2: EVOLUTION POINT**
- Triggered: User says "Ready-to-Structure" or project feels complete
- Generates as-built Product Backlog with completed stories (Done)
- Documents Vibe features as Story 0.x (completed) + Pending stories (backlog)
**Phase 3: AGILE PHASE**
- Switch to IDPF-Agile framework
- All new development follows TDD (RED-GREEN-REFACTOR)
- Add tests for existing vibe-phase code
- Complete remaining stories with full rigor
**Platform Coverage:**
**Desktop (Rev 2):** CLI tools, GUI apps, system utilities. Python, Ruby, JS (Node/Electron), C#, Rust. Platform-specific: Windows (PowerShell), macOS (Terminal), Linux (bash).
**Mobile (Rev 3):** iOS (Swift/SwiftUI), Android (Kotlin/Jetpack Compose), React Native, Flutter. Simulators/emulators for testing. Prerequisites: Xcode, Android Studio, SDK tools.
**Web (Rev 2):** Frontend: React, Vue, Svelte, vanilla JS/HTML/CSS. Backend: Node.js (Express), Python (Flask/Django), Ruby (Rails). Full-stack: Next.js, Remix, SvelteKit, Nuxt. DBs: SQLite, PostgreSQL, MongoDB.
**Game (Rev 1):** Godot (GDScript/C#), Unity (C#), Unreal (C++/Blueprints). Browser: Phaser, PixiJS, Three.js. Terminal: Python curses, Ruby TTY.
**Embedded (Rev 1):** Arduino, ESP32, STM32, Raspberry Pi. RTOS: FreeRTOS, Zephyr. Simulators: Wokwi, QEMU, Renode, SimulIDE. No physical hardware required.
**Newbie (Rev 1):** Complete beginners. Python (Flask) or Ruby (Sinatra), vanilla HTML/CSS/JS, SQLite. Skills: flask-setup, sinatra-setup, common-errors, sqlite-integration, beginner-testing.
**When to Use:**
- Starting with unclear requirements
- Need exploration phase first
- Prototyping before formalizing
- Requirements will emerge from experimentation
- Evolves to IDPF-Agile when ready
**Integration:**
- Requires Vibe Agent System Instructions (Core + Platform-specific)
- Evolves to IDPF-Agile (terminal framework)
- Uses beginner Skills for Newbie framework
**Framework Transition Flow**
```
IDPF-Vibe -> IDPF-Agile (terminal)
```
- IDPF-Vibe (exploratory) evolves to IDPF-Agile (structured)
- IDPF-Agile is the terminal framework - projects remain in Agile through completion
- No direct entry to Agile: use `/create-prd` first, or use IDPF-Vibe then evolve
**Command Model Classification**
Commands specify `model:` in YAML frontmatter for model tier selection. Inline switch (no `context: fork`), reverts after command completes.
| Tier | Frontmatter | Use Case | Cost vs Opus |
|------|-------------|----------|--------------|
| **Haiku** | `model: haiku` | Procedural — script-driven, template-filling, sequential CLI | ~15x cheaper |
| **Sonnet** | `model: sonnet` | Analytical — structured evaluation, spec-driven workflows | ~5x cheaper |
| **Opus** | *(no field)* | Creative — code generation, content creation, complex reasoning | Session default |
**Classification Criteria:**
| Tier | Qualifies When |
|------|---------------|
| **Haiku** | >80% mechanical — preamble-driven, template-filling, deterministic CLI, no content evaluation |
| **Sonnet** | >80% structured evaluation — criteria matching, conditional branching, structured output. Full compliance required |
| **Opus** | Creative reasoning — code generation, TDD cycles, content writing, architectural judgment |
**Complete Classification (40 commands)**
**Haiku — Procedural (7):**
| Command | Rationale |
|---------|-----------|
| `/assign-branch` | Script-driven branch assignment |
| `/bug` | Template filling: title + body -> create issue |
| `/destroy-branch` | Confirmation gate + cleanup commands |
| `/enhancement` | Template filling: title + body -> create issue |
| `/playwright-check` | Status checks + Bash remediation |
| `/switch-branch` | Script wrapper: list branches, checkout |
| `/transfer-issue` | Script wrapper: transfer between branches |
**Sonnet — Analytical (27):**
| Command | Rationale |
|---------|-----------|
| `/audit-hallucination` | Verification against anti-hallucination criteria |
| `/audit-minimization` | Comparison of minimized vs source files |
| `/bad-test-review` | Evaluate tests against charter and requirements |
| `/change-domain-expert` | Selection UI, config read/write, role validation |
| `/check-upgrade` | Hub detection, extension integrity, symlink health |
| `/ci` | YAML validation + pattern matching to CI features |
| `/code-review` | Parallel review agents with structured output |
| `/complete-prd` | Epic discovery, nested story iteration, state aggregation |
| `/create-branch` | Validation, state checking, tracker issue creation |
| `/done` | AC verification, diff reading, CI monitoring, multi-issue |
| `/extensions` | 6 subcommand modes, registry fallback, content extraction |
| `/gap-analysis` | Industry gap analysis against framework criteria |
| `/merge-branch` | Gate checks, PR creation, approval, merge, cleanup |
| `/minimize-files` | Two-pass minimization, skill packaging, registry generation |
| `/pivot` | Evaluates stories against keep/archive/close criteria |
| `/plan-workstreams` | Module boundary analysis + conflict risk scoring |
| `/prepare-beta` | Branch verification, change analysis, gating, tag creation |
| `/prepare-release` | Version analysis, CHANGELOG patterns |
| `/proposal` | Structured workflow with conditional branching |
| `/resolve-review` | Structured resolution with decision tree |
| `/review-issue` | Evaluation against type-specific criteria |
| `/review-prd` | Evaluation with tracked review history |
| `/review-proposal` | Evaluation with tracked review history |
| `/review-test-plan` | Evaluation against PRD requirements |
| `/self-diag` | 6-dimension framework integrity audit |
| `/skill-validate` | Pre-release skill validation checklist |
| `/split-story` | Structured 8-phase workflow |
**Opus — Creative (6):**
| Command | Rationale |
|---------|-----------|
| `/add-story` | Charter compliance and scope judgment |
| `/charter` | Creation/extraction require codebase understanding |
| `/create-backlog` | PRD decomposition requires architectural judgment |
| `/create-prd` | Requirement structuring and content generation |
| `/manage-skills` | Skill lifecycle management (list, install, remove, info) |
| `/work` | TDD cycles, code generation, complex reasoning |
**Adding a Model Tier:**
```yaml
---
version: "v0.67.1"
description: Command description (project)
model: sonnet
---
```
Valid values: `haiku`, `sonnet`. Omit for Opus (session default).
**End of Framework Development Reference**
