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
- Version recommendation runs with `--prerelease`, which is what keeps the suggestion on the beta line: from `v0.20.0-beta.4` it advances the counter to `-beta.5`; from `v0.20.0-alpha.3` it opens `-beta.1` holding the core version; from a stable `v0.20.0` it bumps the core by commit analysis to `v0.21.0-beta.1`. Use `--prerelease=rc` for a different identifier.
- The two analysis scripts classify differently by design: `analyze-commits.js` counts conventional-commit prefixes only, while the version recommendation also resolves issue labels and keywords. A reported `feat: 0` alongside a "new feature(s)" reason is expected, not a contradiction.
