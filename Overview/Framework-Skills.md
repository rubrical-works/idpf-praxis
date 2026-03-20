# Framework Skills Reference
**Version:** v0.66.4

**Purpose:** Detailed reference for all Skills

## Skills Overview

**Location:** `Skills/`
**Purpose:** Reusable capabilities for specific tasks
**Total Skills:** 38 (6 TDD/BDD, 1 PRD, 2 code quality, 1 code analysis, 2 beginner setup, 3 beginner support, 2 database, 2 advanced testing, 3 architecture, 2 DevOps (incl. observability-setup), 2 testing/browser, 2 desktop (incl. electron-cross-build), 1 diagrams, 4 deployment platforms, 1 SEO, 1 privacy compliance, 2 platform, 1 i18n, 1 test scaffolding)

### Skill Characteristics
- Packaged as distributable units (SKILL.md + resources/ + LICENSE.txt)
- Provide copy/paste Claude Code instruction blocks (NOT manual instructions)
- Include verification checklists and resource files
- Beginner Skills: Detailed explanations with language-specific examples
- TDD Skills: Framework-agnostic, experienced developer focus, integrated with IDPF frameworks

### Installing Skills

Skills can be installed in two ways:

**1. Automatic (via `/charter`):**
During charter creation, skills are automatically suggested based on your tech stack and deployed to your project.

**2. Manual (via px-manager):**
Use the px-manager hub manager to install, remove, and update skills. Skill suggestions from PRD/backlog creation are persisted to `framework-config.json` → `suggestedSkills` for px-manager discovery.

**Skill Location:** Installed skills are placed in `.claude/skills/{skill-name}/`.

## TDD Skills (Experienced Developers)

### tdd-red-phase
**Function:** Guide through RED phase - writing failing tests and verifying expected failures

**Coverage:**
- Test structure (AAA pattern)
- Assertion patterns
- Failure verification
- Claude Code format

**When Used:** Starting new feature/behavior via `work #N` trigger

**Resources:** RED phase checklist, test structure patterns, failure verification guide

### tdd-green-phase
**Function:** Guide through GREEN phase - minimal implementation to pass failing tests

**Coverage:**
- YAGNI principle
- Implementation strategies
- Regression checking
- Avoid over-implementation

**When Used:** After RED phase test verified as failing

**Resources:** GREEN phase checklist, minimal implementation guide, triangulation examples

### tdd-refactor-phase
**Function:** Guide through REFACTOR phase - code improvement while maintaining green tests

**Coverage:**
- Refactoring analysis via Claude Code
- Rollback procedures
- When to skip refactoring

**When Used:** After GREEN phase success

**Resources:** Refactor checklist, common refactorings, when to skip guide

### tdd-failure-recovery
**Function:** Handle unexpected test behaviors and recovery procedures

**Coverage:**
- Failure diagnostics for RED/GREEN/REFACTOR phases
- Recovery steps
- Rollback commands
- Test isolation

**When Used:** Test behaves unexpectedly, need to rollback to previous working state

**Resources:** Failure diagnostic flowchart, recovery procedures, test isolation guide

### test-writing-patterns
**Function:** Test structure, patterns, assertions, test doubles guidance (Standalone)

**Coverage:**
- AAA pattern
- Given-When-Then
- Assertion strategies
- Test doubles (mock/stub/fake/spy)
- Framework-agnostic

**When Used:** Need guidance on test structure, assertions, or test doubles

**Resources:** AAA template, test doubles guide, assertion patterns, test organization examples

### bdd-writing
**Function:** BDD specification writing with Gherkin syntax (Standalone)

**Coverage:**
- Feature files
- Scenarios
- Given-When-Then
- Step definitions
- Scenario outlines
- Data tables

**When Used:** Writing acceptance criteria as executable specifications, creating feature files, defining step definitions

**Tools:** Cucumber (JS/Java/Ruby), pytest-bdd, SpecFlow, Behave, RSpec

**Resources:** Gherkin syntax reference, feature file templates, step definition patterns, tool comparison

**Integration:** Complements test-writing-patterns, drives TDD outer loop

## Code Quality Skills

### anti-pattern-analysis
**Function:** Systematic detection of anti-patterns during code review

**Coverage:**
- Design/OOP patterns
- Code smells
- Architecture issues
- Database patterns
- Testing patterns
- Security patterns

**When Used:** Code reviews, refactoring planning, technical debt assessment, Reverse-PRD extraction

**Resources:**
- General anti-patterns
- Architecture anti-patterns
- Testing anti-patterns
- Database anti-patterns
- Code review checklist
- Language-specific guides (JavaScript, Python)

**Integration:** Supports code review and technical debt assessment workflows

**Audience:** Experienced developers performing code reviews

### codebase-analysis
**Function:** Comprehensive codebase analysis and documentation extraction

**Coverage:**
- Architecture discovery
- Dependency mapping
- Code structure analysis
- Documentation extraction

**When Used:** Understanding new codebases, documenting existing systems, pre-refactoring analysis

**Resources:** Analysis templates, structure patterns

**Integration:** Used by `/create-prd extract` and `/charter` extraction modes

**Audience:** Experienced developers analyzing existing codebases

## Beginner Setup Skills

### flask-setup
**Function:** Python Flask environment setup with step-by-step guidance

**Coverage:**
- Virtual environment creation
- Dependency installation
- Verification

**Format:** Claude Code copy/paste blocks

**Audience:** Beginners

### sinatra-setup
**Function:** Ruby Sinatra environment setup

**Coverage:**
- Bundler
- Gemfile creation
- Dependency installation
- Verification

**Format:** Claude Code copy/paste blocks

**Audience:** Beginners

## Beginner Support Skills

### common-errors
**Function:** Troubleshooting reference for common development issues

**Resources:**
- Flask errors
- Sinatra errors
- General programming errors

**Coverage:** Error diagnosis, solutions, explanations

**Audience:** Beginners

### sqlite-integration
**Function:** Database integration guidance for beginners

**Resources:**
- Flask SQLite example
- Sinatra SQLite example
- SQL basics

**Coverage:** Database setup, basic queries, schema creation

**Audience:** Beginners

### beginner-testing
**Function:** Testing introduction and TDD methodology education

**Resources:**
- Flask test example
- Sinatra test example
- TDD explained

**Coverage:** Test writing basics, assertion introduction, simple TDD cycle

**Audience:** Beginners

## Database Skills

### postgresql-integration
**Function:** PostgreSQL database setup, connection pooling, and query patterns

**Coverage:**
- Connection setup and configuration
- Connection pooling strategies
- Query patterns and prepared statements
- Transaction handling
- Error handling and recovery

**When Used:** Setting up PostgreSQL in new projects, optimizing database performance

**Resources:** setup-guide.md, query-patterns.md, common-errors.md

**Audience:** Intermediate to experienced developers

### migration-patterns
**Function:** Database schema versioning, migration strategies, and rollback procedures

**Coverage:**
- Schema versioning strategies
- Forward and backward migrations
- Rollback procedures
- Zero-downtime migrations
- Tool guidance (Flyway, Alembic, Prisma, etc.)

**When Used:** Managing database schema changes in production systems

**Resources:** versioning-strategies.md, rollback-guide.md, zero-downtime.md

**Audience:** Intermediate to experienced developers

## Advanced Testing Skills

### property-based-testing
**Function:** Property-based testing patterns with framework-specific guidance

**Coverage:**
- Property definition patterns
- Shrinking strategies
- Generator composition
- Integration with unit tests

**When Used:** Testing functions with many edge cases, finding unexpected bugs

**Tools:** Hypothesis (Python), fast-check (JS/TS), QuickCheck (Haskell/Erlang)

**Resources:** property-patterns.md, shrinking-guide.md, framework-examples.md

**Audience:** Intermediate to experienced developers

### mutation-testing
**Function:** Mutation testing operators and test suite quality assessment

**Coverage:**
- Mutation operators by category
- Score interpretation
- Test suite improvement
- Framework configuration

**When Used:** Evaluating test suite effectiveness, improving test coverage quality

**Tools:** mutmut (Python), Stryker (JS/TS/.NET), PIT (Java)

**Resources:** operator-guide.md, score-interpretation.md, framework-examples.md

**Audience:** Intermediate to experienced developers

## Architecture Skills

### api-versioning
**Function:** API versioning strategies and deprecation workflows

**Coverage:**
- URL path versioning
- Header-based versioning
- Content negotiation
- Deprecation workflows
- Backward compatibility

**When Used:** Designing APIs, managing API evolution, deprecating old versions

**Resources:** strategy-comparison.md, deprecation-workflow.md, compatibility-guide.md

**Audience:** Intermediate to experienced developers

### error-handling-patterns
**Function:** Error hierarchy design and API error response patterns

**Coverage:**
- Error hierarchy patterns
- API error responses
- Logging integration
- Error recovery strategies
- User-facing vs internal errors

**When Used:** Designing error handling strategies, standardizing API errors

**Resources:** hierarchy-patterns.md, api-errors.md, logging-integration.md

**Audience:** Intermediate to experienced developers

## DevOps Skills

### ci-cd-pipeline-design
**Function:** CI/CD pipeline architecture and platform-specific configuration

**Coverage:**
- Pipeline architecture patterns
- Stage design (build, test, security, deploy)
- Environment promotion strategies
- Security best practices
- Platform-specific guidance

**When Used:** Setting up CI/CD pipelines, improving deployment workflows

**Platforms:** GitHub Actions, GitLab CI, Jenkins, Azure DevOps

**Resources:** architecture-patterns.md, stage-design.md, platform-examples.md, security-checklist.md

**Audience:** Intermediate to experienced developers

## Deployment Platform Skills

### vercel-project-setup
**Function:** Guide through Vercel deployment setup with preview deployments and edge functions

**Coverage:**
- Vercel project configuration (`vercel.json`)
- GitHub integration and preview deployments
- Environment variable setup
- GitHub Actions deployment workflow

**When Used:** Deploying frontend, Next.js, or static sites to Vercel

**Resources:** vercel.json reference, deploy.yml workflow, env-setup.md

### railway-project-setup
**Function:** Guide through Railway deployment setup with Nixpacks and preview environments

**Coverage:**
- Railway project configuration (`railway.toml`)
- GitHub integration and preview environments
- Environment variable setup
- GitHub Actions deployment workflow

**When Used:** Deploying full-stack apps and background workers to Railway

**Resources:** railway.toml reference, deploy.yml workflow, env-setup.md

### render-project-setup
**Function:** Guide through Render deployment setup with Blueprints and preview environments

**Coverage:**
- Render Blueprint configuration (`render.yaml`)
- GitHub integration and preview environments
- Environment variable setup
- GitHub Actions deployment workflow

**When Used:** Deploying web services with managed infrastructure on Render

**Resources:** render.yaml reference, deploy.yml workflow, env-setup.md

### digitalocean-app-setup
**Function:** Guide through DigitalOcean App Platform deployment with review apps

**Coverage:**
- App Platform app spec configuration (`app-spec.yaml`)
- GitHub integration and review apps
- `doctl` CLI setup and usage
- Deployment strategies and monitoring

**When Used:** Deploying multi-component apps with databases to DigitalOcean

**Resources:** app-spec.yaml reference, deploy.yml workflow, env-setup.md

## Testing Setup Skills

### playwright-setup
**Function:** Playwright test automation framework setup and configuration

**Coverage:**
- Playwright installation
- Browser configuration
- Test runner setup
- CI/CD integration

**When Used:** Setting up end-to-end testing with Playwright

**Resources:** setup-guide.md, config-examples.md

**Audience:** Intermediate to experienced developers

## Desktop Skills

### electron-development
**Function:** Electron desktop application development patterns and best practices

**Coverage:**
- Electron setup and configuration
- Main/renderer process architecture
- IPC communication patterns
- Packaging and distribution

**When Used:** Building cross-platform desktop applications with Electron

**Resources:** architecture-guide.md, ipc-patterns.md, packaging-guide.md

**Audience:** Intermediate to experienced developers

### electron-cross-build
**Function:** Cross-compile Electron apps from Linux to produce Windows executables

**Coverage:**
- Wine/Docker toolchain setup
- electron-builder and electron-forge cross-platform configuration
- Native module cross-compilation (node-gyp, prebuild-install)
- NSIS installer generation from Linux
- Code signing from Linux (Wine/signtool, cloud services)
- CI/CD pipeline examples (GitHub Actions)

**When Used:** Building Windows .exe from Linux CI/build environments

**Resources:** cross-build-guide.md

**Audience:** Intermediate to experienced developers with Electron experience

### drawio-generation
**Function:** Generate Draw.io XML diagram files from architecture and design discussions

**Coverage:**
- Draw.io XML file format specification
- Generation patterns for architecture, sequence, and flow diagrams
- Shape style catalog with consistent visual language
- Material Design color palette for professional styling
- Validation checklist for diagram correctness

**When Used:** Creating architecture diagrams, sequence diagrams, flowcharts, or any Draw.io-compatible diagram

**Resources:** file-format-spec.md, generation-patterns.md, shape-style-catalog.md, color-palette.md, validation-checklist.md

**Audience:** All developers needing visual documentation

### test-scaffold
**Function:** Generate testing infrastructure from IDPF testing domain knowledge

**Coverage:**
- Config generation for accessibility (axe-core), chaos (toxiproxy), contract (Pact), performance (k6), QA automation (Playwright), and security (semgrep, ZAP, gitleaks)
- Project detection for language, framework, and existing test setup
- Domain selection with single or multi-domain orchestration
- CI workflow generation (GitHub Actions)
- Ready-to-run test specs and configurations

**When Used:** Setting up testing infrastructure for a new or existing project

**Resources:** multi-domain-example.md, domains/ (6 domain modules)

**Audience:** Intermediate to experienced developers

## Framework-Skill Dependencies

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
