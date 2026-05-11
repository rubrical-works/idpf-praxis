# GitHub Workflow Integration
**Version:** v0.91.1
**Source:** Reference/GitHub-Workflow.md
Configures Claude to manage GitHub issues during development sessions.
## Project Configuration
Read from `.gh-pmu.json` in repo root. Defines project board, repositories, field values (Status, Priority), framework, release tracks. Use alias (left side of `fields:`) in commands: `gh pmu move 90 --status in_progress`. Run `gh pmu init` for setup. Full schema details: `Reference/gh-pmu-Configuration.md`.
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
**Forbidden during analysis:** side-effect scripts, creating/editing/moving issues, code changes, `gh pmu move`, `git commit`, state-modifying `node` scripts.
OK: `gh pmu view 123`, `gh issue view 123 --json body`. Forbidden: `gh pmu move 123 --status in_progress`, `node .claude/scripts/shared/assign-branch.js --add-ready`.
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
## Workflow Routing
**Slash Command Preference:** Prefer slash commands over raw `gh pmu`. Fall back to raw for debugging, unsupported ops, or complex bulk operations.
**Trigger Word Routing (Create Issue First):**
| Trigger | Command | Description |
|---------|---------|-------------|
| `bug:` | `/bug` | Create bug issue |
| `enhancement:` | `/enhancement` | Create enhancement issue |
| `idea:` | `/proposal` | Alias for proposal |
| `proposal:` | `/proposal` | Create proposal + tracking issue |
Each creates issue, reports number, STOPs. Do NOT implement until user says "work".
**Review Command Routing:** `review` with issue reference (`#N`) routes to `/review-issue`:
| Trigger Pattern | Routes To |
|----------------|-----------|
| `review #42` | `/review-issue 42` |
| `review #42 #43 #44` | `/review-issue 42 43 44` |
| `please review #42` | `/review-issue 42` |
`review` is a **tracked action** (routes to command), not an analysis keyword. `review` without issue number does not trigger routing.
**Epic Detection:** Epic label takes precedence. Always check labels before routing. Never skip per-sub-issue STOP boundary.
## Reopen Workflows
**Reopening Closed Issues:** Trigger: "reopen issue #N", "reopen #N", "open issue #N again"
```bash
gh issue reopen [issue-number] --repo {repository}
gh pmu move [issue-number] --status ready
```
Report: "Reopened issue #N and set status to Ready."
**Reopening Closed Branch Trackers:** Trigger: "reopen branch [name]", "reopen release [name]", "resume work on branch [name]"
```bash
gh pmu branch reopen [branch-name]
```
Report: "Reopened branch tracker for [branch-name]. You can now add issues with `gh pmu move [#] --branch current`."
## PR-Only Main Merges
**CRITICAL:** All work must go through pull requests to main. Never push directly.
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
## Error Recovery
**"terms not accepted" Error:**
1. The error output contains the full terms text -- display it to the user
2. Ask for consent
3. Run `gh pmu accept --yes` only after user confirms
**Never run `gh pmu accept --yes` without user consent.** `--yes` required -- interactive stdin unavailable in Claude Code.
## Manual Overrides
- **Skip issue creation:** User says "don't create an issue for this"
- **Different label:** User specifies "label this as [label]"
- **Don't close:** User says "keep the issue open"
**End of GitHub Workflow Integration**
