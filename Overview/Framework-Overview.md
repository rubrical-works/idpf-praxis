**Framework Overview**
**Version:** v0.85.0
Comprehensive reference for AI assistants and framework development.
**Core Principle:** System Instructions define WHO; Frameworks define WHAT process; Skills provide reusable capabilities; Assistant Guidelines ensure quality.
---
**PRD Creation (create-prd Skill)**
> IDPF-PRD deprecated in v0.24; replaced by `create-prd` skill.
**Location:** `Skills/create-prd/SKILL.md` | **Command:** `/create-prd`
| Mode | Command | Purpose |
|------|---------|---------|
| **Promote** | `/create-prd Proposal/Feature.md` | Transform proposal to PRD |
| **Extract** | `/create-prd extract` | Extract PRD from codebase |
| **Interactive** | `/create-prd` | Prompt for mode selection |
**Features:** Charter validation, dynamic questions, story transformation, priority validation, UML diagrams, single session
**Inputs:** `Proposal/*.md`, `Inception/` artifacts, `CHARTER.md`
**Outputs:** `PRD/{name}/PRD-{name}.md` with optional `Diagrams/`
**Downstream:** `Create-Backlog` generates GitHub issues from PRD
---
**IDPF-Agile Framework**
**Location:** `IDPF-Agile/` (Agile-Core.md, Agile-Commands.md, Agile-Best-Practices.md, Agile-Templates.md, Agile-Transitions.md)
**Type:** Story-Driven Development with TDD Cycles
**Terminology:**
- Product Backlog: All user stories (GitHub issues)
- User Story: Feature from user perspective with acceptance criteria
- Story Points: Fibonacci estimates (1, 2, 3, 5, 8, 13, 21)
- Epic: Large feature area with multiple stories
- Definition of Done (DoD): Completion checklist
**Workflow:** Product Backlog Creation > Story Selection > Story Development (TDD RED-GREEN-REFACTOR) > Story Review > Done
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
- **Backlog**: Create-Backlog, Add-Story, Prioritize-Backlog, Split-Story
- **Story Workflow**: `work #N` and `done` triggers (per GitHub-Workflow.md)
- **Development**: Run-Tests, Show-Coverage
- **Release**: Create-Branch, Prepare-Release, Merge-Branch, Destroy-Branch
- **Special**: Pivot | **Utility**: List-Commands, Help
**Metrics:** Story points completed, AC pass rate, TDD cycle completion
**Integration:** Uses TDD cycles, requires System Instructions, receives Vibe evolution projects, terminal framework (can transition to IDPF-LTS)
**When to Use:** Evolving requirements, iterative delivery, feature prioritization, medium-large projects, well-defined or PRD-emerging requirements
---
**IDPF-Vibe Framework**
**Location:** `IDPF-Vibe/` | **Core Rev:** 4.0 | **Type:** Exploratory Development > Structured Evolution
**Architecture:**
- Vibe-to-Structured-Core-Framework.md (Rev 4.0): Platform-agnostic
- Platform-specific: Desktop (Rev 2), Mobile (Rev 3), Web (Rev 2), Game (Rev 1), Embedded (Rev 1), Newbie (Rev 1)
**Phase 1: VIBE** - Exploratory rapid iteration, no formal requirements
**Commands:** Vibe-Start, Try-This, Show-Me, That-Works, Undo-That, Run-It, Vibe-Status, Vibe-End, Ready-to-Structure, Vibe-Abandon
**Phase 2: EVOLUTION** - Triggered by "Ready-to-Structure"; guides evolution to IDPF-Agile
- Generates as-built Product Backlog with completed stories (DONE) + pending stories
**Phase 3: AGILE** - Switch to IDPF-Agile, TDD for all new development, add tests for vibe-phase code
**Two-Tool Workflow:**
- ASSISTANT (Claude chat): Numbered STEP instructions, plans, reviews
- Claude Code: Executes commands/changes, reports results
- User: Bridges both tools
**Platform Coverage:**
| Platform | Technologies |
|----------|-------------|
| **Desktop** (Rev 2) | Python, Ruby, JS (Node/Electron), C#, Rust |
| **Mobile** (Rev 3) | Swift/SwiftUI, Kotlin/Compose, React Native, Flutter |
| **Web** (Rev 2) | React, Vue, Svelte; Express, Flask, Django, Rails; Next.js, Remix |
| **Game** (Rev 1) | Godot, Unity, Unreal, Phaser, PixiJS, Three.js |
| **Embedded** (Rev 1) | Arduino, ESP32, STM32, RPi; FreeRTOS, Zephyr; Wokwi, QEMU |
| **Newbie** (Rev 1) | Python (Flask) or Ruby (Sinatra), vanilla HTML/CSS/JS, SQLite |
**Evolution Documentation:**
```markdown
# Product Backlog: [Project]
**Evolution Note:** Evolved from Vibe Phase exploration to Agile
## As-Built Summary
**Status:** Ready for Story Development | Project Complete
## Completed Features (Vibe Phase)
### Story 0.1: [Feature] DONE
**As a** [user] **I want** [what was built] **So that** [benefit]
**Acceptance Criteria:** - [x] Criterion - already met
**Story Points:** [retrospective estimate] **Status:** Done (Vibe Phase)
## Epic: [Feature Area] (if pending work exists)
### Story 1.1: [Pending Story]
```
---
**Domain Knowledge Libraries**
**Location:** `Domains/DOMAINS.md` | **Type:** Specialized Knowledge Lenses for Reviews
Domain-specific review criteria, guides, and templates loaded on demand via `--with` flag. Not process frameworks.
```
Domains/
    review-criteria/        Domain-specific review questions
        security.md, accessibility.md, performance.md,
        chaos.md, contract-testing.md, qa-automation.md
    Guides/                 Testing guides and references
    Templates/              Test plan templates
```
**Domain Frameworks:**
| Domain | Framework Directory | Scope |
|--------|-------------------|-------|
| Accessibility | `Domains/Accessibility/` | axe, Lighthouse, Pa11y |
| API-Design | `Domains/API-Design/` | REST/GraphQL API design conventions |
| Chaos | `Domains/Chaos/` | Chaos Monkey, Gremlin, LitmusChaos |
| Contract Testing | `Domains/Contract-Testing/` | Pact, Spring Cloud Contract |
| i18n | `Domains/i18n/` | Internationalization and localization |
| Observability | `Domains/Observability/` | Logging, tracing, metrics, alerting |
| Performance | `Domains/Performance/` | k6, JMeter, Gatling, Locust |
| Privacy | `Domains/Privacy/` | Consent, cookies, GDPR/CCPA compliance |
| QA Automation | `Domains/QA-Automation/` | Selenium, Playwright, Cypress, Appium |
| Security | `Domains/Security/` | OWASP ZAP, Burp Suite, SAST/DAST |
| SEO | `Domains/SEO/` | Technical SEO and structured data |
**Embedded vs Separate Repository:**
- **Embedded** (application repo with IDPF-Agile): TDD, ATDD, BDD
- **Separate** (dedicated repo with domain frameworks): QA Automation, Performance, Security, Chaos, Contract Testing
- **Flexible**: Accessibility (either model)
**Integration:** Review criteria loaded by `/review-issue`, `/review-proposal`, `/review-prd` via `--with` flag. Extension registry at `.claude/metadata/review-extensions.json`. Domain frameworks extend IDPF-Agile.
---
**QA-Automation Domain**
**Location:** `Domains/QA-Automation/QA-Automation.md` | **Type:** UI & End-to-End Test Automation
| Test Type | Scope | Execution Time |
|-----------|-------|----------------|
| **Smoke Tests** | Critical paths | < 5 min |
| **Regression Tests** | Full coverage | 30-60 min |
| **Cross-Browser** | Browser compat | Varies |
| **Mobile Tests** | Native/hybrid | Varies |
| **Visual Tests** | UI appearance | 10-30 min |
| **E2E Tests** | Full journeys | 15-45 min |
**Web Automation Tools:**
| Tool | Best For | Languages |
|------|----------|-----------|
| Selenium | Enterprise, cross-browser | Java, Python, C#, JS, Ruby |
| Playwright | Modern web apps | JS/TS, Python, C#, Java |
| Cypress | JavaScript apps | JS/TS |
| WebDriverIO | Flexible | JS/TS |
**Mobile Automation Tools:**
| Tool | Platform | Best For |
|------|----------|----------|
| Appium | iOS, Android | Cross-platform |
| XCUITest | iOS | Native iOS |
| Espresso | Android | Native Android |
| Detox | iOS, Android | React Native |
**Page Object Model (Primary):** One page object per page/screen, encapsulates locators, exposes actions, tests don't access locators directly.
```
src/
  pages/           # Page Objects
  components/      # Reusable UI components
  tests/
    smoke/ regression/ e2e/
  fixtures/        # Test data
  utils/           # Helpers
  config/          # Environment configs
```
**Selector Priority:** 1. data-testid > 2. ID > 3. Name > 4. ARIA > 5. CSS Class
**Labels:** `qa-automation`, `smoke-suite`, `regression-suite`, `cross-browser`, `mobile`, `flaky`
---
**Performance Domain**
**Location:** `Domains/Performance/Performance.md` | **Type:** Performance Testing
| Test Type | Purpose | Duration | Load Pattern |
|-----------|---------|----------|--------------|
| **Load** | Expected load | 15-60 min | Steady |
| **Stress** | Breaking point | Until failure | Ramping |
| **Endurance/Soak** | Memory leaks | 4-24 hours | Steady |
| **Spike** | Sudden bursts | 15-30 min | Spikes |
| **Capacity** | Max throughput | Varies | Incremental |
**Tools:**
| Tool | Language | Best For |
|------|----------|----------|
| k6 | JavaScript | Modern APIs, CI/CD |
| JMeter | Java/XML | Enterprise, GUI |
| Gatling | Scala/Java | High throughput |
| Locust | Python | Distributed testing |
| Artillery | JavaScript | Serverless, YAML |
| wrk/wrk2 | Lua | HTTP benchmarking |
**Key Metrics:** p95 < 500ms, p99 < 1000ms, Error Rate < 0.1%, Apdex > 0.9
**Labels:** `performance`, `load-test`, `stress-test`, `soak-test`, `capacity`
---
**Security Domain**
**Location:** `Domains/Security/Security.md` | **Type:** Security Testing
| Test Type | When | Tools |
|-----------|------|-------|
| **SAST** | Dev/CI | SonarQube, Semgrep, CodeQL |
| **SCA** | Dev/CI | Snyk, Dependabot, OWASP Dep-Check |
| **DAST** | Staging | OWASP ZAP, Burp Suite, Nuclei |
| **IAST** | Testing | Contrast Security, Hdiv |
| **Penetration** | Pre-release | Manual + tools |
| **Secret Scanning** | Dev/CI | GitLeaks, TruffleHog |
**OWASP Top 10:** A01 Broken Access Control, A02 Cryptographic Failures, A03 Injection, A04 Insecure Design, A05 Security Misconfiguration, A06 Vulnerable Components, A07 Auth Failures, A08 Data Integrity, A09 Logging Failures, A10 SSRF
**Vulnerability SLAs:** Critical (9.0-10.0): 24h | High (7.0-8.9): 7d | Medium (4.0-6.9): 30d | Low (0.1-3.9): 90d
**Workflow:** Discovery > Triage > Assignment > Remediation > Verification > Closure
**CI/CD Gates:** Commit: SAST + Secret Scan | PR: SCA | Pre-Deploy: DAST
**Labels:** `security`, `sast`, `dast`, `sca`, `pentest`, `vulnerability`, `compliance`
---
**Accessibility Domain**
**Location:** `Domains/Accessibility/Accessibility.md` | **Type:** Accessibility Testing
**Repository:** Flexible - Embedded (`tests/a11y/`) or Separate repo
| Test Type | Automation | Coverage | Tools |
|-----------|------------|----------|-------|
| **Automated Scans** | Full | ~30-40% | axe-core, Lighthouse, Pa11y |
| **Keyboard Testing** | Partial | Focus mgmt | Manual + scripts |
| **Screen Reader** | Manual | Content | NVDA, JAWS, VoiceOver |
| **Color Contrast** | Full | Visual | axe, contrast checkers |
| **Cognitive** | Manual | Readability | Manual review |
| **Mobile a11y** | Partial | Touch targets | Accessibility Scanner |
**WCAG Conformance:** A (minimum, must meet) | AA (standard, typically required) | AAA (enhanced, aspirational). Target WCAG 2.1 Level AA as baseline.
**Automated Tools:** axe-core (CI/CD), Lighthouse (Chrome/CI), Pa11y (CLI), WAVE (browser)
**Assistive Tech:** NVDA (Win, free), JAWS (Win, commercial), VoiceOver (macOS/iOS), TalkBack (Android)
**Severity SLAs:** Critical: before release | Serious: 30d | Moderate: 60d | Minor: 90d
**Labels:** `accessibility`, `wcag-a`, `wcag-aa`, `wcag-aaa`, `screen-reader`, `keyboard`
---
**Chaos Domain**
**Location:** `Domains/Chaos/Chaos.md` | **Type:** Chaos Engineering
**Principles:** Build hypothesis, vary real-world events, run in production (safely), automate experiments, minimize blast radius
**Fault Injection Types:**
| Category | Fault Type | Tools |
|----------|------------|-------|
| **Infrastructure** | Instance termination, AZ failure | Chaos Monkey, Gremlin, AWS FIS |
| **Network** | Latency, packet loss, DNS | tc, Toxiproxy, Gremlin |
| **Application** | Memory/CPU/disk pressure | stress-ng, Gremlin |
| **Dependency** | Service unavailable/slow | Toxiproxy, Gremlin |
| **State** | DB failure, cache eviction | Custom scripts, Gremlin |
**Tools:** Chaos Monkey (AWS), Gremlin (multi-cloud/K8s), LitmusChaos (K8s), Chaos Mesh (K8s), AWS FIS (AWS), Toxiproxy (network)
**Workflow:** Hypothesis > Observability Setup > Design > Approval > Execute > Analyze > Fix/Expand
**Templates:** Chaos-Experiment-Plan.md, GameDay-Template.md
**Labels:** `chaos`, `experiment`, `gameday`, `infrastructure-fault`, `network-fault`, `finding`
---
**Contract-Testing Domain**
**Location:** `Domains/Contract-Testing/Contract-Testing.md` | **Type:** API Contract Testing
**Flow:** Consumer > Generate Contract > Publish to Broker > Provider Fetches > Verify > Can-I-Deploy > Deploy
**Tools:**
| Tool | Language | Best For |
|------|----------|----------|
| Pact | Multi-language | Most scenarios, mature broker |
| Spring Cloud Contract | Java/Kotlin | Spring ecosystem |
| Specmatic | Any (OpenAPI) | OpenAPI-based |
| Dredd | Any | API Blueprint/OpenAPI |
| Hoverfly | Multi-language | Service virtualization |
**Key Concepts:** Consumer (caller), Provider (API exposer), Contract (request/response agreement), Broker (central repo), Can-I-Deploy (safety check), Provider State (precondition setup)
**Labels:** `contract`, `consumer`, `provider`, `breaking-change`, `verification-failed`
---
**System Instructions**
**Location:** `System-Instructions/`
System Instructions are **REQUIRED** for all framework operation. Frameworks define process; System Instructions define identity and expertise.
**Domain Specialization Architecture:**
- 25 Domain Specialists loaded at session startup via `domainSpecialist` in `framework-config.json`
- Resolves in `System-Instructions/Domain/Base/` or `Domain/Pack/`
**Domain Specialists (25):**
| # | Specialist | Key Technologies/Focus |
|---|-----------|----------------------|
| 1 | Backend | Django, Flask, FastAPI, Express, NestJS, Rails, Spring, Go |
| 2 | Frontend | React, Vue, Angular, Svelte; CSS architecture; state management; WCAG |
| 3 | DevOps-Engineer | CI/CD, Docker, K8s, IaC (Terraform/Pulumi), monitoring |
| 4 | Database-Engineer | Schema design, query optimization, replication, migrations |
| 5 | API-Integration | REST, GraphQL, gRPC, WebSocket; microservices; message brokers |
| 6 | Security-Engineer | OWASP, OAuth/OIDC, cryptography, pentesting, compliance |
| 7 | Platform-Engineer | IDPs, service catalogs, golden paths, DevEx |
| 8 | Mobile | Swift/SwiftUI, Kotlin/Compose, React Native, Flutter |
| 9 | Data-Engineer | ETL (Airflow/Prefect/Dagster), Spark, data warehousing |
| 10 | QA-Test-Engineer | Test strategy, automation (Cypress/Playwright/Selenium), TDD/BDD |
| 11 | Cloud-Solutions-Architect | System design, AWS/Azure/GCP, scalability, ADRs |
| 12 | SRE | SLO/SLI/SLA, error budgets, observability, incident response |
| 13 | Embedded-Systems | C/C++, ARM Cortex-M, RTOS, hardware protocols |
| 14 | ML-Engineer | TensorFlow, PyTorch, deep learning, MLOps |
| 15 | Performance-Engineer | Profiling, load testing, Core Web Vitals, APM |
| 16 | Accessibility | WCAG 2.1/2.2, assistive tech, auditing, legal compliance |
| 17 | Full-Stack | End-to-end development, holistic system thinking |
| 18 | Desktop-Application | Qt, GTK, Electron, Tauri; packaging/distribution |
| 19 | Game-Developer | Unity, Unreal, Godot; game patterns; multiplayer |
| 20 | Graphics-Engineer | Vulkan, DirectX, OpenGL, Metal, WebGPU; rendering |
| 21 | Systems-Programmer | Low-level systems, OS internals, compilers, perf-critical code |
| 22 | Technical-Writer | Docs-as-code, API docs, documentation generators |
| 23 | Content-Strategist | Messaging frameworks, audience segmentation, editorial workflows, voice/tone |
| 24 | UX-Designer | Layout, visual hierarchy, color theory, typography, responsive design, interaction |
| 25 | Brand-Strategist | Brand identity, visual consistency, style guides, brand architecture, governance |
**Domain Selection Quick Reference:**
- Full-Stack Web: Backend + Frontend + Database
- Cloud-Native Microservices: API-Integration + DevOps + Cloud-Architect
- Mobile App with Backend: Mobile + Backend
- Data Platform: Data-Engineer + Database-Engineer + Cloud-Architect
- Secure Production: Backend + Security + SRE
**Decision Tree:** APIs > Backend | UIs > Frontend | Infrastructure > DevOps/Platform | Systems design > Cloud-Architect | Reliability > SRE | Data > Data+Database | Mobile > Mobile | Security > Security | Performance > Performance | ML > ML | Embedded > Embedded | APIs > API-Integration | Testing > QA-Test | Accessibility > Accessibility | Full-stack > Full-Stack | Desktop > Desktop-App | Games > Game | Graphics > Graphics | Systems > Systems-Programmer | Docs > Technical-Writer
**Vibe Agent System Instructions:**
- Vibe-Agent-Core-Instructions.md (Rev 1.3): Platform-agnostic behavioral instructions
- Platform-specific: Desktop, Web, Mobile, Game, Embedded, Newbie
- Core + platform-specific must be loaded together
---
**Skills**
**Location:** `Skills/` | **Total:** 38
**TDD Skills (Experienced):**
- **tdd-red-phase**: RED phase - writing failing tests, verifying failures
- **tdd-green-phase**: GREEN phase - minimal implementation to pass tests
- **tdd-refactor-phase**: REFACTOR phase - improvement while maintaining green
- **tdd-failure-recovery**: Unexpected test behaviors, recovery, rollback
- **test-writing-patterns** (Standalone): AAA pattern, test doubles, assertions
- **bdd-writing** (Standalone): Gherkin syntax, feature files, step definitions (Cucumber, pytest-bdd, SpecFlow, Behave, RSpec)
**PRD Skills:**
- **create-prd**: Transform proposals to PRDs, charter alignment, user story generation (supersedes IDPF-PRD)
**Code Quality Skills:**
- **anti-pattern-analysis**: Design/OOP patterns, code smells, architecture issues, language-specific guides
**Beginner Setup:**
- **flask-setup**: Python Flask environment setup
- **sinatra-setup**: Ruby Sinatra environment setup
**Beginner Support:**
- **common-errors**: Troubleshooting reference (Flask, Sinatra, general)
- **sqlite-integration**: Database integration guidance
- **beginner-testing**: Testing introduction, simple TDD cycle
**Characteristics:**
- Packaged as distributable units (SKILL.md + resources/ + LICENSE.txt)
- Provide copy/paste Claude Code instruction blocks (NOT manual instructions)
- Include verification checklists and resource files
- Beginner: Detailed explanations with language-specific examples
- TDD: Framework-agnostic, experienced developer focus
---
**Assistant Guidelines**
**Location:** `Assistant/` | **Total:** 2 documents
**Anti-Hallucination Rules for Software Development:**
- **Core:** Accuracy over helpfulness. Uncertainty over invention. Verification over assumption.
- **Never invent:** API methods, class names, config syntax, command flags, file paths, library deps
- **Never assume:** OS/platform, available tools, project structure, versions, environment
- **Source hierarchy:** User files > Official docs > Training data > Logical inference
- **Confidence levels:** High/Medium/Low/No confidence
- **Auto-trigger web search:** "current/latest" anything, recent releases, uncertain syntax
- **File operations:** Always READ before editing, verify paths, enumerate before bulk ops
**Anti-Hallucination Rules for Skill Creation:** Moved to `idpf-praxis-skills` repo (removed from `idpf-praxis-dev` in #2296; skill source development is out of scope per charter).
---
**Rules Auto-Loading (v2.9+)**
**Location:** `.claude/rules/`
Claude Code auto-loads all `.md` files from `.claude/rules/` at session start. Persists after compaction.
| File | Content | Source |
|------|---------|--------|
| `01-anti-hallucination.md` | Framework dev quality | `Assistant/Anti-Hallucination-Rules-for-Framework-Development.md` |
| `02-github-workflow.md` | GitHub issue management | `Reference/GitHub-Workflow.md` |
| `03-startup.md` | Startup procedure | `Reference/Session-Startup-Instructions.md` |
**Source of Truth:** `Assistant/` and `Reference/` are authoritative; rules built at release time. Naming: `01-`, `02-`, `03-` for load order.
---
**Framework Transition Matrix**
```
VIBE ---------> AGILE (terminal)
exploration     stories + TDD + backlog
```
| From | To | When |
|------|----|------|
| **Vibe** | **Agile** | Exploration complete, feature set identified, ready for story-driven development |
**Invalid:** Agile > Vibe (quality standards never decrease)
**Preserved across transitions:** Code, tests, git history, TDD methodology, architecture, dependencies
**Changes:** Documentation format, workflow structure, planning granularity, progress tracking
**Transition steps:**
1. Complete current exploration
2. Ensure tests pass (100% green)
3. Commit all WIP
4. Create transition documentation
5. Generate product backlog from vibe exploration
6. Communicate to stakeholders (if applicable)
---
**Framework Integration Architecture**
```
System Instructions (REQUIRED - WHO + EXPERTISE)
    |
Framework Selection (WHAT process)
    |
Skills (TOOLS for capabilities)
    |
Assistant Guidelines (HOW WELL - quality)
```
**Use IDPF-Agile:** Defined/evolving requirements, iterative delivery, feature prioritization, any size, structured backlog needed
**Use IDPF-Vibe:** Unclear requirements, exploration first, prototyping, will evolve to Agile
**Common Elements:**
- TDD (RED-GREEN-REFACTOR) across all frameworks
- Single code block format (numbered STEPs), complete runnable code
- Context preservation across session
- Git workflows (GitFlow, GitHub Flow, trunk-based)
---
**Framework Ecosystem Summary**
- **2 Process Frameworks**: IDPF-Agile, IDPF-Vibe (7 variants)
- **11 Domain Libraries**: Accessibility, API-Design, Chaos, Contract-Testing, i18n, Observability, Performance, Privacy, QA-Automation, Security, SEO
- **System Instructions**: 1 Core + 25 Domain Specialists + 1 Domain Selection Guide + 1 Legacy + Vibe Agent (Core + 6 platforms)
- **38 Skills**: 6 TDD/BDD, 2 code quality, 1 code analysis, 2 beginner setup, 3 beginner support, 2 database, 2 advanced testing, 3 architecture, 2 DevOps, 2 testing/browser, 2 desktop, 1 diagrams, 4 deployment, 1 SEO, 1 privacy, 2 platform, 1 i18n, 1 test scaffolding
- **2 Assistant Guidelines**: Software dev (with file operations), Skill creation
> IDPF-PRD deprecated v0.24; requirements engineering uses `create-prd` skill.
**Integration Model:**
- **System Instructions** = WHO + DOMAIN (25 specialists, loaded from `framework-config.json`)
- **Frameworks** = WHAT (Agile: stories/TDD/backlog; Vibe: exploratory > Agile; Domains: review knowledge)
- **Skills** = TOOLS (`/create-prd`, TDD phases, beginner setup/support)
- **Assistant Guidelines** = HOW WELL (anti-hallucination, accuracy, verification)
**Critical Success Factors:**
1. System Instructions MUST be loaded before framework use
2. Single code block format strictly enforced
3. TDD discipline maintained throughout
4. Context preservation across session
5. Anti-hallucination rules applied continuously
6. Framework transitions follow valid paths only
**Selection Matrix:**
| Project Type | Starting Point | Evolution Path | Outcome |
|--------------|---------------|----------------|---------|
| Defined requirements | IDPF-Agile | Terminal | Story-driven delivery + TDD |
| Unclear requirements | IDPF-Vibe | Vibe > Agile | Discovered requirements + TDD |
| Need requirements | `/create-prd` | PRD > Agile | Implementation-ready PRD |
| Separate test repo | Domains/ + IDPF-* | Agile for test dev | Test automation codebase |
---
**Document Maintenance**
- Increment version for any content change; document in git commits and CHANGELOG.md
- Update after: framework revisions, new skills, SI updates, transition changes
- Verify: file paths valid, version numbers match source, integration patterns correct, transition matrix accurate
- Process: Read all framework dirs > extract revisions/features > update > increment version > commit
