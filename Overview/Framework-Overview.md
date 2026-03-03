# Framework Overview
**Version:** v0.56.0
**Purpose:** Comprehensive reference for AI assistants and framework development
---
## Framework Purpose and Scope
This framework ecosystem supports AI-assisted software development across multiple methodologies and platforms. System Instructions are **REQUIRED** for all framework operation.
**Core Principle:** System Instructions define WHO the assistant is; Frameworks define WHAT process to follow; Skills provide reusable capabilities; Assistant Guidelines ensure accuracy and quality.
---
## PRD Creation (create-prd Skill)
> **Note:** `IDPF-PRD` deprecated in v0.24, replaced by `create-prd` skill.
**Skill Location:** `Skills/create-prd/SKILL.md`
**Command:** `/create-prd`
**Type:** Requirements Engineering & PRD Generation
### Workflow Modes
| Mode | Command | Purpose |
|------|---------|---------|
| **Promote** | `/create-prd Proposal/Feature.md` | Transform proposal to PRD |
| **Extract** | `/create-prd extract` | Extract PRD from codebase |
| **Interactive** | `/create-prd` | Prompt for mode selection |
### Key Features
- **Charter Validation:** Compares proposals against CHARTER.md scope
- **Dynamic Questions:** Context-aware gap filling
- **Story Transformation:** Converts implementation details to user stories
- **Priority Validation:** Ensures meaningful MoSCoW distribution
- **UML Diagrams:** Optional `.drawio.svg` diagram generation
- **Single Session:** Complete PRD in one conversation
### Integration Points
- **Inputs:** `Proposal/*.md`, `Inception/` artifacts, `CHARTER.md`
- **Outputs:** `PRD/{name}/PRD-{name}.md` with optional `Diagrams/`
- **Downstream:** `Create-Backlog` generates GitHub issues from PRD
- **Related:** `codebase-analysis` skill for extraction mode
---
## IDPF-Agile Framework
**Location:** `IDPF-Agile/Agile-Driven Development Framework.md`
**Type:** Sprint-Based Development with User Stories
### Key Components
**Terminology:** Product Backlog, Sprint Backlog, User Story, Story Points (Fibonacci: 1-21), Sprint (1-2 weeks), Epic, Definition of Done, Velocity
**Workflow Stages:**
1. **Product Backlog Creation**: Generate stories, organize into epics
2. **Sprint Planning**: Select stories, set goal, estimate capacity
3. **Story Development**: Implement using TDD (RED-GREEN-REFACTOR)
4. **Sprint Review**: Validate stories, gather feedback
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
- **Backlog:** Create-Backlog, Add-Story, Prioritize-Backlog, Split-Story
- **Sprint:** Plan-Sprint, Sprint-Status, Sprint-Retro, End-Sprint
- **Story Workflow:** `work #N` and `done` triggers (per GitHub-Workflow.md)
- **Development:** Run-Tests, Show-Coverage
- **Release:** Open-Release, Prepare-Release, Close-Release
### When to Use
- Evolving requirements, iterative delivery, feature prioritization
- Medium to large projects needing velocity tracking
---
## IDPF-Vibe Framework
**Location:** `IDPF-Vibe/`
**Core Framework Revision:** 4.0
**Type:** Exploratory Development -> Structured Evolution
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
**Phase 1: VIBE PHASE** -- Exploratory, rapid iteration. Commands: Vibe-Start, Try-This, Show-Me, That-Works, Undo-That, Run-It, Vibe-Status, Vibe-End, Ready-to-Structure, Vibe-Abandon
**Phase 2: EVOLUTION POINT** -- Triggered by "Ready-to-Structure". Generates As-built Product Backlog with completed stories (DONE) + Pending stories.
**Phase 3: AGILE PHASE** -- Switch to IDPF-Agile, all new development follows TDD, add tests for existing vibe-phase code.
### Two-Tool Workflow
- **ASSISTANT** (Claude chat): Instructions in numbered STEP format
- **Claude Code** (execution): Single code block execution
- **User**: Bridges both tools
### Platform Coverage
- **Desktop:** CLI, GUI, system utilities (Python, Ruby, JS, C#, Rust)
- **Mobile:** iOS (Swift/SwiftUI), Android (Kotlin/Compose), React Native, Flutter
- **Web:** Frontend (React, Vue, Svelte), Backend (Express, Flask, Rails), Full-stack (Next.js, Remix)
- **Game:** Godot, Unity, Unreal, browser games (Phaser, PixiJS)
- **Embedded:** Arduino, ESP32, STM32, Raspberry Pi; RTOS (FreeRTOS, Zephyr); simulators
- **Newbie:** Python (Flask) or Ruby (Sinatra), vanilla HTML/CSS/JS, SQLite
---
## IDPF-Testing Framework
**Location:** `IDPF-Testing/IDPF-Testing.md`
**Type:** Foundational Testing Framework
**Core Principle:** "Test automation is software development."
### Architecture
```
IDPF-Testing (foundation)
    +-- IDPF-QA-Automation      (Selenium, Playwright, Cypress, Appium)
    +-- IDPF-Performance        (k6, JMeter, Gatling, Locust)
    +-- IDPF-Security           (OWASP ZAP, Burp Suite, SAST/DAST)
    +-- IDPF-Accessibility      (axe, Lighthouse, Pa11y)
    +-- IDPF-Chaos              (Chaos Monkey, Gremlin, LitmusChaos)
    +-- IDPF-Contract-Testing   (Pact, Spring Cloud Contract)
```
### Embedded vs Separate Repository
**Embedded (No IDPF-Testing):** TDD, ATDD, BDD -- Application repo with IDPF-Agile
**Separate (Uses IDPF-Testing):** QA Automation, Performance, Security, Chaos, Contract Testing, Accessibility (flexible)
### Workflow Phases
```
PLAN -> DESIGN -> DEVELOP -> EXECUTE -> REPORT
```
**Test Plans** replace PRDs for test repositories. Location: `<test-repo>/PRD/TestPlans/`
---
## IDPF-QA-Automation Framework
**Extends:** IDPF-Testing | **Type:** UI & End-to-End Test Automation
**Test Types:** Smoke (<5min), Regression (30-60min), Cross-Browser, Mobile, Visual, E2E
**Web Tools:** Selenium, Playwright, Cypress, WebDriverIO
**Mobile Tools:** Appium, XCUITest, Espresso, Detox
**Architecture:** Page Object Model (primary). Selector priority: data-testid > ID > Name > ARIA > CSS Class
---
## IDPF-Performance Framework
**Extends:** IDPF-Testing | **Type:** Performance Testing
**Test Types:** Load (steady state), Stress (find breaking point), Endurance/Soak (4-24h), Spike, Capacity
**Tools:** k6 (JS, CI-friendly), JMeter (enterprise), Gatling (high throughput), Locust (Python), Artillery (serverless)
**Key Metrics:** Response Time p95 (<500ms), p99 (<1000ms), Error Rate (<0.1%), Apdex (>0.9)
---
## IDPF-Security Framework
**Extends:** IDPF-Testing | **Type:** Security Testing
**Testing Types:** SAST (SonarQube, Semgrep, CodeQL), SCA (Snyk, Dependabot), DAST (ZAP, Burp), IAST, Penetration Testing, Secret Scanning (GitLeaks, TruffleHog)
**OWASP Top 10:** Full coverage mapped to testing approaches and tools
**Vulnerability SLAs:** Critical (24h), High (7d), Medium (30d), Low (90d)
**CI/CD Gates:** SAST + Secret Scan at commit, SCA at PR, DAST pre-deploy
---
## IDPF-Accessibility Framework
**Extends:** IDPF-Testing | **Type:** Accessibility Testing
**Repository:** Flexible (Embedded or Separate)
**Testing Types:** Automated Scans (axe-core, Lighthouse, Pa11y), Keyboard Testing, Screen Reader (NVDA, JAWS, VoiceOver), Color Contrast, Cognitive, Mobile a11y
**Target:** WCAG 2.1 Level AA as baseline
**Severity SLAs:** Critical (before release), Serious (30d), Moderate (60d), Minor (90d)
---
## IDPF-Chaos Framework
**Extends:** IDPF-Testing | **Type:** Chaos Engineering
**Principles:** Build hypothesis, vary real-world events, run in production, automate, minimize blast radius
**Fault Types:** Infrastructure (instance termination, AZ failure), Network (latency, packet loss), Application (memory, CPU), Dependency (service unavailable), State (DB failure, cache eviction)
**Tools:** Chaos Monkey, Gremlin, LitmusChaos, Chaos Mesh, AWS FIS, Toxiproxy
**Workflow:** Hypothesis -> Observability -> Design -> Approval -> Execute -> Analyze -> Fix
---
## IDPF-Contract-Testing Framework
**Extends:** IDPF-Testing | **Type:** API Contract Testing
**Flow:** Consumer -> Generate Contract -> Publish to Broker -> Provider Fetches -> Verify -> Can-I-Deploy -> Deploy
**Tools:** Pact (multi-language, mature), Spring Cloud Contract (Spring), Specmatic (OpenAPI), Dredd, Hoverfly
**Key Concepts:** Consumer, Provider, Contract, Broker, Can-I-Deploy, Provider State
---
## System Instructions
**Location:** `System-Instructions/`
### Domain Specialization Architecture
**Pattern:** Core + Domain Specialization
- **Core-Developer-Instructions.md (Rev 1.0)**: Foundation competencies
- **22 Domain Specialists**: Specialized expertise profiles
- **Domain-Selection-Guide.md (Rev 1.0)**: Choosing appropriate specialist(s)
**Loading:** 1. Core -> 2. Domain specialist(s)
**Core Competencies:** Version Control, Testing Fundamentals, Agile Development, Code Quality (SOLID, DRY, YAGNI, KISS), Design Patterns, Cross-Platform Awareness, Security Fundamentals, Performance Basics
### 22 Domain Specialists
1. **Backend-Specialist** -- Server-side, REST/GraphQL, auth (Django, Flask, FastAPI, Express, NestJS, Rails, Spring, Go)
2. **Frontend-Specialist** -- React, Vue, Angular, Svelte, CSS architecture, state management, performance, a11y
3. **DevOps-Engineer** -- CI/CD, Docker, Kubernetes, IaC (Terraform, Pulumi), monitoring
4. **Database-Engineer** -- Schema design, query optimization, replication, migrations (PostgreSQL, MySQL, MongoDB, Redis)
5. **API-Integration-Specialist** -- REST, GraphQL, gRPC, WebSocket, microservices, message brokers
6. **Security-Engineer** -- OWASP, OAuth 2.0, cryptography, pen testing, compliance
7. **Platform-Engineer** -- IDPs, service catalogs, golden paths, DevEx
8. **Mobile-Specialist** -- iOS (Swift/SwiftUI), Android (Kotlin/Compose), React Native, Flutter
9. **Data-Engineer** -- ETL/ELT (Airflow, Prefect), Spark, data modeling, warehousing
10. **QA-Test-Engineer** -- Test strategy, automation (Cypress, Playwright, Selenium), TDD/BDD
11. **Cloud-Solutions-Architect** -- System design, AWS/Azure/GCP, scalability, distributed systems
12. **SRE-Specialist** -- SLO/SLI/SLA, error budgets, observability, incident response
13. **Embedded-Systems-Engineer** -- C/C++, ARM Cortex-M, RTOS, hardware protocols
14. **ML-Engineer** -- TensorFlow, PyTorch, deep learning, MLOps, model optimization
15. **Performance-Engineer** -- Profiling, load testing, frontend/backend optimization, APM
16. **Accessibility-Specialist** -- WCAG 2.1/2.2, assistive technology testing, legal compliance
17. **Full-Stack-Developer** -- End-to-end development, holistic system thinking, API contract design
18. **Desktop-Application-Developer** -- Cross-platform (Qt, GTK, Electron, Tauri), system integration
19. **Game-Developer** -- Unity, Unreal, Godot, game patterns, physics, multiplayer
20. **Graphics-Engineer** -- Rasterization, ray tracing, GPU programming, graphics APIs (Vulkan, DirectX, OpenGL, Metal, WebGPU)
21. **Systems-Programmer** -- Memory, concurrency, OS internals, compilers, performance-critical code
22. **Technical-Writer** -- Documentation engineering, docs-as-code, API docs, style guides
### Domain Selection Quick Reference
- **Full-Stack Web**: Core + Backend + Frontend + Database
- **Cloud-Native Microservices**: Core + API-Integration + DevOps + Cloud-Architect
- **Mobile App with Backend**: Core + Mobile + Backend
- **Data Platform**: Core + Data-Engineer + Database-Engineer + Cloud-Architect
- **Secure Production System**: Core + Backend + Security + SRE
### Vibe Agent System Instructions
**Core:** Vibe-Agent-Core-Instructions.md (Rev 1.3)
**Platform-Specific:** Desktop, Web, Mobile, Game, Embedded, Newbie
Both core + platform must be loaded together.
---
## Skills
**Location:** `Skills/`
**Total:** 29 skills (6 TDD/BDD, 1 PRD, 2 code quality, 2 beginner setup, 3 beginner support, 2 database, 2 advanced testing, 2 architecture, 1 DevOps, 1 testing setup, 1 desktop, 1 diagrams, 4 deployment platforms, 1 SEO, 1 privacy compliance)
### TDD Skills (Experienced)
- **tdd-red-phase** -- RED phase: writing failing tests, verifying failures
- **tdd-green-phase** -- GREEN phase: minimal implementation to pass tests
- **tdd-refactor-phase** -- REFACTOR phase: code improvement, maintaining green tests
- **tdd-failure-recovery** -- Handle unexpected test behaviors, recovery procedures
- **test-writing-patterns** (Standalone) -- AAA pattern, Given-When-Then, test doubles
- **bdd-writing** (Standalone) -- BDD/Gherkin syntax, feature files, step definitions
### PRD Skills
- **create-prd** -- Transform proposals into PRD documents, charter alignment, user story generation
### Code Quality Skills
- **anti-pattern-analysis** -- Systematic anti-pattern detection during code review
- **codebase-analysis** -- Comprehensive codebase analysis and documentation extraction
### Beginner Skills
- **flask-setup** / **sinatra-setup** -- Environment setup with step-by-step guidance
- **common-errors** -- Troubleshooting reference
- **sqlite-integration** -- Database integration guidance
- **beginner-testing** -- Testing introduction and TDD education
### Database Skills
- **postgresql-integration** -- Setup, connection pooling, query patterns
- **migration-patterns** -- Schema versioning, migration strategies, rollback
### Advanced Testing Skills
- **property-based-testing** -- Hypothesis (Python), fast-check (JS/TS), QuickCheck
- **mutation-testing** -- mutmut (Python), Stryker (JS/TS/.NET), PIT (Java)
### Architecture Skills
- **api-versioning** -- Versioning strategies and deprecation workflows
- **error-handling-patterns** -- Error hierarchy design and API error responses
### Other Skills
- **ci-cd-pipeline-design** -- Pipeline architecture (GitHub Actions, GitLab CI, Jenkins, Azure DevOps)
- **playwright-setup** -- Playwright test automation setup
- **electron-development** -- Electron desktop app patterns
- **drawio-generation** -- Draw.io XML diagram generation from design discussions
### Deployment Platform Skills
- **vercel-project-setup** -- Vercel deployment with preview deployments and edge functions
- **railway-project-setup** -- Railway deployment with Nixpacks and preview environments
- **render-project-setup** -- Render deployment with Blueprints and preview environments
- **digitalocean-app-setup** -- DigitalOcean App Platform with review apps
---
## Assistant Guidelines
**Location:** `Assistant/`
**Total:** 2 documents
### Anti-Hallucination Rules for Software Development
**Core Principle:** Accuracy over helpfulness. Uncertainty over invention. Verification over assumption.
- NEVER invent: API methods, class names, config syntax, command flags, file paths, library dependencies
- NEVER assume: OS/platform, available tools, project structure, versions, environment config
**Source Hierarchy:** User files -> Official docs -> Training data -> Logical inference
**Confidence Levels:** High, Medium, Low, No confidence
**File Operations:** Always READ before editing, verify paths exist, enumerate before bulk operations
### Anti-Hallucination Rules for Skill Creation
- Never invent content not in source material
- Preserve exact wording and terminology from source
- Only create resource files for content actually in source
---
## Rules Auto-Loading (v2.9+)
**Location:** `.claude/rules/`
| File | Content | Source |
|------|---------|--------|
| `01-anti-hallucination.md` | Framework development quality rules | `Assistant/Anti-Hallucination-Rules-for-Framework-Development.md` |
| `02-github-workflow.md` | GitHub issue management | `Reference/GitHub-Workflow.md` |
| `03-session-startup.md` | Startup procedure | Generated |
Rules auto-load at session start, persist after compaction. Files numbered for load order.
---
## Framework Transition Matrix
**Valid Transitions:**
| From | To | When |
|------|----|----|
| **Vibe** | **Agile** | Exploration complete, feature set identified, ready for sprints |
```
VIBE --> AGILE (Terminal)
```
**Invalid:** Agile -> Vibe (quality standards never decrease)
**Preserved Across Transitions:** All code/tests, git history, TDD methodology, architecture decisions, dependencies
**What Changes:** Documentation format, workflow structure, planning granularity, progress tracking
---
## Framework Integration Architecture
```
System Instructions (REQUIRED - WHO + EXPERTISE)
    -> Framework Selection (WHAT process)
    -> Skills (TOOLS for capabilities)
    -> Assistant Guidelines (HOW WELL - quality)
```
### Selection Criteria
- **IDPF-Agile:** Defined/evolving requirements, iterative delivery, velocity tracking
- **IDPF-Vibe:** Unclear requirements, exploration, prototyping -> evolves to Agile
---
## Framework Ecosystem Summary
- **2 Development Frameworks**: IDPF-Agile, IDPF-Vibe (7 variants)
- **7 Testing Frameworks**: IDPF-Testing (foundation) + 6 specialized
- **System Instructions**: 1 Core + 22 Domain Specialists + 1 Guide + Vibe Agent (Core + 6 platforms)
- **29 Skills**: 6 TDD/BDD, 1 PRD, 2 code quality, 2 beginner setup, 3 beginner support, 2 database, 2 advanced testing, 2 architecture, 1 DevOps, 1 testing setup, 1 desktop, 1 diagrams, 4 deployment platforms, 1 SEO, 1 privacy compliance
- **2 Assistant Guidelines**: Software dev, Skill creation
**Framework Selection Matrix:**
| Project Type | Starting Point | Evolution Path |
|--------------|---------------|----------------|
| Defined requirements | IDPF-Agile | Terminal |
| Unclear requirements | IDPF-Vibe | -> Agile |
| Need requirements | `/create-prd` | PRD -> Agile |
| Separate test repo | IDPF-Testing | Agile for test dev |
**Critical Success Factors:**
1. System Instructions MUST be loaded before framework use
2. TDD discipline maintained throughout
3. Anti-hallucination rules applied continuously
4. Framework transitions follow valid paths only
---
