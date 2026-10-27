# /prepare-beta

Tag a beta release from a feature branch without merging to main.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--skip-coverage` | No | Skip the coverage gate |
| `--skip-review` | No | Skip the branch diff review gate; the skip is recorded in the beta checklist |
| `--dry-run` | No | Preview actions without making changes; the review gate reports what it would review and runs no review |
| `--help` | No | Open this page. Takes precedence over every other argument and performs no action. |

To see this command's extension points, run `/extensions --list --command prepare-beta`.

## Usage

```
/prepare-beta
/prepare-beta --skip-coverage
/prepare-beta --dry-run
/prepare-beta --skip-review
```

## Key Behaviors

- Must be run from a feature branch — errors if on `main`
- Four phases: Analysis (commits + version recommendation) → Validation (including the branch diff review gate) → Prepare (CHANGELOG update) → Tag
- **Branch diff review gate.** Before any version file or CHANGELOG changes, the beta checks that the branch was reviewed with `/code-review --diff` and that the review is current, using the review record `/code-review --diff` leaves in `.code-review-manifest.json`. The gate is shared with `/prepare-release`, so both commands apply the same rules. A current record is used as is, so a branch you already reviewed is not reviewed twice. The record stays current when it matches the current `HEAD`, or when every commit since the review changes only review output (`.code-review-manifest.json` and `Construction/Code-Reviews/`); uncommitted changes outside review output must have been included in the review. When the record is missing or stale, the gate says why and which files changed, then offers to run the diff review now, in the same run, and re-check it — or to stop so you can run `/code-review --diff` yourself. With more than 40 files to review, stopping is the recommended option (`--batch N` splits the review). A branch whose changes include no reviewable source file (tests or docs only) passes without a review. A finding the branch **introduced** at high severity stops the beta; introduced medium findings ask whether to continue; low and info findings are reported only. Findings tagged `pre-existing` (outside the lines the branch changed) are reported but never block. A branch with no changed files passes the gate, naming the base it compared against. `--skip-review` skips the gate and the skip is recorded; `--dry-run` reports whether the gate would use the existing record or run a review, and runs nothing
- Asks user to confirm the beta version (e.g., `v1.0.0-beta.1`) before tagging; asks again before pushing the tag
- Every confirmation shows its context first (the analysis, validation or tag details as a table), then asks a one-line question with a preview of what each choice does — for example *Tag beta* (create and push the tag, which cannot be undone) or *Stop* (nothing changed)
- **Announces the beta tag to every peer before it happens.** Other sessions in this working directory are told first, since nothing after that point can be taken back. It is a forced broadcast: every reachable session gets it, including a running `/overwatch`, even when `broadcast` is off. Only turning messaging off entirely suppresses it. The announcement is advisory: a failed send is reported and the operation continues.
- Tags the feature branch directly — no merge to main; after testing, use `/prepare-release` for the official release
- Waits for CI workflows after tagging if any `.github/workflows/*.yml` files are found; skips CI wait if no workflows exist
- Extension points available at `pre-phase-1`, `post-analysis`, `pre-validation`, `post-validation`, `post-prepare`, `pre-commit`, `pre-tag`, `post-tag`
- Version recommendation runs with `--prerelease`, which is what keeps the suggestion on the beta line: from `v0.20.0-beta.4` it advances the counter to `-beta.5`; from `v0.20.0-alpha.3` it opens `-beta.1` holding the core version; from a stable `v0.20.0` it bumps the core by commit analysis to `v0.21.0-beta.1`. Use `--prerelease=rc` for a different identifier.
- The two analysis scripts classify differently by design: `analyze-commits.js` counts conventional-commit prefixes only, while the version recommendation also resolves issue labels and keywords. A reported `feat: 0` alongside a "new feature(s)" reason is expected, not a contradiction.
