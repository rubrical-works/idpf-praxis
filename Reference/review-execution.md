# Review Execution Rule
**Version:** v0.116.0
**Source:** Reference/review-execution.md
Auto-loaded execution rule for `/review-issue` and `/resolve-review` (hybrid shell + rule). The shells `.claude/commands/review-issue.md` and `.claude/commands/resolve-review.md` carry arguments, prerequisites and error handling; this rule carries the Workflow for both.
**Both commands are MANAGED with zero `USER-EXTENSION` blocks.** The three retired points live on in `extension-points.json` `deprecatedExtensionPoints`, beside `/work`'s four from #2368.
**Resident core, conditional bodies, on-demand rationale.** Every directive is here. Epic, sweep and test-plan/PRD bodies (2a-iii, the 2a-iv sweep, 2a-v, `/resolve-review` epic expansion) are in `{frameworkPath}/Reference/review-execution-conditional.md`, read at Step 1d; reasoning is in `{frameworkPath}/Reference/review-execution-rationale.md`, never auto-loaded.
## Peer Announcements — shared by every review event
Four events — `review-started` (Step 1c), the verdict `review-passed` / `review-findings` (Step 3b) and `review-resolved` (`/resolve-review` Step 1a) — share one gate and one dispatch, stated here once (#3060 item 5):
- **Gate.** Resolve `node .claude/scripts/shared/lib/cross-session-config.js` **once per invocation**, not per issue, and reuse it for every event. `groups.review` false → the event **emits nothing**, no `SendMessage` and no skip notice. `notices` false → only the caveat and skip-reason lines suppressed. Absent or omitted key → enabled. **Read the resolver; never re-derive the default inline.**
- **Dispatch.** The event's `announce.js` command discovers peers itself, composes and records the ledger entry. `announcement.shouldSend` true → `SendMessage` per `announcement.recipients` entry with `announcement.text`, then close out with the envelope's `dispatchReport` (`--dispatch-result sent|failed --ledger-id <id>`); false → report `notice` once and continue.
- **Advisory, fire-and-forget — a throwing helper must never abort the enclosing sequence.** `shouldSend` is a dispatch decision, never a delivery confirmation.
## `/review-issue` — Workflow
Multi-issue: process each sequentially through Steps 1–3.
**An epic is a multi-issue set.** Step 1's preamble returning `context.type === "epic"` for an issue typed on the command line expands it: the set is every child in `gh pmu sub list $EPIC --json` (`children[]`, ascending), then the epic, each through Steps 1–3 exactly as a directly-typed `/review-issue <child>` — own preamble, type criteria, 2a-ii body write, finalize, 3b verdict. 2a-iii carries the contract.
### Step 1: Setup (Preamble Script)
```bash
node ./.claude/scripts/shared/review-preamble.js $ISSUE [--with extensions] [--without extensions] [--mode mode] [--force] [--prior-art]
```
**`--prior-art` is accepted here but consumed at 2a-iv, not by the preamble.** The preamble only records it; `decideFlagSweep` decides. Any flag-shaped token the loop does not recognize is collected into `unrecognizedFlags` and reported, never fatal, per `02-github-workflow.md`'s pass-through convention.
Parse JSON. Branches:
- `ok: false` → report `errors[0].message` → **STOP** (skip to next in batch)
- `context.redirect` set → invoke skill **dynamically** using `context.redirect` (strip leading `/`) — all three rows below are equally normative:
  Labels `proposal`/`prd`/`test-plan` → `Skill("review-proposal"|"review-prd"|"review-test-plan", args: "#$ISSUE [--with ...] [--mode ...] [--force] [--prior-art]")`, name derived from `context.redirect`. → **STOP**. **`--prior-art` must survive the redirect:** `/review-proposal` carries its own 2a-iv; `/review-prd` and `/review-test-plan` report it inapplicable rather than swallowing it.
- `context.issue.state === "closed"` → ask user to confirm before proceeding
- `earlyExit: true` (has `reviewed` label, no `--force`) → report review count → **STOP**
Extract: `context` (type, reviewNumber, title, labels, body), `criteria` (common from `.claude/metadata/review-mode-criteria.json`, typeSpecific from `.claude/metadata/review-criteria.json`), `extensions`, `warnings`. Extension loading is the preamble's, via `.claude/metadata/review-extensions.json`; unknown IDs warn, missing/malformed → standard review only.
**Step 1d: Load Conditional Sections.** Trigger: `context.type === "epic"` for a typed issue; or `--prior-art` passed; or a `test-plan`/`prd` label. Read `{frameworkPath}/Reference/review-execution-conditional.md` and hold it for the run (bodies of 2a-iii, the 2a-iv sweep, 2a-v). After the preamble confirms the path, before 1c; a sweep due only at 2a-iv (status `fail`) reads it there. No trigger → one-line skip note. Own task entry.
**Step 1c: Peer Announcement — review started (advisory).** After the preamble confirms the path (no `context.redirect`, no `earlyExit`) and **before** the first criterion (same placement rule as `/work` event 1). `node .claude/scripts/shared/announce.js --event review-started --issue $ISSUE`, appending `--force` when this review has it; gate and dispatch per § Peer Announcements.
**Once per issue at its own turn** — never compose one message naming the whole argument list. **An issue's turn begins after the previous issue's Step 3b verdict has been dispatched** — opener A, verdict A, opener B, verdict B; an expanded epic's `review-started` is sent at its own turn, after the last child's verdict. **Suppressed under `--force` — by the script:** `announce.js --event review-started --issue $ISSUE --force` returns `suppressed: true`, `shouldSend: false` and the reason, recording nothing, so `/resolve-review` Step 4's nested re-review is never announced as fresh.
### Step 2: Evaluate Criteria
**2a: Auto-Evaluate Objective Criteria** — for each objective criterion in `criteria.common` and `criteria.typeSpecific`, evaluate by reading issue content. Re-read `.claude/metadata/review-criteria.json` from disk if stale. Emit ✅/⚠️/❌ with evidence, guided by `autoCheck`.
**2a-ii: Proposed Solution Repair + Files-to-Modify Derivation** (Bug, Enhancement, Story; NOT epic)
**(a) Repair — conditional.** Trigger: `proposed-solution` or `proposed-fix-described` is ❌/⚠️ (placeholder: under 20 chars, "TBD", "To be documented", "...", empty). Generate **Approach**, **Files to modify**, **Implementation steps**, **Testing considerations** as `#### Proposed Solution (Auto-Generated)` (enhancement/story) or `#### Proposed Fix (Auto-Generated)` (bug).
**(b) Derive and persist `Files to modify:` — always**, whether or not (a) fired: reuse (a)'s list when it fired; otherwise **extract** it from the existing Proposed Solution plus codebase analysis, never regenerating one.
**Minimized sources:** append each path `node .claude/scripts/shared/lib/minimize-byproducts.js <listed paths>` prints that the list lacks — regeneration byproducts; `[]` where nothing is minimized.
Write it into the **issue body** — review output alone leaves `scope-drift-check.js` unable to see it. **Format contract** (`extractFilesToModifySection`): header exactly `**Files to modify:**` or `**Files:**` on its own line; paths backticked; **one contiguous block — a bullet list or a table, never both**. **No blank line inside the block**, and **do not follow a bullet list with a table** — the table terminates the declaration. Load-bearing: since #2788 `authoredPaths` is the only scope that can license an always-protected edit.
**Refresh, don't append.** On re-review replace the section in place; reviewing an unchanged issue twice must produce no body diff.
**Ordering is load-bearing:** write **here, before Step 3 finalize runs** — `review-finalize.js` read-modify-writes the body for `**Reviews:** N`, and a later write silently wins. Never write during or after Step 3, and do not fold this write into `review-finalize.js`.
**2a-iii: Epic Expansion** — trigger: `context.type === "epic"` for a typed issue. Body in `{frameworkPath}/Reference/review-execution-conditional.md` § 2a-iii (Step 1d), including the `expansionCap` from `resolveReviewExpansion` (a project setting). `construction-context` unchanged: scan `Construction/Design-Decisions/` and `Construction/Tech-Debt/` for files referencing the children's numbers. None found → report gracefully.
**2a-iv: Prior-Art Sweep When Marker Absent**
Trigger: `prior-art-checked` criterion evaluates ❌ (marker absent, or `PARTIAL` — an incomplete sweep, treated as absent and re-swept), **OR `--prior-art` was passed**.
Delegate the decision; do not re-derive it:
```bash
node -e "console.log(JSON.stringify(require('./.claude/scripts/shared/lib/prior-art-marker.js').decideSweep({body:BODY,createdAt:CREATED_AT,reviewSweep:REVIEW_SWEEP})))"
```
**Substitute from the named source; never leave a literal placeholder.** `BODY` ← `context.issue.body`; `CREATED_AT` ← **`context.issue.createdAt`**, never a hand-entered date; `REVIEW_SWEEP` ← the `mode` from **materializing an absent `reviewSweep` first**: `node -e "console.log(JSON.stringify(require('./.claude/scripts/shared/lib/framework-config.js').ensureReviewSweep(process.cwd())))"`. On a `CREATED_AT_UNAVAILABLE` warning, say so in the criterion, not a bare `not-applicable`.
`decideSweep` returns `{sweep, status, reason}`. Report the criterion with that `status`; act on `sweep`:
`pass` (complete marker) → no sweep, no write. `fail` (absent or `PARTIAL`) → run the sweep. `recommend` ⊘ (default mode, no complete marker) → **no sweep, no write**; report ⊘ with the `formatSweepAdvisory()` text as evidence — **not** ❌, **not** ⚠️, and no effect on the recommendation. `skip` ⊘ (`flag-only`/`off`) → no sweep, no write; ⊘, **not** ❌. `not-applicable` (predates the cutoff) → no sweep.
**Sweeping — status `fail`, or `--prior-art` passed:** body in `{frameworkPath}/Reference/review-execution-conditional.md` § 2a-iv (Step 1d, or read now): the explicit path through `decideFlagSweep`, the #2514 procedure reading `.claude/metadata/prior-art-sweep.json` (none restated), the `**Prior Art:**` write via `insertPriorArtSection`, the recommendation impact. **Ordering is load-bearing:** the write lands **here, before Step 3 finalize** (same race as 2a-ii); never during or after Step 3.
**Missing config:** `prior-art-sweep.json` missing/unreadable → report criterion, warn, skip sweep. Do not fail the review.
**2a-v: Branch Auto-Assignment for Test-Plan and PRD Issues** — trigger: a `test-plan` or `prd` label **and** no branch assignment. Body in `{frameworkPath}/Reference/review-execution-conditional.md` § 2a-v (Step 1d): delegate to `.claude/scripts/shared/assign-branch.js`, **reported, not prompted**, **before Step 3 finalize runs** (same race as 2a-ii).
**2b: Ask Subjective Criteria** — for subjective criteria applicable to current reviewMode, use `AskUserQuestion`. Re-read `.claude/metadata/review-mode-criteria.json` from disk for question/options. Solo mode: skip entirely.
**2c: Extension Criteria** (if `--with`) — evaluate domain criteria loaded by preamble.
**2c-ii: Security Finding Label** — if `--with security`/`--with all` and any security finding ⚠️/❌: `gh issue edit $ISSUE --add-label=security-finding`. All ✅ → no label.
**2d: Recommendation** — one of: `Ready for work` (no blocking concerns) / `Needs minor revision` (small) / `Needs revision` (must address before starting) / `Needs major rework` (fundamental).
### Step 3: Finalize (Script)
Write findings JSON to `.tmp-$ISSUE-findings.json`. **Read** `.claude/scripts/shared/lib/findings-schema.json` for contract structure, required fields, status values, recommendation values. Solo mode: `userEvaluated` always `[]`.
**`type`:** issue type from preamble `context` — `bug`, `enhancement`, `story`, `epic`, or `generic`. Issue-shaped types produce a `## Issue Review #N` header and tick no AC boxes. NEVER write `prd`, `proposal`, or `test-plan` here.
```bash
node ./.claude/scripts/shared/review-finalize.js $ISSUE -F .tmp-$ISSUE-findings.json
```
Finalize handles: body metadata (`**Reviews:** N` increment), structured comment posting, label assignment (`reviewed`/`pending`) **to the reviewed issue only** — no label reaches a sub-issue from here; a child's label comes from its own finalize when the epic expands. Clean up temp file. Report summary from output.
For non-`--with` runs, append the preamble's `criteria.availableTip` **verbatim**; `null` → emit nothing. **Never re-introduce the list, not even as an example** (guarded by `tests/reference/review-extensions-registry.test.js`).
**Extensions Applied** in review comment lists only domains producing findings. At least one domain section must appear when `--with` used; if none produce findings, fall back to standard review with warning.
**Step 3b: Peer Announcement — the review verdict (advisory).** **Every review emits exactly one verdict event, so `review-started` is always closed.** Firing per issue right after that issue's finalize returns (a sub-step of Step 3, not `Step 3a`):
```bash
node .claude/scripts/shared/announce.js --label-assigned <labelAssigned> --issue $ISSUE
```
with finalize's `labelAssigned` verbatim; the script applies the table and refuses `--event` beside it. **`review-passed` trigger: `labelAssigned === 'reviewed'`.** Gated by `groups.review` **resolved once per invocation** — reuse Step 1c's resolution (made even under `--force`) so opener and closer cannot be gated differently — and dispatched per § Peer Announcements (`SendMessage`, then `--dispatch-result`); fire-and-forget.
| `labelAssigned` | Event | Terminal? |
|---|---|---|
| `reviewed` | `review-passed` | **yes** — nothing follows, a peer can stop waiting |
| `pending` | `review-findings` | **no** — a resolution cycle may or may not follow |
| `null` | **nothing** — emits nothing | n/a — the swap failed |
**The trigger is the label, never the recommendation string**; it is an exact proxy here and only here, which is why `/review-prd`, `/review-proposal` and `/review-test-plan` do **not** emit this. **`review-findings` is NOT terminal and its text must not claim finality** (absent from `TERMINAL_EVENTS` — do not add it), and **it closes `review-started` all the same.**
**NOT suppressed under `--force` — the opposite of Step 1c, deliberately.** It fires on **both entry paths**: the nested re-review is how a resolve cycle reaches `Ready for work`. **No double-emission:** `/resolve-review` never emits this itself, and there is one finalize call per issue per review — once per issue at its own turn, never batched.
### Step 3a: Interdependence Analysis (Multi-Issue Only)
Trigger: 2+ issues reviewed AND all eligible per `typeFilter` in `.claude/metadata/review-interdependence.json` — read the eligible/excluded sets there; excluded wins. Do not restate them here.
**Expanded epic: the children are the set, the epic is excluded** — `typeFilter.excluded` covers the epic type, so `reviewedIssues` holds the children only. Run over 2+ reviewed children; findings go into the epic's closing report (Step 4).
After all individual reviews complete:
```javascript
const { analyzeInterdependence, isEligibleForInterdependence } = require('.claude/scripts/shared/review-interdependence.js');
const allEligible = reviewedIssues.every(i => isEligibleForInterdependence(i.labels));
if (allEligible) {
  const result = analyzeInterdependence(reviewedIssues);
}
```
`reviewedIssues` = `{ number, title, type, labels, body }` per issue; `labels` is `context.issue.labels` passed through unaltered — `{name}` objects, **not** strings; do not flatten.
Report **Overlap**, **Ordering**, **Conflicts**, **Shared Criteria**; findings → ask whether to add `Refs #N` cross-references, and on acceptance add them. No findings → `"No interdependence detected between reviewed issues."` Single-issue: skipped; an epic with one reviewed child too.
### Step 4: Closing Notification and Cleanup
Two parts in order; the prune is **part of** this step, not a trailing step a reader can stop before. **(1)** Output `closingNotification` from finalize. Multi-issue: `"Reviews complete: #42, #43, #44"`. **Expanded epic: the notification is the roster** — every child reviewed with verdict, every child not reached with reason, the children-only interdependence result, and the command finishing the set:
```
Reviews complete: #<epic> (epic) and <reached> of <total> children
  Reviewed: #101 reviewed · #102 pending · …
  Not reached: #121 — expansion cap (<expansionCap>) · #122 — expansion cap (<expansionCap>)
  Interdependence (children): <findings summary, or "none detected">
Finish the set: /review-issue #121 #122
```
An unreached child keeps no review label; an errored child appears under `Not reached` as `error: <message>`. **(2) Prune the task list** (unconditional — every path, redirect and early exit included, where Phase 2 never ran): `TaskList` to enumerate, then `TaskUpdate status=deleted` for every task owned by this `/review-issue` invocation. Do **not** delete tasks created outside this invocation (user TODOs). Nested from `/resolve-review`, the prune still runs.
## `/resolve-review` — Workflow
**Multi-issue:** `/resolve-review 42 43` resolves each issue in turn, each through Steps 1–4; issue N's cycle ends with its Step 4 re-review verdict, and issue N+1 begins after it.
**Expanded epic.** Trigger: Step 1's preamble returns `context.type === "epic"` for a typed issue. Body in `{frameworkPath}/Reference/review-execution-conditional.md` § `/resolve-review` — Epic Expansion (Step 1d), including the `resolveCap` from `resolveReviewExpansion`. Only a typed issue expands; a member that arrived by expansion is never expanded again.
### Step 1: Setup (Preamble Script)
```bash
node ./.claude/scripts/shared/resolve-preamble.js $ISSUE
```
Parse JSON. `ok: false` → report `errors[0].message` → **STOP**.
`earlyExit: true` (recommendation "Ready for") → "Already ready — no action needed." → **STOP**.
**Step 1d: Load Conditional Sections.** Trigger: `context.type === "epic"`. Read `{frameworkPath}/Reference/review-execution-conditional.md` and hold it. After the early-exit check, before 1a. No trigger → one-line skip note. Own task entry.
**Step 1a: Peer Announcement — review resolved (advisory).** After the early-exit check: no findings means no resolution cycle. `node .claude/scripts/shared/announce.js --event review-resolved --issue $ISSUE`; gate and dispatch per § Peer Announcements — `review` is one group covering both halves of the cycle. In the multi-issue form, `review-resolved` for the next issue is not sent before the current issue's re-review verdict. **Not terminal** — nothing promises what follows a resolution cycle.
Extract: `context` (reviewType, reviewNumber, recommendation), `findings` (autoFixable, needsUserInput, passed), and `suggestions` — a **sibling** of `findings`, never a fourth bucket inside it.
Report: `"Resolving N findings from {reviewType} Review #M..."` with auto-fixable/user-input counts.
### Step 1b: AC Feasibility on Authored ACs
**Before writing any AC text in Step 2 or Step 3, re-read `.claude/metadata/ac-feasibility-prompts.json` from disk** and apply `verificationGate` (no aspirational AC naming a mechanism this repo lacks) and `phaseFeasibility` (`ownedElsewhere` work is **dropped**, not annotated; a load-bearing gate is **annotated** `- [ ] {acText} → GATE: {phase}`, and the AC text must name the event that resolves it). **Warning-only, and it never blocks the resolution cycle.** **Applies to text this command writes, not to ACs already in the body** — the re-review's `ac-phase-feasible` criterion audits those.
### Step 2: Pass 1 — Auto-Fix
Iterate `findings.autoFixable`. Apply and report:
- **Priority not set:** `gh pmu move $ISSUE --priority p2`
- **Missing labels:** `gh issue edit $ISSUE --add-label {label}` — inferred
- **Body-modifying** (missing AC, repro, format): show preview and confirm — body is harder to undo. **An added AC skeleton is authored AC text — apply Step 1b before writing it.**
Report each under `Auto-resolved:` as `✓ <change>`.
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
**Flagged `severity-proportionate`:** re-read `.claude/metadata/bug-priority-rubric.json`; derive the priority as `/bug` Step 2c does (`classes`, `precedence`, no match → `fallback`) and offer it, naming the matched class id and the current board priority. **Accept** → `gh pmu move $ISSUE --priority <p>`; **Provide alternative** → the user's `p0`/`p1`/`p2`, applied the same way; one confirmation suffices. **Never auto-fix it:** `priority-set` fills a *missing* priority only.
### Step 3a: Report Suggestions
Iterate `suggestions` — free-text findings that are **not** criteria. Report each verbatim as a bullet under `Suggestions from {reviewType} Review #M (not auto-resolved):`, and take no action. Empty array → **report nothing**: no heading, no "none" line. **Reported, never auto-applied** — a suggestion carries no `status` and no criterion id; Passes 1 and 2 do not touch them.
### Step 4: Re-Review
After all findings resolved, mark the outer wrapper task (`Apply body edits and re-review`) `completed` **before** invoking the Skill tool — Skill does not return, so a later update would leave it `in_progress`. Then invoke re-review with `--force`, appending `--prior-art` when it was passed to this command (omit the trailing flag otherwise; `--force` is unconditional):
```
Skill("review-issue", "#$ISSUE --force --prior-art")
```
**Pass-through only.** No sweep logic here: no `decideFlagSweep`, no `reviewSweep` read, no `**Prior Art:**` write. `/review-issue` owns that decision at its 2a-iv; under `reviewSweep: off` the nested re-review reports the refusal and continues.
`/review-issue` runs the full cycle, label swap included.
Report:
```
/resolve-review #$ISSUE complete.
<issue URL>
  Findings resolved: N
  Re-review: [recommendation from re-review]
```
**Its URL goes on its own line below the first**, never inline or in the question: `https://github.com/<owner/repo>/issues/$ISSUE`, owner/repo from `.gh-pmu.json` `repositories[0]`, never guessed. Step 3 prints no URL: its prompt hides it.
If user declined all: `"No changes made. Review findings remain unresolved."` → **STOP**
**Post-Complete Cleanup:** After the closing report, clear BOTH the `/resolve-review` tasks AND the re-review tasks the nested `Skill("review-issue")` call created. Keep it though the child cleans up after itself: it covers a child that exits early, and the `/resolve-review` tasks have no other owner.
**End of Review Execution Rule**
