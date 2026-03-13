# Team Coordination Guide for Contract Testing
**Version:** v0.63.0

**Framework:** IDPF-Contract-Testing

---

## Overview

Contract testing requires coordination between provider and consumer teams. This guide covers workflows, communication patterns, and organizational practices for effective contract testing adoption.

---

## The Contract Testing Triangle

```
┌─────────────────────────────────────────────────────────────────┐
│                CONTRACT TESTING RELATIONSHIPS                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                    ┌───────────────┐                            │
│                    │    Contract   │                            │
│                    │    Broker     │                            │
│                    │   (Central)   │                            │
│                    └───────┬───────┘                            │
│                            │                                    │
│            ┌───────────────┴───────────────┐                    │
│            │                               │                    │
│            ▼                               ▼                    │
│     ┌─────────────┐               ┌─────────────┐              │
│     │  Provider   │ ◄──────────── │  Consumer   │              │
│     │   Team      │    Contract   │   Team      │              │
│     │             │    Defines    │             │              │
│     │ - Verifies  │    Needs      │ - Creates   │              │
│     │ - Publishes │               │ - Tests     │              │
│     └─────────────┘               └─────────────┘              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Roles and Responsibilities

### Consumer Team

| Responsibility | Description |
|----------------|-------------|
| Write consumer contracts | Define expected interactions |
| Publish to broker | Share contracts with providers |
| Communicate changes | Notify providers of new requirements |
| Update when needs change | Maintain accurate contracts |
| Test against stubs | Verify client code works |

### Provider Team

| Responsibility | Description |
|----------------|-------------|
| Verify contracts | Run provider tests |
| Publish verification results | Update broker with status |
| Communicate breaking changes | Warn consumers before changes |
| Publish stubs | Enable consumer testing |
| Support contract evolution | Help consumers migrate |

### Platform/DevOps Team

| Responsibility | Description |
|----------------|-------------|
| Maintain broker | Keep infrastructure running |
| CI/CD integration | Automate contract workflows |
| Tooling support | Provide libraries and templates |
| Training | Educate teams on practices |
| Governance | Set standards and policies |

---

## Workflows

### Consumer-Driven Contract Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              CONSUMER-DRIVEN CONTRACT WORKFLOW                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Consumer                Broker                Provider         │
│  ────────                ──────                ────────         │
│                                                                 │
│  1. Writes contract                                             │
│     │                                                           │
│  2. Runs consumer tests                                         │
│     │                                                           │
│  3. Publishes ──────────►  Stores                              │
│                            │                                    │
│                            │  4. Notifies ─────► Receives       │
│                                                 │                │
│                                          5. Fetches contracts   │
│                                                 │                │
│                                          6. Runs provider tests │
│                                                 │                │
│                            ◄──── 7. Publishes ──┘               │
│                            Verification                         │
│                                                                 │
│  8. Checks ◄───────────────┘                                   │
│     verification                                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Provider Change Workflow

```markdown
## Provider Change Workflow

### Before Making Changes

1. **Check pending consumer contracts**
   - Query broker for unverified contracts
   - Understand consumer expectations

2. **Assess impact**
   - Will this break any consumer contracts?
   - Which consumers are affected?

3. **Communicate**
   - Notify affected consumer teams
   - Discuss migration timeline

### Making Changes

4. **Implement with backward compatibility**
   - Add new fields/endpoints first
   - Deprecate old ones (don't remove yet)

5. **Run contract verification**
   - Verify all consumer contracts pass
   - Fix any failures

6. **Publish stubs**
   - Update stub artifacts
   - Notify consumers stubs are available

### After Changes

7. **Monitor consumer adoption**
   - Track which consumers updated
   - Follow up on stragglers

8. **Remove deprecated features**
   - Only after all consumers migrated
   - Coordinate removal timing
```

---

## Communication Patterns

### Contract Change Request

```markdown
## Contract Change Request Template

### Requesting Team
- **Team:** [Consumer team name]
- **Service:** [Consumer service name]
- **Contact:** [Name/Email]

### Target Provider
- **Provider:** [Provider service name]
- **Current Contract:** [Link to existing contract]

### Requested Change

**Type:** [ ] New Endpoint [ ] Modified Response [ ] New Field [ ] Other

**Description:**
[Detailed description of the requested change]

**Proposed Contract:**
```yaml
[Contract definition]
```

**Business Justification:**
[Why this change is needed]

**Timeline:**
- **Needed by:** [Date]
- **Flexibility:** [High/Medium/Low]

### Impact Assessment (Provider fills in)
- **Feasibility:** [Yes/No/Needs discussion]
- **Breaking changes:** [Yes/No]
- **Estimated effort:** [T-shirt size]
- **Proposed timeline:** [Date range]
```

### Breaking Change Notification

```markdown
## Breaking Change Notification

### Provider Team
- **Service:** [Provider service name]
- **Contact:** [Name/Email]

### Change Details

**Change Type:** [Field removal / Type change / Endpoint deprecation]

**Description:**
[What is changing and why]

**Affected Contracts:**
- Consumer A: [Contract name/link]
- Consumer B: [Contract name/link]

### Timeline

| Milestone | Date |
|-----------|------|
| Announcement | [Today] |
| New version available | [Date] |
| Deprecation period ends | [Date] |
| Breaking change deployed | [Date] |

### Migration Guide

**Before:**
```json
{"oldField": "value"}
```

**After:**
```json
{"newField": "value"}
```

**Migration Steps:**
1. [Step 1]
2. [Step 2]

### Support

Questions? Contact [name] or post in [#channel].
```

---

## Contract Broker Administration

### Broker Dashboard Metrics

```markdown
## Contract Testing Health Dashboard

### Overall Metrics
- Total contracts: [N]
- Verified contracts: [N] ([%])
- Pending verification: [N]
- Failed verification: [N]

### By Provider
| Provider | Contracts | Verified | Failed |
|----------|-----------|----------|--------|
| Order Service | 12 | 11 | 1 |
| User Service | 8 | 8 | 0 |
| Payment Service | 6 | 5 | 1 |

### Recent Activity
- [Time] - Consumer X published contract for Provider Y
- [Time] - Provider Y verified contract (PASSED)
- [Time] - Provider Z verification failed

### Action Items
- [ ] Provider Y: Fix failing contract
- [ ] Provider Z: Verify pending contracts
```

### Access Control

```yaml
# broker-permissions.yaml
teams:
  order-service-team:
    provider:
      - order-service
    consumer:
      - all  # Can create contracts for any provider

  user-service-team:
    provider:
      - user-service
    consumer:
      - order-service
      - payment-service

  platform-team:
    admin: true
    provider:
      - all
    consumer:
      - all
```

---

## Onboarding Teams

### Provider Onboarding Checklist

```markdown
## Provider Onboarding: [Service Name]

### Prerequisites
- [ ] Access to Pact Broker granted
- [ ] CI/CD pipeline access
- [ ] Repository created

### Technical Setup
- [ ] Add contract verification dependency
- [ ] Create base test class
- [ ] Configure broker URL and credentials
- [ ] Add verification to CI pipeline
- [ ] Configure webhook for new contracts

### First Contract
- [ ] Identify first consumer
- [ ] Receive consumer contract
- [ ] Run verification locally
- [ ] Fix any failures
- [ ] Publish verification results

### Documentation
- [ ] Document API contracts location
- [ ] Add to service catalog
- [ ] Create runbook for contract failures

### Training
- [ ] Team completed contract testing training
- [ ] Nominated contract testing champion
```

### Consumer Onboarding Checklist

```markdown
## Consumer Onboarding: [Service Name]

### Prerequisites
- [ ] Access to Pact Broker granted
- [ ] CI/CD pipeline access
- [ ] Identified provider services

### Technical Setup
- [ ] Add consumer contract dependency
- [ ] Configure broker URL and credentials
- [ ] Add contract generation to CI pipeline
- [ ] Configure stub runner for local development

### First Contract
- [ ] Identify first provider
- [ ] Write consumer contract
- [ ] Run consumer tests locally
- [ ] Publish contract to broker
- [ ] Coordinate with provider for verification

### Documentation
- [ ] Document expected providers
- [ ] Add to service catalog
- [ ] Create runbook for contract changes

### Training
- [ ] Team completed contract testing training
- [ ] Nominated contract testing champion
```

---

## Governance

### Contract Testing Standards

```markdown
## Contract Testing Standards

### Naming Conventions

**Contracts:**
- Format: `[consumer]-[provider]-[interaction].json`
- Example: `order-dashboard-order-service-get-order.json`

**Test Files:**
- Format: `[Provider]ContractTest.java`
- Example: `OrderServiceContractTest.java`

### Required Metadata

All contracts must include:
- Consumer name
- Consumer version
- Provider name
- Interaction description

### Verification Requirements

- All contracts must be verified before provider deployment
- Failed verifications block deployment
- Pending contracts have 5-day SLA for verification

### Review Process

New contracts require:
1. Consumer team creates contract
2. Provider team reviews (within 2 business days)
3. Technical lead approval for breaking changes
4. Security review for sensitive endpoints
```

### SLA Definitions

```markdown
## Contract Testing SLAs

### Contract Publication
- Consumer publishes contract: < 1 day after code completion
- CI pipeline runs consumer tests: < 10 minutes

### Verification
- Provider acknowledges new contract: < 2 business days
- Provider verifies contract: < 5 business days
- CI pipeline runs provider tests: < 15 minutes

### Breaking Changes
- Notification period: 2 weeks minimum
- Migration support: Available during deprecation
- Removal: Only after all consumers updated

### Incident Response
- Contract failure in production: P1 (< 4 hours)
- Contract failure in staging: P2 (< 1 business day)
- Missing contract: P3 (< 5 business days)
```

---

## Troubleshooting Workflows

### Contract Verification Failure

```markdown
## Contract Verification Failure Runbook

### Step 1: Identify the failure

```bash
# Check broker for failed verifications
pact-broker list-latest-pact-versions \
  --provider "OrderService" \
  --broker-url $PACT_BROKER_URL
```

### Step 2: Reproduce locally

```bash
# Run provider verification locally
./gradlew contractTest
```

### Step 3: Analyze the failure

Common causes:
1. **Missing endpoint**: Consumer expects endpoint that doesn't exist
2. **Schema mismatch**: Response structure differs
3. **Status code difference**: Expected 200, got 404
4. **Missing field**: Consumer expects field provider doesn't return

### Step 4: Determine responsibility

| Cause | Responsible Team |
|-------|-----------------|
| Provider changed API | Provider |
| Consumer expects non-existent feature | Consumer |
| Incorrect contract | Consumer |
| Environment issue | Platform |

### Step 5: Resolve

- Provider issue: Fix provider code
- Consumer issue: Update consumer contract
- Coordination needed: Schedule meeting

### Step 6: Verify fix

```bash
# Re-run verification
./gradlew contractTest

# Publish results
./gradlew pactPublish
```
```

---

## Scaling Contract Testing

### Maturity Model

| Level | Characteristics | Actions |
|-------|----------------|---------|
| **1: Pilot** | Single team, manual processes | Learn and iterate |
| **2: Adopted** | Multiple teams, some automation | Standardize tooling |
| **3: Scaled** | Org-wide, fully automated | Self-service, governance |
| **4: Optimized** | Integrated into all workflows | Continuous improvement |

### Adoption Roadmap

```
Quarter 1:
├── Pilot with 2-3 teams
├── Establish tooling
└── Document learnings

Quarter 2:
├── Expand to 10 teams
├── Build self-service capabilities
└── Create training materials

Quarter 3:
├── Org-wide rollout
├── Integrate with deployment pipelines
└── Establish governance

Quarter 4:
├── Optimize and automate
├── Advanced features (versioning, branching)
└── Cross-team metrics
```

---

## Best Practices

| Practice | Rationale |
|----------|-----------|
| Consumer writes first | Ensures contracts reflect actual needs |
| Verify before deploy | Catch breaking changes early |
| Communicate proactively | Avoid surprises |
| Version contracts | Support parallel development |
| Automate everything | Reduce friction |
| Central broker | Single source of truth |
| Regular reviews | Keep contracts current |
| Clear ownership | Accountability for each contract |

---

## Anti-Patterns

| Anti-Pattern | Problem | Better Approach |
|--------------|---------|-----------------|
| Provider-driven contracts | Doesn't capture actual consumer needs | Consumer-driven approach |
| Manual verification | Inconsistent, slow | CI/CD integration |
| Siloed teams | Broken contracts discovered late | Regular communication |
| Too many contracts | Maintenance burden | Focus on critical interactions |
| No governance | Inconsistent practices | Standards and policies |
| Treating as replacement for integration tests | Different purposes | Use both appropriately |

---

*Guide from IDPF-Contract-Testing Framework*
