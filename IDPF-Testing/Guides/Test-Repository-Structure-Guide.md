# Test Repository Structure Guide
**Version:** v0.61.0

**Framework:** IDPF-Testing

---

## Overview

This guide documents recommended directory structures for test repositories. A well-organized structure improves maintainability, enables team collaboration, and supports CI/CD integration.

---

## Core Principles

1. **Separation of Concerns** - Group tests by type and functionality
2. **Convention over Configuration** - Follow predictable patterns
3. **Scalability** - Structure supports growth without reorganization
4. **Discoverability** - New team members find files intuitively

---

## Recommended Structure

### Full-Featured Test Repository

```
<test-repo-root>/
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Continuous integration
│       ├── nightly.yml               # Scheduled test runs
│       └── manual.yml                # Manual trigger workflow
├── PRD/
│   ├── README.md                     # Test documentation index
│   ├── Templates/
│   │   └── Test-Plan-Template.md     # Test plan template
│   └── TestPlans/
│       └── Sprint-1-TestPlan.md      # Active test plans
├── src/
│   ├── tests/
│   │   ├── unit/                     # Unit tests
│   │   │   ├── utils/
│   │   │   └── helpers/
│   │   ├── integration/              # Integration tests
│   │   │   ├── api/
│   │   │   └── database/
│   │   └── e2e/                      # End-to-end tests
│   │       ├── smoke/                # Critical path tests
│   │       ├── regression/           # Full regression suite
│   │       └── features/             # Feature-specific tests
│   │           ├── authentication/
│   │           ├── checkout/
│   │           └── search/
│   ├── pages/                        # Page Object Model
│   │   ├── BasePage.{ts,py,java}
│   │   ├── LoginPage.{ts,py,java}
│   │   ├── DashboardPage.{ts,py,java}
│   │   └── components/               # Reusable UI components
│   │       ├── Header.{ts,py,java}
│   │       └── Modal.{ts,py,java}
│   ├── api/                          # API client wrappers
│   │   ├── BaseClient.{ts,py,java}
│   │   ├── UserApi.{ts,py,java}
│   │   └── OrderApi.{ts,py,java}
│   ├── utils/                        # Test utilities
│   │   ├── assertions/               # Custom assertions
│   │   ├── data/                     # Data generators/factories
│   │   │   ├── UserFactory.{ts,py,java}
│   │   │   └── OrderFactory.{ts,py,java}
│   │   ├── helpers/                  # Helper functions
│   │   └── reporters/                # Custom reporters
│   └── config/                       # Configuration
│       ├── environments/
│       │   ├── dev.{json,yaml}
│       │   ├── staging.{json,yaml}
│       │   └── prod.{json,yaml}
│       └── test-data/
│           ├── users.json
│           └── products.json
├── fixtures/                         # Test fixtures
│   ├── api-responses/                # Mock API responses
│   ├── screenshots/                  # Baseline screenshots
│   └── test-files/                   # File upload test data
├── reports/                          # Test output (gitignored)
│   ├── html/
│   ├── junit/
│   └── coverage/
├── scripts/                          # Utility scripts
│   ├── setup.sh                      # Environment setup
│   ├── seed-data.sh                  # Test data seeding
│   └── cleanup.sh                    # Post-test cleanup
├── .env.example                      # Environment template
├── .gitignore
├── README.md
└── [package.json|requirements.txt|pom.xml]
```

---

## Structure by Test Type

### Unit Tests

Unit tests verify isolated components like utilities, helpers, and business logic.

```
src/tests/unit/
├── utils/
│   ├── formatters.test.ts            # Format utility tests
│   ├── validators.test.ts            # Validation tests
│   └── calculators.test.ts           # Calculation tests
├── helpers/
│   ├── date-helper.test.ts
│   └── string-helper.test.ts
└── factories/
    ├── user-factory.test.ts          # Factory function tests
    └── order-factory.test.ts
```

**Naming Convention:** `{module}.test.{ext}` or `test_{module}.{ext}`

**Example Test:**
```typescript
// src/tests/unit/utils/formatters.test.ts
import { formatCurrency, formatDate } from '../../utils/formatters';

describe('formatCurrency', () => {
  it('formats USD amounts correctly', () => {
    expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56');
  });

  it('handles zero values', () => {
    expect(formatCurrency(0, 'USD')).toBe('$0.00');
  });
});
```

---

### Integration Tests

Integration tests verify interactions between components, APIs, or databases.

```
src/tests/integration/
├── api/
│   ├── auth-api.test.ts              # Authentication endpoint tests
│   ├── users-api.test.ts             # User CRUD tests
│   └── orders-api.test.ts            # Order workflow tests
├── database/
│   ├── user-repository.test.ts       # Database queries
│   └── migrations.test.ts            # Migration verification
└── services/
    ├── payment-service.test.ts       # External service integration
    └── notification-service.test.ts
```

**Naming Convention:** `{integration-point}.test.{ext}`

**Example Test:**
```typescript
// src/tests/integration/api/users-api.test.ts
import { UserApi } from '../../api/UserApi';

describe('Users API', () => {
  const api = new UserApi();

  it('creates a new user', async () => {
    const user = await api.createUser({
      email: 'test@example.com',
      name: 'Test User'
    });

    expect(user.id).toBeDefined();
    expect(user.email).toBe('test@example.com');
  });

  it('retrieves user by ID', async () => {
    const user = await api.getUser('user-123');
    expect(user).toBeDefined();
  });
});
```

---

### End-to-End Tests

E2E tests verify complete user workflows through the UI.

```
src/tests/e2e/
├── smoke/                            # Critical path (run on every PR)
│   ├── login.spec.ts
│   ├── homepage.spec.ts
│   └── checkout-basic.spec.ts
├── regression/                       # Full suite (nightly/release)
│   ├── user-management/
│   ├── product-catalog/
│   └── order-processing/
└── features/                         # Feature-specific tests
    ├── authentication/
    │   ├── login.spec.ts
    │   ├── logout.spec.ts
    │   ├── password-reset.spec.ts
    │   └── two-factor.spec.ts
    ├── checkout/
    │   ├── cart-management.spec.ts
    │   ├── payment-flow.spec.ts
    │   ├── shipping-options.spec.ts
    │   └── order-confirmation.spec.ts
    └── search/
        ├── basic-search.spec.ts
        ├── filters.spec.ts
        └── sorting.spec.ts
```

**Naming Convention:** `{feature}.spec.{ext}` or `{feature}_spec.{ext}`

**Example Test:**
```typescript
// src/tests/e2e/features/authentication/login.spec.ts
import { test, expect } from '@playwright/test';
import { LoginPage } from '../../../pages/LoginPage';

test.describe('User Login', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.navigate();
  });

  test('successful login with valid credentials', async ({ page }) => {
    await loginPage.login('user@example.com', 'password123');
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test('shows error for invalid credentials', async () => {
    await loginPage.login('user@example.com', 'wrongpassword');
    await expect(loginPage.errorMessage).toBeVisible();
    await expect(loginPage.errorMessage).toContainText('Invalid credentials');
  });
});
```

---

## Page Object Model Structure

### Base Page

```typescript
// src/pages/BasePage.ts
import { Page, Locator } from '@playwright/test';

export abstract class BasePage {
  protected page: Page;
  protected baseUrl: string;

  constructor(page: Page) {
    this.page = page;
    this.baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  }

  abstract get path(): string;

  async navigate(): Promise<void> {
    await this.page.goto(`${this.baseUrl}${this.path}`);
  }

  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  // Common elements
  get header(): Locator {
    return this.page.locator('[data-testid="header"]');
  }

  get footer(): Locator {
    return this.page.locator('[data-testid="footer"]');
  }
}
```

### Page Implementation

```typescript
// src/pages/LoginPage.ts
import { Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  get path(): string {
    return '/login';
  }

  // Elements
  get emailInput(): Locator {
    return this.page.locator('[data-testid="email-input"]');
  }

  get passwordInput(): Locator {
    return this.page.locator('[data-testid="password-input"]');
  }

  get submitButton(): Locator {
    return this.page.locator('[data-testid="login-button"]');
  }

  get errorMessage(): Locator {
    return this.page.locator('[data-testid="error-message"]');
  }

  // Actions
  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
```

---

## Configuration Organization

### Environment-Specific Config

```
src/config/environments/
├── dev.json
├── staging.json
└── prod.json
```

**dev.json:**
```json
{
  "baseUrl": "http://localhost:3000",
  "apiUrl": "http://localhost:8080/api",
  "timeout": 30000,
  "retries": 0,
  "parallel": true
}
```

**staging.json:**
```json
{
  "baseUrl": "https://staging.example.com",
  "apiUrl": "https://staging-api.example.com/api",
  "timeout": 60000,
  "retries": 2,
  "parallel": true
}
```

### Test Data Organization

```
src/config/test-data/
├── users.json                        # User test data
├── products.json                     # Product test data
└── scenarios/
    ├── happy-path.json              # Standard flow data
    ├── edge-cases.json              # Boundary conditions
    └── error-cases.json             # Error scenario data
```

---

## Special Considerations

### API Test Structure

For API-only test suites:

```
src/
├── tests/
│   ├── contracts/                    # Contract tests
│   ├── functional/                   # Functional API tests
│   └── load/                         # Performance tests
├── api/
│   ├── clients/                      # API client classes
│   └── schemas/                      # JSON Schema definitions
└── mocks/
    ├── responses/                    # Mock response data
    └── servers/                      # Mock server configs
```

### Mobile Test Structure

For mobile app testing (Appium):

```
src/
├── tests/
│   ├── ios/                          # iOS-specific tests
│   ├── android/                      # Android-specific tests
│   └── cross-platform/               # Shared tests
├── screens/                          # Screen objects (mobile equivalent of pages)
│   ├── BaseScreen.{ext}
│   ├── ios/
│   └── android/
└── capabilities/
    ├── ios-caps.json
    └── android-caps.json
```

### Performance Test Structure

```
src/
├── scenarios/                        # Load test scenarios
│   ├── smoke.js
│   ├── load.js
│   ├── stress.js
│   └── soak.js
├── thresholds/                       # Performance thresholds
│   └── default.json
└── data/
    └── virtual-users.csv             # User pool for tests
```

---

## Files to Gitignore

```gitignore
# Test outputs
reports/
test-results/
coverage/
allure-results/
allure-report/

# Screenshots and videos (except baselines)
screenshots/actual/
videos/

# Environment files
.env
.env.local

# IDE
.idea/
.vscode/
*.iml

# Dependencies
node_modules/
venv/
target/
build/

# OS files
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
```

---

## Anti-Patterns to Avoid

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Flat test directory | Hard to navigate, no organization | Use subdirectories by type/feature |
| Tests mixed with production code | Confusing boundaries | Separate src/tests from app code |
| Hardcoded test data in tests | Duplication, maintenance burden | Use fixtures and factories |
| No page objects | Duplicate selectors, fragile tests | Implement Page Object Model |
| Environment config in code | Can't switch environments | Use external config files |
| Screenshots in git | Repository bloat | Gitignore, use CI artifacts |

---

## Quick Start Checklist

- [ ] Create base directory structure
- [ ] Set up src/tests with unit/integration/e2e subdirectories
- [ ] Implement BasePage and initial page objects
- [ ] Configure environment-specific settings
- [ ] Create .gitignore with test artifacts
- [ ] Set up CI workflow in .github/workflows
- [ ] Document structure in README.md

---

*Guide from IDPF-Testing Framework*
