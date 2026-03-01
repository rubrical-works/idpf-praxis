# IDPF-Security Framework
**Version:** v0.55.0
**Extends:** IDPF-Testing-Core
## Overview
Framework for security testing: SAST, DAST, penetration testing, vulnerability management, compliance.
## Terminology
| Term | Definition |
|------|------------|
| **SAST** | Static Application Security Testing |
| **DAST** | Dynamic Application Security Testing |
| **SCA** | Software Composition Analysis |
| **CVE** | Common Vulnerabilities and Exposures |
| **CVSS** | Common Vulnerability Scoring System |
## Security Testing Types
| Type | When | Tools |
|------|------|-------|
| SAST | Dev/CI | SonarQube, Semgrep, CodeQL |
| SCA | Dev/CI | Snyk, Dependabot |
| DAST | Staging | OWASP ZAP, Burp Suite |
| Secret Scanning | Dev/CI | GitLeaks, TruffleHog |
## Tool Selection
### SAST
| Tool | Best For |
|------|----------|
| **SonarQube** | Enterprise, quality + security |
| **Semgrep** | Custom rules, fast |
| **CodeQL** | GitHub integration |
### DAST
| Tool | Best For |
|------|----------|
| **OWASP ZAP** | API/Web, CI-friendly |
| **Burp Suite** | Manual + automated |
### SCA
| Tool | Features |
|------|----------|
| **Snyk** | Fix suggestions, monitoring |
| **Dependabot** | Auto PRs for updates |
## OWASP Top 10 Coverage
| # | Vulnerability | Testing |
|---|---------------|---------|
| A01 | Broken Access Control | DAST, Manual |
| A02 | Cryptographic Failures | SAST, Manual |
| A03 | Injection | SAST, DAST |
| A06 | Vulnerable Components | SCA |
| A07 | Auth Failures | DAST, Manual |
## Vulnerability Management
### Severity Classification
| Severity | CVSS | SLA |
|----------|------|-----|
| Critical | 9.0-10.0 | 24 hours |
| High | 7.0-8.9 | 7 days |
| Medium | 4.0-6.9 | 30 days |
| Low | 0.1-3.9 | 90 days |
### Workflow
Discovery → Triage → Assignment → Remediation → Verification → Closure
## CI/CD Integration
| Stage | Tool Type | Gate Criteria |
|-------|-----------|---------------|
| Commit | SAST | No critical/high |
| Commit | Secret Scan | No secrets |
| PR | SCA | No critical vulnerabilities |
| Pre-Deploy | DAST | No critical findings |
## Metrics
| Metric | Target |
|--------|--------|
| MTTR (Critical) | < 24 hours |
| MTTR (High) | < 7 days |
| Vulnerability Escape Rate | < 5% |
| False Positive Rate | < 10% |
| OWASP Top 10 Coverage | 100% |
## Session Commands
- **Run-SAST** - Execute static analysis
- **Run-DAST** - Execute dynamic analysis
- **Run-SCA** - Execute dependency scanning
- **Vuln-Triage [id]** - Triage vulnerability
- **Vuln-Status** - Show open vulnerabilities
---
**End of Framework**
