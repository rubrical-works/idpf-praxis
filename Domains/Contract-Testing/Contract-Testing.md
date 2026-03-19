# IDPF-Contract-Testing Framework
**Version:** v0.66.0
**Type:** Domain
## Overview
Domain for API contract testing: consumer-driven contracts, provider verification, and contract management using Pact, Spring Cloud Contract, and Specmatic.
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
Consumer → Write tests (mock provider) → Generate contract → Publish to Broker
                                                                    ↓
Provider ← Fetch contracts ← Broker → Verify provider → Publish results
                                                                    ↓
Both: Can-I-Deploy check → Deploy
```
## Tool Selection Guide
| Tool | Language | Best For | Features |
|------|----------|----------|----------|
| **Pact** | Multi-language | Most scenarios | Mature, broker, can-i-deploy |
| **Spring Cloud Contract** | Java/Kotlin | Spring ecosystem | Stub generation |
| **Specmatic** | Any (OpenAPI) | OpenAPI-based | Contract from spec |
| **Dredd** | Any | API Blueprint/OpenAPI | Validation tool |
| **Hoverfly** | Multi-language | Service virtualization | Simulation + contract |
## Consumer-Driven Workflow
### Consumer Side
1. Write contract test (define expected provider behavior)
2. Run tests (execute against mock provider)
3. Generate pact (contract file created automatically)
4. Publish to broker
### Provider Side
1. Fetch contracts from broker
2. Setup provider states (configure preconditions)
3. Run verification (real provider against contracts)
4. Publish results
## Provider States
```typescript
const stateHandlers = {
  'order exists': async () => { await database.seed({ orders: [testOrder] }); },
  'no orders': async () => { await database.clear('orders'); },
};
```
## Can-I-Deploy
```bash
pact-broker can-i-deploy \
  --pacticipant order-ui \
  --version $GIT_SHA \
  --to-environment production
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
- Once verified, pact becomes "supported"
## Workflow Phases
| Phase | Activities |
|-------|------------|
| **PLAN** | Identify consumer/provider pairs, define scope |
| **DESIGN** | Design interactions, define provider states |
| **DEVELOP** | Write consumer tests, implement state handlers |
| **EXECUTE** | Publish contracts, run provider verification |
| **REPORT** | Monitor broker dashboard, track verification status |
## References
- [Pact Documentation](https://docs.pact.io/)
- [Spring Cloud Contract](https://spring.io/projects/spring-cloud-contract)
- [Consumer-Driven Contracts - Martin Fowler](https://martinfowler.com/articles/consumerDrivenContracts.html)
**End of Framework**
