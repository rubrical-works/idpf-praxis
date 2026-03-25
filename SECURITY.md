# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest release | Yes |
| Previous minor release | Security fixes only |
| Older versions | No |

We recommend always using the latest release. Security fixes are backpatched to the previous minor release on a best-effort basis.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in this project, please report it responsibly:

1. **GitHub Private Reporting (Preferred):** Use [GitHub's private vulnerability reporting](https://github.com/rubrical-works/idpf-praxis/security/advisories/new) to submit a report directly through the repository.

2. **Email:** Send details to **security@rubrical.works** with the subject line `[SECURITY] idpf-praxis — <brief description>`.

### What to Include

- Description of the vulnerability
- Steps to reproduce or proof of concept
- Affected versions (if known)
- Potential impact assessment
- Suggested fix (if any)

### Response Timeline

| Stage | Target |
|-------|--------|
| Acknowledgment | Within 48 hours |
| Initial assessment | Within 5 business days |
| Fix or mitigation | Depends on severity (see below) |

### Severity-Based Fix Targets

| Severity | Target Resolution |
|----------|-------------------|
| Critical | 48 hours |
| High | 7 days |
| Medium | 30 days |
| Low | Next scheduled release |

## Scope

This policy covers the IDPF framework ecosystem including:

- Framework files (IDPF-Agile, IDPF-Vibe, and related frameworks)
- Slash command specifications and templates
- JavaScript/Node.js scripts (installers, utilities, CI helpers)
- GitHub Actions workflows
- Skill packages
- System instruction templates

### Out of Scope

- Vulnerabilities in third-party dependencies (report to the upstream project; we will update promptly)
- Issues in user-generated content or project-level customizations
- Claude Code or Anthropic platform vulnerabilities (report to [Anthropic](https://www.anthropic.com/responsible-disclosure))
- The `gh-pmu` CLI extension (report to the [gh-pmu repository](https://github.com/rubrical-works/gh-pmu))

## Security Measures

### What We Do

- **Dependency scanning** via Dependabot with automated pull requests
- **Secret detection** to prevent credential leaks in commits
- **Static analysis** on JavaScript/Node.js code
- **Code review** required for all changes merged to main
- **Signed releases** with tagged versions

### What Users Should Do

- Keep your IDPF installation updated to the latest release
- Review slash commands and scripts before granting elevated permissions
- Do not commit secrets, API keys, or credentials to repositories using IDPF
- Report suspicious behavior in framework scripts promptly

## Disclosure Policy

We follow coordinated disclosure:

1. Reporter submits vulnerability privately
2. We acknowledge and assess the report
3. We develop and test a fix
4. We release the fix and publish a security advisory
5. Reporter is credited (unless they prefer anonymity)

We will not pursue legal action against researchers who follow this policy and report in good faith.

## Contact

- **Security reports:** security@rubrical.works
- **General questions:** Open a [discussion](https://github.com/rubrical-works/idpf-praxis/discussions)
