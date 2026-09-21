# /idpf-stats

Generate a session statistics report with development velocity metrics.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--since YYYY-MM-DD` | No | Start date (default: today at midnight) |
| `--until YYYY-MM-DD` | No | End date (default: now) |
| `--daily-log [prose]` | No | Write a management-facing daily work log instead of the stats tables. Optional prose after the flag picks the days (e.g. `for every weekday last week`); none means today. Current repository only |

## Usage

```
/idpf-stats
/idpf-stats --since 2026-03-15
/idpf-stats --since 2026-03-10 --until 2026-03-14
/idpf-stats --daily-log for every weekday last week
```

## Key Behaviors

- Produces ASCII tables for Volume, Testing, Throughput, and Issue Breakdown by Category
- Issue breakdown requires `gh` CLI and `.gh-pmu.json`; skipped if either is missing
- Categorizes issues by label: `bug`, `enhancement`, `security`, `documentation`, `infrastructure`, `code-review`
- Throughput (commits/hour, lines/hour, issues/hour) uses a 1-hour minimum denominator to avoid division by zero on short sessions
- If no commits exist in the range, reports "No activity found" and skips all tables
- Invalid date format or `--until` before `--since` produces an error and stops
- With `--daily-log`, the days come only from the prose after the flag. `--today`, `--date`, `--since`, `--until`, `--save`, `--repos` and `--repos-edit` have no effect there. Each one you typed is named on an `Ignored for --daily-log` line, so `--daily-log --date 2026-09-01` does not silently produce today's log. To choose the days, use prose such as `for 2026-09-01`
