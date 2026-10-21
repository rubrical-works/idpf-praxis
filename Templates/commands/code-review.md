---
version: "v0.109.1"
description: Run a comprehensive code review with manifest-driven incremental tracking, using the IDPF framework.
argument-hint: "[--full] [--status] [--scope <globs>] [--diff [<base>]] [--batch <N>] [--with <domains>] [--suggest] [--help]"
copyright: "Rubrical Works (c) 2026"
---
<!-- MANAGED -->
# /code-review
Methodical charter-aligned code review with manifest-driven incremental tracking. Previously approved+unchanged files skipped.
**Note:** Source code files only. Use `/review-issue`, `/review-prd`, `/review-proposal`, `/review-test-plan` for other artifacts.
## Prerequisites
- `CHARTER.md` exists (run `/charter` if missing)
- `framework-config.json` exists
## Arguments
| Argument | Description |
|----------|-------------|
| *(none)* | Incremental mode — skip approved+unchanged |
| `--full` | Bypass manifest, review all discovered |
| `--status` | Report manifest stats only, STOP |
| `--scope <globs>` | Comma-separated file patterns to limit scope |
| `--diff [<base>]` | Only files changed on this branch since its merge-base with the default branch (or `<base>`), plus uncommitted changes. Combines with every flag |
| `--batch <N>` | Review N files then stop |
| `--with <domains>` | Comma-sep domain extensions or `all` |
| `--suggest` | Recommend domains (mutually exclusive with `--with`) |
| `--help` | Open this command's docs page. Takes precedence over every other argument and performs no action. |

**`--help` takes precedence over every other argument and performs no action:** run `node .claude/scripts/shared/command-help.js code-review`, report its output, and STOP.

Combinable: `--scope "src/**/*.js" --batch 10 --with security`, `--diff --with security`, `--diff origin/release --full`
## Execution
**REQUIRED before executing:**
1. Parse workflow steps → `TaskCreate`
2. Mark tasks `in_progress` → `completed`
3. **Post-Compaction:** re-read this spec, regenerate tasks
## Workflow
### Step 1: Parse Arguments
Accept: none, `--full`, `--status`, `--scope`, `--diff [<base>]` (base = next token not starting `--`), `--batch N`, `--with`, `--suggest`. `--suggest` and `--with` mutually exclusive → error+STOP. Invalid → error+STOP.
### Step 2: Load Manifest
Read `.code-review-manifest.json` from project root.
**Read** `.claude/scripts/shared/lib/code-review-manifest-schema.json` for manifest structure, required fields, and status enum values.
If manifest not found: create empty manifest (first run). If malformed: warn and continue as `--full`.
**Unfiled queue first (#3049).** Run `node .claude/scripts/shared/file-issue.js --manifest .code-review-manifest.json --list`. A non-empty `unfiled` list (the manifest's `filingQueue`, `queued` or `failed`) is approved findings an earlier run — interrupted, compacted or failed — never filed: report them and offer via `AskUserQuestion` to file them now (Step 8 item 5) before reviewing. Declining leaves them queued. The same command answers "next" after an interrupted Step 8.
### Step 2b: Status Report (--status)
Read manifest, discovery for counting only, report approved/flagged/pending/deferred/new counts. Directory breakdown if >20 files. **`--diff --status`:** count the diff set only (Step 3), name base ref + SHA. **STOP**.
### Step 3: Discover Source Files
Resolve default include patterns from charter tech stack:
1. `detectTechStack(projectRoot)` from `.claude/scripts/shared/lib/detect-tech-stack.js`
2. `getGlobPatternsForTechs(techs)` from same module
3. Cross-reference CHARTER.md tech stack; include any additional patterns

**Read** `.claude/metadata/code-review-excludes.json` for default exclude patterns. Flatten `categories[].directories`. `env: "dev"` applies only in `idpf-praxis-dev`; `env: "deployed"` only in user projects; omitted = both. Test files always excluded (use `/bad-test-review`).
`--scope` → use those globs (still apply excludes).
**`--diff [<base>]`:** `changedFilesSinceBase({ cwd, base, includeWorkingTree: true })` from `.claude/scripts/shared/lib/branch-diff.js` — never hand-compose `--scope` from `git diff`. Returns `{ ok, base: { ref, sha }, files, deleted, renamed, ranges, workingTreeIncluded }`; `ok: false` → report `error`, **STOP**. No `<base>` → nearest merge-base over `origin/HEAD`, `origin/main`, `origin/master`, `main`, `master`; `<base>` → only candidate, unresolvable STOPs (no fallback). **Intersect** discovery with `files`: patterns + excludes still apply (tests excluded), deleted dropped, renames use destination, `--scope` further intersects. Empty → **STOP** (empty-diff message). Hold `base`, `ranges`, `workingTreeIncluded` for Steps 6, 9, 10, 11.
### Step 4: Filter by Manifest (Incremental)
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

**Charter change:** CHARTER.md hash differs → re-review all.
**Domain change:** `--with` queues files previously approved without requested domain.
**`--full`:** Queue all discovered.
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
Check `projectSkills` in `framework-config.json`. Re-read `.claude/metadata/skill-keywords.json` and match keywords. Skills load lazily — supplementary only. If no skills installed, continue with charter-only criteria.
### Step 5a: Charter-Aware Domain Filtering
When `--with all`/`--with <domains>`:
1. Check `activeDomains` in `framework-config.json` — if **configured** → precedence (intersect requested)
2. Absent **or empty array** → read `CHARTER.md` (Tech Stack, In Scope) + `.claude/metadata/domain-signals.json`
3. Call `filterDomainsByCharter(requestedDomains, charterContent, domainSignalsJson, config)` from `load-review-extensions.js`
4. Log skipped: `"Skipping {domains} — not applicable per {source}"`
5. Pass applicable to Step 5c

`--with all` = all applicable.
**Error:** `domain-signals.json` missing/malformed → no filtering.
**`activeDomains` means something DIFFERENT here than in `/review-issue` (#2810).** Here it is a **narrowing filter** — it only subtracts from what `--with` requested. There `resolveAutoInclusion` reads the same key as **additive**, loading domains with no `--with` at all. One key, two readings; the split is a design question left open, written down so the two are comparable without reading the code.
**An empty array is "not configured", never "nothing applies."** `Array.isArray([])` is true, so an empty `activeDomains` took step 1 with an empty set: every requested domain skipped, step 2 never reached, `--with all` returned **zero** domains. `[]` is the default state before anyone answers the domain question, so the user asked for everything and got nothing. Empty now falls through to charter inference, identically to an absent key.
**The key is read only when `--with` was passed — a recorded decision (#2810).** With no `--with` this step does not run, so a project that declared its domains gets none here unless it asks each time. Making it additive would change what `/code-review` loads for every existing project, which needs its own negotiation. **Consequence:** `/charter`'s active-domains report holds for `/review-issue`, not for `/code-review`.
### Step 5d: Domain Suggestion (--suggest)
1. Read `CHARTER.md` + `.claude/metadata/domain-signals.json`
2. Call `suggestDomains(charterContent, domainSignalsJson)`
3. `AskUserQuestion`: Accept/Modify/Skip with per-domain reasoning
4. Accepted → feed to `--with` pipeline (5a → 5c)
5. Modified → user specifies
6. Skipped → standard review only
### Step 5c: Domain Extension Loading (--with)
1. Read `.claude/metadata/review-extensions.json`
2. Parse: `all` = 8 extensions, or comma-sep
3. Call `loadCodeReviewExtensions(projectDir, domainIds)` from `./.claude/scripts/shared/lib/load-review-extensions.js`
   **Return:** `{ ok, domains: { [id]: { description, domain, questions: string[] } }, warnings }`
   - `ok: false` → log `error`, fallback standard
   - `ok: true` → iterate `Object.entries(result.domains)`
   - Report `warnings` (non-blocking)
4. Use `questions[]` per domain as Code Review Questions
5. Unknown IDs: warn with list derived from the loaded `.claude/metadata/review-extensions.json` registry (source of truth — do not hardcode).

**Error:** All non-blocking → fallback standard review.
No `--with` → skip loading.
### Step 6: Per-File Review
Read each queued file; structured analysis:
| Field | Description |
|-------|-------------|
| File path | Relative |
| Line range | Start-end |
| Category | correctness/security/maintainability/naming/error-handling/documentation/domain |
| Severity | `high`/`medium`/`low`/`info` |
| Description | Issue |
| Recommendation | Fix |

**Severity:** High=security/correctness bug; Medium=maintainability/convention; Low=style/naming; Info=suggestion.
`--with` active: after standard review, apply domain criteria. Tag with domain. Domain can escalate, not downgrade.
**`--diff`:** whole file still read. `classifyFindingRange(ranges, file, startLine, endLine)` from `branch-diff.js`: range **entirely outside** the branch's changed ranges → tag `pre-existing`; inside/overlapping → `introduced`. Tag, never suppress.
### Step 7: Batch Mode
`--batch N`: limit N per invocation, save manifest, report progress.
### Step 8: Issue Creation
**MANDATORY:** All issue creation goes through `.claude/scripts/shared/file-issue.js` — the same creation path `/bug` and `/enhancement` use. Never raw `gh pmu create` or `gh issue create`: they skip the template and the priority handling, and the bare form files off the board.
**One turn for the whole batch (#3049).** Do **not** invoke `/bug` or `/enhancement` per finding: `Skill` does not return and `/bug` ends in STOP, so a per-finding loop files one issue per turn (rule 02). The script files every approved finding in one call.
| Finding Type | `type` |
|-------------|--------|
| Correctness/security defect | `bug` |
| Missing error handling, refactoring, convention | `enhancement` |
| Severity | `priority` |
|----------|-----------|
| high | `p1` |
| medium, low | `p2` |
1. Present findings summary
2. Use `AskUserQuestion` for user choice: per finding, per group, or skip
3. Group related findings sharing root cause into one entry
4. Write the approved entries — `{type, title, priority, fields, labels, source: {file}}`, `fields` from the finding (description, actual behavior, proposed fix or solution, acceptance criteria) — to `.tmp-code-review-queue-{random}.json` (suffix shelled out, `05-windows-shell.md`), then **enqueue** them: `node .claude/scripts/shared/file-issue.js --manifest .code-review-manifest.json --enqueue <that file>`; `rm` the file
5. **File the queue** in the same turn: `node .claude/scripts/shared/file-issue.js --manifest .code-review-manifest.json` — files every unfiled entry, rewrites the manifest after each, and appends each number to its `source.file`'s `issueRefs`
6. Report each result: number and priority, or the error. Relay `gatesNotApplied` once for the batch — `verificationGate` and `phaseFeasibility` are judged by `/bug` and `/enhancement`, not here; the user can `/review-issue` a filing to apply them
Exit 1 means at least one entry failed: it stays `failed` in the queue and the next run's Step 2 offers it again. Never re-file a `filed` entry by hand.
**Info-level findings** reported but not offered as issues.
### Step 8b: Security Finding Label
If `--with security`/`--with all` and any security finding has ⚠️/❌:
```bash
gh issue edit $ISSUE --add-label=security-finding
```
All security findings ✅ → do not apply.
### Step 9: Structured Report
Save to `Construction/Code-Reviews/YYYY-MM-DD-report.md` **after** issue creation. Create dir if absent. Format: summary, findings grouped by severity with issue #s, per-file status, aggregate statistics, issues-created summary.
Each finding: `Issue: #1234` or `No issue` for info. Add **Issues Created** section.
**`--diff`:** open with base ref, its SHA and range reviewed (`<baseSha>..HEAD`, + `working tree` when `workingTreeIncluded`); mark `pre-existing` findings.
### Step 10: Manifest Update
1. Write `.code-review-manifest.json`
2. Update `charter.contentHash`
3. Status: no findings→`approved`, findings→`flagged`
4. Record `reviewedAt`, `findingCount`
5. Record `domains` when `--with` active (merge, not replace)
6. Preserve skipped; remove deleted
7. **`--diff` only:** write `lastDiffReview`, **replacing** any previous: `baseRef`, `baseSha` (Step 3 `base`), `headSha` (`git rev-parse HEAD`), `reviewedAt` (ISO), `workingTreeIncluded`, `filesReviewed`, `findings.introduced` + `findings.preExisting` (`{high, medium, low, info}` from Step 6 tags), `issues` (Step 8 numbers, `[]` if none), `domains` when `--with`. Shape: `lastDiffReview` in the manifest schema. Consumer owns the policy.
### Step 10a: Commit Review Output (`--diff` only, #3183)
Commit this run's output so the review leaves a clean tree. `/prepare-release` Step 2.1 decides freshness with `reviewRecordFreshness` (`.claude/scripts/shared/lib/branch-diff.js`): a commit changing only review output (`.code-review-manifest.json`, `Construction/Code-Reviews/**`) keeps the record current, so `headSha` stays the reviewed commit.
- **Default branch** (resolved as Step 3: `origin/HEAD`, then `main`/`master`) → do not commit; report `Review output not committed: <branch> is the default branch. Commit it from a working branch.` → Step 11. Never commit to the default branch.
- **Pathspec only** (`<report>` = Step 9 path):
  ```bash
  git add -- .code-review-manifest.json <report>
  git commit -m "chore: record <YYYY-MM-DD> code review (--diff)" -- .code-review-manifest.json <report>
  ```
  Other staged changes stay staged and are not committed. Never `git add -A` or a bare `git commit`.
- Nothing changed → report `Review output already committed.`
- A failed commit is reported verbatim and never retried; the review stays complete, record and report left in the working tree (Step 2.1 accepts them only with `workingTreeIncluded` true or an otherwise clean tree).
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
**`--diff`:** add `Base: <ref> (<sha>), range <sha>..HEAD[ + working tree]` and `Pre-existing: P` after Findings; `Committed: <sha>` or Step 10a's skip/failure reason after Manifest.
### Step 12: Closing Cleanup
The prune is **part of** this step, and this step is **numbered** — what makes the claim hold. `One task per numbered step` now covers it, so an unpruned list surfaces as an unfinished task like any other step. The same claim as prose alone was overridden by the rules beside it (#2641).
**Prune the task list** (unconditional — every path, including early-exit paths where Phase 1 created tasks and later phases never ran):
1. `TaskList` — enumerate all tasks.
2. For every task owned by this `/code-review` invocation, `TaskUpdate status=deleted`.
3. Do **not** delete tasks created outside this invocation (user TODOs).
**STOP.**
## Error Handling
| Situation | Response |
|-----------|----------|
| CHARTER.md missing | "No charter found. Run `/charter` first." → STOP |
| No source files | "No reviewable source files found in scope." → STOP |
| Manifest malformed | "Manifest corrupted. Running full review." → `--full` |
| File unreadable | Warn, skip |
| Issue creation fails | Warn, include in report |
| `--scope` matches nothing | "Scope pattern matched no files: {pattern}" → STOP |
| `framework-config.json` missing | Warn, no skill loading |
| `--with` unknown domain | Warn with list, skip |
| `--with` registry missing | Warn, fallback standard |
| `--with` criteria missing | Skip domain, warn |
| `--suggest`+`--with` | "`--suggest` and `--with` are mutually exclusive." → STOP |
| `domain-signals.json` missing | Warn, skip filtering |
| All domains filtered | "All requested domains filtered — falling back to standard review only" |
| `--diff <ref>` unresolvable | "Could not resolve base ref <ref> for --diff." → STOP |
| `--diff` no default branch | "Could not resolve the default branch for --diff (tried: <candidates>)." → STOP |
| `--diff` set empty | "No files changed on this branch relative to <ref> (<sha>)." → STOP |
| `--diff` outside git repo | "--diff requires a git repository; this directory is not one." → STOP |
**End of /code-review Command**
