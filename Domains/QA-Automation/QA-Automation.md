# IDPF-QA-Automation Framework
**Version:** v0.64.0
**Type:** Domain
## Overview
Domain for automated UI and E2E test suites using Selenium, Playwright, Cypress, and Appium.
**Core Principle:** QA Automation tests operate against running applications externally, validating user-facing behavior through browser and mobile automation.
## Terminology
| Term | Definition |
|------|------------|
| **Page Object** | Class encapsulating page elements and actions |
| **Component Object** | Reusable UI component abstraction |
| **Locator/Selector** | Strategy for finding elements (CSS, XPath, data-testid) |
| **Smoke Suite** | Critical path tests run after every deployment |
| **Regression Suite** | Full feature coverage tests |
| **Flaky Test** | Test with inconsistent pass/fail results |
| **Wait Strategy** | Approach for handling async UI updates |
## QA Automation Test Types
| Test Type | Scope | Execution Time | Trigger |
|-----------|-------|----------------|---------|
| **Smoke Tests** | Critical paths | < 5 minutes | Every deployment |
| **Regression Tests** | Full coverage | 30-60 minutes | PR merge, nightly |
| **Cross-Browser** | Browser compat | Varies | Weekly, release |
| **Mobile Tests** | Native/hybrid | Varies | PR merge, nightly |
| **Visual Tests** | UI appearance | 10-30 minutes | PR, release |
| **E2E Tests** | Full journeys | 15-45 minutes | Nightly, release |
## Tool Ecosystem
### Web Automation
| Tool | Best For | Languages | Key Strengths |
|------|----------|-----------|---------------|
| **Selenium** | Enterprise, cross-browser | Java, Python, C#, JS, Ruby | Mature, wide browser support |
| **Playwright** | Modern web apps | JS/TS, Python, C#, Java | Auto-wait, traces |
| **Cypress** | JavaScript apps | JS/TS | Fast, great DX, time-travel |
| **WebDriverIO** | Flexible automation | JS/TS | Plugin ecosystem |
### Mobile Automation
| Tool | Best For | Platform |
|------|----------|----------|
| **Appium** | Cross-platform | iOS, Android |
| **XCUITest** | iOS native | iOS only |
| **Espresso** | Android native | Android only |
| **Detox** | React Native | iOS, Android |
### Visual Testing
| Tool | Best For |
|------|----------|
| **Percy** | Component/page screenshots |
| **Applitools** | AI-powered visual testing |
| **BackstopJS** | Open-source visual regression |
### Cloud Testing
| Provider | Use Case |
|----------|----------|
| **BrowserStack** | Cross-browser, mobile |
| **Sauce Labs** | Enterprise, compliance |
| **LambdaTest** | Cost-effective scale |
## Architecture Patterns
### Page Object Model (POM)
**Principles:**
1. One page object per page/screen
2. Encapsulate element locators (private)
3. Expose meaningful actions (public)
4. Tests should not access locators directly
5. Page objects should not make assertions
```typescript
export class LoginPage extends BasePage {
  private readonly emailInput = '[data-testid="email"]';
  private readonly passwordInput = '[data-testid="password"]';
  private readonly submitButton = '[data-testid="login-submit"]';
  async login(email: string, password: string): Promise<void> {
    await this.page.fill(this.emailInput, email);
    await this.page.fill(this.passwordInput, password);
    await this.page.click(this.submitButton);
  }
}
```
## Selector Strategy
| Priority | Type | Example | Reliability |
|----------|------|---------|-------------|
| 1 | data-testid | `[data-testid="login-button"]` | Highest |
| 2 | ID | `#login-button` | High |
| 3 | Name | `[name="email"]` | High |
| 4 | ARIA | `[aria-label="Submit"]` | Medium-High |
| 5 | CSS Class (stable) | `.btn-primary` | Medium |
| 6 | Text content | `text="Login"` | Low |
| 7 | XPath | `//button[@type="submit"]` | Lowest |
## Wait Strategies
| Strategy | Use Case |
|----------|----------|
| **Implicit Wait** | Global timeout |
| **Explicit Wait** | Specific conditions |
| **Auto-Wait** | Framework handles (Playwright) |
| **Custom Wait** | Complex conditions |
**Never use hard-coded `sleep()` delays.** Wait for specific conditions, not arbitrary time.
## Test Data Management
| Approach | Use Case | Pros |
|----------|----------|------|
| **Fixtures** | Static data | Simple, version controlled |
| **Factories** | Dynamic generation | Fresh data, flexible |
| **API Seeding** | Pre-test setup | Fast, reliable |
| **Database Seeding** | Direct DB manipulation | Full control |
## Reporting & Metrics
| Metric | Target |
|--------|--------|
| Pass Rate | > 95% |
| Flaky Rate | < 2% |
| Smoke Execution | < 5 min |
| Regression Execution | < 60 min |
## Flaky Test Management
### Common Causes
- Race conditions / timing issues
- Shared test state
- External service dependencies
- Unstable test data
- Environment differences
### Quarantine Strategy
1. Move flaky test to quarantine suite
2. Create issue for investigation
3. Fix root cause (not just add retries)
4. Return to main suite when stable
## Best Practices
**Do:** Use POM, prefer data-testid, keep tests independent, use meaningful names, maintain separate suites, clean up data, use explicit waits
**Don't:** Use sleep(), share state between tests, use brittle selectors, mix test types, ignore flaky tests, hard-code URLs
**End of Framework**
