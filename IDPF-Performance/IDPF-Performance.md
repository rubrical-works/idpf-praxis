# IDPF-Performance Framework
**Version:** v0.55.0
**Source:** IDPF-Performance/IDPF-Performance.md
**Extends:** IDPF-Testing
## Overview
Framework for performance testing. Extends IDPF-Testing with load testing, stress testing, endurance testing, and capacity planning.
## Terminology
| Term | Definition |
|------|------------|
| **Load Test** | Validate behavior under expected user load |
| **Stress Test** | Find breaking point beyond expected load |
| **Endurance/Soak Test** | Detect degradation over sustained load |
| **Spike Test** | Handle sudden traffic bursts |
| **Capacity Test** | Determine maximum throughput |
| **Virtual Users (VUs)** | Simulated concurrent users |
| **Throughput** | Requests per second (RPS) |
| **Percentile (p95/p99)** | Response time at given percentile |
| **Ramp-Up** | Gradual increase of virtual users |
| **Think Time** | Simulated user pause between requests |
| **Threshold** | Pass/fail criteria for metrics |
## Performance Test Types
| Test Type | Purpose | Duration | Load Pattern |
|-----------|---------|----------|--------------|
| **Load Test** | Validate under expected load | 15-60 min | Steady state |
| **Stress Test** | Find breaking point | Until failure | Ramping up |
| **Endurance/Soak** | Detect memory leaks, degradation | 4-24 hours | Steady state |
| **Spike Test** | Handle sudden traffic bursts | 15-30 min | Sudden spikes |
| **Capacity Test** | Determine max throughput | Varies | Incremental |
| **Scalability Test** | Validate horizontal/vertical scaling | Varies | Incremental with scaling |
## Tool Selection Guide
| Tool | Language | Best For | Strengths |
|------|----------|----------|-----------|
| **k6** | JavaScript | Modern APIs, CI/CD | Developer-friendly, scriptable, cloud option |
| **JMeter** | Java/XML | Enterprise, GUI-based | Mature, extensive plugins, protocol support |
| **Gatling** | Scala/Java | High throughput | Efficient resource usage, great reports |
| **Locust** | Python | Python teams | Simple, distributed, real-time UI |
| **Artillery** | JavaScript | Serverless, APIs | YAML config, easy CI integration |
| **wrk/wrk2** | Lua | HTTP benchmarking | Lightweight, precise latency measurement |
```
Performance Tool Selection:
├── Team uses JavaScript? → k6 or Artillery
├── Team uses Python? → Locust
├── Team uses Java/Scala? → Gatling or JMeter
├── Need GUI for non-developers? → JMeter
├── Need cloud/SaaS option? → k6 Cloud, BlazeMeter
├── Need extensive protocol support? → JMeter
└── Need lightweight HTTP benchmarking? → wrk2
```
## Directory Structure
```
<performance-test-repo>/
├── PRD/
│   ├── README.md
│   ├── Templates/
│   │   └── Performance-Test-Plan.md
│   └── TestPlans/
│       ├── TP-API-Load-Test.md
│       └── TP-Checkout-Stress-Test.md
├── src/
│   ├── scenarios/              # Test scripts
│   │   ├── load-test.js
│   │   ├── stress-test.js
│   │   ├── spike-test.js
│   │   └── soak-test.js
│   ├── lib/                    # Shared utilities
│   │   ├── api-client.js
│   │   ├── auth.js
│   │   └── helpers.js
│   ├── data/                   # Test data files
│   │   ├── users.csv
│   │   └── products.json
│   ├── thresholds/             # Pass/fail criteria
│   │   └── default-thresholds.js
│   └── config/                 # Environment configs
│       ├── dev.js
│       ├── staging.js
│       └── prod.js
├── results/                    # Test results, reports
├── dashboards/                 # Grafana dashboards
├── .github/
│   └── workflows/
│       ├── load-test.yml
│       └── scheduled-soak.yml
├── docker-compose.yml          # Local infrastructure
└── README.md
```
## Load Profile Patterns
### Ramp-Up Pattern
```
     Users
       │
   500 │        ┌────────────────┐
       │       /                  \
   250 │      /                    \
       │     /                      \
     0 │____/                        \____
       └─────────────────────────────────→ Time
         Ramp   Steady State    Ramp
          Up                    Down
```
### Spike Pattern
```
     Users
       │
  1000 │    ┌─┐         ┌─┐
       │    │ │         │ │
   200 │────│ │─────────│ │────
       └─────────────────────────→ Time
           Spike 1     Spike 2
```
### Step Pattern (Capacity Testing)
```
     Users
       │
  1000 │                    ┌────
       │               ┌────┘
   750 │          ┌────┘
       │     ┌────┘
   500 │────┘
       └─────────────────────────→ Time
        Step increases until failure
```
## Test Data Management
| Approach | Use Case | Implementation |
|----------|----------|----------------|
| **CSV Files** | User credentials, product IDs | Parameterized data |
| **JSON Files** | Complex request payloads | Template substitution |
| **Dynamic Generation** | Unique data per request | Faker libraries |
| **Shared Array** | Large datasets (k6) | Memory-efficient loading |
## Key Metrics
| Metric | Description | Good Values |
|--------|-------------|-------------|
| **Response Time (p50)** | Median response time | < 200ms |
| **Response Time (p95)** | 95th percentile | < 500ms |
| **Response Time (p99)** | 99th percentile | < 1000ms |
| **Throughput** | Requests per second | Depends on capacity |
| **Error Rate** | Failed requests / total | < 0.1% |
| **Concurrent Users** | Simultaneous active users | Depends on requirement |
| **Apdex** | Application Performance Index | > 0.9 |
### Threshold Configuration (k6 Example)
```javascript
thresholds: {
  'http_req_duration': ['p(95)<500', 'p(99)<1000'],
  'http_req_failed': ['rate<0.01'],
  'http_reqs': ['rate>1000'],
}
```
## CI/CD Integration
### GitHub Actions Example (k6)
```yaml
# .github/workflows/load-test.yml
name: Load Test

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        required: true
        default: 'staging'
      duration:
        description: 'Test duration'
        required: true
        default: '5m'
      vus:
        description: 'Virtual users'
        required: true
        default: '50'

jobs:
  load-test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Run k6 load test
        uses: grafana/k6-action@v0.3.1
        with:
          filename: src/scenarios/load-test.js
          flags: --env ENV=${{ inputs.environment }} --duration ${{ inputs.duration }} --vus ${{ inputs.vus }}

      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: k6-results
          path: results/
```
### Scheduled Soak Test
```yaml
# .github/workflows/scheduled-soak.yml
name: Scheduled Soak Test

on:
  schedule:
    - cron: '0 2 * * 0'  # Sunday 2 AM

jobs:
  soak-test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Run k6 soak test
        uses: grafana/k6-action@v0.3.1
        with:
          filename: src/scenarios/soak-test.js
        env:
          K6_DURATION: '4h'
          K6_VUS: '100'

      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: soak-test-results
          path: results/
```
## GitHub Project Labels
| Label | Color | Hex | Description |
|-------|-------|-----|-------------|
| `performance` | Blue | `#0052CC` | Performance work (from Core) |
| `load-test` | Green | `#0E8A16` | Load test development |
| `stress-test` | Orange | `#D93F0B` | Stress test development |
| `soak-test` | Purple | `#5319E7` | Endurance test development |
| `capacity` | Blue | `#1D76DB` | Capacity planning |
| `baseline` | Light Blue | `#C5DEF5` | Baseline measurement |
## Workflow Phases
| Phase | Performance-Specific Activities |
|-------|--------------------------------|
| **PLAN** | Define SLAs/SLOs, identify critical paths, establish baselines |
| **DESIGN** | Create workload model, design load profiles, configure thresholds |
| **DEVELOP** | Write test scripts, build data generators, set up monitoring integration |
| **EXECUTE** | Run tests with proper environment, collect metrics, monitor resources |
| **REPORT** | Analyze percentiles, compare against baselines, generate recommendations |
## Session Commands
### Planning Commands
- **"Perf-Plan-Start"** - Begin performance test planning
- **"Baseline-Define"** - Establish performance baselines
- **"SLA-Review"** - Review SLA/SLO requirements
### Development Commands
- **"Load-Test-Create"** - Create load test script
- **"Stress-Test-Create"** - Create stress test script
- **"Threshold-Define"** - Define pass/fail thresholds
### Execution Commands
- **"Run-Load-Test"** - Execute load test
- **"Run-Stress-Test"** - Execute stress test
- **"Run-Soak-Test"** - Execute endurance test
### Analysis Commands
- **"Analyze-Results"** - Analyze test results
- **"Compare-Baseline"** - Compare against baseline
- **"Generate-Report"** - Create performance report
## Integration Points
- **Extends:** IDPF-Testing
- **Uses:** IDPF-Agile for test development methodology
- **References:** Application PRD for NFR traceability
- **Outputs:** Performance reports, metric dashboards, capacity recommendations
## Monitoring Integration
| Tool Type | Examples | Purpose |
|-----------|----------|---------|
| **APM** | New Relic, Datadog, Dynatrace | Application-level metrics |
| **Infrastructure** | Prometheus, CloudWatch, Azure Monitor | Server/container metrics |
| **Logging** | ELK, Splunk, CloudWatch Logs | Log correlation |
| **Dashboards** | Grafana, Custom | Real-time visualization |
## References
### Tool Documentation
- [k6 Documentation](https://k6.io/docs/)
- [JMeter User Manual](https://jmeter.apache.org/usermanual/index.html)
- [Gatling Documentation](https://gatling.io/docs/gatling/)
- [Locust Documentation](https://docs.locust.io/)
### Best Practices
- [Performance Testing Guidance - Microsoft](https://docs.microsoft.com/en-us/azure/architecture/framework/scalability/performance-test)
- [k6 Best Practices](https://k6.io/docs/testing-guides/api-load-testing/)
---
**End of Framework**
