# /prepare-release

Validate, create a PR to main, merge, and tag for deployment.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `[version]` | No | Version to release (e.g., `v1.2.0`) |
| `--skip-coverage` | No | Skip the coverage gate |
| `--skip-review` | No | Skip the branch diff review gate; the skip is recorded in the release checklist |
| `--dry-run` | No | Preview actions without making changes |
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
- **Branch diff review gate.** Before any version file changes, the release checks that the branch was reviewed with `/code-review --diff` and that the review is current. It reads the review record `/code-review --diff` leaves in `.code-review-manifest.json` rather than running the review itself, so run `/code-review --diff` on the release branch first. The record stays current when it matches the current `HEAD`, or when every commit since the review changes only review output (`.code-review-manifest.json` and `Construction/Code-Reviews/`), so committing the review's own manifest and report does not invalidate it. Uncommitted changes outside review output must have been included in the review. A missing or stale record stops the release with an instruction to run `/code-review --diff` and try again, naming why it is stale and which files changed. A review that included uncommitted code goes stale once that code is committed, because the commit is not review output. A finding the branch **introduced** at high severity stops the release; introduced medium findings ask whether to continue; low and info findings are reported only. Findings tagged `pre-existing` (outside the lines the branch changed) are reported but never block — the release is not the place to fix inherited issues. A branch with no changed files passes the gate, naming the base it compared against. `--skip-review` skips the gate and the skip is recorded; `--dry-run` reports what the gate would check without stopping
- Does not proceed past CI failures
- If `update-release-notes.js` already created the GitHub release after tagging (Step 4.8), skips duplicate creation in Step 5.3
- **Announces the release to every peer once the PR is approved, before the merge.** Other sessions in this working directory are told first, since nothing after that point can be taken back. It is a forced broadcast: every reachable session gets it, including a running `/overwatch`, even when `broadcast` is off. Only turning messaging off entirely suppresses it. The announcement is advisory: a failed send is reported and the operation continues.
- After tagging, waits for tag-triggered workflows. If one is known to exist but no run is found once the registration window has passed, it reports "expected run not found" and stops. It does not treat that as a pass
- The CHANGELOG lead — the prose between the version heading and `**Upgrade notes:**` — is copied verbatim into the GitHub release body, so Step 3.1 requires one short user-facing paragraph saying what changed for the user. Bug narrative, root-cause explanation and post-mortems of the release run belong in the release test plan, not the lead; the release-notes script emits its own feature/change/fix counts, so the lead does not repeat them
- Extension points available at `pre-phase-1`, `post-analysis`, `pre-validation`, `post-validation`, `pre-commit`, `post-prepare`, `post-pr-create`, `pre-tag`, `post-tag`, `pre-close`, `post-close`
