# /work

Start working on one or more issues with branch validation, auto-TODO extraction, and TDD dispatch.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | Yes (one of) | Single issue number (e.g., `#42` or `42`) |
| `#issue #issue...` | | Multiple issue numbers (e.g., `#42 #43 #44`) |
| `all in <status>` | | All issues in a given status (e.g., `all in backlog`) |
| `--assign` | No | Auto-assign issue(s) to current branch before starting |
| `--nonstop` | No | For epics/branch trackers: skip per-sub-issue STOP and process all sub-issues continuously to `in_review` |
| `--wait` | No | Wait for pending CI to pass before beginning work |

## Usage

```
/work #42
/work #42 #43 #44
/work all in backlog
/work #42 --assign
/work #100 --nonstop
```

## Key Behaviors

- Validates issue existence and branch assignment via `work-preamble.js`; stops with an error if the issue is unassigned (use `--assign` or `/assign-branch` first)
- Detects epic issues (by label) and routes to epic sub-issue processing in ascending numeric order; sub-issues already in `in_review` or `done` are skipped
- Follows RED-GREEN-REFACTOR TDD cycle: one commit per AC using `Refs #N` before moving to the next AC — this commit gate is mandatory
- After all ACs pass, checks each criterion: auto-verifiable ACs are checked off, unverifiable ACs (manual/external) are automatically extracted to `QA: ...` sub-issues without prompting
- Appends a "Files Changed" section to the issue body, categorized by Added/Modified/Deleted and Source/Tests
- Moves issue to `in_review` and then **STOPS** — waits for user to say "done" or run `/done #N`
- In `--nonstop` mode, all sub-issues are processed to `in_review` without stops; any test failure, AC failure, or `gh pmu` error halts immediately with a resume report
- **Never** use `--force` to bypass unchecked AC boxes on issues you implemented this session; verify ACs properly via Step 4 instead
