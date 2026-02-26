# Framework Testing Reference
**Version:** v0.53.0
**Source:** Overview/Framework-Testing.md
## IDPF-Testing Framework
**Location:** `IDPF-Testing/IDPF-Testing.md` | **Type:** Foundational Testing Framework
**Core Principle:** "Test automation is software development."
### Architecture
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
**Embedded (No IDPF-Testing):** TDD, ATDD, BDD - Application repo with IDPF-Agile
**Separate (Uses IDPF-Testing):**
| Testing Type | Framework | Rationale |
|--------------|-----------|-----------|
| QA Automation | IDPF-QA-Automation | Independent codebase, different release cycle |
| Performance | IDPF-Performance | Specialized tooling, separate infrastructure |
| Security | IDPF-Security | Scan configs, vulnerability tracking, compliance |
| Chaos | IDPF-Chaos | Experiment definitions, separate from deployment |
| Contract Testing | IDPF-Contract-Testing | Cross-repo coordination between teams |
| Accessibility | IDPF-Accessibility | Flexible: Embedded OR Separate |
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
**Location:** `<test-repo>/PRD/TestPlans/`
**Required:** Link to app repo, link to app PRD, REQ-ID coverage mapping, version under test
### Key Resources
- Test-Plan-Template.md — Generic test plan structure
- Testing-Framework-Selection-Guide.md — Embedded vs Separate decision guide
### Testing Session Commands
- **Planning:** Test-Plan-Start, Test-Plan-Review, Coverage-Check
- **Development:** Test-Dev-Start, Run-Tests, Generate-Report
- **Standard:** All IDPF-Agile commands apply
### Integration Points
- Extends IDPF-Agile (test code follows TDD methodology)
- References Application PRD for traceability
- Uses ATDD/BDD specs from application for test case design
- Outputs test results, coverage reports, metrics
## IDPF-QA-Automation
**Extends:** IDPF-Testing | **Type:** UI & E2E Test Automation
### Test Types
| Test Type | Scope | Execution Time |
|-----------|-------|----------------|
| Smoke Tests | Critical paths only | < 5 minutes |
| Regression Tests | Full feature coverage | 30-60 minutes |
| Cross-Browser | Browser compatibility | Varies |
| Mobile Tests | Native/hybrid apps | Varies |
| Visual Tests | UI appearance | 10-30 minutes |
| E2E Tests | Full user journeys | 15-45 minutes |
### Tools
**Web:** Selenium, Playwright, Cypress, WebDriverIO
**Mobile:** Appium, XCUITest, Espresso, Detox
### Page Object Model
- One page object per page/screen
- Encapsulates locators, exposes meaningful actions
- Tests don't access locators directly
### Selector Priority
| Priority | Type | Example |
|----------|------|---------|
| 1 | data-testid | `[data-testid="login-btn"]` |
| 2 | ID | `#login-button` |
| 3 | Name | `[name="email"]` |
| 4 | ARIA | `[aria-label="Submit"]` |
| 5 | CSS Class | `.btn-primary` |
### Directory Structure
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
## IDPF-Performance
**Extends:** IDPF-Testing | **Type:** Performance Testing
### Performance Test Types
| Test Type | Purpose | Duration | Load Pattern |
|-----------|---------|----------|--------------|
| Load Test | Validate under expected load | 15-60 min | Steady state |
| Stress Test | Find breaking point | Until failure | Ramping up |
| Endurance/Soak | Detect memory leaks, degradation | 4-24 hours | Steady state |
| Spike Test | Handle sudden traffic bursts | 15-30 min | Sudden spikes |
| Capacity Test | Determine max throughput | Varies | Incremental |
### Tool Selection Guide
| Tool | Language | Best For |
|------|----------|----------|
| k6 | JavaScript | Modern APIs, CI/CD |
| JMeter | Java/XML | Enterprise, GUI-based |
| Gatling | Scala/Java | High throughput |
| Locust | Python | Python teams, distributed |
| Artillery | JavaScript | Serverless, YAML config |
| wrk/wrk2 | Lua | Lightweight HTTP benchmarking |
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
## IDPF-Security
**Extends:** IDPF-Testing | **Type:** Security Testing
### Security Testing Types
| Test Type | When | What | Tools |
|-----------|------|------|-------|
| SAST | Development/CI | Source code analysis | SonarQube, Semgrep, CodeQL |
| SCA | Development/CI | Dependency vulnerabilities | Snyk, Dependabot, OWASP Dependency-Check |
| DAST | Staging/Pre-prod | Running application | OWASP ZAP, Burp Suite, Nuclei |
| IAST | Testing | Runtime analysis | Contrast Security, Hdiv |
| Penetration Testing | Pre-release | Manual + automated | Manual + various tools |
| Secret Scanning | Development/CI | Credentials in code | GitLeaks, TruffleHog |
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
## IDPF-Accessibility
**Extends:** IDPF-Testing | **Type:** Accessibility Testing
### Repository Type: Flexible
- **Embedded:** Automated a11y checks in CI (`tests/a11y/`)
- **Separate:** Comprehensive audits, manual testing
### Accessibility Testing Types
| Test Type | Automation | Coverage | Tools |
|-----------|------------|----------|-------|
| Automated Scans | Full | ~30-40% of issues | axe-core, Lighthouse, Pa11y |
| Keyboard Testing | Partial | Focus management | Manual + scripts |
| Screen Reader | Manual | Content, announcements | NVDA, JAWS, VoiceOver |
| Color Contrast | Full | Visual design | axe, Contrast checkers |
| Cognitive | Manual | Readability, simplicity | Manual review |
| Mobile a11y | Partial | Touch targets, gestures | Accessibility Scanner |
### WCAG Conformance Levels
| Level | Description | Requirement |
|-------|-------------|-------------|
| A | Minimum accessibility | Must meet |
| AA | Standard accessibility | Typically required (legal) |
| AAA | Enhanced accessibility | Aspirational |
**Target:** WCAG 2.1 Level AA
### Tools
**Scanning:** axe-core, Lighthouse, Pa11y, WAVE
**Assistive:** NVDA, JAWS, VoiceOver, TalkBack
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
## IDPF-Chaos
**Extends:** IDPF-Testing | **Type:** Chaos Engineering
**Core Principle:** Proactively test resilience by introducing controlled failures.
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
| Infrastructure | Instance termination, AZ failure | Chaos Monkey, Gremlin, AWS FIS |
| Network | Latency, packet loss, DNS failure | tc, Toxiproxy, Gremlin |
| Application | Memory pressure, CPU stress, disk fill | stress-ng, Gremlin |
| Dependency | Service unavailable, slow dependency | Toxiproxy, Gremlin |
| State | Database failure, cache eviction | Custom scripts, Gremlin |
### Tool Ecosystem
| Tool | Platform | Best For |
|------|----------|----------|
| Chaos Monkey | AWS | Instance termination |
| Gremlin | Multi-cloud, K8s | Enterprise chaos |
| LitmusChaos | Kubernetes | K8s native chaos |
| Chaos Mesh | Kubernetes | K8s native chaos |
| AWS FIS | AWS | AWS infrastructure |
| Toxiproxy | Any | Network simulation |
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
## IDPF-Contract-Testing
**Extends:** IDPF-Testing | **Type:** API Contract Testing
### Contract Testing Flow
```
Consumer → Generate Contract → Publish to Broker → Provider Fetches → Verify → Can-I-Deploy → Deploy
```
### Tool Selection Guide
| Tool | Language | Best For |
|------|----------|----------|
| Pact | Multi-language | Most scenarios, mature broker |
| Spring Cloud Contract | Java/Kotlin | Spring ecosystem |
| Specmatic | Any (OpenAPI) | OpenAPI-based testing |
| Dredd | Any | API Blueprint/OpenAPI |
| Hoverfly | Multi-language | Service virtualization |
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
---
**End of Framework Testing Reference**
