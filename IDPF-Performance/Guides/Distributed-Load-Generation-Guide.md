# Distributed Load Generation Patterns Guide
**Version:** v0.49.0

**Framework:** IDPF-Performance

---

## Overview

Distributed load generation enables simulating realistic traffic volumes that exceed single-machine capabilities. This guide covers coordinator/worker patterns, result aggregation, and orchestration strategies.

---

## When to Use Distributed Load

| Scenario | Single Machine | Distributed |
|----------|----------------|-------------|
| < 1,000 VUs | ✓ | |
| 1,000 - 10,000 VUs | Maybe | ✓ |
| > 10,000 VUs | | ✓ |
| Geographically distributed users | | ✓ |
| Network bandwidth limited | | ✓ |
| CPU-intensive scripts | | ✓ |

---

## Architecture Patterns

### Coordinator/Worker Pattern

```
                    ┌─────────────────┐
                    │   Coordinator   │
                    │  (Orchestrator) │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│    Worker 1     │ │    Worker 2     │ │    Worker 3     │
│   (Region A)    │ │   (Region B)    │ │   (Region C)    │
│                 │ │                 │ │                 │
│ - 1000 VUs      │ │ - 1000 VUs      │ │ - 1000 VUs      │
│ - Local metrics │ │ - Local metrics │ │ - Local metrics │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   Aggregator    │
                    │  (Metrics DB)   │
                    └─────────────────┘
```

### Responsibilities

| Component | Responsibilities |
|-----------|-----------------|
| **Coordinator** | Test distribution, synchronization, timing |
| **Worker** | Script execution, local metrics, heartbeat |
| **Aggregator** | Collect results, calculate statistics |
| **Reporter** | Generate unified report |

---

## k6 Distributed Execution

### Using k6 Cloud

```javascript
// test.js - runs distributed automatically on k6 cloud
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  cloud: {
    projectID: 12345,
    name: 'Distributed Load Test',
    distribution: {
      'amazon:us:ashburn': { loadZone: 'amazon:us:ashburn', percent: 34 },
      'amazon:eu:frankfurt': { loadZone: 'amazon:eu:frankfurt', percent: 33 },
      'amazon:ap:tokyo': { loadZone: 'amazon:ap:tokyo', percent: 33 },
    },
  },
  scenarios: {
    global_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 3000 },
        { duration: '10m', target: 3000 },
        { duration: '2m', target: 0 },
      ],
    },
  },
};

export default function() {
  http.get('https://api.example.com/endpoint');
}
```

### Using k6 Operator (Kubernetes)

```yaml
# k6-test.yaml
apiVersion: k6.io/v1alpha1
kind: K6
metadata:
  name: distributed-load-test
spec:
  parallelism: 4  # Number of worker pods
  script:
    configMap:
      name: k6-test-script
      file: test.js
  arguments: --out influxdb=http://influxdb:8086/k6
  runner:
    image: grafana/k6:latest
    resources:
      limits:
        cpu: "2"
        memory: "2Gi"
      requests:
        cpu: "1"
        memory: "1Gi"
```

```javascript
// test.js for k6 operator
export const options = {
  scenarios: {
    distributed: {
      executor: 'constant-vus',
      vus: 250,  // Per worker (250 * 4 = 1000 total)
      duration: '10m',
    },
  },
};
```

---

## JMeter Distributed Testing

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    JMeter Controller                     │
│  (GUI or non-GUI mode)                                  │
│  - Distributes test plan                                │
│  - Collects results                                     │
└─────────────────────────┬───────────────────────────────┘
                          │ RMI
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  JMeter Server  │ │  JMeter Server  │ │  JMeter Server  │
│   (Worker 1)    │ │   (Worker 2)    │ │   (Worker 3)    │
│   Port: 1099    │ │   Port: 1099    │ │   Port: 1099    │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### Server Configuration

```properties
# jmeter.properties on each server
server_port=1099
server.rmi.localport=1099
server.rmi.ssl.disable=true  # Or configure SSL

# Remote hosts (controller only)
remote_hosts=worker1:1099,worker2:1099,worker3:1099
```

### Starting Workers

```bash
# On each worker machine
# Start JMeter server
./jmeter-server -Djava.rmi.server.hostname=<worker-ip>

# Or with specific port
./jmeter-server \
  -Dserver_port=1099 \
  -Djava.rmi.server.hostname=192.168.1.100
```

### Running Distributed Test

```bash
# From controller
./jmeter -n -t test-plan.jmx \
  -R worker1:1099,worker2:1099,worker3:1099 \
  -l results.jtl \
  -j jmeter.log \
  -Djava.rmi.server.hostname=<controller-ip>

# Or use remote_hosts from properties
./jmeter -n -t test-plan.jmx -r -l results.jtl
```

### Docker Compose Setup

```yaml
# docker-compose.yml
version: '3.8'

services:
  jmeter-master:
    image: justb4/jmeter:latest
    command: |
      -n -t /tests/test-plan.jmx
      -R jmeter-slave1,jmeter-slave2
      -l /results/results.jtl
    volumes:
      - ./tests:/tests
      - ./results:/results
    depends_on:
      - jmeter-slave1
      - jmeter-slave2

  jmeter-slave1:
    image: justb4/jmeter:latest
    command: -s -Jserver.rmi.ssl.disable=true
    expose:
      - "1099"
      - "50000"

  jmeter-slave2:
    image: justb4/jmeter:latest
    command: -s -Jserver.rmi.ssl.disable=true
    expose:
      - "1099"
      - "50000"
```

---

## Gatling Distributed Testing

### Using Gatling Enterprise (FrontLine)

```scala
// Gatling simulation
class DistributedSimulation extends Simulation {

  val httpProtocol = http
    .baseUrl("https://api.example.com")
    .acceptHeader("application/json")

  val scn = scenario("Load Test")
    .exec(http("API Call")
      .get("/endpoint")
      .check(status.is(200)))

  setUp(
    scn.inject(
      rampUsers(1000).during(2.minutes),
      constantUsersPerSec(100).during(10.minutes)
    )
  ).protocols(httpProtocol)
}
```

### Manual Distribution with Aggregation

```bash
#!/bin/bash
# run-distributed.sh

# Define workers
WORKERS=("worker1" "worker2" "worker3")
USERS_PER_WORKER=1000
SIMULATION="DistributedSimulation"

# Start tests on all workers
for worker in "${WORKERS[@]}"; do
  ssh $worker "cd /opt/gatling && \
    ./bin/gatling.sh -s $SIMULATION \
    -rd 'Distributed test' \
    -rf /tmp/results-$worker" &
done

# Wait for completion
wait

# Collect results
mkdir -p /tmp/aggregated-results
for worker in "${WORKERS[@]}"; do
  scp -r $worker:/tmp/results-$worker/* /tmp/aggregated-results/
done

# Aggregate (requires custom script or Gatling Enterprise)
./aggregate-results.sh /tmp/aggregated-results
```

---

## Result Aggregation

### Metrics Aggregation Strategy

```python
# aggregate_results.py
import pandas as pd
import numpy as np
from typing import List, Dict

def aggregate_worker_results(
    worker_results: List[pd.DataFrame]
) -> Dict[str, float]:
    """Aggregate metrics from multiple workers."""

    # Combine all response times
    all_response_times = pd.concat(
        [df['response_time'] for df in worker_results]
    )

    # Aggregate throughput (sum)
    total_requests = sum(len(df) for df in worker_results)
    total_duration = max(df['timestamp'].max() for df in worker_results) - \
                     min(df['timestamp'].min() for df in worker_results)
    throughput = total_requests / total_duration.total_seconds()

    # Aggregate errors (sum counts, calculate rate)
    total_errors = sum(
        (df['status'] >= 400).sum() for df in worker_results
    )
    error_rate = total_errors / total_requests

    return {
        'total_requests': total_requests,
        'throughput_rps': throughput,
        'error_rate': error_rate,
        'response_time_mean': all_response_times.mean(),
        'response_time_p50': all_response_times.quantile(0.50),
        'response_time_p90': all_response_times.quantile(0.90),
        'response_time_p95': all_response_times.quantile(0.95),
        'response_time_p99': all_response_times.quantile(0.99),
    }
```

### InfluxDB Aggregation

```sql
-- Query aggregated metrics from distributed test
SELECT
  mean("value") as mean_response_time,
  percentile("value", 95) as p95_response_time,
  percentile("value", 99) as p99_response_time
FROM "http_req_duration"
WHERE time > now() - 1h
  AND "testId" = 'distributed-test-001'
GROUP BY time(1m)

-- Throughput across all workers
SELECT
  sum("count") as total_requests
FROM "http_reqs"
WHERE time > now() - 1h
GROUP BY time(1s)
```

### Grafana Dashboard

```json
{
  "panels": [
    {
      "title": "Aggregated Response Time",
      "type": "timeseries",
      "targets": [
        {
          "query": "SELECT percentile(\"value\", 95) FROM \"http_req_duration\" WHERE $timeFilter GROUP BY time(10s), \"worker\"",
          "alias": "P95 by Worker"
        },
        {
          "query": "SELECT percentile(\"value\", 95) FROM \"http_req_duration\" WHERE $timeFilter GROUP BY time(10s)",
          "alias": "P95 Aggregated"
        }
      ]
    },
    {
      "title": "Total Throughput",
      "type": "stat",
      "targets": [
        {
          "query": "SELECT sum(\"count\") / $__interval_ms * 1000 FROM \"http_reqs\" WHERE $timeFilter"
        }
      ]
    }
  ]
}
```

---

## Synchronization Strategies

### Barrier Synchronization

```javascript
// k6 - rendezvous point (requires k6 extension)
import { Barrier } from 'k6/x/barrier';

const barrier = new Barrier(100);  // Wait for 100 VUs

export default function() {
  // Setup phase
  setup();

  // All VUs wait here until 100 are ready
  barrier.await();

  // Synchronized start - all VUs proceed together
  http.get('https://api.example.com/endpoint');
}
```

### Time-Based Synchronization

```javascript
// Synchronized start using wall clock
export const options = {
  scenarios: {
    sync_start: {
      executor: 'shared-iterations',
      vus: 100,
      iterations: 1000,
      startTime: '2024-01-15T14:00:00Z',  // Absolute start time
    },
  },
};
```

### Message Queue Coordination

```python
# coordinator.py
import redis
from datetime import datetime, timedelta

class TestCoordinator:
    def __init__(self, redis_url: str, worker_count: int):
        self.redis = redis.from_url(redis_url)
        self.worker_count = worker_count
        self.test_id = None

    def start_test(self, test_id: str, start_delay_seconds: int = 30):
        """Signal all workers to start at synchronized time."""
        self.test_id = test_id
        start_time = datetime.utcnow() + timedelta(seconds=start_delay_seconds)

        self.redis.hset(f"test:{test_id}", mapping={
            "status": "pending",
            "start_time": start_time.isoformat(),
            "worker_count": self.worker_count
        })

        # Publish start signal
        self.redis.publish("test_control", f"START:{test_id}")

    def wait_for_completion(self):
        """Wait for all workers to report completion."""
        pubsub = self.redis.pubsub()
        pubsub.subscribe("test_results")

        completed = 0
        for message in pubsub.listen():
            if message['type'] == 'message':
                data = message['data'].decode()
                if data.startswith(f"COMPLETE:{self.test_id}"):
                    completed += 1
                    if completed >= self.worker_count:
                        break

        return self.aggregate_results()
```

---

## CI/CD Integration

### GitHub Actions Distributed Test

```yaml
# .github/workflows/load-test.yml
name: Distributed Load Test

on:
  workflow_dispatch:
    inputs:
      target_vus:
        description: 'Total virtual users'
        default: '1000'
      duration:
        description: 'Test duration'
        default: '10m'

jobs:
  setup:
    runs-on: ubuntu-latest
    outputs:
      test_id: ${{ steps.generate.outputs.test_id }}
    steps:
      - id: generate
        run: echo "test_id=test-$(date +%Y%m%d-%H%M%S)" >> $GITHUB_OUTPUT

  worker:
    needs: setup
    runs-on: ubuntu-latest
    strategy:
      matrix:
        worker: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4

      - name: Install k6
        run: |
          curl -L https://github.com/grafana/k6/releases/download/v0.47.0/k6-v0.47.0-linux-amd64.tar.gz | tar xvz
          sudo mv k6-v0.47.0-linux-amd64/k6 /usr/local/bin/

      - name: Run load test (worker ${{ matrix.worker }})
        run: |
          k6 run test.js \
            --out json=results-${{ matrix.worker }}.json \
            --tag worker=${{ matrix.worker }} \
            --tag test_id=${{ needs.setup.outputs.test_id }}
        env:
          K6_VUS: ${{ github.event.inputs.target_vus / 4 }}
          K6_DURATION: ${{ github.event.inputs.duration }}

      - uses: actions/upload-artifact@v4
        with:
          name: results-${{ matrix.worker }}
          path: results-${{ matrix.worker }}.json

  aggregate:
    needs: [setup, worker]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/download-artifact@v4
        with:
          path: results/

      - name: Aggregate results
        run: python scripts/aggregate_results.py results/

      - uses: actions/upload-artifact@v4
        with:
          name: aggregated-results
          path: aggregated-report/
```

---

## Best Practices

| Practice | Rationale |
|----------|-----------|
| Same script version on all workers | Consistent behavior |
| Synchronized clocks (NTP) | Accurate timing correlation |
| Same region as target for latency tests | Network consistency |
| Different regions for global simulation | Realistic distribution |
| Central metrics collection | Unified analysis |
| Worker health monitoring | Detect failures early |
| Graceful shutdown handling | Clean result collection |

---

*Guide from IDPF-Performance Framework*
