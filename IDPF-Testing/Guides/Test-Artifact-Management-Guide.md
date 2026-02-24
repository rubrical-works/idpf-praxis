# Test Artifact Management Guide
**Version:** v0.50.0

**Framework:** IDPF-Testing

---

## Overview

Test artifacts include reports, logs, screenshots, videos, and coverage data generated during test execution. Proper management ensures traceability, supports debugging, and enables continuous improvement through metrics tracking.

---

## Artifact Types

| Artifact Type | Purpose | Retention | Storage |
|---------------|---------|-----------|---------|
| Test Reports | Execution results | Per release | CI artifacts |
| Coverage Reports | Code coverage metrics | Per release | CI artifacts |
| Failure Screenshots | Visual debugging | 30 days | CI artifacts |
| Failure Videos | Debugging complex failures | 14 days | CI artifacts |
| Test Logs | Detailed execution trace | 7 days | CI artifacts |
| Performance Metrics | Trend analysis | 90+ days | External storage |

---

## Test Report Management

### Report Formats

| Format | Use Case | Tool Support |
|--------|----------|--------------|
| HTML | Human-readable, shareable | All frameworks |
| JUnit XML | CI/CD integration | GitHub Actions, Jenkins |
| JSON | Programmatic processing | Custom dashboards |
| Allure | Rich visual reports | Multi-language |

### HTML Report Configuration

**Playwright (Node.js):**
```typescript
// playwright.config.ts
reporter: [
  ['html', {
    outputFolder: 'reports/html',
    open: 'never'  // Don't auto-open in CI
  }],
  ['junit', { outputFile: 'reports/junit.xml' }],
  ['json', { outputFile: 'reports/results.json' }]
]
```

**pytest (Python):**
```ini
# pytest.ini
[pytest]
addopts =
  --html=reports/report.html
  --self-contained-html
  --junitxml=reports/junit.xml
```

**JUnit 5 (Java):**
```xml
<!-- pom.xml -->
<plugin>
  <groupId>org.apache.maven.plugins</groupId>
  <artifactId>maven-surefire-plugin</artifactId>
  <configuration>
    <reportsDirectory>${project.build.directory}/reports</reportsDirectory>
  </configuration>
</plugin>
```

### Allure Report Setup

```bash
# Node.js
npm install -D allure-playwright

# Python
pip install allure-pytest

# Java (add to pom.xml)
# Already included in Test-Environment-Setup-Guide.md
```

**Generate Allure Report:**
```bash
# After test run
allure generate reports/allure-results -o reports/allure-report --clean
allure open reports/allure-report
```

---

## Log Management

### Logging Levels

| Level | Use Case | CI Visibility |
|-------|----------|---------------|
| ERROR | Test failures, exceptions | Always shown |
| WARN | Potential issues, retries | Summary only |
| INFO | Test steps, checkpoints | Verbose mode |
| DEBUG | Detailed debugging | Local only |

### Structured Logging

**Node.js (using winston):**
```typescript
// src/utils/logger.ts
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'reports/logs/test.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

export { logger };
```

**Python (using logging):**
```python
# src/utils/logger.py
import logging
import os
from datetime import datetime

def setup_logger():
    log_dir = 'reports/logs'
    os.makedirs(log_dir, exist_ok=True)

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    log_file = f'{log_dir}/test_{timestamp}.log'

    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s | %(levelname)s | %(name)s | %(message)s',
        handlers=[
            logging.FileHandler(log_file),
            logging.StreamHandler()
        ]
    )
    return logging.getLogger('test')
```

**Java (using SLF4J/Logback):**
```xml
<!-- src/test/resources/logback-test.xml -->
<configuration>
  <appender name="FILE" class="ch.qos.logback.core.FileAppender">
    <file>reports/logs/test.log</file>
    <encoder>
      <pattern>%d{HH:mm:ss.SSS} | %-5level | %logger{36} | %msg%n</pattern>
    </encoder>
  </appender>

  <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
    <encoder>
      <pattern>%d{HH:mm:ss} | %-5level | %msg%n</pattern>
    </encoder>
  </appender>

  <root level="INFO">
    <appender-ref ref="FILE" />
    <appender-ref ref="CONSOLE" />
  </root>
</configuration>
```

### Log Rotation

For long-running test suites or continuous testing:

```yaml
# logrotate configuration (Linux)
/path/to/reports/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
```

---

## Screenshot Management

### Capture Strategies

| Strategy | When | Storage Impact |
|----------|------|----------------|
| On failure | Test fails | Low |
| On every step | Debug mode | High |
| Before/after actions | Critical flows | Medium |
| Baseline comparison | Visual testing | Medium |

### Playwright Screenshot Config

```typescript
// playwright.config.ts
use: {
  screenshot: 'only-on-failure',  // Options: 'off', 'on', 'only-on-failure'
  trace: 'on-first-retry',
}
```

**Custom Screenshot Helper:**
```typescript
// src/utils/screenshots.ts
import { Page } from '@playwright/test';
import path from 'path';

export async function captureScreenshot(
  page: Page,
  name: string,
  options?: { fullPage?: boolean }
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${name}_${timestamp}.png`;
  const filepath = path.join('reports', 'screenshots', filename);

  await page.screenshot({
    path: filepath,
    fullPage: options?.fullPage ?? false
  });

  return filepath;
}
```

### Screenshot Organization

```
reports/screenshots/
├── failures/                         # Automatic failure captures
│   ├── login_invalid_creds_2024-01-15T10-30-00.png
│   └── checkout_timeout_2024-01-15T10-31-00.png
├── baselines/                        # Visual regression baselines
│   ├── homepage_chrome_desktop.png
│   └── homepage_firefox_desktop.png
└── comparisons/                      # Visual diff results
    └── homepage_diff_2024-01-15.png
```

### Cleanup Script

```bash
#!/bin/bash
# scripts/cleanup-screenshots.sh

# Remove screenshots older than 30 days
find reports/screenshots/failures -name "*.png" -mtime +30 -delete

# Keep baselines indefinitely (managed manually)
# Keep comparisons for 14 days
find reports/screenshots/comparisons -name "*.png" -mtime +14 -delete
```

---

## Video Recording

### When to Record

| Scenario | Recording | Reason |
|----------|-----------|--------|
| CI failures | Retain on failure | Debug without reproduction |
| Local development | Off | Performance, storage |
| Flaky test investigation | Always on | Capture intermittent issues |
| Visual regression | Off | Screenshots sufficient |

### Playwright Video Config

```typescript
// playwright.config.ts
use: {
  video: 'retain-on-failure',  // Options: 'off', 'on', 'retain-on-failure'
  // Video settings
  contextOptions: {
    recordVideo: {
      dir: 'reports/videos/',
      size: { width: 1280, height: 720 }
    }
  }
}
```

### Video Storage Considerations

| Quality | Size (per minute) | Use Case |
|---------|-------------------|----------|
| 1280x720 | ~5-10 MB | Standard CI |
| 1920x1080 | ~15-25 MB | Detailed debugging |
| 640x480 | ~2-5 MB | Quick verification |

**Compression Script:**
```bash
#!/bin/bash
# scripts/compress-videos.sh

for video in reports/videos/*.webm; do
  if [ -f "$video" ]; then
    ffmpeg -i "$video" -c:v libx264 -crf 28 "${video%.webm}_compressed.mp4"
    rm "$video"
  fi
done
```

---

## CI/CD Integration

### GitHub Actions Artifact Upload

```yaml
# .github/workflows/tests.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run tests
        run: npm test
        continue-on-error: true

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results-${{ github.run_number }}
          path: |
            reports/html/
            reports/junit.xml
          retention-days: 30

      - name: Upload failure artifacts
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: failure-artifacts-${{ github.run_number }}
          path: |
            reports/screenshots/
            reports/videos/
            reports/logs/
          retention-days: 14

      - name: Publish Test Results
        if: always()
        uses: EnricoMi/publish-unit-test-result-action@v2
        with:
          files: reports/junit.xml
```

### Jenkins Pipeline

```groovy
// Jenkinsfile
pipeline {
    agent any

    stages {
        stage('Test') {
            steps {
                sh 'npm test'
            }
            post {
                always {
                    junit 'reports/junit.xml'
                    publishHTML([
                        reportDir: 'reports/html',
                        reportFiles: 'index.html',
                        reportName: 'Test Report'
                    ])
                    archiveArtifacts artifacts: 'reports/**/*', fingerprint: true
                }
            }
        }
    }
}
```

### GitLab CI

```yaml
# .gitlab-ci.yml
test:
  script:
    - npm test
  artifacts:
    when: always
    paths:
      - reports/
    reports:
      junit: reports/junit.xml
    expire_in: 30 days
```

---

## External Storage Integration

### AWS S3 Storage

```typescript
// scripts/upload-to-s3.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

const s3 = new S3Client({ region: process.env.AWS_REGION });

async function uploadArtifacts(runId: string): Promise<void> {
  const bucket = process.env.S3_BUCKET;
  const reportPath = 'reports/html/index.html';

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: `test-reports/${runId}/index.html`,
    Body: fs.readFileSync(reportPath),
    ContentType: 'text/html'
  }));
}
```

### Report Dashboard Integration

For long-term trend analysis, send results to external dashboards:

```typescript
// scripts/report-to-dashboard.ts
interface TestResult {
  runId: string;
  timestamp: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  branch: string;
}

async function reportResults(results: TestResult): Promise<void> {
  await fetch(process.env.DASHBOARD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(results)
  });
}
```

---

## Retention Policy

### Recommended Retention Periods

| Artifact Type | Development | Staging | Production |
|---------------|-------------|---------|------------|
| Test Reports | 7 days | 30 days | 90 days |
| Coverage Reports | 7 days | 30 days | 90 days |
| Failure Screenshots | 14 days | 30 days | 60 days |
| Videos | 7 days | 14 days | 30 days |
| Logs | 3 days | 7 days | 30 days |
| Performance Metrics | 30 days | 90 days | 1 year |

### Automated Cleanup

```yaml
# .github/workflows/cleanup.yml
name: Artifact Cleanup

on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - name: Delete old artifacts
        uses: c-hive/gha-remove-artifacts@v1
        with:
          age: '30 days'
          skip-recent: 5
```

---

## Best Practices Summary

| Practice | Benefit |
|----------|---------|
| Use structured logging | Easier parsing, filtering |
| Capture screenshots on failure only | Reduced storage, faster runs |
| Keep videos short retention | Storage cost management |
| Use JUnit XML format | Universal CI integration |
| Implement log rotation | Prevent disk space issues |
| Upload artifacts in parallel | Faster pipeline completion |
| Tag artifacts with run ID | Easy correlation |
| Clean up old artifacts | Cost and clutter management |

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Artifacts not uploading | Path mismatch | Verify paths exist before upload |
| Screenshots black | Headless rendering | Add `--disable-gpu` flag |
| Videos corrupted | Incomplete recording | Ensure proper test teardown |
| Reports empty | Test crashed early | Add try-finally for report generation |
| Storage quota exceeded | No cleanup | Implement retention policy |

---

*Guide from IDPF-Testing Framework*
