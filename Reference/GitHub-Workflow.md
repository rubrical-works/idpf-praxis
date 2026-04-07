# GitHub Workflow Integration
**Version:** v0.84.0
**Source:** Reference/GitHub-Workflow.md
**MUST READ:** This file must be read at session startup and after any compaction.
This document configures Claude to automatically manage GitHub issues during development sessions.
## Project Configuration
**Read from `.gh-pmu.json`** in the repository root. This file defines:
- Project board connection (owner, number)
- Repositories to track
- **Project field values** (Status, Priority) - these are NOT labels
**Labels** = Issue metadata (e.g., `bug`, `enhancement`, `pm-tracked`). Applied via: `gh issue edit --add-label "bug"`
**Project Fields** = Project board columns/values (e.g., Status, Priority). Updated via: `gh pmu move [number] --status [value]`. Values defined in `.gh-pmu.json` under `fields:`
```yaml
project:
    owner: {owner}
    number: {number}
repositories:
    - {owner}/{repo}
fields:
    status:
        field: Status
        values:
            backlog: Backlog
            in_progress: In progress
            in_review: In review
            done: Done
    priority:
        field: Priority
        values:
            p0: P0
            p1: P1
            p2: P2
```
**Derived values:**
- **Repository:** `repositories[0]`
- **Project Board:** `https://github.com/users/{project.owner}/projects/{project.number}/views/1`
Use the **alias** (left side) in commands: `gh pmu move 90 --status in_progress`
If `.gh-pmu.json` doesn't exist, run `gh pmu init` to create it.
**Framework Configuration:**
```yaml
framework: IDPF-Agile  # or IDPF-Vibe (optional)
```
If no framework is set, all commands are available without restrictions.
**Release Configuration:**
```yaml
release:
  tracks:
    stable:
      prefix: "v"
      default: true
    patch:
      prefix: "patch/"
      constraints:
        version: patch_only
        labels:
          forbidden: ["breaking-change"]
          required: []
    beta:
      prefix: "beta/"
  artifacts:
    directory: Releases
    release_notes: true
    changelog: true
```
**Track Prefixes:** `stable` (default): `v1.2.0`, `patch`: `patch/1.1.1`, `beta`: `beta/2.0.0-beta.1`
**Constraints:** `version: patch_only` - PATCH only. `labels.forbidden` - Error if present. `labels.required` - Warning if missing.
**Initial Setup:** Run `gh pmu init`. Requires a `Branch` Text field. After project creation, set default repository in project settings (Settings -> Default repository).
**Terms Acceptance:** Required once per repository before any `gh pmu` commands:
```bash
gh pmu accept --yes
```
- Persists in `.gh-pmu.json` -- one-time per repo
- Must re-run if `.gh-pmu.json` is regenerated
- `--yes` required for non-interactive environments (Claude Code, CI)
- Without acceptance, all `gh pmu` commands fail with "terms not accepted"
## gh pmu Command Reference
Issue management and branch commands are in their respective command specs (`/work`, `/done`, `/create-branch`, `/prepare-release`, etc.). This section covers cross-command flags and operations.
**Move Command Flags:**
| Flag | Description | Example |
|------|-------------|---------|
| `--status [value]` | Set project status | `--status in_progress` |
| `--branch [value]` | Set branch field (replaces `--release`) | `--branch current` |
| `--backlog` | Clear branch field | `gh pmu move 42 --backlog` |
| `--recursive` | Apply to issue and all sub-issues | `--status done --recursive` |
| `--dry-run` | Preview changes without applying | `--recursive --dry-run` |
| `--depth N` | Limit recursion depth (default 10) | `--depth 3` |
| `-f, --force` | Bypass checkbox validation | `--status done --force` |
| `--yes` | Skip confirmation prompts | `--recursive --yes` |
**Multi-Issue Syntax:**
```bash
gh pmu move 42 43 44 --status in_progress
gh pmu move 50 51 52 --status done
```
**Deprecation:** `--release` is deprecated. Use `--branch` instead.
**Sub-Issue Management:**
| Command | Description |
|---------|-------------|
| `gh pmu sub create --parent [#] --title "..."` | Create and link sub-issue |
| `gh pmu sub add [parent] [child]` | Link existing issues |
| `gh pmu sub list [#]` | List sub-issues |
| `gh pmu split [#] --from=body` | Create sub-issues from checklist |
**Bulk Operations:**
| Command | Description |
|---------|-------------|
| `gh pmu move [#] [#] [#] --status done` | Update multiple issues |
| `gh pmu move [#] --status done --recursive` | Update issue and all sub-issues |
| `gh pmu move [#] --recursive --dry-run` | Preview recursive changes |
| `gh pmu triage --query "..." --apply status:backlog` | Bulk update matching issues |
| `gh pmu intake --apply` | Add untracked issues to project |
**Auto-Close Behavior:** With default Kanban template, `gh pmu move [#] --status done` automatically closes the issue. Explicit `gh issue close` only needed for: specifying close reason, adding closing comment, or projects without auto-close workflow.
## Slash Command Preference
Prefer slash commands over raw `gh pmu` for IDPF framework repos:
| Instead of | Use |
|------------|-----|
| `bug:` inline creation | `/bug <title>` |
| `enhancement:` inline creation | `/enhancement <title>` |
| `proposal:` / `idea:` inline creation | `/proposal <title>` |
| `work #N` inline routing | `/work #N` |
| `done` / `gh pmu move --status done` | `/done [#N]` |
| `gh pmu branch start --name "..."` | `/create-branch [branch]` |
| `gh pmu branch list` + manual selection | `/switch-branch` |
| `gh pmu branch close` (releases) | `/prepare-release` |
| `gh pmu branch close` (features) | `/merge-branch` |
| `gh pmu branch delete` | `/destroy-branch` |
| `gh pmu move [#] --branch [name]` | `/assign-branch [#] [branch]` |
| Manual PRD creation | `/create-prd` |
| Manual backlog creation from PRD | `/create-backlog` |
| Manual story creation | `/add-story` |
| Manual story splitting | `/split-story` |
| Pivot/direction change review | `/pivot` |
| Manual issue review | `/review-issue #N` |
| Manual proposal review | `/review-proposal #N` |
| Manual PRD review | `/review-prd #N` |
| Manual test plan review | `/review-test-plan #N` |
**When to Use Raw Commands:** Debugging slash commands, uncovered operations, user explicitly requests raw command, complex bulk operations.
## Critical Rules
- **Issues close ONLY when user says "Done"** - Never close automatically, skip STOP checkpoint, or close because code shipped
- **Acceptance criteria must be checked** - All boxes checked before In Review or Done; evaluate criteria when moving to In Review
- **No auto-close keywords until Done** - Use `Refs #XXX` (not `Fixes/Closes/Resolves #XXX`) until user approves
- **All work on working branches** - Never push to main directly; work requires a branch tracker; checkout working branch before working
- **Work requires explicit trigger** - After "evaluate" or "assess" commands, STOP after analysis. Never implement until user says "work", "fix that", or "implement that". Clarifying questions are not work permission.
**Analysis vs Work (HARD STOP)**
**Analysis keywords:** evaluate, analyze, assess, investigate, check, verify
**Note:** `review` is a **tracked action** that routes to `/review-issue` -- NOT an analysis keyword.
When these keywords appear with an issue reference (#N):
1. Report findings only
2. **STOP** - Do not implement
3. Use **read-only** commands (queries, not mutations)
4. End with: "Analysis complete. Say 'work' to implement."
**Forbidden during analysis:** scripts with side effects, creating/editing/moving issues, code changes, any `gh pmu move`, `git commit`, `node script.js` that modifies state.
**Examples:**
- OK: `gh pmu view 123`, `gh issue view 123 --json body`
- Forbidden: `gh pmu move 123 --status in_progress`, `node .claude/scripts/shared/assign-branch.js --add-ready`
**Pre-Agent Status Verification Gate:** Before spawning any Agent tool for **implementation work**, verify issue is `in_progress`:
```bash
gh pmu view $ISSUE --json=status --jq='.status'
```
If not "In progress", run `gh pmu move $ISSUE --status in_progress` before spawning. Does NOT apply to research/review/exploration agents.
**Commit Message Issue References:**
| Phase | Allowed Keywords | Forbidden Keywords |
|-------|------------------|-------------------|
| In Progress / In Review | `Refs #XXX`, `Related to #XXX`, `Part of #XXX` | `Fixes`, `Closes`, `Resolves` |
| After user says "Done" | `Fixes #XXX`, `Closes #XXX`, `Resolves #XXX` | -- |
GitHub automatically closes issues when `Fixes/Closes/Resolves #XXX` commits merge to default branch, bypassing the STOP checkpoint.
## Workflow Routing (CRITICAL)
**Work Command Routing:** When user says "work #N", the `/work` command handles validation, branch assignment, issue type detection (epic vs standard), auto-todo extraction, PRD tracker auto-move, and framework methodology dispatch. See `/work` command spec.
**Epic Detection:** Epic label takes precedence. Always check labels before routing. Never skip per-sub-issue STOP boundary. See `/work` (Steps 4, 7, 12).
**Trigger Word Routing (Create Issue First):**
| Trigger | Command | Description |
|---------|---------|-------------|
| `bug:` | `/bug` | Create bug issue with standard template |
| `enhancement:` | `/enhancement` | Create enhancement issue with standard template |
| `idea:` | `/proposal` | Alias for proposal |
| `proposal:` | `/proposal` | Create proposal document + tracking issue |
Each creates issue, reports number, STOPs. Do NOT implement until user says "work".
**Review Command Routing:** `review` with issue reference (`#N`) routes to `/review-issue`:
| Trigger Pattern | Routes To |
|----------------|-----------|
| `review #42` | `/review-issue 42` |
| `review #42 #43 #44` | `/review-issue 42 43 44` |
| `please review #42` | `/review-issue 42` |
`review` is a **tracked action** (routes to command), not an analysis keyword. `review` without issue number does not trigger routing.
## Workflows
All `--repo` flags should use repository from `.gh-pmu.json` (`repositories[0]`).
**Epic Workflow (CRITICAL):** Takes precedence when issue has "epic" label. Detection mandatory.
Epic flow: `/work` detects epic -> loads sub-issues -> ascending numeric order (default) or custom `**Processing Order:**` from epic body -> skips sub-issues in `in_review`/`done` -> works remaining sequentially (each: in_progress -> work -> AC -> in_review -> **STOP per sub-issue** -> "done" -> next). All sub-issues done -> epic AC -> in_review -> **STOP** -> "done" -> recursive close.
**Never skip per-sub-issue STOP boundary.** See `/work` (Steps 4, 7, 12) and `/done`.
**Reopen Workflow:** Trigger: "reopen issue #[number]", "reopen #[number]", "open issue #[number] again"
```bash
gh issue reopen [issue-number] --repo {repository}
gh pmu move [issue-number] --status ready
```
Report: "Reopened issue #[number] and set status to Ready."
**Branch Reopen Workflow:** Trigger: "reopen branch [name]", "reopen release [name]", "resume work on branch [name]"
```bash
gh pmu branch reopen [branch-name]
```
Report: "Reopened branch tracker for [branch-name]. You can now add issues with `gh pmu move [#] --branch current`."
**PR-Only Main Merges (CRITICAL):** All work must go through pull requests to main. Never push directly.
1. Create PR: `gh pr create --base main --head release/vX.Y.Z`
2. Fill in PR summary and test plan
3. Wait for review/approval
4. Merge via PR (never direct push)
| Blocked Action | Response |
|--------|----------|
| `git push origin main` | "Use PR to merge to main" |
| `git merge main` (on main branch) | Block |
| Any direct commits to main | Block |
**Allowed:** Push to release/patch/hotfix branches, create PRs to main, merge PRs after approval.
## gh pmu Error Recovery
**"terms not accepted" Error:**
1. The error output contains the full terms text — display it to the user
2. Ask for consent
3. Run `gh pmu accept --yes` only after user confirms
**Never run `gh pmu accept --yes` without user consent.** Do not run `gh pmu accept` without `--yes` — it requires interactive stdin unavailable in Claude Code.
## Manual Overrides
- **Skip issue creation:** User says "don't create an issue for this"
- **Different label:** User specifies "label this as [label]"
- **Don't close:** User says "keep the issue open"
**End of GitHub Workflow Integration**
