---
name: coverage-report
description: Generate coverage report without blocking
extensionPoints:
  - post-validation
  - post-prepare
appliesTo:
  - prepare-release:post-validation
  - prepare-beta:post-validation
  - prepare-release:post-prepare
  - prepare-beta:post-prepare
prerequisites:
  - Coverage tool configured
  - (Optional) Codecov or similar service
  - "CI integration: /ci --add coverage-upload"
technology:
  - node
---

### Coverage Report

Generate coverage report for review:

```bash
# Example: Generate HTML report
nyc report --reporter=html --report-dir=coverage
```

Report location: `coverage/index.html`

### Upload to Codecov (optional)

Codecov's Bash uploader is deprecated; uploads go through the Codecov CLI (https://docs.codecov.com/docs/codecov-uploader). Download the binary, verify it, then upload — never pipe a remote script into a shell:

```bash
# One-time: import Codecov's signing key (key ID ED779869 — compare the fingerprint with the docs)
curl -s https://keybase.io/codecovsecops/pgp_keys.asc | gpg --no-default-keyring --keyring trustedkeys.gpg --import

curl -Os https://cli.codecov.io/latest/linux/codecov
curl -Os https://cli.codecov.io/latest/linux/codecov.SHA256SUM
curl -Os https://cli.codecov.io/latest/linux/codecov.SHA256SUM.sig
gpgv codecov.SHA256SUM.sig codecov.SHA256SUM
shasum -a 256 -c codecov.SHA256SUM
chmod +x codecov

./codecov upload-process --fail-on-error -f coverage/lcov.info
```

The token is read from `CODECOV_TOKEN`. Other platforms use `macos/codecov` or `windows/codecov.exe`; `pip install codecov-cli` installs the same CLI as `codecovcli`. Do not block the release on an upload failure.
