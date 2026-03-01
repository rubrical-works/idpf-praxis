# Mobile Testing Guide (Appium)
**Version:** v0.55.0

**Framework:** IDPF-QA-Automation

---

## Overview

This guide covers mobile test automation using Appium for both iOS and Android platforms. Appium enables cross-platform testing with a single API, supporting native apps, hybrid apps, and mobile web applications.

---

## Appium Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Test Script                              │
│              (Playwright, WebDriverIO, etc.)                 │
└──────────────────────────┬──────────────────────────────────┘
                           │ WebDriver Protocol
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     Appium Server                            │
│                 (Node.js, localhost:4723)                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┴─────────────────┐
         │                                   │
         ▼                                   ▼
┌─────────────────────┐           ┌─────────────────────┐
│    iOS Driver       │           │   Android Driver    │
│   (XCUITest)        │           │   (UiAutomator2)    │
└─────────────────────┘           └─────────────────────┘
         │                                   │
         ▼                                   ▼
┌─────────────────────┐           ┌─────────────────────┐
│   iOS Simulator     │           │  Android Emulator   │
│   or Real Device    │           │  or Real Device     │
└─────────────────────┘           └─────────────────────┘
```

---

## Prerequisites

### System Requirements

| Platform | Requirements |
|----------|-------------|
| macOS | Xcode, Command Line Tools, iOS Simulator |
| Windows/Linux | Android Studio, Android SDK, Emulator |
| Both | Node.js 16+, Java JDK 11+ |

### Installation

```bash
# Install Appium
npm install -g appium

# Install iOS driver (macOS only)
appium driver install xcuitest

# Install Android driver
appium driver install uiautomator2

# Verify installation
appium --version
appium driver list --installed
```

### Android Environment Setup

```bash
# Set environment variables (.bashrc/.zshrc)
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/tools/bin

# Verify Android SDK
adb devices
emulator -list-avds
```

### iOS Environment Setup (macOS)

```bash
# Install Xcode from App Store, then:
xcode-select --install

# Accept Xcode license
sudo xcodebuild -license accept

# Install Carthage (dependency manager)
brew install carthage

# List available simulators
xcrun simctl list devices
```

---

## Desired Capabilities

Capabilities tell Appium how to connect to the device and application.

### iOS Capabilities

```typescript
// iOS Simulator
const iosCapabilities = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  'appium:deviceName': 'iPhone 15 Pro',
  'appium:platformVersion': '17.0',
  'appium:app': '/path/to/app.app',  // Simulator build
  'appium:noReset': false,
  'appium:fullReset': false,
  'appium:newCommandTimeout': 300,
  'appium:connectHardwareKeyboard': true
};

// Real iOS Device
const iosRealDeviceCapabilities = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  'appium:deviceName': 'iPhone',
  'appium:udid': 'device-udid-here',
  'appium:platformVersion': '17.0',
  'appium:app': '/path/to/app.ipa',
  'appium:xcodeOrgId': 'TEAM_ID',
  'appium:xcodeSigningId': 'iPhone Developer',
  'appium:updatedWDABundleId': 'com.yourcompany.WebDriverAgentRunner'
};
```

### Android Capabilities

```typescript
// Android Emulator
const androidCapabilities = {
  platformName: 'Android',
  'appium:automationName': 'UiAutomator2',
  'appium:deviceName': 'Pixel_7_API_34',
  'appium:platformVersion': '14.0',
  'appium:app': '/path/to/app.apk',
  'appium:appPackage': 'com.example.myapp',
  'appium:appActivity': 'com.example.myapp.MainActivity',
  'appium:noReset': false,
  'appium:fullReset': false,
  'appium:newCommandTimeout': 300,
  'appium:autoGrantPermissions': true
};

// Real Android Device
const androidRealDeviceCapabilities = {
  platformName: 'Android',
  'appium:automationName': 'UiAutomator2',
  'appium:deviceName': 'device',
  'appium:udid': 'device-serial-here',
  'appium:app': '/path/to/app.apk',
  'appium:noReset': false
};
```

### Capability Reference

| Capability | iOS | Android | Description |
|------------|-----|---------|-------------|
| `platformName` | `iOS` | `Android` | Target platform |
| `automationName` | `XCUITest` | `UiAutomator2` | Automation driver |
| `deviceName` | Simulator name | Emulator AVD | Device identifier |
| `platformVersion` | `17.0` | `14.0` | OS version |
| `app` | `.app` or `.ipa` | `.apk` | Application path |
| `noReset` | true/false | true/false | Skip app reset |
| `fullReset` | true/false | true/false | Uninstall app between runs |
| `newCommandTimeout` | seconds | seconds | Idle timeout |

---

## Screen Object Pattern (Mobile Page Objects)

### Base Screen

```typescript
// screens/BaseScreen.ts
import { remote, Browser } from 'webdriverio';

export abstract class BaseScreen {
  protected driver: Browser;

  constructor(driver: Browser) {
    this.driver = driver;
  }

  // Platform detection
  protected get isIOS(): boolean {
    return this.driver.capabilities.platformName === 'iOS';
  }

  protected get isAndroid(): boolean {
    return this.driver.capabilities.platformName === 'Android';
  }

  // Cross-platform selector
  protected selector(ios: string, android: string): string {
    return this.isIOS ? ios : android;
  }

  // Common waits
  async waitForElement(selector: string, timeout = 10000): Promise<void> {
    const element = await this.driver.$(selector);
    await element.waitForExist({ timeout });
  }

  async waitForDisplayed(selector: string, timeout = 10000): Promise<void> {
    const element = await this.driver.$(selector);
    await element.waitForDisplayed({ timeout });
  }

  // Scroll helpers
  async scrollDown(): Promise<void> {
    if (this.isIOS) {
      await this.driver.execute('mobile: scroll', { direction: 'down' });
    } else {
      await this.driver.execute('mobile: scrollGesture', {
        left: 100, top: 500, width: 200, height: 500,
        direction: 'down', percent: 0.75
      });
    }
  }

  async scrollToElement(selector: string): Promise<void> {
    const maxScrolls = 5;
    for (let i = 0; i < maxScrolls; i++) {
      const element = await this.driver.$(selector);
      if (await element.isDisplayed()) {
        return;
      }
      await this.scrollDown();
    }
    throw new Error(`Element not found after ${maxScrolls} scrolls: ${selector}`);
  }
}
```

### Platform-Specific Screens

```typescript
// screens/LoginScreen.ts
import { BaseScreen } from './BaseScreen';

export class LoginScreen extends BaseScreen {
  // Cross-platform selectors using accessibility IDs
  private get usernameInput() {
    return this.driver.$('~username-input');
  }

  private get passwordInput() {
    return this.driver.$('~password-input');
  }

  private get loginButton() {
    return this.driver.$('~login-button');
  }

  private get errorMessage() {
    return this.driver.$('~error-message');
  }

  // Platform-specific selectors when needed
  private get biometricButton() {
    const iosSelector = '-ios class chain:**/XCUIElementTypeButton[`name == "Face ID"`]';
    const androidSelector = '//android.widget.Button[@content-desc="Fingerprint"]';
    return this.driver.$(this.selector(iosSelector, androidSelector));
  }

  async enterUsername(username: string): Promise<void> {
    const input = await this.usernameInput;
    await input.setValue(username);
  }

  async enterPassword(password: string): Promise<void> {
    const input = await this.passwordInput;
    await input.setValue(password);
  }

  async tapLogin(): Promise<void> {
    const button = await this.loginButton;
    await button.click();
  }

  async login(username: string, password: string): Promise<void> {
    await this.enterUsername(username);
    await this.enterPassword(password);
    await this.tapLogin();
  }

  async getErrorText(): Promise<string> {
    const element = await this.errorMessage;
    return element.getText();
  }

  async isErrorDisplayed(): Promise<boolean> {
    const element = await this.errorMessage;
    return element.isDisplayed();
  }
}
```

---

## Selector Strategies

### Accessibility ID (Recommended)

Cross-platform selector using accessibility labels:

```typescript
// Use ~accessibilityId syntax
const element = await driver.$('~login-button');

// Set in app code:
// iOS: accessibilityIdentifier = "login-button"
// Android: contentDescription="login-button" or ViewCompat.setAccessibilityDelegate
```

### iOS-Specific Selectors

```typescript
// iOS Class Chain (preferred for iOS)
const button = await driver.$('-ios class chain:**/XCUIElementTypeButton[`name == "Login"`]');

// iOS Predicate String (complex queries)
const cell = await driver.$('-ios predicate string:type == "XCUIElementTypeCell" AND name CONTAINS "Order"');

// XPath (works but slower)
const element = await driver.$('//XCUIElementTypeButton[@name="Login"]');
```

### Android-Specific Selectors

```typescript
// UiAutomator Selector (preferred for Android)
const button = await driver.$('android=new UiSelector().text("Login")');
const scrollable = await driver.$('android=new UiScrollable(new UiSelector().scrollable(true))');

// Resource ID
const element = await driver.$('id:com.example.app:id/login_button');

// XPath
const element = await driver.$('//android.widget.Button[@text="Login"]');
```

### Selector Priority

| Priority | Strategy | Example | Reliability |
|----------|----------|---------|-------------|
| 1 | Accessibility ID | `~login-btn` | Highest |
| 2 | Resource ID (Android) | `id:com.app:id/btn` | High |
| 3 | iOS Class Chain | `-ios class chain:...` | High |
| 4 | UiAutomator (Android) | `android=new UiSelector()` | High |
| 5 | iOS Predicate | `-ios predicate string:` | Medium |
| 6 | XPath | `//Button[@text="X"]` | Low |

---

## Common Actions

### Touch Gestures

```typescript
// Tap at coordinates
await driver.touchAction([
  { action: 'tap', x: 200, y: 300 }
]);

// Long press
await driver.touchAction([
  { action: 'press', x: 200, y: 300 },
  { action: 'wait', ms: 2000 },
  { action: 'release' }
]);

// Swipe
await driver.touchAction([
  { action: 'press', x: 200, y: 600 },
  { action: 'wait', ms: 100 },
  { action: 'moveTo', x: 200, y: 200 },
  { action: 'release' }
]);

// Drag and drop
await driver.touchAction([
  { action: 'press', element: sourceElement },
  { action: 'wait', ms: 500 },
  { action: 'moveTo', element: targetElement },
  { action: 'release' }
]);
```

### Platform-Specific Actions

```typescript
// iOS-specific: Hide keyboard
await driver.execute('mobile: hideKeyboard');

// Android-specific: Press back button
await driver.back();

// Android-specific: Press home button
await driver.execute('mobile: pressKey', { keycode: 3 });

// Android-specific: Open notifications
await driver.openNotifications();

// iOS-specific: Shake device
await driver.execute('mobile: shake');
```

### Text Input

```typescript
// Set value (replaces text)
const input = await driver.$('~username');
await input.setValue('testuser');

// Add value (appends text)
await input.addValue('@example.com');

// Clear text
await input.clearValue();

// Hide keyboard after input
if (await driver.isKeyboardShown()) {
  if (driver.capabilities.platformName === 'iOS') {
    await driver.execute('mobile: hideKeyboard');
  } else {
    await driver.hideKeyboard();
  }
}
```

---

## Handling App States

### App Lifecycle

```typescript
// Launch app
await driver.launchApp();

// Close app (keep in background)
await driver.closeApp();

// Reset app (clear data)
await driver.resetApp();

// Terminate app
await driver.terminateApp('com.example.app');

// Activate app (bring to foreground)
await driver.activateApp('com.example.app');

// Check app state
const state = await driver.queryAppState('com.example.app');
// 0: Not installed
// 1: Not running
// 2: Running in background
// 3: Running in background (suspended)
// 4: Running in foreground
```

### Deep Links

```typescript
// Navigate via deep link
await driver.url('myapp://profile/settings');

// iOS: Open URL in Safari
await driver.execute('mobile: deepLink', {
  url: 'myapp://profile',
  bundleId: 'com.example.app'
});
```

### Permissions

```typescript
// Android: Grant permissions automatically (in capabilities)
'appium:autoGrantPermissions': true

// iOS: Handle permission dialogs
await driver.execute('mobile: alert', { action: 'accept' });

// Android: Grant specific permission
await driver.execute('mobile: changePermissions', {
  permissions: 'android.permission.CAMERA',
  appPackage: 'com.example.app',
  action: 'grant'
});
```

---

## Test Structure Example

### WebDriverIO + Mocha

```typescript
// tests/login.spec.ts
import { remote, Browser } from 'webdriverio';
import { LoginScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { getCapabilities } from '../config/capabilities';

describe('Login Flow', () => {
  let driver: Browser;
  let loginScreen: LoginScreen;
  let homeScreen: HomeScreen;

  before(async () => {
    driver = await remote({
      hostname: 'localhost',
      port: 4723,
      path: '/',
      capabilities: getCapabilities(process.env.PLATFORM || 'ios')
    });

    loginScreen = new LoginScreen(driver);
    homeScreen = new HomeScreen(driver);
  });

  afterEach(async () => {
    // Reset to initial state
    await driver.resetApp();
  });

  after(async () => {
    await driver.deleteSession();
  });

  it('should login with valid credentials', async () => {
    await loginScreen.login('validuser', 'validpass');

    expect(await homeScreen.isDisplayed()).toBe(true);
    expect(await homeScreen.getWelcomeText()).toContain('Welcome');
  });

  it('should show error for invalid credentials', async () => {
    await loginScreen.login('invaliduser', 'wrongpass');

    expect(await loginScreen.isErrorDisplayed()).toBe(true);
    expect(await loginScreen.getErrorText()).toContain('Invalid credentials');
  });

  it('should handle biometric login on supported devices', async function() {
    if (!await loginScreen.isBiometricAvailable()) {
      this.skip();
    }

    await loginScreen.tapBiometricLogin();
    await loginScreen.simulateBiometricSuccess();

    expect(await homeScreen.isDisplayed()).toBe(true);
  });
});
```

### Configuration Management

```typescript
// config/capabilities.ts
interface PlatformCapabilities {
  [key: string]: object;
}

export function getCapabilities(platform: string): object {
  const baseCapabilities = {
    'appium:newCommandTimeout': 300,
    'appium:noReset': false
  };

  const platformCapabilities: PlatformCapabilities = {
    ios: {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:deviceName': process.env.IOS_DEVICE || 'iPhone 15 Pro',
      'appium:platformVersion': process.env.IOS_VERSION || '17.0',
      'appium:app': process.env.IOS_APP_PATH
    },
    android: {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:deviceName': process.env.ANDROID_DEVICE || 'Pixel_7_API_34',
      'appium:platformVersion': process.env.ANDROID_VERSION || '14.0',
      'appium:app': process.env.ANDROID_APP_PATH
    }
  };

  return { ...baseCapabilities, ...platformCapabilities[platform] };
}
```

---

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/mobile-tests.yml
name: Mobile Tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  ios-tests:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Install Appium
        run: |
          npm install -g appium
          appium driver install xcuitest

      - name: Start iOS Simulator
        run: |
          xcrun simctl boot "iPhone 15 Pro"

      - name: Start Appium
        run: |
          appium &
          sleep 5

      - name: Run iOS tests
        run: npm run test:ios
        env:
          IOS_APP_PATH: ${{ github.workspace }}/app/build/MyApp.app

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: ios-test-results
          path: reports/

  android-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Install Appium
        run: |
          npm install -g appium
          appium driver install uiautomator2

      - name: Setup Android Emulator
        uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 34
          arch: x86_64
          profile: pixel_6
          script: |
            appium &
            sleep 5
            npm run test:android
        env:
          ANDROID_APP_PATH: ${{ github.workspace }}/app/build/app-debug.apk

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: android-test-results
          path: reports/
```

---

## Troubleshooting

### Common Issues

| Issue | Platform | Solution |
|-------|----------|----------|
| WebDriverAgent build fails | iOS | Reset derived data, check signing |
| App not installed | Both | Verify app path, check signing (iOS) |
| Element not found | Both | Check selectors, add waits |
| Session timeout | Both | Increase `newCommandTimeout` |
| Keyboard covers element | Both | Scroll or hide keyboard |
| Simulator won't boot | iOS | `xcrun simctl shutdown all` first |
| Emulator slow | Android | Use x86_64 image, enable HAXM/KVM |

### Debug Tools

```bash
# Appium Inspector (visual element inspector)
npm install -g appium-inspector

# View device logs
adb logcat                     # Android
xcrun simctl spawn booted log  # iOS

# Take screenshot
adb exec-out screencap -p > screenshot.png  # Android
xcrun simctl io booted screenshot screenshot.png  # iOS
```

---

*Guide from IDPF-QA-Automation Framework*
