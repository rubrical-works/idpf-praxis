---
version: "v0.101.0"
description: Evaluate tests for charter alignment and functional authenticity (project)
argument-hint: "[--full] [--status]"
copyright: "Rubrical Works (c) 2026"
---
<!-- MANAGED -->
# /bad-test-review
Evaluate every unit and e2e test to determine whether the code causing each test to pass meets `/charter` expectations and project requirements, or whether it merely returns what is required to pass without genuine functional correctness.
## Prerequisites
- `CHARTER.md` exists (run `/charter` if missing)
- Test files exist
## Arguments
| Argument | Required | Description |
|----------|----------|-------------|
| *(none)* | | Normal incremental — skip approved+unchanged tests |
| `--full` | No | Bypass manifest and review all tests |
| `--status` | No | Report manifest statistics without running review |
## Execution Instructions
**REQUIRED:**
1. **Create Task List:** Parse the workflow steps in this spec, then use `TaskCreate` to create tasks so progress is visible and resumable after compaction
2. **Track Progress:** Mark tasks `in_progress` → `completed`
3. **Post-Compaction:** Re-read this spec and call `TaskList` to resume from first incomplete task
## Workflow
### Step 1: Parse Arguments
**If `--status`:** Jump to Step 2b, then **STOP**.
**If `--full`:** Set `fullMode = true` (skip manifest filter in Step 4).
**Otherwise:** Normal incremental mode.
### Step 2: Load Manifest
Read `.bad-test-manifest.json` if it exists.
**If manifest exists:**
1. Parse JSON
2. Extract `charter.contentHash`
3. Compute current `CHARTER.md` SHA-256
4. **If charter hash differs** — set `charterChanged = true`. Triggers full re-evaluation because alignment criteria shifted.
5. Report: `Charter changed since last review — all tests will be re-evaluated.`
**If no manifest:**
1. Report: `No manifest found. First run — all tests will be reviewed.`
2. Create empty manifest in memory
### Step 2b: Manifest Statistics (`--status` only)
```
Bad Test Review Manifest:
  Last run: YYYY-MM-DD
  Tests tracked: N total
    Approved: A
    Flagged: F (with open issues)
  Charter hash: sha256:abc123...
  New tests (unreviewed): K
```
Count new tests by scanning files and comparing against manifest.
-> **STOP**.
### Step 3: Discover Test Files
```
Patterns: tests/, *.test.js, *.test.ts, *.spec.js, *.spec.ts, __tests__/
```
Use Glob. Exclude: `node_modules/`, build output, third-party tests, generated helpers.
Report: `Discovered N test files across M directories.`
### Step 3b: Inventory Source Files
Steps 3-6b all key off a discovered **test** file, so a source with no test produces nothing to discover and no finding. This step enumerates the other side of the pairing.
Resolve the source set exactly as `/code-review` Step 3 does, so the two commands cannot disagree about what counts as source:
1. `detectTechStack()` from `.claude/scripts/shared/lib/detect-tech-stack.js` — detected language identifiers.
2. `getGlobPatternsForTechs()` from the same module — include patterns.
3. Subtract directories in `.claude/metadata/code-review-excludes.json` (honour each category's `env`).
4. Subtract files already discovered as tests in Step 3 — here a test is not a source.
5. Subtract `ignoredSourcePatterns` from the Step 6c conventions file.
Report: `Source inventory: N files across M directories (T excluded).`
**`detectTechStack()` returns languages, NOT test runners.** Its `HEURISTICS` map eight root manifests to `node`, `python`, `go`, `rust`, `java`, `ruby`; nothing detects Playwright, Cypress or any e2e harness. Do **NOT** use it for the Step 6c e2e gate — that gate has its own resolution.
**No technology detected — report and skip the coverage-gap pass.** NEVER fall back to a hardcoded pattern list: an invented default is wrong for whichever ecosystem it omits, and a wrong guess reports a whole codebase as untested. State that the pass did not run and why, so a skip is never mistaken for a clean result.
### Step 4: Filter by Manifest
**If `--full` or `charterChanged`:** Skip filtering — evaluate all.
**Otherwise:** Compute SHA-256 per file and check manifest:
| Condition | Action |
|-----------|--------|
| Not in manifest | New — queue for evaluation |
| Hash matches, `approved` | Skip |
| Hash matches, `flagged` | Skip — has open bug issues |
| Hash **differs** | Re-examine — content changed |
| In manifest but deleted | Remove from manifest |
Report:
```
Manifest filter:
  New tests: N (queued)
  Changed tests: M (queued)
  Approved (skipped): A
  Flagged (skipped): F
```
### Step 5: Load Charter
Read `CHARTER.md` and extract: project goals, technology stack/conventions, quality standards, testing expectations.
### Step 6: Evaluate Each Test
#### 6a: Charter Alignment
- Read test file, identify what each test case validates
- Cross-reference against charter goals/conventions
- **Aligned:** Validates documented requirement
- **Unaligned:** Doesn't map to charter (informational)
#### 6b: Functional Authenticity
Does the implementation genuinely implement the feature, or return hardcoded/minimal values to satisfy the assertion?
**Detection heuristics:**
| Heuristic | Description | Severity |
|-----------|-------------|----------|
| **Hardcoded return** | Return value exactly matches test assertion constant | High |
| **No branching** | Always returns same value regardless of input | Medium |
| **Single-input coverage** | Only handles exact test inputs | Medium |
| **Narrow assertions** | Overly narrow, not covering realistic scenarios | Low |
| **Mock-only validation** | Mock replaces all meaningful behavior | High |
| **Same-commit pattern** | Implementation added in same commit, no other callers | Low |
For each suspicious pattern:
1. Read the implementation referenced by the test
2. Analyze whether implementation genuinely handles tested behavior
3. Record: test file, test name, concern type, severity, evidence
#### 6c: Coverage-Gap Pass
6a and 6b ask whether an existing test is aligned and honest. This asks what neither can reach: does this source have a test at all? For each file in the Step 3b inventory, pair it against the Step 3 test set.
**Pairing rules are NOT defined here.** They live in `resources/test-coverage-conventions.json` in the installed `tdd-refactor-coverage-audit` skill — source extensions mapped to test-path templates for ten languages, plus the shared `ignoredSourcePatterns`. Read that file and apply it as written.
**Do NOT define a second set of pairing rules.** `/work` Step 6a consumes the same conventions file, so a second definition drifts from it silently — no test fails when two documents disagree. Project overrides belong in `framework-config.json` under `testCoverageAudit`, per that file's `_meta`, not in this spec.
**Conventions file absent — report and skip:** `Skipped coverage-gap pass: tdd-refactor-coverage-audit conventions not installed.` Continue to Step 7. NEVER substitute an inline pairing table: that is the second definition this section exists to prevent.
**Finding categories** — two, never one:
| Category | Key | Description | Severity |
|----------|-----|-------------|----------|
| **Missing unit test** | `missing-unit-test` | Source in the Step 3b inventory with no paired unit test | High |
| **Missing e2e test** | `missing-e2e-test` | Source with no paired e2e test, **in a project that declares an e2e runner** | Medium |
**Why the severities differ.** Not two grades of one problem. A source with no unit test at all is precisely what 6a and 6b are structurally unable to find — the same **High** carried by `Hardcoded return` and `Mock-only validation`. A missing e2e test on an already unit-tested module is a journey-coverage gap, usually remedied by one harness-level test. Collapsing both would flatten a triage order the remedies genuinely differ on.
**Resolving the e2e runner declaration.** `detectTechStack()` cannot answer this (Step 3b). Resolve in order, stopping at the first that answers:
1. **`CHARTER.md`**, already loaded at Step 5 — its technology-stack and testing-expectations sections are the project's own declaration. Authoritative.
2. **The dependency manifest**, corroboration only when the charter is silent — for example `@playwright/test`, `cypress`, `@wdio/cli`, `nightwatch`, `testcafe` (Node); `pytest-playwright`, `selenium` (Python); `capybara` (Ruby).
**No e2e runner declared — emit one notice, not per-file findings:** `No e2e runner declared in CHARTER.md or the dependency manifest — e2e coverage gaps not evaluated.`
Suppress every `missing-e2e-test` finding. Reporting N sources as missing e2e on a project with no e2e layer is noise proportional to codebase size and buries the `missing-unit-test` findings that are actionable. Emitted **once per run** — never per-file.
`missing-unit-test` is **NOT** gated this way: Step 3 discovered a unit-test layer by construction, so an absent unit test is always a real finding.
**Accessibility domain active with no e2e runner — capped-review notice.** When `framework-config.json` `activeDomains` includes `accessibility` **and** no e2e runner resolved, emit this in addition to the one-notice line:
```
Accessibility review is capped at static source inspection: no e2e runner is
declared, so no rendered DOM is available. axe-core requires a rendered page,
and every accessibility example in Domains/Accessibility/ (ARIA Authoring,
Screen-Reader Testing, VPAT Generation) reaches it through @axe-core/playwright.
The accessibility domain's own guidance is unreachable in this project.
```
**Distinct from both** neighbours; do NOT collapse into either:
- **Not a clean result.** Clean means the review looked and found nothing; this means it structurally could not look. Clean here is false assurance about the one domain whose evidence lives in the rendered page.
- **Not one of the suppressed per-file `missing-e2e-test` findings.** Those are suppressed *because* no e2e layer was declared; this says that same absence carries a second, larger consequence the suppression would otherwise hide.
Emitted once per run; absent when no accessibility domain is active.
**Coverage-gap findings are advisory — they do not block.** Reported, issued under Step 8, recorded in the manifest; a run carrying gaps and no 6a/6b findings still completes normally.
Advisory because the alternative fails worst where it matters most: a first adoption can carry hundreds of unpaired sources through no fault of the change in hand, and a blocking pass would fail on arrival and be switched off, taking the 6a and 6b findings with it. `/work` Step 6a is advisory for the same reason at narrower scope.
**Advisory is not silent.** Steps 7 and 8b state gap counts every run, **including when zero**. A pass that prints nothing when it finds nothing is indistinguishable from one that never ran — the failure this command exists to remove. Where the pass was skipped (no tech at 3b, conventions absent at 6c) report the skip and its reason, NEVER a zero: those are different claims.
### Step 7: Generate Structured Report
```
## Bad Test Review Report

**Date:** YYYY-MM-DD
**Tests reviewed:** N
**Findings:** M

### High Severity
| Test File | Test Name | Concern | Evidence |
|-----------|-----------|---------|----------|
| tests/foo.test.js | "returns correct value" | Hardcoded return | `getValue()` returns `42`, test asserts `42` |

### Medium Severity
...

### Low Severity
...

### Coverage Gaps
| Source File | Category | Severity | Evidence |
|-------------|----------|----------|----------|
| src/pricing.js | missing-unit-test | High | No paired unit test under any javascript convention |
| src/checkout.js | missing-e2e-test | Medium | Unit-tested; no e2e spec pairs to this source |

### Summary
- High: N findings
- Medium: M findings
- Low: K findings
- Clean: C tests (no concerns)
- Coverage gaps: U missing unit tests, E missing e2e tests
- Source files inventoried: S (Step 3b)
```
### Step 8: Create Bug Issues
For each finding or group of related findings, create a bug to track the fix.
Each bug must reference test file, concern type, evidence:
```markdown
## Bug: Hollow Test — [test name]

**Test File:** `tests/path/to/file.test.js`
**Concern Type:** [Hardcoded return | No branching | etc.]
**Severity:** [High | Medium | Low]

**Evidence:**
[What was found]

**Test Code:**
```js
[relevant snippet]
```

**Implementation Code:**
```js
[relevant snippet]
```

**Recommendation:**
[What should change to make this test meaningful]
```
Group related findings (same file, same root cause) into a single bug.
Report:
```
Created N bug issues:
  #NNN: Hollow test — [description]
  #MMM: Narrow assertions — [description]
```
### Step 8b: Save Report
Write **after** issue creation so issue numbers are available:
`Construction/Code-Reviews/YYYY-MM-DD-bad-test-report.md`
Create directory if missing.
```markdown
# Bad Test Review Report

**Date:** YYYY-MM-DD
**Tests reviewed:** N (M new, K re-examined)
**Tests skipped:** A (approved, unchanged)
**Findings:** F total (H high, M medium, L low)

## High Severity
| Test File | Test Name | Concern | Evidence | Issue |
|-----------|-----------|---------|----------|-------|
| tests/foo.test.js | "returns correct value" | Hardcoded return | `getValue()` returns `42` | #1234 |

## Medium Severity
...

## Low Severity
...

## Coverage Gaps
| Source File | Category | Severity | Issue |
|-------------|----------|----------|-------|
| src/pricing.js | missing-unit-test | High | #1236 |

U missing unit tests, E missing e2e tests. Reported every run including zero;
a skipped pass reports the skip and its reason instead of a zero.

## Clean Tests
C tests passed review with no concerns.

## Issues Created
- #1234 — Hollow test: [description]
- #1235 — Narrow assertions: [description]

## Charter Alignment Notes
- N tests aligned with charter goals
- M tests unaligned (informational — may still be valid)
```
**Issue column:** Show bug issue number or `No issue` for informational findings.
### Step 9: Update Manifest
Write/update `.bad-test-manifest.json`:
1. **Charter hash:** Current `CHARTER.md` SHA-256
2. **Reviewed tests:** For each evaluated: `contentHash`, `status` (`approved`/`flagged`), `reviewedAt`, `findingCount`, `issueRefs`
3. **Deleted tests:** Remove entries for files no longer existing
4. **Unevaluated tests:** Preserve existing entries for skipped (approved+unchanged)
5. **Coverage gaps:** top-level `coverageGaps` map keyed by **source file path** — a gap has **no test file** to hash, so it cannot be keyed like every other entry; reusing `tests` would need a synthetic key that collides once a real test appears there. Each entry: `sourceHash` (SHA-256 of the **source**, so the finding is re-examined when it changes), `category` (`missing-unit-test`/`missing-e2e-test`), `status` (`flagged`/`acknowledged`), `reviewedAt`, `issueRefs`. **Cleared when** the source gains a paired test (remove the entry, do NOT mark it approved) or is deleted. A changed `sourceHash` alone does **NOT** clear it — editing an untested file does not test it. A charter-hash change re-evaluates gaps too, since the charter can change which sources are in scope.
### Step 10: Final Summary
```
Bad Test Review Complete.

Tests reviewed: N (M new, K re-examined)
Tests skipped: A (approved, unchanged)
Findings: F total (H high, M medium, L low)
Bug issues created: B
Manifest updated: .bad-test-manifest.json

Next run will skip N approved+unchanged tests.
```
-> **STOP.**
## Error Handling
| Situation | Response |
|-----------|----------|
| CHARTER.md not found | "No charter found. Run `/charter` first." -> STOP |
| No test files found | "No test files found matching project conventions." -> STOP |
| Manifest malformed | "Manifest corrupted. Running full review." -> continue with --full |
| Test file unreadable | Warn and skip, continue |
| Bug issue creation fails | Warn, include in report, continue |
### Step 11: Closing Cleanup
The prune is **part of** this step, and this step is **numbered** — what makes the claim hold. `One task per numbered step` now covers it, so an unpruned list surfaces as an unfinished task like any other step. The same claim as prose alone was overridden by the rules beside it (#2641).

**Prune the task list** (unconditional — every path, including early-exit paths where Phase 1 created tasks and later phases never ran):
1. `TaskList` — enumerate all tasks.
2. For every task owned by this `/bad-test-review` invocation, `TaskUpdate status=deleted`.
3. Do **not** delete tasks created outside this invocation (user TODOs).

**End of /bad-test-review Command**
