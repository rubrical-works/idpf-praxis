# /workit Execution Rule
**Version:** v0.87.0
**Source:** Reference/workit-execution.md

Auto-loaded execution rule for `/workit`. Shell `.claude/commands/workit.md` covers args/prereqs/errors; this rule covers the Workflow.

---

## Execution Instructions
**REQUIRED:** Routed command — two-phase task creation. Task list IS the runtime step machine.

**Phase 1:** Create one task: `Step 1: Context Gathering (preamble script)` — all downstream gates depend on parsed context.

**Phase 2 (after routing confirmed):** Read `.claude/scripts/shared/lib/work-task-definitions.json` and create one `TaskCreate` per entry. Each entry supplies `subject`, `condition`, `description`. Conditional (non-`always`) entries are created OR explicitly skipped with a note — never silent omission.

**Per-AC subtasks (runtime):** When Step 3 begins with known `context.acceptanceCriteria`, create one subtask per AC named `AC: <criterion>`, description `Commit required after this AC (commit-per-AC gate).`

**Behavior Rules:**
1. Redirect/early exit → mark preamble complete, stop. No Phase 2.
2. Conditional skip → report `Skipped: Step Xa (condition: <cond>)`. Silent omission forbidden.
3. `/workit` is MANAGED — no `USER-EXTENSION` discovery.
4. Track `in_progress` → `completed`. Never mark complete what you did not execute.
5. Post-compaction: re-read rule, `TaskList` — first `in_progress` (or `pending`) is resume. No re-routing.
6. Every `TaskCreate` MUST include `description` (the *why*). Subject = what.

---

## Workflow

### Step 0: Clear Task List
If not epic/branch tracker, clear task list.

### Step 1: Context Gathering (Preamble Script)
`node .claude/scripts/shared/work-preamble.js` with `--issue N`, `--issues "N,N,N"`, or `--status <status>`. `--assign` to auto-assign.

Parse JSON: `ok: false` → report `errors[]`, STOP. `ok: true` → extract `context`, `gates`, `autoTask`, `warnings`, report.

`--assign` errors: `ALREADY_ASSIGNED`, `WORKSTREAM_CONFLICT` (use `/assign-branch`). `--schema` for envelope reference.

### Step 1a: CI Wait (--wait)
**Trigger:** `context.wait == true`.
```bash
node .claude/scripts/shared/wait-for-ci.js --branch $(git branch --show-current) --timeout 300
```
0=pass, continue. 1=fail → **STOP**. 2=timeout → **STOP**. 3=no runs, continue.

### Step 1b: Epic Complexity Assessment
**Trigger:** `context.type == "epic"` and `--nonstop`. Run `node .claude/scripts/shared/epic-complexity.js $ISSUE`. `classification == "functional"` → `strictTDD = true`. Signals: `.claude/metadata/epic-complexity-signals.json`.

### Step 2: Framework Methodology Dispatch
Load `{frameworkPath}/{framework}/` core file from `framework-config.json`. Missing → warn, continue.

### Step 2a: Load TDD Checklist
Read `.claude/skills/tdd-process/tdd-checklist.json`. Valid (`red`/`green`/`refactor` each with `required[]` + `gate`; `failure-recovery` with `triggers[]` + `steps[]`) → `tddChecklist` = JSON; phases may include `deepReference: { skill, when }`. Invalid/missing → warn `"TDD checklist not found or invalid — using inline TDD behavior."`, set `tddChecklist = null`.

### Step 3: Work the Issue

**Pre-Agent Status Gate:** Before spawning any implementation Agent, verify `in_progress` via `gh pmu view $ISSUE --json=status --jq='.status'`. Not `"In progress"` → `gh pmu move $ISSUE --status in_progress`. Implementation Agents only — NOT research/review/Explore.

For each AC (or batch): mark `in_progress` → TDD (RED → GREEN → REFACTOR) → full test suite → mark `completed` → **COMMIT** `Refs #$ISSUE — <desc>`. One commit per AC; related ACs may share. **GATE: no next AC until commit made.**

**Sub-Agent Review Gate:** After any Agent returns, `git diff --name-only`. Read each modified file, verify matches current AC, fix mismatches before committing. Mandatory when `strictTDD`; post-hoc otherwise. Gate NOT satisfied by agent summaries or passing tests alone — **file content must be read**.

**TDD Execution (`tddChecklist` loaded):** for each phase, execute every `{phase}.required` item, enforce `{phase}.gate`. On `failure-recovery.triggers` match, execute `failure-recovery.steps`. **Deep Reference:** phase gate fails first attempt → check `{phase}.deepReference`, Read `.claude/skills/{skill}/SKILL.md`, retry. Missing skill → warn, proceed.

**TDD fallback (`null`):** RED=failing test, GREEN=minimal pass, REFACTOR=analyze duplication/naming/complexity, report decision, keep tests passing.

No auto-tasks → single unit. Post-compaction: re-read rule, resume from first incomplete AC.

### Step 3b: Documentation Judgment
Evaluate design-decision/tech-debt documentation. Re-read `.claude/scripts/shared/lib/doc-templates.json` from disk for criteria/paths/naming. If warranted, create document and commit `Refs #$ISSUE`.

### Step 4: Verify Acceptance Criteria
**Ground in file state:** Re-read each file before evaluating its AC. Prevents batch fatigue hallucination.

Per AC: verifiable → `[x]`; unverifiable → auto-extract via Step 4a, mark `[x]` with annotation. Update issue body via `.tmp-$ISSUE.md` flow (`gh pmu view --body-stdout` → edit → `gh pmu edit -F` → `rm`).

#### Step 4a: QA Extraction
`node .claude/scripts/shared/qa-extract.js --issue $ISSUE`. Reads `qa-config.json`, matches unverifiable ACs, creates labeled QA sub-issues, returns `{ matched: [{ acText, subIssueNumber, annotation }] }`. Apply each `annotation` to parent body.

#### Step 4b: Force-Move Prohibition
**NEVER** `gh pmu move --force` past unchecked ACs on issues you implemented. Legitimate: epic parents, external closures, branch trackers, test-plan approvals. Detection: `story`/`enhancement` label AND `in_progress` this session → **HALT**, verify via Step 4.

#### Step 4c: Log Changed Files
`node .claude/scripts/shared/log-changed-files.js --issue $ISSUE`. Prints `### Files Changed` to stdout (empty → skip append). Append via `gh pmu view --body-stdout` → edit → `gh pmu edit -F`.

### Step 5: Move to in_review
```bash
gh pmu move $ISSUE --status in_review
```

### Step 6: STOP Boundary
```
Issue #$ISSUE: $TITLE — In Review
Say "done" or run /done #$ISSUE to close this issue.
```
**STOP.** Wait for "done". Do NOT close.

**Post-STOP Cleanup:** Clear task list after STOP message.

**Autonomous Epic/Branch processing:** For `context.type == "epic"`/`"branch"`, process sub-issues in ascending numeric order (default) or custom **Processing Order:** from epic body. Skip sub-issues already in `in_review`/`done`.

**Default mode:** each sub-issue → `in_progress` → Steps 3–4 → `in_review` → **STOP** per sub-issue → user "done" → next.

**`--nonstop` mode:** same cycle, **no STOP** between sub-issues. Report `"Sub-issue #N: $TITLE → In Review (M/T processed)"`, continue. One commit/AC (`Refs #N`); commits local (push deferred). Test/AC/QA/`gh pmu` failure halts — report sub-issue, count, resume. Post-compaction: re-read rule, `gh pmu sub list $ISSUE`, resume from first not in `in_review`/`done`. Final: `Nonstop Processing Complete` (processed/skipped/failed).

#### Step 6a: Post-Nonstop Audit
`node .claude/scripts/shared/nonstop-audit.js --issue $ISSUE` after all sub-issues `in_review`, before moving epic. Returns `{ ok, warnings, blocks }`: (1) commit density (warnings, non-blocking), (2) AC checkbox (blocks — require Step 4). Test coverage audit skill-delegated.

**After all sub-issues in `in_review`/`done`:**
- **Epic:** Step 4 → `in_review` → **STOP**, wait "done".
- **Branch tracker:** Report and STOP. Do **NOT** suggest `/done`:
```
All sub-issues on branch {branch-name} are in review or done.
  Sub-issues processed: N
  Sub-issues skipped: M
Next: /merge-branch or /prepare-release
```
**Default:** Never skip per-sub-issue STOP. **Continuous:** sub-issues moved only to `in_review` — user runs `/done` after.
