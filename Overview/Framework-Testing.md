**Framework Testing Reference**
**Version:** v0.67.0
**Testing Domain (Foundation)**
**Location:** `Domains/Testing/` | **Type:** Foundational Testing Domain
**Core Principle:** "Test automation is software development. It uses the same tools, requires the same skills and same practices."
**Architecture:**
```
Domains/Testing/ (foundation)
    ├── Domains/QA-Automation/      (Selenium, Playwright, Cypress, Appium)
    ├── Domains/Performance/        (k6, JMeter, Gatling, Locust)
    ├── Domains/Security/           (OWASP ZAP, Burp Suite, SAST/DAST)
    ├── Domains/Accessibility/      (axe, Lighthouse, Pa11y)
    ├── Domains/Chaos/              (Chaos Monkey, Gremlin, LitmusChaos)
    └── Domains/Contract-Testing/   (Pact, Spring Cloud Contract)
```
**Embedded Testing (No separate domain):** TDD, ATDD, BDD - Application repo with IDPF-Agile
**Separate Repository (Uses testing domains):**
| Testing Type | Framework | Rationale |
|--------------|-----------|-----------|
| QA Automation | IDPF-QA-Automation | Independent codebase, different release cycle |
| Performance | IDPF-Performance | Specialized tooling, separate infrastructure |
| Security | IDPF-Security | Scan configs, vulnerability tracking, compliance |
| Chaos | IDPF-Chaos | Experiment definitions, separate from deployment |
| Contract Testing | IDPF-Contract-Testing | Cross-repo coordination between teams |
| Accessibility | IDPF-Accessibility | Flexible: Embedded OR Separate |
**Methodology:** Test repos use **IDPF-Agile** for story-driven planning with TDD cycles.
**Workflow Phases:**
```
PLAN → DESIGN → DEVELOP → EXECUTE → REPORT
```
1. **PLAN:** Create Test Plan, define scope, identify requirements coverage
2. **DESIGN:** Design test architecture, select tools, define patterns
3. **DEVELOP:** Write test code using TDD, build utilities, create test data
4. **EXECUTE:** Run tests (manual trigger, CI/CD, scheduled)
5. **REPORT:** Analyze results, track metrics, report to stakeholders
**Test Plan Document**
Test Plans replace PRDs for test repositories. **Location:** `<test-repo>/PRD/TestPlans/`
**Required Elements:**
- Link to application repository
- Link to application PRD document
- Requirement coverage mapping (REQ-IDs covered)
- Version/release of application under test
**Templates:** Test-Plan-Template.md
**Guides:** Testing-Framework-Selection-Guide.md (Embedded vs Separate, which domain)
**Session Commands:**
- Planning: Test-Plan-Start, Test-Plan-Review, Coverage-Check
- Development: Test-Dev-Start, Run-Tests, Generate-Report
- All IDPF-Agile commands apply
**Integration Points:**
- Extends IDPF-Agile (test code follows same TDD methodology)
- References Application PRD for traceability
- Uses ATDD/BDD specs from application for test case design
- Outputs test results, coverage reports, metrics
**QA-Automation Domain**
**Location:** `Domains/QA-Automation/` | **Extends:** Domains/Testing/ | **Type:** UI & End-to-End Test Automation
**Test Types:**
| Test Type | Scope | Execution Time |
|-----------|-------|----------------|
| **Smoke Tests** | Critical paths only | < 5 minutes |
| **Regression Tests** | Full feature coverage | 30-60 minutes |
| **Cross-Browser** | Browser compatibility | Varies |
| **Mobile Tests** | Native/hybrid apps | Varies |
| **Visual Tests** | UI appearance | 10-30 minutes |
| **E2E Tests** | Full user journeys | 15-45 minutes |
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
**Page Object Model (Primary):** One page object per page/screen, encapsulates locators, exposes actions, tests don't access locators directly.
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
**Selector Priority:**
| Priority | Type | Example |
|----------|------|---------|
| 1 | data-testid | `[data-testid="login-btn"]` |
| 2 | ID | `#login-button` |
| 3 | Name | `[name="email"]` |
| 4 | ARIA | `[aria-label="Submit"]` |
| 5 | CSS Class | `.btn-primary` |
**Labels:** `qa-automation` (#FF991F), `smoke-suite` (#0E8A16), `regression-suite` (#1D76DB), `cross-browser` (#5319E7), `mobile` (#D93F0B), `flaky` (#FBCA04)
**Integration:** Extends Domains/Testing/, uses IDPF-Agile, CI/CD (GitHub Actions, Jenkins), cloud providers (BrowserStack, Sauce Labs)
**Performance Domain**
**Location:** `Domains/Performance/` | **Extends:** Domains/Testing/ | **Type:** Performance Testing Framework
**Test Types:**
| Test Type | Purpose | Duration | Load Pattern |
|-----------|---------|----------|--------------|
| **Load Test** | Validate under expected load | 15-60 min | Steady state |
| **Stress Test** | Find breaking point | Until failure | Ramping up |
| **Endurance/Soak** | Detect memory leaks, degradation | 4-24 hours | Steady state |
| **Spike Test** | Handle sudden traffic bursts | 15-30 min | Sudden spikes |
| **Capacity Test** | Determine max throughput | Varies | Incremental |
**Tool Selection:**
| Tool | Language | Best For |
|------|----------|----------|
| **k6** | JavaScript | Modern APIs, CI/CD, developer-friendly |
| **JMeter** | Java/XML | Enterprise, GUI-based, extensive plugins |
| **Gatling** | Scala/Java | High throughput, efficient resource usage |
| **Locust** | Python | Python teams, distributed testing |
| **Artillery** | JavaScript | Serverless, YAML config |
| **wrk/wrk2** | Lua | Lightweight HTTP benchmarking |
**Key Metrics:**
| Metric | Description | Good Values |
|--------|-------------|-------------|
| Response Time (p95) | 95th percentile | < 500ms |
| Response Time (p99) | 99th percentile | < 1000ms |
| Throughput | Requests per second | Depends on capacity |
| Error Rate | Failed requests / total | < 0.1% |
| Apdex | Application Performance Index | > 0.9 |
**Labels:** `performance`, `load-test`, `stress-test`, `soak-test`, `capacity`
**Integration:** Extends Domains/Testing/, uses IDPF-Agile, references Application PRD for NFR traceability, outputs performance reports/metric dashboards/capacity recommendations
**Security Domain**
**Location:** `Domains/Security/` | **Extends:** Domains/Testing/ | **Type:** Security Testing Framework
**Testing Types:**
| Test Type | When | What | Tools |
|-----------|------|------|-------|
| **SAST** | Development/CI | Source code analysis | SonarQube, Semgrep, CodeQL |
| **SCA** | Development/CI | Dependency vulnerabilities | Snyk, Dependabot, OWASP Dependency-Check |
| **DAST** | Staging/Pre-prod | Running application | OWASP ZAP, Burp Suite, Nuclei |
| **IAST** | Testing | Runtime analysis | Contrast Security, Hdiv |
| **Penetration Testing** | Pre-release | Manual + automated | Manual + various tools |
| **Secret Scanning** | Development/CI | Credentials in code | GitLeaks, TruffleHog |
**OWASP Top 10 Coverage:**
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
**Vulnerability Management:**
| Severity | CVSS Score | Remediation SLA |
|----------|------------|-----------------|
| Critical | 9.0 - 10.0 | 24 hours |
| High | 7.0 - 8.9 | 7 days |
| Medium | 4.0 - 6.9 | 30 days |
| Low | 0.1 - 3.9 | 90 days |
**Workflow:** Discovery > Triage > Assignment > Remediation > Verification > Closure
**CI/CD Integration:**
| Stage | Tool Type | Gate Criteria |
|-------|-----------|---------------|
| Commit | SAST | No critical/high issues |
| Commit | Secret Scan | No secrets detected |
| PR | SCA | No critical vulnerabilities |
| Pre-Deploy | DAST | No critical findings |
**Labels:** `security` (#FF5630), `sast` (#0052CC), `dast` (#D93F0B), `sca` (#0E8A16), `pentest` (#5319E7), `vulnerability` (#FBCA04), `compliance` (#1D76DB)
**Integration:** Extends Domains/Testing/, uses IDPF-Agile, references Application PRD for security requirements, outputs vulnerability reports/compliance evidence/security metrics
**Accessibility Domain**
**Location:** `Domains/Accessibility/` | **Extends:** Domains/Testing/ | **Type:** Accessibility Testing Framework
**Repository Type: Flexible**
| Model | Use Case | Location |
|-------|----------|----------|
| **Embedded** | Automated a11y checks in CI | Application repo (`tests/a11y/`) |
| **Separate** | Comprehensive audits, manual testing | Dedicated accessibility repo |
**Testing Types:**
| Test Type | Automation | Coverage | Tools |
|-----------|------------|----------|-------|
| **Automated Scans** | Full | ~30-40% of issues | axe-core, Lighthouse, Pa11y |
| **Keyboard Testing** | Partial | Focus management | Manual + scripts |
| **Screen Reader** | Manual | Content, announcements | NVDA, JAWS, VoiceOver |
| **Color Contrast** | Full | Visual design | axe, Contrast checkers |
| **Cognitive** | Manual | Readability, simplicity | Manual review |
| **Mobile a11y** | Partial | Touch targets, gestures | Accessibility Scanner |
**WCAG Conformance Levels:**
| Level | Description | Requirement |
|-------|-------------|-------------|
| **A** | Minimum accessibility | Must meet |
| **AA** | Standard accessibility | Typically required (legal) |
| **AAA** | Enhanced accessibility | Aspirational |
**Recommendation:** Target WCAG 2.1 Level AA as baseline.
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
**Issue Severity:**
| Severity | Impact | SLA |
|----------|--------|-----|
| Critical | Blocker for AT users | Before release |
| Serious | Major barrier | 30 days |
| Moderate | Degraded experience | 60 days |
| Minor | Inconvenience | 90 days |
**Labels:** `accessibility` (#36B37E), `wcag-a` (#0E8A16), `wcag-aa` (#1D76DB), `wcag-aaa` (#5319E7), `screen-reader` (#D93F0B), `keyboard` (#FBCA04)
**Integration:** Extends Domains/Testing/, flexible (embedded or separate), uses IDPF-Agile, references Application PRD, outputs WCAG audit reports/conformance statements (VPAT)/remediation recommendations
**Chaos Domain**
**Location:** `Domains/Chaos/` | **Extends:** Domains/Testing/ | **Type:** Chaos Engineering Framework
**Core Principle:** "Chaos engineering proactively tests system resilience by introducing controlled failures to discover weaknesses before they cause production incidents."
**Principles:**
| Principle | Description |
|-----------|-------------|
| Build a Hypothesis | Define expected behavior under failure |
| Vary Real-World Events | Inject realistic failures |
| Run in Production | Test real systems (safely) |
| Automate Experiments | Continuous validation |
| Minimize Blast Radius | Start small, limit impact |
**Fault Injection Types:**
| Category | Fault Type | Tools |
|----------|------------|-------|
| **Infrastructure** | Instance termination, AZ failure | Chaos Monkey, Gremlin, AWS FIS |
| **Network** | Latency, packet loss, DNS failure | tc, Toxiproxy, Gremlin |
| **Application** | Memory pressure, CPU stress, disk fill | stress-ng, Gremlin |
| **Dependency** | Service unavailable, slow dependency | Toxiproxy, Gremlin |
| **State** | Database failure, cache eviction | Custom scripts, Gremlin |
**Tools:**
| Tool | Platform | Best For |
|------|----------|----------|
| **Chaos Monkey** | AWS | Instance termination |
| **Gremlin** | Multi-cloud, K8s | Enterprise chaos |
| **LitmusChaos** | Kubernetes | K8s native chaos |
| **Chaos Mesh** | Kubernetes | K8s native chaos |
| **AWS FIS** | AWS | AWS infrastructure |
| **Toxiproxy** | Any | Network simulation |
**Experiment Workflow:**
```
Hypothesis → Observability Setup → Design → Approval → Execute → Analyze → Fix/Expand
```
**Labels:** `chaos` (#6554C0), `experiment` (#0E8A16), `gameday` (#D93F0B), `infrastructure-fault` (#0052CC), `network-fault` (#1D76DB), `finding` (#FBCA04)
**Integration:** Extends Domains/Testing/, uses IDPF-Agile, references Application PRD for resilience requirements, integrates with observability (Prometheus, Grafana, Datadog), outputs experiment reports/findings/action items
**Contract-Testing Domain**
**Location:** `Domains/Contract-Testing/` | **Extends:** Domains/Testing/ | **Type:** API Contract Testing Framework
**Flow:**
```
Consumer → Generate Contract → Publish to Broker → Provider Fetches → Verify → Can-I-Deploy → Deploy
```
**Tools:**
| Tool | Language | Best For |
|------|----------|----------|
| **Pact** | Multi-language | Most scenarios, mature broker |
| **Spring Cloud Contract** | Java/Kotlin | Spring ecosystem |
| **Specmatic** | Any (OpenAPI) | OpenAPI-based testing |
| **Dredd** | Any | API Blueprint/OpenAPI |
| **Hoverfly** | Multi-language | Service virtualization |
**Key Concepts:**
| Concept | Description |
|---------|-------------|
| Consumer | Service that calls an API |
| Provider | Service that exposes an API |
| Contract | Agreement on request/response format |
| Broker | Central repository for contracts |
| Can-I-Deploy | Deployment safety check |
| Provider State | Precondition setup for verification |
**Labels:** `contract`, `consumer`, `provider`, `breaking-change`, `verification-failed`
**Integration:** Extends Domains/Testing/, uses IDPF-Agile, coordinates multiple teams, integrates with Pact Broker/Pactflow, outputs contract files/verification reports/broker dashboards
**End of Testing Domains Reference**