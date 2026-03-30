# Skill Guide: Privacy Compliance

**Date:** 2026-02-28
**Topic:** Scope boundaries and curated references for the `privacy-compliance` skill
**Related Skill:** `Skills/privacy-compliance/`

---

## What the Skill Covers (v1)

The `privacy-compliance` skill provides structured guidance in four areas:

1. **Consent Management** — Consent-before-load patterns, consent storage, preference centers, consent-as-a-service vs self-hosted
2. **Cookie Compliance** — Cookie classification (strictly necessary, functional, analytics, marketing), banner implementation, cookie auditing
3. **Dark Pattern Avoidance** — Reject-all parity, pre-checked boxes, cookie walls, confirmshaming, nagging, hidden withdrawal
4. **Regulatory Landscape** — GDPR, CCPA/CPRA, LGPD, ePrivacy Directive implementation patterns (not legal advice)

These are the foundational, code-level concerns that developers encounter when adding analytics, tracking, forms, or third-party integrations. The skill is designed to surface privacy considerations during development rather than during compliance audits.

---

## What the Skill Does NOT Cover (Deferred)

The following topics are outside v1 scope. They require deeper architectural patterns, external tooling, or framework-specific implementations.

### Privacy-by-Design

Privacy-by-design addresses how data architecture itself can minimize privacy risk — designing schemas that don't over-collect, APIs that enforce purpose limitation, and retention policies that automatically purge expired data.

**What the skill does touch:** The general principle that consent must precede data collection, and that data should serve a stated purpose.

**What it defers:**
- Data minimization in database schema design (collecting only necessary fields)
- Purpose limitation in API design (restricting data access to stated purposes)
- Retention policies and automatic data expiration
- Anonymization and pseudonymization patterns
- Privacy impact assessments (PIAs)

**Curated references:**
- ICO — [Privacy by design and default](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/guide-to-accountability-and-governance/accountability-and-governance/data-protection-by-design-and-default/)
- OWASP — [Privacy by Design](https://owasp.org/www-project-developer-guide/draft/design/web_app_checklist/privacy/)
- Ann Cavoukian — "Privacy by Design: The 7 Foundational Principles"

### Data Subject Rights Implementation

Data subject rights (access, deletion, portability, rectification) are technical challenges that touch authentication, database design, backup systems, and third-party integrations. They are substantial enough for dedicated implementation guidance.

**What the skill does touch:** The regulatory requirement for these rights (what they are, which regulations mandate them).

**What it defers:**
- Right to deletion (erasure) — cascading deletes across databases, backups, caches, and third parties
- Data portability — export formats (JSON, CSV), API design for bulk export
- Access requests — generating comprehensive reports of all personal data
- Consent withdrawal flows — technical implementation of immediate processing cessation

**Curated references:**
- ICO — [Right to erasure](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-erasure/)
- Google — [Account data download design](https://takeout.google.com/) (reference implementation for portability)
- IAPP — [Subject Access Request automation](https://iapp.org/)

### Third-Party Script Auditing

Third-party scripts are one of the largest privacy risks — they can exfiltrate data, set tracking cookies, and create sub-processor relationships that require disclosure. Auditing them requires network analysis, tag manager governance, and ongoing monitoring.

**What the skill does touch:** The consent-before-load pattern (blocking third-party scripts until consent), and consent mode integration for tag managers.

**What it defers:**
- Data egress tracking — identifying what data leaves your domain and to whom
- Tag manager governance — approval workflows for new tags, regular audits
- Sub-processor tracking — maintaining an up-to-date list of data processors
- Network request auditing — identifying all outbound calls from your pages

**Curated references:**
- Mozilla Observatory — [Website security and privacy scanner](https://observatory.mozilla.org/)
- Blacklight — [Privacy inspection tool](https://themarkup.org/blacklight)
- Google Tag Manager — [Consent mode documentation](https://developers.google.com/tag-platform/security/guides/consent)

### Framework-Specific Guidance

Modern frameworks each handle consent and privacy differently through their rendering strategies and storage APIs. Framework-specific guidance changes rapidly with framework versions and is too broad for a single skill.

**What the skill does touch:** Universal patterns (consent cookies, script gating, banner HTML) that work regardless of framework.

**What it defers:**
- SPA consent gates (React/Vue/Angular consent hooks)
- SSR cookie handling (Next.js, Nuxt server-side consent)
- Mobile consent flows (App Tracking Transparency on iOS, consent dialogs on Android)
- Local storage and IndexedDB privacy considerations (these store personal data but are not cookies)

**Curated references:**
- Apple — [App Tracking Transparency](https://developer.apple.com/documentation/apptrackingtransparency)
- Next.js — Cookie and consent management patterns
- React — Context-based consent state management patterns

---

## Future Expansion (v2 Considerations)

Issue #1603 notes these as potential v2 additions:

- **Privacy-by-design resource:** Data minimization, purpose limitation, retention policies
- **Data subject rights resource:** Deletion cascades, portability exports, access request handling
- **Third-party audit resource:** Data egress mapping, tag manager governance
- **Framework adapters:** Framework-specific resource files under `resources/frameworks/`
- **Review extension:** Register `privacy` as a `/review-issue --with privacy` domain (see Issue #1621)

---

## Related Resources

| Resource | Purpose |
|----------|---------|
| `Skills/privacy-compliance/SKILL.md` | Main skill with inline guidance |
| `Skills/privacy-compliance/resources/consent-management.md` | Deep-dive on consent-before-load, storage, preference centers, CMP comparison |
| `Skills/privacy-compliance/resources/cookie-compliance.md` | Deep-dive on classification, banners, auditing |
| `Skills/privacy-compliance/resources/dark-pattern-avoidance.md` | Deep-dive on the six privacy dark patterns with enforcement examples |
| `Skills/privacy-compliance/resources/regulatory-landscape.md` | GDPR, CCPA/CPRA, LGPD, ePrivacy comparison matrix |
| `IDPF-Security/` | Security engineering (overlaps with data protection) |
| `IDPF-Accessibility/` | Accessibility patterns (consent UI must be accessible) |

---
