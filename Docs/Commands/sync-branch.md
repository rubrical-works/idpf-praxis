# /sync-branch

Reconcile the current branch with its upstream after seeing what diverged.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| — | | Takes no arguments; always the current branch and its configured upstream |
| `--help` | No | Open this page. Takes precedence over every other argument and performs no action. |

## Usage

```
/sync-branch
```

## Key Behaviors

- Runs `branch-sync-check.js` and presents the derived analysis before asking anything: fork point, each side's commits with the issues they reference and their board status, paths both sides changed, locally modified files the remote also changes, and the last recorded pull
- Stops before integrating anything when the upstream needs an upgrade on this machine: a higher `frameworkVersion`, or a `projectSkills` entry whose `.claude/skills/<name>/` directory is not here. The report names the version change and each missing skill and says to upgrade through Praxis Hub Manager, then run `/sync-branch` again. `frameworkPath` is not compared, an unparseable version is a warning rather than a stop, and self-hosted repos are exempt
- Resolves `behind` by fast-forward and `diverged` by rebase onto the upstream, each behind a single question; the operation runs through the shared `rebase-guard.js` helper, the same guard `/done` Step 2 uses
- A rebase conflict aborts, reports the conflicting paths and stops; the tree is left as it was
- Locally modified files that the incoming commits also change are reported and asked about before any rebase or fast-forward; the command never stashes, discards or reverts them
- Never forces, never merges, never pushes; `ahead` reports that the push belongs to `/done`
- Reachable with no issue in flight, which is the case the startup hook's `/done` pointer could not cover
