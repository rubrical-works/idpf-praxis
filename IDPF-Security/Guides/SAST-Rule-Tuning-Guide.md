# SAST Rule Tuning Guide
**Version:** v0.63.1

**Framework:** IDPF-Security

---

## Overview

Static Application Security Testing (SAST) tools analyze source code for security vulnerabilities. This guide covers rule configuration for SonarQube, Semgrep, and CodeQL.

---

## SonarQube Configuration

### Quality Profile Setup

```bash
# Create custom security profile via API
curl -u admin:password -X POST \
  "http://sonarqube:9000/api/qualityprofiles/create" \
  -d "name=Security-Focused&language=java"

# Activate security rules
curl -u admin:password -X POST \
  "http://sonarqube:9000/api/qualityprofiles/activate_rules" \
  -d "targetKey=Security-Focused" \
  -d "tags=security,owasp-top10"
```

### sonar-project.properties

```properties
# Project configuration
sonar.projectKey=my-project
sonar.projectName=My Project
sonar.projectVersion=1.0

# Source configuration
sonar.sources=src/main
sonar.tests=src/test
sonar.java.binaries=target/classes

# Security-focused profile
sonar.profile=Security-Focused

# Exclusions (careful with security scans)
sonar.exclusions=**/generated/**,**/test/**
# Don't exclude these from security scans:
# sonar.security.exclusions=

# Issue severity
sonar.issue.ignore.multicriteria=e1,e2
sonar.issue.ignore.multicriteria.e1.ruleKey=java:S1135
sonar.issue.ignore.multicriteria.e1.resourceKey=**/*.java
```

### Key Security Rules by Language

**Java:**
```yaml
rules:
  critical:
    - java:S2076  # OS command injection
    - java:S2078  # LDAP injection
    - java:S2631  # SQL injection
    - java:S5131  # XSS
    - java:S5144  # Open redirect
    - java:S5145  # Log injection
    - java:S5146  # HTTP response splitting
    - java:S5167  # HTTP request smuggling

  high:
    - java:S2068  # Hardcoded credentials
    - java:S2077  # SQL formatting
    - java:S2083  # Path traversal
    - java:S2245  # Weak random
    - java:S3329  # Cipher initialization vector
    - java:S4426  # Weak cryptographic key
    - java:S4790  # Weak hash algorithm
    - java:S5542  # Encryption mode
```

**JavaScript/TypeScript:**
```yaml
rules:
  critical:
    - javascript:S2076  # Command injection
    - javascript:S2631  # SQL injection
    - javascript:S5131  # XSS (DOM)
    - javascript:S5334  # Prototype pollution
    - javascript:S6105  # ReDoS

  high:
    - javascript:S1313  # Hardcoded IP
    - javascript:S2068  # Hardcoded credentials
    - javascript:S2245  # Weak random
    - javascript:S4790  # Weak hash
    - javascript:S5122  # CORS
    - javascript:S5732  # Helmet security headers
```

---

## Semgrep Configuration

### .semgrep.yml

```yaml
# .semgrep.yml
rules:
  # Custom SQL injection rule
  - id: custom-sql-injection
    patterns:
      - pattern-either:
          - pattern: $QUERY = "..." + $INPUT + "..."
          - pattern: $QUERY = f"...{$INPUT}..."
          - pattern: $QUERY = "...%s..." % $INPUT
    message: "Potential SQL injection: user input in query string"
    languages: [python]
    severity: ERROR
    metadata:
      cwe: "CWE-89"
      owasp: "A03:2021"

  # Hardcoded secrets
  - id: hardcoded-api-key
    pattern-regex: '(?i)(api[_-]?key|apikey)\s*[=:]\s*["\'][a-zA-Z0-9]{20,}["\']'
    message: "Hardcoded API key detected"
    languages: [generic]
    severity: ERROR
    metadata:
      cwe: "CWE-798"

  # Unsafe deserialization
  - id: unsafe-pickle
    patterns:
      - pattern: pickle.loads($DATA)
      - pattern: pickle.load($FILE)
    message: "Unsafe deserialization with pickle"
    languages: [python]
    severity: ERROR
    metadata:
      cwe: "CWE-502"
```

### Running Semgrep

```bash
# Run with OWASP rules
semgrep --config=p/owasp-top-ten .

# Run with multiple rulesets
semgrep \
  --config=p/security-audit \
  --config=p/secrets \
  --config=.semgrep.yml \
  --json --output=semgrep-results.json \
  .

# CI mode with baseline
semgrep ci \
  --config=p/security-audit \
  --baseline-commit=$(git merge-base HEAD origin/main)
```

### Semgrep Ignore Patterns

```yaml
# .semgrepignore
# Test files
*_test.py
*_test.go
**/__tests__/**

# Generated code
**/generated/**
**/node_modules/**

# Specific false positives (use sparingly)
# path/to/specific/file.py:42
```

---

## CodeQL Configuration

### codeql-config.yml

```yaml
# .github/codeql/codeql-config.yml
name: "Security-focused CodeQL config"

disable-default-queries: false

queries:
  - uses: security-extended
  - uses: security-and-quality

query-filters:
  - include:
      tags contain: security
  - include:
      tags contain: correctness
  - exclude:
      tags contain: maintainability

paths-ignore:
  - '**/test/**'
  - '**/tests/**'
  - '**/vendor/**'
  - '**/node_modules/**'
```

### GitHub Actions Workflow

```yaml
# .github/workflows/codeql.yml
name: CodeQL Security Scan

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 0 * * 1'  # Weekly

jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions:
      security-events: write

    strategy:
      matrix:
        language: [javascript, python, java]

    steps:
      - uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: ${{ matrix.language }}
          config-file: .github/codeql/codeql-config.yml
          queries: +security-extended

      - name: Autobuild
        uses: github/codeql-action/autobuild@v3

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
        with:
          category: "/language:${{ matrix.language }}"
```

### Custom CodeQL Queries

```ql
// queries/sql-injection.ql
/**
 * @name SQL injection
 * @description Building SQL queries from user input
 * @kind path-problem
 * @problem.severity error
 * @security-severity 9.8
 * @precision high
 * @id js/sql-injection
 * @tags security
 *       external/cwe/cwe-089
 */

import javascript
import semmle.javascript.security.dataflow.SqlInjectionQuery
import DataFlow::PathGraph

from SqlInjection::Configuration cfg, DataFlow::PathNode source, DataFlow::PathNode sink
where cfg.hasFlowPath(source, sink)
select sink.getNode(), source, sink, "SQL injection from $@.", source.getNode(), "user input"
```

---

## Rule Tuning Strategies

### Prioritization Matrix

| Severity | Confidence | Action |
|----------|------------|--------|
| Critical | High | Fix immediately |
| Critical | Medium | Review within sprint |
| Critical | Low | Investigate, possibly suppress |
| High | High | Fix in current sprint |
| High | Medium | Plan for next sprint |
| Medium/Low | * | Backlog, batch fix |

### Reducing Noise

```yaml
# SonarQube - Narrow scope
sonar.issue.ignore.multicriteria=fp1,fp2

# False positive: Test utilities
sonar.issue.ignore.multicriteria.fp1.ruleKey=java:S2068
sonar.issue.ignore.multicriteria.fp1.resourceKey=**/test/**/*Test.java

# False positive: Generated code
sonar.issue.ignore.multicriteria.fp2.ruleKey=*
sonar.issue.ignore.multicriteria.fp2.resourceKey=**/generated/**
```

```yaml
# Semgrep - Inline suppression
# nosemgrep: custom-sql-injection
query = build_safe_query(user_input)  # Actually sanitized

# Or by rule ID in config
rules:
  - id: my-rule
    options:
      # Suppress in specific paths
      paths:
        exclude:
          - "**/migrations/**"
```

---

## CI/CD Integration

### Pipeline Configuration

```yaml
# .github/workflows/security-scan.yml
name: Security Scan

on: [push, pull_request]

jobs:
  sast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: SonarQube Scan
        uses: sonarsource/sonarqube-scan-action@v2
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
          SONAR_HOST_URL: ${{ secrets.SONAR_HOST_URL }}

      - name: Semgrep Scan
        uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            p/security-audit
            p/secrets

      - name: Fail on critical findings
        run: |
          if [ -f semgrep-results.json ]; then
            CRITICAL=$(jq '[.results[] | select(.extra.severity == "ERROR")] | length' semgrep-results.json)
            if [ "$CRITICAL" -gt 0 ]; then
              echo "Critical security issues found: $CRITICAL"
              exit 1
            fi
          fi
```

---

*Guide from IDPF-Security Framework*
