# /transfer-issue

Transfer an issue from its current branch to a different branch.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<issue-number>` | Yes | Issue number to transfer (e.g., `42`) |
| `--to branch` | No | Target branch name; omit to be prompted |

## Usage

```
/transfer-issue 42 --to release/v1.3.0
/transfer-issue 42
```

## Key Behaviors

- Delegates entirely to `transfer-issue.js`; reports the result after transfer
- Use this when an issue needs to move between workstreams or release branches
