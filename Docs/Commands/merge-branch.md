# /merge-branch

Merge the current feature branch to main with gated validation checks.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--skip-gates` | No | Emergency bypass — skip all gate checks |
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
- Pushes branch, creates PR to main, waits for user approval, merges, then deletes the branch
- If a branch tracker issue exists, it is closed after merge
- After merging, checks `.workstreams.json` for workstream context and updates metadata if applicable; warns if sibling workstreams are still active
- Extension points available at `pre-gate`, `gates`, `post-gate`, `post-pr-create`, `post-merge`, `post-close`
