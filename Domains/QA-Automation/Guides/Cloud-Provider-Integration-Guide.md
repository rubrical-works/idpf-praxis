# Cloud Provider Integration Guide
**Version:** v0.66.0

**Framework:** IDPF-QA-Automation

---

## Overview

Cloud testing providers enable running tests on real browsers and devices at scale. This guide covers integration with BrowserStack and Sauce Labs, including authentication, configuration, and parallel execution.

---

## Provider Comparison

| Feature | BrowserStack | Sauce Labs |
|---------|--------------|------------|
| **Real Devices** | Yes | Yes |
| **Browser Coverage** | 3000+ combinations | 800+ combinations |
| **Mobile Testing** | Appium support | Appium support |
| **Local Testing** | BrowserStack Local | Sauce Connect |
| **Parallel Tests** | Plan-dependent | Plan-dependent |
| **Video Recording** | Yes | Yes |
| **Screenshots** | Yes | Yes |
| **Best For** | Wide browser coverage | Enterprise, compliance |

---

## BrowserStack Integration

### Setup

```bash
# Install BrowserStack SDK (recommended approach)
npm install -D browserstack-node-sdk

# Or use direct WebDriver capabilities
```

### Authentication

```bash
# Environment variables
export BROWSERSTACK_USERNAME=your_username
export BROWSERSTACK_ACCESS_KEY=your_access_key
```

### Playwright Integration

```typescript
// browserstack.config.ts
import { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  use: {
    // Connect to BrowserStack
    connectOptions: {
      wsEndpoint: `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(JSON.stringify({
        'browser': 'chrome',
        'browser_version': 'latest',
        'os': 'Windows',
        'os_version': '11',
        'browserstack.username': process.env.BROWSERSTACK_USERNAME,
        'browserstack.accessKey': process.env.BROWSERSTACK_ACCESS_KEY,
        'project': 'My Project',
        'build': process.env.BUILD_NAME || `Build ${Date.now()}`,
        'name': 'Playwright Test'
      }))}`
    }
  },
  projects: [
    {
      name: 'chrome-windows',
      use: {
        connectOptions: {
          wsEndpoint: getBrowserStackEndpoint({
            browser: 'chrome',
            browser_version: 'latest',
            os: 'Windows',
            os_version: '11'
          })
        }
      }
    },
    {
      name: 'safari-mac',
      use: {
        connectOptions: {
          wsEndpoint: getBrowserStackEndpoint({
            browser: 'playwright-webkit',
            os: 'OS X',
            os_version: 'Ventura'
          })
        }
      }
    }
  ]
};

function getBrowserStackEndpoint(caps: object): string {
  const capabilities = {
    ...caps,
    'browserstack.username': process.env.BROWSERSTACK_USERNAME,
    'browserstack.accessKey': process.env.BROWSERSTACK_ACCESS_KEY,
    'project': 'My Project',
    'build': process.env.BUILD_NAME || `Build ${Date.now()}`
  };
  return `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(JSON.stringify(capabilities))}`;
}

export default config;
```

### WebDriverIO Integration

```javascript
// wdio.browserstack.conf.js
exports.config = {
  user: process.env.BROWSERSTACK_USERNAME,
  key: process.env.BROWSERSTACK_ACCESS_KEY,

  services: ['browserstack'],

  capabilities: [{
    browserName: 'Chrome',
    'bstack:options': {
      os: 'Windows',
      osVersion: '11',
      browserVersion: 'latest',
      projectName: 'My Project',
      buildName: process.env.BUILD_NAME || `Build ${Date.now()}`,
      sessionName: 'Chrome Windows Test',
      local: false,
      debug: true,
      consoleLogs: 'info',
      networkLogs: true
    }
  }],

  // Parallel execution
  maxInstances: 5,

  // BrowserStack specific
  browserstackLocal: false,  // Set true if testing localhost

  // Update test status
  afterTest: async function(test, context, { passed }) {
    await browser.executeScript(
      `browserstack_executor: {"action": "setSessionStatus", "arguments": {"status": "${passed ? 'passed' : 'failed'}"}}`
    );
  }
};
```

### Selenium (Java) Integration

```java
// BrowserStackConfig.java
import org.openqa.selenium.MutableCapabilities;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.remote.RemoteWebDriver;
import java.net.URL;

public class BrowserStackConfig {

    private static final String USERNAME = System.getenv("BROWSERSTACK_USERNAME");
    private static final String ACCESS_KEY = System.getenv("BROWSERSTACK_ACCESS_KEY");
    private static final String URL = "https://" + USERNAME + ":" + ACCESS_KEY +
        "@hub-cloud.browserstack.com/wd/hub";

    public static WebDriver createDriver(String browser, String osVersion) throws Exception {
        MutableCapabilities capabilities = new MutableCapabilities();

        // Browser capabilities
        capabilities.setCapability("browserName", browser);

        // BrowserStack options
        HashMap<String, Object> bstackOptions = new HashMap<>();
        bstackOptions.put("os", "Windows");
        bstackOptions.put("osVersion", osVersion);
        bstackOptions.put("browserVersion", "latest");
        bstackOptions.put("projectName", "My Project");
        bstackOptions.put("buildName", System.getenv("BUILD_NAME"));
        bstackOptions.put("sessionName", "Test Session");
        bstackOptions.put("debug", true);
        bstackOptions.put("consoleLogs", "info");
        bstackOptions.put("networkLogs", true);

        capabilities.setCapability("bstack:options", bstackOptions);

        return new RemoteWebDriver(new URL(URL), capabilities);
    }

    public static void setTestStatus(WebDriver driver, boolean passed, String reason) {
        JavascriptExecutor js = (JavascriptExecutor) driver;
        String status = passed ? "passed" : "failed";
        js.executeScript(String.format(
            "browserstack_executor: {\"action\": \"setSessionStatus\", \"arguments\": {\"status\":\"%s\", \"reason\": \"%s\"}}",
            status, reason
        ));
    }
}
```

### Local Testing

```bash
# Download and run BrowserStack Local
./BrowserStackLocal --key $BROWSERSTACK_ACCESS_KEY

# Or use npm package
npm install -g browserstack-local
browserstack-local --key $BROWSERSTACK_ACCESS_KEY
```

```typescript
// With browserstack.local capability
const capabilities = {
  'browserstack.local': true,
  'browserstack.localIdentifier': process.env.BROWSERSTACK_LOCAL_IDENTIFIER
};
```

---

## Sauce Labs Integration

### Setup

```bash
# Environment variables
export SAUCE_USERNAME=your_username
export SAUCE_ACCESS_KEY=your_access_key
```

### Playwright Integration

```typescript
// sauce.config.ts
import { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  use: {
    baseURL: process.env.BASE_URL
  },
  projects: [
    {
      name: 'sauce-chrome',
      use: {
        connectOptions: {
          wsEndpoint: getSauceEndpoint({
            browserName: 'chrome',
            browserVersion: 'latest',
            platformName: 'Windows 11'
          })
        }
      }
    },
    {
      name: 'sauce-firefox',
      use: {
        connectOptions: {
          wsEndpoint: getSauceEndpoint({
            browserName: 'firefox',
            browserVersion: 'latest',
            platformName: 'Windows 11'
          })
        }
      }
    }
  ]
};

function getSauceEndpoint(caps: object): string {
  const username = process.env.SAUCE_USERNAME;
  const accessKey = process.env.SAUCE_ACCESS_KEY;
  const region = process.env.SAUCE_REGION || 'us-west-1';

  const capabilities = {
    ...caps,
    'sauce:options': {
      username,
      accessKey,
      name: 'Playwright Test',
      build: process.env.BUILD_NAME || `Build ${Date.now()}`
    }
  };

  return `wss://cdp.${region}.saucelabs.com/playwright?capabilities=${encodeURIComponent(JSON.stringify(capabilities))}`;
}

export default config;
```

### WebDriverIO Integration

```javascript
// wdio.sauce.conf.js
exports.config = {
  user: process.env.SAUCE_USERNAME,
  key: process.env.SAUCE_ACCESS_KEY,
  region: 'us',  // or 'eu'

  services: ['sauce'],

  capabilities: [{
    browserName: 'chrome',
    browserVersion: 'latest',
    platformName: 'Windows 11',
    'sauce:options': {
      name: 'My Test',
      build: process.env.BUILD_NAME,
      screenResolution: '1920x1080',
      extendedDebugging: true,
      capturePerformance: true
    }
  }],

  // Parallel execution
  maxInstances: 10,

  // Sauce Connect (for local testing)
  sauceConnect: false,  // Set true for localhost testing
  sauceConnectOpts: {
    // Sauce Connect options
  },

  // Report test status
  afterTest: async function(test, context, { passed }) {
    await browser.execute(`sauce:job-result=${passed}`);
  }
};
```

### Selenium (Java) Integration

```java
// SauceLabsConfig.java
import org.openqa.selenium.MutableCapabilities;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.remote.RemoteWebDriver;
import java.net.URL;

public class SauceLabsConfig {

    private static final String USERNAME = System.getenv("SAUCE_USERNAME");
    private static final String ACCESS_KEY = System.getenv("SAUCE_ACCESS_KEY");
    private static final String REGION = System.getenv("SAUCE_REGION"); // us-west-1 or eu-central-1
    private static final String URL = String.format(
        "https://%s:%s@ondemand.%s.saucelabs.com:443/wd/hub",
        USERNAME, ACCESS_KEY, REGION != null ? REGION : "us-west-1"
    );

    public static WebDriver createDriver(String browser, String platform) throws Exception {
        MutableCapabilities capabilities = new MutableCapabilities();
        capabilities.setCapability("browserName", browser);
        capabilities.setCapability("browserVersion", "latest");
        capabilities.setCapability("platformName", platform);

        MutableCapabilities sauceOptions = new MutableCapabilities();
        sauceOptions.setCapability("name", "Test Session");
        sauceOptions.setCapability("build", System.getenv("BUILD_NAME"));
        sauceOptions.setCapability("extendedDebugging", true);
        sauceOptions.setCapability("capturePerformance", true);

        capabilities.setCapability("sauce:options", sauceOptions);

        return new RemoteWebDriver(new URL(URL), capabilities);
    }

    public static void setTestStatus(WebDriver driver, boolean passed) {
        JavascriptExecutor js = (JavascriptExecutor) driver;
        js.executeScript("sauce:job-result=" + (passed ? "passed" : "failed"));
    }
}
```

### Sauce Connect (Local Testing)

```bash
# Download Sauce Connect
# https://docs.saucelabs.com/secure-connections/sauce-connect/installation/

# Start Sauce Connect
./sc -u $SAUCE_USERNAME -k $SAUCE_ACCESS_KEY --tunnel-name my-tunnel

# In capabilities
'sauce:options': {
  tunnelName: 'my-tunnel'
}
```

---

## Parallel Execution Configuration

### BrowserStack Parallel

```javascript
// browserstack.conf.js
exports.config = {
  // Maximum parallel sessions (check your plan limit)
  maxInstances: 5,

  // Multiple browser configurations
  capabilities: [
    {
      browserName: 'Chrome',
      'bstack:options': { os: 'Windows', osVersion: '11' }
    },
    {
      browserName: 'Firefox',
      'bstack:options': { os: 'Windows', osVersion: '11' }
    },
    {
      browserName: 'Safari',
      'bstack:options': { os: 'OS X', osVersion: 'Ventura' }
    },
    {
      browserName: 'Edge',
      'bstack:options': { os: 'Windows', osVersion: '11' }
    }
  ]
};
```

### Sauce Labs Parallel

```javascript
// sauce.conf.js
exports.config = {
  maxInstances: 10,  // Plan-dependent

  capabilities: [
    { browserName: 'chrome', platformName: 'Windows 11' },
    { browserName: 'firefox', platformName: 'Windows 11' },
    { browserName: 'safari', platformName: 'macOS 13' },
    { browserName: 'MicrosoftEdge', platformName: 'Windows 11' }
  ]
};
```

### GitHub Actions Parallel

```yaml
# .github/workflows/cross-browser.yml
name: Cross-Browser Tests

on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        browser: [chrome, firefox, safari, edge]
      fail-fast: false
      max-parallel: 4

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci

      - name: Run tests on ${{ matrix.browser }}
        run: npm run test:cloud -- --browser=${{ matrix.browser }}
        env:
          BROWSERSTACK_USERNAME: ${{ secrets.BROWSERSTACK_USERNAME }}
          BROWSERSTACK_ACCESS_KEY: ${{ secrets.BROWSERSTACK_ACCESS_KEY }}
          BUILD_NAME: ${{ github.run_id }}-${{ github.run_number }}
```

---

## Mobile Device Testing

### BrowserStack Mobile

```javascript
// BrowserStack App Automate
const capabilities = {
  'bstack:options': {
    deviceName: 'iPhone 15 Pro',
    osVersion: '17',
    projectName: 'Mobile App Tests',
    buildName: process.env.BUILD_NAME,
    sessionName: 'iOS Test',
    app: 'bs://app-hash-here',  // Uploaded app
    // Or use app URL
    appUrl: 'https://example.com/app.ipa'
  }
};

// Android
const androidCapabilities = {
  'bstack:options': {
    deviceName: 'Google Pixel 8',
    osVersion: '14.0',
    app: 'bs://android-app-hash'
  }
};
```

### Sauce Labs Mobile

```javascript
const capabilities = {
  platformName: 'iOS',
  'appium:deviceName': 'iPhone 14 Pro Simulator',
  'appium:platformVersion': '16.0',
  'appium:app': 'storage:filename=myapp.ipa',
  'sauce:options': {
    name: 'iOS App Test',
    build: process.env.BUILD_NAME
  }
};
```

---

## Best Practices

### Session Management

```typescript
// Reuse sessions wisely
const SESSION_LIMIT = 5;  // Based on plan

async function runTestsInBatches(tests: Test[], batchSize = SESSION_LIMIT) {
  const batches = chunk(tests, batchSize);

  for (const batch of batches) {
    await Promise.all(batch.map(test => runTest(test)));
  }
}
```

### Error Handling

```typescript
// Retry on cloud infrastructure issues
const config = {
  retries: process.env.CI ? 2 : 0,

  expect: {
    timeout: 10000  // Cloud tests may be slower
  },

  use: {
    actionTimeout: 15000,
    navigationTimeout: 30000
  }
};
```

### Build Organization

```bash
# Use consistent build naming
export BUILD_NAME="${GITHUB_REPOSITORY}-${GITHUB_RUN_NUMBER}-${GITHUB_SHA:0:7}"

# Tag tests for filtering in dashboard
'sauce:options': {
  tags: ['smoke', 'login', 'pr-123']
}
```

### Artifact Collection

```typescript
// Download videos and logs after tests
async function downloadArtifacts(sessionId: string) {
  // BrowserStack
  const videoUrl = `https://api.browserstack.com/app-automate/sessions/${sessionId}/video`;

  // Sauce Labs
  const assetsUrl = `https://api.${SAUCE_REGION}.saucelabs.com/rest/v1/${SAUCE_USERNAME}/jobs/${sessionId}/assets`;
}
```

---

## CI/CD Integration

### GitHub Actions (BrowserStack)

```yaml
name: BrowserStack Tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci

      - name: Run BrowserStack tests
        run: npm run test:browserstack
        env:
          BROWSERSTACK_USERNAME: ${{ secrets.BROWSERSTACK_USERNAME }}
          BROWSERSTACK_ACCESS_KEY: ${{ secrets.BROWSERSTACK_ACCESS_KEY }}
          BUILD_NAME: "GitHub-${{ github.run_id }}"

      - name: Upload BrowserStack results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: browserstack-results
          path: reports/
```

### GitHub Actions (Sauce Labs)

```yaml
name: Sauce Labs Tests

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci

      - name: Start Sauce Connect
        uses: saucelabs/sauce-connect-action@v2
        with:
          username: ${{ secrets.SAUCE_USERNAME }}
          accessKey: ${{ secrets.SAUCE_ACCESS_KEY }}
          tunnelName: github-${{ github.run_id }}

      - name: Run Sauce Labs tests
        run: npm run test:sauce
        env:
          SAUCE_USERNAME: ${{ secrets.SAUCE_USERNAME }}
          SAUCE_ACCESS_KEY: ${{ secrets.SAUCE_ACCESS_KEY }}
          SAUCE_TUNNEL_NAME: github-${{ github.run_id }}
          BUILD_NAME: "GitHub-${{ github.run_id }}"
```

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Session timeout | Test too slow | Increase `idleTimeout` capability |
| Authentication failed | Invalid credentials | Verify env vars are set correctly |
| Tunnel not found | Sauce Connect not running | Start Sauce Connect before tests |
| Test marked failed | Missing status update | Call setTestStatus in afterTest |
| Parallel limit exceeded | Too many concurrent tests | Reduce `maxInstances` |
| Local site not accessible | Tunnel not configured | Enable `local: true` capability |

---

*Guide from IDPF-QA-Automation Framework*
