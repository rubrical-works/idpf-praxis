# Framework Summary
**Version:** v0.91.1
## Quick Reference
| Component | Count | Location |
|-----------|-------|----------|
| Process Frameworks | 2 | IDPF-Agile, IDPF-Vibe (7 variants) |
| Domains | 11 | Domains/ (testing criteria, guides, templates) |
| Domain Specialists | 25 | 12 Base + 13 Pack |
| Core Instructions | 0 | Removed -- Core redundant with training; Domain-Selection-Guide is reference only |
| Skills | 38 | Skills/ |
| Assistant Guidelines | 4 | Assistant/ |
## Current Versions
**Development Frameworks**
| Framework | Revision | Type |
|-----------|----------|------|
| IDPF-Agile | 3 | Story-Driven Development with TDD |
| IDPF-Vibe (Core) | 4.0 | Exploratory -> Agile |
> **Note:** IDPF-PRD was deprecated in v0.24 and replaced by the `create-prd` skill.
**Domains**
| Domain | Revision | Location |
|--------|----------|----------|
| Accessibility | 1 | Domains/Accessibility/ |
| API-Design | 1 | Domains/API-Design/ |
| Chaos | 1 | Domains/Chaos/ |
| Contract-Testing | 1 | Domains/Contract-Testing/ |
| i18n | 1 | Domains/i18n/ |
| Observability | 1 | Domains/Observability/ |
| Performance | 1 | Domains/Performance/ |
| Privacy | 1 | Domains/Privacy/ |
| QA-Automation | 1 | Domains/QA-Automation/ |
| Security | 1 | Domains/Security/ |
| SEO | 1 | Domains/SEO/ |
**Skills Registry**
| # | Skill | Description | Category |
|---|-------|-------------|----------|
| 1 | anti-pattern-analysis | Detect anti-patterns during code review with refactoring guidance | Code Quality |
| 2 | api-versioning | API versioning strategies, deprecation, backward compatibility | Architecture |
| 3 | astro-development | Astro framework -- Islands, Content Collections, multi-framework | Platform |
| 4 | bdd-writing | BDD specs with Gherkin syntax, feature files, step definitions | Testing |
| 5 | beginner-testing | Intro TDD for beginners with Flask/Sinatra examples | Testing |
| 6 | ci-cd-pipeline-design | CI/CD architecture, stage design, security considerations | DevOps |
| 7 | code-path-discovery | Scan TS/JS for behavioral paths in 6-category format | Analysis |
| 8 | codebase-analysis | Analyze codebases to extract structure, stack, and patterns | Code Quality |
| 9 | command-spec-audit | Evaluate command specs for quality and extension coverage | Code Quality |
| 10 | common-errors | Diagnose beginner Flask/Sinatra mistakes with explanations | Debugging |
| 11 | digitalocean-app-setup | Preview, staging, production deploys on DigitalOcean | Platform |
| 12 | drawio-generation | Generate editable .drawio.svg diagrams | Documentation |
| 13 | electron-cross-build | Cross-compile Electron apps from Linux to Windows | Platform |
| 14 | electron-development | Electron + Vite + Playwright E2E, Windows considerations | Platform |
| 15 | error-handling-patterns | Error hierarchies, API responses, logging integration | Architecture |
| 16 | flask-setup | Python Flask environment setup for beginners | Platform |
| 17 | i18n-setup | Internationalization scaffolding -- config, extraction, locales | Web |
| 18 | migration-patterns | DB migration versioning, rollbacks, zero-downtime strategies | Database |
| 19 | mutation-testing | Mutation testing to assess test suite quality | Testing |
| 20 | observability-setup | OpenTelemetry, Grafana dashboards, alerts, structured logging | DevOps |
| 21 | playwright-explorer | Interactive browser exploration with natural language | Testing |
| 22 | playwright-setup | Playwright installation verification and troubleshooting | Testing |
| 23 | postgresql-integration | PostgreSQL setup, connections, query patterns, best practices | Database |
| 24 | privacy-compliance | Consent, cookies, dark patterns, regulatory guidance | Compliance |
| 25 | property-based-testing | Property-based testing -- property definition, shrinking | Testing |
| 26 | railway-project-setup | Preview, staging, production deploys on Railway | Platform |
| 27 | render-project-setup | Preview, staging, production deploys on Render | Platform |
| 28 | resilience-patterns | Retry, circuit breaker, fallback, bulkhead, timeout | Architecture |
| 29 | seo-optimization | Technical SEO foundations and content optimization | Web |
| 30 | sinatra-setup | Ruby Sinatra environment setup for beginners | Platform |
| 31 | sqlite-integration | Add SQLite to Flask/Sinatra with beginner-friendly examples | Database |
| 32 | tdd-failure-recovery | TDD failure scenarios and recovery procedures | Testing |
| 33 | tdd-green-phase | GREEN phase -- minimal implementation to pass failing tests | Testing |
| 34 | tdd-red-phase | RED phase -- writing failing tests, verifying expected failures | Testing |
| 35 | tdd-refactor-phase | REFACTOR phase -- improve code quality, keep tests green | Testing |
| 36 | test-scaffold | Generate test infra from IDPF testing domains (a11y, perf, etc.) | Testing |
| 37 | test-writing-patterns | Test structure, patterns, assertions, and test doubles | Testing |
| 38 | vercel-project-setup | Preview, staging, production deploys on Vercel | Platform |
**Skills by Category**
| Category | Count | Skills |
|----------|:-----:|--------|
| Testing | 12 | bdd-writing, beginner-testing, mutation-testing, playwright-explorer, playwright-setup, property-based-testing, tdd-failure-recovery, tdd-green-phase, tdd-red-phase, tdd-refactor-phase, test-scaffold, test-writing-patterns |
| Platform | 9 | astro-development, digitalocean-app-setup, electron-cross-build, electron-development, flask-setup, railway-project-setup, render-project-setup, sinatra-setup, vercel-project-setup |
| Architecture | 3 | api-versioning, error-handling-patterns, resilience-patterns |
| Code Quality | 3 | anti-pattern-analysis, codebase-analysis, command-spec-audit |
| Database | 3 | migration-patterns, postgresql-integration, sqlite-integration |
| DevOps | 2 | ci-cd-pipeline-design, observability-setup |
| Web | 2 | i18n-setup, seo-optimization |
| Other | 4 | code-path-discovery, common-errors, drawio-generation, privacy-compliance |
**Skills in the Pipeline**
| Proposal | Status |
|----------|--------|
| Docker Development Skill | Draft |
| Docker/Compose Orchestration Skill | Draft |
| Accessibility Testing Scaffolding Skill | Draft |
| Graceful Degradation Assessment Skill | Draft |
| Payment Processing Integration Skill | Draft |
| Testing Strategies for Other Platforms | Draft |
## Framework Selection Matrix
| Project Type | Starting Point | Evolution Path |
|--------------|---------------|----------------|
| Evolving requirements, iterative delivery | IDPF-Agile | Terminal |
| Unclear requirements, exploration | IDPF-Vibe | -> Agile |
| Separate test repository | Domains/ | Use Agile |
## Core Principle
**System Instructions** define WHO the assistant is
**Frameworks** define WHAT process to follow
**Skills** provide reusable capabilities
**Assistant Guidelines** ensure accuracy and quality
## Valid Framework Transitions
```
VIBE ──► AGILE (Terminal)
```
**Invalid:** Agile -> Vibe (quality standards should never decrease)
## Detailed Documentation
Load on-demand:
| File | Content |
|------|---------|
| Framework-Development.md | IDPF-Agile, Vibe details, create-prd skill |
| Framework-Testing.md | Domains/ -- testing criteria library + 6 specialized domains |
| Framework-System-Instructions.md | Core + 25 Domain Specialists (12 Base, 13 Pack) |
| Framework-Skills.md | All 38 skills with descriptions |
| Framework-Transitions.md | Transition matrix, diagrams, hybrid usage |
| Framework-Overview.md | Complete reference (all sections) |
**End of Framework Summary**
