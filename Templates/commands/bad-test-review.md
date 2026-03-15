---
version: "v0.63.1"
description: Evaluate tests for charter alignment and functional authenticity (project)
argument-hint: "[--full] [--status]"
---
<!-- MANAGED -->
# /bad-test-review
Evaluate every unit and e2e test to determine whether the code that causes each test to pass meets charter expectations, or merely returns what is required to pass without genuine functional correctness.
## Prerequisites
- `CHARTER.md` exists in project root (run `/charter` first if missing)
- Test files exist in the codebase
## Arguments
| Argument | Required | Description |
|----------|----------|-------------|
| *(none)* | | Normal incremental run -- skip approved+unchanged tests |
| `--full` | No | Bypass manifest, review all tests |
| `--status` | No | Report manifest statistics only, then STOP |
## Execution Instructions
**REQUIRED:** Before executing:
1. **Generate Todo List:** Parse workflow steps, use `TodoWrite` to create todos
2. **Track Progress:** Mark todos `in_progress` -> `completed` as you work
3. **Post-Compaction:** If resuming after context compaction, re-read this spec and regenerate todos
## Workflow
### Step 1: Parse Arguments
Check for `--full` or `--status` flags.
**If `--status`:** Jump to Step 2b then **STOP**.
**If `--full`:** Set `fullMode = true` (skip manifest filtering in Step 4).
**Otherwise:** Normal incremental mode.
### Step 2: Load Manifest
Read `.bad-test-manifest.json` if it exists.
**If manifest exists:**
1. Parse JSON, extract `charter.contentHash`
2. Compute current charter hash (SHA-256 of `CHARTER.md`)
3. **If charter hash differs:** set `charterChanged = true` -- triggers full re-evaluation
4. Report: `Charter changed since last review -- all tests will be re-evaluated.`
**If manifest does not exist:**
1. Report: `No manifest found. First run -- all tests will be reviewed.`
2. Create empty manifest structure in memory
### Step 2b: Manifest Statistics (--status only)
Read `.bad-test-manifest.json` and report:
```
Bad Test Review Manifest:
  Last run: YYYY-MM-DD
  Tests tracked: N total
    Approved: A
    Flagged: F (with open issues)
  Charter hash: sha256:abc123...
  New tests (unreviewed): K
```
Count new tests by scanning test files against manifest entries. **STOP** after reporting.
### Step 3: Discover Test Files
Scan codebase for test files:
```
Patterns: tests/, *.test.js, *.test.ts, *.spec.js, *.spec.ts, __tests__/
```
Use Glob. Exclude: `node_modules/`, build output, third-party tests, generated helpers.
Report: `Discovered N test files across M directories.`
### Step 4: Filter by Manifest
**If `--full` or `charterChanged`:** Evaluate all discovered tests.
**Otherwise:** Compute SHA-256 per file and check manifest:
| Condition | Action |
|-----------|--------|
| Not in manifest | Queue for evaluation |
| Hash matches, `approved` | Skip |
| Hash matches, `flagged` | Skip |
| Hash **differs** | Re-examine |
| In manifest but deleted | Remove from manifest |
Report filter results: new, changed, approved (skipped), flagged (skipped).
### Step 5: Load Charter
Read `CHARTER.md` to extract project goals, conventions, quality standards, testing expectations.
### Step 6: Evaluate Each Test
For each queued test file, perform two analyses:
#### 6a: Charter Alignment
- Read test file, identify what each test case validates
- Cross-reference against charter goals
- **Aligned:** Validates documented requirement; **Unaligned:** No charter mapping (informational)
#### 6b: Functional Authenticity
Detection heuristics -- flag suspicious patterns:
| Heuristic | Description | Severity |
|-----------|-------------|----------|
| **Hardcoded return** | Return value matches test assertion constant | High |
| **No branching** | Always returns same value regardless of input | Medium |
| **Single-input coverage** | Only handles exact inputs used in tests | Medium |
| **Narrow assertions** | Overly narrow, don't cover realistic scenarios | Low |
| **Mock-only validation** | Mock replaces all behavior, test validates mock | High |
| **Same-commit pattern** | Implementation added with test, no other callers | Low |
For each suspicious pattern: read implementation, analyze, record file/name/concern/severity/evidence.
### Step 7: Generate Structured Report
```
## Bad Test Review Report
**Date:** YYYY-MM-DD
**Tests reviewed:** N
**Findings:** M
### High Severity
| Test File | Test Name | Concern | Evidence |
|-----------|-----------|---------|----------|
### Medium Severity
...
### Low Severity
...
### Summary
- High: N | Medium: M | Low: K | Clean: C
```
### Step 8: Create Bug Issues
For each finding or logical group, create a bug issue referencing test file, concern type, evidence. Group related findings sharing root cause into single issues.
Report: `Created N bug issues: #NNN: Hollow test -- [description]`
### Step 8b: Save Report
Write to `Construction/Code-Reviews/YYYY-MM-DD-bad-test-report.md` **after** issue creation so issue numbers are available. Create directory if needed.
Include: date, tests reviewed/skipped, findings by severity with issue numbers, clean tests count, issues created summary, charter alignment notes.
Each finding entry must include its issue number (e.g., `#1234`) or `No issue` for informational findings.
### Step 9: Update Manifest
1. Update `charter.contentHash` to current CHARTER.md SHA-256
2. For each evaluated test: `contentHash`, `status` (approved/flagged), `reviewedAt`, `findingCount`, `issueRefs`
3. Remove entries for deleted files
4. Preserve skipped entries
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
**STOP.**
## Error Handling
| Situation | Response |
|-----------|----------|
| CHARTER.md not found | "No charter found. Run `/charter` first." -> STOP |
| No test files found | "No test files found matching project conventions." -> STOP |
| Manifest malformed | "Manifest corrupted. Running full review." -> continue as --full |
| Test file unreadable | Warn and skip, continue |
| Bug issue creation fails | Warn, include in report, continue |
**End of /bad-test-review Command**
