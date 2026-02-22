# IDPF-Contract-Testing Framework
**Version:** v0.48.3
**Source:** IDPF-Contract-Testing/IDPF-Contract-Testing.md
**Extends:** IDPF-Testing
## Overview
Framework for API contract testing. Extends IDPF-Testing with consumer-driven contract testing, provider verification, and contract management using Pact, Spring Cloud Contract, and Specmatic.
## Terminology
| Term | Definition |
|------|------------|
| **Consumer** | Service that calls an API |
| **Provider** | Service that exposes an API |
| **Contract** | Agreement on request/response format |
| **Pact** | A contract file (in Pact format) |
| **Consumer-Driven** | Consumer defines expected interactions |
| **Provider Verification** | Provider validates it meets contracts |
| **Broker** | Central repository for contracts |
| **Can-I-Deploy** | Check if safe to deploy based on contracts |
| **Provider State** | Precondition setup for contract verification |
| **Pending Pact** | WIP contract not yet verified |
## Contract Testing Flow
```
┌──────────────┐                          ┌──────────────┐
│   CONSUMER   │                          │   PROVIDER   │
└──────┬───────┘                          └──────┬───────┘
       │                                         │
       │  1. Write consumer tests                │
       │     (mock provider)                     │
       ▼                                         │
┌──────────────┐                                 │
│   Generate   │                                 │
│   Contract   │                                 │
└──────┬───────┘                                 │
       │                                         │
       │  2. Publish contract                    │
       ▼                                         │
┌──────────────────────────────────────────────────┐
│                  CONTRACT BROKER                  │
│              (Pact Broker / Pactflow)             │
└──────────────────────────────────────────────────┘
       │                                         │
       │  3. Fetch contracts                     │
       │                                         ▼
       │                                ┌──────────────┐
       │                                │   Verify     │
       │                                │   Provider   │
       │                                └──────┬───────┘
       │                                       │
       │  4. Publish verification results      │
       │                                       ▼
       │                         ┌──────────────────────┐
       │                         │   Results Published   │
       │                         └──────────────────────┘
       │                                       │
       │  5. Can-I-Deploy check                │
       ▼                                       ▼
┌──────────────┐                      ┌──────────────┐
│   Deploy     │                      │   Deploy     │
│   Consumer   │                      │   Provider   │
└──────────────┘                      └──────────────┘
```
## Tool Selection Guide
| Tool | Language | Best For | Features |
|------|----------|----------|----------|
| **Pact** | Multi-language | Most scenarios | Mature, broker, can-i-deploy |
| **Spring Cloud Contract** | Java/Kotlin | Spring ecosystem | Stub generation, Spring Boot |
| **Specmatic** | Any (OpenAPI) | OpenAPI-based | Contract from spec |
| **Dredd** | Any | API Blueprint/OpenAPI | Validation tool |
| **Hoverfly** | Multi-language | Service virtualization | Simulation + contract |
```
Contract Testing Tool Selection:
├── Spring Boot ecosystem? → Spring Cloud Contract
├── Multi-language microservices? → Pact
├── OpenAPI-first design? → Specmatic or Dredd
├── Need service virtualization? → Hoverfly
└── General purpose? → Pact
```
## Directory Structure
### Consumer Repository (Embedded)
```
<consumer-service-repo>/
├── src/
│   └── ...
├── tests/
│   └── contract/
│       ├── pacts/                    # Generated pact files
│       └── consumer-tests.spec.ts   # Consumer contract tests
├── pact/
│   └── pact-config.js
└── package.json
```
### Provider Repository (Embedded)
```
<provider-service-repo>/
├── src/
│   └── ...
├── tests/
│   └── contract/
│       └── provider-verification.spec.ts
├── pact/
│   ├── pact-config.js
│   └── provider-states/             # State setup handlers
│       └── states.js
└── package.json
```
### Contract Testing Repository (Separate)
```
<contract-testing-repo>/
├── PRD/
│   ├── README.md
│   ├── Templates/
│   │   └── Contract-Test-Plan.md
│   └── TestPlans/
│       ├── TP-OrderService-Contracts.md
│       └── TP-PaymentService-Contracts.md
├── contracts/
│   ├── order-service/
│   │   ├── consumer-a/
│   │   └── consumer-b/
│   └── payment-service/
├── broker/
│   ├── docker-compose.yml           # Local Pact Broker
│   └── broker-config.yml
├── docs/
│   ├── consumer-guide.md
│   ├── provider-guide.md
│   └── versioning-strategy.md
├── scripts/
│   ├── publish-contracts.sh
│   ├── verify-provider.sh
│   └── can-i-deploy.sh
├── .github/
│   └── workflows/
│       ├── consumer-contract.yml
│       └── provider-verification.yml
└── README.md
```
## Consumer-Driven Workflow
### Consumer Side
1. **Write Contract Test** - Define expected provider behavior
2. **Run Tests** - Execute against mock provider
3. **Generate Pact** - Contract file created automatically
4. **Publish to Broker** - Upload contract for provider
### Provider Side
1. **Fetch Contracts** - Download from broker
2. **Setup Provider States** - Configure preconditions
3. **Run Verification** - Execute real provider against contracts
4. **Publish Results** - Report verification status
## Provider States
```typescript
const stateHandlers = {
  'order exists': async () => {
    await database.seed({ orders: [testOrder] });
  },
  'no orders': async () => {
    await database.clear('orders');
  },
  'order is pending': async () => {
    await database.seed({ orders: [{ ...testOrder, status: 'pending' }] });
  },
};
```
## Pact Broker Integration
| Setting | Description |
|---------|-------------|
| Base URL | Broker endpoint |
| Authentication | API token or basic auth |
| Webhooks | Trigger provider verification on publish |
| Environments | production, staging, development |
### Can-I-Deploy
```bash
# Consumer deployment check
pact-broker can-i-deploy \
  --pacticipant order-ui \
  --version $GIT_SHA \
  --to-environment production

# Provider deployment check
pact-broker can-i-deploy \
  --pacticipant order-service \
  --version $GIT_SHA \
  --to-environment production
```
## CI/CD Integration
### Consumer Pipeline (GitHub Actions)
```yaml
# .github/workflows/consumer-contract.yml
name: Consumer Contract Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  contract-test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run contract tests
        run: npm run test:contract

      - name: Publish pacts
        if: github.ref == 'refs/heads/main'
        run: |
          npx pact-broker publish ./pacts \
            --broker-base-url=${{ secrets.PACT_BROKER_URL }} \
            --broker-token=${{ secrets.PACT_BROKER_TOKEN }} \
            --consumer-app-version=${{ github.sha }} \
            --branch=${{ github.ref_name }}

      - name: Can-I-Deploy
        if: github.ref == 'refs/heads/main'
        run: |
          npx pact-broker can-i-deploy \
            --broker-base-url=${{ secrets.PACT_BROKER_URL }} \
            --broker-token=${{ secrets.PACT_BROKER_TOKEN }} \
            --pacticipant=order-ui \
            --version=${{ github.sha }} \
            --to-environment=production
```
### Provider Pipeline (GitHub Actions)
```yaml
# .github/workflows/provider-verification.yml
name: Provider Contract Verification

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  repository_dispatch:
    types: [contract_requiring_verification_published]

jobs:
  verify-contracts:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Start provider
        run: npm run start:test &

      - name: Wait for provider
        run: npx wait-on http://localhost:3000/health

      - name: Verify contracts
        run: npm run pact:verify
        env:
          PACT_BROKER_URL: ${{ secrets.PACT_BROKER_URL }}
          PACT_BROKER_TOKEN: ${{ secrets.PACT_BROKER_TOKEN }}
          PACT_PROVIDER_VERSION: ${{ github.sha }}

      - name: Can-I-Deploy
        if: github.ref == 'refs/heads/main'
        run: |
          npx pact-broker can-i-deploy \
            --broker-base-url=${{ secrets.PACT_BROKER_URL }} \
            --broker-token=${{ secrets.PACT_BROKER_TOKEN }} \
            --pacticipant=order-service \
            --version=${{ github.sha }} \
            --to-environment=production
```
## Versioning Strategy
| Approach | Description | Use Case |
|----------|-------------|----------|
| **Git SHA** | Version = commit hash | Standard CI/CD |
| **Semantic** | Version = semver | Formal releases |
| **Branch-based** | Include branch in version | Feature branches |
### Breaking Change Process
1. Consumer publishes new contract with breaking change
2. Provider verification fails
3. Teams coordinate on change
4. Provider implements change
5. Provider verification passes
6. Both services deploy
### Pending Pacts (WIP)
- New contracts marked as "pending"
- Provider not blocked by pending pacts
- Provider verification runs but doesn't fail build
- Once verified, pact becomes "supported"
## GitHub Project Labels
| Label | Color | Hex | Description |
|-------|-------|-----|-------------|
| `contract` | Cyan | `#00B8D9` | Contract work (from Core) |
| `consumer` | Green | `#0E8A16` | Consumer-side contract |
| `provider` | Blue | `#0052CC` | Provider-side contract |
| `breaking-change` | Orange | `#D93F0B` | Breaking contract change |
| `pending-pact` | Yellow | `#FBCA04` | Work-in-progress contract |
| `verification-failed` | Red | `#FF5630` | Failed verification |
## Workflow Phases
| Phase | Contract-Specific Activities |
|-------|------------------------------|
| **PLAN** | Identify consumer/provider pairs, define contract scope |
| **DESIGN** | Design interactions, define provider states |
| **DEVELOP** | Write consumer tests, implement provider state handlers |
| **EXECUTE** | Publish contracts, run provider verification |
| **REPORT** | Monitor broker dashboard, track verification status |
## Session Commands
### Planning Commands
- **"Contract-Plan-Start"** - Begin contract test planning
- **"Consumer-Identify"** - Identify consumer services
- **"Provider-Identify"** - Identify provider services
### Development Commands
- **"Consumer-Test-Create"** - Create consumer contract test
- **"Provider-State-Create"** - Create provider state handler
- **"Pact-Generate"** - Generate pact from tests
### Verification Commands
- **"Pact-Publish"** - Publish pacts to broker
- **"Provider-Verify"** - Run provider verification
- **"Can-I-Deploy"** - Check deployment safety
## Integration Points
- **Extends:** IDPF-Testing
- **Uses:** IDPF-Agile for test development
- **Coordinates:** Multiple teams (consumer and provider)
- **Outputs:** Contract files, verification reports, broker dashboards
## References
### Tool Documentation
- [Pact Documentation](https://docs.pact.io/)
- [Pactflow](https://pactflow.io/docs/)
- [Spring Cloud Contract](https://spring.io/projects/spring-cloud-contract)
- [Specmatic](https://specmatic.io/documentation/)
### Best Practices
- [Contract Testing Best Practices - Pact](https://docs.pact.io/best_practices)
- [Consumer-Driven Contracts - Martin Fowler](https://martinfowler.com/articles/consumerDrivenContracts.html)
---
**End of Framework**
