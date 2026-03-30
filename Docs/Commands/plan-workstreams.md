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

## Usage

```
/plan-workstreams #100 #101 #102
/plan-workstreams #100 #101 --streams 2 --dry-run
/plan-workstreams --cancel
```

## Key Behaviors

- Analyzes codebase module boundaries and computes pairwise conflict risk (HIGH/LOW/NONE) between epics; HIGH-risk pairs are co-located in the same workstream
- Presents a proposed grouping table and requires user confirmation; HIGH-risk pairs cannot be split when the user adjusts the plan
- On confirmation, creates workstream branches via `gh pmu branch start`, assigns epics, and writes `.workstreams.json` metadata
- Outputs copy-pasteable `git worktree add` commands and a recommended merge order after branch creation
- `--cancel` unwinds branches in reverse merge order, prompts for epic disposition (return to source, clear to backlog, or reassign), and reminds about stale git worktrees
