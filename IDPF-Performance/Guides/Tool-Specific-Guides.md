# Performance Testing Tool Guides
**Version:** v0.52.0

**Framework:** IDPF-Performance

---

## Overview

This guide provides comparable coverage for the major performance testing tools: k6, JMeter, and Gatling. Each section covers setup, basic usage, advanced features, and CI/CD integration.

---

## Tool Comparison

| Feature | k6 | JMeter | Gatling |
|---------|----|---------|---------|
| **Language** | JavaScript | XML/GUI | Scala/Java |
| **Execution** | CLI | GUI/CLI | CLI/SBT |
| **Resource Usage** | Low | High | Medium |
| **Learning Curve** | Easy | Medium | Medium |
| **Scripting** | Code-first | GUI-first | Code-first |
| **Cloud Option** | k6 Cloud | BlazeMeter | Gatling Enterprise |
| **Best For** | Developers | Testers | Developers |

---

## k6

### Installation

```bash
# macOS
brew install k6

# Windows
choco install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | \
  sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Docker
docker run -i grafana/k6 run - <script.js
```

### Basic Test Script

```javascript
// basic-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function() {
  const res = http.get('https://api.example.com/users');

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
```

### Advanced Scenarios

```javascript
// advanced-scenarios.js
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend, Counter, Rate } from 'k6/metrics';

// Custom metrics
const loginDuration = new Trend('login_duration');
const orderCount = new Counter('orders_created');
const orderSuccess = new Rate('order_success_rate');

// Load test data
const users = new SharedArray('users', function() {
  return JSON.parse(open('./users.json'));
});

export const options = {
  scenarios: {
    // Smoke test
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '1m',
      tags: { test_type: 'smoke' },
    },
    // Load test
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 100 },
        { duration: '10m', target: 100 },
        { duration: '5m', target: 0 },
      ],
      startTime: '1m',
      tags: { test_type: 'load' },
    },
    // Stress test
    stress: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 500,
      maxVUs: 1000,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '5m', target: 200 },
        { duration: '2m', target: 50 },
      ],
      startTime: '20m',
      tags: { test_type: 'stress' },
    },
  },
};

export function setup() {
  // Login and get auth token
  const loginRes = http.post('https://api.example.com/auth/login', {
    email: 'admin@example.com',
    password: 'password',
  });
  return { token: loginRes.json('token') };
}

export default function(data) {
  const user = users[__VU % users.length];

  group('User Flow', function() {
    // Login
    group('Login', function() {
      const start = Date.now();
      const loginRes = http.post('https://api.example.com/auth/login', {
        email: user.email,
        password: user.password,
      });
      loginDuration.add(Date.now() - start);

      check(loginRes, {
        'login successful': (r) => r.status === 200,
      });
    });

    // Browse products
    group('Browse', function() {
      const productsRes = http.get('https://api.example.com/products', {
        headers: { Authorization: `Bearer ${data.token}` },
      });

      check(productsRes, {
        'products loaded': (r) => r.status === 200,
      });
    });

    // Create order
    group('Order', function() {
      const orderRes = http.post('https://api.example.com/orders',
        JSON.stringify({ productId: 1, quantity: 1 }),
        { headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.token}`,
        }}
      );

      const success = orderRes.status === 201;
      orderCount.add(1);
      orderSuccess.add(success);

      check(orderRes, {
        'order created': (r) => r.status === 201,
      });
    });
  });

  sleep(Math.random() * 3 + 1);
}

export function teardown(data) {
  // Cleanup
  console.log('Test completed');
}
```

### k6 CI/CD Integration

```yaml
# .github/workflows/k6-tests.yml
name: k6 Performance Tests

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 2 * * *'

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run k6 test
        uses: grafana/k6-action@v0.3.1
        with:
          filename: tests/performance/load-test.js
          flags: --out json=results.json

      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: k6-results
          path: results.json
```

---

## Apache JMeter

### Installation

```bash
# Download from Apache
wget https://dlcdn.apache.org/jmeter/binaries/apache-jmeter-5.6.2.tgz
tar -xzf apache-jmeter-5.6.2.tgz
export PATH=$PATH:$(pwd)/apache-jmeter-5.6.2/bin

# macOS with Homebrew
brew install jmeter

# Verify installation
jmeter --version
```

### GUI Test Plan Creation

```
Test Plan
├── Thread Group
│   ├── Users: 100
│   ├── Ramp-up: 60 seconds
│   └── Loop Count: 10
├── HTTP Request Defaults
│   ├── Server: api.example.com
│   └── Protocol: https
├── HTTP Header Manager
│   └── Content-Type: application/json
├── HTTP Request (Login)
│   ├── Method: POST
│   ├── Path: /auth/login
│   └── Body: {"email":"${email}","password":"${password}"}
├── JSON Extractor
│   └── Variable: token
├── HTTP Request (Get Products)
│   ├── Method: GET
│   ├── Path: /products
│   └── Header: Authorization: Bearer ${token}
├── Response Assertion
│   └── Response Code: 200
├── Summary Report
└── View Results Tree
```

### JMeter Test Plan (XML)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testname="API Load Test">
      <stringProp name="TestPlan.comments">Performance test for API</stringProp>
      <boolProp name="TestPlan.functional_mode">false</boolProp>
    </TestPlan>
    <hashTree>
      <!-- Thread Group -->
      <ThreadGroup guiclass="ThreadGroupGui" testname="Users">
        <stringProp name="ThreadGroup.num_threads">100</stringProp>
        <stringProp name="ThreadGroup.ramp_time">60</stringProp>
        <stringProp name="ThreadGroup.duration">600</stringProp>
        <boolProp name="ThreadGroup.scheduler">true</boolProp>
      </ThreadGroup>
      <hashTree>
        <!-- HTTP Request -->
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testname="Get Users">
          <stringProp name="HTTPSampler.domain">api.example.com</stringProp>
          <stringProp name="HTTPSampler.protocol">https</stringProp>
          <stringProp name="HTTPSampler.path">/users</stringProp>
          <stringProp name="HTTPSampler.method">GET</stringProp>
        </HTTPSamplerProxy>
        <hashTree>
          <!-- Response Assertion -->
          <ResponseAssertion guiclass="AssertionGui" testname="Check Status">
            <collectionProp name="Asserion.test_strings">
              <stringProp>200</stringProp>
            </collectionProp>
            <stringProp name="Assertion.test_field">Assertion.response_code</stringProp>
          </ResponseAssertion>
        </hashTree>
      </hashTree>
    </hashTree>
  </hashTree>
</jmeterTestPlan>
```

### JMeter CLI Execution

```bash
# Run test plan
jmeter -n -t test-plan.jmx -l results.jtl -j jmeter.log

# With parameters
jmeter -n -t test-plan.jmx \
  -Jthreads=100 \
  -Jrampup=60 \
  -Jduration=600 \
  -l results.jtl

# Generate HTML report
jmeter -g results.jtl -o report/

# Run with plugins
jmeter -n -t test-plan.jmx \
  -l results.jtl \
  -e -o dashboard/
```

### JMeter Properties for Tuning

```properties
# jmeter.properties
# Increase heap size for large tests
HEAP="-Xms4g -Xmx8g"

# Disable GUI components for CLI
jmeter.save.saveservice.output_format=csv
jmeter.save.saveservice.response_data=false
jmeter.save.saveservice.samplerData=false
jmeter.save.saveservice.responseHeaders=false
jmeter.save.saveservice.requestHeaders=false

# Connection settings
httpclient4.retrycount=0
httpclient.timeout=30000
```

### JMeter CI/CD Integration

```yaml
# .github/workflows/jmeter-tests.yml
name: JMeter Performance Tests

on:
  push:
    branches: [main]

jobs:
  performance-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup JMeter
        run: |
          wget https://dlcdn.apache.org/jmeter/binaries/apache-jmeter-5.6.2.tgz
          tar -xzf apache-jmeter-5.6.2.tgz

      - name: Run JMeter test
        run: |
          ./apache-jmeter-5.6.2/bin/jmeter -n \
            -t tests/performance/test-plan.jmx \
            -l results.jtl \
            -e -o report/

      - name: Upload report
        uses: actions/upload-artifact@v4
        with:
          name: jmeter-report
          path: report/
```

---

## Gatling

### Installation

```bash
# Download Gatling
wget https://repo1.maven.org/maven2/io/gatling/highcharts/gatling-charts-highcharts-bundle/3.10.3/gatling-charts-highcharts-bundle-3.10.3-bundle.zip
unzip gatling-charts-highcharts-bundle-3.10.3-bundle.zip

# Or use Maven/SBT project
```

### Maven Project Setup

```xml
<!-- pom.xml -->
<project>
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId>
  <artifactId>performance-tests</artifactId>
  <version>1.0-SNAPSHOT</version>

  <properties>
    <maven.compiler.source>17</maven.compiler.source>
    <maven.compiler.target>17</maven.compiler.target>
    <gatling.version>3.10.3</gatling.version>
    <gatling-maven-plugin.version>4.7.0</gatling-maven-plugin.version>
  </properties>

  <dependencies>
    <dependency>
      <groupId>io.gatling.highcharts</groupId>
      <artifactId>gatling-charts-highcharts</artifactId>
      <version>${gatling.version}</version>
      <scope>test</scope>
    </dependency>
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <groupId>io.gatling</groupId>
        <artifactId>gatling-maven-plugin</artifactId>
        <version>${gatling-maven-plugin.version}</version>
      </plugin>
    </plugins>
  </build>
</project>
```

### Basic Simulation

```scala
// src/test/scala/simulations/BasicSimulation.scala
package simulations

import io.gatling.core.Predef._
import io.gatling.http.Predef._
import scala.concurrent.duration._

class BasicSimulation extends Simulation {

  val httpProtocol = http
    .baseUrl("https://api.example.com")
    .acceptHeader("application/json")
    .contentTypeHeader("application/json")

  val scn = scenario("Basic Load Test")
    .exec(
      http("Get Users")
        .get("/users")
        .check(status.is(200))
        .check(jsonPath("$[*]").count.gt(0))
    )
    .pause(1.second, 3.seconds)

  setUp(
    scn.inject(
      rampUsers(100).during(60.seconds)
    )
  ).protocols(httpProtocol)
    .assertions(
      global.responseTime.percentile(95).lt(500),
      global.failedRequests.percent.lt(1)
    )
}
```

### Advanced Simulation

```scala
// src/test/scala/simulations/AdvancedSimulation.scala
package simulations

import io.gatling.core.Predef._
import io.gatling.http.Predef._
import scala.concurrent.duration._

class AdvancedSimulation extends Simulation {

  val httpProtocol = http
    .baseUrl("https://api.example.com")
    .acceptHeader("application/json")
    .contentTypeHeader("application/json")
    .shareConnections

  // Load test data from CSV
  val usersFeeder = csv("users.csv").circular

  // Custom headers
  def authHeader(token: String) = Map("Authorization" -> s"Bearer $token")

  // Login chain
  val login = exec(
    http("Login")
      .post("/auth/login")
      .body(StringBody("""{"email":"${email}","password":"${password}"}"""))
      .check(status.is(200))
      .check(jsonPath("$.token").saveAs("authToken"))
  )

  // Browse products chain
  val browseProducts = exec(
    http("Get Products")
      .get("/products")
      .headers(authHeader("${authToken}"))
      .check(status.is(200))
      .check(jsonPath("$[0].id").saveAs("productId"))
  )

  // Create order chain
  val createOrder = exec(
    http("Create Order")
      .post("/orders")
      .headers(authHeader("${authToken}"))
      .body(StringBody("""{"productId":"${productId}","quantity":1}"""))
      .check(status.is(201))
  )

  // Complete user journey
  val userJourney = scenario("User Journey")
    .feed(usersFeeder)
    .exec(login)
    .pause(1.second)
    .exec(browseProducts)
    .pause(2.seconds)
    .exec(createOrder)
    .pause(1.second)

  // API stress scenario
  val apiStress = scenario("API Stress")
    .exec(
      http("Health Check")
        .get("/health")
        .check(status.is(200))
    )

  setUp(
    userJourney.inject(
      nothingFor(10.seconds),
      rampUsers(50).during(2.minutes),
      constantUsersPerSec(10).during(5.minutes),
      rampUsersPerSec(10).to(50).during(3.minutes)
    ),
    apiStress.inject(
      constantUsersPerSec(100).during(10.minutes)
    )
  ).protocols(httpProtocol)
    .assertions(
      global.responseTime.percentile(95).lt(1000),
      global.failedRequests.percent.lt(5),
      details("Login").responseTime.percentile(99).lt(2000)
    )
}
```

### Gatling Execution

```bash
# Using Maven
mvn gatling:test

# Specific simulation
mvn gatling:test -Dgatling.simulationClass=simulations.AdvancedSimulation

# Using Gatling bundle
./bin/gatling.sh -s simulations.BasicSimulation

# With parameters
./bin/gatling.sh -s simulations.BasicSimulation \
  -rd "Load Test Run" \
  -rf results/
```

### Gatling CI/CD Integration

```yaml
# .github/workflows/gatling-tests.yml
name: Gatling Performance Tests

on:
  push:
    branches: [main]

jobs:
  performance-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'
          cache: 'maven'

      - name: Run Gatling tests
        run: mvn gatling:test

      - name: Upload report
        uses: actions/upload-artifact@v4
        with:
          name: gatling-report
          path: target/gatling/
```

---

## Tool Selection Guide

| Use Case | Recommended Tool |
|----------|-----------------|
| Developer-written tests | k6 or Gatling |
| QA team with GUI preference | JMeter |
| JavaScript ecosystem | k6 |
| Java/Scala ecosystem | Gatling |
| Legacy/existing JMeter tests | JMeter |
| Cloud-native testing | k6 |
| Complex protocol testing | JMeter |
| CI/CD first approach | k6 or Gatling |

---

*Guide from IDPF-Performance Framework*
