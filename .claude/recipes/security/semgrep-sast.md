---
name: semgrep-sast
description: SAST scanning via Semgrep (OWASP, injection, regex issues) — free for private repos
extensionPoints:
  - pre-validation
  - post-recommend
  - pre-gate
  - checklist-before-tag
appliesTo:
  - prepare-release:pre-validation
  - ci:post-recommend
  - merge-branch:pre-gate
  - prepare-release:checklist-before-tag
prerequisites:
  - "GitHub Actions workflow: .github/workflows/semgrep.yml"
  - "No account required for basic rulesets"
---

### Semgrep SAST Scan

Add a Semgrep GitHub Action for static analysis security testing:

```yaml
# .github/workflows/semgrep.yml
name: Semgrep

on:
  push:
    branches: ['**']
    paths-ignore: ['**/*.md', 'Docs/**', 'Releases/**']
  pull_request:
    branches: [main]
    paths-ignore: ['**/*.md', 'Docs/**', 'Releases/**']

jobs:
  semgrep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: semgrep/semgrep-action@v1
        with:
          config: >-
            p/javascript
            p/nodejs
            p/owasp-top-ten
            p/security-audit
```

**Available rulesets:** `p/javascript`, `p/nodejs`, `p/typescript`, `p/python`, `p/golang`, `p/owasp-top-ten`, `p/security-audit`

**If Semgrep findings are reported, review before proceeding.** Critical/high findings should block the release.
