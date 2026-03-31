# Runtime Artifact Triggers
**Version:** v0.78.0
**Purpose:** Define when to offer artifact creation/update during development and transition phases.
Runtime artifact population happens **during development**, not at charter creation. Claude offers to document decisions, plans, and procedures when they arise naturally in conversation.
**Key Principle:** Offer, don't force. Users can decline any artifact creation.
## Construction/ Artifacts
**Design-Decisions/** -- Trigger: User makes or discusses architectural choice
| Trigger Pattern | Example Phrases |
|-----------------|-----------------|
| Technology selection | "Let's use Redis for caching", "We should go with PostgreSQL" |
| Architecture decision | "We'll use a microservices approach", "Let's add a message queue" |
| Pattern adoption | "We'll implement the repository pattern", "Using event sourcing" |
| Trade-off discussion | "We chose X over Y because...", "The trade-off is..." |
Detection keywords: technology comparison/selection, "decided to", "going with", "chose", architecture terms, design pattern names -> Offer: "Would you like me to document this decision in Construction/Design-Decisions/?"
**Template:** `Construction/Design-Decisions/YYYY-MM-DD-[decision-name].md`
```markdown
# Design Decision: [Title]
**Date:** [YYYY-MM-DD]
**Status:** Accepted
**Context:** Issue #[N] -- [Issue Title]
## Decision
[What was decided]
## Rationale
[Why this choice was made]
## Alternatives Considered
- [Alternative 1]: [Why rejected]
- [Alternative 2]: [Why rejected]
## Consequences
- [Positive consequence]
- [Negative consequence or trade-off]
## Issues Encountered
[Any blockers, surprises, or lessons learned during implementation]
---
*Documented during completion of #[N]*
```
**Test-Plans/** -- Trigger: User discusses testing approach or strategy
| Trigger Pattern | Example Phrases |
|-----------------|-----------------|
| Test strategy | "We should test this with...", "For testing, let's..." |
| Coverage discussion | "We need unit tests for...", "Integration tests should cover..." |
| Test data | "Test data should include...", "Edge cases to test..." |
| Test environment | "We'll need a staging environment for...", "Mock the external API" |
Detection keywords: test strategy discussion, "how to test", "test coverage", "test plan", specific test scenarios, test environment requirements -> Offer: "Would you like me to capture this test plan in Construction/Test-Plans/?"
**Template:** `Construction/Test-Plans/[feature-name]-test-plan.md`
```markdown
# Test Plan: [Feature Name]
**Created:** [YYYY-MM-DD]
**Related Issue:** [#XXX]
## Scope
[What is being tested]
## Test Strategy
### Unit Tests
- [ ] [Test case 1]
- [ ] [Test case 2]
### Integration Tests
- [ ] [Test case 1]
- [ ] [Test case 2]
### Edge Cases
- [ ] [Edge case 1]
- [ ] [Edge case 2]
## Test Data Requirements
[Data needed for tests]
## Environment Requirements
[Environment/mock requirements]
---
*Captured during [issue/context]*
```
**Tech-Debt/** -- Trigger: User defers work or notes shortcuts
| Trigger Pattern | Example Phrases |
|-----------------|-----------------|
| Deferral | "We'll fix that later", "TODO:", "FIXME:" |
| Shortcuts | "Quick fix for now", "Temporary workaround" |
| Known issues | "This isn't ideal but...", "We'll need to refactor" |
| Performance notes | "This could be optimized", "Not efficient but works" |
Detection keywords: "later", "TODO", "FIXME", "hack", "workaround", "technical debt", "refactor later", "not ideal", "temporary", "quick fix" -> Offer: "Would you like me to track this in Construction/Tech-Debt/?"
**Template:** `Construction/Tech-Debt/[item-name].md`
```markdown
# Tech Debt: [Title]
**Logged:** [YYYY-MM-DD]
**Priority:** [High/Medium/Low]
**Related Issue:** [#XXX]
## Description
[What the debt is]
## Current State
[What exists now]
## Desired State
[What should exist]
## Remediation Effort
[Estimated effort: Small/Medium/Large]
## Risks if Unaddressed
- [Risk 1]
- [Risk 2]
---
*Tracked during [issue/context]*
```
## Transition/ Artifacts
**Deployment-Guide.md** -- Trigger: During `/prepare-release` when missing or stale
| Trigger Pattern | Automatic Check |
|-----------------|-----------------|
| Release preparation | `/prepare-release` checks for Deployment-Guide.md |
| Missing file | File doesn't exist -> prompt to create |
| Stale content | Last updated > 30 days ago -> prompt to review |
**Template:** `Transition/Deployment-Guide.md`
```markdown
# Deployment Guide
**Version:** [Release version]
## Prerequisites
- [ ] [Prerequisite 1]
- [ ] [Prerequisite 2]
## Environment Configuration
| Variable | Description | Example |
|----------|-------------|---------|
| [VAR_NAME] | [Description] | [Example value] |
## Deployment Steps
### Pre-Deployment
1. [Step 1]
2. [Step 2]
### Deployment
1. [Step 1]
2. [Step 2]
### Post-Deployment
1. [Verification step 1]
2. [Verification step 2]
## Rollback Procedure
1. [Rollback step 1]
2. [Rollback step 2]
## Troubleshooting
| Issue | Solution |
|-------|----------|
| [Common issue] | [Resolution] |
---
*Updated during [release/version]*
```
**Runbook.md** -- Trigger: When operational procedures discussed
| Trigger Pattern | Example Phrases |
|-----------------|-----------------|
| Operations | "To restart the service...", "If the database goes down..." |
| Monitoring | "Watch for...", "Alert threshold is..." |
| Incident response | "When this happens, do...", "Escalation path is..." |
| Maintenance | "Monthly we need to...", "Backup procedure is..." |
Detection keywords: operational procedures, "how to handle", "when X happens", incident/alert response, maintenance tasks -> Offer: "Would you like me to add this to Transition/Runbook.md?"
**Template:** `Transition/Runbook.md`
```markdown
# Operations Runbook
## Service Overview
[Brief description of service]
## Health Checks
| Check | Command/URL | Expected Result |
|-------|-------------|-----------------|
| [Check name] | [Command] | [Expected] |
## Common Operations
### [Operation Name]
**When:** [Trigger condition]
**Steps:**
1. [Step 1]
2. [Step 2]
## Incident Response
### [Incident Type]
**Symptoms:** [What you'll see]
**Response:**
1. [Step 1]
2. [Step 2]
**Escalation:** [Who to contact]
## Maintenance Tasks
### [Task Name]
**Frequency:** [Daily/Weekly/Monthly]
**Steps:**
1. [Step 1]
2. [Step 2]
---
*Updated during [context]*
```
**User-Documentation.md** -- Trigger: When user-facing features complete
| Trigger Pattern | Example Phrases |
|-----------------|-----------------|
| Feature complete | "That feature is done", issue moved to Done |
| UI changes | "The new button...", "Users will see..." |
| API changes | "The endpoint now...", "New parameter added" |
| Workflow changes | "Users can now...", "The new process is..." |
Detection keywords: feature completion for user-facing work, UI/UX changes, new user workflows, API changes (if external) -> Offer: "Would you like to update Transition/User-Documentation.md?"
**Template:** `Transition/User-Documentation.md`
```markdown
# User Documentation
**Version:** [Release version]
## Overview
[What this product does for users]
## Getting Started
### Installation/Setup
[How to get started]
### Quick Start
1. [Step 1]
2. [Step 2]
## Features
### [Feature Name]
[Description]
**How to use:**
1. [Step 1]
2. [Step 2]
## FAQ
### [Question]
[Answer]
## Changelog
### [Version]
- [Change 1]
- [Change 2]
---
*Updated during [release/version]*
```
## Behavior Rules
| Behavior | Implementation |
|----------|----------------|
| **Always offer** | Present option, accept "no" gracefully |
| **Never force** | User can decline any artifact creation |
| **Remember preference** | If user declines type repeatedly, reduce frequency |
| **Context-aware** | Only offer when genuinely relevant |
**Offer Format:**
```
"I noticed you [made a decision/discussed testing/etc.].
Would you like me to document this in [artifact location]? (yes/no)"
```
**After User Accepts:**
1. Generate artifact using template
2. Show user the content
3. Ask for any edits
4. Save to appropriate location
5. Report: "Saved to [path]"
**End of Runtime Artifact Triggers**
