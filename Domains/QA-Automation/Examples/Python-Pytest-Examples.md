# Python Test Examples (pytest)
**Version:** v0.66.3

**Framework:** IDPF-QA-Automation

## Overview

This guide provides idiomatic pytest patterns for QA automation testing with Playwright. Examples follow Python best practices including fixtures, parametrization, and pytest plugins.

## Project Setup

### Dependencies

```bash
# requirements.txt
pytest>=7.4.0
pytest-playwright>=0.4.0
pytest-html>=4.1.0
pytest-xdist>=3.5.0       # Parallel execution
pytest-rerunfailures>=12.0  # Retry flaky tests
python-dotenv>=1.0.0
allure-pytest>=2.13.0
faker>=19.0.0
```

### Configuration

```ini
# pytest.ini
[pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts =
    -v
    --tb=short
    --strict-markers
markers =
    smoke: Quick smoke tests
    regression: Full regression suite
    slow: Tests that take longer to run
    flaky: Tests known to be flaky
filterwarnings =
    ignore::DeprecationWarning
```

```python
# pyproject.toml alternative
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
addopts = "-v --tb=short"
markers = [
    "smoke: Quick smoke tests",
    "regression: Full regression suite",
]
```

## Fixtures

### Basic Fixtures

```python
# conftest.py
import pytest
from playwright.sync_api import Page, Browser, BrowserContext
import os
from dotenv import load_dotenv

load_dotenv()


@pytest.fixture(scope="session")
def base_url() -> str:
    """Base URL for the application under test."""
    return os.getenv("BASE_URL", "http://localhost:3000")


@pytest.fixture(scope="session")
def api_url() -> str:
    """API URL for backend calls."""
    return os.getenv("API_URL", "http://localhost:8080/api")


@pytest.fixture(scope="function")
def authenticated_context(
    browser: Browser,
    base_url: str
) -> BrowserContext:
    """Browser context with authentication cookies."""
    context = browser.new_context()
    page = context.new_page()

    # Perform login
    page.goto(f"{base_url}/login")
    page.fill("[data-testid=email]", os.getenv("TEST_USER", "test@example.com"))
    page.fill("[data-testid=password]", os.getenv("TEST_PASSWORD", "password"))
    page.click("[data-testid=login-button]")
    page.wait_for_url("**/dashboard")

    yield context
    context.close()


@pytest.fixture(scope="function")
def authenticated_page(authenticated_context: BrowserContext) -> Page:
    """Page with authenticated user."""
    yield authenticated_context.new_page()
```

### Page Object Fixtures

```python
# conftest.py (continued)
from pages.login_page import LoginPage
from pages.dashboard_page import DashboardPage


@pytest.fixture
def login_page(page: Page, base_url: str) -> LoginPage:
    """Login page object fixture."""
    login = LoginPage(page, base_url)
    login.navigate()
    return login


@pytest.fixture
def dashboard_page(authenticated_page: Page, base_url: str) -> DashboardPage:
    """Dashboard page with authenticated user."""
    dashboard = DashboardPage(authenticated_page, base_url)
    dashboard.navigate()
    return dashboard
```

### Factory Fixtures

```python
# conftest.py (continued)
from dataclasses import dataclass
from faker import Faker
from typing import Callable

fake = Faker()


@dataclass
class TestUser:
    email: str
    password: str
    first_name: str
    last_name: str


@pytest.fixture
def user_factory() -> Callable[..., TestUser]:
    """Factory for creating test users."""
    def _create_user(
        email: str | None = None,
        password: str | None = None,
        first_name: str | None = None,
        last_name: str | None = None
    ) -> TestUser:
        return TestUser(
            email=email or fake.email(),
            password=password or fake.password(length=12),
            first_name=first_name or fake.first_name(),
            last_name=last_name or fake.last_name()
        )
    return _create_user


@pytest.fixture
def test_user(user_factory: Callable[..., TestUser]) -> TestUser:
    """Pre-created test user."""
    return user_factory()
```

## Page Objects

### Base Page

```python
# pages/base_page.py
from playwright.sync_api import Page, Locator, expect
from typing import Self


class BasePage:
    """Base page object with common functionality."""

    def __init__(self, page: Page, base_url: str):
        self.page = page
        self.base_url = base_url

    @property
    def path(self) -> str:
        """Override in subclasses to define page path."""
        raise NotImplementedError

    def navigate(self) -> Self:
        """Navigate to the page."""
        self.page.goto(f"{self.base_url}{self.path}")
        self.wait_for_load()
        return self

    def wait_for_load(self) -> None:
        """Wait for page to be ready. Override for custom behavior."""
        self.page.wait_for_load_state("networkidle")

    def get_title(self) -> str:
        """Get page title."""
        return self.page.title()

    @property
    def header(self) -> Locator:
        return self.page.locator("[data-testid=header]")

    @property
    def footer(self) -> Locator:
        return self.page.locator("[data-testid=footer]")
```

### Page Implementation

```python
# pages/login_page.py
from playwright.sync_api import Page, Locator
from pages.base_page import BasePage


class LoginPage(BasePage):
    """Login page object."""

    @property
    def path(self) -> str:
        return "/login"

    # Elements
    @property
    def email_input(self) -> Locator:
        return self.page.locator("[data-testid=email-input]")

    @property
    def password_input(self) -> Locator:
        return self.page.locator("[data-testid=password-input]")

    @property
    def submit_button(self) -> Locator:
        return self.page.locator("[data-testid=login-button]")

    @property
    def error_message(self) -> Locator:
        return self.page.locator("[data-testid=error-message]")

    @property
    def forgot_password_link(self) -> Locator:
        return self.page.locator("[data-testid=forgot-password]")

    # Actions
    def enter_email(self, email: str) -> None:
        """Enter email address."""
        self.email_input.fill(email)

    def enter_password(self, password: str) -> None:
        """Enter password."""
        self.password_input.fill(password)

    def click_submit(self) -> None:
        """Click login button."""
        self.submit_button.click()

    def login(self, email: str, password: str) -> None:
        """Perform complete login flow."""
        self.enter_email(email)
        self.enter_password(password)
        self.click_submit()

    def get_error_text(self) -> str:
        """Get error message text."""
        return self.error_message.inner_text()

    def is_error_visible(self) -> bool:
        """Check if error message is displayed."""
        return self.error_message.is_visible()
```

## Test Examples

### Basic Test Structure

```python
# tests/test_login.py
import pytest
from playwright.sync_api import Page, expect
from pages.login_page import LoginPage


class TestLogin:
    """Login functionality tests."""

    @pytest.mark.smoke
    def test_login_page_loads(self, login_page: LoginPage):
        """Verify login page loads correctly."""
        expect(login_page.email_input).to_be_visible()
        expect(login_page.password_input).to_be_visible()
        expect(login_page.submit_button).to_be_enabled()

    @pytest.mark.smoke
    def test_successful_login(
        self,
        login_page: LoginPage,
        page: Page
    ):
        """Verify user can login with valid credentials."""
        login_page.login("valid@example.com", "ValidPass123!")

        expect(page).to_have_url("**/dashboard")
        expect(page.locator("[data-testid=welcome-message]")).to_be_visible()

    def test_login_with_invalid_email(self, login_page: LoginPage):
        """Verify error shown for invalid email format."""
        login_page.login("invalid-email", "SomePassword123!")

        expect(login_page.error_message).to_be_visible()
        assert "valid email" in login_page.get_error_text().lower()

    def test_login_with_wrong_password(self, login_page: LoginPage):
        """Verify error shown for incorrect password."""
        login_page.login("valid@example.com", "WrongPassword!")

        expect(login_page.error_message).to_be_visible()
        assert "invalid credentials" in login_page.get_error_text().lower()
```

### Parametrized Tests

```python
# tests/test_login_validation.py
import pytest
from pages.login_page import LoginPage


class TestLoginValidation:
    """Login form validation tests."""

    @pytest.mark.parametrize("email,expected_error", [
        ("", "Email is required"),
        ("notanemail", "Invalid email format"),
        ("missing@domain", "Invalid email format"),
        ("@nodomain.com", "Invalid email format"),
    ])
    def test_email_validation(
        self,
        login_page: LoginPage,
        email: str,
        expected_error: str
    ):
        """Verify email validation messages."""
        login_page.enter_email(email)
        login_page.enter_password("ValidPassword123!")
        login_page.click_submit()

        assert expected_error in login_page.get_error_text()

    @pytest.mark.parametrize("password,expected_error", [
        ("", "Password is required"),
        ("short", "at least 8 characters"),
        ("nouppercase1!", "uppercase letter"),
        ("NOLOWERCASE1!", "lowercase letter"),
        ("NoNumbers!", "number"),
    ])
    def test_password_validation(
        self,
        login_page: LoginPage,
        password: str,
        expected_error: str
    ):
        """Verify password validation messages."""
        login_page.enter_email("valid@example.com")
        login_page.enter_password(password)
        login_page.click_submit()

        assert expected_error.lower() in login_page.get_error_text().lower()

    @pytest.mark.parametrize("email,password,should_succeed", [
        ("valid@example.com", "ValidPass123!", True),
        ("admin@example.com", "AdminPass456!", True),
        ("invalid@example.com", "WrongPass!", False),
        ("", "ValidPass123!", False),
        ("valid@example.com", "", False),
    ])
    def test_login_scenarios(
        self,
        login_page: LoginPage,
        page,
        email: str,
        password: str,
        should_succeed: bool
    ):
        """Test various login scenarios."""
        login_page.login(email, password)

        if should_succeed:
            page.wait_for_url("**/dashboard", timeout=5000)
        else:
            assert login_page.is_error_visible()
```

### Test with Factory Data

```python
# tests/test_registration.py
import pytest
from pages.registration_page import RegistrationPage
from conftest import TestUser
from typing import Callable


class TestRegistration:
    """User registration tests."""

    def test_successful_registration(
        self,
        registration_page: RegistrationPage,
        user_factory: Callable[..., TestUser],
        page
    ):
        """Verify user can register with valid data."""
        user = user_factory()

        registration_page.register(
            email=user.email,
            password=user.password,
            first_name=user.first_name,
            last_name=user.last_name
        )

        page.wait_for_url("**/welcome")
        assert "Welcome" in page.title()

    def test_registration_with_existing_email(
        self,
        registration_page: RegistrationPage,
        user_factory: Callable[..., TestUser]
    ):
        """Verify error when registering with existing email."""
        user = user_factory(email="existing@example.com")

        registration_page.register(
            email=user.email,
            password=user.password,
            first_name=user.first_name,
            last_name=user.last_name
        )

        assert "already registered" in registration_page.get_error_text().lower()
```

### API Mocking

```python
# tests/test_dashboard.py
import pytest
from playwright.sync_api import Page, Route


class TestDashboard:
    """Dashboard tests with mocked API."""

    @pytest.fixture
    def mock_stats_api(self, page: Page):
        """Mock the stats API endpoint."""
        def handle_route(route: Route):
            route.fulfill(
                status=200,
                content_type="application/json",
                body='{"users": 100, "orders": 50, "revenue": 10000}'
            )

        page.route("**/api/stats", handle_route)
        yield
        page.unroute("**/api/stats")

    def test_dashboard_displays_stats(
        self,
        authenticated_page: Page,
        base_url: str,
        mock_stats_api
    ):
        """Verify dashboard displays mocked statistics."""
        authenticated_page.goto(f"{base_url}/dashboard")

        assert authenticated_page.locator("[data-testid=users-count]").inner_text() == "100"
        assert authenticated_page.locator("[data-testid=orders-count]").inner_text() == "50"
        assert "$10,000" in authenticated_page.locator("[data-testid=revenue]").inner_text()

    @pytest.fixture
    def mock_api_error(self, page: Page):
        """Mock API error response."""
        def handle_route(route: Route):
            route.fulfill(
                status=500,
                content_type="application/json",
                body='{"error": "Internal server error"}'
            )

        page.route("**/api/stats", handle_route)
        yield
        page.unroute("**/api/stats")

    def test_dashboard_handles_api_error(
        self,
        authenticated_page: Page,
        base_url: str,
        mock_api_error
    ):
        """Verify dashboard shows error state on API failure."""
        authenticated_page.goto(f"{base_url}/dashboard")

        error_banner = authenticated_page.locator("[data-testid=error-banner]")
        assert error_banner.is_visible()
        assert "try again" in error_banner.inner_text().lower()
```

## Markers and Selection

### Custom Markers

```python
# conftest.py
import pytest


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line("markers", "smoke: Quick smoke tests")
    config.addinivalue_line("markers", "regression: Full regression suite")
    config.addinivalue_line("markers", "slow: Tests that take longer")
    config.addinivalue_line("markers", "flaky: Tests known to be flaky")
    config.addinivalue_line("markers", "mobile: Mobile-specific tests")
```

### Using Markers

```python
# tests/test_checkout.py
import pytest


class TestCheckout:

    @pytest.mark.smoke
    def test_add_item_to_cart(self, page):
        """Critical path test."""
        pass

    @pytest.mark.regression
    def test_remove_item_from_cart(self, page):
        """Regression test."""
        pass

    @pytest.mark.slow
    def test_checkout_flow_complete(self, page):
        """Full checkout flow - takes time."""
        pass

    @pytest.mark.flaky(reruns=3, reason="Third-party payment API")
    def test_payment_processing(self, page):
        """Known flaky test."""
        pass

    @pytest.mark.skip(reason="Feature not implemented yet")
    def test_gift_card_payment(self, page):
        """Skipped test."""
        pass

    @pytest.mark.skipif(
        condition="CI" in os.environ,
        reason="Requires local payment sandbox"
    )
    def test_local_payment_sandbox(self, page):
        """Conditionally skipped."""
        pass
```

### Running Tests

```bash
# Run all tests
pytest

# Run smoke tests only
pytest -m smoke

# Run regression excluding slow tests
pytest -m "regression and not slow"

# Run with reruns for flaky tests
pytest --reruns 3 --reruns-delay 1

# Parallel execution
pytest -n auto  # Use all CPU cores
pytest -n 4     # Use 4 workers
```

## Reporting

### HTML Report

```bash
pytest --html=reports/report.html --self-contained-html
```

### Allure Report

```python
# conftest.py
import allure


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """Attach screenshot on failure."""
    outcome = yield
    report = outcome.get_result()

    if report.when == "call" and report.failed:
        page = item.funcargs.get("page")
        if page:
            screenshot = page.screenshot()
            allure.attach(
                screenshot,
                name="failure-screenshot",
                attachment_type=allure.attachment_type.PNG
            )
```

```bash
# Run with Allure
pytest --alluredir=reports/allure-results

# Generate report
allure generate reports/allure-results -o reports/allure-report --clean
allure open reports/allure-report
```

## CI/CD Configuration

### GitHub Actions

```yaml
# .github/workflows/tests.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'

      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          playwright install --with-deps chromium

      - name: Run tests
        run: pytest --html=reports/report.html -n auto
        env:
          BASE_URL: ${{ vars.BASE_URL }}

      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-report
          path: reports/
```

*Examples from IDPF-QA-Automation Framework*
