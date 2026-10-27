# /ci

Manage GitHub Actions CI workflows interactively — view status, add features, validate YAML, analyze per-push cost, and monitor runs.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| *(none)* | No | Show workflow status (default) |
| `--list` | No | List all available CI features with enabled/disabled status |
| `--validate` | No | Validate workflow YAML files for errors and anti-patterns |
| `--add <feature>` | No | Add a CI feature to a workflow file |
| `--add <feature> --file <workflow>` | No | Add the feature to the named workflow in `.github/workflows/`, skipping auto-detection |
| `--add paths-ignore --paths <p1,p2>` | No | Add the `paths-ignore` patterns you name (comma-separated) instead of deriving them from the repo layout |
| `--recommend` | No | Analyze project stack and per-push CI cost, and suggest improvements |
| `--watch [--sha <commit>]` | No | Monitor CI run for a commit (defaults to HEAD) |
| `--help` | No | Open this page. Takes precedence over every other argument and performs no action. |

**Retired forms:** `list`, `validate`, `add`, `recommend` and `watch` typed bare are no longer accepted; use the `--` form.

## Usage

```
/ci
/ci --list
/ci --validate
/ci --add dependency-caching
/ci --add concurrency-groups --file lint.yml
/ci --add paths-ignore
/ci --add paths-ignore --file test.yml --paths 'Proposal/**,docs/**'
/ci --add trigger-scope --file security.yml
/ci --recommend
/ci --watch --sha abc1234
```

## Key Behaviors

- Requires the `ci-cd-pipeline-design` skill to be installed; stops with install instructions if scripts are missing.
- `/ci --add` auto-detects the target workflow file unless `--file` names one, and asks for confirmation before modifying it; creates a backup first.
- **Edits change only the lines they touch.** Comments, quoting, blank lines and long lines elsewhere in the workflow are left exactly as they were.
- **`paths-ignore`** derives its patterns from your repo layout: each documentation directory and IDPF artifact directory present (`Proposal/`, `Construction/`, `Inception/`, `Mockups/`) plus root-level `'*.md'`. It is added only to `push`/`pull_request` triggers the workflow already has with no path filter, and never adds a trigger.
- **`paths-ignore --paths`** uses the patterns you name instead, and merges them into each `push`/`pull_request` trigger's existing `paths-ignore` list without duplicates (existing entries are kept as written), or adds a new list where the trigger has no path filter. A trigger that declares `paths:` refuses the whole edit and nothing is written; a tag-only push is skipped and named. `--paths` with any other feature is refused.
- **Runtime markdown is protected.** A pattern that would match `.claude/commands/*.md`, rules or skills — such as `'**.md'` — is warned about, because a change there alters behavior and skipping CI on it hides a regression.
- **Every `paths-ignore` result states what it gives up:** a test that reads an ignored file is not run for that change, and `/done` does not wait for CI on a push that touches only ignored paths.
- **`trigger-scope`** narrows an audit or scanner workflow to a `paths:` list (manifests and lockfiles, source directories, the workflow file), a weekly `schedule` and `workflow_dispatch`. Scheduled runs check the default branch only, so a working branch is scanned when it touches a listed path or is run by hand.
- `/ci --recommend` first prints a per-push report: jobs per branch push (matrix legs expanded), test suites run more than once per push, and whether each job duplicates the local verification suites `/work` already runs or adds signal (such as a Windows runner). It then presents a numbered menu of categorized suggestions ([Add], [Remove], [Alter], [Improve]) and applies only the ones you select. Every suggestion states the CI signal it removes or defers, shown as `Gives up:`.
- `/ci --watch` polls in the background and reports per-workflow pass/fail with exit codes (0=pass, 1=fail, 2=timeout, 3=no-run, 4=cancelled).
- `/ci --validate` checks for deprecated action versions, missing concurrency groups on PR workflows, and hardcoded secrets.
