# Reference: Microservices Platforms on GitHub

**Date:** 2026-02-10
**Topic:** Open-source microservices repos for evaluating IDPF fit against real-world architectures

---

## Purpose

These repositories demonstrate real microservices architectures — both multi-repo and monorepo — that IDPF users may be building or evaluating. They provide concrete reference points for the suitability assessments in [Microservices](Suitability-Microservices.md) (~60-70% fit) and [Microservices in a Monorepo](Suitability-Microservices-Monorepo.md) (~80-85% fit).

---

## Multi-Repo Examples

### Sock Shop (Weaveworks)

**Repo:** [github.com/microservices-demo](https://github.com/microservices-demo) (GitHub org with separate repos per service)

The canonical multi-repo microservices demo. Each service — front-end, catalogue, carts, orders, shipping, queue-master, payment, user — is a separate GitHub repository under the `microservices-demo` organization. Services communicate over HTTP and messaging.

**Relevant to IDPF because:** This is the architecture where IDPF scores ~60-70%. Each service repo would be its own IDPF project with its own charter, backlog, and release cycle. Cross-service coordination (API contract changes, deployment ordering) happens outside IDPF on a shared project board.

| Characteristic | Detail |
|---|---|
| Services | 8 |
| Languages | Go, Java, Node.js, Python, .NET |
| Communication | HTTP REST, RabbitMQ |
| Deployment | Kubernetes, Docker Compose |
| Repo structure | One repo per service |

---

### Google Online Boutique

**Repo:** [github.com/GoogleCloudPlatform/microservices-demo](https://github.com/GoogleCloudPlatform/microservices-demo)

Google Cloud's reference application. 11 microservices in different languages communicating over gRPC. All services live in a single repository but are architecturally independent — each has its own directory, Dockerfile, and deployment config.

**Relevant to IDPF because:** This is a **hybrid** — monorepo structure with multi-service independence. IDPF would treat this as a single project. The gRPC contracts between services would benefit from monorepo TDD (contract breaks caught at RED phase). This repo's structure aligns closely with the ~80-85% monorepo fit assessment.

| Characteristic | Detail |
|---|---|
| Services | 11 |
| Languages | Go, C#, Java, Python, Node.js, Rust |
| Communication | gRPC |
| Deployment | Kubernetes, Istio, Skaffold |
| Repo structure | Monorepo (per-service directories) |

---

### eShopOnContainers (Microsoft)

**Repo:** [github.com/dotnet-architecture/eShopOnContainers](https://github.com/dotnet-architecture/eShopOnContainers)

Microsoft's .NET microservices reference architecture. Services include Catalog, Ordering, Basket, Identity, and several API gateways. Uses an event bus (RabbitMQ) for inter-service communication. All services in one repository.

**Relevant to IDPF because:** Demonstrates event-driven communication between services — the pattern where IDPF's missing "event bus / message queue" skill is most felt. The single-repo structure works well with IDPF's model, but the event-driven patterns would benefit from a dedicated skill.

| Characteristic | Detail |
|---|---|
| Services | 6+ application services, multiple gateways |
| Languages | C# (.NET) |
| Communication | HTTP REST, gRPC, RabbitMQ event bus |
| Deployment | Docker Compose, Kubernetes |
| Repo structure | Monorepo |

---

## Monorepo Examples

### Pocket Monorepo (Mozilla)

**Repo:** [github.com/Pocket/pocket-monorepo](https://github.com/Pocket/pocket-monorepo)

A real production system. All Pocket TypeScript backend services in one repository, deployed as separate microservices. Includes API servers, SQS queue processor lambdas, API Gateway lambdas, and Terraform infrastructure definitions.

**Relevant to IDPF because:** This is the closest match to what a monorepo microservices project with IDPF would look like. Single repo, multiple deployable services, shared TypeScript codebase, infrastructure-as-code alongside application code. The Terraform infrastructure co-located with services is a pattern IDPF's charter and scope boundaries would need to account for.

| Characteristic | Detail |
|---|---|
| Services | Multiple TypeScript servers + lambdas |
| Languages | TypeScript |
| Communication | HTTP, SQS queues |
| Deployment | AWS (Lambda, ECS), Terraform |
| Repo structure | Monorepo (packages/servers, lambdas, infrastructure) |

---

### Cinema Monorepo Microservices

**Repo:** [github.com/irahardianto/monorepo-microservices](https://github.com/irahardianto/monorepo-microservices)

Four Go microservices in a single repository with MongoDB and Kubernetes deployment manifests. Includes Istio service mesh configuration.

**Relevant to IDPF because:** Small, well-scoped monorepo microservices — the "2-5 services" sweet spot where IDPF's monorepo fit is highest (~80-85%). Each service has clear boundaries, shared deployment config, and the service count is manageable within one charter.

| Characteristic | Detail |
|---|---|
| Services | 4 (movies, showtimes, bookings, users) |
| Languages | Go |
| Communication | HTTP REST |
| Deployment | Kubernetes, Istio |
| Repo structure | Monorepo |

---

## Deployment Tooling

### Quipper Monorepo Deploy Actions

**Repo:** [github.com/quipper/monorepo-deploy-actions](https://github.com/quipper/monorepo-deploy-actions)

GitHub Actions workflows for deploying microservices from a monorepo using Argo CD. Demonstrates the deployment orchestration pattern — detecting which services changed and deploying only those.

**Relevant to IDPF because:** Addresses the "reduced but not eliminated" deployment orchestration gap in the monorepo assessment. IDPF's `/prepare-release` tags the repo; tooling like this handles the per-service selective deployment that follows.

---

## Curated Lists

| List | Focus | Link |
|---|---|---|
| **Awesome Microservices** | Tools, frameworks, platforms, patterns | [github.com/mfornos/awesome-microservices](https://github.com/mfornos/awesome-microservices) |
| **Microservices Project List** | Academic dataset of real migrations to microservices | [github.com/davidetaibi/Microservices_Project_List](https://github.com/davidetaibi/Microservices_Project_List) |
| **Awesome Monorepo** | Monorepo tools, build systems, architectures | [github.com/korfuri/awesome-monorepo](https://github.com/korfuri/awesome-monorepo) |

---

## Patterns for IDPF Evaluation

These repos illustrate three distinct structures, each with a different IDPF fit profile:

| Structure | Example | IDPF Fit | Key Constraint |
|---|---|---|---|
| **Multi-repo** (one repo per service) | Sock Shop | ~60-70% | Cross-repo coordination is manual |
| **Monorepo** (all services, one repo) | Pocket, Cinema | ~80-85% | Per-service release tagging unsupported |
| **Hybrid** (monorepo, independent services) | Online Boutique | ~80-85% | Same as monorepo; services are independent in practice |

The **Sock Shop vs Pocket** comparison is the clearest illustration: same architectural pattern (microservices), different repo strategies, 20+ percentage point difference in IDPF fit. The repo structure matters as much as the architecture.

---

**End of Reference**
