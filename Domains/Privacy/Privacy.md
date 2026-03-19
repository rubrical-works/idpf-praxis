# Privacy Domain
**Version:** v0.66.3
**Type:** Domain
**Companion Skill:** privacy-compliance
## Overview
Evaluative criteria for privacy compliance across project artifacts. Surfaces consent management, data protection, cookie compliance, and regulatory requirements during reviews.
**Core Principle:** Privacy is a design constraint, not a feature. Data collection, consent flows, and retention policies should be decided during design and validated before deployment.
## Domain Scope
| Concern | Description |
|---------|-------------|
| Consent Management | User consent collection, preference storage, consent-before-load enforcement |
| Cookie Compliance | Cookie classification, attributes (Secure, SameSite, HttpOnly), banner implementation |
| Data Protection | Encryption at rest, masking in logs, data subject rights (access, deletion, portability) |
| Regulatory Landscape | GDPR, CCPA/CPRA, LGPD, ePrivacy Directive |
| Dark Pattern Avoidance | Equal prominence for accept/reject, no pre-checked boxes, clear language |
| Third-Party Scripts | Sub-processor identification, consent gating, data processing impact |
## When This Domain Applies
- Applications that collect, process, or store personal data
- Adding analytics, tracking, or marketing scripts
- Implementing cookie consent banners or preference centers
- Designing user registration, authentication, or profile features
- Targeting users in GDPR, CCPA, or LGPD jurisdictions
## Tool Ecosystem
| Tool | Purpose |
|------|---------|
| OneTrust / Cookiebot | Consent management platforms |
| CookieYes | Cookie scanning and banner generation |
| Chrome DevTools (Application tab) | Cookie inspection |
| Blacklight (The Markup) | Third-party tracker detection |
**End of Privacy Domain**
