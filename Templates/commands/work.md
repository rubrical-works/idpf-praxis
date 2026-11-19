---
version: "v0.121.0"
description: Start working on issues with validation and automatic task extraction, using the IDPF framework.
argument-hint: "#issue [#issue...] [--assign] [--nonstop] [--wait] [--no-review] [--unreviewed] [--concurrent [--agents N]] | --status <status> [--help]"
copyright: "Rubrical Works (c) 2026"
---

<!-- MANAGED -->
# /work
`/work` command spec (hybrid shell + auto-loaded execution rule). Shell = arguments, prerequisites, error handling; execution logic lives in `.claude/rules/08-work-execution.md` (auto-loaded once per session) and is never restated here.
## Prerequisites
- `gh pmu` extension installed; `.gh-pmu.json` in repository root
- Issue assigned to a branch (`/assign-branch` first, or `--assign`)
## Arguments
| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | Yes (one of) | Single issue number (`#42` or `42`) |
| `#issue #issue...` | | Multiple issue numbers (`#42 #43 #44`) |
| `--status <status>` | | All issues in given status (`--status backlog`) |
| `--assign` | No | Assign issue(s) to current branch before starting work |
| `--nonstop` | No | Epic/branch tracker: skip per-sub-issue STOP, process all to `in_review` continuously |
| `--wait` | No | Wait for pending CI to pass before starting work |
| `--reopen` | No | Move an In review/Done issue back to `in_progress`; without it `/work` refuses it (`ALREADY_IN_REVIEW`/`ALREADY_DONE`) |
| `--concurrent` | No | Epic, branch tracker, or selection of 2+ issues: run file-disjoint members at once in framework worktrees, grouped by the `**Depends on:**` graph, merged back via the Merge-Back Review Gate (rule 08 Step 6) |
| `--agents N` | No | Cap on agents of any kind at once (implementers, reviewers, fix cycles) and on unit-test concurrency (default 3; requires `--concurrent` — `--agents` alone is reported as ignored, never an error) |
| `--no-review` | No | Skip the independent review this run, in every mode: Step 4g's review, or the Merge-Back Review Gate's Tier 3 under `--concurrent` (Tiers 1–2 still run); the skip is reported |
| `--unreviewed` | No | Waive the clean-review requirement this run (never reviewed, changed since review, or unresolved findings); each waived issue and its state is reported. Not `--no-review` |
| `--help` | No | Open this command's docs page. Takes precedence over every other argument and performs no action. |

**`--help` takes precedence over every other argument and performs no action:** run `node .claude/scripts/shared/command-help.js work`, report its output, and STOP.

**Retired forms:** `all in <status>` is no longer accepted — reject it with a message naming `--status`, and do nothing else; `work-preamble.js` refuses it the same way. The `work all in <status>` trigger phrase is unchanged and routes to `/work --status <status>`.
## Execution Logic
Rule 08 defines:
- Phase 1 / Phase 2 task creation
- Step 1: preamble via `work-preamble.js`
- Steps 1, 1d, 1a, 1b, 1c, 2, 2a, 2b, 2b-ii, 2c, 3, 3-i, 3-ii, 3-iii, 3b, 4, 4a, 4b, 4d, 4e, 4c, 4f, 4g, 5, 6, 6a
- Review-State / Pre-Work Status / Sub-Agent Review / commit-per-deliverable gates
- Autonomous epic & branch tracker processing (default vs. `--nonstop`)
- STOP boundary and post-STOP cleanup

Where each behavior is defined:
| Topic | Owning step |
|---|---|
| Redirect | Rule 08 Step 1 (`context.redirect`: `test-plan` → `/review-test-plan`; `qa-required` → `/qa` for a single issue). The report format is below |
| Branch sync | Rule 08 Step 1c (`branch-sync-check.js`, once per invocation) |
| Concurrent mode | Rule 08 Steps 2c, 3 and 6; `{frameworkPath}/Reference/work-execution-conditional.md` §§ Step 2c, Step 3 and Step 6 |
| Review-State Gate | Rule 08 Step 3, per issue; Step 2b-ii up front for an epic, a branch tracker under `--nonstop`, or a selection of two or more issues |
| Peer announcements | Rule 08 Step 3 (event 1, after both gates) and Step 6 (event 2, inside the STOP sequence) |

**Redirect report** (format left to this shell by rule 08 Step 1): `#$ISSUE carries the `<label>` label — handing off to <context.redirect>.` For `test-plan`:
```
#$ISSUE carries the `test-plan` label — handing off to /review-test-plan.
The six approval gates are evaluated by its Step 5a rollup, not worked as acceptance criteria.
```
Reasoning per directive: `{frameworkPath}/Reference/work-execution-rationale.md`, under the step it explains.
## Error Handling
**STOP errors** (preamble `ok: false`; nothing moved): issue not found, no branch assignment (`NO_BRANCH`), `gh pmu` failure, `ALREADY_ASSIGNED` (different branch), `WORKSTREAM_CONFLICT` (use `/assign-branch`), `BRANCH_TRACKER_NOT_ASSIGNABLE` (assign sub-issues instead), `ALREADY_IN_REVIEW`/`ALREADY_DONE` (pass `--reopen`), `SUB_ISSUE_LOAD_FAILED` (sub-issue enumeration failed), `ALL_MEMBERS_FAILED` (every batch member failed — report each error).
**Member skipped, run continues:** `TREE_IN_BATCH` (epic or branch tracker in a batch — run it alone); `SUB_ISSUE_STATUS_UNREADABLE` (sub-issue board status unreadable — halts under `--nonstop`).
**Non-blocking warnings:** `CONCURRENT_IGNORED`, `CONCURRENT_NO_TRACKER` (no plan; members run sequentially), `NO_ACCEPTANCE_CRITERIA_SECTION`, `EMPTY_ACCEPTANCE_CRITERIA_SECTION` (reported, issue worked as one unit), PRD tracker not found, framework file missing, issue already in_progress.

**End of /work Command**
