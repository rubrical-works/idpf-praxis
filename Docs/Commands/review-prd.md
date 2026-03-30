# /review-prd

Review a PRD document linked from a GitHub issue, with tracked history and AC check-off.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | Yes | Issue number linked to the PRD (e.g., `#42` or `42`) |
| `--with` | No | Comma-separated domain extensions (e.g., `--with security,performance`) or `--with all` |
| `--mode` | No | Transient review mode override: `solo`, `team`, or `enterprise` |
| `--force` | No | Force re-review even if issue already has the `reviewed` label |

## Usage

```
/review-prd #42
/review-prd #42 --with security
/review-prd #42 --force
```

## Key Behaviors

- Requires the issue body to reference the PRD file path; also looks for a co-located `Test-Plan-*.md` for cross-reference (non-blocking if absent)
- Evaluates requirements completeness, user story format, acceptance criteria, NFR adequacy, cross-references, and story numbering
- Subjective criteria are presented interactively in `team`/`enterprise` mode; skipped in `solo` mode
- Recommendations: "Ready for backlog creation", "Ready with minor revisions", "Needs revision", or "Needs major rework"
- Updates the `**Reviews:** N` field and appends a row to the `## Review Log` table directly in the PRD file; never edits existing rows
- When recommendation starts with "Ready for", automatically runs AC check-off on the issue; status transition to backlog is owned by `/create-backlog`
- Self-contained: handles document update, finalize script, and AC check-off without delegating to a calling orchestrator
