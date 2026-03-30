# /idpf-stats

Generate a session statistics report with development velocity metrics.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--since YYYY-MM-DD` | No | Start date (default: today at midnight) |
| `--until YYYY-MM-DD` | No | End date (default: now) |

## Usage

```
/idpf-stats
/idpf-stats --since 2026-03-15
/idpf-stats --since 2026-03-10 --until 2026-03-14
```

## Key Behaviors

- Produces ASCII tables for Volume, Testing, Throughput, and Issue Breakdown by Category
- Issue breakdown requires `gh` CLI and `.gh-pmu.json`; skipped if either is missing
- Categorizes issues by label: `bug`, `enhancement`, `security`, `documentation`, `infrastructure`, `code-review`
- Throughput (commits/hour, lines/hour, issues/hour) uses a 1-hour minimum denominator to avoid division by zero on short sessions
- If no commits exist in the range, reports "No activity found" and skips all tables
- Invalid date format or `--until` before `--since` produces an error and stops
