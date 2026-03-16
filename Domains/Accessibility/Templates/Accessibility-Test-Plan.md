# Accessibility Test Plan: [Application/Feature Name]
**Version:** v0.65.0

**Date:** YYYY-MM-DD
**Author:** [Name]
**Status:** Draft | In Review | Approved

## 1. Overview

### 1.1 Purpose
[What accessibility aspects are being validated?]

### 1.2 Application Under Test
- **Repository:** [Link to application repo]
- **PRD Reference:** [Link to application PRD]
- **URL:** [Application URL]

### 1.3 Conformance Target
- [ ] WCAG 2.1 Level A
- [ ] WCAG 2.1 Level AA (Recommended)
- [ ] WCAG 2.2 Level AA
- [ ] WCAG 2.1 Level AAA (Partial)

### 1.4 Legal Requirements
- [ ] ADA (Americans with Disabilities Act)
- [ ] Section 508
- [ ] European Accessibility Act (EAA)
- [ ] Other: [Specify]

## 2. Scope

### 2.1 In Scope
| Page/Component | Priority | Notes |
|----------------|----------|-------|
| Homepage | High | Primary entry point |
| Login/Registration | High | Critical user flow |
| Main navigation | High | Used on all pages |
| [Feature 1] | Medium | [Notes] |

### 2.2 Out of Scope
- [Third-party widgets]
- [Legacy components scheduled for replacement]

### 2.3 User Flows to Test
1. [User registration and login]
2. [Primary task completion]
3. [Error handling and recovery]

## 3. Testing Approach

### 3.1 Automated Testing
| Tool | Scope | Frequency | Gate |
|------|-------|-----------|------|
| axe-core | All pages | Every commit | Fail on serious+ |
| Lighthouse | Key pages | Weekly | Score > 90 |
| Pa11y | Sitemap | Nightly | Fail on errors |

### 3.2 Manual Testing
| Test Type | Scope | Frequency |
|-----------|-------|-----------|
| Keyboard navigation | All interactive elements | Per release |
| Screen reader | Key user flows | Per release |
| Color contrast (visual) | New designs | Per design |
| Cognitive review | Content changes | Per release |

### 3.3 Assistive Technology Testing
| AT | Browser/OS | Version | Tester |
|----|------------|---------|--------|
| NVDA | Chrome/Windows | Latest | [Name] |
| VoiceOver | Safari/macOS | Latest | [Name] |
| VoiceOver | Safari/iOS | Latest | [Name] |
| TalkBack | Chrome/Android | Latest | [Name] |

## 4. WCAG Success Criteria Checklist

### 4.1 Perceivable (WCAG 1.x)

| SC | Description | Level | Test Method | Status |
|----|-------------|-------|-------------|--------|
| 1.1.1 | Non-text Content | A | Automated + Manual | [ ] |
| 1.2.1 | Audio-only and Video-only | A | Manual | [ ] |
| 1.3.1 | Info and Relationships | A | Automated + Manual | [ ] |
| 1.3.2 | Meaningful Sequence | A | Manual | [ ] |
| 1.4.1 | Use of Color | A | Manual | [ ] |
| 1.4.3 | Contrast (Minimum) | AA | Automated | [ ] |
| 1.4.4 | Resize Text | AA | Manual | [ ] |
| 1.4.11 | Non-text Contrast | AA | Manual | [ ] |

### 4.2 Operable (WCAG 2.x)

| SC | Description | Level | Test Method | Status |
|----|-------------|-------|-------------|--------|
| 2.1.1 | Keyboard | A | Manual | [ ] |
| 2.1.2 | No Keyboard Trap | A | Manual | [ ] |
| 2.4.1 | Bypass Blocks | A | Manual | [ ] |
| 2.4.2 | Page Titled | A | Automated | [ ] |
| 2.4.3 | Focus Order | A | Manual | [ ] |
| 2.4.4 | Link Purpose | A | Manual | [ ] |
| 2.4.6 | Headings and Labels | AA | Automated + Manual | [ ] |
| 2.4.7 | Focus Visible | AA | Manual | [ ] |

### 4.3 Understandable (WCAG 3.x)

| SC | Description | Level | Test Method | Status |
|----|-------------|-------|-------------|--------|
| 3.1.1 | Language of Page | A | Automated | [ ] |
| 3.2.1 | On Focus | A | Manual | [ ] |
| 3.2.2 | On Input | A | Manual | [ ] |
| 3.3.1 | Error Identification | A | Manual | [ ] |
| 3.3.2 | Labels or Instructions | A | Manual | [ ] |

### 4.4 Robust (WCAG 4.x)

| SC | Description | Level | Test Method | Status |
|----|-------------|-------|-------------|--------|
| 4.1.1 | Parsing | A | Automated | [ ] |
| 4.1.2 | Name, Role, Value | A | Automated + Manual | [ ] |
| 4.1.3 | Status Messages | AA | Manual | [ ] |

## 5. Issue Tracking

### 5.1 Severity Classification
| Severity | Impact | SLA |
|----------|--------|-----|
| Critical | Blocker for AT users | Before release |
| Serious | Major barrier | 30 days |
| Moderate | Degraded experience | 60 days |
| Minor | Inconvenience | 90 days |

### 5.2 Issue Template
```markdown
**Issue:** [Brief description]
**WCAG SC:** [e.g., 1.1.1]
**Severity:** [Critical/Serious/Moderate/Minor]
**Location:** [Page/Component]
**Description:** [Detailed description]
**Impact:** [How it affects users]
**Recommendation:** [How to fix]
**Screenshot:** [If applicable]
```

## 6. Reporting

### 6.1 Report Types
| Report | Audience | Frequency |
|--------|----------|-----------|
| Automated Scan Summary | Dev Team | Per build |
| WCAG Audit Report | Stakeholders | Per audit |
| Conformance Statement | Legal/Public | Annual |
| Progress Dashboard | Product Team | Monthly |

### 6.2 Metrics
| Metric | Target |
|--------|--------|
| Automated a11y score (Lighthouse) | > 90 |
| Critical issues open | 0 |
| Serious issues open | < 5 |
| WCAG AA conformance | 100% |

## 7. Remediation Process

### 7.1 Workflow
```
Finding → Triage → Assign → Fix → Verify → Close
```

### 7.2 Verification
- [ ] Automated scan passes
- [ ] Manual retest confirms fix
- [ ] AT testing confirms fix (if applicable)
- [ ] No regression introduced

## 8. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Third-party widget inaccessible | High | High | Evaluate alternatives, provide workaround |
| Design changes break a11y | Medium | Medium | A11y review in design process |
| Insufficient AT testing | Medium | High | Engage users with disabilities |
| Automated tools miss issues | High | Medium | Complement with manual testing |

## 9. Deliverables

- [ ] Automated scan configuration
- [ ] WCAG checklist completion
- [ ] Screen reader test results
- [ ] Keyboard navigation test results
- [ ] Accessibility audit report
- [ ] Remediation recommendations
- [ ] Conformance statement (VPAT)

## 10. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| A11y Lead | | | [ ] Approved |
| Dev Lead | | | [ ] Approved |
| Product Owner | | | [ ] Approved |

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | YYYY-MM-DD | [Name] | Initial draft |
