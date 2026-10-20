---
version: "v0.109.0"
allowed-tools: Bash, AskUserQuestion
description: Assign issues to a branch or remove them from it, using the IDPF framework.
argument-hint: "[#issue...] [--branch <name>] [--add-ready] [--remove] [--confirm-remove] [--help]"
copyright: "Rubrical Works (c) 2026"
---
<!-- MANAGED -->
Assign issues to a branch.
## Arguments
| Argument | Required | Description |
|----------|----------|-------------|
| `#issue...` | No | Issues to assign (`42` or `#42`), typed bare |
| `--branch <name>` | No | Branch to assign to. Omitted → the only open branch, or with 2+ open the `active`-labeled tracker's (see Implicit Branch) |
| `--add-ready` | No | Assign every unassigned Ready issue |
| `--remove` | No | Remove the issues from their branch (see CONFIRM_REMOVE) |
| `--confirm-remove` | No | Complete a removal after confirmation |
| `--help` | No | Open this command's docs page. Takes precedence over every other argument and performs no action. |

**`--help` takes precedence over every other argument and performs no action:** run `node .claude/scripts/shared/command-help.js assign-branch`, report its output, and STOP.

**Retired forms:** a positional `[branch/name]` is no longer accepted — it is rejected with a message naming `--branch`, and nothing is assigned; `assign-branch.js` refuses it before any mutation.
## Workflow
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
## Implicit Branch (no `--branch`)
Issues or `--add-ready` with no `--branch` → the script resolves the target (#3160):
| Open trackers | Result |
|---|---|
| One | That branch, `active` or not — `Using current branch: <name>` |
| 2+, exactly one labeled `active` | Its branch — `Using active branch: <name>` |
| 2+, zero or 2+ `active`, or label lookup failed | **Nothing assigned.** `BRANCH_AMBIGUOUS: <reason>` + open branches on stderr, **exits non-zero** |
Explicit `--branch` always wins; a resolved branch passes the same open-tracker check as a named one. On `BRANCH_AMBIGUOUS`: list the open branches, ask via `AskUserQuestion`, re-run with `--branch <name>` — never pick one yourself.
**Why it fails:** with 2+ trackers open the script printed usage and **exited 0**; `/work --assign` read that as success and failed later with a misleading `NO_BRANCH`. `/work --assign` now passes the checked-out branch, so this fallback serves direct `/assign-branch #N` and `--add-ready` only.
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
| `"X" is not an open branch. No issues were assigned.` | The `--branch` value matches no open tracker. Script exits non-zero before any mutation. | Re-run with a listed open branch, or omit `--branch` to use the current one. |
| `BRANCH_AMBIGUOUS: <reason>. No issues were assigned.` | No `--branch`, 2+ open trackers, not exactly one `active`. Exits non-zero before any mutation. | Ask which listed branch; re-run with `--branch <name>`. |
| `` `[branch/name]` is no longer accepted by /assign-branch — use `--branch` instead. `` | A slash-bearing positional token — a branch typed bare, or a slash command like `/work` in trailing chat text. Exits non-zero before any mutation. | Pass `--branch <name>`, or re-invoke with only the issue numbers. |

**Why a slash-bearing token is refused (#2554, #3030):** branch args used to be identified by shape, so a token like `/work` in trailing chat text was picked up as the branch name. Since the branch became `--branch <name>`, any positional slash token is the retired form and is refused before any lookup; nothing is written. Re-invoke with only the issue numbers.
