# GraphQL Contract Testing Guide
**Version:** v0.66.3

**Framework:** IDPF-Contract-Testing

---

## Overview

GraphQL's flexible query language creates unique contract testing challenges. Clients can request any combination of fields, and the schema serves as both contract and documentation. This guide covers GraphQL-specific contract testing patterns.

---

## GraphQL Contract Challenges

| Challenge | Description |
|-----------|-------------|
| **Dynamic queries** | Clients construct arbitrary queries |
| **Schema evolution** | Adding/removing fields affects all clients |
| **Resolver complexity** | Business logic hidden in resolvers |
| **N+1 problems** | Performance issues from field combinations |
| **Nullability** | Non-null changes are breaking |

---

## Schema as Contract

### Schema-First Design

```graphql
# schema.graphql - The contract definition
type Query {
  """
  Get an order by ID
  """
  order(id: ID!): Order

  """
  List orders with pagination
  """
  orders(
    first: Int = 10
    after: String
    filter: OrderFilter
  ): OrderConnection!
}

type Mutation {
  """
  Create a new order
  """
  createOrder(input: CreateOrderInput!): CreateOrderPayload!

  """
  Cancel an existing order
  """
  cancelOrder(id: ID!, reason: String!): CancelOrderPayload!
}

type Order {
  id: ID!
  customer: Customer!
  items: [OrderItem!]!
  totalAmount: Money!
  status: OrderStatus!
  createdAt: DateTime!
  updatedAt: DateTime!

  """
  @deprecated Use shippingAddress instead
  """
  address: String @deprecated(reason: "Use shippingAddress field")
  shippingAddress: Address
}

type OrderItem {
  id: ID!
  product: Product!
  quantity: Int!
  unitPrice: Money!
  lineTotal: Money!
}

enum OrderStatus {
  PENDING
  CONFIRMED
  SHIPPED
  DELIVERED
  CANCELLED
}

type OrderConnection {
  edges: [OrderEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type OrderEdge {
  cursor: String!
  node: Order!
}

input CreateOrderInput {
  customerId: ID!
  items: [OrderItemInput!]!
  shippingAddressId: ID
}

input OrderItemInput {
  productId: ID!
  quantity: Int!
}

type CreateOrderPayload {
  order: Order
  errors: [UserError!]!
}

type UserError {
  field: String
  message: String!
  code: ErrorCode!
}
```

---

## Schema Validation Testing

### Schema Structure Tests

```typescript
// tests/schema.spec.ts
import { buildSchema, validateSchema, GraphQLError } from 'graphql';
import { loadSchemaSync } from '@graphql-tools/load';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';

describe('GraphQL Schema', () => {
  let schema: GraphQLSchema;

  beforeAll(() => {
    schema = loadSchemaSync('./schema.graphql', {
      loaders: [new GraphQLFileLoader()],
    });
  });

  it('should be a valid GraphQL schema', () => {
    const errors = validateSchema(schema);
    expect(errors).toHaveLength(0);
  });

  it('should have required query types', () => {
    const queryType = schema.getQueryType();
    expect(queryType).toBeDefined();

    const fields = queryType!.getFields();
    expect(fields.order).toBeDefined();
    expect(fields.orders).toBeDefined();
  });

  it('should have required mutation types', () => {
    const mutationType = schema.getMutationType();
    expect(mutationType).toBeDefined();

    const fields = mutationType!.getFields();
    expect(fields.createOrder).toBeDefined();
    expect(fields.cancelOrder).toBeDefined();
  });

  it('should have correct Order type fields', () => {
    const orderType = schema.getType('Order') as GraphQLObjectType;
    expect(orderType).toBeDefined();

    const fields = orderType.getFields();

    // Required fields
    expect(fields.id.type.toString()).toBe('ID!');
    expect(fields.status.type.toString()).toBe('OrderStatus!');
    expect(fields.totalAmount.type.toString()).toBe('Money!');

    // Check deprecated field
    expect(fields.address.deprecationReason).toBe('Use shippingAddress field');
  });
});
```

### Schema Breaking Change Detection

```typescript
// tests/schema-compatibility.spec.ts
import { diff } from '@graphql-inspector/core';
import { buildSchema } from 'graphql';

describe('Schema Backward Compatibility', () => {
  const oldSchema = buildSchema(`
    type Query {
      order(id: ID!): Order
    }

    type Order {
      id: ID!
      status: String!
      customer: Customer!
    }

    type Customer {
      id: ID!
      name: String!
    }
  `);

  it('should detect breaking changes', () => {
    const newSchemaWithBreakingChange = buildSchema(`
      type Query {
        order(id: ID!): Order
      }

      type Order {
        id: ID!
        status: OrderStatus!  # Changed from String! to OrderStatus!
        customer: Customer!
      }

      enum OrderStatus {
        PENDING
        COMPLETED
      }

      type Customer {
        id: ID!
        # name field removed - BREAKING!
      }
    `);

    const changes = diff(oldSchema, newSchemaWithBreakingChange);

    const breakingChanges = changes.filter(c => c.criticality.level === 'BREAKING');

    expect(breakingChanges.length).toBeGreaterThan(0);
    expect(breakingChanges.map(c => c.message)).toContain(
      expect.stringContaining('Customer.name')
    );
  });

  it('should allow safe changes', () => {
    const newSchemaWithSafeChanges = buildSchema(`
      type Query {
        order(id: ID!): Order
        orders: [Order!]!  # New query - safe
      }

      type Order {
        id: ID!
        status: String!
        customer: Customer!
        createdAt: String  # New nullable field - safe
      }

      type Customer {
        id: ID!
        name: String!
        email: String  # New nullable field - safe
      }
    `);

    const changes = diff(oldSchema, newSchemaWithSafeChanges);

    const breakingChanges = changes.filter(c => c.criticality.level === 'BREAKING');

    expect(breakingChanges).toHaveLength(0);
  });
});
```

---

## Query Contract Testing

### Consumer Contract Definition

```typescript
// consumer-contracts/order-details.contract.ts
import { gql } from 'graphql-tag';

export const ORDER_DETAILS_QUERY = gql`
  query GetOrderDetails($orderId: ID!) {
    order(id: $orderId) {
      id
      status
      totalAmount {
        amount
        currency
      }
      items {
        id
        product {
          id
          name
        }
        quantity
        unitPrice {
          amount
          currency
        }
      }
      customer {
        id
        name
        email
      }
    }
  }
`;

// Expected response shape
export interface OrderDetailsResponse {
  order: {
    id: string;
    status: string;
    totalAmount: {
      amount: number;
      currency: string;
    };
    items: Array<{
      id: string;
      product: {
        id: string;
        name: string;
      };
      quantity: number;
      unitPrice: {
        amount: number;
        currency: string;
      };
    }>;
    customer: {
      id: string;
      name: string;
      email: string;
    };
  } | null;
}
```

### Pact GraphQL Testing

```typescript
// tests/contracts/graphql.pact.spec.ts
import { PactV4 } from '@pact-foundation/pact';
import { GraphQLInteraction } from '@pact-foundation/pact';

describe('Order Service GraphQL Contract', () => {
  const pact = new PactV4({
    consumer: 'OrderDashboard',
    provider: 'OrderService',
  });

  describe('GetOrderDetails query', () => {
    it('should return order details', async () => {
      await pact
        .addInteraction()
        .given('an order exists', { orderId: 'order-123' })
        .uponReceiving('a request for order details')
        .withRequest({
          method: 'POST',
          path: '/graphql',
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            query: `
              query GetOrderDetails($orderId: ID!) {
                order(id: $orderId) {
                  id
                  status
                  totalAmount {
                    amount
                    currency
                  }
                }
              }
            `,
            variables: {
              orderId: 'order-123',
            },
          },
        })
        .willRespondWith({
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            data: {
              order: {
                id: 'order-123',
                status: 'PENDING',
                totalAmount: {
                  amount: 99.99,
                  currency: 'USD',
                },
              },
            },
          },
        })
        .executeTest(async (mockServer) => {
          const client = createGraphQLClient(mockServer.url);

          const result = await client.query({
            query: ORDER_DETAILS_QUERY,
            variables: { orderId: 'order-123' },
          });

          expect(result.data.order.id).toBe('order-123');
          expect(result.data.order.status).toBe('PENDING');
        });
    });

    it('should handle order not found', async () => {
      await pact
        .addInteraction()
        .given('no orders exist')
        .uponReceiving('a request for non-existent order')
        .withRequest({
          method: 'POST',
          path: '/graphql',
          body: {
            query: expect.stringContaining('order(id: $orderId)'),
            variables: {
              orderId: 'non-existent',
            },
          },
        })
        .willRespondWith({
          status: 200,
          body: {
            data: {
              order: null,
            },
          },
        })
        .executeTest(async (mockServer) => {
          const client = createGraphQLClient(mockServer.url);

          const result = await client.query({
            query: ORDER_DETAILS_QUERY,
            variables: { orderId: 'non-existent' },
          });

          expect(result.data.order).toBeNull();
        });
    });
  });

  describe('CreateOrder mutation', () => {
    it('should create order successfully', async () => {
      await pact
        .addInteraction()
        .given('valid customer and products exist')
        .uponReceiving('a create order mutation')
        .withRequest({
          method: 'POST',
          path: '/graphql',
          body: {
            query: expect.stringContaining('mutation CreateOrder'),
            variables: {
              input: {
                customerId: 'cust-123',
                items: [
                  { productId: 'prod-1', quantity: 2 },
                ],
              },
            },
          },
        })
        .willRespondWith({
          status: 200,
          body: {
            data: {
              createOrder: {
                order: {
                  id: expect.any(String),
                  status: 'PENDING',
                },
                errors: [],
              },
            },
          },
        })
        .executeTest(async (mockServer) => {
          const client = createGraphQLClient(mockServer.url);

          const result = await client.mutate({
            mutation: CREATE_ORDER_MUTATION,
            variables: {
              input: {
                customerId: 'cust-123',
                items: [{ productId: 'prod-1', quantity: 2 }],
              },
            },
          });

          expect(result.data.createOrder.errors).toHaveLength(0);
          expect(result.data.createOrder.order.status).toBe('PENDING');
        });
    });
  });
});
```

---

## Provider Verification

### GraphQL Provider Tests

```typescript
// tests/provider/graphql.provider.spec.ts
import { Verifier } from '@pact-foundation/pact';
import { startTestServer } from '../utils/test-server';

describe('GraphQL Provider Verification', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('should verify consumer contracts', async () => {
    const verifier = new Verifier({
      provider: 'OrderService',
      providerBaseUrl: server.url,
      pactBrokerUrl: process.env.PACT_BROKER_URL,
      publishVerificationResult: true,
      providerVersion: process.env.GIT_COMMIT,
      stateHandlers: {
        'an order exists': async (params) => {
          await seedOrder(params.orderId);
        },
        'no orders exist': async () => {
          await clearOrders();
        },
        'valid customer and products exist': async () => {
          await seedCustomer('cust-123');
          await seedProduct('prod-1');
        },
      },
    });

    await verifier.verifyProvider();
  });
});
```

---

## Schema Evolution Patterns

### Safe Schema Changes

```graphql
# SAFE: Add new nullable field
type Order {
  id: ID!
  status: OrderStatus!
  # New field - safe because nullable
  trackingNumber: String
}

# SAFE: Add new query
type Query {
  order(id: ID!): Order
  # New query - safe
  ordersByCustomer(customerId: ID!): [Order!]!
}

# SAFE: Add new enum value
enum OrderStatus {
  PENDING
  CONFIRMED
  SHIPPED
  DELIVERED
  CANCELLED
  # New value - safe (consumers should handle unknown values)
  REFUNDED
}

# SAFE: Deprecate field
type Order {
  id: ID!
  """
  @deprecated Use shippingInfo instead
  """
  shippingAddress: String @deprecated(reason: "Use shippingInfo field")
  shippingInfo: ShippingInfo
}
```

### Breaking Changes to Avoid

```graphql
# BREAKING: Remove field
type Order {
  id: ID!
  # Removing 'status' breaks existing queries
}

# BREAKING: Make nullable field non-null
type Order {
  id: ID!
  # Was: trackingNumber: String
  trackingNumber: String!  # Breaking!
}

# BREAKING: Change field type
type Order {
  id: ID!
  # Was: totalAmount: Float!
  totalAmount: Money!  # Breaking!
}

# BREAKING: Remove enum value
enum OrderStatus {
  PENDING
  CONFIRMED
  # Removing SHIPPED breaks existing code
  DELIVERED
  CANCELLED
}
```

### Migration Strategy

```typescript
// schema-migration.ts

// Step 1: Add new field alongside old
const schemaV1 = `
  type Order {
    totalAmount: Float!  # Old field
    total: Money         # New field (nullable for transition)
  }
`;

// Step 2: Mark old field deprecated, make new field non-null
const schemaV2 = `
  type Order {
    totalAmount: Float! @deprecated(reason: "Use total field")
    total: Money!
  }
`;

// Step 3: Remove old field (major version bump)
const schemaV3 = `
  type Order {
    total: Money!
  }
`;
```

---

## Error Handling Contracts

### Error Response Structure

```graphql
type Query {
  order(id: ID!): OrderResult!
}

union OrderResult = Order | OrderNotFoundError | InvalidIdError

type OrderNotFoundError implements Error {
  message: String!
  orderId: ID!
}

type InvalidIdError implements Error {
  message: String!
  providedId: String!
}

interface Error {
  message: String!
}
```

### Testing Error Responses

```typescript
describe('GraphQL Error Contracts', () => {
  it('should return typed error for invalid ID', async () => {
    const query = gql`
      query GetOrder($id: ID!) {
        order(id: $id) {
          ... on Order {
            id
            status
          }
          ... on InvalidIdError {
            message
            providedId
          }
          ... on OrderNotFoundError {
            message
            orderId
          }
        }
      }
    `;

    const result = await client.query({
      query,
      variables: { id: 'invalid-format' },
    });

    expect(result.data.order.__typename).toBe('InvalidIdError');
    expect(result.data.order.message).toBeDefined();
  });
});
```

---

## CI/CD Integration

```yaml
# .github/workflows/graphql-contracts.yml
name: GraphQL Contract Tests

on:
  push:
    paths:
      - 'schema.graphql'
      - 'src/**'
      - 'tests/contracts/**'

jobs:
  schema-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Check schema validity
        run: npx graphql-inspector validate schema.graphql

      - name: Check breaking changes against main
        run: |
          npx graphql-inspector diff \
            origin/main:schema.graphql \
            schema.graphql \
            --fail-on-breaking

  contract-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run consumer contract tests
        run: npm run test:contracts:consumer

      - name: Run provider verification
        run: npm run test:contracts:provider

      - name: Publish contracts
        if: github.ref == 'refs/heads/main'
        run: npm run pact:publish
```

---

## Best Practices

| Practice | Rationale |
|----------|-----------|
| Use schema-first design | Schema is the contract |
| Version your schema | Track changes over time |
| Test all consumer queries | Cover actual usage patterns |
| Monitor field usage | Know what's safe to deprecate |
| Use union types for errors | Type-safe error handling |
| Deprecate before removing | Give consumers time to migrate |

---

*Guide from IDPF-Contract-Testing Framework*
