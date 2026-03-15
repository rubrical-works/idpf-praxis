# GitHub Workflow Integration
**Version:** v0.63.1
**MUST READ:** This file must be read at session startup and after any compaction.
This document configures Claude to automatically manage GitHub issues during development sessions.

## Project Configuration
**Read from `.gh-pmu.json`** in the repository root. This file defines:
- Project board connection (owner, number)
- Repositories to track
- **Project field values** (Status, Priority) - these are NOT labels

### Labels vs Project Fields
**Labels** = Issue metadata (e.g., `bug`, `enhancement`, `pm-tracked`)
- Applied via: `gh issue edit --add-label "bug"`
**Project Fields** = Project board columns/values (e.g., Status, Priority)
- Updated via: `gh pmu move [number] --status [value]`
- Values defined in `.gh-pmu.json` under `fields:`
```yaml
project:
    owner: {owner}      # GitHub username or org
    number: {number}    # Project board number
repositories:
    - {owner}/{repo}    # Repository in owner/repo format

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
- **Repository:** `repositories[0]` (e.g., `rubrical-works/idpf-praxis-dev`)
- **Project Board:** `https://github.com/users/{project.owner}/projects/{project.number}/views/1`
Use the **alias** (left side) in commands: `gh pmu move 90 --status in_progress`
If `.gh-pmu.json` doesn't exist, run `gh pmu init` to create it.

### Framework Configuration
Specify the IDPF framework to enable workflow restrictions:
```yaml
# Framework declaration (optional)
framework: IDPF-Agile  # or IDPF-Vibe
```
If no framework is set, all commands are available without restrictions.

### Release Configuration
Configure release tracks and artifact generation:
```yaml
release:
  tracks:
    stable:
      prefix: "v"           # v1.2.0
      default: true
    patch:
      prefix: "patch/"      # patch/1.1.1
      constraints:
        version: patch_only # Must be PATCH increment
        labels:
          forbidden: ["breaking-change"]
          required: []      # Warning if missing bug/fix/hotfix
    beta:
      prefix: "beta/"       # beta/2.0.0
  artifacts:
    directory: Releases     # Base directory for artifacts
    release_notes: true     # Generate release-notes.md
    changelog: true         # Generate changelog.md
```
**Track Prefixes:** Define how Release field values are formatted:
- `stable` (default): `v1.2.0`
- `patch`: `patch/1.1.1`
- `beta`: `beta/2.0.0-beta.1`
**Constraints:** Enforce rules per track:
- `version: patch_only` - Version must be PATCH increment only
- `labels.forbidden` - Error if issue has these labels
- `labels.required` - Warning if issue missing these labels

### Initial Setup
Run `gh pmu init` for guided setup. Requires a `Branch` Text field in your GitHub Project.
**After project creation:** Set default repository in project settings (Settings → Default repository). Without this, issues may go to wrong repo.

### Terms Acceptance
Before any `gh pmu` commands will execute, terms must be accepted once per repository:
```bash
gh pmu accept --yes
```
- Acceptance persists in `.gh-pmu.json` — one-time per repo
- Must be re-run if `.gh-pmu.json` is regenerated (e.g., after `gh pmu init`)
- The `--yes` flag is required for non-interactive environments (Claude Code, CI pipelines)
- Without acceptance, all `gh pmu` commands will fail with "terms not accepted"

## gh pmu Command Reference
The `gh-pmu` extension provides unified project management. Issue management and branch commands are documented in their respective command specs (`/work`, `/done`, `/create-branch`, `/prepare-release`, etc.). This section covers flags and operations that span multiple commands.

### Move Command Flags
The `gh pmu move` command supports these flags:
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
**Multi-Issue Syntax:** The move command accepts multiple issue numbers in a single call:
```bash
# Move multiple issues at once (more efficient than parallel calls)
gh pmu move 42 43 44 --status in_progress
gh pmu move 100 101 102 103 --branch current
gh pmu move 50 51 52 --status done
```
**Deprecation Notice:** `--release` flag is deprecated. Use `--branch` instead. Both work, but `--release` will show a warning.

### Sub-Issue Management
| Command | Description | Replaces |
|---------|-------------|----------|
| `gh pmu sub create --parent [#] --title "..."` | Create and link sub-issue | `gh issue create` + `gh pmu sub add` |
| `gh pmu sub add [parent] [child]` | Link existing issues | - |
| `gh pmu sub list [#]` | List sub-issues | - |
| `gh pmu split [#] --from=body` | Create sub-issues from checklist | Manual sub-issue creation |

### Bulk Operations
| Command | Description |
|---------|-------------|
| `gh pmu move [#] [#] [#] --status done` | Update multiple issues at once |
| `gh pmu move [#] --status done --recursive` | Update issue and all sub-issues |
| `gh pmu move [#] --recursive --dry-run` | Preview recursive changes without applying |
| `gh pmu triage --query "..." --apply status:backlog` | Bulk update matching issues |
| `gh pmu intake --apply` | Add untracked issues to project |

### Auto-Close Behavior
**Important:** When using the default Kanban project template, moving an issue to `done` status automatically closes it via GitHub project workflow. This means:
- `gh pmu move [#] --status done` is sufficient - no separate `gh issue close` needed
- The explicit `gh issue close` command is only needed when:
  - Specifying a close reason (`not_planned` vs `completed`)
  - Adding a closing comment
  - Using a project without auto-close workflow

## Slash Command Preference
When working in repositories with IDPF framework deployed, prefer slash commands over raw `gh pmu` commands for better workflow integration.

### Command Mapping
| Instead of | Use |
|------------|-----|
| `bug:` inline issue creation | `/bug <title>` |
| `enhancement:` inline issue creation | `/enhancement <title>` |
| `proposal:` / `idea:` inline creation | `/proposal <title>` |
| `work #N` inline routing logic | `/work #N` |
| `done` / `gh pmu move --status done` | `/done [#N]` |
| `gh pmu branch start --name "..."` | `/create-branch [branch]` |
| `gh pmu branch list` + manual selection | `/switch-branch` |
| `gh pmu branch close` (for releases) | `/prepare-release` |
| `gh pmu branch close` (for features) | `/merge-branch` |
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

### When to Use Raw Commands
- Debugging slash command issues
- Operations not covered by slash commands (e.g., `gh pmu move --status`)
- User explicitly requests raw command
- Bulk operations with complex flags

## Critical Rules
⚠️ **Issues close ONLY when user says "Done"** - Never close automatically, skip STOP checkpoint, or close because code shipped
⚠️ **Acceptance criteria must be checked** - All boxes checked before In Review or Done; evaluate criteria when moving to In Review
⚠️ **No auto-close keywords until Done** - Use `Refs #XXX` (not `Fixes/Closes/Resolves #XXX`) until user approves
⚠️ **All work on working branches** - Never push to main directly; work requires a branch tracker; checkout working branch before working
⚠️ **Work requires explicit trigger** - After "evaluate" or "assess" commands, STOP after analysis. Never implement until user says "work", "fix that", or "implement that". Clarifying questions ≠ work permission.

### Analysis vs Work (HARD STOP)
**Analysis keywords:** evaluate, analyze, assess, investigate, check, verify
**Note:** `review` is a **tracked action** that routes to `/review-issue` — NOT an analysis keyword.
**When these keywords appear with an issue reference (#N):**
1. Report findings only
2. **STOP** - Do not implement
3. Use **read-only** commands (queries, not mutations)
4. End with: "Analysis complete. Say 'work' to implement."
**Forbidden during analysis:**
- Running scripts that have side effects
- Creating/editing/moving issues (except reading)
- Making code changes
- Any `gh pmu move`, `git commit`, `node script.js` that modifies state
**Examples:**
- ✅ `gh pmu view 123` (read-only)
- ✅ `gh issue view 123 --json body` (read-only)
- ❌ `gh pmu move 123 --status in_progress` (modifies state)
- ❌ `node .claude/scripts/shared/assign-branch.js --add-ready` (side effects)

### Commit Message Issue References
| Phase | Allowed Keywords | Forbidden Keywords |
|-------|------------------|-------------------|
| In Progress / In Review | `Refs #XXX`, `Related to #XXX`, `Part of #XXX` | `Fixes`, `Closes`, `Resolves` |
| After user says "Done" | `Fixes #XXX`, `Closes #XXX`, `Resolves #XXX` | — |
**Why this matters:** GitHub automatically closes issues when commits containing `Fixes/Closes/Resolves #XXX` are merged to the default branch. This bypasses the STOP checkpoint and closes issues without user approval.

## Workflow Routing (CRITICAL)

### Work Command Routing
**When user says "work #N":** The `/work` command handles validation, branch assignment checks, issue type detection (epic vs standard), auto-todo extraction, PRD tracker auto-move, and framework methodology dispatch.
See `/work` command spec for full workflow details.

### Epic Detection (Safety Reinforcement)
**⚠️ CRITICAL: Epic label takes precedence.** When an issue has the "epic" label, detection is mandatory — always check labels before routing. Never skip the per-sub-issue STOP boundary.
See `/work` command spec (Steps 4, 7, 12) for epic workflow details.

### Trigger Word Routing (Create Issue First)
When user message starts with any of these prefixes, route to the corresponding command:
| Trigger | Command | Description |
|---------|---------|-------------|
| `bug:` | `/bug` | Create bug issue with standard template |
| `enhancement:` | `/enhancement` | Create enhancement issue with standard template |
| `idea:` | `/proposal` | Alias for proposal |
| `proposal:` | `/proposal` | Create proposal document + tracking issue |
Each command creates the issue, reports the number, and STOPs. Do NOT proceed to implementation until user explicitly says "work".

### Review Command Routing
When user message contains `review` with an issue reference (`#N`), route to `/review-issue`:
| Trigger Pattern | Routes To |
|----------------|-----------|
| `review #42` | `/review-issue 42` |
| `review #42 #43 #44` | `/review-issue 42 43 44` |
| `please review #42` | `/review-issue 42` |
**Important:** `review` is a **tracked action** (routes to a command), not an analysis keyword. Other analysis keywords (`evaluate`, `analyze`, `assess`, `investigate`, `check`, `verify`) remain as passive analysis triggers that inject STOP reminders.
`review` without an issue number does not trigger routing (falls through normally).

## Workflows
**Important:** All `--repo` flags in commands below should use the repository from `.gh-pmu.json` (`repositories[0]`).

### 4. Epic Workflow
**CRITICAL:** Takes precedence when issue has "epic" label. Detection mandatory — check labels before routing.
Epic flow: `/work` detects epic → loads sub-issues → ascending numeric order (default) or custom `**Processing Order:**` from epic body → skips sub-issues already in `in_review`/`done` → works remaining sequentially (each: in_progress → work → AC → in_review → **STOP per sub-issue** → "done" → next). All sub-issues in `in_review`/`done` → epic AC → in_review → **STOP** → "done" → recursive close.
**Processing order override:** `**Processing Order:**` section in epic body with ordered `#N` references.
**Never skip per-sub-issue STOP boundary.**
See `/work` (Steps 4, 7, 12) and `/done` command specs.

### 6. Reopen Workflow (Reopening Closed Issues)
**Trigger phrases:**
- "reopen issue #[number]"
- "reopen #[number]"
- "open issue #[number] again"
- Any request to reopen a closed issue
**Action: Reopen and set status (AUTOMATIC)**
When user requests to reopen an issue:
```bash
gh issue reopen [issue-number] --repo {repository}
```
```bash
gh pmu move [issue-number] --status ready
```
Then report: "Reopened issue #[number] and set status to Ready."

### 6.5. Branch Reopen Workflow (Reopening Closed Branch Trackers)
**Trigger phrases:**
- "reopen branch [name]"
- "reopen release [name]"
- "resume work on branch [name]"
**Use case:** When you need to continue work on a previously closed release/patch branch.
**Action: Reopen branch tracker**
```bash
gh pmu branch reopen [branch-name]
```
**Example:**
```bash
# Reopen a closed release branch
gh pmu branch reopen release/v1.2.0

# Reopen a closed patch branch
gh pmu branch reopen patch/v1.1.5
```
This reopens the tracker issue and sets it back to In Progress status.
Then report: "Reopened branch tracker for [branch-name]. You can now add issues with `gh pmu move [#] --branch current`."

### 11. PR-Only Main Merges
**CRITICAL:** All work must go through pull requests to main. Never push directly.
**When User Requests Merge to Main:**
1. Create PR from release branch: `gh pr create --base main --head release/vX.Y.Z`
2. Fill in PR summary and test plan
3. Wait for review/approval
4. Merge via PR (never direct push)
**Blocked Actions:**
| Action | Response |
|--------|----------|
| `git push origin main` | Block with message: "Use PR to merge to main" |
| `git merge main` (on main branch) | Block |
| Any direct commits to main | Block |
**Allowed Actions:**
- Push to release/patch/hotfix branches
- Create PRs to main
- Merge PRs after approval

## gh pmu Error Recovery

### "terms not accepted" Error
When any `gh pmu` command fails with "terms not accepted":
1. **Read the terms:** Run `gh pmu accept` (without `--yes`) to display the full terms text
2. **Display to user:** Show the complete terms text so the user can review them
3. **Ask for consent:** Ask the user if they want to accept the terms
4. **Accept only after consent:** Run `gh pmu accept --yes` only after the user confirms
**Never run `gh pmu accept --yes` without user consent.** The terms gate exists for a reason — users must knowingly agree.
```bash
# Step 1: Display terms for user review
gh pmu accept
# Step 2: After user consents
gh pmu accept --yes
```

## Manual Overrides
- **Skip issue creation:** User says "don't create an issue for this"
- **Different label:** User specifies "label this as [label]"
- **Don't close:** User says "keep the issue open"
**End of GitHub Workflow Integration**
