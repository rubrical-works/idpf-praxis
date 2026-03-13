# TDD Test Plan: {Feature Name}

## Source
- **PRD:** PRD-{name}.md
- **Created:** {date}
- **Approval Issue:** #{to-be-created}
- **Test Strategy:** Inception/Test-Strategy.md

## Test Strategy Overview

| Level | Scope | Framework |
|-------|-------|-----------|
| Unit | Individual functions/components | {from Test-Strategy.md → Framework → Unit Tests} |
| Integration | Cross-component flows | {from Test-Strategy.md → Framework → Integration} |
| E2E | Critical user journeys | {from Test-Strategy.md → Framework → E2E, or "TBD"} |

## Epic Test Coverage

### Epic 1: {Name}

| Story | Acceptance Criteria | Test Cases |
|-------|--------------------| -----------|
| {Story title} | {AC from PRD} | ✓ Test valid input |
|               |               | ✓ Test invalid input |
|               |               | ✓ Test edge case |

[Repeat for each epic/story]

## Integration Test Points

| Components | Test Scenario | Priority |
|------------|---------------|----------|
| [Component A] ↔ [Component B] | Data flows correctly | P0 |

## E2E Scenarios

| Scenario | User Journey | Expected Outcome |
|----------|--------------|------------------|
| Happy path | User completes primary flow | Success state |
| Error recovery | User encounters error | Graceful handling |

## Coverage Targets

| Type | Target | Rationale |
|------|--------|-----------|
| Unit | {from Test-Strategy.md → Coverage Targets → Unit, default: 80%+} | Core logic |
| Integration | {from Test-Strategy.md → Coverage Targets → Integration, default: Key flows} | Boundary verification |
| E2E | {from Test-Strategy.md → Coverage Targets → E2E, default: Critical paths} | Journey validation |

## Approval Checklist

- [ ] All PRD acceptance criteria have test cases
- [ ] Edge cases and error conditions identified
- [ ] Integration points between epics mapped
- [ ] E2E scenarios cover critical journeys
- [ ] Coverage targets are realistic
