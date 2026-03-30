# /resolve-review

Parse the latest review findings on an issue and systematically resolve each one.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | Yes | Issue number to resolve findings for (e.g., `#42` or `42`) |

## Usage

```
/resolve-review #42
```

## Key Behaviors

- Works with findings from `/review-issue`, `/review-proposal`, `/review-prd`, and `/review-test-plan`
- Auto-fixable findings (missing priority, missing labels, format issues) are applied immediately; body-modifying changes require confirmation before applying
- Findings requiring user input are presented one at a time with Accept / Provide alternative / Skip options
- Stops early with "Already ready — no action needed." if the issue recommendation already starts with "Ready for"
- After all findings are resolved, automatically triggers a re-review via `/review-issue #N --force` and reports the updated recommendation
- If the user declines all fixes, reports "No changes made" and stops without re-reviewing
