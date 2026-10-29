---
name: ci-gate-before-merge
description: Block merge/tag until CI passes
extensionPoints:
  - post-pr-create
  - pre-tag
  - post-prepare
appliesTo:
  - prepare-release:post-pr-create
  - prepare-beta:post-prepare
  - prepare-beta:pre-tag
  - merge-branch:post-pr-create
prerequisites:
  - wait-for-ci.js (included with framework)
  - "GitHub Actions workflows configured (run /ci to check status)"
---

### Wait for CI

```bash
node .claude/scripts/shared/wait-for-ci.js --branch $(git branch --show-current) --timeout 900
```

**If CI fails, STOP and report the error.**

Every target runs on the branch being released, so the checked-out branch is the run to wait on. `/prepare-release`'s pre-tag point is deliberately not a target: it runs after the release has merged and `main` is checked out, where the command's own merge-commit gate already waits on the merge commit by SHA. `/prepare-beta`'s pre-tag point is a target — the beta path never leaves its branch.

Common failures:
- Build errors: Check compilation output
- Test failures: Run tests locally to debug
- Lint errors: Run linter with --fix
