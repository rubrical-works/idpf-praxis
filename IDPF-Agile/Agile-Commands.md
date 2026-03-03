# Agile-Driven Development Framework - Commands
**Version:** v0.56.0
**Module:** Commands (loaded on-demand)
---
## Backlog Management Commands
All backlog commands work against GitHub issues. No local backlog files.
**Prerequisites:** `.gh-pmu.json` configured, `gh pmu` extension installed
| Command | Description | Slash Command |
|---------|-------------|---------------|
| `Create-Backlog` | Create GitHub epics/stories from PRD | `/create-backlog` |
| `Add-Story` | Add story to epic with charter compliance | `/add-story` |
| `Prioritize-Backlog` | Update Priority field (P0/P1/P2) for issues | - |
| `Split-Story [#ID]` | Split story into smaller stories | `/split-story` |
**Note:** For editing stories, use `gh pmu edit #ID -F file.md`. For archiving, use `gh pmu move #ID --status parking_lot`.
### Create-Backlog Workflow
Trigger: **"Create-Backlog"** or **"/create-backlog [prd-issue#]"**
1. **Validate PRD Issue:** Fetch PRD tracking issue, validate `prd` label
2. **Test Plan Approval Gate:** Block if test plan approval issue is still open
3. **Parse PRD:** Extract Epics and Stories with acceptance criteria
4. **Load Test Cases:** Pull test cases from approved Test-Plan-{name}.md
5. **Create Epic Issues:** Create issues with `epic` label
6. **Create Story Issues:** Create issues with `story` label and embedded TDD test cases
7. **Link Stories to Epics:** `gh pmu sub add [epic#] [story#]`
8. **Update PRD Status:** Change status to "Backlog Created"
### Add-Story Workflow
Trigger: **"Add-Story"** or **"/add-story [epic#]"**
1. **Validate Epic:** If epic specified, validate it exists with `epic` label
2. **Get Description:** User describes the new story (user/capability/benefit)
3. **Charter Compliance:** Validate story aligns with CHARTER.md scope and constraints
4. **Create Issue:** Create story issue with `story` label
5. **Link to Epic:** `gh pmu sub add [epic#] [story#]`
6. **Update Test Plan:** Add test cases to relevant Test-Plan-{name}.md
7. **Set Status:** `gh pmu move [story#] --status backlog`
### Split-Story Workflow
Trigger: **"Split-Story [#ID]"** or **"/split-story [#ID]"**
1. **Fetch Original:** Load story details and find parent epic
2. **Get Split Criteria:** User describes how to divide the story
3. **Charter Compliance:** Validate split stories remain in project scope
4. **Create New Stories:** Create smaller story issues linked to same epic
5. **Update Test Plan:** Redistribute test cases among new stories
6. **Close Original:** Close original story with split reference
---
## Story Workflow
Story lifecycle managed via **workflow triggers** in GitHub-Workflow.md.
| Action | Trigger | Behavior |
|--------|---------|----------|
| Start story | `work #N` | Sets status to In Progress, displays story, begins TDD |
| Check status | `gh pmu view #N` | Shows issue details directly |
| Complete story | `done` | Verifies criteria, runs tests, sets status to Done |
**PRD Completion:** When final "Update PRD status to Complete" story is completed:
1. Verify all other PRD stories are Done
2. Update PRD status to "Complete"
3. Move PRD: `git mv PRD/PRD-[Name].md PRD/Implemented/PRD-[Name].md`
---
## Development Commands
| Command | Description |
|---------|-------------|
| `Run-Tests` | Execute full test suite |
| `Show-Coverage` | Display test coverage report |
**TDD Execution Model:** TDD phases (RED -> GREEN -> REFACTOR) execute autonomously within each story. Checkpoints: **In Review** (after implementation), **Done** (user approval).
**TDD Skills:** `tdd-red-phase`, `tdd-green-phase`, `tdd-refactor-phase`, `tdd-failure-recovery`, `test-writing-patterns`
---
## Release Lifecycle Commands
Release lifecycle follows trunk-based development principles.
| Command | Description | Slash Command |
|---------|-------------|---------------|
| `Create-Branch` | Create tracked branch with tracker issue | `/create-branch` |
| `Prepare-Release` | Validate, merge to main, tag, close, cleanup | `/prepare-release` |
| `Merge-Branch` | Gated merge to main (without version tagging) | `/merge-branch` |
| `Destroy-Branch` | Cancel/abandon branch with cleanup | `/destroy-branch` |
### Release Lifecycle Flow
```
/create-branch release/v0.16.0
    +-- Creates branch: release/v0.16.0
    +-- Creates tracker: #N (titled "Branch: release/v0.16.0")
    +-- Creates directory: Releases/release/v0.16.0/
    [Work on working branch]
    gh pmu move [#] --branch current
    work #N
/prepare-release
    +-- Phase 0: Commit analysis
    +-- Phase 1: Version updates
    +-- Phase 2: Validation
    +-- Phase 3: PR -> merge -> tag main
    +-- Phase 4: Verify deployment
    +-- Phase 5: Close (notes, GitHub Release, tracker, branch cleanup)
```
### Create-Branch Workflow
Trigger: **"Create-Branch [branch]"** or **"/create-branch [branch]"**
1. **Validate Arguments:** Branch must follow `[prefix]/[name]` format (e.g., `release/v0.16.0`, `patch/v0.15.4`)
2. **Check Working Directory:** Ensure no uncommitted changes
3. **Create Branch:** `gh pmu branch start --name "$BRANCH"`
4. **Switch Branch:** `git checkout "$BRANCH"`
5. **Push to Remote:** `git push -u origin "$BRANCH"`
6. **Create Directory:** `mkdir -p "Releases/$BRANCH"`
7. **Report:** Branch, tracker issue, next steps
### Prepare-Release Workflow
Trigger: **"Prepare-Release"** or **"/prepare-release"**
See `/prepare-release` command for full phase details.
### Merge-Branch Workflow
Trigger: **"Merge-Branch"** or **"/merge-branch"**
Used when merging to main without creating a version tag.
1. **Run Gates:** Verify clean working directory, tests pass
2. **Create PR:** `gh pr create --base main --head $BRANCH`
3. **Wait for Approval:** PR must be approved before merge
4. **Merge PR:** After approval
5. **Close Tracker:** Close tracker issue
6. **Delete Branch:** Local and remote
### Destroy-Branch Workflow
Trigger: **"Destroy-Branch"** or **"/destroy-branch"**
Used to cancel/abandon a branch that won't be merged.
1. **Confirm Branch Name:** User must type full branch name to confirm
2. **Close Tracker:** Close with "not planned" reason and comment
3. **Delete Branch:** Local and remote
4. **Delete Artifacts:** Remove `Releases/[branch]/` directory
---
## Special Scenario Commands
| Command | Description | Slash Command |
|---------|-------------|---------------|
| `Pivot [new direction]` | Review stories for direction change | `/pivot` |
**Direct Operations:** For blocked/scope-creep labels, use `gh issue edit #ID --add-label blocked` directly.
### Pivot Workflow
Trigger: **"Pivot [target]"** or **"/pivot [epic#|prd-name]"**
1. **Identify Scope:** Epic or PRD to pivot
2. **Document Reason:** Record pivot rationale
3. **List Stories:** Show all open stories for review
4. **Review Each:** For each story, prompt: Keep / Archive / Close
5. **Apply Actions:** Execute chosen actions
6. **Document:** Add pivot summary to parent issue
---
## Utility Commands
| Command | Description |
|---------|-------------|
| `List-Commands` | Show all available commands with descriptions |
| `Help [command]` | Get detailed help for specific command |
---
**End of Commands Module**
