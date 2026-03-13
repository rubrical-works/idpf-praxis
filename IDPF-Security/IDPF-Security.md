# IDPF-Security Framework
**Version:** v0.62.0
**Extends:** IDPF-Testing
**Framework-Debug:** True

## Overview
IDPF-Security is the framework for developing and executing security testing activities. It extends IDPF-Testing and provides specialized guidance for SAST, DAST, penetration testing, vulnerability management, and security compliance.
**Core Principle:** "Security testing validates that applications are protected against common vulnerabilities and meet security requirements defined in the application PRD."

## Terminology
Extends IDPF-Testing terminology with:
| Term | Definition |
|------|------------|
| **SAST** | Static Application Security Testing - source code analysis |
| **DAST** | Dynamic Application Security Testing - running application analysis |
| **SCA** | Software Composition Analysis - dependency vulnerability scanning |
| **IAST** | Interactive Application Security Testing - runtime analysis |
| **Penetration Testing** | Manual + automated attack simulation |
| **Secret Scanning** | Detection of credentials, keys, tokens in code |
| **CVE** | Common Vulnerabilities and Exposures identifier |
| **CVSS** | Common Vulnerability Scoring System |
| **Vulnerability** | Security weakness that can be exploited |
| **Finding** | Issue discovered during security testing |

## Security Testing Types
| Test Type | When | What | Tools |
|-----------|------|------|-------|
| **SAST** | Development/CI | Source code analysis | SonarQube, Semgrep, CodeQL |
| **SCA** | Development/CI | Dependency vulnerabilities | Snyk, Dependabot, OWASP Dependency-Check |
| **DAST** | Staging/Pre-prod | Running application | OWASP ZAP, Burp Suite, Nuclei |
| **IAST** | Testing | Runtime analysis | Contrast Security, Hdiv |
| **Penetration Testing** | Pre-release | Manual + automated | Manual + various tools |
| **Secret Scanning** | Development/CI | Credentials in code | GitLeaks, TruffleHog, GitHub Secret Scanning |

## Tool Selection Guide

### SAST Tools
| Tool | Languages | Best For | Licensing |
|------|-----------|----------|-----------|
| **SonarQube** | Multi-language | Enterprise, quality + security | Community/Commercial |
| **Semgrep** | Multi-language | Custom rules, fast | Open Source/Commercial |
| **CodeQL** | Multi-language | GitHub integration | Free for public repos |
| **Checkmarx** | Multi-language | Enterprise, compliance | Commercial |
| **Fortify** | Multi-language | Enterprise, compliance | Commercial |

### DAST Tools
| Tool | Best For | Strengths |
|------|----------|-----------|
| **OWASP ZAP** | API/Web apps | Free, scriptable, CI-friendly |
| **Burp Suite** | Manual + automated | Comprehensive, industry standard |
| **Nuclei** | Template-based scanning | Fast, community templates |
| **Nikto** | Web server scanning | Quick checks |
| **OWASP Amass** | Reconnaissance | Attack surface mapping |

### SCA Tools
| Tool | Integration | Features |
|------|-------------|----------|
| **Snyk** | IDE, CI/CD, Git | Fix suggestions, monitoring |
| **Dependabot** | GitHub native | Auto PRs for updates |
| **OWASP Dependency-Check** | CLI, CI/CD | Free, comprehensive |
| **WhiteSource/Mend** | Enterprise | License compliance |

### Secret Scanning Tools
| Tool | Integration | Features |
|------|-------------|----------|
| **GitLeaks** | CLI, CI/CD | Configurable rules, fast |
| **TruffleHog** | CLI, CI/CD | Entropy detection |
| **GitHub Secret Scanning** | GitHub native | Automatic, partner patterns |

## OWASP Top 10 Coverage
| # | Vulnerability | Testing Approach | Tools |
|---|---------------|------------------|-------|
| A01 | Broken Access Control | DAST, Manual | ZAP, Burp |
| A02 | Cryptographic Failures | SAST, Manual | SonarQube, Semgrep |
| A03 | Injection | SAST, DAST | All |
| A04 | Insecure Design | Manual Review | Threat Modeling |
| A05 | Security Misconfiguration | DAST, Config Scan | ZAP, ScoutSuite |
| A06 | Vulnerable Components | SCA | Snyk, Dependabot |
| A07 | Auth Failures | DAST, Manual | ZAP, Burp |
| A08 | Data Integrity Failures | SAST, DAST | SonarQube, ZAP |
| A09 | Logging Failures | SAST, Manual | Code review |
| A10 | SSRF | DAST, Manual | ZAP, Burp |

## Vulnerability Management

### Severity Classification
| Severity | CVSS Score | Remediation SLA |
|----------|------------|-----------------|
| Critical | 9.0 - 10.0 | 24 hours |
| High | 7.0 - 8.9 | 7 days |
| Medium | 4.0 - 6.9 | 30 days |
| Low | 0.1 - 3.9 | 90 days |

### Vulnerability Workflow
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Discovery  │───→│   Triage    │───→│ Assignment  │───→│ Remediation │───→│ Verification│───→│   Closure   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```
| Phase | Activities |
|-------|------------|
| **Discovery** | Finding identified by scanning tool or manual testing |
| **Triage** | Validate finding, assess severity, determine if true positive |
| **Assignment** | Assign to responsible team/developer |
| **Remediation** | Implement fix following secure coding practices |
| **Verification** | Re-scan or retest to confirm fix |
| **Closure** | Document resolution, update tracking |

### Exception Process
- Documented risk acceptance required for exceptions
- Approval from Security Lead and Product Owner
- Time-bounded exceptions with review dates
- Quarterly exception review

## Directory Structure

### Security Test Repository Structure
```
<security-test-repo>/
├── PRD/
│   ├── README.md
│   ├── Templates/
│   │   └── Security-Test-Plan.md
│   └── TestPlans/
│       ├── TP-SAST-Integration.md
│       ├── TP-DAST-API.md
│       └── TP-PenTest-Q4.md
├── src/
│   ├── sast/
│   │   ├── semgrep-rules/        # Custom SAST rules
│   │   └── sonar-profiles/       # Quality profiles
│   ├── dast/
│   │   ├── zap-scripts/          # ZAP automation scripts
│   │   ├── nuclei-templates/     # Custom Nuclei templates
│   │   └── api-specs/            # OpenAPI specs for scanning
│   └── config/
│       ├── dev.yml
│       └── staging.yml
├── reports/
│   ├── sast/
│   ├── dast/
│   └── pentests/
├── vulnerabilities/              # Vulnerability tracking
│   ├── open/
│   └── resolved/
├── .github/
│   └── workflows/
│       ├── sast.yml
│       ├── dast.yml
│       └── dependency-scan.yml
└── README.md
```

## CI/CD Integration

### Pipeline Gate Strategy
| Stage | Tool Type | Gate Criteria |
|-------|-----------|---------------|
| Commit | SAST | No critical/high issues |
| Commit | Secret Scan | No secrets detected |
| PR | SCA | No critical vulnerabilities |
| Pre-Deploy | DAST | No critical findings |

### Gate Configuration Example
```yaml
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

### GitHub Actions Example
```yaml
# .github/workflows/security-scan.yml
name: Security Scans

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  sast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Semgrep
        uses: returntocorp/semgrep-action@v1
        with:
          config: p/owasp-top-ten

      - name: Run GitLeaks
        uses: gitleaks/gitleaks-action@v2

  dependency-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Snyk
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high

  dast:
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    needs: [sast, dependency-scan]
    steps:
      - uses: actions/checkout@v4

      - name: Start application
        run: docker-compose up -d

      - name: Run OWASP ZAP
        uses: zaproxy/action-full-scan@v0.8.0
        with:
          target: 'http://localhost:8080'
          rules_file_name: '.zap/rules.tsv'

      - name: Upload ZAP Report
        uses: actions/upload-artifact@v4
        with:
          name: zap-report
          path: report_html.html
```

## GitHub Project Integration

### Labels
Extends IDPF-Testing labels:
| Label | Color | Hex | Description |
|-------|-------|-----|-------------|
| `security` | Red | `#FF5630` | Security work (from Testing-Core) |
| `sast` | Blue | `#0052CC` | Static analysis |
| `dast` | Orange | `#D93F0B` | Dynamic analysis |
| `sca` | Green | `#0E8A16` | Dependency scanning |
| `pentest` | Purple | `#5319E7` | Penetration testing |
| `vulnerability` | Yellow | `#FBCA04` | Vulnerability tracking |
| `compliance` | Teal | `#1D76DB` | Compliance related |

### Views
| View | Filter | Purpose |
|------|--------|---------|
| All Security Work | `label:security` | Complete visibility |
| SAST Issues | `label:sast` | Static analysis findings |
| DAST Issues | `label:dast` | Dynamic analysis findings |
| Vulnerabilities | `label:vulnerability` | Active vulnerability tracking |
| Compliance | `label:compliance` | Compliance-related work |

## Reporting

### Report Types
| Report | Audience | Frequency | Content |
|--------|----------|-----------|---------|
| Executive Summary | Leadership | Monthly | High-level risk posture |
| Technical Findings | Dev Team | Per scan | Detailed findings, remediation |
| Compliance Report | Auditors | Quarterly | Control coverage, evidence |
| Trend Analysis | Security Team | Monthly | Metrics, improvement areas |

### Metrics
| Metric | Description | Target |
|--------|-------------|--------|
| Mean Time to Remediate (Critical) | Time from discovery to fix | < 24 hours |
| Mean Time to Remediate (High) | Time from discovery to fix | < 7 days |
| Vulnerability Escape Rate | Vulns found in production | < 5% |
| False Positive Rate | Invalid findings | < 10% |
| Scan Coverage | % of codebase scanned | > 95% |
| OWASP Top 10 Coverage | Categories tested | 100% |

## Session Commands
When using IDPF-Security:

### Security Testing Commands
- **"Security-Scan-Start"** - Initialize security scanning session
- **"Run-SAST"** - Execute static analysis scans
- **"Run-DAST"** - Execute dynamic analysis scans
- **"Run-SCA"** - Execute dependency scanning
- **"Vuln-Triage [finding-id]"** - Triage a vulnerability finding
- **"Vuln-Status"** - Show open vulnerability status

### Standard Commands
All IDPF-Testing and IDPF-Agile commands apply:
- "Test-Plan-Start", "Test-Plan-Review", "Coverage-Check"
- "Run-Tests", "Show-Coverage", "List-Commands", etc.

## Test Plan Template
See `Templates/Security-Test-Plan.md` for the complete security test plan template including:
- Application context and scope
- Security requirements traceability
- Testing approach by type (SAST, DAST, SCA, Manual)
- Test cases by category
- Vulnerability management process
- CI/CD integration configuration
- Reporting and metrics
- Compliance mapping

## Compliance Mapping

### Common Compliance Frameworks
| Framework | Focus | Security Testing Requirements |
|-----------|-------|-------------------------------|
| **SOC 2** | Security, availability | Vulnerability scanning, penetration testing |
| **PCI-DSS** | Payment card data | Quarterly scans, annual pentest |
| **HIPAA** | Healthcare data | Risk assessments, access controls testing |
| **GDPR** | Personal data | Data protection testing, privacy controls |
| **ISO 27001** | Information security | Regular security testing, vulnerability mgmt |

### Mapping Test Coverage to Controls
Test Plans should map test cases to applicable compliance controls to demonstrate coverage during audits.

## Integration Points
- **Extends:** IDPF-Testing (inherits all base patterns)
- **Uses:** IDPF-Agile for test development
- **References:** Application PRD for security requirements
- **Outputs:** Vulnerability reports, compliance evidence, security metrics

## References

### Tools Documentation
- [OWASP ZAP](https://www.zaproxy.org/docs/)
- [Semgrep](https://semgrep.dev/docs/)
- [Snyk](https://docs.snyk.io/)
- [SonarQube Security](https://docs.sonarqube.org/latest/user-guide/security-rules/)

### Standards
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [CWE/SANS Top 25](https://cwe.mitre.org/top25/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
**End of Framework**
