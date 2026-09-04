# /work

Start working on one or more issues with branch validation, context gathering, and TDD dispatch. The execution logic lives in the auto-loaded execution rule at `.claude/rules/08-work-execution.md`.

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

- **Hybrid shell + rule architecture**: the shell spec (`CommandsSrc/work.md`) covers arguments, prerequisites, and errors; the workflow lives in the auto-loaded rule `.claude/rules/08-work-execution.md` so it is always resident in context.
- **Two-phase task creation**: a single preamble task is created before routing; remaining workflow tasks are materialized only after the preamble confirms the workflow path (prevents orphaned tasks on redirect/early exit).
- Validates issue existence and branch assignment via `work-preamble.js`; stops with an error if the issue is unassigned (use `--assign` or `/assign-branch` first).
- Detects epic issues (by label) and routes to epic sub-issue processing in ascending numeric order; sub-issues already in `in_review` or `done` are skipped.
- **Epic complexity assessment** (`--nonstop` on epics): `epic-complexity.js` classifies the epic; `classification == "functional"` sets `strictTDD = true`, which makes the Sub-Agent Review Gate mandatory rather than post-hoc.
- Follows RED-GREEN-REFACTOR TDD cycle: one commit per AC (or per grouped deliverable) using `Refs #N` before moving to the next AC — this commit-per-deliverable gate is mandatory.
- **Review-State Gate**: before the first acceptance criterion of an issue is worked — and independently for each sub-issue of an epic or branch tracker — the issue's review state is classified. *Never reviewed* stops and offers `/review-issue #N` (batch, epic, branch tracker and `--nonstop` warn and proceed instead); *reviewed with findings unresolved* stops and offers `/resolve-review #N`, and halts outright under `--nonstop`; *reviewed clean* and *indeterminate* proceed without prompting. Declining changes nothing — no label, status, or body edit — so review stays advisory.
- **Pre-Work Status Gate**: before the first acceptance criterion of any issue is worked, re-verifies the issue is `in_progress` and moves it if not. Keyed to that workflow moment rather than to spawning an Agent, so it fires identically whether work happens inline or via a sub-agent, and fires again for each sub-issue of an epic or branch tracker as its turn begins.
- **Sub-Agent Review Gate**: after any Agent returns, re-reads every modified file to verify changes match the current AC. Agent summaries and passing tests do not satisfy this gate — file content must be read.
- After all ACs pass, checks each criterion: auto-verifiable ACs are checked off, unverifiable ACs (manual/external) are automatically extracted to `QA: ...` sub-issues without prompting.
- Appends a "Files Changed" section to the issue body, categorized by Added/Modified/Deleted and Source/Tests.
- **Full-suite regression sweep** runs once per sub-issue between Step 4c and Step 5 (`npx jest --no-coverage`) to catch cross-cutting regressions scoped per-AC tests miss.
- Moves issue to `in_review` and then **STOPS** — waits for user to say "done" or run `/done #N`.
- In `--nonstop` mode, all sub-issues are processed to `in_review` without stops; any test failure, AC failure, or `gh pmu` error halts immediately with a resume report.
- **Never** use `--force` to bypass unchecked AC boxes on issues you implemented this session; verify ACs properly via Step 4 instead.
