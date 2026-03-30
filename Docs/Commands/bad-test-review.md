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
- Creates bug issues for each finding or group of related findings, then saves a full report to `Construction/Code-Reviews/YYYY-MM-DD-bad-test-report.md`.
- Updates the manifest after each run so the next run is incremental.
- Requires `CHARTER.md` to exist; run `/charter` first if missing.
