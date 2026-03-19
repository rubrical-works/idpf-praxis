# Domain Registry
**Version:** v0.66.0
## Overview
Domains are specialized knowledge lenses activated via `--with` during reviews. Each domain provides evaluative criteria across 5 surfaces: charter, proposal, PRD, issue, and code review.
## Registry
| Domain | Description | Companion Skill | Origin |
|--------|-------------|----------------|--------|
| Accessibility | WCAG-based accessibility testing | — | Migrated from IDPF-Accessibility |
| API-Design | REST/GraphQL API design conventions | api-versioning | New |
| Chaos | Resilience and failure-mode testing | — | Migrated from IDPF-Chaos |
| Contract-Testing | Consumer/provider contract testing | — | Migrated from IDPF-Contract-Testing |
| i18n | Internationalization and localization | i18n-setup | New |
| Observability | Logging, tracing, metrics, alerting | observability-setup | New |
| Performance | Load, stress, and capacity testing | — | Migrated from IDPF-Performance |
| Privacy | Consent, cookies, GDPR/CCPA compliance | privacy-compliance | Promoted from skill |
| QA-Automation | UI and E2E test automation | — | Migrated from IDPF-QA-Automation |
| Security | OWASP-based security testing | — | Migrated from IDPF-Security |
| SEO | Technical SEO and structured data | seo-optimization | Promoted from skill |
**Total:** 11 domains (6 migrated, 2 promoted, 3 new)
## Activation
1. **Charter profiling** — `activeDomains` array in `framework-config.json`
2. **Specialist auto-inclusion** — `relevantSpecialists` in `review-extensions.json`
3. **Explicit flag** — `--with security,performance` on review commands
4. **All domains** — `--with all`
## Suppression
- `--without security` — suppress specific domain for one invocation
- `--with none` — suppress all auto-inclusion for one invocation
