# /work Execution Rule
**Version:** v0.99.0
**Source:** Reference/work-execution.md (dev-preserve variant, #2395)
Auto-loaded execution rule. Shell `.claude/commands/work.md` has args/prereqs/errors; this covers Workflow. This variant preserves FRAMEWORK-ONLY blocks for self-hosted dev; the stripped variant ships via `.min-mirror/Reference/work-execution.md` to user projects.
## Execution Instructions
**REQUIRED:** Routed command — two-phase task creation. Task list IS the runtime step machine.
**Availability precondition (probe before Step 1 — #2593).** Task tools may not exist: `TaskCreate`/`TaskGet`/`TaskList`/`TaskUpdate` are gated by remote flag `tengu_rosy_wren` (default off), local override `CLAUDE_CODE_ENABLE_TODO_TOOLS=true` in `~/.claude/settings.json` `env`. Server-side rollout — availability differs between sessions with no local change. Call `TaskList` once before Phase 1:
- **Present** → follow this rule as written.
- **Absent** → track every step with an **inline checklist** (same steps, order, one-at-a-time discipline), and **say once, explicitly, that the `TaskList`-based compaction-recovery guarantee does not hold.** This rule calls the task list the runtime step machine and Behavior Rule 5 makes it the resume point; an inline checklist lives in the context window, which is what compaction discards. On resume, re-derive position from issue status, `Refs #N` commits, and checked ACs — never from a checklist that may be gone.
Announcing the degradation is load-bearing: an absent step machine is otherwise indistinguishable from one never created, and surfaces later as work resumed from the wrong step. The startup hook's `Task Tools:` row reports the same condition.
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
### Step 1c: Branch Sync
Trigger: always — once per invocation, after Step 1 (and 1a under `--wait`), before any commit; not repeated per sub-issue (sub-issues share the branch). `node .claude/scripts/shared/branch-sync-check.js` → `data`: `status`, `ahead`, `behind`, `fetched`, `conflictingPaths`, `upstreamSha`. Same helper and offer table as `03-startup.md` §Branch Sync Offer, at the cheap moment: between the last `/done` and this `/work` local usually has nothing unpushed, so a fast-forward integrates another developer's push before any `Refs #N` commit lands on a stale tip (#2635).
| `status` | Action |
|---|---|
| `behind`, `conflictingPaths` empty | Offer `git pull --ff-only` via `AskUserQuestion` (pull recommended; "continue on current tip" alternative). Accept → run, report. Decline → continue, tree untouched. Pull failure → report git's error verbatim, continue — no retry, no non-fast-forward merge fallback. |
| `behind`, conflicting paths present | **No pull offer** — a fast-forward would abort. Report paths; `AskUserQuestion`: continue on the stale base or STOP. Never stash, discard, or revert for the user. |
| `diverged` | Report `ahead`/`behind` and **STOP**. Previous `/done` did not push, or another session committed here. Recovery: `/done` the issue still in review (its push runs the Step 2 rebase guard) or push by hand, then re-run `/work`. Rebase-vs-merge is `/done` Step 2's decision. |
| `ahead`, `up-to-date`, `no-upstream` | No action; `ahead` reported in one line, work proceeds. |
`fetched: false` → count from cached ref: say "possibly low", act anyway. `success: false` → warn, continue.
> **Why here, not per AC (#2635):** nothing is pushed until `/done`; a fetch per commit costs a network call and gains nothing. The window left open — commits accumulating while the remote moves — is closed by `/done` Step 2's rebase guard. Keyed to the moment, not the mechanism: fires identically inline or via spawned Agent.
### Step 2: Framework Methodology Dispatch
Load `{frameworkPath}/{framework}/` core from `framework-config.json`. Missing → warn, continue.
### Step 2a: Load TDD Checklist
Read `.claude/skills/tdd-process/tdd-checklist.json`. Valid (`red`/`green`/`refactor` each with `required[]`+`gate`, plus `failure-recovery` with `triggers[]`+`steps[]`) → `tddChecklist=JSON`; phases may include `deepReference:{skill,when}`. Invalid/missing → warn, `tddChecklist=null`.
### Step 2b: Prime Sub-Issue Task List (epic/branch)
Trigger: `context.type in {epic, branch}`. After Phase 2, `gh pmu sub list $ISSUE --json=number,title,status`. Filter out `in_review`/`done` (honor preamble `skipped[]`). For each remaining, `TaskCreate` subject `Sub-issue #N: $TITLE` with description `Per-sub-issue parent — owns AC subtasks and conditional step tasks.` Parents make compaction-recovery resume self-describing: `TaskList` alone shows active sub-issue.
### Step 2c: Proposed Work Order (`--nonstop` epic/branch — #2622)
Trigger: `context.proposedOrder` present. The preamble sets it only for `context.type in {epic, branch}` under `--nonstop`; absent in every other mode, so this step does not fire.
**Report before the first sub-issue is worked.** Emit `context.proposedOrder` alongside `context.processingOrder` with per-pair rationale from `context.orderRationale`:
```
Proposed work order for #$ISSUE:
  current:  #901 → #902
  proposed: #902 → #901
  #902 creates declared scope src/order-helper.js that #901 also declares — provider should precede consumer
```
`context.orderDiffers==false` → report that derived matches current, continue; nothing to decide.
**Ask, then persist — only on acceptance.** Orders differ → offer via `AskUserQuestion`: accept proposed, or keep current. On acceptance write it to the tracker body via `gh pmu view $ISSUE --body-stdout` → `applyProcessingOrder(body, acceptedOrder)` → `gh pmu edit $ISSUE -F` → `rm`. On decline **nothing is written**; the run proceeds in `context.processingOrder`. The preamble never writes — `applyProcessingOrder` returns a new body and the caller persists it, which is what keeps the decision reviewable.
> **Why propose rather than apply (#2622):** the derivation is deterministic but demonstrably incomplete — measured over #2614–#2620 it surfaced one of two real declared-scope collisions and reported 21 boilerplate `sharedCriteria` matches. `--nonstop` removes the per-sub-issue STOP where a human would otherwise catch a wrong order, so a silent reorder would replace a knowably-wrong order with an unaccountably-wrong one, unattended. Surfacing costs one question; getting it silently wrong costs a sub-issue implemented against a provider that does not exist yet.
> **Why persistence reuses `**Processing Order:**`:** an accepted order must survive compaction, and that format is already parsed by `parseProcessingOrder` (#2544). The next run — this one resumed, or a later one — reads it through the mechanism that already exists, with no new state store to keep in sync.
### Step 3: Work the Issue
**Review-State Gate (mandatory, every issue — #2577):** **Before the first acceptance criterion of any issue is worked**, classify review state and act:
```bash
node .claude/scripts/shared/review-state.js --issue $ISSUE
```
Returns `{ok,issue,state,reason,signals,warnings}`; `state` is exactly one of `never-reviewed`, `findings-pending`, `reviewed-clean`, `indeterminate`. Reads the signals the review subsystem already writes — `reviewed`/`pending` labels from `review-finalize.js` `determineLabel()`, `**Reviews:** N` body marker from `updateBodyReviewCount()`. No new state store.
| State | Single interactive issue | Batch (`--issues`/`--status`), epic, branch tracker | `--nonstop` |
|---|---|---|---|
| `never-reviewed` | **STOP**, offer `/review-issue #$ISSUE` | warn and proceed | warn and proceed |
| `findings-pending` | **STOP**, offer `/resolve-review #$ISSUE` | **STOP**, offer `/resolve-review #$ISSUE` | **halt** |
| `reviewed-clean` | proceed | proceed | proceed |
| `indeterminate` | proceed | proceed | proceed |
`reviewed-clean` and `indeterminate` **never prompt in any mode**.
Offer via `AskUserQuestion` — same shape as `/create-backlog` Phase 1c, review command recommended, "continue without review" the alternative. **Declining proceeds to work unchanged**: the gate mutates nothing on decline — no label change, no status move, no body edit. (Pre-Work Status Gate below then runs as usual; that transition is its own.) Accepting means work does **not** begin — report the command and STOP, issue left as found. Unlike `/create-backlog`, a decline is **not** recorded durably: this gate runs on every `/work` invocation, so a persisted bypass mark would suppress it forever after one decline.
The gate **does not re-prompt** for an issue already decided within the same `/work` invocation, including after compaction recovery — one decision per issue per invocation.
**Ordering:** runs **before** the Pre-Work Status Gate. Accepting means no work happens, so the issue should not have been moved to `in_progress` on its way back to the user.
Trigger is the **workflow moment**, not the actor or mechanism (#2483): fires identically inline (direct-work) or via a spawned implementation Agent, and independently for **each sub-issue** of an epic or branch tracker as its turn begins — not once for the tracker. Batch selection (`--issues "N,N,N"`, `--status <status>`) fires per issue at its turn. Does **not** apply to research/review/Explore Agents.
> **Why `--nonstop` halts on `findings-pending` but only warns on `never-reviewed` (#2577):** halting on unresolved findings matches `--nonstop`'s existing contract that any test/AC/QA/`gh pmu` failure halts immediately — working an issue whose criteria a reviewer already flagged is the same class of problem. `never-reviewed` is the *normal* state of sub-issues `/create-backlog` has just materialized; halting on it would stop nearly every autonomous epic run on its first sub-issue. Batch shares the `--nonstop` rules except `findings-pending` prompts rather than halting — a human is present to answer.
> **Why `indeterminate` fails open — a deliberate choice, not an oversight to "correct" (#2577):** an unreadable body, a contradictory `reviewed`+`pending` pair, or a `gh` outage all yield `indeterminate`, and the gate proceeds. Blocking would let an outage stop all work; prompting would train users to dismiss the gate on issues it cannot classify. The classifier reports `indeterminate` explicitly rather than defaulting into a state, so the fail-open is visible in the verdict, not buried in a guess.
**Pre-Work Status Gate (mandatory, every issue — compaction-recovery safeguard + sub-issue transition):** **Before the first AC of any issue is worked**, verify `in_progress` via `gh pmu view $ISSUE --json=status --jq='.status'`. Not in progress → `gh pmu move $ISSUE --status in_progress` before proceeding. Two failure modes: **compaction** between Step 1 preamble and start of work losing the transition; and — epics/branch trackers — the preamble having moved only the tracker, never the sub-issues.
Trigger is the **workflow moment**, NOT the mechanism: fires identically inline (direct-work) or via spawned implementation Agent. Applies to **every** issue and **each sub-issue** of an epic/branch tracker as its turn begins. **NOT** satisfied by Step 1 preamble having run — for epics/branch trackers the preamble moves only the tracker, and `gh pmu branch start` creates trackers already `in_progress`, so that call is a no-op (#2483). Does NOT apply to research/review/Explore Agents.
> **Why keyed to the moment, not the actor (#2483):** this gate previously triggered on spawning an implementation Agent. Keying it to the *mechanism* meant the direct-work path — explicitly sanctioned below — bypassed it, and sub-issues were worked without ever reaching `in_progress`. Keep the trigger phrased as a workflow moment; an actor-keyed rephrasing reintroduces the defect under a new name.

**Peer Announcement — event 1 (advisory, #2662):** **after** both gates above pass and before the first AC is worked, announce work starting. `node .claude/scripts/shared/peers-check.js` → take `data.peers`, then `buildAnnouncement({event: EVENTS.WORK_STARTED, issues: [$ISSUE], peers})` from `.claude/scripts/shared/peer-announce.js`. `shouldSend` true → **`SendMessage`** once per `recipients` entry with `text`; false → report `notice` once, continue. State `notice` **once**, not per peer. **`shouldSend` is a dispatch decision, not a delivery guarantee (#2674):** a send may still be held, declined or left to expire by the receiver, none of it observable here, so the send-path `notice` always carries that caveat and appends the skip clause only when peers were skipped. Reporting a peer as *informed* on `shouldSend: true` is a conclusion the value does not support.
**Placement is the AC.** At Step 1 this would announce work a Step 1a exit (1/2/5), a Step 1c `diverged`, or the Review-State Gate may still stop. A peer told work began on an untouched issue is worse than silence — actionable and wrong.
**Fires per sub-issue** under `--nonstop` on an epic/branch tracker, at the same workflow moment as the two gates, not once per invocation naming the tracker.
**Never a gate.** Fire-and-forget; nothing awaits delivery or ack. `buildAnnouncement` has no throwing path and returns inert on malformed input; a failed send is reported, work proceeds. An advisory channel that can fail a command has become a gate.
For each AC (or batch): mark `in_progress` → TDD cycle → run the project's tests **scoped to the touched directory tree** — all scoped tests must pass → mark `completed` → **COMMIT** `Refs #$ISSUE — <description>`.
**Scoping is expressed in the project's own terms.** Take `testCommand` from `framework-config.json` and narrow it to the touched tree **however that runner expresses narrowing** — path argument, filter flag, package selector. No way to narrow, or narrowing not obvious → run the declared command unnarrowed: a slower correct run beats a faster invented one. Scoping optimises feedback speed; the gate is Step 4f, which is not optional.
**Full-suite verification** runs once per sub-issue between Step 4c and Step 5, invoking the declared `testCommand` (Step 4f). Catches cross-cutting regressions scoped runs miss. Failure blocks `in_review`; commit a fix and re-run.
**Commit-per-deliverable gate:** Commit when each AC's deliverable is complete. ACs that decompose a single deliverable (schema + its enums; validator + its reject path; helper's public API + error contract) ship in one commit. ACs that introduce independent deliverables ship separately. **Gate:** do not start the next AC until the previous deliverable is committed.
**Mid-AC commit checkpoint (#2557):** the gate above fires only at AC boundaries. A long investigative phase (source reading, repeated build/deploy/verify cycles, design pivots) reaches no boundary for many tool-turns, so nothing prompts a commit and work accumulates until a later commit sweeps it up under a message attributing it to the wrong issue. This checkpoint fires **during** an AC, before its deliverable is complete.
**Re-read `.claude/metadata/commit-checkpoint-signals.json`** from disk for thresholds and prompt contract — metadata, not prose, so tunable without a spec edit. Measure via `git diff --numstat HEAD`; no new instrumentation. Any declared threshold crossed (currently `changedFiles >= 8` **or** `insertions >= 300` — read the file, do not trust these digits) → **ask** the session to name the verified milestone reached and commit it.
Naming the milestone is half the mechanism: the delta decides **when** to ask, the answer supplies **what the commit message says**. A bare volume trigger fixes the uncommitted-work half and leaves bad attribution untouched.
**Offer, don't force** (`06-runtime-triggers.md`): prompts, accepts a decline, does **not** block — a hard gate mid-investigation interrupts the flow it protects. On decline proceed unchanged. Any commit resets the accumulation.
Applies to **standard single-issue `/work`**, not only epic/`--nonstop` — the reported incident was a standard run, which the Step 6a audit does not cover.
> **Why this differs from Step 6a's commit-density audit, deliberately (#2557):** different **units**, **not reconcilable** to one number. This measures **volume within one AC** (`changedFiles`/`insertions` since last commit), **live**. `nonstop-audit.js` audit (1) measures **commits per AC** (`Math.ceil(acCount / 3)`), post-hoc, warning-only, epic/`--nonstop` only. The audit is left **unchanged**; this is additive. Attribution matters: `scope-drift-check.js`, `log-changed-files.js` and `nonstop-audit.js` all key off `Refs #N` commit sets, so one misattributed commit degrades three gates.
**Grouping heuristic:** Group when ACs describe parts of one artifact (schema + enums; function + validation step; arg + mime-allowlist check). Separate when ACs introduce independent artifacts (different helpers, different spec sections, different subsystems). **When in doubt, separate.** Step 6a commit-density catches under-committing; review catches over-grouping.
**Sub-Agent Review Gate:** After any Agent returns, `git diff --name-only`. Read each modified file, verify changes match current AC, fix mismatches before committing. Mandatory when `strictTDD`; post-hoc otherwise. Gate NOT satisfied by agent summaries or passing tests alone — **file content must be read and verified**.
**Direct-work path (no Agent spawn):** If you implement inline without spawning an Agent, the Sub-Agent Review Gate is N/A. This exemption is scoped to the *Sub-Agent Review Gate only* — the **Pre-Work Status Gate** above fires on the direct-work path exactly as on the Agent path (#2483). The file-read verification intent is satisfied by **Step 4 (Ground in file state — re-read each modified file before evaluating its AC)**, mandatory regardless of path. When `strictTDD=true`, Step 4 re-reads become a hard gate: do not check an AC box from memory. The two gates are complementary, not redundant.
**TDD Execution (`tddChecklist` loaded):** execute each `{phase}.required` item, enforce `{phase}.gate` before proceeding. On `failure-recovery.triggers` match, execute `failure-recovery.steps`. **Deep Reference:** if phase gate fails first attempt, Read `{phase}.deepReference.skill` SKILL.md, retry. Missing skill → warn, proceed.
**TDD fallback (`tddChecklist==null`):** RED=failing test, GREEN=minimal pass, REFACTOR=analyze duplication/naming/complexity, report decision, keep tests passing.
**No auto-tasks → single unit — but say which empty case it is (#2614).** `autoTask.items == []` has two causes the preamble separates, and its warning names which:
| Warning code | Meaning | Expected for |
|---|---|---|
| `NO_ACCEPTANCE_CRITERIA_SECTION` | No acceptance-criteria section in any recognised form | Proposal issue — normal. **Unexpected** for story/bug/enhancement |
| `EMPTY_ACCEPTANCE_CRITERIA_SECTION` | Section exists, parsed to nothing | Never normal — verify before working |
Report the code, then work as a single unit. **Neither blocks nor prompts in any mode** — a proposal issue correctly has no AC section, so blocking would halt a legitimate common case. Same fail-open-but-visible choice the Review-State Gate makes for `indeterminate`.
> **Why report the distinction (#2614):** an empty AC list passes every downstream gate **vacuously**, not by succeeding — no per-AC subtasks, nothing for Step 4 to verify, no unchecked boxes for Step 4b, a clean Step 6a audit. An overcount announces itself; a vacuous pass is indistinguishable from a clean run unless something names it. `sectionFound` was added in #2600 and read by nobody until #2614.
Post-compaction: re-read rule, resume from first incomplete AC.
### Step 3b: Documentation Judgment
Evaluate whether design-decision/tech-debt doc is warranted. Re-read `.claude/scripts/shared/lib/doc-templates.json` from disk. If warranted, create and commit `Refs #$ISSUE`.
### Step 4: Verify Acceptance Criteria (with QA Extraction)
**Ground in file state:** Re-read each file via Read before evaluating its AC. Prevents batch fatigue hallucination.
Per AC: verifiable → `[x]`; unverifiable → auto-extract via Step 4a and apply its annotation **as emitted** — box stays **unchecked** (`- [ ]`) by design (Option A, #2472): the QA sub-issue is the gate (see Step 4b, `.claude/scripts/shared/lib/qa-config.json` `closurePath`). Do **NOT** mark a QA-extracted AC `[x]`. After all ACs resolved, update issue body via `.tmp-$ISSUE.md` flow (`gh pmu view --body-stdout` → edit → `gh pmu edit -F` → `rm`).
**Out-of-phase ACs (#2508):** an AC whose condition resolves *after* this issue reaches `in_review` cannot honestly be checked here — checking is a false claim, leaving it bare deadlocks Step 5. Annotate per `phaseFeasibility.annotationFormat` (`.claude/metadata/ac-feasibility-prompts.json`): `- [ ] <acText> → GATE: review` / `→ GATE: release`. Box stays **unchecked** — same contract as QA. Only `review` and `release` are recognised. Work already owned by another command's checklist (CHANGELOG/tagging/release publication → `/prepare-release`) is **removed**, not annotated. Well-authored issues arrive pre-annotated; annotating here is the fallback for ACs predating the authoring gate.
#### Step 4a: QA Extraction
**Compose the fill first (#2549).** Write a JSON map `acText` → `{steps, expectedResult}` to `.tmp-qa-fill-$ISSUE.json` from parent-issue + AC context (you hold it here; the script does not), then `node .claude/scripts/shared/qa-extract.js --issue $ISSUE --fill .tmp-qa-fill-$ISSUE.json`; `rm` after. Omit `--fill` only when nothing was composed. Reads `.claude/scripts/shared/lib/qa-config.json`, matches unverifiable ACs against keywords, creates labeled QA sub-issues, returns `{matched:[{acText,subIssueNumber,annotation,fillPath}]}`. Apply each annotation to parent body. **Skipping the fill is degraded, not neutral** — the script then derives from AC text alone (action clause → step 1, assertion clause → expected result): better than the old placeholder, weaker than a caller fill, since only the caller can supply setup and preconditions. `fillPath` reports the tier used (`caller`/`derived`/`degenerate`/`placeholder`).
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
<!-- FRAMEWORK-ONLY-START -->
#### Step 4d: Minimize Touched Command Specs (FRAMEWORK-ONLY — dev repo)
Trigger: any commit made in Steps 3/3b for the current sub-issue touched `CommandsSrc/*.md`. Detect via `git diff --name-only <sub-issue-start-sha>..HEAD -- CommandsSrc/`.
For each touched source: (1) invoke `/fw-minimize-files CommandsSrc/<file>.md` via the **Skill tool** (`fw-minimize-files`) — generative LLM task; do not substitute a script call. (2) Verify Stage 1 output `.claude/commands/<file>.md` and Stage 2 output `.min-mirror/Templates/commands/<file>.md` (FRAMEWORK-ONLY stripped) — unless the file is in `getStage2ExcludedFiles()` (via `node .claude/scripts/framework/minimize-helper.js stage2-excluded`). (3) Commit regenerated Stage 1+2 outputs with the source: `Refs #$ISSUE — minimize <file>.md`. Runs before Step 5 so the sub-issue lands with synced source + outputs. Applies in default and `--nonstop`.
#### Step 4e: Register Added Helpers (FRAMEWORK-ONLY — dev repo)
Trigger: any commit added a new `.js` under `.claude/scripts/shared/` or `.claude/scripts/shared/lib/`. Detect via `git diff --name-status <sub-issue-start-sha>..HEAD -- .claude/scripts/shared/` filtered to status `A`.
Helper registration is off-band. **Run the registrar; do not edit by hand (#2620):**
```bash
node .claude/scripts/framework/register-helper.js <path-to-helper> [--gated]
```
`--gated` wraps the entry in an `enableGitHubWorkflow` closure in `constants.js`; omit for a plain string. **Idempotent** — safe after a partial manual edit, no-op when already registered.
It performs **four** CI-enforced edits:
| # | File | What | Enforced by |
|---|---|---|---|
| 1 | `framework-manifest.json` | append to `deploymentFiles.scripts.shared.files` or `deploymentFiles.scripts["shared/lib"].files` | `deployment-parity.test.js` |
| 2 | `constants.js` | append to `INSTALLED_FILES_MANIFEST.scripts.files` or `.scriptsLib.files` | `deployment-parity.test.js` |
| 3 | `CHARTER.md` | recompute the `Scripts` row from disk | `charter-entity-counts.test.js` |
| 4 | helper JSDoc | **reported, not written** — `@framework-script v0.99.0` is authored content | `manifest-validation.test.js` |
**Row 4 is a report, still yours to do.** The script warns and continues; add the line, then commit everything with the helper: `Refs #$ISSUE`.
**Row 3 is why this is a tool.** Registration was documented as *three* edits for as long as Step 4e existed, but a new `shared/lib` module also moves `CHARTER.md`'s counts — a fourth edit the rule never named, enforced by a suite that fails on it. Following the written procedure exactly still produced a red run.
> **Why a script, not a longer checklist (#2620):** the `shared/lib` key contains a slash and **cannot** be dot-accessed; a dot form reads `undefined` silently and `|| []` turns that into a plausible `false`. That hazard was already documented here and still paid by hand every time — most recently #2600 for `lib/checkbox-scan.js`. Documentation cannot fix a transcription error it has already warned about; a tool can.
Runs before Step 5. Applies in default and `--nonstop`.
<!-- FRAMEWORK-ONLY-END -->
#### Step 4f: Full-Suite Regression Sweep
After Step 4c (and 4d/4e if they fired), run the project's full test suite before Step 5. All tests must pass. Failure blocks `in_review` — commit a fix (`Refs #$ISSUE`) and re-run. Complements per-AC scoped tests with a cross-cutting regression check at the sub-issue boundary.
**The command comes from the project, never from this rule.** Read `testCommand` from `framework-config.json` and invoke it verbatim.
**No `testCommand` declared → report the gap; do not substitute one.** Emit:
```
No testCommand is declared in framework-config.json, so the full-suite
sweep was NOT run. The in_review move proceeds unverified — declare
testCommand to restore this gate.
```
Then continue to Step 5. The absence is reported, never silently skipped: a gate that quietly does nothing is indistinguishable from one that passed, the more dangerous of the two.
> **Why no fallback (#2595):** the obvious default is the package-manager test script — correct for Node, silently wrong for Go, Rust, .NET and Python, which is this defect reintroduced one layer down. A rule naming *any* runner is wrong for some ecosystem, so this one names none. Declaration is the mechanism; detection and install-time seeding are separate questions (the latter is Praxis Hub Manager's).
> **Why it degrades rather than halts:** an undeclared `testCommand` is every project's normal state until someone declares one, so halting would block `/work` everywhere on a key no installer writes yet. Fails open and says so — as the Review-State Gate does for `indeterminate` and Step 3 for an empty AC section.
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
**(2a) Peer Announcement — event 2 (advisory, #2662):** inside this sequence, **before** the STOP directive in (3) — not after it, where a STOP means it never runs. `git log --oneline --grep="Refs #$ISSUE"` → `buildAnnouncement({event: EVENTS.WORK_COMPLETED, issues: [$ISSUE], commits, peers})`; send to `recipients` as in event 1.
**The empty payload stays truthful.** Zero `Refs #$ISSUE` commits still emits, worded so nothing is implied to have landed. `scope-drift-check.js`, `log-changed-files.js` and `nonstop-audit.js` all key off `Refs #N` sets, so a peer inferring commits that do not exist is the misattribution this event surfaces.
**A throwing helper must not abort this sequence.** (1), (2) and (3) run regardless — prune, report and STOP are the contract; the announcement is advisory and must never abort the enclosing sequence.
**(3) STOP.** Wait for "done". Do NOT close.
**Autonomous Epic/Branch processing:** For `context.type=="epic"`/`"branch"`, process sub-issues in ascending numeric order (default) or custom **Processing Order:** from the epic or branch tracker body. Skip sub-issues already in `in_review`/`done`. Under `--nonstop`, Step 2c may have proposed a different order and — on acceptance — written it into that same **Processing Order:** section; the order processed here is whatever `parseProcessingOrder` reads, which is the accepted one (#2622).
**Default mode:** each sub-issue → `in_progress` → Steps 3–4 → `in_review` → **STOP** per sub-issue → user "done" → next. The `in_progress` transition is **executed by the Step 3 Pre-Work Status Gate** as each sub-issue's turn begins — this line describes the lifecycle, it does not implement it (#2483).
**`--nonstop` mode:** same cycle, **no STOP** between sub-issues. Report `Sub-issue #N: $TITLE → In Review (M/T processed)`. Ignored for standard issues. One commit/AC (`Refs #N`); push deferred to `/done`. Any test/AC/QA/`gh pmu` failure halts immediately — report sub-issue, completed count, resume instructions. A `findings-pending` verdict from the Step 3 Review-State Gate halts on the same terms (#2577). **Post-compaction:** `TaskList` — `in_progress` sub-issue parent is primary resume signal; else fall back to `gh pmu sub list $ISSUE` and resume from first not in `in_review`/`done`. Final: `Nonstop Processing Complete` (processed/skipped/failed).
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
