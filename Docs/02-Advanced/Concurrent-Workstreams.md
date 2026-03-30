# Concurrent Workstreams

**Date:** 2026-02-21
**Topic:** Planning and executing multiple epics in parallel across separate branches

---

## What Are Workstreams?

A workstream is a dedicated branch where one or more epics are developed concurrently alongside other workstreams. Instead of working epics sequentially on a single branch — finish Epic A, then start Epic B — workstreams let you develop them in parallel:

```
Sequential (default)                Concurrent (workstreams)
────────────────────                ────────────────────────
main ─── Epic A ─── Epic B ──►     main ─┬─ workstream/1 (Epic A) ─┐
                                         ├─ workstream/2 (Epic B) ─┤── merge in order
                                         └─────────────────────────┘
```

The `/plan-workstreams` command analyzes your epics, detects module conflicts between them, groups them into workstreams that minimize merge risk, and creates the branches. You then work each workstream independently and merge them back in a recommended order.

---

## When to Use Workstreams

Workstreams are useful when all three conditions are met:

1. **Multiple epics are ready to work.** You have two or more epics in your backlog, each with stories ready for implementation.
2. **The epics are mostly independent.** They touch different parts of the codebase. If two epics both modify the same core module, they belong in the same workstream (the command handles this automatically).
3. **You want to parallelize.** Either you have multiple developers, multiple machines, or you want to use git worktrees to context-switch between epics without stashing.

### When NOT to Use Workstreams

- **Single epic with many stories** — Use standard `/work` with sequential story processing instead.
- **Epics with deep interdependencies** — If Epic B depends on code that Epic A writes, they should be worked sequentially.
- **Tightly coupled modules** — If everything shares everything, workstreams add overhead without reducing conflict risk.

---

## The Workflow

### Step 1: Plan

```
/plan-workstreams #100 #101 #102
```

The command:
1. Validates that each issue is an open epic
2. Reads epic descriptions and sub-issues to identify which modules each epic touches
3. Scans your codebase directory structure
4. Builds a **conflict risk matrix** showing pairwise overlap between epics
5. Proposes workstream groupings and presents them for your approval

You can adjust the groupings — move epics between workstreams — before confirming. The command prevents you from splitting HIGH-risk pairs into separate workstreams.

### Step 2: Work Each Workstream

After planning, you have separate branches:

```
workstream/1  ← Epic #100, Epic #101
workstream/2  ← Epic #102
```

Work each branch using the normal `/work #N` cycle. Each workstream is an independent development context with its own commits and tests.

### Step 3: Merge in Order

When workstreams are complete, merge them back to main in the recommended order:

```
/merge-branch   (on workstream/1 — merge first)
/merge-branch   (on workstream/2 — merge second, resolving any conflicts)
```

The merge order is chosen to minimize conflict resolution: the workstream with the most shared modules goes first, so subsequent merges only need to resolve against the already-merged code.

### Step 4: Cleanup

After all workstreams are merged, the `.workstreams.json` metadata file shows all streams as `merged`. The metadata can be committed or deleted — it's informational at that point.

---

## Conflict Risk Analysis

The core value of `/plan-workstreams` is its module overlap analysis. When you run it, the command examines each epic's scope and produces a conflict risk matrix:

| | Epic #100 | Epic #101 | Epic #102 |
|---|---|---|---|
| **Epic #100** | — | HIGH | NONE |
| **Epic #101** | HIGH | — | LOW |
| **Epic #102** | NONE | LOW | — |

### Risk Levels

| Level | Meaning | Grouping Rule |
|-------|---------|---------------|
| **HIGH** | Epics share primary modules (e.g., both modify `src/auth/`) | Must be in the same workstream |
| **LOW** | Epics share only utility modules (`lib/`, `utils/`, `shared/`) | Can be in separate workstreams (utility conflicts are typically minor) |
| **NONE** | No module overlap | Safe to separate |

HIGH-risk pairs are automatically co-located. This prevents the worst merge conflicts — where two branches make competing structural changes to the same module.

### How Modules Are Detected

The command extracts module hints from two sources:
- **Epic descriptions and story bodies** — File paths, directory references, component names mentioned in the text
- **Codebase directory scan** — Actual directory structure matched against the extracted hints

This is heuristic, not exhaustive. You can adjust groupings manually if you know the codebase better than the analysis suggests.

---

## Solo Developer Pattern

You don't need a team to benefit from workstreams. A solo developer can use git worktrees to maintain separate working directories for each workstream:

### Setup

After `/plan-workstreams` creates the branches, the command outputs copy-pasteable worktree commands:

```bash
git worktree add ../my-project-ws1 workstream/1
git worktree add ../my-project-ws2 workstream/2
```

Each worktree is a full working directory with its own branch checked out. You can open separate terminals (or separate Claude Code sessions) in each.

### Working Pattern

```
Terminal 1 (worktree: workstream/1)     Terminal 2 (worktree: workstream/2)
───────────────────────────────         ───────────────────────────────────
> runp_claude                           > runp_claude
/work #100                              /work #102
  (TDD cycle on Epic A stories...)        (TDD cycle on Epic C stories...)
/done #100                              /done #102
/work #101                              (workstream/2 complete)
  ...
```

### Why This Helps Solo Developers

- **Context switching without stashing.** Each worktree has its own branch state. Switch between epics by switching terminals, not by stashing and checking out.
- **Parallel test runs.** Run tests in one worktree while coding in another.
- **Reduced cognitive load.** Each terminal is focused on one epic's scope. No accidentally editing files that belong to another epic.
- **Natural break points.** Finish a story in one workstream, switch to the other while thinking about the next story.

### Merging (Solo)

When both workstreams are ready, merge in the recommended order from one terminal:

```bash
cd /path/to/main-repo
git checkout workstream/1
/merge-branch
git checkout workstream/2
/merge-branch
```

Then clean up worktrees:

```bash
git worktree remove ../my-project-ws1
git worktree remove ../my-project-ws2
```

---

## Team Pattern

For teams of 2-5 developers, workstreams provide structured branch ownership:

### Assignment

```
Developer A → workstream/1 (Epics #100, #101)
Developer B → workstream/2 (Epic #102)
```

Each developer works their assigned branch using the normal IDPF workflow. The conflict risk analysis ensures they're working on independent modules, minimizing merge conflicts.

### Coordination

- **`.workstreams.json`** tracks which epics are on which branches and their status. All team members can see the plan.
- **Merge order** is predetermined. Developer A merges first; Developer B merges second and handles any conflicts (which should be minimal given the conflict analysis).
- **Status visibility** — Use the GitHub project board to see all stories across all workstreams in one view.

### Communication Points

| Event | Who Communicates | What |
|-------|-----------------|------|
| Workstream plan created | Lead → Team | Share merge order and branch assignments |
| Workstream ready to merge | Developer → Lead | "workstream/1 is complete, ready for merge" |
| Merge complete | Lead → Next developer | "workstream/1 merged, you can merge workstream/2" |
| Conflict during merge | Developer → Lead | "Unexpected conflict in `shared/utils.js`, need review" |

---

## Cancelling Workstreams

If a workstream becomes unnecessary — scope change, reprioritization, or the approach didn't work out:

```
/plan-workstreams --cancel
```

The cancel workflow:
1. Checks for uncommitted work on workstream branches
2. Asks what to do with the assigned epics (return to source branch, move to backlog, or reassign)
3. Deletes workstream branches in reverse merge order
4. Cleans up `.workstreams.json` metadata

If workstream branches have commits, the command warns you and requires `--force` to proceed. This prevents accidentally discarding work.

---

## Integration with Other Commands

The workstream lifecycle is tracked in `.workstreams.json` and updated automatically by related commands:

| Command | Workstream Action |
|---------|-------------------|
| `/plan-workstreams` | Creates metadata, branches, and assignments |
| `/merge-branch` | Updates workstream status to `merged`, warns about remaining siblings |
| `/destroy-branch` | Updates workstream status to `destroyed`, handles orphaned epics |
| `/work` | Works normally on workstream branches (no special behavior) |
| `/done` | Closes issues normally (no special behavior) |

### Merge Order Awareness

When you run `/merge-branch` on a workstream branch, the command:
- Detects the branch is part of a workstream plan
- Updates the workstream status to `merged`
- Reports any remaining active sibling workstreams
- If all workstreams are merged, reports that the plan is complete

### Destroy Awareness

When you run `/destroy-branch` on a workstream branch, the command:
- Detects the branch is part of a workstream plan
- Updates the workstream status to `destroyed`
- Identifies orphaned epics (epics that were assigned to the destroyed branch)
- Reports the orphaned epics so you can reassign them

---

## Workstream Metadata

The `.workstreams.json` file is committed to your repository and tracks the full workstream plan:

```json
{
  "created": "2026-02-21T10:30:00Z",
  "sourceBranch": "main",
  "sourceCommit": "abc123",
  "streams": [
    {
      "branch": "workstream/1",
      "epics": [100, 101],
      "status": "active",
      "storyCount": 7
    },
    {
      "branch": "workstream/2",
      "epics": [102],
      "status": "active",
      "storyCount": 5
    }
  ],
  "mergeOrder": ["workstream/1", "workstream/2"]
}
```

### Status Lifecycle

```
active → merged      (branch merged to main via /merge-branch)
active → destroyed   (branch cancelled via /destroy-branch)
```

Status transitions are one-way. A destroyed workstream cannot be revived — create a new plan instead.

---

## Limitations

- **Not a substitute for feature flags.** Workstreams reduce merge conflicts but don't eliminate them. If two workstreams both modify a shared interface, the second merge will need conflict resolution.
- **Metadata is per-repo.** `.workstreams.json` lives in the repository. It doesn't coordinate across multiple repositories.
- **Merge order is advisory.** The recommended order minimizes conflicts but isn't enforced. You can merge in any order — you'll just handle more conflicts if you deviate.
- **Heuristic analysis.** Module detection is based on text analysis and directory scanning. It won't catch every possible conflict (e.g., runtime dependencies, shared database tables, API contracts).

---

## Options Reference

| Option | Default | Description |
|--------|---------|-------------|
| `--streams N` | 2 | Number of concurrent workstreams |
| `--prefix <prefix>` | `workstream/` | Branch name prefix |
| `--dry-run` | — | Show analysis and grouping without creating branches |
| `--cancel` | — | Cancel active workstream plan |
| `--force` | — | Force cancel even when branches have commits |

---

## What to Read Next

- [Concurrent Sessions](04-Concurrent-Sessions.md) — How to parallelize review work across multiple Claude Code sessions (the tactical counterpart to workstreams)
- [Planning Approaches](../01-Getting-Started/03-Planning-Approaches.md) — Top-down vs bottom-up planning, including the Parallel Tracks pattern
- [Hub Architecture](Hub-and-Project-Architecture.md) — How the hub/project model works with shared infrastructure

---

**End of Concurrent Workstreams Guide**
