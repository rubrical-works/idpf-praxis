# /playwright-check

Verify Playwright is properly installed and browsers are available.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--fix` | No | Attempt to fix common issues automatically |

## Usage

```
/playwright-check
/playwright-check --fix
```

## Key Behaviors

- Checks four things in order: `package.json` existence, Playwright package version, browser installation status, and browser launch verification
- Reports each check with a pass/fail indicator; provides specific fix commands for any failures
- Output header uses the project name from `CHARTER.md` if available, otherwise a generic header
- `--fix` auto-runs `npx playwright install` for missing browsers or `npx playwright install --force` for a corrupted install; does NOT auto-run `npm install` to avoid modifying `package.json` without consent
- Gracefully handles projects with no `package.json` — reports Playwright is not installed and suggests initialization steps
