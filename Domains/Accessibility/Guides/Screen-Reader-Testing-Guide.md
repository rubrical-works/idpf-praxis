# Screen Reader Testing Guide
**Version:** v0.66.4

**Framework:** IDPF-Accessibility

---

## Overview

Screen reader testing ensures applications are usable by people who rely on assistive technology. This guide covers testing methodologies, common screen readers, and automated testing approaches.

---

## Screen Reader Overview

| Screen Reader | Platform | Cost | Usage Share |
|---------------|----------|------|-------------|
| **JAWS** | Windows | Commercial | ~40% |
| **NVDA** | Windows | Free | ~40% |
| **VoiceOver** | macOS/iOS | Built-in | ~10% |
| **TalkBack** | Android | Built-in | ~5% |
| **Narrator** | Windows | Built-in | ~5% |

### Recommended Testing Matrix

| Priority | Screen Reader | Browser | Platform |
|----------|---------------|---------|----------|
| P0 | NVDA | Firefox | Windows |
| P0 | VoiceOver | Safari | macOS |
| P1 | JAWS | Chrome | Windows |
| P1 | VoiceOver | Safari | iOS |
| P2 | TalkBack | Chrome | Android |

---

## Essential Keyboard Commands

### NVDA (Windows)

| Action | Command |
|--------|---------|
| Start/Stop NVDA | Ctrl + Alt + N |
| Read next item | ↓ or Tab |
| Read previous item | ↑ or Shift + Tab |
| Activate item | Enter or Space |
| List all headings | Insert + F7 |
| List all links | Insert + F7, then Alt + L |
| List all landmarks | Insert + F7, then Alt + D |
| Read from cursor | Insert + ↓ |
| Stop reading | Ctrl |
| Read current line | Insert + L |
| Read current word | Insert + K |

### VoiceOver (macOS)

| Action | Command |
|--------|---------|
| Turn on/off | Cmd + F5 |
| Read next item | VO + → (Ctrl + Option + →) |
| Read previous item | VO + ← |
| Activate item | VO + Space |
| Open rotor | VO + U |
| Navigate headings | VO + Cmd + H |
| Navigate landmarks | VO + Cmd + M |
| Read from cursor | VO + A |
| Stop reading | Ctrl |

### VoiceOver (iOS)

| Action | Gesture |
|--------|---------|
| Read next item | Swipe right |
| Read previous item | Swipe left |
| Activate item | Double tap |
| Open rotor | Two-finger rotate |
| Scroll | Three-finger swipe |
| Read from top | Two-finger swipe up |
| Stop reading | Two-finger tap |

### TalkBack (Android)

| Action | Gesture |
|--------|---------|
| Read next item | Swipe right |
| Read previous item | Swipe left |
| Activate item | Double tap |
| Open menu | Three-finger tap |
| Scroll | Two-finger swipe |
| Read from top | Global context menu → Read from top |

---

## Testing Methodology

### 1. Linear Navigation Test

Test content in reading order:

```markdown
## Test Case: Linear Navigation

**Steps:**
1. Start at top of page
2. Press Tab (or Down arrow in NVDA) repeatedly
3. Navigate through entire page

**Verify:**
- [ ] All interactive elements are reachable
- [ ] Reading order matches visual order
- [ ] Focus never gets trapped
- [ ] All content is announced
- [ ] No content is skipped
```

### 2. Heading Structure Test

```markdown
## Test Case: Heading Navigation

**Steps:**
1. Open heading list (NVDA: Insert + F7, VoiceOver: VO + U → Headings)
2. Review heading hierarchy

**Verify:**
- [ ] Page has exactly one H1
- [ ] Headings are hierarchical (no skipped levels)
- [ ] Headings describe content sections
- [ ] All major sections have headings
```

### 3. Landmark Navigation Test

```markdown
## Test Case: Landmark Navigation

**Steps:**
1. Open landmark list (NVDA: Insert + F7 → Landmarks, VoiceOver: VO + U → Landmarks)
2. Navigate through landmarks

**Expected Landmarks:**
- [ ] banner (header)
- [ ] navigation (nav)
- [ ] main (main content area)
- [ ] contentinfo (footer)
- [ ] complementary (aside, if present)
- [ ] form (if significant forms present)
```

### 4. Form Testing

```markdown
## Test Case: Form Accessibility

**Steps:**
1. Navigate to form
2. Tab through all fields
3. Submit form with errors

**Verify:**
- [ ] All fields have labels announced
- [ ] Required fields are indicated
- [ ] Field types are announced (text, checkbox, etc.)
- [ ] Error messages are announced on invalid submission
- [ ] Focus moves to first error or error summary
- [ ] Help text is associated with fields
```

### 5. Dynamic Content Test

```markdown
## Test Case: Dynamic Content

**Steps:**
1. Trigger content change (load data, show modal, etc.)
2. Listen for announcements

**Verify:**
- [ ] Loading states are announced
- [ ] New content is announced (via live regions)
- [ ] Modals trap focus appropriately
- [ ] Focus moves to new content when appropriate
- [ ] Removed content doesn't leave orphaned focus
```

---

## Common Issues and Fixes

### Issue: Content Not Announced

**Symptoms:** Screen reader skips content

**Common Causes:**
```html
<!-- BAD: Display none hides from screen readers -->
<div style="display: none">Important info</div>

<!-- BAD: Visibility hidden also hides -->
<div style="visibility: hidden">Important info</div>

<!-- BAD: aria-hidden removes from accessibility tree -->
<div aria-hidden="true">Important info</div>
```

**Fixes:**
```html
<!-- For visual hiding only, use sr-only class -->
<style>
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
</style>

<span class="sr-only">Screen reader only text</span>
```

### Issue: Missing Form Labels

**Symptoms:** "Edit text" or "Checkbox" announced without context

**Bad:**
```html
<input type="text" placeholder="Enter email">
```

**Good:**
```html
<!-- Explicit label -->
<label for="email">Email Address</label>
<input type="text" id="email" placeholder="user@example.com">

<!-- Or aria-label for icon buttons -->
<button aria-label="Search">
  <svg>...</svg>
</button>

<!-- Or aria-labelledby for complex labels -->
<span id="email-label">Email</span>
<span id="email-hint">We'll never share your email</span>
<input type="email" aria-labelledby="email-label" aria-describedby="email-hint">
```

### Issue: Focus Not Visible

**Symptoms:** Can't tell where focus is

**Fix:**
```css
/* Never remove focus outlines without replacement */
/* BAD: */
*:focus { outline: none; }

/* GOOD: Custom focus styles */
*:focus {
  outline: 2px solid #005fcc;
  outline-offset: 2px;
}

/* GOOD: Focus-visible for keyboard only */
*:focus:not(:focus-visible) {
  outline: none;
}
*:focus-visible {
  outline: 2px solid #005fcc;
  outline-offset: 2px;
}
```

### Issue: Dynamic Content Not Announced

**Symptoms:** Content changes but screen reader doesn't announce

**Fix - ARIA Live Regions:**
```html
<!-- Polite: Wait for user to finish current task -->
<div aria-live="polite" aria-atomic="true">
  3 items in cart
</div>

<!-- Assertive: Interrupt immediately (use sparingly) -->
<div role="alert" aria-live="assertive">
  Error: Session expired
</div>

<!-- Status: For status updates -->
<div role="status" aria-live="polite">
  Saved successfully
</div>
```

### Issue: Images Missing Alt Text

**Symptoms:** "Image" or file name announced

**Fix:**
```html
<!-- Informative image: describe content -->
<img src="chart.png" alt="Sales increased 25% from Q1 to Q2">

<!-- Decorative image: empty alt -->
<img src="decoration.png" alt="">

<!-- Complex image: longer description -->
<figure>
  <img src="process.png" alt="User registration flow diagram">
  <figcaption>
    Registration starts with email entry, proceeds to verification,
    then profile creation, and ends with dashboard access.
  </figcaption>
</figure>
```

---

## Automated Testing Integration

### axe-core with Playwright

```typescript
// tests/accessibility/screen-reader.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Screen Reader Accessibility', () => {
  test('should have proper heading structure', async ({ page }) => {
    await page.goto('/');

    // Check for heading hierarchy
    const headings = await page.$$eval('h1, h2, h3, h4, h5, h6', (elements) =>
      elements.map((el) => ({
        level: parseInt(el.tagName[1]),
        text: el.textContent?.trim(),
      }))
    );

    // Verify single H1
    const h1Count = headings.filter((h) => h.level === 1).length;
    expect(h1Count).toBe(1);

    // Verify no skipped levels
    let previousLevel = 0;
    for (const heading of headings) {
      const levelJump = heading.level - previousLevel;
      expect(levelJump).toBeLessThanOrEqual(1);
      previousLevel = heading.level;
    }
  });

  test('should have proper landmark structure', async ({ page }) => {
    await page.goto('/');

    // Check required landmarks
    await expect(page.locator('header, [role="banner"]')).toBeVisible();
    await expect(page.locator('nav, [role="navigation"]')).toBeVisible();
    await expect(page.locator('main, [role="main"]')).toBeVisible();
    await expect(page.locator('footer, [role="contentinfo"]')).toBeVisible();
  });

  test('should have labeled form fields', async ({ page }) => {
    await page.goto('/contact');

    // All inputs should have accessible names
    const inputs = page.locator('input, select, textarea');
    const count = await inputs.count();

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const accessibleName = await input.evaluate((el) => {
        return (el as HTMLInputElement).labels?.[0]?.textContent ||
               el.getAttribute('aria-label') ||
               el.getAttribute('aria-labelledby');
      });
      expect(accessibleName).toBeTruthy();
    }
  });

  test('should pass axe-core checks', async ({ page }) => {
    await page.goto('/');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
```

### Testing Focus Management

```typescript
test('modal should trap focus', async ({ page }) => {
  await page.goto('/');
  await page.click('button[data-open-modal]');

  // Modal should be focused
  const modal = page.locator('[role="dialog"]');
  await expect(modal).toBeFocused();

  // Tab through modal elements
  const focusableInModal = modal.locator(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const count = await focusableInModal.count();

  // Tab through all elements
  for (let i = 0; i < count + 1; i++) {
    await page.keyboard.press('Tab');
  }

  // Focus should wrap back to first element in modal
  const firstFocusable = focusableInModal.first();
  await expect(firstFocusable).toBeFocused();

  // Escape should close modal
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
});
```

---

## Testing Checklist

```markdown
## Screen Reader Testing Checklist

### Page Structure
- [ ] Single H1 per page
- [ ] Logical heading hierarchy
- [ ] Main landmark present
- [ ] Navigation landmark present
- [ ] Skip link to main content

### Navigation
- [ ] All interactive elements focusable
- [ ] Logical focus order
- [ ] No focus traps (except modals)
- [ ] Skip links work

### Content
- [ ] All images have appropriate alt text
- [ ] Links have descriptive text
- [ ] Tables have headers and captions
- [ ] Lists use proper markup

### Forms
- [ ] All fields labeled
- [ ] Required fields indicated
- [ ] Error messages announced
- [ ] Instructions associated with fields

### Dynamic Content
- [ ] Loading states announced
- [ ] Content updates announced via live regions
- [ ] Modal focus management correct
- [ ] Focus moved appropriately on content changes

### Interactive Components
- [ ] Custom widgets have ARIA roles
- [ ] State changes announced
- [ ] Keyboard operation matches expectations
```

---

## Screen Reader Testing Tools

| Tool | Purpose | URL |
|------|---------|-----|
| **NVDA** | Free Windows screen reader | nvaccess.org |
| **VoiceOver** | Built-in macOS/iOS | Built-in |
| **aXe DevTools** | Automated testing | deque.com/axe |
| **Accessibility Insights** | Manual testing guide | accessibilityinsights.io |
| **WAVE** | Visual accessibility checker | wave.webaim.org |

---

## Best Practices

| Practice | Rationale |
|----------|-----------|
| Test with multiple screen readers | Different readers interpret ARIA differently |
| Test both mouse and keyboard | Ensure all interactions are accessible |
| Test dynamic content | Live regions are often missed |
| Include screen reader users in testing | Real user feedback is invaluable |
| Automate what you can | Catch regressions early |
| Document expected behavior | Create baseline for comparison |

---

*Guide from IDPF-Accessibility Framework*
