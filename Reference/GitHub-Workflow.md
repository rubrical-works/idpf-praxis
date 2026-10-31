# GitHub Workflow Integration
**Version:** v0.116.0
**Source:** Reference/GitHub-Workflow.md
Configures Claude to manage GitHub issues during development sessions. Reasoning: `{frameworkPath}/Reference/GitHub-Workflow-Rationale.md` (not auto-loaded).
## Project Configuration
Read `.gh-pmu.json` (repo root) for board, fields and release tracks; use the field alias in commands (`gh pmu move 90 --status in_progress`). Setup: `gh pmu init`; schema: `Reference/gh-pmu-Configuration.md`.
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
**Forbidden during analysis:** side-effect scripts, creating/editing/moving issues, code changes, `gh pmu move`, `git commit`, state-modifying `node` scripts (e.g. `assign-branch.js --add-ready`). OK: `gh pmu view 123`, `gh issue view 123 --json body`.
**Pre-Work Status Gate:** Before work begins on an issue — **before its first acceptance criterion is worked**, inline or via spawned Agent — verify issue is `in_progress`:
```bash
gh pmu view $ISSUE --json=status --jq='.status'
```
If not "In progress", run `gh pmu move $ISSUE --status in_progress` before proceeding. Applies to **every** issue and **each sub-issue** of an epic/branch tracker as its turn begins; not to research/review/exploration agents. Trigger is the **workflow moment**, NOT the mechanism. `/work` Step 3 states the same contract; change both together (`tests/commands/work.test.js` fails on desync).
**Commit Message Issue References:**
| Phase | Allowed Keywords | Forbidden Keywords |
|-------|------------------|-------------------|
| In Progress / In Review | `Refs #XXX`, `Related to #XXX`, `Part of #XXX` | `Fixes`, `Closes`, `Resolves` |
| After user says "Done" | `Fixes #XXX`, `Closes #XXX`, `Resolves #XXX` | -- |
GitHub automatically closes issues when `Fixes/Closes/Resolves #XXX` commits merge to default branch, bypassing the STOP checkpoint.
## Workflow Routing
### Slash Command Preference
Prefer slash commands over raw `gh pmu` for board operations. Fall back to raw for debugging, unsupported operations, user request, or bulk operations with complex flags.
**Issue-creating commands are not substitutable.** `/bug`, `/enhancement` and `/proposal` are the mechanism for filing their issue types — not the preferred one of two options — and a raw `gh pmu create` does not satisfy them: a bypass silently loses the issue template, the `verificationGate` and `phaseFeasibility` gates (`.claude/metadata/ac-feasibility-prompts.json`), prior-art handling, the priority default and the reports-number-and-STOPs contract. **Needing several filings is not a qualifying fallback reason:** more than one filing means more than one turn (file one, report its number, STOP, name the rest); a batch goes through `.claude/scripts/shared/file-issue.js`, never a per-item `Skill` loop. **The prohibition is scoped to those three commands:** QA issues (§ QA-Issue Creation Ownership) and `gh pmu` board operations are unaffected.
**Routing Conventions:** the hook appends each route's notes (triggers, review, flag pass-through) to its `[INVOKE:]` context, from `trigger-patterns.json` `routingNotes`. Under the flag pass-through convention no flag-shaped token is ever discarded.
### QA-Issue Creation Ownership
`/work` Step 4a owns the **automatic** path; this governs **every other** path — `/done`, review, any manual check. Every path runs `node .claude/scripts/shared/lib/qa-issue.js`: it labels `qa-required`, runs `gh pmu sub create` or `gh pmu create` and leaves the issue in `qa_required`.
| Situation | Arguments |
|---|---|
| Belongs to a parent issue | `--parent <parent> --title "<title>" --body-file $QA_BODY_FILE` |
| Stands alone | `--title "<title>" --body-file $QA_BODY_FILE` |
`$QA_BODY_FILE` is a **creation** path: generate once per invocation, `.tmp-qa-body-{random}.md`, per `05-windows-shell.md` § Naming the temp file.
**Always `gh pmu`, never the bare `gh issue` creation form** — this rule owns that prohibition. The bare form never reaches the project board, so the issue is invisible to `gh pmu sub list`, epic closure and every board-driven gate: it blocks nothing and reads as done.
**The one exception: a `--target` companion filing.** `/bug --target` and `/enhancement --target` use the bare `gh issue` form for a **companion** repository (`gh pmu create -R` would add it to **this** repo's board); `.claude/scripts/shared/file-companion-issue.js` then adds it to the *companion's* board.
**Closure contract.** A `qa-required` issue is a **gate**: its parent AC stays unchecked as `- [ ] … → QA: #N` until the QA issue closes, and the parent reaches `done` only then — except a post-release `→ GATE: release` box `/done` hands off, checked as `- [x] … → GATE: release → QA: #N` while the QA issue stays open. `--force` past such a line is permitted **only** because the line names the sub-issue that owns the check. **The label is mandatory.**
**Epic Detection:** Epic label takes precedence. Always check labels before routing. Never skip per-sub-issue STOP boundary.
## Reopen Workflows
**Reopening Closed Issues** ("reopen #N", "open issue #N again"):
```bash
gh issue reopen [issue-number] --repo {repository}
gh pmu move [issue-number] --status ready
```
Report: "Reopened issue #N and set status to Ready."
**Reopening Closed Branch Trackers** ("reopen branch [name]", "resume work on branch [name]"):
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
Blocked: `git push origin main` ("Use PR to merge to main"), `git merge main` on main, any direct commit to main. Allowed: push to release/patch/hotfix branches, PRs to main, merging PRs after approval.
## Error Recovery
**"terms not accepted" Error:**
1. The error output contains the full terms text -- display it to the user
2. Ask for consent
3. Run `gh pmu accept --yes` only after user confirms
**Never run `gh pmu accept --yes` without user consent.** `--yes` required -- interactive stdin unavailable in Claude Code.
## Manual Overrides
Honor "don't create an issue for this", "label this as [label]" and "keep the issue open".
**End of GitHub Workflow Integration**
