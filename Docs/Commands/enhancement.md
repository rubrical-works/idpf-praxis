# /enhancement

Create a properly labeled enhancement issue with a standard template and add it to the project board.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<title>` | No | Enhancement title (prompted if not provided) |

## Usage

```
/enhancement add dark mode support
/enhancement improve search performance
/enhancement
```

## Key Behaviors

- If no title is provided, prompts for one before proceeding.
- Creates the issue with label `enhancement`, status `Backlog`, and priority `P2` via `gh pmu create` (project board integrated).
- Populates a standard template (Description, Motivation, Proposed Solution, Scope, Acceptance Criteria) using details inferred from your input; unfilled sections use "To be documented" placeholders.
- **STOP after creation** — does not begin implementation until you explicitly say "work", "fix that", or "implement that".
- Suggests next steps: `/review-issue #N` → `/assign-branch #N` → `work #N`.
