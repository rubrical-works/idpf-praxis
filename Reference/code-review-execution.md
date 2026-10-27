# /code-review Execution Reference
**Version:** v0.112.0
**Source:** Reference/code-review-execution.md
`/code-review` Workflow (Steps 2–12), hoisted out of the shell (#3230) on the `/work` (#2368) / `/review-issue` (#2737) shell + execution-reference pattern. The shell `CommandsSrc/code-review.md` keeps Prerequisites, Arguments, Step 1 parsing, Error Handling and closing cleanup.
**Why a file, not a command call.** Skill does not return; a file is executed inline in the same turn and the caller continues — so `/prepare-release` and `/prepare-beta` run the diff review from their Branch Diff Review Gate (§ Release Review Gate) instead of asking for a second command.
**This is not a rule.** Read on demand from `{frameworkPath}/Reference/code-review-execution.md` by `/code-review`, `/prepare-release`, `/prepare-beta`; never register it under `deploymentFiles.rules` — an auto-loaded copy adds the review procedure to every session in every project. Ships like any `Reference/` document (`deploy-dist.yml` → hub root).
## Execution Instructions
**Two entry paths, one procedure.**
| Entry | Arguments | Ends with |
|---|---|---|
| **Standalone** — `/code-review` shell, after Step 1 | Whatever Step 1 parsed | Shell closing cleanup (prunes, STOPs) |
| **Inline** — § Release Review Gate (`/prepare-release`, `/prepare-beta`) | `--diff <ref>`, `<ref>` = the gate's resolved base; no other flag | Step 12 prunes the review's own tasks, hands back to the gate |

**Task list.** One task per numbered step, each with subject prefix `code-review:` (e.g. `code-review: Step 6 Per-File Review`); mark `in_progress` → `completed`. The prefix marks what this review owns: an inline run shares the list with the calling command, whose tasks never carry it.
**Post-compaction.** Re-read this file, call `TaskList`. After compaction mid inline review, resume from the first incomplete `code-review:` task, without re-routing and without re-running the calling command's completed steps; the gate continues from its re-check once Step 12 hands back.
**Ending the review early.** Where a step says *end the review*, skip to Step 12. Standalone, the shell's cleanup reports and STOPs; inline, the gate decides what the early end means. This file never stops the calling command.
## `/code-review` — Workflow
### Step 2: Load Manifest
Read `.code-review-manifest.json` (project root); **Read** `.claude/scripts/shared/lib/code-review-manifest-schema.json` for structure, required fields, status enum. Not found → create empty (first run); malformed → warn, continue as `--full`.
**Unfiled queue first (#3049).** `node .claude/scripts/shared/file-issue.js --manifest .code-review-manifest.json --list`. Non-empty `unfiled` (`filingQueue` `queued`/`failed`) = approved findings an interrupted, compacted or failed run never filed: report, offer via `AskUserQuestion` to file now (Step 8 item 5) before reviewing; decline leaves them queued. Also answers "next" after an interrupted Step 8.
### Step 2b: Status Report (--status)
Read manifest, run discovery for counting only, report approved/flagged/pending/deferred/new counts; directory breakdown if >20 files. **`--diff --status`:** count the diff set only (Step 3), name base ref + SHA. Then end the review. Never reached inline (the gate passes no `--status`).
### Step 3: Discover Source Files
Scan with Glob. Resolve default include patterns from charter tech stack:
1. `detectTechStack(projectRoot)` from `.claude/scripts/shared/lib/detect-tech-stack.js`
2. `getGlobPatternsForTechs(techs)` from same module
3. Cross-reference CHARTER.md tech stack; include any additional patterns

**Read** `.claude/metadata/code-review-excludes.json`; flatten `categories[].directories` into the exclude set. `env: "dev"` only in `idpf-praxis-dev`, `env: "deployed"` only in user projects, omitted = both. Tests always excluded (`/bad-test-review`). `--scope` → those globs instead (excludes still apply).
**`--diff [<base>]`:** `changedFilesSinceBase({ cwd, base, includeWorkingTree: true })` (`.claude/scripts/shared/lib/branch-diff.js`) — never hand-compose `--scope` globs. Returns `{ ok, base: { ref, sha }, files, deleted, renamed, ranges, workingTreeIncluded }`; `ok: false` → report `error`, end the review (Error Handling). No `<base>` → nearest merge-base over `origin/HEAD`, `origin/main`, `origin/master`, `main`, `master`; `<base>` → sole candidate, unresolvable ends the review. **Intersect** discovery with `files` (patterns + excludes apply, deleted dropped, renames → destination, `--scope` intersects too). Empty → empty-diff message, end the review. Hold `base`, `ranges`, `workingTreeIncluded` for Steps 6, 9, 10, 11.
**Inline:** the gate passes its resolved ref. A `base.sha` differing from the gate's → report both SHAs, end the review; the gate STOPs on the missing record rather than accept another range.
### Step 4: Filter by Manifest (Incremental Mode)
SHA-256 each file, compare to manifest:
| File State | Manifest | Hash | Action |
|------------|----------|------|--------|
| New | Absent | — | **Queue** |
| Existing | `approved` | Yes | **Skip** |
| Existing | `approved` | No | **Queue** re-review |
| Existing | `flagged` | Yes | **Skip** unchanged |
| Existing | `flagged` | No | **Queue** re-review |
| Existing | `deferred` | Any | **Skip** |
| Deleted | Present | — | **Remove** |

**Charter change** (CHARTER.md hash differs) → re-review all. **Domain change:** `--with` queues files approved without a requested domain. **`--full`:** queue all discovered.
**`--diff`:** table applies unchanged to the diff set (changed file `approved` with matching hash → skip). **`--diff --full`** queues the whole diff set regardless of manifest.
### Step 5: Load Charter-Aligned Review Criteria
Read `CHARTER.md` for goals, conventions, quality, tech stack, security.
| Category | Checks |
|----------|--------|
| **Correctness** | Logic, edge cases, off-by-one, null |
| **Security** | Injection, XSS, auth bypass, data exposure, OWASP top 10 |
| **Maintainability** | Complexity, duplication, coupling, cohesion, readability |
| **Naming** | Charter standards |
| **Error handling** | Missing try/catch, unhandled promises, silent failures |
| **Documentation** | JSDoc/docstrings per charter |
### Step 5b: Skill Loading
Check `projectSkills` in `framework-config.json`. Re-read `.claude/metadata/skill-keywords.json` and match keywords. Skills load lazily — supplementary only.
### Step 5a: Charter-Aware Domain Filtering
When `--with all`/`--with <domains>`:
1. `activeDomains` in `framework-config.json` **configured** → precedence (intersect requested)
2. Absent **or empty array** → `CHARTER.md` (Tech Stack, In Scope) + `.claude/metadata/domain-signals.json`
3. Call `filterDomainsByCharter(requestedDomains, charterContent, domainSignalsJson, config)` from `load-review-extensions.js`
4. Log skipped: `"Skipping {domains} — not applicable per {source}"`; pass applicable to Step 5c

`--with all` = all applicable. `domain-signals.json` missing/malformed → no filtering.
**`activeDomains` differs from `/review-issue` (#2810):** here a **narrowing filter** (subtracts from `--with`); there `resolveAutoInclusion` reads it as **additive** (loads domains without `--with`) — an open design question, recorded.
**An empty array is "not configured", never "nothing applies."** `Array.isArray([])` is true, so `[]` once took step 1 and `--with all` returned **zero** domains. `[]` (the default) falls through to charter inference, like an absent key.
**Read only when `--with` was passed — a recorded decision (#2810).** No `--with` → step does not run; additive would change what `/code-review` loads for every project — its own negotiation. **Consequence:** `/charter`'s "auto-apply" claim holds for `/review-issue`, not `/code-review`.
### Step 5d: Domain Suggestion (--suggest)
If `--suggest` (mutually exclusive with `--with`):
1. Read `CHARTER.md` + `.claude/metadata/domain-signals.json`
2. `suggestDomains(charterContent, domainSignalsJson)` from `load-review-extensions.js`
3. `AskUserQuestion`: Accept suggested / Modify selection / Skip domains, with per-domain relevance reasoning
4. Accept → `--with` pipeline (5a → 5c); Modify → user specifies; Skip → standard review only
### Step 5c: Domain Extension Loading (--with)
If `--with` (or `--suggest` domains accepted):
1. Read `.claude/metadata/review-extensions.json`
2. Parse: `all` = 8 extensions, or comma-sep
3. Call `loadCodeReviewExtensions(projectDir, domainIds)` from `./.claude/scripts/shared/lib/load-review-extensions.js`
   **Return:** `{ ok, domains: { [id]: { description, domain, questions: string[] } }, warnings }` — `ok: false` → log `error`, fallback standard; `ok: true` → iterate `Object.entries(result.domains)`; report `warnings` (non-blocking)
4. Use `questions[]` per domain as Code Review Questions
5. Unknown IDs: warn with list derived from the loaded `.claude/metadata/review-extensions.json` registry (source of truth — do not hardcode).

**Error:** all non-blocking → standard review (unknown ID skipped, missing criteria file/no Code Review Questions skips the domain, missing registry falls back). No `--with` → skip.
### Step 6: Per-File Review
Read each queued file; record per finding:
| Field | Description |
|-------|-------------|
| File path | Relative |
| Line range | Start-end |
| Category | correctness/security/maintainability/naming/error-handling/documentation/domain |
| Severity | `high`/`medium`/`low`/`info` |
| Description | Issue |
| Recommendation | Fix |

**Severity:** High=security/correctness bug; Medium=maintainability/convention; Low=style/naming; Info=suggestion.
`--with`: after standard review apply domain criteria, tag with domain; may escalate, never downgrade.
**`--diff`:** whole file still read. `classifyFindingRange(ranges, file, startLine, endLine)` from `branch-diff.js`: range **entirely outside** the branch's changed ranges → tag `pre-existing`; inside/overlapping → `introduced`. Tag, never suppress.
### Step 7: Batch Mode Support
`--batch N`: limit N per invocation, save manifest, report progress.
### Step 8: Issue Creation
**MANDATORY:** All issue creation goes through `.claude/scripts/shared/file-issue.js` (the `/bug`/`/enhancement` path). Never raw `gh pmu create` or `gh issue create` — no template or priority handling; the bare form files off the board.
**One turn for the whole batch (#3049).** Do **not** invoke `/bug`/`/enhancement` per finding: `Skill` does not return and `/bug` STOPs, so a loop files one issue per turn (rule 02).

| Finding Type | `type` |
|-------------|--------|
| Correctness/security defect | `bug` |
| Missing error handling, refactoring, convention | `enhancement` |

| Severity | `priority` |
|----------|-----------|
| high | `p1` |
| medium, low | `p2` |

1. Present findings summary
2. `AskUserQuestion`: per finding, per group, or skip
3. Group findings sharing a root cause into one entry
4. Write approved entries — `{type, title, priority, fields, labels, source: {file}}`, `fields` from the finding (description, actual behavior, proposed fix/solution, acceptance criteria) — to `.tmp-code-review-queue-{random}.json` (suffix shelled out, `05-windows-shell.md`), **enqueue**: `node .claude/scripts/shared/file-issue.js --manifest .code-review-manifest.json --enqueue <that file>`; `rm` it
5. **File the queue** same turn: `node .claude/scripts/shared/file-issue.js --manifest .code-review-manifest.json` — files every unfiled entry, rewrites the manifest after each, appends each number to its `source.file`'s `issueRefs`
6. Report each result (number + priority, or error). Relay `gatesNotApplied` once — `verificationGate`/`phaseFeasibility` are judged by `/bug`/`/enhancement`; `/review-issue` a filing to apply them
Exit 1 = an entry failed: stays `failed`, re-offered by the next Step 2; never re-file a `filed` entry by hand. **A partial failure does not end the review:** reported, left `failed`; Steps 9–10 still run, the record written with only filed numbers in `issues`.
**Skipping every filing is a complete answer:** `issues` is `[]`; severity counts still come from Step 6's tags — the gate reads counts, not filings.
**Info-level findings** reported but not offered as issues.
### Step 8b: Security Finding Label
`--with security`/`--with all` and any security finding ⚠️/❌ → label each issue from security findings:
```bash
gh issue edit $ISSUE --add-label=security-finding
```
All security findings ✅ → do not apply.
### Step 9: Structured Report
Save to `Construction/Code-Reviews/YYYY-MM-DD-report.md` (create dir) **after** issue creation: summary, findings by severity with issue #s, per-file status, aggregate statistics. Each finding: `Issue: #1234` or `No issue` (info). Add an **Issues Created** section.
**`--diff`:** open with base ref, its SHA and range reviewed (`<baseSha>..HEAD`, + `working tree` when `workingTreeIncluded`); mark `pre-existing` findings.
### Step 10: Manifest Update
1. Write `.code-review-manifest.json`
2. Update `charter.contentHash`
3. Status: no findings→`approved`, findings→`flagged`
4. Record `reviewedAt`, `findingCount`
5. Record `domains` when `--with` active (merge, not replace)
6. Preserve skipped; remove deleted
7. **`--diff` only:** write `lastDiffReview`, **replacing** any previous: `baseRef`, `baseSha` (Step 3 `base`), `headSha` (`git rev-parse HEAD`), `reviewedAt` (ISO), `workingTreeIncluded`, `filesReviewed`, `findings.introduced` + `findings.preExisting` (`{high, medium, low, info}` from Step 6 tags), `issues` (Step 8 numbers, `[]` if none), `domains` when `--with`. Shape: `lastDiffReview` in the manifest schema; complete and current to this run — the consumer owns the policy.
### Step 10a: Commit Review Output (`--diff` only, #3183)
Commit this run's output so the review leaves a clean tree. § Release Review Gate decides freshness with `reviewRecordFreshness` (`branch-diff.js`): a commit changing only review output (`.code-review-manifest.json`, `Construction/Code-Reviews/**`) keeps the record current; `headSha` stays the reviewed commit.
- **Default branch** (resolved as Step 3) → do not commit; report `Review output not committed: <branch> is the default branch. Commit it from a working branch.` → Step 11.
- **Pathspec only** (`<report>` = Step 9 path):
  ```bash
  git add -- .code-review-manifest.json <report>
  git commit -m "chore: record <YYYY-MM-DD> code review (--diff)" -- .code-review-manifest.json <report>
  ```
  Other staged changes stay staged and are not committed. Never `git add -A` or a bare `git commit`.
- Nothing changed → report `Review output already committed.`, continue.
- A failed commit is reported verbatim and never retried; review stays complete, record and report left in the working tree (gate accepts them only with `workingTreeIncluded` true or an otherwise clean tree).
Step 11 names the outcome (short SHA, or skip/failure reason).
### Step 11: Final Summary
```
Code Review Complete
--------------------
Files reviewed: N
Findings: X (H high, M medium, L low, I info)
Issues created: Y
Report: Construction/Code-Reviews/YYYY-MM-DD-report.md
Manifest: .code-review-manifest.json updated
Next: Run --status to see cumulative progress
```
**`--diff`:** add `Base: <ref> (<sha>), range <sha>..HEAD[ + working tree]` and `Pre-existing: P` after Findings; `Committed: <sha>` or Step 10a's skip/failure reason after Manifest. **Inline:** omit the `Next:` line; the gate's report follows.
### Step 12: Hand Back
**Standalone:** return to the shell's closing cleanup (prunes and STOPs); nothing pruned here, so the prune runs once.
**Inline:** this is the inline review's closing cleanup; the prune is **part of** it — unconditional, every path incl. an early end:
1. `TaskList` — enumerate all tasks.
2. For every task carrying the subject prefix `code-review:` that this inline review created, `TaskUpdate status=deleted`.
3. Never delete the calling command's tasks or any task created outside this review (`/resolve-review`'s nested re-review follows the same ownership rule).

Then return to § Release Review Gate at its re-check; the review does not stop the calling command.
## Release Review Gate
Branch Diff Review Gate of `/prepare-release` and `/prepare-beta` (each Step 2.1), stated once so they cannot drift (#3230). Each keeps its heading, `--skip-review` handling, a pointer here and its unreadable-file STOP, passing `<command>` = `prepare-release` or `prepare-beta` (named by every STOP message below).
Refuses a release or beta whose branch carries an unreviewed change or an introduced high-severity finding. Runs in Phase 2, before Phase 3 edits any version file or CHANGELOG and before any tag.
**The record.** Reads `lastDiffReview` from `.code-review-manifest.json` (fields per Step 10 item 7). Format unchanged by #3230 (older records read alike, accepted when fresh). Missing `headSha`, `findings.introduced` or `findings.preExisting` → treated as missing: `reviewRecordFreshness` checks only `headSha`, so the gate checks the count objects itself — never passes on a partial record.
**Freshness rule — decided by `reviewRecordFreshness({ cwd, record })` from `.claude/scripts/shared/lib/branch-diff.js` (#3183); never re-derive it.** Current when `headSha` = `git rev-parse HEAD`, or every commit since `headSha` changes only review output (`.code-review-manifest.json`, `Construction/Code-Reviews/**` — so Step 10a does not stale it); **and** no uncommitted change outside review output, or `workingTreeIncluded` is `true`. Otherwise stale; the helper's `reason` and `offending` paths say why. Reviewed uncommitted source goes stale once committed — deliberate: paths, not content.
**Why inline, with no `Skill` call.** Skill does not return, so the gate would never reach its re-check (why #3115's gate could only STOP). It executes § `/code-review` — Workflow of this file in the same turn and continues.
**First, resolve base + changed-file set** with `changedFilesSinceBase({ cwd })` from `.claude/scripts/shared/lib/branch-diff.js` (it calls `resolveBranchBase`): nearest merge-base with the default branch (release or beta feature branch alike). Decides empty diff and unresolvable base without a record and fixes the inline review's base, so the two cannot disagree on the branch.
**Severity policy (unchanged).** `findings.introduced.high` > 0 blocks; `findings.introduced.medium` > 0 with `high` at 0 asks; `low`/`info` reported, never stop; `findings.preExisting` never blocks at any severity (inherited debt).
**Outcomes, in order:**
- `--skip-review` — handled by the calling command before this section is read (reports the skip, continues; nothing below runs). Checked first: with `--dry-run` only the skip is reported — no inline review is described or run.
- `resolveBranchBase` cannot resolve a base ref, or not a git repository → **STOP** with the helper's `error`, before any inline review is offered — a gate that examines nothing must not pass.
- `changedFilesSinceBase` returns an empty set → report `No files changed on this branch relative to <ref> (<sha>); review gate passed vacuously.` and continue; never offer the inline review (legitimate; naming the base makes it checkable).
- `--dry-run` → read the record, run `reviewRecordFreshness` (read-only), report: fresh → would apply the severity policy; missing/stale → would run the inline review over `<baseSha>..HEAD` (file count below) and re-check. Runs no review, files, writes or stops nothing.
- Fresh record → no inline review (an earlier `/code-review --diff` is not paid twice); apply the severity policy, record source `already fresh`.
- No usable record, or a stale one → report `Branch diff review missing or stale (record headSha <sha|none>, HEAD <sha>).` with the helper's `reason` and any `offending` paths. Then compute, read-only, the set the review would read (Step 3 discovery + excludes ∩ changed files; tests excluded, deleted dropped):
  - No reviewable source file in it → report `No reviewable source files changed on this branch relative to <ref> (<sha>); review gate passed vacuously.` and continue (tests- or docs-only branch); offer nothing.
  - Otherwise offer via `AskUserQuestion` (shape: `{frameworkPath}/Reference/AskUserQuestion-Shape.md`, #3233): base and file-count table first; options `1.Run the diff review now (recommended)`, `2.Stop; I'll run /code-review --diff myself`; question `Run the branch diff review now (<N> files)?`; previews: the first runs `/code-review --diff <ref>` inline, then re-checks; the second STOPs (below). Over 40 files recommend stop instead, naming `--batch N` — an inline review reads every file before Phase 3 and risks compaction mid-release.
  - **Accept** → execute § `/code-review` — Workflow, Steps 2–12, inline with `--diff <ref>` (`<ref>` = the gate's resolved base) — no `Skill` call, no other flag. It runs its Step 8 (filing, one `AskUserQuestion`), Step 10 (`lastDiffReview`), Step 10a (commit); Step 12 prunes only its `code-review:` tasks and hands back here.
  - **Decline** → **STOP**: `Run /code-review --diff, then re-run /<command>.`
  - **After the inline run** → re-read `.code-review-manifest.json` from disk, re-apply the partial-record check and `reviewRecordFreshness`. Still missing/stale → **STOP** with `Branch diff review still stale after the inline run (<reason>). Run /code-review --diff, then re-run /<command>.` — never loop or retry. Fresh → severity policy, record source `inline run this invocation`.
- `findings.introduced.high` > 0 → **STOP**, naming filed `issues` and introduced counts; `findings.preExisting` counts reported alongside, never block.
- `findings.introduced.medium` > 0 and `findings.introduced.high` = 0 → **ASK USER** via `AskUserQuestion`: continue, or stop to address them. Findings table (issue, file, title) first; options `1.Continue`, `2.Stop to address them`; question `<M> introduced medium findings: continue the release?`; previews: *Continue* → proceed, findings filed; *Stop to address them* → STOP before any version file is edited.
- Only `low`/`info` counts in `findings.introduced`, or none → report the counts and continue.

**Gate report** — every outcome evaluating a record reports from the record itself:
```
Review gate: base <ref> (<baseSha>), range <baseSha>..HEAD[ + working tree]
  Record: inline run this invocation | already fresh (reviewed <reviewedAt>)
  Introduced: H high, M medium, L low, I info · Pre-existing: H high, M medium, L low, I info
  Issues filed: #N, #N | none
```
**During an inline run:**
- Step 8 approvals are filed via `file-issue.js` same turn; numbers go to `lastDiffReview.issues` and the gate report. Skipping all filings files nothing; counts still drive the policy. A partial failure is reported, entries left `failed`; the record is still written and evaluated.
- Uncommitted source changes → Step 3 reviews the working tree too; record carries `workingTreeIncluded: true`, fresh on re-check.
- Failed Step 10a commit → reported verbatim, no retry; record accepted only if `workingTreeIncluded` is `true` or the tree is otherwise clean (`reviewRecordFreshness` enforces it) — else **STOP** as stale.
- Step 10a commits on the checked-out branch: `/prepare-release` creates its release branch from `main` at Pre-Checks (before Phase 2), so never `main`; `/prepare-beta` refuses `main` at its Pre-Check, so there no inline review runs and nothing is committed.
- Step 10a's commit touches only review output (non-staling), so the gate never stales its own record; a `/prepare-beta` review followed by `/prepare-release` on the same branch with only review-output commits since reuses it — no second review.
- After compaction: resume from the first incomplete `code-review:` task (§ Execution Instructions), then the re-check above.
