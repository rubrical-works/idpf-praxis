# Observability Setup Guide for Chaos Engineering
**Version:** v0.53.0

**Framework:** IDPF-Chaos

---

## Overview

Effective chaos engineering requires comprehensive observability. You cannot safely inject failures if you cannot detect their impact. This guide covers metrics, logging, tracing, and alerting setup for chaos experiments.

---

## The Three Pillars of Observability

```
┌─────────────────────────────────────────────────────────────────┐
│                       OBSERVABILITY                              │
├─────────────────┬─────────────────┬─────────────────────────────┤
│     METRICS     │     LOGS        │          TRACES             │
│                 │                 │                             │
│ What's happening│ Why it happened │ How requests flow           │
│ (quantitative)  │ (qualitative)   │ (contextual)                │
│                 │                 │                             │
│ - Latency       │ - Errors        │ - Request path              │
│ - Error rates   │ - Events        │ - Service dependencies      │
│ - Throughput    │ - Debug info    │ - Bottlenecks               │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

---

## Metrics Setup

### Key Metrics for Chaos Experiments

| Category | Metric | Why It Matters |
|----------|--------|----------------|
| **Latency** | p50, p95, p99 response time | Detect degradation |
| **Error Rate** | 4xx, 5xx per second | Detect failures |
| **Throughput** | Requests per second | Detect capacity issues |
| **Saturation** | CPU, memory, disk, network | Detect resource exhaustion |
| **Availability** | Health check success rate | Detect outages |

### Prometheus Metrics Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'application'
    static_configs:
      - targets: ['app:8080']
    metrics_path: /metrics

  - job_name: 'infrastructure'
    static_configs:
      - targets: ['node-exporter:9100']

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

rule_files:
  - 'chaos_alerts.yml'
```

### Application Metrics (Node.js Example)

```typescript
// metrics.ts
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

const registry = new Registry();
collectDefaultMetrics({ register: registry });

// Request metrics
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

export const httpRequestErrors = new Counter({
  name: 'http_request_errors_total',
  help: 'Total number of HTTP request errors',
  labelNames: ['method', 'route', 'error_type'],
  registers: [registry],
});

// Dependency health
export const dependencyHealth = new Gauge({
  name: 'dependency_health',
  help: 'Health status of dependencies (1=healthy, 0=unhealthy)',
  labelNames: ['dependency'],
  registers: [registry],
});

// Circuit breaker state
export const circuitBreakerState = new Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
  labelNames: ['circuit'],
  registers: [registry],
});

// Middleware
export function metricsMiddleware(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const labels = {
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode,
    };

    httpRequestDuration.observe(labels, duration);
    httpRequestTotal.inc(labels);

    if (res.statusCode >= 400) {
      httpRequestErrors.inc({
        method: req.method,
        route: req.route?.path || req.path,
        error_type: res.statusCode >= 500 ? 'server' : 'client',
      });
    }
  });

  next();
}
```

### RED Method Dashboard

```json
{
  "dashboard": {
    "title": "Chaos Experiment Monitoring",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total[5m]))",
            "legendFormat": "Requests/sec"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(http_request_errors_total[5m])) / sum(rate(http_requests_total[5m])) * 100",
            "legendFormat": "Error %"
          }
        ]
      },
      {
        "title": "Latency (p95)",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))",
            "legendFormat": "p95 latency"
          }
        ]
      },
      {
        "title": "Dependency Health",
        "type": "stat",
        "targets": [
          {
            "expr": "dependency_health",
            "legendFormat": "{{dependency}}"
          }
        ]
      }
    ]
  }
}
```

---

## Logging Setup

### Structured Logging Configuration

```typescript
// logger.ts
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: process.env.SERVICE_NAME,
    version: process.env.APP_VERSION,
    environment: process.env.NODE_ENV,
  },
  transports: [
    new winston.transports.Console(),
    // Add file or external transport as needed
  ],
});

// Chaos experiment context
export function logChaosEvent(event: {
  experimentId: string;
  type: 'start' | 'inject' | 'observe' | 'abort' | 'end';
  details: Record<string, unknown>;
}) {
  logger.info('Chaos experiment event', {
    chaos: true,
    experiment_id: event.experimentId,
    event_type: event.type,
    ...event.details,
  });
}

// Error logging with context
export function logError(error: Error, context?: Record<string, unknown>) {
  logger.error('Application error', {
    error: {
      message: error.message,
      name: error.name,
      stack: error.stack,
    },
    ...context,
  });
}

export default logger;
```

### Log Queries for Chaos Analysis

```
# Loki/LogQL Examples

# All chaos experiment events
{job="app"} |= "chaos" | json | experiment_id != ""

# Errors during a specific experiment
{job="app"} |= "error" | json | experiment_id="exp-123"

# Latency spikes (if logging request duration)
{job="app"} | json | duration_ms > 1000

# Circuit breaker events
{job="app"} |= "circuit_breaker" | json

# Dependency failures
{job="app"} |= "dependency" | json | status="unhealthy"
```

### Correlation IDs

```typescript
// correlation.ts
import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';

const correlationStorage = new AsyncLocalStorage<string>();

export function correlationMiddleware(req, res, next) {
  const correlationId = req.headers['x-correlation-id'] || uuidv4();
  res.setHeader('x-correlation-id', correlationId);

  correlationStorage.run(correlationId, () => {
    next();
  });
}

export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore();
}

// Usage in logger
const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format((info) => {
      info.correlation_id = getCorrelationId();
      return info;
    })(),
    winston.format.json()
  ),
});
```

---

## Distributed Tracing

### OpenTelemetry Setup

```typescript
// tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: process.env.SERVICE_NAME,
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV,
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        requestHook: (span, request) => {
          span.setAttribute('http.correlation_id', request.headers['x-correlation-id']);
        },
      },
    }),
  ],
});

sdk.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown().then(() => process.exit(0));
});
```

### Custom Spans for Chaos Experiments

```typescript
// chaos-tracing.ts
import { trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('chaos-experiments');

export async function tracedChaosExperiment<T>(
  experimentId: string,
  experimentName: string,
  fn: () => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(
    `chaos.experiment.${experimentName}`,
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'chaos.experiment_id': experimentId,
        'chaos.experiment_name': experimentName,
      },
    },
    async (span) => {
      try {
        const result = await fn();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    }
  );
}

// Usage
await tracedChaosExperiment('exp-123', 'network-latency', async () => {
  // Inject latency
  await injectNetworkLatency({ delayMs: 500 });
});
```

---

## Alerting Configuration

### Alert Rules for Chaos Experiments

```yaml
# chaos_alerts.yml
groups:
  - name: chaos_safety
    rules:
      # Abort trigger: Error rate too high
      - alert: ChaosAbortHighErrorRate
        expr: |
          sum(rate(http_request_errors_total[1m])) /
          sum(rate(http_requests_total[1m])) > 0.1
        for: 30s
        labels:
          severity: critical
          chaos_action: abort
        annotations:
          summary: "Error rate exceeded 10% - aborting chaos experiment"
          description: "Current error rate: {{ $value | printf \"%.2f\" }}%"

      # Abort trigger: Latency too high
      - alert: ChaosAbortHighLatency
        expr: |
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket[1m])) by (le)
          ) > 2
        for: 30s
        labels:
          severity: critical
          chaos_action: abort
        annotations:
          summary: "P95 latency exceeded 2 seconds - aborting chaos experiment"

      # Abort trigger: Dependency down
      - alert: ChaosAbortDependencyDown
        expr: dependency_health == 0
        for: 30s
        labels:
          severity: critical
          chaos_action: abort
        annotations:
          summary: "Critical dependency {{ $labels.dependency }} is down"

      # Warning: Approaching limits
      - alert: ChaosWarningErrorRate
        expr: |
          sum(rate(http_request_errors_total[1m])) /
          sum(rate(http_requests_total[1m])) > 0.05
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "Error rate approaching abort threshold (5%)"

  - name: chaos_experiment_tracking
    rules:
      # Track experiment duration
      - alert: ChaosExperimentRunningLong
        expr: |
          (time() - chaos_experiment_start_time) > 1800
        for: 0s
        labels:
          severity: info
        annotations:
          summary: "Chaos experiment running for over 30 minutes"
```

### Alertmanager Configuration

```yaml
# alertmanager.yml
global:
  slack_api_url: 'https://hooks.slack.com/services/XXX/YYY/ZZZ'

route:
  receiver: 'default'
  routes:
    # Critical chaos alerts go to abort webhook
    - match:
        chaos_action: abort
      receiver: 'chaos-abort'
      continue: true

    # All chaos alerts to Slack
    - match_re:
        alertname: 'Chaos.*'
      receiver: 'chaos-slack'

receivers:
  - name: 'default'
    slack_configs:
      - channel: '#alerts'

  - name: 'chaos-abort'
    webhook_configs:
      - url: 'http://chaos-controller:8080/abort'
        send_resolved: false

  - name: 'chaos-slack'
    slack_configs:
      - channel: '#chaos-experiments'
        title: '{{ .Status | toUpper }}: {{ .CommonLabels.alertname }}'
        text: '{{ .CommonAnnotations.summary }}'
```

---

## Dashboard Templates

### Chaos Experiment Dashboard

```json
{
  "annotations": {
    "list": [
      {
        "datasource": "Prometheus",
        "enable": true,
        "expr": "chaos_experiment_start_time",
        "name": "Experiment Start",
        "tagKeys": "experiment_id",
        "type": "tags"
      },
      {
        "datasource": "Prometheus",
        "enable": true,
        "expr": "chaos_experiment_end_time",
        "name": "Experiment End",
        "tagKeys": "experiment_id",
        "type": "tags"
      }
    ]
  },
  "panels": [
    {
      "title": "Experiment Status",
      "type": "stat",
      "gridPos": { "h": 4, "w": 6, "x": 0, "y": 0 },
      "targets": [
        {
          "expr": "chaos_experiment_active",
          "legendFormat": "Active Experiments"
        }
      ]
    },
    {
      "title": "Error Rate",
      "type": "timeseries",
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 4 },
      "targets": [
        {
          "expr": "sum(rate(http_request_errors_total[1m])) / sum(rate(http_requests_total[1m])) * 100",
          "legendFormat": "Error Rate %"
        }
      ],
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "green", "value": null },
          { "color": "yellow", "value": 5 },
          { "color": "red", "value": 10 }
        ]
      }
    },
    {
      "title": "Latency Distribution",
      "type": "heatmap",
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 4 },
      "targets": [
        {
          "expr": "sum(rate(http_request_duration_seconds_bucket[1m])) by (le)",
          "format": "heatmap"
        }
      ]
    },
    {
      "title": "Dependency Health",
      "type": "stat",
      "gridPos": { "h": 4, "w": 12, "x": 0, "y": 12 },
      "targets": [
        {
          "expr": "dependency_health",
          "legendFormat": "{{ dependency }}"
        }
      ],
      "mappings": [
        { "value": "1", "text": "Healthy", "color": "green" },
        { "value": "0", "text": "Unhealthy", "color": "red" }
      ]
    },
    {
      "title": "Circuit Breaker States",
      "type": "stat",
      "gridPos": { "h": 4, "w": 12, "x": 12, "y": 12 },
      "targets": [
        {
          "expr": "circuit_breaker_state",
          "legendFormat": "{{ circuit }}"
        }
      ],
      "mappings": [
        { "value": "0", "text": "Closed", "color": "green" },
        { "value": "1", "text": "Open", "color": "red" },
        { "value": "2", "text": "Half-Open", "color": "yellow" }
      ]
    }
  ]
}
```

---

## Pre-Experiment Checklist

```markdown
## Observability Readiness Checklist

### Metrics
- [ ] Application exposes Prometheus metrics
- [ ] Key RED metrics are available
- [ ] Dependency health metrics configured
- [ ] Circuit breaker metrics exposed

### Logging
- [ ] Structured JSON logging enabled
- [ ] Correlation IDs propagated
- [ ] Log aggregation configured
- [ ] Retention sufficient for analysis

### Tracing
- [ ] OpenTelemetry instrumentation active
- [ ] Traces sent to backend (Jaeger/Tempo)
- [ ] Sampling rate appropriate
- [ ] Span context propagation working

### Alerting
- [ ] Abort thresholds defined
- [ ] Alert routes configured
- [ ] Abort webhook functional
- [ ] On-call notified of experiment

### Dashboards
- [ ] Experiment dashboard created
- [ ] Baseline metrics recorded
- [ ] Comparison views available
- [ ] Team can access dashboards
```

---

## Best Practices

| Practice | Rationale |
|----------|-----------|
| Establish baselines before experiments | Know what "normal" looks like |
| Alert thresholds based on SLOs | Objective abort criteria |
| Use correlation IDs | Link events across systems |
| Record experiment timestamps | Enable before/after analysis |
| Keep dashboards simple | Quick identification of issues |
| Test alerting before experiments | Ensure abort mechanisms work |

---

*Guide from IDPF-Chaos Framework*
