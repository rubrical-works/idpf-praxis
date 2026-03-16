# QA Automation Review Criteria
**Source:** Extracted from IDPF-QA-Automation framework
**Domain:** UI automation, test coverage, Page Object Model, flaky test management
## Proposal Review Questions
- Does the proposal identify UI flows that require automated test coverage?
- Are test suite boundaries defined (smoke < 5 min, regression < 60 min)?
- Does the proposal specify the automation tool and selector strategy (data-testid preferred)?
- Are cross-browser and mobile testing requirements identified?
- Does the proposal consider the Page Object Model architecture for test organization?
## PRD Review Questions
- Do user stories map to specific automated test scenarios (smoke, regression, e2e)?
- Are non-functional requirements defined for test metrics (pass rate > 95%, flaky rate < 2%)?
- Does the test plan include visual regression testing for UI-heavy features?
- Are CI/CD triggers defined (smoke on deploy, regression on PR merge, nightly full suite)?
- Does the PRD specify test data management approach (fixtures, factories, API seeding)?
- Are cloud testing provider requirements identified for cross-browser coverage?
## Issue Review Questions
- Does the issue identify which test suite is affected (smoke, regression, e2e)?
- Are acceptance criteria automatable with the project's chosen framework (Playwright, Cypress)?
- Does the issue follow Page Object Model conventions for new page/component interactions?
- Is the selector strategy specified (data-testid, ARIA roles, semantic selectors)?
- Does the issue address flaky test risk (wait strategies, test isolation, data cleanup)?
## Code Review Questions
- Are UI components using stable selectors (data-testid attributes) for automated test targeting?
- Does the code maintain test isolation (no shared mutable state between test cases)?
- Are async operations properly awaited with explicit wait conditions rather than arbitrary timeouts?
- Does the code follow Page Object Model patterns for component interaction abstractions?
- Are test fixtures and factory methods used for consistent test data setup?
- Does the code include proper teardown and cleanup to prevent test pollution?
- Are flaky test patterns avoided (race conditions, time-dependent assertions, order-dependent tests)?
