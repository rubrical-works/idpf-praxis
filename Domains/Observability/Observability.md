# Observability Domain
**Version:** v0.64.0
**Type:** Domain
**Companion Skill:** observability-setup
## Overview
Evaluative criteria for logging, tracing, metrics, and alerting across project artifacts. Surfaces operational visibility requirements during reviews.
**Core Principle:** Observability is the ability to understand a system's internal state from its external outputs. Structured logging, distributed tracing, and metrics should be architectural decisions, not afterthoughts.
## Domain Scope
| Concern | Description |
|---------|-------------|
| Structured Logging | JSON logs, correlation IDs, log levels, PII redaction |
| Distributed Tracing | Trace context propagation, span instrumentation, sampling |
| Metrics Collection | RED metrics (Rate, Errors, Duration), custom business metrics, histograms |
| SLO/SLI Definitions | Service-level objectives, indicators, error budgets, burn rate alerts |
| Alerting Strategy | Alert routing, severity classification, runbook links, noise reduction |
| Dashboard Design | Operational, business, and on-call views |
## When This Domain Applies
- Building distributed systems or microservices
- Adding HTTP endpoints serving production traffic
- Implementing background job processing or queue consumers
- Integrating with external APIs
- Establishing SLOs for service reliability
## Tool Ecosystem
| Tool | Purpose |
|------|---------|
| OpenTelemetry | Vendor-neutral instrumentation SDK |
| Grafana | Dashboard and visualization |
| Prometheus | Metrics collection and querying |
| Datadog | Full-stack observability platform |
| ELK | Log aggregation and search |
| Jaeger / Zipkin | Distributed trace visualization |
**End of Observability Domain**
