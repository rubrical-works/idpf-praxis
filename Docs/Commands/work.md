# /work

Start working on one or more issues with branch validation, context gathering, and TDD dispatch. The execution logic lives in the auto-loaded execution rule at `.claude/rules/08-work-execution.md`.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | Yes (one of) | Single issue number (e.g., `#42` or `42`) |
| `#issue #issue...` | | Multiple issue numbers (e.g., `#42 #43 #44`) |
| `--status <status>` | | All issues in a given status (e.g., `--status backlog`) |
| `--assign` | No | Auto-assign issue(s) to current branch before starting |
| `--nonstop` | No | For epics/branch trackers: skip per-sub-issue STOP and process all sub-issues continuously to `in_review` |
| `--wait` | No | Wait for pending CI to pass before beginning work |
| `--concurrent` | No | For epics/branch trackers: run file-disjoint sub-issues at once in framework-owned worktrees, grouped by their `**Depends on:**` lines, each merged back through a review gate (see Concurrent Mode) |
| `--agents N` | No | How many agents of any kind may run at once — implementers, their reviewers and fix cycles share the cap — and how many test runs; default 3. Requires `--concurrent` |
| `--no-review` | No | Skip the merge-back gate's independent reviewer (Tier 3); the mechanical checks and the parent's own read still run, and the skip is reported. Requires `--concurrent` |
| `--help` | No | Open this page. Takes precedence over every other argument and performs no action. |

**Retired forms:** `all in <status>` is no longer accepted; use `--status <status>`. The `work all in <status>` trigger phrase still works.

## Usage

```
/work #42
/work #42 #43 #44
/work --status backlog
/work #42 --assign
/work #100 --nonstop
/work #100 --concurrent
/work #100 --nonstop --concurrent --agents 2 --no-review
```

## Concurrent Mode

`--concurrent` runs the sub-issues of an epic or branch tracker at the same time when they cannot collide. The plan comes from what each sub-issue declares: members whose `**Files to modify:**` blocks are disjoint and whose `**Depends on:**` lines are already satisfied form a group of at most `--agents N`, in dependency order. Anything the plan cannot prove safe — no declared scope, an overlap with another member, an always-protected path, a dependency that is unreadable or not yet merged — goes to a **sequential tail** and is worked one at a time, exactly as `/work` always has.

Each group member gets its own worktree and its own agent, which does only the TDD cycle there. The parent session keeps everything else: the review-state and status gates, the peer announcements, the merge back onto your branch, the status moves and the STOP. Before a member merges, the **Merge-Back Review Gate** checks its branch three ways — every commit carries `Refs #N` and nothing is left uncommitted, the parent reads the diff file by file, and an independent reviewer agent reads it again without the implementer's summary. A failed gate gets exactly one fix cycle; a second failure halts the run with the worktree kept for you.

| Mode | STOP cadence | What you see |
|---|---|---|
| `--concurrent` | **One STOP per group**, after the group has merged back and every member is `in_review`; the tail then stops per member as usual | A group report, then the usual per-member reports |
| `--nonstop --concurrent` | **No STOP** between groups or in the tail | Each member reported as it reaches `in_review`, then the nonstop summary, which repeats any leftover-worktree warning |

**Fallback to sequential:** a plan with **zero groups** — every member fell to the tail — runs exactly as sequential `/work` and tells you why no group formed. Without `--concurrent` nothing here applies; `--agents` or `--no-review` on their own are reported as ignored, not treated as errors. Which flags to pick, and how to recover from a halt: [Workflow Guide, Stage 8](../01-Getting-Started/03-Workflow-Guide.md#stage-8-work-work) and [When Things Go Wrong](../01-Getting-Started/05-When-Things-Go-Wrong.md).

## Key Behaviors

- **Hybrid shell + rule architecture**: the shell spec (`CommandsSrc/work.md`) covers arguments, prerequisites, and errors; the workflow lives in the auto-loaded rule `.claude/rules/08-work-execution.md` so it is always resident in context.
- **Two-phase task creation**: a single preamble task is created before routing; remaining workflow tasks are materialized only after the preamble confirms the workflow path (prevents orphaned tasks on redirect/early exit).
- Validates issue existence and branch assignment via `work-preamble.js`; stops with an error if the issue is unassigned (use `--assign` or `/assign-branch` first).
- **Branch sync check**: after the preamble and before the first commit, compares the branch with its upstream once per invocation. *Behind* with no overlapping local edits offers a fast-forward pull, and declining leaves the tree untouched. *Behind* with overlapping edits reports the paths and asks whether to continue or stop. *Diverged* reports and stops; recover with `/sync-branch`, or with `/done` on the issue still in review, then re-run `/work`.
- Detects epic issues (by label) and routes to epic sub-issue processing in ascending numeric order; sub-issues already in `in_review` or `done` are skipped.
- **Epic complexity assessment** (`--nonstop` on epics): `epic-complexity.js` classifies the epic; `classification == "functional"` sets `strictTDD = true`, which makes the Sub-Agent Review Gate mandatory rather than post-hoc.
- Follows RED-GREEN-REFACTOR TDD cycle: one commit per AC (or per grouped deliverable) using `Refs #N` before moving to the next AC — this commit-per-deliverable gate is mandatory.
- **Review-State Gate**: before the first acceptance criterion of an issue is worked — and independently for each sub-issue of an epic or branch tracker — the issue's review state is classified. *Never reviewed* stops and offers `/review-issue #N` (batch, epic, branch tracker and `--nonstop` warn and proceed instead); *reviewed with findings unresolved* stops and offers `/resolve-review #N`, and halts outright under `--nonstop`; *reviewed clean* and *indeterminate* proceed without prompting. Declining changes nothing — no label, status, or body edit — so review stays advisory.
- **Pre-Work Status Gate**: before the first acceptance criterion of any issue is worked, re-verifies the issue is `in_progress` and moves it if not. Keyed to that workflow moment rather than to spawning an Agent, so it fires identically whether work happens inline or via a sub-agent, and fires again for each sub-issue of an epic or branch tracker as its turn begins.
- **Sub-Agent Review Gate**: after any Agent returns, re-reads every modified file to verify changes match the current AC. Agent summaries and passing tests do not satisfy this gate — file content must be read.
- After all ACs pass, checks each criterion: auto-verifiable ACs are checked off, unverifiable ACs (manual/external) are automatically extracted to `QA: ...` sub-issues without prompting.
- Appends a "Files Changed" section to the issue body, categorized by Added/Modified/Deleted and Source/Tests.
- **Full-suite regression sweep** runs once per sub-issue between Step 4c and Step 5 to catch cross-cutting regressions scoped per-AC tests miss. It runs every verification command the project declares in `framework-config.json` (`testing.suites[]`, `verificationCommands`, or the single `testCommand`) and reports each one separately as `passed`, `tests failed`, `prerequisite failed` or `runner not found`. `runner not found` means the runner's executable is missing on this machine, so the fix is to install it. Any non-passing verdict blocks the move to `in_review`. When nothing is declared, the gap is reported and the sweep does not run.
- Moves issue to `in_review` and then **STOPS** — waits for user to say "done" or run `/done #N`.
- In `--nonstop` mode, all sub-issues are processed to `in_review` without stops; any test failure, AC failure, or `gh pmu` error halts immediately with a resume report.
- **Never** use `--force` to bypass unchecked AC boxes on issues you implemented this session; verify ACs properly via Step 4 instead.
