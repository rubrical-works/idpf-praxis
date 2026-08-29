**Framework Overview**
**Version:** v0.99.0
Comprehensive reference for AI assistants (Claude/Claude Code) and framework development. Change history: git log and CHANGELOG.md.
**Framework Purpose and Scope**
Supports AI-assisted software development across multiple methodologies and platforms. System Instructions are **REQUIRED** for all framework operation.
**Core Principle:** System Instructions define WHO the assistant is; Frameworks define WHAT process to follow; Skills provide reusable capabilities; Assistant Guidelines ensure accuracy and quality.
---
**PRD Creation (create-prd Skill)**
> IDPF-PRD deprecated in v0.24; replaced by the `create-prd` skill.
**Location:** `Skills/create-prd/SKILL.md` | **Command:** `/create-prd` | **Type:** Requirements Engineering & PRD Generation
Transform proposals into implementation-ready PRDs, or extract PRDs from existing codebases — a streamlined conversational workflow replacing the deprecated multi-phase IDPF-PRD framework.
| Mode | Command | Purpose |
|------|---------|---------|
| **Promote** | `/create-prd Proposal/Feature.md` | Transform proposal to PRD |
| **Extract** | `/create-prd extract` | Extract PRD from codebase |
| **Interactive** | `/create-prd` | Prompt for mode selection |
**Features:** Charter validation against CHARTER.md scope; context-aware dynamic questions (not static worksheets); story transformation; MoSCoW priority validation; optional `.drawio.svg` UML diagrams; single-session completion
**Inputs:** `Proposal/*.md`, `Inception/` artifacts, `CHARTER.md`
**Outputs:** `PRD/{name}/PRD-{name}.md` with optional `Diagrams/`
**Downstream:** `Create-Backlog` generates GitHub issues from PRD
**Related:** `codebase-analysis` skill for extraction mode
---
**IDPF-Agile Framework**
**Location:** `IDPF-Agile/` (Agile-Core.md, Agile-Commands.md, Agile-Best-Practices.md, Agile-Templates.md, Agile-Transitions.md)
**Type:** Story-Driven Development with TDD Cycles
Implement agile software development methodology with AI assistance, organizing work around user stories, GitHub-native backlog management, and continuous TDD iteration.
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
**Agile Commands:** Backlog Operations (Create-Backlog, Add-Story, Prioritize-Backlog, Split-Story); Story Workflow (`work #N` and `done` triggers per GitHub-Workflow.md); Development (Run-Tests, Show-Coverage); Release Lifecycle (Create-Branch, Prepare-Release, Merge-Branch, Destroy-Branch); Special Scenarios (Pivot); Utility (List-Commands, Help)
**Metrics Tracked:** Story points completed, acceptance criteria pass rate, TDD cycle completion
**Integration:** Uses TDD cycles (RED-GREEN-REFACTOR), requires appropriate System Instructions, follows the same Claude Code communication protocol
**When to Use:** Products with evolving requirements; iterative delivery with regular feedback; feature prioritization based on user value; medium to large projects; requirements well-defined or emerging from the PRD process
---
**Domain Knowledge Libraries**
**Location:** `Domains/DOMAINS.md`
**Type:** Specialized Knowledge Lenses for Reviews
Provide domain-specific review criteria, guides, and templates that review commands load on demand via the `--with` flag. Domains are not process frameworks — they are reference collections for quality reviews.
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
Each domain has a dedicated framework directory with in-depth methodology:
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
**Embedded Testing (application repo with IDPF-Agile):** TDD (unit tests), ATDD (acceptance tests), BDD (behavior specs)
**Separate Repository (uses domain frameworks):**
| Testing Type | Framework | Rationale |
|--------------|-----------|-----------|
| QA Automation | QA-Automation | Independent codebase, different release cycle |
| Performance | Performance | Specialized tooling, separate infrastructure |
| Security | Security | Scan configs, vulnerability tracking, compliance |
| Chaos | Chaos | Experiment definitions, separate from deployment |
| Contract Testing | Contract-Testing | Cross-repo coordination between teams |
| Accessibility | Accessibility | Flexible: Embedded OR Separate |
**Key Resources:** Test-Plan-Template.md (generic test plan structure); Testing-Framework-Selection-Guide.md (decision guide for embedded vs separate repository and framework selection)
**Integration:** Domain review criteria loaded by `/review-issue`, `/review-proposal`, `/review-prd` via the `--with` flag; extension registry at `.claude/metadata/review-extensions.json`; domain frameworks extend IDPF-Agile for test development methodology
---
**System Instructions**
**Location:** `System-Instructions/`
**Purpose:** Define assistant identity, expertise, and behavioral patterns
**Domain Specialization Architecture (Current)** — Domain Specialist loaded at session startup
- **17 Domain Specialists**: Specialized expertise profiles loaded based on `domainSpecialist` in `framework-config.json`
- **Domain-Selection-Guide.md**: Guide for choosing appropriate specialist (reference only, not distributed)
**Loading Pattern:**
1. Session startup reads `domainSpecialist` from `framework-config.json`
2. Resolves specialist file in `System-Instructions/Domain/Base/` or `Domain/Pack/`
3. Reads specialist file into context (non-blocking if not found)
**Domain Specialist System Instructions — Base (8), one selected at install**
**1. Mobile-Specialist.md**
- iOS development (Swift, SwiftUI, UIKit)
- Android development (Kotlin, Jetpack Compose)
- Cross-platform (React Native, Flutter, Ionic)
- Offline-first architecture, local storage
- Push notifications, deep linking, app store deployment
**2. Desktop-Application-Developer.md**
- Cross-platform desktop applications (Windows, macOS, Linux)
- UI frameworks (Qt, GTK, WinForms, WPF, Electron, Tauri)
- System integration and native APIs
- Packaging, distribution, and installers
**3. Embedded-Systems-Engineer.md**
- C/C++ for embedded systems
- ARM Cortex-M, AVR, ESP32 microcontrollers
- RTOS (FreeRTOS, Zephyr, ThreadX)
- Hardware protocols (I2C, SPI, UART, CAN)
- Low-level debugging, memory management
**4. Game-Developer.md**
- Game engines (Unity, Unreal, Godot)
- Game programming patterns (game loop, ECS, state machines)
- Physics, collision detection, and rendering
- Multiplayer networking and game services
**5. ML-Engineer.md**
- TensorFlow, PyTorch, scikit-learn, XGBoost
- Model development (supervised, unsupervised, reinforcement learning)
- Deep learning architectures (CNN, RNN, LSTM, Transformers, GANs)
- MLOps (MLflow, Kubeflow, SageMaker, model serving)
- Model optimization (quantization, pruning, distillation)
**6. Data-Engineer.md**
- ETL/ELT pipelines (Airflow, Prefect, Dagster)
- Data processing (Spark, Dask, Pandas)
- Data modeling (Kimball, Data Vault, star schema)
- Data warehousing (Snowflake, BigQuery, Redshift)
- Data quality, lineage, governance
**7. SRE-Specialist.md**
- SLO/SLI/SLA definition and management
- Error budgets, reliability engineering
- Observability (logs, metrics, traces, distributed tracing)
- Incident response, postmortems, blameless culture
- Chaos engineering, resilience testing
**8. Systems-Programmer-Specialist.md**
- Low-level systems programming (memory, concurrency, I/O)
- Operating system internals and kernel development
- Compilers, interpreters, and language runtimes
- Performance-critical code and hardware interaction
**Pack (9) — JIT loading**
**9. Database-Engineer.md**
- Schema design, normalization, indexing strategies
- Query optimization, execution plans, EXPLAIN analysis
- Replication (master-slave, master-master, sharding)
- Migrations (Alembic, Flyway, Liquibase, Rails migrations)
- Technologies: PostgreSQL, MySQL, MongoDB, Redis, Cassandra
**10. Security-Engineer.md**
- OWASP Top 10 vulnerabilities
- Authentication (OAuth 2.0, OpenID Connect, SAML, multi-factor)
- Cryptography (hashing, encryption, key management)
- Penetration testing, security audits
- Compliance (SOC 2, GDPR, HIPAA)
**11. QA-Test-Engineer.md**
- Test strategy, test pyramid, risk-based testing
- Test automation (Cypress, Playwright, Selenium, Appium)
- Performance testing (k6, JMeter, Gatling, Locust)
- TDD/BDD methodologies (RSpec, Cucumber, Jest, pytest)
- CI integration, test reporting, coverage analysis
**12. Performance-Engineer.md**
- Application performance optimization
- Profiling (CPU, memory, database profiling)
- Load testing (k6, Gatling, JMeter, Locust)
- Frontend performance (Core Web Vitals, lighthouse)
- Backend performance (query optimization, caching, CDN)
- APM tools (New Relic, Datadog, AppDynamics)
**13. Accessibility-Specialist.md**
- WCAG 2.1/2.2 guidelines and compliance
- Assistive technology testing (screen readers, keyboard navigation)
- Accessibility auditing and remediation
- Legal compliance (ADA, Section 508, EAA)
**14. Graphics-Engineer-Specialist.md**
- Computer graphics fundamentals (rasterization, ray tracing)
- GPU programming (shaders, compute, GPGPU)
- Graphics APIs (Vulkan, DirectX, OpenGL, Metal, WebGPU)
- Rendering pipelines and optimization
**15. Technical-Writer-Specialist.md**
- Documentation engineering and docs-as-code workflows
- API documentation (OpenAPI, AsyncAPI)
- Documentation generators (Docusaurus, MkDocs, Sphinx)
- Technical writing best practices and style guides
**16. UX-Designer.md**
- Layout systems (column, modular, hierarchical, baseline grids)
- Spacing scales and whitespace as a design element
- Visual hierarchy and CTA weighting
- Interaction design and usability
**17. Brand-Strategist.md**
- Brand architecture and portfolio rationalization
- Positioning (audience, category, differentiation, reason to believe)
- Brand pillars and supporting proof points
- Brand values, purpose, and voice
**Domain Selection Guide — Quick Reference:**
- **Mobile App**: Core + Mobile + Database
- **Data Platform**: Core + Data-Engineer + Database-Engineer
- **Secure Production System**: Core + Security + SRE
- **Game / Graphics**: Core + Game-Developer + Graphics-Engineer-Specialist
- **General web / API / full-stack**: Core only, plus Packs on demand
**Decision Tree:** reliability → SRE-Specialist | data → Data-Engineer + Database-Engineer | mobile apps → Mobile-Specialist | security → Security-Engineer | performance → Performance-Engineer | machine learning → ML-Engineer | embedded/IoT → Embedded-Systems-Engineer | testing → QA-Test-Engineer | accessibility → Accessibility-Specialist | desktop apps → Desktop-Application-Developer | game development → Game-Developer | graphics/rendering → Graphics-Engineer-Specialist | systems/low-level → Systems-Programmer-Specialist | documentation → Technical-Writer-Specialist | interaction/visual design → UX-Designer | brand positioning → Brand-Strategist | general web, API, or full-stack → Core only (no specialist)
**Multiple domains can be combined for cross-functional expertise.**
**Organizational Expectations (Project-Owned Channel)**
A domain specialist carries knowledge the **framework maintainer** curates — enumerable domain payload such as WCAG SC numbers or cipher allow-lists. It cannot carry rules that are true only in one project: a coverage floor, a forbidden dependency, a no-deploy-Friday policy.
That is a separate channel, owned by the **project owner**: a hand-authored `.claude/Organizational-Expectations.md` in the project (not the hub), kept to 1–2 KB and committed so every teammate gets it on clone. It reaches sessions via a conditional Read directive in the CLAUDE.md that Praxis Hub Manager emits.
| | Domain specialist | Organizational expectations |
|---|---|---|
| Owner | Framework maintainer | Project owner / team |
| Carries | Domain payload the base model tends to omit | Team-local rules no model can infer |
| Location | `System-Instructions/Domain/` (hub) | `.claude/Organizational-Expectations.md` (project) |
| Size | ~10–18 KB | 1–2 KB |
**Full convention** — content examples, size rationale, the Tier 1 compaction consequence, and the Praxis Hub Manager delivery contract: `Reference/Organizational-Expectations.md`.
**Critical Requirement:** System Instructions are **REQUIRED** for all framework operation. Frameworks define process; System Instructions define identity and expertise.
---
**Skills**
**Location:** `Skills/`
**Purpose:** Reusable capabilities for specific tasks
**Total Skills:** 34 (6 TDD/BDD, 1 PRD, 2 code quality, 1 code analysis, 2 beginner setup, 3 beginner support, 2 database, 2 advanced testing, 3 architecture, 1 DevOps, 2 testing/browser, 1 desktop, 1 diagrams, 4 deployment platforms, 1 SEO, 1 privacy compliance, 2 platform)
**TDD Skills (Experienced Developers):**
- **tdd-red-phase**: RED phase — failing tests, verified failures; test structure (AAA), assertion patterns, failure verification. Used when starting a behavior via `work #N`.
- **tdd-green-phase**: GREEN phase — minimal implementation to pass; YAGNI, regression checking, avoiding over-implementation. Used after RED verified failing.
- **tdd-refactor-phase**: REFACTOR phase — improvement while tests stay green; refactoring analysis, rollback procedures, when to skip.
- **tdd-failure-recovery**: unexpected test behaviors; diagnostics per phase, recovery steps, rollback commands, test isolation.
- **test-writing-patterns** (Standalone): AAA pattern, Given-When-Then, assertion strategies, test doubles (mock/stub/fake/spy), framework-agnostic.
- **bdd-writing** (Standalone): Gherkin syntax, feature files, scenarios, step definitions, scenario outlines, data tables. Tools: Cucumber (JS/Java/Ruby), pytest-bdd, SpecFlow, Behave, RSpec. Drives the TDD outer loop.
**PRD Skills:**
- **create-prd**: transform proposals into PRDs using `Inception/` context — proposal analysis, charter alignment, user story generation, acceptance criteria. Supersedes deprecated IDPF-PRD; feeds into Create-Backlog.
**Code Quality Skills:**
- **anti-pattern-analysis**: systematic anti-pattern detection during code review — design/OOP patterns, code smells, architecture, database, testing and security patterns; language-specific guides (JavaScript, Python).
**Beginner Setup:**
- **flask-setup**: Python Flask environment — virtual environment, dependency installation, verification.
- **sinatra-setup**: Ruby Sinatra environment — Bundler, Gemfile creation, dependency installation, verification.
**Beginner Support:**
- **common-errors**: troubleshooting reference — error diagnosis, solutions, explanations (Flask, Sinatra, general).
- **sqlite-integration**: database integration — setup, basic queries, schema creation.
- **beginner-testing**: testing introduction — test writing basics, assertions, simple TDD cycle.
**Skill Characteristics:** packaged as distributable units (SKILL.md + resources/ + LICENSE.txt); provide copy/paste Claude Code instruction blocks (NOT manual instructions); include verification checklists and resource files. Beginner skills give detailed explanations with language-specific examples; TDD skills are framework-agnostic, experienced-developer focused, and integrated with IDPF frameworks.
---
**Assistant Guidelines**
**Location:** `Assistant/`
**Purpose:** Ensure accuracy, prevent hallucination, maintain quality standards
**Total Guidelines:** 2 documents
**Anti-Hallucination Rules for Software Development**
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
**Confidence Level Indicators:** High ("This is the standard approach..."); Medium ("This is commonly done by..."); Low ("This might work, but I'm not certain..."); No confidence ("I don't have reliable information about [X]")
**Auto-trigger Web Search:** "current" or "latest" anything; recent releases/updates; uncertain API syntax; installation on a specific OS; breaking changes between versions
**Decision Trees:** specific syntax → check certainty, verify in docs, search if needed; unclear requirements → ask clarifying questions; missing context → request specific information
**File Operations:** always READ files before editing; verify paths exist before referencing; enumerate ALL files before bulk operations; track progress on multi-file changes
**Anti-Hallucination Rules for Skill Creation**
Skill creation guidance lives in the `idpf-praxis-skills` repository. This repo (`idpf-praxis-dev`) no longer ships a skill-creation anti-hallucination rules file — skill source development is out of scope per the charter.
---
**Rules Auto-Loading (v2.9+)**
**Location:** `.claude/rules/`
**Purpose:** Automatically load essential rules at session start without explicit file reads
Claude Code automatically loads all `.md` files from `.claude/rules/` at session start. This eliminates the need for explicit file reads in startup procedures and ensures rules persist after compaction.
| File | Content | Source |
|------|---------|--------|
| `01-anti-hallucination.md` | Framework development quality rules | `Assistant/Anti-Hallucination-Rules-for-Framework-Development.md` |
| `02-github-workflow.md` | GitHub issue management integration | `Reference/GitHub-Workflow.md` |
| `03-startup.md` | Startup procedure and on-demand loading | `Reference/Session-Startup-Instructions.md` |
**Benefits:** no explicit reads; compact-resilient (rules persist after context compaction); simplified startup (CLAUDE.md references rules rather than containing procedures); ~47% fewer tokens at startup
**Source of Truth:** `Assistant/` and `Reference/` contain authoritative content; rules files are built from source at release time (Phase 2e of /prepare-release); user projects have rules generated by the hub installer at installation time.
**Naming Convention:** files are numbered for load order (`01-`, `02-`, `03-`); lower numbers load first.
---
**Framework Integration Architecture**
**Dependency Hierarchy:**
```
System Instructions (REQUIRED foundation - WHO + EXPERTISE)
    |
Framework Selection (WHAT process to follow)
    |
Skills (TOOLS for specific capabilities)
    |
Assistant Guidelines (HOW WELL - quality control)
```
**Use IDPF-Agile when:** building products with defined or evolving requirements; iterative delivery with regular feedback; feature prioritization based on user value; any project size; structured backlog and story management needed; team collaboration requires structured workflow
**Common Elements Across Frameworks:**
- **TDD Methodology**: RED-GREEN-REFACTOR cycles, identical test-writing discipline, same verification requirements, skills invoked at appropriate phases
- **Claude Code Communication**: single code block format (numbered STEPs), complete runnable code with no placeholders, exact file paths and verification steps, two-tool workflow (ASSISTANT + Claude Code + User)
- **Context Preservation**: awareness of previous steps/decisions, cumulative conversation context, session continuity
- **Git Workflows**: GitFlow, GitHub Flow, trunk-based; Conventional Commits; PR creation and code reviews; branch management
---
**Framework Ecosystem Summary**
**Total Components:**
- **1 Development Process Framework**: IDPF-Agile
- **Domains**: 11 domain knowledge libraries (QA-Automation, Performance, Security, Accessibility, Chaos, Contract-Testing, API-Design, Observability, Privacy, SEO, i18n) in Domains/
- **System Instructions**: 1 Core + 17 Domain Specialists + 1 Domain Selection Guide + 1 Legacy
- **38 Skills**: 6 TDD/BDD (experienced), 2 code quality, 1 code analysis, 2 beginner setup, 3 beginner support, 2 database, 2 advanced testing, 3 architecture, 2 DevOps (incl. observability-setup), 2 testing/browser, 2 desktop (incl. electron-cross-build), 1 diagrams, 4 deployment platforms, 1 SEO, 1 privacy compliance, 2 platform, 1 i18n, 1 test scaffolding
- **2 Assistant Guideline Documents**: Software dev (with file operations), Skill creation
> IDPF-PRD was deprecated in v0.24; requirements engineering now uses the `create-prd` skill.
**Integration Model:**
- **System Instructions** = WHO + DOMAIN — 17 Domain Specialists (Database, Security, Mobile, Data, QA-Test, SRE, Embedded, ML, Performance, Accessibility, Desktop-App, Game, Graphics, Systems-Programmer, Technical-Writer, UX-Designer, Brand-Strategist), loaded at startup from `domainSpecialist` in `framework-config.json`
- **Frameworks** = WHAT — Agile: user stories, TDD cycles, backlog management (terminal framework); Domains: knowledge libraries for reviews
- **Skills** = TOOLS — `/create-prd` for requirements engineering (pre-development), TDD phases, beginner setup and support
- **Assistant Guidelines** = HOW WELL — anti-hallucination, accuracy, verification
**Critical Success Factors:**
1. System Instructions MUST be loaded before framework use
2. Single code block format strictly enforced
3. TDD discipline maintained throughout
4. Context preservation across session
5. Anti-hallucination rules applied continuously
**Framework Selection Matrix:**
| Project Type | Starting Point | Evolution Path | Target Outcome |
|--------------|---------------|----------------|----------------|
| Defined requirements | IDPF-Agile | Terminal | Story-driven delivery with TDD |
| Need requirements | `/create-prd` | PRD to Agile | Implementation-ready PRD |
| Separate test repository | Domains/ + IDPF-* | Agile for test dev | Test automation codebase |
---
**Document Maintenance**
**Version Control:** increment version for any content change; document changes in git commit messages and CHANGELOG.md
**Update Frequency:** after framework revisions published; after new skills added; after system instruction updates; after framework transitions added/modified; quarterly comprehensive review recommended
**Quality Assurance:** verify all file paths remain valid; confirm version numbers match source files; validate framework integration patterns; ensure transition matrix accuracy
**Update Process:**
1. Read all framework directories (exclude merged, refactoring, generic)
2. Extract current revision numbers and key features
3. Update Framework-Overview.md with new content
4. Increment version number
5. Commit with descriptive message
