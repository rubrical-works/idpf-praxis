# Selector Strategy Guide
**Version:** v0.63.1

**Purpose:** Define reliable element selection strategies for stable, maintainable test automation.

---

## Overview

Element selectors are the foundation of UI test automation. Poor selector choices lead to:
- Brittle tests that break with minor UI changes
- Flaky tests with intermittent failures
- High maintenance burden
- Slow test development

This guide establishes a selector priority hierarchy and best practices.

---

## Selector Priority Hierarchy

| Priority | Selector Type | Reliability | Maintenance | Example |
|----------|---------------|-------------|-------------|---------|
| 1 | `data-testid` | Highest | Lowest | `[data-testid="login-btn"]` |
| 2 | ID | High | Low | `#login-button` |
| 3 | Name | High | Low | `[name="email"]` |
| 4 | ARIA Attributes | Medium-High | Medium | `[aria-label="Submit"]` |
| 5 | Stable CSS Class | Medium | Medium | `.btn-primary` |
| 6 | Text Content | Low | High | `text="Login"` |
| 7 | XPath | Lowest | Highest | `//button[@type="submit"]` |

**Rule:** Always use the highest priority selector available.

---

## Priority 1: data-testid (Recommended)

### What It Is
A dedicated HTML attribute specifically for testing purposes.

### Examples
```html
<button data-testid="login-submit">Log In</button>
<input data-testid="email-input" type="email" />
<div data-testid="error-message">Invalid credentials</div>
```

### Selector Syntax
```typescript
// Playwright
page.locator('[data-testid="login-submit"]')

// Cypress
cy.get('[data-testid="login-submit"]')

// Selenium (CSS)
driver.findElement(By.cssSelector('[data-testid="login-submit"]'))
```

### Why It's Best
- **Explicit purpose:** Exists only for testing
- **Stable:** Not tied to styling or structure
- **Developer collaboration:** Clear contract between dev and QA
- **Refactoring-proof:** Survives UI redesigns

### Conventions
| Convention | Example | Use Case |
|------------|---------|----------|
| `data-testid` | Standard | Most projects |
| `data-test-id` | Alternative | Some teams prefer |
| `data-cy` | Cypress convention | Cypress projects |
| `data-test` | Short form | Brevity preference |

**Choose one convention and use it consistently.**

### Requesting from Developers
When `data-testid` attributes are missing:

```markdown
## Test Automation Request

Hi [Developer],

I need `data-testid` attributes added for automated testing.

**Elements needed:**
| Element | Suggested data-testid | Location |
|---------|----------------------|----------|
| Login button | `login-submit` | LoginForm.tsx |
| Email input | `login-email` | LoginForm.tsx |
| Error message | `login-error` | LoginForm.tsx |

This enables stable automated tests that won't break during UI refactoring.

Thanks!
```

---

## Priority 2: ID Attribute

### What It Is
The HTML `id` attribute, which must be unique per page.

### Examples
```html
<button id="login-button">Log In</button>
<input id="email-field" type="email" />
```

### Selector Syntax
```typescript
// Playwright
page.locator('#login-button')

// Cypress
cy.get('#login-button')

// Selenium
driver.findElement(By.id('login-button'))
```

### Pros
- Very fast (browser-optimized)
- Unique per page
- Widely supported

### Cons
- Not always available
- May be used for JavaScript functionality
- Changing ID can break both tests AND features

### Best Practice
Use IDs when `data-testid` is unavailable and the ID is semantically stable.

---

## Priority 3: Name Attribute

### What It Is
The HTML `name` attribute, commonly used on form elements.

### Examples
```html
<input name="email" type="email" />
<input name="password" type="password" />
<select name="country">...</select>
```

### Selector Syntax
```typescript
// Playwright
page.locator('[name="email"]')

// Cypress
cy.get('[name="email"]')

// Selenium
driver.findElement(By.name('email'))
```

### Pros
- Stable for form elements
- Semantically meaningful
- Often required for form submission

### Cons
- Limited to form elements
- Not always unique
- May need combining with other selectors

---

## Priority 4: ARIA Attributes

### What It Is
Accessibility attributes that describe element roles and labels.

### Examples
```html
<button aria-label="Close dialog">×</button>
<nav aria-labelledby="main-nav">...</nav>
<div role="alert">Error occurred</div>
```

### Selector Syntax
```typescript
// Playwright
page.getByRole('button', { name: 'Close dialog' })
page.locator('[aria-label="Close dialog"]')

// Cypress
cy.get('[aria-label="Close dialog"]')

// Selenium
driver.findElement(By.cssSelector('[aria-label="Close dialog"]'))
```

### Pros
- Accessibility-focused (good for a11y testing)
- Often stable
- Tests what users with assistive tech experience

### Cons
- Not all elements have ARIA attributes
- Requires accessibility-aware development
- Text-based, may change with localization

### Best Practice
Use ARIA selectors for accessibility testing or when they provide stable identification.

---

## Priority 5: Stable CSS Classes

### What It Is
CSS classes that are semantic and stable (not purely for styling).

### Examples
```html
<button class="btn btn-primary submit-form">Submit</button>
<!-- Use: .submit-form (semantic) -->
<!-- Avoid: .btn-primary (styling) -->
```

### Good vs Bad Classes

| Good (Stable) | Bad (Unstable) |
|---------------|----------------|
| `.login-form` | `.mt-4` |
| `.nav-menu` | `.text-red-500` |
| `.product-card` | `.col-md-6` |
| `.error-message` | `.d-flex` |

### Selector Syntax
```typescript
// Playwright
page.locator('.submit-form')

// Cypress
cy.get('.submit-form')

// Selenium
driver.findElement(By.cssSelector('.submit-form'))
```

### Pros
- Often available when other options aren't
- Can be combined for specificity

### Cons
- Styling changes may affect tests
- Class names can be cryptic (CSS-in-JS, Tailwind)
- Not as explicit as data-testid

---

## Priority 6: Text Content

### What It Is
Selecting elements by their visible text content.

### Examples
```typescript
// Playwright
page.getByText('Log In')
page.getByRole('button', { name: 'Submit' })

// Cypress
cy.contains('Log In')

// Selenium
driver.findElement(By.xpath("//*[text()='Log In']"))
```

### Pros
- Intuitive and readable
- Tests what users see
- No special attributes needed

### Cons
- **Localization:** Text changes in different languages
- **Duplicates:** Same text may appear multiple times
- **Fragile:** Any text change breaks the test
- **Whitespace:** Sensitive to spacing changes

### Best Practice
Use text selectors only when:
- Testing user-facing content specifically
- Other selectors are unavailable
- The application is single-language

---

## Priority 7: XPath (Avoid)

### What It Is
XML Path Language for navigating document structure.

### Examples
```typescript
// Avoid these patterns
//button[@type="submit"]
//div[@class="form"]/button
//table/tbody/tr[3]/td[2]
//div[contains(@class, "error")]/span
```

### Why to Avoid
- **Brittle:** Structural changes break selectors
- **Slow:** Less performant than CSS selectors
- **Complex:** Hard to read and maintain
- **DOM-coupled:** Tightly bound to HTML structure

### When XPath Might Be Necessary
- Selecting by text in older frameworks
- Complex structural relationships
- No alternative selectors available

### If You Must Use XPath
```typescript
// Better: Relative, short paths
//button[@data-action="submit"]

// Worse: Long structural paths
//div[@id="app"]/main/section[2]/form/div[3]/button
```

---

## Selector Anti-Patterns

### Index-Based Selectors

```typescript
// BAD: Will break when order changes
page.locator('.item').nth(2)
page.locator('tr:nth-child(3)')
driver.findElements(By.className("item")).get(2)
```

**Problem:** Adding or reordering elements breaks tests.

### Styling-Based Selectors

```typescript
// BAD: Will break when styling changes
page.locator('.text-red-500')
page.locator('.bg-blue-200')
page.locator('[style*="color: red"]')
```

**Problem:** Visual redesign breaks tests.

### Generated Class Names

```typescript
// BAD: CSS-in-JS generates random names
page.locator('.css-1a2b3c4')
page.locator('.sc-abcdef')
page.locator('._3Gd9hK')
```

**Problem:** Class names change on rebuild.

### Complex Structural Paths

```typescript
// BAD: Tightly coupled to DOM structure
page.locator('div > div > div > form > div:nth-child(2) > button')
```

**Problem:** Any structural change breaks the selector.

---

## Combining Selectors

When a single selector isn't unique, combine strategically:

### Good Combinations

```typescript
// Scope within a container
page.locator('[data-testid="login-form"]').locator('[data-testid="submit"]')

// Combine with text for uniqueness
page.locator('.btn').filter({ hasText: 'Submit' })

// Use role + name
page.getByRole('button', { name: 'Login' })
```

### Avoid Over-Combining

```typescript
// Too specific - fragile
page.locator('form.login-form > div.form-group > button.btn.btn-primary[type="submit"]')

// Better
page.locator('[data-testid="login-submit"]')
```

---

## Framework-Specific Best Practices

### Playwright

```typescript
// Preferred: Built-in locators
page.getByTestId('login-submit')       // data-testid
page.getByRole('button', { name: 'Login' })
page.getByLabel('Email')
page.getByPlaceholder('Enter email')

// Configure custom test ID attribute
// playwright.config.ts
export default defineConfig({
  use: {
    testIdAttribute: 'data-testid'
  }
})
```

### Cypress

```typescript
// Preferred: data-* attributes
cy.get('[data-cy="login-submit"]')
cy.get('[data-testid="email-input"]')

// Using contains for text
cy.contains('button', 'Submit')

// Chaining for scope
cy.get('[data-testid="login-form"]')
  .find('[data-testid="submit"]')
```

### Selenium

```java
// Priority order
driver.findElement(By.cssSelector("[data-testid='login-submit']"));
driver.findElement(By.id("login-button"));
driver.findElement(By.name("email"));
driver.findElement(By.cssSelector(".submit-form"));

// Avoid XPath when possible
// Use only when CSS cannot achieve the selection
```

---

## Checklist for Selector Review

Before merging test code, verify selectors:

- [ ] Uses highest priority selector available
- [ ] No index-based selectors (`nth`, `[0]`, `first()`)
- [ ] No styling-based selectors (Tailwind, utility classes)
- [ ] No generated class names (CSS-in-JS)
- [ ] No long XPath expressions
- [ ] No complex structural paths
- [ ] Scoped within logical containers
- [ ] `data-testid` requested if missing

---

## Selector Documentation Template

Document your selector strategy in test plans:

```markdown
## Selector Strategy

**Primary:** `data-testid` attributes
**Fallback Order:** ID > Name > ARIA > Stable CSS

### Conventions
- Attribute: `data-testid`
- Naming: `kebab-case` (e.g., `login-submit-btn`)
- Scope pattern: `[feature]-[element]-[qualifier]`

### Examples
| Element | Selector | Notes |
|---------|----------|-------|
| Login button | `[data-testid="login-submit"]` | Primary action |
| Email input | `[data-testid="login-email"]` | Form field |
| Error banner | `[data-testid="login-error"]` | Error state |
```

---

*Guide from IDPF-QA-Automation Framework*
