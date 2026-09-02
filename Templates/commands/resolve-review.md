---
version: "v0.100.0"
description: Resolve review findings for an issue (project)
argument-hint: "#issue"
copyright: "Rubrical Works (c) 2026"
---
<!-- MANAGED -->
# /resolve-review
Parse the latest review findings and resolve each one. Delegates parsing/classification to `resolve-preamble.js`. Works with findings from `/review-issue`, `/review-proposal`, `/review-prd`, `/review-test-plan`.
---
## Prerequisites
- `gh pmu` installed
- `.gh-pmu.json` configured
- Issue has ≥1 review comment
---
## Arguments
| Argument | Description |
|----------|-------------|
| `#issue` | Issue number (e.g., `#42`) |
---
## Execution
**REQUIRED — routed command, two-phase task creation:**
1. **Phase 1 — Preamble task only:** `TaskCreate` single preamble/setup task. Do NOT create subsequent tasks yet.
2. **Phase 2 — Bulk after routing:** After preamble confirms path (no redirect, no early exit), bulk-create remaining workflow tasks.
3. **Redirect or early exit:** Mark preamble done, stop. Do NOT create remaining tasks.
4. **Include Extensions:** Active `USER-EXTENSION` block → Phase 2 task
5. Mark `in_progress` → `completed`
6. **Post-Compaction:** Re-read, resume from first incomplete — no re-routing.
---
## Workflow
### Step 1: Setup (Preamble Script)
```bash
node ./.claude/scripts/shared/resolve-preamble.js $ISSUE
```
Parse JSON. `ok: false` → report `errors[0].message` → **STOP**.
`earlyExit: true` (recommendation "Ready for") → "Already ready — no action needed." → **STOP**.

**Step 1a: Peer Announcement — review resolved (advisory, #2695).** After the early-exit check above: no findings means no resolution cycle, and announcing one that did not begin is what the placement rule prevents. Run `node .claude/scripts/shared/peers-check.js`, then `buildAnnouncement({event: EVENTS.REVIEW_RESOLVED, issues: [$ISSUE], peers})`.
**Take `data.peers`**, never the whole envelope — the #2678 mistake, which reported "no peers in this working directory" while two were live and reachable.
**Gated by project config (#2702).** Resolve before composing: `node .claude/scripts/shared/lib/cross-session-config.js`. `groups.review` false → this event **emits nothing**, no `SendMessage` and no skip notice; resolution itself unchanged. `notices` false → dispatch unchanged, the caveat and skip-reason lines not printed. Absent object, or any omitted key → enabled. **Read the resolver; never re-derive the default inline** — `review` is one group covering both halves of the review cycle, and a locally-derived default here would silence one half while the other still spoke.
`shouldSend` true → `SendMessage` per `recipients` entry with `text`; false → report `notice` once, continue. **Advisory, fire-and-forget — nothing awaits delivery and a throwing helper must never abort the enclosing sequence.** Dispatch is not delivery (#2674).
**Not terminal** — nothing promises what follows a resolution cycle, so no peer is left waiting.
Extract: `context` (reviewType, reviewNumber, recommendation), `findings` (autoFixable, needsUserInput, passed), and `suggestions` — a **sibling** of `findings`, never a fourth bucket inside it (#2717).
Report: `"Resolving N findings from {reviewType} Review #M..."` with auto-fixable/user-input counts.
### Step 1b: AC Feasibility on Authored ACs (#2726)
`/resolve-review` is an **AC-authoring path** and was the only one with no feasibility gate: Step 2 can add an AC section skeleton and Step 3 Pass 2 applies accepted suggestions, both writing acceptance criteria into a body.
**Before writing any AC text in Step 2 or Step 3, re-read `.claude/metadata/ac-feasibility-prompts.json` from disk** (rule 01 — not in context after compaction) and apply:
- **`verificationGate`** — does the named mechanism exist in this repo's test harness? If not, say so rather than writing an aspirational AC.
- **`phaseFeasibility`** — can the condition resolve before the `in_review` move? Work in `ownedElsewhere` is **dropped**, not annotated (`/prepare-release` carries its own checklist item; a second checkbox is a second place to mark one obligation done). A load-bearing gate is **annotated** `- [ ] {acText} → GATE: {phase}` per `annotationFormat`, and the AC text must **name the event that resolves it** — a token that cannot name one is not a gate.
**Warning-only, and it never blocks the resolution cycle** — halting on AC wording leaves the review findings unresolved, strictly worse than an AC needing a follow-up edit. Matches `/bug` and `/enhancement`, not `/create-prd`: one issue's ACs, no fan-out.
**Applies to text this command writes, not to ACs already in the body** — re-auditing existing criteria is `/review-issue`'s `ac-phase-feasible` criterion, which runs on the Step 4 re-review; doing it here too reports the same finding twice.
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
Iterate `findings.needsUserInput`. Use `AskUserQuestion`:
```javascript
AskUserQuestion({
  questions: [{
    question: `For Issue: #${ISSUE}\nFinding: ${finding.criterion}\nDetail: ${finding.detail}`,
    header: "Resolution",
    options: [
      { label: "Accept suggestion", description: "Apply suggested change" },
      { label: "Provide alternative", description: "Specify your own resolution" },
      { label: "Skip", description: "Leave unresolved" }
    ],
    multiSelect: false
  }]
});
```
- **Accept:** apply, `"✓ {change applied}"`
- **Alternative:** ask conversationally, apply
- **Skip:** `"⊘ Skipped: {finding}"`
**Both prompts name the issue (#2698).** The number comes from the command's own `$ISSUE` argument, never a `resolve-preamble.js` context field — already in scope, so no envelope change. `/resolve-review` runs while other issues are in flight; finding text alone leaves nothing tying an answer to an issue.
**Accepted suggestions that add or reword an AC are authored AC text — apply Step 1b before writing them.**
**Title rewording:** Propose new title from content, present "Accept", "Edit", "Skip"; prefix the question with `For Issue: #${ISSUE}`.

### Step 3a: Report Suggestions (#2717)
Iterate `suggestions` — free-text findings that are **not** criteria. Report each verbatim as a bullet under `Suggestions from {reviewType} Review #M (not auto-resolved):`, and take no action.
Empty array → **report nothing**: no heading, no "none" line. The key is always present, so empty means the review raised none, and saying so is noise on the common path.
**Reported, never auto-applied.** A suggestion carries no `status` and no criterion id — nothing to classify against. `classifyFindings` sorts on `f.status`, and its `warn, skip, or unknown` fallback would drop them into `needsUserInput`, asserting a severity the reviewer never expressed. Passes 1 and 2 do not touch them.
**Why (#2717):** `review-finalize.js` accepted `suggestions` and discarded it, so a suggestion-only defect passed the whole resolve cycle untouched and emerged under a clean `Ready for work`. Rendering it fixed only the visible half; without this step the envelope carries the key and nothing reads it — the silent drop moved one layer along.
### Step 4: Re-Review
After all findings resolved, mark the outer wrapper task `completed` **before** invoking the Skill tool — Skill transfers control to `/review-issue`, so a post-invocation `TaskUpdate` is missed by most paths and leaves the wrapper stuck in `in_progress`.
```
TaskUpdate: mark "Apply body edits and re-review" task completed
```
Then invoke re-review with `--force`:
```
Skill("review-issue", "#$ISSUE --force")
```
`/review-issue` handles full cycle (preamble → evaluate → finalize), including `reviewed`/`pending` label swap.
Report:
```
/resolve-review #$ISSUE complete.
  Findings resolved: N
  Re-review: [recommendation from re-review]
```
If user declined all: `"No changes made. Review findings remain unresolved."` → **STOP**

**Post-Complete Cleanup:** After emitting the closing report, clear the task list (mirrors `/work`'s Post-STOP Cleanup). Clear BOTH `/resolve-review` tasks AND the transient re-review tasks created by the nested `Skill("review-issue")` call — all transient resolution-cycle state, not user work. Without this, the next command inherits stale tasks plus re-review's preamble/evaluate/finalize/closing tasks, and compaction recovery misreads them as incomplete work. **The child now cleans up after itself (#2610):** `/review-issue` prunes its own tasks unconditionally, so this sweep of re-review tasks is redundancy rather than the sole mechanism. Keep it — already-deleted deletes as a no-op, and it covers paths where the child exits early. The `/resolve-review` tasks have no other owner.
---
## Error Handling
| Situation | Response |
|-----------|----------|
| Preamble `ok: false` | Report error → STOP |
| No review comment | Preamble errors → STOP |
| Already ready | "Already ready — no action needed." → STOP |
| `gh pmu` fails | Report error → STOP |
| User declines all | "No changes made." → STOP |
| Re-review finds new issues | Report — user can re-run |
---
**End of /resolve-review Command**
