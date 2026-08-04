# /work Execution Rule
**Version:** v0.95.0
**Source:** Reference/work-execution.md
Auto-loaded execution rule. Shell `.claude/commands/work.md` has args/prereqs/errors; this covers Workflow.
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
**--assign errors:** `ALREADY_ASSIGNED` (different branch), `WORKSTREAM_CONFLICT` (use `/assign-branch`), `BRANCH_TRACKER_NOT_ASSIGNABLE` (target is a branch tracker — assign sub-issues instead). `--schema` for envelope reference.
### Step 1a: CI Wait (--wait)
Trigger: `context.wait==true`. `node .claude/scripts/shared/wait-for-ci.js --branch $(git branch --show-current) --timeout 300`. 0=pass continue; 1=fail/bad args/gh unavailable after retries **STOP**; 2=timeout, no jobs running **STOP**; 3=no runs for this branch/commit continue; 5=timeout with jobs still running at 10-min cap **STOP**. Gate is scoped to the passed branch/commit — a green run on an unrelated branch no longer satisfies it (#2464).
### Step 1b: Epic Complexity Assessment
Trigger: `context.type=="epic"` and `--nonstop`. `node .claude/scripts/shared/epic-complexity.js $ISSUE`. `classification=="functional"` → `strictTDD=true`. Signals: `.claude/metadata/epic-complexity-signals.json`.
### Step 2: Framework Methodology Dispatch
Load `{frameworkPath}/{framework}/` core from `framework-config.json`. Missing → warn, continue.
### Step 2a: Load TDD Checklist
Read `.claude/skills/tdd-process/tdd-checklist.json`. Valid (`red`/`green`/`refactor` each with `required[]`+`gate`, plus `failure-recovery` with `triggers[]`+`steps[]`) → `tddChecklist=JSON`; phases may include `deepReference:{skill,when}`. Invalid/missing → warn, `tddChecklist=null`.
### Step 2b: Prime Sub-Issue Task List (epic/branch)
Trigger: `context.type in {epic, branch}`. After Phase 2, `gh pmu sub list $ISSUE --json=number,title,status`. Filter out `in_review`/`done` (honor preamble `skipped[]`). For each remaining, `TaskCreate` subject `Sub-issue #N: $TITLE` with description `Per-sub-issue parent — owns AC subtasks and conditional step tasks.` Parents make compaction-recovery resume self-describing: `TaskList` alone shows active sub-issue.
### Step 3: Work the Issue
**Pre-Work Status Gate (mandatory, every issue — compaction-recovery safeguard + sub-issue transition):** **Before the first AC of any issue is worked**, verify `in_progress` via `gh pmu view $ISSUE --json=status --jq='.status'`. Not in progress → `gh pmu move $ISSUE --status in_progress` before proceeding. Two failure modes: **compaction** between Step 1 preamble and start of work losing the transition; and — epics/branch trackers — the preamble having moved only the tracker, never the sub-issues.
Trigger is the **workflow moment**, NOT the mechanism: fires identically inline (direct-work) or via spawned implementation Agent. Applies to **every** issue and **each sub-issue** of an epic/branch tracker as its turn begins. **NOT** satisfied by Step 1 preamble having run — for epics/branch trackers the preamble moves only the tracker, and `gh pmu branch start` creates trackers already `in_progress`, so that call is a no-op (#2483). Does NOT apply to research/review/Explore Agents.
> **Why keyed to the moment, not the actor (#2483):** this gate previously triggered on spawning an implementation Agent. Keying it to the *mechanism* meant the direct-work path — explicitly sanctioned below — bypassed it, and sub-issues were worked without ever reaching `in_progress`. Keep the trigger phrased as a workflow moment; an actor-keyed rephrasing reintroduces the defect under a new name.
For each AC (or batch): mark `in_progress` → TDD cycle → run tests **scoped to the touched directory tree** (e.g., `.claude/scripts/shared/lib/*.js` → `npx jest tests/scripts/shared/lib --no-coverage`; command spec → `tests/metadata/` or `tests/commands/`) — all scoped tests must pass → mark `completed` → **COMMIT** `Refs #$ISSUE — <description>`.
**Full-suite verification** runs once per sub-issue between Step 4c and Step 5 (`npx jest --no-coverage`). Catches cross-cutting regressions scoped runs miss. Failure blocks `in_review`; commit a fix and re-run.
**Commit-per-deliverable gate:** Commit when each AC's deliverable is complete. ACs that decompose a single deliverable (schema + its enums; validator + its reject path; helper's public API + error contract) ship in one commit. ACs that introduce independent deliverables ship separately. **Gate:** do not start the next AC until the previous deliverable is committed.
**Grouping heuristic:** Group when ACs describe parts of one artifact (schema + enums; function + validation step; arg + mime-allowlist check). Separate when ACs introduce independent artifacts (different helpers, different spec sections, different subsystems). **When in doubt, separate.** Step 6a commit-density catches under-committing; review catches over-grouping.
**Sub-Agent Review Gate:** After any Agent returns, `git diff --name-only`. Read each modified file, verify changes match current AC, fix mismatches before committing. Mandatory when `strictTDD`; post-hoc otherwise. Gate NOT satisfied by agent summaries or passing tests alone — **file content must be read and verified**.
**Direct-work path (no Agent spawn):** If you implement inline without spawning an Agent, the Sub-Agent Review Gate is N/A. This exemption is scoped to the *Sub-Agent Review Gate only* — the **Pre-Work Status Gate** above fires on the direct-work path exactly as on the Agent path (#2483). The file-read verification intent is satisfied by **Step 4 (Ground in file state — re-read each modified file before evaluating its AC)**, mandatory regardless of path. When `strictTDD=true`, Step 4 re-reads become a hard gate: do not check an AC box from memory. The two gates are complementary, not redundant.
**TDD Execution (`tddChecklist` loaded):** execute each `{phase}.required` item, enforce `{phase}.gate` before proceeding. On `failure-recovery.triggers` match, execute `failure-recovery.steps`. **Deep Reference:** if phase gate fails first attempt, Read `{phase}.deepReference.skill` SKILL.md, retry. Missing skill → warn, proceed.
**TDD fallback (`tddChecklist==null`):** RED=failing test, GREEN=minimal pass, REFACTOR=analyze duplication/naming/complexity, report decision, keep tests passing.
No auto-tasks → single unit. Post-compaction: re-read rule, resume from first incomplete AC.
### Step 3b: Documentation Judgment
Evaluate whether design-decision/tech-debt doc is warranted. Re-read `.claude/scripts/shared/lib/doc-templates.json` from disk. If warranted, create and commit `Refs #$ISSUE`.
### Step 4: Verify Acceptance Criteria (with QA Extraction)
**Ground in file state:** Re-read each file via Read before evaluating its AC. Prevents batch fatigue hallucination.
Per AC: verifiable → `[x]`; unverifiable → auto-extract via Step 4a and apply its annotation **as emitted** — box stays **unchecked** (`- [ ]`) by design (Option A, #2472): the QA sub-issue is the gate (see Step 4b, `.claude/scripts/shared/lib/qa-config.json` `closurePath`). Do **NOT** mark a QA-extracted AC `[x]`. After all ACs resolved, update issue body via `.tmp-$ISSUE.md` flow (`gh pmu view --body-stdout` → edit → `gh pmu edit -F` → `rm`).
**Out-of-phase ACs (#2508):** an AC whose condition resolves *after* this issue reaches `in_review` cannot honestly be checked here — checking is a false claim, leaving it bare deadlocks Step 5. Annotate per `phaseFeasibility.annotationFormat` (`.claude/metadata/ac-feasibility-prompts.json`): `- [ ] <acText> → GATE: review` / `→ GATE: release`. Box stays **unchecked** — same contract as QA. Only `review` and `release` are recognised. Work already owned by another command's checklist (CHANGELOG/tagging/release publication → `/prepare-release`) is **removed**, not annotated. Well-authored issues arrive pre-annotated; annotating here is the fallback for ACs predating the authoring gate.
#### Step 4a: QA Extraction
`node .claude/scripts/shared/qa-extract.js --issue $ISSUE`. Reads `.claude/scripts/shared/lib/qa-config.json`, matches unverifiable ACs against keywords, creates labeled QA sub-issues, returns `{matched:[{acText,subIssueNumber,annotation}]}`. Apply each annotation to parent body.
#### Step 4b: Force-Move Prohibition
**NEVER** `gh pmu move --force` to bypass unchecked ACs on issues you implemented. Legitimate: epic parents, external closures, branch trackers, test-plan approvals, and the two **intentionally-open gate** annotations:
| Marker | Meaning | Precedent |
|---|---|---|
| `- [ ] … → QA: #N` | Closure deferred to a QA sub-issue | Step 4a, Option A/#2472 |
| `- [ ] … → GATE: review` | Condition resolves **after** `in_review` (human read-and-approve) | #2508 |
| `- [ ] … → GATE: release` | Condition resolves during `/prepare-release` | #2508 |
Moving to `in_review` past **only** such lines is permitted. Both exceptions are scoped strictly to lines carrying one of these markers with a recognised token (`review`, `release`), **not** a general force permission — a bare `→ GATE:`, an unrecognised token, or the word "gate" in ordinary AC prose is still unfinished work. Detection: `story`/`enhancement`/`bug` label AND `in_progress` this session → **HALT** if any unchecked AC lacks both markers; report unchecked (non-gate) count, verify via Step 4.
Gate layer is the **second** line of defence. An out-of-phase AC should usually never have been authored: `/create-prd`, `/create-backlog`, `/add-story`, `/bug`, `/enhancement` apply the `phaseFeasibility` prompt from `.claude/metadata/ac-feasibility-prompts.json`, which **drops** release-phase work another command's checklist owns and **pre-annotates** genuinely load-bearing gates. Reaching Step 4b with an unannotated out-of-phase AC means the authoring gate was bypassed — annotate here as the exception, not the norm.
#### Step 4c: Log Changed Files + State-Drift Gate
`node .claude/scripts/shared/log-changed-files.js --issue $ISSUE`. Prints `### Files Changed` section to stdout (empty → caller skips append). Append (when non-empty) via `gh pmu view --body-stdout` → edit → `gh pmu edit -F`.
**State-drift gate (#2404):** After body update, `node .claude/scripts/shared/scope-drift-check.js --issue $ISSUE`. Compares `Refs #$ISSUE` commit files against (1) body `Files to modify:`/`**Files:**` section ∪ prior `### Files Changed`, and (2) `.claude/metadata/scope-drift-protected-paths.json`. Exit 0 = continue (blocking-no-violations OR advisory); Exit 1 = **HALT** (blocking + violations) — do not proceed to Step 4d/5. Resolutions: add paths to body `Files to modify:` + re-run; `git revert` + re-run; or `Scope-Override: <reason>` in latest commit message or issue comment + re-run (echoed in next report). Always-protected (halt even with no declared scope): `framework-config.json`, `framework-manifest.json`, `.claude/metadata/**`, `.gh-pmu.json`, `.gh-pmu.checksum`, `CHARTER.md`. Gate is additive — `log-changed-files.js` still runs regardless.
#### Step 4f: Full-Suite Regression Sweep
After Step 4c, run `npx jest --no-coverage` before Step 5. All tests must pass. Failure blocks `in_review` — commit a fix (`Refs #$ISSUE`) and re-run. Complements per-AC scoped tests with a cross-cutting regression check at the sub-issue boundary.
### Step 5: Move to in_review
`gh pmu move $ISSUE --status in_review`
If the only unchecked ACs are intentionally-open gates — `- [ ] … → QA: #N`, `→ GATE: review`, `→ GATE: release` — the plain move fails checkbox validation; use `--force` (permitted by the Step 4b exceptions — valid only when *every* unchecked AC carries one of those markers): `gh pmu move $ISSUE --status in_review --force`. If even one unchecked AC lacks a marker, do **not** force: that is genuinely unfinished work and Step 4b applies in full.
**Closure differs by marker.** QA `- [ ]` boxes stay open until their QA sub-issues close (`.claude/scripts/shared/lib/qa-config.json` `closurePath`); parent reaches `done` only once checked. `→ GATE: review` boxes are checked by the **user** during review — they are what the STOP boundary hands off, so "done" implies they are satisfied. `→ GATE: release` boxes are checked when the owning release step runs; if one is still open at `/done`, say so rather than checking it.
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
**Default mode:** each sub-issue → `in_progress` → Steps 3–4 → `in_review` → **STOP** per sub-issue → user "done" → next. The `in_progress` transition is **executed by the Step 3 Pre-Work Status Gate** as each sub-issue's turn begins — this line describes the lifecycle, it does not implement it (#2483).
**`--nonstop` mode:** same cycle, **no STOP** between sub-issues. Report `Sub-issue #N: $TITLE → In Review (M/T processed)`. Ignored for standard issues. One commit/AC (`Refs #N`); push deferred to `/done`. Any test/AC/QA/`gh pmu` failure halts immediately — report sub-issue, completed count, resume instructions. **Post-compaction:** `TaskList` — `in_progress` sub-issue parent is primary resume signal; else fall back to `gh pmu sub list $ISSUE` and resume from first not in `in_review`/`done`. Final: `Nonstop Processing Complete` (processed/skipped/failed).
#### Step 6a: Post-Nonstop Audit
1. `node .claude/scripts/shared/nonstop-audit.js --issue $ISSUE` after all sub-issues reach `in_review`, before moving epic. Returns `{ok,warnings,blocks}` covering audit (1) commit density (warning, non-blocking, per sub-issue) and audit (2) AC checkbox (blocks — require Step 4 on flagged sub-issues).
2. **Audit (3) — coverage (skill):** Per sub-issue, invoke `tdd-refactor-coverage-audit` skill where sha is immediately before first `Refs #N` commit. Applies **No-Runtime Fallback Pattern (Pattern 4)**: Node 18+ → `node .claude/skills/tdd-refactor-coverage-audit/scripts/test-coverage-audit.js --since-commit <sha>` (primary); Node unavailable → follow skill's "Fallback Procedure" (read `resources/test-coverage-conventions.json`, run `git diff --name-status --diff-filter=A <sha>..HEAD`, apply pairing rules inline). Both paths emit equivalent advisory output (`newSources`, `pairedSources`, `missingTests[]`, `coverage`); never blocks. Skill absent → `"Skipped coverage audit: tdd-refactor-coverage-audit skill not installed."`, continue.
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
