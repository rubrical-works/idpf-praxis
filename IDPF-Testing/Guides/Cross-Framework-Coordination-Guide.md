# Cross-Framework Coordination Guide
**Version:** v0.53.0

**Framework:** IDPF-Testing

---

## Overview

Projects often require multiple testing types: functional UI tests, performance tests, security scans, and accessibility audits. This guide covers how to coordinate multiple IDPF testing frameworks within a single project, including shared configuration, CI/CD orchestration, and unified reporting.

---

## When to Use Multiple Frameworks

| Scenario | Recommended Frameworks |
|----------|------------------------|
| Web application with APIs | QA-Automation + Contract-Testing |
| High-traffic e-commerce | QA-Automation + Performance |
| Healthcare/Finance application | QA-Automation + Security + Accessibility |
| Microservices architecture | Contract-Testing + Performance + Chaos |
| Public-facing web app | QA-Automation + Accessibility |
| Critical infrastructure | QA-Automation + Chaos + Security |

---

## Framework Selection Matrix

### Decision Tree

```
┌─────────────────────────────────────────────────────────────┐
│                    Testing Requirements                      │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
   ┌─────────┐          ┌─────────┐          ┌─────────┐
   │   UI    │          │   API   │          │  Non-   │
   │ Testing │          │ Testing │          │Functional│
   └─────────┘          └─────────┘          └─────────┘
        │                     │                     │
        ▼                     ▼                     │
┌──────────────┐     ┌──────────────┐              │
│QA-Automation │     │Contract-Test │              │
└──────────────┘     └──────────────┘              │
                                                   │
            ┌──────────────────────────────────────┤
            │              │              │        │
            ▼              ▼              ▼        ▼
     ┌──────────┐   ┌──────────┐   ┌──────────┐ ┌─────┐
     │Performance│   │ Security │   │Accessib. │ │Chaos│
     └──────────┘   └──────────┘   └──────────┘ └─────┘
```

### Framework Compatibility

| Framework | Can Combine With | Shared Concerns |
|-----------|------------------|-----------------|
| QA-Automation | All | Base URLs, auth, test data |
| Performance | QA-Automation, Chaos | Environments, monitoring |
| Security | QA-Automation | Auth flows, endpoints |
| Accessibility | QA-Automation | Page objects, navigation |
| Chaos | Performance | Infrastructure, monitoring |
| Contract-Testing | QA-Automation | API endpoints, auth |

---

## Shared Configuration Patterns

### Environment Configuration

Create a shared configuration that all frameworks reference:

```
config/
├── shared/
│   ├── environments.json         # All environment URLs
│   ├── credentials.json          # Test credentials (encrypted)
│   └── feature-flags.json        # Feature toggles
├── qa-automation/
│   └── playwright.config.ts
├── performance/
│   └── k6.config.js
├── security/
│   └── zap.config.yaml
└── accessibility/
    └── axe.config.js
```

**config/shared/environments.json:**
```json
{
  "dev": {
    "baseUrl": "http://localhost:3000",
    "apiUrl": "http://localhost:8080/api",
    "dbHost": "localhost"
  },
  "staging": {
    "baseUrl": "https://staging.example.com",
    "apiUrl": "https://staging-api.example.com/api",
    "dbHost": "staging-db.example.com"
  },
  "production": {
    "baseUrl": "https://www.example.com",
    "apiUrl": "https://api.example.com/api",
    "dbHost": "prod-db.example.com"
  }
}
```

### Configuration Loader

```typescript
// config/shared/loader.ts
import environments from './environments.json';

export type Environment = 'dev' | 'staging' | 'production';

export function getConfig(env: Environment = 'dev') {
  const envConfig = environments[env];
  if (!envConfig) {
    throw new Error(`Unknown environment: ${env}`);
  }
  return envConfig;
}

export function getBaseUrl(env?: Environment): string {
  return getConfig(env || (process.env.TEST_ENV as Environment) || 'dev').baseUrl;
}

export function getApiUrl(env?: Environment): string {
  return getConfig(env || (process.env.TEST_ENV as Environment) || 'dev').apiUrl;
}
```

### Framework-Specific Usage

**QA-Automation (Playwright):**
```typescript
// config/qa-automation/playwright.config.ts
import { getBaseUrl } from '../shared/loader';

export default {
  use: {
    baseURL: getBaseUrl()
  }
};
```

**Performance (k6):**
```javascript
// config/performance/k6.config.js
import { getConfig } from '../shared/loader.js';

export const options = {
  baseURL: getConfig(process.env.TEST_ENV).apiUrl
};
```

---

## Test Data Management

### Shared Test Data Strategy

```
test-data/
├── shared/
│   ├── users.json                # User accounts for all tests
│   ├── products.json             # Product catalog data
│   └── generators/               # Data generation utilities
│       ├── user-factory.ts
│       └── order-factory.ts
├── qa-automation/
│   └── scenarios/                # UI-specific test scenarios
├── performance/
│   ├── load-profiles/            # Virtual user distributions
│   └── payloads/                 # Request payloads
└── security/
    └── attack-vectors/           # Security test inputs
```

### Shared User Factory

```typescript
// test-data/shared/generators/user-factory.ts
import { faker } from '@faker-js/faker';

export interface TestUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'user' | 'guest';
}

export function createTestUser(overrides?: Partial<TestUser>): TestUser {
  return {
    email: faker.internet.email(),
    password: faker.internet.password({ length: 12 }),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    role: 'user',
    ...overrides
  };
}

export const standardUsers = {
  admin: {
    email: 'admin@test.example.com',
    password: process.env.ADMIN_PASSWORD || 'AdminPass123!',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin' as const
  },
  regularUser: {
    email: 'user@test.example.com',
    password: process.env.USER_PASSWORD || 'UserPass123!',
    firstName: 'Test',
    lastName: 'User',
    role: 'user' as const
  }
};
```

---

## CI/CD Orchestration

### Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CI/CD Pipeline                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Stage 1: Build & Unit                     │
│                    (Application repo)                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Stage 2: Deploy to Test                     │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  QA-Automation│    │   Security    │    │ Accessibility │
│  (Parallel)   │    │  (Parallel)   │    │  (Parallel)   │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Stage 3: Performance Tests                   │
│           (Sequential - needs stable environment)            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                Stage 4: Aggregate Reports                    │
└─────────────────────────────────────────────────────────────┘
```

### GitHub Actions Workflow

```yaml
# .github/workflows/comprehensive-testing.yml
name: Comprehensive Test Suite

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 2 * * *'  # Nightly at 2 AM

env:
  TEST_ENV: staging

jobs:
  # Stage 1: Parallel functional tests
  qa-automation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:qa
        env:
          TEST_ENV: ${{ env.TEST_ENV }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: qa-results
          path: reports/qa-automation/

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run OWASP ZAP Scan
        uses: zaproxy/action-full-scan@v0.9.0
        with:
          target: 'https://staging.example.com'
          rules_file_name: 'config/security/zap-rules.tsv'
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: security-results
          path: reports/security/

  accessibility:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:accessibility
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: accessibility-results
          path: reports/accessibility/

  # Stage 2: Sequential performance tests (after functional pass)
  performance:
    needs: [qa-automation]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run k6 tests
        uses: grafana/k6-action@v0.3.1
        with:
          filename: performance/scenarios/load-test.js
          flags: --out json=reports/performance/results.json
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: performance-results
          path: reports/performance/

  # Stage 3: Aggregate and report
  aggregate-results:
    needs: [qa-automation, security, accessibility, performance]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: all-results/

      - name: Generate combined report
        run: |
          npm ci
          npm run report:aggregate

      - name: Upload combined report
        uses: actions/upload-artifact@v4
        with:
          name: combined-test-report
          path: reports/combined/

      - name: Post summary to PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const summary = fs.readFileSync('reports/combined/summary.md', 'utf8');
            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: summary
            });
```

### Test Execution Order

| Priority | Framework | Rationale |
|----------|-----------|-----------|
| 1 (Parallel) | QA-Automation (Smoke) | Gate for further testing |
| 1 (Parallel) | Security (SAST) | Early vulnerability detection |
| 1 (Parallel) | Accessibility | Quick automated scans |
| 2 (After Smoke) | QA-Automation (Full) | Comprehensive functional |
| 3 (After QA) | Performance | Needs stable environment |
| 4 (Manual/Scheduled) | Chaos | Controlled experiments |
| 4 (Scheduled) | Security (DAST) | Full penetration scans |

---

## Unified Reporting

### Report Aggregation Script

```typescript
// scripts/aggregate-reports.ts
import fs from 'fs';
import path from 'path';

interface FrameworkResult {
  framework: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  reportUrl: string;
}

interface AggregatedReport {
  timestamp: string;
  environment: string;
  overallStatus: 'pass' | 'fail';
  frameworks: FrameworkResult[];
  summary: {
    totalPassed: number;
    totalFailed: number;
    totalSkipped: number;
    totalDuration: number;
  };
}

function aggregateReports(): AggregatedReport {
  const frameworks: FrameworkResult[] = [];

  // Parse QA-Automation results
  const qaResults = JSON.parse(
    fs.readFileSync('all-results/qa-results/results.json', 'utf8')
  );
  frameworks.push({
    framework: 'QA-Automation',
    passed: qaResults.stats.expected,
    failed: qaResults.stats.unexpected,
    skipped: qaResults.stats.skipped,
    duration: qaResults.stats.duration,
    reportUrl: 'qa-results/index.html'
  });

  // Parse Security results
  const securityResults = JSON.parse(
    fs.readFileSync('all-results/security-results/report.json', 'utf8')
  );
  frameworks.push({
    framework: 'Security',
    passed: securityResults.site[0].alerts.filter(a => a.riskcode === '0').length,
    failed: securityResults.site[0].alerts.filter(a => a.riskcode > '1').length,
    skipped: 0,
    duration: 0,
    reportUrl: 'security-results/report.html'
  });

  // Calculate summary
  const summary = frameworks.reduce(
    (acc, f) => ({
      totalPassed: acc.totalPassed + f.passed,
      totalFailed: acc.totalFailed + f.failed,
      totalSkipped: acc.totalSkipped + f.skipped,
      totalDuration: acc.totalDuration + f.duration
    }),
    { totalPassed: 0, totalFailed: 0, totalSkipped: 0, totalDuration: 0 }
  );

  return {
    timestamp: new Date().toISOString(),
    environment: process.env.TEST_ENV || 'unknown',
    overallStatus: summary.totalFailed === 0 ? 'pass' : 'fail',
    frameworks,
    summary
  };
}

// Generate markdown summary
function generateMarkdownSummary(report: AggregatedReport): string {
  const statusEmoji = report.overallStatus === 'pass' ? '✅' : '❌';

  let md = `# Test Results Summary ${statusEmoji}\n\n`;
  md += `**Environment:** ${report.environment}\n`;
  md += `**Timestamp:** ${report.timestamp}\n\n`;

  md += `## Overall Results\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Total Passed | ${report.summary.totalPassed} |\n`;
  md += `| Total Failed | ${report.summary.totalFailed} |\n`;
  md += `| Total Skipped | ${report.summary.totalSkipped} |\n\n`;

  md += `## Framework Results\n\n`;
  md += `| Framework | Passed | Failed | Skipped | Report |\n`;
  md += `|-----------|--------|--------|---------|--------|\n`;

  for (const f of report.frameworks) {
    const status = f.failed === 0 ? '✅' : '❌';
    md += `| ${f.framework} ${status} | ${f.passed} | ${f.failed} | ${f.skipped} | [View](${f.reportUrl}) |\n`;
  }

  return md;
}

// Main execution
const report = aggregateReports();
const markdown = generateMarkdownSummary(report);

fs.mkdirSync('reports/combined', { recursive: true });
fs.writeFileSync('reports/combined/report.json', JSON.stringify(report, null, 2));
fs.writeFileSync('reports/combined/summary.md', markdown);
```

### Combined Dashboard View

```html
<!-- reports/combined/index.html -->
<!DOCTYPE html>
<html>
<head>
  <title>Combined Test Report</title>
  <style>
    .framework-card { border: 1px solid #ddd; padding: 16px; margin: 8px; }
    .pass { border-left: 4px solid #4caf50; }
    .fail { border-left: 4px solid #f44336; }
  </style>
</head>
<body>
  <h1>Combined Test Report</h1>
  <div id="frameworks"></div>

  <script>
    fetch('report.json')
      .then(r => r.json())
      .then(data => {
        const container = document.getElementById('frameworks');
        data.frameworks.forEach(f => {
          const card = document.createElement('div');
          card.className = `framework-card ${f.failed === 0 ? 'pass' : 'fail'}`;
          card.innerHTML = `
            <h3>${f.framework}</h3>
            <p>Passed: ${f.passed} | Failed: ${f.failed} | Skipped: ${f.skipped}</p>
            <a href="${f.reportUrl}">View Details</a>
          `;
          container.appendChild(card);
        });
      });
  </script>
</body>
</html>
```

---

## Shared Utilities

### Authentication Helper

Used across QA-Automation, Performance, and Security tests:

```typescript
// src/shared/auth.ts
export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export async function authenticate(
  email: string,
  password: string,
  apiUrl: string
): Promise<AuthToken> {
  const response = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    throw new Error(`Authentication failed: ${response.status}`);
  }

  return response.json();
}

export function getAuthHeader(token: AuthToken): Record<string, string> {
  return { Authorization: `Bearer ${token.accessToken}` };
}
```

### API Client Wrapper

```typescript
// src/shared/api-client.ts
import { AuthToken, getAuthHeader } from './auth';

export class ApiClient {
  constructor(
    private baseUrl: string,
    private token?: AuthToken
  ) {}

  async get<T>(path: string): Promise<T> {
    return this.request('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request('POST', path, body);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.token ? getAuthHeader(this.token) : {})
    };

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    return response.json();
  }
}
```

---

## Best Practices

| Practice | Benefit |
|----------|---------|
| Centralize environment config | Single source of truth |
| Share test data factories | Consistent data across frameworks |
| Run quick tests first | Fast feedback, fail early |
| Aggregate reports | Unified view for stakeholders |
| Use common auth utilities | Reduce duplication |
| Tag tests by type | Selective execution |
| Isolate test environments | Prevent interference |

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Tests interfere with each other | Shared state | Use test isolation, reset between runs |
| Performance tests show inconsistent results | Parallel functional tests | Run performance after functional completion |
| Security scan times out | Application under load | Schedule security scans during low traffic |
| Reports overwrite each other | Same output path | Use timestamped or framework-specific directories |

---

*Guide from IDPF-Testing Framework*
