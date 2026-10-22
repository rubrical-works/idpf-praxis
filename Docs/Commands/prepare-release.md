# /prepare-release

Validate, create a PR to main, merge, and tag for deployment.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `[version]` | No | Version to release (e.g., `v1.2.0`) |
| `--skip-coverage` | No | Skip the coverage gate |
| `--skip-review` | No | Skip the branch diff review gate; the skip is recorded in the release checklist |
| `--dry-run` | No | Preview actions without making changes; the review gate reports what it would review and runs no review |
| `--help` | No | Open this page. Takes precedence over every other argument and performs no action. |

To see this command's extension points, run `/extensions --list --command prepare-release`.

## Usage

```
/prepare-release
/prepare-release v1.2.0
/prepare-release --dry-run
/prepare-release --skip-review
```

## Key Behaviors

- If run from `main`, automatically creates a `release/vX.Y.Z` branch before proceeding; if already on a release branch, continues in place
- Five phases: Analysis → Validation → Prepare (CHANGELOG, README, version files) → Git Operations (PR, merge, tag) → Close & Cleanup (deployment comment, branch deletion, GitHub Release)
- Multiple confirmation checkpoints: version, validation passed, PR approval, ready to tag, deployment verified
- Checks for incomplete issues before starting by previewing the branch close itself (`gh pmu branch close "$BRANCH" --dry-run`), so the list shown is exactly what Step 4.3 will move to Backlog. With no issues listed it says so explicitly; otherwise it names them and asks: **Transfer** (move them with `/transfer-issue`, then re-check), **Continue anyway** (states which issues Step 4.3 will move to Backlog and have their Branch field cleared), or **Stop** (halt before Phase 1, nothing changed)
- Step 4.3 previews the close again and shows the list before closing the branch tracker, so the close never moves an issue you have not seen
- **Branch diff review gate.** Before any version file or CHANGELOG changes, the release checks that the branch was reviewed with `/code-review --diff` and that the review is current, using the review record `/code-review --diff` leaves in `.code-review-manifest.json`. The gate is shared with `/prepare-beta`, so both commands apply the same rules. A current record is used as is, so a branch you already reviewed is not reviewed twice. The record stays current when it matches the current `HEAD`, or when every commit since the review changes only review output (`.code-review-manifest.json` and `Construction/Code-Reviews/`); uncommitted changes outside review output must have been included in the review. When the record is missing or stale, the gate says why and which files changed, then offers to run the diff review now, in the same run, and re-check it — or to stop so you can run `/code-review --diff` yourself. With more than 40 files to review, stopping is the recommended option (`--batch N` splits the review). A branch whose changes include no reviewable source file (tests or docs only) passes without a review. A finding the branch **introduced** at high severity stops the release; introduced medium findings ask whether to continue; low and info findings are reported only. Findings tagged `pre-existing` (outside the lines the branch changed) are reported but never block. A branch with no changed files passes the gate, naming the base it compared against. `--skip-review` skips the gate and the skip is recorded; `--dry-run` reports whether the gate would use the existing record or run a review, and runs nothing
- Does not proceed past CI failures
- If `update-release-notes.js` already created the GitHub release after tagging (Step 4.8), skips duplicate creation in Step 5.3
- **Announces the release to every peer once the PR is approved, before the merge.** Other sessions in this working directory are told first, since nothing after that point can be taken back. It is a forced broadcast: every reachable session gets it, including a running `/overwatch`, even when `broadcast` is off. Only turning messaging off entirely suppresses it. The announcement is advisory: a failed send is reported and the operation continues.
- After tagging, waits for tag-triggered workflows. If one is known to exist but no run is found once the registration window has passed, it reports "expected run not found" and stops. It does not treat that as a pass
- The CHANGELOG lead — the prose between the version heading and `**Upgrade notes:**` — is copied verbatim into the GitHub release body, so Step 3.1 requires one short user-facing paragraph saying what changed for the user. Bug narrative, root-cause explanation and post-mortems of the release run belong in the release test plan, not the lead; the release-notes script emits its own feature/change/fix counts, so the lead does not repeat them
- Extension points available at `pre-phase-1`, `post-analysis`, `pre-validation`, `post-validation`, `pre-commit`, `post-prepare`, `post-pr-create`, `pre-tag`, `post-tag`, `pre-close`, `post-close`
