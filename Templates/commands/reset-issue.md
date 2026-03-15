---
version: "v0.63.1"
description: Reset bug/enhancement/prd/proposal issue to clean slate (project)
argument-hint: "#issue [--dry-run]"
---
<!-- MANAGED -->
# /reset-issue
Reset a bug, enhancement, PRD, or proposal issue to a clean slate. Removes review artifacts, resolutions, test plans, and associated downstream files.
## Prerequisites
- `gh pmu` extension installed
- `.gh-pmu.json` configured in repository root
## Arguments
| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | Yes | Issue number to reset (e.g., `#42` or `42`) |
| `--dry-run` | No | Preview actions without executing |
## Workflow
### Step 1: Validate Issue Type
```bash
gh pmu view $ISSUE --json=number,title,labels,body,state
```
**Allowed labels:** `bug`, `enhancement`, `prd`, `proposal`
**Rejected:** `story`, `epic`, `branch`, or any other type
If rejected: report error with label name -> **STOP**
### Step 2: Analyze Reset Scope
Parse the issue to determine what will be reset:
| Item | Detection |
|------|-----------|
| AC checkboxes | Count `[x]` boxes in body |
| Reviews counter | Parse `**Reviews:** N` from body |
| Auto-generated sections | Find `#### Proposed Solution`, `#### Proposed Fix` |
| Review comments | Query comments for `## Issue Review`, `## Proposal Review`, `## PRD Review` |
| `reviewed` label | Check labels array |
| Test plan files | Search `Construction/Test-Plans/` for files referencing `#$ISSUE` |
**For proposal issues additionally:**
| Item | Detection |
|------|-----------|
| Associated PRD issue | Parse body for PRD reference (`PRD: #N` or `PRD/{name}/PRD-{name}.md`) |
| PRD converted to backlog | Check if PRD issue has sub-issues in `in_progress`/`in_review`/`done` |
### Step 3: Dry-Run or Confirmation
**If `--dry-run`:** Report all actions that would be taken, then **STOP**.
**If not dry-run:** Use `AskUserQuestion` to confirm reset actions.
**If user declines:** -> **STOP**
### Step 4: Execute Reset
**4a: Reset issue body**
```bash
gh pmu view $ISSUE --body-stdout > .tmp-$ISSUE.md
```
- Replace all `[x]` with `[ ]`
- Replace `**Reviews:** N` with `**Reviews:** 0`
- Remove `#### Proposed Solution` section (if auto-generated)
- Remove `#### Proposed Fix` section (if auto-generated)
```bash
gh pmu edit $ISSUE -F .tmp-$ISSUE.md && rm .tmp-$ISSUE.md
```
**4b: Move to backlog**
```bash
gh pmu move $ISSUE --status backlog
```
**4c: Delete review comments**
```bash
gh api repos/{owner}/{repo}/issues/$ISSUE/comments --paginate
```
For each comment matching review patterns:
```bash
gh api -X DELETE repos/{owner}/{repo}/issues/comments/$COMMENT_ID
```
**4d: Remove reviewed label**
```bash
gh issue edit $ISSUE --remove-label reviewed
```
(Skip silently if not present)
**4e: Delete test plan files**
For each test plan in `Construction/Test-Plans/` referencing `#$ISSUE`:
```bash
git rm "$FILE"
```
**4f: Proposal -- PRD cleanup**
If issue has `proposal` label and associated PRD:
- **PRD NOT converted to backlog:** Delete PRD issue and files
  ```bash
  gh issue close $PRD_ISSUE --comment "Deleted by /reset-issue #$ISSUE"
  gh pmu move $PRD_ISSUE --status done
  git rm -r "PRD/{name}/"
  ```
- **PRD converted to backlog:** Warn and ask user (keep PRD / delete and orphan / cancel)
### Step 5: Commit Changes
If files were deleted (test plans, PRD files):
```bash
git commit -m "Refs #$ISSUE -- reset issue artifacts (test plans, PRD files)"
```
### Step 6: Post Audit Comment
```bash
gh issue comment $ISSUE --body "Issue reset by /reset-issue on $DATE. Removed: $N review comments, $M test plan files. Status: backlog."
```
### Step 7: Report Completion
Report all actions taken (checkboxes unchecked, counter reset, sections removed, comments deleted, label removed, test plans deleted, status set to backlog, audit comment posted).
**STOP.**
## Error Handling
| Situation | Response |
|-----------|----------|
| Issue not found | "Issue #N not found." -> STOP |
| Invalid issue type | "Only bug, enhancement, prd, proposal issues can be reset." -> STOP |
| User declines confirmation | "Reset cancelled." -> STOP |
| No review comments found | Skip deletion, report "0 review comments" |
| No test plan files found | Skip deletion, report "0 test plan files" |
| git rm fails | Report error, continue with remaining actions |
| PRD has converted backlog | Warn and ask for disposition |
**End of /reset-issue Command**
