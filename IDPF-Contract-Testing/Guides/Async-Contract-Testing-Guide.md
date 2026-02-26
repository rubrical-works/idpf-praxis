# Async/Event-Driven Contract Testing Guide
**Version:** v0.53.1

**Framework:** IDPF-Contract-Testing

---

## Overview

Event-driven architectures present unique contract testing challenges. Messages are asynchronous, producers don't know their consumers, and schemas must evolve without breaking existing subscribers. This guide covers contract testing patterns for message-based systems.

---

## Async vs Sync Contract Testing

| Aspect | Synchronous (HTTP) | Asynchronous (Events) |
|--------|-------------------|----------------------|
| Interaction | Request/Response | Fire and Forget |
| Coupling | Consumer knows provider | Producer often unaware of consumers |
| Verification | Immediate | Eventual |
| Contracts | API specifications | Message schemas |
| Tools | Pact, Dredd | Pact (message), AsyncAPI |

---

## Message Contract Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                    MESSAGE CONTRACT                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ METADATA                                                  │   │
│  │ ├── Message Type / Event Name                            │   │
│  │ ├── Schema Version                                       │   │
│  │ ├── Content Type                                         │   │
│  │ └── Correlation ID                                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ PAYLOAD                                                   │   │
│  │ ├── Required Fields                                      │   │
│  │ ├── Optional Fields                                      │   │
│  │ └── Nested Structures                                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ RULES                                                     │   │
│  │ ├── Field Types and Formats                              │   │
│  │ ├── Value Constraints                                    │   │
│  │ └── Evolution Compatibility                              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Pact for Message Contracts

### Producer (Publisher) Side

```typescript
// order-service/tests/contracts/order-created.pact.ts
import { MessageProviderPact } from '@pact-foundation/pact';
import { OrderService } from '../../src/services/order.service';

describe('Order Created Event Contract', () => {
  const messagePact = new MessageProviderPact({
    messageProviders: {
      'an order created event': async () => {
        // Produce the actual message your service creates
        const orderService = new OrderService();
        const order = await orderService.createOrder({
          customerId: 'cust-123',
          items: [{ productId: 'prod-456', quantity: 2 }],
        });

        return {
          metadata: {
            'content-type': 'application/json',
            'x-event-type': 'OrderCreated',
            'x-event-version': '1.0',
          },
          contents: {
            orderId: order.id,
            customerId: order.customerId,
            totalAmount: order.totalAmount,
            status: order.status,
            createdAt: order.createdAt.toISOString(),
            items: order.items.map(item => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.price,
            })),
          },
        };
      },
    },
    provider: 'OrderService',
    pactBrokerUrl: process.env.PACT_BROKER_URL,
    publishVerificationResult: true,
    providerVersion: process.env.GIT_COMMIT,
  });

  it('should produce a valid order created event', async () => {
    await messagePact.verify();
  });
});
```

### Consumer (Subscriber) Side

```typescript
// notification-service/tests/contracts/order-created.consumer.pact.ts
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { OrderCreatedHandler } from '../../src/handlers/order-created.handler';

const { like, eachLike, iso8601DateTimeWithMillis, uuid } = MatchersV3;

describe('Order Created Event Consumer Contract', () => {
  const pact = new PactV3({
    consumer: 'NotificationService',
    provider: 'OrderService',
  });

  it('should handle order created event', async () => {
    // Define expected message
    const expectedMessage = {
      orderId: like('ord-12345'),
      customerId: like('cust-123'),
      totalAmount: like(99.99),
      status: like('pending'),
      createdAt: iso8601DateTimeWithMillis('2024-01-15T10:30:00.000Z'),
      items: eachLike({
        productId: like('prod-456'),
        quantity: like(2),
        price: like(49.99),
      }),
    };

    await pact
      .given('an order has been created')
      .expectsToReceive('an order created event')
      .withContent(expectedMessage)
      .withMetadata({
        'content-type': 'application/json',
        'x-event-type': 'OrderCreated',
      })
      .verify(async (message) => {
        // Verify your handler can process this message
        const handler = new OrderCreatedHandler();
        await handler.handle(message);

        // Assert handler behaved correctly
        expect(handler.notificationSent).toBe(true);
      });
  });
});
```

---

## AsyncAPI Specification

### Defining Async Contracts

```yaml
# asyncapi.yaml
asyncapi: '2.6.0'
info:
  title: Order Events API
  version: '1.0.0'
  description: Events published by the Order Service

channels:
  order/created:
    description: Published when a new order is created
    publish:
      operationId: orderCreated
      message:
        $ref: '#/components/messages/OrderCreated'

  order/updated:
    description: Published when an order is updated
    publish:
      operationId: orderUpdated
      message:
        $ref: '#/components/messages/OrderUpdated'

  order/cancelled:
    description: Published when an order is cancelled
    publish:
      operationId: orderCancelled
      message:
        $ref: '#/components/messages/OrderCancelled'

components:
  messages:
    OrderCreated:
      name: OrderCreated
      title: Order Created Event
      summary: Emitted when a new order is successfully created
      contentType: application/json
      headers:
        type: object
        properties:
          x-correlation-id:
            type: string
            format: uuid
          x-event-version:
            type: string
            enum: ['1.0', '1.1']
      payload:
        $ref: '#/components/schemas/OrderCreatedPayload'

    OrderUpdated:
      name: OrderUpdated
      title: Order Updated Event
      contentType: application/json
      payload:
        $ref: '#/components/schemas/OrderUpdatedPayload'

    OrderCancelled:
      name: OrderCancelled
      title: Order Cancelled Event
      contentType: application/json
      payload:
        $ref: '#/components/schemas/OrderCancelledPayload'

  schemas:
    OrderCreatedPayload:
      type: object
      required:
        - orderId
        - customerId
        - totalAmount
        - status
        - createdAt
        - items
      properties:
        orderId:
          type: string
          format: uuid
          description: Unique order identifier
        customerId:
          type: string
          description: Customer who placed the order
        totalAmount:
          type: number
          format: float
          minimum: 0
        status:
          type: string
          enum: [pending, confirmed, shipped, delivered, cancelled]
        createdAt:
          type: string
          format: date-time
        items:
          type: array
          minItems: 1
          items:
            $ref: '#/components/schemas/OrderItem'

    OrderItem:
      type: object
      required:
        - productId
        - quantity
        - price
      properties:
        productId:
          type: string
        quantity:
          type: integer
          minimum: 1
        price:
          type: number
          format: float
          minimum: 0

    OrderUpdatedPayload:
      type: object
      required:
        - orderId
        - status
        - updatedAt
      properties:
        orderId:
          type: string
          format: uuid
        status:
          type: string
          enum: [pending, confirmed, shipped, delivered, cancelled]
        updatedAt:
          type: string
          format: date-time
        changes:
          type: object
          additionalProperties: true

    OrderCancelledPayload:
      type: object
      required:
        - orderId
        - cancelledAt
        - reason
      properties:
        orderId:
          type: string
          format: uuid
        cancelledAt:
          type: string
          format: date-time
        reason:
          type: string
```

### Validating Against AsyncAPI

```typescript
// tests/asyncapi-validation.spec.ts
import { Parser } from '@asyncapi/parser';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

describe('AsyncAPI Contract Validation', () => {
  let schemas: Map<string, object>;

  beforeAll(async () => {
    const parser = new Parser();
    const { document } = await parser.parse('./asyncapi.yaml');

    schemas = new Map();
    for (const [name, message] of document.allMessages()) {
      schemas.set(name, message.payload().json());
    }
  });

  describe('OrderCreated message', () => {
    it('should validate a valid order created message', () => {
      const ajv = new Ajv({ allErrors: true });
      addFormats(ajv);

      const schema = schemas.get('OrderCreated');
      const validate = ajv.compile(schema);

      const validMessage = {
        orderId: '550e8400-e29b-41d4-a716-446655440000',
        customerId: 'cust-123',
        totalAmount: 99.99,
        status: 'pending',
        createdAt: '2024-01-15T10:30:00.000Z',
        items: [
          { productId: 'prod-1', quantity: 2, price: 49.99 },
        ],
      };

      expect(validate(validMessage)).toBe(true);
    });

    it('should reject message missing required fields', () => {
      const ajv = new Ajv({ allErrors: true });
      addFormats(ajv);

      const schema = schemas.get('OrderCreated');
      const validate = ajv.compile(schema);

      const invalidMessage = {
        orderId: '550e8400-e29b-41d4-a716-446655440000',
        // Missing customerId, totalAmount, status, createdAt, items
      };

      expect(validate(invalidMessage)).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({ keyword: 'required' })
      );
    });
  });
});
```

---

## Schema Evolution and Compatibility

### Backward Compatibility Rules

```yaml
# Schema evolution rules
compatibility:
  allowed:
    - Add optional fields
    - Add new enum values (consumer must handle unknown)
    - Widen numeric constraints (min → lower, max → higher)

  forbidden:
    - Remove required fields
    - Rename fields
    - Change field types
    - Add new required fields

  requires_new_version:
    - Remove optional fields
    - Change field semantics
    - Narrow constraints
```

### Version Header Pattern

```typescript
// Message with version header
interface VersionedMessage<T> {
  metadata: {
    eventType: string;
    schemaVersion: string;
    producerVersion: string;
    timestamp: string;
    correlationId: string;
  };
  payload: T;
}

// Consumer handles multiple versions
class OrderCreatedHandler {
  async handle(message: VersionedMessage<unknown>): Promise<void> {
    const { schemaVersion } = message.metadata;

    switch (schemaVersion) {
      case '1.0':
        await this.handleV1(message.payload as OrderCreatedV1);
        break;
      case '1.1':
        await this.handleV1_1(message.payload as OrderCreatedV1_1);
        break;
      default:
        // Attempt to handle as latest known version
        console.warn(`Unknown schema version: ${schemaVersion}`);
        await this.handleLatest(message.payload);
    }
  }
}
```

### Schema Registry Integration

```typescript
// schema-registry.ts
import { SchemaRegistry } from '@kafkajs/confluent-schema-registry';

const registry = new SchemaRegistry({
  host: process.env.SCHEMA_REGISTRY_URL,
});

// Register schema
async function registerSchema(subject: string, schema: object): Promise<number> {
  const { id } = await registry.register({
    type: SchemaType.JSON,
    schema: JSON.stringify(schema),
  }, { subject });

  return id;
}

// Validate message against registered schema
async function validateMessage(
  schemaId: number,
  message: unknown
): Promise<boolean> {
  try {
    await registry.decode(
      await registry.encode(schemaId, message)
    );
    return true;
  } catch (error) {
    console.error('Schema validation failed:', error);
    return false;
  }
}

// Check compatibility before schema update
async function checkCompatibility(
  subject: string,
  newSchema: object
): Promise<boolean> {
  const isCompatible = await registry.testCompatibility({
    type: SchemaType.JSON,
    schema: JSON.stringify(newSchema),
  }, { subject });

  return isCompatible;
}
```

---

## Testing Patterns

### Producer Contract Test

```typescript
// producer.contract.spec.ts
describe('Order Service Message Contracts', () => {
  let producer: KafkaProducer;
  let capturedMessages: Message[];

  beforeEach(() => {
    capturedMessages = [];
    producer = new MockKafkaProducer((msg) => {
      capturedMessages.push(msg);
    });
  });

  it('should produce OrderCreated event with correct schema', async () => {
    const orderService = new OrderService(producer);

    await orderService.createOrder({
      customerId: 'cust-123',
      items: [{ productId: 'prod-1', quantity: 2 }],
    });

    expect(capturedMessages).toHaveLength(1);

    const message = capturedMessages[0];

    // Validate structure
    expect(message.headers['x-event-type']).toBe('OrderCreated');
    expect(message.headers['x-schema-version']).toBe('1.0');

    // Validate payload against schema
    const payload = JSON.parse(message.value);
    expect(payload).toMatchObject({
      orderId: expect.any(String),
      customerId: 'cust-123',
      totalAmount: expect.any(Number),
      status: 'pending',
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      items: expect.arrayContaining([
        expect.objectContaining({
          productId: 'prod-1',
          quantity: 2,
        }),
      ]),
    });
  });
});
```

### Consumer Contract Test

```typescript
// consumer.contract.spec.ts
describe('Notification Service Message Contracts', () => {
  let handler: OrderCreatedHandler;

  beforeEach(() => {
    handler = new OrderCreatedHandler();
  });

  describe('OrderCreated event handling', () => {
    it('should process valid OrderCreated event', async () => {
      const event = createOrderCreatedEvent({
        orderId: 'ord-123',
        customerId: 'cust-456',
        totalAmount: 99.99,
        items: [{ productId: 'p1', quantity: 1, price: 99.99 }],
      });

      await handler.handle(event);

      expect(handler.lastProcessedOrderId).toBe('ord-123');
    });

    it('should handle missing optional fields gracefully', async () => {
      const eventWithMinimalFields = {
        orderId: 'ord-123',
        customerId: 'cust-456',
        totalAmount: 0,
        status: 'pending',
        createdAt: new Date().toISOString(),
        items: [{ productId: 'p1', quantity: 1, price: 0 }],
        // No optional fields like promotionCode, notes, etc.
      };

      await expect(handler.handle(eventWithMinimalFields)).resolves.not.toThrow();
    });

    it('should ignore unknown fields (forward compatibility)', async () => {
      const eventWithExtraFields = {
        orderId: 'ord-123',
        customerId: 'cust-456',
        totalAmount: 99.99,
        status: 'pending',
        createdAt: new Date().toISOString(),
        items: [{ productId: 'p1', quantity: 1, price: 99.99 }],
        // Unknown field from future schema version
        newFeatureFlag: true,
        analyticsData: { source: 'mobile' },
      };

      await expect(handler.handle(eventWithExtraFields)).resolves.not.toThrow();
    });
  });
});
```

### End-to-End Message Flow Test

```typescript
// e2e/message-flow.spec.ts
describe('Order Created Event Flow', () => {
  let kafka: EmbeddedKafka;
  let orderService: OrderService;
  let notificationService: NotificationService;

  beforeAll(async () => {
    kafka = await EmbeddedKafka.start();
    orderService = new OrderService(kafka.producer);
    notificationService = new NotificationService(kafka.consumer);
    await notificationService.start();
  });

  afterAll(async () => {
    await notificationService.stop();
    await kafka.stop();
  });

  it('should deliver order created event to notification service', async () => {
    const notificationPromise = waitForNotification(notificationService);

    await orderService.createOrder({
      customerId: 'cust-123',
      items: [{ productId: 'prod-1', quantity: 1 }],
    });

    const notification = await notificationPromise;

    expect(notification).toMatchObject({
      type: 'order_confirmation',
      customerId: 'cust-123',
    });
  });
});
```

---

## CI/CD Integration

### Contract Testing Pipeline

```yaml
# .github/workflows/contract-tests.yml
name: Async Contract Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  producer-contracts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run producer contract tests
        run: npm run test:contracts:producer

      - name: Validate AsyncAPI spec
        run: npx @asyncapi/cli validate asyncapi.yaml

      - name: Publish contracts to Pact Broker
        if: github.ref == 'refs/heads/main'
        run: npm run pact:publish
        env:
          PACT_BROKER_URL: ${{ secrets.PACT_BROKER_URL }}
          PACT_BROKER_TOKEN: ${{ secrets.PACT_BROKER_TOKEN }}

  consumer-contracts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Download provider contracts
        run: npm run pact:download
        env:
          PACT_BROKER_URL: ${{ secrets.PACT_BROKER_URL }}

      - name: Run consumer contract tests
        run: npm run test:contracts:consumer

  schema-compatibility:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Check schema backward compatibility
        run: |
          npx @asyncapi/diff asyncapi.yaml origin/main:asyncapi.yaml \
            --fail-on-incompatible-changes
```

---

## Best Practices

| Practice | Rationale |
|----------|-----------|
| Version all message schemas | Enable evolution without breaking |
| Test consumers with minimal payloads | Ensure required fields are truly required |
| Test with extra fields | Ensure forward compatibility |
| Use schema registry | Centralized contract management |
| Include correlation IDs | Enable tracing across async boundaries |
| Document expected timing | Set SLA expectations |

---

## Anti-Patterns

| Anti-Pattern | Problem | Better Approach |
|--------------|---------|-----------------|
| No schema versioning | Breaking changes break consumers | Always include version header |
| Tight coupling to schema | Any change breaks consumer | Program defensively, ignore unknowns |
| Testing only happy path | Misses edge cases | Test with minimal, maximal, and invalid messages |
| No dead letter handling | Lost messages | Plan for unprocessable messages |

---

*Guide from IDPF-Contract-Testing Framework*
