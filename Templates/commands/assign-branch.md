---
version: "v0.106.0"
allowed-tools: Bash, AskUserQuestion
description: Assign issues to a branch or remove them from it, using the IDPF framework.
argument-hint: "[#issue...] [branch/name] [--add-ready] [--remove] [--confirm-remove]"
copyright: "Rubrical Works (c) 2026"
---
<!-- MANAGED -->
Assign issues to a branch.
```bash
node .claude/scripts/shared/assign-branch.js "$ARGUMENTS"
```
## Handling "NO_BRANCH_FOUND" Output
`NO_BRANCH_FOUND` means no open branches exist. The script also outputs **CONTEXT:** (last version, issue labels, user input) and **SUGGESTIONS:** lines formatted `number|branch|description`.
1. Parse SUGGESTIONS lines for branch options
2. Use `AskUserQuestion` — present `(recommended)` first, include descriptions, "Other" for custom name
3. After selection, create the branch:
   ```bash
   gh pmu branch start --name "<selected-branch>"
   ```
4. Re-run the original assign-branch command
## Handling "CONFIRM_REMOVE" Output
`--remove` is two steps, and the second is a distinct invocation. The first prints the affected issues, the marker `CONFIRM_REMOVE`, a JSON payload `{issues, epicSubIssues}`, and the completing command — `assign-branch.js <issues...> --confirm-remove`.
Present the listed issues via `AskUserQuestion` — removal is not reversible from here, as the issue keeps no record of which branch it was on. On confirmation, run that command; declining ends the flow with nothing mutated.
`--confirm-remove` performs the removal and prints the `{removed, total, results}` envelope, exiting non-zero if `removed < total`. Each result carries `ok` and `operations`; an operation string appears only for an operation that actually completed, and `error` names any that did not.
**Why the second step is a flag (#2814):** `main()` printed `CONFIRM_REMOVE` and returned, and `removeIssues` was exported but never called from `main()`, so the gate had no other side — the only way to complete a removal was to `require()` the module.
**An issue no open tracker claims is reported, not guessed at.** `resolveTrackerForIssues` maps children from the tracker side, since an issue carries no usable back-pointer to its parent. An unmapped issue has its label and status cleared and its operations say `no branch tracker found for #N (nothing to unlink)` — never a claimed unlink.
## Normal Output
If branches exist, report the result directly.
## Errors
| Error | Cause | Resolution |
|-------|-------|------------|
| `Issue #N is a branch tracker and cannot be assigned.` | Target carries the `branch` label (branch tracker, not implementation work). Script exits non-zero before any mutation. | Target the sub-issues on the branch instead, or use `gh pmu sub list` to enumerate them. |
| `"X" is not an open branch. No issues were assigned.` | Slash-bearing token read as a branch name matches no open tracker. Script exits non-zero before any mutation. | Re-run with a listed open branch, or omit the branch to use the current one. |

**Why a slash command can be misread as a branch (#2554):** branch args are identified by shape — non-flag, non-numeric, contains a slash — so a token like `/work` in trailing chat text is picked up as the branch name. It is rejected because it matches no open tracker; nothing is written. Re-invoke with only the issue numbers.
