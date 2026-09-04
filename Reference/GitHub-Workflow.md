# GitHub Workflow Integration
**Version:** v0.101.0
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
**Pre-Work Status Gate:** Before work begins on an issue — **before its first acceptance criterion is worked**, inline or via spawned Agent — verify issue is `in_progress`:
```bash
gh pmu view $ISSUE --json=status --jq='.status'
```
If not "In progress", run `gh pmu move $ISSUE --status in_progress` before proceeding. Applies to **every** issue and **each sub-issue** of an epic/branch tracker as its turn begins. Does NOT apply to research/review/exploration agents. Covers two failure modes: **compaction** between preamble and start of work losing the transition; and — epics/branch trackers — the preamble having moved only the tracker, never the sub-issues (#2483).
Trigger is the **workflow moment**, NOT the mechanism — an actor-keyed rephrasing reintroduces the defect. `/work` Step 3 states the same contract; change both together (`tests/commands/work.test.js` fails on desync).
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
Flags are extracted and appended to the invocation, not left in the title, so no `--` token becomes part of an issue's identity: `enhancement: add dark mode --prior-art` → `/enhancement add dark mode --prior-art`.
**QA-Issue Creation Ownership:** `/work` Step 4a owns the **automatic** path — files QA sub-issues from unverifiable ACs via `gh pmu sub create` with `qa-required`. This governs **every other** path: QA raised during `/done`, during review, or whenever a session decides a manual check is needed.
| Situation | Command |
|-----------|---------|
| Belongs to a parent issue | `gh pmu sub create <parent> --label qa-required -F .tmp-qa.md` |
| Stands alone | `gh pmu create --label qa-required -F .tmp-qa.md --status backlog` |
**Always `gh pmu`, never the bare `gh issue` creation form.** The bare form files an issue that never reaches the project board — invisible to `gh pmu sub list`, epic closure, `/done` sub-issue checks and the `/work` Step 4b QA force-exception. An off-board QA issue satisfies nothing and blocks nothing; it reads as done. Silent and occasional, which is why it survives — nobody notices until an epic will not close.
**Closure contract.** A `qa-required` issue is a **gate**, not a note. Its parent AC stays unchecked as `- [ ] … → QA: #N` until the QA issue closes; the parent reaches `done` only once it has. `--force` past such a line is permitted **only** because the line names the sub-issue that still owns the check — the gate moved, it did not disappear. Closing the parent while its QA issue is open defeats it.
**Label mandatory.** `qa-required` is what makes the issue recognisable as a gate to every consumer looking for one; unlabelled, it is an ordinary issue nobody treats as blocking.
**Review Command Routing:** `review` with issue reference (`#N`) routes to `/review-issue`:
| Trigger Pattern | Routes To |
|----------------|-----------|
| `review #42` | `/review-issue 42` |
| `review #42 #43 #44` | `/review-issue 42 43 44` |
| `please review #42` | `/review-issue 42` |
| `review #42 --with security` | `/review-issue 42 --with security` |
| `review #42 --mode solo --force` | `/review-issue 42 --mode solo --force` |
`review` is a **tracked action** (routes to command), not an analysis keyword. `review` without issue number does not trigger routing.
**Flag Pass-Through Convention:** applies to every routing path above; commands gaining flags later inherit it.
- **Extraction is by token shape** — `--` followed by a letter. Bare `--`, `---`, or `--` in prose is not a flag; preserved verbatim in title text.
- **No flag-shaped token is ever discarded.** Unrecognized flags pass through; the command reports them. Silent truncation is never correct — a dropped flag narrows the result with nothing for the user to notice.
- **Recognized flags are data,** per command, in `.claude/metadata/trigger-flag-allowlist.json`. Adding one is a data edit, not a hook edit.
- **Declaration governs value attachment only.** A recognized flag may claim the next token as its value (`--with security`); an unrecognized one may not, so trailing prose is not swallowed into args.
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
