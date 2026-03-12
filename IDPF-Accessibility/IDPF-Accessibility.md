# IDPF-Accessibility Framework
**Version:** v0.61.0
**Date:** 2025-12-01
**Extends:** IDPF-Testing

## Overview
IDPF-Accessibility is the framework for developing and executing accessibility testing activities. It provides specialized guidance for WCAG compliance testing, automated a11y scanning, manual accessibility audits, and assistive technology testing.
Accessibility testing validates that applications are usable by people with disabilities and comply with legal requirements (ADA, Section 508, EAA).

## Repository Type: Flexible
IDPF-Accessibility supports both deployment models:
| Model | Use Case | Location |
|-------|----------|----------|
| **Embedded** | Automated a11y checks in application CI | Application repo (`tests/a11y/`) |
| **Separate** | Comprehensive audits, manual test suites | Dedicated accessibility repo |

### Decision Guide
```
Choose Embedded when:
├── Running axe-core/Lighthouse in CI pipeline
├── Automated scans as quality gates
└── No dedicated accessibility team

Choose Separate when:
├── Comprehensive WCAG audits required
├── Manual testing with assistive technologies
├── Dedicated accessibility team/role
└── Detailed remediation tracking needed
```

## Accessibility Testing Types
| Test Type | Automation | Coverage | Tools |
|-----------|------------|----------|-------|
| **Automated Scans** | Full | ~30-40% of issues | axe-core, Lighthouse, Pa11y |
| **Keyboard Testing** | Partial | Focus management, navigation | Manual + scripts |
| **Screen Reader** | Manual | Content, announcements | NVDA, JAWS, VoiceOver |
| **Color Contrast** | Full | Visual design | axe, Contrast checkers |
| **Cognitive** | Manual | Readability, simplicity | Manual review |
| **Mobile a11y** | Partial | Touch targets, gestures | Accessibility Scanner |

## WCAG Conformance Levels
| Level | Description | Requirement |
|-------|-------------|-------------|
| **A** | Minimum accessibility | Must meet |
| **AA** | Standard accessibility | Typically required (legal) |
| **AAA** | Enhanced accessibility | Aspirational |
**Recommendation:** Target WCAG 2.1 Level AA as baseline.

## Tool Selection Guide

### Automated Scanning Tools
| Tool | Best For | Integration | Coverage |
|------|----------|-------------|----------|
| **axe-core** | CI/CD integration | npm, browser extension | Comprehensive |
| **Lighthouse** | Overall audit | Chrome, CI | Performance + a11y |
| **Pa11y** | CLI scanning | Node.js | Good coverage |
| **WAVE** | Visual feedback | Browser extension | Educational |
| **Tenon** | API-based | API, CI | Enterprise |

### Assistive Technology Testing
| Tool | Platform | Type | Cost |
|------|----------|------|------|
| **NVDA** | Windows | Screen reader | Free |
| **JAWS** | Windows | Screen reader | Commercial |
| **VoiceOver** | macOS/iOS | Screen reader | Built-in |
| **TalkBack** | Android | Screen reader | Built-in |
| **Dragon** | Windows/Mac | Voice control | Commercial |

### Decision Criteria
```
Accessibility Testing Approach:
├── Automated scanning required? → axe-core + Lighthouse
├── CI/CD integration needed? → axe-core, Pa11y
├── Screen reader testing? → NVDA (Windows), VoiceOver (Mac)
├── Mobile testing? → VoiceOver (iOS), TalkBack (Android)
└── Enterprise reporting? → Tenon, Deque products
```

## Directory Structure

### Embedded (in Application Repo)
```
<app-repo>/
├── src/
│   └── ...
├── tests/
│   └── a11y/
│       ├── axe.config.js
│       └── a11y.spec.ts
├── .github/
│   └── workflows/
│       └── accessibility.yml
└── PRD/
    └── TestPlans/
        └── Accessibility/
            └── WCAG-Audit-2024.md
```

### Separate Repository
```
<accessibility-test-repo>/
├── PRD/
│   ├── README.md
│   ├── Templates/
│   │   └── Accessibility-Test-Plan.md
│   └── TestPlans/
│       ├── TP-WCAG-Audit-Q4.md
│       └── TP-Screen-Reader-Testing.md
├── src/
│   ├── automated/
│   │   ├── axe-config.js
│   │   ├── lighthouse-config.js
│   │   └── pa11y-config.json
│   ├── manual/
│   │   ├── checklists/
│   │   └── scripts/
│   └── reports/
├── audits/
│   ├── 2024-Q4-WCAG-Audit/
│   │   ├── findings.md
│   │   ├── screenshots/
│   │   └── recommendations.md
│   └── templates/
├── .github/
│   └── workflows/
│       └── a11y-scan.yml
└── README.md
```

## WCAG Success Criteria Checklist

### Perceivable (WCAG 1.x)
| SC | Description | Level | Test Method |
|----|-------------|-------|-------------|
| 1.1.1 | Non-text Content | A | Automated + Manual |
| 1.2.1 | Audio-only and Video-only | A | Manual |
| 1.3.1 | Info and Relationships | A | Automated + Manual |
| 1.3.2 | Meaningful Sequence | A | Manual |
| 1.4.1 | Use of Color | A | Manual |
| 1.4.3 | Contrast (Minimum) | AA | Automated |
| 1.4.4 | Resize Text | AA | Manual |
| 1.4.11 | Non-text Contrast | AA | Manual |

### Operable (WCAG 2.x)
| SC | Description | Level | Test Method |
|----|-------------|-------|-------------|
| 2.1.1 | Keyboard | A | Manual |
| 2.1.2 | No Keyboard Trap | A | Manual |
| 2.4.1 | Bypass Blocks | A | Manual |
| 2.4.2 | Page Titled | A | Automated |
| 2.4.3 | Focus Order | A | Manual |
| 2.4.4 | Link Purpose | A | Manual |
| 2.4.6 | Headings and Labels | AA | Automated + Manual |
| 2.4.7 | Focus Visible | AA | Manual |

### Understandable (WCAG 3.x)
| SC | Description | Level | Test Method |
|----|-------------|-------|-------------|
| 3.1.1 | Language of Page | A | Automated |
| 3.2.1 | On Focus | A | Manual |
| 3.2.2 | On Input | A | Manual |
| 3.3.1 | Error Identification | A | Manual |
| 3.3.2 | Labels or Instructions | A | Manual |

### Robust (WCAG 4.x)
| SC | Description | Level | Test Method |
|----|-------------|-------|-------------|
| 4.1.1 | Parsing | A | Automated |
| 4.1.2 | Name, Role, Value | A | Automated + Manual |
| 4.1.3 | Status Messages | AA | Manual |

## Issue Severity Classification
| Severity | Impact | SLA |
|----------|--------|-----|
| Critical | Blocker for AT users | Before release |
| Serious | Major barrier | 30 days |
| Moderate | Degraded experience | 60 days |
| Minor | Inconvenience | 90 days |

## CI/CD Integration

### GitHub Actions Example
```yaml
# .github/workflows/accessibility.yml
name: Accessibility Checks

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  axe-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Build application
        run: npm run build

      - name: Start server
        run: npm run start &

      - name: Wait for server
        run: npx wait-on http://localhost:3000

      - name: Run axe accessibility tests
        run: npx @axe-core/cli http://localhost:3000 --exit

  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Lighthouse CI
        uses: treosh/lighthouse-ci-action@v11
        with:
          urls: |
            http://localhost:3000
            http://localhost:3000/login
          budgetPath: ./lighthouse-budget.json
          uploadArtifacts: true
```

## GitHub Project Labels
Extends IDPF-Testing labels:
| Label | Color | Description |
|-------|-------|-------------|
| `accessibility` | `#36B37E` | Accessibility work (from Core) |
| `wcag-a` | `#0E8A16` | WCAG Level A issue |
| `wcag-aa` | `#1D76DB` | WCAG Level AA issue |
| `wcag-aaa` | `#5319E7` | WCAG Level AAA issue |
| `screen-reader` | `#D93F0B` | Screen reader issue |
| `keyboard` | `#FBCA04` | Keyboard navigation issue |
| `color-contrast` | `#C5DEF5` | Color contrast issue |

## Workflow Phases
Following IDPF-Testing phases:
| Phase | Activities |
|-------|------------|
| **PLAN** | Create Accessibility Test Plan, define WCAG target level, identify pages/flows |
| **DESIGN** | Select tools, define test matrix (browsers, AT combinations) |
| **DEVELOP** | Configure automated scans, create manual checklists |
| **EXECUTE** | Run automated scans, perform manual testing, screen reader testing |
| **REPORT** | Document findings, create remediation recommendations, track metrics |

## Metrics
| Metric | Target |
|--------|--------|
| Automated a11y score (Lighthouse) | > 90 |
| Critical issues open | 0 |
| Serious issues open | < 5 |
| WCAG AA conformance | 100% |

## Legal Requirements Reference
| Regulation | Jurisdiction | Standard |
|------------|--------------|----------|
| **ADA** | United States | WCAG 2.1 AA |
| **Section 508** | US Federal | WCAG 2.0 AA |
| **EAA** | European Union | EN 301 549 (WCAG 2.1 AA) |
| **AODA** | Ontario, Canada | WCAG 2.0 AA |

## References

### Standards
- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)

### Tools Documentation
- [axe-core](https://www.deque.com/axe/)
- [Lighthouse](https://developer.chrome.com/docs/lighthouse/)
- [Pa11y](https://pa11y.org/)

### Testing Guides
- [WebAIM Testing](https://webaim.org/articles/)
- [Deque University](https://dequeuniversity.com/)
**End of Framework Document**
