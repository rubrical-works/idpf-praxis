# /assign-branch

Assign or remove issues from a branch tracker.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `[#issue...]` | No | One or more issue numbers to assign |
| `[branch/name]` | No | Target branch name |
| `[--add-ready]` | No | Mark issues as ready for the branch |
| `[--remove]` | No | Remove issues from the branch |

## Usage

```
/assign-branch #42
/assign-branch #42 #43 release/v1.2.0
/assign-branch #42 --remove
```

## Key Behaviors

- Delegates immediately to `.claude/scripts/shared/assign-branch.js` with the provided arguments.
- If no open branches exist, the script outputs `NO_BRANCH_FOUND` along with suggestions. The command then presents those suggestions via `AskUserQuestion`, creates the selected branch with `gh pmu branch start`, and re-runs the assignment.
- Normal output (branches exist) is reported directly to the user without any additional interaction.

## Branch Names Are Validated Before Assignment

The branch token is checked against the list of **open branch trackers** before anything is written. A token that is not an open branch is rejected, and the rejection says so.

Previously any token containing a slash was accepted as a branch name and written unvalidated — so a typo like `relese/v1.2.0` was silently recorded against a branch that did not exist, and the mistake only surfaced later when the issue could not be found on the branch it was supposedly assigned to.

Membership in the open-tracker list is what decides validity, not the shape of the string.

## Duplicate Issue Numbers Are Collapsed

An issue named more than once is assigned once. Deduplication happens twice: when the arguments are parsed, and again after an epic is expanded into its sub-issues.

Both passes are needed — listing an issue explicitly *and* naming an epic that already contains it would otherwise produce a duplicate that survives argument-level deduplication.
