# /resolve-review

Parse the latest review findings on an issue and systematically resolve each one.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | Yes | Issue number to resolve findings for (e.g., `#42` or `42`) |
| `--prior-art` | No | Forwarded verbatim to the re-review, which runs the sweep. `/resolve-review` performs no sweep itself |
| `--help` | No | Open this page. Takes precedence over every other argument and performs no action. |

## Usage

```
/resolve-review #42
```

## Key Behaviors

- Works with findings from `/review-issue`, `/review-proposal`, `/review-prd`, and `/review-test-plan`
- Auto-fixable findings (missing priority, missing labels) are applied immediately
- Findings requiring user input are presented one at a time with Accept / Provide alternative / Skip options. Body-modifying content repairs (a missing AC section, missing repro steps, a proposed solution, a format issue) are asked here, never auto-fixed, with the exact body change shown in the Accept preview
- Stops early with "Already ready — no action needed." if the issue recommendation already starts with "Ready for"
- **Pre-check before the re-review**: when any body edit was applied, a deterministic check runs over the edited body — paths, issues or slash commands it names that do not exist (a command named beside an open issue counts as proposed, not missing), declared-scope problems, acceptance criteria that depend on a still-open issue, and lines that still mention something the edit removed elsewhere. Hits with one obvious fix are offered for repair; the rest are left to the re-review. The closing report counts hits found and fixed
- After all findings are resolved, automatically triggers one re-review via `/review-issue #N --force --step-wise` — appending `--prior-art` when that flag was passed to this command — and reports the updated recommendation. `--step-wise` keeps it to exactly one resolve cycle: if findings remain, run `/resolve-review` again
- If the user declines all fixes, reports "No changes made" and stops without re-reviewing
