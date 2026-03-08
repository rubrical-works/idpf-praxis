# Chaos Engineering Review Criteria
**Source:** Extracted from IDPF-Chaos framework
**Domain:** Resilience testing, fault injection, failure-mode validation

## Proposal Review Questions
- Does the proposal identify failure modes that could affect system resilience?
- Are steady-state metrics defined for measuring normal behavior before fault injection?
- Does the proposal include blast radius controls (target scope, duration limits, auto-rollback)?
- Are abort conditions specified for experiment safety (error rate thresholds, latency limits)?
- Does the proposal follow the progressive complexity model (dev → staging → production)?

## PRD Review Questions
- Do user stories include resilience requirements with specific fault tolerance targets?
- Are chaos experiment hypotheses defined in Given/When/Then format?
- Does the test plan include fault injection types (infrastructure, network, application, dependency)?
- Are GameDay activities planned for validating system resilience at scale?
- Does the PRD specify observability requirements (metrics, logs, traces, dashboards)?
- Are rollback procedures documented for each experiment category?

## Issue Review Questions
- Does the issue define a clear hypothesis for the expected system behavior under failure?
- Are blast radius controls specified (affected instances, user impact, duration)?
- Does the issue identify the fault injection type and appropriate tooling (Gremlin, Toxiproxy, AWS FIS)?
- Are abort conditions defined with specific thresholds (e.g., error rate > 5%)?
- Is the pre-experiment checklist addressed (dashboards, alerts, baseline metrics)?
- Does the issue specify the maturity level and required approval (staging vs. production)?
