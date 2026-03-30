# IDPF Suitability Assessment: Full-Stack Web Applications

**Date:** 2026-02-09
**Overall Suitability:** High (~85-95% framework utilization)

---

## Summary

Full-stack web applications — a frontend (React, Vue, Svelte, Angular), a backend (Node/Express, Python/FastAPI, Ruby/Rails), and a database (PostgreSQL, MySQL, SQLite) — are the most common project type that IDPF users will build. The framework's domain specialists cover every layer, the TDD workflow handles both UI components and API routes, and the PRD-to-backlog decomposition naturally maps to the frontend/backend/data split. This is IDPF at its most comfortable.

---

## Domain Specialist Coverage

Full-stack work requires switching between concerns frequently. The 22 domain specialists provide focused expertise at each layer:

| Layer | Specialist(s) | Fit |
|---|---|---|
| **Frontend (UI/UX)** | Frontend-Specialist | Direct — component architecture, state management, responsive design |
| **Frontend (Accessibility)** | Accessibility-Specialist | Direct — WCAG compliance, screen readers, keyboard navigation |
| **API Layer** | API-Integration-Specialist | Direct — REST/GraphQL design, versioning, rate limiting |
| **Backend Logic** | Backend-Specialist | Direct — business rules, validation, error handling |
| **Database** | Database-Engineer | Direct — schema design, queries, indexing, migrations |
| **Full-Stack (general)** | Full-Stack-Developer | Direct — when work crosses layers |
| **Auth / Security** | Security-Engineer | Direct — authentication, authorization, OWASP concerns |
| **Performance** | Performance-Engineer | Direct — load times, query optimization, caching |
| **Deployment** | DevOps-Engineer | Direct — CI/CD, containerization, hosting |
| **Testing** | QA-Test-Engineer | Direct — test strategy, coverage analysis |

**The Full-Stack-Developer specialist** is the natural default. It provides broad coverage across all layers without deep specialization. Switch to a focused specialist when doing deep work:

```
/change-domain-expert Frontend-Specialist     ← Building the dashboard
/change-domain-expert Database-Engineer       ← Designing the schema
/change-domain-expert Security-Engineer       ← Implementing auth
/change-domain-expert Full-Stack-Developer    ← Back to general work
```

---

## Skill Applicability

19 of 38 skills (~50%) are directly applicable to full-stack web development:

| Skill | Full-Stack Relevance |
|---|---|
| **TDD suite** (red, green, refactor, failure-recovery, test-writing-patterns) | Core workflow — backend unit tests, frontend component tests |
| **postgresql-integration** | Production database setup, connection pooling, query patterns |
| **sqlite-integration** | Development/testing database, local-first patterns |
| **migration-patterns** | Schema evolution — critical for any app with a database |
| **api-versioning** | API contract management as the app evolves |
| **error-handling-patterns** | Cross-stack error propagation (DB → API → UI) |
| **ci-cd-pipeline-design** | Build, test, deploy pipeline for multi-layer apps |
| **playwright-setup** | E2E browser testing — tests the full stack together |
| **property-based-testing** | Edge case discovery for business logic and API contracts |
| **mutation-testing** | Test suite quality — are the tests actually catching bugs? |
| **bdd-writing** | Integration tests for API endpoints and user flows |
| **codebase-analysis** | Architecture health as the app grows |
| **anti-pattern-analysis** | Detect structural issues before they become tech debt |
| **flask-setup / sinatra-setup** | Quick backend scaffolding for Python/Ruby stacks |
| **common-errors** | Common gotchas in web development |
| **beginner-testing** | Testing guidance for developers new to TDD |

**Skills with lower relevance:** `electron-development` (desktop).

---

## Workflow — Layer-by-Layer Decomposition

The PRD-to-backlog pipeline naturally decomposes a full-stack feature into layer-specific stories:

```
Proposal: "Add user authentication with social login"
    │
    ↓  /create-prd
    │
PRD: User stories, acceptance criteria, security NFRs
    │
    ↓  /create-backlog
    │
Epic: "Data Layer"              Epic: "API Layer"           Epic: "Frontend"
├─ Story: User schema           ├─ Story: Auth endpoints    ├─ Story: Login page
├─ Story: Session model         ├─ Story: OAuth callback    ├─ Story: Social buttons
├─ Story: Migrations            ├─ Story: JWT middleware     ├─ Story: Protected routes
└─ Story: Seed users            └─ Story: Rate limiting     └─ Story: Session display
    │                               │                           │
    ↓  DB-Engineer                  ↓  API-Specialist           ↓  Frontend-Specialist
    TDD cycle                       TDD cycle                   TDD cycle
```

Each story gets its own TDD cycle with the appropriate domain specialist active. The stories are worked sequentially with STOP boundaries between them, preventing the AI from batch-implementing across layers and introducing cross-layer bugs.

### Why Sequential Matters for Full-Stack

Full-stack features have **layer dependencies**. The frontend needs the API, the API needs the database. Working data→API→frontend ensures each layer is tested and committed before the next layer builds on it. If the AI implements all three layers in parallel (as it will try to do without STOP boundaries), a schema change late in development cascades into broken API tests and frontend components.

IDPF's per-story STOP boundaries enforce this natural dependency order.

---

## Testing Coverage

Full-stack applications need testing at every layer and across layer boundaries:

| Test Type | IDPF Support | Full-Stack Application |
|---|---|---|
| **Unit tests** | TDD red/green/refactor skills | Component tests (frontend), function tests (backend), query tests (data) |
| **Integration tests** | BDD-writing skill | API endpoint tests with real database, component tests with API mocks |
| **Contract tests** | IDPF-Contract-Testing framework | Frontend↔API contracts, API↔DB contracts |
| **E2E tests** | playwright-setup + playwright-check | Full browser-based user journeys through all layers |
| **Property-based** | property-based-testing skill | Business logic invariants, API input validation |
| **Mutation testing** | mutation-testing skill | Verify test suite catches real bugs |
| **Performance** | IDPF-Performance framework | Load testing, query performance, render benchmarks |
| **Security** | IDPF-Security framework | Auth bypass, injection, XSS scanning |
| **Accessibility** | IDPF-Accessibility framework | WCAG compliance, screen reader testing |

The combination of **Playwright for E2E** and **TDD for unit/integration** covers the full testing pyramid. The testing frameworks (IDPF-Performance, IDPF-Security, IDPF-Accessibility) provide review criteria for specialized concerns that unit tests miss.

---

## Framework Comparison

| Framework | Full-Stack Fit | Notes |
|---|---|---|
| **IDPF-Agile** | Best fit | TDD enforces testing at every layer; story decomposition maps to layers |
| **IDPF-Vibe** | Strong for prototypes | Good for "let me see if this stack works" before committing to full process |

**Recommended path for new full-stack projects:**
- Start with **IDPF-Vibe** if the tech stack is uncertain (e.g., "React or Vue? Express or FastAPI?")
- Transition to **IDPF-Agile** once the stack is chosen and the first feature is working
- Stay with **IDPF-Agile** for production development

---

## Gaps and Workarounds

| Gap | Impact | Workaround |
|---|---|---|
| No CSS framework skill (Tailwind, Bootstrap) | Low — covered by Frontend-Specialist | Define CSS approach in charter Tech-Stack.md |
| No state management skill (Redux, Zustand, Pinia) | Low — covered by Frontend-Specialist | Charter scope boundaries define state approach |
| No Docker/compose skill | Medium — local dev with DB needs containers | DevOps-Engineer specialist handles Docker |
| No WebSocket/real-time skill | Low-Medium — if app needs real-time features | API-Integration-Specialist covers the patterns |
| No specific ORM skill (Prisma, SQLAlchemy, ActiveRecord) | Low | Database-Engineer specialist handles ORMs |
| Framework-agnostic (no React-specific or Express-specific skills) | Neutral — flexibility vs opinionation | Tech stack defined in charter; specialist adapts |

The "framework-agnostic" point is worth noting: IDPF doesn't have a "React skill" or an "Express skill." It has a Frontend-Specialist who knows React (and Vue and Svelte), and a Backend-Specialist who knows Express (and FastAPI and Rails). The expertise comes from the specialist, not from a dedicated skill. This means IDPF works with any full-stack combination without requiring stack-specific extensions.

---

## Concrete Example Workflow

Building a task management app with Next.js, tRPC, and PostgreSQL:

1. **`/charter`** — Define stack (Next.js 14, tRPC, PostgreSQL, Prisma), test strategy (Vitest + Playwright)
2. **`/proposal Add task boards with drag-and-drop`** — Feature proposal
3. **`/review-proposal #5`** — Evaluate completeness
4. **`/create-prd #5`** — Generate requirements with user stories per layer
5. **`/create-backlog #10`** — Decompose into epics (Data, API, UI) and stories
6. **`/create-branch release/v1.0.0`**
7. **`/assign-branch --all`** — Assign all stories to the branch
8. **`/work #15`** — Story: Prisma schema for tasks/boards (Database-Engineer)
9. **`/done #15`**
10. **`/work #16`** — Story: tRPC router for task CRUD (API-Integration-Specialist)
11. **`/done #16`**
12. **`/work #17`** — Story: Board UI with drag-and-drop (Frontend-Specialist)
13. **`/done #17`**
14. **`/prepare-release`** — Version, merge, tag

Each `/work` cycle produces tested, committed code for one layer before the next layer builds on it.

---

## Conclusion

Full-stack web applications are IDPF's bread and butter. The domain specialists map cleanly to the frontend/backend/data split, the skills cover the full testing pyramid, and the PRD-to-backlog decomposition naturally produces layer-organized stories. The sequential work/done cycle with specialist switching prevents the cross-layer bugs that plague full-stack development when all layers are built simultaneously. Expected framework utilization: ~85-95%.

---

**End of Assessment**
