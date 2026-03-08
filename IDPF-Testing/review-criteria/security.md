# Security Review Criteria
**Source:** Extracted from IDPF-Security framework
**Domain:** OWASP Top 10, SAST/DAST, vulnerability management

## Proposal Review Questions
- Does the proposal identify security-sensitive components (authentication, data handling, APIs)?
- Are OWASP Top 10 categories addressed where the proposal touches web-facing surfaces?
- Does the proposal specify how secrets, credentials, and tokens will be managed?
- Are threat modeling or risk assessment activities included in the implementation plan?
- Does the proposal consider compliance requirements (SOC 2, PCI-DSS, HIPAA, GDPR)?

## PRD Review Questions
- Do user stories include security acceptance criteria for authentication and authorization?
- Are non-functional requirements defined for vulnerability remediation SLAs (Critical < 24h, High < 7d)?
- Does the test plan section include SAST, DAST, and SCA scanning gates?
- Are CI/CD pipeline security gates defined (fail on critical/high findings)?
- Does the PRD reference applicable compliance frameworks and map controls to test coverage?
- Are secret scanning and dependency vulnerability checks specified as PR-level gates?

## Issue Review Questions
- Does the issue scope include security implications (injection, access control, data exposure)?
- Are acceptance criteria testable with automated security tools (Semgrep, ZAP, Snyk)?
- Does the issue reference the relevant OWASP category if it touches user input or APIs?
- Is the severity classification aligned with CVSS scoring (Critical 9.0-10.0, High 7.0-8.9)?
- Are remediation verification steps included (re-scan after fix)?
