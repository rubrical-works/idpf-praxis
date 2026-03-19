# Threat Modeling Integration Guide
**Version:** v0.66.1

**Framework:** IDPF-Security

---

## Overview

Threat modeling identifies security risks early in development. This guide integrates threat modeling with the STRIDE methodology into the security testing workflow.

---

## STRIDE Methodology

| Threat | Description | Security Property |
|--------|-------------|-------------------|
| **S**poofing | Impersonating a user or system | Authentication |
| **T**ampering | Modifying data or code | Integrity |
| **R**epudiation | Denying actions | Non-repudiation |
| **I**nformation Disclosure | Exposing data | Confidentiality |
| **D**enial of Service | Disrupting availability | Availability |
| **E**levation of Privilege | Gaining unauthorized access | Authorization |

---

## Threat Modeling Process

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Identify  │───→│  Identify   │───→│   Analyze   │───→│  Mitigate   │
│   Assets    │    │   Threats   │    │   Risks     │    │   Threats   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

---

## Step 1: Identify Assets

### Asset Inventory Template

```markdown
## System: [Application Name]

### Data Assets
| Asset | Classification | Location | Owner |
|-------|---------------|----------|-------|
| User credentials | Confidential | Database | Auth Team |
| PII (names, emails) | Sensitive | Database | Data Team |
| Payment data | Restricted | Payment service | Finance |
| Session tokens | Confidential | Memory/Redis | Auth Team |
| API keys | Secret | Environment vars | DevOps |

### System Components
| Component | Technology | Trust Boundary | Entry Points |
|-----------|------------|----------------|--------------|
| Web frontend | React | External | HTTPS:443 |
| API server | Node.js | DMZ | HTTPS:443 |
| Database | PostgreSQL | Internal | TCP:5432 |
| Cache | Redis | Internal | TCP:6379 |
| Message queue | RabbitMQ | Internal | TCP:5672 |

### Trust Boundaries
1. Internet ↔ CDN/WAF
2. CDN ↔ Load Balancer
3. Load Balancer ↔ Application
4. Application ↔ Database
5. Application ↔ External Services
```

---

## Step 2: Identify Threats (STRIDE)

### Threat Identification Matrix

```markdown
## Component: User Authentication API

### Spoofing
| Threat | Attack Vector | Likelihood | Impact |
|--------|--------------|------------|--------|
| Credential theft | Phishing | High | Critical |
| Session hijacking | XSS, network sniffing | Medium | High |
| Token forgery | Weak JWT secret | Low | Critical |

### Tampering
| Threat | Attack Vector | Likelihood | Impact |
|--------|--------------|------------|--------|
| Password modification | Account takeover | Medium | High |
| Role escalation | Parameter tampering | Low | Critical |
| JWT manipulation | Algorithm confusion | Low | Critical |

### Repudiation
| Threat | Attack Vector | Likelihood | Impact |
|--------|--------------|------------|--------|
| Deny login attempts | Missing audit logs | Medium | Medium |
| Deny password changes | Insufficient logging | Medium | Medium |

### Information Disclosure
| Threat | Attack Vector | Likelihood | Impact |
|--------|--------------|------------|--------|
| User enumeration | Different error messages | High | Medium |
| Password exposure | Verbose errors | Medium | High |
| Token leakage | Insecure storage | Medium | High |

### Denial of Service
| Threat | Attack Vector | Likelihood | Impact |
|--------|--------------|------------|--------|
| Login brute force | Automated attacks | High | Medium |
| Account lockout abuse | Lock legitimate users | Medium | Medium |
| Resource exhaustion | Complex password hashing | Low | Medium |

### Elevation of Privilege
| Threat | Attack Vector | Likelihood | Impact |
|--------|--------------|------------|--------|
| Admin access | Broken access control | Medium | Critical |
| Cross-tenant access | IDOR vulnerabilities | Medium | Critical |
```

---

## Step 3: Analyze Risks

### Risk Scoring (DREAD)

| Factor | Description | Score |
|--------|-------------|-------|
| **D**amage | How bad if exploited? | 1-10 |
| **R**eproducibility | How easy to reproduce? | 1-10 |
| **E**xploitability | How easy to exploit? | 1-10 |
| **A**ffected Users | How many impacted? | 1-10 |
| **D**iscoverability | How easy to find? | 1-10 |

**Risk = (D + R + E + A + D) / 5**

```markdown
## Risk Assessment: Session Hijacking

### DREAD Score
| Factor | Score | Rationale |
|--------|-------|-----------|
| Damage | 8 | Full account access |
| Reproducibility | 6 | Requires XSS or network access |
| Exploitability | 5 | Moderate skill required |
| Affected Users | 7 | Any logged-in user |
| Discoverability | 6 | Common vulnerability pattern |

**Total: (8+6+5+7+6)/5 = 6.4 (High Risk)**

### Priority: HIGH - Address in current sprint
```

### Risk Matrix

```
            │  Low Impact  │  Med Impact  │ High Impact │
────────────┼──────────────┼──────────────┼─────────────┤
High Likely │   MEDIUM     │     HIGH     │  CRITICAL   │
────────────┼──────────────┼──────────────┼─────────────┤
Med Likely  │    LOW       │    MEDIUM    │    HIGH     │
────────────┼──────────────┼──────────────┼─────────────┤
Low Likely  │    LOW       │     LOW      │   MEDIUM    │
────────────┴──────────────┴──────────────┴─────────────┘
```

---

## Step 4: Mitigate Threats

### Mitigation Strategies

| STRIDE Category | Common Mitigations |
|-----------------|-------------------|
| Spoofing | MFA, strong authentication, certificate pinning |
| Tampering | Input validation, integrity checks, signing |
| Repudiation | Audit logging, digital signatures, timestamps |
| Info Disclosure | Encryption, access controls, data masking |
| DoS | Rate limiting, resource quotas, CDN |
| EoP | RBAC, principle of least privilege, validation |

### Mitigation Plan Template

```markdown
## Mitigation: Session Hijacking (TM-AUTH-003)

### Threat Summary
- **Category:** Spoofing, Information Disclosure
- **Risk Score:** 6.4 (High)
- **Affected Component:** Session management

### Mitigations

#### Implemented
- [x] Secure cookie flags (HttpOnly, Secure, SameSite)
- [x] Session timeout (30 minutes idle)
- [x] HTTPS only

#### Planned
- [ ] Session binding to IP/User-Agent
- [ ] Session token rotation on privilege change
- [ ] Concurrent session limits

### Verification
- **Test:** Security/session-hijacking.spec.ts
- **SAST Rule:** javascript:S5122
- **Penetration Test:** PT-2024-Q1-003

### Residual Risk
After mitigations: LOW
Remaining risk accepted due to MFA requirement.
```

---

## Integration with Security Testing

### Threat Model to Test Mapping

```yaml
# threat-test-mapping.yaml
threats:
  TM-AUTH-001:
    name: "Credential brute force"
    stride: "Spoofing"
    risk: "High"
    tests:
      - type: "automated"
        file: "tests/security/brute-force.spec.ts"
      - type: "sast"
        rule: "rate-limiting-missing"
      - type: "pentest"
        checklist: "WSTG-ATHN-03"

  TM-AUTH-002:
    name: "JWT token forgery"
    stride: "Spoofing"
    risk: "Critical"
    tests:
      - type: "automated"
        file: "tests/security/jwt-validation.spec.ts"
      - type: "sast"
        rules:
          - "jwt-none-algorithm"
          - "weak-secret-key"
      - type: "pentest"
        checklist: "WSTG-SESS-01"

  TM-DATA-001:
    name: "SQL injection"
    stride: "Tampering, Information Disclosure"
    risk: "Critical"
    tests:
      - type: "sast"
        rules:
          - "java:S2631"
          - "sql-injection"
      - type: "dast"
        scanner: "OWASP ZAP"
        policy: "sql-injection-active"
```

### Automated Threat Verification

```typescript
// tests/security/threat-model.spec.ts
import { test, expect } from '@playwright/test';

test.describe('TM-AUTH-001: Brute Force Protection', () => {
  test('should rate limit login attempts', async ({ request }) => {
    const attempts = [];

    // Attempt 10 rapid logins
    for (let i = 0; i < 10; i++) {
      const response = await request.post('/api/auth/login', {
        data: { email: 'test@example.com', password: 'wrong' }
      });
      attempts.push(response.status());
    }

    // Should get rate limited (429) after threshold
    expect(attempts.filter(s => s === 429).length).toBeGreaterThan(0);
  });
});

test.describe('TM-AUTH-002: JWT Validation', () => {
  test('should reject tokens with none algorithm', async ({ request }) => {
    const noneAlgToken = createTokenWithNoneAlg();

    const response = await request.get('/api/protected', {
      headers: { Authorization: `Bearer ${noneAlgToken}` }
    });

    expect(response.status()).toBe(401);
  });
});
```

---

## Threat Model Document Template

```markdown
# Threat Model: [Feature/System Name]

**Date:** YYYY-MM-DD
**Author:** [Name]
**Reviewers:** [Names]

## 1. System Overview

### Description
[Brief description of the system/feature]

### Architecture Diagram
[Include DFD or architecture diagram]

### Trust Boundaries
[List trust boundaries]

## 2. Assets

[Asset inventory table]

## 3. Threat Analysis

### 3.1 Spoofing Threats
[Table of spoofing threats]

### 3.2 Tampering Threats
[Table of tampering threats]

### 3.3 Repudiation Threats
[Table of repudiation threats]

### 3.4 Information Disclosure Threats
[Table of info disclosure threats]

### 3.5 Denial of Service Threats
[Table of DoS threats]

### 3.6 Elevation of Privilege Threats
[Table of EoP threats]

## 4. Risk Assessment

[Risk matrix and prioritized list]

## 5. Mitigations

[Mitigation plan for each threat]

## 6. Test Coverage

[Mapping of threats to tests]

## 7. Residual Risks

[Accepted risks and justification]

## 8. Review Schedule

- Initial review: [Date]
- Quarterly review: [Schedule]
- Trigger-based review: [Major changes]

## Appendix

### A. References
### B. Change History
```

---

## Tools Integration

### Microsoft Threat Modeling Tool

```bash
# Export threats to CSV for integration
# Then import to test tracking
python scripts/import_tmt_threats.py \
  --input threat-model.tm7 \
  --output threats.yaml
```

### OWASP Threat Dragon

```bash
# Export from Threat Dragon JSON
# Map to test cases
python scripts/map_threats_to_tests.py \
  --model threat-dragon-export.json \
  --tests tests/security/
```

---

*Guide from IDPF-Security Framework*
