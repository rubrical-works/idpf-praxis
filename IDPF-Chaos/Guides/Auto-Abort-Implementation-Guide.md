# Auto-Abort Implementation Guide
**Version:** v0.62.0

**Framework:** IDPF-Chaos

---

## Overview

Auto-abort mechanisms automatically stop chaos experiments when predefined thresholds are breached. This guide covers implementation patterns for safe chaos engineering.

---

## Why Auto-Abort?

| Without Auto-Abort | With Auto-Abort |
|-------------------|-----------------|
| Manual monitoring required | Automated safety net |
| Human reaction time (~30s+) | Machine reaction time (~1s) |
| Fatigue and missed signals | Consistent vigilance |
| Risk of extended outages | Bounded impact |

---

## Auto-Abort Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTO-ABORT SYSTEM                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Metrics    │───→│   Evaluator  │───→│   Executor   │      │
│  │   Source     │    │              │    │              │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                            │                    │               │
│                            ▼                    ▼               │
│                     ┌──────────────┐    ┌──────────────┐       │
│                     │   Rules      │    │   Chaos      │       │
│                     │   Engine     │    │   Tool API   │       │
│                     └──────────────┘    └──────────────┘       │
│                                                                 │
│  Flow:                                                         │
│  1. Collect metrics continuously                                │
│  2. Evaluate against abort rules                                │
│  3. Trigger abort via chaos tool API                           │
│  4. Notify operators                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Abort Threshold Categories

### Error Rate Thresholds

```yaml
thresholds:
  error_rate:
    # Percentage of requests returning 5xx
    critical: 10%     # Abort immediately
    warning: 5%       # Log warning
    evaluation_window: 60s
    consecutive_breaches: 2
```

### Latency Thresholds

```yaml
thresholds:
  latency:
    # P95 response time
    critical: 5000ms
    warning: 2000ms
    evaluation_window: 60s
    percentile: 95
```

### Availability Thresholds

```yaml
thresholds:
  availability:
    # Health check success rate
    critical: 95%     # Below this = abort
    warning: 99%
    evaluation_window: 60s
```

### Resource Thresholds

```yaml
thresholds:
  resources:
    cpu_utilization:
      critical: 95%
    memory_utilization:
      critical: 90%
    disk_utilization:
      critical: 85%
```

---

## Implementation Patterns

### Pattern 1: Prometheus + Alertmanager Webhook

```yaml
# prometheus/abort-rules.yml
groups:
  - name: chaos_abort
    rules:
      - alert: ChaosAbortErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[1m])) /
          sum(rate(http_requests_total[1m])) > 0.1
        for: 30s
        labels:
          severity: critical
          action: abort_chaos
        annotations:
          summary: "Error rate > 10%, aborting chaos"
          runbook: "Auto-abort triggered, investigate"

      - alert: ChaosAbortLatency
        expr: |
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket[1m])) by (le)
          ) > 5
        for: 30s
        labels:
          severity: critical
          action: abort_chaos
        annotations:
          summary: "P95 latency > 5s, aborting chaos"

      - alert: ChaosAbortAvailability
        expr: |
          sum(up{job="application"}) / count(up{job="application"}) < 0.95
        for: 30s
        labels:
          severity: critical
          action: abort_chaos
        annotations:
          summary: "Availability < 95%, aborting chaos"
```

```yaml
# alertmanager/config.yml
route:
  receiver: default
  routes:
    - match:
        action: abort_chaos
      receiver: chaos-abort-webhook
      repeat_interval: 1m

receivers:
  - name: default
    slack_configs:
      - channel: '#alerts'

  - name: chaos-abort-webhook
    webhook_configs:
      - url: 'http://chaos-controller:8080/api/abort'
        send_resolved: false
```

### Pattern 2: Dedicated Abort Controller

```typescript
// abort-controller.ts
import express from 'express';
import { PrometheusDriver } from 'prometheus-query';

interface AbortConfig {
  experimentId: string;
  thresholds: {
    errorRate: number;
    latencyP95: number;
    availability: number;
  };
  evaluationInterval: number;
  chaosToolEndpoint: string;
}

class AbortController {
  private prometheus: PrometheusDriver;
  private config: AbortConfig;
  private isMonitoring: boolean = false;
  private intervalId?: NodeJS.Timeout;

  constructor(config: AbortConfig) {
    this.config = config;
    this.prometheus = new PrometheusDriver({
      endpoint: process.env.PROMETHEUS_URL || 'http://prometheus:9090',
    });
  }

  async start(): Promise<void> {
    this.isMonitoring = true;
    console.log(`Starting abort monitoring for experiment ${this.config.experimentId}`);

    this.intervalId = setInterval(
      () => this.evaluate(),
      this.config.evaluationInterval
    );
  }

  async stop(): Promise<void> {
    this.isMonitoring = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private async evaluate(): Promise<void> {
    if (!this.isMonitoring) return;

    try {
      const [errorRate, latency, availability] = await Promise.all([
        this.getErrorRate(),
        this.getLatencyP95(),
        this.getAvailability(),
      ]);

      console.log(`Metrics: error=${errorRate}%, latency=${latency}ms, availability=${availability}%`);

      if (errorRate > this.config.thresholds.errorRate) {
        await this.triggerAbort(`Error rate ${errorRate}% > ${this.config.thresholds.errorRate}%`);
        return;
      }

      if (latency > this.config.thresholds.latencyP95) {
        await this.triggerAbort(`P95 latency ${latency}ms > ${this.config.thresholds.latencyP95}ms`);
        return;
      }

      if (availability < this.config.thresholds.availability) {
        await this.triggerAbort(`Availability ${availability}% < ${this.config.thresholds.availability}%`);
        return;
      }
    } catch (error) {
      console.error('Error evaluating metrics:', error);
      // Consider aborting on monitoring failure
    }
  }

  private async getErrorRate(): Promise<number> {
    const result = await this.prometheus.instantQuery(
      'sum(rate(http_requests_total{status=~"5.."}[1m])) / sum(rate(http_requests_total[1m])) * 100'
    );
    return parseFloat(result.result[0]?.value?.value || '0');
  }

  private async getLatencyP95(): Promise<number> {
    const result = await this.prometheus.instantQuery(
      'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[1m])) by (le)) * 1000'
    );
    return parseFloat(result.result[0]?.value?.value || '0');
  }

  private async getAvailability(): Promise<number> {
    const result = await this.prometheus.instantQuery(
      'sum(up{job="application"}) / count(up{job="application"}) * 100'
    );
    return parseFloat(result.result[0]?.value?.value || '100');
  }

  private async triggerAbort(reason: string): Promise<void> {
    console.log(`ABORT TRIGGERED: ${reason}`);

    this.isMonitoring = false;
    await this.stop();

    try {
      // Stop chaos experiment
      await fetch(`${this.config.chaosToolEndpoint}/experiments/${this.config.experimentId}/abort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });

      // Notify
      await this.notify(reason);
    } catch (error) {
      console.error('Error aborting experiment:', error);
      // Try backup abort method
      await this.emergencyAbort();
    }
  }

  private async notify(reason: string): Promise<void> {
    // Slack notification
    if (process.env.SLACK_WEBHOOK) {
      await fetch(process.env.SLACK_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🛑 Chaos experiment aborted: ${reason}`,
          attachments: [{
            color: 'danger',
            fields: [
              { title: 'Experiment', value: this.config.experimentId },
              { title: 'Reason', value: reason },
              { title: 'Time', value: new Date().toISOString() },
            ],
          }],
        }),
      });
    }
  }

  private async emergencyAbort(): Promise<void> {
    // Fallback: kubectl delete all chaos resources
    const { exec } = require('child_process');
    exec(`kubectl delete networkchaos,podchaos,stresschaos -l experiment-id=${this.config.experimentId} -n chaos-testing`);
  }
}

// API Server
const app = express();
app.use(express.json());

const controllers = new Map<string, AbortController>();

app.post('/api/experiments/:id/start-monitoring', async (req, res) => {
  const { id } = req.params;
  const config: AbortConfig = {
    experimentId: id,
    thresholds: req.body.thresholds || {
      errorRate: 10,
      latencyP95: 5000,
      availability: 95,
    },
    evaluationInterval: req.body.evaluationInterval || 5000,
    chaosToolEndpoint: req.body.chaosToolEndpoint || 'http://chaos-mesh:2333',
  };

  const controller = new AbortController(config);
  controllers.set(id, controller);
  await controller.start();

  res.json({ status: 'monitoring started', experimentId: id });
});

app.post('/api/experiments/:id/stop-monitoring', async (req, res) => {
  const { id } = req.params;
  const controller = controllers.get(id);

  if (controller) {
    await controller.stop();
    controllers.delete(id);
  }

  res.json({ status: 'monitoring stopped', experimentId: id });
});

// Webhook endpoint for Alertmanager
app.post('/api/abort', async (req, res) => {
  const { alerts } = req.body;

  for (const alert of alerts) {
    if (alert.labels.action === 'abort_chaos') {
      // Abort all active experiments
      for (const [id, controller] of controllers) {
        await controller.stop();
        controllers.delete(id);
      }
    }
  }

  res.json({ status: 'processed' });
});

app.listen(8080, () => {
  console.log('Abort controller listening on port 8080');
});
```

### Pattern 3: Chaos Mesh Integration

```yaml
# chaos-mesh-abort-policy.yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: Workflow
metadata:
  name: experiment-with-abort
spec:
  entry: main
  templates:
    - name: main
      templateType: Serial
      children:
        - start-monitoring
        - run-chaos
        - stop-monitoring

    - name: start-monitoring
      templateType: Task
      task:
        container:
          name: monitor
          image: abort-controller:latest
          command: ['node', 'start-monitoring.js']
          env:
            - name: EXPERIMENT_ID
              value: "{{workflow.name}}"

    - name: run-chaos
      templateType: NetworkChaos
      networkChaos:
        action: delay
        mode: all
        selector:
          namespaces:
            - production
          labelSelectors:
            app: myapp
        delay:
          latency: 100ms
        duration: 10m

    - name: stop-monitoring
      templateType: Task
      task:
        container:
          name: monitor
          image: abort-controller:latest
          command: ['node', 'stop-monitoring.js']
          env:
            - name: EXPERIMENT_ID
              value: "{{workflow.name}}"
```

### Pattern 4: AWS Fault Injection Simulator

```json
{
  "description": "Network latency with auto-abort",
  "targets": {
    "myApp": {
      "resourceType": "aws:ecs:task",
      "selectionMode": "ALL",
      "resourceTags": {
        "Application": "myapp"
      }
    }
  },
  "actions": {
    "injectLatency": {
      "actionId": "aws:ecs:task-network-latency",
      "parameters": {
        "duration": "PT10M",
        "delayMilliseconds": "100",
        "interface": "eth0"
      },
      "targets": {
        "Tasks": "myApp"
      }
    }
  },
  "stopConditions": [
    {
      "source": "aws:cloudwatch:alarm",
      "value": "arn:aws:cloudwatch:us-east-1:123456789:alarm:HighErrorRate"
    },
    {
      "source": "aws:cloudwatch:alarm",
      "value": "arn:aws:cloudwatch:us-east-1:123456789:alarm:HighLatency"
    }
  ],
  "roleArn": "arn:aws:iam::123456789:role/FISRole"
}
```

```yaml
# CloudWatch alarm for abort
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  HighErrorRateAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: HighErrorRate
      MetricName: 5XXError
      Namespace: AWS/ApplicationELB
      Statistic: Average
      Period: 60
      EvaluationPeriods: 2
      Threshold: 10
      ComparisonOperator: GreaterThanThreshold
      Dimensions:
        - Name: LoadBalancer
          Value: !Ref ApplicationLoadBalancer
```

---

## Abort Response Actions

### Immediate Actions

```typescript
interface AbortActions {
  // Stop the chaos injection
  stopInjection: () => Promise<void>;

  // Scale up to handle remaining load
  scaleUp?: () => Promise<void>;

  // Clear circuit breakers
  resetCircuitBreakers?: () => Promise<void>;

  // Flush caches if corrupted
  flushCaches?: () => Promise<void>;

  // Notify team
  notify: (reason: string) => Promise<void>;
}

async function executeAbort(
  experimentId: string,
  reason: string,
  actions: AbortActions
): Promise<void> {
  const timeline: Array<{ action: string; time: string; result: string }> = [];

  // 1. Stop injection immediately
  const stopStart = Date.now();
  await actions.stopInjection();
  timeline.push({
    action: 'Stop injection',
    time: `${Date.now() - stopStart}ms`,
    result: 'success',
  });

  // 2. Notify (don't wait)
  actions.notify(reason).catch(console.error);

  // 3. Optional recovery actions
  if (actions.scaleUp) {
    const scaleStart = Date.now();
    await actions.scaleUp();
    timeline.push({
      action: 'Scale up',
      time: `${Date.now() - scaleStart}ms`,
      result: 'success',
    });
  }

  if (actions.resetCircuitBreakers) {
    await actions.resetCircuitBreakers();
  }

  // 4. Log abort event
  console.log('Abort completed', {
    experimentId,
    reason,
    timeline,
    totalTime: `${Date.now() - stopStart}ms`,
  });
}
```

---

## Testing Auto-Abort

### Abort Drill Template

```markdown
## Auto-Abort Drill

### Objective
Verify auto-abort triggers correctly and recovery completes successfully.

### Preconditions
- [ ] Non-production environment
- [ ] Abort thresholds configured
- [ ] Monitoring verified working
- [ ] Team notified

### Test Steps

1. **Baseline capture** (5 min)
   - Record current metrics
   - Verify all systems healthy

2. **Start monitoring**
   ```bash
   curl -X POST http://abort-controller:8080/api/experiments/drill-001/start-monitoring \
     -H 'Content-Type: application/json' \
     -d '{"thresholds": {"errorRate": 5, "latencyP95": 2000}}'
   ```

3. **Inject fault that exceeds threshold**
   - Use a scenario known to breach thresholds
   - Observe abort trigger

4. **Verify abort sequence**
   - [ ] Injection stopped within [X] seconds
   - [ ] Notification received
   - [ ] Recovery actions executed
   - [ ] System returned to healthy state

5. **Record results**
   - Time to detect breach: [X]s
   - Time to stop injection: [X]s
   - Time to full recovery: [X]s
   - Any issues observed: [Notes]

### Success Criteria
- Abort triggered within 60 seconds of threshold breach
- System recovered within 5 minutes
- No manual intervention required
```

---

## Best Practices

| Practice | Rationale |
|----------|-----------|
| Test abort before every experiment | Verify it works when you need it |
| Set conservative initial thresholds | Tune based on experience |
| Use multiple threshold types | Single metric may miss issues |
| Include monitoring failure as abort trigger | Don't fly blind |
| Log all abort events | Learn from triggers |
| Review and tune regularly | Systems and loads change |

---

## Anti-Patterns

| Anti-Pattern | Problem | Better Approach |
|--------------|---------|-----------------|
| No auto-abort | Relies on human detection | Always have automated abort |
| Thresholds too loose | Abort comes too late | Start conservative, loosen over time |
| Single metric | Misses partial failures | Multiple metrics and types |
| No abort testing | May not work when needed | Regular abort drills |
| Ignoring abort events | Missed learning opportunity | Review every abort |

---

*Guide from IDPF-Chaos Framework*
