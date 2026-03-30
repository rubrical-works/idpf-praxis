# Framework-to-Skill Lifecycle

**Date:** 2026-03-10
**Topic:** How IDPF testing frameworks activate across the development lifecycle — from issue review to testing infrastructure
**Status:** Preliminary — describes the intended architecture. The scaffolding skill (`test-scaffold`) is not yet implemented. See Proposal #1763.

---

## The Problem

IDPF ships 6 testing-oriented frameworks in every hub installation:

| Framework | Domain |
|-----------|--------|
| IDPF-Accessibility | WCAG compliance, assistive technology testing |
| IDPF-Chaos | Resilience, failure injection, GameDay exercises |
| IDPF-Contract-Testing | Consumer/provider API contracts |
| IDPF-Performance | Load testing, SLA/SLO validation |
| IDPF-QA-Automation | End-to-end, visual regression, cross-browser testing |
| IDPF-Security | SAST, DAST, SCA, secret scanning |

Each framework is **passive knowledge** — methodology, checklists, tool guides, CI templates, and severity classifications. They tell you what to do and how to organize it, but they don't do anything on their own.

The question is: how does that knowledge reach the developer at the right moment?

---

## Three Activation Points

IDPF uses **active delivery mechanisms** to inject framework knowledge at specific lifecycle stages. Each testing framework currently has one (review extensions); the proposed `test-scaffold` skill would add a second; and the frameworks themselves guide a third — manual testing that automation can't replace.

```
Issue Created       Code Written        Tests Running        Pre-Release
     │                   │                    │                    │
     ▼                   ▼                    ▼                    ▼
┌────────────┐    ┌────────────┐    ┌─────────────────┐    ┌────────────────┐
│ --with flag│    │test-scaffold    │ External Tools  │    │ Manual Testing │
│ (review    │    │ skill      │    │ (axe, k6,       │    │ (pen test,     │
│  extension)│    │ (proposed) │    │  Semgrep, Pact) │    │  screen reader,│
└─────┬──────┘    └─────┬──────┘    └───────┬─────────┘    │  keyboard nav) │
      │                 │                   │              └───────┬────────┘
      ▼                 ▼                   ▼                     ▼
 "Does this        "Set up the        "Run the actual      "Can a human
  issue address     tool configs,      scans and tests"     break what the
  testing           test specs,                             automated tools
  requirements?"    and CI workflows"                       approved?"
```

### Activation Point 1: Issue Review (`--with` flag)

**When:** Before implementation — during issue definition and review.

**How:** The `/review-issue`, `/review-proposal`, and `/review-prd` commands accept a `--with` flag that loads domain-specific review criteria from IDPF testing frameworks.

```
/review-issue #42 --with security,accessibility
/review-issue #42 --with all
```

**What it does:** Evaluates the issue definition through a domain-specific lens. For example, `--with security` checks whether the issue mentions:
- Authentication/authorization requirements
- Input validation criteria
- OWASP-relevant threat considerations
- Security testing acceptance criteria

**What it produces:** A review comment with domain-specific findings:
```
### Security Review (IDPF-Security)
- ⚠️ No input validation criteria for user-submitted data
- ❌ Authentication requirements not specified
- ✅ API endpoints documented
```

**Source:** Each domain's review criteria lives in `Domains/review-criteria/{domain}.md`, registered in `.claude/metadata/review-extensions.json`.

**Purpose:** Catch missing testing requirements before code is written. A planning quality gate.

### Activation Point 2: Testing Scaffold (proposed skill)

> **Not yet implemented.** See Proposal #1763 — Testing Scaffold Skill Family.

**When:** After requirements are defined — when the developer is ready to set up testing infrastructure.

**How:** The `test-scaffold` skill detects the project context and generates ready-to-run testing configurations.

```
"scaffold security testing"
"scaffold accessibility and performance testing"
"scaffold all testing"
```

**What it does:** Reads the project structure (framework, package manager, routes, existing test setup) and generates:
- Tool configuration files (e.g., `.semgrep.yml`, `axe.config.js`, `k6` scripts)
- Test specs (e.g., Playwright + axe-core integration tests, Pact consumer specs)
- CI/CD workflows (e.g., GitHub Actions jobs for SAST, DAST, a11y scanning)
- Test plans pre-filled from IDPF framework templates

**What it produces:** Concrete artifacts in the project, configured for the actual codebase.

**Source:** Each domain's scaffolding templates draw from the corresponding IDPF framework's tool guides, CI templates, and directory structure examples.

**Purpose:** Eliminate the manual setup burden between "I have the methodology" and "I'm running tests."

### Activation Point 3: Manual Testing Handoff

**When:** Pre-release — after automated tests are running but before shipping.

**How:** The scaffold skill's completion report identifies what automation covers and what still requires human expertise. Each domain has testing areas that tools can't reach:

| Domain | Manual Testing Areas | Framework Guidance |
|--------|---------------------|-------------------|
| **Security** | Penetration testing — auth bypass, business logic flaws, creative exploitation | IDPF-Security: pen test plan template, threat modeling guide, OWASP Top 10 test cases |
| **Accessibility** | Screen reader navigation, keyboard flow, cognitive assessment | IDPF-Accessibility: Screen Reader Testing Guide, Keyboard Navigation Testing Guide |
| **Chaos** | GameDay exercises — coordinated failure injection with human observers | IDPF-Chaos: GameDay process, blast radius controls, rollback runbooks |
| **QA Automation** | Exploratory testing, visual review, edge-case user flows | IDPF-QA-Automation: flaky test triage, manual regression checklists |
| **Performance** | Capacity planning interpretation, SLA negotiation, bottleneck analysis | IDPF-Performance: baseline analysis methodology, reporting templates |
| **Contract** | Breaking change negotiation, provider state design decisions | IDPF-Contract-Testing: versioning strategy, coordination process |

**What the scaffold skill generates for this stage:**
- Pre-filled test plan sections for manual testing areas
- Penetration test plan scoped to the app's attack surface (from IDPF-Security templates)
- Keyboard and screen reader testing checklists (from IDPF-Accessibility templates)
- GameDay runbook templates (from IDPF-Chaos templates)

**What it can't generate:** The actual testing. Penetration testing requires creative exploitation by a skilled human. Screen reader testing requires hearing how content is announced. GameDay exercises require coordinated team participation. These are inherently human activities — the frameworks provide the methodology, the scaffold skill prepares the templates, but execution stays manual.

**Purpose:** Ensure the handoff from automated to manual testing is explicit, structured, and backed by framework methodology — not an afterthought.

---

## The Full Lifecycle

Here's how both activation points work together for a concrete example — adding a user registration form:

### 1. Issue Created

```
#42 — Add user registration form
- [ ] Email/password fields with validation
- [ ] Submit creates account via POST /api/register
- [ ] Redirect to dashboard on success
```

### 2. Issue Reviewed with Domain Extensions

```
/review-issue #42 --with security,accessibility
```

**Security findings:**
- ❌ No password strength requirements specified
- ❌ No rate limiting criteria for registration endpoint
- ⚠️ No mention of CSRF protection

**Accessibility findings:**
- ❌ No keyboard navigation criteria for form
- ❌ No screen reader requirements for validation errors
- ⚠️ No WCAG success criteria referenced (3.3.1, 3.3.2)

**Result:** Issue updated with missing acceptance criteria before any code is written.

### 3. Testing Infrastructure Scaffolded

```
"scaffold security and accessibility testing"
```

**Generated artifacts:**
- `tests/a11y/registration.spec.ts` — axe-core scan of `/register` route
- `.semgrep.yml` — SAST rules covering auth patterns, input validation
- `.gitleaks.toml` — secret scanning config
- `.github/workflows/testing.yml` — CI jobs for axe-scan + SAST + secret-scan
- `axe.config.js` — WCAG AA targeting

### 4. Code Written and Tests Run

Developer builds the form. CI runs the scaffolded tests automatically:
- axe-core catches a missing form label → fix before merge
- Semgrep flags unsanitized input in the registration handler → fix before merge
- Gitleaks confirms no secrets committed

### 5. Manual Testing Handoff

The scaffolding skill's report identifies what automation covered and what still requires human expertise:

**Automated (running in CI):**
- ✅ axe-core scans for WCAG AA violations on `/register`
- ✅ Semgrep SAST checks for input validation, auth patterns
- ✅ Gitleaks secret scanning

**Manual handoff — requires human testing:**
- 🔒 **Penetration testing** — auth bypass attempts, CSRF exploitation, rate limit verification (per IDPF-Security methodology). Pre-filled pen test plan generated.
- ♿ **Screen reader testing** — form navigation with NVDA/VoiceOver, error announcement behavior (per IDPF-Accessibility Screen Reader Testing Guide)
- ⌨️ **Keyboard testing** — tab order through form fields, focus management on validation errors (per IDPF-Accessibility Keyboard Navigation Testing Guide)

---

## Why All Three Are Needed

Each activation point covers a different failure mode. No two can substitute for the third:

| Failure Mode | What Catches It | Example |
|-------------|----------------|---------|
| **Missing requirements** | `--with` review extension | Issue doesn't mention CSRF protection |
| **Missing infrastructure** | Scaffold skill | No Semgrep config or CI workflow exists |
| **Missing human judgment** | Manual testing handoff | Automated scans pass but auth can be bypassed via business logic flaw |

The three activation points form a progression:

| Stage | Question | Failure Cost |
|-------|----------|-------------|
| Issue review | "Did we think about this?" | Low — just update the issue |
| Scaffold + CI | "Are we checking for this automatically?" | Medium — fix code before merge |
| Manual testing | "Can a skilled human break this?" | High — last line before production |

- A project can pass `--with security` review (good criteria) and have Semgrep running in CI (good infrastructure), but still ship an auth bypass that only a penetration tester would find.
- A project can have thorough pen testing but miss basic SAST findings because nobody set up automated scanning — human testers shouldn't be catching what tools detect trivially.
- A project can have full automation and manual testing but create issues that never mention security requirements — the gap lives in planning, not execution.

Each activation point catches what the others miss. Automated testing is thorough but shallow (pattern matching). Manual testing is deep but expensive (human time). Issue review is cheap but only as good as the criteria defined.

---

## Architecture Summary

```
IDPF Testing Frameworks (passive knowledge)
├── IDPF-Accessibility
├── IDPF-Chaos
├── IDPF-Contract-Testing
├── IDPF-Performance
├── IDPF-QA-Automation
└── IDPF-Security
        │                    │                       │
        ▼                    ▼                       ▼
  Review Extensions     Scaffold Skill         Manual Handoff
  (--with flag)         (test-scaffold)        (templates + guides)
        │                    │                       │
        ▼                    ▼                       ▼
  Issue Review          Tool Configs            Pen Test Plans
  Questions             Test Specs              Screen Reader Checklists
                        CI Workflows            GameDay Runbooks
                        Test Plans              Manual Test Checklists
        │                    │                       │
        ▼                    ▼                       ▼
   Planning Gate        Automated Gate          Human Gate
   (pre-implementation) (CI/CD)                 (pre-release)
```

All three delivery mechanisms draw from the same IDPF frameworks. The review extensions extract review criteria. The scaffold skill extracts tool configurations and CI templates. The manual handoff extracts testing guides, checklists, and plan templates. The frameworks themselves remain pure methodology — they never execute anything directly.

The progression narrows the risk surface at each stage: planning catches requirement gaps early (cheap to fix), automation catches code-level issues continuously (medium cost), and human testing catches what tools can't see (expensive but irreplaceable).

---

## Related

- **Proposal #1763** — Testing Scaffold Skill Family (the `test-scaffold` skill described here)
- **Proposal #1761** — Graceful Degradation Assessment Skill (a standalone assessment skill — different pattern, not scaffolding)
- `Docs/02-Advanced/Hub-and-Project-Architecture.md` — how the hub delivers frameworks to projects
- `.claude/metadata/review-extensions.json` — registry of `--with` domain extensions

---

**End of Document**
