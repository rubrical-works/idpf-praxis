# GameDay: [Theme/Name]
**Version:** v0.61.0
**Date:** YYYY-MM-DD
**Duration:** [X hours]
**Environment:** [Production/Staging]
**Testing Framework:** IDPF-Chaos
**Status:** Planning | Scheduled | In Progress | Completed

## 1. Overview

### 1.1 Purpose
[What is the primary goal of this GameDay? What systems or capabilities are being validated?]

### 1.2 Theme
[Optional: Theme for the GameDay, e.g., "Database Resilience", "Network Failures", "Peak Traffic Simulation"]

### 1.3 Objectives
| # | Objective | Success Criteria |
|---|-----------|------------------|
| 1 | [Validate resilience of system X] | [Measurable outcome] |
| 2 | [Test team response to scenario Y] | [Measurable outcome] |
| 3 | [Verify monitoring and alerting] | [Measurable outcome] |
| 4 | [Practice incident response] | [Measurable outcome] |

## 2. Scope

### 2.1 Systems in Scope
| System | Owner | Environment | Risk Level |
|--------|-------|-------------|------------|
| [Service 1] | [Team/Person] | [Staging/Prod] | [High/Med/Low] |
| [Service 2] | [Team/Person] | [Staging/Prod] | [High/Med/Low] |

### 2.2 Out of Scope
| System | Reason |
|--------|--------|
| [System] | [Why excluded] |

### 2.3 Dependencies
| Dependency | Status | Owner |
|------------|--------|-------|
| [External service] | [Available/Notified] | [Contact] |
| [Database] | [Available] | [DBA] |

## 3. Scenarios

### Scenario Schedule
| # | Time | Scenario | Target System | Duration | Owner | Risk |
|---|------|----------|---------------|----------|-------|------|
| 1 | HH:MM | [Brief description] | [Service] | 15 min | [Name] | Low |
| 2 | HH:MM | [Brief description] | [Service] | 15 min | [Name] | Med |
| 3 | HH:MM | [Brief description] | [Service] | 20 min | [Name] | Med |
| 4 | HH:MM | [Brief description] | [Service] | 15 min | [Name] | High |

### Scenario Details

#### Scenario 1: [Name]
**Time:** HH:MM - HH:MM
**Fault Type:** [e.g., Instance termination]
**Target:** [Specific target]
**Tool:** [Chaos tool]
**Hypothesis:**
```
Given: [steady state]
When: [fault]
Then: [expected behavior]
```
**Abort Conditions:**
- Error rate > [X]%
- Latency p99 > [Y]ms
**Rollback:**
```
[Rollback command]
```

#### Scenario 2: [Name]
**Time:** HH:MM - HH:MM
**Fault Type:** [e.g., Network latency]
**Target:** [Specific target]
**Tool:** [Chaos tool]
**Hypothesis:**
```
Given: [steady state]
When: [fault]
Then: [expected behavior]
```
**Abort Conditions:**
- Error rate > [X]%
- Latency p99 > [Y]ms
**Rollback:**
```
[Rollback command]
```

## 4. Schedule
| Time | Duration | Activity | Lead |
|------|----------|----------|------|
| HH:MM | 15 min | Kickoff & Safety Briefing | GameDay Lead |
| HH:MM | 15 min | Baseline Capture | Observer |
| HH:MM | 15 min | Scenario 1 | Fault Operator |
| HH:MM | 10 min | Break / Analysis | All |
| HH:MM | 15 min | Scenario 2 | Fault Operator |
| HH:MM | 10 min | Break / Analysis | All |
| HH:MM | 20 min | Scenario 3 | Fault Operator |
| HH:MM | 10 min | Break / Analysis | All |
| HH:MM | 15 min | Scenario 4 | Fault Operator |
| HH:MM | 30 min | Debrief & Action Items | GameDay Lead |
| HH:MM | - | Documentation | Scribe |

## 5. Participants

### Core Team
| Role | Name | Contact | Responsibility |
|------|------|---------|----------------|
| GameDay Lead | [Name] | [Slack] | Overall coordination, go/no-go |
| Fault Operator | [Name] | [Slack] | Execute fault injections |
| Observer | [Name] | [Slack] | Monitor all dashboards |
| Scribe | [Name] | [Slack] | Real-time documentation |
| On-Call Engineer | [Name] | [Slack] | Emergency response |

### Stakeholders
| Name | Role | Involvement |
|------|------|-------------|
| [Name] | [Title] | [Observer/Approver] |
| [Name] | [Title] | [Notified] |

### Communication Channels
| Channel | Purpose |
|---------|---------|
| Slack: #[channel] | Primary communication |
| Zoom: [link] | Voice/video if needed |
| [Incident Bridge] | Escalation only |

## 6. Safety Controls

### Global Abort Conditions
**Stop ALL scenarios immediately if:**
- [ ] Any P0/P1 incident declared
- [ ] Customer impact reported
- [ ] Revenue impact detected
- [ ] On-call escalation beyond GameDay team
- [ ] Any participant calls for stop

### Environment Protections
| Protection | Status |
|------------|--------|
| [ ] Production traffic capped/canary only | [Configured/N/A] |
| [ ] Feature flags ready for quick disable | [Configured/N/A] |
| [ ] Database backups verified | [Verified] |
| [ ] Rollback scripts tested | [Tested] |

### Emergency Contacts
| Role | Name | Phone | When to Contact |
|------|------|-------|-----------------|
| Engineering Director | [Name] | [Phone] | Major incident |
| VP Engineering | [Name] | [Phone] | Customer impact |
| On-Call Manager | [Name] | [Phone] | Escalation needed |

## 7. Pre-GameDay Checklist

### 1 Week Before
- [ ] Scenarios documented and reviewed
- [ ] Participants confirmed
- [ ] Stakeholders notified
- [ ] Calendar invites sent
- [ ] Communication plan shared

### 1 Day Before
- [ ] All tools and access verified
- [ ] Dashboards prepared
- [ ] Rollback procedures tested
- [ ] On-call schedule confirmed
- [ ] Final go/no-go decision

### Day Of (Before Start)
- [ ] Systems healthy (baseline)
- [ ] All participants present
- [ ] Communication channels active
- [ ] Recording started (if applicable)
- [ ] Final safety briefing completed

## 8. Results Summary

### Overall Outcome
| Metric | Result |
|--------|--------|
| Scenarios Planned | [X] |
| Scenarios Completed | [X] |
| Scenarios Aborted | [X] |
| Hypotheses Confirmed | [X] |
| Hypotheses Disproved | [X] |
| Findings Identified | [X] |
| Action Items Created | [X] |

### Scenario Results
| # | Scenario | Outcome | Key Finding |
|---|----------|---------|-------------|
| 1 | [Name] | Confirmed/Disproved/Aborted | [Brief finding] |
| 2 | [Name] | Confirmed/Disproved/Aborted | [Brief finding] |
| 3 | [Name] | Confirmed/Disproved/Aborted | [Brief finding] |
| 4 | [Name] | Confirmed/Disproved/Aborted | [Brief finding] |

### Key Metrics During GameDay
| Metric | Baseline | Worst During | Recovery Time |
|--------|----------|--------------|---------------|
| Error Rate | | | |
| Latency p99 | | | |
| Throughput | | | |

## 9. Findings
| # | Finding | Severity | Category | Scenario |
|---|---------|----------|----------|----------|
| 1 | [Description] | Critical/High/Med/Low | [Category] | [#] |
| 2 | [Description] | Critical/High/Med/Low | [Category] | [#] |
| 3 | [Description] | Critical/High/Med/Low | [Category] | [#] |
**Categories:** Resilience Gap | Monitoring Gap | Runbook Gap | Process Gap | Training Gap

## 10. Action Items
| # | Action | Owner | Due Date | Priority | Status | Issue |
|---|--------|-------|----------|----------|--------|-------|
| 1 | [Description] | [Name] | YYYY-MM-DD | P1 | [ ] | [#] |
| 2 | [Description] | [Name] | YYYY-MM-DD | P2 | [ ] | [#] |
| 3 | [Description] | [Name] | YYYY-MM-DD | P2 | [ ] | [#] |

## 11. Retrospective Notes

### What Went Well
- [Point 1]
- [Point 2]

### What Could Be Improved
- [Point 1]
- [Point 2]

### Recommendations for Next GameDay
- [Recommendation 1]
- [Recommendation 2]

## 12. Attachments
| Document | Link |
|----------|------|
| Dashboard Screenshots | [Link] |
| Detailed Scenario Reports | [Link] |
| Video Recording | [Link] |
| Slack Thread Archive | [Link] |

## Revision History
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | YYYY-MM-DD | [Name] | Initial draft |
| 1.1 | YYYY-MM-DD | [Name] | Post-GameDay results |
*Template from IDPF-Chaos Framework*
