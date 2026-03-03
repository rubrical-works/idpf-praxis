# Keyboard Navigation Testing Guide
**Version:** v0.56.0

**Framework:** IDPF-Accessibility

---

## Overview

Keyboard accessibility ensures users who cannot use a mouse can navigate and interact with all functionality. This guide covers keyboard testing patterns, common issues, and automated testing approaches.

---

## Why Keyboard Navigation Matters

| User Group | Keyboard Dependency |
|------------|---------------------|
| Screen reader users | Primary input method |
| Motor impairments | Cannot use mouse precisely |
| Power users | Prefer keyboard efficiency |
| Temporary situations | Broken mouse, touchpad issues |

---

## Essential Keyboard Patterns

### Standard Navigation Keys

| Key | Action |
|-----|--------|
| `Tab` | Move to next focusable element |
| `Shift + Tab` | Move to previous focusable element |
| `Enter` | Activate link or button |
| `Space` | Activate button, toggle checkbox |
| `Arrow keys` | Navigate within widgets |
| `Escape` | Close modal, cancel action |
| `Home/End` | Move to first/last item |
| `Page Up/Down` | Scroll or move by page |

### Focus Order Requirements

```
┌────────────────────────────────────────────────────┐
│  Skip Link → Header → Nav → Main Content → Footer  │
│                                                    │
│  1. Follow visual reading order (top→bottom,       │
│     left→right in LTR languages)                   │
│  2. Group related elements                         │
│  3. Maintain context within components             │
└────────────────────────────────────────────────────┘
```

---

## Component-Specific Patterns

### Buttons

```html
<!-- Native button - keyboard accessible by default -->
<button type="button" onclick="doAction()">Click Me</button>

<!-- Custom button - must add keyboard support -->
<div role="button"
     tabindex="0"
     onclick="doAction()"
     onkeydown="handleKeydown(event)">
  Click Me
</div>

<script>
function handleKeydown(event) {
  // Activate on Enter or Space
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    doAction();
  }
}
</script>
```

### Links

```html
<!-- Real links - for navigation -->
<a href="/page">Go to page</a>

<!-- Button styled as link - for actions -->
<button type="button" class="link-style" onclick="showModal()">
  Open Dialog
</button>

<!-- AVOID: Non-semantic clickable elements -->
<!-- BAD: -->
<span onclick="navigate()">Go somewhere</span>
```

### Menus and Dropdowns

```html
<nav aria-label="Main navigation">
  <ul role="menubar">
    <li role="none">
      <button role="menuitem"
              aria-haspopup="true"
              aria-expanded="false"
              id="products-menu">
        Products
      </button>
      <ul role="menu" aria-labelledby="products-menu" hidden>
        <li role="none">
          <a role="menuitem" href="/product-a">Product A</a>
        </li>
        <li role="none">
          <a role="menuitem" href="/product-b">Product B</a>
        </li>
      </ul>
    </li>
  </ul>
</nav>

<script>
// Menu keyboard interaction
document.querySelector('[role="menubar"]').addEventListener('keydown', (e) => {
  const menuitem = e.target.closest('[role="menuitem"]');
  const menu = menuitem?.closest('[role="menu"]');

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      if (menuitem.getAttribute('aria-haspopup')) {
        openSubmenu(menuitem);
      } else {
        focusNextItem(menuitem);
      }
      break;

    case 'ArrowUp':
      e.preventDefault();
      focusPreviousItem(menuitem);
      break;

    case 'ArrowRight':
      e.preventDefault();
      focusNextTopLevel(menuitem);
      break;

    case 'ArrowLeft':
      e.preventDefault();
      focusPreviousTopLevel(menuitem);
      break;

    case 'Escape':
      e.preventDefault();
      closeSubmenu(menuitem);
      break;

    case 'Home':
      e.preventDefault();
      focusFirstItem(menu);
      break;

    case 'End':
      e.preventDefault();
      focusLastItem(menu);
      break;
  }
});
</script>
```

### Tabs

```html
<div class="tabs">
  <div role="tablist" aria-label="Sample Tabs">
    <button role="tab"
            aria-selected="true"
            aria-controls="panel-1"
            id="tab-1"
            tabindex="0">
      Tab 1
    </button>
    <button role="tab"
            aria-selected="false"
            aria-controls="panel-2"
            id="tab-2"
            tabindex="-1">
      Tab 2
    </button>
    <button role="tab"
            aria-selected="false"
            aria-controls="panel-3"
            id="tab-3"
            tabindex="-1">
      Tab 3
    </button>
  </div>

  <div role="tabpanel"
       id="panel-1"
       aria-labelledby="tab-1"
       tabindex="0">
    Content for tab 1
  </div>
  <div role="tabpanel"
       id="panel-2"
       aria-labelledby="tab-2"
       tabindex="0"
       hidden>
    Content for tab 2
  </div>
  <div role="tabpanel"
       id="panel-3"
       aria-labelledby="tab-3"
       tabindex="0"
       hidden>
    Content for tab 3
  </div>
</div>

<script>
// Tab keyboard interaction
// Arrow keys move between tabs, Tab moves to panel
document.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
  const tabs = Array.from(e.currentTarget.querySelectorAll('[role="tab"]'));
  const currentIndex = tabs.indexOf(e.target);

  let newIndex;

  switch (e.key) {
    case 'ArrowRight':
      newIndex = (currentIndex + 1) % tabs.length;
      break;
    case 'ArrowLeft':
      newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      break;
    case 'Home':
      newIndex = 0;
      break;
    case 'End':
      newIndex = tabs.length - 1;
      break;
    default:
      return;
  }

  e.preventDefault();
  activateTab(tabs[newIndex]);
});

function activateTab(tab) {
  // Deactivate all tabs
  const tablist = tab.closest('[role="tablist"]');
  tablist.querySelectorAll('[role="tab"]').forEach(t => {
    t.setAttribute('aria-selected', 'false');
    t.setAttribute('tabindex', '-1');
  });

  // Activate selected tab
  tab.setAttribute('aria-selected', 'true');
  tab.setAttribute('tabindex', '0');
  tab.focus();

  // Show corresponding panel
  const panelId = tab.getAttribute('aria-controls');
  document.querySelectorAll('[role="tabpanel"]').forEach(p => {
    p.hidden = p.id !== panelId;
  });
}
</script>
```

### Modal Dialogs

```html
<div role="dialog"
     aria-modal="true"
     aria-labelledby="dialog-title"
     aria-describedby="dialog-desc"
     class="modal"
     id="myModal">

  <h2 id="dialog-title">Confirm Action</h2>
  <p id="dialog-desc">Are you sure you want to proceed?</p>

  <div class="modal-actions">
    <button type="button" class="btn-primary">Confirm</button>
    <button type="button" class="btn-cancel">Cancel</button>
  </div>
</div>

<script>
class FocusTrap {
  constructor(element) {
    this.element = element;
    this.focusableSelector = [
      'button:not([disabled])',
      '[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ].join(', ');
  }

  activate() {
    this.previousFocus = document.activeElement;
    this.element.addEventListener('keydown', this.handleKeydown.bind(this));

    // Focus first focusable element
    const firstFocusable = this.element.querySelector(this.focusableSelector);
    if (firstFocusable) {
      firstFocusable.focus();
    }
  }

  deactivate() {
    this.element.removeEventListener('keydown', this.handleKeydown);
    if (this.previousFocus) {
      this.previousFocus.focus();
    }
  }

  handleKeydown(event) {
    if (event.key === 'Escape') {
      this.close();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = Array.from(
      this.element.querySelectorAll(this.focusableSelector)
    );
    const firstFocusable = focusable[0];
    const lastFocusable = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === firstFocusable) {
      event.preventDefault();
      lastFocusable.focus();
    } else if (!event.shiftKey && document.activeElement === lastFocusable) {
      event.preventDefault();
      firstFocusable.focus();
    }
  }

  close() {
    this.deactivate();
    this.element.hidden = true;
  }
}
</script>
```

### Accordions

```html
<div class="accordion">
  <h3>
    <button aria-expanded="false"
            aria-controls="section1"
            class="accordion-trigger"
            id="accordion1">
      Section 1
      <span aria-hidden="true">+</span>
    </button>
  </h3>
  <div id="section1"
       role="region"
       aria-labelledby="accordion1"
       hidden>
    <p>Content for section 1</p>
  </div>

  <h3>
    <button aria-expanded="false"
            aria-controls="section2"
            class="accordion-trigger"
            id="accordion2">
      Section 2
      <span aria-hidden="true">+</span>
    </button>
  </h3>
  <div id="section2"
       role="region"
       aria-labelledby="accordion2"
       hidden>
    <p>Content for section 2</p>
  </div>
</div>

<script>
document.querySelectorAll('.accordion-trigger').forEach(trigger => {
  trigger.addEventListener('keydown', (e) => {
    const triggers = Array.from(
      document.querySelectorAll('.accordion-trigger')
    );
    const index = triggers.indexOf(e.target);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        triggers[(index + 1) % triggers.length].focus();
        break;

      case 'ArrowUp':
        e.preventDefault();
        triggers[(index - 1 + triggers.length) % triggers.length].focus();
        break;

      case 'Home':
        e.preventDefault();
        triggers[0].focus();
        break;

      case 'End':
        e.preventDefault();
        triggers[triggers.length - 1].focus();
        break;
    }
  });

  trigger.addEventListener('click', () => {
    const expanded = trigger.getAttribute('aria-expanded') === 'true';
    trigger.setAttribute('aria-expanded', !expanded);

    const panel = document.getElementById(
      trigger.getAttribute('aria-controls')
    );
    panel.hidden = expanded;
  });
});
</script>
```

---

## Testing Procedures

### Basic Navigation Test

```markdown
## Test Case: Basic Tab Navigation

**Preconditions:** Page loaded, focus at top

**Steps:**
1. Press Tab repeatedly
2. Observe focus movement
3. Continue until focus returns to browser chrome

**Expected Results:**
- [ ] Focus visible on every focusable element
- [ ] Focus order follows visual order
- [ ] All interactive elements receive focus
- [ ] No elements are skipped
- [ ] Focus never gets lost
```

### Skip Link Test

```markdown
## Test Case: Skip Link

**Steps:**
1. Refresh page
2. Press Tab once
3. Observe skip link
4. Press Enter

**Expected Results:**
- [ ] Skip link appears as first focusable element
- [ ] Skip link is visible when focused
- [ ] Activating skip link moves focus to main content
- [ ] Focus is on main content area after skip
```

### Focus Trap Test (Modals)

```markdown
## Test Case: Modal Focus Trap

**Steps:**
1. Open modal
2. Tab through all focusable elements
3. Continue tabbing past last element
4. Press Shift+Tab past first element
5. Press Escape

**Expected Results:**
- [ ] Focus moves to modal when opened
- [ ] Tab cycles within modal only
- [ ] Shift+Tab cycles backward within modal
- [ ] Escape closes modal
- [ ] Focus returns to trigger element
```

### Component Keyboard Test

```markdown
## Test Case: Widget Keyboard Interaction

**For each interactive component, verify:**

### Buttons
- [ ] Enter activates
- [ ] Space activates

### Links
- [ ] Enter activates

### Checkboxes
- [ ] Space toggles

### Radio Buttons
- [ ] Arrow keys navigate between options
- [ ] Space selects

### Select/Dropdown
- [ ] Arrow keys change selection
- [ ] Enter/Space opens dropdown
- [ ] Escape closes dropdown

### Tabs
- [ ] Arrow keys navigate tabs
- [ ] Tab moves to panel content

### Menus
- [ ] Arrow keys navigate items
- [ ] Enter activates item
- [ ] Escape closes menu

### Accordions
- [ ] Enter/Space toggles section
- [ ] Arrow keys navigate between headers
```

---

## Automated Testing

### Playwright Keyboard Tests

```typescript
// tests/keyboard-navigation.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Keyboard Navigation', () => {
  test('should have visible focus indicators', async ({ page }) => {
    await page.goto('/');

    // Tab through elements and check focus visibility
    const focusableElements = page.locator(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const count = await focusableElements.count();

    for (let i = 0; i < Math.min(count, 20); i++) {
      await page.keyboard.press('Tab');

      const focused = page.locator(':focus');
      await expect(focused).toBeVisible();

      // Check focus styles
      const outlineWidth = await focused.evaluate((el) =>
        getComputedStyle(el).outlineWidth
      );
      const boxShadow = await focused.evaluate((el) =>
        getComputedStyle(el).boxShadow
      );

      const hasFocusStyle = outlineWidth !== '0px' ||
                           boxShadow !== 'none';
      expect(hasFocusStyle).toBe(true);
    }
  });

  test('should activate skip link', async ({ page }) => {
    await page.goto('/');

    // First Tab should focus skip link
    await page.keyboard.press('Tab');

    const skipLink = page.locator('a[href="#main"], a[href="#content"]');
    if (await skipLink.count() > 0) {
      await expect(skipLink).toBeFocused();

      // Activate skip link
      await page.keyboard.press('Enter');

      // Focus should be in main content
      const focused = page.locator(':focus');
      const isInMain = await focused.evaluate((el) =>
        el.closest('main') !== null ||
        el.id === 'main' ||
        el.id === 'content'
      );
      expect(isInMain).toBe(true);
    }
  });

  test('should not have keyboard traps', async ({ page }) => {
    await page.goto('/');

    const startTime = Date.now();
    const maxTime = 30000; // 30 seconds
    let lastFocusedElement = '';
    let stuckCount = 0;

    while (Date.now() - startTime < maxTime) {
      await page.keyboard.press('Tab');

      const currentFocused = await page.evaluate(() =>
        document.activeElement?.outerHTML || ''
      );

      if (currentFocused === lastFocusedElement) {
        stuckCount++;
        if (stuckCount > 5) {
          throw new Error('Focus appears to be trapped');
        }
      } else {
        stuckCount = 0;
      }

      lastFocusedElement = currentFocused;

      // If focus returns to body, we've completed the cycle
      const isBodyFocused = await page.evaluate(() =>
        document.activeElement === document.body
      );
      if (isBodyFocused) break;
    }

    expect(stuckCount).toBeLessThan(5);
  });

  test('modal should trap focus correctly', async ({ page }) => {
    await page.goto('/');

    // Find and click modal trigger
    const modalTrigger = page.locator('[data-modal-trigger]').first();
    if (await modalTrigger.count() === 0) return;

    await modalTrigger.click();

    // Wait for modal
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // Get focusable elements in modal
    const focusableInModal = modal.locator(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const count = await focusableInModal.count();

    // Tab through modal + 1 to verify wrap
    for (let i = 0; i < count + 1; i++) {
      await page.keyboard.press('Tab');
    }

    // Should be back at first focusable in modal
    const firstFocusable = focusableInModal.first();
    await expect(firstFocusable).toBeFocused();

    // Escape should close modal
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();

    // Focus should return to trigger
    await expect(modalTrigger).toBeFocused();
  });
});
```

### Cypress Keyboard Tests

```javascript
// cypress/e2e/keyboard.cy.js
describe('Keyboard Navigation', () => {
  it('should navigate form with keyboard', () => {
    cy.visit('/contact');

    // Tab to first field
    cy.get('body').tab();
    cy.focused().should('have.attr', 'name', 'name');

    // Tab to next field
    cy.focused().tab();
    cy.focused().should('have.attr', 'name', 'email');

    // Tab to submit
    cy.focused().tab();
    cy.focused().should('have.attr', 'type', 'submit');

    // Submit with Enter
    cy.focused().type('{enter}');
  });

  it('should navigate dropdown with arrows', () => {
    cy.visit('/');

    // Focus dropdown
    cy.get('[data-dropdown-trigger]').first().focus();

    // Open with Enter
    cy.focused().type('{enter}');
    cy.get('[role="menu"]').should('be.visible');

    // Navigate with arrows
    cy.focused().type('{downarrow}');
    cy.focused().should('have.attr', 'role', 'menuitem');

    cy.focused().type('{downarrow}');
    cy.focused().type('{enter}');

    // Menu should close
    cy.get('[role="menu"]').should('not.be.visible');
  });

  it('should handle tab panels', () => {
    cy.visit('/tabs-page');

    // Focus tab list
    cy.get('[role="tab"]').first().focus();

    // Arrow to next tab
    cy.focused().type('{rightarrow}');
    cy.focused().should('have.attr', 'aria-selected', 'true');

    // Tab to panel
    cy.focused().tab();
    cy.focused().should('have.attr', 'role', 'tabpanel');
  });
});
```

---

## Focus Visibility CSS

```css
/* Modern focus styles */
:focus {
  outline: 2px solid var(--focus-color, #005fcc);
  outline-offset: 2px;
}

/* Only show focus ring for keyboard users */
:focus:not(:focus-visible) {
  outline: none;
}

:focus-visible {
  outline: 2px solid var(--focus-color, #005fcc);
  outline-offset: 2px;
}

/* High contrast mode support */
@media (prefers-contrast: more) {
  :focus-visible {
    outline: 3px solid;
    outline-offset: 3px;
  }
}

/* Ensure focus is visible on all backgrounds */
.dark-bg :focus-visible {
  outline-color: #fff;
  box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.5);
}
```

---

## Common Issues and Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Focus not visible | outline: none without replacement | Add custom focus styles |
| Can't reach element | Missing tabindex or disabled | Add tabindex="0" or enable |
| Focus stuck | tabindex > 0 or JS trap | Use tabindex="0" only, check event handlers |
| Wrong order | Absolute positioning, flexbox order | Use DOM order matching visual |
| Lost focus | Element removed from DOM | Move focus to logical next element |
| Modal not trapping | No focus management | Implement focus trap |

---

## Best Practices

| Practice | Rationale |
|----------|-----------|
| Use native elements when possible | Built-in keyboard support |
| Test without mouse | Find navigation gaps |
| Visible focus at all times | Users need to track position |
| Logical focus order | Matches user expectations |
| Escape to dismiss | Standard pattern for overlays |
| Return focus on close | Maintain context |

---

*Guide from IDPF-Accessibility Framework*
