# GitHub Workflow Integration
**Version:** v0.54.0
---
**MUST READ:** At session startup and after compaction.
**Source:** Reference/GitHub-Workflow.md
## Project Configuration
**Read from `.gh-pmu.json`:**
```yaml
project:
    owner: {owner}
    number: {number}
repositories:
    - {owner}/{repo}
fields:
    status:
        values: {backlog, in_progress, in_review, done}
    priority:
        values: {p0, p1, p2}
```
Use alias (left side) in commands: `gh pmu move 90 --status in_progress`
**If missing:** Run `gh pmu init`
**After project creation:** Set default repository in project settings (Settings → Default repository). Without this, issues may go to wrong repo.
**Terms Acceptance:** Run `gh pmu accept --yes` before first use. Persists in `.gh-pmu.json` — re-run after `gh pmu init`.
**Framework config (optional):** `framework: IDPF-Agile` enables workflow restrictions.
## gh pmu Command Reference
Issue management and branch commands are in their respective command specs. This section covers cross-command flags and operations.
**Sub-Issue Management:**
| Command | Replaces |
|---------|----------|
| `gh pmu sub create --parent [#] --title "..."` | `gh issue create` + `gh pmu sub add` |
| `gh pmu sub add [parent] [child]` | - |
| `gh pmu sub list [#]` | - |
| `gh pmu split [#] --from=body` | Manual sub-issue creation |
**Bulk Operations:**
- `gh pmu move [#] [#] [#] --status done` - Update multiple issues at once
- `gh pmu move [#] --status done --recursive` - Update issue + all sub-issues
- `gh pmu move [#] --recursive --dry-run` - Preview recursive changes
- `gh pmu triage --query "..." --apply status:backlog` - Bulk update
- `gh pmu intake --apply` - Add untracked issues
**Move Flags:** `--status`, `--branch` (replaces `--release`), `--backlog` (clear fields), `--recursive`, `--dry-run`, `--depth N`, `-f/--force`, `--yes`
**Multi-Issue:** `gh pmu move 42 43 44 --status in_progress` - more efficient than parallel calls
**Deprecation:** `--release` flag deprecated, use `--branch` instead.
**Auto-Close:** Default Kanban template auto-closes issues when moved to `done`. `gh issue close` only needed for close reason or comment.
## Slash Command Preference
Prefer slash commands over raw `gh pmu` commands:
| Instead of | Use |
|------------|-----|
| `bug:` inline issue creation | `/bug <title>` |
| `enhancement:` inline issue creation | `/enhancement <title>` |
| `proposal:` / `idea:` inline creation | `/proposal <title>` |
| `work #N` inline routing | `/work #N` |
| `done` / `gh pmu move --status done` (in_review → done) | `/done [#N]` |
| `gh pmu branch start` | `/create-branch` |
| `gh pmu branch list` | `/switch-branch` |
| `gh pmu branch close` (releases) | `/prepare-release` |
| `gh pmu branch close` (features) | `/merge-branch` |
| `gh pmu branch delete` | `/destroy-branch` |
| `gh pmu move [#] --branch` | `/assign-branch` |
| Manual PRD creation | `/create-prd` |
| Manual backlog creation from PRD | `/create-backlog` |
| Manual story creation | `/add-story` |
| Manual story splitting | `/split-story` |
| Pivot/direction change review | `/pivot` |
| Manual issue review | `/review-issue #N` |
| Manual proposal review | `/review-proposal #N` |
| Manual PRD review | `/review-prd #N` |
| Manual test plan review | `/review-test-plan #N` |
**Use raw commands for:** debugging, uncovered operations, user request, complex bulk ops.
## Critical Rules
- **Issues close ONLY when user says "Done"** - Never close automatically, skip STOP checkpoint, or close because code shipped
- **Acceptance criteria must be checked** - All boxes checked before In Review or Done; evaluate criteria when moving to In Review
- **No auto-close keywords until Done** - Use `Refs #XXX` (not `Fixes/Closes/Resolves #XXX`) until user approves
- **All work on working branches** - Never push to main directly; work requires branch tracker; checkout working branch before working
- **Work requires explicit trigger** - After "evaluate" or "assess" commands, STOP after analysis. Never implement until user says "work", "fix that", or "implement that". Clarifying questions ≠ work permission.
### Analysis vs Work (HARD STOP)
**Analysis keywords:** evaluate, analyze, assess, investigate, check, verify
**Note:** `review` is a **tracked action** that routes to `/review-issue` — NOT an analysis keyword.
**When these appear with issue reference (#N):**
1. Report findings only
2. **STOP** - Do not implement
3. Use **read-only** commands (queries, not mutations)
4. End with: "Analysis complete. Say 'work' to implement."
**Forbidden during analysis:**
- Running scripts with side effects
- Creating/editing/moving issues (except reading)
- Making code changes
- Any `gh pmu move`, `git commit`, `node script.js` that modifies state
### Commit Message Keywords
| Phase | Use | Avoid |
|-------|-----|-------|
| In Progress / In Review | `Refs #XXX`, `Part of #XXX` | `Fixes`, `Closes`, `Resolves` |
| After "Done" | `Fixes #XXX` | — |
## Workflow Routing (CRITICAL)
**When user says "work #N":** The `/work` command handles validation, branch checks, issue type detection, auto-todo extraction, PRD tracker auto-move, and framework dispatch. See `/work` command spec.
**Epic Detection:** ⚠️ Epic label takes precedence — detection mandatory, check labels before routing. Never skip per-sub-issue STOP boundary. See `/work` (Steps 4, 7, 12).
**Trigger Words (Create Issue First):**
| Trigger | Command | Description |
|---------|---------|-------------|
| `bug:` | `/bug` | Create bug issue with standard template |
| `enhancement:` | `/enhancement` | Create enhancement issue with standard template |
| `idea:` | `/proposal` | Alias for proposal |
| `proposal:` | `/proposal` | Create proposal document + tracking issue |
Each command creates the issue, reports the number, and STOPs. Do NOT proceed to implementation until user says "work".
**Review Command Routing:** `review #N` → `/review-issue N`. `review #42 #43` → `/review-issue 42 43`. Without issue number, no routing.
## Workflows
### 4. Epic Workflow
**CRITICAL:** Takes precedence when issue has "epic" label. Detection mandatory — check labels before routing.
Epic flow: `/work` detects epic → loads sub-issues → ascending numeric order (default) or custom `**Processing Order:**` from epic body → skips sub-issues already in `in_review`/`done` → works remaining sequentially (each: in_progress → work → AC → in_review → **STOP per sub-issue** → "done" → next). All sub-issues in `in_review`/`done` → epic AC → in_review → **STOP** → "done" → recursive close.
**Processing order override:** `**Processing Order:**` section in epic body with ordered `#N` references.
**Never skip per-sub-issue STOP boundary.**
See `/work` (Steps 4, 7, 12) and `/done` command specs.
### 6. Reopen Workflow
`gh issue reopen [#]` → `gh pmu move [#] --status ready`
### 6.5. Branch Reopen Workflow
`gh pmu branch reopen [branch-name]` - Reopen closed branch tracker (e.g., `release/v1.2.0`, `patch/v1.1.5`)
### 11. PR-Only Main Merges
All work via PRs to main. Never push directly.
1. `gh pr create --base main --head release/vX.Y.Z`
2. Wait for review/approval
3. Merge via PR
**Blocked:** `git push origin main`, direct commits to main
**Allowed:** Push to release/patch branches, create/merge PRs
## gh pmu Error Recovery
**"terms not accepted":** Display terms (`gh pmu accept`), ask user consent, then `gh pmu accept --yes`. Never auto-accept without user consent.
## Manual Overrides
- "don't create an issue" → Skip issue creation
- "label this as [label]" → Use specified label
- "keep the issue open" → Don't close
**End of GitHub Workflow Integration**
