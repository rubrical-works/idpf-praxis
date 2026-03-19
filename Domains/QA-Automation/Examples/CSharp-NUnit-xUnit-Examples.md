# C# Test Examples (NUnit/xUnit)
**Version:** v0.66.0

**Framework:** IDPF-QA-Automation

## Overview

This guide provides idiomatic C# patterns for QA automation testing using NUnit and xUnit with Playwright or Selenium. Examples follow .NET best practices including dependency injection, fixtures, and data-driven testing.

## Project Setup

### NuGet Packages

```xml
<!-- MyTests.csproj -->
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

  <ItemGroup>
    <!-- Choose one test framework -->
    <PackageReference Include="NUnit" Version="3.14.0" />
    <PackageReference Include="NUnit3TestAdapter" Version="4.5.0" />
    <!-- OR -->
    <PackageReference Include="xunit" Version="2.6.2" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.5.4" />

    <!-- Playwright -->
    <PackageReference Include="Microsoft.Playwright" Version="1.40.0" />
    <PackageReference Include="Microsoft.Playwright.NUnit" Version="1.40.0" />
    <!-- OR for xUnit -->
    <PackageReference Include="Microsoft.Playwright.Xunit" Version="1.40.0" />

    <!-- Assertions -->
    <PackageReference Include="FluentAssertions" Version="6.12.0" />

    <!-- Reporting -->
    <PackageReference Include="Allure.NUnit" Version="2.10.0" />
    <!-- OR -->
    <PackageReference Include="Allure.Xunit" Version="2.10.0" />

    <!-- Configuration -->
    <PackageReference Include="Microsoft.Extensions.Configuration" Version="8.0.0" />
    <PackageReference Include="Microsoft.Extensions.Configuration.Json" Version="8.0.0" />
    <PackageReference Include="Microsoft.Extensions.Configuration.EnvironmentVariables" Version="8.0.0" />

    <!-- Data Generation -->
    <PackageReference Include="Bogus" Version="34.0.2" />

    <!-- Coverage -->
    <PackageReference Include="coverlet.collector" Version="6.0.0" />
  </ItemGroup>

</Project>
```

## Configuration

### appsettings.json

```json
{
  "TestSettings": {
    "BaseUrl": "http://localhost:3000",
    "ApiUrl": "http://localhost:8080/api",
    "Browser": "chromium",
    "Headless": true,
    "Timeout": 30000
  },
  "TestUsers": {
    "Admin": {
      "Email": "admin@example.com",
      "Password": "AdminPass123!"
    },
    "Standard": {
      "Email": "user@example.com",
      "Password": "UserPass123!"
    }
  }
}
```

### Configuration Class

```csharp
// Configuration/TestSettings.cs
namespace MyTests.Configuration;

public class TestSettings
{
    public string BaseUrl { get; set; } = "http://localhost:3000";
    public string ApiUrl { get; set; } = "http://localhost:8080/api";
    public string Browser { get; set; } = "chromium";
    public bool Headless { get; set; } = true;
    public int Timeout { get; set; } = 30000;
}

public class TestUser
{
    public string Email { get; set; } = "";
    public string Password { get; set; } = "";
}

public class TestUsers
{
    public TestUser Admin { get; set; } = new();
    public TestUser Standard { get; set; } = new();
}
```

```csharp
// Configuration/ConfigurationManager.cs
using Microsoft.Extensions.Configuration;

namespace MyTests.Configuration;

public static class ConfigurationManager
{
    private static IConfiguration? _configuration;

    public static IConfiguration Configuration =>
        _configuration ??= new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json", optional: false)
            .AddJsonFile($"appsettings.{Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Development"}.json", optional: true)
            .AddEnvironmentVariables()
            .Build();

    public static TestSettings Settings
    {
        get
        {
            var settings = new TestSettings();
            Configuration.GetSection("TestSettings").Bind(settings);
            return settings;
        }
    }

    public static TestUsers Users
    {
        get
        {
            var users = new TestUsers();
            Configuration.GetSection("TestUsers").Bind(users);
            return users;
        }
    }
}
```

## NUnit Examples

### Base Test Class

```csharp
// Tests/BaseTest.cs
using Microsoft.Playwright;
using MyTests.Configuration;

namespace MyTests.Tests;

public abstract class BaseTest
{
    protected IPlaywright Playwright { get; private set; } = null!;
    protected IBrowser Browser { get; private set; } = null!;
    protected IBrowserContext Context { get; private set; } = null!;
    protected IPage Page { get; private set; } = null!;
    protected TestSettings Settings { get; } = ConfigurationManager.Settings;

    [OneTimeSetUp]
    public async Task OneTimeSetUp()
    {
        Playwright = await Microsoft.Playwright.Playwright.CreateAsync();
        Browser = await CreateBrowser();
    }

    [SetUp]
    public async Task SetUp()
    {
        Context = await Browser.NewContextAsync(new BrowserNewContextOptions
        {
            ViewportSize = new ViewportSize { Width = 1920, Height = 1080 }
        });
        Page = await Context.NewPageAsync();
    }

    [TearDown]
    public async Task TearDown()
    {
        // Capture screenshot on failure
        if (TestContext.CurrentContext.Result.Outcome.Status == NUnit.Framework.Interfaces.TestStatus.Failed)
        {
            var screenshot = await Page.ScreenshotAsync();
            TestContext.AddTestAttachment(SaveScreenshot(screenshot), "Failure Screenshot");
        }

        await Context.CloseAsync();
    }

    [OneTimeTearDown]
    public async Task OneTimeTearDown()
    {
        await Browser.CloseAsync();
        Playwright.Dispose();
    }

    private async Task<IBrowser> CreateBrowser()
    {
        var options = new BrowserTypeLaunchOptions
        {
            Headless = Settings.Headless
        };

        return Settings.Browser.ToLower() switch
        {
            "chromium" => await Playwright.Chromium.LaunchAsync(options),
            "firefox" => await Playwright.Firefox.LaunchAsync(options),
            "webkit" => await Playwright.Webkit.LaunchAsync(options),
            _ => throw new ArgumentException($"Unsupported browser: {Settings.Browser}")
        };
    }

    private string SaveScreenshot(byte[] screenshot)
    {
        var path = Path.Combine(TestContext.CurrentContext.WorkDirectory, "screenshots",
            $"{TestContext.CurrentContext.Test.Name}_{DateTime.Now:yyyyMMdd_HHmmss}.png");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllBytes(path, screenshot);
        return path;
    }
}
```

### Page Objects

```csharp
// Pages/BasePage.cs
using Microsoft.Playwright;
using MyTests.Configuration;

namespace MyTests.Pages;

public abstract class BasePage
{
    protected readonly IPage Page;
    protected readonly string BaseUrl;

    protected BasePage(IPage page)
    {
        Page = page;
        BaseUrl = ConfigurationManager.Settings.BaseUrl;
    }

    protected abstract string Path { get; }

    public async Task NavigateAsync()
    {
        await Page.GotoAsync($"{BaseUrl}{Path}");
        await WaitForLoadAsync();
    }

    protected virtual async Task WaitForLoadAsync()
    {
        await Page.WaitForLoadStateAsync(LoadState.NetworkIdle);
    }

    public async Task<string> GetTitleAsync() => await Page.TitleAsync();
}
```

```csharp
// Pages/LoginPage.cs
using Microsoft.Playwright;

namespace MyTests.Pages;

public class LoginPage : BasePage
{
    protected override string Path => "/login";

    // Locators
    private ILocator EmailInput => Page.Locator("[data-testid='email-input']");
    private ILocator PasswordInput => Page.Locator("[data-testid='password-input']");
    private ILocator LoginButton => Page.Locator("[data-testid='login-button']");
    private ILocator ErrorMessage => Page.Locator("[data-testid='error-message']");

    public LoginPage(IPage page) : base(page) { }

    // Actions
    public async Task EnterEmailAsync(string email) =>
        await EmailInput.FillAsync(email);

    public async Task EnterPasswordAsync(string password) =>
        await PasswordInput.FillAsync(password);

    public async Task ClickLoginAsync() =>
        await LoginButton.ClickAsync();

    public async Task LoginAsync(string email, string password)
    {
        await EnterEmailAsync(email);
        await EnterPasswordAsync(password);
        await ClickLoginAsync();
    }

    // Queries
    public async Task<string> GetErrorMessageAsync() =>
        await ErrorMessage.InnerTextAsync();

    public async Task<bool> IsErrorVisibleAsync() =>
        await ErrorMessage.IsVisibleAsync();
}
```

### NUnit Tests

```csharp
// Tests/LoginTests.cs
using FluentAssertions;
using MyTests.Configuration;
using MyTests.Pages;

namespace MyTests.Tests;

[TestFixture]
[Category("Smoke")]
[Parallelizable(ParallelScope.Self)]
public class LoginTests : BaseTest
{
    private LoginPage _loginPage = null!;

    [SetUp]
    public new async Task SetUp()
    {
        await base.SetUp();
        _loginPage = new LoginPage(Page);
        await _loginPage.NavigateAsync();
    }

    [Test]
    [Description("Verify login page loads correctly")]
    public async Task LoginPage_ShouldDisplayForm()
    {
        var title = await _loginPage.GetTitleAsync();
        title.Should().Contain("Login");
    }

    [Test]
    [Description("Verify successful login with valid credentials")]
    public async Task Login_WithValidCredentials_ShouldRedirectToDashboard()
    {
        var user = ConfigurationManager.Users.Standard;

        await _loginPage.LoginAsync(user.Email, user.Password);

        Page.Url.Should().Contain("/dashboard");
    }

    [Test]
    [Description("Verify error message for invalid credentials")]
    public async Task Login_WithInvalidCredentials_ShouldShowError()
    {
        await _loginPage.LoginAsync("invalid@example.com", "wrongpassword");

        var isErrorVisible = await _loginPage.IsErrorVisibleAsync();
        var errorMessage = await _loginPage.GetErrorMessageAsync();

        isErrorVisible.Should().BeTrue();
        errorMessage.Should().ContainEquivalentOf("invalid credentials");
    }
}
```

### NUnit Parameterized Tests

```csharp
// Tests/LoginValidationTests.cs
using FluentAssertions;
using MyTests.Pages;

namespace MyTests.Tests;

[TestFixture]
[Category("Regression")]
public class LoginValidationTests : BaseTest
{
    private LoginPage _loginPage = null!;

    [SetUp]
    public new async Task SetUp()
    {
        await base.SetUp();
        _loginPage = new LoginPage(Page);
        await _loginPage.NavigateAsync();
    }

    [TestCase("", "Email is required")]
    [TestCase("notanemail", "Invalid email")]
    [TestCase("missing@domain", "Invalid email")]
    [Description("Verify email validation messages")]
    public async Task Login_WithInvalidEmail_ShouldShowValidationError(
        string email, string expectedError)
    {
        await _loginPage.LoginAsync(email, "ValidPassword123!");

        var errorMessage = await _loginPage.GetErrorMessageAsync();
        errorMessage.Should().Contain(expectedError);
    }

    [TestCase("", "Password is required")]
    [TestCase("short", "at least 8 characters")]
    [Description("Verify password validation messages")]
    public async Task Login_WithInvalidPassword_ShouldShowValidationError(
        string password, string expectedError)
    {
        await _loginPage.LoginAsync("valid@example.com", password);

        var errorMessage = await _loginPage.GetErrorMessageAsync();
        errorMessage.ToLower().Should().Contain(expectedError.ToLower());
    }

    [TestCaseSource(nameof(LoginScenarios))]
    [Description("Verify various login scenarios")]
    public async Task Login_WithVariousInputs_ShouldHandleCorrectly(
        string email, string password, bool shouldSucceed)
    {
        await _loginPage.LoginAsync(email, password);

        if (shouldSucceed)
        {
            Page.Url.Should().Contain("/dashboard");
        }
        else
        {
            var isErrorVisible = await _loginPage.IsErrorVisibleAsync();
            isErrorVisible.Should().BeTrue();
        }
    }

    private static IEnumerable<TestCaseData> LoginScenarios()
    {
        yield return new TestCaseData("valid@example.com", "ValidPass123!", true)
            .SetName("Valid credentials");
        yield return new TestCaseData("invalid@example.com", "WrongPass!", false)
            .SetName("Invalid credentials");
        yield return new TestCaseData("", "ValidPass123!", false)
            .SetName("Empty email");
    }
}
```

## xUnit Examples

### xUnit Fixtures

```csharp
// Fixtures/PlaywrightFixture.cs
using Microsoft.Playwright;

namespace MyTests.Fixtures;

public class PlaywrightFixture : IAsyncLifetime
{
    public IPlaywright Playwright { get; private set; } = null!;
    public IBrowser Browser { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        Playwright = await Microsoft.Playwright.Playwright.CreateAsync();
        Browser = await Playwright.Chromium.LaunchAsync(new BrowserTypeLaunchOptions
        {
            Headless = true
        });
    }

    public async Task DisposeAsync()
    {
        await Browser.CloseAsync();
        Playwright.Dispose();
    }
}
```

```csharp
// Fixtures/PageFixture.cs
using Microsoft.Playwright;

namespace MyTests.Fixtures;

public class PageFixture : IAsyncLifetime
{
    private readonly PlaywrightFixture _playwrightFixture;
    public IPage Page { get; private set; } = null!;
    public IBrowserContext Context { get; private set; } = null!;

    public PageFixture(PlaywrightFixture playwrightFixture)
    {
        _playwrightFixture = playwrightFixture;
    }

    public async Task InitializeAsync()
    {
        Context = await _playwrightFixture.Browser.NewContextAsync();
        Page = await Context.NewPageAsync();
    }

    public async Task DisposeAsync()
    {
        await Context.CloseAsync();
    }
}
```

### xUnit Tests

```csharp
// Tests/xUnit/LoginTests.cs
using FluentAssertions;
using MyTests.Configuration;
using MyTests.Fixtures;
using MyTests.Pages;
using Xunit;

namespace MyTests.Tests.xUnit;

[Collection("Playwright")]
public class LoginTests : IClassFixture<PlaywrightFixture>, IAsyncLifetime
{
    private readonly PlaywrightFixture _fixture;
    private IBrowserContext _context = null!;
    private IPage _page = null!;
    private LoginPage _loginPage = null!;

    public LoginTests(PlaywrightFixture fixture)
    {
        _fixture = fixture;
    }

    public async Task InitializeAsync()
    {
        _context = await _fixture.Browser.NewContextAsync();
        _page = await _context.NewPageAsync();
        _loginPage = new LoginPage(_page);
        await _loginPage.NavigateAsync();
    }

    public async Task DisposeAsync()
    {
        await _context.CloseAsync();
    }

    [Fact]
    [Trait("Category", "Smoke")]
    public async Task LoginPage_ShouldDisplayForm()
    {
        var title = await _loginPage.GetTitleAsync();
        title.Should().Contain("Login");
    }

    [Fact]
    [Trait("Category", "Smoke")]
    public async Task Login_WithValidCredentials_ShouldSucceed()
    {
        var user = ConfigurationManager.Users.Standard;

        await _loginPage.LoginAsync(user.Email, user.Password);

        _page.Url.Should().Contain("/dashboard");
    }

    [Fact]
    [Trait("Category", "Smoke")]
    public async Task Login_WithInvalidCredentials_ShouldFail()
    {
        await _loginPage.LoginAsync("invalid@example.com", "wrongpassword");

        var isErrorVisible = await _loginPage.IsErrorVisibleAsync();
        isErrorVisible.Should().BeTrue();
    }
}
```

### xUnit Theory (Parameterized Tests)

```csharp
// Tests/xUnit/LoginValidationTests.cs
using FluentAssertions;
using MyTests.Fixtures;
using MyTests.Pages;
using Xunit;

namespace MyTests.Tests.xUnit;

[Collection("Playwright")]
public class LoginValidationTests : IClassFixture<PlaywrightFixture>, IAsyncLifetime
{
    private readonly PlaywrightFixture _fixture;
    private IBrowserContext _context = null!;
    private IPage _page = null!;
    private LoginPage _loginPage = null!;

    public LoginValidationTests(PlaywrightFixture fixture)
    {
        _fixture = fixture;
    }

    public async Task InitializeAsync()
    {
        _context = await _fixture.Browser.NewContextAsync();
        _page = await _context.NewPageAsync();
        _loginPage = new LoginPage(_page);
        await _loginPage.NavigateAsync();
    }

    public async Task DisposeAsync()
    {
        await _context.CloseAsync();
    }

    [Theory]
    [InlineData("", "Email is required")]
    [InlineData("notanemail", "Invalid email")]
    [Trait("Category", "Regression")]
    public async Task Login_WithInvalidEmail_ShouldShowError(
        string email, string expectedError)
    {
        await _loginPage.LoginAsync(email, "ValidPassword123!");

        var errorMessage = await _loginPage.GetErrorMessageAsync();
        errorMessage.Should().Contain(expectedError);
    }

    [Theory]
    [MemberData(nameof(LoginScenarioData))]
    [Trait("Category", "Regression")]
    public async Task Login_WithVariousInputs_ShouldHandleCorrectly(
        string email, string password, bool shouldSucceed)
    {
        await _loginPage.LoginAsync(email, password);

        if (shouldSucceed)
        {
            _page.Url.Should().Contain("/dashboard");
        }
        else
        {
            var isErrorVisible = await _loginPage.IsErrorVisibleAsync();
            isErrorVisible.Should().BeTrue();
        }
    }

    public static IEnumerable<object[]> LoginScenarioData =>
        new List<object[]>
        {
            new object[] { "valid@example.com", "ValidPass123!", true },
            new object[] { "invalid@example.com", "WrongPass!", false },
            new object[] { "", "ValidPass123!", false }
        };

    [Theory]
    [ClassData(typeof(UserRoleTestData))]
    [Trait("Category", "Regression")]
    public async Task Login_ShouldRedirectBasedOnRole(
        string email, string password, string expectedRedirect)
    {
        await _loginPage.LoginAsync(email, password);

        _page.Url.Should().Contain(expectedRedirect);
    }
}

public class UserRoleTestData : IEnumerable<object[]>
{
    public IEnumerator<object[]> GetEnumerator()
    {
        yield return new object[] { "admin@example.com", "AdminPass!", "/admin" };
        yield return new object[] { "user@example.com", "UserPass!", "/dashboard" };
    }

    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
}
```

## Data Generation with Bogus

```csharp
// Factories/UserFactory.cs
using Bogus;

namespace MyTests.Factories;

public record TestUserData(
    string Email,
    string Password,
    string FirstName,
    string LastName
);

public static class UserFactory
{
    private static readonly Faker<TestUserData> Faker = new Faker<TestUserData>()
        .CustomInstantiator(f => new TestUserData(
            f.Internet.Email(),
            f.Internet.Password(8, false, "", "!Aa1"),
            f.Name.FirstName(),
            f.Name.LastName()
        ));

    public static TestUserData Create() => Faker.Generate();

    public static TestUserData CreateAdmin() =>
        Create() with { Email = $"admin_{Guid.NewGuid():N}@example.com" };

    public static IEnumerable<TestUserData> CreateMany(int count) =>
        Faker.Generate(count);
}
```

## Running Tests

```bash
# NUnit
dotnet test --filter Category=Smoke
dotnet test --filter "Category=Regression & Category!=Slow"

# xUnit
dotnet test --filter "Category=Smoke"
dotnet test --filter "FullyQualifiedName~LoginTests"

# With coverage
dotnet test --collect:"XPlat Code Coverage"

# Parallel execution (NUnit - configure in assembly)
# xUnit runs parallel by default
```

*Examples from IDPF-QA-Automation Framework*
