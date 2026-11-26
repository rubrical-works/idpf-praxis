# /resolve-review

Parse the latest review findings on an issue and systematically resolve each one.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | Yes | Issue number to resolve findings for (e.g., `#42` or `42`) |
| `--prior-art` | No | Forwarded verbatim to the re-review, which runs the sweep. `/resolve-review` performs no sweep itself |
| `--accept` | No | Apply each user-input suggestion the shared classifier accepts without asking, and ask only about the ones it holds, each with the reason it was held. Applies to this command's own resolution pass only — never forwarded to the re-review. Boolean — takes no value |
| `--help` | No | Open this page. Takes precedence over every other argument and performs no action. |

## Usage

```
/resolve-review #42
/resolve-review #42 #43
/resolve-review #42 --accept
/resolve-review #42 --prior-art
```

## Key Behaviors

- Works with findings from `/review-issue`, `/review-proposal`, `/review-prd`, and `/review-test-plan`
- Multiple issues are resolved one at a time: each issue's cycle ends with its re-review verdict before the next begins
- Stops early with "Already ready — no action needed." if the issue recommendation already starts with "Ready for". If the latest review was Ready but the issue body has changed since, it says so and names the re-review to run instead — there are no findings to resolve
- Auto-fixable findings (missing priority, missing labels) are applied immediately
- Findings requiring user input are presented one at a time with Accept / Provide alternative / Skip options. Body-modifying content repairs (a missing AC section, missing repro steps, a proposed solution, a format issue) are asked here, never auto-fixed
- **Every Accept preview shows the change.** It opens with a two-line summary (`Changes:` and `Effect:`), then the exact text that will be written (AFTER), then the text it replaces (BEFORE). When the change is too long for the preview, AFTER is clipped with a `… (+N more lines)` marker and the complete change is written to a file whose path is named in the option description. The finding is also printed in full in the transcript, so it can be read after the dialog closes
- **A suggestion that claims runtime behavior is run first.** When a suggestion asserts what a command does, the command is run and its output shown with the finding before you are asked; if it cannot be run, the finding is labeled unverified with the reason
- **Under `--accept`**, findings are sorted before the first prompt. A finding is held — and asked about as usual, with the hold reason shown — when its criterion is one that always asks, when it claims runtime behavior that could not be run, or when there is a specific judgment reason to ask (for example two plausible fixes with different intent, or a change that would discard text you wrote). Every other finding is applied without a prompt and reported as `✓ auto-accepted`. The closing report lists each auto-accepted finding and each held one with its reason. Without `--accept`, every user-input finding is asked
- Suggestions from the review that are not tied to a criterion are listed verbatim and left for you to act on
- **Pre-check before the re-review**: when any body edit was applied, a deterministic check runs over the edited body — paths, issues or slash commands it names that do not exist (a command named beside an open issue counts as proposed, not missing), declared-scope problems, acceptance criteria that depend on a still-open issue, and lines that still mention something the edit removed elsewhere. Hits with one obvious fix are offered for repair; the rest are left to the re-review. The closing report counts hits found and fixed
- After all findings are resolved, automatically triggers one re-review via `/review-issue #N --force --step-wise` — appending `--prior-art` when that flag was passed to this command — and reports the updated recommendation with the issue's URL. `--step-wise` keeps it to exactly one resolve cycle: if findings remain, run `/resolve-review` again
- If the user declines all fixes, reports "No changes made" and stops without re-reviewing
