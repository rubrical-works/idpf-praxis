# IDPF-Security Framework
**Version:** v0.66.0
**Type:** Domain
## Overview
Domain for security testing: SAST, DAST, penetration testing, vulnerability management, and compliance.
## Terminology
| Term | Definition |
|------|------------|
| **SAST** | Static Application Security Testing - source code analysis |
| **DAST** | Dynamic Application Security Testing - running app analysis |
| **SCA** | Software Composition Analysis - dependency vulnerability scanning |
| **IAST** | Interactive Application Security Testing - runtime analysis |
| **Penetration Testing** | Manual + automated attack simulation |
| **Secret Scanning** | Detection of credentials/keys/tokens in code |
| **CVE** | Common Vulnerabilities and Exposures identifier |
| **CVSS** | Common Vulnerability Scoring System |
## Security Testing Types
| Test Type | When | What | Tools |
|-----------|------|------|-------|
| **SAST** | Development/CI | Source code | SonarQube, Semgrep, CodeQL |
| **SCA** | Development/CI | Dependencies | Snyk, Dependabot, OWASP Dep-Check |
| **DAST** | Staging/Pre-prod | Running app | OWASP ZAP, Burp Suite, Nuclei |
| **IAST** | Testing | Runtime | Contrast Security, Hdiv |
| **Penetration Testing** | Pre-release | Manual + automated | Various |
| **Secret Scanning** | Development/CI | Code credentials | GitLeaks, TruffleHog, GitHub |
## Tool Selection Guide
### SAST Tools
| Tool | Languages | Licensing |
|------|-----------|-----------|
| **SonarQube** | Multi-language | Community/Commercial |
| **Semgrep** | Multi-language | Open Source/Commercial |
| **CodeQL** | Multi-language | Free for public repos |
| **Checkmarx** | Multi-language | Commercial |
### DAST Tools
| Tool | Best For | Strengths |
|------|----------|-----------|
| **OWASP ZAP** | API/Web apps | Free, scriptable, CI-friendly |
| **Burp Suite** | Manual + automated | Comprehensive, industry standard |
| **Nuclei** | Template-based | Fast, community templates |
### SCA Tools
| Tool | Integration |
|------|-------------|
| **Snyk** | IDE, CI/CD, Git |
| **Dependabot** | GitHub native |
| **OWASP Dependency-Check** | CLI, CI/CD |
### Secret Scanning
| Tool | Integration |
|------|-------------|
| **GitLeaks** | CLI, CI/CD |
| **TruffleHog** | CLI, CI/CD |
| **GitHub Secret Scanning** | GitHub native |
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
Discovery → Triage → Assignment → Remediation → Verification → Closure
### Exception Process
- Documented risk acceptance required
- Approval from Security Lead and Product Owner
- Time-bounded with review dates
- Quarterly exception review
## CI/CD Integration
### Pipeline Gate Strategy
| Stage | Tool Type | Gate Criteria |
|-------|-----------|---------------|
| Commit | SAST | No critical/high issues |
| Commit | Secret Scan | No secrets detected |
| PR | SCA | No critical vulnerabilities |
| Pre-Deploy | DAST | No critical findings |
## Reporting & Metrics
| Metric | Target |
|--------|--------|
| MTTR (Critical) | < 24 hours |
| MTTR (High) | < 7 days |
| Vulnerability Escape Rate | < 5% |
| False Positive Rate | < 10% |
| Scan Coverage | > 95% |
| OWASP Top 10 Coverage | 100% |
## Compliance Mapping
| Framework | Focus | Requirements |
|-----------|-------|-------------|
| **SOC 2** | Security, availability | Vuln scanning, pentesting |
| **PCI-DSS** | Payment card data | Quarterly scans, annual pentest |
| **HIPAA** | Healthcare data | Risk assessments, access controls |
| **GDPR** | Personal data | Data protection, privacy controls |
| **ISO 27001** | Information security | Regular testing, vuln mgmt |
## References
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [CWE/SANS Top 25](https://cwe.mitre.org/top25/)
- [OWASP ZAP](https://www.zaproxy.org/docs/)
- [Semgrep](https://semgrep.dev/docs/)
**End of Framework**
