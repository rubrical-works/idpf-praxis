# Observability Review Criteria
**Domain:** Structured logging, distributed tracing, metrics, alerting, SLOs
**Companion Skill:** observability-setup
## Charter Review Questions
- Does the project serve production traffic that requires operational visibility?
- Is an observability stack defined (logging, metrics, tracing providers)?
- Are SLOs or reliability targets established for the service?
- Does the tech stack support OpenTelemetry or equivalent instrumentation?
## Proposal Review Questions
- Does the proposal define observability requirements for new components?
- Are logging, tracing, and metrics concerns addressed for new endpoints or services?
- Does the proposal consider alerting impact (new alert rules, modified thresholds)?
- Are SLO implications identified for changes to critical paths?
- Does the proposal address correlation ID propagation for distributed calls?
## PRD Review Questions
- Do user stories include observability acceptance criteria for production-facing features?
- Are SLO targets defined with measurable indicators (latency p99, error rate, availability)?
- Does the PRD specify structured logging requirements for audit or debugging?
- Are dashboard requirements included for operational visibility?
- Does the test plan include validation of metrics emission and log output?
## Issue Review Questions
- Does this endpoint emit latency, error rate, and throughput metrics?
- Are structured log entries defined with appropriate log levels and correlation IDs?
- Does the implementation propagate trace context across service boundaries?
- Are error paths instrumented with logging that includes stack traces and context?
- Does the feature include alerting rules for failure conditions?
- Are sensitive fields (PII, credentials) redacted from log output?
## Code Review Questions
- Does the code emit structured logs (JSON format) with consistent field names?
- Are HTTP handlers instrumented with request duration, status code, and method metrics?
- Does the code propagate trace context headers (traceparent, tracestate) in outbound calls?
- Are error responses logged with sufficient context for debugging (request ID, user context, input)?
- Does the code use appropriate log levels (ERROR for failures, WARN for degradation, INFO for state changes)?
- Are metrics using correct types (counters for totals, histograms for latency, gauges for current state)?
- Are PII fields excluded or redacted from structured log output?
