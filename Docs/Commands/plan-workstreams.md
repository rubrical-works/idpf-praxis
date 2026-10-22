# /plan-workstreams

Plan concurrent workstreams for parallel development across multiple epics.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<epic-numbers>` | Yes (plan mode) | Two or more epic issue numbers (e.g., `#100 #101 #102`) |
| `--streams N` | No | Number of concurrent workstreams (default: 2) |
| `--dry-run` | No | Show analysis and grouping without creating branches |
| `--prefix <prefix>` | No | Branch prefix for workstream branches (default: `workstream/`) |
| `--cancel` | No | Cancel active workstream plan and clean up metadata |
| `--force` | No | Force cancel even when commits exist on workstream branches (requires `--cancel`) |
| `--profile` | No | Also run the collision profiler over git history and report its output beside the conflict analysis. Advisory; writes nothing |
| `--min-pairs N` | No | Passed to the profiler: how many issue pairs must have touched a file for it to count as an accumulator (default 2; requires `--profile`) |
| `--help` | No | Open this page. Takes precedence over every other argument and performs no action. |

## Usage

```
/plan-workstreams #100 #101 #102
/plan-workstreams #100 #101 --streams 2 --dry-run
/plan-workstreams #100 #101 --profile --min-pairs 3
/plan-workstreams --cancel
```

## Workstreams and Concurrent Runs

`/plan-workstreams` and `/work --concurrent` solve different sizes of the same problem:

| | `/plan-workstreams --streams N` | `/work <epic> --concurrent --agents N` |
|---|---|---|
| Unit of parallelism | Whole epics, each on its own branch and worktree you create | Sub-issues of one epic, each in a worktree the framework creates and removes |
| What N caps | Number of workstream branches | Number of agents of any kind running at once, and of test runs |
| Who works it | You, one session per workstream | One parent session, spawning a member agent per sub-issue |
| Merge | You merge branches in the recommended order | Each member merges back through the Merge-Back Review Gate after its group |
| Conflict analysis | Declared modules per epic (HIGH/LOW/NONE) | Declared `**Files to modify:**` per sub-issue, plus the `**Depends on:**` graph |

Use workstreams to split unrelated epics across people or sessions; use `--concurrent` inside one epic once its stories declare disjoint files. The two compose: plan workstreams first, then run `--concurrent` within each.

**The collision profiler** (`--profile`) measures, from your git history, how often two issues touched the same file and which files cause it — the files Phase 1 of a concurrent setup reconciles by kind (accumulators, derived artifacts). It proposes a candidate `concurrency` block for `framework-config.json` and never writes it; copy what you accept by hand. A history with no issue references, or a shallow clone, gives an empty profile that says why rather than a 0% rate.

## Key Behaviors

- Analyzes codebase module boundaries and computes pairwise conflict risk (HIGH/LOW/NONE) between epics; HIGH-risk pairs are co-located in the same workstream
- Presents a proposed grouping table and requires user confirmation; HIGH-risk pairs cannot be split when the user adjusts the plan
- On confirmation, creates workstream branches via `gh pmu branch start`, assigns epics, and writes `.workstreams.json` metadata
- Outputs copy-pasteable `git worktree add` commands and a recommended merge order after branch creation
- `--cancel` unwinds branches in reverse merge order, prompts for epic disposition (return to source, clear to backlog, or reassign), and reminds about stale git worktrees — printing the unlink-first teardown command (`worktree-teardown.js`) for each, never a raw `git worktree remove`, which deletes through gitignored junctions
