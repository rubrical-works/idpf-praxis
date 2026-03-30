# /assign-branch

Assign or remove issues from a branch tracker.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `[#issue...]` | No | One or more issue numbers to assign |
| `[branch/name]` | No | Target branch name |
| `[--add-ready]` | No | Mark issues as ready for the branch |
| `[--remove]` | No | Remove issues from the branch |

## Usage

```
/assign-branch #42
/assign-branch #42 #43 release/v1.2.0
/assign-branch #42 --remove
```

## Key Behaviors

- Delegates immediately to `.claude/scripts/shared/assign-branch.js` with the provided arguments.
- If no open branches exist, the script outputs `NO_BRANCH_FOUND` along with suggestions. The command then presents those suggestions via `AskUserQuestion`, creates the selected branch with `gh pmu branch start`, and re-runs the assignment.
- Normal output (branches exist) is reported directly to the user without any additional interaction.
