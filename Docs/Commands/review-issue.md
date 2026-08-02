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

## Files-to-Modify Is Always Written

For every bug, enhancement and story, the review derives a **Files to modify** list and writes it into the issue body — not just into the review output, which later scope checks cannot see.

This runs whether or not the Proposed Solution needed repair. Previously the list was produced only as a side effect of *fixing* a deficient Proposed Solution, which meant a carefully written issue never received one and was guaranteed to halt later during implementation.

Re-reviewing an unchanged issue produces no body diff: the section is replaced in place rather than appended.

Declaring the files an issue touches has a direct payoff — a declared path is exempt from the protected-path halt during implementation, so the issue can proceed without a scope override.

## Prior-Art Sweep

If the issue carries no prior-art marker, or carries one recording an incomplete sweep, the review performs the sweep and records the finding.

Prior work that duplicates the issue's scope is treated as blocking and lowers the review verdict. If the sweep is switched off for the project, the criterion is reported as skipped rather than failed — reporting it as a failure would downgrade every review in a project that has deliberately opted out.
