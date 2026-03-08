# Performance Review Criteria
**Source:** Extracted from IDPF-Performance framework
**Domain:** Load testing, stress testing, thresholds, capacity planning

## Proposal Review Questions
- Does the proposal identify performance-critical paths (APIs, database queries, user flows)?
- Are response time targets specified with percentile thresholds (p95 < 500ms, p99 < 1000ms)?
- Does the proposal define expected load profiles (concurrent users, requests per second)?
- Are performance test types identified (load, stress, endurance, spike) for the affected area?
- Does the proposal consider capacity planning and scalability implications?

## PRD Review Questions
- Do user stories include non-functional requirements for response time and throughput?
- Are SLAs/SLOs defined with measurable thresholds (error rate < 0.1%, Apdex > 0.9)?
- Does the test plan specify load profiles with ramp-up patterns and steady-state durations?
- Are CI/CD performance gates defined (fail on threshold breach)?
- Does the PRD include baseline measurement requirements for before/after comparison?
- Are monitoring integration points specified (APM, Prometheus, Grafana dashboards)?

## Issue Review Questions
- Does the issue define measurable performance acceptance criteria with specific thresholds?
- Are the test data requirements specified (CSV files, dynamic generation, shared arrays)?
- Does the issue identify which performance test type applies (load, stress, soak, spike)?
- Is the testing environment specified (staging vs. production-like)?
- Are tool requirements identified (k6, JMeter, Gatling, Locust)?
