# Chaos Experiment Plan: [Experiment Name]
**Version:** v0.66.4

**Date:** YYYY-MM-DD
**Author:** [Name]
**Testing Framework:** IDPF-Chaos
**Status:** Draft | Approved | Executing | Completed

## 1. Overview

### 1.1 Purpose
[What resilience characteristic is being validated? What failure scenario are we testing?]

### 1.2 Target System

| Field | Value |
|-------|-------|
| Service/Application | [Name] |
| Repository | [URL] |
| Environment | [Staging/Production] |
| Architecture Diagram | [Link] |

### 1.3 Business Justification
[Why is this experiment important? What incident, near-miss, or risk is it addressing?]

### 1.4 PRD Reference

| Field | Value |
|-------|-------|
| Application PRD | [Link to PRD] |
| NFR Reference | [Specific NFR being validated] |
| SLO Reference | [Related SLO if applicable] |

## 2. Hypothesis

### 2.1 Steady State Definition

| Metric | Expected Value | Source | Dashboard |
|--------|----------------|--------|-----------|
| Request success rate | > 99.9% | Prometheus | [Link] |
| p99 latency | < 500ms | Datadog | [Link] |
| Throughput | > 1000 req/s | Application metrics | [Link] |
| Error rate | < 0.1% | Logs | [Link] |

### 2.2 Hypothesis Statement

```
Given: [steady-state conditions - be specific with metrics]

When: [fault injection description - what exactly will happen]

Then: [expected system behavior - measurable outcomes]
```

**Example:**
```
Given: Order service is processing 1000 orders/minute with p99 < 500ms
       and error rate < 0.1%

When: Primary database replica is terminated

Then: - Service detects failure within 10 seconds
      - Automatic failover to secondary completes within 30 seconds
      - No orders are lost (0 data loss)
      - p99 remains < 2000ms during failover
      - Error rate stays below 1% during failover
      - Full recovery to normal p99 < 500ms within 2 minutes
```

### 2.3 Expected Outcomes

- [ ] System detects failure within [X] seconds
- [ ] Automatic failover/recovery occurs within [Y] seconds
- [ ] No data loss
- [ ] User impact limited to [description]
- [ ] Alerts fire correctly
- [ ] Runbooks are accurate

## 3. Experiment Design

### 3.1 Fault Injection

| Parameter | Value |
|-----------|-------|
| Fault Type | [e.g., Instance termination, Latency injection] |
| Fault Category | [Infrastructure / Network / Application / Dependency] |
| Target | [e.g., order-service pod, database replica] |
| Scope | [e.g., 1 of 3 replicas, 10% of traffic] |
| Duration | [e.g., 5 minutes] |
| Tool | [e.g., LitmusChaos, Gremlin, AWS FIS] |

### 3.2 Fault Configuration

```yaml
# Tool-specific configuration (example for LitmusChaos)
apiVersion: litmuschaos.io/v1alpha1
kind: ChaosEngine
metadata:
  name: [experiment-name]
spec:
  # Configuration details
```

### 3.3 Blast Radius Controls

| Control | Setting | Rationale |
|---------|---------|-----------|
| Target Scope | [e.g., Single pod] | [Why this scope] |
| Affected Users | [e.g., < 1%] | [How limited] |
| Duration Limit | [e.g., Max 10 minutes] | [Time boundary] |
| Auto-Rollback | [e.g., Error rate > 5%] | [Threshold] |

### 3.4 Abort Conditions

**Immediately stop experiment if ANY of these occur:**

| Condition | Threshold | Action |
|-----------|-----------|--------|
| Error rate | > [X]% | Abort |
| Latency p99 | > [Y]ms | Abort |
| Revenue impact | Any detected | Abort |
| Customer complaints | Any received | Abort |
| On-call escalation | Triggered | Abort |
| Data integrity | Any concern | Abort |

## 4. Observability

### 4.1 Metrics to Monitor

| Metric | Dashboard Link | Normal Range | Alert Threshold |
|--------|----------------|--------------|-----------------|
| Request rate | [Link] | [Range] | N/A |
| Error rate | [Link] | < 0.1% | > 1% |
| Latency p50 | [Link] | < 100ms | > 500ms |
| Latency p99 | [Link] | < 500ms | > 2000ms |
| CPU utilization | [Link] | < 60% | > 90% |
| Memory utilization | [Link] | < 70% | > 90% |
| [Custom metric] | [Link] | [Range] | [Threshold] |

### 4.2 Logs to Watch

| Log Source | Query/Filter | Looking For |
|------------|--------------|-------------|
| Application logs | `level:error service:[name]` | Error spikes |
| System logs | `OOM\|Killed\|terminated` | System failures |
| Database logs | `failover\|connection` | DB events |

### 4.3 Traces

- [ ] Distributed tracing enabled
- [ ] Trace sampling increased for experiment window
- [ ] Key transaction traces bookmarked

### 4.4 Baseline Capture

**Capture before experiment:**
- [ ] Screenshot of steady-state dashboards
- [ ] Note current metric values
- [ ] Record timestamp of baseline

## 5. Execution Plan

### 5.1 Pre-Experiment Checklist

**Stakeholder Communication:**
- [ ] Team notified in [channel]
- [ ] On-call engineer aware and standing by
- [ ] Manager/lead approved (if production)
- [ ] Related teams notified (if cross-service)

**Technical Readiness:**
- [ ] Rollback procedure tested
- [ ] Observability dashboards open
- [ ] Log queries prepared
- [ ] Alert thresholds verified

**Communication:**
- [ ] Communication channel ready (Slack: #[channel])
- [ ] Incident bridge ready (if production)
- [ ] Status page ready (if customer-facing)

### 5.2 Execution Steps

| Step | Time | Action | Owner | Verification |
|------|------|--------|-------|--------------|
| 1 | T-5m | Verify steady state | [Name] | Metrics nominal |
| 2 | T-2m | Announce experiment start | [Name] | Team acknowledged |
| 3 | T-1m | Start recording | [Name] | Recording active |
| 4 | T+0 | **Inject fault** | [Name] | Fault confirmed |
| 5 | T+0 → End | Monitor metrics | [Name] | Dashboards watched |
| 6 | Ongoing | Record observations | [Name] | Notes taken |
| 7 | T+[duration] | End experiment (or auto-end) | [Name] | Fault removed |
| 8 | T+[duration]+1m | Verify recovery | [Name] | Steady state restored |
| 9 | T+[duration]+5m | Announce experiment end | [Name] | Team notified |

### 5.3 Rollback Procedure

**Step-by-step rollback:**
```bash
# Step 1: Stop fault injection
[command to stop fault]

# Step 2: Verify fault stopped
[command to verify]

# Step 3: Restore service (if needed)
[restoration commands]

# Step 4: Verify recovery
[verification commands]
```

**Emergency contacts:**
- Primary: [Name] - [Phone/Slack]
- Secondary: [Name] - [Phone/Slack]
- Escalation: [Name] - [Phone/Slack]

## 6. Schedule

| Activity | Date | Time (Timezone) | Duration |
|----------|------|-----------------|----------|
| Pre-flight review | YYYY-MM-DD | HH:MM [TZ] | 30 min |
| Experiment execution | YYYY-MM-DD | HH:MM [TZ] | [X] min |
| Analysis | YYYY-MM-DD | HH:MM [TZ] | 1 hour |
| Readout/Debrief | YYYY-MM-DD | HH:MM [TZ] | 30 min |

**Timing Considerations:**
- [ ] Low traffic period selected (if applicable)
- [ ] Avoiding major releases or changes
- [ ] No conflicting maintenance windows
- [ ] On-call rotation considered

## 7. Participants

| Role | Name | Contact | Responsibility |
|------|------|---------|----------------|
| Experiment Lead | [Name] | [Slack/Phone] | Overall coordination |
| Fault Operator | [Name] | [Slack/Phone] | Inject/stop faults |
| Observer | [Name] | [Slack/Phone] | Monitor metrics/logs |
| Scribe | [Name] | [Slack/Phone] | Document observations |
| On-Call Engineer | [Name] | [Slack/Phone] | Emergency response |
| Stakeholder | [Name] | [Slack/Phone] | Go/No-go decision |

## 8. Results (Post-Experiment)

### 8.1 Hypothesis Outcome

- [ ] **Confirmed** - System behaved as expected
- [ ] **Disproved** - Unexpected behavior observed
- [ ] **Partially Confirmed** - Some aspects worked, others didn't
- [ ] **Inconclusive** - Need more data or repeat experiment

### 8.2 Timeline of Observations

| Time (T+) | Observation | Screenshot/Link |
|-----------|-------------|-----------------|
| T+0s | Fault injected | [Link] |
| T+Xs | [First impact observed] | [Link] |
| T+Ys | [Recovery action started] | [Link] |
| T+Zs | [Steady state restored] | [Link] |

### 8.3 Metrics Summary

| Metric | Before | During (Peak) | After | Target | Pass/Fail |
|--------|--------|---------------|-------|--------|-----------|
| Error rate | | | | | |
| Latency p99 | | | | | |
| Throughput | | | | | |
| [Custom] | | | | | |

### 8.4 Findings

| # | Finding | Severity | Category | Action Required |
|---|---------|----------|----------|-----------------|
| 1 | [Description] | Critical/High/Medium/Low | [Category] | [Yes/No] |
| 2 | [Description] | Critical/High/Medium/Low | [Category] | [Yes/No] |

**Finding Categories:** Resilience Gap | Monitoring Gap | Runbook Gap | Documentation Gap | Process Gap

## 9. Action Items

| # | Action | Owner | Due Date | Priority | Status | Issue Link |
|---|--------|-------|----------|----------|--------|------------|
| 1 | [Action description] | [Name] | YYYY-MM-DD | P1/P2/P3 | [ ] | [#issue] |
| 2 | [Action description] | [Name] | YYYY-MM-DD | P1/P2/P3 | [ ] | [#issue] |

## 10. Approval

### Pre-Experiment Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Experiment Lead | | | [ ] Ready |
| Service Owner | | | [ ] Approved |
| On-Call Manager | | | [ ] Approved |
| SRE Lead (if prod) | | | [ ] Approved |

### Post-Experiment Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Experiment Lead | | | [ ] Results verified |
| Action items created | | | [ ] Confirmed |

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | YYYY-MM-DD | [Name] | Initial draft |

*Template from IDPF-Chaos Framework*
