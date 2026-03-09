# Contract Test Plan: [Service/API Name]
**Version:** v0.60.0
**Date:** YYYY-MM-DD
**Author:** [Name]
**Status:** Draft | In Review | Approved

## 1. Overview

### 1.1 Purpose
[What API contracts are being validated?]

### 1.2 Service Information
| Role | Service | Repository | Team |
|------|---------|------------|------|
| Provider | [Service name] | [Link] | [Team] |
| Consumer | [Service name] | [Link] | [Team] |
| Consumer | [Service name] | [Link] | [Team] |

### 1.3 API Documentation
- **OpenAPI Spec:** [Link]
- **API Documentation:** [Link]

## 2. Contract Scope

### 2.1 Endpoints Under Contract
| Endpoint | Method | Consumer(s) | Priority |
|----------|--------|-------------|----------|
| /api/orders | GET | order-ui, reporting | High |
| /api/orders | POST | order-ui | High |
| /api/orders/{id} | GET | order-ui, shipping | High |
| /api/orders/{id}/status | PATCH | shipping | Medium |

### 2.2 Out of Scope
- Internal/admin endpoints
- Deprecated endpoints (v1)
- [Other exclusions]

## 3. Contract Testing Approach

### 3.1 Tool Selection
| Component | Tool | Version |
|-----------|------|---------|
| Contract Framework | Pact | 12.x |
| Broker | Pactflow / Pact Broker | [Version] |
| Consumer Language | [TypeScript/Java/etc.] | |
| Provider Language | [TypeScript/Java/etc.] | |

### 3.2 Testing Strategy
- [ ] Consumer-driven contracts
- [ ] Bi-directional contracts (OpenAPI + Pact)
- [ ] Provider-driven contracts

### 3.3 Provider States
| State Name | Description | Setup Required |
|------------|-------------|----------------|
| `order exists` | Order with ID exists | Seed database |
| `no orders` | Empty order list | Clear database |
| `order is pending` | Order in pending status | Seed specific state |

## 4. Consumer Tests

### 4.1 Consumer: [Consumer Name]

#### Interactions
| Interaction | Request | Expected Response |
|-------------|---------|-------------------|
| Get order by ID | GET /api/orders/123 | 200 + order object |
| Create order | POST /api/orders | 201 + created order |
| Order not found | GET /api/orders/999 | 404 |

#### Consumer Test Example
```typescript
describe('Order API Contract', () => {
  describe('GET /api/orders/:id', () => {
    it('returns order when it exists', async () => {
      await provider.addInteraction({
        state: 'order exists',
        uponReceiving: 'a request for an order',
        withRequest: {
          method: 'GET',
          path: '/api/orders/123',
        },
        willRespondWith: {
          status: 200,
          body: like({
            id: '123',
            status: string('pending'),
            items: eachLike({ productId: string(), quantity: integer() }),
          }),
        },
      });

      const order = await orderClient.getOrder('123');
      expect(order.id).toBe('123');
    });
  });
});
```

## 5. Provider Verification

### 5.1 Provider State Handlers
```typescript
const stateHandlers = {
  'order exists': async () => {
    await database.seed({ orders: [testOrder] });
  },
  'no orders': async () => {
    await database.clear('orders');
  },
};
```

### 5.2 Verification Configuration
| Setting | Value |
|---------|-------|
| Provider Base URL | http://localhost:3000 |
| Publish Results | Yes |
| Provider Version | Git SHA |
| Consumer Version Selectors | deployedOrReleased |

## 6. Broker Configuration

### 6.1 Broker Details
| Setting | Value |
|---------|-------|
| Broker URL | [URL] |
| Authentication | [API Token / Basic Auth] |
| Webhooks | [Configured for PR checks] |

### 6.2 Can-I-Deploy Configuration
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

## 7. CI/CD Integration

### 7.1 Consumer Pipeline
```yaml
steps:
  - name: Run contract tests
    run: npm run test:contract

  - name: Publish contracts
    run: npm run pact:publish
    env:
      PACT_BROKER_TOKEN: ${{ secrets.PACT_BROKER_TOKEN }}

  - name: Can-I-Deploy
    run: npm run pact:can-i-deploy
```

### 7.2 Provider Pipeline
```yaml
steps:
  - name: Verify contracts
    run: npm run pact:verify
    env:
      PACT_BROKER_TOKEN: ${{ secrets.PACT_BROKER_TOKEN }}

  - name: Can-I-Deploy
    run: npm run pact:can-i-deploy
```

### 7.3 Webhook Triggers
| Event | Trigger | Action |
|-------|---------|--------|
| Contract published | Consumer CI | Trigger provider verification |
| Verification complete | Provider CI | Update broker status |

## 8. Versioning Strategy

### 8.1 Contract Versioning
| Approach | Description |
|----------|-------------|
| Git SHA | Version = commit hash |
| Semantic | Version = semver |
| Branch-based | Include branch in version |

### 8.2 Breaking Change Process
1. Consumer publishes new contract with breaking change
2. Provider verification fails
3. Teams coordinate on change
4. Provider implements change
5. Provider verification passes
6. Both services deploy

### 8.3 Pending Pacts (WIP)
- New contracts marked as "pending"
- Provider not blocked by pending pacts
- Provider verification runs but doesn't fail build
- Once verified, pact becomes "supported"

## 9. Metrics & Reporting

### 9.1 Key Metrics
| Metric | Target |
|--------|--------|
| Contract coverage | 100% of public endpoints |
| Verification pass rate | 100% |
| Mean time to fix broken contract | < 24 hours |
| Can-I-Deploy success rate | > 99% |

### 9.2 Dashboards
- Pact Broker dashboard: [Link]
- Contract coverage report: [Link]

## 10. Risks & Mitigations
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Provider state complexity | Medium | Medium | Document states clearly |
| Flaky provider verification | Low | High | Stable test environment |
| Contract drift | Medium | High | Regular sync meetings |
| Broker unavailability | Low | High | Retry logic, fallback |

## 11. Team Responsibilities

### Consumer Team
- [ ] Write consumer contract tests
- [ ] Publish contracts to broker
- [ ] Maintain consumer test suite
- [ ] Coordinate breaking changes

### Provider Team
- [ ] Implement provider state handlers
- [ ] Run provider verification
- [ ] Fix verification failures
- [ ] Communicate API changes

## 12. Approval
| Role | Name | Date | Signature |
|------|------|------|-----------|
| Consumer Lead | | | [ ] Approved |
| Provider Lead | | | [ ] Approved |
| Platform Lead | | | [ ] Approved |

## Revision History
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | YYYY-MM-DD | [Name] | Initial draft |
**End of Test Plan**
