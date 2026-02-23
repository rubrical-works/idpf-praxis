# IDPF-Testing
**Version:** v0.49.0
**Source:** IDPF-Testing/README.md
IDPF-Testing is a **centralized criteria library** for testing domain knowledge. Not a process framework — serves as a reference collection that review commands load on demand via `--with`.
**Core Principle:** "Test automation is software development. It uses the same tools, requires the same skills and same practices."
---
## Structure
```
IDPF-Testing/
├── README.md
├── review-criteria/       ← Domain-specific review questions (loaded by --with)
│   ├── security.md        ← OWASP-based (from IDPF-Security)
│   ├── accessibility.md   ← WCAG-based (from IDPF-Accessibility)
│   ├── performance.md     ← Threshold/load (from IDPF-Performance)
│   ├── chaos.md           ← Resilience (from IDPF-Chaos)
│   ├── contract-testing.md ← Contract (from IDPF-Contract-Testing)
│   └── qa-automation.md   ← Coverage (from IDPF-QA-Automation)
├── Guides/
└── Templates/
```
## Review Criteria
The `review-criteria/` directory contains domain-specific review questions from six IDPF testing frameworks. Each file has three sections:
1. **Proposal Review Questions**
2. **PRD Review Questions**
3. **Issue Review Questions**
Loaded by `/review-proposal`, `/review-prd`, `/review-issue` with `--with` flag:
```
/review-proposal #42 --with security,performance
/review-prd #53 --with all
```
Registry: `.claude/metadata/review-extensions.json`
## Testing Domain Frameworks
| Framework | Scope | Key Standards |
|-----------|-------|---------------|
| IDPF-QA-Automation | Web/mobile UI testing | Selenium, Playwright, Cypress, Appium |
| IDPF-Performance | Load, stress, endurance | k6, JMeter, Gatling, Locust |
| IDPF-Security | SAST, DAST, pen testing | OWASP Top 10, ZAP, Burp Suite |
| IDPF-Accessibility | WCAG, a11y compliance | axe, Lighthouse, Pa11y |
| IDPF-Chaos | Resilience, fault injection | Chaos Monkey, Gremlin, LitmusChaos |
| IDPF-Contract-Testing | API contract validation | Pact, Spring Cloud Contract |
## Terminology
| Term | Definition |
|------|------------|
| **Test Repository** | Separate Git repo for test code and documentation |
| **Test Plan** | Lightweight document defining test scope, referencing app PRD |
| **AUT** | Application Under Test |
| **Test Suite** | Collection of related test cases |
| **Test Infrastructure** | Utilities, helpers, framework code supporting tests |
| **Coverage Mapping** | Traceability from tests to application requirements |
## Embedded vs Separate Repository
**Embedded in Application Repository:**
| Testing Type | Location | Governance |
|--------------|----------|------------|
| TDD (unit) | App repo | IDPF-Agile |
| ATDD (acceptance) | App repo | IDPF-Agile + PRD/Specs |
| BDD (behavior) | App repo | IDPF-Agile + PRD/Specs |
**Separate Repository:**
| Testing Type | Framework | Rationale |
|--------------|-----------|-----------|
| QA Automation | IDPF-QA-Automation | Independent codebase, different release cycle |
| Performance | IDPF-Performance | Specialized tooling, separate infrastructure |
| Security | IDPF-Security | Scan configs, vulnerability tracking, compliance |
| Chaos | IDPF-Chaos | Experiment definitions, separate from deployment |
| Contract Testing | IDPF-Contract-Testing | Cross-repo coordination between teams |
| Accessibility | IDPF-Accessibility | Embedded (axe-core in CI) OR Separate (audit docs) |
## Test Plan Document
Test Plans replace PRDs for test repositories — lighter weight, reference app PRD for traceability.
| Aspect | PRD (Application) | Test Plan (Testing) |
|--------|-------------------|---------------------|
| **Purpose** | Define what to build | Define what to test |
| **Scope** | Features, requirements | Test coverage, scenarios |
| **Detail** | Comprehensive | Lightweight, evolving |
| **Traceability** | Standalone | References application PRD |
## Workflow Phases
| Phase | Activities |
|-------|------------|
| **PLAN** | Create Test Plan, define scope, identify requirements coverage |
| **DESIGN** | Design test architecture, select tools, define patterns |
| **DEVELOP** | Write test code using TDD, build utilities, create test data |
| **EXECUTE** | Run tests (manual, CI/CD, scheduled) |
| **REPORT** | Analyze results, track metrics, report to stakeholders |
## Test Repository Structure
```
<test-repo-root>/
├── PRD/
│   ├── README.md
│   ├── Templates/
│   └── TestPlans/
├── src/
│   ├── tests/
│   ├── pages/
│   ├── utils/
│   └── config/
├── reports/
├── .github/workflows/
└── README.md
```
## GitHub Project Labels
| Label | Color | Description |
|-------|-------|-------------|
| `qa-automation` | Orange | QA automation test development |
| `performance` | Blue | Performance test development |
| `security` | Red | Security test development |
| `accessibility` | Green | Accessibility test development |
| `chaos` | Purple | Chaos engineering experiments |
| `contract` | Cyan | Contract test development |
| `test-plan` | Gray | Test planning and documentation |
**End of IDPF-Testing**
