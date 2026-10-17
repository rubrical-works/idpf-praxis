# /code-review

Perform a methodical, charter-aligned code review with manifest-driven incremental tracking — unchanged approved files are skipped automatically.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| *(none)* | No | Incremental mode — skip approved and unchanged files |
| `--full` | No | Bypass manifest and review all discovered files |
| `--status` | No | Report manifest statistics only, then stop |
| `--scope <globs>` | No | Comma-separated file patterns to limit review scope |
| `--batch <N>` | No | Review N files then stop; next run picks up where left off |
| `--with <domains>` | No | Add domain-specific review criteria (e.g., `security`, `accessibility`, `all`) |
| `--suggest` | No | Analyze charter and codebase to recommend applicable domains |

Flags can be combined: `--scope "src/**/*.js" --batch 10 --with security`

## Usage

```
/code-review
/code-review --full
/code-review --with security,performance
/code-review --scope "src/**/*.ts" --batch 20
/code-review --suggest
/code-review --status
```

## Key Behaviors

- Requires `CHARTER.md` to exist; stops with a prompt to run `/charter` if missing.
- Tracks review state in `.code-review-manifest.json` — files hash-matched and skipped if approved and unchanged.
- If `CHARTER.md` changes, all files are re-queued for review.
- Approved findings are filed in one turn, as a batch, through the same filing script `/bug` and `/enhancement` use, so each issue gets the standard template, the project board and an assignee. Correctness and security defects become bugs; error handling, refactoring and convention findings become enhancements. High-severity findings are filed at P1, medium and low at P2.
- The batch is queued in `.code-review-manifest.json` before filing. An entry that fails stays in the queue, and the next run offers it again before reviewing anything; filed entries are never filed twice.
- Batch filing does not run the acceptance-criteria feasibility checks that `/bug` and `/enhancement` apply; the result says so once for the batch.
- `--with` and `--suggest` are mutually exclusive; using both reports an error and stops.
- Reports are saved to `Construction/Code-Reviews/YYYY-MM-DD-report.md` after issue creation so issue numbers are included.
- Available domain extensions: `security`, `accessibility`, `performance`, `chaos`, `contract`, `qa`, `seo`, `privacy`, `observability`, `i18n`, `api-design`.
