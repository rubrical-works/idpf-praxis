# Framework Skills Reference
**Version:** v0.63.1
**Purpose:** Detailed reference for all Skills
---
## Skills Overview
**Location:** `Skills/`
**Purpose:** Reusable capabilities for specific tasks
**Total Skills:** 34 (6 TDD/BDD, 1 PRD, 2 code quality, 1 code analysis, 2 beginner setup, 3 beginner support, 2 database, 2 advanced testing, 3 architecture, 1 DevOps, 2 testing/browser, 1 desktop, 1 diagrams, 4 deployment platforms, 1 SEO, 1 privacy compliance, 2 platform)
### Skill Characteristics
- Packaged as distributable units (SKILL.md + resources/ + LICENSE.txt)
- Provide copy/paste Claude Code instruction blocks (NOT manual instructions)
- Include verification checklists and resource files
- Beginner Skills: Detailed explanations with language-specific examples
- TDD Skills: Framework-agnostic, experienced developer focus, integrated with IDPF frameworks
### Installing Skills
**1. Automatic (via `/charter`):** Skills auto-suggested based on tech stack during charter creation.
**2. Manual (via `/manage-skills`):**
```
/manage-skills list                   # Show available and installed skills
/manage-skills install <skill-name>   # Install a specific skill
/manage-skills remove <skill-name>    # Remove an installed skill
/manage-skills info <skill-name>      # View skill details
```
**Skill Location:** `.claude/skills/{skill-name}/`
---
## TDD Skills (Experienced Developers)
### tdd-red-phase
**Function:** Guide through RED phase - writing failing tests and verifying expected failures
**Coverage:** Test structure (AAA pattern), assertion patterns, failure verification, Claude Code format
**When Used:** Starting new feature/behavior via `work #N` trigger
**Resources:** RED phase checklist, test structure patterns, failure verification guide
---
### tdd-green-phase
**Function:** Guide through GREEN phase - minimal implementation to pass failing tests
**Coverage:** YAGNI principle, implementation strategies, regression checking, avoid over-implementation
**When Used:** After RED phase test verified as failing
**Resources:** GREEN phase checklist, minimal implementation guide, triangulation examples
---
### tdd-refactor-phase
**Function:** Guide through REFACTOR phase - code improvement while maintaining green tests
**Coverage:** Refactoring analysis via Claude Code, rollback procedures, when to skip refactoring
**When Used:** After GREEN phase success
**Resources:** Refactor checklist, common refactorings, when to skip guide
---
### tdd-failure-recovery
**Function:** Handle unexpected test behaviors and recovery procedures
**Coverage:** Failure diagnostics for RED/GREEN/REFACTOR phases, recovery steps, rollback commands, test isolation
**When Used:** Test behaves unexpectedly, need to rollback to previous working state
**Resources:** Failure diagnostic flowchart, recovery procedures, test isolation guide
---
### test-writing-patterns
**Function:** Test structure, patterns, assertions, test doubles guidance (Standalone)
**Coverage:** AAA pattern, Given-When-Then, assertion strategies, test doubles (mock/stub/fake/spy), framework-agnostic
**When Used:** Need guidance on test structure, assertions, or test doubles
**Resources:** AAA template, test doubles guide, assertion patterns, test organization examples
---
### bdd-writing
**Function:** BDD specification writing with Gherkin syntax (Standalone)
**Coverage:** Feature files, scenarios, Given-When-Then, step definitions, scenario outlines, data tables
**When Used:** Writing acceptance criteria as executable specifications
**Tools:** Cucumber (JS/Java/Ruby), pytest-bdd, SpecFlow, Behave, RSpec
**Resources:** Gherkin syntax reference, feature file templates, step definition patterns, tool comparison
**Integration:** Complements test-writing-patterns, drives TDD outer loop
---
## Code Quality Skills
### anti-pattern-analysis
**Function:** Systematic detection of anti-patterns during code review
**Coverage:** Design/OOP patterns, code smells, architecture issues, database patterns, testing patterns, security patterns
**When Used:** Code reviews, refactoring planning, technical debt assessment, Reverse-PRD extraction
**Resources:** General/architecture/testing/database anti-patterns, code review checklist, language-specific guides (JS, Python)
**Integration:** Supports code review and technical debt assessment workflows
---
### codebase-analysis
**Function:** Comprehensive codebase analysis and documentation extraction
**Coverage:** Architecture discovery, dependency mapping, code structure analysis, documentation extraction
**When Used:** Understanding new codebases, documenting existing systems, pre-refactoring analysis
**Resources:** Analysis templates, structure patterns
**Integration:** Used by `/create-prd extract` and `/charter` extraction modes
---
## Beginner Setup Skills
### flask-setup
**Function:** Python Flask environment setup with step-by-step guidance
**Coverage:** Virtual environment creation, dependency installation, verification
---
### sinatra-setup
**Function:** Ruby Sinatra environment setup
**Coverage:** Bundler, Gemfile creation, dependency installation, verification
---
## Beginner Support Skills
### common-errors
**Function:** Troubleshooting reference for common development issues
**Resources:** Flask errors, Sinatra errors, general programming errors
---
### sqlite-integration
**Function:** Database integration guidance for beginners
**Resources:** Flask SQLite example, Sinatra SQLite example, SQL basics
---
### beginner-testing
**Function:** Testing introduction and TDD methodology education
**Resources:** Flask test example, Sinatra test example, TDD explained
---
## Database Skills
### postgresql-integration
**Function:** PostgreSQL database setup, connection pooling, and query patterns
**Coverage:** Connection setup, pooling strategies, query patterns, transactions, error handling
**Resources:** setup-guide.md, query-patterns.md, common-errors.md
---
### migration-patterns
**Function:** Database schema versioning, migration strategies, and rollback procedures
**Coverage:** Schema versioning, forward/backward migrations, rollback, zero-downtime migrations
**Tools:** Flyway, Alembic, Prisma, etc.
**Resources:** versioning-strategies.md, rollback-guide.md, zero-downtime.md
---
## Advanced Testing Skills
### property-based-testing
**Function:** Property-based testing patterns with framework-specific guidance
**Coverage:** Property definition patterns, shrinking strategies, generator composition, unit test integration
**Tools:** Hypothesis (Python), fast-check (JS/TS), QuickCheck (Haskell/Erlang)
**Resources:** property-patterns.md, shrinking-guide.md, framework-examples.md
---
### mutation-testing
**Function:** Mutation testing operators and test suite quality assessment
**Coverage:** Mutation operators by category, score interpretation, test suite improvement, framework config
**Tools:** mutmut (Python), Stryker (JS/TS/.NET), PIT (Java)
**Resources:** operator-guide.md, score-interpretation.md, framework-examples.md
---
## Architecture Skills
### api-versioning
**Function:** API versioning strategies and deprecation workflows
**Coverage:** URL path versioning, header-based, content negotiation, deprecation workflows, backward compatibility
**Resources:** strategy-comparison.md, deprecation-workflow.md, compatibility-guide.md
---
### error-handling-patterns
**Function:** Error hierarchy design and API error response patterns
**Coverage:** Error hierarchy patterns, API error responses, logging integration, recovery strategies, user-facing vs internal errors
**Resources:** hierarchy-patterns.md, api-errors.md, logging-integration.md
---
## DevOps Skills
### ci-cd-pipeline-design
**Function:** CI/CD pipeline architecture and platform-specific configuration
**Coverage:** Pipeline architecture, stage design (build/test/security/deploy), environment promotion, security
**Platforms:** GitHub Actions, GitLab CI, Jenkins, Azure DevOps
**Resources:** architecture-patterns.md, stage-design.md, platform-examples.md, security-checklist.md
---
## Deployment Platform Skills
### vercel-project-setup
**Function:** Vercel deployment setup with preview deployments and edge functions
**When Used:** Deploying frontend, Next.js, or static sites to Vercel
---
### railway-project-setup
**Function:** Railway deployment setup with Nixpacks and preview environments
**When Used:** Deploying full-stack apps and background workers to Railway
---
### render-project-setup
**Function:** Render deployment setup with Blueprints and preview environments
**When Used:** Deploying web services with managed infrastructure on Render
---
### digitalocean-app-setup
**Function:** DigitalOcean App Platform deployment with review apps
**When Used:** Deploying multi-component apps with databases to DigitalOcean
---
## Testing Setup Skills
### playwright-setup
**Function:** Playwright test automation framework setup and configuration
**Coverage:** Installation, browser configuration, test runner setup, CI/CD integration
---
## Desktop Skills
### electron-development
**Function:** Electron desktop application development patterns and best practices
**Coverage:** Setup, main/renderer process architecture, IPC communication, packaging/distribution
---
### drawio-generation
**Function:** Generate Draw.io XML diagram files from architecture and design discussions
**Coverage:** Draw.io XML format, generation patterns (architecture/sequence/flow), shape style catalog, Material Design colors, validation checklist
**Resources:** file-format-spec.md, generation-patterns.md, shape-style-catalog.md, color-palette.md, validation-checklist.md
---
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
- drawio-generation - Draw.io diagram generation
- electron-development - Electron desktop application development
---
**End of Framework Skills Reference**
