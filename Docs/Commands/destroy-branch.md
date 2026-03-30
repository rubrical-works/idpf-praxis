# /destroy-branch

Safely abandon and permanently delete a branch — destructive operation requiring explicit confirmation.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `[branch-name]` | No | Branch to destroy (defaults to current branch) |
| `--force` | No | Skip confirmation prompt (use with caution) |

## Usage

```
/destroy-branch
/destroy-branch feature/old-experiment
/destroy-branch release/v1.0.0-abandoned --force
```

## Key Behaviors

- **Cannot destroy `main` or `master`** — stops immediately with an error.
- Without `--force`, requires you to type the full branch name exactly to confirm — any mismatch aborts the operation.
- Deletes: local branch, remote branch (`origin/<branch>`), release artifacts in `Releases/<prefix>/<id>/`, and closes the tracker issue as "not planned".
- Shows unmerged commits and related artifacts before asking for confirmation so you know exactly what will be lost.
- **Unmerged commits are permanently lost** if not pushed elsewhere; recovery may be possible via `git reflog` within ~30 days.
- STOP — this action cannot be undone.
