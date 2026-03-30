# IDPF Suitability: Microservices in a Monorepo

**Date:** 2026-02-10
**Topic:** How a monorepo structure changes IDPF's fit for microservices

---

## Context

The [Microservices assessment](Suitability-Microservices.md) rates IDPF at ~60-70% fit, with two High-impact gaps:

1. **No cross-repository coordination** — stories in Service A can't depend on stories in Service B
2. **No service contract management across repos** — API changes in one service silently break consumers in another

Both gaps stem from the same root cause: IDPF operates within a single git repository. A monorepo eliminates that boundary.

---

## What a Monorepo Eliminates

### Cross-Service Coordination → Eliminated

In a monorepo, all services share one git repo, one project board, one branch, and one issue tracker:

| Multi-Repo Problem | Monorepo Reality |
|---|---|
| Can't create a story in Service A blocked by Service B | Both stories are in the same backlog — use `gh pmu sub` for dependencies |
| Can't `/work` across two repos | All code is in one repo — `/work` can touch any service directory |
| Can't coordinate a release across services | `/prepare-release` tags the whole repo — one tag, one deployment trigger |

### Cross-Service Contract Breaks → Caught by TDD

This is the most significant improvement. In a monorepo, when Service A changes its API, the consumer tests in Service B are in the same repo. The TDD cycle catches the break:

```
/work #42 — "Update order-service API response format"
  RED:    Write test for new format in order-service
  RED:    Consumer test in payment-service ALSO fails (same repo, same test run)
  GREEN:  Fix both — the change is atomic
  COMMIT: One commit updates provider AND consumer
```

In multi-repo, that consumer test failure is invisible until staging. In monorepo, TDD catches it at the RED phase. This converts a High-impact gap into a strength — IDPF's TDD enforcement actively prevents the contract breaks that plague multi-repo microservices.

### Shared Library Management → Eliminated

Internal shared code (auth middleware, logging, data models) lives in the same repo. No separate versioning, no published packages, no consumer pinning.

---

## What a Monorepo Reduces

### Deployment Orchestration → Reduced, Not Eliminated

A monorepo gives you one tag, but you still need to deploy individual services. `/prepare-release` tags `v2.1.0` for the whole repo. Your deployment pipeline still needs to:

- Detect which services changed (deploy only those)
- Determine deployment order
- Handle rollback of one service without rolling back all

This is a CI/CD pipeline concern. Tools like Nx, Turborepo, or Bazel handle "what changed" detection. IDPF's `ci-cd-pipeline-design` skill can guide the pipeline setup, but the orchestration lives outside the framework regardless of repo structure.

---

## New Gaps a Monorepo Introduces

### One Charter, Multiple Services

IDPF assumes one `CHARTER.md` per project. A monorepo with multiple services needs:

- A system-level charter (overall vision, shared constraints, communication patterns)
- Per-service scope boundaries (what does order-service own vs payment-service?)

Currently you'd put everything in one charter. This works for 2-3 services but gets unwieldy at scale. A potential enhancement: support for service-scoped charter sections or sub-charters.

**Impact:** Low-Medium. The charter is written once and updated rarely. A thorough Scope-Boundaries.md handles most of the per-service delineation.

### Per-Service Release Tagging

The microservices value proposition is independent deployability. A monorepo with one `/prepare-release` tag implies coordinated release. Options:

| Approach | IDPF Support | Trade-off |
|---|---|---|
| Per-service tags (e.g., `order-service/v2.1.0`) | Not supported natively | Requires custom `/prepare-release` extension or CI logic |
| Always deploy everything | Works today | Defeats independent deployability |
| Tag the repo, deploy selectively | Works today | CI/CD pipeline does the heavy lifting |

**Impact:** Medium. The third option (tag + selective deploy) is the pragmatic path and works with current IDPF. Per-service tagging would be a framework enhancement.

### Story Scope Clarity

A feature like "Add order cancellation with refund" touches order-service, payment-service, and notification-service. The PRD generates stories spanning all three. This works — stories reference different directories — but requires:

- Precise acceptance criteria about which service boundary each story tests
- Domain specialist switching per story (`/change-domain-expert`)
- Discipline about not letting one story's TDD cycle leak into another service

**Impact:** Low. IDPF already handles this through per-story TDD and STOP boundaries. It's more complex than single-service work, but the framework's existing structure supports it.

---

## Revised Fit Assessment

| Microservices Gap | Multi-Repo | Monorepo |
|---|---|---|
| Cross-repo coordination | **High** | **Eliminated** |
| Cross-repo contracts | **High** | **Eliminated** — TDD catches breaks |
| Deployment orchestration | Medium | **Reduced** — one tag, selective deploy |
| Event bus / message queue skill | Medium | Medium — still missing |
| Shared library management | Low-Medium | **Eliminated** |
| Per-service charter scoping | N/A | **New** — Low-Medium |
| Per-service release tagging | N/A | **New** — Medium |

**Estimated fit: ~80-85%**, up from ~60-70% in multi-repo. The two High-impact gaps that defined the lowest score are eliminated. The remaining gaps are a missing skill (event-driven patterns), a scoping convenience (per-service charter), and a release model question (per-service tags) — all lower impact than cross-repo coordination.

---

## When Monorepo Makes Sense for IDPF

**Good fit:**
- 2-5 services with shared data models or tight API contracts
- Single team or solo practitioner managing all services
- Services that frequently change together
- New microservices projects where structure is still forming

**Less compelling:**
- Services in different languages/runtimes (monorepo tooling gets complex)
- Services owned by different teams with different release cadences
- Existing multi-repo setup with established CI/CD pipelines
- 10+ services where the monorepo itself becomes the coordination challenge

---

## Relationship to Other Assessments

A monorepo microservices project is structurally similar to an N-Tier application from IDPF's perspective — multiple architectural layers in one repo, one branch, one release cycle. The revised ~80-85% fit aligns with the N-Tier assessment (~85-90%), which makes sense: the repo structure is the same, the difference is deployment topology.

For real-world examples of both approaches, see [Reference: Microservices Platforms on GitHub](Reference-Microservices-Repos.md). For a conceptual design that would close the remaining process gaps, see [Concept: IDPF-Agile-MS](Concept-IDPF-Agile-MS.md).

---

**End of Monorepo Microservices Assessment**
