---
version: "v0.51.0"
description: Complete issues with criteria verification and status transitions (project)
argument-hint: "[#issue...] (optional)"
---

<!-- EXTENSIBLE -->
# /done
Complete one or more issues. Moves from `in_review` → `done` with a STOP boundary. Only handles the final transition — `/work` owns `in_progress` → `in_review`.
## Available Extension Points
| Point | Location | Purpose |
|-------|----------|---------|
| `pre-done` | Before moving to done | Tests, lint, build verification |
| `post-done` | After moving to done | Deploy trigger, time tracking stop |
---
## Prerequisites
- `gh pmu` extension installed
- `.gh-pmu.yml` configured in repository root
- Issue in `in_review` status (use `/work` first)
---
## Arguments
| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | No | Single issue number (e.g., `#42` or `42`) |
| `#issue #issue...` | | Multiple issue numbers (e.g., `#42 #43 #44`) |
| *(none)* | | Queries `in_review` issues for selection |
---
## Execution Instructions
**REQUIRED:** Before executing:
1. **Generate Todo List:** Parse workflow steps, use `TodoWrite` to create todos
2. **Include Extensions:** Add todo for each non-empty `USER-EXTENSION` block
3. **Track Progress:** Mark todos `in_progress` → `completed` as you work
4. **Post-Compaction:** Re-read spec and regenerate todos after context compaction
---
## Workflow
### Step 1: Parse Arguments
Formats: `#42` (single), `#42 #43 #44` (multiple), *(none)* (query)
**For no arguments:**
```bash
gh pmu list --status in_review
```
| Result | Action |
|--------|--------|
| No issues found | "No issues in review. Specify issue number or complete work first." → **STOP** |
| Single issue | Confirm: `Issue #N: $TITLE is in review. Complete it? (yes/no)` |
| Multiple issues | Present numbered list for user selection |
**Multiple issues:** Process each sequentially using Steps 2-5.
### Step 2: Validate Issue
```bash
gh issue view $ISSUE --json number,title,labels,body,state
```
**Not found:** "Error: Issue #$ISSUE not found." → **STOP** (continue to next if batch)
**Already closed:** "Issue #$ISSUE is already closed. Skipping." → skip or **STOP**
### Step 2b: PRD Label Redirect
Check labels from Step 2 for `prd` label.
**If `prd` label:** "Use `/complete-prd #$ISSUE` to close PRD trackers." → **STOP** (skip to next if batch)
**No `prd` label:** Continue to Step 3.
### Step 3: Detect Current Status
```bash
gh pmu view $ISSUE --json=status
```
| Status | Path |
|--------|------|
| `in_review` | Proceed to Step 3b |
| `in_progress` | "Issue #$ISSUE is still in progress. Complete work first via /work." → **STOP** |
| `done` | Already done — report and skip |
| Other | "Issue #$ISSUE is in $STATUS. Move to in_progress first via /work." → **STOP** |

<!-- USER-EXTENSION-START: pre-done -->
<!-- USER-EXTENSION-END: pre-done -->

### Step 3b: Diff Verification
```bash
node .claude/scripts/shared/done-verify.js --issue $ISSUE
```
Parse JSON output:
- **No commits found:** "Warning: No commits reference #$ISSUE." → **STOP.** Wait for user.
- **Warnings present:** List concerns, ask "Continue? (yes/no)" → **STOP.** Wait for user.
- **New files detected:** Report informational (not blocking): `New files: [list]`
- **Clean:** `Diff verified: N commits, M files changed (all substantive)` → Proceed to Step 4.
### Step 4: Move to Done
```bash
gh pmu move $ISSUE --status done
```
Report: `Issue #$ISSUE: $TITLE → Done`
### Step 4a: Branch Tracker Linking
Link completed issue as sub-issue of the current branch tracker.
```bash
node -e "const t = require('./.claude/scripts/shared/lib/active-label.js').getTrackerForBranch(); console.log(t || 'none')"
```
**If tracker found (not `none`):**
```bash
gh pmu sub add $TRACKER $ISSUE || true
```
Report: `Linked #$ISSUE to branch tracker #$TRACKER`
**If no tracker (main branch or untracked):** Skip silently — no error.
### Step 4b: Next Steps Guidance (Approval Gate)
Check labels from Step 2 for `test-plan` AND `approval-required`.
**If both labels present:**
1. Parse issue body for PRD reference: `**PRD:** #NNN` or `**PRD Tracker:** #NNN`
2. **If PRD reference found:**
   ```
   Next steps:
     1. /review-prd #NNN — review the PRD before decomposition
     2. /create-backlog #NNN — decompose into epics/stories (after review)
   ```
3. **If no PRD reference found:**
   ```
   Next steps:
     Review the linked PRD before running /create-backlog.
   ```
**If labels not present:** Skip — no action needed. Continue to Step 5.

<!-- USER-EXTENSION-START: post-done -->
<!-- USER-EXTENSION-END: post-done -->

### Step 5: Push
```bash
git push
```
Report: `Pushed.`
### Step 5b: Background CI Monitoring
After push:
1. Get SHA: `sha=$(git rev-parse HEAD)`
2. **Pre-check push workflows:** `hasPushWorkflows()` is synchronous and returns `boolean`. Call it directly (no `await`):
   ```js
   const { hasPushWorkflows, shouldSkipMonitoring } = require('.claude/scripts/shared/ci-watch.js');
   if (!hasPushWorkflows()) → skip, report: "CI skipped (no push-triggered workflows)"
   ```
3. **Pre-check paths-ignore:** `shouldSkipMonitoring(changedFiles, pathsIgnore)` is synchronous and returns `boolean`. Obtain `changedFiles` via `git diff --name-only HEAD~1` and `pathsIgnore` from workflow YAML. If all files match → skip, report: `"CI skipped (paths-ignore)"`
4. **Spawn background:** Bash with `run_in_background: true`:
   ```bash
   node .claude/scripts/shared/ci-watch.js --sha $SHA --timeout 300
   ```
5. Report: `"CI monitoring started in background."`
**Exit codes:**
| Code | Report |
|------|--------|
| 0 | `"CI passed for #$ISSUE (duration)"` |
| 1 | `"CI FAILED. Failed step: \"step-name\". Run: gh run view <id> --log-failed"` |
| 2 | `"CI still running after 5m. Check: gh run list --commit $SHA"` |
| 3 | `"No CI run triggered (paths-ignore likely)"` |
| 4 | `"CI cancelled (superseded by newer push)"` |
**Multiple workflows:** Report per-workflow from `workflows` array.
### Step 6: Cleanup
**MUST DO:** Clear todo list.
---
## Error Handling
| Situation | Response |
|-----------|----------|
| Issue not found | "Issue #N not found." → STOP |
| Issue already closed | "Issue #N is already closed." → skip |
| Issue still in_progress | "Complete work first via /work." → STOP |
| Issue in other status | "Move to in_progress first via /work." → STOP |
| No issues in review | "No issues in review." → STOP |
| `gh pmu` fails | "Failed to update issue: {error}" → STOP |
---
**End of /done Command**
