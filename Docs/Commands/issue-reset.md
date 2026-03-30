# /issue-reset

Reset a bug, enhancement, PRD, proposal, or epic issue to a clean slate.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | Yes | Issue number to reset (e.g., `#42` or `42`) |
| `--dry-run` | No | Preview actions without executing |

## Usage

```
/issue-reset #42
/issue-reset 42 --dry-run
```

## Key Behaviors

- Only applies to issues labeled `bug`, `enhancement`, `prd`, `proposal`, or `epic` — rejects `story`, `branch`, and other types
- Resets: unchecks all AC checkboxes, resets Reviews counter to 0, removes auto-generated sections, deletes review comments, removes the `reviewed` label, deletes associated test plan files, moves issue to backlog
- Requires user confirmation before executing (unless `--dry-run`)
- For `proposal` issues: also deletes associated PRD issue and files; warns if the PRD has already been converted to backlog stories
- For `epic` issues: recursively resets all sub-issues first, then the epic itself
- Posts an audit comment on the issue after reset and commits any deleted files
