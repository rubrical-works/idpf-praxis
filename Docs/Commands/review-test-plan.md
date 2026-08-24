# /review-test-plan

Review a TDD test plan against its source PRD for coverage completeness.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | Yes | Issue number linked to the test plan (e.g., `#42` or `42`) |
| `--mode` | No | Transient review mode override: `solo`, `team`, or `enterprise` |
| `--force` | No | Force re-review even if issue already has the `reviewed` label |

## Usage

```
/review-test-plan #42
/review-test-plan #42 --force
/review-test-plan #42 --mode team
```

## Key Behaviors

- Requires the issue body to contain both `**Test Plan:**` and `**PRD:**` file path references; stops if either file is missing
- Performs a coverage analysis mapping every PRD acceptance criterion to test cases in the test plan and reports gaps
- Recommendations: "Ready for approval", "Ready with minor gaps", "Needs revision", or "Needs major rework"
- When the recommendation is "Ready for approval", the issue moves to `in_review` and the user runs `/done #N` to close the approval gate.
- **Check-off is deliberately skipped on test plans.** The template's Approval Checklist is a fixed six-item gate meant for a human approver, not the review criteria, so the command checks nothing and reports the skip. The `in_review` transition still happens — only check-off is suppressed.
- Updates `**Reviews:** N` and appends a row to the `## Review Log` table in the test plan file; never edits existing rows
- Subjective criteria are skipped in `solo` mode; coverage gaps are reported as bullet points (not tables) for `/resolve-review` parser compatibility
- Self-contained: handles document update and finalize script directly without delegating to a calling orchestrator
