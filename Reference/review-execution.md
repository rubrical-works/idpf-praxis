# Review Execution Rule
**Version:** v0.104.0
**Source:** Reference/review-execution.md
Auto-loaded execution rule for `/review-issue` and `/resolve-review` — the hybrid shell + rule architecture from #2329/#2368 applied to the review pair (#2737). Shells carry arguments, prerequisites and error handling; this carries the Workflow for both.
**Both commands are MANAGED with zero `USER-EXTENSION` blocks (#2746).** `/review-issue` carried three points — `pre-review`, `criteria-customize`, `post-review` — all retired: never filled here, 0 of 28 recipes targeted them, and the declarative need is already served by `review-criteria.json`, `review-mode-criteria.json` and `review-extensions.json`, which the preamble reads. Removes the one command spanning two deployment mechanisms, so this rule matches rule 08's shape with no exception to document. The names live on in `extension-points.json` `deprecatedExtensionPoints`, beside `/work`'s four from #2368.

**Why one rule for both.** `/resolve-review` Step 4 invokes `Skill("review-issue", "#$ISSUE --force")`, so one issue's cycle previously injected `review-issue.md` twice. Hoisting both together is what makes the cycle pay for itself in under one issue.
---
## `/review-issue` — Workflow
Multi-issue: process each sequentially through Steps 1–3.
**An epic is a multi-issue set (#2869).** Step 1's preamble returning `context.type === "epic"` for an issue typed on the command line expands it: the set is every child in `gh pmu sub list $EPIC --json` (`children[]`, ascending), then the epic (#2870), each through Steps 1–3 exactly as a directly-typed `/review-issue <child>` — own preamble, type criteria, 2a-ii body write, finalize, 3b verdict. 2a-iii carries the contract: no-re-expansion guard, cap, what an unreached child is left as, how an erroring child is reported.

### Step 1: Setup (Preamble Script)
```bash
node ./.claude/scripts/shared/review-preamble.js $ISSUE [--with extensions] [--without extensions] [--mode mode] [--force] [--prior-art]
```

**`--prior-art` is accepted here but consumed at 2a-iv, not by the preamble (#2752).** The preamble records it and makes no sweep decision; `decideFlagSweep` owns that. It was previously absent from the argument loop, so it fell through to the positional branch and was rejected as an issue number — `ok: false`, routed to **STOP** by the branch below, halting the review before any criterion ran. Any flag-shaped token the loop does not recognise is now collected into `unrecognizedFlags` and reported rather than being fatal, per `02-github-workflow.md`'s pass-through convention.
Parse JSON. Branches:
- `ok: false` → report `errors[0].message` → **STOP** (skip to next in batch)
- `context.redirect` set → invoke skill **dynamically** using `context.redirect` (strip leading `/`) — all three rows below are equally normative (#2428):

  Labels `proposal`/`prd`/`test-plan` → `Skill("review-proposal"|"review-prd"|"review-test-plan", args: "#$ISSUE [--with ...] [--mode ...] [--force] [--prior-art]")`, name derived from `context.redirect`. → **STOP**. **`--prior-art` must survive the redirect (#2725):** `/review-proposal` carries its own 2a-iv, so a dropped flag there is a typed sweep request answered with silence, the discard rule `02-github-workflow.md` forbids. `/review-prd` and `/review-test-plan` carry no prior-art criterion and report it inapplicable rather than swallowing it.
- `context.issue.state === "closed"` → ask user to confirm before proceeding
- `earlyExit: true` (has `reviewed` label, no `--force`) → report review count → **STOP**

Extract: `context` (type, reviewNumber, title, labels, body), `criteria` (common from `.claude/metadata/review-mode-criteria.json`, typeSpecific from `.claude/metadata/review-criteria.json`), `extensions`, `warnings`.

Extension loading handled by preamble via `.claude/metadata/review-extensions.json`. Unknown IDs warn; missing/malformed → standard review only.

**Step 1c: Peer Announcement — review started (advisory, #2695).** After the preamble confirms the path (no `context.redirect`, no `earlyExit`) and **before** the first criterion. At Step 1 this would announce a review that a redirect or an early exit immediately invalidates — a peer told about a review that never happened is actionable and wrong (same rule as `/work` event 1). Run `node .claude/scripts/shared/announce.js --event review-started --issue $ISSUE`, appending `--force` when this review has it. The script discovers peers itself, composes through `buildAnnouncement` and records a record-only ledger entry (#2871), so no caller unwraps `data.peers` and the #2678 mistake has nowhere to happen. `announcement.shouldSend` true → `SendMessage` per `announcement.recipients` entry with `announcement.text`, then close out with the envelope's `dispatchReport` (`--dispatch-result sent|failed --ledger-id <id>`).
**Once per issue at its own turn.** `/review-issue 42 43 44` runs the preamble per issue and any one may redirect or early-exit, so never compose one message naming the whole argument list. **An issue's turn begins after the previous issue's Step 3b verdict has been dispatched (#2879)** — opener A, verdict A, opener B, verdict B. Sending every opener first still sends one per issue, but tells peers reviews began that had not and leaves every opener unmatched until the batch ends. For an expanded epic the epic's `review-started` is sent at its own turn, after the last child's verdict, not at the preamble that triggered expansion. A workflow moment, as rule 08 states its gates — unobservable at runtime, so not enforced. **Suppressed under `--force` — by the script.** `announce.js --event review-started --issue $ISSUE --force` returns `suppressed: true`, `shouldSend: false` and the reason, recording nothing: `/resolve-review` Step 4 calls `Skill("review-issue", "#$ISSUE --force")`, so without it one run emits `review-resolved` then `review-started` seconds apart, the second describing a nested re-review. As a sentence the suppression was skippable, and #2871 observed it skipped.
**Gated by project config (#2702).** Resolve before composing: `node .claude/scripts/shared/lib/cross-session-config.js`. `groups.review` false → this event **emits nothing**, no `SendMessage` and no skip notice; the review itself unchanged. `notices` false → dispatch unchanged, the caveat and skip-reason lines not printed. Absent object, or any omitted key → enabled. **Read the resolver; never re-derive the default inline** — a second copy here is how this command and `/resolve-review` drift, and they are the two halves of one group. In the multi-issue form resolve the state **once**, not per issue: it is a project setting, and re-reading per issue invites two answers in one run. `shouldSend` true → `SendMessage` per `recipients` entry with `text`; false → report `notice` once, continue. **Advisory, fire-and-forget — nothing awaits delivery and a throwing helper must never abort the enclosing sequence.** Dispatch is not delivery (#2674).

### Step 2: Evaluate Criteria

**2a: Auto-Evaluate Objective Criteria** — for each objective criterion in `criteria.common` and `criteria.typeSpecific`, evaluate by reading issue content. Re-read `.claude/metadata/review-criteria.json` from disk (not memory) if stale. Emit ✅/⚠️/❌ with evidence using `autoCheck` field for guidance.

**2a-ii: Proposed Solution Repair + Files-to-Modify Derivation** (Bug, Enhancement, Story; NOT epic)
**(a) Repair — conditional.** Trigger: `proposed-solution` or `proposed-fix-described` is ❌/⚠️. Placeholder = under 20 chars or matches "TBD"/"To be documented"/"..."/empty. When triggered: analyze codebase, generate **Approach**, **Files to modify**, **Implementation steps**, **Testing considerations**. Present as `#### Proposed Solution (Auto-Generated)` (enhancement/story) or `#### Proposed Fix (Auto-Generated)` (bug). Otherwise content already substantive (>20 chars, no placeholder).
**(b) Derive and persist `Files to modify:` — always (#2520).** Runs for every bug/enhancement/story **regardless of whether (a) fired**. The old trigger tied the list to *repairing* a bad Proposed Solution, so a well-authored issue never got one — careful authoring guaranteed a later Step 4c halt.
- **Deficient — (a) fired:** reuse the **Files to modify** list (a) produced. Do not derive it twice.
- **Substantive — (a) skipped:** **Extract** the list from the existing Proposed Solution + codebase analysis. Do **not** regenerate a Proposed Solution; (a)'s generation path is deficient-case only.
Write into the **issue body** — review output alone leaves `scope-drift-check.js` unable to see it. **Format contract** (`extractFilesToModifySection`): header exactly `**Files to modify:**` or `**Files:**` on its own line; paths backticked. The declaration absorbs **one contiguous block — a bullet list or a table, never both** (#2813). A table IS a valid declaration and has been since #2523: markdown puts a blank line between the bold header and a table, and while nothing has been collected yet that blank continues the section. Once the block yields content the next blank line ends it, as does any `**bold:**` line or `##` heading.
So: **no blank line inside the block**, and **do not follow a bullet list with a table** — the table terminates the declaration rather than extending it. Load-bearing, not cosmetic: before #2813 any table below the declaration continued it and every backticked token in it became a declared path, and since #2788 `authoredPaths` is the only scope that can license an always-protected edit — so a row naming a protected path licensed the edit, **including a row whose prose forbade it**. The parser read the prohibition as permission.
**This paragraph previously stated the opposite** — that the section ended at the first blank line and that a table yielded empty declared scope. Both were falsified by #2523 and were still here when #2813 was filed; a reader following the old text would author a table declaration expecting it to be ignored.
**Refresh, don't append.** On re-review replace the existing section in place. Reviewing an unchanged issue twice must produce no body diff.
**Ordering is load-bearing** — same rule as 2a-iv, same reason. Write **here, before Step 3 finalize runs**. `review-finalize.js` does its own read-modify-write to increment `**Reviews:** N`; a write concurrent with or after it races that update, later write wins, loser vanishes with no error. Never write during or after Step 3, and do not "simplify" by folding this write into `review-finalize.js`. **Payoff:** a declared path is exempt from the always-protected halt (`checkDrift`'s `isProtected && !inDeclared` guard), so an issue declaring what it touches clears Step 4c without a `Scope-Override`; since #2520 a declaration no longer forces blocking mode, files added during implementation warn as growth.

**2a-iii: Epic Expansion (#2869)** — for epic type, `sub-issue-review` is satisfied by **expansion**, not inline evaluation: the children join the multi-issue set and each is reviewed as its own issue. Replaces "run review criteria recursively", which read as an invocation and meant inline evaluation whose result had nowhere to land — `review-finalize.js` ran once, against the epic, and a child's only artifact was the epic's label by propagation (removed in #2869). Children are reviewed first, so the epic's `sub-issue-review` is evaluated from their recorded outcomes: ✅ only when every child was reached, ❌ otherwise, with the roster (each child's verdict; each child not reached with its reason) as the evidence string, so the epic's own review comment records it.
**What each child receives:** exactly what a typed `/review-issue <child>` produces — structured review comment, incremented `**Reviews:** N`, and a `reviewed`/`pending` label from **its own** findings, so a failing story is `pending` under a passing epic.
**Order and tasks:** children first (ascending), epic last. The epic's preamble still runs first — it reports the type — but its Steps 2–3 wait for every child, because its `sub-issue-review` verdict and finalize comment depend on which children were reached; reviewed first (#2869), it asserted that verdict before any child ran (`/review-issue 2844 --force`, 2026-09-10). Expansion is a routing decision (`07-task-creation-timing.md`): after the epic's preamble confirms the type, create per-member step tasks in one batch — children's, then the epic's Steps 2–3 — so a compaction-resumed run knows which children remain.
**Flags apply to the whole set:** `--with`, `--without`, `--mode`, `--force`, `--prior-art` pass to every member's preamble, as for `/review-issue 42 43 44 --force`.
**A propagated label is not a review.** A child may still carry a pre-#2869 `reviewed` label with no `**Reviews:**` marker, and its preamble early-exits on the label alone. Before accepting a child's `earlyExit`, classify: `node .claude/scripts/shared/review-state.js --issue $CHILD`. `never-reviewed` → the label counts for nothing; re-run that child's preamble with `--force` and review it. `reviewed-clean` → genuine prior review, early exit stands.
**No re-expansion.** Only an issue typed on the command line is expanded. A member that arrived by expansion is never expanded again, even carrying the `epic` label — reviewed against epic criteria as one issue, its children not pulled in. Without this a nested epic recurses without bound.
**Cap: six children per invocation.** Measured on eleven-child epic #2843 (`Construction/Design-Decisions/2026-09-10-epic-review-expansion.md`): one child ≈ 12k tokens of context (preamble envelope, 2a-ii body read+write, criteria evaluation, findings, finalize), so six ≈ 75k on top of the epic's review and resident rules; eleven does not fit a 200k window. Children beyond the cap are **not reached**, in number order, so the same six are reached each run until the rest are reviewed.
**A child not reached is left exactly as found** — capped, interrupted, or failed: no label, marker or comment. `review-state.js` classifies it `never-reviewed` and `/work` stops on it. Never label, mark or comment on a child whose review did not run.
**A child that errors is reported against the child, not the epic.** Preamble `ok: false`, finalize failure or mid-review `gh` error → roster entry with the child's number and message; continue with the next child. The epic's own review — criteria, finalize, verdict — is unaffected by any child's failure.
**The roster is the epic's closing report** (Step 4): every child reviewed with verdict, every child not reached with reason — `expansion cap (6)`, `interrupted`, `error: <message>` — and the command finishing the set.
`construction-context` unchanged: scan `Construction/Design-Decisions/` and `Construction/Tech-Debt/` for files referencing the children's numbers. None found → report gracefully.

**2a-iv: Prior-Art Sweep When Marker Absent (#2517)**
Trigger: `prior-art-checked` criterion evaluates ❌ (marker absent, or `PARTIAL` — an incomplete sweep, treated as absent and re-swept), **OR `--prior-art` was passed** (#2725) — the automatic path below, the explicit one after it.
Delegate the decision; do not re-derive it:
```bash
node -e "console.log(JSON.stringify(require('./.claude/scripts/shared/lib/prior-art-marker.js').decideSweep({body:BODY,createdAt:CREATED_AT,reviewSweep:REVIEW_SWEEP})))"
```
**Arguments — substitute from the named source; never leave a literal placeholder.** `BODY` ← `context.issue.body`; `CREATED_AT` ← **`context.issue.createdAt`** (ISO 8601, added #2539); `REVIEW_SWEEP` ← returned `mode` from **materializing an absent `reviewSweep` first (#2564)**: `node -e "console.log(JSON.stringify(require('./.claude/scripts/shared/lib/framework-config.js').ensureReviewSweep(process.cwd())))"` → `{written, mode}` — second writer alongside Praxis Hub Manager (install/upgrade) so pre-existing projects converge without reinstall; writes through the validating writer, never raw `fs`, and leaves a legacy boolean alone since migration is read-time.
**`createdAt` decides whether the criterion means anything.** `isExemptFromSweep` treats an absent/unparseable value as exempt — the safe direction, but it makes `decideSweep` return `not-applicable` for *every* unmarked issue. Before #2539 the preamble emitted no such field, so that is exactly what happened. Never substitute a hand-entered date. On a `CREATED_AT_UNAVAILABLE` preamble warning, say so in the criterion rather than reporting a bare `not-applicable`: the timestamp could not be established, so the sweep was not skipped on the merits. Returns `{sweep, status, reason}`. Report the criterion with that `status`; act on `sweep`.
| status | Action |
|---|---|
| `pass` | Complete marker present — no sweep, no write |
| `fail` | Marker absent or `PARTIAL` — run the sweep |
| `recommend` ⚠️ | mode `recommend` (default), no complete marker — **no sweep, no write**. Report ⚠️ with the `formatSweepAdvisory()` text naming the runnable command. **Not** ❌: `--prior-art` is opt-in and rarely passed, so most issues carry no marker and ❌ would downgrade nearly every review for a sweep never meant to run automatically. Does not affect the recommendation |
| `skip` ⊘ | mode `flag-only` or `off` — no sweep, no write. Report ⊘, **not** ❌, which would downgrade every review in a project that opted out |
| `not-applicable` | Predates the feature (pinned cutoff) — no sweep; absence is meaningless for what could not be swept |
**Explicit `--prior-art` — this decides, not the table above (#2725).** `node -e "console.log(JSON.stringify(require('./.claude/scripts/shared/lib/prior-art-marker.js').decideFlagSweep({reviewSweep:REVIEW_SWEEP})))"` → `{sweep, refused, mode, message}`. `full`/`recommend`/`flag-only`/absent → **sweep**. `off` → no sweep, no write; report ⊘ with `message` **verbatim**, then **continue the review** — never halt. A refusal the user cannot see is the silent no-op the flag exists to remove.
**Three interactions, decided here rather than left to the implementer**, all following from `decideFlagSweep` taking **only** `reviewSweep`: it never receives the body or the timestamp, so no automatic short-circuit fires on the explicit path. That is intended, not an oversight to patch.
| Interaction | Decision |
|---|---|
| **Marker** | **Forces a re-sweep** even when `classifyMarker(body)` is already `complete`. A stale marker is the main reason a human asks for a sweep; refusing because one exists makes the flag useless exactly when it is wanted |
| **Cutoff** | **Overrides** `isExemptFromSweep(createdAt)`. That exemption stops *automatic* sweeping stamping markers into pre-feature issues; an explicit request is not automatic, and the date is not what the user is asking about |
| **Criterion trigger** | **Sweeps regardless of issue type.** `prior-art-checked` is defined in `review-criteria.json` for `enhancement` only, so `bug`, `story`, `epic` and `generic` have no ❌ to fire on. A flag effective on one type of five is the silent-drop failure on a second axis |
On a type with no `prior-art-checked` criterion do **not** invent one: sweep, write the section, and report findings as a standalone `**Prior Art:**` observation. `review-criteria.json` fixes the criterion list; this step does not extend it.
**Sweeping:** run the #2514 procedure, reading `.claude/metadata/prior-art-sweep.json` for surfaces, excludes, term derivation, dispositions and body formats — none restated here.
**Output:** findings in the review; write `**Prior Art:**` into the body via `insertPriorArtSection` from the same helper.
**Ordering is load-bearing.** Write **here, before Step 3 finalize**, so `review-finalize.js`'s read-modify-write for `**Reviews:** N` reads a body already containing the section. A write concurrent with or after finalize races it — both read-modify-write the same body, later wins, loser vanishes with no error. Never write during or after Step 3.
**Recommendation:** prior art duplicating the issue's scope is blocking — `Needs revision` or stronger, not a passing note.
**Missing config:** `prior-art-sweep.json` missing/unreadable → report criterion, warn, skip sweep. Do not fail the review.

**2a-v: Branch Auto-Assignment for Test-Plan and PRD Issues (#2657)** — trigger: issue carries a `test-plan` or `prd` label **and** has no branch assignment; `/create-prd` creates both unassigned, so until close the tracker does not know they exist and `/done --all` cannot discover an in-review test plan. **Reported, not prompted** (unlike `/create-prd` Step 3a): reviewing an issue is already working it on this branch, so no decision remains. Delegate, do not re-derive: `node .claude/scripts/shared/assign-branch.js "$ISSUE"`. **Ordering is load-bearing** — same rule as 2a-ii and 2a-iv, same reason: assign **here, before Step 3 finalize runs**, because `review-finalize.js` does its own read-modify-write to increment `**Reviews:** N`, so a write concurrent with or after it races that update, later write wins, loser vanishes with no error. **No open tracker for the current branch → report and continue** that the issue remains unassigned; **never create a branch from a review** — `/assign-branch` owns `gh pmu branch start`. **Already assigned → leave it**: an issue assigned to a different branch is **not moved**; report the existing assignment.
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
**`type`:** issue type from preamble `context` — `bug`, `enhancement`, `story`, `epic`, or `generic`. Issue-shaped types produce a `## Issue Review #N` header and keep positional AC check-off (on an issue the checkbox list **is** the reviewed AC list). NEVER write `prd`, `proposal`, or `test-plan` here (#2594).

```bash
node ./.claude/scripts/shared/review-finalize.js $ISSUE -F .tmp-$ISSUE-findings.json
```
Finalize handles: body metadata (`**Reviews:** N` increment), structured comment posting, label assignment (`reviewed`/`pending`) **to the reviewed issue only** — no label reaches a sub-issue from here (#2869); a child's label comes from its own finalize when the epic expands (2a-iii). Clean up temp file. Report summary from output.

For non-`--with` runs, append the preamble's `criteria.availableTip` **verbatim** — composed from registry keys, so this rule names no domain ids and cannot go stale against the registry (#2812); three prose copies each listed 8 against a registry of 11, leaving the surplus three accepted if typed and advertised nowhere. `null` = no readable registry: emit nothing, not an empty list. **Never re-introduce the list, not even as an example** — `tests/reference/review-extensions-registry.test.js` fails on any line naming three or more ids, in the source and in every generated copy.
**Extensions Applied** in review comment lists only domains producing findings (omit empty). At least one domain section must appear when `--with` used; if none produce findings, fall back to standard review with warning.
**Step 3b: Peer Announcement — the review verdict (#2722, #2781).** **Every review emits exactly one verdict event, so `review-started` is always closed.** `determineLabel()` returns exactly one of `reviewed` | `pending`, and each has an announcement:
| `labelAssigned` | Event | Terminal? |
|---|---|---|
| `reviewed` | `review-passed` (#2722) | **yes** — nothing follows, a peer can stop waiting |
| `pending` | `review-findings` (#2781) | **no** — a resolution cycle may or may not follow |
| `null` | **nothing** | n/a — the swap failed (#2694) |
**Silence therefore has exactly one meaning: no review ran, or `groups.review` is off.** Before #2781 it also meant "the review found problems", which is what made it useless — a vocabulary where silence already means *dispatched but not delivered* (#2674) cannot carry a third sense.
Sub-step of Step 3, firing per issue right after that issue's finalize returns — not `Step 3a`, which runs once after every issue. Run `node .claude/scripts/shared/announce.js --label-assigned <labelAssigned> --issue $ISSUE` with finalize's `labelAssigned` verbatim: the script applies the table — `reviewed` → `review-passed`, `pending` → `review-findings`, `null` → `suppressed: true` with the reason — and refuses `--event` beside it, so the caller never chooses the event (#2871). `announcement.shouldSend` true → `SendMessage` per `announcement.recipients` entry with `announcement.text`, then close out with the envelope's `dispatchReport` (`--dispatch-result sent|failed --ledger-id <id>`).
**`review-passed` trigger: the finalize envelope reports `labelAssigned === 'reviewed'`.** Nothing else — the `pending` branch is below. `determineLabel()` returns exactly one of `pending` | `reviewed` and the swap replaces rather than adds, so that value *is* the specified success condition — `reviewed` applied, `pending` removed or never applied — with no second check needed. **The label, never the recommendation string.** `determineLabel()` tests `startsWith('Ready')`, which also admits `Ready with minor revisions`; this command's enum (2d) has exactly one `Ready*` value, so the label is an exact proxy here **and only here**. A recommendation-keyed trigger reads as equivalent and is wrong the moment it is copied — which is why `/review-prd`, `/review-proposal` and `/review-test-plan` deliberately do **not** emit this: same gap, wider enum, needing a stricter predicate rather than a copied trigger.
**`pending` emits `review-findings`; a failed swap still emits nothing (#2781).** The same invocation — `--label-assigned pending` or `null` — composed, gated and dispatched exactly as `review-passed`: same `groups.review` lever, same once-per-issue cadence, same fire-and-forget discipline. Two deliberate differences: **it is NOT terminal and its text must not claim finality** (`pending` is genuinely open-ended — `/resolve-review`, abandonment, or nothing may follow — so it carries no *"No further announcement will follow"* sentence and is absent from `TERMINAL_EVENTS`); and **it closes `review-started` all the same**, because closing an opener and promising what follows are separate axes. `labelAssigned: null` means the swap failed (#2694); emitting there would announce an outcome that did not happen.
> **Why this does not overturn #2722, which declined a pending counterpart:** its reason was that *"adding one would assert a completeness the sender cannot have"* — correct about a **terminal** pending event, silent about a non-terminal one. #2716 had already separated the axes when it moved `armed` out of the terminal outcomes so a follow-up could come. **Do not "harmonise" the review events by adding `REVIEW_FINDINGS` to `TERMINAL_EVENTS`** — that re-asserts the completeness #2722 correctly refused, and a guard test fails on it.
**Mixed-version peers are unaffected, because no receiver parses an event name (#2781).** Announcements travel as plain prose through `SendMessage`; `KNOWN_EVENTS` is consulted only inside `buildAnnouncement`, in the **sending** session's own process against its own vocabulary. A peer on an older framework receives a readable sentence and never consults its own `EVENTS` set. The only consumer anywhere matching on an event *name* is `/overwatch`, and it enumerates the vocabulary in **two** places rather than reading `EVENTS`: `.claude/metadata/overwatch-signals.json` `observation.events`, and the **Events consumed** list in its own command spec, which `overwatch.test.js` asserts against `Object.values(EVENTS)`. Both are part of adding any event; the spec list is the one that gets missed. An older monitor still receives the message and simply does not classify it.
**Terminal, and the text says so** — alone among the four review events nothing follows `review-passed`, so a peer can stop waiting; a `terminal` flag no reader of the message ever sees is not a closer.
**NOT suppressed under `--force` — the opposite of Step 1c, deliberately.** There, suppression stops `/resolve-review` Step 4's nested `Skill("review-issue", "#$ISSUE --force")` announcing a re-review as fresh. Here it fires on **both entry paths**, because that nested re-review is exactly how a resolve cycle reaches `Ready for work`; suppressing it would silence the event on the path that most needs it. **No double-emission:** `/resolve-review` never emits this itself, and there is exactly one finalize call per issue per review — so once per issue at its own turn, never twice and never batched across the argument list.
**Gated by `groups.review`, resolved once per invocation** — reuse Step 1c's resolution rather than re-reading `cross-session-config.js`, so one run cannot gate its opener and its closer differently; that read happens even when `--force` suppresses Step 1c's event, because `--force` suppresses an event, not a read. Group false → emits nothing, no `SendMessage` and no skip notice. `shouldSend` true → `SendMessage` per `recipients` entry with `text`; false → report `notice` once, continue. **Advisory, fire-and-forget — a throwing helper must never abort Step 3.** Dispatch is not delivery (#2674).

### Step 3a: Interdependence Analysis (Multi-Issue Only)
Trigger: 2+ issues reviewed AND all eligible per `typeFilter` in `.claude/metadata/review-interdependence.json` — read the eligible/excluded sets from that file; excluded wins. Do not restate them here; a prose copy is data nothing keeps in sync (#2683).
**Expanded epic: the children are the set, the epic is excluded (#2869).** `reviewedIssues` holds the **children only**. `typeFilter.excluded` covers the epic type and this step requires every member eligible, so the whole expanded set returns all-eligible false and the analysis is silently skipped — indistinguishable from one that found nothing. The exclusion is right: a container's scope necessarily overlaps its children's, and reporting that is noise. Run over 2+ reviewed children; findings go into the epic's closing report (Step 4) beside the roster.
After all individual reviews complete:
```javascript
const { analyzeInterdependence, isEligibleForInterdependence } = require('.claude/scripts/shared/review-interdependence.js');
// `labels` accepts both shapes: ['story'] or [{name:'story'}] (#2682)
const allEligible = reviewedIssues.every(i => isEligibleForInterdependence(i.labels));
if (allEligible) {
  const result = analyzeInterdependence(reviewedIssues);
}
```
`reviewedIssues` = array of `{ number, title, type, labels, body }` collected during reviews. `labels` is normally `context.issue.labels` from that issue's preamble envelope, passed through unaltered — `{name}` objects, **not** strings; do not flatten. Input it cannot read warns rather than returning a bare `false` (#2682).
Report: **Overlap** (shared scope), **Ordering** (suggested order + rationale), **Conflicts** (contradictory requirements), **Shared Criteria** (ACs in multiple issues).
If findings exist, report them with the suggested order and ask whether to update the issues with cross-references (y/n); on acceptance add `Refs #N` notes to related issue bodies. No findings → `"No interdependence detected between reviewed issues."` and continue.

Configuration: dimensions and `typeFilter` in `.claude/metadata/review-interdependence.json` (config-driven; add to `eligible`/`excluded` to customize). Single-issue: skipped; an epic with one reviewed child too.

### Step 4: Closing Notification and Cleanup
Two parts in order; the prune is **part of** this step, not a trailing step a reader can stop before. **(1)** Output `closingNotification` from finalize. Multi-issue: `"Reviews complete: #42, #43, #44"`. **Expanded epic (#2869): the notification is the roster** — every child reviewed with verdict, every child not reached with reason, the children-only interdependence result, and the command finishing the set:
```
Reviews complete: #<epic> (epic) and 6 of 8 children
  Reviewed: #101 reviewed · #102 pending · …
  Not reached: #107 — expansion cap (6) · #108 — expansion cap (6)
  Interdependence (children): <findings summary, or "none detected">
Finish the set: /review-issue #107 #108
```
An unreached child keeps no review label, so `/work` stops on it until reviewed; an errored child appears under `Not reached` as `error: <message>`, the epic's own line unaffected. **(2) Prune the task list** (unconditional — every path, including redirect and early-exit paths where Phase 1 created a preamble task and Phase 2 never ran): `TaskList` to enumerate, then `TaskUpdate status=deleted` for every task owned by this `/review-issue` invocation (Phase 1 preamble, Phase 2 step tasks). Do **not** delete tasks created outside this invocation (user TODOs). Nested via `Skill("review-issue")` from `/resolve-review`: the prune still runs; the parent's sweep becomes redundancy.

---
## `/resolve-review` — Workflow
**Multi-issue:** `/resolve-review 42 43` resolves each issue in turn, each through Steps 1–4 (#2879); issue N's cycle ends with its Step 4 re-review verdict, and issue N+1 begins after it.
**Expanded epic (#2872).** Step 1's preamble returning `context.type === "epic"` for an issue typed on the command line expands it: the set is every child in `gh pmu sub list $EPIC --json` (`children[]`, ascending), then the epic — **children first (ascending), epic last**, as § 2a-iii orders review, because the epic's `sub-issue-review` verdict depends on its children's state. Only a typed issue expands; a member that arrived by expansion is never expanded again.
**Classify each child first** — `node .claude/scripts/shared/review-state.js --issue $CHILD`: `findings-pending` → resolved through Steps 1–3a exactly as a typed `/resolve-review <child>`; `reviewed-clean` → skipped, reported clean; `never-reviewed` → nothing to resolve, reported naming `/review-issue`; `indeterminate` → preamble attempted, an `ok: false` reported against the child. **"Already ready" is whole-set:** it applies only when the epic and every child are clean — a `Ready for work` epic over `findings-pending` children does not exit.
**The re-review runs once**, after the epic (the last member) is resolved: `Skill("review-issue", "#<epic> --force")`. Never per member — `Skill` does not return (#2869), so a per-member call ends the loop at the first child; and no narrower `#c1 #c2 #<epic> --force` list, because typing the epic re-expands it under § 2a-iii. Clean children are therefore re-reviewed too — accepted, and said. **Errors stay with the child:** a failing preamble, declined findings or an unreached child is reported against that child and left as found; the epic is still resolved last. `review-resolved` fires once per member at its own turn (Step 1c's turn definition), `groups.review` resolved once per invocation; per-member tasks are created in one batch after the epic's preamble (`07-task-creation-timing.md`).
**Resolve cap: three `findings-pending` children per invocation.** Measured on six children of #2843 (`Construction/Design-Decisions/2026-09-10-epic-review-expansion.md`): resolving a child ≈ 8k tokens on top of its ~12k re-review, so six pending with the epic and resident rules ≈ 185k, three ≈ 160k. Beyond the cap pending children are not reached, in number order; the re-review still covers § 2a-iii's six, and the next run resumes because a resolved child re-reviews `reviewed-clean`. **The closing report is a roster:** `Resolved: #101 (3 findings) · …`, `Skipped: #103 — reviewed-clean · #104 — never-reviewed, run /review-issue #104`, `Not reached: #105 — resolve cap (3)`, the re-review's result, and `Finish the set: /resolve-review #<epic>`.
### Step 1: Setup (Preamble Script)
```bash
node ./.claude/scripts/shared/resolve-preamble.js $ISSUE
```
Parse JSON. `ok: false` → report `errors[0].message` → **STOP**.
`earlyExit: true` (recommendation "Ready for") → "Already ready — no action needed." → **STOP**.

**Step 1a: Peer Announcement — review resolved (advisory, #2695).** After the early-exit check above: no findings means no resolution cycle, and announcing one that did not begin is what the placement rule prevents. In the multi-issue form, `review-resolved` for the next issue is not sent before the current issue's re-review verdict (#2879) — Step 1c's turn definition, applied to the resolution cycle. Run `node .claude/scripts/shared/announce.js --event review-resolved --issue $ISSUE`.
**The script discovers peers itself** and records a record-only ledger entry (#2871), so no caller unwraps `data.peers` — the #2678 mistake, which reported "no peers in this working directory" while two were live and reachable, has nowhere to happen. `announcement.shouldSend` true → `SendMessage` per `announcement.recipients` entry, then close out with the envelope's `dispatchReport`.
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
Then invoke re-review with `--force`, appending `--prior-art` when it was passed to this command (omit the trailing flag otherwise; `--force` is unconditional):
```
Skill("review-issue", "#$ISSUE --force --prior-art")
```
**Pass-through only (#2725).** No sweep logic here: no `decideFlagSweep`, no `reviewSweep` read, no `**Prior Art:**` write. `/review-issue` owns that decision at its 2a-iv, and re-implementing it would give one workflow two answers to the same question. Forwarding matters because the re-review is the only sweep opportunity in a resolve cycle — a flag dropped here is a typed sweep request answered with silence. Under `reviewSweep: off` the refusal surfaces from the nested re-review, which reports the message and **continues**; nothing is refused here and the cycle does not halt.
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

---
**End of Review Execution Rule**
