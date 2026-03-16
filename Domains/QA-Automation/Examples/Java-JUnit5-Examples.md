# Java Test Examples (JUnit 5)
**Version:** v0.65.0

**Framework:** IDPF-QA-Automation

## Overview

This guide provides idiomatic JUnit 5 patterns for QA automation testing with Selenium. Examples follow Java best practices including extensions, parameterized tests, and dependency injection.

## Project Setup

### Maven Dependencies

```xml
<!-- pom.xml -->
<properties>
    <maven.compiler.source>17</maven.compiler.source>
    <maven.compiler.target>17</maven.compiler.target>
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

    <!-- AssertJ -->
    <dependency>
        <groupId>org.assertj</groupId>
        <artifactId>assertj-core</artifactId>
        <version>3.24.2</version>
        <scope>test</scope>
    </dependency>

    <!-- Allure -->
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

    <!-- Faker -->
    <dependency>
        <groupId>com.github.javafaker</groupId>
        <artifactId>javafaker</artifactId>
        <version>1.0.2</version>
        <scope>test</scope>
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
                <groups>${test.groups}</groups>
            </configuration>
        </plugin>
    </plugins>
</build>
```

## Configuration Management

### Owner Configuration

```java
// src/test/java/config/Config.java
package config;

import org.aeonbits.owner.Config;
import org.aeonbits.owner.Config.Sources;

@Sources({
    "classpath:config/${env}.properties",
    "classpath:config/default.properties"
})
public interface TestConfig extends Config {

    @Key("base.url")
    @DefaultValue("http://localhost:3000")
    String baseUrl();

    @Key("api.url")
    @DefaultValue("http://localhost:8080/api")
    String apiUrl();

    @Key("browser")
    @DefaultValue("chrome")
    String browser();

    @Key("headless")
    @DefaultValue("true")
    boolean headless();

    @Key("timeout.implicit")
    @DefaultValue("10")
    int implicitTimeout();

    @Key("timeout.explicit")
    @DefaultValue("30")
    int explicitTimeout();

    @Key("test.user.email")
    String testUserEmail();

    @Key("test.user.password")
    String testUserPassword();
}
```

```properties
# src/test/resources/config/default.properties
base.url=http://localhost:3000
api.url=http://localhost:8080/api
browser=chrome
headless=true
timeout.implicit=10
timeout.explicit=30
test.user.email=test@example.com
test.user.password=TestPass123!
```

```java
// src/test/java/config/ConfigFactory.java
package config;

import org.aeonbits.owner.ConfigCache;

public class ConfigFactory {

    private static final TestConfig CONFIG = ConfigCache.getOrCreate(TestConfig.class);

    public static TestConfig getConfig() {
        return CONFIG;
    }
}
```

## JUnit 5 Extensions

### WebDriver Extension

```java
// src/test/java/extensions/WebDriverExtension.java
package extensions;

import config.ConfigFactory;
import config.TestConfig;
import io.github.bonigarcia.wdm.WebDriverManager;
import org.junit.jupiter.api.extension.*;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.firefox.FirefoxDriver;
import org.openqa.selenium.firefox.FirefoxOptions;

import java.time.Duration;

public class WebDriverExtension implements BeforeEachCallback, AfterEachCallback, ParameterResolver {

    private static final String DRIVER_KEY = "webdriver";
    private final TestConfig config = ConfigFactory.getConfig();

    @Override
    public void beforeEach(ExtensionContext context) {
        WebDriver driver = createDriver();
        driver.manage().timeouts().implicitlyWait(
            Duration.ofSeconds(config.implicitTimeout())
        );
        driver.manage().window().maximize();

        getStore(context).put(DRIVER_KEY, driver);
    }

    @Override
    public void afterEach(ExtensionContext context) {
        WebDriver driver = getStore(context).get(DRIVER_KEY, WebDriver.class);
        if (driver != null) {
            driver.quit();
        }
    }

    @Override
    public boolean supportsParameter(ParameterContext parameterContext,
                                     ExtensionContext extensionContext) {
        return parameterContext.getParameter().getType().equals(WebDriver.class);
    }

    @Override
    public Object resolveParameter(ParameterContext parameterContext,
                                   ExtensionContext extensionContext) {
        return getStore(extensionContext).get(DRIVER_KEY, WebDriver.class);
    }

    private WebDriver createDriver() {
        String browser = config.browser().toLowerCase();

        return switch (browser) {
            case "chrome" -> {
                WebDriverManager.chromedriver().setup();
                ChromeOptions options = new ChromeOptions();
                if (config.headless()) {
                    options.addArguments("--headless=new");
                }
                options.addArguments("--disable-gpu", "--no-sandbox");
                yield new ChromeDriver(options);
            }
            case "firefox" -> {
                WebDriverManager.firefoxdriver().setup();
                FirefoxOptions options = new FirefoxOptions();
                if (config.headless()) {
                    options.addArguments("--headless");
                }
                yield new FirefoxDriver(options);
            }
            default -> throw new IllegalArgumentException("Unsupported browser: " + browser);
        };
    }

    private ExtensionContext.Store getStore(ExtensionContext context) {
        return context.getStore(ExtensionContext.Namespace.create(getClass(), context.getRequiredTestMethod()));
    }
}
```

### Screenshot on Failure Extension

```java
// src/test/java/extensions/ScreenshotExtension.java
package extensions;

import io.qameta.allure.Allure;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.junit.jupiter.api.extension.TestWatcher;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;
import org.openqa.selenium.WebDriver;

import java.io.ByteArrayInputStream;

public class ScreenshotExtension implements TestWatcher {

    @Override
    public void testFailed(ExtensionContext context, Throwable cause) {
        context.getTestInstance().ifPresent(testInstance -> {
            try {
                var field = testInstance.getClass().getDeclaredField("driver");
                field.setAccessible(true);
                WebDriver driver = (WebDriver) field.get(testInstance);

                if (driver != null) {
                    byte[] screenshot = ((TakesScreenshot) driver).getScreenshotAs(OutputType.BYTES);
                    Allure.addAttachment("Failure Screenshot",
                        new ByteArrayInputStream(screenshot));
                }
            } catch (Exception e) {
                // Log but don't fail the test further
                System.err.println("Failed to capture screenshot: " + e.getMessage());
            }
        });
    }
}
```

## Page Objects

### Base Page

```java
// src/test/java/pages/BasePage.java
package pages;

import config.ConfigFactory;
import org.openqa.selenium.*;
import org.openqa.selenium.support.PageFactory;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

public abstract class BasePage {

    protected final WebDriver driver;
    protected final WebDriverWait wait;
    protected final String baseUrl;

    public BasePage(WebDriver driver) {
        this.driver = driver;
        this.baseUrl = ConfigFactory.getConfig().baseUrl();
        this.wait = new WebDriverWait(driver,
            Duration.ofSeconds(ConfigFactory.getConfig().explicitTimeout()));
        PageFactory.initElements(driver, this);
    }

    protected abstract String getPath();

    public void navigate() {
        driver.get(baseUrl + getPath());
        waitForPageLoad();
    }

    protected void waitForPageLoad() {
        wait.until(webDriver ->
            ((JavascriptExecutor) webDriver)
                .executeScript("return document.readyState")
                .equals("complete"));
    }

    protected void waitForElement(By locator) {
        wait.until(ExpectedConditions.visibilityOfElementLocated(locator));
    }

    protected void waitForElementClickable(By locator) {
        wait.until(ExpectedConditions.elementToBeClickable(locator));
    }

    protected void click(By locator) {
        waitForElementClickable(locator);
        driver.findElement(locator).click();
    }

    protected void type(By locator, String text) {
        waitForElement(locator);
        WebElement element = driver.findElement(locator);
        element.clear();
        element.sendKeys(text);
    }

    protected String getText(By locator) {
        waitForElement(locator);
        return driver.findElement(locator).getText();
    }

    protected boolean isDisplayed(By locator) {
        try {
            return driver.findElement(locator).isDisplayed();
        } catch (NoSuchElementException e) {
            return false;
        }
    }

    public String getTitle() {
        return driver.getTitle();
    }

    public String getCurrentUrl() {
        return driver.getCurrentUrl();
    }
}
```

### Page Implementation

```java
// src/test/java/pages/LoginPage.java
package pages;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;

public class LoginPage extends BasePage {

    // Locators
    private static final By EMAIL_INPUT = By.cssSelector("[data-testid='email-input']");
    private static final By PASSWORD_INPUT = By.cssSelector("[data-testid='password-input']");
    private static final By LOGIN_BUTTON = By.cssSelector("[data-testid='login-button']");
    private static final By ERROR_MESSAGE = By.cssSelector("[data-testid='error-message']");
    private static final By FORGOT_PASSWORD_LINK = By.cssSelector("[data-testid='forgot-password']");

    public LoginPage(WebDriver driver) {
        super(driver);
    }

    @Override
    protected String getPath() {
        return "/login";
    }

    // Actions
    public LoginPage enterEmail(String email) {
        type(EMAIL_INPUT, email);
        return this;
    }

    public LoginPage enterPassword(String password) {
        type(PASSWORD_INPUT, password);
        return this;
    }

    public void clickLogin() {
        click(LOGIN_BUTTON);
    }

    public void login(String email, String password) {
        enterEmail(email);
        enterPassword(password);
        clickLogin();
    }

    public void clickForgotPassword() {
        click(FORGOT_PASSWORD_LINK);
    }

    // Queries
    public String getErrorMessage() {
        waitForElement(ERROR_MESSAGE);
        return getText(ERROR_MESSAGE);
    }

    public boolean isErrorDisplayed() {
        return isDisplayed(ERROR_MESSAGE);
    }

    public boolean isLoginButtonEnabled() {
        waitForElement(LOGIN_BUTTON);
        return driver.findElement(LOGIN_BUTTON).isEnabled();
    }
}
```

## Test Examples

### Basic Tests

```java
// src/test/java/tests/LoginTest.java
package tests;

import extensions.WebDriverExtension;
import extensions.ScreenshotExtension;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.openqa.selenium.WebDriver;
import pages.LoginPage;

import static org.assertj.core.api.Assertions.assertThat;

@ExtendWith({WebDriverExtension.class, ScreenshotExtension.class})
@DisplayName("Login Functionality")
@Tag("smoke")
class LoginTest {

    private LoginPage loginPage;

    @BeforeEach
    void setUp(WebDriver driver) {
        loginPage = new LoginPage(driver);
        loginPage.navigate();
    }

    @Test
    @DisplayName("Should display login form elements")
    void shouldDisplayLoginFormElements() {
        assertThat(loginPage.isLoginButtonEnabled()).isTrue();
    }

    @Test
    @DisplayName("Should login with valid credentials")
    void shouldLoginWithValidCredentials(WebDriver driver) {
        loginPage.login("valid@example.com", "ValidPass123!");

        assertThat(driver.getCurrentUrl()).contains("/dashboard");
    }

    @Test
    @DisplayName("Should show error for invalid credentials")
    void shouldShowErrorForInvalidCredentials() {
        loginPage.login("invalid@example.com", "WrongPassword!");

        assertThat(loginPage.isErrorDisplayed()).isTrue();
        assertThat(loginPage.getErrorMessage()).containsIgnoringCase("invalid credentials");
    }
}
```

### Parameterized Tests

```java
// src/test/java/tests/LoginValidationTest.java
package tests;

import extensions.WebDriverExtension;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.openqa.selenium.WebDriver;
import pages.LoginPage;

import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

@ExtendWith(WebDriverExtension.class)
@DisplayName("Login Validation")
@Tag("regression")
class LoginValidationTest {

    private LoginPage loginPage;

    @BeforeEach
    void setUp(WebDriver driver) {
        loginPage = new LoginPage(driver);
        loginPage.navigate();
    }

    @ParameterizedTest(name = "Email ''{0}'' should show error ''{1}''")
    @CsvSource({
        "'', Email is required",
        "notanemail, Invalid email format",
        "missing@domain, Invalid email format",
        "@nodomain.com, Invalid email format"
    })
    @DisplayName("Should validate email format")
    void shouldValidateEmailFormat(String email, String expectedError) {
        loginPage.enterEmail(email)
                 .enterPassword("ValidPassword123!")
                 .clickLogin();

        assertThat(loginPage.getErrorMessage()).contains(expectedError);
    }

    @ParameterizedTest(name = "Password ''{0}'' should fail validation")
    @CsvSource({
        "'', Password is required",
        "short, at least 8 characters",
        "nouppercase1!, uppercase letter",
        "NOLOWERCASE1!, lowercase letter"
    })
    @DisplayName("Should validate password requirements")
    void shouldValidatePasswordRequirements(String password, String expectedError) {
        loginPage.enterEmail("valid@example.com")
                 .enterPassword(password)
                 .clickLogin();

        assertThat(loginPage.getErrorMessage().toLowerCase())
            .contains(expectedError.toLowerCase());
    }

    @ParameterizedTest(name = "Login attempt #{index}")
    @MethodSource("loginScenarios")
    @DisplayName("Should handle various login scenarios")
    void shouldHandleLoginScenarios(String email, String password, boolean shouldSucceed, WebDriver driver) {
        loginPage.login(email, password);

        if (shouldSucceed) {
            assertThat(driver.getCurrentUrl()).contains("/dashboard");
        } else {
            assertThat(loginPage.isErrorDisplayed()).isTrue();
        }
    }

    static Stream<Arguments> loginScenarios() {
        return Stream.of(
            Arguments.of("valid@example.com", "ValidPass123!", true),
            Arguments.of("admin@example.com", "AdminPass456!", true),
            Arguments.of("invalid@example.com", "WrongPass!", false),
            Arguments.of("", "ValidPass123!", false),
            Arguments.of("valid@example.com", "", false)
        );
    }

    @ParameterizedTest
    @EnumSource(UserRole.class)
    @DisplayName("Should redirect based on user role")
    void shouldRedirectBasedOnRole(UserRole role, WebDriver driver) {
        loginPage.login(role.getEmail(), role.getPassword());

        assertThat(driver.getCurrentUrl()).contains(role.getExpectedRedirect());
    }

    enum UserRole {
        ADMIN("admin@example.com", "AdminPass!", "/admin/dashboard"),
        USER("user@example.com", "UserPass!", "/dashboard"),
        GUEST("guest@example.com", "GuestPass!", "/welcome");

        private final String email;
        private final String password;
        private final String expectedRedirect;

        UserRole(String email, String password, String expectedRedirect) {
            this.email = email;
            this.password = password;
            this.expectedRedirect = expectedRedirect;
        }

        public String getEmail() { return email; }
        public String getPassword() { return password; }
        public String getExpectedRedirect() { return expectedRedirect; }
    }
}
```

### Nested Tests

```java
// src/test/java/tests/CheckoutTest.java
package tests;

import extensions.WebDriverExtension;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.openqa.selenium.WebDriver;
import pages.*;

import static org.assertj.core.api.Assertions.assertThat;

@ExtendWith(WebDriverExtension.class)
@DisplayName("Checkout Flow")
@Tag("e2e")
class CheckoutTest {

    @Nested
    @DisplayName("Cart Operations")
    class CartOperations {

        private ProductPage productPage;
        private CartPage cartPage;

        @BeforeEach
        void setUp(WebDriver driver) {
            productPage = new ProductPage(driver);
            cartPage = new CartPage(driver);
        }

        @Test
        @DisplayName("Should add item to cart")
        void shouldAddItemToCart() {
            productPage.navigate();
            productPage.addToCart("Product 1");

            cartPage.navigate();
            assertThat(cartPage.getItemCount()).isEqualTo(1);
        }

        @Test
        @DisplayName("Should update quantity")
        void shouldUpdateQuantity() {
            productPage.navigate();
            productPage.addToCart("Product 1");

            cartPage.navigate();
            cartPage.updateQuantity("Product 1", 3);

            assertThat(cartPage.getQuantity("Product 1")).isEqualTo(3);
        }

        @Test
        @DisplayName("Should remove item from cart")
        void shouldRemoveItemFromCart() {
            productPage.navigate();
            productPage.addToCart("Product 1");

            cartPage.navigate();
            cartPage.removeItem("Product 1");

            assertThat(cartPage.isEmpty()).isTrue();
        }
    }

    @Nested
    @DisplayName("Checkout Process")
    @TestMethodOrder(MethodOrderer.OrderAnnotation.class)
    class CheckoutProcess {

        @Test
        @Order(1)
        @DisplayName("Should proceed to checkout")
        void shouldProceedToCheckout(WebDriver driver) {
            // Setup cart first
            // ...
            assertThat(driver.getCurrentUrl()).contains("/checkout");
        }

        @Test
        @Order(2)
        @DisplayName("Should enter shipping info")
        void shouldEnterShippingInfo() {
            // Enter shipping details
        }

        @Test
        @Order(3)
        @DisplayName("Should complete payment")
        void shouldCompletePayment() {
            // Complete payment
        }
    }
}
```

### Test with Assumptions

```java
// src/test/java/tests/FeatureFlagTest.java
package tests;

import config.ConfigFactory;
import extensions.WebDriverExtension;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.openqa.selenium.WebDriver;

import static org.junit.jupiter.api.Assumptions.*;
import static org.assertj.core.api.Assertions.assertThat;

@ExtendWith(WebDriverExtension.class)
@DisplayName("Feature Flag Tests")
class FeatureFlagTest {

    @Test
    @DisplayName("Should show new checkout when feature enabled")
    void shouldShowNewCheckoutWhenEnabled(WebDriver driver) {
        assumeTrue(
            isFeatureEnabled("NEW_CHECKOUT"),
            "New checkout feature is not enabled"
        );

        // Test new checkout flow
    }

    @Test
    @DisplayName("Should run only in staging environment")
    void shouldRunOnlyInStaging(WebDriver driver) {
        assumeTrue(
            ConfigFactory.getConfig().baseUrl().contains("staging"),
            "Test requires staging environment"
        );

        // Staging-specific test
    }

    @Test
    @DisplayName("Should skip on CI if no payment sandbox")
    @DisabledIfEnvironmentVariable(named = "CI", matches = "true")
    void shouldSkipOnCI() {
        // Test requiring local payment sandbox
    }

    private boolean isFeatureEnabled(String featureName) {
        // Check feature flag service
        return System.getenv(featureName) != null;
    }
}
```

## Data Generation

### Test Data Factory

```java
// src/test/java/factories/UserFactory.java
package factories;

import com.github.javafaker.Faker;
import models.TestUser;

public class UserFactory {

    private static final Faker faker = new Faker();

    public static TestUser createUser() {
        return TestUser.builder()
            .email(faker.internet().emailAddress())
            .password(faker.internet().password(8, 16, true, true, true))
            .firstName(faker.name().firstName())
            .lastName(faker.name().lastName())
            .build();
    }

    public static TestUser createAdminUser() {
        return createUser().toBuilder()
            .email("admin_" + faker.internet().emailAddress())
            .role("ADMIN")
            .build();
    }
}
```

```java
// src/test/java/models/TestUser.java
package models;

import lombok.Builder;
import lombok.Data;

@Data
@Builder(toBuilder = true)
public class TestUser {
    private String email;
    private String password;
    private String firstName;
    private String lastName;
    @Builder.Default
    private String role = "USER";
}
```

## Running Tests

```bash
# Run all tests
mvn test

# Run by tag
mvn test -Dtest.groups=smoke
mvn test -Dtest.groups="regression & !slow"

# Run specific test class
mvn test -Dtest=LoginTest

# Run with specific browser
mvn test -Dbrowser=firefox

# Generate Allure report
mvn allure:serve
```

*Examples from IDPF-QA-Automation Framework*
