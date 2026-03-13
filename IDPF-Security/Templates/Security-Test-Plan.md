# Security Test Plan: [Application/Feature Name]
**Version:** v0.62.1
**Date:** YYYY-MM-DD
**Author:** [Name]
**Status:** Draft | In Review | Approved
**Classification:** [Internal/Confidential]

## 1. Overview

### 1.1 Purpose
[What security aspects are being validated? What is the goal of this security testing effort?]

### 1.2 Application Under Test
| Attribute | Value |
|-----------|-------|
| **Repository** | [Link to application repo] |
| **PRD Reference** | [Link to application PRD] |
| **Version/Release** | [Version being tested] |
| **Environment** | [Test environment details] |
| **Technology Stack** | [Languages, frameworks, infrastructure] |

### 1.3 Scope
**In Scope:**
- [Component/API 1]
- [Component/API 2]
- [Feature area]
**Out of Scope:**
- [Third-party services - tested separately]
- [Infrastructure - handled by DevOps/SRE]
- [Specific exclusions with rationale]

## 2. Security Requirements Traceability

### 2.1 PRD Security Requirements
| Req ID | Requirement | Test Coverage |
|--------|-------------|---------------|
| SEC-001 | [Security requirement from PRD] | [SAST/DAST/Manual] |
| SEC-002 | [Security requirement from PRD] | [SAST/DAST/Manual] |
| SEC-003 | [Security requirement from PRD] | [SAST/DAST/Manual] |

### 2.2 Compliance Requirements
| Standard | Applicable Controls | Test Coverage |
|----------|---------------------|---------------|
| OWASP Top 10 | All categories | SAST + DAST |
| [PCI-DSS/SOC2/HIPAA] | [Applicable controls] | [Test mapping] |
| [Additional standard] | [Applicable controls] | [Test mapping] |

## 3. Testing Approach

### 3.1 SAST (Static Analysis)
| Tool | Scope | Configuration | Frequency |
|------|-------|---------------|-----------|
| [SonarQube/Semgrep] | All source code | [Profile/ruleset] | Every commit |
| [Additional SAST tool] | [Scope] | [Config] | [Frequency] |
| GitLeaks | Secret detection | Default rules | Every commit |

### 3.2 SCA (Dependency Scanning)
| Tool | Scope | Configuration | Frequency |
|------|-------|---------------|-----------|
| [Snyk/Dependabot] | All dependencies | [Severity threshold] | Every commit |
| [OWASP Dependency-Check] | Transitive deps | [Config] | Weekly |

### 3.3 DAST (Dynamic Analysis)
| Tool | Target | Configuration | Frequency |
|------|--------|---------------|-----------|
| [OWASP ZAP] | [API/Web endpoints] | [Scan type: active/passive] | Pre-release |
| [Nuclei] | Known vulnerabilities | [Template set] | Weekly |

### 3.4 Manual Testing
| Activity | Scope | Frequency |
|----------|-------|-----------|
| Penetration Test | Full application | [Quarterly/Per release] |
| Security Code Review | Security-critical code | Per PR |
| Threat Modeling | Architecture changes | Per major release |

## 4. Test Cases

### 4.1 Authentication & Authorization
| TC ID | Test Case | Type | Priority | Status |
|-------|-----------|------|----------|--------|
| SEC-TC-001 | Brute force protection | DAST | High | |
| SEC-TC-002 | Session timeout enforcement | Manual | Medium | |
| SEC-TC-003 | Privilege escalation prevention | Manual | Critical | |
| SEC-TC-004 | JWT/Token validation | DAST | High | |
| SEC-TC-005 | Password policy enforcement | Manual | Medium | |
| SEC-TC-006 | MFA bypass attempts | Manual | High | |

### 4.2 Input Validation
| TC ID | Test Case | Type | Priority | Status |
|-------|-----------|------|----------|--------|
| SEC-TC-010 | SQL injection (all inputs) | SAST+DAST | Critical | |
| SEC-TC-011 | XSS - Reflected | DAST | High | |
| SEC-TC-012 | XSS - Stored | DAST | Critical | |
| SEC-TC-013 | Command injection | SAST+DAST | Critical | |
| SEC-TC-014 | Path traversal | DAST | High | |
| SEC-TC-015 | XML External Entity (XXE) | SAST+DAST | High | |

### 4.3 Data Protection
| TC ID | Test Case | Type | Priority | Status |
|-------|-----------|------|----------|--------|
| SEC-TC-020 | TLS configuration (version, ciphers) | DAST | High | |
| SEC-TC-021 | Sensitive data in logs | SAST | High | |
| SEC-TC-022 | PII handling and encryption | Manual | Critical | |
| SEC-TC-023 | Data at rest encryption | Manual | High | |
| SEC-TC-024 | Secrets in code/config | SAST | Critical | |

### 4.4 API Security
| TC ID | Test Case | Type | Priority | Status |
|-------|-----------|------|----------|--------|
| SEC-TC-030 | Rate limiting | DAST | Medium | |
| SEC-TC-031 | API authentication | DAST | High | |
| SEC-TC-032 | CORS configuration | DAST | Medium | |
| SEC-TC-033 | GraphQL introspection (if applicable) | DAST | Medium | |
| SEC-TC-034 | Mass assignment | DAST | High | |

### 4.5 Business Logic
| TC ID | Test Case | Type | Priority | Status |
|-------|-----------|------|----------|--------|
| SEC-TC-040 | [Business-specific security test] | Manual | [Priority] | |
| SEC-TC-041 | [Business-specific security test] | Manual | [Priority] | |

## 5. Vulnerability Management

### 5.1 Severity Classification
| Severity | CVSS Score | Remediation SLA | Escalation |
|----------|------------|-----------------|------------|
| Critical | 9.0 - 10.0 | 24 hours | Immediate to leadership |
| High | 7.0 - 8.9 | 7 days | Security lead |
| Medium | 4.0 - 6.9 | 30 days | Dev team lead |
| Low | 0.1 - 3.9 | 90 days | Backlog |

### 5.2 Vulnerability Workflow
```
Discovery → Triage → Assignment → Remediation → Verification → Closure
```
| Phase | Owner | Actions |
|-------|-------|---------|
| Discovery | Security Team | Identify finding, document details |
| Triage | Security Lead | Validate, assess severity, prioritize |
| Assignment | Security Lead | Assign to responsible developer/team |
| Remediation | Dev Team | Implement fix, create PR |
| Verification | Security Team | Re-test, confirm fix |
| Closure | Security Lead | Document resolution, close issue |

### 5.3 Exception Process
For vulnerabilities that cannot be remediated within SLA:
1. Document business justification
2. Identify compensating controls
3. Obtain approval from Security Lead AND Product Owner
4. Set review date (max 90 days)
5. Track in exceptions register

## 6. CI/CD Integration

### 6.1 Pipeline Gates
| Stage | Tool | Gate Criteria | Action on Fail |
|-------|------|---------------|----------------|
| Commit | SAST | No critical/high issues | Block merge |
| Commit | Secret Scan | No secrets detected | Block merge |
| PR | SCA | No critical vulnerabilities | Block merge |
| Pre-Deploy | DAST | No critical findings | Block deploy |

### 6.2 Scan Configuration
```yaml
# Example gate configuration
gates:
  sast:
    fail_on: [critical, high]
    warn_on: [medium]
  sca:
    fail_on: [critical]
    warn_on: [high]
  dast:
    fail_on: [critical]
  secrets:
    fail_on: [any]
```

### 6.3 Baseline Management
| Tool | Baseline File | Review Frequency |
|------|---------------|------------------|
| [SAST tool] | [baseline location] | Monthly |
| [DAST tool] | [baseline location] | Per release |

## 7. Reporting

### 7.1 Report Types
| Report | Audience | Frequency | Owner |
|--------|----------|-----------|-------|
| Executive Summary | Leadership | Monthly | Security Lead |
| Technical Findings | Dev Team | Per scan | Security Engineer |
| Compliance Report | Auditors | Quarterly | Compliance Officer |
| Trend Analysis | Security Team | Monthly | Security Lead |

### 7.2 Metrics
| Metric | Target | Current | Trend |
|--------|--------|---------|-------|
| MTTR (Critical) | < 24 hours | | |
| MTTR (High) | < 7 days | | |
| Vulnerability Escape Rate | < 5% | | |
| False Positive Rate | < 10% | | |
| Scan Coverage | > 95% | | |
| OWASP Top 10 Coverage | 100% | | |

## 8. Risks & Mitigations
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| False positives slow development | Medium | Medium | Tune rules, maintain baseline |
| Zero-day in dependency | Low | Critical | Monitor advisories, quick patching |
| Incomplete coverage | Medium | High | Multiple tools, manual review |
| Tool misconfiguration | Medium | High | Peer review configs, test scans |
| Resource constraints | Medium | Medium | Prioritize critical paths |

## 9. Deliverables
- [ ] SAST scan results and analysis
- [ ] DAST scan results and analysis
- [ ] SCA report with remediation plan
- [ ] Penetration test report (if applicable)
- [ ] Vulnerability tracking dashboard/register
- [ ] Compliance mapping document
- [ ] Executive summary

## 10. Schedule
| Activity | Start Date | End Date | Owner |
|----------|------------|----------|-------|
| SAST Integration | | | |
| SCA Integration | | | |
| DAST Scan | | | |
| Manual Review | | | |
| Penetration Test | | | |
| Report Generation | | | |

## 11. Approval
| Role | Name | Date | Signature |
|------|------|------|-----------|
| Security Lead | | | [ ] Approved |
| Dev Lead | | | [ ] Approved |
| Product Owner | | | [ ] Approved |
| Compliance Officer | | | [ ] Approved (if applicable) |

## Revision History
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | YYYY-MM-DD | [Name] | Initial draft |
**End of Security Test Plan Template**
