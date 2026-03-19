# IDPF-Performance Framework
**Version:** v0.66.1
**Type:** Domain
## Overview
Domain for performance testing: load, stress, endurance, and capacity testing. Validates NFRs for response time, throughput, scalability, and resource utilization.
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
| **Threshold** | Pass/fail criteria for metrics |
## Performance Test Types
| Test Type | Purpose | Duration | Load Pattern |
|-----------|---------|----------|--------------|
| **Load Test** | Validate under expected load | 15-60 min | Steady state |
| **Stress Test** | Find breaking point | Until failure | Ramping up |
| **Endurance/Soak** | Detect memory leaks | 4-24 hours | Steady state |
| **Spike Test** | Handle traffic bursts | 15-30 min | Sudden spikes |
| **Capacity Test** | Determine max throughput | Varies | Incremental |
| **Scalability Test** | Validate scaling | Varies | Incremental with scaling |
## Tool Selection Guide
| Tool | Language | Best For | Strengths |
|------|----------|----------|-----------|
| **k6** | JavaScript | Modern APIs, CI/CD | Developer-friendly, scriptable |
| **JMeter** | Java/XML | Enterprise, GUI | Mature, extensive plugins |
| **Gatling** | Scala/Java | High throughput | Efficient, great reports |
| **Locust** | Python | Python teams | Simple, distributed |
| **Artillery** | JavaScript | Serverless, APIs | YAML config, easy CI |
| **wrk/wrk2** | Lua | HTTP benchmarking | Lightweight, precise |
## Test Data Management
| Approach | Use Case | Implementation |
|----------|----------|----------------|
| CSV Files | User credentials, IDs | Parameterized data |
| JSON Files | Complex payloads | Template substitution |
| Dynamic Generation | Unique data per request | Faker libraries |
| Shared Array | Large datasets (k6) | Memory-efficient loading |
## Key Metrics
| Metric | Description | Good Values |
|--------|-------------|-------------|
| Response Time (p50) | Median | < 200ms |
| Response Time (p95) | 95th percentile | < 500ms |
| Response Time (p99) | 99th percentile | < 1000ms |
| Throughput | Requests per second | Capacity-dependent |
| Error Rate | Failed / total | < 0.1% |
| Apdex | Performance Index | > 0.9 |
### Threshold Configuration (k6)
```javascript
thresholds: {
  'http_req_duration': ['p(95)<500', 'p(99)<1000'],
  'http_req_failed': ['rate<0.01'],
  'http_reqs': ['rate>1000'],
}
```
## Workflow Phases
| Phase | Activities |
|-------|------------|
| **PLAN** | Define SLAs/SLOs, identify critical paths, establish baselines |
| **DESIGN** | Create workload model, design load profiles, configure thresholds |
| **DEVELOP** | Write scripts, build data generators, set up monitoring |
| **EXECUTE** | Run tests, collect metrics, monitor resources |
| **REPORT** | Analyze percentiles, compare baselines, generate recommendations |
## Monitoring Integration
| Tool Type | Examples | Purpose |
|-----------|----------|---------|
| APM | New Relic, Datadog, Dynatrace | Application metrics |
| Infrastructure | Prometheus, CloudWatch | Server/container metrics |
| Logging | ELK, Splunk | Log correlation |
| Dashboards | Grafana | Real-time visualization |
## References
- [k6 Documentation](https://k6.io/docs/)
- [JMeter User Manual](https://jmeter.apache.org/usermanual/index.html)
- [Gatling Documentation](https://gatling.io/docs/gatling/)
- [Locust Documentation](https://docs.locust.io/)
**End of Framework**
