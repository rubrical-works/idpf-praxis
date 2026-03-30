# /switch-branch

Switch the active branch context for the current session.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `branch-name` | No | Name of the branch to switch to; omit to list available branches |

## Usage

```
/switch-branch
/switch-branch release/v1.2.0
```

## Key Behaviors

- Delegates entirely to `switch-branch.js`; reports the new context after switching
- Omitting the branch name typically presents a list of available branches to choose from
- Use this to change which branch issues are assigned to when working across multiple workstreams
