# /review-prd

Review a PRD document linked from a GitHub issue, with tracked review history.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | Yes | Issue number linked to the PRD (e.g., `#42` or `42`) |
| `--with` | No | Comma-separated domain extensions (e.g., `--with security,performance`) or `--with all` |
| `--mode` | No | Transient review mode override: `solo`, `team`, or `enterprise` |
| `--force` | No | Force re-review even if issue already has the `reviewed` label |
| `--help` | No | Open this page. Takes precedence over every other argument and performs no action. |

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
- **AC check-off is deliberately skipped on PRD trackers.** A PRD tracker's checklist is a short lifecycle gate, not the ~20 review criteria, so checking boxes positionally would tick whichever gate happened to line up with a passing criterion. The command reports the skip rather than a count. On a "Ready for" recommendation it checks only the "PRD reviewed" box. "Ready with minor revisions" earns the `reviewed` label but not the box, so the PRD still gates `/create-backlog` and `/review-test-plan` until those revisions are settled. The other two boxes have their own owners: "Test plan approved" is checked by `/done` when the test plan approval issue is Done, and "Ready for backlog creation" by `/create-backlog`. Status transition to backlog is owned by `/create-backlog`.
- Self-contained: handles the document update and the finalize script without delegating to a calling orchestrator
