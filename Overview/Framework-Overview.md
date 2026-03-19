# Framework Overview
**Version:** v0.66.3

**Purpose:** Comprehensive reference for AI assistants (Claude/Claude Code) and framework development
**Change History:** See git log and CHANGELOG.md

## Framework Purpose and Scope

This framework ecosystem supports AI-assisted software development across multiple methodologies and platforms. System Instructions are **REQUIRED** for all framework operation.

**Core Principle:** System Instructions define WHO the assistant is; Frameworks define WHAT process to follow; Skills provide reusable capabilities; Assistant Guidelines ensure accuracy and quality.

## PRD Creation (create-prd Skill)

> **Note:** The `IDPF-PRD` framework was deprecated in v0.24 and replaced by the `create-prd` skill.

**Skill Location:** `Skills/create-prd/SKILL.md`
**Command:** `/create-prd`
**Type:** Requirements Engineering & PRD Generation

### Purpose

Transform proposals into implementation-ready PRDs or extract PRDs from existing codebases. The `create-prd` skill provides a streamlined, conversational workflow compared to the deprecated multi-phase IDPF-PRD framework.

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
- **Single Session:** Complete PRD in one conversation

### Integration Points

- **Inputs:** `Proposal/*.md`, `Inception/` artifacts, `CHARTER.md`
- **Outputs:** `PRD/{name}/PRD-{name}.md` with optional `Diagrams/`
- **Downstream:** `Create-Backlog` generates GitHub issues from PRD
- **Related:** `codebase-analysis` skill for extraction mode

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

### Integration Points
- Uses TDD cycles (RED-GREEN-REFACTOR)
- Requires appropriate System Instructions
- Can receive projects from Vibe evolution
- Follows same Claude Code communication protocol
- Terminal framework (can transition to IDPF-LTS for maintenance)

### When to Use
- Building products with evolving requirements
- Iterative delivery with regular feedback
- Feature prioritization based on user value
- Medium to large projects
- Requirements are well-defined or will emerge from PRD process

## IDPF-Vibe Framework

**Location:** `IDPF-Vibe/`
**Core Framework Revision:** 4.0
**Type:** Exploratory Development → Structured Evolution

### Purpose
Enable exploratory development phase without formal requirements, then evolve into structured TDD development (Structured or Agile) when project direction crystallizes.

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
- ASSISTANT guides evolution to IDPF-Agile

**Evolution to IDPF-Agile:**
- Best when: Feature set identified, need structured backlog/prioritization, team collaboration
- Generates: As-built Product Backlog with completed stories (DONE)
- Documents: Vibe features as Story 0.x (completed) + Pending stories (backlog)
- Status: "Ready for Story Development" or "No pending stories - project complete"

**Phase 3: AGILE PHASE**
- Switch to IDPF-Agile framework
- All new development follows TDD (RED-GREEN-REFACTOR)
- Add tests for existing vibe-phase code
- Complete remaining stories with full rigor

### Critical Setup: Two-Tool Workflow

**ASSISTANT (Claude chat interface):**
- Provides instructions in numbered STEP format
- Plans features and test strategy
- Reviews results and guides next steps

**Claude Code (execution tool):**
- Receives complete instructions in single code block
- Executes commands and code changes
- Reports results back to User

**User (human developer):**
- Bridges both tools
- Copies instructions from ASSISTANT → Claude Code
- Reports execution results from Claude Code → ASSISTANT

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

### Evolution Documentation Format

**As-Built Product Backlog (Agile Evolution):**
```markdown
# Product Backlog: [Project]

**Evolution Note:** Evolved from Vibe Phase exploration to Agile

## As-Built Summary
**Status:** Ready for Story Development
*OR*
**Status:** Project Complete - No pending stories

## Completed Features (Vibe Phase)

### Story 0.1: [Feature] DONE
**As a** [user]
**I want** [what was built]
**So that** [benefit]

**Acceptance Criteria:**
- [x] Criterion - already met

**Story Points:** [retrospective estimate]
**Status:** Done (Vibe Phase)

## Epic: [Feature Area] (if pending work exists)
### Story 1.1: [Pending Story]
[Standard backlog format]
```

### Integration Points
- Requires Vibe Agent System Instructions (Core + Platform-specific)
- Evolves to IDPF-Agile
- Uses beginner Skills for Newbie framework
- Follows Claude Code two-tool workflow strictly

## Domain Knowledge Libraries

**Location:** `Domains/DOMAINS.md`
**Type:** Specialized Knowledge Lenses for Reviews

### Purpose
Provide domain-specific review criteria, guides, and templates that review commands load on demand via the `--with` flag. Domains are not process frameworks — they serve as reference collections for quality reviews.

### Domain Architecture

```
Domains/
    ├── review-criteria/        Domain-specific review questions
    │   ├── security.md         (OWASP-based)
    │   ├── accessibility.md    (WCAG-based)
    │   ├── performance.md      (threshold/load)
    │   ├── chaos.md            (resilience)
    │   ├── contract-testing.md (API contracts)
    │   └── qa-automation.md    (coverage)
    ├── Guides/                 Testing guides and references
    └── Templates/              Test plan templates
```

### Corresponding Domain Frameworks

Each domain has a dedicated framework directory with in-depth methodology:

| Domain | Framework Directory | Scope |
|--------|-------------------|-------|
| QA Automation | `Domains/QA-Automation/` | Selenium, Playwright, Cypress, Appium |
| Performance | `Domains/Performance/` | k6, JMeter, Gatling, Locust |
| Security | `Domains/Security/` | OWASP ZAP, Burp Suite, SAST/DAST |
| Accessibility | `Domains/Accessibility/` | axe, Lighthouse, Pa11y |
| Chaos | `Domains/Chaos/` | Chaos Monkey, Gremlin, LitmusChaos |
| Contract Testing | `Domains/Contract-Testing/` | Pact, Spring Cloud Contract |

### Embedded vs Separate Repository

**Embedded Testing (application repo):**
- TDD (unit tests) - Application repo with IDPF-Agile
- ATDD (acceptance tests) - Application repo with IDPF-Agile
- BDD (behavior specs) - Application repo with IDPF-Agile

**Separate Repository (uses domain frameworks):**
| Testing Type | Framework | Rationale |
|--------------|-----------|-----------|
| QA Automation | QA-Automation | Independent codebase, different release cycle |
| Performance | Performance | Specialized tooling, separate infrastructure |
| Security | Security | Scan configs, vulnerability tracking, compliance |
| Chaos | Chaos | Experiment definitions, separate from deployment |
| Contract Testing | Contract-Testing | Cross-repo coordination between teams |
| Accessibility | Accessibility | Flexible: Embedded OR Separate |

### Key Resources

**Templates:**
- Test-Plan-Template.md - Generic test plan structure

**Guides:**
- Testing-Framework-Selection-Guide.md - Decision guide for embedded vs separate repository and framework selection

### Integration Points
- Domain review criteria loaded by `/review-issue`, `/review-proposal`, `/review-prd` via `--with` flag
- Extension registry at `.claude/metadata/review-extensions.json`
- Domain frameworks extend IDPF-Agile for test development methodology

## QA-Automation Domain

**Location:** `Domains/QA-Automation/QA-Automation.md`
**Domain:** Domains
**Type:** UI & End-to-End Test Automation

### Purpose
Framework for developing automated UI and end-to-end test suites. Provides specialized guidance for building test automation projects using tools like Selenium, Playwright, Cypress, and Appium.

**Core Principle:** QA Automation tests operate against running applications from an external perspective, validating user-facing behavior through browser and mobile automation.

### Test Types

| Test Type | Scope | Execution Time |
|-----------|-------|----------------|
| **Smoke Tests** | Critical paths only | < 5 minutes |
| **Regression Tests** | Full feature coverage | 30-60 minutes |
| **Cross-Browser** | Browser compatibility | Varies |
| **Mobile Tests** | Native/hybrid apps | Varies |
| **Visual Tests** | UI appearance | 10-30 minutes |
| **E2E Tests** | Full user journeys | 15-45 minutes |

### Tool Ecosystem

**Web Automation:**
| Tool | Best For | Languages |
|------|----------|-----------|
| Selenium | Enterprise, cross-browser | Java, Python, C#, JS, Ruby |
| Playwright | Modern web apps | JS/TS, Python, C#, Java |
| Cypress | JavaScript apps | JavaScript/TypeScript |
| WebDriverIO | Flexible automation | JavaScript/TypeScript |

**Mobile Automation:**
| Tool | Platform | Best For |
|------|----------|----------|
| Appium | iOS, Android | Cross-platform |
| XCUITest | iOS only | Native iOS |
| Espresso | Android only | Native Android |
| Detox | iOS, Android | React Native |

### Architecture Patterns

**Page Object Model (Primary):**
- One page object per page/screen
- Encapsulates element locators
- Exposes meaningful actions
- Tests don't access locators directly

**Directory Structure:**
```
src/
├── pages/           # Page Objects
├── components/      # Reusable UI components
├── tests/
│   ├── smoke/
│   ├── regression/
│   └── e2e/
├── fixtures/        # Test data
├── utils/           # Helpers
└── config/          # Environment configs
```

### Key Resources

**Templates:**
- QA-Automation-Test-Plan.md - Specialized test plan for QA automation

**Guides:**
- Tool-Selection-Guide.md - Web/mobile tool decision guide
- Selector-Strategy-Guide.md - Element selection best practices

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

### Integration Points
- Domain knowledge from Domains/
- Uses IDPF-Agile for test development
- Integrates with CI/CD (GitHub Actions, Jenkins)
- Supports cloud providers (BrowserStack, Sauce Labs)

## Performance Domain

**Location:** `Domains/Performance/Performance.md`
**Domain:** Domains
**Type:** Performance Testing Framework

### Purpose
Develop and execute performance tests including load testing, stress testing, endurance testing, and capacity planning. Validates applications meet non-functional requirements for response time, throughput, scalability, and resource utilization.

### Performance Test Types

| Test Type | Purpose | Duration | Load Pattern |
|-----------|---------|----------|--------------|
| **Load Test** | Validate under expected load | 15-60 min | Steady state |
| **Stress Test** | Find breaking point | Until failure | Ramping up |
| **Endurance/Soak** | Detect memory leaks, degradation | 4-24 hours | Steady state |
| **Spike Test** | Handle sudden traffic bursts | 15-30 min | Sudden spikes |
| **Capacity Test** | Determine max throughput | Varies | Incremental |

### Tool Selection Guide

| Tool | Language | Best For |
|------|----------|----------|
| **k6** | JavaScript | Modern APIs, CI/CD, developer-friendly |
| **JMeter** | Java/XML | Enterprise, GUI-based, extensive plugins |
| **Gatling** | Scala/Java | High throughput, efficient resource usage |
| **Locust** | Python | Python teams, distributed testing |
| **Artillery** | JavaScript | Serverless, YAML config |
| **wrk/wrk2** | Lua | Lightweight HTTP benchmarking |

### Key Metrics

| Metric | Description | Good Values |
|--------|-------------|-------------|
| Response Time (p95) | 95th percentile | < 500ms |
| Response Time (p99) | 99th percentile | < 1000ms |
| Throughput | Requests per second | Depends on capacity |
| Error Rate | Failed requests / total | < 0.1% |
| Apdex | Application Performance Index | > 0.9 |

### Key Resources

**Templates:**
- Performance-Test-Plan.md - SLA/SLO definitions, workload model, thresholds

### GitHub Project Labels

| Label | Description |
|-------|-------------|
| `performance` | Performance work (from Testing-Core) |
| `load-test` | Load test development |
| `stress-test` | Stress test development |
| `soak-test` | Endurance test development |
| `capacity` | Capacity planning |

### Integration Points
- Domain knowledge from Domains/
- Uses IDPF-Agile for test development
- References Application PRD for NFR traceability
- Outputs performance reports, metric dashboards, capacity recommendations

## Security Domain

**Location:** `Domains/Security/Security.md`
**Domain:** Domains
**Type:** Security Testing Framework

### Purpose
Develop and execute security testing activities including SAST, DAST, penetration testing, vulnerability management, and security compliance. Validates applications are protected against common vulnerabilities and meet security requirements.

**Core Principle:** "Security testing validates that applications are protected against common vulnerabilities and meet security requirements defined in the application PRD."

### Security Testing Types

| Test Type | When | What | Tools |
|-----------|------|------|-------|
| **SAST** | Development/CI | Source code analysis | SonarQube, Semgrep, CodeQL |
| **SCA** | Development/CI | Dependency vulnerabilities | Snyk, Dependabot, OWASP Dependency-Check |
| **DAST** | Staging/Pre-prod | Running application | OWASP ZAP, Burp Suite, Nuclei |
| **IAST** | Testing | Runtime analysis | Contrast Security, Hdiv |
| **Penetration Testing** | Pre-release | Manual + automated | Manual + various tools |
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

**Workflow:** Discovery → Triage → Assignment → Remediation → Verification → Closure

### CI/CD Integration

| Stage | Tool Type | Gate Criteria |
|-------|-----------|---------------|
| Commit | SAST | No critical/high issues |
| Commit | Secret Scan | No secrets detected |
| PR | SCA | No critical vulnerabilities |
| Pre-Deploy | DAST | No critical findings |

### Key Resources

**Templates:**
- Security-Test-Plan.md - Comprehensive security test planning with vulnerability management

### GitHub Project Labels

| Label | Color | Description |
|-------|-------|-------------|
| `security` | `#FF5630` | Security work (from Testing-Core) |
| `sast` | `#0052CC` | Static analysis |
| `dast` | `#D93F0B` | Dynamic analysis |
| `sca` | `#0E8A16` | Dependency scanning |
| `pentest` | `#5319E7` | Penetration testing |
| `vulnerability` | `#FBCA04` | Vulnerability tracking |
| `compliance` | `#1D76DB` | Compliance related |

### Integration Points
- Domain knowledge from Domains/
- Uses IDPF-Agile for test development
- References Application PRD for security requirements
- Outputs vulnerability reports, compliance evidence, security metrics

## Accessibility Domain

**Location:** `Domains/Accessibility/Accessibility.md`
**Domain:** Domains
**Type:** Accessibility Testing Framework

### Purpose
Develop and execute accessibility testing activities including WCAG compliance testing, automated a11y scanning, manual accessibility audits, and assistive technology testing. Validates applications are usable by people with disabilities and comply with legal requirements (ADA, Section 508, EAA).

### Repository Type: Flexible

| Model | Use Case | Location |
|-------|----------|----------|
| **Embedded** | Automated a11y checks in CI | Application repo (`tests/a11y/`) |
| **Separate** | Comprehensive audits, manual testing | Dedicated accessibility repo |

### Accessibility Testing Types

| Test Type | Automation | Coverage | Tools |
|-----------|------------|----------|-------|
| **Automated Scans** | Full | ~30-40% of issues | axe-core, Lighthouse, Pa11y |
| **Keyboard Testing** | Partial | Focus management | Manual + scripts |
| **Screen Reader** | Manual | Content, announcements | NVDA, JAWS, VoiceOver |
| **Color Contrast** | Full | Visual design | axe, Contrast checkers |
| **Cognitive** | Manual | Readability, simplicity | Manual review |
| **Mobile a11y** | Partial | Touch targets, gestures | Accessibility Scanner |

### WCAG Conformance Levels

| Level | Description | Requirement |
|-------|-------------|-------------|
| **A** | Minimum accessibility | Must meet |
| **AA** | Standard accessibility | Typically required (legal) |
| **AAA** | Enhanced accessibility | Aspirational |

**Recommendation:** Target WCAG 2.1 Level AA as baseline.

### Tool Selection Guide

**Automated Scanning:**
| Tool | Best For | Integration |
|------|----------|-------------|
| **axe-core** | CI/CD integration | npm, browser extension |
| **Lighthouse** | Overall audit | Chrome, CI |
| **Pa11y** | CLI scanning | Node.js |
| **WAVE** | Visual feedback | Browser extension |

**Assistive Technologies:**
| Tool | Platform | Type |
|------|----------|------|
| **NVDA** | Windows | Screen reader (Free) |
| **JAWS** | Windows | Screen reader (Commercial) |
| **VoiceOver** | macOS/iOS | Screen reader (Built-in) |
| **TalkBack** | Android | Screen reader (Built-in) |

### Issue Severity Classification

| Severity | Impact | SLA |
|----------|--------|-----|
| Critical | Blocker for AT users | Before release |
| Serious | Major barrier | 30 days |
| Moderate | Degraded experience | 60 days |
| Minor | Inconvenience | 90 days |

### Key Resources

**Templates:**
- Accessibility-Test-Plan.md - WCAG checklist, test matrix, remediation tracking

### GitHub Project Labels

| Label | Color | Description |
|-------|-------|-------------|
| `accessibility` | `#36B37E` | Accessibility work |
| `wcag-a` | `#0E8A16` | WCAG Level A issue |
| `wcag-aa` | `#1D76DB` | WCAG Level AA issue |
| `wcag-aaa` | `#5319E7` | WCAG Level AAA issue |
| `screen-reader` | `#D93F0B` | Screen reader issue |
| `keyboard` | `#FBCA04` | Keyboard navigation issue |

### Integration Points
- Domain knowledge from Domains/
- Flexible: Embedded in app repo OR separate test repo
- Uses IDPF-Agile for test development
- References Application PRD for accessibility requirements
- Outputs WCAG audit reports, conformance statements (VPAT), remediation recommendations

## Chaos Domain

**Location:** `Domains/Chaos/Chaos.md`
**Domain:** Domains
**Type:** Chaos Engineering Framework

### Purpose
Develop and execute chaos engineering experiments including resilience testing, fault injection, and failure scenario validation. Validates systems can withstand and recover from failures proactively before production incidents occur.

**Core Principle:** "Chaos engineering proactively tests system resilience by introducing controlled failures to discover weaknesses before they cause production incidents."

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
| **LitmusChaos** | Kubernetes | K8s native chaos |
| **Chaos Mesh** | Kubernetes | K8s native chaos |
| **AWS FIS** | AWS | AWS infrastructure |
| **Toxiproxy** | Any | Network simulation |

### Experiment Workflow

```
Hypothesis → Observability Setup → Design → Approval → Execute → Analyze → Fix/Expand
```

### Key Resources

**Templates:**
- Chaos-Experiment-Plan.md - Hypothesis, blast radius, abort conditions, execution plan
- GameDay-Template.md - Multi-scenario chaos events with team coordination

### GitHub Project Labels

| Label | Color | Description |
|-------|-------|-------------|
| `chaos` | `#6554C0` | Chaos work (from Core) |
| `experiment` | `#0E8A16` | Chaos experiment |
| `gameday` | `#D93F0B` | GameDay related |
| `infrastructure-fault` | `#0052CC` | Infrastructure failure |
| `network-fault` | `#1D76DB` | Network failure |
| `finding` | `#FBCA04` | Resilience finding |

### Integration Points
- Domain knowledge from Domains/
- Uses IDPF-Agile for experiment development
- References Application PRD for resilience requirements
- Integrates with observability (Prometheus, Grafana, Datadog)
- Outputs experiment reports, findings, action items

## Contract-Testing Domain

**Location:** `Domains/Contract-Testing/Contract-Testing.md`
**Domain:** Domains
**Type:** API Contract Testing Framework

### Purpose
Develop and execute API contract tests for consumer-driven contract testing, provider verification, and contract management. Validates that API consumers and providers agree on interface contracts, catching integration issues early.

### Contract Testing Flow

```
Consumer → Generate Contract → Publish to Broker → Provider Fetches → Verify → Can-I-Deploy → Deploy
```

### Tool Selection Guide

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

### Key Resources

**Templates:**
- Contract-Test-Plan.md - Consumer/provider specifications, broker config

### GitHub Labels

| Label | Description |
|-------|-------------|
| `contract` | Contract work (from Testing-Core) |
| `consumer` | Consumer-side contract |
| `provider` | Provider-side contract |
| `breaking-change` | Breaking contract change |
| `verification-failed` | Failed verification |

### Integration Points
- Domain knowledge from Domains/
- Uses IDPF-Agile for test development
- Coordinates multiple teams (consumer and provider)
- Integrates with Pact Broker / Pactflow
- Outputs contract files, verification reports, broker dashboards

## System Instructions

**Location:** `System-Instructions/`
**Purpose:** Define assistant identity, expertise, and behavioral patterns

### Domain Specialization Architecture (Current)

**Architecture Pattern:** Core + Domain Specialization
- **Core-Developer-Instructions.md (Rev 1.0)**: Foundation competencies for all developers
- **22 Domain Specialists**: Specialized expertise profiles (loaded with Core)
- **Domain-Selection-Guide.md (Rev 1.0)**: Guide for choosing appropriate specialist(s)

**Loading Pattern:**
1. Load Core-Developer-Instructions.md (universal competencies)
2. Load appropriate Domain specialist file(s) for depth
3. Domain extends and deepens core competencies

**Core Developer Competencies:**
- Version Control (Git workflows, branching strategies, PR reviews)
- Testing Fundamentals (Unit, Integration, E2E, TDD methodology)
- Agile Development (Scrum, Kanban, backlog management, CI/CD)
- Code Quality (SOLID, DRY, YAGNI, KISS principles)
- Design Patterns (Creational, Structural, Behavioral, MVC, Repository)
- Cross-Platform Awareness (OS differences, path handling)
- Security Fundamentals (OWASP Top 10, input validation, authentication)
- Performance Basics (Big O notation, caching strategies, profiling)

### Domain Specialist System Instructions

**1. Backend-Specialist.md**
- Server-side applications, REST/GraphQL APIs
- Authentication/authorization (OAuth, JWT, session management)
- Business logic, middleware, background jobs
- Technologies: Python (Django/Flask/FastAPI), Node.js (Express/NestJS), Ruby (Rails), Java (Spring), Go

**2. Frontend-Specialist.md**
- React, Vue, Angular, Svelte frameworks
- CSS architecture (BEM, CSS Modules, Tailwind, styled-components)
- State management (Redux, Zustand, Pinia, Context API)
- Performance (Core Web Vitals, lazy loading, code splitting)
- Accessibility (WCAG, ARIA, semantic HTML)

**3. DevOps-Engineer.md**
- CI/CD pipelines (GitHub Actions, GitLab CI, Jenkins, CircleCI)
- Containerization (Docker, Docker Compose, container registries)
- Orchestration (Kubernetes, Helm charts, service mesh)
- Infrastructure as Code (Terraform, Pulumi, CloudFormation, Ansible)
- Monitoring (Prometheus, Grafana, ELK stack, Datadog)

**4. Database-Engineer.md**
- Schema design, normalization, indexing strategies
- Query optimization, execution plans, EXPLAIN analysis
- Replication (master-slave, master-master, sharding)
- Migrations (Alembic, Flyway, Liquibase, Rails migrations)
- Technologies: PostgreSQL, MySQL, MongoDB, Redis, Cassandra

**5. API-Integration-Specialist.md**
- REST, GraphQL, gRPC, WebSocket APIs
- Microservices architecture, service discovery
- API gateways (Kong, Tyk, AWS API Gateway)
- Message brokers (Kafka, RabbitMQ, Redis Pub/Sub)
- Service mesh (Istio, Linkerd)

**6. Security-Engineer.md**
- OWASP Top 10 vulnerabilities
- Authentication (OAuth 2.0, OpenID Connect, SAML, multi-factor)
- Cryptography (hashing, encryption, key management)
- Penetration testing, security audits
- Compliance (SOC 2, GDPR, HIPAA)

**7. Platform-Engineer.md**
- Internal developer platforms (IDPs)
- Service catalogs, golden paths
- CI/CD templates and reusable workflows
- Developer experience (DevEx) optimization
- Self-service infrastructure provisioning

**8. Mobile-Specialist.md**
- iOS development (Swift, SwiftUI, UIKit)
- Android development (Kotlin, Jetpack Compose)
- Cross-platform (React Native, Flutter, Ionic)
- Offline-first architecture, local storage
- Push notifications, deep linking, app store deployment

**9. Data-Engineer.md**
- ETL/ELT pipelines (Airflow, Prefect, Dagster)
- Data processing (Spark, Dask, Pandas)
- Data modeling (Kimball, Data Vault, star schema)
- Data warehousing (Snowflake, BigQuery, Redshift)
- Data quality, lineage, governance

**10. QA-Test-Engineer.md**
- Test strategy, test pyramid, risk-based testing
- Test automation (Cypress, Playwright, Selenium, Appium)
- Performance testing (k6, JMeter, Gatling, Locust)
- TDD/BDD methodologies (RSpec, Cucumber, Jest, pytest)
- CI integration, test reporting, coverage analysis

**11. Cloud-Solutions-Architect.md**
- System design, architectural patterns (microservices, event-driven, CQRS)
- AWS/Azure/GCP services and best practices
- Scalability, high availability, disaster recovery
- CAP theorem, eventual consistency, distributed systems
- Architecture Decision Records (ADRs)

**12. SRE-Specialist.md**
- SLO/SLI/SLA definition and management
- Error budgets, reliability engineering
- Observability (logs, metrics, traces, distributed tracing)
- Incident response, postmortems, blameless culture
- Chaos engineering, resilience testing

**13. Embedded-Systems-Engineer.md**
- C/C++ for embedded systems
- ARM Cortex-M, AVR, ESP32 microcontrollers
- RTOS (FreeRTOS, Zephyr, ThreadX)
- Hardware protocols (I2C, SPI, UART, CAN)
- Low-level debugging, memory management

**14. ML-Engineer.md**
- TensorFlow, PyTorch, scikit-learn, XGBoost
- Model development (supervised, unsupervised, reinforcement learning)
- Deep learning architectures (CNN, RNN, LSTM, Transformers, GANs)
- MLOps (MLflow, Kubeflow, SageMaker, model serving)
- Model optimization (quantization, pruning, distillation)

**15. Performance-Engineer.md**
- Application performance optimization
- Profiling (CPU, memory, database profiling)
- Load testing (k6, Gatling, JMeter, Locust)
- Frontend performance (Core Web Vitals, lighthouse)
- Backend performance (query optimization, caching, CDN)
- APM tools (New Relic, Datadog, AppDynamics)

**16. Accessibility-Specialist.md**
- WCAG 2.1/2.2 guidelines and compliance
- Assistive technology testing (screen readers, keyboard navigation)
- Accessibility auditing and remediation
- Legal compliance (ADA, Section 508, EAA)

**17. Full-Stack-Developer.md**
- End-to-end application development spanning frontend and backend
- Holistic system thinking and architectural decisions
- API contract design that serves both layers efficiently
- Technologies: React/Vue/Angular + Node.js/Python/Ruby + PostgreSQL/MongoDB

**18. Desktop-Application-Developer.md**
- Cross-platform desktop applications (Windows, macOS, Linux)
- UI frameworks (Qt, GTK, WinForms, WPF, Electron, Tauri)
- System integration and native APIs
- Packaging, distribution, and installers

**19. Game-Developer.md**
- Game engines (Unity, Unreal, Godot)
- Game programming patterns (game loop, ECS, state machines)
- Physics, collision detection, and rendering
- Multiplayer networking and game services

**20. Graphics-Engineer-Specialist.md**
- Computer graphics fundamentals (rasterization, ray tracing)
- GPU programming (shaders, compute, GPGPU)
- Graphics APIs (Vulkan, DirectX, OpenGL, Metal, WebGPU)
- Rendering pipelines and optimization

**21. Systems-Programmer-Specialist.md**
- Low-level systems programming (memory, concurrency, I/O)
- Operating system internals and kernel development
- Compilers, interpreters, and language runtimes
- Performance-critical code and hardware interaction

**22. Technical-Writer-Specialist.md**
- Documentation engineering and docs-as-code workflows
- API documentation (OpenAPI, AsyncAPI)
- Documentation generators (Docusaurus, MkDocs, Sphinx)
- Technical writing best practices and style guides

### Domain Selection Guide

**Quick Reference:**
- **Full-Stack Web**: Core + Backend + Frontend + Database
- **Cloud-Native Microservices**: Core + API-Integration + DevOps + Cloud-Architect
- **Mobile App with Backend**: Core + Mobile + Backend
- **Data Platform**: Core + Data-Engineer + Database-Engineer + Cloud-Architect
- **Secure Production System**: Core + Backend + Security + SRE

**Decision Tree:**
- If building APIs/services → Backend-Specialist
- If building UIs → Frontend-Specialist
- If managing infrastructure → DevOps-Engineer or Platform-Engineer
- If designing systems → Cloud-Solutions-Architect
- If ensuring reliability → SRE-Specialist
- If working with data → Data-Engineer + Database-Engineer
- If mobile apps → Mobile-Specialist
- If security focus → Security-Engineer
- If performance focus → Performance-Engineer
- If machine learning → ML-Engineer
- If embedded/IoT → Embedded-Systems-Engineer
- If API integration → API-Integration-Specialist
- If testing → QA-Test-Engineer
- If accessibility → Accessibility-Specialist
- If full-stack → Full-Stack-Developer
- If desktop apps → Desktop-Application-Developer
- If game development → Game-Developer
- If graphics/rendering → Graphics-Engineer-Specialist
- If systems/low-level → Systems-Programmer-Specialist
- If documentation → Technical-Writer-Specialist

**Multiple domains can be combined for cross-functional expertise.**

### Vibe Agent System Instructions

**Vibe-Agent-Core-Instructions.md (Rev 1.3)**
- Platform-agnostic behavioral instructions for Vibe-to-Structured workflow
- Defines HOW to behave during exploratory development
- Key behaviors: Concise communication, single code block enforcement, context preservation, TDD cycle management

**Platform-Specific Vibe Instructions:**
- Vibe-Agent-Desktop-Instructions.md
- Vibe-Agent-Web-Instructions.md
- Vibe-Agent-Mobile-Instructions.md
- Vibe-Agent-Game-Instructions.md
- Vibe-Agent-Embedded-Instructions.md
- Vibe-Agent-Newbie-Instructions.md

**Integration Pattern:**
- Core Vibe instructions apply to all platforms
- Platform-specific instructions add specialized guidance
- Both must be loaded together for proper behavior

### Critical Requirement
System Instructions are **REQUIRED** for all framework operation. Frameworks define process; System Instructions define identity and expertise.

## Skills

**Location:** `Skills/`
**Purpose:** Reusable capabilities for specific tasks
**Total Skills:** 34 (6 TDD/BDD, 1 PRD, 2 code quality, 1 code analysis, 2 beginner setup, 3 beginner support, 2 database, 2 advanced testing, 3 architecture, 1 DevOps, 2 testing/browser, 1 desktop, 1 diagrams, 4 deployment platforms, 1 SEO, 1 privacy compliance, 2 platform)

### TDD Skills (Experienced Developers)

**tdd-red-phase**
- **Function**: Guide through RED phase - writing failing tests and verifying expected failures
- **Coverage**: Test structure (AAA pattern), assertion patterns, failure verification, Claude Code format
- **When Used**: Starting new feature/behavior via `work #N` trigger
- **Resources**: RED phase checklist, test structure patterns, failure verification guide

**tdd-green-phase**
- **Function**: Guide through GREEN phase - minimal implementation to pass failing tests
- **Coverage**: YAGNI principle, implementation strategies, regression checking, avoid over-implementation
- **When Used**: After RED phase test verified as failing
- **Resources**: GREEN phase checklist, minimal implementation guide, triangulation examples

**tdd-refactor-phase**
- **Function**: Guide through REFACTOR phase - code improvement while maintaining green tests
- **Coverage**: Refactoring analysis via Claude Code, rollback procedures, when to skip refactoring
- **When Used**: After GREEN phase success
- **Resources**: Refactor checklist, common refactorings, when to skip guide

**tdd-failure-recovery**
- **Function**: Handle unexpected test behaviors and recovery procedures
- **Coverage**: Failure diagnostics for RED/GREEN/REFACTOR phases, recovery steps, rollback commands, test isolation
- **When Used**: Test behaves unexpectedly, need to rollback to previous working state
- **Resources**: Failure diagnostic flowchart, recovery procedures, test isolation guide

**test-writing-patterns** (Standalone)
- **Function**: Test structure, patterns, assertions, test doubles guidance
- **Coverage**: AAA pattern, Given-When-Then, assertion strategies, test doubles (mock/stub/fake/spy), framework-agnostic
- **When Used**: Need guidance on test structure, assertions, or test doubles
- **Resources**: AAA template, test doubles guide, assertion patterns, test organization examples

**bdd-writing** (Standalone)
- **Function**: BDD specification writing with Gherkin syntax
- **Coverage**: Feature files, scenarios, Given-When-Then, step definitions, scenario outlines, data tables
- **When Used**: Writing acceptance criteria as executable specifications, creating feature files, defining step definitions
- **Tools**: Cucumber (JS/Java/Ruby), pytest-bdd, SpecFlow, Behave, RSpec
- **Resources**: Gherkin syntax reference, feature file templates, step definition patterns, tool comparison
- **Integration**: Complements test-writing-patterns, drives TDD outer loop

### PRD Skills

**create-prd**
- **Function**: Transform proposals into detailed PRD documents using Inception/ context
- **Coverage**: Proposal analysis, charter alignment, user story generation, acceptance criteria
- **When Used**: Promoting approved proposals to actionable requirements, pre-Create-Backlog planning
- **Resources**: PRD templates, Inception/ artifacts for context validation
- **Integration**: Streamlined PRD creation (supersedes deprecated IDPF-PRD), feeds into Create-Backlog
- **Audience**: Developers promoting approved proposals to actionable requirements

### Code Quality Skills

**anti-pattern-analysis**
- **Function**: Systematic detection of anti-patterns during code review
- **Coverage**: Design/OOP patterns, code smells, architecture issues, database patterns, testing patterns, security patterns
- **When Used**: Code reviews, refactoring planning, technical debt assessment, Reverse-PRD extraction
- **Resources**: General anti-patterns, architecture anti-patterns, testing anti-patterns, database anti-patterns, code review checklist, language-specific guides (JavaScript, Python)
- **Integration**: Supports code review and technical debt assessment workflows
- **Audience**: Experienced developers performing code reviews

### Beginner Setup Skills

**flask-setup**
- **Function**: Python Flask environment setup with step-by-step guidance
- **Coverage**: Virtual environment creation, dependency installation, verification
- **Format**: Claude Code copy/paste blocks
- **Audience**: Beginners

**sinatra-setup**
- **Function**: Ruby Sinatra environment setup
- **Coverage**: Bundler, Gemfile creation, dependency installation, verification
- **Format**: Claude Code copy/paste blocks
- **Audience**: Beginners

### Beginner Support Skills

**common-errors**
- **Function**: Troubleshooting reference for common development issues
- **Resources**: Flask errors, Sinatra errors, general programming errors
- **Coverage**: Error diagnosis, solutions, explanations
- **Audience**: Beginners

**sqlite-integration**
- **Function**: Database integration guidance for beginners
- **Resources**: Flask SQLite example, Sinatra SQLite example, SQL basics
- **Coverage**: Database setup, basic queries, schema creation
- **Audience**: Beginners

**beginner-testing**
- **Function**: Testing introduction and TDD methodology education
- **Resources**: Flask test example, Sinatra test example, TDD explained
- **Coverage**: Test writing basics, assertion introduction, simple TDD cycle
- **Audience**: Beginners

### Skill Characteristics
- Packaged as distributable units (SKILL.md + resources/ + LICENSE.txt)
- Provide copy/paste Claude Code instruction blocks (NOT manual instructions)
- Include verification checklists and resource files
- Beginner Skills: Detailed explanations with language-specific examples
- TDD Skills: Framework-agnostic, experienced developer focus, integrated with IDPF frameworks

## Assistant Guidelines

**Location:** `Assistant/`
**Purpose:** Ensure accuracy, prevent hallucination, maintain quality standards
**Total Guidelines:** 2 documents

### Anti-Hallucination Rules for Software Development

**Core Principle:** Accuracy over helpfulness. Uncertainty over invention. Verification over assumption.

**Absolute "Never Do" Rules:**
- NEVER invent: API methods, class names, config syntax, command flags, file paths, library dependencies
- NEVER assume: OS/platform, available tools, project structure, versions, environment config
- NEVER describe documentation or UI you cannot see

**Information Source Hierarchy:**
1. User-provided files and context (highest authority)
2. Official documentation (via Web Search)
3. Training data (with version/date context)
4. Logical inference (clearly labeled)

**Confidence Level Indicators:**
- High: "This is the standard approach..."
- Medium: "This is commonly done by..."
- Low: "This might work, but I'm not certain..."
- No confidence: "I don't have reliable information about [X]"

**Auto-trigger Web Search:**
- "current" or "latest" anything
- Recent releases/updates
- Uncertain API syntax
- Installation on specific OS
- Breaking changes between versions

**Decision Trees:**
- When asked about specific syntax: Check certainty → Verify in docs → Search if needed
- When requirements unclear: Ask clarifying questions
- When context missing: Request specific information

**File Operations:**
- Always READ files before editing
- Verify paths exist before referencing
- Enumerate ALL files before bulk operations
- Track progress on multi-file changes

### Anti-Hallucination Rules for Skill Creation

**Core Principle:** Accuracy over helpfulness. Precision over assumption. Verification over invention.

**Key Rules:**
- Never invent content not in source material
- Never assume vague instructions need expansion
- Preserve exact wording and terminology from source
- Only create resource files for content actually in source
- Maintain source document structure without reorganization

**Decision Framework:**
- Map source sections directly to Skill format
- Extract examples/templates only from source
- Verify no additions were made before finalizing
- Use explicit language about source content confidence

## Rules Auto-Loading (v2.9+)

**Location:** `.claude/rules/`
**Purpose:** Automatically load essential rules at session start without explicit file reads

### How It Works

Claude Code automatically loads all `.md` files from `.claude/rules/` at session start. This eliminates the need for explicit file reads in startup procedures and ensures rules persist after compaction.

### Rule Files

| File | Content | Source |
|------|---------|--------|
| `01-anti-hallucination.md` | Framework development quality rules | `Assistant/Anti-Hallucination-Rules-for-Framework-Development.md` |
| `02-github-workflow.md` | GitHub issue management integration | `Reference/GitHub-Workflow.md` |
| `03-session-startup.md` | Startup procedure and on-demand loading | Generated |

### Benefits

- **No explicit reads:** Rules load automatically at session start
- **Compact-resilient:** Rules persist after context compaction (no re-reading needed)
- **Simplified startup:** CLAUDE.md references rules, doesn't contain procedures
- **Token reduction:** ~47% fewer tokens at startup

### Source of Truth

- **Source files:** `Assistant/` and `Reference/` directories contain authoritative content
- **Rules files:** Built from source at release time (Phase 2e of /prepare-release)
- **User projects:** Hub installer generates rules from templates at installation time

### Naming Convention

Files are numbered for load order: `01-`, `02-`, `03-`, etc. Lower numbers load first.

## Framework Transition Matrix

### Workflow Diagram

**Development Path:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   ┌───────┐                     ┌───────────┐              │
│   │ VIBE  │────────────────────►│   AGILE   │              │
│   │       │                     │           │              │
│   └───────┘                     │ - Stories │              │
│                                 │ - TDD     │              │
│   EXPLORATION                   │ - Backlog │              │
│                                 └───────────┘              │
│                                                             │
│                                  DEVELOPMENT                │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Legend:  ───► Valid transition
         Agile is terminal (no transitions from Agile)
```

**Invalid Transitions (Never Do):**
```
     ┌───────────┐          ┌───────────┐
     │   AGILE   │──── X ──►│   VIBE    │
     └───────────┘          └───────────┘

     Rationale: Quality standards never decrease.
```

### Valid Transitions

| From Framework | To Framework | When to Transition |
|----------------|--------------|-------------------|
| **Vibe** | **Agile** | Vibe exploration complete, feature set identified, ready for story-driven development |

### Transition Principles

**Always Preserved Across Transitions:**
- All existing code and tests
- Git repository and commit history
- TDD methodology (RED-GREEN-REFACTOR)
- Testing framework and test suite
- Technical architecture decisions
- Dependencies and configurations

**What Changes:**
- Documentation format (Exploration notes to User Stories)
- Workflow structure (Exploratory to Story-Driven)
- Planning granularity (Ideas to Stories)
- Progress tracking (Vibes to Backlog Management)

**Transition Best Practices:**
1. Complete current exploration before transitioning
2. Ensure tests pass (100% green)
3. Commit all work-in-progress
4. Create transition documentation (preserve context)
5. Generate product backlog from vibe exploration
6. Communicate transition to stakeholders (if applicable)

**Invalid Transitions:**

**Never transition:**
- Agile to Vibe (defeats structured discipline)

**Rationale for invalid transitions:**
- Returning to Vibe from Agile abandons testing discipline
- Quality standards should never decrease (always increase or maintain)

## Framework Integration Architecture

### Dependency Hierarchy

```
System Instructions (REQUIRED foundation - WHO + EXPERTISE)
    |
Framework Selection (WHAT process to follow)
    |
Skills (TOOLS for specific capabilities)
    |
Assistant Guidelines (HOW WELL - quality control)
```

### Selection Criteria

**Use IDPF-Agile when:**
- Building products with defined or evolving requirements
- Iterative delivery with regular feedback
- Feature prioritization based on user value
- Any project size
- Structured backlog and story management needed
- Team collaboration requires structured workflow

**Use IDPF-Vibe when:**
- Starting with unclear requirements
- Need exploration phase first
- Prototyping before formalizing
- Requirements will emerge from experimentation
- Will evolve to Agile when ready

### Common Elements Across Frameworks

**TDD Methodology:**
- All frameworks use RED-GREEN-REFACTOR cycles
- Identical test-writing discipline
- Same verification requirements
- Skills invoked at appropriate TDD phases

**Claude Code Communication:**
- Single code block format (numbered STEP format)
- Complete, runnable code with no placeholders
- Exact file paths and verification steps
- Report results back to assistant
- Two-tool workflow (ASSISTANT + Claude Code + User)

**Context Preservation:**
- Full awareness of previous steps and decisions
- Cumulative conversation context
- Reference previous implementations naturally
- Maintain session continuity

**Git Workflows:**
- All frameworks support GitFlow, GitHub Flow, trunk-based
- Commit conventions (Conventional Commits)
- PR creation and code reviews
- Branch management strategies

## Framework Ecosystem Summary

**Total Components:**
- **2 Development Process Frameworks**: IDPF-Agile, IDPF-Vibe (7 variants)
- **Domains**: 11 domain knowledge libraries (QA-Automation, Performance, Security, Accessibility, Chaos, Contract-Testing, API-Design, Observability, Privacy, SEO, i18n) in Domains/
- **System Instructions**: 1 Core + 22 Domain Specialists + 1 Domain Selection Guide + 1 Legacy + Vibe Agent (Core + 6 platforms)
- **38 Skills**: 6 TDD/BDD (experienced), 2 code quality, 1 code analysis, 2 beginner setup, 3 beginner support, 2 database, 2 advanced testing, 3 architecture, 2 DevOps (incl. observability-setup), 2 testing/browser, 2 desktop (incl. electron-cross-build), 1 diagrams, 4 deployment platforms, 1 SEO, 1 privacy compliance, 2 platform, 1 i18n, 1 test scaffolding
- **2 Assistant Guideline Documents**: Software dev (with file operations), Skill creation

> **Note:** IDPF-PRD was deprecated in v0.24; requirements engineering now uses the `create-prd` skill.

**Integration Model:**
- **System Instructions** provide identity and expertise (WHO + DOMAIN)
  - Core-Developer-Instructions.md: Universal competencies
  - Domain Specialists: Specialized depth (22 specialists: Backend, Frontend, DevOps, Database, API-Integration, Security, Platform, Mobile, Data, QA-Test, Cloud-Architect, SRE, Embedded, ML, Performance, Accessibility, Full-Stack, Desktop-App, Game, Graphics, Systems-Programmer, Technical-Writer)
- **Frameworks** provide methodology and process (WHAT)
  - Agile: User stories, TDD cycles, backlog management (terminal framework)
  - Vibe: Exploratory, evolves to Agile
  - Domains: Domain knowledge libraries for reviews (QA-Automation, Performance, Security, Accessibility, Chaos, Contract-Testing, API-Design, Observability, Privacy, SEO, i18n)
- **Skills** provide reusable capabilities (TOOLS)
  - PRD: `/create-prd` for requirements engineering (pre-development)
  - TDD phases, beginner setup, support
- **Assistant Guidelines** provide quality control (HOW WELL)
  - Anti-hallucination, accuracy, verification

**Critical Success Factors:**
1. System Instructions MUST be loaded before framework use
2. Single code block format strictly enforced
3. TDD discipline maintained throughout
4. Context preservation across session
5. Anti-hallucination rules applied continuously
6. Framework transitions follow valid paths only

**Framework Selection Matrix:**

| Project Type | Starting Point | Evolution Path | Target Outcome |
|--------------|---------------|----------------|----------------|
| Defined requirements | IDPF-Agile | Terminal | Story-driven delivery with TDD |
| Unclear requirements, exploration | IDPF-Vibe | Vibe to Agile | Discovered requirements + TDD |
| Need requirements | `/create-prd` | PRD to Agile | Implementation-ready PRD |
| Separate test repository | Domains/ + IDPF-* | Agile for test dev | Test automation codebase |

## Document Maintenance

**Version Control:**
- Increment version for any content change
- Document changes in git commit messages and CHANGELOG.md

**Update Frequency:**
- After framework revisions published
- After new skills added
- After system instruction updates
- After framework transitions added/modified
- Quarterly comprehensive review recommended

**Quality Assurance:**
- Verify all file paths remain valid
- Confirm version numbers match source files
- Validate framework integration patterns
- Ensure transition matrix accuracy

**Update Process:**
1. Read all framework directories (exclude merged, refactoring, generic)
2. Extract current revision numbers and key features
3. Update Framework-Overview.md with new content
4. Increment version number
5. Commit with descriptive message
