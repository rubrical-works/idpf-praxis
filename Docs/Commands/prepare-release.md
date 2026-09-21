# /prepare-release

Validate, create a PR to main, merge, and tag for deployment.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `[version]` | No | Version to release (e.g., `v1.2.0`) |
| `--skip-coverage` | No | Skip the coverage gate |
| `--dry-run` | No | Preview actions without making changes |
| `--help` | No | Show extension points |

## Usage

```
/prepare-release
/prepare-release v1.2.0
/prepare-release --dry-run
```

## Key Behaviors

- If run from `main`, automatically creates a `release/vX.Y.Z` branch before proceeding; if already on a release branch, continues in place
- Five phases: Analysis → Validation → Prepare (CHANGELOG, README, version files) → Git Operations (PR, merge, tag) → Close & Cleanup (deployment comment, branch deletion, GitHub Release)
- Multiple confirmation checkpoints: version, validation passed, PR approval, ready to tag, deployment verified
- Checks for incomplete issues before starting by previewing the branch close itself (`gh pmu branch close "$BRANCH" --dry-run`), so the list shown is exactly what Step 4.3 will move to Backlog. With no issues listed it says so explicitly; otherwise it names them and asks: **Transfer** (move them with `/transfer-issue`, then re-check), **Continue anyway** (states which issues Step 4.3 will move to Backlog and have their Branch field cleared), or **Stop** (halt before Phase 1, nothing changed)
- Step 4.3 previews the close again and shows the list before closing the branch tracker, so the close never moves an issue you have not seen
- Does not proceed past CI failures
- If `update-release-notes.js` already created the GitHub release after tagging (Step 4.8), skips duplicate creation in Step 5.3
- **Announces the release to every peer once the PR is approved, before the merge.** Other sessions in this working directory are told first, since nothing after that point can be taken back. It is a forced broadcast: every reachable session gets it, including a running `/overwatch`, even when `broadcast` is off. Only turning messaging off entirely suppresses it. The announcement is advisory: a failed send is reported and the operation continues.
- After tagging, waits for tag-triggered workflows. If one is known to exist but no run is found once the registration window has passed, it reports "expected run not found" and stops. It does not treat that as a pass
- The CHANGELOG lead — the prose between the version heading and `**Upgrade notes:**` — is copied verbatim into the GitHub release body, so Step 3.1 requires one short user-facing paragraph saying what changed for the user. Bug narrative, root-cause explanation and post-mortems of the release run belong in the release test plan, not the lead; the release-notes script emits its own feature/change/fix counts, so the lead does not repeat them
- Extension points available at `pre-phase-1`, `post-analysis`, `pre-validation`, `post-validation`, `pre-commit`, `post-prepare`, `post-pr-create`, `pre-tag`, `post-tag`, `pre-close`, `post-close`
