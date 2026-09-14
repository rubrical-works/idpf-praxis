---
version: "v0.103.0"
allowed-tools: Bash, Read, AskUserQuestion, Skill, SendMessage
description: Verify one qa-required issue through a bounded set of outcomes and offer to close it with recorded evidence (project)
argument-hint: "#issue [--assign]"
copyright: "Rubrical Works (c) 2026"
---

<!-- MANAGED -->
# /qa
**Not `--with qa`.** `review #42 --with qa` loads `Domains/QA-Automation/review-criteria.md` as extra review criteria; `/qa #42` verifies one `qa-required` issue and offers to close it. Same two letters, different command.
A `qa-required` issue is a **gate**, not a story (`02-github-workflow.md` § Closure contract): its parent carries `- [ ] … → QA: #N` and cannot reach `done` until this issue closes and that box is checked. It needs *verification*, not review. `/qa` sweeps for prior art first, so an overtaken check is retired rather than worked; then verifies through three outcomes in preference order, requires the full declared verification set green before offering closure, and on acceptance closes the issue with evidence recorded and ticks the parent's line. Every non-passing outcome STOPs and closes nothing. Design record: #2818.
---
## Prerequisites
- `gh pmu` extension installed
- `.gh-pmu.json` configured, with the `qa_required` status alias (#2821)
- Issue carries the `qa-required` label
---
## Arguments
| Argument | Required | Description |
|----------|----------|-------------|
| `#issue` | Yes | The `qa-required` issue to verify (`#42` or `42`). One per invocation |
| `--assign` | No | Direct invocation only: assign to the current branch first, no prompt. Never arrives via the `/work` redirect — see § Branch assignment |
---
## Execution Instructions
**Task creation.** No routing decision: create every step task upfront, **in one message as parallel tool calls** (`07-task-creation-timing.md` § Emission). Track `in_progress` → `completed`; never mark complete what was not executed. Prune this invocation's tasks at the Step 6 STOP.
**How `/qa` is reached.** Directly, or via `/work #N` on a `qa-required` issue: `work-preamble.js` sets `context.redirect` to `/qa` and `/work` hands off before either Step 3 gate runs (#2824). Under an epic or branch-tracker run `/work` skips `qa-required` sub-issues with a pointer here — a mid-loop `Skill` transfer never returns to the loop.
### Gate decisions
The redirect hands both rule `08` Step 3 gates to this command:
- **Pre-Work Status Gate applies; `/qa` owns the `in_progress` move.** Before any verification: `gh pmu view $ISSUE --json=status --jq='.status'`. Accept `qa_required` or `backlog` as origin (creation status since #2821, and where pre-existing issues sit) → `gh pmu move $ISSUE --status in_progress`. Already `in_progress` is fine. Closed or `done` → nothing to verify, STOP.
- **Review-State Gate does not fire.** `never-reviewed` is a QA issue's normal and permanent state — `qa-extract.js` creates it, nothing reviews it. A check to run rather than a deliverable to review: `review-state.js` is not called, no review offered.
### Branch assignment
The verification needs a place and a time. Delegate to `.claude/scripts/shared/assign-branch.js` throughout — never `gh pmu move --branch` by hand.
| Situation | Behaviour |
|---|---|
| Already assigned | **Leave it.** Report the assignment; an issue on another branch is not moved. Common case since #2821, including every `/work` redirect arrival |
| `--assign` (direct invocation) | `node .claude/scripts/shared/assign-branch.js "$ISSUE"` — current branch, report. No prompt; the flag is the answer, as on `/work` |
| Unassigned, no `--assign` | **`AskUserQuestion`** over open branch trackers, current branch recommended, then `node .claude/scripts/shared/assign-branch.js "<branch>" "$ISSUE"`. The chosen branch records where the check ran |
| No open branch tracker | Report the verification as **unattributed**, continue. **Never create a branch from `/qa`** — `/assign-branch` owns `gh pmu branch start` |
**`/work --assign` is consumed by the preamble, never forwarded.** The preamble assigns before detecting the redirect, so the *Already assigned* row fires; forwarding would re-run `assign-branch.js` as a no-op that asserts nothing. `/qa`'s own `--assign` is for direct invocation only.
---
## Workflow
### Step 0: Setup
1. `gh pmu view $ISSUE --json=number,title,labels,status,body`. No `qa-required` label → report that `/qa` verifies QA gates only (stories and bugs are `/work #N`), STOP. `gh pmu` error → report, STOP.
2. **Identify the parent** from the body's `Parent: #N — <title>` line (`qa-config.json` `bodyTemplate`). Record `$PARENT`; none → record `none` (Step 3a reports it by name).
3. Apply § Branch assignment.
4. Apply § Gate decisions — the Pre-Work Status Gate move.
5. Start the run's touched-path set empty; every path this invocation creates, deletes or modifies is appended. § Commit-before-close reads it.
### Step 1: OBE sweep — before any outcome is chosen
A QA issue can be old enough that what it verifies no longer exists (the oldest live ones verify CodeQL alerts as filed). Working it through the outcomes closes a gate on a check that no longer describes the code, so `/qa` sweeps for prior art **first**, reusing the #2514 procedure: surfaces, excludes, term derivation, dispositions and body formats come from `.claude/metadata/prior-art-sweep.json`, re-read from disk, **not restated** here.
**Always-on; only `reviewSweep: off` suppresses.** Decide via `decideFlagSweep({reviewSweep})` from `.claude/scripts/shared/lib/prior-art-marker.js`, `reviewSweep` from `ensureReviewSweep(process.cwd()).mode` (`framework-config.js`), as `/review-issue` Step 2a-iv does:
```bash
node -e "console.log(JSON.stringify(require('./.claude/scripts/shared/lib/prior-art-marker.js').decideFlagSweep({reviewSweep:REVIEW_SWEEP})))"
```
Returns `{sweep, refused, mode, message}`. `full`, `recommend`, `flag-only` all **sweep** — OBE detection is the point, not an optional extra, so the review commands' `recommend` default does not apply. `off` → no sweep, no write; report `message` **verbatim**, run **continues** to Step 2. Never halt on a refusal the user chose.
**Why `decideFlagSweep`, not `decideSweep`:** `decideSweep`'s `isExemptFromSweep(createdAt)` cutoff exempts issues predating the feature — precisely the OBE candidates — so there is **no `createdAt` cutoff** here; its `pass` on an existing marker would skip an issue whose earlier sweep is itself stale, so **an existing marker forces a re-sweep**. The flag path has neither short-circuit (#2725).
**Terms derive from the parent, not the QA body alone.** A QA body is thin. Term source: the parent's title, its `### Files Changed` section and the QA `### Steps to Perform` together; the config's `termDerivation.targetFiles` guidance says why file paths outrank vocabulary.
**Write the result** into the QA body under `**Prior Art:**` via `insertPriorArtSection` from the same helper (`.tmp-$ISSUE.md` flow), so `classifyMarker` recognises it and a later run sees a sweep was done — never treating the marker as a reason not to sweep again.
**Verdicts:**
| Verdict | Action |
|---|---|
| `obsolete` | **Offer** to close as `not_planned` via `AskUserQuestion` (close recommended, "leave open" alternative). On acceptance: `gh issue comment $ISSUE -F .tmp-qa-close-$ISSUE.md` recording the signals, `gh issue close $ISSUE --reason "not planned"`, `gh pmu move $ISSUE --status done`; then rewrite the parent line via `.tmp-$PARENT.md` to `- [x] ~~<acText>~~ → QA: #N (obsolete: <one-line reason>)`, **preserving `→ QA: #N` verbatim** so `ac-gate-markers.json` `qa.pattern` still matches. Box closed so the gate releases — open recreates the `--force` Step 4b forbids — text struck so a released gate is not read as verified. **A decline leaves both issues untouched.** Either way STOP: no outcome for an obsolete check |
| `already-shipped` | Reads as **already verified**: evidence the check was performed exists. Step 4 with that evidence; close as completed through the normal Step 5 terminal state, **citing the evidence found** |
| `found-but-warranted`, `none-found` | Record the section, continue to Step 2 |
### Step 2: Prior evidence
A QA issue that reached outcome 3 earlier may already carry the answer. **Read the evidence comment first:** `gh issue view $ISSUE --comments --json comments --jq '.comments[].body'`, latest comment whose first line is `**QA Evidence:**`.
| Found | Action |
|---|---|
| `PASS` | Skip Step 3. Body still carries `**Fixtures created:**` → raise the **teardown gate** now (outcome 3 § Declared board fixtures, gate 2) — evidence recorded, fixtures served. Then Step 4 with the comment URL as evidence |
| `FAIL` | Report the recorded failure verbatim, **STOP** — a real finding for the parent, not a formality. Recorded fixtures are **left standing — the reproduction**; the teardown gate is never raised on a `FAIL` |
| absent | Step 3; if outcome 3 is reached, the report is emitted again |
The human still performs the check; this step removes the bookkeeping, not the check.
### Step 3: Outcome selection
Three outcomes, **in preference order**; take the first that applies.
#### Step 3a: Candidate derivation (bounds outcome 1)
Nothing in the framework matches a described behaviour to a test; pairing is a skill, so the candidate set is **derived, not guessed**:
1. **Parent** — `$PARENT`.
2. **Sources** — the parent's `### Files Changed` section (`log-changed-files.js`, `/work` Step 4c — present by construction for an issue Step 4a filed).
3. **Candidates** — `node .claude/skills/tdd-refactor-coverage-audit/scripts/test-coverage-audit.js --since-commit <parent-start-sha>` (SHA preceding the parent's first `Refs #$PARENT` commit). The returned pairing is the candidate set — bundled conventions plus any `framework-config.json` `testCoverageAudit` override. **The pairing is never re-derived in prose.**
4. **Search only the returned set.** No candidate covers the described steps → outcome 2. Not "search wider".
**Degradation names its cause.** Missing parent (`none`), no `### Files Changed` section, or `tdd-refactor-coverage-audit` skill absent (`.claude/skills/tdd-refactor-coverage-audit/` not present — skills are copied per project) → report **which**, **by name**, fall to outcome 2. Do **not** substitute an unbounded search.
#### Outcome 1: Existing coverage
A candidate test already exercises `### Steps to Perform`. Run it, scoped, and report the result as evidence.
- **Green** → Step 4.
- **Fail** → report verbatim, **STOP**. A failing test is a **real finding** about the parent's change; nothing closed, nothing moved.
**The candidate set is class-aware: a `flow` match counts, found by annotation (#2865).** Step 3a's skill classifies each candidate `module`, `flow` or `contract`; outcome 1 takes the first two:
- **`module`** — stem-paired, as before. Unchanged.
- **`flow`** — a spec whose leading-block `@covers` names **the parent issue or one of its ACs**. Filename is irrelevant: that class pairs by annotation, so a stem-shaped search never finds it.
**Additive — a module match is still a match.** Narrowing to flow breaks every stem-paired QA issue.
**Missing a flow match yields the wrong OUTCOME, not a missed match.** Outcome 1 falls to outcome 2, which offers to **author** a test that exists; the duplicate is a stem-named module test pairing against a source the flow spec already covers — the command meant to find coverage duplicating it.
**The match is justified, not asserted:** evidence names the test file, the **assertion within** it, and *why* it covers `### Steps to Perform`. A named test with no stated correspondence is the wrong-test failure wearing a citation. **Unchanged for a `flow` match, and matters more there:** a flow spec is named for a journey, so its name reads as relevant to almost anything.
#### Outcome 2: No coverage, automatable
Name what a test would assert, **resolve where it goes**, then **offer** to author it (`06-runtime-triggers.md`, *offer, don't force*) via `AskUserQuestion`.
**Placement is resolved, never chosen (#2860).** Outcome 2 is reached exactly when Step 3a returned no covering candidate; it resolves against **the same authority**, never judgment. A test placed by judgment is born unpaired: the audit reports the source uncovered and the test an orphan — both true, neither actionable.
1. **Conventions** — `.claude/skills/tdd-refactor-coverage-audit/resources/test-coverage-conventions.json` merged with `framework-config.json` `testCoverageAudit` via the skill's `mergeConfig`: the single pairing authority, the one `/add-story` Phase 4 Step 3a names. **Do not declare a second convention source** — a second rule set drifts from the reader silently, invisible until two commands disagree about where a test belongs.
2. **Language** — `detectLanguage` over the implicated source from Step 3a's `### Files Changed` set.
3. **Candidate path** — `expandTestPatterns` for that language, `{dir}`/`{stem}` from the source path. **Never re-derive the substitution in prose.**
4. **Class** — `classifyTestFile` says whether the location is `module` or `flow`.
**A flow check resolves to the declared e2e suite, not a module stem.** A check is a **flow** when it crosses modules, or the parent's `### Files Changed` names **more than one source with no single owner**:
- Location from `framework-config.json` `testing.suites[]` — the entry whose `role` is `e2e` — at its `match[]` globs. The project declares the layout; this spec names no directory.
- Propose a **flow-named** spec — named for the journey, not a source stem — carrying the `@covers` annotation below.
- **A stem-named module test is never the answer for a flow.** It pairs against a source it does not exercise, so the audit reports that source covered and the real gap disappears — worse than the orphan it avoids, since nothing is left to report.
**No path resolves → name which condition failed, then ask.** Three conditions, each **by name**, never one "could not resolve" line — they have three different remedies:
| Condition | Meaning |
|---|---|
| the **language is absent from the conventions** | the merged authority has no entry; remedy is an `additionalLanguages` entry, not a guessed path |
| **no source could be inferred** | the parent carries no `### Files Changed`, or nothing in it owns the described steps |
| **no e2e suite** is declared for a flow | `testing.suites[]` has no `role: e2e` entry, so the location is undeclared — remedy is harness selection, not a directory invented here |
Ask where the test should live via `AskUserQuestion`. **It never places silently** — an unexplained path is indistinguishable from a resolved one until the audit disagrees.
**The path is shown in the offer, before authoring** — the **resolved path**, or on the unresolved branch the **user-supplied** path from the answer — so placement is confirmed with the authoring decision.
**An absent input is named by path; if two are absent the report names both (#2861).** Two inputs can be missing **independently** and degrade identically — placement asked, not resolved — so each is named: an unexplained question is indistinguishable from never resolving, and a **degraded** run reads as normal.
| Absent | Consequence | Report |
|---|---|---|
| `.claude/skills/tdd-refactor-coverage-audit/` | no conventions, no primitives, no candidate path. Skills are **copied** per project, so one that never imported it has neither | name the directory, fall to asking placement — the named-cause degradation Step 3a applies to outcome 1 |
| `.claude/rules/08-work-execution.md` | the accept path delegates its pipeline to rule `08` **by reference**; absent from context it resolves to nothing and the TDD cycle, gates and sweep go unrun | name the rule file; say the pipeline cannot be followed by reference |
**When both are absent, name both — never one:** naming one sends the reader to fix half a problem and report success; the unnamed half fails silently. **Ask placement either way; never guess a path** — that reinstates the defect above where it is least likely to be noticed.
**Rule `08` goes missing without being deleted.** A junctioned `.claude/rules` (#2736, until `px-manager#1146`) resolves for `cat`/`ls` but is invisible to auto-discovery: present and readable, never in context — naming only the file sends a reader hunting something that is not missing.
- **Decline** → report the gap and where it would have gone, **STOP**, mutating nothing.
- **Accept** → the story pipeline, **by reference**:
> Run **Steps 3, 3b, 4c, 4d, 4e and 4f** of `08-work-execution.md` unchanged — TDD cycle with commit-per-deliverable, documentation judgment, `### Files Changed` append with scope-drift gate, minimization and registration where they fire, full verification sweep — then return here. **Step 4 and Step 4a are excluded**: a QA issue has no AC section, so Step 4 would pass **vacuously** and 4a would run `qa-extract.js` over a QA issue. Step 4 of this issue is the closure condition below.
**Why not `Skill("work", …)`:** rule `08` is auto-loaded, so the pointer costs nothing; re-invoking `/work` needs a `--no-redirect` flag it does not parse, and adding one recreates the **routing loop**. Rejected; not re-proposed.
**Nothing is skipped because the deliverable is "only a test."** RED first — a test green on first run has proven nothing — then GREEN, REFACTOR, commit-per-deliverable, `### Files Changed` append and scope-drift gate, full Step 4f sweep. Every touched path joins the run's set.
**Commit contract for the authored test** — provenance in two places:
- **Commit message** — `Refs #N — <what the test verifies>`, **before the closing report**, so a QA issue never closes citing a test that exists only in the working tree.
- **In-file comment** naming the QA issue it discharges and the **parent AC**. Without it the test has **no stated reason to exist** and the next coverage audit deletes it as **redundant** — silently re-opening the manual check, with the QA issue long closed.
**A flow spec carries that provenance as an ANNOTATION, in its leading comment block (#2864).** A **flow spec** sits in a `classes.flow` location; write the comment above as the reader's own tags, per the `flowAnnotation` grammar in the imported `test-coverage-conventions.json`:
- `@covers #<qa-issue>` and `@covers <parent AC reference>` — **repeatable**, so neither displaces the other.
- `@flow <name>` where the journey has a stable name.
**Position is the requirement, not decoration.** The reader parses the **leading comment block only** — a tag below it is prose, so a tag inside a test-case string cannot silently pair a spec. A comment placed lower satisfies the clause above and still leaves the spec **`flow.undeclared`**: an orphan at the next audit.
**Reference the grammar; never restate the tags here.** They arrive by `/fw-import-skills`; a second definition drifts at the next import, invisibly, until a spec stops pairing.
**A module test is unaffected by `@covers`** — the classifier reads flow tags only in a flow location, so a `@covers` tag on one declares nothing; module tests keep the plain in-file comment.
**A contract test carries `@subject` instead (#2904).** When the authored test's subject is a non-code artifact — a contract test as `{frameworkPath}/Reference/Contract-Test-Classification.md` defines one — declare each subject with `@subject` in its leading comment block, beside the provenance comment. That document owns classification, placement and grammar; **do not decide the class by judgment here** or restate its rule. Undeclared, the next audit counts it a module orphan.
#### Outcome 3: Manual-only
Verifiable only by a person (deployed hub, real remote, second OS, re-scan, visual check). **STOP with a structured report and leave a closure path.** Do not move the issue, check a box, or touch the parent's gate line. The report names:
1. **The steps requiring a person**, and why automation does not reach them.
2. **The environment** needed.
3. **The evidence that would close the issue**.
4. **A ready-to-paste comment template**, written to `.tmp-qa-evidence-$ISSUE.md` (remove after showing):
```
**QA Evidence:**
- Date: YYYY-MM-DD
- Environment: <where the check was performed>
- Steps performed: <what was done, in order>
- Observed result: <what happened>
- Verdict: PASS | FAIL
```
```bash
gh issue comment $ISSUE -F .tmp-qa-evidence-$ISSUE.md
```
A later `/qa #N` finds it at Step 2 — `PASS` offers to close via Step 5 naming the comment, `FAIL` reports and STOPs, absent re-emits this report.
##### Recording the verdict on a re-invocation (#2835)
The template above serves the hand-off path. On a **direct** `/qa #N` re-invocation the check has already been performed, so the paste is clerical. After the structured report raise **one** `AskUserQuestion` — *Record PASS*, *Record FAIL*, *Not yet performed*; **the default when nothing is chosen is *Not yet performed***, leaving the run untouched.
**The observation is collected as free text, in the user's own words.** The verdict is two tokens and may be an option; *Observed result* and *Steps performed* are not — ask conversationally and record what comes back. A session-composed option describing what happened ("the prompt fired as expected") reintroduces the self-report the boundary below forbids, the person reduced to confirming this session's account of itself.
**Compose the comment from the template above, verbatim** — the same `**QA Evidence:**` block — so Step 2's reader matches it unchanged. Write to `.tmp-qa-evidence-$ISSUE.md`, post, then `rm`:
```bash
gh issue comment $ISSUE -F .tmp-qa-evidence-$ISSUE.md
```
**Then continue on Step 2's terms, in this same invocation:**
| Recorded | Action |
|---|---|
| `PASS` | Proceed to **Step 4**, citing the comment just posted as evidence. No second `/qa` run needed |
| `FAIL` | Report the failure and **STOP**. Fixtures are left standing — they are the reproduction — and the teardown gate is not raised |
| *Not yet performed* | Nothing written or moved; a later run reaches Step 2 |
**The comment is posted before either branch reports, `FAIL` included.** Step 2 reads a comment that must already exist, so a `FAIL` that STOPs without writing one loses the failure and re-emits this report next run as though nothing ran.
**Suppressed in two places, for two different reasons — not one rule twice.**
- **The fixtures hand-off path** below: `Skill("work", …)` never returns, so no `/qa` invocation is alive when the observation happens. Nothing can ask or post; the evidence crosses a session boundary, which the pasted comment carries.
- **`--nonstop`**: the offer is a question and an unattended run has nobody to answer it — as the two fixture consent gates.
##### Declared board fixtures (#2827)
A QA body carrying `### Fixtures` lets `/qa` create the board state itself instead of describing it. Grammar (`.claude/metadata/qa-fixtures-schema.json`): `- <type>: "<title>" [label:<name>] [reviewed]`; one root with two-space-indented children (a **tree**) or siblings with no root (a **selection**, the #2756 shape). Mechanics: `.claude/scripts/shared/qa-fixtures.js` (`--provision`, `--teardown`, `--status`; suite `tests/scripts/shared/qa-fixtures.test.js`). The two consent gates are this section's; the helper asks nothing.
**Absent `### Fixtures` → outcome 3 reports exactly as today, no offer.** Absence means the check needs a hub, a second OS or a re-scan, not board state; `/qa` does not guess. **Never under `--nonstop`:** both gates are questions.
**Gate 1 — provision.** First `node .claude/scripts/shared/qa-fixtures.js --issue $ISSUE --status`; `recorded: true` → fixtures exist, report them, offer only the hand-off. Otherwise parse the declaration (`INVALID_FIXTURES` names the offending line — report it, fall back to the plain report) and raise **one** `AskUserQuestion` listing **every issue to be created — title, labels, branch, parent** — the count, and that they land on the live board. Options: *Provision fixtures and hand off to /work* (recommended), *Provision only*, *Do not create anything* — **the default when nothing is chosen**. **Peer check:** `node .claude/scripts/shared/peers-check.js` first; a live session in `data.peers` is named in the question and a **second confirmation** is required before anything is created. On either provisioning option: `node .claude/scripts/shared/qa-fixtures.js --issue $ISSUE --provision`; report `data.numbers`, `data.root`, `data.labelledDirectly`, `data.line` (`PROVISION_FAILED` still names what was created **and recorded**); then announce `fixtures-provisioned` — `buildAnnouncement({event: EVENTS.FIXTURES_PROVISIONED, issues: [$ISSUE], fixtures: data, peers})` from `.claude/scripts/shared/peer-announce.js`, `SendMessage` per `recipients` entry, gated by `groups.work` from `cross-session-config.js`; advisory, dispatch is not delivery (#2674).
**Hand-off.** On *Provision fixtures and hand off to /work*: write the evidence template to `.tmp-qa-evidence-$ISSUE.md`, show it, then `Skill("work", "<root>")` for a tree or `Skill("work", "<a> <b> <c>")` — the **selection** form — with no root. The transfer never returns, so say **before** it what to watch for and how to come back: post the evidence comment, run `/qa $ISSUE` again → Step 2 with a `PASS`. **This does not re-propose the rejection under outcome 2 (*Why a pointer and not `Skill("work", …)`*):** that concerns re-invoking `/work` on the QA issue itself — `qa-required`, redirected straight back here, the routing loop. The scratch epic carries no `qa-required` label: no redirect, no loop — the same one-way transfer `/work` makes into `/qa` (#2824).
**The observation and the verdict stay human — a boundary, not a gap.** With chain, placement and fixtures in code, what remains is a session reporting on its own behaviour in a live `/work` run — a self-report, the evidence-free closure #2754 produced. The person watches the prompt fire and writes the `PASS`.
**Gate 2 — teardown.** Raised at Step 2 on a found `PASS` while the body still carries `**Fixtures created:**`, and again at Step 5 on an accepted close if the line remains. **Never on a `FAIL`** — the fixtures are the reproduction. `AskUserQuestion` listing **every issue to be deleted, by number and title** (from `--status`); options *Delete the fixtures* (recommended), *Keep them*. Accept → `node .claude/scripts/shared/qa-fixtures.js --issue $ISSUE --teardown`; report `data.deleted`, and on `TEARDOWN_FAILED` `data.remaining` by number — the line is rewritten to the remainder so a retry deletes exactly the rest. Decline → fixtures and line stay, reported.
### Commit-before-close
**Every file `/qa` creates, deletes or modifies is committed before the close offer.** Vacuous for outcome 1; outcome 2's test, fixtures, helpers and Stage 1/2 outputs are all committed before Step 5.
**The commit discipline is rule `08`'s, not a new one** — outcome 2 inherits **commit-per-deliverable** and the **mid-AC commit checkpoint** (`.claude/metadata/commit-checkpoint-signals.json`, re-read at use). This adds a terminating condition: whatever those gates left uncommitted is committed before `/qa` reports.
**Scoped to this run's paths, never a clean tree.** `git status --porcelain` scoped to this run's paths (the touched-path set) — never a clean-tree assertion. Sessions share a working directory (`03-startup.md` § Peers), so a peer's in-flight edits are present and none of this command's business; a clean-tree assertion fails on them and tempts a session into committing them.
**Push is not part of this.** `/qa` commits; `/done` pushes.
### Step 4: Closure condition
Close only when the **full declared verification set** is green, in addition to the target test or evidence. Resolve once via `resolveVerificationCommands()` (`.claude/scripts/shared/lib/framework-config.js`) — `verificationCommands`, falling back to `testCommand` — as `/work` **Step 4f** does; run **every** command, report each separately so one passing never masks another failing.
- **Any red STOPs and closes nothing** — including a **pre-existing failure** the session did not cause, reported not waved past. Closing on the target test alone lets a QA gate release inside a red repository, the state a QA check exists to catch.
- **`source: "none"`** → report the gap as Step 4f does, **STOP**. An undeclared suite is not evidence.
**All outcomes converge here.** Outcome 1 writes no files, outcome 3 closes on a human's `PASS`, outcome 2 arrives after its own sweep; none closes on a red suite, because all-green is a **property of closing a QA gate**, not of having written code.
### Step 5: Terminal state — offer to close
An all-green run reports the evidence and **offers to close**: **Verified by** (command invoked, or QA Evidence comment URL), **Covers** (why it answers the steps), **Sweep** (N commands, each reported). Then `AskUserQuestion`: close `$ISSUE` and release the parent gate on `$PARENT` (recommended), or leave open. It does not close automatically and does not move the issue to `in_review`:
- **Not `in_review`.** That status lets a human review a deliverable; a QA issue produces none — a passing test *is* the review. Parking it there asks for the manual re-verification this command removes.
- **Not an automatic close.** Rule `02-github-workflow.md`: *"Issues close ONLY when user says "Done""*. An automatic close needs a **carve-out** to a critical rule every deployed project reads, on prose alone — **nothing enforces** the green condition at runtime. Offering costs one keystroke and leaves rule `02` unchanged.
**Accepted cost: the unattended case.** `/qa` **always halts** here. *Auto-close under `--nonstop` only* was **rejected**: it still needs the rule `02` carve-out, and closing differently by run shape is harder to state and easier to misread.
**On acceptance**, in order:
1. **Close with evidence recorded** — `.tmp-qa-close-$ISSUE.md` naming the **command invoked**, test identifier or **evidence-comment URL**, correspondence, sweep result → `gh issue comment $ISSUE -F .tmp-qa-close-$ISSUE.md && gh issue close $ISSUE`; `rm`; `gh pmu move $ISSUE --status done`.
2. **Raise the teardown gate** (outcome 3 § Declared board fixtures, gate 2) if the body still carries `**Fixtures created:**` — a Step 2 decline, or a close via outcome 1 or 2 with fixtures left from an earlier run, lands here. Never automatic; never on a `FAIL`, which does not reach this step.
3. **Tick the parent's `- [ ] … → QA: #N` line** via the `.tmp-$PARENT.md` flow: `gh pmu view $PARENT --body-stdout > .tmp-$PARENT.md` → flip the **one** line matching `→ QA: #$ISSUE` from `- [ ]` to `- [x]`, **matching on the marker**, never AC text → `gh pmu edit $PARENT -F .tmp-$PARENT.md && rm .tmp-$PARENT.md`. Closing the sub-issue is not sufficient: `qa-config.json` `closurePath` and `ac-gate-markers.json` `qa.closure` require the box checked, and a plain `gh pmu move` fails checkbox validation on it. The marker's **meaning is unchanged** — only the actor is named. `none` parent → report no gate line released.
**A declined offer closes nothing**; nor does any non-passing outcome (failing candidate, red sweep, declined authoring, manual-only without `PASS`, nothing declared). Each STOPs with the issue as found.
### Step 6: STOP boundary — cleanup, report
1. **Prune** every task this invocation created (`TaskList` → `TaskUpdate status=deleted`); leave others.
2. Report: `QA #$ISSUE closed — parent gate on #$PARENT released.` or `QA #$ISSUE left open — <outcome and what closes it>.`
3. **STOP.**
---
## Error Handling
| Situation | Response |
|-----------|----------|
| Issue not found, or `gh pmu` fails | Report error → STOP |
| Issue lacks `qa-required` | `/qa` verifies QA gates only → STOP |
| Issue closed or `done` | Nothing to verify → STOP |
| Parent line absent | Continue; Step 3a reports it, outcome 1 unavailable |
| `tdd-refactor-coverage-audit` absent | Reported by name at Step 3a; outcome 2 |
| Candidate test fails | Real finding → STOP, nothing closed |
| Any verification command red | STOP, nothing closed — pre-existing failures included |
| `source: "none"` | Report the undeclared set → STOP |
| Close offer declined | Issue left as found → STOP |
| `### Fixtures` invalid (`INVALID_FIXTURES`) | Report the offending line; outcome 3 reports without an offer |
| `PROVISION_FAILED` | Report what was created and recorded; no hand-off; the teardown gate can remove exactly that later |
| `TEARDOWN_FAILED` | Report deleted and remaining by number; the record is rewritten to the remainder |
| Provision or teardown gate declined | Nothing created or deleted; say so → continue or STOP as the surrounding step does |
---
**End of /qa Command**
