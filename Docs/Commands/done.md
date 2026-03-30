# /done

Complete one or more issues — transitions from `in_review` to `done`, pushes, and monitors CI.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | No | Single issue number (e.g., `#42` or `42`) |
| `#issue #issue...` | No | Multiple issue numbers (e.g., `#42 #43 #44`) |
| `--all` | No | Complete all `in_review` issues on the current branch (with confirmation) |
| *(none)* | No | Query `in_review` issues for interactive selection |

## Usage

```
/done #42
/done #42 #43 #44
/done --all
/done
```

## Key Behaviors

- Only handles the `in_review` → `done` transition; use `/work` first to get an issue to `in_review`.
- Runs a preamble script that validates issue state, verifies diffs, and moves the issue to done in one operation — stops with error details if validation fails.
- When completing an epic, automatically processes all `in_review` sub-issues first, then completes the epic; warns about sub-issues still `in_progress` or never started.
- For multiple issues (explicit list, `--all`, or batch selection), pushes only once after the last issue (batch push optimization).
- After push, spawns background CI monitoring via `ci-watch.js` and reports results when they arrive (pass/fail/timeout per workflow).
- Posts a work summary comment on each closed issue listing changed files and the commit link.
