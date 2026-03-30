# /review-proposal

Review a proposal document linked from a GitHub issue, with tracked history.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | Yes | Issue number linked to the proposal (e.g., `#42` or `42`) |
| `--with` | No | Comma-separated domain extensions (e.g., `--with security,performance`) or `--with all` |
| `--mode` | No | Transient review mode override: `solo`, `team`, or `enterprise` |
| `--force` | No | Force re-review even if issue already has the `reviewed` label |

## Usage

```
/review-proposal #42
/review-proposal #42 --with security,performance
/review-proposal #42 --force
```

## Key Behaviors

- Requires the issue body to contain a `**File:** Proposal/[Name].md` field pointing to the proposal document
- Searches `Construction/Design-Decisions/` and `Construction/Tech-Debt/` for related context and displays any matches before evaluation
- Includes a Path Analysis gate: if the `path-analysis-present` criterion fails, pauses and asks whether to run `/paths #N` first or continue without it
- Recommendations: "Ready for implementation", "Ready with minor revisions", "Needs revision", or "Needs major rework"
- Updates `**Reviews:** N` and appends a row to the `## Review Log` table in the proposal file; never edits existing rows
- Skips issues with the `reviewed` label unless `--force` is used; this command is also invoked automatically when `/review-issue` detects a proposal type
- Subjective criteria are skipped entirely in `solo` mode
