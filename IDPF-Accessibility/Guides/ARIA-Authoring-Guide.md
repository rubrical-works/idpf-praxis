# ARIA Authoring Guide
**Version:** v0.59.0

**Framework:** IDPF-Accessibility

---

## Overview

ARIA (Accessible Rich Internet Applications) provides attributes to make web content more accessible. This guide covers proper ARIA usage, common patterns, and testing approaches.

---

## The First Rule of ARIA

> **Don't use ARIA if you can use a native HTML element.**

Native HTML elements have built-in accessibility. Use ARIA only when:
- The functionality doesn't exist in HTML
- You must use a non-semantic element
- You need to enhance existing semantics

```html
<!-- PREFER: Native HTML -->
<button>Submit</button>

<!-- AVOID: ARIA on div when native available -->
<div role="button" tabindex="0">Submit</div>
```

---

## ARIA Categories

### Roles

Define what an element is:

| Category | Roles | Use For |
|----------|-------|---------|
| **Landmark** | banner, navigation, main, complementary, contentinfo, form, region, search | Page structure |
| **Widget** | button, checkbox, dialog, menu, tab, slider, tree | Interactive components |
| **Document Structure** | article, heading, list, listitem, table | Content structure |
| **Live Region** | alert, log, status, timer | Dynamic updates |

### States and Properties

Describe current state or relationships:

| Type | Attributes | Use For |
|------|------------|---------|
| **Widget States** | aria-checked, aria-disabled, aria-expanded, aria-hidden, aria-pressed, aria-selected | Component state |
| **Live Region** | aria-live, aria-atomic, aria-relevant, aria-busy | Update behavior |
| **Relationship** | aria-controls, aria-describedby, aria-labelledby, aria-owns | Element relationships |
| **Drag-and-Drop** | aria-grabbed, aria-dropeffect | Drag operations |

---

## Labeling Elements

### aria-label

Provides an accessible name directly:

```html
<!-- Icon button -->
<button aria-label="Close dialog">
  <svg>...</svg>
</button>

<!-- Search form -->
<input type="search" aria-label="Search products">
```

### aria-labelledby

References another element as the label:

```html
<h2 id="cart-heading">Shopping Cart</h2>
<ul aria-labelledby="cart-heading">
  <li>Product 1</li>
  <li>Product 2</li>
</ul>

<!-- Multiple references -->
<span id="fname">First Name</span>
<span id="required">(required)</span>
<input type="text" aria-labelledby="fname required">
```

### aria-describedby

Provides additional description:

```html
<label for="password">Password</label>
<input type="password"
       id="password"
       aria-describedby="password-hint password-error">
<p id="password-hint">Must be at least 8 characters</p>
<p id="password-error" class="error">Password is too short</p>
```

### Label Priority

Accessible name is computed in this order:
1. `aria-labelledby`
2. `aria-label`
3. Native `<label>` element
4. `title` attribute (avoid using alone)
5. Content (for some roles)

---

## Landmark Roles

Structure your page for screen reader navigation:

```html
<header role="banner">
  <!-- role="banner" is implicit for <header> when not nested -->
  <nav role="navigation" aria-label="Main">
    <!-- Primary navigation -->
  </nav>
</header>

<nav role="navigation" aria-label="Breadcrumb">
  <!-- Secondary navigation needs aria-label to distinguish -->
</nav>

<main role="main">
  <!-- Main content - only one per page -->

  <aside role="complementary" aria-label="Related articles">
    <!-- Sidebar content -->
  </aside>

  <form role="form" aria-label="Contact form">
    <!-- Significant form -->
  </form>

  <section role="region" aria-labelledby="section-heading">
    <h2 id="section-heading">Featured Products</h2>
    <!-- Regions need accessible names -->
  </section>
</main>

<footer role="contentinfo">
  <!-- role="contentinfo" is implicit for <footer> when not nested -->
</footer>
```

---

## Widget Patterns

### Button

```html
<!-- Toggle button -->
<button aria-pressed="false" onclick="toggle(this)">
  Dark Mode
</button>

<script>
function toggle(button) {
  const pressed = button.getAttribute('aria-pressed') === 'true';
  button.setAttribute('aria-pressed', !pressed);
}
</script>

<!-- Menu button -->
<button aria-haspopup="menu"
        aria-expanded="false"
        aria-controls="menu1">
  Options
</button>
<ul role="menu" id="menu1" hidden>
  <li role="menuitem">Edit</li>
  <li role="menuitem">Delete</li>
</ul>
```

### Checkbox and Radio

```html
<!-- Custom checkbox -->
<div role="checkbox"
     aria-checked="false"
     tabindex="0"
     aria-labelledby="cb-label"
     onclick="toggleCheck(this)"
     onkeydown="handleCheckKey(event, this)">
  <span class="check-indicator"></span>
</div>
<span id="cb-label">Accept terms</span>

<!-- Custom radio group -->
<div role="radiogroup" aria-labelledby="rg-label">
  <span id="rg-label">Choose size:</span>

  <div role="radio"
       aria-checked="true"
       tabindex="0"
       onkeydown="handleRadioKey(event, this)">
    Small
  </div>
  <div role="radio"
       aria-checked="false"
       tabindex="-1"
       onkeydown="handleRadioKey(event, this)">
    Medium
  </div>
  <div role="radio"
       aria-checked="false"
       tabindex="-1"
       onkeydown="handleRadioKey(event, this)">
    Large
  </div>
</div>
```

### Combobox (Autocomplete)

```html
<label for="city">City</label>
<div class="combobox-wrapper">
  <input type="text"
         id="city"
         role="combobox"
         aria-expanded="false"
         aria-autocomplete="list"
         aria-controls="city-listbox"
         aria-activedescendant="">

  <ul role="listbox"
      id="city-listbox"
      hidden>
    <li role="option" id="opt1">New York</li>
    <li role="option" id="opt2">Los Angeles</li>
    <li role="option" id="opt3">Chicago</li>
  </ul>
</div>

<script>
function showSuggestions(input, listbox, options) {
  input.setAttribute('aria-expanded', 'true');
  listbox.hidden = false;
}

function highlightOption(input, optionId) {
  // Update activedescendant to highlighted option
  input.setAttribute('aria-activedescendant', optionId);

  // Visual highlight
  document.querySelectorAll('[role="option"]').forEach(opt => {
    opt.classList.remove('highlighted');
  });
  document.getElementById(optionId).classList.add('highlighted');
}

function selectOption(input, listbox, option) {
  input.value = option.textContent;
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-activedescendant', '');
  listbox.hidden = true;
}
</script>
```

### Dialog

```html
<div role="dialog"
     aria-modal="true"
     aria-labelledby="dialog-title"
     aria-describedby="dialog-desc">

  <h2 id="dialog-title">Confirm Deletion</h2>
  <p id="dialog-desc">
    Are you sure you want to delete this item? This action cannot be undone.
  </p>

  <div class="dialog-buttons">
    <button type="button" class="btn-danger">Delete</button>
    <button type="button" class="btn-cancel">Cancel</button>
  </div>
</div>

<!-- Alert dialog - for important messages requiring acknowledgment -->
<div role="alertdialog"
     aria-modal="true"
     aria-labelledby="alert-title"
     aria-describedby="alert-desc">

  <h2 id="alert-title">Session Expiring</h2>
  <p id="alert-desc">
    Your session will expire in 2 minutes. Click to extend.
  </p>

  <button type="button">Extend Session</button>
</div>
```

### Tabs

```html
<div class="tabs">
  <div role="tablist" aria-label="Product Information">
    <button role="tab"
            aria-selected="true"
            aria-controls="panel-details"
            id="tab-details">
      Details
    </button>
    <button role="tab"
            aria-selected="false"
            aria-controls="panel-specs"
            id="tab-specs"
            tabindex="-1">
      Specifications
    </button>
    <button role="tab"
            aria-selected="false"
            aria-controls="panel-reviews"
            id="tab-reviews"
            tabindex="-1">
      Reviews
    </button>
  </div>

  <div role="tabpanel"
       id="panel-details"
       aria-labelledby="tab-details">
    <p>Product details content...</p>
  </div>

  <div role="tabpanel"
       id="panel-specs"
       aria-labelledby="tab-specs"
       hidden>
    <p>Specifications content...</p>
  </div>

  <div role="tabpanel"
       id="panel-reviews"
       aria-labelledby="tab-reviews"
       hidden>
    <p>Reviews content...</p>
  </div>
</div>
```

### Tree View

```html
<ul role="tree" aria-label="File Browser">
  <li role="treeitem"
      aria-expanded="true"
      aria-selected="false">
    <span>Documents</span>
    <ul role="group">
      <li role="treeitem" aria-selected="false">Resume.pdf</li>
      <li role="treeitem" aria-selected="true">Cover Letter.docx</li>
    </ul>
  </li>
  <li role="treeitem"
      aria-expanded="false"
      aria-selected="false">
    <span>Images</span>
    <ul role="group" hidden>
      <li role="treeitem" aria-selected="false">photo.jpg</li>
      <li role="treeitem" aria-selected="false">screenshot.png</li>
    </ul>
  </li>
</ul>
```

---

## Live Regions

### Basic Live Regions

```html
<!-- Polite: Wait for user pause -->
<div aria-live="polite" aria-atomic="true">
  <p>Your cart has 3 items</p>
</div>

<!-- Assertive: Interrupt immediately (use sparingly) -->
<div aria-live="assertive" aria-atomic="true">
  <p>Error: Form submission failed</p>
</div>
```

### Role-Based Live Regions

```html
<!-- Alert: Assertive by default -->
<div role="alert">
  Session expired. Please log in again.
</div>

<!-- Status: Polite by default -->
<div role="status">
  File uploaded successfully.
</div>

<!-- Log: Polite, for sequential updates -->
<div role="log" aria-live="polite">
  <p>10:30 - User joined</p>
  <p>10:31 - User sent message</p>
</div>

<!-- Timer: For time-based updates -->
<div role="timer" aria-live="off" aria-atomic="true">
  Time remaining: 5:00
</div>
```

### Live Region Attributes

```html
<!--
aria-live: polite | assertive | off
aria-atomic: true | false (announce whole region or just changes)
aria-relevant: additions | removals | text | all (what changes to announce)
aria-busy: true | false (region is updating)
-->

<!-- Example: Shopping cart -->
<div aria-live="polite"
     aria-atomic="true"
     aria-relevant="additions text">
  <span class="cart-count">3</span> items in cart
</div>

<!-- Example: Loading state -->
<div aria-live="polite" aria-busy="true">
  Loading search results...
</div>

<script>
// After loading complete
element.setAttribute('aria-busy', 'false');
element.innerHTML = '25 results found';
</script>
```

---

## Hidden Content

### When to Use aria-hidden

```html
<!-- Hide decorative elements from screen readers -->
<button>
  <svg aria-hidden="true">...</svg>
  <span>Menu</span>
</button>

<!-- Hide duplicate content -->
<nav aria-label="Main">
  <span aria-hidden="true">|</span> <!-- Visual separator -->
</nav>

<!-- NEVER hide important content -->
<!-- BAD: -->
<div aria-hidden="true">
  <p>Important information</p>
</div>
```

### Visually Hidden vs aria-hidden

```css
/* Screen reader only (visible to AT, hidden visually) */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Completely hidden (hidden from everyone) */
.hidden {
  display: none;
}

/* Or */
[hidden] {
  display: none;
}
```

```html
<!-- Visible only to screen readers -->
<span class="sr-only">Opens in new window</span>

<!-- Hidden from screen readers, visible to sighted users -->
<span aria-hidden="true">🔗</span>

<!-- Hidden from everyone -->
<div hidden>Not rendered</div>
```

---

## Forms

### Required Fields

```html
<label for="email">
  Email
  <span aria-hidden="true">*</span>
</label>
<input type="email"
       id="email"
       required
       aria-required="true">

<!-- Group requirement -->
<fieldset>
  <legend>
    Contact Method
    <span class="sr-only">(required)</span>
  </legend>
  <input type="radio" name="contact" id="phone" required>
  <label for="phone">Phone</label>

  <input type="radio" name="contact" id="sms">
  <label for="sms">SMS</label>
</fieldset>
```

### Error Handling

```html
<label for="password">Password</label>
<input type="password"
       id="password"
       aria-invalid="true"
       aria-describedby="pwd-error pwd-hint">
<p id="pwd-hint">Minimum 8 characters</p>
<p id="pwd-error" class="error" role="alert">
  Password must contain at least one number
</p>

<!-- Error summary -->
<div role="alert" aria-labelledby="error-heading">
  <h2 id="error-heading">Please fix the following errors:</h2>
  <ul>
    <li><a href="#email">Email is required</a></li>
    <li><a href="#password">Password is too short</a></li>
  </ul>
</div>
```

### Disabled vs Read-Only

```html
<!-- Disabled: Cannot interact, may not be submitted -->
<input type="text" disabled aria-disabled="true">

<!-- Read-only: Can focus, will be submitted -->
<input type="text" readonly aria-readonly="true" value="Fixed value">

<!-- Custom disabled state -->
<div role="button"
     aria-disabled="true"
     tabindex="-1"
     class="btn-disabled">
  Submit
</div>
```

---

## Tables

### Simple Data Table

```html
<table>
  <caption>Monthly Sales Report</caption>
  <thead>
    <tr>
      <th scope="col">Product</th>
      <th scope="col">Q1</th>
      <th scope="col">Q2</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">Widgets</th>
      <td>100</td>
      <td>150</td>
    </tr>
    <tr>
      <th scope="row">Gadgets</th>
      <td>200</td>
      <td>175</td>
    </tr>
  </tbody>
</table>
```

### Complex Table with IDs

```html
<table>
  <caption>Sales by Region and Quarter</caption>
  <thead>
    <tr>
      <th id="blank"></th>
      <th id="q1" colspan="2">Q1</th>
      <th id="q2" colspan="2">Q2</th>
    </tr>
    <tr>
      <th id="region">Region</th>
      <th id="q1-units" headers="q1">Units</th>
      <th id="q1-revenue" headers="q1">Revenue</th>
      <th id="q2-units" headers="q2">Units</th>
      <th id="q2-revenue" headers="q2">Revenue</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th id="north" headers="region">North</th>
      <td headers="north q1 q1-units">100</td>
      <td headers="north q1 q1-revenue">$10,000</td>
      <td headers="north q2 q2-units">120</td>
      <td headers="north q2 q2-revenue">$12,000</td>
    </tr>
  </tbody>
</table>
```

### Sortable Table

```html
<table>
  <thead>
    <tr>
      <th scope="col"
          aria-sort="ascending"
          aria-label="Name, sorted ascending">
        <button>Name ▲</button>
      </th>
      <th scope="col"
          aria-sort="none"
          aria-label="Date, click to sort">
        <button>Date</button>
      </th>
    </tr>
  </thead>
</table>
```

---

## Testing ARIA

### Automated Testing

```typescript
// tests/aria.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('ARIA Validation', () => {
  test('should have valid ARIA attributes', async ({ page }) => {
    await page.goto('/');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'cat.aria'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('should have proper landmark structure', async ({ page }) => {
    await page.goto('/');

    // Check for main landmark
    const main = page.locator('main, [role="main"]');
    expect(await main.count()).toBe(1);

    // Check for navigation
    const nav = page.locator('nav, [role="navigation"]');
    expect(await nav.count()).toBeGreaterThanOrEqual(1);

    // Check for banner (header)
    const header = page.locator('header, [role="banner"]');
    expect(await header.count()).toBe(1);
  });

  test('should have labeled interactive elements', async ({ page }) => {
    await page.goto('/');

    // All buttons should have accessible names
    const buttons = page.locator('button, [role="button"]');
    const buttonCount = await buttons.count();

    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i);
      const name = await button.evaluate((el) => {
        return el.getAttribute('aria-label') ||
               el.getAttribute('aria-labelledby') ||
               el.textContent?.trim();
      });
      expect(name).toBeTruthy();
    }
  });

  test('should have valid aria-expanded on expandable elements', async ({ page }) => {
    await page.goto('/');

    const expandable = page.locator('[aria-expanded]');
    const count = await expandable.count();

    for (let i = 0; i < count; i++) {
      const el = expandable.nth(i);
      const value = await el.getAttribute('aria-expanded');
      expect(['true', 'false']).toContain(value);

      // If expanded, controlled element should be visible
      const controlsId = await el.getAttribute('aria-controls');
      if (controlsId && value === 'true') {
        const controlled = page.locator(`#${controlsId}`);
        await expect(controlled).toBeVisible();
      }
    }
  });
});
```

### Manual Testing Checklist

```markdown
## ARIA Testing Checklist

### Landmarks
- [ ] Page has exactly one main landmark
- [ ] Navigation landmarks are labeled if multiple
- [ ] Landmarks don't nest incorrectly
- [ ] All content is within a landmark

### Labels
- [ ] All interactive elements have accessible names
- [ ] Labels are descriptive and unique
- [ ] No duplicate IDs for aria-labelledby
- [ ] aria-describedby provides supplemental info

### States
- [ ] aria-expanded matches visual state
- [ ] aria-selected matches selection state
- [ ] aria-checked matches checkbox/radio state
- [ ] aria-disabled prevents interaction
- [ ] aria-invalid indicates form errors

### Live Regions
- [ ] Dynamic updates announced appropriately
- [ ] aria-live="assertive" used sparingly
- [ ] Loading states use aria-busy
- [ ] Error messages use role="alert"

### Roles
- [ ] Custom widgets have appropriate roles
- [ ] Role matches expected interaction pattern
- [ ] Required ARIA attributes present for role
- [ ] No conflicting native and ARIA roles
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| `role="button"` on `<button>` | Redundant | Remove role |
| `aria-label` on `<div>` | Not focusable/interactive | Use on interactive element |
| `aria-hidden="true"` on focusable | Focus but no announcement | Remove aria-hidden or tabindex |
| Missing `aria-expanded` | State not communicated | Add and toggle |
| `aria-live` on initial content | Announced on load | Add after page load |
| Generic `aria-label="button"` | Not descriptive | Describe action |

---

## Best Practices

| Practice | Rationale |
|----------|-----------|
| Use native HTML first | Built-in semantics and behavior |
| Test with screen readers | ARIA support varies |
| Keep ARIA simple | Complexity leads to errors |
| Validate ARIA usage | Automated tools catch issues |
| Follow WAI-ARIA Authoring Practices | Established patterns |
| Update states in real-time | Stale state confuses users |

---

## Resources

- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [ARIA in HTML](https://www.w3.org/TR/html-aria/)
- [Using ARIA](https://www.w3.org/TR/using-aria/)

---

*Guide from IDPF-Accessibility Framework*
