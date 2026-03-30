# /prepare-beta

Tag a beta release from a feature branch without merging to main.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--skip-coverage` | No | Skip the coverage gate |
| `--dry-run` | No | Preview actions without making changes |
| `--help` | No | Show extension points |

## Usage

```
/prepare-beta
/prepare-beta --skip-coverage
/prepare-beta --dry-run
```

## Key Behaviors

- Must be run from a feature branch — errors if on `main`
- Four phases: Analysis (commits + version recommendation) → Validation → Prepare (CHANGELOG update) → Tag
- Asks user to confirm the beta version (e.g., `v1.0.0-beta.1`) before tagging; asks again before pushing the tag
- Tags the feature branch directly — no merge to main; after testing, use `/prepare-release` for the official release
- Waits for CI workflows after tagging if any `.github/workflows/*.yml` files are found; skips CI wait if no workflows exist
- Extension points available at `pre-phase-1`, `post-analysis`, `pre-validation`, `post-validation`, `post-prepare`, `pre-commit`, `pre-tag`, `post-tag`
