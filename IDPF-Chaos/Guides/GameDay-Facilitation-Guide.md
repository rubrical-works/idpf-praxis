# GameDay Facilitation Guide
**Version:** v0.50.0

**Framework:** IDPF-Chaos

---

## Overview

A GameDay is a structured chaos engineering exercise that tests system resilience under controlled conditions. This guide covers planning, facilitation, and follow-up for effective GameDays.

---

## What is a GameDay?

| Aspect | Description |
|--------|-------------|
| **Purpose** | Validate system resilience and team response |
| **Duration** | 2-4 hours typically |
| **Participants** | Engineering, SRE, on-call responders |
| **Environment** | Production or production-like staging |
| **Outcome** | Identified weaknesses and action items |

---

## GameDay Types

```
┌─────────────────────────────────────────────────────────────────┐
│                       GAMEDAY TYPES                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  TABLETOP                                                       │
│  ├── Discussion-based                                           │
│  ├── No actual injection                                        │
│  └── Good for initial planning                                  │
│                                                                 │
│  STAGED                                                         │
│  ├── Controlled injection                                       │
│  ├── Known scenarios                                            │
│  └── Team practices response                                    │
│                                                                 │
│  BLIND                                                          │
│  ├── Unknown scenarios                                          │
│  ├── Tests real response                                        │
│  └── Most realistic but risky                                   │
│                                                                 │
│  RED TEAM                                                       │
│  ├── Adversarial approach                                       │
│  ├── Security + reliability                                     │
│  └── Tests detection capabilities                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Planning Phase (2-4 Weeks Before)

### Stakeholder Alignment

```markdown
## GameDay Proposal

### Overview
- **Date/Time:** [Proposed date, business hours]
- **Duration:** [2-4 hours]
- **Environment:** [Production/Staging]
- **Scope:** [Services/systems involved]

### Objectives
1. Validate [specific resilience capability]
2. Test [team response to scenario X]
3. Measure [recovery time, detection speed]

### Scenarios (High-Level)
- Scenario 1: [Database failover]
- Scenario 2: [Service dependency failure]
- Scenario 3: [Network partition]

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Customer impact | Low | Medium | Staged rollout, immediate abort |
| Data loss | Very Low | High | Read-only experiments first |
| Extended outage | Low | High | Pre-tested rollback procedures |

### Required Approvals
- [ ] Engineering Lead
- [ ] SRE/Platform Lead
- [ ] Product Owner (if production)
- [ ] Security (if applicable)

### Success Criteria
- All scenarios executed without unplanned customer impact
- Mean time to detect < [X minutes]
- Mean time to recover < [Y minutes]
- Documented learnings and action items
```

### Scenario Design

```markdown
## Scenario: Database Primary Failover

### Hypothesis
"When the primary database becomes unavailable, the application will failover
to the replica within 30 seconds with no more than 5% error rate spike."

### Injection
- **Type:** Kill database primary instance
- **Tool:** Chaos Mesh / AWS FIS / Manual
- **Duration:** Until failover complete (max 5 minutes)
- **Blast Radius:** Database cluster only

### Expected Behavior
1. Health checks detect primary down (< 10s)
2. Connection pool reconnects to replica (< 20s)
3. Application returns to normal (< 30s total)
4. Alerts fire and notify on-call

### Abort Criteria
- Error rate > 20% for 60 seconds
- Total outage (0 successful requests) for 30 seconds
- Any sign of data corruption

### Rollback Procedure
1. Restore original primary (if possible)
2. Manually point to replica
3. Scale up application if connection issues

### Observability Checkpoints
- [ ] Database connection metrics visible
- [ ] Failover event logged
- [ ] Alert triggered
- [ ] Recovery time measurable

### Owner
[Name] - responsible for injection and monitoring
```

### Participant Preparation

```markdown
## GameDay Participant Guide

### Before the GameDay

**All Participants:**
- [ ] Review system architecture diagram
- [ ] Understand your role (observer/responder/facilitator)
- [ ] Know the abort signal
- [ ] Have access to dashboards and communication channels
- [ ] Clear your calendar for the full duration

**Responders:**
- [ ] Review runbooks for relevant scenarios
- [ ] Ensure access to production systems
- [ ] Test communication tools (Slack, Zoom, etc.)
- [ ] Know escalation paths

**Observers:**
- [ ] Prepare observation template
- [ ] Focus area assigned
- [ ] Note-taking setup ready

### During the GameDay

- Stay in the communication channel
- Follow the facilitator's lead
- Call out issues immediately
- Document everything you observe
- Respect the abort signal

### Abort Signal

If anyone says "ABORT" or "STOP":
1. All injection stops immediately
2. Begin rollback procedures
3. Wait for facilitator to assess
```

---

## Facilitation Phase

### Facilitator Checklist

```markdown
## GameDay Facilitator Checklist

### 1 Hour Before
- [ ] Confirm all participants available
- [ ] Verify observability dashboards working
- [ ] Test communication channels
- [ ] Confirm rollback scripts accessible
- [ ] Baseline metrics captured
- [ ] Customer support notified (if production)

### At Start
- [ ] Welcome and introductions (5 min)
- [ ] Review objectives and ground rules (10 min)
- [ ] Confirm everyone has required access (5 min)
- [ ] Review abort criteria and signal (5 min)
- [ ] Questions and clarifications (5 min)

### During Each Scenario
- [ ] Announce scenario start
- [ ] Start timer
- [ ] Monitor abort criteria
- [ ] Note key observations
- [ ] Announce scenario end
- [ ] Brief cool-down period (5-10 min)

### At End
- [ ] Confirm all systems stable
- [ ] Quick hot take from participants
- [ ] Schedule retrospective
- [ ] Thank participants
```

### Running Script

```markdown
## GameDay Running Script

### Opening (15 minutes)

"Welcome to GameDay [Name]. Today we're testing [objective].

Ground rules:
1. Anyone can call ABORT at any time
2. Stay in the Slack channel throughout
3. Observers: document, don't intervene
4. Responders: respond as you would to a real incident
5. No blame - we're learning together

Abort criteria for all scenarios:
- Error rate > 25%
- P95 latency > 10 seconds
- Any sign of data corruption
- Customer complaints

Any questions before we begin?"

### Scenario Introduction (Per Scenario)

"Scenario [N]: [Name]

Our hypothesis: [State hypothesis]

We will inject: [Describe injection]

Expected behavior: [What should happen]

I'm starting the injection in 30 seconds. Responders, treat this as a real incident.

Starting... now."

### During Scenario

[Monitor dashboards]
[Note timeline of events]
[Be ready to call abort]
[Let responders respond naturally]

### Scenario Conclusion

"I'm ending the injection now.

Quick observations:
- Time to detect: [X minutes]
- Time to recover: [Y minutes]
- Max error rate: [Z%]

Let's take 5 minutes to stabilize and document observations."

### Closing (15 minutes)

"All scenarios complete. Systems are stable.

Quick round - one observation from each participant:
[Go around]

Action items I captured:
[List major items]

Detailed retrospective scheduled for [date/time].

Thank you all for participating."
```

### Observation Template

```markdown
## Observer Notes: [Scenario Name]

**Observer:** [Your name]
**Focus Area:** [What you're watching]

### Timeline

| Time | Event | Notes |
|------|-------|-------|
| 00:00 | Injection started | |
| | | |
| | | |

### Key Observations

1. **Detection**
   - When was the issue first noticed?
   - What triggered the detection?
   - Were there any missed signals?

2. **Response**
   - Who responded first?
   - What actions were taken?
   - Was communication clear?

3. **Recovery**
   - How was the issue resolved?
   - Were runbooks followed?
   - Any manual intervention needed?

### Surprises
- What happened that was unexpected?

### Gaps Identified
- What was missing?

### Positive Observations
- What worked well?
```

---

## Communication During GameDay

### Slack Channel Setup

```markdown
## Channel: #gameday-[date]

### Pinned Messages

**ABORT SIGNAL**
If you see something dangerous, type: 🛑 ABORT
All injection will stop immediately.

**Status Updates**
Use these emoji reactions:
- 🟢 All clear
- 🟡 Minor issues
- 🔴 Major issues / aborting

**Current Status:**
[Facilitator updates this]
```

### Status Updates

```markdown
## Status Update Template

**Time:** [HH:MM]
**Scenario:** [Current/Between/Complete]
**System Status:** [Normal/Degraded/Outage]
**Current Action:** [What's happening]
**Next:** [What's coming]
```

---

## Post-GameDay Phase

### Hot Take Collection

```markdown
## GameDay Hot Takes

Collected immediately after the GameDay.

### What Went Well
1. [Item]
2. [Item]

### What Didn't Go Well
1. [Item]
2. [Item]

### Surprises
1. [Item]

### Immediate Action Items
1. [Critical items to address before next GameDay]
```

### Retrospective Agenda

```markdown
## GameDay Retrospective

**Date:** [1-2 days after GameDay]
**Duration:** 60 minutes
**Facilitator:** [Name]

### Agenda

1. **Review objectives** (5 min)
   - Did we achieve what we set out to do?

2. **Timeline walkthrough** (15 min)
   - Scenario by scenario review
   - Key metrics and observations

3. **What worked** (10 min)
   - Resilience mechanisms
   - Team response
   - Tooling

4. **What didn't work** (10 min)
   - Failures observed
   - Gaps in response
   - Missing observability

5. **Action items** (15 min)
   - Prioritize findings
   - Assign owners
   - Set timelines

6. **Next GameDay** (5 min)
   - Suggested focus areas
   - Tentative date

### Action Item Template

| Finding | Priority | Owner | Due Date | Status |
|---------|----------|-------|----------|--------|
| [Issue] | P0/P1/P2 | [Name] | [Date] | Open |
```

### GameDay Report

```markdown
# GameDay Report: [Name]

**Date:** [Date]
**Duration:** [X hours]
**Environment:** [Production/Staging]
**Participants:** [Count]

## Executive Summary

[2-3 sentence summary of the GameDay and key findings]

## Objectives and Results

| Objective | Result | Notes |
|-----------|--------|-------|
| [Objective 1] | ✅ Met / ❌ Not Met | [Details] |
| [Objective 2] | ✅ Met / ❌ Not Met | [Details] |

## Scenarios Executed

### Scenario 1: [Name]

**Hypothesis:** [Statement]

**Result:** [Validated/Invalidated]

**Metrics:**
- Time to detect: [X min]
- Time to recover: [Y min]
- Max error rate: [Z%]

**Key Findings:**
1. [Finding]
2. [Finding]

### Scenario 2: [Name]
[Repeat structure]

## Resilience Scorecard

| Capability | Rating | Notes |
|------------|--------|-------|
| Detection | ⭐⭐⭐⭐⭐ | |
| Response | ⭐⭐⭐⭐☆ | |
| Recovery | ⭐⭐⭐☆☆ | |
| Communication | ⭐⭐⭐⭐☆ | |

## Action Items

| # | Finding | Action | Priority | Owner | Due |
|---|---------|--------|----------|-------|-----|
| 1 | [Finding] | [Action] | P0 | [Name] | [Date] |
| 2 | [Finding] | [Action] | P1 | [Name] | [Date] |

## Recommendations

1. [Recommendation for improving resilience]
2. [Recommendation for next GameDay focus]

## Appendix

- Raw observation notes
- Metrics snapshots
- Dashboard screenshots
```

---

## GameDay Maturity Model

| Level | Characteristics | Next Steps |
|-------|-----------------|------------|
| **1: Ad-hoc** | Occasional, unstructured testing | Establish regular schedule |
| **2: Repeatable** | Regular tabletop exercises | Move to staged injection |
| **3: Defined** | Documented scenarios, staged injection | Expand to production |
| **4: Managed** | Production GameDays, metrics-driven | Automate scenarios |
| **5: Optimizing** | Continuous chaos, automated learning | Scale across organization |

---

## Best Practices

| Practice | Rationale |
|----------|-----------|
| Start with tabletop | Build confidence before injection |
| Limit blast radius initially | Reduce risk while learning |
| Include diverse perspectives | Different eyes catch different issues |
| Document everything | Learnings are the main value |
| Follow up on action items | Otherwise the effort is wasted |
| Celebrate findings | Problems found are problems prevented |
| Increase difficulty over time | Grow resilience progressively |

---

## Anti-Patterns

| Anti-Pattern | Problem | Better Approach |
|--------------|---------|-----------------|
| Skipping planning | Chaotic chaos | Minimum 2 weeks prep |
| No abort criteria | Can't stop safely | Define before starting |
| Hero mode | Single person fixes everything | Team response practice |
| Blame game | Discourages honesty | Blameless approach |
| No follow-up | Findings forgotten | Track action items |
| Too ambitious | Overwhelming scope | Start small, grow |

---

*Guide from IDPF-Chaos Framework*
