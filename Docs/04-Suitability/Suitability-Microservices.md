# IDPF Suitability Assessment: Microservices / Distributed Systems

**Date:** 2026-02-09
**Overall Suitability:** Moderate (~60-70% framework utilization per service, with significant gaps in cross-service coordination)

---

## Summary

Microservices architectures — multiple independently deployable services communicating over network boundaries — are a partial fit for IDPF. The framework works well *within* each service (TDD, story-driven development, release management) but lacks tooling for the coordination *between* services that defines microservices work. IDPF can manage your individual services. It cannot manage the system they form together.

This assessment is honest about the gaps. If you're evaluating IDPF for a microservices project, this tells you what works, what doesn't, and what you'll need to supplement.

---

## Where IDPF Works: Per-Service Development

Each microservice is, architecturally, a small application. It has a codebase, a test suite, an API surface, a data store, and a deployment target. IDPF handles all of this well:

### Per-Service Hub Model

Each service gets its own project linked to a shared IDPF hub:

```
IDPF Hub (shared)
    │
    ├── user-service/          ← Project with own charter, issues, branch
    ├── order-service/         ← Project with own charter, issues, branch
    ├── payment-service/       ← Project with own charter, issues, branch
    └── notification-service/  ← Project with own charter, issues, branch
```

Each service has:
- Its own `CHARTER.md` defining scope, tech stack, and boundaries
- Its own `.gh-pmu.json` linked to a GitHub Project board
- Its own branches, issues, and release cycle
- Shared rules, hooks, scripts, and skills via hub symlinks

This works. A service with a clear API contract, its own database, and independent deployment is exactly the kind of project IDPF was designed for.

---

## Domain Specialist Coverage

| Microservice Concern | Specialist(s) | Fit |
|---|---|---|
| **Service logic** | Backend-Specialist | Direct |
| **API design (REST/gRPC/GraphQL)** | API-Integration-Specialist | Direct |
| **Data store** | Database-Engineer, Data-Engineer | Direct |
| **Authentication / Authorization** | Security-Engineer | Direct |
| **Containerization / Orchestration** | DevOps-Engineer, Platform-Engineer | Direct |
| **Monitoring / Observability** | SRE-Specialist | Direct |
| **Performance / Load** | Performance-Engineer | Direct |
| **API Gateway / BFF** | API-Integration-Specialist, Full-Stack-Developer | Partial |
| **Event-driven messaging** | Backend-Specialist | Indirect — no dedicated specialist |
| **Service mesh** | Platform-Engineer | Indirect |

Coverage is strong for individual service concerns. The gaps appear at the system level — service mesh configuration, event bus topology, distributed tracing — where no single specialist has deep enough focus.

---

## Skill Applicability

14 of 38 skills (~37%) are directly applicable per service:

| Skill | Microservice Relevance |
|---|---|
| **TDD suite** (5 skills) | Core workflow for each service |
| **api-versioning** | Critical — service APIs are contracts with consumers |
| **error-handling-patterns** | Network failures, timeouts, retries, circuit breakers |
| **postgresql-integration / sqlite-integration** | Per-service data store |
| **migration-patterns** | Schema evolution per service |
| **ci-cd-pipeline-design** | Per-service deployment pipeline |
| **property-based-testing** | API contract invariants |
| **bdd-writing** | Service integration tests |
| **codebase-analysis / anti-pattern-analysis** | Per-service architecture health |

### Skills with limited microservices relevance

| Skill | Why Limited |
|---|---|
| **playwright-setup** | E2E browser testing — only for services with a UI |
| **flask-setup / sinatra-setup** | Scaffolding — useful once per service |
| **beginner-testing / common-errors** | Learning-oriented |
| **electron-development** | Desktop apps |

---

## Where IDPF Falls Short: Cross-Service Coordination

This is where the honest assessment matters. Microservices architecture is defined by the interactions *between* services, and IDPF's tooling operates *within* a single repository at a time.

### Gap 1: No Cross-Repository Coordination

Each IDPF project is a single git repository. There is no mechanism to:
- Create a story in Service A that is blocked by a story in Service B
- Run `/work` across two repos simultaneously
- Coordinate a release that requires multiple services to deploy in order

**Impact:** High. This is the defining challenge of microservices work.

**Workaround:** Use a **system-level GitHub Project board** (separate from per-service boards) to track cross-service work. Create "umbrella issues" that reference per-service stories. Coordinate manually — which is what most teams do anyway, since even purpose-built microservices tools rarely solve this fully.

### Gap 2: No Service Contract Management

When Service A changes its API, Service B needs to know. IDPF has the IDPF-Contract-Testing framework and the api-versioning skill, but these operate within a single service's test suite. There is no framework-level mechanism to:
- Detect when an API change breaks a consumer
- Run consumer-driven contract tests across repos
- Enforce backwards compatibility at the pipeline level

**Impact:** High for systems with many inter-service dependencies. Low for event-driven architectures with loose coupling.

**Workaround:** Use a contract testing tool (Pact, Specmatic) as part of each service's CI pipeline. Define contracts in a shared repo or as published artifacts. IDPF's TDD cycle can run contract tests — you just need to set them up outside the framework.

### Gap 3: No Distributed Deployment Orchestration

`/prepare-release` handles one service at a time. It cannot:
- Coordinate blue-green deployments across services
- Manage canary releases with traffic splitting
- Handle rollback across multiple services

**Impact:** Medium. Most teams use Kubernetes, ArgoCD, or similar tools for deployment orchestration — IDPF wouldn't replace these even if it had the feature.

**Workaround:** Use `/prepare-release` per service to tag and merge. Hand off to your deployment orchestrator (Kubernetes, Docker Compose, Terraform) for the actual multi-service deployment.

### Gap 4: No Event Bus / Message Queue Skill

Microservices often communicate through events (Kafka, RabbitMQ, SNS/SQS) rather than direct API calls. IDPF has no dedicated skill for event-driven architecture patterns.

**Impact:** Medium. The Backend-Specialist and API-Integration-Specialist understand messaging patterns, but there's no structured guidance for event schema design, consumer group management, or dead letter handling.

**Workaround:** Define event contracts in the charter. Use `api-versioning` patterns adapted for event schemas. The ci-cd-pipeline-design skill covers some event pipeline patterns.

### Gap 5: No Shared Library Management

Microservices commonly share code through internal libraries (auth middleware, logging, data models). IDPF has no mechanism for managing shared packages across projects.

**Impact:** Low-Medium. Shared libraries are a separate versioning concern.

**Workaround:** Treat shared libraries as their own IDPF project with its own charter, issues, and release cycle. Consumer services pin to published versions.

---

## Workflow — What Works Well

Despite the gaps, the per-service workflow is productive:

```
Per-Service Development (IDPF handles this well)
─────────────────────────────────────────────────
Service: order-service

/charter                              ← Scope: order management, PostgreSQL, REST API
/proposal Add order cancellation
/create-prd #5
/create-backlog #10
/create-branch release/v2.1.0
/assign-branch --all
/work #15                             ← TDD: cancellation endpoint
/done #15
/work #16                             ← TDD: refund calculation
/done #16
/prepare-release                      ← Tag v2.1.0

Cross-Service Coordination (manual, outside IDPF)
─────────────────────────────────────────────────
- Update system project board
- Verify contract compatibility with payment-service
- Coordinate deployment with notification-service
- Run integration tests in staging
```

The per-service part is 90%+ fit. The cross-service part is manual. This split is acceptable if you have 3-5 services. It becomes painful at 10+.

---

## Testing Coverage

| Test Type | IDPF Support | Microservice Application |
|---|---|---|
| **Unit tests** | TDD suite | Per-service business logic |
| **Integration tests** | BDD-writing skill | Service with its own database |
| **Contract tests** | IDPF-Contract-Testing framework | Per-service consumer/provider contracts |
| **E2E tests** | playwright-setup (if UI exists) | Frontend service through API gateway |
| **Performance** | IDPF-Performance framework | Per-service load testing |
| **Security** | IDPF-Security framework | Per-service auth, injection, OWASP |
| **Chaos testing** | IDPF-Chaos framework | Per-service failure injection |

The **IDPF-Chaos** framework is particularly relevant for microservices — it provides review criteria for fault injection, resilience testing, and failure recovery. Combined with the error-handling-patterns skill, this covers the "what happens when Service B is down?" question that defines microservice reliability.

Missing: cross-service integration testing (covered by your staging environment and deployment orchestrator, not by IDPF).

---

## Framework Comparison

| Framework | Microservice Fit | Notes |
|---|---|---|
| **IDPF-Agile** | Best per-service fit | TDD, structured stories, release management |
| **IDPF-Vibe** | Useful for new services | Prototype a service quickly, then transition to Agile |

**Recommended approach:**
- Use **IDPF-Agile** for established services with stable APIs
- Use **IDPF-Vibe** for new services where the API surface is still being discovered
- Transition Vibe→Agile once the service's contract stabilizes

---

## Concrete Example: Three-Service System

An e-commerce system with user-service, order-service, and payment-service:

```
Shared IDPF Hub
    │
    ├── user-service/
    │   Charter: User management, JWT auth, PostgreSQL
    │   Specialist: Security-Engineer → Backend-Specialist
    │   Skills: TDD, postgresql-integration, api-versioning
    │
    ├── order-service/
    │   Charter: Order lifecycle, event publishing, PostgreSQL
    │   Specialist: Backend-Specialist
    │   Skills: TDD, postgresql-integration, error-handling-patterns
    │
    └── payment-service/
        Charter: Payment processing, Stripe integration, idempotency
        Specialist: API-Integration-Specialist → Security-Engineer
        Skills: TDD, api-versioning, property-based-testing
```

Each service runs its own IDPF workflow independently. Cross-service coordination (deployment order, contract compatibility, integration testing) happens outside IDPF on a shared project board and in a staging environment.

---

## When to Use IDPF for Microservices

**Good fit (use IDPF):**
- 2-5 services with clear boundaries
- Services owned by one person or a small team
- Each service has its own repo and release cycle
- Cross-service coordination is infrequent

**Moderate fit (use IDPF per-service, supplement for coordination):**
- 5-10 services with moderate interdependency
- Regular cross-service changes (shared data models, event schemas)
- Need contract testing across service boundaries

**Poor fit (IDPF helps less):**
- 10+ services with high interdependency
- Frequent coordinated deployments
- Service mesh complexity is the primary challenge
- The hard problems are infrastructure, not application code

---

## Conclusion

IDPF is a strong per-service development framework that doesn't pretend to be a microservices orchestration platform. Within each service, you get the full benefit: TDD, structured stories, release management, domain specialists, and the complete skill library. Between services, you're on your own — and that's an honest assessment, not a gap that will be quietly papered over.

For small microservices systems (2-5 services), this is a good trade-off. The per-service quality that IDPF provides is more valuable than cross-service tooling you can handle manually. For large systems, the coordination gaps become the bottleneck, and IDPF becomes a useful but insufficient piece of the puzzle.

Expected framework utilization: ~60-70% overall, with ~85-90% within each service and ~20-30% for cross-service concerns.

**Considering a monorepo?** A monorepo structure eliminates the two High-impact gaps (cross-repo coordination and cross-repo contracts), raising estimated fit to ~80-85%. See [Microservices in a Monorepo](Suitability-Microservices-Monorepo.md) for the full analysis.

**Want to see real examples?** [Reference: Microservices Platforms on GitHub](Reference-Microservices-Repos.md) catalogs open-source multi-repo and monorepo microservices projects for comparison.

**Looking ahead:** A conceptual [IDPF-Agile-MS module](Concept-IDPF-Agile-MS.md) describes how contract-first TDD, service-aware story decomposition, and per-service release tagging could raise monorepo fit to ~90-95%.

---

**End of Assessment**
