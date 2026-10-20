# /assign-branch

Assign or remove issues from a branch tracker.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `[#issue...]` | No | One or more issue numbers to assign |
| `--branch <name>` | No | Target branch. Omitted → the only open branch, or with two or more open the one whose tracker carries the `active` label |
| `[--add-ready]` | No | Mark issues as ready for the branch |
| `[--remove]` | No | Remove issues from the branch |
| `--help` | No | Open this page. Takes precedence over every other argument and performs no action. |

**Retired forms:** A branch typed bare (`release/v1.2.0`) is no longer accepted; use `--branch <name>`.

## Usage

```
/assign-branch #42
/assign-branch #42 #43 --branch release/v1.2.0
/assign-branch #42 --remove
```

## Key Behaviors

- Delegates immediately to `.claude/scripts/shared/assign-branch.js` with the provided arguments.
- If no open branches exist, the script outputs `NO_BRANCH_FOUND` along with suggestions. The command then presents those suggestions via `AskUserQuestion`, creates the selected branch with `gh pmu branch start`, and re-runs the assignment.
- Normal output (branches exist) is reported directly to the user without any additional interaction.

## Implicit Branch (no `--branch`)

When issues or `--add-ready` are given without `--branch`, the target is resolved from the open branch trackers:

| Open branch trackers | Result |
|---|---|
| Exactly one | That branch, reported as `Using current branch: <name>` |
| Two or more, exactly one labeled `active` | The active tracker's branch, reported as `Using active branch: <name>` |
| Two or more, with zero or several labeled `active` | **Nothing is assigned.** `BRANCH_AMBIGUOUS` is reported with the open branches, and you are asked which one to use |

An explicit `--branch` always wins over the label. Previously, with two trackers open, the command printed its usage and reported success, so a later `/work` failed with a misleading error.

## Branch Names Are Validated Before Assignment

The branch token is checked against the list of **open branch trackers** before anything is written. A token that is not an open branch is rejected, and the rejection says so.

Previously any token containing a slash was accepted as a branch name and written unvalidated — so a typo like `relese/v1.2.0` was silently recorded against a branch that did not exist, and the mistake only surfaced later when the issue could not be found on the branch it was supposedly assigned to.

Membership in the open-tracker list is what decides validity, not the shape of the string.

## Duplicate Issue Numbers Are Collapsed

An issue named more than once is assigned once. Deduplication happens twice: when the arguments are parsed, and again after an epic is expanded into its sub-issues.

Both passes are needed — listing an issue explicitly *and* naming an epic that already contains it would otherwise produce a duplicate that survives argument-level deduplication.
