# IDPF-QA-Automation Framework
**Version:** v0.62.0
**Extends:** IDPF-Testing
**Framework-Debug:** True

## Overview
IDPF-QA-Automation is the framework for developing automated UI and end-to-end test suites. It extends IDPF-Testing with specialized guidance for building test automation projects using tools like Selenium, Playwright, Cypress, and Appium.
**Core Principle:** QA Automation tests operate against running applications from an external perspective, validating user-facing behavior through browser and mobile automation.

## Terminology
| Term | Definition |
|------|------------|
| **Page Object** | Class encapsulating a page's elements and actions |
| **Component Object** | Reusable UI component abstraction |
| **Locator/Selector** | Strategy for finding elements (CSS, XPath, data-testid) |
| **Smoke Suite** | Critical path tests run after every deployment |
| **Regression Suite** | Full feature coverage tests |
| **Flaky Test** | Test with inconsistent pass/fail results |
| **Test Data** | Input data and expected results for tests |
| **Wait Strategy** | Approach for handling asynchronous UI updates |

## Relationship to IDPF-Testing
This framework inherits from IDPF-Testing:
- Test development methodology (IDPF-Agile)
- Separate repository pattern
- GitHub Project integration
- Common workflow phases (Plan -> Design -> Develop -> Execute -> Report)
- Traceability to application PRD
- Test Plan document structure

## QA Automation Test Types
| Test Type | Scope | Execution Time | Trigger |
|-----------|-------|----------------|---------|
| **Smoke Tests** | Critical paths only | < 5 minutes | Every deployment |
| **Regression Tests** | Full feature coverage | 30-60 minutes | PR merge, nightly |
| **Cross-Browser Tests** | Browser compatibility | Varies | Weekly, release |
| **Mobile Tests** | Native/hybrid apps | Varies | PR merge, nightly |
| **Visual Tests** | UI appearance | 10-30 minutes | PR, release |
| **E2E Tests** | Full user journeys | 15-45 minutes | Nightly, release |

## Tool Ecosystem

### Web Automation Tools
| Tool | Best For | Language Support | Key Strengths |
|------|----------|------------------|---------------|
| **Selenium** | Enterprise, cross-browser | Java, Python, C#, JS, Ruby | Mature ecosystem, wide browser support |
| **Playwright** | Modern web apps | JS/TS, Python, C#, Java | Auto-wait, multiple browsers, traces |
| **Cypress** | JavaScript apps | JavaScript/TypeScript | Fast, great DX, time-travel debugging |
| **WebDriverIO** | Flexible automation | JavaScript/TypeScript | Plugin ecosystem, multiple protocols |

### Mobile Automation Tools
| Tool | Best For | Platform | Key Strengths |
|------|----------|----------|---------------|
| **Appium** | Cross-platform | iOS, Android | Single API for both platforms |
| **XCUITest** | iOS native | iOS only | Apple-supported, fast |
| **Espresso** | Android native | Android only | Google-supported, reliable |
| **Detox** | React Native | iOS, Android | Gray-box testing, fast |

### Visual Testing Tools
| Tool | Best For | Integration |
|------|----------|-------------|
| **Percy** | Component/page screenshots | CI/CD native |
| **Applitools** | AI-powered visual testing | All major frameworks |
| **BackstopJS** | Open-source visual regression | Self-hosted |
| **Playwright Screenshots** | Basic visual comparison | Built-in |

### Cloud Testing Providers
| Provider | Offering | Use Case |
|----------|----------|----------|
| **BrowserStack** | Real devices, browsers | Cross-browser, mobile |
| **Sauce Labs** | Real/virtual devices | Enterprise, compliance |
| **LambdaTest** | Browser/OS combinations | Cost-effective scale |
| **AWS Device Farm** | AWS integration | Mobile, AWS ecosystem |

## Architecture Patterns

### Page Object Model (POM)
The primary pattern for organizing test code.
**Principles:**
1. One page object per page/screen
2. Page objects encapsulate element locators
3. Page objects expose meaningful actions
4. Tests should not directly access locators
5. Page objects should not make assertions
**Structure:**
```
src/
├── pages/
│   ├── BasePage.ts           # Common page functionality
│   ├── LoginPage.ts
│   ├── DashboardPage.ts
│   └── CheckoutPage.ts
├── components/
│   ├── Header.ts             # Reusable components
│   ├── Footer.ts
│   └── SearchBar.ts
├── tests/
│   ├── smoke/
│   ├── regression/
│   └── e2e/
├── fixtures/                 # Test data
├── utils/                    # Helpers
└── config/                   # Environment configs
```
**Page Object Example:**
```typescript
// pages/LoginPage.ts
import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  // Locators - private, not exposed
  private readonly emailInput = '[data-testid="email"]';
  private readonly passwordInput = '[data-testid="password"]';
  private readonly submitButton = '[data-testid="login-submit"]';
  private readonly errorMessage = '[data-testid="error-message"]';

  constructor(page: Page) {
    super(page);
  }

  // Actions - public, meaningful names
  async login(email: string, password: string): Promise<void> {
    await this.page.fill(this.emailInput, email);
    await this.page.fill(this.passwordInput, password);
    await this.page.click(this.submitButton);
  }

  async getErrorMessage(): Promise<string> {
    return await this.page.textContent(this.errorMessage) ?? '';
  }

  async isErrorVisible(): Promise<boolean> {
    return await this.page.isVisible(this.errorMessage);
  }
}
```

### Screenplay Pattern (Alternative)
For complex interactions, consider the Screenplay pattern:
| Concept | Description | Example |
|---------|-------------|---------|
| **Actor** | User interacting with system | "Customer", "Admin" |
| **Task** | High-level action | "Login", "Purchase Item" |
| **Interaction** | Low-level action | "Click", "Enter Text" |
| **Question** | Query about system state | "Is Error Visible?" |
| **Ability** | Actor capability | "Browse the Web" |

### Component Object Pattern
For reusable UI components that appear on multiple pages:
```typescript
// components/SearchBar.ts
export class SearchBar {
  private readonly input = '[data-testid="search-input"]';
  private readonly submitBtn = '[data-testid="search-submit"]';
  private readonly suggestions = '[data-testid="search-suggestions"]';

  constructor(private page: Page, private container?: string) {}

  async search(query: string): Promise<void> {
    await this.page.fill(this.input, query);
    await this.page.click(this.submitBtn);
  }

  async getSuggestions(): Promise<string[]> {
    // Return suggestion texts
  }
}
```

## Test Data Management
| Approach | Use Case | Pros | Cons |
|----------|----------|------|------|
| **Fixtures** | Static test data | Simple, version controlled | Stale data risk |
| **Factories** | Dynamic generation | Fresh data, flexible | Setup complexity |
| **API Seeding** | Pre-test setup via API | Fast, reliable | Requires API access |
| **Database Seeding** | Direct DB manipulation | Full control | Tight coupling |
**Best Practices:**
- Use factories for user-specific data
- Use fixtures for reference data
- Prefer API seeding over DB manipulation
- Clean up test data after tests
- Isolate test data per test when possible

## Selector Strategy
| Priority | Selector Type | Example | Reliability |
|----------|---------------|---------|-------------|
| 1 | data-testid | `[data-testid="login-button"]` | Highest |
| 2 | ID | `#login-button` | High |
| 3 | Name | `[name="email"]` | High |
| 4 | ARIA | `[aria-label="Submit"]` | Medium-High |
| 5 | CSS Class (stable) | `.btn-primary` | Medium |
| 6 | Text content | `text="Login"` | Low |
| 7 | XPath | `//button[@type="submit"]` | Lowest |
**Best Practices:**
- Request `data-testid` attributes from developers
- Avoid index-based selectors (`nth-child`, `[0]`)
- Avoid selectors based on styling (`.red-button`)
- Use relative selectors within components
- Prefer semantic selectors (role, label) for accessibility

## Wait Strategies
| Strategy | Use Case | Example |
|----------|----------|---------|
| **Implicit Wait** | Global timeout | Set once, applies everywhere |
| **Explicit Wait** | Specific conditions | Wait for element visible |
| **Auto-Wait** | Framework handles | Playwright's built-in waits |
| **Custom Wait** | Complex conditions | Poll for API response |
**Best Practices:**
- Prefer explicit/auto waits over implicit
- Never use hard-coded `sleep()` delays
- Wait for specific conditions, not arbitrary time
- Set reasonable timeouts (5-30 seconds)

## Directory Structure
```
<qa-automation-repo>/
├── PRD/
│   ├── README.md
│   ├── Templates/
│   │   └── QA-Automation-Test-Plan.md
│   └── TestPlans/
│       ├── TP-Smoke-Suite.md
│       └── TP-Regression-Suite.md
├── src/
│   ├── pages/                    # Page Objects
│   │   ├── BasePage.ts
│   │   ├── LoginPage.ts
│   │   └── ...
│   ├── components/               # Reusable UI components
│   │   ├── Header.ts
│   │   └── ...
│   ├── tests/
│   │   ├── smoke/                # Smoke test specs
│   │   ├── regression/           # Regression test specs
│   │   └── e2e/                  # End-to-end journeys
│   ├── fixtures/                 # Test data files
│   │   ├── users.json
│   │   └── products.json
│   ├── utils/                    # Helpers, utilities
│   │   ├── TestHelpers.ts
│   │   └── ApiClient.ts
│   └── config/                   # Environment configs
│       ├── dev.config.ts
│       ├── staging.config.ts
│       └── prod.config.ts
├── reports/                      # Test results, screenshots
├── .github/
│   └── workflows/
│       ├── smoke.yml
│       ├── regression.yml
│       └── scheduled.yml
├── playwright.config.ts          # Or cypress.config.js, etc.
├── package.json
├── tsconfig.json
└── README.md
```

## CI/CD Integration

### GitHub Actions Patterns
**Smoke Tests (On Deploy):**
```yaml
name: Smoke Tests
on:
  deployment_status:
    states: [success]

jobs:
  smoke:
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install chromium
      - run: npm run test:smoke
        env:
          BASE_URL: ${{ github.event.deployment_status.target_url }}
```
**Regression Tests (On PR Merge):**
```yaml
name: Regression Tests
on:
  push:
    branches: [main]

jobs:
  regression:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        browser: [chromium, firefox, webkit]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install --with-deps ${{ matrix.browser }}
      - run: npx playwright test --project=${{ matrix.browser }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: report-${{ matrix.browser }}
          path: playwright-report/
```
**Scheduled Nightly:**
```yaml
name: Nightly Full Suite
on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM daily

jobs:
  full-suite:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:full
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: nightly-report
          path: playwright-report/
```

## Reporting & Metrics

### Key Metrics
| Metric | Target | Description |
|--------|--------|-------------|
| Pass Rate | > 95% | Percentage of tests passing |
| Flaky Rate | < 2% | Tests with inconsistent results |
| Smoke Execution | < 5 min | Time for smoke suite |
| Regression Execution | < 60 min | Time for full regression |
| Coverage | Track REQ mapping | Requirements covered by tests |

### Reporting Tools
| Tool | Integration | Features |
|------|-------------|----------|
| **Allure** | All frameworks | Rich HTML, history, trends |
| **HTML Reporter** | Built-in most | Simple, portable |
| **Playwright Report** | Playwright | Traces, screenshots, video |
| **Cypress Dashboard** | Cypress | Parallelization, analytics |

## Flaky Test Management

### Identification
- Track test results over time
- Flag tests failing > 5% of runs
- Monitor retry patterns

### Quarantine Strategy
1. Move flaky test to quarantine suite
2. Create issue for investigation
3. Fix root cause (not just add retries)
4. Return to main suite when stable

### Common Causes
- Race conditions / timing issues
- Shared test state
- External service dependencies
- Unstable test data
- Environment differences

## GitHub Project Labels
Extends IDPF-Testing labels:
| Label | Color | Hex | Description |
|-------|-------|-----|-------------|
| `qa-automation` | Orange | `#FF991F` | QA automation work (from Core) |
| `smoke-suite` | Green | `#0E8A16` | Smoke test development |
| `regression-suite` | Blue | `#1D76DB` | Regression test development |
| `cross-browser` | Purple | `#5319E7` | Cross-browser testing |
| `mobile` | Red | `#D93F0B` | Mobile automation |
| `flaky` | Yellow | `#FBCA04` | Flaky test issues |
| `maintenance` | Light Blue | `#C5DEF5` | Test maintenance tasks |
| `page-object` | Teal | `#0E8A16` | Page object development |

## Session Commands

### QA Automation Commands
- **QA-Start** - Begin QA automation development session
- **QA-Status** - Show test suite status and coverage
- **Create-PageObject** - Generate page object template
- **Create-TestSpec** - Generate test specification template
- **Run-Smoke** - Execute smoke test suite
- **Run-Regression** - Execute regression suite
- **Flaky-Report** - Show flaky test analysis

### Standard Commands
All IDPF-Testing and IDPF-Agile commands apply:
- Test-Plan-Start, Test-Plan-Review, Coverage-Check
- Run-Tests, Show-Coverage, List-Commands, etc.

## Integration Points
- **Extends:** IDPF-Testing
- **Test Methodology:** IDPF-Agile for test development
- **References:** Application PRD for traceability
- **CI/CD:** GitHub Actions, Jenkins, CircleCI
- **Cloud Providers:** BrowserStack, Sauce Labs, LambdaTest
- **Reporting:** Allure, HTML, Framework-native

## Best Practices Summary

### Do
- Use Page Object Model for organization
- Prefer `data-testid` selectors
- Keep tests independent and isolated
- Use meaningful test names
- Maintain separate smoke/regression suites
- Clean up test data
- Use explicit waits
- Version control test data fixtures

### Don't
- Use hard-coded delays (`sleep`)
- Share state between tests
- Use brittle selectors (indexes, CSS styling)
- Mix test types in same spec file
- Ignore flaky tests
- Hard-code environment URLs
- Skip Page Object for "simple" pages
**End of Framework**
