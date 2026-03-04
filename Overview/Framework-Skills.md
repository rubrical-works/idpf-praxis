# Framework Skills Reference
**Version:** v0.57.0
**Purpose:** Reference for all Skills
## Skills Overview
**Location:** `Skills/` | **Total:** 32 skills (6 TDD/BDD, 1 PRD, 2 code quality, 2 beginner setup, 3 beginner support, 2 database, 2 advanced testing, 3 architecture, 1 DevOps, 1 testing setup, 1 desktop, 1 diagrams, 4 deployment platforms, 1 SEO, 1 privacy compliance, 2 platform)
**Characteristics:** Packaged units (SKILL.md + resources/ + LICENSE.txt), copy/paste Claude Code blocks, verification checklists
### Installing Skills
**1. Automatic (via `/charter`):** Skills auto-suggested based on tech stack during charter creation.
**2. Manual (via `/manage-skills`):**
```
/manage-skills list                   # Show available and installed skills
/manage-skills install <skill-name>   # Install a specific skill
/manage-skills remove <skill-name>    # Remove an installed skill
/manage-skills info <skill-name>      # View skill details
/manage-skills                        # Interactive mode
```
**Installed to:** `.claude/skills/{skill-name}/`
## TDD Skills (Experienced)
### tdd-red-phase
**Function:** Guide RED phase - writing failing tests, verifying expected failures
**Coverage:** Test structure (AAA), assertions, failure verification, Claude Code format
**When:** Starting new feature via `work #N` trigger
### tdd-green-phase
**Function:** Guide GREEN phase - minimal implementation to pass failing tests
**Coverage:** YAGNI principle, implementation strategies, regression checking
**When:** After RED phase test verified failing
### tdd-refactor-phase
**Function:** Guide REFACTOR phase - code improvement while maintaining green tests
**Coverage:** Refactoring analysis, rollback procedures, when to skip
**When:** After GREEN phase success
### tdd-failure-recovery
**Function:** Handle unexpected test behaviors and recovery procedures
**Coverage:** Failure diagnostics, recovery steps, rollback commands, test isolation
**When:** Test behaves unexpectedly, need rollback
### test-writing-patterns (Standalone)
**Function:** Test structure, patterns, assertions, test doubles guidance
**Coverage:** AAA pattern, Given-When-Then, test doubles (mock/stub/fake/spy)
### bdd-writing (Standalone)
**Function:** BDD specification writing with Gherkin syntax
**Coverage:** Feature files, scenarios, Given-When-Then, step definitions, scenario outlines, data tables
**Tools:** Cucumber, pytest-bdd, SpecFlow, Behave, RSpec
## PRD Skills
### create-prd
**Function:** Transform proposals into detailed PRD documents
**Coverage:** Proposal analysis, charter alignment, user story generation, acceptance criteria
**Integration:** Supersedes IDPF-PRD, feeds into Create-Backlog
## Code Quality Skills
### anti-pattern-analysis
**Function:** Systematic anti-pattern detection during code review
**Coverage:** Design/OOP patterns, code smells, architecture, database, testing, security
**Resources:** General, architecture, testing, database anti-patterns; code review checklist; language-specific guides (JS, Python)
### codebase-analysis
**Function:** Comprehensive codebase analysis and documentation extraction
**Coverage:** Architecture discovery, dependency mapping, structure analysis
**Integration:** Used by `/create-prd extract` and `/charter` extraction modes
## Beginner Setup Skills
### flask-setup
**Function:** Python Flask environment setup with step-by-step guidance
**Coverage:** Virtual environment, dependency installation, verification
### sinatra-setup
**Function:** Ruby Sinatra environment setup
**Coverage:** Bundler, Gemfile creation, dependencies, verification
## Beginner Support Skills
### common-errors
**Function:** Troubleshooting reference for common development issues
**Coverage:** Flask errors, Sinatra errors, general programming errors
### sqlite-integration
**Function:** Database integration guidance for beginners
**Coverage:** Database setup, basic queries, schema creation
### beginner-testing
**Function:** Testing introduction and TDD methodology education
**Coverage:** Test writing basics, assertions, simple TDD cycle
## Database Skills
### postgresql-integration
**Function:** PostgreSQL setup, connection pooling, query patterns
**Coverage:** Connection setup, pooling strategies, transactions, error handling
### migration-patterns
**Function:** Database schema versioning, migration strategies, rollback
**Coverage:** Schema versioning, zero-downtime migrations, tool guidance (Flyway, Alembic, Prisma)
## Advanced Testing Skills
### property-based-testing
**Function:** Property-based testing patterns
**Coverage:** Property definition, shrinking strategies, generator composition
**Tools:** Hypothesis (Python), fast-check (JS/TS), QuickCheck
### mutation-testing
**Function:** Mutation testing operators and test suite quality assessment
**Coverage:** Mutation operators, score interpretation, test suite improvement
**Tools:** mutmut (Python), Stryker (JS/TS/.NET), PIT (Java)
## Architecture Skills
### api-versioning
**Function:** API versioning strategies and deprecation workflows
**Coverage:** URL path, header-based, content negotiation, backward compatibility
### error-handling-patterns
**Function:** Error hierarchy design and API error response patterns
**Coverage:** Error hierarchy, API errors, logging integration, recovery strategies
## DevOps Skills
### ci-cd-pipeline-design
**Function:** CI/CD pipeline architecture and platform-specific configuration
**Coverage:** Pipeline architecture, stage design, environment promotion, security
**Platforms:** GitHub Actions, GitLab CI, Jenkins, Azure DevOps
## Deployment Platform Skills
### vercel-project-setup
**Function:** Vercel deployment setup with preview deployments and edge functions
**Coverage:** vercel.json config, GitHub integration, environment variables, Actions workflow
### railway-project-setup
**Function:** Railway deployment setup with Nixpacks and preview environments
**Coverage:** railway.toml config, GitHub integration, environment variables, Actions workflow
### render-project-setup
**Function:** Render deployment setup with Blueprints and preview environments
**Coverage:** render.yaml config, GitHub integration, environment variables, Actions workflow
### digitalocean-app-setup
**Function:** DigitalOcean App Platform deployment with review apps
**Coverage:** app-spec.yaml config, GitHub integration, doctl CLI, deployment strategies
## Testing Setup Skills
### playwright-setup
**Function:** Playwright test automation framework setup
**Coverage:** Installation, browser configuration, test runner, CI/CD integration
## Desktop Skills
### electron-development
**Function:** Electron desktop application development patterns
**Coverage:** Setup, main/renderer architecture, IPC patterns, packaging
### drawio-generation
**Function:** Generate Draw.io XML diagram files from architecture and design discussions
**Coverage:** Draw.io XML format, generation patterns, shape style catalog, color palette, validation checklist
## Framework-Skill Dependencies
| Framework | Required Skills |
|-----------|----------------|
| IDPF-Agile | tdd-red-phase, tdd-green-phase, tdd-refactor-phase, tdd-failure-recovery, test-writing-patterns |
| IDPF-Vibe (vibe-newbie) | flask-setup, sinatra-setup, common-errors, sqlite-integration, beginner-testing |
**Standalone Skills:** anti-pattern-analysis, bdd-writing, codebase-analysis, playwright-setup, drawio-generation, electron-development
---
**End of Framework Skills Reference**
