# IDPF Suitability Assessment: N-Tier Applications

**Date:** 2026-02-07
**Overall Suitability:** High (~85-90% framework utilization)

---

## Summary

N-tier applications (presentation, business logic, data access, database) are squarely in IDPF's design target. The framework's domain specialists, TDD workflow, and decomposition tools map almost 1:1 to the tiers and concerns of an n-tier architecture.

---

## Domain Specialist Coverage

The 22 domain specialists cover every tier of an n-tier application:

| Tier | Specialist(s) | Fit |
|------|--------------|-----|
| **Presentation** | Frontend-Specialist, Mobile-Specialist, Accessibility-Specialist | Direct |
| **API / Gateway** | API-Integration-Specialist, Full-Stack-Developer | Direct |
| **Business Logic** | Backend-Specialist, Full-Stack-Developer | Direct |
| **Data Access** | Database-Engineer, Data-Engineer | Direct |
| **Infrastructure** | DevOps-Engineer, Cloud-Solutions-Architect, Platform-Engineer, SRE-Specialist | Direct |
| **Security (cross-cutting)** | Security-Engineer | Direct |
| **Performance (cross-cutting)** | Performance-Engineer | Direct |
| **Quality** | QA-Test-Engineer | Direct |

Use `/change-domain-expert` to switch specialists as you move between tiers during development.

---

## Skill Applicability

15 of 38 skills (~39%) are directly applicable to n-tier development:

| Skill | N-Tier Relevance |
|-------|-----------------|
| **TDD suite** (red, green, refactor, failure-recovery, test-writing-patterns) | Core workflow for each tier |
| **postgresql-integration / sqlite-integration** | Data tier |
| **api-versioning** | API tier — critical where tiers communicate via contracts |
| **error-handling-patterns** | Cross-cutting concern across all tiers |
| **migration-patterns** | Database schema evolution |
| **ci-cd-pipeline-design** | Deployment of multi-tier stacks |
| **property-based-testing / mutation-testing** | Advanced testing for business logic tier |
| **codebase-analysis / anti-pattern-analysis** | Architecture health as application grows |
| **bdd-writing** | Integration tests across tier boundaries |

---

## Workflow — Natural Decomposition

The PRD-to-backlog pipeline naturally maps to tier decomposition:

```
Proposal: "Build an inventory management system"
    │
    ↓  /create-prd
    │
PRD: User stories, acceptance criteria, NFRs
    │
    ↓  /create-backlog
    │
Epic: "Data Tier"              Epic: "API Tier"           Epic: "UI Tier"
├─ Story: Schema design        ├─ Story: REST endpoints   ├─ Story: Dashboard
├─ Story: Repository layer     ├─ Story: Auth middleware   ├─ Story: Forms
├─ Story: Migrations           ├─ Story: Validation       ├─ Story: Error display
└─ Story: Seed data            └─ Story: Rate limiting    └─ Story: State mgmt
    │                              │                          │
    ↓  /work (per story)           ↓                          ↓
    TDD: RED → GREEN → REFACTOR    TDD cycle                  TDD cycle
```

Each story gets:
- Branch assignment (`/assign-branch`)
- Acceptance criteria extraction (auto-TASK)
- TDD methodology enforcement (IDPF-Agile)
- STOP boundaries preventing scope creep
- Structured review (`/review-issue`)

---

## Testing Coverage

N-tier applications have notoriously tricky test boundaries. IDPF addresses this across multiple levels:

| Test Type | IDPF Support | N-Tier Application |
|-----------|-------------|-------------------|
| Unit tests | TDD red/green/refactor skills | Each tier in isolation |
| Integration tests | BDD-writing skill | Tier boundary contracts |
| Contract tests | IDPF-Contract-Testing framework | API contracts between tiers |
| Property-based | property-based-testing skill | Business logic invariants |
| Mutation testing | mutation-testing skill | Test suite quality |
| E2E | playwright-setup + playwright-check | Full stack verification |

---

## Framework Comparison

| Framework | N-Tier Fit | Notes |
|-----------|-----------|-------|
| **IDPF-Agile** | Best fit | TDD, structured stories, acceptance criteria, release management |
| **IDPF-Vibe** | Moderate | Useful for rapid prototyping a tier, but Agile preferred for production |

---

## Gaps and Workarounds

| Gap | Impact | Workaround |
|-----|--------|------------|
| No Docker/compose orchestration skill | Medium — multi-tier local dev | DevOps specialist knows Docker; add custom extension |
| No message queue / event-driven skill | Low-Medium — if using async tiers | ci-cd-pipeline-design covers some patterns |
| No specific ORM skill | Low — covered by DB skills | Database-Engineer specialist handles ORMs |
| Framework-agnostic (not opinionated on React vs Angular, Express vs FastAPI) | Neutral — can be a pro | Define stack via `/charter` Tech-Stack.md |

---

## Concrete Example Workflow

For a 3-tier REST API application with a React frontend, Express backend, and PostgreSQL database:

1. **`/charter`** — Define tech stack (React, Express, PostgreSQL), test strategy (Jest + Playwright)
2. **`/proposal`** — Describe the application's purpose and scope
3. **`/create-prd`** — Generate user stories with acceptance criteria per tier
4. **`/create-backlog`** — Decompose into epics (Data, API, UI) and stories
5. **`/work #N`** per story — TDD cycle with the appropriate domain specialist active
6. **`/prepare-release`** — Version, test, deploy

---

## Conclusion

N-tier application development is IDPF's home turf. The framework's PRD-to-story decomposition pipeline naturally maps to the tier decomposition pattern, the domain specialists cover every architectural layer, and the TDD workflow addresses the complexity that makes n-tier applications hard to build well. Expected framework utilization is ~85-90%.

---

**End of Assessment**
