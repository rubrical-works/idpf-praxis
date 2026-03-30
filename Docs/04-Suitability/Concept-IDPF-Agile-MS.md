# Concept: IDPF-Agile-MS — Microservices Process Module

**Date:** 2026-02-10
**Status:** Conceptual — not implemented
**Topic:** A microservices-specific extension to IDPF-Agile

---

## Motivation

The [Microservices assessment](Suitability-Microservices.md) rates IDPF at ~60-70% fit (multi-repo) and the [Monorepo assessment](Suitability-Microservices-Monorepo.md) raises that to ~80-85%. The remaining gaps are not in the core TDD loop — `/work` and `/done` work fine per-service — but in the **process wrapper** that surrounds it: charter structure, story decomposition, contract management, and release coordination.

An IDPF-Agile-MS module would add a microservices process layer on top of the existing IDPF-Agile framework, closing these gaps without changing the core workflow.

---

## What IDPF-Agile Already Handles

| Concept | Per-Service Behavior | Status |
|---|---|---|
| Charter | Defines one project's scope | Works today |
| Proposal → PRD | Captures one feature | Works today |
| `/create-backlog` | Decomposes PRD into stories | Works today |
| TDD cycle | RED-GREEN-REFACTOR per story | Works today |
| `/prepare-release` | Tags one repo | Works today |
| Domain specialists | Switch per concern | Works today |

None of this needs to change. The microservices module **extends** these, it doesn't replace them.

---

## What IDPF-Agile-MS Would Add

### 1. System Charter + Service Charters

IDPF-Agile assumes one `CHARTER.md` per project. A microservices project needs two levels:

```
CHARTER.md                    ← System-level: vision, service topology, communication patterns
Services/
  order-service/
    SERVICE-CHARTER.md        ← Service-level: owned data, API surface, dependencies
  payment-service/
    SERVICE-CHARTER.md
  notification-service/
    SERVICE-CHARTER.md
```

The **system charter** defines the topology — which services exist, how they communicate (REST, gRPC, events), what each one owns, and where the boundaries are. Each **service charter** defines the scope that IDPF-Agile enforces per-story.

The `/charter` command would gain a `services` mode:
- `/charter` — System-level charter (as today, plus service topology section)
- `/charter service order-service` — Service-level charter for a specific service

---

### 2. Contract-First Story Pattern

Standard IDPF-Agile writes acceptance criteria, then runs TDD.

IDPF-Agile-MS adds a **contract definition step** before implementation. The API contract (OpenAPI spec, protobuf definition, or event schema) becomes a first-class artifact alongside the story:

```
/work #42 — "Add order cancellation endpoint"
  1. Define contract (OpenAPI/protobuf/event schema)     ← NEW STEP
  2. RED: Write consumer contract test
  3. RED: Write provider test against contract
  4. GREEN: Implement to satisfy both
  5. REFACTOR
```

This is a process addition — a variant of the TDD RED phase, not a replacement. A new skill (`tdd-contract-first`) would provide the methodology:

- For REST: Define the OpenAPI path, write consumer test expecting that response, write provider test implementing it
- For gRPC: Define the protobuf service, generate stubs, write tests against the interface
- For events: Define the event schema (JSON Schema, Avro, protobuf), write producer test emitting it, write consumer test handling it

The contract artifact lives alongside the code and becomes the source of truth for cross-service communication.

---

### 3. Cross-Service Story Decomposition

When `/create-backlog` processes a PRD that spans multiple services, IDPF-Agile-MS would decompose with service boundaries in mind:

**Standard IDPF-Agile decomposition:**
```
Epic: "Order Cancellation"
├─ Story: Design schema changes
├─ Story: Implement cancellation endpoint
├─ Story: Add refund calculation
└─ Story: Build cancellation UI
```

**IDPF-Agile-MS decomposition:**
```
Epic: "Order Cancellation"
├─ Story: Define cancellation API contract (order-service)       ← contract first
├─ Story: Define refund event schema (payment-service)           ← contract first
├─ Story: Implement cancellation endpoint (order-service)        ← provider
├─ Story: Implement refund handler (payment-service)             ← consumer
├─ Story: Add consumer contract test (payment → order)           ← cross-service
└─ Story: Build cancellation UI (frontend)                       ← consumer
```

Key differences:
- Stories carry **service tags** indicating which service they belong to
- **Contract stories come first** — define the interface before implementing either side
- **Dependency ordering** is explicit — consumer stories depend on provider contract stories
- **Cross-service test stories** verify the integration at the contract boundary

---

### 4. Service-Aware Release

Two release modes:

| Mode | When | Behavior |
|---|---|---|
| **Coordinated release** | Multiple services changed together | `/prepare-release` tags the repo, deployment pipeline deploys affected services |
| **Per-service release** | One service changed independently | `/prepare-release --service order-service` tags `order-service/v2.1.0` |

Per-service release requires `/prepare-release` to understand service boundaries:
- Which directories map to which services (defined in system charter)
- Which services have changes since their last tag
- Whether the changed service's contract is backwards-compatible with consumers

The coordinated release mode works with IDPF today (one tag, one repo). The per-service mode would be the enhancement — enabling independent deployability within a monorepo.

---

### 5. New Skills

| Skill | Purpose |
|---|---|
| `tdd-contract-first` | RED phase variant: define API/event contract before implementation |
| `event-schema-design` | Event-driven communication patterns, schema evolution, versioning |
| `service-boundary-analysis` | Evaluate whether a feature belongs in an existing service or a new one |
| `circuit-breaker-patterns` | Resilience patterns: retries, timeouts, fallbacks, bulkheads |

These complement the existing skill library. The `tdd-contract-first` skill would be the highest-value addition — it changes the daily workflow by inserting contract definition into every cross-service story's TDD cycle.

---

## Architecture Decision: Framework vs Module

### Option A: Separate Framework

```json
{ "processFramework": "IDPF-Agile-MS" }
```

A distinct framework loading `Agile-MS-Core.md`. Inherits everything from IDPF-Agile and adds the microservices layer.

**Pros:** Clean separation. Clear identity. Users choose at project init.
**Cons:** Duplicates base Agile content. Two frameworks to maintain in sync.

### Option B: IDPF-Agile Module (Recommended)

```json
{ "processFramework": "IDPF-Agile", "modules": ["microservices"] }
```

IDPF-Agile stays the base. A `microservices` module loads additional process rules on top.

**Pros:** No duplication. Modular. Can combine with other future modules. Existing IDPF-Agile projects can adopt incrementally.
**Cons:** Module loading adds complexity. Need to define how modules extend commands.

**Recommendation: Option B.** The testing domains (Domains/Testing, Domains/Security, etc.) already follow a modular pattern — they add review criteria and methodology without replacing the core process. A microservices module would be consistent with this design.

### How Modules Would Extend Commands

The module wouldn't modify command spec files. Instead, it would register additional steps via the existing extension point system:

- `/charter` gains a service topology section via extension
- `/create-backlog` gains service-boundary decomposition via extension
- `/prepare-release` gains `--service` flag via extension
- `/work` loads `tdd-contract-first` skill when the story has a service tag

This means the microservices module is entirely built with existing framework mechanisms (extension points, skills, charter sections) — no new infrastructure required.

---

## Projected Fit With Module

| Structure | Current Fit | With MS Module |
|---|---|---|
| Multi-repo microservices | ~60-70% | ~75-85% |
| Monorepo microservices | ~80-85% | ~90-95% |

The monorepo + MS module combination would approach Full-Stack Web App levels of fit (~85-95%). This makes sense — at that point IDPF understands both the repo structure and the architectural pattern.

The multi-repo improvement is smaller because the fundamental constraint (single-repo scope) remains. The module adds process guidance for cross-repo coordination but can't add cross-repo tooling.

---

## Implementation Considerations

### Prerequisites

1. **Extension point system** must support module-level extensions (not just per-command user extensions)
2. **Charter command** must support structured sections that modules can register
3. **Skill loading** must support conditional loading based on story metadata (service tags)

### Scope

The minimum viable module would include:
- System charter service topology section
- `tdd-contract-first` skill
- `event-schema-design` skill
- Service-boundary story tagging in `/create-backlog`

The full module would add:
- Per-service release tagging
- Service dependency graph in charter
- Cross-service test story generation
- `service-boundary-analysis` and `circuit-breaker-patterns` skills

### Not In Scope

- Cross-repository tooling (this remains a platform concern, not a process framework concern)
- Deployment orchestration (Kubernetes, Argo CD, etc. — outside IDPF's domain)
- Service mesh configuration (infrastructure, not process)

---

## Relationship to Other Documents

| Document | Relationship |
|---|---|
| [Suitability: Microservices](Suitability-Microservices.md) | Current fit assessment (~60-70%) — this module addresses the gaps |
| [Suitability: Monorepo](Suitability-Microservices-Monorepo.md) | Monorepo eliminates repo-level gaps; this module addresses process-level gaps |
| [Reference: Microservices Repos](Reference-Microservices-Repos.md) | Real-world repos this module would target |
| [Roadmap](../Roadmap.md) | Monorepo support listed in Exploring section |

---

**End of Concept Document**
