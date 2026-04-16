# /work Execution Rule
**Version:** v0.88.0
**Source:** Reference/work-execution.md
Auto-loaded execution rule. Shell `CommandsSrc/work.md` has args/prereqs/errors; this covers Workflow.
## Execution Instructions
**REQUIRED:** Routed command — two-phase task creation. Task list IS the runtime step machine.
**Phase 1:** Create exactly one task: `Step 1: Context Gathering (preamble script)`. Description: all downstream gates depend on parsed context.
**Phase 2 (after routing confirmed):** Read `.claude/scripts/shared/lib/work-task-definitions.json`, create one `TaskCreate` per entry in order. Each entry has `subject`, `condition`, `description`. Conditional entries created OR explicitly skipped with one-line note — never silently omitted.
**Per-AC subtasks (runtime):** When Step 3 begins and `context.acceptanceCriteria` known, create one subtask per AC: `AC: <criterion>`, description `Commit required after this AC`.
**Behavior Rules:**
1. Redirect/early exit → mark preamble complete, stop. No Phase 2.
2. Conditional skip → `Skipped: Step Xa (condition: <cond> not met)`. Silent omission forbidden.
3. `/work` is MANAGED — no `USER-EXTENSION` blocks.
4. Track `in_progress` → `completed`. Never mark complete what wasn't executed.
5. Post-compaction: re-read rule, `TaskList` — first `in_progress` (or first `pending`) is resume point. No re-routing.
6. Every `TaskCreate` MUST include `description` with *why*. Subject=what; description=why.
7. **Per-sub-issue parent lifecycle (epic/branch):** Step 2b creates one parent per remaining sub-issue. Mark `in_progress` at start of Step 3, `completed` after Step 5. AC subtasks nest under active parent; delete/complete before next sub-issue's subtasks.
## Workflow
### Step 0: Clear Task List (conditional)
If not epic/branch tracker, clear task list.
### Step 1: Context Gathering (Preamble)
`node .claude/scripts/shared/work-preamble.js` with `--issue N`, `--issues "N,N,N"`, or `--status <status>`. `--assign` to auto-assign.
Parse JSON: `ok:false` → report `errors[]`, STOP. `ok:true` → extract `context`, `gates`, `autoTask`, `warnings`, report.
**--assign errors:** `ALREADY_ASSIGNED` (different branch), `WORKSTREAM_CONFLICT` (use `/assign-branch`). `--schema` for envelope reference.
### Step 1a: CI Wait (--wait)
Trigger: `context.wait==true`. `node .claude/scripts/shared/wait-for-ci.js --branch $(git branch --show-current) --timeout 300`. 0=pass continue; 1=fail **STOP**; 2=timeout **STOP**; 3=no runs continue.
### Step 1b: Epic Complexity Assessment
Trigger: `context.type=="epic"` and `--nonstop`. `node .claude/scripts/shared/epic-complexity.js $ISSUE`. `classification=="functional"` → `strictTDD=true`. Signals: `.claude/metadata/epic-complexity-signals.json`.
### Step 2: Framework Methodology Dispatch
Load `{frameworkPath}/{framework}/` core from `framework-config.json`. Missing → warn, continue.
### Step 2a: Load TDD Checklist
Read `.claude/skills/tdd-process/tdd-checklist.json`. Valid (`red`/`green`/`refactor` each with `required[]`+`gate`, plus `failure-recovery` with `triggers[]`+`steps[]`) → `tddChecklist=JSON`; phases may include `deepReference:{skill,when}`. Invalid/missing → warn, `tddChecklist=null`.
### Step 2b: Prime Sub-Issue Task List (epic/branch)
Trigger: `context.type in {epic, branch}`. After Phase 2, `gh pmu sub list $ISSUE --json=number,title,status`. Filter out `in_review`/`done` (honor preamble `skipped[]`). For each remaining, `TaskCreate` subject `Sub-issue #N: $TITLE` with description `Per-sub-issue parent — owns AC subtasks and conditional step tasks.` Parents make compaction-recovery resume self-describing: `TaskList` alone shows active sub-issue.
### Step 3: Work the Issue
**Pre-Agent Status Gate (compaction-recovery safeguard):** Before spawning an implementation Agent, verify `in_progress` via `gh pmu view $ISSUE --json=status --jq='.status'`. Not in progress → `gh pmu move $ISSUE --status in_progress` first. Implementation Agents only — NOT research/review/Explore.
For each AC (or batch): mark `in_progress` → TDD cycle → run tests **scoped to the touched directory tree** (e.g., `.claude/scripts/shared/lib/*.js` → `npx jest tests/scripts/shared/lib --no-coverage`; command spec → `tests/metadata/` or `tests/commands/`) — all scoped tests must pass → mark `completed` → **COMMIT** `Refs #$ISSUE — <description>`.
**Full-suite verification** runs once per sub-issue between Step 4c and Step 5 (`npx jest --no-coverage`). Catches cross-cutting regressions scoped runs miss. Failure blocks `in_review`; commit a fix and re-run.
**Commit-per-deliverable gate:** Commit when each AC's deliverable is complete. ACs that decompose a single deliverable (schema + its enums; validator + its reject path; helper's public API + error contract) ship in one commit. ACs that introduce independent deliverables ship separately. **Gate:** do not start the next AC until the previous deliverable is committed.
**Grouping heuristic:** Group when ACs describe parts of one artifact (schema + enums; function + validation step; arg + mime-allowlist check). Separate when ACs introduce independent artifacts (different helpers, different spec sections, different subsystems). **When in doubt, separate.** Step 6a commit-density catches under-committing; review catches over-grouping.
**Sub-Agent Review Gate:** After any Agent returns, `git diff --name-only`. Read each modified file, verify changes match current AC, fix mismatches before committing. Mandatory when `strictTDD`; post-hoc otherwise. Gate NOT satisfied by agent summaries or passing tests alone — **file content must be read and verified**.
**Direct-work path (no Agent spawn):** If you implement inline without spawning an Agent, the Sub-Agent Review Gate is N/A. The file-read verification intent is satisfied by **Step 4 (Ground in file state — re-read each modified file before evaluating its AC)**, mandatory regardless of path. When `strictTDD=true`, Step 4 re-reads become a hard gate: do not check an AC box from memory. The two gates are complementary, not redundant.
**TDD Execution (`tddChecklist` loaded):** execute each `{phase}.required` item, enforce `{phase}.gate` before proceeding. On `failure-recovery.triggers` match, execute `failure-recovery.steps`. **Deep Reference:** if phase gate fails first attempt, Read `{phase}.deepReference.skill` SKILL.md, retry. Missing skill → warn, proceed.
**TDD fallback (`tddChecklist==null`):** RED=failing test, GREEN=minimal pass, REFACTOR=analyze duplication/naming/complexity, report decision, keep tests passing.
No auto-tasks → single unit. Post-compaction: re-read rule, resume from first incomplete AC.
### Step 3b: Documentation Judgment
Evaluate whether design-decision/tech-debt doc is warranted. Re-read `.claude/scripts/shared/lib/doc-templates.json` from disk. If warranted, create and commit `Refs #$ISSUE`.
### Step 4: Verify Acceptance Criteria (with QA Extraction)
**Ground in file state:** Re-read each file via Read before evaluating its AC. Prevents batch fatigue hallucination.
Per AC: verifiable → `[x]`; unverifiable → auto-extract via Step 4a, mark `[x]` with annotation. After all ACs resolved, update issue body via `.tmp-$ISSUE.md` flow (`gh pmu view --body-stdout` → edit → `gh pmu edit -F` → `rm`).
#### Step 4a: QA Extraction
`node .claude/scripts/shared/qa-extract.js --issue $ISSUE`. Reads `qa-config.json`, matches unverifiable ACs against keywords, creates labeled QA sub-issues, returns `{matched:[{acText,subIssueNumber,annotation}]}`. Apply each annotation to parent body.
#### Step 4b: Force-Move Prohibition
**NEVER** `gh pmu move --force` to bypass unchecked ACs on issues you implemented. Legitimate: epic parents, external closures, branch trackers, test-plan approvals. Detection: `story`/`enhancement` label AND `in_progress` this session → **HALT**, report unchecked count, verify via Step 4.
#### Step 4c: Log Changed Files to Issue Body
`node .claude/scripts/shared/log-changed-files.js --issue $ISSUE`. Prints `### Files Changed` section to stdout (empty → caller skips append). Append (when non-empty) via `gh pmu view --body-stdout` → edit → `gh pmu edit -F`.
#### Step 4f: Full-Suite Regression Sweep
After Step 4c, run `npx jest --no-coverage` before Step 5. All tests must pass. Failure blocks `in_review` — commit a fix (`Refs #$ISSUE`) and re-run. Complements per-AC scoped tests with a cross-cutting regression check at the sub-issue boundary.
### Step 5: Move to in_review
`gh pmu move $ISSUE --status in_review`
### Step 6: STOP Boundary — Cleanup, Report, Wait
Three-part sequence in order. Task-list cleanup is **part of** the STOP sequence, not a sibling step after the STOP directive — do not treat `**STOP.**` in (3) as halting before (1) and (2) have run.
**(1) Prune task list** (unconditional — standard/epic/branch; all modes):
1. `TaskList` — enumerate all tasks.
2. For every task owned by this `/work` invocation (subject prefix `Step Xa:`/`Step N...`/`AC:`/`Sub-issue #N:`/preamble), `TaskUpdate status=deleted`.
3. Do **not** delete tasks created outside this invocation (user TODOs).
**(2) Emit report:**
```
Issue #$ISSUE: $TITLE — In Review
Say "done" or run /done #$ISSUE to close.
```
**(3) STOP.** Wait for "done". Do NOT close.
**Autonomous Epic/Branch processing:** For `context.type=="epic"`/`"branch"`, process sub-issues in ascending numeric order (default) or custom **Processing Order:** from epic body. Skip sub-issues already in `in_review`/`done`.
**Default mode:** each sub-issue → `in_progress` → Steps 3–4 → `in_review` → **STOP** per sub-issue → user "done" → next.
**`--nonstop` mode:** same cycle, **no STOP** between sub-issues. Report `Sub-issue #N: $TITLE → In Review (M/T processed)`. Ignored for standard issues. One commit/AC (`Refs #N`); push deferred to `/done`. Any test/AC/QA/`gh pmu` failure halts immediately — report sub-issue, completed count, resume instructions. **Post-compaction:** `TaskList` — `in_progress` sub-issue parent is primary resume signal; else fall back to `gh pmu sub list $ISSUE` and resume from first not in `in_review`/`done`. Final: `Nonstop Processing Complete` (processed/skipped/failed).
#### Step 6a: Post-Nonstop Audit
1. `node .claude/scripts/shared/nonstop-audit.js --issue $ISSUE` after all sub-issues reach `in_review`, before moving epic. Returns `{ok,warnings,blocks}` covering audit (1) commit density (warning, non-blocking, per sub-issue) and audit (2) AC checkbox (blocks — require Step 4 on flagged sub-issues).
2. **Audit (3) — coverage (skill):** Per sub-issue, invoke `tdd-refactor-coverage-audit` skill or `node .claude/skills/tdd-refactor-coverage-audit/scripts/test-coverage-audit.js --since-commit <sha>` where sha is immediately before first `Refs #N` commit. Warnings advisory. Skill absent → `"Skipped coverage audit: tdd-refactor-coverage-audit skill not installed."`, continue.
3. Aggregate audit output. Proceed to epic `in_review` move only after audit (2) blocks cleared.
**After all sub-issues reach `in_review`/`done`:**
- **Epic:** Evaluate epic ACs via Step 4, move to `in_review`, **STOP** — wait for "done".
- **Branch tracker:** Report and STOP. Do **NOT** suggest "done" or `/done`:
```
All sub-issues on branch {branch-name} are in review or done.
  Sub-issues processed: N
  Sub-issues skipped: M
Next: /merge-branch or /prepare-release
```
**Default mode:** Never skip per-sub-issue STOP. **Continuous mode:** sub-issues moved only to `in_review`, not `done` — user runs `/done` after review.
**End of /work Execution Rule**
