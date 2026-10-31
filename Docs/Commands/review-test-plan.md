# /review-test-plan

Review a TDD test plan against its source PRD for coverage completeness.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | Yes | Issue number linked to the test plan (e.g., `#42` or `42`) |
| `--mode` | No | Transient review mode override: `solo`, `team`, or `enterprise` |
| `--force` | No | Force re-review even if issue already has the `reviewed` label |
| `--help` | No | Open this page. Takes precedence over every other argument and performs no action. |

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
- When the recommendation is "Ready for approval" or "Ready with minor gaps", the issue moves to `in_review` and the user runs `/done #N` to close the approval gate. The approval issue is never closed by the review itself.
- **Approval gates are rolled up from the findings, not checked by position.** A gate is checkable only when every review criterion backing it passed. Checkable gates are confirmed with you before anything is written; a blocked gate is shown with the criterion that blocked it and its evidence, and you are asked whether to accept the risk. Accepted gates are checked in both the approval issue's Review Checklist and the test plan's Approval Checklist, matched by text, and every decision is recorded verbatim in an `## Approval Decisions` section of the issue body. Declining writes nothing.
- **`testPlanGateConfirmation`** in `framework-config.json` controls the confirmation prompt. `always` (the default when the key is absent) confirms every checkable gate. `when-blocked` writes each checkable gate that is marked auto-checkable (one the review findings can decide) without asking, and records it as `auto-checked (testPlanGateConfirmation: when-blocked)` rather than as your answer; a gate that needs a human still gets the confirmation prompt, and a blocked gate still gets the risk prompt. An unrecognized value falls back to `always` with a warning. The prompt is the default because the session that generated a plan may also review it.
- Updates `**Reviews:** N` and appends a row to the `## Review Log` table in the test plan file; never edits existing rows
- Subjective criteria are skipped in `solo` mode; coverage gaps are reported as bullet points (not tables) for `/resolve-review` parser compatibility
- Self-contained: handles document update and finalize script directly without delegating to a calling orchestrator
