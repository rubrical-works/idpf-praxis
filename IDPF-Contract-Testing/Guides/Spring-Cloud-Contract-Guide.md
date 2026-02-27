# Spring Cloud Contract Guide
**Version:** v0.54.0

**Framework:** IDPF-Contract-Testing

---

## Overview

Spring Cloud Contract is a consumer-driven contract testing framework for Java/Spring applications. It supports both HTTP and messaging contracts with automatic stub generation and verification.

---

## Core Concepts

```
┌─────────────────────────────────────────────────────────────────┐
│                 SPRING CLOUD CONTRACT FLOW                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PRODUCER SIDE                    CONSUMER SIDE                 │
│  ┌──────────────────────────┐    ┌──────────────────────────┐  │
│  │ 1. Write contracts       │    │ 4. Use stubs             │  │
│  │    (Groovy/YAML/Java)    │    │    (from stub runner)    │  │
│  └───────────┬──────────────┘    └───────────┬──────────────┘  │
│              │                               │                  │
│              ▼                               │                  │
│  ┌──────────────────────────┐               │                  │
│  │ 2. Generate tests        │               │                  │
│  │    (contract verifier)   │               │                  │
│  └───────────┬──────────────┘               │                  │
│              │                               │                  │
│              ▼                               │                  │
│  ┌──────────────────────────┐               │                  │
│  │ 3. Publish stubs         │───────────────┘                  │
│  │    (to artifact repo)    │                                  │
│  └──────────────────────────┘                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Setup

### Maven Configuration (Producer)

```xml
<!-- pom.xml -->
<dependencies>
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-contract-verifier</artifactId>
        <scope>test</scope>
    </dependency>
</dependencies>

<build>
    <plugins>
        <plugin>
            <groupId>org.springframework.cloud</groupId>
            <artifactId>spring-cloud-contract-maven-plugin</artifactId>
            <version>4.1.0</version>
            <extensions>true</extensions>
            <configuration>
                <baseClassForTests>
                    com.example.contracts.BaseContractTest
                </baseClassForTests>
                <testFramework>JUNIT5</testFramework>
            </configuration>
        </plugin>
    </plugins>
</build>
```

### Maven Configuration (Consumer)

```xml
<!-- pom.xml -->
<dependencies>
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-contract-stub-runner</artifactId>
        <scope>test</scope>
    </dependency>
</dependencies>
```

### Gradle Configuration

```groovy
// build.gradle
plugins {
    id 'org.springframework.cloud.contract' version '4.1.0'
}

dependencies {
    testImplementation 'org.springframework.cloud:spring-cloud-starter-contract-verifier'
}

contracts {
    testFramework = TestFramework.JUNIT5
    baseClassForTests = 'com.example.contracts.BaseContractTest'
}
```

---

## Writing Contracts

### Groovy DSL Contract

```groovy
// src/test/resources/contracts/order/shouldReturnOrderById.groovy
import org.springframework.cloud.contract.spec.Contract

Contract.make {
    name "should return order by id"
    description "Returns order details when order exists"

    request {
        method GET()
        url("/api/orders/123")
        headers {
            contentType(applicationJson())
            header("Authorization", "Bearer valid-token")
        }
    }

    response {
        status OK()
        headers {
            contentType(applicationJson())
        }
        body([
            id: "123",
            customerId: "cust-456",
            status: "PENDING",
            totalAmount: 99.99,
            items: [
                [
                    productId: "prod-1",
                    quantity: 2,
                    price: 49.99
                ]
            ],
            createdAt: $(regex('[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z'))
        ])
    }
}
```

### YAML Contract

```yaml
# src/test/resources/contracts/order/shouldReturnOrderById.yml
name: should return order by id
description: Returns order details when order exists
request:
  method: GET
  url: /api/orders/123
  headers:
    Content-Type: application/json
    Authorization: Bearer valid-token
response:
  status: 200
  headers:
    Content-Type: application/json
  body:
    id: "123"
    customerId: "cust-456"
    status: "PENDING"
    totalAmount: 99.99
    items:
      - productId: "prod-1"
        quantity: 2
        price: 49.99
    createdAt: "2024-01-15T10:30:00Z"
  matchers:
    body:
      - path: $.createdAt
        type: by_regex
        value: "[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z"
```

### Contract with Dynamic Values

```groovy
// src/test/resources/contracts/order/shouldCreateOrder.groovy
import org.springframework.cloud.contract.spec.Contract

Contract.make {
    name "should create order"

    request {
        method POST()
        url("/api/orders")
        headers {
            contentType(applicationJson())
        }
        body([
            customerId: "cust-456",
            items: [
                [
                    productId: "prod-1",
                    quantity: 2
                ]
            ]
        ])
    }

    response {
        status CREATED()
        headers {
            contentType(applicationJson())
        }
        body([
            id: $(producer(regex('[a-f0-9-]{36}')), consumer('order-123')),
            customerId: fromRequest().body('$.customerId'),
            status: "PENDING",
            totalAmount: $(producer(anyDouble()), consumer(99.99)),
            createdAt: $(producer(isoDateTime()), consumer('2024-01-15T10:30:00Z'))
        ])
    }
}
```

---

## Producer (Server) Side

### Base Test Class

```java
// src/test/java/com/example/contracts/BaseContractTest.java
package com.example.contracts;

import io.restassured.module.mockmvc.RestAssuredMockMvc;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.web.context.WebApplicationContext;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
public abstract class BaseContractTest {

    @Autowired
    private WebApplicationContext context;

    @MockBean
    private OrderService orderService;

    @MockBean
    private OrderRepository orderRepository;

    @BeforeEach
    void setup() {
        RestAssuredMockMvc.webAppContextSetup(context);

        // Setup mocks for contract verification
        setupOrderMocks();
    }

    private void setupOrderMocks() {
        Order order = Order.builder()
            .id("123")
            .customerId("cust-456")
            .status(OrderStatus.PENDING)
            .totalAmount(new BigDecimal("99.99"))
            .items(List.of(
                OrderItem.builder()
                    .productId("prod-1")
                    .quantity(2)
                    .price(new BigDecimal("49.99"))
                    .build()
            ))
            .createdAt(Instant.parse("2024-01-15T10:30:00Z"))
            .build();

        when(orderService.findById("123")).thenReturn(Optional.of(order));
        when(orderService.findById("non-existent")).thenReturn(Optional.empty());

        when(orderService.createOrder(any(CreateOrderRequest.class)))
            .thenAnswer(invocation -> {
                CreateOrderRequest request = invocation.getArgument(0);
                return Order.builder()
                    .id(UUID.randomUUID().toString())
                    .customerId(request.getCustomerId())
                    .status(OrderStatus.PENDING)
                    .totalAmount(calculateTotal(request.getItems()))
                    .createdAt(Instant.now())
                    .build();
            });
    }
}
```

### Per-Contract Base Classes

```java
// For different contract scenarios, you can use specific base classes
// src/test/java/com/example/contracts/OrderContractBase.java
@SpringBootTest
public abstract class OrderContractBase {

    @BeforeEach
    void setup() {
        // Setup for order contracts
    }
}

// src/test/java/com/example/contracts/CustomerContractBase.java
@SpringBootTest
public abstract class CustomerContractBase {

    @BeforeEach
    void setup() {
        // Setup for customer contracts
    }
}

// Configure in plugin
// <baseClassMappings>
//   <baseClassMapping>
//     <contractPackageRegex>.*order.*</contractPackageRegex>
//     <baseClassFQN>com.example.contracts.OrderContractBase</baseClassFQN>
//   </baseClassMapping>
// </baseClassMappings>
```

### Generated Test Example

The plugin generates tests like:

```java
// target/generated-test-sources/contracts/com/example/contracts/ContractVerifierTest.java
public class ContractVerifierTest extends BaseContractTest {

    @Test
    public void validate_shouldReturnOrderById() throws Exception {
        // given:
        MockMvcRequestSpecification request = given()
            .header("Content-Type", "application/json")
            .header("Authorization", "Bearer valid-token");

        // when:
        ResponseOptions response = given().spec(request)
            .get("/api/orders/123");

        // then:
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.header("Content-Type")).matches("application/json.*");

        // and:
        DocumentContext parsedJson = JsonPath.parse(response.getBody().asString());
        assertThatJson(parsedJson).field("['id']").isEqualTo("123");
        assertThatJson(parsedJson).field("['status']").isEqualTo("PENDING");
        // ... more assertions
    }
}
```

---

## Consumer (Client) Side

### Stub Runner Test

```java
// src/test/java/com/example/client/OrderClientContractTest.java
package com.example.client;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cloud.contract.stubrunner.spring.AutoConfigureStubRunner;
import org.springframework.cloud.contract.stubrunner.spring.StubRunnerProperties;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureStubRunner(
    ids = "com.example:order-service:+:stubs:8080",
    stubsMode = StubRunnerProperties.StubsMode.LOCAL
)
class OrderClientContractTest {

    @Autowired
    private OrderClient orderClient;

    @Test
    void shouldRetrieveOrderById() {
        // given
        String orderId = "123";

        // when
        Order order = orderClient.getOrder(orderId);

        // then
        assertThat(order).isNotNull();
        assertThat(order.getId()).isEqualTo("123");
        assertThat(order.getStatus()).isEqualTo("PENDING");
        assertThat(order.getTotalAmount()).isEqualTo(99.99);
    }

    @Test
    void shouldCreateOrder() {
        // given
        CreateOrderRequest request = new CreateOrderRequest(
            "cust-456",
            List.of(new OrderItemRequest("prod-1", 2))
        );

        // when
        Order order = orderClient.createOrder(request);

        // then
        assertThat(order).isNotNull();
        assertThat(order.getCustomerId()).isEqualTo("cust-456");
        assertThat(order.getStatus()).isEqualTo("PENDING");
    }
}
```

### Stub Runner from Remote Repository

```java
@AutoConfigureStubRunner(
    ids = "com.example:order-service:+:stubs",
    stubsMode = StubRunnerProperties.StubsMode.REMOTE,
    repositoryRoot = "https://nexus.example.com/repository/maven-releases/"
)
class OrderClientRemoteStubTest {
    // Tests using stubs from Maven repository
}
```

### Programmatic Stub Runner

```java
@Test
void shouldWorkWithProgrammaticStubRunner() {
    try (StubRunner stubRunner = new StubRunner(
        StubRunnerOptions.builder()
            .stubsMode(StubRunnerProperties.StubsMode.LOCAL)
            .withStubsClassifier("stubs")
            .withIds("com.example:order-service:+:stubs:8080")
            .build()
    )) {
        stubRunner.runStubs();

        // Use the stub
        RestTemplate restTemplate = new RestTemplate();
        Order order = restTemplate.getForObject(
            "http://localhost:8080/api/orders/123",
            Order.class
        );

        assertThat(order.getId()).isEqualTo("123");
    }
}
```

---

## Messaging Contracts

### Message Producer Contract

```groovy
// src/test/resources/contracts/messaging/shouldSendOrderCreatedEvent.groovy
import org.springframework.cloud.contract.spec.Contract

Contract.make {
    name "should send order created event"
    label "orderCreated"
    input {
        triggeredBy("sendOrderCreatedEvent()")
    }
    outputMessage {
        sentTo("orders")
        headers {
            header("contentType", "application/json")
            header("eventType", "OrderCreated")
        }
        body([
            orderId: $(anyUuid()),
            customerId: "cust-456",
            totalAmount: 99.99,
            status: "PENDING"
        ])
    }
}
```

### Message Base Test Class

```java
// src/test/java/com/example/contracts/MessagingContractBase.java
@SpringBootTest
@AutoConfigureMessageVerifier
public abstract class MessagingContractBase {

    @Autowired
    private OrderEventPublisher orderEventPublisher;

    public void sendOrderCreatedEvent() {
        Order order = Order.builder()
            .id(UUID.randomUUID().toString())
            .customerId("cust-456")
            .totalAmount(new BigDecimal("99.99"))
            .status(OrderStatus.PENDING)
            .build();

        orderEventPublisher.publishOrderCreated(order);
    }
}
```

### Message Consumer Contract Test

```java
@SpringBootTest
@AutoConfigureStubRunner(
    ids = "com.example:order-service:+:stubs"
)
class OrderEventConsumerTest {

    @Autowired
    private StubTrigger stubTrigger;

    @Autowired
    private OrderEventHandler orderEventHandler;

    @Test
    void shouldHandleOrderCreatedEvent() {
        // Trigger the stub to send the message
        stubTrigger.trigger("orderCreated");

        // Verify handler processed the message
        await().atMost(5, SECONDS).untilAsserted(() -> {
            assertThat(orderEventHandler.getProcessedEvents())
                .hasSize(1);
        });
    }
}
```

---

## Advanced Patterns

### Contract Inheritance

```groovy
// src/test/resources/contracts/common/authenticated.groovy
Contract.make {
    name "base authenticated request"
    request {
        headers {
            header("Authorization", "Bearer valid-token")
        }
    }
}

// src/test/resources/contracts/order/getOrder.groovy
import static org.springframework.cloud.contract.spec.ContractDsl.*

Contract.make {
    name "get order authenticated"
    extends("common/authenticated")
    request {
        method GET()
        url "/api/orders/123"
    }
    response {
        status OK()
        body([id: "123"])
    }
}
```

### Stateful Contracts (Scenarios)

```groovy
// Contract for first request
Contract.make {
    name "create order - first step"
    request {
        method POST()
        url "/api/orders"
    }
    response {
        status CREATED()
        body([id: "new-order-123"])
    }
}

// Contract for subsequent request
Contract.make {
    name "get created order - second step"
    priority 1  // Lower priority = runs later
    request {
        method GET()
        url "/api/orders/new-order-123"
    }
    response {
        status OK()
        body([id: "new-order-123", status: "PENDING"])
    }
}
```

### Contract with Regex Patterns

```groovy
Contract.make {
    request {
        method GET()
        urlPath($(
            consumer(regex('/api/orders/[a-f0-9-]{36}')),
            producer('/api/orders/123e4567-e89b-12d3-a456-426614174000')
        ))
    }
    response {
        status OK()
        body([
            id: $(
                producer(regex('[a-f0-9-]{36}')),
                consumer('123e4567-e89b-12d3-a456-426614174000')
            ),
            email: $(
                producer(regex('[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}')),
                consumer('test@example.com')
            )
        ])
    }
}
```

---

## CI/CD Integration

### Maven Build Pipeline

```yaml
# .github/workflows/contract-tests.yml
name: Contract Tests

on: [push, pull_request]

jobs:
  producer-contracts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up JDK
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'

      - name: Run contract tests
        run: mvn verify -DskipIntegrationTests

      - name: Publish stubs
        if: github.ref == 'refs/heads/main'
        run: mvn deploy -DskipTests
        env:
          MAVEN_USERNAME: ${{ secrets.MAVEN_USERNAME }}
          MAVEN_PASSWORD: ${{ secrets.MAVEN_PASSWORD }}

  consumer-contracts:
    needs: producer-contracts
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up JDK
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'

      - name: Run consumer contract tests
        run: mvn verify -Pcontract-tests
```

### Publishing Stubs

```xml
<!-- pom.xml -->
<plugin>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-contract-maven-plugin</artifactId>
    <extensions>true</extensions>
    <configuration>
        <baseClassForTests>
            com.example.contracts.BaseContractTest
        </baseClassForTests>
    </configuration>
    <executions>
        <execution>
            <goals>
                <goal>convert</goal>
                <goal>generateStubs</goal>
            </goals>
        </execution>
    </executions>
</plugin>
```

---

## Best Practices

| Practice | Rationale |
|----------|-----------|
| One contract per scenario | Clear, focused tests |
| Use meaningful names | Self-documenting contracts |
| Test edge cases | Error responses, empty results |
| Keep contracts in sync | Update when API changes |
| Use dynamic values where appropriate | Realistic stubs |
| Version your stubs | Manage compatibility |

---

## Common Issues

| Issue | Solution |
|-------|----------|
| Generated tests fail | Check base class setup and mocks |
| Stub not found | Verify artifact coordinates |
| Port conflicts | Use random ports or configure differently |
| JSON matching issues | Use proper matchers for dynamic values |
| Message contracts not triggering | Verify messaging configuration |

---

*Guide from IDPF-Contract-Testing Framework*
