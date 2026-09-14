# /bad-test-review

Evaluate every unit and e2e test for charter alignment and functional authenticity.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| *(none)* | | Incremental run — skips approved, unchanged tests |
| `--full` | No | Bypass the manifest and review all tests |
| `--status` | No | Report manifest statistics without running a review |

## Usage

```
/bad-test-review
/bad-test-review --full
/bad-test-review --status
```

## Key Behaviors

- Uses a `.bad-test-manifest.json` to track reviewed tests by content hash. Tests that are approved and unchanged are skipped on subsequent runs. If `CHARTER.md` has changed since the last run, all tests are re-evaluated regardless.
- Checks each test for **charter alignment** (does it validate a documented requirement?) and **functional authenticity** (does the implementation genuinely work, or does it use hardcoded returns, no branching, or mock-only validation?).
- Runs an advisory **coverage-gap pass** over the project's source files, emitting three finding categories:

  | Category | Meaning | Severity |
  |---|---|---|
  | `missing-unit-test` | A source file with no paired unit test | High |
  | `undeclared-contract` | A test classified as a contract test (per `Reference/Contract-Test-Classification.md`) whose leading comment block has no `@subject`; the finding suggests the artifact(s) to name | Low |
  | `missing-e2e-test` | A **declared flow** that no e2e spec covers via `@covers` — one finding per flow, not per source file | Medium |

  Coverage-gap findings never block a run, and their counts are reported even when zero. The pass is skipped, with the reason stated, when no technology is detected or the `tdd-refactor-coverage-audit` conventions are not installed.
- The e2e runner is resolved from `framework-config.json` `testing.suites[]` (the suite whose `role` is `e2e`) first, then `CHARTER.md`, then the dependency manifest as corroboration. If none declares one, a single notice is printed and all `missing-e2e-test` findings are suppressed.
- Creates bug issues for each finding or group of related findings, then saves a full report to `Construction/Code-Reviews/YYYY-MM-DD-bad-test-report.md`.
- Updates the manifest after each run so the next run is incremental.
- Requires `CHARTER.md` to exist; run `/charter` first if missing.
