# /create-branch

Create a new git branch with an associated tracker issue on the project board.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<branch-name>` | Yes | Any valid git branch name (e.g., `release/v0.16.0`, `feature/dark-mode`) |

## Usage

```
/create-branch release/v0.16.0
/create-branch feature/dark-mode
/create-branch bugfix/login-crash
```

## Key Behaviors

- Creates both the git branch and a tracker issue (labeled `branch`) via `gh pmu branch start`; the tracker is automatically assigned to its own branch.
- Populates the tracker body with workflow guidance (how to assign issues, work issues, and merge/release).
- Switches to the new branch and pushes it to remote with upstream tracking set.
- If uncommitted changes exist at the time of creation, they carry over to the new branch and you are offered the option to stage and commit them.
- Stops with an error if `main` or `master` is passed as the branch name.
- After creation, use `/assign-branch` to link issues to this branch tracker.
