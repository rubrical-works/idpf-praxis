# Test Environment Setup Guide
**Version:** v0.66.2

**Source:** Domains

---

## Overview

This guide covers test environment setup for the three most common platforms: Node.js, Python, and Java. Each section provides step-by-step instructions for initializing a test repository with proper tooling and configuration.

---

## Node.js Test Environment

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm or yarn package manager
- Git

### Project Initialization

```bash
# Create test repository
mkdir my-app-tests && cd my-app-tests
git init

# Initialize Node.js project
npm init -y

# Create directory structure
mkdir -p src/{tests,pages,utils,config}
mkdir -p reports
mkdir -p .github/workflows
```

### Testing Framework Options

| Framework | Best For | Install Command |
|-----------|----------|-----------------|
| Jest | Unit, integration | `npm install -D jest` |
| Playwright | E2E, browser automation | `npm install -D @playwright/test` |
| Cypress | E2E, component testing | `npm install -D cypress` |
| Vitest | Unit, fast execution | `npm install -D vitest` |

### Recommended Setup: Playwright

```bash
# Install Playwright with browsers
npm install -D @playwright/test
npx playwright install

# Install additional dependencies
npm install -D typescript @types/node
npm install -D dotenv                    # Environment variables
npm install -D allure-playwright         # Reporting
```

### Configuration Files

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

**playwright.config.ts:**
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'reports/html' }],
    ['junit', { outputFile: 'reports/junit.xml' }]
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } }
  ]
});
```

**package.json scripts:**
```json
{
  "scripts": {
    "test": "playwright test",
    "test:headed": "playwright test --headed",
    "test:ui": "playwright test --ui",
    "test:debug": "playwright test --debug",
    "report": "playwright show-report reports/html"
  }
}
```

### Environment Variables

**.env.example:**
```bash
BASE_URL=http://localhost:3000
TEST_USER=testuser@example.com
TEST_PASSWORD=testpassword
CI=false
```

**.gitignore additions:**
```
node_modules/
reports/
test-results/
playwright-report/
.env
```

---

## Python Test Environment

### Prerequisites

- Python 3.9+
- pip package manager
- Git
- Virtual environment tool (venv, poetry, or pipenv)

### Project Initialization

```bash
# Create test repository
mkdir my-app-tests && cd my-app-tests
git init

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Create directory structure
mkdir -p src/{tests,pages,utils,config}
mkdir -p reports
mkdir -p .github/workflows
```

### Testing Framework Options

| Framework | Best For | Install Command |
|-----------|----------|-----------------|
| pytest | Unit, integration, all-purpose | `pip install pytest` |
| pytest-playwright | E2E, browser automation | `pip install pytest-playwright` |
| Robot Framework | Keyword-driven, acceptance | `pip install robotframework` |
| behave | BDD, Gherkin syntax | `pip install behave` |

### Recommended Setup: pytest + Playwright

```bash
# Install core testing dependencies
pip install pytest pytest-html pytest-xdist
pip install pytest-playwright
playwright install

# Install additional dependencies
pip install python-dotenv              # Environment variables
pip install allure-pytest              # Reporting
pip install requests                   # API testing
pip install faker                      # Test data generation

# Freeze dependencies
pip freeze > requirements.txt
```

### Configuration Files

**pytest.ini:**
```ini
[pytest]
testpaths = src/tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts =
    --html=reports/report.html
    --self-contained-html
    -v
    --tb=short
markers =
    smoke: Quick smoke tests
    regression: Full regression suite
    slow: Tests that take longer to run
```

**conftest.py (src/tests/conftest.py):**
```python
import pytest
from playwright.sync_api import Page, Browser
import os
from dotenv import load_dotenv

load_dotenv()

@pytest.fixture(scope="session")
def base_url():
    return os.getenv("BASE_URL", "http://localhost:3000")

@pytest.fixture(scope="function")
def authenticated_page(page: Page, base_url: str):
    """Fixture that provides a logged-in page."""
    page.goto(f"{base_url}/login")
    page.fill("[data-testid=email]", os.getenv("TEST_USER"))
    page.fill("[data-testid=password]", os.getenv("TEST_PASSWORD"))
    page.click("[data-testid=login-button]")
    page.wait_for_url(f"{base_url}/dashboard")
    yield page
```

**pyproject.toml (alternative to pytest.ini):**
```toml
[tool.pytest.ini_options]
testpaths = ["src/tests"]
python_files = ["test_*.py"]
addopts = "-v --tb=short"

[tool.coverage.run]
source = ["src"]
omit = ["*/tests/*"]
```

### Environment Variables

**.env.example:**
```bash
BASE_URL=http://localhost:3000
TEST_USER=testuser@example.com
TEST_PASSWORD=testpassword
HEADLESS=true
```

**.gitignore additions:**
```
venv/
__pycache__/
*.pyc
.pytest_cache/
reports/
.env
*.egg-info/
```

---

## Java Test Environment

### Prerequisites

- Java 17+ (LTS recommended)
- Maven or Gradle build tool
- Git
- IDE (IntelliJ IDEA or Eclipse recommended)

### Project Initialization with Maven

```bash
# Create test repository
mkdir my-app-tests && cd my-app-tests
git init

# Create Maven project structure
mkdir -p src/main/java
mkdir -p src/test/java/tests
mkdir -p src/test/java/pages
mkdir -p src/test/java/utils
mkdir -p src/test/resources
mkdir -p .github/workflows
```

### Testing Framework Options

| Framework | Best For | Dependency |
|-----------|----------|------------|
| JUnit 5 | Unit, integration | `junit-jupiter` |
| TestNG | Complex test suites, parallel | `testng` |
| Selenium | Browser automation | `selenium-java` |
| Rest Assured | API testing | `rest-assured` |

### Recommended Setup: JUnit 5 + Selenium

**pom.xml:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.example</groupId>
    <artifactId>my-app-tests</artifactId>
    <version>1.0-SNAPSHOT</version>
    <packaging>jar</packaging>

    <properties>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <junit.version>5.10.0</junit.version>
        <selenium.version>4.15.0</selenium.version>
    </properties>

    <dependencies>
        <!-- JUnit 5 -->
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter</artifactId>
            <version>${junit.version}</version>
            <scope>test</scope>
        </dependency>

        <!-- Selenium -->
        <dependency>
            <groupId>org.seleniumhq.selenium</groupId>
            <artifactId>selenium-java</artifactId>
            <version>${selenium.version}</version>
        </dependency>

        <!-- WebDriverManager -->
        <dependency>
            <groupId>io.github.bonigarcia</groupId>
            <artifactId>webdrivermanager</artifactId>
            <version>5.6.2</version>
        </dependency>

        <!-- Assertions -->
        <dependency>
            <groupId>org.assertj</groupId>
            <artifactId>assertj-core</artifactId>
            <version>3.24.2</version>
            <scope>test</scope>
        </dependency>

        <!-- Reporting -->
        <dependency>
            <groupId>io.qameta.allure</groupId>
            <artifactId>allure-junit5</artifactId>
            <version>2.24.0</version>
            <scope>test</scope>
        </dependency>

        <!-- Configuration -->
        <dependency>
            <groupId>org.aeonbits.owner</groupId>
            <artifactId>owner</artifactId>
            <version>1.0.12</version>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <version>3.2.2</version>
                <configuration>
                    <includes>
                        <include>**/*Test.java</include>
                    </includes>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
```

### Configuration Files

**src/test/resources/config.properties:**
```properties
base.url=http://localhost:3000
browser=chrome
headless=true
timeout.implicit=10
timeout.explicit=30
test.user=testuser@example.com
test.password=testpassword
```

**BaseTest.java (src/test/java/tests/BaseTest.java):**
```java
package tests;

import io.github.bonigarcia.wdm.WebDriverManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;

import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;
import java.util.Properties;

public abstract class BaseTest {
    protected WebDriver driver;
    protected static Properties config;

    @BeforeAll
    static void setupClass() {
        WebDriverManager.chromedriver().setup();
        config = new Properties();
        try (InputStream input = BaseTest.class.getClassLoader()
                .getResourceAsStream("config.properties")) {
            config.load(input);
        } catch (IOException e) {
            throw new RuntimeException("Failed to load config", e);
        }
    }

    @BeforeEach
    void setupTest() {
        ChromeOptions options = new ChromeOptions();
        if (Boolean.parseBoolean(config.getProperty("headless", "true"))) {
            options.addArguments("--headless=new");
        }
        driver = new ChromeDriver(options);
        driver.manage().timeouts().implicitlyWait(
            Duration.ofSeconds(Long.parseLong(
                config.getProperty("timeout.implicit", "10"))));
        driver.manage().window().maximize();
    }

    @AfterEach
    void tearDown() {
        if (driver != null) {
            driver.quit();
        }
    }

    protected String getBaseUrl() {
        return config.getProperty("base.url");
    }
}
```

### Gradle Alternative

**build.gradle:**
```groovy
plugins {
    id 'java'
    id 'io.qameta.allure' version '2.11.2'
}

group = 'com.example'
version = '1.0-SNAPSHOT'

java {
    sourceCompatibility = JavaVersion.VERSION_17
}

repositories {
    mavenCentral()
}

dependencies {
    testImplementation 'org.junit.jupiter:junit-jupiter:5.10.0'
    testImplementation 'org.seleniumhq.selenium:selenium-java:4.15.0'
    testImplementation 'io.github.bonigarcia:webdrivermanager:5.6.2'
    testImplementation 'org.assertj:assertj-core:3.24.2'
    testImplementation 'io.qameta.allure:allure-junit5:2.24.0'
}

test {
    useJUnitPlatform()
    testLogging {
        events "passed", "skipped", "failed"
    }
}
```

**.gitignore additions:**
```
target/
build/
.idea/
*.iml
.gradle/
*.class
```

---

## CI/CD Integration

### GitHub Actions Template

**.github/workflows/tests.yml:**
```yaml
name: Test Suite

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      # Node.js setup
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      # Python setup
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'

      # Java setup
      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'
          cache: 'maven'

      - name: Install dependencies
        run: |
          # Choose one based on your stack
          npm ci                    # Node.js
          pip install -r requirements.txt  # Python
          mvn dependency:resolve    # Java

      - name: Run tests
        run: |
          # Choose one based on your stack
          npm test                  # Node.js
          pytest                    # Python
          mvn test                  # Java

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: reports/
```

---

## Quick Reference

| Task | Node.js | Python | Java |
|------|---------|--------|------|
| Install deps | `npm install` | `pip install -r requirements.txt` | `mvn dependency:resolve` |
| Run tests | `npm test` | `pytest` | `mvn test` |
| Run specific test | `npm test -- -g "test name"` | `pytest -k "test_name"` | `mvn test -Dtest=TestClass#testMethod` |
| Run with tags | `npm test -- --grep @smoke` | `pytest -m smoke` | `mvn test -Dgroups=smoke` |
| Generate report | `npm run report` | `pytest --html=report.html` | `mvn allure:serve` |

---

*Guide from Domains collection*
