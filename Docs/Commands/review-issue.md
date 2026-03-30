# /review-issue

Review one or more GitHub issues with type-specific criteria and tracked history.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | Yes | One or more issue numbers (e.g., `#42` or `42 43 44`) |
| `--with` | No | Comma-separated domain extensions (e.g., `--with security,performance`) or `--with all` |
| `--mode` | No | Transient review mode override: `solo`, `team`, or `enterprise` |
| `--force` | No | Force re-review even if issue already has the `reviewed` label |

## Usage

```
/review-issue #42
/review-issue #42 #43 #44
/review-issue #42 --with security,performance
/review-issue #42 --force --mode team
```

## Key Behaviors

- Automatically redirects to `/review-proposal`, `/review-prd`, or `/review-test-plan` when the issue type is detected (e.g., proposal or PRD tracker); original flags are passed through
- Skips issues that already have the `reviewed` label unless `--force` is used; reports existing review count
- For bugs and enhancements, auto-generates a proposed solution or fix when that section is missing or contains a placeholder
- Subjective criteria are asked via interactive prompts in `team`/`enterprise` mode; skipped entirely in `solo` mode
- Applies the `security-finding` label automatically when `--with security` (or `--with all`) surfaces a warning or failure
- After review, posts a structured comment, updates the `**Reviews:** N` count on the issue, and swaps `reviewed`/`pending` labels
- Available domain extensions: `security`, `accessibility`, `performance`, `chaos`, `contract`, `qa`, `seo`, `privacy`
