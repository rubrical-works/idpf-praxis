# IDPF-Chaos Framework
**Version:** v0.65.0
**Type:** Domain
## Overview
Domain for chaos engineering experiments: resilience testing, fault injection, failure scenario validation.
**Core Principle:** Proactively test system resilience by introducing controlled failures to discover weaknesses before production incidents.
## Chaos Engineering Principles
| Principle | Description |
|-----------|-------------|
| Build a Hypothesis | Define expected behavior under failure |
| Vary Real-World Events | Inject realistic failures |
| Run in Production | Test real systems safely |
| Automate Experiments | Enable continuous validation |
| Minimize Blast Radius | Start small, expand gradually |
## Terminology
| Term | Definition |
|------|------------|
| Chaos Experiment | Controlled fault injection with hypothesis and observation |
| Steady State | Normal system behavior metrics before injection |
| Blast Radius | Scope of potential impact |
| GameDay | Scheduled event running multiple chaos scenarios |
| Abort Condition | Threshold triggering immediate experiment stop |
## Fault Injection Types
### Infrastructure Faults
| Fault Type | Impact | Tools | Risk |
|------------|--------|-------|------|
| Instance termination | Compute loss | Chaos Monkey, Gremlin, AWS FIS | Medium |
| AZ/Region failure | Multi-instance loss | Gremlin, AWS FIS | High |
| Disk failure | Storage unavailable | Gremlin, dd | Medium |
| Resource exhaustion | Throttling, OOM | stress-ng, Gremlin | Medium |
### Network Faults
| Fault Type | Impact | Tools | Risk |
|------------|--------|-------|------|
| Latency injection | Slow responses | tc, Gremlin, Toxiproxy | Low |
| Packet loss | Unreliable network | tc, Gremlin, Pumba | Medium |
| DNS failure | Service discovery broken | Gremlin, custom | Medium |
| Network partition | Split-brain | iptables, Gremlin | High |
| Bandwidth throttling | Slow transfer | tc, Toxiproxy | Low |
### Application Faults
| Fault Type | Impact | Tools | Risk |
|------------|--------|-------|------|
| Memory pressure | OOM conditions | stress-ng, Gremlin | Medium |
| CPU stress | Compute exhaustion | stress-ng, Gremlin | Medium |
| Disk fill | Storage exhaustion | dd, Gremlin | Medium |
| Process kill | Service crash | kill, Gremlin | Medium |
| Thread exhaustion | Deadlock, slowdown | Custom, Gremlin | Medium |
### Dependency Faults
| Fault Type | Impact | Tools | Risk |
|------------|--------|-------|------|
| Service unavailable | Upstream failure | Toxiproxy, Gremlin | Medium |
| Slow dependency | Timeout scenarios | Toxiproxy, Gremlin | Low |
| Database failure | Data layer loss | Gremlin, custom | High |
| Cache eviction | Cache miss storm | Custom scripts | Low |
| Message queue failure | Async broken | Gremlin, custom | Medium |
### State Faults
| Fault Type | Impact | Tools | Risk |
|------------|--------|-------|------|
| Data corruption | Invalid state | Custom scripts | High |
| Clock skew | Time-dependent failures | chrony, Gremlin | Medium |
| Certificate expiry | TLS failures | Custom scripts | Medium |
## Tool Ecosystem
| Tool | Platform | Best For | Cost |
|------|----------|----------|------|
| Chaos Monkey | AWS (Spinnaker) | Instance termination | Free |
| Gremlin | Multi-cloud, K8s | Enterprise chaos | Commercial |
| LitmusChaos | Kubernetes | K8s native chaos | Free |
| Chaos Mesh | Kubernetes | K8s native chaos | Free |
| AWS FIS | AWS | AWS infrastructure | Pay per use |
| Toxiproxy | Any | Network simulation | Free |
| Pumba | Docker | Docker chaos | Free |
## Experiment Design
### Hypothesis Template
```
Given: [steady-state conditions]
When: [fault is injected]
Then: [expected behavior]
```
### Steady State Metrics
| Category | Examples |
|----------|---------|
| Availability | Uptime %, successful request rate |
| Latency | p50, p95, p99 response times |
| Throughput | Requests/second, orders/minute |
| Error Rate | Failed requests %, exception rate |
| Saturation | CPU %, memory %, queue depth |
### Blast Radius Controls
| Control | Description | Example |
|---------|-------------|---------|
| Target Scope | Limit affected instances | 1 of 10 pods |
| User Impact | Limit affected users | Canary traffic only |
| Duration | Time-bound experiments | Max 10 minutes |
| Auto-Rollback | Automatic stop on threshold | Error rate > 5% |
| Environment | Start in non-production | Staging first |
### Abort Conditions
Immediately stop if: error rate exceeds threshold, latency exceeds threshold, revenue impact detected, customer complaints received, on-call escalation triggered, data loss detected.
## GameDay Planning
| Phase | Duration | Activities |
|-------|----------|------------|
| Kickoff | 15 min | Objectives review, safety briefing |
| Experiments | 2-4 hours | Run planned scenarios |
| Debrief | 30 min | Discuss findings, action items |
| Documentation | 1 hour | Write up results |
### Roles
| Role | Responsibility |
|------|----------------|
| GameDay Lead | Coordination, go/no-go decisions |
| Fault Operator | Execute fault injections |
| Observer | Monitor metrics, logs, traces |
| Scribe | Document observations |
| On-Call | Emergency response |
### Frequency by Maturity
| Level | Frequency | Scope |
|-------|-----------|-------|
| Beginning | Quarterly | Staging only |
| Intermediate | Monthly | Staging + limited production |
| Advanced | Weekly/Continuous | Full production |
## Safety Practices
### Progressive Complexity
| Stage | Scope | Environment | Approval |
|-------|-------|-------------|----------|
| 1 | Single instance | Development | Self |
| 2 | Single instance | Staging | Team lead |
| 3 | Multiple instances | Staging | Engineering manager |
| 4 | Single instance | Production (canary) | SRE lead |
| 5 | Multiple instances | Production | VP Engineering |
## Observability Integration
| Type | Purpose | Tools |
|------|---------|-------|
| Metrics | Quantitative impact | Prometheus, Datadog, CloudWatch |
| Logs | Error details | ELK, Splunk, CloudWatch Logs |
| Traces | Request flow during failure | Jaeger, Zipkin, X-Ray |
| Dashboards | Real-time visualization | Grafana, Datadog |
| Alerts | Abort condition triggers | PagerDuty, OpsGenie |
### Pre-Experiment Checklist
- [ ] Dashboards open and visible
- [ ] Alert thresholds configured
- [ ] Log queries prepared
- [ ] Trace sampling increased
- [ ] Baseline metrics captured
## Maturity Model
| Level | Characteristics |
|-------|-----------------|
| Level 1: Initial | Manual experiments, staging only, reactive |
| Level 2: Managed | Documented experiments, some production, planned |
| Level 3: Defined | Standard processes, regular GameDays, metrics tracked |
| Level 4: Measured | Automated experiments, continuous production, SLO-driven |
| Level 5: Optimized | Fully automated, proactive discovery |
**End of Framework**
