# /merge-branch

Merge the current feature branch to main with gated validation checks.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--skip-gates` | No | Emergency bypass — skip all policy gate checks. Does **not** skip the mergeability gate |
| `--dry-run` | No | Preview actions without executing |

## Usage

```
/merge-branch
/merge-branch --dry-run
/merge-branch --skip-gates
```

## Key Behaviors

- Use this for feature/fix branches without version tagging; use `/prepare-release` for versioned releases with a CHANGELOG and git tag
- Gate 1: no uncommitted changes; Gate 2: tests pass; Gate 3: PR must be approved before merge
- Pushes branch, creates PR to main, checks mergeability, waits for user approval, merges, then deletes the branch
- **Mergeability gate:** right after the PR is created and *before* you are asked to approve it, GitHub is asked whether the PR can merge. `MERGEABLE` continues; `CONFLICTING` reports the PR's changed files and stops without requesting a review or attempting a merge; an indeterminate answer is retried up to 5 times (2s apart) and then warns and continues rather than blocking. This is why a conflicting branch is reported in seconds instead of after someone has reviewed a PR that could never have merged
- The mergeability gate is exempt from `--skip-gates`: that flag waives policy gates such as approval and tests, but an unmergeable PR cannot merge no matter who approves it
- On `CONFLICTING`: rebase onto `main` or merge `main` into your branch, resolve, push, and re-run — the PR stays open
- If a branch tracker issue exists, it is closed after merge
- After merging, checks `.workstreams.json` for workstream context and updates metadata if applicable; warns if sibling workstreams are still active
- Extension points available at `pre-gate`, `gates`, `post-gate`, `post-pr-create`, `post-merge`, `post-close`
