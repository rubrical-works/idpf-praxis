# /code-review

Perform a methodical, charter-aligned code review with manifest-driven incremental tracking — unchanged approved files are skipped automatically.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| *(none)* | No | Incremental mode — skip approved and unchanged files |
| `--full` | No | Bypass manifest and review all discovered files |
| `--status` | No | Report manifest statistics only, then stop |
| `--scope <globs>` | No | Comma-separated file patterns to limit review scope |
| `--diff [<base>]` | No | Review only the files changed on the current branch, plus uncommitted changes. Without `<base>` the base is found automatically; with it, that ref is used |
| `--batch <N>` | No | Review N files then stop; next run picks up where left off |
| `--agents <N>` | No | Split the file review across at most N read-only reviewer subagents running at once. Without it, the review runs in the main session. With `--batch`, the batch bounds the files per run and `--agents` bounds how many reviewers read them at once |
| `--with <domains>` | No | Add domain-specific review criteria (e.g., `security`, `accessibility`, `all`) |
| `--suggest` | No | Analyze charter and codebase to recommend applicable domains |
| `--help` | No | Open this page. Takes precedence over every other argument and performs no action. |

Flags can be combined: `--scope "src/**/*.js" --batch 10 --with security`, `--diff --with security`

## Usage

```
/code-review
/code-review --full
/code-review --with security,performance
/code-review --scope "src/**/*.ts" --batch 20
/code-review --full --agents 4
/code-review --suggest
/code-review --status
/code-review --diff
/code-review --diff origin/release/1.4 --full
```

## Key Behaviors

- Requires `CHARTER.md` to exist; stops with a prompt to run `/charter` if missing.
- Tracks review state in `.code-review-manifest.json` — files hash-matched and skipped if approved and unchanged.
- If `CHARTER.md` changes, all files are re-queued for review.
- Approved findings are filed in one turn, as a batch, through the same filing script `/bug` and `/enhancement` use, so each issue gets the standard template, the project board and an assignee. Correctness and security defects become bugs; error handling, refactoring and convention findings become enhancements. High-severity findings are filed at P1, medium and low at P2.
- **Duplicate check before filing.** Before you choose what to file, each finding is checked against open bug and enhancement issues — scored on the finding's file, the issues already recorded against that file in the manifest, and title terms. Each finding is shown as `new`, `duplicate-of #N`, `related-to #N` or `unchecked`, with the reasons, and you confirm or override the classification before anything is filed or edited. A confirmed duplicate files no new issue: the matched issue gets a comment with the finding's file, line range, severity and review date, and — only for additions you confirm — the extra files and acceptance criteria are added to its body. A confirmed related finding is filed with a `Related to #N` line. If the search fails, every finding is `unchecked`, the failure is reported, and filing proceeds normally. Closed issues are not searched.
- The batch is queued in `.code-review-manifest.json` before filing. An entry that fails stays in the queue, and the next run offers it again before reviewing anything; filed entries are never filed twice.
- Batch filing does not run the acceptance-criteria feasibility checks that `/bug` and `/enhancement` apply; the result says so once for the batch.
- `--with` and `--suggest` are mutually exclusive; using both reports an error and stops.
- `--agents` takes a positive integer; any other value reports an error and stops.
- Reports are saved to `Construction/Code-Reviews/YYYY-MM-DD-report.md` after issue creation so issue numbers are included. Existing issues updated in place of a duplicate are listed in their own **Issues Updated** section, apart from the issues created, and the final summary shows an `Issues updated` count.
- Available domain extensions: `security`, `accessibility`, `performance`, `chaos`, `contract`, `qa`, `seo`, `privacy`, `observability`, `i18n`, `api-design`.

## Splitting the Review (`--agents`)

`--agents N` divides the queued files into at most N groups, by directory and balanced by line count, and hands each group to a read-only reviewer subagent; at most N run at once. The main session merges their findings and is the only writer of `.code-review-manifest.json`, so issue filing, the report and the manifest update work exactly as in an inline review.

- A reviewer's result that is malformed, or a finding on a file outside its group or past the end of the file, is rejected and reported — never repaired.
- A file no reviewer actually read is listed in the report under **Unreviewed files**, with the reason, and is never marked approved; its previous manifest entry is left as it was. The summary shows the reviewer count and the unreviewed files.

## Reviewing a Branch (`--diff`)

`--diff` answers "did the commits on this branch introduce anything?" instead of "what in the whole repository has not been reviewed since it changed?".

- **How the base is found.** With no argument, the base is the nearest merge-base of `HEAD` with `origin/HEAD`, `origin/main`, `origin/master`, `main` or `master` — whichever is closest. With `--diff <ref>`, the merge-base with that ref is used and nothing else is tried; a ref that does not resolve stops the review.
- **What is reviewed.** Files changed since the base plus uncommitted and untracked files, filtered by the usual tech-stack patterns and excludes (tests stay excluded). Deleted files are dropped; a renamed file is reviewed at its new path.
- **`--scope`** narrows the diff set further — only changed files that also match the globs are reviewed.
- **`--full`** reviews every changed file even if the manifest says it was already approved at its current content. Without `--full`, a changed file reviewed after its last change is skipped, so a branch reviewed as it went costs little to re-check.
- **`--status`** reports counts for the changed files only.
- **`pre-existing` findings.** Whole files are still read and reviewed. A finding that lies entirely outside the lines the branch changed is tagged `pre-existing` in the report: it is still shown, but marked as inherited rather than introduced.
- **Reproducible report.** The report and summary name the base ref, its SHA and the range reviewed.
- **Machine-readable record.** Each `--diff` run writes a `lastDiffReview` record to `.code-review-manifest.json` (base, `HEAD` SHA, whether uncommitted changes were included, files reviewed, finding counts by severity split into introduced and pre-existing, the issues filed, and — kept separate — the existing issues updated as duplicates). `/prepare-release` and `/prepare-beta` read it, and when it is missing or stale they offer to run this review inline before continuing.
- **Commits its own output.** After writing the record, `--diff` commits the manifest and the report, and only those two files, so the review leaves a clean tree. Anything else you had staged stays staged and is not committed. `/prepare-release` treats a commit that touches only review output as not changing what was reviewed, so the record stays current. On the default branch nothing is committed and the review says why; a failed commit is reported and not retried. The final summary names the commit, or the reason there is none.
- **Stops** when no base can be found, when nothing changed on the branch, or outside a git repository.
