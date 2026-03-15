# Framework Overview
**Version:** v0.63.1
**Purpose:** Comprehensive reference for AI assistants and framework development
---
## Framework Purpose and Scope
This framework ecosystem supports AI-assisted software development across multiple methodologies and platforms. System Instructions are **REQUIRED** for all framework operation.
**Core Principle:** System Instructions define WHO the assistant is; Frameworks define WHAT process to follow; Skills provide reusable capabilities; Assistant Guidelines ensure accuracy and quality.
---
## PRD Creation (create-prd Skill)
> **Note:** `IDPF-PRD` was deprecated in v0.24; replaced by `create-prd` skill.
**Skill Location:** `Skills/create-prd/SKILL.md`
**Command:** `/create-prd`
**Type:** Requirements Engineering & PRD Generation
### Purpose
Transform proposals into implementation-ready PRDs or extract PRDs from existing codebases.
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
---
## IDPF-Agile Framework
**Location:** `IDPF-Agile/`
**Core Framework Revision:** 6.0
**Type:** Story-Driven Development with TDD
### Purpose
Iterative development using user stories, TDD methodology, and structured backlog management. Primary framework for most projects.
### Architecture
- Agile-Core.md (Rev 6.0): Core methodology (stories, TDD, backlog)
- Agile-Supplement-Scoring-Guide.md: Story estimation reference
### User Story Format
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
### Agile Commands
- **Backlog Operations**: Create-Backlog, Add-Story, Prioritize-Backlog, Split-Story
- **Story Workflow**: `work #N` and `done` triggers (per GitHub-Workflow.md)
- **Development**: Run-Tests, Show-Coverage
- **Release Lifecycle**: Create-Branch, Prepare-Release, Merge-Branch, Destroy-Branch
- **Special**: Pivot
- **Utility**: List-Commands, Help
### Metrics
- Story points completed, acceptance criteria pass rate, TDD cycle completion
### Integration Points
- Uses TDD cycles (RED-GREEN-REFACTOR)
- Requires appropriate System Instructions
- Can receive projects from Vibe evolution
- Terminal framework (can transition to IDPF-LTS for maintenance)
### When to Use
- Building products with evolving requirements
- Iterative delivery with regular feedback
- Feature prioritization based on user value
- Medium to large projects
---
## IDPF-Vibe Framework
**Location:** `IDPF-Vibe/`
**Core Framework Revision:** 4.0
**Type:** Exploratory Development -> Structured Evolution
### Purpose
Enable exploratory development without formal requirements, then evolve into structured TDD development when project direction crystallizes.
### Architecture
**Core:** Vibe-to-Structured-Core-Framework.md (Rev 4.0)
**Platform-Specific:**
- Desktop-Framework.md (Rev 2): Windows, macOS, Linux
- Mobile-Framework.md (Rev 3): iOS, Android, cross-platform
- Web-Framework.md (Rev 2): Frontend, backend, full-stack
- Game-Framework.md (Rev 1): Godot, Unity, Unreal, browser
- Embedded-Framework.md (Rev 1): Arduino, ESP32, STM32, simulator-based
- Newbie-Framework.md (Rev 1): Beginner-friendly with Skills integration
### Three-Phase Workflow
**Phase 1: VIBE PHASE** - Exploratory, rapid iteration. Natural language prompts (Try-This, Show-Me, Run-It). No formal requirements or testing required.
**Vibe Commands:** Vibe-Start, Try-This, Show-Me, That-Works, Undo-That, Run-It, Vibe-Status, Vibe-End, Ready-to-Structure, Vibe-Abandon
**Phase 2: EVOLUTION POINT** - Triggered by "Ready-to-Structure". Guides evolution to IDPF-Agile. Generates as-built Product Backlog with completed stories (DONE) + pending stories.
**Phase 3: AGILE PHASE** - Switch to IDPF-Agile. All new development follows TDD. Add tests for existing vibe-phase code.
### Two-Tool Workflow
- **ASSISTANT** (Claude chat): Provides numbered STEP instructions, plans features, reviews results
- **Claude Code** (execution): Receives complete instructions, executes commands, reports results
- **User**: Bridges both tools
### Platform Coverage
- **Desktop (Rev 2):** CLI, GUI, system utilities (Python, Ruby, JS/Node/Electron, C#, Rust)
- **Mobile (Rev 3):** iOS (Swift/SwiftUI), Android (Kotlin/Compose), React Native, Flutter
- **Web (Rev 2):** React, Vue, Svelte, Next.js, Express, Flask/Django, Rails
- **Game (Rev 1):** Godot, Unity, Unreal, Phaser, PixiJS, Three.js, terminal games
- **Embedded (Rev 1):** Arduino, ESP32, STM32, RPi; RTOS: FreeRTOS, Zephyr; Simulators: Wokwi, QEMU
- **Newbie (Rev 1):** Python (Flask) or Ruby (Sinatra), vanilla HTML/CSS/JS, SQLite; Skills: flask-setup, sinatra-setup, common-errors, sqlite-integration, beginner-testing
### Integration Points
- Requires Vibe Agent System Instructions (Core + Platform-specific)
- Evolves to IDPF-Agile
- Uses beginner Skills for Newbie framework
---
## IDPF-Testing Framework
**Location:** `IDPF-Testing/IDPF-Testing.md`
**Type:** Foundational Testing Framework
### Purpose
Common architecture, terminology, workflows, and integration patterns for all testing-focused development. Foundation that specialized testing frameworks extend.
**Core Principle:** "Test automation is software development."
### Testing Framework Architecture
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
**Embedded (No IDPF-Testing):** TDD, ATDD, BDD - Application repo with IDPF-Agile
**Separate (Uses IDPF-Testing):**
| Testing Type | Framework | Rationale |
|--------------|-----------|-----------|
| QA Automation | IDPF-QA-Automation | Independent codebase, different release cycle |
| Performance | IDPF-Performance | Specialized tooling, separate infrastructure |
| Security | IDPF-Security | Scan configs, vulnerability tracking, compliance |
| Chaos | IDPF-Chaos | Experiment definitions, separate from deployment |
| Contract Testing | IDPF-Contract-Testing | Cross-repo coordination between teams |
| Accessibility | IDPF-Accessibility | Flexible: Embedded OR Separate |
### Workflow Phases
`PLAN -> DESIGN -> DEVELOP -> EXECUTE -> REPORT`
1. **PLAN:** Create Test Plan, define scope, identify requirements coverage
2. **DESIGN:** Design test architecture, select tools, define patterns
3. **DEVELOP:** Write test code using TDD, build utilities, create test data
4. **EXECUTE:** Run tests (manual, CI/CD, scheduled)
5. **REPORT:** Analyze results, track metrics, report to stakeholders
### Test Plan Document
Location: `<test-repo>/PRD/TestPlans/`. Required: link to app repo, link to app PRD, requirement coverage mapping, version under test.
### Testing Session Commands
- **Planning:** Test-Plan-Start, Test-Plan-Review, Coverage-Check
- **Development:** Test-Dev-Start, Run-Tests, Generate-Report
- All IDPF-Agile commands apply
---
## IDPF-QA-Automation Framework
**Location:** `IDPF-QA-Automation/IDPF-QA-Automation.md`
**Extends:** IDPF-Testing
### Test Types
| Test Type | Scope | Execution Time |
|-----------|-------|----------------|
| **Smoke** | Critical paths | < 5 min |
| **Regression** | Full feature coverage | 30-60 min |
| **Cross-Browser** | Browser compatibility | Varies |
| **Mobile** | Native/hybrid apps | Varies |
| **Visual** | UI appearance | 10-30 min |
| **E2E** | Full user journeys | 15-45 min |
### Tool Ecosystem
**Web:** Selenium (enterprise, multi-lang), Playwright (modern web, multi-lang), Cypress (JS apps), WebDriverIO (flexible)
**Mobile:** Appium (cross-platform), XCUITest (iOS), Espresso (Android), Detox (React Native)
### Architecture
**Page Object Model (Primary):** One page object per page/screen, encapsulates locators, exposes actions, tests don't access locators directly.
### Selector Strategy
| Priority | Type | Example |
|----------|------|---------|
| 1 | data-testid | `[data-testid="login-btn"]` |
| 2 | ID | `#login-button` |
| 3 | Name | `[name="email"]` |
| 4 | ARIA | `[aria-label="Submit"]` |
| 5 | CSS Class | `.btn-primary` |
### GitHub Labels
| Label | Color | Description |
|-------|-------|-------------|
| `qa-automation` | `#FF991F` | QA automation work |
| `smoke-suite` | `#0E8A16` | Smoke tests |
| `regression-suite` | `#1D76DB` | Regression tests |
| `cross-browser` | `#5319E7` | Cross-browser testing |
| `mobile` | `#D93F0B` | Mobile automation |
| `flaky` | `#FBCA04` | Flaky test issues |
---
## IDPF-Performance Framework
**Location:** `IDPF-Performance/IDPF-Performance.md`
**Extends:** IDPF-Testing
### Performance Test Types
| Test Type | Purpose | Duration | Load Pattern |
|-----------|---------|----------|--------------|
| **Load** | Validate under expected load | 15-60 min | Steady state |
| **Stress** | Find breaking point | Until failure | Ramping up |
| **Endurance/Soak** | Detect memory leaks | 4-24 hours | Steady state |
| **Spike** | Handle sudden bursts | 15-30 min | Sudden spikes |
| **Capacity** | Determine max throughput | Varies | Incremental |
### Tool Selection
| Tool | Language | Best For |
|------|----------|----------|
| **k6** | JavaScript | Modern APIs, CI/CD |
| **JMeter** | Java/XML | Enterprise, GUI-based |
| **Gatling** | Scala/Java | High throughput |
| **Locust** | Python | Python teams, distributed |
| **Artillery** | JavaScript | Serverless, YAML config |
| **wrk/wrk2** | Lua | Lightweight HTTP benchmarking |
### Key Metrics
| Metric | Description | Good Values |
|--------|-------------|-------------|
| Response Time (p95) | 95th percentile | < 500ms |
| Response Time (p99) | 99th percentile | < 1000ms |
| Throughput | Requests per second | Depends on capacity |
| Error Rate | Failed / total | < 0.1% |
| Apdex | Application Performance Index | > 0.9 |
### GitHub Labels
`performance`, `load-test`, `stress-test`, `soak-test`, `capacity`
---
## IDPF-Security Framework
**Location:** `IDPF-Security/IDPF-Security.md`
**Extends:** IDPF-Testing
### Security Testing Types
| Test Type | When | What | Tools |
|-----------|------|------|-------|
| **SAST** | Development/CI | Source code analysis | SonarQube, Semgrep, CodeQL |
| **SCA** | Development/CI | Dependency vulnerabilities | Snyk, Dependabot, OWASP DC |
| **DAST** | Staging/Pre-prod | Running application | OWASP ZAP, Burp Suite, Nuclei |
| **IAST** | Testing | Runtime analysis | Contrast Security, Hdiv |
| **Penetration Testing** | Pre-release | Manual + automated | Manual + various |
| **Secret Scanning** | Development/CI | Credentials in code | GitLeaks, TruffleHog |
### OWASP Top 10 Coverage
| # | Vulnerability | Testing Approach | Tools |
|---|---------------|------------------|-------|
| A01 | Broken Access Control | DAST, Manual | ZAP, Burp |
| A02 | Cryptographic Failures | SAST, Manual | SonarQube, Semgrep |
| A03 | Injection | SAST, DAST | All |
| A04 | Insecure Design | Manual Review | Threat Modeling |
| A05 | Security Misconfiguration | DAST, Config Scan | ZAP, ScoutSuite |
| A06 | Vulnerable Components | SCA | Snyk, Dependabot |
| A07 | Auth Failures | DAST, Manual | ZAP, Burp |
| A08 | Data Integrity Failures | SAST, DAST | SonarQube, ZAP |
| A09 | Logging Failures | SAST, Manual | Code review |
| A10 | SSRF | DAST, Manual | ZAP, Burp |
### Vulnerability Management
| Severity | CVSS Score | Remediation SLA |
|----------|------------|-----------------|
| Critical | 9.0 - 10.0 | 24 hours |
| High | 7.0 - 8.9 | 7 days |
| Medium | 4.0 - 6.9 | 30 days |
| Low | 0.1 - 3.9 | 90 days |
**Workflow:** Discovery -> Triage -> Assignment -> Remediation -> Verification -> Closure
### CI/CD Integration
| Stage | Tool Type | Gate Criteria |
|-------|-----------|---------------|
| Commit | SAST | No critical/high issues |
| Commit | Secret Scan | No secrets detected |
| PR | SCA | No critical vulnerabilities |
| Pre-Deploy | DAST | No critical findings |
### GitHub Labels
`security`, `sast`, `dast`, `sca`, `pentest`, `vulnerability`, `compliance`
---
## IDPF-Accessibility Framework
**Location:** `IDPF-Accessibility/IDPF-Accessibility.md`
**Extends:** IDPF-Testing
### Repository Type: Flexible
| Model | Use Case | Location |
|-------|----------|----------|
| **Embedded** | Automated a11y checks in CI | Application repo (`tests/a11y/`) |
| **Separate** | Comprehensive audits, manual testing | Dedicated repo |
### Accessibility Testing Types
| Test Type | Automation | Coverage | Tools |
|-----------|------------|----------|-------|
| **Automated Scans** | Full | ~30-40% of issues | axe-core, Lighthouse, Pa11y |
| **Keyboard Testing** | Partial | Focus management | Manual + scripts |
| **Screen Reader** | Manual | Content, announcements | NVDA, JAWS, VoiceOver |
| **Color Contrast** | Full | Visual design | axe, Contrast checkers |
| **Cognitive** | Manual | Readability | Manual review |
| **Mobile a11y** | Partial | Touch targets | Accessibility Scanner |
### WCAG Conformance Levels
| Level | Description | Requirement |
|-------|-------------|-------------|
| **A** | Minimum accessibility | Must meet |
| **AA** | Standard accessibility | Typically required (legal) |
| **AAA** | Enhanced accessibility | Aspirational |
**Target WCAG 2.1 Level AA as baseline.**
### Tool Selection
**Automated:** axe-core (CI/CD), Lighthouse (audit), Pa11y (CLI), WAVE (visual)
**Assistive Tech:** NVDA (Windows, free), JAWS (Windows, commercial), VoiceOver (macOS/iOS), TalkBack (Android)
### Issue Severity
| Severity | Impact | SLA |
|----------|--------|-----|
| Critical | Blocker for AT users | Before release |
| Serious | Major barrier | 30 days |
| Moderate | Degraded experience | 60 days |
| Minor | Inconvenience | 90 days |
### GitHub Labels
`accessibility`, `wcag-a`, `wcag-aa`, `wcag-aaa`, `screen-reader`, `keyboard`
---
## IDPF-Chaos Framework
**Location:** `IDPF-Chaos/IDPF-Chaos.md`
**Extends:** IDPF-Testing
### Chaos Engineering Principles
| Principle | Description |
|-----------|-------------|
| Build a Hypothesis | Define expected behavior under failure |
| Vary Real-World Events | Inject realistic failures |
| Run in Production | Test real systems (safely) |
| Automate Experiments | Continuous validation |
| Minimize Blast Radius | Start small, limit impact |
### Fault Injection Types
| Category | Fault Type | Tools |
|----------|------------|-------|
| **Infrastructure** | Instance termination, AZ failure | Chaos Monkey, Gremlin, AWS FIS |
| **Network** | Latency, packet loss, DNS failure | tc, Toxiproxy, Gremlin |
| **Application** | Memory pressure, CPU stress, disk fill | stress-ng, Gremlin |
| **Dependency** | Service unavailable, slow dependency | Toxiproxy, Gremlin |
| **State** | Database failure, cache eviction | Custom scripts, Gremlin |
### Tool Ecosystem
| Tool | Platform | Best For |
|------|----------|----------|
| **Chaos Monkey** | AWS | Instance termination |
| **Gremlin** | Multi-cloud, K8s | Enterprise chaos |
| **LitmusChaos** | Kubernetes | K8s native |
| **Chaos Mesh** | Kubernetes | K8s native |
| **AWS FIS** | AWS | AWS infrastructure |
| **Toxiproxy** | Any | Network simulation |
### Experiment Workflow
`Hypothesis -> Observability Setup -> Design -> Approval -> Execute -> Analyze -> Fix/Expand`
### GitHub Labels
`chaos`, `experiment`, `gameday`, `infrastructure-fault`, `network-fault`, `finding`
---
## IDPF-Contract-Testing Framework
**Location:** `IDPF-Contract-Testing/IDPF-Contract-Testing.md`
**Extends:** IDPF-Testing
### Contract Testing Flow
`Consumer -> Generate Contract -> Publish to Broker -> Provider Fetches -> Verify -> Can-I-Deploy -> Deploy`
### Tool Selection
| Tool | Language | Best For |
|------|----------|----------|
| **Pact** | Multi-language | Most scenarios, mature broker |
| **Spring Cloud Contract** | Java/Kotlin | Spring ecosystem |
| **Specmatic** | Any (OpenAPI) | OpenAPI-based testing |
| **Dredd** | Any | API Blueprint/OpenAPI |
| **Hoverfly** | Multi-language | Service virtualization |
### Key Concepts
| Concept | Description |
|---------|-------------|
| Consumer | Service that calls an API |
| Provider | Service that exposes an API |
| Contract | Agreement on request/response format |
| Broker | Central repository for contracts |
| Can-I-Deploy | Deployment safety check |
| Provider State | Precondition setup for verification |
### GitHub Labels
`contract`, `consumer`, `provider`, `breaking-change`, `verification-failed`
---
## System Instructions
**Location:** `System-Instructions/`
### Domain Specialization Architecture
**Pattern:** Core + Domain Specialization
- **Core-Developer-Instructions.md (Rev 1.0)**: Foundation competencies for all developers
- **22 Domain Specialists**: Specialized expertise profiles
- **Domain-Selection-Guide.md (Rev 1.0)**: Guide for choosing specialist(s)
**Loading:** 1. Load Core (universal) 2. Load Domain specialist(s) for depth
**Core Competencies:** Version Control, Testing Fundamentals, Agile Development, Code Quality (SOLID/DRY/YAGNI/KISS), Design Patterns, Cross-Platform Awareness, Security Fundamentals (OWASP), Performance Basics
### Domain Specialists (22)
1. **Backend-Specialist** - Server-side, REST/GraphQL, auth, business logic (Python/Django/Flask/FastAPI, Node/Express/NestJS, Ruby/Rails, Java/Spring, Go)
2. **Frontend-Specialist** - React, Vue, Angular, Svelte; CSS architecture; state management; performance; accessibility
3. **DevOps-Engineer** - CI/CD, Docker, Kubernetes, IaC (Terraform/Pulumi), monitoring
4. **Database-Engineer** - Schema design, query optimization, replication, migrations (PostgreSQL, MySQL, MongoDB, Redis)
5. **API-Integration-Specialist** - REST, GraphQL, gRPC, WebSocket; microservices; API gateways; message brokers
6. **Security-Engineer** - OWASP, auth (OAuth/OIDC/SAML), cryptography, pentesting, compliance
7. **Platform-Engineer** - IDPs, service catalogs, golden paths, CI/CD templates, DevEx
8. **Mobile-Specialist** - iOS (Swift/SwiftUI), Android (Kotlin/Compose), React Native, Flutter
9. **Data-Engineer** - ETL/ELT (Airflow/Prefect/Dagster), Spark, data modeling, warehousing
10. **QA-Test-Engineer** - Test strategy, automation (Cypress/Playwright/Selenium), performance testing, TDD/BDD
11. **Cloud-Solutions-Architect** - System design, AWS/Azure/GCP, scalability, distributed systems, ADRs
12. **SRE-Specialist** - SLO/SLI/SLA, error budgets, observability, incident response, chaos engineering
13. **Embedded-Systems-Engineer** - C/C++, ARM/AVR/ESP32, RTOS, hardware protocols, low-level debugging
14. **ML-Engineer** - TensorFlow, PyTorch, scikit-learn; deep learning; MLOps; model optimization
15. **Performance-Engineer** - Profiling, load testing, frontend/backend performance, APM tools
16. **Accessibility-Specialist** - WCAG 2.1/2.2, assistive technology testing, auditing, legal compliance
17. **Full-Stack-Developer** - End-to-end development, holistic system thinking, API contract design
18. **Desktop-Application-Developer** - Cross-platform (Qt, GTK, Electron, Tauri), system integration, packaging
19. **Game-Developer** - Game engines (Unity, Unreal, Godot), game patterns, physics, multiplayer
20. **Graphics-Engineer** - Computer graphics, GPU programming, graphics APIs (Vulkan, DirectX, OpenGL, WebGPU)
21. **Systems-Programmer** - Low-level systems, OS internals, compilers, performance-critical code
22. **Technical-Writer** - Documentation engineering, docs-as-code, API docs, style guides
### Domain Selection Quick Reference
- **Full-Stack Web**: Core + Backend + Frontend + Database
- **Cloud-Native Microservices**: Core + API-Integration + DevOps + Cloud-Architect
- **Mobile App with Backend**: Core + Mobile + Backend
- **Data Platform**: Core + Data-Engineer + Database-Engineer + Cloud-Architect
- **Secure Production System**: Core + Backend + Security + SRE
### Vibe Agent System Instructions
- **Core (Rev 1.3):** Platform-agnostic behavioral instructions for Vibe workflow
- **Platform-Specific:** Desktop, Web, Mobile, Game, Embedded, Newbie
- Both Core + Platform must be loaded together
### Critical Requirement
System Instructions are **REQUIRED** for all framework operation.
---
## Skills
**Location:** `Skills/`
**Total Skills:** 34 (6 TDD/BDD, 1 PRD, 2 code quality, 1 code analysis, 2 beginner setup, 3 beginner support, 2 database, 2 advanced testing, 3 architecture, 1 DevOps, 2 testing/browser, 1 desktop, 1 diagrams, 4 deployment platforms, 1 SEO, 1 privacy compliance, 2 platform)
### TDD Skills
- **tdd-red-phase** - RED phase: writing failing tests, verifying failures. Used at `work #N`.
- **tdd-green-phase** - GREEN phase: minimal implementation. After RED.
- **tdd-refactor-phase** - REFACTOR phase: code improvement. After GREEN.
- **tdd-failure-recovery** - Handle unexpected test behaviors, recovery, rollback.
- **test-writing-patterns** (Standalone) - Test structure, AAA, Given-When-Then, test doubles.
- **bdd-writing** (Standalone) - BDD/Gherkin syntax, feature files, step definitions.
### PRD Skills
- **create-prd** - Transform proposals into PRDs. Supersedes IDPF-PRD.
### Code Quality Skills
- **anti-pattern-analysis** - Anti-pattern detection for code review, tech debt.
### Beginner Skills
- **flask-setup**, **sinatra-setup** - Environment setup
- **common-errors**, **sqlite-integration**, **beginner-testing** - Support
### Skill Characteristics
- Packaged as distributable units (SKILL.md + resources/ + LICENSE.txt)
- Copy/paste Claude Code instruction blocks
- Verification checklists and resource files
---
## Assistant Guidelines
**Location:** `Assistant/`
**Total:** 2 documents
### Anti-Hallucination Rules for Software Development
**Core:** Accuracy over helpfulness. Uncertainty over invention. Verification over assumption.
- NEVER invent: API methods, class names, config syntax, command flags, file paths, dependencies
- NEVER assume: OS/platform, available tools, project structure, versions, environment
- Information hierarchy: User files > Official docs > Training data > Logical inference
- Confidence indicators: High/Medium/Low/None
### Anti-Hallucination Rules for Skill Creation
- Never invent content not in source material
- Preserve exact wording from source
- Only create resource files for content in source
---
## Rules Auto-Loading (v2.9+)
**Location:** `.claude/rules/`
Auto-loads all `.md` files at session start. Compact-resilient. ~47% fewer tokens at startup.
| File | Content | Source |
|------|---------|--------|
| `01-anti-hallucination.md` | Framework development quality rules | `Assistant/Anti-Hallucination-Rules-for-Framework-Development.md` |
| `02-github-workflow.md` | GitHub issue management | `Reference/GitHub-Workflow.md` |
| `03-session-startup.md` | Startup procedure | Generated |
Files numbered for load order.
---
## Framework Transition Matrix
### Valid Transitions
| From | To | When |
|------|-----|------|
| **Vibe** | **Agile** | Exploration complete, feature set identified, ready for story-driven development |
**Invalid:** Agile -> Vibe (quality standards never decrease)
### Transition Principles
**Preserved:** All code/tests, git history, TDD methodology, architecture, dependencies
**Changes:** Documentation format, workflow structure, planning granularity, progress tracking
---
## Framework Integration Architecture
### Dependency Hierarchy
```
System Instructions (REQUIRED - WHO + EXPERTISE)
    |
Framework Selection (WHAT process)
    |
Skills (TOOLS for capabilities)
    |
Assistant Guidelines (HOW WELL - quality control)
```
### Selection Criteria
**IDPF-Agile:** Defined/evolving requirements, iterative delivery, structured backlog, any project size
**IDPF-Vibe:** Unclear requirements, exploration first, prototyping, will evolve to Agile
### Common Elements
- **TDD:** RED-GREEN-REFACTOR across all frameworks
- **Claude Code Communication:** Single code block, numbered STEP format, exact paths
- **Context Preservation:** Cumulative awareness, session continuity
- **Git Workflows:** GitFlow, GitHub Flow, trunk-based; Conventional Commits
---
## Framework Ecosystem Summary
**Total Components:**
- **2 Development Frameworks**: IDPF-Agile, IDPF-Vibe (7 variants)
- **Testing Frameworks**: IDPF-Testing (foundation) + QA-Automation + Performance + Security + Accessibility + Chaos + Contract-Testing
- **System Instructions**: 1 Core + 22 Domain Specialists + 1 Selection Guide + 1 Legacy + Vibe Agent (Core + 6 platforms)
- **34 Skills**: 6 TDD/BDD, 1 PRD, 2 code quality, 1 code analysis, 2 beginner setup, 3 beginner support, 2 database, 2 advanced testing, 3 architecture, 1 DevOps, 2 testing/browser, 1 desktop, 1 diagrams, 4 deployment, 1 SEO, 1 privacy, 2 platform
- **2 Assistant Guideline Documents**
**Integration Model:**
- **System Instructions** provide identity + expertise (Core + 22 Domain Specialists)
- **Frameworks** provide methodology (Agile: stories/TDD/backlog; Vibe: exploratory -> Agile; Testing-Core: foundation for test repos)
- **Skills** provide reusable capabilities (PRD, TDD phases, beginner setup/support)
- **Assistant Guidelines** provide quality control (anti-hallucination, accuracy)
**Framework Selection Matrix:**
| Project Type | Starting Point | Evolution Path | Target Outcome |
|--------------|---------------|----------------|----------------|
| Defined requirements | IDPF-Agile | Terminal | Story-driven delivery with TDD |
| Unclear requirements | IDPF-Vibe | Vibe to Agile | Discovered requirements + TDD |
| Need requirements | `/create-prd` | PRD to Agile | Implementation-ready PRD |
| Separate test repo | IDPF-Testing | Agile for test dev | Test automation codebase |
---
## Document Maintenance
- Increment version for any content change
- Update after framework revisions, new skills, system instruction updates, transition changes
- Verify file paths, version numbers, integration patterns, transition matrix accuracy
---
