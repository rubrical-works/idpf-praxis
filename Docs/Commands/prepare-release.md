# /prepare-release

Validate, create a PR to main, merge, and tag for deployment.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `[version]` | No | Version to release (e.g., `v1.2.0`) |
| `--skip-coverage` | No | Skip the coverage gate |
| `--dry-run` | No | Preview actions without making changes |
| `--help` | No | Show extension points |

## Usage

```
/prepare-release
/prepare-release v1.2.0
/prepare-release --dry-run
```

## Key Behaviors

- If run from `main`, automatically creates a `release/vX.Y.Z` branch before proceeding; if already on a release branch, continues in place
- Five phases: Analysis → Validation → Prepare (CHANGELOG, README, version files) → Git Operations (PR, merge, tag) → Close & Cleanup (deployment comment, branch deletion, GitHub Release)
- Multiple confirmation checkpoints: version, validation passed, PR approval, ready to tag, deployment verified
- Checks for incomplete issues on the current branch before starting; does not proceed past CI failures
- If `update-release-notes.js` already created the GitHub release after tagging (Step 4.8), skips duplicate creation in Step 5.3
- Extension points available at `pre-phase-1`, `post-analysis`, `pre-validation`, `post-validation`, `pre-commit`, `post-prepare`, `post-pr-create`, `pre-tag`, `post-tag`, `pre-close`, `post-close`
