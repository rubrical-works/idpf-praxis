# Visual Testing Integration Guide
**Version:** v0.56.0

**Framework:** IDPF-QA-Automation

---

## Overview

Visual testing validates that your application's UI appears correctly to users. This guide covers integration patterns for Percy and Applitools, along with baseline management workflows.

---

## Visual Testing Concepts

| Term | Definition |
|------|------------|
| **Baseline** | Reference screenshot representing correct appearance |
| **Checkpoint** | Screenshot captured during test execution |
| **Visual Diff** | Comparison highlighting differences between baseline and checkpoint |
| **Threshold** | Acceptable difference percentage before flagging failure |
| **Viewport** | Browser window dimensions for screenshot |

---

## Percy Integration

### Setup

```bash
# Install Percy CLI
npm install -D @percy/cli

# Install framework integration
npm install -D @percy/playwright     # For Playwright
npm install -D @percy/cypress        # For Cypress
npm install -D @percy/webdriverio    # For WebDriverIO
```

### Environment Configuration

```bash
# Set Percy token (CI/CD secret)
export PERCY_TOKEN=your_token_here

# Optional: Parallel test token
export PERCY_PARALLEL_TOTAL=-1
```

### Playwright Integration

```typescript
// tests/visual.spec.ts
import { test } from '@playwright/test';
import percySnapshot from '@percy/playwright';

test.describe('Visual Tests', () => {
  test('homepage visual test', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Capture full page screenshot
    await percySnapshot(page, 'Homepage');
  });

  test('login page visual test', async ({ page }) => {
    await page.goto('/login');

    // Capture with options
    await percySnapshot(page, 'Login Page', {
      widths: [375, 768, 1280],  // Multiple viewports
      minHeight: 1024,
      percyCSS: `
        .timestamp { visibility: hidden; }
        .animated { animation: none !important; }
      `
    });
  });

  test('component visual test', async ({ page }) => {
    await page.goto('/components/button');

    // Capture specific element
    const button = page.locator('[data-testid="primary-button"]');
    await percySnapshot(page, 'Primary Button', {
      scope: '[data-testid="primary-button"]'
    });
  });
});
```

### Running Percy Tests

```bash
# Run with Percy
npx percy exec -- npx playwright test tests/visual/

# View results at: https://percy.io/your-org/your-project
```

### Percy Configuration

```yaml
# percy.yml
snapshot:
  widths:
    - 375    # Mobile
    - 768    # Tablet
    - 1280   # Desktop
  min-height: 1024
  percy-css: |
    .dynamic-content { visibility: hidden; }
    * { animation-duration: 0s !important; }

discovery:
  allowed-hostnames:
    - localhost
    - staging.example.com
  network-idle-timeout: 100

upload:
  files: '**/*.{png,jpg}'
```

### Percy CI/CD Integration

```yaml
# .github/workflows/visual-tests.yml
name: Visual Tests

on:
  pull_request:

jobs:
  visual:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run Percy tests
        run: npx percy exec -- npx playwright test tests/visual/
        env:
          PERCY_TOKEN: ${{ secrets.PERCY_TOKEN }}
```

---

## Applitools Integration

### Setup

```bash
# Install Applitools SDK
npm install -D @applitools/eyes-playwright    # Playwright
npm install -D @applitools/eyes-cypress       # Cypress
npm install -D @applitools/eyes-webdriverio   # WebDriverIO
```

### Playwright Integration

```typescript
// tests/applitools.spec.ts
import { test } from '@playwright/test';
import {
  BatchInfo,
  Configuration,
  Eyes,
  Target,
  ClassicRunner,
  VisualGridRunner
} from '@applitools/eyes-playwright';

let eyes: Eyes;
let runner: ClassicRunner;

test.beforeAll(async () => {
  // Use ClassicRunner for local execution
  runner = new ClassicRunner();

  // Or VisualGridRunner for cross-browser
  // runner = new VisualGridRunner({ testConcurrency: 5 });

  eyes = new Eyes(runner);

  const config = new Configuration();
  config.setApiKey(process.env.APPLITOOLS_API_KEY!);
  config.setBatch(new BatchInfo('My Test Suite'));
  config.setAppName('My Application');

  eyes.setConfiguration(config);
});

test.afterAll(async () => {
  const results = await runner.getAllTestResults();
  console.log('Test results:', results);
});

test.describe('Applitools Visual Tests', () => {
  test.afterEach(async () => {
    await eyes.close();
  });

  test('homepage check', async ({ page }) => {
    await eyes.open(page, 'My App', 'Homepage Test');

    await page.goto('/');

    // Full page check
    await eyes.check('Homepage', Target.window().fully());
  });

  test('login form check', async ({ page }) => {
    await eyes.open(page, 'My App', 'Login Page Test');

    await page.goto('/login');

    // Check specific region
    await eyes.check('Login Form', Target.region('#login-form'));

    // Check with layout match level
    await eyes.check('Header', Target.region('header').layout());
  });

  test('responsive check', async ({ page }) => {
    await eyes.open(page, 'My App', 'Responsive Test', {
      width: 1280,
      height: 800
    });

    await page.goto('/');

    await eyes.check('Desktop View', Target.window().fully());

    await page.setViewportSize({ width: 375, height: 812 });

    await eyes.check('Mobile View', Target.window().fully());
  });
});
```

### Match Levels

```typescript
import { Target, MatchLevel } from '@applitools/eyes-playwright';

// Strict - Pixel-perfect match
await eyes.check('Strict', Target.window().strict());

// Layout - Ignore text/color, check structure
await eyes.check('Layout', Target.window().layout());

// Content - Similar to Layout but stricter
await eyes.check('Content', Target.window().content());

// Exact - Exact pixel match (rarely used)
await eyes.check('Exact', Target.window().exact());

// Ignore regions
await eyes.check('With Ignored', Target.window()
  .ignoreRegions('#dynamic-content', '.timestamp')
  .layoutRegions('#sidebar')
);

// Floating regions (elements that may move)
await eyes.check('With Floating', Target.window()
  .floatingRegion('#popup', 10, 10, 10, 10)  // offset tolerance
);
```

### Ultrafast Grid (Cross-Browser)

```typescript
import {
  VisualGridRunner,
  BrowserType,
  DeviceName,
  ScreenOrientation
} from '@applitools/eyes-playwright';

const runner = new VisualGridRunner({ testConcurrency: 10 });
const eyes = new Eyes(runner);

const config = new Configuration();
config.setApiKey(process.env.APPLITOOLS_API_KEY!);

// Add browsers
config.addBrowser(1280, 800, BrowserType.CHROME);
config.addBrowser(1280, 800, BrowserType.FIREFOX);
config.addBrowser(1280, 800, BrowserType.SAFARI);
config.addBrowser(1280, 800, BrowserType.EDGE_CHROMIUM);

// Add mobile devices
config.addDeviceEmulation(DeviceName.iPhone_14, ScreenOrientation.PORTRAIT);
config.addDeviceEmulation(DeviceName.Pixel_7, ScreenOrientation.PORTRAIT);

eyes.setConfiguration(config);
```

### Applitools Configuration

```yaml
# applitools.config.js
module.exports = {
  apiKey: process.env.APPLITOOLS_API_KEY,
  appName: 'My Application',
  batchName: 'Visual Regression Suite',
  browser: [
    { width: 1280, height: 800, name: 'chrome' },
    { width: 1280, height: 800, name: 'firefox' },
    { deviceName: 'iPhone 14', screenOrientation: 'portrait' }
  ],
  matchLevel: 'Strict',
  waitBeforeScreenshot: 1000
};
```

---

## Baseline Management

### Initial Baseline Creation

1. **Run tests first time** - All screenshots become baselines
2. **Review in dashboard** - Verify baselines are correct
3. **Accept baselines** - Mark as approved reference

### Baseline Update Workflow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Run Tests     │────→│   View Diffs    │────→│ Accept/Reject   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │ Update Baseline │←────│  Intentional?   │
                        └─────────────────┘     └─────────────────┘
```

### Branch Strategy

```
main (baselines)
  │
  ├── feature/new-header
  │     └── New baselines for header changes
  │
  └── feature/bug-fix
        └── Should match main baselines
```

### Percy Branch Configuration

```yaml
# percy.yml
snapshot:
  widths: [1280]

# Auto-accept on feature branches
merge-strategy:
  default: auto-approved

# Require approval on main
branch-approvals:
  main: required
```

### Applitools Branch Strategy

```typescript
const config = new Configuration();
config.setBranchName(process.env.BRANCH_NAME || 'main');
config.setParentBranchName('main');

// Only save baselines if approved
config.setSaveNewTests(false);
config.setSaveDiffs(false);
```

---

## Handling Dynamic Content

### Hide Dynamic Elements

```typescript
// Percy
await percySnapshot(page, 'Page with hidden elements', {
  percyCSS: `
    .timestamp { visibility: hidden; }
    .user-avatar { visibility: hidden; }
    [data-testid="live-count"] { visibility: hidden; }
  `
});

// Applitools
await eyes.check('Page', Target.window()
  .ignoreRegions('.timestamp', '.user-avatar')
);
```

### Mock Dynamic Data

```typescript
// Mock API responses for consistent data
await page.route('**/api/stats', route => {
  route.fulfill({
    body: JSON.stringify({ views: 1000, likes: 500 }),
    headers: { 'Content-Type': 'application/json' }
  });
});

await page.goto('/dashboard');
await percySnapshot(page, 'Dashboard with mocked data');
```

### Freeze Animations

```typescript
// Inject CSS to freeze animations
await page.addStyleTag({
  content: `
    *, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
    }
  `
});

// Wait for animations to complete before screenshot
await page.waitForTimeout(500);
```

### Handle Carousels/Sliders

```typescript
// Stop carousel auto-rotation
await page.evaluate(() => {
  const carousel = document.querySelector('.carousel');
  if (carousel) {
    carousel.setAttribute('data-interval', '0');
    carousel.classList.add('paused');
  }
});

// Navigate to specific slide
await page.click('[data-slide-to="0"]');
await page.waitForTimeout(300);
```

---

## CI/CD Best Practices

### Parallel Execution

```yaml
# Percy parallel execution
jobs:
  visual:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - run: npx percy exec -- npx playwright test --shard=${{ matrix.shard }}/4
        env:
          PERCY_TOKEN: ${{ secrets.PERCY_TOKEN }}
          PERCY_PARALLEL_TOTAL: 4
          PERCY_PARALLEL_NONCE: ${{ github.run_id }}
```

### Pull Request Integration

```yaml
# Post Percy results to PR
- name: Percy Finalize
  if: always()
  run: npx percy build:finalize
  env:
    PERCY_TOKEN: ${{ secrets.PERCY_TOKEN }}

# Applitools GitHub integration (automatic)
```

### Threshold Configuration

```typescript
// Percy - pixel threshold
await percySnapshot(page, 'Page', {
  diffThreshold: 0.1  // 0.1% pixel difference allowed
});

// Applitools - match level handles this
await eyes.check('Page', Target.window().strict());  // Exact
await eyes.check('Page', Target.window().layout());  // Structure only
```

---

## Comparison: Percy vs Applitools

| Feature | Percy | Applitools |
|---------|-------|------------|
| **AI-Powered** | Basic | Advanced (Root Cause Analysis) |
| **Cross-Browser** | Via Playwright | Native Ultrafast Grid |
| **Pricing** | Per screenshot | Per checkpoint |
| **Setup Complexity** | Simple | Moderate |
| **Match Levels** | Pixel diff | Multiple (Strict, Layout, etc.) |
| **GitHub Integration** | Native | Native |
| **Self-Hosted** | No | Enterprise option |
| **Best For** | Simple visual tests | Complex UI, multiple browsers |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Flaky screenshots | Add wait for network idle, freeze animations |
| Different fonts | Use web fonts, ensure font loading complete |
| Scroll position issues | Scroll to top before capture |
| Modal/popup timing | Wait for animation, use fixed position |
| High false positive rate | Use layout matching, ignore dynamic regions |

---

*Guide from IDPF-QA-Automation Framework*
