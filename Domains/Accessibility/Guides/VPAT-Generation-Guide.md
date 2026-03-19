# VPAT Generation Guide
**Version:** v0.66.1

**Framework:** IDPF-Accessibility

---

## Overview

A Voluntary Product Accessibility Template (VPAT) documents how a product conforms to accessibility standards. This guide covers VPAT creation, testing for VPAT compliance, and documentation best practices.

---

## What is a VPAT?

A VPAT is a document that explains how information and communication technology (ICT) products conform to accessibility standards such as:

- **Section 508** (US Federal)
- **WCAG 2.0/2.1/2.2** (W3C)
- **EN 301 549** (European)

### Why Create a VPAT?

| Audience | Purpose |
|----------|---------|
| Government agencies | Required for procurement |
| Enterprise customers | Evaluate accessibility |
| Legal/Compliance | Document due diligence |
| Development teams | Track accessibility status |

---

## VPAT Structure

The VPAT 2.5 template includes these sections:

```
1. Product Information
2. Evaluation Methods
3. WCAG 2.x Report
   - Level A criteria
   - Level AA criteria
   - Level AAA criteria (optional)
4. Section 508 Report (if applicable)
5. EN 301 549 Report (if applicable)
6. Legal Disclaimer
```

---

## Conformance Levels

| Level | Meaning | Description |
|-------|---------|-------------|
| **Supports** | Full conformance | Fully meets the criterion |
| **Partially Supports** | Some conformance | Some functionality meets the criterion |
| **Does Not Support** | No conformance | Does not meet the criterion |
| **Not Applicable** | N/A | Criterion doesn't apply |
| **Not Evaluated** | Unknown | Not yet tested |

---

## WCAG Criteria Reference

### Level A (Minimum)

| Criterion | Title | Quick Test |
|-----------|-------|------------|
| 1.1.1 | Non-text Content | All images have alt text |
| 1.2.1 | Audio-only/Video-only | Transcripts provided |
| 1.2.2 | Captions (Prerecorded) | Videos have captions |
| 1.2.3 | Audio Description | Video content described |
| 1.3.1 | Info and Relationships | Semantic HTML used |
| 1.3.2 | Meaningful Sequence | DOM order matches visual |
| 1.3.3 | Sensory Characteristics | Not color-dependent |
| 1.4.1 | Use of Color | Color not sole indicator |
| 1.4.2 | Audio Control | Auto-play can be stopped |
| 2.1.1 | Keyboard | All functions keyboard accessible |
| 2.1.2 | No Keyboard Trap | Focus can move freely |
| 2.1.4 | Character Key Shortcuts | Can be disabled |
| 2.2.1 | Timing Adjustable | Timeouts can be extended |
| 2.2.2 | Pause, Stop, Hide | Moving content controllable |
| 2.3.1 | Three Flashes | No seizure-inducing content |
| 2.4.1 | Bypass Blocks | Skip links provided |
| 2.4.2 | Page Titled | Descriptive page titles |
| 2.4.3 | Focus Order | Logical tab order |
| 2.4.4 | Link Purpose (In Context) | Links describe destination |
| 2.5.1 | Pointer Gestures | Path-based gestures have alternatives |
| 2.5.2 | Pointer Cancellation | Can abort touch actions |
| 2.5.3 | Label in Name | Visible label in accessible name |
| 2.5.4 | Motion Actuation | Motion features have alternatives |
| 3.1.1 | Language of Page | Lang attribute set |
| 3.2.1 | On Focus | No context change on focus |
| 3.2.2 | On Input | No unexpected changes |
| 3.3.1 | Error Identification | Errors clearly described |
| 3.3.2 | Labels or Instructions | Form fields labeled |
| 4.1.1 | Parsing | Valid HTML |
| 4.1.2 | Name, Role, Value | ARIA properly implemented |

### Level AA (Recommended)

| Criterion | Title | Quick Test |
|-----------|-------|------------|
| 1.2.4 | Captions (Live) | Live video captioned |
| 1.2.5 | Audio Description (Prerecorded) | Video has descriptions |
| 1.3.4 | Orientation | Works in any orientation |
| 1.3.5 | Identify Input Purpose | Input types specified |
| 1.4.3 | Contrast (Minimum) | 4.5:1 text contrast |
| 1.4.4 | Resize Text | Text scales to 200% |
| 1.4.5 | Images of Text | Real text, not images |
| 1.4.10 | Reflow | No horizontal scroll at 320px |
| 1.4.11 | Non-text Contrast | 3:1 UI contrast |
| 1.4.12 | Text Spacing | Supports custom text spacing |
| 1.4.13 | Content on Hover/Focus | Tooltips dismissible |
| 2.4.5 | Multiple Ways | Multiple navigation methods |
| 2.4.6 | Headings and Labels | Descriptive headings |
| 2.4.7 | Focus Visible | Focus indicator visible |
| 2.4.11 | Focus Not Obscured | Focus not hidden |
| 3.1.2 | Language of Parts | Lang for different languages |
| 3.2.3 | Consistent Navigation | Same navigation structure |
| 3.2.4 | Consistent Identification | Same functions identified same |
| 3.3.3 | Error Suggestion | Suggestions provided |
| 3.3.4 | Error Prevention | Reversible submissions |
| 4.1.3 | Status Messages | Live region announcements |

---

## Evaluation Process

### Step 1: Scope Definition

```markdown
## VPAT Scope

### Product Information
- **Product Name:** [Name]
- **Version:** [Version]
- **Platform:** Web/Desktop/Mobile
- **URL:** [If applicable]

### Evaluation Scope
- **Pages/Views Tested:**
  - [ ] Homepage
  - [ ] Login/Authentication
  - [ ] Main dashboard
  - [ ] Forms (contact, signup, etc.)
  - [ ] Search functionality
  - [ ] Settings/Profile
  - [ ] Help/Documentation

- **Components Tested:**
  - [ ] Navigation menus
  - [ ] Modal dialogs
  - [ ] Data tables
  - [ ] Form controls
  - [ ] Media players
  - [ ] Custom widgets
```

### Step 2: Testing Methods

```markdown
## Testing Methods Used

### Automated Testing
- **Tool:** axe DevTools, WAVE, Lighthouse
- **Coverage:** ~30-40% of issues
- **Report:** [Link to automated report]

### Manual Testing
- **Screen Readers:**
  - [x] NVDA 2024.x with Firefox
  - [x] VoiceOver with Safari
  - [ ] JAWS with Chrome

- **Keyboard Testing:**
  - [x] Tab navigation
  - [x] Focus management
  - [x] Skip links
  - [x] Custom widgets

- **Visual Testing:**
  - [x] Color contrast
  - [x] Zoom to 200%
  - [x] Reflow at 320px
  - [x] Text spacing

### Assistive Technology Testing
- **Date:** [Date]
- **Tester:** [Name/Company]
- **Methodology:** [Manual/WCAG-EM]
```

### Step 3: Criterion-by-Criterion Evaluation

```markdown
## 1.1.1 Non-text Content (Level A)

### Conformance Level
☐ Supports
☐ Partially Supports
☐ Does Not Support
☐ Not Applicable

### Remarks and Explanations
[Describe how the product meets or fails to meet this criterion]

### Testing Performed
- Tool: [Manual/axe/etc.]
- Pages tested: [List]
- Issues found: [Count]

### Known Issues
1. [Issue description] - [Planned fix date]
2. [Issue description] - [Workaround available]

### Evidence
- Screenshot: [Link]
- Test results: [Link]
```

---

## VPAT Template (Markdown)

```markdown
# [Product Name] Accessibility Conformance Report
## VPAT® Version 2.5

### Product Information

| Field | Value |
|-------|-------|
| **Product Name** | [Name] |
| **Product Version** | [Version] |
| **Report Date** | [Date] |
| **Contact** | [Email/Phone] |
| **Evaluation Methods** | [Testing methods used] |

### Applicable Standards/Guidelines

This report covers the degree of conformance for the following accessibility standards:

| Standard | Included in Report |
|----------|-------------------|
| WCAG 2.1 Level A | Yes |
| WCAG 2.1 Level AA | Yes |
| Section 508 | Yes |
| EN 301 549 | Yes |

### Terms

The terms used in the Conformance Level column are defined as follows:
- **Supports**: Functionality meets the criterion
- **Partially Supports**: Some functionality meets the criterion
- **Does Not Support**: Functionality does not meet the criterion
- **Not Applicable**: Criterion does not apply

### WCAG 2.1 Report

#### Table 1: Perceivable

| Criteria | Conformance Level | Remarks |
|----------|------------------|---------|
| 1.1.1 Non-text Content | Supports | All images have alt text |
| 1.2.1 Audio-only/Video-only | N/A | No audio/video content |
| 1.2.2 Captions (Prerecorded) | Partially Supports | 90% of videos captioned |
| 1.2.3 Audio Description | Does Not Support | Planned for Q2 |
| 1.3.1 Info and Relationships | Supports | Semantic HTML used |
| 1.3.2 Meaningful Sequence | Supports | DOM order matches visual |
| 1.3.3 Sensory Characteristics | Supports | Instructions don't rely on shape/color |
| 1.4.1 Use of Color | Supports | Color not sole indicator |
| 1.4.2 Audio Control | N/A | No auto-play audio |
| 1.4.3 Contrast (Minimum) | Partially Supports | 2 components below 4.5:1 |
| 1.4.4 Resize Text | Supports | Works at 200% zoom |
| 1.4.5 Images of Text | Supports | No images of text |
| 1.4.10 Reflow | Supports | No horizontal scroll at 320px |
| 1.4.11 Non-text Contrast | Partially Supports | Some icons below 3:1 |
| 1.4.12 Text Spacing | Supports | Tolerates custom spacing |
| 1.4.13 Content on Hover/Focus | Supports | Tooltips dismissible |

#### Table 2: Operable

| Criteria | Conformance Level | Remarks |
|----------|------------------|---------|
| 2.1.1 Keyboard | Partially Supports | Date picker needs improvement |
| 2.1.2 No Keyboard Trap | Supports | No traps found |
| 2.1.4 Character Key Shortcuts | N/A | No single-key shortcuts |
| 2.2.1 Timing Adjustable | Supports | Session timeout extendable |
| 2.2.2 Pause, Stop, Hide | N/A | No auto-updating content |
| 2.3.1 Three Flashes | Supports | No flashing content |
| 2.4.1 Bypass Blocks | Supports | Skip links present |
| 2.4.2 Page Titled | Supports | All pages titled |
| 2.4.3 Focus Order | Supports | Logical tab order |
| 2.4.4 Link Purpose | Supports | Links are descriptive |
| 2.4.5 Multiple Ways | Supports | Search and navigation available |
| 2.4.6 Headings and Labels | Supports | Descriptive headings |
| 2.4.7 Focus Visible | Supports | Custom focus indicator |
| 2.5.1 Pointer Gestures | N/A | No complex gestures required |
| 2.5.2 Pointer Cancellation | Supports | Actions on key-up |
| 2.5.3 Label in Name | Supports | Visible labels match names |
| 2.5.4 Motion Actuation | N/A | No motion features |

#### Table 3: Understandable

| Criteria | Conformance Level | Remarks |
|----------|------------------|---------|
| 3.1.1 Language of Page | Supports | lang="en" set |
| 3.1.2 Language of Parts | Supports | Foreign text marked |
| 3.2.1 On Focus | Supports | No unexpected changes |
| 3.2.2 On Input | Supports | Form changes explained |
| 3.2.3 Consistent Navigation | Supports | Same nav on all pages |
| 3.2.4 Consistent Identification | Supports | Same icons/labels used |
| 3.3.1 Error Identification | Supports | Errors clearly indicated |
| 3.3.2 Labels or Instructions | Supports | All fields labeled |
| 3.3.3 Error Suggestion | Supports | Suggestions provided |
| 3.3.4 Error Prevention | Supports | Confirmation for deletes |

#### Table 4: Robust

| Criteria | Conformance Level | Remarks |
|----------|------------------|---------|
| 4.1.1 Parsing | Supports | Valid HTML |
| 4.1.2 Name, Role, Value | Partially Supports | Custom widgets need improvement |
| 4.1.3 Status Messages | Supports | Live regions implemented |

### Legal Disclaimer

This document is provided for informational purposes only and does not
constitute a legal contract. The information is subject to change.

**Report Prepared By:** [Company Name]
**Date:** [Date]
```

---

## Automated VPAT Evidence Collection

### Test Script for Evidence

```typescript
// scripts/vpat-evidence.ts
import { test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as fs from 'fs';

interface VPATResult {
  criterion: string;
  title: string;
  level: string;
  status: 'Supports' | 'Partially Supports' | 'Does Not Support' | 'N/A';
  issues: string[];
  evidence: string;
}

const pages = [
  { name: 'Homepage', url: '/' },
  { name: 'Login', url: '/login' },
  { name: 'Dashboard', url: '/dashboard' },
  { name: 'Forms', url: '/contact' },
  { name: 'Search', url: '/search' },
];

test.describe('VPAT Evidence Collection', () => {
  const results: VPATResult[] = [];

  for (const page of pages) {
    test(`Evaluate ${page.name}`, async ({ page: browserPage }) => {
      await browserPage.goto(page.url);

      // Run axe scan
      const axeResults = await new AxeBuilder({ page: browserPage })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      // Map violations to WCAG criteria
      for (const violation of axeResults.violations) {
        const criterion = mapAxeToWCAG(violation.id);
        if (criterion) {
          results.push({
            criterion: criterion.id,
            title: criterion.title,
            level: criterion.level,
            status: 'Partially Supports',
            issues: violation.nodes.map(n => n.html),
            evidence: `${page.name}: ${violation.description}`
          });
        }
      }

      // Save screenshot for evidence
      await browserPage.screenshot({
        path: `./vpat-evidence/${page.name.toLowerCase()}.png`,
        fullPage: true
      });
    });
  }

  test.afterAll(() => {
    // Generate VPAT report
    const report = generateVPATReport(results);
    fs.writeFileSync('./vpat-report.md', report);
  });
});

function mapAxeToWCAG(axeId: string): { id: string; title: string; level: string } | null {
  const mapping: Record<string, { id: string; title: string; level: string }> = {
    'image-alt': { id: '1.1.1', title: 'Non-text Content', level: 'A' },
    'color-contrast': { id: '1.4.3', title: 'Contrast (Minimum)', level: 'AA' },
    'label': { id: '1.3.1', title: 'Info and Relationships', level: 'A' },
    'keyboard': { id: '2.1.1', title: 'Keyboard', level: 'A' },
    // Add more mappings
  };
  return mapping[axeId] || null;
}

function generateVPATReport(results: VPATResult[]): string {
  // Group by criterion
  const byCriterion = results.reduce((acc, r) => {
    if (!acc[r.criterion]) {
      acc[r.criterion] = { ...r, issues: [] };
    }
    acc[r.criterion].issues.push(...r.issues);
    return acc;
  }, {} as Record<string, VPATResult>);

  // Generate markdown
  let report = '# VPAT Evidence Report\n\n';
  for (const [id, data] of Object.entries(byCriterion)) {
    report += `## ${id} ${data.title} (Level ${data.level})\n\n`;
    report += `**Status:** ${data.status}\n\n`;
    if (data.issues.length > 0) {
      report += `**Issues Found:**\n`;
      data.issues.slice(0, 5).forEach(issue => {
        report += `- ${issue}\n`;
      });
    }
    report += '\n';
  }

  return report;
}
```

### CI Integration

```yaml
# .github/workflows/vpat-audit.yml
name: VPAT Accessibility Audit

on:
  schedule:
    - cron: '0 0 1 * *'  # Monthly
  workflow_dispatch:

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Run VPAT evidence collection
        run: npx playwright test scripts/vpat-evidence.ts

      - name: Upload VPAT report
        uses: actions/upload-artifact@v4
        with:
          name: vpat-report
          path: |
            vpat-report.md
            vpat-evidence/

      - name: Create issue if new violations
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = fs.readFileSync('vpat-report.md', 'utf8');
            const hasViolations = report.includes('Partially Supports') ||
                                  report.includes('Does Not Support');

            if (hasViolations) {
              await github.rest.issues.create({
                owner: context.repo.owner,
                repo: context.repo.repo,
                title: `VPAT Audit: New accessibility issues found`,
                body: report.slice(0, 65000),  // GitHub limit
                labels: ['accessibility', 'vpat']
              });
            }
```

---

## VPAT Maintenance

### Update Schedule

| Event | Action |
|-------|--------|
| Major release | Full VPAT re-evaluation |
| Feature release | Evaluate new features |
| Bug fix affecting a11y | Update relevant criteria |
| Standards update | Map to new criteria |
| Quarterly | Review and verify |

### Version Control

```markdown
## VPAT Change Log

### Version 3.0 - 2024-03-15
- Re-evaluated for WCAG 2.2
- Updated for new dashboard features
- Fixed: 1.4.3 contrast issues resolved

### Version 2.1 - 2024-01-10
- Updated for mobile app release
- Added EN 301 549 evaluation

### Version 2.0 - 2023-09-01
- Full re-evaluation for v3.0 release
- Fixed: 2.1.1 keyboard navigation issues
- Fixed: 4.1.2 ARIA implementation
```

---

## Best Practices

| Practice | Rationale |
|----------|-----------|
| Be honest about conformance | Builds trust, avoids legal issues |
| Document workarounds | Helps users while fixes are developed |
| Include fix timelines | Shows commitment to improvement |
| Test with real users | Automated tests miss many issues |
| Keep VPAT current | Outdated VPATs lose value |
| Version VPATs | Track improvements over time |

---

## Resources

- [VPAT Template (ITI)](https://www.itic.org/policy/accessibility/vpat)
- [Section 508 ICT Testing Baseline](https://ictbaseline.access-board.gov/)
- [WCAG-EM Report Tool](https://www.w3.org/WAI/eval/report-tool/)

---

*Guide from IDPF-Accessibility Framework*
