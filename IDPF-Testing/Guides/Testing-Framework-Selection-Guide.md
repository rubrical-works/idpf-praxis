# Testing Framework Selection Guide
**Version:** v0.55.0

**Purpose:** Help teams select the appropriate IDPF testing framework and development methodology.

---

## Overview

This guide helps you determine:
1. Whether to use embedded testing or a separate test repository
2. Which IDPF testing framework to use

---

## Decision 1: Embedded vs Separate Repository

### Use Embedded Testing (No Separate Repo)

**When your testing is:**
- Unit tests (TDD)
- Acceptance tests (ATDD)
- Behavior tests (BDD)
- Tightly coupled with application code
- Part of the same release cycle as the application

**Governance:** Use IDPF-Agile for the application repository. Tests are developed alongside application code.

### Use Separate Test Repository

**When your testing is:**
- UI/E2E automation requiring page objects and utilities
- Performance testing with specialized tools
- Security testing with scan configurations
- Chaos engineering experiments
- Contract testing between services
- Has a different release cycle than the application
- Requires specialized infrastructure
- Managed by a separate team

**Governance:** Use an IDPF-Testing framework with its own GitHub Project.

---

## Decision 2: Which Testing Framework?

```
What type of testing are you doing?
│
├─ UI/E2E Automation (Selenium, Playwright, Cypress, Appium)
│   └─► IDPF-QA-Automation
│
├─ Performance/Load Testing (k6, JMeter, Gatling, Locust)
│   └─► IDPF-Performance
│
├─ Security Testing (OWASP ZAP, Burp Suite, SAST/DAST)
│   └─► IDPF-Security
│
├─ Accessibility Testing (axe, Lighthouse, Pa11y)
│   └─► IDPF-Accessibility (Embedded OR Separate)
│
├─ Chaos Engineering (Chaos Monkey, Gremlin, LitmusChaos)
│   └─► IDPF-Chaos
│
└─ API Contract Testing (Pact, Spring Cloud Contract)
    └─► IDPF-Contract-Testing
```

### Framework Quick Reference

| Testing Need | Framework | Repo Type |
|--------------|-----------|-----------|
| Web UI testing | IDPF-QA-Automation | Separate |
| Mobile app testing | IDPF-QA-Automation | Separate |
| Load testing | IDPF-Performance | Separate |
| Stress testing | IDPF-Performance | Separate |
| Security scans | IDPF-Security | Separate |
| Penetration testing | IDPF-Security | Separate |
| WCAG compliance | IDPF-Accessibility | Flexible |
| Resilience testing | IDPF-Chaos | Separate |
| Consumer contracts | IDPF-Contract-Testing | Separate |
| Provider contracts | IDPF-Contract-Testing | Separate |

---

## Decision Tree

```
Start
│
├─ Is this TDD/ATDD/BDD for application development?
│   │
│   └─ YES ──► Use EMBEDDED testing in application repo
│              (Use IDPF-Agile for the app)
│
└─ NO (Separate testing effort)
    │
    ├─ What type of testing? ──► Select IDPF-Testing-* framework
    │
    └─ Test development managed with IDPF-Agile
```

---

## Examples

### Example 1: E-commerce Regression Suite

**Scenario:** Building automated regression tests for a stable e-commerce platform.

**Decision:**
- Separate repository (complex page objects, utilities)
- Framework: IDPF-QA-Automation
- Methodology: IDPF-Agile

### Example 2: API Performance Testing

**Scenario:** Performance testing a microservices architecture with evolving endpoints.

**Decision:**
- Separate repository (specialized k6 scripts, infrastructure)
- Framework: IDPF-Performance
- Methodology: IDPF-Agile (endpoints change frequently)

### Example 3: Accessibility Compliance

**Scenario:** Ensuring WCAG 2.1 AA compliance for a government website.

**Decision:**
- Flexible - could be embedded (axe-core in CI) or separate (full audit docs)
- Framework: IDPF-Accessibility
- Methodology: IDPF-Agile

### Example 4: Security Testing for Healthcare App

**Scenario:** HIPAA compliance security testing for a healthcare application.

**Decision:**
- Separate repository (scan configs, vulnerability tracking)
- Framework: IDPF-Security
- Methodology: IDPF-Agile

### Example 5: Contract Testing for Microservices

**Scenario:** Consumer-driven contracts between 5 microservices.

**Decision:**
- Separate repository (shared between teams)
- Framework: IDPF-Contract-Testing
- Methodology: IDPF-Agile (contracts evolve with services)

---

## Checklist

Before starting a testing project:

- [ ] Determined embedded vs separate repository
- [ ] Selected appropriate IDPF-Testing framework
- [ ] Using IDPF-Agile methodology for test development
- [ ] Created test repository (if separate)
- [ ] Set up GitHub Project with appropriate labels
- [ ] Created Test Plan from framework template
- [ ] Established traceability to application PRD

---

*Guide from IDPF-Testing Framework*
