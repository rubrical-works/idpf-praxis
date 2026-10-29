# /work Execution Rule
**Version:** v0.114.0
**Source:** Reference/work-execution.md (dev-preserve variant)
Auto-loaded execution rule for `/work` — hybrid shell + auto-loaded rule architecture. Shell `.claude/commands/work.md` covers arguments/prereqs/errors; this rule covers the Workflow. Two companions are read on demand, never auto-loaded: `{frameworkPath}/Reference/work-execution-conditional.md` (bodies that fire only for an epic, a branch tracker, `--nonstop`, `--concurrent` or a multi-issue selection — loaded at Step 1d) and `{frameworkPath}/Reference/work-execution-rationale.md` (why each directive is as it is — read when questioning one).
## Execution Instructions
**REQUIRED:** Routed command — two-phase task creation. Task list IS the runtime step machine.
**Availability precondition — probe before Step 1.** Call `TaskList` once, per `07-task-creation-timing.md` § Availability Precondition. Absent → track every step with an **inline checklist** (same steps, same order) and **say once, explicitly, that the `TaskList`-based compaction-recovery guarantee does not hold**; on resume, re-derive position from issue status, `Refs #N` commits and checked acceptance criteria — never from a checklist that may be gone.
**Phase 1:** Create exactly one task: `Step 1: Context Gathering (preamble script)` — description: all downstream gates depend on parsed context.
**Phase 2 (after routing confirmed):** Read `.claude/scripts/shared/lib/work-task-definitions.json` and emit a `TaskCreate` for every entry, **all of them in one message as parallel tool calls** — not one call per message (`07-task-creation-timing.md` § Emission). Entry order is the write order; ordering is a property of the batch, not a reason to serialize it. Each entry provides `subject`, `condition`, `description`. Conditional entries are created OR explicitly skipped with a one-line note — never silently omitted. **Epic/branch: skip `scope` `per-sub-issue` entries, and `per-sub-issue-unless-nonstop` ones without `--nonstop`** — Step 2b's parents own them; no skip note.
**Per-AC subtasks (runtime-only):** When Step 3 begins and `context.acceptanceCriteria` is known, create one subtask per AC named `AC: <criterion>`, description `Commit required after this AC (commit-per-AC gate).`
**Behavior Rules:**
1. Redirect/early exit → mark preamble complete, stop. No Phase 2.
2. Conditional skip → report `Skipped: Step Xa (condition: <cond> not met)`. Silent omission forbidden.
3. `/work` is MANAGED — no `USER-EXTENSION` blocks to discover.
4. Track `in_progress` → `completed`. Never mark complete what you did not execute.
5. Post-compaction: re-read rule (auto-loaded), `TaskList` — first `in_progress` (or first `pending`) is resume point. No re-routing.
6. Every `TaskCreate` MUST include `description` with the *why*. Subject = what; description = why.
7. **Per-sub-issue parent task lifecycle (epic/branch only):** Step 2b creates one parent task per remaining sub-issue. Mark the parent `in_progress` at the start of Step 3 for that sub-issue, and `completed` after Step 5. Per-AC subtasks nest under the active parent; delete or complete them before creating the next sub-issue's AC subtasks.
8. **Resume inside a sub-issue (epic/branch):** its step has no task — re-derive it from checked ACs, the `**Doc judgment:**` line, `### Files Changed` and board status, as the absent-task-tools path does.
## Workflow
### Step 0: Conditional — Clear Task List
If not epic/branch tracker, clear task list.
### Step 1: Context Gathering (Preamble Script)
`node .claude/scripts/shared/work-preamble.js` with `--issue N`, `--issues "N,N,N"`, or `--status <status>`. `--assign` to auto-assign.
Parse JSON: `ok: false` → report `errors[]`, STOP. `ok: true` → extract `context`, `gates`, `autoTask`, `warnings`, report.
**`gates.moveDeferred` set → nothing was moved.** The review gate will stop — Step 3's matrix for a standard issue, Step 2b-ii's tree gate for an epic or a branch tracker under `--nonstop` — so the preamble left the issue, its PRD tracker and the tree's root as found; accepting the gate's offer changes no status. Report `moveDeferred.reason` in one line and continue.
**Batch envelope (`--issues`, `--status` — #3260).** One `results[]` entry per member. Top-level `ok:false` (`ALL_MEMBERS_FAILED`) → report every member's error, STOP. A member with `ok:false` (`TREE_IN_BATCH` — run it alone) is reported and skipped. A member with `context.redirect` is **not** handed off mid-batch: work the others, then report `#N carries <redirectLabel> → run <redirect> #N`. Relay `warnings`.
**`context.redirect` set → hand off and STOP.** Set for a label in `WORK_REDIRECT_LABELS` (`work-preamble.js`): `test-plan` → `/review-test-plan`, and `qa-required` → `/qa` for a **single issue only** — under an epic or branch tracker a `qa-required` sub-issue is **skipped** with a pointer at Step 2b, never redirected mid-loop. Mark the preamble task complete, create **no** Phase 2 tasks (Behavior Rule 1), invoke the mapped command via the Skill tool with the leading `/` stripped — never a hardcoded name — and report the label and the command handed to. **Neither Step 3 gate runs**, and the preamble makes no status move. `prd` and `proposal` deliberately do **not** redirect, and `qa-required` is deliberately absent from `issue-type.js`'s shared `REDIRECT_LABELS`.
**--assign errors:** `ALREADY_ASSIGNED` (different branch), `WORKSTREAM_CONFLICT` (use `/assign-branch`), `BRANCH_TRACKER_NOT_ASSIGNABLE` (target is a branch tracker — assign sub-issues instead). `--schema` for envelope reference.
### Step 1d: Load Conditional Sections
Trigger: `context.type` is `epic` or `branch`, or `--nonstop`, or `--concurrent`, or a selection of two or more issues. Run `node .claude/scripts/shared/lib/work-conditional-sections.js --type <epic|branch|standard> [--nonstop] [--concurrent] [--selection N]` and hold its output for the run: only the sections of `{frameworkPath}/Reference/work-execution-conditional.md` this shape needs — a default-mode epic gets Steps 2b and 2b-ii only. Runs right after the preamble. Absent trigger → skip with Behavior Rule 2's note; a single-issue selection never needs it: Step 3's resident gate classifies one member the same way. Its own task entry, so recovery shows if it was due.
### Step 1a: CI Wait (--wait)
**Trigger:** `context.wait == true`.
```bash
node .claude/scripts/shared/wait-for-ci.js --branch $(git branch --show-current) --timeout 300
```
Exit codes live beside the code: `node .claude/scripts/shared/wait-for-ci.js --schema`. 0 (pass) and 3 (no runs for this branch/commit) continue; 1 (fail, bad arguments, or `gh` unavailable after retries), 2 (timeout, no jobs running) and 5 (timeout with jobs still running at the 15-minute cap — re-run `--wait` or check the run directly) → **STOP**. The gate is scoped to the branch/commit passed — a green run on an unrelated branch does not satisfy it.
### Step 1b: Epic Complexity Assessment
Body: conditional file § Step 1b, loaded at Step 1d when `context.type == "epic"` with `--nonstop`. Signals: `.claude/metadata/epic-complexity-signals.json`.
### Step 1c: Branch Sync
**Trigger:** always — once per invocation, after Step 1 (and Step 1a when `--wait`), before any commit; not repeated per sub-issue.
```bash
node .claude/scripts/shared/branch-sync-check.js
```
Same helper, statuses and `fetched: false` reporting as `03-startup.md` § Branch Sync Offer, which owns the table; `/work` differs in three places. **`behind`, no conflicting paths** → offer the fast-forward via `AskUserQuestion`; accept → `node .claude/scripts/shared/lib/rebase-guard.js --ff-only`, report its `message`; refusal → report git's error verbatim and continue, no retry. **`behind`, conflicting paths** → no pull offer; ask whether to continue on the stale base or STOP; never stash, discard, or revert. **`diverged`** → report `ahead`/`behind` and **STOP**; recovery is `/sync-branch`, `/done` on the issue still in review, or a manual push, then re-run `/work`. `upstream-gone` → report it and continue; never read it as `no-upstream`. `success: false` → warn, continue.
### Step 2: Framework Methodology Dispatch
Load `{frameworkPath}/{framework}/` core file from `framework-config.json`. Missing → warn, continue.
### Step 2a: Load TDD Checklist
Read `.claude/skills/tdd-process/tdd-checklist.json`. Valid (`red`/`green`/`refactor` each with `required[]` + `gate`, plus `failure-recovery` with `triggers[]` + `steps[]`) → `tddChecklist` = JSON; phases may include `deepReference: { skill, when }`. Invalid/missing → warn `"TDD checklist not found or invalid — using inline TDD behavior."`, set `tddChecklist = null`.
**Also resolve the verification mode** once per invocation via `resolveVerificationModeDetail()` (`.claude/scripts/shared/lib/framework-config.js`) — never per AC, never inferred from the repository: `{ mode }` is `automated-tests` (default) or `host-process`; relay its `warning` once. **Absent, unreadable or unrecognized all resolve to `automated-tests`**, the strict gate.
### Step 2b: Prime Sub-Issue Task List (epic/branch only)
Body: conditional file § Step 2b, loaded at Step 1d when `context.type` is `epic` or `branch`. Contract kept resident: enumerate with the bare form `gh pmu sub list $ISSUE --json` (an object with nested `children[]`, GitHub open/closed only); board status is one `gh pmu view $N --json=status` per child — `work-preamble.js` already returns both, so never re-query.
### Step 2b-ii: Tree-Wide Review Gate (epic — #2748; branch tracker + `--nonstop` — #2749)
Body: conditional file § Step 2b-ii, loaded at Step 1d when `context.type` is `epic`, or `branch` with `--nonstop`, or a selection of two or more issues. It carries the selection gate and which review gate runs first.
### Step 2c: Proposed Work Order (`--nonstop` epic/branch only — #2622)
Body: conditional file § Step 2c, loaded at Step 1d when `context.proposedOrder` is present (`--nonstop` on an epic or branch tracker).
### Step 3: Work the Issue
**Review-State Gate (mandatory, every issue — #2577):** **Before the first acceptance criterion of any issue is worked**, classify that issue's review state and act on it:
```bash
node .claude/scripts/shared/review-state.js --issue $ISSUE
```
Returns `{ ok, issue, state, reason, signals, warnings }`; `state` is exactly one of `never-reviewed`, `findings-pending`, `reviewed-clean`, `indeterminate`, read from the `reviewed`/`pending` labels (`review-finalize.js` `determineLabel()`) and the `**Reviews:** N` body marker (`updateBodyReviewCount()`). No new state store.
The action for each state and run shape is data — `.claude/metadata/review-state-gate-actions.json`, re-read from disk at use, never restated here. `never-reviewed` and `findings-pending` STOP with an offer, warn and proceed, or halt, by run shape (single interactive issue; batch/epic/branch tracker; `--nonstop`). `reviewed-clean` and `indeterminate` **never prompt in any mode** — `indeterminate` fails open on purpose.
Present the offer via `AskUserQuestion` — the `/create-backlog` Phase 1c shape, `/review-issue` (never reviewed) or `/resolve-review` (findings pending) recommended and "continue without review" the alternative. **Declining proceeds to work unchanged**: the gate mutates nothing on decline — no label change, no status move, no body edit — and the decline is **not** recorded durably. Accepting means work does **not** begin — report the suggested command and STOP, leaving the issue exactly as found.
The gate **does not re-prompt** for an issue already decided within the same `/work` invocation, including after compaction recovery — one decision per issue per invocation.
**Recorded, so the decision survives compaction.** At Step 1, once per invocation — never again on a compaction resume — run `node .claude/scripts/shared/lib/announce-ledger.js invocation --root <root>` (the issue, epic or branch tracker `/work` was given). Before classifying, look up `… gate --issue $ISSUE --gate review-state --root <root>`: a non-null `decision` was made in this invocation and is reused, never re-prompted. Record each decision with `… --decision <proceed|declined|stop|halt>`, and each Pre-Work Status Gate outcome with `--gate pre-work-status --decision <moved|already>`. Step 6a audit (6) reports a processed sub-issue with no Review-State decision recorded.
**Ordering:** this gate runs **before** the Pre-Work Status Gate.
**Selections and tree gates.** A selection is classified in full before its first member is worked, one question for the whole selection: at N = 1 that is this gate; at N ≥ 2, and on an epic or a branch tracker under `--nonstop`, it is Step 2b-ii (conditional file), and this gate does not re-prompt for a member it decided — it still catches one added later or reached after a compaction resume.
The trigger is the **workflow moment**, not the actor or mechanism: it fires identically whether you implement inline (direct-work path) or spawn an implementation Agent, and independently for **each sub-issue** of an epic or branch tracker as that sub-issue's turn begins — not once for the tracker. Batch selection (`--issues "N,N,N"`, `--status <status>`) fires it per issue at that issue's turn. It does **not** apply to research/review/Explore Agents. Why `--nonstop` halts on `findings-pending` but warns on `never-reviewed`, and why `indeterminate` fails open: rationale file § Step 3.
**Pre-Work Status Gate (mandatory, every issue — compaction-recovery safeguard + sub-issue transition):** **Before the first acceptance criterion of any issue is worked**, verify `in_progress` via `gh pmu view $ISSUE --json=status --jq='.status'`. Not in progress → `gh pmu move $ISSUE --status in_progress` before proceeding.
**A deferred start is completed here.** When Step 1 returned `gates.moveDeferred` and the run reached this gate — the offer was declined — also move `moveDeferred.prdTracker` when set, and on an epic the epic itself, to `in_progress`.
**Finished work is not reopened.** An issue already In review or Done is never moved back to `in_progress`: a sub-issue in either status is skipped (`context.skipped`), and `/work N` on one returns `ALREADY_IN_REVIEW` / `ALREADY_DONE` with no move unless `--reopen` is passed, which moves it and reports `gates.reopenedFrom`. A sub-issue whose status cannot be read is skipped too (`SUB_ISSUE_STATUS_UNREADABLE`; halts under `--nonstop`), and a failed sub-issue enumeration is `SUB_ISSUE_LOAD_FAILED` before any move.
Same trigger as the Review-State Gate — the **workflow moment**, on either path, for every issue and **each sub-issue** at its turn, not research/review/Explore Agents. **Not** satisfied by the Step 1 preamble having run: for epics and branch trackers it moves only the tracker. An actor-keyed rephrasing reintroduces the defect.
**Peer Announcement — event 1 (advisory):** **after** both gates above pass and before the first acceptance criterion is worked, announce that work is starting.
**Gated by project config.** Resolve **once per `/work` invocation** — before event 1, reused unchanged for event 2 and for every sub-issue: `node .claude/scripts/shared/lib/cross-session-config.js`. **Read the resolver; never re-derive the defaults inline, and never read `process.env`** — the resolver applies `IDPF_X_SESSION > framework-config.json crossSessionMessaging > enabled by default` itself.
| Resolved value | Effect |
|---|---|
| `groups.work` false | Events 1 and 2 **emit nothing** — no `SendMessage` and **no skip notice**. Both gates still run; Step 6 still prunes, reports and STOPs |
| `notices` false | Dispatch unchanged; only the dispatch-caveat and skip-reason lines are suppressed |
| `discovery` false | **All three groups resolve off**, events 1 and 2 included; the resolver reports that implication — report it too |
| `IDPF_X_SESSION` recognized off-value | Everything resolves off for this session. **Report the resolved `source` when it is `environment`**, relaying the resolver's `implications` entry verbatim |
| Absent object, `{}`, or any omitted key | Enabled. **Absence means enabled at every level** |
No per-invocation skip notice for a config-sourced suppression — the silence is the requested behavior.
```bash
node .claude/scripts/shared/announce.js --event work-started --issue $ISSUE
```
From `announcement`: `shouldSend === true` → **`SendMessage`** once per `announcement.recipients` entry with `announcement.text`; `false` → report `announcement.notice` once and continue. State the notice **once**, not per peer. Relay `warnings` verbatim. Then close the outcome out with the envelope's `dispatchReport`: `node .claude/scripts/shared/announce.js --dispatch-result sent|failed --ledger-id <id> [--detail "<error>"]`.
- **Never hand-compose the payload** — not by calling `buildAnnouncement`, not for event 1 either; only the script's composition writes the ledger record Step 6a audits.
- **A failed `SendMessage` is reported in words and recorded `failed`, never swallowed.**
- **`shouldSend` is a dispatch decision, not a delivery guarantee** — never report a peer as *informed* on the strength of it.
- **Placement is the AC:** after both gates, never at Step 1. **Fires per sub-issue** under `--nonstop`, at the same moment as the two gates — not once per invocation naming the tracker.
- **Never a gate.** Fire-and-forget; a throwing helper or failed send is reported and work proceeds.
For each AC (or batch of related ACs): mark `in_progress` → TDD cycle (RED → GREEN → REFACTOR) → run the project's tests **scoped to the touched directory tree** — all scoped tests must pass → mark `completed` → **COMMIT** `Refs #$ISSUE — <description>`.
**Scoping is expressed in the project's own terms.** Take the suites `resolveSuites()` returns and route the touched tree through `scopedInvocations()` from `.claude/scripts/shared/lib/test-runner.js` (see Step 4f), which narrows each **in whatever way each runner expresses narrowing**. Where a runner offers no way to narrow, or the narrowing is not obvious, run that command unnarrowed: a slower correct run beats a faster invented one. The gate is the full sweep at Step 4f, which is not optional.
**A suite declaring `sweepSelect` is narrowed by its selector.** Run `selectorInvocations()` over the AC's changed files and pass each result to `scopedInvocations()` as `selections`, exactly as Step 4f passes them to `sweepInvocations()`. Each run then reports `selected N of M`, or `touched tree — <reason>` when it fell back; an empty selection is listed in `selectedNone` — it ran nothing and is not a pass.
**Under `--concurrent`:** `--agents` is also the unit-test concurrency cap; `parallel` suites in worktrees, `exclusive` once on the tracker (`deferredInvocations`). Members pass the Merge-Back Review Gate: `outcome --post-comment` posts, no root file; a change outside `runPaths` is reported — conditional file § Step 3: `--concurrent` Test Scope and the Merge-Back Review Gate.
**Full-suite verification** runs once per sub-issue between Step 4c and Step 5, invoking **every** command the project declares (Step 4f). Any failure blocks the `in_review` move and requires a fix commit. Under `--nonstop` on an epic or branch tracker it runs once at the end of the run instead (conditional file § Step 4f: Cadence under `--nonstop`).
**Commit-per-deliverable gate:** Commit when each acceptance criterion's deliverable is complete. ACs that decompose a single deliverable (a schema and its enums; a validator and its reject path; a helper's public API plus its error contract) ship in a single commit. ACs that introduce independent deliverables ship separately. **The gate:** do not start the next AC until the previous deliverable is committed.
**Mid-AC commit checkpoint:** fires **during** an AC, before its deliverable is complete — a long investigative phase reaches no AC boundary, so work otherwise accumulates until a later commit sweeps it up under the wrong issue. **Re-read `.claude/metadata/commit-checkpoint-signals.json` from disk** for the thresholds and prompt contract. Measure with `git diff --numstat HEAD -- <paths>`; when any declared threshold is crossed, **ask** the session to name the verified milestone reached so far and commit it.
**This run's paths only.** Measure over this issue's declared scope plus the paths this run edited, never the whole tree: a peer session's uncommitted edit must not trip the threshold. Commit each AC by staging its named paths (`git add <path>…`), never `git add -A` or `git add .`, so a peer's edit never lands in a `Refs #N` commit. When an Agent has committed, the Sub-Agent Review Gate reads the files of its commits (`git show --name-only <sha>`), since `git diff --name-only` is then empty.
**Offer, don't force** (`06-runtime-triggers.md`): it prompts and accepts a decline; it does **not** block. On decline, proceed unchanged; any commit resets the accumulation. Applies to **standard single-issue `/work`**, not only epic or `--nonstop` runs. It measures volume within one AC, live; `nonstop-audit.js` audit (1) counts commits per AC after a run and is left unchanged — the two are not reconcilable to one number (rationale file § mid-AC commit checkpoint).
**Grouping heuristic:**
- **Group** when ACs describe parts of one artifact (schema + its enums; function + its validation step; arg + its mime-allowlist check).
- **Separate** when ACs introduce independent artifacts (different helpers, different spec sections, different subsystems).
- **When in doubt, separate.** Step 6a commit-density catches under-committing; reviewers catch over-grouping.
**Sub-Agent Review Gate:** After any Agent returns, `git diff --name-only`. Read each modified file, verify changes match current AC, fix mismatches before committing. Mandatory when `strictTDD`; post-hoc otherwise. Gate is NOT satisfied by trusting agent summaries or passing tests alone — **file content must be read and verified**.
**Direct-work path (no Agent spawn):** If you implement the AC inline without spawning an Agent, the Sub-Agent Review Gate is N/A. The exemption is scoped to the *Sub-Agent Review Gate only*: the **Pre-Work Status Gate** fires on the direct-work path exactly as on the Agent path. The file-read verification intent is satisfied by **Step 4 ("Ground in file state — re-read each modified file before evaluating its corresponding AC")**, mandatory regardless of path. When `strictTDD=true`, Step 4 re-reads become a hard gate: do not check an AC box from memory. The two gates are complementary, not redundant.
**TDD Execution (`tddChecklist` loaded):** for each phase, execute every item in `{phase}.required`, enforce `{phase}.gate` before proceeding. On `failure-recovery.triggers` match, execute `failure-recovery.steps`. **Deep Reference:** if a phase gate fails first attempt, check `{phase}.deepReference` — Read `.claude/skills/{skill}/SKILL.md`, retry. Missing skill → warn `"Deep reference skill '{name}' not found"`, proceed.
**TDD fallback (`tddChecklist == null`):** RED=failing test, GREEN=minimal pass, REFACTOR=analyze duplication/naming/complexity, report decision, keep tests passing.
**Contract tests:** when a new test's subject is a non-code artifact, declare `@subject` in its leading comment block as `{frameworkPath}/Reference/Contract-Test-Classification.md` directs.
**Host-process verification mode (`verificationMode: "host-process"`, #2556)** — not the null fallback: the checklist loads, its RED gate is unsatisfiable. **Trigger: the code under test cannot be executed outside a live host process** (Unity/Unreal/Godot, embedded/firmware, a plugin or mod inside a host it does not own). **The trigger is NOT "no automated tests exist"** — such a project stays on the strict gate.
| Phase | Strict (`automated-tests`) | Carve-out (`host-process`) |
|---|---|---|
| RED | Test run executed; fails with the expected error | **Expected behavior described in writing** before the change is made |
| GREEN | Test run executed; passes | **Verified in the live runtime**, with the verification method **named** and its **captured output** quoted |
| REFACTOR | Unchanged | Unchanged |
**The gate is not removed — it demands different evidence.** Name the channel (a MelonLoader log, a serial console, a device trace) and quote what it said. **Disclosure is mandatory, in the commit message or the issue body** — an undisclosed deviation is a silent skip whichever mode is declared.
**No auto-tasks → single unit — but say which empty case it is.** `autoTask.items == []` has two causes the preamble separates, and its warning names which:
| Warning code | Meaning | Expected for |
|---|---|---|
| `NO_ACCEPTANCE_CRITERIA_SECTION` | The body has no acceptance-criteria section in any recognized form | A proposal issue — normal. **Unexpected** for a story, bug or enhancement |
| `EMPTY_ACCEPTANCE_CRITERIA_SECTION` | A section exists and parsed to nothing | Never normal — verify the section before working the issue |
Report the code with the issue's summary, then work the issue as a single unit. **Neither blocks nor prompts in any mode** — an empty list passes every downstream gate vacuously, so naming it is what keeps the pass visible.
Post-compaction: re-read rule, resume from first incomplete AC.
### Step 3b: Documentation Judgment
Evaluate whether design-decision/tech-debt documentation is warranted. Re-read `.claude/scripts/shared/lib/doc-templates.json` from disk for criteria, paths, naming, and the document skeleton (its `templates` map, keyed `construction/design-decision` / `construction/tech-debt`). If warranted, create document and commit `Refs #$ISSUE`.
**Record the judgment in the issue body, either way.** Write one line, before Step 4c, using the `gh pmu view --body-stdout` → edit → `gh pmu edit -F` flow:
- `**Doc judgment:** none — <reason>` when no doc is warranted, with the reason in a few words;
- `**Doc judgment:** <path>` for each doc created (one line per doc).
On re-run, replace the line rather than adding a second. Step 6a audit (5) warns for a processed sub-issue whose body lacks the line.
### Step 4: Verify Acceptance Criteria (with QA Extraction)
**IMPORTANT — Ground in file state:** Re-read each file via Read tool before evaluating its AC. Do NOT evaluate from memory. Prevents batch fatigue hallucination.
Per AC: verifiable → `[x]`; unverifiable → auto-extract via Step 4a and apply its annotation **as the script emits it** — the box stays **unchecked** (`- [ ]`) by design (Option A): the QA sub-issue is the open gate (see Step 4b and `.claude/scripts/shared/lib/qa-config.json` `closurePath`). Do **NOT** mark a QA-extracted AC `[x]`. After all ACs resolved, update issue body via `.tmp-$ISSUE.md` flow (`gh pmu view --body-stdout` → edit → `gh pmu edit -F` → `rm`).
**Test-suite ACs:** an AC that restates the project's test command passing (`dischargedByWorkflow` in `.claude/metadata/ac-feasibility-prompts.json`) is checked from the Step 4f result once that sweep passes; it is never worked as a run of its own, which would execute the same suite twice. A selection-mode sweep (`selected N of M`) does not discharge it. Run the named command separately only when it differs from every declared sweep command (name the difference) or the verification set resolves to `none`.
**Out-of-phase ACs:** an AC whose completion condition resolves *after* this issue reaches `in_review` cannot honestly be checked here; leaving it bare deadlocks Step 5. Annotate it using `phaseFeasibility.annotationFormat` from `.claude/metadata/ac-feasibility-prompts.json`:
```
- [ ] User reads and approves the rewritten specialist before merge → GATE: review
- [ ] Behavior documented in the release notes → GATE: release
```
The box stays **unchecked** — same contract as QA; `review` and `release` are the only two tokens. **The AC text must name the event that resolves it** — **a token that cannot name its resolving event is not a gate**. Work another command's checklist owns (CHANGELOG, tagging, release publication → `/prepare-release`) is **removed**, not annotated.
#### Step 4a: QA Extraction
**Compose the fill first.** Write a JSON map `acText` → `{ steps, expectedResult, routes }` to `.tmp-qa-fill-$ISSUE.json` from the parent issue and the AC's context (you hold it; the script does not), then run `node .claude/scripts/shared/qa-extract.js --issue $ISSUE --fill .tmp-qa-fill-$ISSUE.json` and `rm` the file. It reads `.claude/scripts/shared/lib/qa-config.json`, matches unverifiable ACs, creates labeled QA sub-issues and returns `{ matched, unfiled, warnings }`; apply each `matched` `annotation` to the parent body. Same in standard and `--nonstop`.
**Automation first:** a keyword match proposes, never files. An AC you can automate now is automated under `Refs #$ISSUE` and checked — no QA sub-issue. Otherwise its `routes` maps every `automationRoutes` id to the specific reason that route cannot reach the check; a missing, blank or `genericReasons` answer leaves it in `unfiled` — answer and re-run.
**Field types:** `steps` is a non-empty string or array of strings (write them unnumbered); `expectedResult` and optional `fixtures` are non-empty strings; any other type is named in `warnings`. **Skipping the fill is degraded, not neutral:** no `routes`, so nothing is filed; `fillPath`/`fillSources` report each field's source.
#### Step 4b: Force-Move Prohibition
**NEVER** use `gh pmu move --force` to bypass unchecked ACs on issues you implemented. Legitimate: epic parents, external closures, branch trackers, and the intentionally-open gate annotations below. Test-plan approvals are not in that list: their gates are **resolved** by `/review-test-plan` Step 5a, and `/work` redirects such an issue at Step 1.
The three markers — `- [ ] … → QA: #N`, `- [ ] … → GATE: review`, `- [ ] … → GATE: release` — with their meaning, precedent and closure rule are data: `.claude/metadata/ac-gate-markers.json`, re-read from disk at use, consumed here and at Step 5. The recognized gate tokens are exactly the ones that file lists.
Moving to `in_review` past **only** such lines is permitted. The exception is scoped strictly to lines carrying one of these markers with a recognized token and is **not** a general force permission — a bare `→ GATE:`, an unrecognized phase token, or the word "gate" in ordinary AC prose is still unfinished work.
**Shape is validated here; the claim is not** — the reviewer-side check is `/review-issue`'s `ac-phase-feasible` criterion; do not add a shape guard here and call the gap closed. Detection: `story`/`enhancement`/`bug` label AND `in_progress` this session → **HALT** if any unchecked AC *lacks* both markers; report the unchecked (non-gate) count, verify via Step 4 instead. This is the **second** line of defense — the authoring commands apply `phaseFeasibility` first — so annotating here is the exception, not the norm.
<!-- FRAMEWORK-ONLY-START -->
#### Step 4d: Minimize Touched Command Specs (FRAMEWORK-ONLY — dev repo)
**Trigger:** Any commit made in Steps 3/3b for the current sub-issue touched `CommandsSrc/*.md`. Detect via `git diff --name-only <sub-issue-start-sha>..HEAD -- CommandsSrc/`.
**Frontmatter-only fast path first.** Run `node .claude/scripts/framework/minimize-helper.js carry-frontmatter CommandsSrc/<file>.md ...` over the touched set. It carries each file whose body is byte-identical to the recorded source revision — swapping only the changed frontmatter fields in Stage 1 and Stage 2 and writing the run record — and refuses, with a code and reason, every file it cannot show safe. **Every refused file goes through item 1 below, generatively.** Carried files skip items 1–2 and join item 3's commit; rebuild the extension registry (`node .claude/scripts/framework/build-extension-registry.js`) after either path.
For each touched source file the fast path did not carry:
1. Invoke `/fw-minimize-files CommandsSrc/<file>.md` via the **Skill tool** (skill name `fw-minimize-files`). This is a **generative LLM task** — do not substitute a script call (`minimize-helper.js validate-single-file` would produce raw copies that fail the Phase 2h-post ratio gate and the Phase 2h-post2 structural gate). `carry-frontmatter` is not such a substitute: it carries an already-minimized body and refuses whenever the body changed.
2. Verify Stage 1 output exists (`.claude/commands/<file>.md`) and Stage 2 output exists (`.min-mirror/Templates/commands/<file>.md`) with FRAMEWORK-ONLY blocks stripped — unless the file is in `getStage2ExcludedFiles()` (query via `node .claude/scripts/framework/minimize-helper.js stage2-excluded`).
3. Commit the regenerated Stage 1 + Stage 2 outputs together with the source: `Refs #$ISSUE — minimize <file>.md`.
Runs before Step 4c and Step 5 so its commit is logged and gated. Applies identically in default and `--nonstop` modes.
#### Step 4e: Register Added Helpers (FRAMEWORK-ONLY — dev repo)
**Trigger:** Any commit made in Steps 3/3b for the current sub-issue added a new `.js` under `.claude/scripts/shared/` or `.claude/scripts/shared/lib/`. Detect via `git diff --name-status <sub-issue-start-sha>..HEAD -- .claude/scripts/shared/` filtered to status `A`.
**Run the registrar; do not perform the edits by hand:**
```bash
node .claude/scripts/framework/register-helper.js <path-to-helper> [--gated]
```
Pass `--gated` when the helper should be wrapped in an `enableGitHubWorkflow` closure in `constants.js`; omit it for a plain string entry. **Idempotent** — safe to re-run after a partial manual edit. It edits `framework-manifest.json`, `.claude/scripts/framework/constants.js` and `CHARTER.md` — each enforced by CI — and **reports** rather than writes the helper's `@framework-script v0.114.0` JSDoc line: that is authored content, still yours to add before committing everything together with the helper (`Refs #$ISSUE`). Why a script: rationale file § Step 4e.
Runs before Step 4c and Step 5 so the registrar's edits are gated in the same pass. Applies identically in default and `--nonstop` modes.
<!-- FRAMEWORK-ONLY-END -->
#### Step 4c: Log Changed Files to Issue Body (with state-drift gate)
**Runs after every step that can commit for the issue before the sweep** — after Steps 4d and 4e where they fire, so their commits are in `### Files Changed` and pass through the gate. A Step 4f fix commit loops back here.
Run `node .claude/scripts/shared/log-changed-files.js --issue $ISSUE`. Prints formatted `### Files Changed` section to stdout (empty if no commits match — caller skips append). Append stdout (when non-empty) to issue body via `gh pmu view --body-stdout` → edit → `gh pmu edit -F`.
**Bounded to this branch.** `log-changed-files.js` and `scope-drift-check.js` read only the issue's `Refs #N` commits since the branch's merge-base with the default branch, and need no `--since-commit` for that; pass one only to narrow further. A `Scope-Override:` comment older than that base belongs to an earlier run: ignored, and the report names it.
**State-drift gate:** After the body update, run `node .claude/scripts/shared/scope-drift-check.js --issue $ISSUE`. JSON envelope on stdout, human-readable report on stderr. Exit 1 = HALT.
**Two scopes, chosen by violation class:**
| Violation class | Compared against |
|---|---|
| `outside-declared-scope` | `Files to modify:` / `**Files:**` **unioned with** any `### Files Changed` section — including the one just appended (#2520 growth absorption) |
| `always-protected` | the **authored declaration alone** — `Files to modify:` / `**Files:**`. A `### Files Changed` section never satisfies this guard, whoever wrote it |
A protected path must be named in the body's declaration, not merely appear in the run's own Files Changed section. The report names the narrower scope whenever the two differ.
**One exemption, on a registrar run only:** `registrarExemption` in `.claude/metadata/scope-drift-protected-paths.json` suppresses the halt for the `framework-manifest.json` and `CHARTER.md` edits Step 4e's `register-helper.js` makes, only when **every** trigger pattern matches the touched set; exempted paths are still named and raise advisory violations, and an absent or malformed block exempts nothing. Step 4e runs first, so this is evaluated in the same forward pass.
| Exit | Mode | Behavior |
|------|------|----------|
| 0 | blocking (no violations) | Continue to Step 4f |
| 0 | advisory | Report warnings only; continue to Step 4f |
| 1 | blocking (violations) | **HALT.** Report violations + resolution options below. Do NOT proceed to Step 4f/5. |
**On HALT, three resolutions:**
1. Add the offending paths to the issue body's `Files to modify:` section (then re-run Step 4c). For an `always-protected` path this is the **only** body-side resolution — appending it to `### Files Changed` does not clear the halt.
2. `git revert` (or unstage) the out-of-scope change and re-run.
3. Add `Scope-Override: <reason>` to the most recent commit message OR an issue comment, then re-run. The override and reason are echoed in the next report.
Always-protected paths: authoritative list in `.claude/metadata/scope-drift-protected-paths.json` (`framework-config.json`, `framework-manifest.json`, `.claude/metadata/**`, `.gh-pmu.json`, `.gh-pmu.checksum`, `CHARTER.md`). The gate is additive — `log-changed-files.js` and the Files Changed update still happen regardless of its outcome.
#### Step 4f: Full-Suite Regression Sweep
After Step 4c, run the project's declared verification set before Step 5. Every command must pass. Failure blocks the `in_review` move — commit a fix (`Refs #$ISSUE`), re-run the sweep, and once it passes re-run Step 4c before Step 5. Under `--nonstop` on an epic or branch tracker **one** full sweep runs after the last sub-issue, with attribution on failure and the members a halt leaves unswept named: conditional file § Step 4f: Cadence under `--nonstop`. **Default mode is unchanged:** a per-sub-issue STOP keeps its per-sub-issue sweep.
**The commands come from the project, never from this rule — and this rule names no runner.** Resolve them **once** via `resolveSuites()` from `.claude/scripts/shared/lib/test-runner.js`, which turns `testing.suites[]`, the `verificationCommands` array, or the `testCommand` shorthand into one suite list and reports which form it came from; `sweepInvocations()` returns the set to run. `framework-config.js` `resolveVerificationCommands()` is a thin delegate returning `{commands, source}`:
| `source` | Meaning | Action |
|---|---|---|
| `verificationCommands` | An ordered array is declared | Run **every declared command**, in declaration order |
| `testCommand` | No array; a single command is declared | Run it |
| `none` | Neither is declared | Run nothing; report the gap (below) and continue |
| `unreadable` | `framework-config.json` exists but does not parse | **Block `in_review`.** The result carries `blocksReview: true` and the parse error; report it, fix the file, re-run. Never the `none` report |
**Run every run `sweepInvocations()` returns, even after one fails, and report each result separately.** One command passing must never **mask** another failing — do not collapse the set into a single verdict:
```
Verification sweep (4 suites declared, 3 commands run):
  PASS  <command 1>   (js-unit, ts-unit)
  PASS  <command 2>   (ts-typecheck)
  FAIL  <command 3>   (mobile-e2e)
  NOT SWEPT           (js-e2e)
```
Any command failing blocks Step 5.
**One run can stand for several suites:** suites with identical phases and `cwd` share one run carrying every id in `suiteIds` (`collapsed` names each merge) — name every id and each suite's `kind` on the run's line, and never re-run a merged command per suite.
**Report each phase's verdict verbatim from `classifyRunResult()`; never re-derive it.** Non-zero `prepare` → `prerequisite failed`, and that suite's `full` is **not run**; non-zero `full` → `tests failed`; exit 127 or `spawnError: 'ENOENT'` (`.claude/scripts/shared/lib/runner-probe.js`) → `runner not found` naming the runner. Block `in_review` whenever a verdict carries `blocksReview: true`. **`manual-only` suites are listed as declared-but-not-run**, and **`sweep: false` suites as declared-but-not-swept** — one `NOT SWEPT` line from the helper's `skipped` list, which also carries suites `sweepScope: "touched"` filtered out.
**A suite declaring `sweepSelect` is swept by selection.** Run `selectorInvocations()` first (`{files}` = every changed file) and pass each result (`exitCode`, `stdout`, `spawnError`) to `sweepInvocations()` as `selections`. Each run carries `selection`: `selected N of M`, or `full — <reason>` when it fell back — put it on the suite's line. No tests selected → the suite is in `selectedNone`: report `selected none`; it ran nothing and is never a pass, and its line in `notPassed` reads `NOT A PASS`. The framework supplies no selector.
**`testCommand` is the fallback** when `verificationCommands` is absent, empty or not an array; never read either key directly.
**When nothing is declared (`source: "none"`), report the gap and do not substitute one.** Emit:
```
No verificationCommands or testCommand is declared in
framework-config.json, so the verification sweep was NOT run. The
in_review move proceeds unverified — declare verificationCommands to
restore this gate.
```
Then continue to Step 5. The absence is reported, never silently skipped. Why the sweep degrades rather than halts, and why no runner is ever named: rationale file § Step 4f.
#### Step 4g: Independent Review
Before Step 5 (after Step 4f; under `--nonstop`, Step 4c) run `node .claude/scripts/shared/lib/merge-back-gate.js review-plan --issue $ISSUE` (plus `--nonstop`/`--no-review` if set) and act per conditional file § Step 4g — not loaded at Step 1d → `work-conditional-sections.js --section 4g`. A skip is reported, never a pass; a second `fail` halts before Step 5. `--concurrent` members use the Merge-Back Review Gate.
### Step 5: Move to in_review
```bash
gh pmu move $ISSUE --status in_review
```
If the only remaining unchecked ACs are intentionally-open gates — `- [ ] … → QA: #N`, `- [ ] … → GATE: review`, or `- [ ] … → GATE: release` — the plain move fails checkbox validation. Use `--force`, permitted by the Step 4b exceptions — valid **only** when *every* remaining unchecked AC carries one of those markers:
```bash
gh pmu move $ISSUE --status in_review --force
```
If even one unchecked AC lacks a marker, do **not** force: that is genuinely unfinished work, and Step 4b's prohibition applies in full.
**Closure differs by marker** — the `closure` field of `.claude/metadata/ac-gate-markers.json`. **Check a gate box when its named resolving event has occurred, not because the issue is closing** — a gate that never named one is reported at `/done`, never ticked on the way past.
### Step 6: STOP Boundary — Cleanup, Report, and Wait
Step 6 is a three-part sequence executed in order. Task-list cleanup is **part of** the STOP sequence, not a sibling step after the STOP directive — do not treat `**STOP.**` in part (3) as halting before parts (1) and (2) have run.
**(1) Prune the task list** (runs unconditionally — standard, epic, and branch tracker paths; all modes and issue types):
1. `TaskList` — enumerate all tasks.
2. **Report before deleting.** Only run-level step tasks (all of them on a standard run) and per-sub-issue parents: report each still `pending` or `in_progress` as `Not executed: <subject>` in part (2), including a parent left `in_progress` after its `in_review` move.
3. For every task owned by this `/work` invocation (subject prefix `Step Xa:`, `Step N...`, `AC: <criterion>`, `Sub-issue #N:`, or the Phase 1 preamble task), mark `status: deleted` via `TaskUpdate`.
4. Do **not** delete tasks created outside this invocation (e.g., the user's own TODOs).
**(2) Emit the report:**
```
Issue #$ISSUE: $TITLE — In Review
Say "done" or run /done #$ISSUE to close this issue.
```
**(2a) Peer Announcement — event 2 (advisory):** inside this sequence, after the report in part (2) and **before** the STOP directive in part (3) wherever one exists — not after it, where a STOP would mean it never runs.
```bash
node .claude/scripts/shared/announce.js --event work-completed --issue $ISSUE
```
Send and close out exactly as at event 1, **subject to the same `groups.work` gate** — reuse the state resolved at event 1, so one invocation cannot announce a start it never matches with a completion.
- **The commit set is derived by the script, never assembled here.** Read the envelope's account: `commitSource` (`derived`, `supplied`, `unavailable` — the announcement still goes, saying nothing landed — or `not-applicable`), `announcement.verified`, and `announcement.unresolvedCommits`. Relay `warnings` verbatim.
- **Fires per sub-issue.** Under `--nonstop`, event 2 fires as **each sub-issue** reaches `in_review`, right after its `Sub-issue #N: $TITLE → In Review (M/T processed)` report — **not** once at the end of the run. A workflow moment, not a position relative to the STOP.
- **`issues: [$ISSUE]` is singular by design.** Do not "correct" it to the processed set — that silently converts event 2 to the end-of-run cadence.
- **The empty payload stays truthful.** Zero `Refs #$ISSUE` commits still emits, worded so nothing is implied to have landed.
- **A throwing helper must not abort this sequence.** Parts (1), (2) and (3) run regardless; the announcement is advisory.
**(3) STOP.** Wait for "done". Do NOT close.
**Review-lifecycle events are defined in `09-review-execution.md` alone;** `/work` fires none, and a guard test fails if an event name appears in more than one rule source.
**CRITICAL — Autonomous Epic/Branch processing:** For `context.type == "epic"`/`"branch"`, process sub-issues in `context.processingOrder` — the `**Depends on:**` topological sort, the tracker body's **Processing Order:** (else ascending) breaking ties. Skip sub-issues already in `in_review` or `done`, and **`qa-required` sub-issues** — `context.skipped` carries them with `reason: 'qa-required'`; report each as `Sub-issue #N is qa-required → run /qa #N` at its turn, count them in the final summary, and never redirect mid-loop. Under `--nonstop`, Step 2c may have written an accepted order into that **Processing Order:** section; the order processed is whatever `parseProcessingOrder` reads.
**Default mode** (per GitHub Workflow §4): one sub-issue per invocation — `in_progress` → Steps 3–4 → `in_review` → **STOP**. The next is a fresh `/work #<tracker>`, never continued in-session; `/done` on an epic sub-issue names it (`Next: /work #<epic>`). The `in_progress` transition is **executed by the Step 3 Pre-Work Status Gate** as each sub-issue's turn begins — this line describes the lifecycle, it does not implement it.
**`--nonstop`, `--concurrent` and `--nonstop --concurrent`:** bodies in the conditional file § Step 6: `--nonstop` and `--concurrent` Processing — no STOP between sub-issues under `--nonstop`, halt immediately on any test/AC/QA/`gh pmu` failure or a `findings-pending` verdict, resume from the `in_progress` sub-issue parent, else the first member of `context.resumeOrder` (never `gh pmu sub list` alone), the unswept marker, the group and rolling schedules and a resumed `--concurrent` run. `--agents` without `--concurrent` is reported as ignored.
#### Step 6a: Post-Nonstop Audit
Body: conditional file § Step 6a, loaded at Step 1d when `--nonstop`.
**After all sub-issues reach `in_review`/`done`:**
- **Epic:** Evaluate epic acceptance criteria via Step 4, move to `in_review`, **STOP** — wait for "done".
- **Branch tracker:** Report and STOP. Do **NOT** suggest "done" or `/done`:
```
All sub-issues on branch {branch-name} are in review or done.
  Sub-issues processed: N
  Sub-issues skipped: M
Next: /merge-branch or /prepare-release
```
**Default mode:** Never skip per-sub-issue STOP boundary. **Continuous mode:** sub-issues moved only to `in_review`, not `done` — user runs `/done` after review.
**End of /work Execution Rule**
