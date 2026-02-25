# Rollback Procedure Guide
**Version:** v0.52.0

**Framework:** IDPF-Chaos

---

## Overview

Every chaos experiment needs a clear rollback plan. This guide covers rollback strategies, automated recovery procedures, and manual intervention protocols.

---

## Rollback Principles

| Principle | Description |
|-----------|-------------|
| **Defined before injection** | Never inject without a rollback plan |
| **Tested independently** | Verify rollback works before experiments |
| **Automated when possible** | Human reaction time is too slow |
| **Idempotent** | Can be run multiple times safely |
| **Documented** | Everyone knows what to do |

---

## Rollback Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│                  ROLLBACK STRATEGIES                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Level 1: AUTOMATIC                                     │
│  ├── Circuit breakers                                   │
│  ├── Auto-scaling                                       │
│  ├── Chaos tool auto-abort                              │
│  └── Health check-based recovery                        │
│                                                         │
│  Level 2: SEMI-AUTOMATIC                                │
│  ├── Runbook-triggered scripts                          │
│  ├── Single-click rollbacks                             │
│  └── Alert-triggered automation                         │
│                                                         │
│  Level 3: MANUAL                                        │
│  ├── Documented procedures                              │
│  ├── War room escalation                                │
│  └── Vendor support engagement                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Automatic Rollback Mechanisms

### Circuit Breaker Recovery

```typescript
// circuit-breaker.ts
import CircuitBreaker from 'opossum';

const options = {
  timeout: 3000,           // Time before timeout
  errorThresholdPercentage: 50,  // Error % to open circuit
  resetTimeout: 30000,     // Time before half-open
  volumeThreshold: 5,      // Minimum calls before circuit evaluates
};

const breaker = new CircuitBreaker(async (request) => {
  return await callExternalService(request);
}, options);

// Events for observability
breaker.on('open', () => {
  logger.warn('Circuit breaker opened', { circuit: 'external-service' });
  metrics.circuitBreakerState.set({ circuit: 'external-service' }, 1);
});

breaker.on('halfOpen', () => {
  logger.info('Circuit breaker half-open', { circuit: 'external-service' });
  metrics.circuitBreakerState.set({ circuit: 'external-service' }, 2);
});

breaker.on('close', () => {
  logger.info('Circuit breaker closed', { circuit: 'external-service' });
  metrics.circuitBreakerState.set({ circuit: 'external-service' }, 0);
});

// Fallback for when circuit is open
breaker.fallback(() => {
  return { status: 'degraded', message: 'Service temporarily unavailable' };
});

export async function callWithCircuitBreaker(request) {
  return await breaker.fire(request);
}
```

### Kubernetes Auto-Recovery

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  template:
    spec:
      containers:
        - name: app
          image: myapp:latest
          # Liveness probe - restarts unhealthy pods
          livenessProbe:
            httpGet:
              path: /health/live
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
            failureThreshold: 3
          # Readiness probe - removes from service
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 5
            failureThreshold: 3
          resources:
            limits:
              cpu: "1"
              memory: "512Mi"
            requests:
              cpu: "500m"
              memory: "256Mi"
      # Pod disruption budget for availability
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: myapp-pdb
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: myapp
```

### Chaos Mesh Auto-Abort

```yaml
# chaos-with-abort.yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
  name: network-latency-experiment
spec:
  action: delay
  mode: all
  selector:
    namespaces:
      - production
    labelSelectors:
      app: myapp
  delay:
    latency: 200ms
  duration: 5m

  # Abort conditions
  scheduler:
    cron: '@every 30s'  # Periodic check

---
# Abort policy via external controller
apiVersion: chaos-mesh.org/v1alpha1
kind: Schedule
metadata:
  name: abort-on-error
spec:
  schedule: '@every 10s'
  type: 'Workflow'
  workflow:
    templates:
      - name: check-and-abort
        steps:
          - - name: check-error-rate
              template: check-metrics
          - - name: abort-if-needed
              template: abort-experiment
              when: "{{steps.check-error-rate.outputs.result}} == 'abort'"
```

---

## Semi-Automatic Rollback Scripts

### Rollback Script Template

```bash
#!/bin/bash
# rollback.sh - Generic rollback script for chaos experiments

set -euo pipefail

# Configuration
EXPERIMENT_ID="${1:?Experiment ID required}"
NAMESPACE="${CHAOS_NAMESPACE:-production}"
LOG_FILE="/var/log/chaos/rollback-${EXPERIMENT_ID}.log"

log() {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_FILE"
}

# Step 1: Stop active chaos experiments
stop_chaos() {
    log "Stopping chaos experiments..."

    # Chaos Mesh
    if command -v kubectl &> /dev/null; then
        kubectl delete networkchaos,podchaos,stresschaos,iochaos \
            -l experiment-id="$EXPERIMENT_ID" \
            -n "$NAMESPACE" \
            --ignore-not-found=true
    fi

    # Gremlin
    if command -v gremlin &> /dev/null; then
        gremlin halt --experiment="$EXPERIMENT_ID"
    fi

    # LitmusChaos
    if kubectl get crd chaosengines.litmuschaos.io &> /dev/null; then
        kubectl patch chaosengine "$EXPERIMENT_ID" \
            -n "$NAMESPACE" \
            --type merge \
            -p '{"spec":{"engineState":"stop"}}'
    fi

    log "Chaos experiments stopped"
}

# Step 2: Verify service health
verify_health() {
    log "Verifying service health..."

    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if curl -sf http://myapp.${NAMESPACE}.svc.cluster.local/health; then
            log "Service health check passed"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 2
    done

    log "WARNING: Service health check failed after $max_attempts attempts"
    return 1
}

# Step 3: Scale if needed
scale_recovery() {
    log "Checking if scale recovery needed..."

    local current_replicas
    current_replicas=$(kubectl get deployment myapp -n "$NAMESPACE" -o jsonpath='{.spec.replicas}')

    if [ "$current_replicas" -lt 3 ]; then
        log "Scaling up to minimum replicas..."
        kubectl scale deployment myapp -n "$NAMESPACE" --replicas=3
        kubectl rollout status deployment myapp -n "$NAMESPACE" --timeout=5m
    fi

    log "Scale recovery complete"
}

# Step 4: Clear circuit breakers
clear_circuit_breakers() {
    log "Clearing circuit breakers..."

    # Application-specific endpoint to reset circuit breakers
    curl -X POST http://myapp.${NAMESPACE}.svc.cluster.local/admin/circuit-breakers/reset \
        -H "X-Admin-Key: ${ADMIN_KEY:-}" || true

    log "Circuit breakers cleared"
}

# Step 5: Notify team
notify() {
    log "Sending notifications..."

    # Slack notification
    if [ -n "${SLACK_WEBHOOK:-}" ]; then
        curl -X POST "$SLACK_WEBHOOK" \
            -H 'Content-Type: application/json' \
            -d "{\"text\":\"Chaos experiment rollback completed for $EXPERIMENT_ID\"}"
    fi

    # PagerDuty
    if [ -n "${PAGERDUTY_KEY:-}" ]; then
        curl -X POST https://events.pagerduty.com/v2/enqueue \
            -H 'Content-Type: application/json' \
            -d "{
                \"routing_key\": \"$PAGERDUTY_KEY\",
                \"event_action\": \"resolve\",
                \"dedup_key\": \"chaos-$EXPERIMENT_ID\"
            }"
    fi

    log "Notifications sent"
}

# Main execution
main() {
    log "Starting rollback for experiment: $EXPERIMENT_ID"

    stop_chaos
    verify_health || scale_recovery
    clear_circuit_breakers
    notify

    log "Rollback completed successfully"
}

main "$@"
```

### Kubernetes Rollback Scripts

```bash
#!/bin/bash
# k8s-rollback.sh - Kubernetes-specific rollback procedures

# Rollback deployment to previous version
rollback_deployment() {
    local deployment=$1
    local namespace=$2

    echo "Rolling back $deployment in $namespace..."

    kubectl rollout undo deployment/"$deployment" -n "$namespace"
    kubectl rollout status deployment/"$deployment" -n "$namespace" --timeout=10m
}

# Restore from ConfigMap backup
restore_config() {
    local configmap=$1
    local backup_name="${configmap}-backup"
    local namespace=$2

    if kubectl get configmap "$backup_name" -n "$namespace" &> /dev/null; then
        echo "Restoring ConfigMap from backup..."
        kubectl get configmap "$backup_name" -n "$namespace" -o yaml | \
            sed "s/name: $backup_name/name: $configmap/" | \
            kubectl apply -f -

        # Restart pods to pick up new config
        kubectl rollout restart deployment -n "$namespace" -l uses-config="$configmap"
    else
        echo "No backup found for $configmap"
        return 1
    fi
}

# Drain and restore node
restore_node() {
    local node=$1

    echo "Restoring node $node..."

    # Uncordon node
    kubectl uncordon "$node"

    # Remove any taints added during experiment
    kubectl taint nodes "$node" chaos-experiment- --ignore-not-found=true

    echo "Node $node restored"
}

# Restore network policies
restore_network() {
    local namespace=$1
    local backup_dir="/tmp/netpol-backup"

    if [ -d "$backup_dir" ]; then
        echo "Restoring network policies..."
        kubectl apply -f "$backup_dir/" -n "$namespace"
    fi
}
```

---

## Manual Rollback Procedures

### Rollback Runbook Template

```markdown
# Rollback Runbook: [Experiment Name]

## Quick Reference

| Item | Value |
|------|-------|
| Experiment ID | [ID] |
| Start Time | [Time] |
| Duration | [Duration] |
| Blast Radius | [Affected services] |
| On-Call | [Name/Contact] |

## Automatic Recovery Expected

1. Circuit breakers should open within 30 seconds
2. Health checks should trigger pod restarts within 60 seconds
3. Auto-scaling should add capacity within 5 minutes

**If automatic recovery does not occur within 5 minutes, proceed to manual rollback.**

## Manual Rollback Steps

### Step 1: Stop Chaos Injection (Estimated: 1 minute)

```bash
# Option A: Use rollback script
./rollback.sh [experiment-id]

# Option B: Manual stop
kubectl delete [chaos-resource] [experiment-name] -n [namespace]
```

**Verification:** Chaos dashboard shows no active experiments

### Step 2: Verify Service Health (Estimated: 2 minutes)

```bash
# Check pod status
kubectl get pods -n [namespace] -l app=[service]

# Check service endpoints
kubectl get endpoints [service] -n [namespace]

# Test health endpoint
curl -v http://[service-url]/health
```

**Expected:** All pods Running, endpoints populated, health returns 200

### Step 3: Scale Recovery (If Needed) (Estimated: 5 minutes)

```bash
# Scale to safe level
kubectl scale deployment [service] -n [namespace] --replicas=5

# Wait for rollout
kubectl rollout status deployment [service] -n [namespace]
```

**Verification:** Desired replicas == Ready replicas

### Step 4: Clear Stale State (Estimated: 2 minutes)

```bash
# Reset circuit breakers
curl -X POST http://[service-url]/admin/reset-circuits

# Clear caches if needed
curl -X POST http://[service-url]/admin/clear-cache
```

### Step 5: Verify Recovery (Estimated: 5 minutes)

- [ ] Error rate below 1%
- [ ] Latency p95 below [threshold]
- [ ] All health checks passing
- [ ] No alerts firing

## Escalation

If recovery is not achieved within 15 minutes:

1. Page [escalation contact]
2. Open incident channel: #incident-[date]
3. Consider full deployment rollback

## Post-Rollback

1. Document what happened
2. Capture metrics and logs
3. Schedule post-mortem if needed
```

---

## Rollback Verification

### Health Check Suite

```typescript
// verify-rollback.ts
interface VerificationResult {
  check: string;
  passed: boolean;
  details: string;
}

async function verifyRollback(service: string): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];

  // Check 1: Service responding
  try {
    const healthResponse = await fetch(`${service}/health`);
    results.push({
      check: 'Service Health',
      passed: healthResponse.ok,
      details: `Status: ${healthResponse.status}`,
    });
  } catch (error) {
    results.push({
      check: 'Service Health',
      passed: false,
      details: error.message,
    });
  }

  // Check 2: Error rate
  const errorRate = await queryPrometheus(
    `sum(rate(http_request_errors_total{service="${service}"}[1m])) / sum(rate(http_requests_total{service="${service}"}[1m]))`
  );
  results.push({
    check: 'Error Rate',
    passed: errorRate < 0.01,
    details: `Error rate: ${(errorRate * 100).toFixed(2)}%`,
  });

  // Check 3: Latency
  const p95Latency = await queryPrometheus(
    `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{service="${service}"}[1m])) by (le))`
  );
  results.push({
    check: 'P95 Latency',
    passed: p95Latency < 0.5,
    details: `P95: ${(p95Latency * 1000).toFixed(0)}ms`,
  });

  // Check 4: Dependencies
  const depHealth = await fetch(`${service}/health/dependencies`);
  const deps = await depHealth.json();
  for (const [name, status] of Object.entries(deps)) {
    results.push({
      check: `Dependency: ${name}`,
      passed: status === 'healthy',
      details: `Status: ${status}`,
    });
  }

  // Check 5: No active chaos
  const activeChaos = await queryPrometheus('chaos_experiment_active');
  results.push({
    check: 'No Active Chaos',
    passed: activeChaos === 0,
    details: `Active experiments: ${activeChaos}`,
  });

  return results;
}

// Run verification
async function runVerification() {
  console.log('Running rollback verification...\n');

  const results = await verifyRollback('http://myapp:8080');

  let allPassed = true;
  for (const result of results) {
    const status = result.passed ? '✓' : '✗';
    console.log(`${status} ${result.check}: ${result.details}`);
    if (!result.passed) allPassed = false;
  }

  console.log(`\nOverall: ${allPassed ? 'PASSED' : 'FAILED'}`);
  process.exit(allPassed ? 0 : 1);
}
```

---

## Rollback Testing

### Test Rollback Before Experiments

```yaml
# test-rollback.yaml
name: Rollback Test
description: Verify rollback procedures work correctly

steps:
  - name: Record baseline
    action: capture_metrics
    duration: 5m

  - name: Inject benign fault
    action: inject_chaos
    type: latency
    params:
      delay: 50ms
      duration: 1m

  - name: Execute rollback
    action: run_rollback
    script: ./rollback.sh test-001

  - name: Verify recovery
    action: verify_health
    timeout: 5m
    checks:
      - error_rate < 0.01
      - p95_latency < 500ms
      - all_pods_ready

  - name: Compare to baseline
    action: compare_metrics
    tolerance: 10%
```

---

## Best Practices

| Practice | Rationale |
|----------|-----------|
| Test rollback independently | Don't discover it's broken during an incident |
| Automate everything possible | Human reaction time adds to impact |
| Document manual steps clearly | Stress reduces cognitive ability |
| Include verification steps | Know when rollback is complete |
| Version control runbooks | Track changes and improvements |
| Practice regularly | Skills degrade without use |

---

*Guide from IDPF-Chaos Framework*
