# /work Execution Rule — Conditional Sections
**Version:** v0.101.0
**Source:** Reference/work-execution-conditional.md
On-demand companion to `08-work-execution.md` (#2765). Loaded at Step 1d only when a section below applies; the resident rule keeps every `### Step` heading as a one-line stub so the task list and this file stay in correspondence (#2763). Not a rule: never auto-loaded, never registered under `deploymentFiles.rules`.
### Step 1b: Epic Complexity Assessment
Trigger: `context.type=="epic"` and `--nonstop`. `node .claude/scripts/shared/epic-complexity.js $ISSUE`. `classification=="functional"` → `strictTDD=true`. Signals: `.claude/metadata/epic-complexity-signals.json`.
### Step 2b: Prime Sub-Issue Task List (epic/branch)
Trigger: `context.type in {epic, branch}`. After Phase 2, take the active set from the **envelope Step 1 already parsed** — no CLI call. `context.subIssues` is the full child list (active plus skipped, body/label-enriched per #2622), `context.skipped` is `[{number, status}]`, so active = `subIssues` minus `skipped`: a complete partition at zero extra round trips. For each remaining, `TaskCreate` subject `Sub-issue #N: $TITLE` with description `Per-sub-issue parent — owns AC subtasks and conditional step tasks.` Parents make compaction-recovery resume self-describing: `TaskList` alone shows active sub-issue.
**Do not re-query — and do not "repair" the old call either (#2751).** This step previously instructed `gh pmu sub list $ISSUE --json=number,title,status` then an `in_review`/`done` filter. Neither half worked, and the second is why re-querying stays wrong even corrected:
| Half | What actually happens |
|---|---|
| the call | **Errors.** `--json` is **boolean** on this subcommand and takes no value: `strconv.ParseBool: parsing "number,title,status": invalid syntax` |
| the filter | Even in the working form the output carries **no board status**. Children carry `number, title, state, url, repository`; `state` is GitHub `OPEN`/`CLOSED`, never `in_review`/`done`. An issue can be `in_review` while still `OPEN`, so the filter is **underivable** from this output |

Working form is the bare flag `gh pmu sub list $ISSUE --json`, returning `{issue, children, summary}` — an object with a nested `children` array, not the flat array "for each remaining" implied. Board status needs one `gh pmu view $N --json=status --jq='.status'` per child.
`work-preamble.js` already does both in exactly those forms — `loadSubIssues()` calls the bare form and maps `result.data.children`; `checkSubIssueStatuses()` runs the per-child view and returns `{skipped, active}`. The run has already paid for this fact; re-deriving it here creates a **second** source of truth, and the second source is the one that drifts.
### Step 2b-ii: Tree-Wide Review Gate (epic — #2748; branch tracker + `--nonstop` — #2749)
Trigger: `context.type == "epic"` (#2748), `context.type == "branch"` with `--nonstop` (#2749), or a **non-epic selection of 1..N issues** (#2750) — `/work 44`, `/work 44 47 68`, `/work --status ready`. A branch tracker worked *without* `--nonstop` skips this step and is gated per sub-issue by Step 3's Review-State Gate as before.
**Three enumerations, one decision — what "one helper, not three" means in practice (#2748, #2750).**
| Gate | Enumerates | Tracker in scope? | Drop option? |
|---|---|---|---|
| Epic (#2748) | the epic **plus** every child from `gh pmu sub list` | **yes** — an epic is reviewed | no |
| Branch tracker + `--nonstop` (#2749) | the processable set of children | **no** — nothing reviews a branch tracker | no |
| Selection, 1..N (#2750) | argv, or the `--status` query result | n/a — a selection has no tracker | **yes, at N ≥ 2** |

All three resolve states with `review-state.js` and hand an already-resolved list to `branch-review-gate.js`. The differences are carried by **which members the caller passes** and by set size, never by an issue-type test inside the helper.
Classify **every issue the run will process** before the first sub-issue is worked; raise **one** combined question over the whole set.
**Scope is the processable set**, not the tracker's children: members already `in_review`/`done` removed, preamble `skipped[]` honored, matching what Step 6a iterates. An unreviewed member the run never reaches is not a reason to stop.
**Whether the tracker itself is classified differs by type, and the reason is not symmetry:**
| Type | Tracker classified? | Why |
|---|---|---|
| **Epic** (#2748) | **Yes** | An epic *is* reviewed — own ACs, own `reviewed`/`pending` label, can carry its own findings. Excluding it lets an epic with unresolved findings drive a run of its own children. |
| **Branch tracker** (#2749) | **No** | Nothing reviews a branch tracker: no ACs, never reaches `in_review`. Classifying it returns `never-reviewed` every run and fires the gate on every invocation, training the user to dismiss it. |

The helper takes this as **data, not an issue-type test**: pass the branch tracker with `isTracker: true` and it is dropped; pass the epic without the flag and it is classified like any member. A type branch inside the helper would make it three helpers wearing one name.
**Enumeration is what the two gates do differently; the decision after it is identical.** The epic gate enumerates the epic plus every child from `gh pmu sub list`; the branch gate enumerates the processable set above. Both hand an already-resolved list to the same helper — the whole content of the "one helper, not three" decision (#2748).
**Enumerate with the form that works (#2749, corrected in Step 2b by #2751).** `gh pmu sub list $ISSUE --json=number,title,status` — the form Step 2b documented until #2751 — **errors**: `--json` is boolean, and a field list makes it `strconv.ParseBool: parsing "number,title,status": invalid syntax`. Use the bare flag and read `children[]`:
```bash
gh pmu sub list $ISSUE --json
```
Returns `{issue: {...}, children: [{number, title, state, url}]}` — nested, not a flat array, and `state` is the **GitHub** state (`OPEN`/`CLOSED`), never board status. **Board status comes from elsewhere**, one call per child:
```bash
gh pmu view $N --json=status --jq='.status'
```
This step does not re-specify the Step 2b correction; #2751 owns it. It states the contract this gate depends on, because a gate computing its scope from a call that errors classifies nothing and passes vacuously — indistinguishable from a clean run.
Resolve each member's state with `review-state.js`, then delegate — never re-derive inline:
```javascript
const { evaluateBranchReviewGate } = require('.claude/scripts/shared/lib/branch-review-gate.js');
const verdict = evaluateBranchReviewGate({ members, skipped: context.skipped });
```
`members` is `{number, state, boardStatus}` per child. `gate: false` → proceed silently. `gate: true` → **one** `AskUserQuestion` naming affected numbers, offering `/review-issue` when `neverReviewed` is non-empty and `/resolve-review` when `findingsPending` is, both in the same question when both are. **Accepting means work does not begin:** report the command and **STOP**, issues left as found. Declining proceeds with the whole run; no re-ask within the invocation, including after compaction recovery.
`indeterminate` never prompts (#2577) — blocking would let a `gh` outage stop an autonomous run. Returned in its own bucket so the pass is visible, not indistinguishable from a clean classification.
**Where a bypass is recorded differs by type — the sharper of the two asymmetries:**
| Type | On decline | Why |
|---|---|---|
| **Epic** (#2748) | **Write a note into the epic body** via `gh pmu view $ISSUE --body-stdout` → edit → `gh pmu edit $ISSUE -F` → `rm`, then continue | An epic is a durable artifact a human returns to. A bypass is a decision about its readiness, and the body is where its other decisions already live. |
| **Branch tracker** (#2749) | **Write nothing.** Continue | The body is machine-parsed for `**Processing Order:**` (#2622), so a free-text marker risks a parser with no schema for it. A branch tracker is transient — destroyed with its branch — so there is no later reader. |

**Neither recorded bypass suppresses the gate on a later run (#2748 AC8).** The epic's note records what was decided, it is not a flag the gate reads. A suppressing bypass would silence the gate long after the state that justified it changed — a sub-issue added later, or findings raised after the decline, would never surface. Re-asking costs one question; not asking costs an unattended run over issues nobody looked at. Within one invocation the decision is not repeated, for either type.
> **Why up front (#2749):** the per-sub-issue gate discovers a tracker's fourth child carrying unresolved findings only after three have been implemented, committed and moved to `in_review` — where acting costs most. `--nonstop` removes the per-sub-issue STOP where a human would notice, so this is the one moment every option is still cheap.
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
#### Step 6a: Post-Nonstop Audit
1. `node .claude/scripts/shared/nonstop-audit.js --issue $ISSUE` after all sub-issues reach `in_review`, before moving epic. Returns `{ok,warnings,blocks}` covering audit (1) commit density (warning, non-blocking, per sub-issue) and audit (2) AC checkbox (blocks — require Step 4 on flagged sub-issues).
2. **Audit (3) — coverage (skill):** Per sub-issue, invoke `tdd-refactor-coverage-audit` skill where sha is immediately before first `Refs #N` commit. Applies **No-Runtime Fallback Pattern (Pattern 4)**: Node 18+ → `node .claude/skills/tdd-refactor-coverage-audit/scripts/test-coverage-audit.js --since-commit <sha>` (primary); Node unavailable → follow skill's "Fallback Procedure" (read `resources/test-coverage-conventions.json`, run `git diff --name-status --diff-filter=A <sha>..HEAD`, apply pairing rules inline). Both paths emit equivalent advisory output (`newSources`, `pairedSources`, `missingTests[]`, `coverage`); never blocks. Skill absent → `"Skipped coverage audit: tdd-refactor-coverage-audit skill not installed."`, continue.
3. Aggregate audit output. Proceed to epic `in_review` move only after audit (2) blocks cleared.
**End of /work Execution Rule — Conditional Sections**
