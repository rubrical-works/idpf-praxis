---
name: dotnet-tests
description: Run .NET tests with dotnet CLI
extensionPoints:
  - pre-validation
  - pre-gate
appliesTo:
  - prepare-release:pre-validation
  - prepare-beta:pre-validation
  - merge-branch:pre-gate
prerequisites:
  - "*.csproj or *.sln"
---

### Run Tests

Run the verification set the project declares (`testing.suites[]`, `verificationCommands`, or `testCommand` in `framework-config.json`), so the release is gated on the same commands `/work` sweeps:

```bash
node -e "console.log(JSON.stringify(require('./.claude/scripts/shared/lib/framework-config.js').resolveVerificationCommands(process.cwd())))"
```

- `source` is `testing`, `verificationCommands` or `testCommand` → run **every** command in `commands`, in order, and report each result separately. Any failure fails the step.
- `source` is `unreadable` → **STOP**: `framework-config.json` does not parse; fix it and re-run.
- `source` is `none` → nothing is declared; run this recipe's fallback:

```bash
dotnet test
```

**If tests fail, STOP and fix before continuing.**

**Design (#3450):** one recipe per language, each running the project's declared set first and its language command only as a fallback. The per-language recipes stay so `/charter` keeps suggesting them by technology; the declared set comes first so a release is never gated on a different command than the project declares.
