# /pivot

Review and triage stories when project direction changes.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `[epic-number]` | No | Epic issue number to pivot (e.g., `42` or `#42`) |
| `[prd-name]` | No | PRD name to pivot all related stories |

## Usage

```
/pivot 42
/pivot Auth-System
/pivot
```

## Key Behaviors

- If no argument is provided, prompts interactively for an epic number or PRD name
- Asks for the pivot reason before listing stories — the reason is recorded in a comment on the parent issue
- For each open story, presents four options: Keep, Archive (moves to `parking_lot` status), Close (closes as "not planned"), or Skip (decide later)
- Documents all story decisions in a comment on the epic or PRD issue
- Use for significant scope realignments; for minor priority changes use `gh pmu move --priority`, for single story edits update directly, for adding new stories use `/add-story`
