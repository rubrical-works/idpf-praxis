# Accessibility Review Criteria
**Source:** Extracted from IDPF-Accessibility framework
**Domain:** WCAG conformance, assistive technology, automated a11y scanning

## Proposal Review Questions
- Does the proposal identify UI components that require accessibility compliance?
- Is the target WCAG conformance level specified (A, AA, or AAA)?
- Does the proposal address keyboard navigation and focus management for new interactions?
- Are assistive technology testing requirements included (screen readers, voice control)?
- Does the proposal consider legal requirements (ADA, Section 508, EAA) for the target audience?

## PRD Review Questions
- Do user stories include WCAG success criteria references for UI-facing features?
- Are non-functional requirements defined for accessibility scores (e.g., Lighthouse > 90)?
- Does the test plan include both automated scanning (axe-core, Pa11y) and manual testing?
- Are screen reader testing combinations specified (NVDA/Chrome, VoiceOver/Safari)?
- Does the PRD define severity SLAs for accessibility issues (Critical = before release)?
- Are color contrast ratios and non-text contrast requirements specified for visual design?

## Issue Review Questions
- Does the issue identify which WCAG success criteria are affected (e.g., 1.4.3, 2.1.1)?
- Are acceptance criteria verifiable with automated a11y tools (axe-core, Lighthouse)?
- Does the issue specify keyboard interaction behavior for new or modified components?
- Is the severity classification aligned with user impact (Critical = blocker for AT users)?
- Does the issue consider both embedded and separate testing approaches?
