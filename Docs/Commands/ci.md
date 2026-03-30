# /ci

Manage GitHub Actions CI workflows interactively — view status, add features, validate YAML, and monitor runs.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| *(none)* | No | Show workflow status (default) |
| `list` | No | List all available CI features with enabled/disabled status |
| `validate` | No | Validate workflow YAML files for errors and anti-patterns |
| `add <feature>` | No | Add a CI feature to the appropriate workflow file |
| `recommend` | No | Analyze project stack and suggest improvements |
| `watch [--sha <commit>]` | No | Monitor CI run for a commit (defaults to HEAD) |

## Usage

```
/ci
/ci list
/ci validate
/ci add dependency-caching
/ci recommend
/ci watch --sha abc1234
```

## Key Behaviors

- Requires the `ci-cd-pipeline-design` skill to be installed; stops with install instructions if scripts are missing.
- `/ci add` auto-detects the target workflow file and asks for confirmation before modifying it; creates a backup first.
- `/ci recommend` presents a numbered menu of categorized suggestions ([Add], [Remove], [Alter], [Improve]) and applies only the ones you select.
- `/ci watch` polls in the background and reports per-workflow pass/fail with exit codes (0=pass, 1=fail, 2=timeout, 3=no-run, 4=cancelled).
- `/ci validate` checks for deprecated action versions, missing concurrency groups on PR workflows, and hardcoded secrets.
