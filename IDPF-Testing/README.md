# IDPF-Testing
**Version:** v0.61.0
**Framework-Debug:** True

## Overview
IDPF-Testing is a **centralized criteria library** for testing domain knowledge. It is **not a process framework** — it cannot be selected as a project's process framework (like IDPF-Agile or IDPF-Vibe). Instead, it serves as a reference collection that review commands load on demand via the `--with` flag.
**Core Principle:** "Test automation is software development. It uses the same tools, requires the same skills and same practices."

## Structure
```
IDPF-Testing/
├── README.md              ← This file
├── review-criteria/       ← Domain-specific review questions (loaded by --with)
│   ├── security.md        ← OWASP-based review questions (from IDPF-Security)
│   ├── accessibility.md   ← WCAG-based review questions (from IDPF-Accessibility)
│   ├── performance.md     ← Threshold/load review questions (from IDPF-Performance)
│   ├── chaos.md           ← Resilience review questions (from IDPF-Chaos)
│   ├── contract-testing.md ← Contract review questions (from IDPF-Contract-Testing)
│   └── qa-automation.md   ← Coverage review questions (from IDPF-QA-Automation)
├── Guides/                ← Testing guides and references
└── Templates/             ← Test plan templates
```

## Review Criteria
The `review-criteria/` directory contains domain-specific review questions extracted from the six IDPF testing domain frameworks. Each file follows a three-section format:
1. **Proposal Review Questions** — Questions to evaluate proposals
2. **PRD Review Questions** — Questions to evaluate PRDs
3. **Issue Review Questions** — Questions to evaluate issues
These files are loaded by `/review-proposal`, `/review-prd`, and `/review-issue` when the `--with` flag is used:
```
/review-proposal #42 --with security,performance
/review-prd #53 --with all
```
The extension registry at `.claude/metadata/review-extensions.json` maps domain IDs to criteria file paths.

## Testing Domain Frameworks
The six specialized testing frameworks are independent domain references:
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
| **Test Repository** | Separate Git repository containing test code and documentation |
| **Test Plan** | Lightweight document defining test scope, referencing application PRD |
| **Application Under Test (AUT)** | The application being tested |
| **Test Suite** | Collection of related test cases |
| **Test Infrastructure** | Utilities, helpers, and framework code supporting tests |
| **Coverage Mapping** | Traceability from tests to application requirements |

## Embedded vs Separate Repository

### Embedded in Application Repository
These testing types are integral to application development:
| Testing Type | Location | Governance |
|--------------|----------|------------|
| TDD (unit tests) | Application repo | IDPF-Agile |
| ATDD (acceptance tests) | Application repo | IDPF-Agile + PRD/Specs |
| BDD (behavior specs) | Application repo | IDPF-Agile + PRD/Specs |

### Separate Repository
These testing types require separate repositories with dedicated GitHub Projects:
| Testing Type | Framework | Rationale |
|--------------|-----------|-----------|
| QA Automation | IDPF-QA-Automation | Independent codebase, different release cycle |
| Performance | IDPF-Performance | Specialized tooling, separate infrastructure |
| Security | IDPF-Security | Scan configs, vulnerability tracking, compliance |
| Chaos | IDPF-Chaos | Experiment definitions, separate from deployment |
| Contract Testing | IDPF-Contract-Testing | Cross-repo coordination between teams |
| Accessibility | IDPF-Accessibility | Embedded (axe-core in CI) OR Separate (audit documentation) |

## Test Plan Document
Test Plans replace PRDs for test repositories. They are lighter weight and reference the application's PRD for traceability.

### Test Plan vs PRD Comparison
| Aspect | PRD (Application) | Test Plan (Testing) |
|--------|-------------------|---------------------|
| **Purpose** | Define what to build | Define what to test |
| **Scope** | Features, requirements | Test coverage, scenarios |
| **Detail level** | Comprehensive | Lightweight, evolving |
| **Traceability** | Standalone | References application PRD |

## Workflow Phases
All testing frameworks share these phases:
| Phase | Activities |
|-------|------------|
| **PLAN** | Create Test Plan, define scope, identify requirements coverage |
| **DESIGN** | Design test architecture, select tools, define patterns |
| **DEVELOP** | Write test code using TDD, build utilities, create test data |
| **EXECUTE** | Run tests (manual trigger, CI/CD, scheduled) |
| **REPORT** | Analyze results, track metrics, report to stakeholders |

## Test Repository Structure
```
<test-repo-root>/
├── PRD/
│   ├── README.md
│   ├── Templates/
│   │   └── [Testing-Type]-Test-Plan.md
│   └── TestPlans/
│       └── [TestPlanName].md
├── src/
│   ├── tests/
│   ├── pages/                    # Page objects (QA Automation)
│   ├── utils/
│   └── config/
├── reports/                      # Test results
├── .github/
│   └── workflows/                # CI/CD for test execution
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
