# IDPF-Accessibility Framework
**Version:** v0.66.4
**Type:** Domain
## Overview
Framework for accessibility testing: WCAG compliance, automated a11y scanning, manual audits, assistive technology testing. Validates applications are usable by people with disabilities and comply with ADA, Section 508, EAA.
## Repository Type: Flexible
| Model | Use Case | Location |
|-------|----------|----------|
| **Embedded** | Automated a11y checks in CI | Application repo (`tests/a11y/`) |
| **Separate** | Comprehensive audits, manual suites | Dedicated accessibility repo |
## Accessibility Testing Types
| Test Type | Automation | Coverage | Tools |
|-----------|------------|----------|-------|
| Automated Scans | Full | ~30-40% of issues | axe-core, Lighthouse, Pa11y |
| Keyboard Testing | Partial | Focus management | Manual + scripts |
| Screen Reader | Manual | Content, announcements | NVDA, JAWS, VoiceOver |
| Color Contrast | Full | Visual design | axe, Contrast checkers |
| Cognitive | Manual | Readability, simplicity | Manual review |
| Mobile a11y | Partial | Touch targets, gestures | Accessibility Scanner |
## WCAG Conformance Levels
| Level | Description | Requirement |
|-------|-------------|-------------|
| **A** | Minimum accessibility | Must meet |
| **AA** | Standard accessibility | Typically required (legal) |
| **AAA** | Enhanced accessibility | Aspirational |
**Recommendation:** Target WCAG 2.1 Level AA as baseline.
## Tool Selection Guide
### Automated Scanning
| Tool | Best For | Integration | Coverage |
|------|----------|-------------|----------|
| **axe-core** | CI/CD integration | npm, browser extension | Comprehensive |
| **Lighthouse** | Overall audit | Chrome, CI | Performance + a11y |
| **Pa11y** | CLI scanning | Node.js | Good coverage |
| **WAVE** | Visual feedback | Browser extension | Educational |
| **Tenon** | API-based | API, CI | Enterprise |
### Assistive Technology
| Tool | Platform | Type | Cost |
|------|----------|------|------|
| **NVDA** | Windows | Screen reader | Free |
| **JAWS** | Windows | Screen reader | Commercial |
| **VoiceOver** | macOS/iOS | Screen reader | Built-in |
| **TalkBack** | Android | Screen reader | Built-in |
| **Dragon** | Windows/Mac | Voice control | Commercial |
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
```yaml
name: Accessibility Checks
on: [push, pull_request]
jobs:
  axe-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run build
      - run: npm run start &
      - run: npx wait-on http://localhost:3000
      - run: npx @axe-core/cli http://localhost:3000 --exit
```
## Workflow Phases
| Phase | Activities |
|-------|------------|
| **PLAN** | Create Test Plan, define WCAG target, identify pages/flows |
| **DESIGN** | Select tools, define test matrix (browsers, AT combinations) |
| **DEVELOP** | Configure scans, create manual checklists |
| **EXECUTE** | Run scans, manual testing, screen reader testing |
| **REPORT** | Document findings, remediation recommendations, track metrics |
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
- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [axe-core](https://www.deque.com/axe/)
- [Lighthouse](https://developer.chrome.com/docs/lighthouse/)
**End of Framework Document**
