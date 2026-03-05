# IDPF-Chaos Framework
**Version:** v0.58.0
**Source:** IDPF-Chaos/IDPF-Chaos.md
**Extends:** IDPF-Testing
**Framework-Debug:** True
## Overview
Framework for chaos engineering experiments. Extends IDPF-Testing with resilience testing, fault injection, and failure scenario validation.
**Core Principle:** Proactively test system resilience by introducing controlled failures to discover weaknesses before production incidents.
## Chaos Engineering Principles
| Principle | Description |
|-----------|-------------|
| **Build a Hypothesis** | Define expected behavior under failure conditions |
| **Vary Real-World Events** | Inject realistic failures that could happen in production |
| **Run in Production** | Test real systems with real traffic (safely) |
| **Automate Experiments** | Enable continuous validation through automation |
| **Minimize Blast Radius** | Start small, limit impact, expand gradually |
## Terminology
| Term | Definition |
|------|------------|
| **Chaos Experiment** | Controlled fault injection with hypothesis and observation |
| **Steady State** | Normal system behavior metrics before fault injection |
| **Blast Radius** | Scope of potential impact from an experiment |
| **Fault Injection** | Deliberate introduction of failures into a system |
| **GameDay** | Scheduled event running multiple chaos scenarios |
| **Hypothesis** | Predicted system behavior when fault is injected |
| **Abort Condition** | Threshold that triggers immediate experiment stop |
| **Rollback** | Process to restore system after experiment |
## Relationship to IDPF-Testing
Inherits: Test development methodology (IDPF-Agile), separate repository pattern, GitHub Project integration, common workflow phases, traceability to application PRD.
## Fault Injection Types
### Infrastructure Faults
| Fault Type | Impact | Tools | Risk Level |
|------------|--------|-------|------------|
| Instance termination | Compute loss | Chaos Monkey, Gremlin, AWS FIS | Medium |
| AZ/Region failure | Multi-instance loss | Gremlin, AWS FIS | High |
| Disk failure | Storage unavailable | Gremlin, dd | Medium |
| Resource exhaustion | Throttling, OOM | stress-ng, Gremlin | Medium |
### Network Faults
| Fault Type | Impact | Tools | Risk Level |
|------------|--------|-------|------------|
| Latency injection | Slow responses | tc, Gremlin, Toxiproxy | Low |
| Packet loss | Unreliable network | tc, Gremlin, Pumba | Medium |
| DNS failure | Service discovery broken | Gremlin, custom | Medium |
| Network partition | Split-brain scenarios | iptables, Gremlin | High |
| Bandwidth throttling | Slow data transfer | tc, Toxiproxy | Low |
### Application Faults
| Fault Type | Impact | Tools | Risk Level |
|------------|--------|-------|------------|
| Memory pressure | OOM conditions | stress-ng, Gremlin | Medium |
| CPU stress | Compute exhaustion | stress-ng, Gremlin | Medium |
| Disk fill | Storage exhaustion | dd, Gremlin | Medium |
| Process kill | Service crash | kill, Gremlin | Medium |
| Thread exhaustion | Deadlock, slowdown | Custom, Gremlin | Medium |
### Dependency Faults
| Fault Type | Impact | Tools | Risk Level |
|------------|--------|-------|------------|
| Service unavailable | Upstream failure | Toxiproxy, Gremlin | Medium |
| Slow dependency | Timeout scenarios | Toxiproxy, Gremlin | Low |
| Database failure | Data layer loss | Gremlin, custom | High |
| Cache eviction | Cache miss storm | Custom scripts | Low |
| Message queue failure | Async processing broken | Gremlin, custom | Medium |
### State Faults
| Fault Type | Impact | Tools | Risk Level |
|------------|--------|-------|------------|
| Data corruption | Invalid state | Custom scripts | High |
| Clock skew | Time-dependent failures | chrony, Gremlin | Medium |
| Certificate expiry | TLS failures | Custom scripts | Medium |
## Tool Ecosystem
### Tool Comparison
| Tool | Platform | Best For | Cost | Complexity |
|------|----------|----------|------|------------|
| **Chaos Monkey** | AWS (Spinnaker) | Instance termination | Free | Low |
| **Gremlin** | Multi-cloud, K8s | Enterprise chaos | Commercial | Low |
| **LitmusChaos** | Kubernetes | K8s native chaos | Free | Medium |
| **Chaos Mesh** | Kubernetes | K8s native chaos | Free | Medium |
| **AWS FIS** | AWS | AWS infrastructure | Pay per use | Low |
| **Toxiproxy** | Any | Network simulation | Free | Low |
| **Pumba** | Docker | Docker chaos | Free | Low |
| **PowerfulSeal** | Kubernetes | K8s pod killing | Free | Medium |
```
Chaos Tool Selection:
│
├─ Running on Kubernetes?
│   ├─ Need extensive experiment library? → LitmusChaos
│   └─ Need fine-grained network control? → Chaos Mesh
│
├─ Need enterprise support & SaaS?
│   └► Gremlin
│
├─ AWS infrastructure only?
│   └► AWS FIS + Chaos Monkey
│
├─ Docker-based (non-K8s)?
│   └► Pumba
│
├─ Network fault simulation needed?
│   └► Toxiproxy
│
└─ General purpose, multi-platform?
    └► Gremlin
```
## Experiment Design
### Hypothesis Template
```
Given: [steady-state system conditions]
When: [fault is injected]
Then: [expected system behavior]
```
**Example:**
```
Given: Order service is processing 1000 orders/minute with p99 < 500ms
When: Primary database replica is terminated
Then: Service fails over to secondary within 30 seconds
      AND no orders are lost
      AND p99 remains < 2000ms during failover
      AND error rate stays below 1%
```
### Steady State Metrics
| Metric Category | Example Metrics |
|-----------------|-----------------|
| **Availability** | Uptime %, successful request rate |
| **Latency** | p50, p95, p99 response times |
| **Throughput** | Requests/second, orders/minute |
| **Error Rate** | Failed requests %, exception rate |
| **Saturation** | CPU %, memory %, queue depth |
### Blast Radius Controls
| Control | Description | Example |
|---------|-------------|---------|
| **Target Scope** | Limit affected instances | 1 of 10 pods |
| **User Impact** | Limit affected users | Canary traffic only |
| **Duration** | Time-bound experiments | Max 10 minutes |
| **Auto-Rollback** | Automatic stop on threshold | Error rate > 5% |
| **Environment** | Start in non-production | Staging first |
### Abort Conditions
Immediately stop experiment if:
- Error rate exceeds threshold (e.g., > 5%)
- Latency exceeds threshold (e.g., p99 > 5s)
- Revenue impact detected
- Customer complaints received
- On-call escalation triggered
- Data loss detected
## Experiment Workflow
```
┌─────────────────┐
│ Define Steady   │
│ State Hypothesis│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Set Up          │
│ Observability   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Design          │
│ Experiment      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Get Approval    │
│ (Pre-flight)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Run Experiment  │◄────────┐
│ (Limited Scope) │         │
└────────┬────────┘         │
         │                  │
         ▼                  │
┌─────────────────┐         │
│ Analyze Results │         │
└────────┬────────┘         │
         │                  │
    ┌────┴────┐             │
    │Hypothesis│            │
    │ Valid?   │            │
    └────┬────┘             │
         │                  │
    Yes  │  No              │
    ┌────┴────┐             │
    │         │             │
    ▼         ▼             │
┌───────┐  ┌───────┐        │
│Expand │  │Fix    │        │
│Scope  │  │System │────────┘
└───────┘  └───────┘
```
## Directory Structure
```
<chaos-engineering-repo>/
├── PRD/
│   ├── README.md
│   ├── Templates/
│   │   ├── Chaos-Experiment-Plan.md
│   │   └── GameDay-Template.md
│   └── TestPlans/
│       ├── TP-Database-Failover.md
│       └── TP-Network-Partition.md
├── experiments/
│   ├── infrastructure/
│   │   ├── instance-termination.yaml
│   │   └── az-failure.yaml
│   ├── network/
│   │   ├── latency-injection.yaml
│   │   └── packet-loss.yaml
│   ├── application/
│   │   ├── memory-pressure.yaml
│   │   └── cpu-stress.yaml
│   └── dependency/
│       ├── service-unavailable.yaml
│       └── slow-dependency.yaml
├── gamedays/
│   ├── YYYY-QN-GameDay/
│   │   ├── runbook.md
│   │   ├── results.md
│   │   └── action-items.md
│   └── templates/
├── dashboards/
│   └── chaos-observability.json
├── scripts/
│   ├── rollback/
│   └── validation/
├── .github/
│   └── workflows/
│       └── chaos-experiment.yml
└── README.md
```
## GameDay Planning
A GameDay is a scheduled event where teams run multiple chaos experiments to validate resilience, practice incident response, and build confidence.
### GameDay Structure
| Phase | Duration | Activities |
|-------|----------|------------|
| **Kickoff** | 15 min | Objectives review, safety briefing |
| **Experiments** | 2-4 hours | Run planned scenarios |
| **Debrief** | 30 min | Discuss findings, action items |
| **Documentation** | 1 hour | Write up results |
### GameDay Roles
| Role | Responsibility |
|------|----------------|
| **GameDay Lead** | Overall coordination, go/no-go decisions |
| **Fault Operator** | Execute fault injections |
| **Observer** | Monitor metrics, logs, traces |
| **Scribe** | Document observations in real-time |
| **On-Call** | Emergency response if needed |
### GameDay Frequency
| Maturity Level | Frequency | Scope |
|----------------|-----------|-------|
| Beginning | Quarterly | Staging only |
| Intermediate | Monthly | Staging + limited production |
| Advanced | Weekly/Continuous | Full production |
## Observability Integration
| Type | Purpose | Tools |
|------|---------|-------|
| **Metrics** | Quantitative impact measurement | Prometheus, Datadog, CloudWatch |
| **Logs** | Error details, stack traces | ELK, Splunk, CloudWatch Logs |
| **Traces** | Request flow during failure | Jaeger, Zipkin, X-Ray |
| **Dashboards** | Real-time visualization | Grafana, Datadog, CloudWatch |
| **Alerts** | Abort condition triggers | PagerDuty, OpsGenie |
### Pre-Experiment Checklist
- [ ] Dashboards open and visible
- [ ] Alert thresholds configured
- [ ] Log queries prepared
- [ ] Trace sampling increased
- [ ] Baseline metrics captured
## Safety Practices
### Progressive Complexity
| Stage | Scope | Environment | Approval |
|-------|-------|-------------|----------|
| 1 | Single instance | Development | Self |
| 2 | Single instance | Staging | Team lead |
| 3 | Multiple instances | Staging | Engineering manager |
| 4 | Single instance | Production (canary) | SRE lead |
| 5 | Multiple instances | Production | VP Engineering |
### Communication Template
**Pre-Experiment:**
```
CHAOS EXPERIMENT STARTING
Service: [service-name]
Environment: [staging/production]
Fault: [description]
Duration: [X minutes]
Owner: @[name]
Dashboard: [link]
```
**Post-Experiment:**
```
CHAOS EXPERIMENT COMPLETED
Service: [service-name]
Result: [Hypothesis confirmed/disproved]
Findings: [summary]
Action Items: [count]
Full Report: [link]
```
## GitHub Project Labels
| Label | Color | Hex | Description |
|-------|-------|-----|-------------|
| `chaos` | Purple | `#6554C0` | Chaos work (from Core) |
| `experiment` | Green | `#0E8A16` | Chaos experiment |
| `gameday` | Red | `#D93F0B` | GameDay related |
| `infrastructure-fault` | Blue | `#0052CC` | Infrastructure failure |
| `network-fault` | Light Blue | `#1D76DB` | Network failure |
| `dependency-fault` | Purple | `#5319E7` | Dependency failure |
| `finding` | Yellow | `#FBCA04` | Resilience finding |
| `rollback` | Orange | `#FF991F` | Rollback procedure |
## Session Commands
### Chaos Commands
- **Chaos-Start** - Begin chaos engineering session
- **Chaos-Status** - Show experiment status
- **Design-Experiment** - Create new experiment plan
- **Plan-GameDay** - Plan a GameDay event
- **Run-Experiment** - Execute a chaos experiment
- **Abort-Experiment** - Emergency stop experiment
- **Chaos-Report** - Generate experiment results report
### Standard Commands
All IDPF-Testing and IDPF-Agile commands apply.
## Integration Points
- **Extends:** IDPF-Testing
- **Test Methodology:** IDPF-Agile for experiment development
- **References:** Application PRD for resilience requirements
- **Observability:** Prometheus, Grafana, Datadog, ELK
- **Incident Management:** PagerDuty, OpsGenie, Slack
- **CI/CD:** GitHub Actions for automated experiments
## Best Practices
### Do
- Start with a clear hypothesis
- Define abort conditions before running
- Notify stakeholders before experiments
- Run in staging before production
- Document all findings
- Fix issues before expanding scope
- Automate repeatable experiments
- Practice rollback procedures
### Don't
- Run experiments without monitoring
- Skip the hypothesis step
- Ignore abort conditions
- Run in production without approval
- Expand scope after failed experiments
- Keep findings to yourself
- Blame individuals for discoveries
- Disable safety controls
## Maturity Model
| Level | Characteristics |
|-------|-----------------|
| **Level 1: Initial** | Manual experiments, staging only, reactive |
| **Level 2: Managed** | Documented experiments, some production, planned |
| **Level 3: Defined** | Standard processes, regular GameDays, metrics tracked |
| **Level 4: Measured** | Automated experiments, continuous production, SLO-driven |
| **Level 5: Optimized** | Fully automated, proactive discovery, industry leadership |
---
**End of Framework**
