# /complete-prd

Verify all epics and stories derived from a PRD are complete, then close the PRD tracker issue.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<issue-number>` | Yes | PRD tracker issue number (e.g., `151` or `#151`) |

## Usage

```
/complete-prd 151
/complete-prd #151
```

## Key Behaviors

- Requires the issue to have the `prd` label; stops with an error if the label is missing.
- Checks every linked epic (matched by `**PRD Tracker:** #N` in epic body) and all their sub-issues (stories) — all must be closed before the PRD tracker is closed.
- Reports a detailed list of any open epics or stories if work is incomplete; does not close the PRD in that case.
- After successful closure, automatically attempts to move the original proposal file to `Proposal/Implemented/` and commits the move — failures here are non-blocking warnings.
- Posts a closing comment summarizing epic and story counts on the PRD tracker issue.
