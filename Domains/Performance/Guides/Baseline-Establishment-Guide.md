# Baseline Establishment Guide
**Version:** v0.64.0

**Framework:** IDPF-Performance

---

## Overview

Performance baselines are reference measurements that define acceptable system behavior under known conditions. This guide covers methodology for establishing, validating, and maintaining baselines.

---

## Baseline Concepts

| Term | Definition |
|------|------------|
| **Baseline** | Reference measurement under controlled conditions |
| **Benchmark** | Comparison point for evaluating performance |
| **Steady State** | Stable system behavior without anomalies |
| **Variance** | Acceptable deviation from baseline |
| **Regression** | Performance degradation from baseline |

---

## Baseline Types

| Type | Purpose | When to Establish |
|------|---------|-------------------|
| **Response Time** | Expected latency for operations | Initial release, major changes |
| **Throughput** | Expected transactions per second | Capacity planning, scaling |
| **Resource** | Expected CPU, memory, I/O usage | Infrastructure provisioning |
| **Concurrency** | Expected behavior under user load | Load testing |
| **Error Rate** | Acceptable failure percentage | Stability assessment |

---

## Baseline Establishment Process

### Step 1: Define Scope

```markdown
## Baseline Scope Definition

### System Under Test
- Application: [Name]
- Version: [Version]
- Environment: [Staging/Production-like]
- Infrastructure: [Instance types, scaling config]

### Metrics to Baseline
- [ ] Response time (P50, P90, P95, P99)
- [ ] Throughput (requests/second)
- [ ] Error rate (%)
- [ ] CPU utilization (%)
- [ ] Memory utilization (%)
- [ ] Database connections
- [ ] Queue depth

### Critical Transactions
1. [Transaction 1] - Expected: <X ms
2. [Transaction 2] - Expected: <Y ms
3. [Transaction 3] - Expected: <Z ms
```

### Step 2: Prepare Environment

```yaml
# Environment checklist
environment:
  infrastructure:
    - Clean deployment (no prior test data residue)
    - Production-equivalent hardware/instances
    - Network latency matches production
    - Database size representative of production

  configuration:
    - Production-like settings (caching, pooling)
    - No debug/profiling overhead
    - Logging at production level
    - Feature flags match production

  isolation:
    - No concurrent users/tests
    - Background jobs disabled or scheduled
    - External dependencies stable/mocked
```

### Step 3: Execute Baseline Tests

```javascript
// k6 baseline test
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// Custom metrics for baseline
const responseTime = new Trend('response_time');
const errorRate = new Rate('error_rate');
const requestCount = new Counter('request_count');

export const options = {
  // Low, steady load for baseline
  scenarios: {
    baseline: {
      executor: 'constant-arrival-rate',
      rate: 10,  // 10 requests per second
      timeUnit: '1s',
      duration: '30m',  // Long enough for stability
      preAllocatedVUs: 20,
      maxVUs: 50,
    }
  },
  thresholds: {
    // Initial thresholds (will refine based on results)
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  }
};

export default function() {
  const start = Date.now();

  const res = http.get('https://api.example.com/endpoint');

  const duration = Date.now() - start;
  responseTime.add(duration);
  requestCount.add(1);
  errorRate.add(res.status !== 200);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
```

### Step 4: Collect and Analyze Data

```python
# Baseline analysis script
import pandas as pd
import numpy as np
from scipy import stats

def analyze_baseline(data: pd.DataFrame) -> dict:
    """Calculate baseline statistics from test results."""

    response_times = data['response_time']

    baseline = {
        'sample_size': len(response_times),
        'mean': response_times.mean(),
        'median': response_times.median(),
        'std_dev': response_times.std(),
        'p50': response_times.quantile(0.50),
        'p90': response_times.quantile(0.90),
        'p95': response_times.quantile(0.95),
        'p99': response_times.quantile(0.99),
        'min': response_times.min(),
        'max': response_times.max(),
    }

    # Calculate confidence interval (95%)
    confidence = 0.95
    n = len(response_times)
    mean = baseline['mean']
    se = stats.sem(response_times)
    h = se * stats.t.ppf((1 + confidence) / 2, n - 1)

    baseline['ci_lower'] = mean - h
    baseline['ci_upper'] = mean + h

    # Check for steady state (coefficient of variation)
    baseline['cv'] = baseline['std_dev'] / baseline['mean']
    baseline['is_stable'] = baseline['cv'] < 0.3  # <30% variance

    return baseline

def detect_outliers(data: pd.Series, method='iqr') -> pd.Series:
    """Identify outliers that should be excluded from baseline."""
    if method == 'iqr':
        Q1 = data.quantile(0.25)
        Q3 = data.quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - 1.5 * IQR
        upper_bound = Q3 + 1.5 * IQR
        return (data < lower_bound) | (data > upper_bound)
    elif method == 'zscore':
        z_scores = np.abs(stats.zscore(data))
        return z_scores > 3
```

### Step 5: Validate Baseline

```markdown
## Baseline Validation Checklist

### Statistical Validity
- [ ] Sample size >= 1000 data points
- [ ] Coefficient of variation < 30%
- [ ] No significant trend during test
- [ ] Outliers identified and explained

### Environmental Validity
- [ ] Test environment matches specification
- [ ] No anomalies during test period
- [ ] External dependencies stable
- [ ] Resource utilization within norms

### Reproducibility
- [ ] Run baseline test 3+ times
- [ ] Results consistent across runs (within 10%)
- [ ] Variance explained by normal factors
```

---

## Metric Selection

### Response Time Percentiles

| Percentile | Meaning | Use Case |
|------------|---------|----------|
| **P50 (Median)** | Typical user experience | General performance |
| **P90** | 90% of users faster than this | SLA targets |
| **P95** | 95% of users faster than this | Performance budgets |
| **P99** | Worst-case for most users | Outlier detection |
| **P99.9** | Extreme tail latency | Critical systems |

```javascript
// k6 percentile thresholds
export const options = {
  thresholds: {
    http_req_duration: [
      'p(50)<200',   // P50 under 200ms
      'p(90)<400',   // P90 under 400ms
      'p(95)<600',   // P95 under 600ms
      'p(99)<1000',  // P99 under 1s
    ],
  }
};
```

### Throughput Metrics

```javascript
// Throughput baseline
const throughputMetrics = {
  requests_per_second: 'Rate of incoming requests',
  transactions_per_second: 'Completed business transactions',
  bytes_per_second: 'Data transfer rate',
  concurrent_users: 'Simultaneous active users'
};
```

### Resource Metrics

```yaml
# Resource baseline targets
resources:
  cpu:
    idle: <10%
    normal_load: <50%
    peak_load: <80%
    alert_threshold: 85%

  memory:
    base_usage: <40%
    normal_load: <60%
    peak_load: <75%
    alert_threshold: 80%

  disk_io:
    read_latency: <5ms
    write_latency: <10ms
    iops_normal: <500
    iops_peak: <2000
```

---

## Statistical Significance

### Sample Size Calculation

```python
def calculate_sample_size(
    baseline_mean: float,
    baseline_std: float,
    margin_of_error_pct: float = 5,
    confidence_level: float = 0.95
) -> int:
    """Calculate minimum sample size for reliable baseline."""
    import scipy.stats as stats

    z = stats.norm.ppf((1 + confidence_level) / 2)
    margin = baseline_mean * (margin_of_error_pct / 100)

    n = ((z * baseline_std) / margin) ** 2
    return int(np.ceil(n))

# Example: 200ms mean, 50ms std dev, 5% margin, 95% confidence
# sample_size = calculate_sample_size(200, 50, 5, 0.95)
# Result: ~97 samples minimum
```

### Regression Detection

```python
def detect_regression(
    baseline: dict,
    current: pd.Series,
    threshold_pct: float = 10
) -> dict:
    """Detect if current performance regressed from baseline."""
    from scipy import stats

    # Calculate current statistics
    current_mean = current.mean()
    current_p95 = current.quantile(0.95)

    # Percent change
    mean_change = ((current_mean - baseline['mean']) / baseline['mean']) * 100
    p95_change = ((current_p95 - baseline['p95']) / baseline['p95']) * 100

    # Statistical test (two-sample t-test)
    # Note: Requires baseline raw data for proper test
    regression_detected = mean_change > threshold_pct or p95_change > threshold_pct

    return {
        'baseline_mean': baseline['mean'],
        'current_mean': current_mean,
        'mean_change_pct': mean_change,
        'baseline_p95': baseline['p95'],
        'current_p95': current_p95,
        'p95_change_pct': p95_change,
        'regression_detected': regression_detected,
        'threshold_pct': threshold_pct
    }
```

---

## Baseline Document Template

```markdown
# Performance Baseline: [Component/Endpoint Name]

**Date Established:** YYYY-MM-DD
**Valid Until:** YYYY-MM-DD (or next major release)
**Owner:** [Team/Person]

## Environment

| Factor | Value |
|--------|-------|
| Application Version | vX.Y.Z |
| Environment | Staging / Production-equivalent |
| Instance Type | [e.g., AWS c5.2xlarge] |
| Database Size | [e.g., 10GB, 1M records] |
| Test Duration | 30 minutes |
| Sample Size | 18,000 requests |

## Response Time Baseline

| Metric | Value | Threshold |
|--------|-------|-----------|
| P50 | 120ms | <200ms |
| P90 | 280ms | <400ms |
| P95 | 350ms | <500ms |
| P99 | 580ms | <1000ms |
| Mean | 145ms | <250ms |
| Std Dev | 85ms | - |

## Throughput Baseline

| Metric | Value | Threshold |
|--------|-------|-----------|
| Requests/sec | 150 | >100 |
| Error Rate | 0.02% | <1% |

## Resource Baseline

| Resource | Normal | Peak | Threshold |
|----------|--------|------|-----------|
| CPU | 35% | 55% | <80% |
| Memory | 2.1GB | 2.8GB | <4GB |
| DB Connections | 25 | 45 | <100 |

## Validation

- [x] 3 consecutive test runs with <5% variance
- [x] No outliers beyond 3 standard deviations
- [x] Steady state achieved within 5 minutes
- [x] Environment specification verified

## Update History

| Date | Version | Change | Author |
|------|---------|--------|--------|
| YYYY-MM-DD | 1.0 | Initial baseline | [Name] |
```

---

## Baseline Maintenance

### When to Update Baselines

| Trigger | Action |
|---------|--------|
| Major release | Re-establish all baselines |
| Architecture change | Re-establish affected baselines |
| Infrastructure change | Validate or re-establish |
| 3+ months elapsed | Validate baselines still accurate |
| Consistent threshold failures | Investigate and potentially update |

### Baseline Version Control

```yaml
# baseline.yaml
date: 2024-01-15
application_version: v2.5.0

endpoints:
  /api/users:
    response_time:
      p50: 120
      p95: 350
      p99: 580
    throughput:
      rps: 150
    error_rate: 0.02

  /api/orders:
    response_time:
      p50: 200
      p95: 500
      p99: 900
    throughput:
      rps: 80
    error_rate: 0.05

history:
  - version: 1
    date: 2023-10-01
    application_version: v2.0.0
    notes: Initial baseline
```

---

## Best Practices

| Practice | Rationale |
|----------|-----------|
| Test in production-like environment | Ensures relevance |
| Run during low-traffic periods | Reduces variance |
| Exclude warmup period from data | Captures steady state |
| Document all assumptions | Enables reproduction |
| Version baselines with code | Tracks changes |
| Automate baseline validation | Catches regressions early |

---

*Guide from IDPF-Performance Framework*
