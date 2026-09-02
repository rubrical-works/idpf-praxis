# /review-proposal

Review a proposal document linked from a GitHub issue, with tracked history.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | Yes | Issue number linked to the proposal (e.g., `#42` or `42`) |
| `--with` | No | Comma-separated domain extensions (e.g., `--with security,performance`) or `--with all` |
| `--mode` | No | Transient review mode override: `solo`, `team`, or `enterprise` |
| `--force` | No | Force re-review even if issue already has the `reviewed` label |
| `--prior-art` | No | Force the prior-art sweep whatever the project’s `reviewSweep` mode (except `off`). Boolean — takes no value. Typed directly, or passed through the `/review-issue` redirect |

## Usage

```
/review-proposal #42
/review-proposal #42 --with security,performance
/review-proposal #42 --force
```

## Key Behaviors

- Requires the issue body to contain a `**File:** Proposal/[Name].md` field pointing to the proposal document
- Searches `Construction/Design-Decisions/` and `Construction/Tech-Debt/` for related context and displays any matches before evaluation
- Includes a Path Analysis gate: if the `path-analysis-present` criterion fails, pauses and asks whether to run `/paths #N` first or continue without it
- Recommendations: "Ready for implementation", "Ready with minor revisions", "Needs revision", or "Needs major rework"
- Updates `**Reviews:** N` and appends a row to the `## Review Log` table in the proposal file; never edits existing rows
- Skips issues with the `reviewed` label unless `--force` is used; this command is also invoked automatically when `/review-issue` detects a proposal type
- Subjective criteria are skipped entirely in `solo` mode

## Prior-Art Sweep

Whether the review sweeps is governed by the `reviewSweep` setting in `framework-config.json`, which has four modes:

| Mode | Behavior when the proposal has no complete marker |
|------|--------------------------------------------------|
| `full` | Performs the sweep and writes findings into both the proposal document and the tracking issue body |
| `recommend` *(default)* | Does not sweep. Surfaces an advisory naming the command you can run |
| `flag-only` | Does not sweep and shows no advisory |
| `off` | Does not sweep, and additionally refuses an explicit `--prior-art` |

**An absent setting means `recommend`,** so sweeping is opt-in rather than automatic. Under `flag-only` and `off` the criterion is reported as skipped rather than failed, so an opted-out project does not see every review downgraded.

When a sweep does run, an incomplete marker is treated as absent and triggers a re-sweep. Prior art that duplicates the proposal's scope is treated as blocking and lowers the recommendation to "Needs revision" or worse — a proposal for something that already exists should not reach implementation.

If the sweep configuration cannot be read, the review warns and continues rather than failing.

If your project has no `reviewSweep` key yet, the first review writes one. A legacy `true`/`false` value keeps working and is not rewritten — `true` reads as `full`, `false` as `flag-only`.
