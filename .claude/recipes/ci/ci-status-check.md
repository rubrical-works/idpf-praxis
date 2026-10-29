---
name: ci-status-check
description: Quick CI status without blocking workflow
extensionPoints:
  - post-analysis
  - post-prepare
appliesTo:
  - prepare-release:post-analysis
  - prepare-beta:post-analysis
  - prepare-release:post-prepare
  - prepare-beta:post-prepare
prerequisites:
  - gh CLI (GitHub CLI)
  - "GitHub Actions workflows configured (run /ci to check status)"
---

### Check CI Status

```bash
gh run list --branch "$(git branch --show-current)" --limit 1 --json status,conclusion,name,headSha
```

Report status but do not block workflow. The query is scoped to the checked-out branch: without `--branch` (or `--commit`), `gh run list` returns the newest run repo-wide, which may belong to an unrelated branch.
