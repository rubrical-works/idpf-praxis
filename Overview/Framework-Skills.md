**Framework Skills Reference**
**Version:** v0.87.0
> **Note:** Skills have been migrated to [idpf-praxis-skills](https://github.com/rubrical-works/idpf-praxis-skills). Use `/fw-import-skills` to import skills for framework development.
**Location:** `idpf-praxis-skills` repository (formerly `Skills/` in this repo)
**Total Skills:** 38 (6 TDD/BDD, 1 PRD, 2 code quality, 1 code analysis, 2 beginner setup, 3 beginner support, 2 database, 2 advanced testing, 3 architecture, 2 DevOps (incl. observability-setup), 2 testing/browser, 2 desktop (incl. electron-cross-build), 1 diagrams, 4 deployment platforms, 1 SEO, 1 privacy compliance, 2 platform, 1 i18n, 1 test scaffolding)
**Skill Characteristics:**
- Packaged as distributable units (SKILL.md + resources/ + LICENSE.txt)
- Provide copy/paste Claude Code instruction blocks (NOT manual instructions)
- Include verification checklists and resource files
- Beginner Skills: Detailed explanations with language-specific examples
- TDD Skills: Framework-agnostic, experienced developer focus, integrated with IDPF frameworks
**Installing Skills:**
1. **Automatic (via `/charter`):** Skills auto-suggested based on tech stack and deployed to project
2. **Manual (via px-manager):** Install, remove, update skills. PRD/backlog suggestions persisted to `framework-config.json` → `suggestedSkills`
**Skill Location:** `.claude/skills/{skill-name}/`
**TDD Skills (Experienced Developers)**
**tdd-red-phase** — RED phase: writing failing tests, verifying expected failures
- Coverage: Test structure (AAA), assertion patterns, failure verification
- When Used: Starting new feature/behavior via `work #N`
- Resources: RED phase checklist, test structure patterns, failure verification guide
**tdd-green-phase** — GREEN phase: minimal implementation to pass failing tests
- Coverage: YAGNI principle, implementation strategies, regression checking
- When Used: After RED phase test verified as failing
- Resources: GREEN phase checklist, minimal implementation guide, triangulation examples
**tdd-refactor-phase** — REFACTOR phase: code improvement while maintaining green tests
- Coverage: Refactoring analysis via Claude Code, rollback procedures, when to skip
- When Used: After GREEN phase success
- Resources: Refactor checklist, common refactorings, when to skip guide
**tdd-failure-recovery** — Handle unexpected test behaviors and recovery
- Coverage: Failure diagnostics for RED/GREEN/REFACTOR, recovery steps, rollback commands, test isolation
- When Used: Test behaves unexpectedly, need rollback
- Resources: Failure diagnostic flowchart, recovery procedures, test isolation guide
**test-writing-patterns** — Test structure, patterns, assertions, test doubles (Standalone)
- Coverage: AAA pattern, Given-When-Then, assertion strategies, test doubles (mock/stub/fake/spy), framework-agnostic
- Resources: AAA template, test doubles guide, assertion patterns, test organization examples
**bdd-writing** — BDD specification writing with Gherkin syntax (Standalone)
- Coverage: Feature files, scenarios, Given-When-Then, step definitions, scenario outlines, data tables
- Tools: Cucumber (JS/Java/Ruby), pytest-bdd, SpecFlow, Behave, RSpec
- Resources: Gherkin syntax reference, feature file templates, step definition patterns, tool comparison
- Integration: Complements test-writing-patterns, drives TDD outer loop
**Code Quality Skills**
**anti-pattern-analysis** — Systematic detection of anti-patterns during code review
- Coverage: Design/OOP, code smells, architecture, database, testing, security patterns
- When Used: Code reviews, refactoring planning, technical debt assessment, Reverse-PRD extraction
- Resources: General/architecture/testing/database anti-patterns, code review checklist, language-specific guides (JS, Python)
- Integration: Supports code review and technical debt assessment workflows
**codebase-analysis** — Comprehensive codebase analysis and documentation extraction
- Coverage: Architecture discovery, dependency mapping, code structure analysis, documentation extraction
- When Used: Understanding new codebases, documenting existing systems, pre-refactoring analysis
- Resources: Analysis templates, structure patterns
- Integration: Used by `/create-prd extract` and `/charter` extraction modes
**Beginner Setup Skills**
**flask-setup** — Python Flask environment setup (venv, deps, verification). Format: Claude Code copy/paste blocks.
**sinatra-setup** — Ruby Sinatra environment setup (Bundler, Gemfile, deps, verification). Format: Claude Code copy/paste blocks.
**Beginner Support Skills**
**common-errors** — Troubleshooting reference (Flask/Sinatra/general errors, diagnosis, solutions)
**sqlite-integration** — Database integration guidance (Flask/Sinatra SQLite examples, SQL basics, schema creation)
**beginner-testing** — Testing introduction and TDD methodology (Flask/Sinatra test examples, assertion intro, simple TDD cycle)
**Database Skills**
**postgresql-integration** — PostgreSQL setup, connection pooling, query patterns
- Coverage: Connection setup/config, pooling strategies, prepared statements, transactions, error handling/recovery
- Resources: setup-guide.md, query-patterns.md, common-errors.md
**migration-patterns** — Database schema versioning, migration strategies, rollback
- Coverage: Schema versioning, forward/backward migrations, rollback, zero-downtime migrations
- Tools: Flyway, Alembic, Prisma, etc.
- Resources: versioning-strategies.md, rollback-guide.md, zero-downtime.md
**Advanced Testing Skills**
**property-based-testing** — Property-based testing patterns
- Coverage: Property definition, shrinking strategies, generator composition, unit test integration
- Tools: Hypothesis (Python), fast-check (JS/TS), QuickCheck (Haskell/Erlang)
- Resources: property-patterns.md, shrinking-guide.md, framework-examples.md
**mutation-testing** — Mutation testing and test suite quality assessment
- Coverage: Mutation operators, score interpretation, test suite improvement, framework config
- Tools: mutmut (Python), Stryker (JS/TS/.NET), PIT (Java)
- Resources: operator-guide.md, score-interpretation.md, framework-examples.md
**Architecture Skills**
**api-versioning** — API versioning strategies and deprecation workflows
- Coverage: URL path versioning, header-based, content negotiation, deprecation workflows, backward compatibility
- Resources: strategy-comparison.md, deprecation-workflow.md, compatibility-guide.md
**error-handling-patterns** — Error hierarchy design and API error response patterns
- Coverage: Error hierarchy, API error responses, logging integration, recovery strategies, user-facing vs internal
- Resources: hierarchy-patterns.md, api-errors.md, logging-integration.md
**DevOps Skills**
**ci-cd-pipeline-design** — CI/CD pipeline architecture and platform-specific config
- Coverage: Pipeline architecture, stage design (build/test/security/deploy), environment promotion, security best practices
- Platforms: GitHub Actions, GitLab CI, Jenkins, Azure DevOps
- Resources: architecture-patterns.md, stage-design.md, platform-examples.md, security-checklist.md
**Deployment Platform Skills**
**vercel-project-setup** — Vercel deployment with preview deployments and edge functions
- Coverage: `vercel.json` config, GitHub integration, env vars, GitHub Actions workflow
- When Used: Frontend, Next.js, or static sites
**railway-project-setup** — Railway deployment with Nixpacks and preview environments
- Coverage: `railway.toml` config, GitHub integration, env vars, GitHub Actions workflow
- When Used: Full-stack apps and background workers
**render-project-setup** — Render deployment with Blueprints and preview environments
- Coverage: `render.yaml` config, GitHub integration, env vars, GitHub Actions workflow
- When Used: Web services with managed infrastructure
**digitalocean-app-setup** — DigitalOcean App Platform deployment with review apps
- Coverage: `app-spec.yaml` config, GitHub integration, `doctl` CLI, deployment strategies/monitoring
- When Used: Multi-component apps with databases
**Testing Setup Skills**
**playwright-setup** — Playwright test automation framework setup and configuration
- Coverage: Installation, browser config, test runner setup, CI/CD integration
- Resources: setup-guide.md, config-examples.md
**Desktop Skills**
**electron-development** — Electron desktop application development patterns
- Coverage: Setup/config, main/renderer process architecture, IPC communication, packaging/distribution
- Resources: architecture-guide.md, ipc-patterns.md, packaging-guide.md
**electron-cross-build** — Cross-compile Electron apps from Linux to Windows
- Coverage: Wine/Docker toolchain, electron-builder/forge cross-platform config, native module cross-compilation, NSIS installer from Linux, code signing from Linux, CI/CD examples
- Resources: cross-build-guide.md
**drawio-generation** — Generate Draw.io XML diagrams from architecture/design discussions
- Coverage: XML file format spec, generation patterns (architecture/sequence/flow), shape style catalog, Material Design color palette, validation checklist
- Resources: file-format-spec.md, generation-patterns.md, shape-style-catalog.md, color-palette.md, validation-checklist.md
**test-scaffold** — Generate testing infrastructure from IDPF testing domain knowledge
- Coverage: Config generation (axe-core, toxiproxy, Pact, k6, Playwright, semgrep/ZAP/gitleaks), project detection, domain selection, CI workflow generation, ready-to-run specs
- Resources: multi-domain-example.md, domains/ (6 domain modules)
**Framework-Skill Dependencies**
| Framework | Required Skills |
|-----------|----------------|
| IDPF-Agile | tdd-red-phase, tdd-green-phase, tdd-refactor-phase, tdd-failure-recovery, test-writing-patterns |
| IDPF-Vibe (vibe-newbie) | flask-setup, sinatra-setup, common-errors, sqlite-integration, beginner-testing |
| IDPF-Vibe (other variants) | (none currently) |
**Standalone Skills (not framework-specific):**
- anti-pattern-analysis - Code review and technical debt detection
- bdd-writing - BDD specification writing
- codebase-analysis - Comprehensive codebase analysis
- playwright-setup - Playwright test automation setup
- drawio-generation - Draw.io diagram generation from design discussions
- electron-development - Electron desktop application development
- electron-cross-build - Cross-compile Electron apps from Linux to Windows
**End of Framework Skills Reference**