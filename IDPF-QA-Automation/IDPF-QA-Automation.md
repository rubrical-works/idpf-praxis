# IDPF-QA-Automation Framework
**Version:** v0.49.1
**Extends:** IDPF-Testing-Core
## Overview
Framework for automated UI and end-to-end test suites using Selenium, Playwright, Cypress, Appium.
## Terminology
| Term | Definition |
|------|------------|
| **Page Object** | Class encapsulating page elements and actions |
| **Locator/Selector** | Strategy for finding elements |
| **Smoke Suite** | Critical path tests after deployment |
| **Regression Suite** | Full feature coverage |
| **Flaky Test** | Inconsistent pass/fail results |
## Test Types
| Type | Execution Time | Trigger |
|------|----------------|---------|
| Smoke | < 5 min | Every deployment |
| Regression | 30-60 min | PR merge, nightly |
| Cross-Browser | Varies | Weekly, release |
| E2E | 15-45 min | Nightly, release |
## Tool Selection
### Web
| Tool | Best For | Languages |
|------|----------|-----------|
| **Selenium** | Enterprise, cross-browser | Java, Python, C#, JS |
| **Playwright** | Modern web apps | JS/TS, Python, C#, Java |
| **Cypress** | JavaScript apps | JavaScript/TypeScript |
### Mobile
| Tool | Platform |
|------|----------|
| **Appium** | iOS, Android (cross-platform) |
| **XCUITest** | iOS only |
| **Espresso** | Android only |
## Page Object Model
**Principles:**
1. One page object per page
2. Encapsulate locators
3. Expose meaningful actions
4. Tests don't access locators directly
5. Page objects don't make assertions
## Selector Strategy (Priority)
1. data-testid (Highest)
2. ID
3. Name
4. ARIA
5. CSS Class (stable)
6. Text content
7. XPath (Lowest)
## Wait Strategies
- Prefer explicit/auto waits
- Never use hard-coded `sleep()`
- Wait for specific conditions
- Set reasonable timeouts (5-30 seconds)
## Test Data Management
| Approach | Use Case |
|----------|----------|
| Fixtures | Static test data |
| Factories | Dynamic generation |
| API Seeding | Pre-test setup via API |
## Metrics
| Metric | Target |
|--------|--------|
| Pass Rate | > 95% |
| Flaky Rate | < 2% |
| Smoke Execution | < 5 min |
| Regression Execution | < 60 min |
## Flaky Test Management
1. Track test results over time
2. Quarantine flaky tests
3. Fix root cause (not just add retries)
4. Return to main suite when stable
## Session Commands
- **Create-PageObject** - Generate page object template
- **Create-TestSpec** - Generate test specification
- **Run-Smoke** - Execute smoke suite
- **Run-Regression** - Execute regression suite
- **Flaky-Report** - Show flaky test analysis
---
**End of Framework**
