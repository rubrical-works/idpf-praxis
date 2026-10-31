---
version: "v0.116.0"
description: Run a comprehensive code review with manifest-driven incremental tracking, using the IDPF framework.
argument-hint: "[--full] [--status] [--scope <globs>] [--diff [<base>]] [--batch <N>] [--agents <N>] [--with <domains>] [--suggest] [--help]"
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
| `--diff [<base>]` | Files changed since merge-base with the default branch (or `<base>`), plus uncommitted. Combines with every flag |
| `--batch <N>` | Review N files then stop |
| `--agents <N>` | Split Step 6 across at most N read-only reviewer subagents at once; parent merges and alone writes the manifest. Absent → inline. With `--batch`: batch bounds files, agents bounds concurrency |
| `--with <domains>` | Comma-sep domain extensions or `all` |
| `--suggest` | Recommend domains (mutually exclusive with `--with`) |
| `--help` | Open this command's docs page. Takes precedence over every other argument and performs no action. |

**`--help` takes precedence over every other argument and performs no action:** run `node .claude/scripts/shared/command-help.js code-review`, report its output, and STOP.

Combinable: `--scope "src/**/*.js" --batch 10 --with security`, `--diff --with security`, `--diff origin/release --full`
## Execution Instructions
**REQUIRED:** Workflow in `{frameworkPath}/Reference/code-review-execution.md` (on demand, not a rule); its § Execution Instructions defines tasks (one per numbered step, prefix `code-review:`) and compaction resume. Add tasks for Steps 1 and 13.
## Execution Logic
### Step 1: Parse Arguments
Accept: none, `--full`, `--status`, `--scope "globs"`, `--diff [<base>]` (base = next token not starting `--`), `--batch N`, `--agents N`, `--with`, `--suggest`. `--agents` takes a positive integer; a non-integer or zero value is an invalid argument: report `--agents requires a positive integer, got <value>.` → STOP. `--suggest` and `--with` mutually exclusive → error+STOP. Invalid → error+STOP.
### Steps 2–12: Review Workflow
Read and execute `{frameworkPath}/Reference/code-review-execution.md` § `/code-review` — Workflow, Steps 2–12, with Step 1's arguments (discovery, per-file review, `file-issue.js` filing, report, manifest + `lastDiffReview`, `--diff` commit, summary). Where it says *end the review*, continue at Step 13.
If the file cannot be read, report its path and STOP: `Could not read {frameworkPath}/Reference/code-review-execution.md; /code-review cannot run without it.` Never review from memory.
### Step 13: Closing Cleanup
The prune is **part of** this step, and this step is **numbered**, so an unpruned list surfaces as an unfinished task (#2641).

**Prune the task list** (unconditional — every path, early exits included):
1. `TaskList` — enumerate all tasks.
2. For every task owned by this `/code-review` invocation, `TaskUpdate status=deleted`.
3. Do **not** delete tasks created outside this invocation (user TODOs).

**STOP** -- command complete.
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
| `--agents` not a positive integer | "`--agents requires a positive integer, got <value>.`" → STOP |
| `--suggest`+`--with` | "`--suggest` and `--with` are mutually exclusive." → STOP |
| `domain-signals.json` missing | Warn, skip filtering |
| All domains filtered | "All requested domains filtered — falling back to standard review only" |
| `--diff <ref>` unresolvable | "Could not resolve base ref <ref> for --diff." → STOP |
| `--diff` no default branch | "Could not resolve the default branch for --diff (tried: <candidates>)." → STOP |
| `--diff` set empty | "No files changed on this branch relative to <ref> (<sha>)." → STOP |
| `--diff` outside git repo | "--diff requires a git repository; this directory is not one." → STOP |
**End of /code-review Command**
