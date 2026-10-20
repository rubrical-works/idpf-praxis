# Review Execution Rule
**Version:** v0.109.0
**Source:** Reference/review-execution.md
Auto-loaded execution rule for `/review-issue` and `/resolve-review` — the hybrid shell + rule architecture from #2329/#2368 applied to the review pair. Shells carry arguments, prerequisites and error handling; this carries the Workflow for both.
**Both commands are MANAGED with zero `USER-EXTENSION` blocks.** The three retired points live on in `extension-points.json` `deprecatedExtensionPoints`, beside `/work`'s four from #2368.
**Resident core, conditional bodies, on-demand rationale.** Every directive is here. Bodies that fire only on an epic, a sweep or a test-plan/PRD review (2a-iii, the 2a-iv sweep, 2a-v, `/resolve-review` epic expansion) live in `{frameworkPath}/Reference/review-execution-conditional.md`, read at Step 1d when a trigger is present; their headings below are stubs. Reasoning lives in `Reference/review-execution-rationale.md` (rule 03 On-Demand table; never auto-loaded).
---
## `/review-issue` — Workflow
Multi-issue: process each sequentially through Steps 1–3.
**An epic is a multi-issue set.** Step 1's preamble returning `context.type === "epic"` for an issue typed on the command line expands it: the set is every child in `gh pmu sub list $EPIC --json` (`children[]`, ascending), then the epic, each through Steps 1–3 exactly as a directly-typed `/review-issue <child>` — own preamble, type criteria, 2a-ii body write, finalize, 3b verdict. 2a-iii carries the contract.

### Step 1: Setup (Preamble Script)
```bash
node ./.claude/scripts/shared/review-preamble.js $ISSUE [--with extensions] [--without extensions] [--mode mode] [--force] [--prior-art]
```

**`--prior-art` is accepted here but consumed at 2a-iv, not by the preamble.** The preamble records it and makes no sweep decision; `decideFlagSweep` owns that. Any flag-shaped token the loop does not recognize is collected into `unrecognizedFlags` and reported rather than being fatal, per `02-github-workflow.md`'s pass-through convention.
Parse JSON. Branches:
- `ok: false` → report `errors[0].message` → **STOP** (skip to next in batch)
- `context.redirect` set → invoke skill **dynamically** using `context.redirect` (strip leading `/`) — all three rows below are equally normative:

  Labels `proposal`/`prd`/`test-plan` → `Skill("review-proposal"|"review-prd"|"review-test-plan", args: "#$ISSUE [--with ...] [--mode ...] [--force] [--prior-art]")`, name derived from `context.redirect`. → **STOP**. **`--prior-art` must survive the redirect:** `/review-proposal` carries its own 2a-iv; `/review-prd` and `/review-test-plan` report it inapplicable rather than swallowing it.
- `context.issue.state === "closed"` → ask user to confirm before proceeding
- `earlyExit: true` (has `reviewed` label, no `--force`) → report review count → **STOP**

Extract: `context` (type, reviewNumber, title, labels, body), `criteria` (common from `.claude/metadata/review-mode-criteria.json`, typeSpecific from `.claude/metadata/review-criteria.json`), `extensions`, `warnings`.

Extension loading handled by preamble via `.claude/metadata/review-extensions.json`. Unknown IDs warn; missing/malformed → standard review only.

**Step 1d: Load Conditional Sections.** Trigger: `context.type === "epic"` for a typed issue; or `--prior-art` passed; or a `test-plan`/`prd` label. Read `{frameworkPath}/Reference/review-execution-conditional.md` and hold it for the run (bodies of 2a-iii, the 2a-iv sweep, 2a-v). After the preamble confirms the path, before 1c; a sweep due only at 2a-iv (status `fail`) reads it there. No trigger → one-line skip note. Own task entry.

**Step 1c: Peer Announcement — review started (advisory).** After the preamble confirms the path (no `context.redirect`, no `earlyExit`) and **before** the first criterion (same placement rule as `/work` event 1). Run `node .claude/scripts/shared/announce.js --event review-started --issue $ISSUE`, appending `--force` when this review has it. The script discovers peers itself, composes through `buildAnnouncement` and records a record-only ledger entry, so no caller unwraps `data.peers`. `announcement.shouldSend` true → `SendMessage` per `announcement.recipients` entry with `announcement.text`, then close out with the envelope's `dispatchReport` (`--dispatch-result sent|failed --ledger-id <id>`).
**Once per issue at its own turn.** `/review-issue 42 43 44` runs the preamble per issue and any one may redirect or early-exit, so never compose one message naming the whole argument list. **An issue's turn begins after the previous issue's Step 3b verdict has been dispatched** — opener A, verdict A, opener B, verdict B. For an expanded epic the epic's `review-started` is sent at its own turn, after the last child's verdict. **Suppressed under `--force` — by the script:** `announce.js --event review-started --issue $ISSUE --force` returns `suppressed: true`, `shouldSend: false` and the reason, recording nothing — `/resolve-review` Step 4's nested `Skill("review-issue", "#$ISSUE --force")` would otherwise announce a re-review as fresh.
**Gated by project config.** Resolve before composing: `node .claude/scripts/shared/lib/cross-session-config.js`. `groups.review` false → this event **emits nothing**, no `SendMessage` and no skip notice; the review itself unchanged. `notices` false → only the caveat and skip-reason lines are suppressed. Absent object, or any omitted key → enabled. **Read the resolver; never re-derive the default inline.** In the multi-issue form resolve the state **once**, not per issue. `shouldSend` true → `SendMessage` per `recipients` entry with `text`; false → report `notice` once, continue. **Advisory, fire-and-forget — a throwing helper must never abort the enclosing sequence.** Dispatch is not delivery.

### Step 2: Evaluate Criteria

**2a: Auto-Evaluate Objective Criteria** — for each objective criterion in `criteria.common` and `criteria.typeSpecific`, evaluate by reading issue content. Re-read `.claude/metadata/review-criteria.json` from disk (not memory) if stale. Emit ✅/⚠️/❌ with evidence using `autoCheck` field for guidance.

**2a-ii: Proposed Solution Repair + Files-to-Modify Derivation** (Bug, Enhancement, Story; NOT epic)
**(a) Repair — conditional.** Trigger: `proposed-solution` or `proposed-fix-described` is ❌/⚠️. Placeholder = under 20 chars or matches "TBD"/"To be documented"/"..."/empty. When triggered: analyze codebase, generate **Approach**, **Files to modify**, **Implementation steps**, **Testing considerations**. Present as `#### Proposed Solution (Auto-Generated)` (enhancement/story) or `#### Proposed Fix (Auto-Generated)` (bug). Otherwise content already substantive (>20 chars, no placeholder).
**(b) Derive and persist `Files to modify:` — always.** Runs for every bug/enhancement/story **regardless of whether (a) fired**.
- **Deficient — (a) fired:** reuse the **Files to modify** list (a) produced. Do not derive it twice.
- **Substantive — (a) skipped:** **Extract** the list from the existing Proposed Solution + codebase analysis. Do **not** regenerate a Proposed Solution; (a)'s generation path is deficient-case only.
Write into the **issue body** — review output alone leaves `scope-drift-check.js` unable to see it. **Format contract** (`extractFilesToModifySection`): header exactly `**Files to modify:**` or `**Files:**` on its own line; paths backticked. The declaration absorbs **one contiguous block — a bullet list or a table, never both**. A table is a valid declaration: a blank line continues the section only while nothing has been collected; once the block yields content the next blank line ends it, as does any `**bold:**` line or `##` heading.
So: **no blank line inside the block**, and **do not follow a bullet list with a table** — the table terminates the declaration rather than extending it. Load-bearing: since #2788 `authoredPaths` is the only scope that can license an always-protected edit, so a stray row naming a protected path would license it.
**Refresh, don't append.** On re-review replace the existing section in place. Reviewing an unchanged issue twice must produce no body diff.
**Ordering is load-bearing** — same rule as 2a-iv, same reason. Write **here, before Step 3 finalize runs**. `review-finalize.js` does its own read-modify-write to increment `**Reviews:** N`; a write concurrent with or after it races that update, later write wins, loser vanishes with no error. Never write during or after Step 3, and do not "simplify" by folding this write into `review-finalize.js`.

**2a-iii: Epic Expansion** — trigger: `context.type === "epic"` for a typed issue. Body in `{frameworkPath}/Reference/review-execution-conditional.md` § 2a-iii (Step 1d): children first, epic last; what each child receives; flags; the propagated-label check; no re-expansion; the `expansionCap` from `resolveReviewExpansion` (a project setting); unreached and erroring children; the roster (Step 4). `construction-context` unchanged: scan `Construction/Design-Decisions/` and `Construction/Tech-Debt/` for files referencing the children's numbers. None found → report gracefully.

**2a-iv: Prior-Art Sweep When Marker Absent**
Trigger: `prior-art-checked` criterion evaluates ❌ (marker absent, or `PARTIAL` — an incomplete sweep, treated as absent and re-swept), **OR `--prior-art` was passed** — the automatic path below, the explicit one after it.
Delegate the decision; do not re-derive it:
```bash
node -e "console.log(JSON.stringify(require('./.claude/scripts/shared/lib/prior-art-marker.js').decideSweep({body:BODY,createdAt:CREATED_AT,reviewSweep:REVIEW_SWEEP})))"
```
**Arguments — substitute from the named source; never leave a literal placeholder.** `BODY` ← `context.issue.body`; `CREATED_AT` ← **`context.issue.createdAt`** (ISO 8601); `REVIEW_SWEEP` ← `mode` from **materializing an absent `reviewSweep` first**: `node -e "console.log(JSON.stringify(require('./.claude/scripts/shared/lib/framework-config.js').ensureReviewSweep(process.cwd())))"` → `{written, mode}` (validating writer; a legacy boolean is left alone).
**`createdAt` decides whether the criterion means anything** — an absent/unparseable value is exempt, so `decideSweep` returns `not-applicable` for *every* unmarked issue; never substitute a hand-entered date. On a `CREATED_AT_UNAVAILABLE` preamble warning, say so in the criterion rather than reporting a bare `not-applicable`. Returns `{sweep, status, reason}`. Report the criterion with that `status`; act on `sweep`.
| status | Action |
|---|---|
| `pass` | Complete marker present — no sweep, no write |
| `fail` | Marker absent or `PARTIAL` — run the sweep |
| `recommend` ⊘ | mode `recommend` (default), no complete marker — **no sweep, no write**. Report ⊘ with the `formatSweepAdvisory()` text (the runnable command) as the evidence. **Not** ❌ (would downgrade nearly every review for an opt-in sweep) and **not** ⚠️ (#2989: needs no action; made `/resolve-review` ask every cycle). Does not affect the recommendation |
| `skip` ⊘ | mode `flag-only` or `off` — no sweep, no write. Report ⊘, **not** ❌, which would downgrade every review in a project that opted out |
| `not-applicable` | Predates the feature (pinned cutoff) — no sweep |
**Sweeping — status `fail`, or `--prior-art` passed:** body in `{frameworkPath}/Reference/review-execution-conditional.md` § 2a-iv (Step 1d, or read now): the explicit path through `decideFlagSweep` and its three interactions, the #2514 procedure reading `.claude/metadata/prior-art-sweep.json` (surfaces, excludes, dispositions, body formats — none restated), the `**Prior Art:**` write via `insertPriorArtSection`, the recommendation impact. **Ordering is load-bearing:** the write lands **here, before Step 3 finalize** (same race as 2a-ii); never during or after Step 3.
**Missing config:** `prior-art-sweep.json` missing/unreadable → report criterion, warn, skip sweep. Do not fail the review.

**2a-v: Branch Auto-Assignment for Test-Plan and PRD Issues** — trigger: issue carries a `test-plan` or `prd` label **and** has no branch assignment. Body in `{frameworkPath}/Reference/review-execution-conditional.md` § 2a-v, loaded at Step 1d: delegate to `.claude/scripts/shared/assign-branch.js`, **reported, not prompted**, **before Step 3 finalize runs** (same read-modify-write race as 2a-ii), no-tracker and already-assigned handled as the body states.
**2b: Ask Subjective Criteria** — for subjective criteria applicable to current reviewMode, use `AskUserQuestion`. Re-read `.claude/metadata/review-mode-criteria.json` from disk for question/options. Solo mode: skip entirely.

**2c: Extension Criteria** (if `--with`) — evaluate domain criteria loaded by preamble.
**2c-ii: Security Finding Label** — if `--with security`/`--with all` and any security finding ⚠️/❌:
```bash
gh issue edit $ISSUE --add-label=security-finding
```
All ✅ → no label.

**2d: Recommendation** — one of: `Ready for work` (no blocking concerns) / `Needs minor revision` (small) / `Needs revision` (must address before starting) / `Needs major rework` (fundamental).

### Step 3: Finalize (Script)
Write findings JSON to `.tmp-$ISSUE-findings.json`. **Read** `.claude/scripts/shared/lib/findings-schema.json` for contract structure, required fields, status values, recommendation values. Solo mode: `userEvaluated` always `[]`.
**`type`:** issue type from preamble `context` — `bug`, `enhancement`, `story`, `epic`, or `generic`. Issue-shaped types produce a `## Issue Review #N` header and keep positional AC check-off. NEVER write `prd`, `proposal`, or `test-plan` here.

```bash
node ./.claude/scripts/shared/review-finalize.js $ISSUE -F .tmp-$ISSUE-findings.json
```
Finalize handles: body metadata (`**Reviews:** N` increment), structured comment posting, label assignment (`reviewed`/`pending`) **to the reviewed issue only** — no label reaches a sub-issue from here; a child's label comes from its own finalize when the epic expands (2a-iii). Clean up temp file. Report summary from output.

For non-`--with` runs, append the preamble's `criteria.availableTip` **verbatim** — composed from registry keys, so this rule names no domain ids and cannot go stale against the registry. `null` = no readable registry: emit nothing, not an empty list. **Never re-introduce the list, not even as an example** (guarded by `tests/reference/review-extensions-registry.test.js`).
**Extensions Applied** in review comment lists only domains producing findings (omit empty). At least one domain section must appear when `--with` used; if none produce findings, fall back to standard review with warning.
**Step 3b: Peer Announcement — the review verdict.** **Every review emits exactly one verdict event, so `review-started` is always closed.** `determineLabel()` returns `reviewed` or `pending`, each with an announcement:
| `labelAssigned` | Event | Terminal? |
|---|---|---|
| `reviewed` | `review-passed` | **yes** — nothing follows, a peer can stop waiting |
| `pending` | `review-findings` | **no** — a resolution cycle may or may not follow |
| `null` | **nothing** | n/a — the swap failed |
Sub-step of Step 3, firing per issue right after that issue's finalize returns — not `Step 3a`, which runs once after every issue. Run `node .claude/scripts/shared/announce.js --label-assigned <labelAssigned> --issue $ISSUE` with finalize's `labelAssigned` verbatim: the script applies the table and refuses `--event` beside it. `announcement.shouldSend` true → `SendMessage` per `announcement.recipients` entry with `announcement.text`, then close out with the envelope's `dispatchReport` (`--dispatch-result sent|failed --ledger-id <id>`).
**`review-passed` trigger: the finalize envelope reports `labelAssigned === 'reviewed'`.** Nothing else — the swap replaces rather than adds, so that value *is* the success condition. **The label, never the recommendation string**; it is an exact proxy here and only here, which is why `/review-prd`, `/review-proposal` and `/review-test-plan` do **not** emit this (rationale document).
**`pending` emits `review-findings`; a failed swap (`null`) still emits nothing.** Same invocation, same `groups.review` lever, cadence and fire-and-forget discipline as `review-passed`. Two deliberate differences: **it is NOT terminal and its text must not claim finality** (`/resolve-review`, abandonment, or nothing may follow; absent from `TERMINAL_EVENTS` — do not add it, rationale document); and **it closes `review-started` all the same**. `review-passed` is terminal and its text says so.
**NOT suppressed under `--force` — the opposite of Step 1c, deliberately.** It fires on **both entry paths**: the nested re-review is how a resolve cycle reaches `Ready for work`. **No double-emission:** `/resolve-review` never emits this itself, and there is one finalize call per issue per review — once per issue at its own turn, never batched.
**Gated by `groups.review`, resolved once per invocation** — reuse Step 1c's resolution (made even under `--force`) so opener and closer cannot be gated differently. Group false → emits nothing, no `SendMessage` and no skip notice. `shouldSend` true → `SendMessage` per `recipients` entry with `text`; false → report `notice` once, continue. **Advisory, fire-and-forget — a throwing helper must never abort Step 3.** Dispatch is not delivery.

### Step 3a: Interdependence Analysis (Multi-Issue Only)
Trigger: 2+ issues reviewed AND all eligible per `typeFilter` in `.claude/metadata/review-interdependence.json` — read the eligible/excluded sets from that file; excluded wins. Do not restate them here.
**Expanded epic: the children are the set, the epic is excluded.** `reviewedIssues` holds the **children only** — `typeFilter.excluded` covers the epic type, so the whole set would be silently skipped. Run over 2+ reviewed children; findings go into the epic's closing report (Step 4).
After all individual reviews complete:
```javascript
const { analyzeInterdependence, isEligibleForInterdependence } = require('.claude/scripts/shared/review-interdependence.js');
// `labels` accepts both shapes: ['story'] or [{name:'story'}] (#2682)
const allEligible = reviewedIssues.every(i => isEligibleForInterdependence(i.labels));
if (allEligible) {
  const result = analyzeInterdependence(reviewedIssues);
}
```
`reviewedIssues` = array of `{ number, title, type, labels, body }` collected during reviews. `labels` is normally `context.issue.labels` from that issue's preamble envelope, passed through unaltered — `{name}` objects, **not** strings; do not flatten.
Report: **Overlap** (shared scope), **Ordering** (suggested order + rationale), **Conflicts** (contradictory requirements), **Shared Criteria** (ACs in multiple issues).
If findings exist, report them with the suggested order and ask whether to update the issues with cross-references (y/n); on acceptance add `Refs #N` notes to related issue bodies. No findings → `"No interdependence detected between reviewed issues."` and continue.

Config: `.claude/metadata/review-interdependence.json`. Single-issue: skipped; an epic with one reviewed child too.

### Step 4: Closing Notification and Cleanup
Two parts in order; the prune is **part of** this step, not a trailing step a reader can stop before. **(1)** Output `closingNotification` from finalize. Multi-issue: `"Reviews complete: #42, #43, #44"`. **Expanded epic: the notification is the roster** — every child reviewed with verdict, every child not reached with reason, the children-only interdependence result, and the command finishing the set:
```
Reviews complete: #<epic> (epic) and <reached> of <total> children
  Reviewed: #101 reviewed · #102 pending · …
  Not reached: #121 — expansion cap (<expansionCap>) · #122 — expansion cap (<expansionCap>)
  Interdependence (children): <findings summary, or "none detected">
Finish the set: /review-issue #121 #122
```
An unreached child keeps no review label; an errored child appears under `Not reached` as `error: <message>`. **(2) Prune the task list** (unconditional — every path, including redirect and early-exit paths where Phase 1 created a preamble task and Phase 2 never ran): `TaskList` to enumerate, then `TaskUpdate status=deleted` for every task owned by this `/review-issue` invocation (Phase 1 preamble, Phase 2 step tasks). Do **not** delete tasks created outside this invocation (user TODOs). Nested via `Skill("review-issue")` from `/resolve-review`: the prune still runs; the parent's sweep becomes redundancy.

---
## `/resolve-review` — Workflow
**Multi-issue:** `/resolve-review 42 43` resolves each issue in turn, each through Steps 1–4; issue N's cycle ends with its Step 4 re-review verdict, and issue N+1 begins after it.
**Expanded epic.** Trigger: Step 1's preamble returns `context.type === "epic"` for a typed issue. Body in `{frameworkPath}/Reference/review-execution-conditional.md` § `/resolve-review` — Epic Expansion (Step 1d): member set (children first, epic last), per-child classification via `review-state.js`, the whole-set "already ready" rule, the single re-review after the last member, errors kept with the child, the `resolveCap` from `resolveReviewExpansion` (a project setting), the roster. Only a typed issue expands; a member that arrived by expansion is never expanded again.
### Step 1: Setup (Preamble Script)
```bash
node ./.claude/scripts/shared/resolve-preamble.js $ISSUE
```
Parse JSON. `ok: false` → report `errors[0].message` → **STOP**.
`earlyExit: true` (recommendation "Ready for") → "Already ready — no action needed." → **STOP**.
**Step 1d: Load Conditional Sections.** Trigger: `context.type === "epic"`. Read `{frameworkPath}/Reference/review-execution-conditional.md` and hold it (the epic-expansion body; its heading above is a stub). After the early-exit check, before 1a. No trigger → one-line skip note. Own task entry.
**Step 1a: Peer Announcement — review resolved (advisory).** After the early-exit check above: no findings means no resolution cycle. In the multi-issue form, `review-resolved` for the next issue is not sent before the current issue's re-review verdict — Step 1c's turn definition, applied to the resolution cycle. Run `node .claude/scripts/shared/announce.js --event review-resolved --issue $ISSUE`.
**The script discovers peers itself** and records a record-only ledger entry, so no caller unwraps `data.peers`. `announcement.shouldSend` true → `SendMessage` per `announcement.recipients` entry, then close out with the envelope's `dispatchReport`.
**Gated by project config.** Resolve before composing: `node .claude/scripts/shared/lib/cross-session-config.js`. `groups.review` false → this event **emits nothing**, no `SendMessage` and no skip notice; resolution itself unchanged. `notices` false → dispatch unchanged, the caveat and skip-reason lines not printed. Absent object, or any omitted key → enabled. **Read the resolver; never re-derive the default inline** — `review` is one group covering both halves of the cycle.
`shouldSend` true → `SendMessage` per `recipients` entry with `text`; false → report `notice` once, continue. **Advisory, fire-and-forget — a throwing helper must never abort the enclosing sequence.** Dispatch is not delivery.
**Not terminal** — nothing promises what follows a resolution cycle.
Extract: `context` (reviewType, reviewNumber, recommendation), `findings` (autoFixable, needsUserInput, passed), and `suggestions` — a **sibling** of `findings`, never a fourth bucket inside it.
Report: `"Resolving N findings from {reviewType} Review #M..."` with auto-fixable/user-input counts.
### Step 1b: AC Feasibility on Authored ACs
`/resolve-review` is an **AC-authoring path**: Step 2 can add an AC skeleton and Step 3 Pass 2 applies accepted suggestions, both writing acceptance criteria into a body.
**Before writing any AC text in Step 2 or Step 3, re-read `.claude/metadata/ac-feasibility-prompts.json` from disk** (rule 01 — not in context after compaction) and apply:
- **`verificationGate`** — does the named mechanism exist in this repo's test harness? If not, say so rather than writing an aspirational AC.
- **`phaseFeasibility`** — can the condition resolve before the `in_review` move? Work in `ownedElsewhere` is **dropped**, not annotated (`/prepare-release` carries its own checklist item; a second checkbox is a second place to mark one obligation done). A load-bearing gate is **annotated** `- [ ] {acText} → GATE: {phase}` per `annotationFormat`, and the AC text must **name the event that resolves it** — a token that cannot name one is not a gate.
**Warning-only, and it never blocks the resolution cycle** — halting on AC wording leaves the review findings unresolved, strictly worse than an AC needing a follow-up edit. Matches `/bug` and `/enhancement`, not `/create-prd`: one issue's ACs, no fan-out.
**Applies to text this command writes, not to ACs already in the body** — `/review-issue`'s `ac-phase-feasible` criterion re-audits those on the Step 4 re-review.
### Step 2: Pass 1 — Auto-Fix
Iterate `findings.autoFixable`. Apply and report:
- **Priority not set:** `gh pmu move $ISSUE --priority p2`
- **Missing labels:** `gh issue edit $ISSUE --add-label {label}` — inferred
- **Body-modifying** (missing AC, repro, format): show preview and confirm — body is harder to undo. **An added AC skeleton is authored AC text — apply Step 1b before writing it.**
```
Auto-resolved:
  ✓ Priority set to P2 (default)
  ✓ Added label: enhancement
  ✓ Added AC section skeleton (confirmed)
```
### Step 3: Pass 2 — User Input
Iterate `findings.needsUserInput`. **Print the finding as markdown before each `AskUserQuestion`** (issue, criterion, full detail; proposed AC quoted), then:
```javascript
AskUserQuestion({
  questions: [{
    question: `For Issue: #${ISSUE} — ${finding.criterion} How should this be resolved?`,
    header: "Resolution",
    options: [
      { label: "Accept suggestion", description: "Apply the change shown", preview: "<exact change>" },
      { label: "Provide alternative", description: "Specify your own resolution", preview: "<reviewer's alternative>" },
      { label: "Skip", description: "Leave unresolved" }
    ],
    multiSelect: false
  }]
});
```
**One-line question; the change goes in the previews.** `Accept suggestion` previews the exact change, verbatim; `Provide alternative` the reviewer's alternative when one is named, else no `preview`.
- **Accept:** apply, `"✓ {change applied}"`
- **Alternative:** ask conversationally, apply
- **Skip:** `"⊘ Skipped: {finding}"`
**Both prompts name the issue.** The number comes from the command's own `$ISSUE` argument, never a `resolve-preamble.js` context field.
**Accepted suggestions that add or reword an AC are authored AC text — apply Step 1b before writing them.**
**Title rewording:** Propose new title from content, print both titles as markdown, present "Accept", "Edit", "Skip"; one-line question prefixed `For Issue: #${ISSUE}`, proposed title in the `Accept` `preview`.
**Flagged `severity-proportionate`:** re-read `.claude/metadata/bug-priority-rubric.json`; derive its priority from the bug's stated impact as `/bug` Step 2c does (`classes`, `precedence`, no match → `fallback`). Offer it as the suggestion, naming the matched class id and the current board priority. **Accept** → `gh pmu move $ISSUE --priority <p>`; **Provide alternative** → user's `p0`/`p1`/`p2`, applied the same way. One confirmation suffices — a board field, trivially reverted. **Never auto-fix it:** `priority-set` fills a *missing* priority only; a set-but-wrong one is always a proposal, which is why `resolve-preamble.js` classifies it `needsUserInput`.

### Step 3a: Report Suggestions
Iterate `suggestions` — free-text findings that are **not** criteria. Report each verbatim as a bullet under `Suggestions from {reviewType} Review #M (not auto-resolved):`, and take no action.
Empty array → **report nothing**: no heading, no "none" line — the key is always present, so empty means none were raised.
**Reported, never auto-applied.** A suggestion carries no `status` and no criterion id — nothing to classify against, and `classifyFindings`' fallback would assert a severity the reviewer never expressed. Passes 1 and 2 do not touch them.
### Step 4: Re-Review
After all findings resolved, mark the outer wrapper task `completed` **before** invoking the Skill tool — Skill transfers control to `/review-issue`, so a post-invocation `TaskUpdate` is missed by most paths and leaves the wrapper stuck in `in_progress`.
```
TaskUpdate: mark "Apply body edits and re-review" task completed
```
Then invoke re-review with `--force`, appending `--prior-art` when it was passed to this command (omit the trailing flag otherwise; `--force` is unconditional):
```
Skill("review-issue", "#$ISSUE --force --prior-art")
```
**Pass-through only.** No sweep logic here: no `decideFlagSweep`, no `reviewSweep` read, no `**Prior Art:**` write. `/review-issue` owns that decision at its 2a-iv; the re-review is the only sweep opportunity in a resolve cycle, so a flag dropped here is a typed sweep request answered with silence.
`/review-issue` handles full cycle (preamble → evaluate → finalize), including `reviewed`/`pending` label swap.
Report:
```
/resolve-review #$ISSUE complete.
  Findings resolved: N
  Re-review: [recommendation from re-review]
```
If user declined all: `"No changes made. Review findings remain unresolved."` → **STOP**

**Post-Complete Cleanup:** After emitting the closing report, clear the task list. Clear BOTH `/resolve-review` tasks AND the transient re-review tasks created by the nested `Skill("review-issue")` call — transient resolution-cycle state, not user work. **The child now cleans up after itself:** `/review-issue` prunes its own tasks unconditionally, so this sweep of re-review tasks is redundancy rather than the sole mechanism. Keep it — it covers paths where the child exits early. The `/resolve-review` tasks have no other owner.
---

---
**End of Review Execution Rule**
