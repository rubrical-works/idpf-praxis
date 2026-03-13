# Framework Testing Reference
**Version:** v0.63.0
**Purpose:** Detailed reference for IDPF testing frameworks

## IDPF-Testing Framework
**Location:** `IDPF-Testing/IDPF-Testing.md`
**Type:** Foundational Testing Framework

### Purpose
Establish common architecture, terminology, workflows, and integration patterns for all testing-focused development efforts. IDPF-Testing is the foundation that specialized testing frameworks extend.
**Core Principle:** "Test automation is software development. It uses the same tools, requires the same skills and same practices."

### Testing Framework Architecture
```
IDPF-Testing (foundation)
    ├── IDPF-QA-Automation      (Selenium, Playwright, Cypress, Appium)
    ├── IDPF-Performance        (k6, JMeter, Gatling, Locust)
    ├── IDPF-Security           (OWASP ZAP, Burp Suite, SAST/DAST)
    ├── IDPF-Accessibility      (axe, Lighthouse, Pa11y)
    ├── IDPF-Chaos              (Chaos Monkey, Gremlin, LitmusChaos)
    └── IDPF-Contract-Testing   (Pact, Spring Cloud Contract)
```

### Embedded vs Separate Repository
**Embedded Testing (No IDPF-Testing):**
- TDD (unit tests) - Application repo with IDPF-Agile
- ATDD (acceptance tests) - Application repo with IDPF-Agile
- BDD (behavior specs) - Application repo with IDPF-Agile
**Separate Repository (Uses IDPF-Testing):**
| Testing Type | Framework | Rationale |
|--------------|-----------|-----------|
| QA Automation | IDPF-QA-Automation | Independent codebase, different release cycle |
| Performance | IDPF-Performance | Specialized tooling, separate infrastructure |
| Security | IDPF-Security | Scan configs, vulnerability tracking, compliance |
| Chaos | IDPF-Chaos | Experiment definitions, separate from deployment |
| Contract Testing | IDPF-Contract-Testing | Cross-repo coordination between teams |
| Accessibility | IDPF-Accessibility | Flexible: Embedded OR Separate |

### Test Development Methodology
Test repositories use **IDPF-Agile** for test development, which provides story-driven planning with TDD cycles suitable for both fixed and evolving test scopes.

### Workflow Phases
```
PLAN → DESIGN → DEVELOP → EXECUTE → REPORT
```
1. **PLAN:** Create Test Plan, define scope, identify requirements coverage
2. **DESIGN:** Design test architecture, select tools, define patterns
3. **DEVELOP:** Write test code using TDD, build utilities, create test data
4. **EXECUTE:** Run tests (manual trigger, CI/CD, scheduled)
5. **REPORT:** Analyze results, track metrics, report to stakeholders

### Test Plan Document
Test Plans replace PRDs for test repositories. They are lighter weight and reference the application's PRD for traceability.
**Location:** `<test-repo>/PRD/TestPlans/`
**Required Elements:**
- Link to application repository
- Link to application PRD document
- Requirement coverage mapping (REQ-IDs covered)
- Version/release of application under test

### Key Resources
**Templates:**
- Test-Plan-Template.md - Generic test plan structure
**Guides:**
- Testing-Framework-Selection-Guide.md - Decision guide for:
  - Embedded vs Separate repository
  - Which IDPF-Testing framework to use

### Testing Session Commands
**Planning Commands:**
- Test-Plan-Start, Test-Plan-Review, Coverage-Check
**Development Commands:**
- Test-Dev-Start, Run-Tests, Generate-Report
**Standard Commands:**
- All IDPF-Agile commands apply to test development

### Integration Points
- Extends IDPF-Agile (test code follows same TDD methodology)
- References Application PRD for traceability
- Uses ATDD/BDD specs from application for test case design
- Outputs test results, coverage reports, metrics

## IDPF-QA-Automation Framework
**Location:** `IDPF-QA-Automation/IDPF-QA-Automation.md`
**Extends:** IDPF-Testing
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
- Extends IDPF-Testing
- Uses IDPF-Agile for test development
- Integrates with CI/CD (GitHub Actions, Jenkins)
- Supports cloud providers (BrowserStack, Sauce Labs)

## IDPF-Performance Framework
**Location:** `IDPF-Performance/IDPF-Performance.md`
**Extends:** IDPF-Testing
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

### GitHub Project Labels
| Label | Description |
|-------|-------------|
| `performance` | Performance work (from Testing-Core) |
| `load-test` | Load test development |
| `stress-test` | Stress test development |
| `soak-test` | Endurance test development |
| `capacity` | Capacity planning |

### Integration Points
- Extends IDPF-Testing
- Uses IDPF-Agile for test development
- References Application PRD for NFR traceability
- Outputs performance reports, metric dashboards, capacity recommendations

## IDPF-Security Framework
**Location:** `IDPF-Security/IDPF-Security.md`
**Extends:** IDPF-Testing
**Type:** Security Testing Framework

### Purpose
Develop and execute security testing activities including SAST, DAST, penetration testing, vulnerability management, and security compliance. Validates applications are protected against common vulnerabilities and meet security requirements.

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
- Extends IDPF-Testing
- Uses IDPF-Agile for test development
- References Application PRD for security requirements
- Outputs vulnerability reports, compliance evidence, security metrics

## IDPF-Accessibility Framework
**Location:** `IDPF-Accessibility/IDPF-Accessibility.md`
**Extends:** IDPF-Testing
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
- Extends IDPF-Testing
- Flexible: Embedded in app repo OR separate test repo
- Uses IDPF-Agile for test development
- References Application PRD for accessibility requirements
- Outputs WCAG audit reports, conformance statements (VPAT), remediation recommendations

## IDPF-Chaos Framework
**Location:** `IDPF-Chaos/IDPF-Chaos.md`
**Extends:** IDPF-Testing
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
- Extends IDPF-Testing
- Uses IDPF-Agile for experiment development
- References Application PRD for resilience requirements
- Integrates with observability (Prometheus, Grafana, Datadog)
- Outputs experiment reports, findings, action items

## IDPF-Contract-Testing Framework
**Location:** `IDPF-Contract-Testing/IDPF-Contract-Testing.md`
**Extends:** IDPF-Testing
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

### GitHub Labels
| Label | Description |
|-------|-------------|
| `contract` | Contract work (from Testing-Core) |
| `consumer` | Consumer-side contract |
| `provider` | Provider-side contract |
| `breaking-change` | Breaking contract change |
| `verification-failed` | Failed verification |

### Integration Points
- Extends IDPF-Testing
- Uses IDPF-Agile for test development
- Coordinates multiple teams (consumer and provider)
- Integrates with Pact Broker / Pactflow
- Outputs contract files, verification reports, broker dashboards
**End of Framework Testing Reference**
