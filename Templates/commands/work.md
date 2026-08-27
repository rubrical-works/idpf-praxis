---
version: "v0.98.0"
description: Start working on issues with validation and auto-task extraction (project)
argument-hint: "#issue [#issue...] [--assign] [--nonstop] [--wait] | all in <status>"
copyright: "Rubrical Works (c) 2026"
---
<!-- MANAGED -->
# /work
`/work` command spec (hybrid shell + auto-loaded execution rule). Execution logic lives in `.claude/rules/08-work-execution.md` and auto-loads once per session. Consolidated from the `/workit` parallel-evaluation prototype (#2329, retired in #2368).

---
## Prerequisites
- `gh pmu` extension installed
- `.gh-pmu.json` configured in repository root
- Issue assigned to a branch (use `/assign-branch` first, or pass `--assign`)

---
## Arguments
| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | Yes (one of) | Single issue number (`#42` or `42`) |
| `#issue #issue...` | | Multiple issue numbers (`#42 #43 #44`) |
| `all in <status>` | | All issues in given status (`all in backlog`) |
| `--assign` | No | Assign issue(s) to current branch before starting work |
| `--nonstop` | No | Epic/branch tracker: skip per-sub-issue STOP, process all to `in_review` continuously |
| `--wait` | No | Wait for pending CI to pass before starting work |

---
## Execution Logic

Follow `.claude/rules/08-work-execution.md` (auto-loaded at session start). That rule defines:
- Phase 1 / Phase 2 task creation
- Step 1: preamble via `work-preamble.js`
- Steps 1a, 1b, 1c, 2, 2a, 3, 3b, 4, 4a, 4b, 4c, 5, 6, 6a
- Review-State / Pre-Work Status / Sub-Agent / Commit-per-AC gates
- Autonomous epic & branch tracker processing (default vs. `--nonstop`)
- STOP boundary and post-STOP cleanup

---
## Branch Sync
After the preamble and before the first commit, `/work` runs `branch-sync-check.js` once per invocation — the same check the startup hook runs, at the moment integrating another developer's push is cheapest (#2635):
- **Behind, no conflicting paths** → offer `git pull --ff-only`; declining leaves the tree untouched.
- **Behind, conflicting paths present** → no pull offer; report the paths, ask whether to continue or stop.
- **Diverged** → report and STOP — the previous `/done` did not push, or another session committed here.
- **Ahead, up-to-date, no upstream** → no action.

Full table and rationale: `.claude/rules/08-work-execution.md` Step 1c. The matching guard before push is `/done` Step 2.

---
## Review-State Gate
Before the first acceptance criterion of an issue is worked — and independently for each sub-issue of an epic or branch tracker — `/work` classifies that issue's review state via `review-state.js` and acts:
- **Never reviewed** → STOP, offer `/review-issue #N`. Batch, epic, branch tracker, `--nonstop`: warn and proceed.
- **Reviewed, findings unresolved** → STOP, offer `/resolve-review #N`. `--nonstop` **halts on `findings-pending`** per its existing failure semantics.
- **Reviewed clean, or indeterminate** → proceed without prompting.

**Declining proceeds to work unchanged** — the gate mutates nothing on decline: no label change, no status move, no body edit. Review stays advisory; the gate only makes its absence visible at the one moment it is still free to fix. Full state matrix and rationale: `.claude/rules/08-work-execution.md` Step 3.

---
## Error Handling
**STOP errors:** Issue not found, no branch assignment, `gh pmu` failure, `ALREADY_ASSIGNED` (different branch), `WORKSTREAM_CONFLICT` (use `/assign-branch`), `BRANCH_TRACKER_NOT_ASSIGNABLE` (target is a branch tracker — assign sub-issues instead).
**Non-blocking:** PRD tracker not found, framework file missing, no acceptance criteria, issue already in_progress.

---
**End of /work Command**
