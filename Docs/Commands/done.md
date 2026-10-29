# /done

Complete one or more issues — transitions from `in_review` to `done`, pushes, and monitors CI.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | No | Single issue number (e.g., `#42` or `42`) |
| `#issue #issue...` | No | Multiple issue numbers (e.g., `#42 #43 #44`) |
| `--all` | No | Complete all `in_review` issues on the current branch (with confirmation) |
| `--yes` | No | Auto-approve interactive prompts. With `--all`, runs unattended. `-y` is no longer accepted. |
| *(none)* | No | Query `in_review` issues for interactive selection |
| `--help` | No | Open this page. Takes precedence over every other argument and performs no action. |

## Usage

```
/done #42
/done #42 #43 #44
/done --all
/done --all --yes
/done
```

## Key Behaviors

- Only handles the `in_review` → `done` transition; use `/work` first to get an issue to `in_review`.
- Runs a preamble script that validates issue state, verifies diffs, and moves the issue to done in one operation — stops with error details if validation fails.
- When completing an epic, automatically processes all `in_review` sub-issues first, then completes the epic; warns about sub-issues still `in_progress` or never started.
- For multiple issues (explicit list, `--all`, or batch selection), pushes only once after the last issue (batch push optimization).
- **Diverged before push.** If another developer pushed while the branch was being worked, `/done` rebases the local commits onto the upstream rather than merging, so each `Refs #N` commit stays intact. This uses the same rebase guard as `/sync-branch`. On a conflict the rebase is aborted and the conflicting paths are reported. `/done` then stops with the tree as it was: the issue is already Done on the board, and the commits are still local. Resolve by hand, or run `/sync-branch`, then push.
- After push, spawns background CI monitoring via `ci-watch.js` and reports results when they arrive (pass/fail/timeout per workflow). The timeout adapts to the project: it is one and a half times the longest job in recent completed CI runs, kept between 10 and 30 minutes, and 10 minutes when no run history can be read. A run still going at the deadline gets one extension, never past 30 minutes. A timeout report states how long it waited and whether that figure came from run history or the default.
- **Post-release criteria are handed off, not left open.** When every unchecked criterion is marked `→ GATE: release` (a check that can only run after the release deploys), `/done` moves nothing and asks: **Hand off** (recommended) files one standalone `qa-required` QA issue per criterion, rewrites each box as `- [x] <criterion> → GATE: release → QA: #N`, then completes the issue; **Already verified** checks the box and completes normally; **Leave In review** files and moves nothing. Close each QA issue with `/qa` once the post-release check holds. Under `--yes`, the hand-off is taken without asking.
- Posts a work summary comment on each closed issue listing changed files and the commit link.
- **Tells other sessions about the push.** It sends a push-started announcement, then one saying how CI resolved. These are routed like every other announcement: with `broadcast: false` and a live `/overwatch`, they go to the monitor alone. Otherwise they fall back to every peer, and the reason is named. Each announcement is recorded, so an `/overwatch` receipt can be matched to it.

## About `--yes`

`--yes` suppresses interactive prompts only. It does **not** bypass safety gates: acceptance-criteria verification, the force-move prohibition, and `gh pmu` errors all still halt the command exactly as they would without it.
