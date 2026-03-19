# Capacity Planning Guide
**Version:** v0.66.1

**Framework:** IDPF-Performance

---

## Overview

Capacity planning uses performance data to predict infrastructure requirements for future load. This guide covers growth modeling, resource estimation, and scaling strategies.

---

## Capacity Planning Process

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Measure    │───→│   Model      │───→│   Predict    │───→│   Plan       │
│   Current    │    │   Growth     │    │   Future     │    │   Resources  │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

---

## Step 1: Measure Current Capacity

### Key Metrics

| Metric | Description | Collection Method |
|--------|-------------|-------------------|
| **Throughput** | Requests/transactions per second | APM, load balancer logs |
| **Latency** | Response time percentiles | APM, synthetic monitoring |
| **Resource Utilization** | CPU, memory, I/O | Infrastructure monitoring |
| **Concurrency** | Active users/connections | Application metrics |
| **Error Rate** | Failed requests percentage | Application logs |

### Establish Maximum Capacity

```javascript
// k6 - Find breaking point
export const options = {
  scenarios: {
    breaking_point: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 500,
      maxVUs: 2000,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '2m', target: 100 },
        { duration: '2m', target: 200 },
        { duration: '2m', target: 400 },
        { duration: '2m', target: 600 },
        { duration: '2m', target: 800 },
        { duration: '2m', target: 1000 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // SLA threshold
    http_req_failed: ['rate<0.05'],      // 5% error threshold
  },
};
```

### Capacity Document

```yaml
# capacity-baseline.yaml
date: 2024-01-15
environment: production

infrastructure:
  web_servers:
    count: 4
    type: c5.2xlarge
    cpu_cores: 8
    memory_gb: 16

  database:
    type: RDS r5.2xlarge
    cpu_cores: 8
    memory_gb: 64
    storage_gb: 500
    iops: 10000

current_metrics:
  peak_rps: 500
  avg_rps: 150
  peak_concurrent_users: 2000
  p95_latency_ms: 250
  error_rate: 0.1%

resource_utilization_at_peak:
  web_cpu: 65%
  web_memory: 55%
  db_cpu: 45%
  db_connections: 180/400
  db_iops: 3500/10000

maximum_capacity:
  # Breaking point test results
  max_rps_before_degradation: 750
  max_concurrent_users: 3500
  headroom_percentage: 33%  # (750-500)/750
```

---

## Step 2: Model Growth

### Historical Analysis

```python
import pandas as pd
import numpy as np
from scipy import stats

def analyze_growth(historical_data: pd.DataFrame) -> dict:
    """Analyze historical traffic growth patterns."""

    # Calculate monthly growth rates
    monthly_data = historical_data.resample('M').mean()
    growth_rates = monthly_data.pct_change().dropna()

    return {
        'avg_monthly_growth': growth_rates.mean(),
        'std_monthly_growth': growth_rates.std(),
        'trend_slope': stats.linregress(
            range(len(monthly_data)),
            monthly_data.values
        ).slope,
        'seasonality_factor': detect_seasonality(historical_data),
    }

def detect_seasonality(data: pd.DataFrame) -> dict:
    """Detect weekly and monthly seasonality patterns."""
    # Group by day of week
    dow_pattern = data.groupby(data.index.dayofweek).mean()
    peak_day = dow_pattern.idxmax()
    trough_day = dow_pattern.idxmin()

    # Group by month
    month_pattern = data.groupby(data.index.month).mean()
    peak_month = month_pattern.idxmax()

    return {
        'peak_day_of_week': peak_day,
        'trough_day_of_week': trough_day,
        'peak_month': peak_month,
        'weekly_variance': dow_pattern.std() / dow_pattern.mean(),
        'monthly_variance': month_pattern.std() / month_pattern.mean(),
    }
```

### Growth Projection Models

#### Linear Growth

```python
def linear_projection(
    current_value: float,
    monthly_growth_rate: float,
    months_ahead: int
) -> float:
    """Simple linear growth projection."""
    return current_value * (1 + monthly_growth_rate * months_ahead)
```

#### Exponential Growth

```python
def exponential_projection(
    current_value: float,
    monthly_growth_rate: float,
    months_ahead: int
) -> float:
    """Compound growth projection."""
    return current_value * ((1 + monthly_growth_rate) ** months_ahead)
```

#### S-Curve (Logistic) Growth

```python
def logistic_projection(
    current_value: float,
    carrying_capacity: float,  # Maximum possible value
    growth_rate: float,
    months_ahead: int
) -> float:
    """Logistic growth with saturation."""
    import math

    # Current position on S-curve
    current_ratio = current_value / carrying_capacity
    k = -math.log((1 - current_ratio) / current_ratio)

    # Future position
    future_k = k + growth_rate * months_ahead
    return carrying_capacity / (1 + math.exp(-future_k))
```

---

## Step 3: Predict Future Requirements

### Capacity Projection

```python
def project_capacity_needs(
    current_metrics: dict,
    growth_model: str,
    growth_rate: float,
    months_ahead: int,
    safety_margin: float = 0.2  # 20% buffer
) -> dict:
    """Project future capacity requirements."""

    projection_func = {
        'linear': linear_projection,
        'exponential': exponential_projection,
    }[growth_model]

    future_rps = projection_func(
        current_metrics['peak_rps'],
        growth_rate,
        months_ahead
    )

    future_users = projection_func(
        current_metrics['peak_concurrent_users'],
        growth_rate,
        months_ahead
    )

    # Add safety margin
    required_rps = future_rps * (1 + safety_margin)
    required_users = future_users * (1 + safety_margin)

    return {
        'projected_rps': future_rps,
        'projected_users': future_users,
        'required_capacity_rps': required_rps,
        'required_capacity_users': required_users,
        'months_ahead': months_ahead,
        'growth_model': growth_model,
        'safety_margin': safety_margin,
    }
```

### Resource Estimation

```python
def estimate_resources(
    current_infra: dict,
    current_metrics: dict,
    future_capacity: dict
) -> dict:
    """Estimate infrastructure needed for future capacity."""

    # Calculate scaling factor
    rps_scale = future_capacity['required_capacity_rps'] / current_metrics['peak_rps']
    user_scale = future_capacity['required_capacity_users'] / current_metrics['peak_concurrent_users']

    scale_factor = max(rps_scale, user_scale)

    # Estimate resources (simplified linear scaling)
    return {
        'web_servers': {
            'current': current_infra['web_servers']['count'],
            'required': int(np.ceil(
                current_infra['web_servers']['count'] * scale_factor
            )),
            'scale_factor': scale_factor,
        },
        'database': {
            'current_type': current_infra['database']['type'],
            'recommended': recommend_db_size(
                current_infra['database'],
                scale_factor
            ),
        },
        'cache': {
            'current_gb': current_infra.get('cache', {}).get('size_gb', 0),
            'required_gb': estimate_cache_size(future_capacity),
        },
    }

def recommend_db_size(current_db: dict, scale_factor: float) -> str:
    """Recommend database instance size based on scaling needs."""
    # Simplified instance sizing
    db_sizes = [
        ('db.r5.large', 2, 16),
        ('db.r5.xlarge', 4, 32),
        ('db.r5.2xlarge', 8, 64),
        ('db.r5.4xlarge', 16, 128),
        ('db.r5.8xlarge', 32, 256),
    ]

    required_cpu = current_db['cpu_cores'] * scale_factor
    required_memory = current_db['memory_gb'] * scale_factor

    for instance_type, cpu, memory in db_sizes:
        if cpu >= required_cpu and memory >= required_memory:
            return instance_type

    return 'db.r5.8xlarge (consider sharding)'
```

---

## Step 4: Plan Resources

### Capacity Planning Template

```markdown
# Capacity Plan: [Application Name]

**Planning Horizon:** 12 months
**Date:** YYYY-MM-DD
**Owner:** [Team/Person]

## Executive Summary

Current peak traffic: 500 RPS
Projected peak (12 months): 850 RPS
Required capacity with buffer: 1,020 RPS
Recommended action: Scale web tier from 4 to 7 instances

## Current State

| Resource | Specification | Peak Utilization |
|----------|--------------|------------------|
| Web Servers | 4x c5.2xlarge | 65% CPU |
| Database | r5.2xlarge | 45% CPU |
| Cache | ElastiCache m5.large | 60% memory |
| CDN | CloudFront | 2TB/month |

## Growth Assumptions

| Factor | Value | Confidence |
|--------|-------|------------|
| Monthly traffic growth | 5% | High |
| User growth rate | 4% | Medium |
| Data growth rate | 8% | High |
| Seasonal peak factor | 1.5x | High |

## Projections

| Timeframe | Traffic (RPS) | Users | Required Instances |
|-----------|---------------|-------|-------------------|
| Current | 500 | 2,000 | 4 |
| 3 months | 580 | 2,250 | 5 |
| 6 months | 670 | 2,530 | 6 |
| 12 months | 850 | 3,100 | 7 |

## Recommendations

### Q1 Actions
1. Add 1 web server instance (5 total)
2. Increase cache to m5.xlarge
3. Implement connection pooling

### Q2 Actions
1. Add 1 web server instance (6 total)
2. Upgrade database to r5.4xlarge
3. Review CDN configuration

### Q3-Q4 Actions
1. Add 1 web server instance (7 total)
2. Consider database read replicas
3. Evaluate auto-scaling policies

## Cost Analysis

| Item | Current Monthly | Projected Monthly | Delta |
|------|-----------------|-------------------|-------|
| Web Servers | $1,200 | $2,100 | +$900 |
| Database | $800 | $1,400 | +$600 |
| Cache | $150 | $300 | +$150 |
| **Total** | **$2,150** | **$3,800** | **+$1,650** |

## Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Traffic exceeds projection | Medium | High | Implement auto-scaling |
| Database bottleneck | Low | High | Prepare read replica |
| CDN limits | Low | Medium | Negotiate enterprise plan |

## Review Schedule

- Monthly: Traffic trend review
- Quarterly: Full capacity review
- Event-based: Major feature launches
```

---

## Scaling Strategies

### Vertical Scaling

```yaml
# When to scale vertically
vertical_scaling:
  pros:
    - Simpler architecture
    - No code changes
    - Lower operational overhead

  cons:
    - Hardware limits
    - Single point of failure
    - Downtime for upgrades

  best_for:
    - Database servers
    - Legacy applications
    - Quick fixes

  instance_progression:
    aws:
      - c5.large -> c5.xlarge -> c5.2xlarge -> c5.4xlarge
    gcp:
      - n2-standard-4 -> n2-standard-8 -> n2-standard-16
```

### Horizontal Scaling

```yaml
# When to scale horizontally
horizontal_scaling:
  pros:
    - No hardware limits
    - High availability
    - Rolling updates

  cons:
    - State management complexity
    - Load balancer required
    - Session handling

  best_for:
    - Stateless web servers
    - API services
    - Microservices

  auto_scaling_policy:
    min_instances: 2
    max_instances: 20
    scale_up:
      metric: cpu_utilization
      threshold: 70%
      cooldown: 300s
    scale_down:
      metric: cpu_utilization
      threshold: 30%
      cooldown: 600s
```

### Database Scaling

```yaml
database_scaling:
  read_replicas:
    use_when:
      - Read-heavy workloads (>80% reads)
      - Reporting queries
      - Geographic distribution

  sharding:
    use_when:
      - Single instance at capacity
      - Data naturally partitionable
      - Write-heavy workloads

  caching:
    use_when:
      - Frequent repeated queries
      - Acceptable staleness
      - Hot data subset

  connection_pooling:
    use_when:
      - Connection limit reached
      - Short-lived connections
      - Serverless workloads
```

---

## Monitoring Capacity

### Capacity Alerts

```yaml
# Prometheus alerting rules
groups:
  - name: capacity_alerts
    rules:
      - alert: HighCPUUtilization
        expr: avg(cpu_utilization) > 0.75
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "CPU utilization approaching capacity"
          description: "Average CPU at {{ $value }}%, consider scaling"

      - alert: CapacityHeadroomLow
        expr: |
          (1 - (current_rps / max_capacity_rps)) < 0.2
        for: 30m
        labels:
          severity: critical
        annotations:
          summary: "Less than 20% capacity headroom"

      - alert: GrowthRateExceedsProjection
        expr: |
          increase(total_requests[7d]) / increase(total_requests[7d] offset 30d) > 1.2
        for: 1h
        labels:
          severity: info
        annotations:
          summary: "Traffic growth exceeding projections"
```

### Capacity Dashboard

```json
{
  "panels": [
    {
      "title": "Capacity Utilization",
      "type": "gauge",
      "targets": [
        {
          "expr": "current_rps / max_capacity_rps * 100"
        }
      ],
      "thresholds": [
        { "value": 0, "color": "green" },
        { "value": 60, "color": "yellow" },
        { "value": 80, "color": "red" }
      ]
    },
    {
      "title": "Projected vs Actual Traffic",
      "type": "timeseries",
      "targets": [
        { "expr": "rate(requests_total[5m])", "legendFormat": "Actual" },
        { "expr": "projected_rps", "legendFormat": "Projected" }
      ]
    }
  ]
}
```

---

## Best Practices

| Practice | Rationale |
|----------|-----------|
| Plan for peak + 20% buffer | Handle unexpected spikes |
| Review quarterly | Adjust for actual growth |
| Test scaling procedures | Ensure they work when needed |
| Document assumptions | Enable plan updates |
| Include cost analysis | Justify investments |
| Consider seasonality | Account for cyclical patterns |

---

*Guide from IDPF-Performance Framework*
