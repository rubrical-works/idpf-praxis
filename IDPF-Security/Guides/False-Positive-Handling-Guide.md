# False Positive Handling Strategy
**Version:** v0.61.0

**Framework:** IDPF-Security

---

## Overview

False positives in security scanning waste time and erode trust in tools. This guide covers triage processes, suppression techniques, and documentation practices.

---

## False Positive Categories

| Category | Description | Example |
|----------|-------------|---------|
| **Tool Limitation** | Scanner can't understand context | Sanitized input flagged as injection |
| **Intentional Pattern** | Code is secure by design | Test data that looks like credentials |
| **Environment Specific** | Issue doesn't apply to runtime | Dev-only debug endpoints |
| **Risk Accepted** | Known issue with mitigating controls | Legacy code with WAF protection |

---

## Triage Workflow

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   New Finding   │───→│    Triage       │───→│    Classify     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                      │
                       ┌──────────────────────────────┼──────────────────────────────┐
                       │                              │                              │
                       ▼                              ▼                              ▼
              ┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
              │  True Positive  │          │ False Positive  │          │    Uncertain    │
              │  → Fix Issue    │          │  → Suppress     │          │  → Investigate  │
              └─────────────────┘          └─────────────────┘          └─────────────────┘
```

### Triage Checklist

```markdown
## Finding Triage: [Finding ID]

### Basic Information
- **Tool:** [SonarQube/Semgrep/CodeQL]
- **Rule ID:** [e.g., java:S2631]
- **Severity:** [Critical/High/Medium/Low]
- **File:** [path/to/file.java:42]

### Triage Questions
1. [ ] Is the flagged code actually executed in production?
2. [ ] Does user input reach this code path?
3. [ ] Are there existing sanitization/validation controls?
4. [ ] What's the actual attack vector?
5. [ ] Can this be exploited in our environment?

### Classification
- [ ] True Positive - Needs fix
- [ ] False Positive - Tool limitation
- [ ] False Positive - Test code
- [ ] False Positive - Generated code
- [ ] Risk Accepted - Documented exception

### Decision
**Classification:** [Decision]
**Rationale:** [Why this classification]
**Reviewed by:** [Name]
**Date:** [YYYY-MM-DD]
```

---

## Suppression Methods

### Inline Suppression

**Java (SonarQube):**
```java
@SuppressWarnings("java:S2068") // Reason: Test credentials, not production
public class TestCredentials {
    private static final String TEST_PASSWORD = "test123";
}

// Or NOSONAR comment
String query = buildSafeQuery(input); // NOSONAR: Input is sanitized by buildSafeQuery()
```

**Python (Semgrep):**
```python
# nosemgrep: hardcoded-password
TEST_PASSWORD = "test_only_password"  # Only used in unit tests

# Or with reason
# nosemgrep: sql-injection - input validated by sanitize_input()
cursor.execute(f"SELECT * FROM users WHERE id = {sanitize_input(user_id)}")
```

**JavaScript (ESLint Security):**
```javascript
// eslint-disable-next-line security/detect-object-injection
const value = obj[userInput]; // userInput is validated enum
```

### Configuration-Based Suppression

**SonarQube sonar-project.properties:**
```properties
# Ignore specific rule in specific files
sonar.issue.ignore.multicriteria=e1,e2,e3

# Test credentials in test files
sonar.issue.ignore.multicriteria.e1.ruleKey=java:S2068
sonar.issue.ignore.multicriteria.e1.resourceKey=**/test/**/*.java

# Generated code
sonar.issue.ignore.multicriteria.e2.ruleKey=*
sonar.issue.ignore.multicriteria.e2.resourceKey=**/generated/**

# Specific false positive
sonar.issue.ignore.multicriteria.e3.ruleKey=java:S2631
sonar.issue.ignore.multicriteria.e3.resourceKey=src/main/java/com/example/SafeQueryBuilder.java
```

**Semgrep .semgrepignore:**
```yaml
# Ignore test files
*_test.py
*_test.go
**/__tests__/**
**/test/**

# Ignore specific directories
vendor/
node_modules/
generated/

# Ignore specific files (use sparingly)
# src/legacy/unsafe_but_accepted.py
```

**CodeQL query filters:**
```yaml
# codeql-config.yml
query-filters:
  - exclude:
      id: js/sql-injection
      paths:
        - "**/test/**"
        - "**/migrations/**"
```

### Issue Tracker Suppression

```yaml
# .github/security-suppressions.yml
suppressions:
  - id: "CVE-2021-12345"
    reason: "Not exploitable in our configuration"
    expires: "2024-12-31"
    approved_by: "security-team"
    ticket: "SEC-123"

  - rule: "java:S2068"
    file: "src/test/java/TestConstants.java"
    reason: "Test-only credentials"
    approved_by: "@john.doe"
```

---

## Documentation Requirements

### Suppression Documentation

Every suppression MUST include:

1. **Reason** - Why this is a false positive
2. **Reviewer** - Who approved the suppression
3. **Date** - When it was reviewed
4. **Expiration** - When to re-evaluate (if applicable)
5. **Ticket** - Link to tracking issue

### Suppression Log

```markdown
# Security Suppression Log

## Active Suppressions

| ID | Rule | File | Reason | Reviewer | Date | Expires | Ticket |
|----|------|------|--------|----------|------|---------|--------|
| SUP-001 | java:S2068 | TestConstants.java | Test credentials | @security | 2024-01 | - | SEC-100 |
| SUP-002 | sql-injection | SafeQuery.java | Parameterized queries | @security | 2024-01 | 2024-07 | SEC-101 |
| SUP-003 | hardcoded-ip | config/dev.yaml | Dev environment only | @devops | 2024-02 | - | SEC-102 |

## Expired/Removed Suppressions

| ID | Rule | Reason for Removal | Date |
|----|------|-------------------|------|
| SUP-000 | xss | Code refactored | 2024-01 |
```

---

## Review Process

### Monthly Review Checklist

```markdown
## Monthly Security Suppression Review

**Review Date:** YYYY-MM-DD
**Reviewer:** [Name]

### Statistics
- Total active suppressions: [N]
- New suppressions this month: [N]
- Expired suppressions: [N]
- Suppressions removed (code fixed): [N]

### Review Items

For each suppression:
- [ ] SUP-001: Still valid? [Y/N] Notes: [...]
- [ ] SUP-002: Still valid? [Y/N] Notes: [...]
- [ ] SUP-003: Expired - action needed

### Actions Required
1. [Action item 1]
2. [Action item 2]

### Sign-off
- [ ] Review completed
- [ ] Suppressions log updated
- [ ] Tickets created for actions
```

### Automation

```yaml
# .github/workflows/suppression-review.yml
name: Suppression Review Reminder

on:
  schedule:
    - cron: '0 9 1 * *'  # First of month

jobs:
  remind:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Check for expired suppressions
        run: |
          python scripts/check_suppressions.py \
            --config .github/security-suppressions.yml \
            --warn-days 30

      - name: Create review issue
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `Monthly Security Suppression Review - ${new Date().toISOString().slice(0,7)}`,
              labels: ['security', 'review'],
              body: 'Please review active security suppressions.'
            });
```

---

## Best Practices

| Practice | Rationale |
|----------|-----------|
| Never suppress without documentation | Maintains accountability |
| Prefer narrow suppression scope | Minimizes risk of hiding real issues |
| Set expiration dates | Forces periodic review |
| Track in issue tracker | Provides audit trail |
| Review monthly | Catches stale suppressions |
| Require security team approval | Ensures proper oversight |

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Blanket suppression | Hides real issues | Suppress specific instances only |
| Undocumented suppression | No accountability | Require reason and reviewer |
| Permanent suppression | Never reviewed | Set expiration dates |
| Copy-paste suppression | Applied without thought | Review each instance |
| Suppressing to pass CI | Gaming the system | Fix root cause or accept risk formally |

---

*Guide from IDPF-Security Framework*
