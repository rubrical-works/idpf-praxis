---
version: "v0.105.0"
description: Instrument an IDPF command run and report where its time went.
argument-hint: "--start | --stop | --report"
copyright: "Rubrical Works (c) 2026"
---
<!-- MANAGED -->
# /idpf-measure
Instruments a command run and reports where its time went, separating **tool execution time** from **model generation time**. Collection is armed and disarmed explicitly, so no session pays unless someone asked.
**MANAGED, no `USER-EXTENSION` blocks** — no per-project customization surface: what is recorded is fixed by the decomposition, and the one tunable (per-spawn cost) is calibrated, not configured (#2746).
**Not `/idpf-stats`,** which measures repository output; this measures one run's execution.
## Prerequisites
Node only — built-ins; no `gh pmu` call.
## Arguments
Exactly one mode per invocation.
| Argument | Behaviour |
|----------|-----------|
| `--start` | Arm: calibrate spawn cost, reset log, write marker, wire tap |
| `--stop` | Disarm — remove marker and wiring — and print report |
| `--report` | Print report **without** disarming, so a long `--nonstop` run can be inspected mid-flight |
| `--reset` | Clear the event log **without** disarming: marker, calibrated `spawnMs`/`startedAt` and wiring all untouched. Reports events discarded and the span they covered |
**`--reset` is NOT "clear everything" — `--start` already does that**, unlinking the log on every arm, while `--stop` retains it so a post-hoc `--report` works. So the arm/disarm cycle already gives a clean log per run, and a clear-everything reset would be a second spelling of `--start`. What no combination gives is clearing the log while **staying armed**: you arm, do setup — inspect a file, check a branch, fix a typo — then run what you meant to measure, setup calls already in the log.
`--stop` then `--start` is more disruptive than warranted: it recalibrates, so figures either side sit on different bases; rewrites the git-tracked settings file twice for a log truncation; and briefly disarms, a visible window where peers may be collecting.
| `--schema` | Print the envelope reference; mutates nothing |
Two modes at once is an error, not a silent choice. An unrecognized flag is reported and ignored, **never silently dropped** — `02-github-workflow.md`'s pass-through convention at the script layer.
## Execution
Delegate to the CLI; do NOT re-implement any part of the lifecycle inline.
```bash
node .claude/scripts/shared/idpf-measure.js --start
node .claude/scripts/shared/idpf-measure.js --stop
node .claude/scripts/shared/idpf-measure.js --report
```
Parse the envelope. `ok: false` → report `errors[0].message`, **STOP**. `ok: true` → print `report` if present, then relay every `warnings` entry **verbatim**. Warnings are the only channel for a stale marker or an already-wired tap; summarizing them away hides the two states a user most needs to see.
**On `--start` in this repo, report the tracked-file caveat:** `.claude/settings.local.json` is git-tracked here, so arming produces a tracked diff that `--stop` reverts. Say so, rather than letting it surface later as an unexplained modification. Deployed projects lack the file entirely and `--start` creates it — nothing to warn about there.
## What the report separates, and why it can
One event per tool call at `PostToolUse`, each carrying the harness's own `duration_ms`.
| Figure | Derived from |
|---|---|
| tool execution time | summed `duration_ms` — the harness's measurement, not the instrument's |
| model generation time | summed inter-event gaps, each less the following call's `duration_ms` |
| instrument overhead | calls − 1, times the calibrated per-spawn cost |
**This is the one thing manual marking cannot do:** every hand-recorded interval contains both components with no way to split them.
**`PostToolUse` only — deliberately; do NOT "fix" this back to a pair.** A `PreToolUse`/`PostToolUse` subtraction measures the instrument's own two spawns along with the tool: inflation 1.8×–8.3×, worst where the tool is fastest, which is where task-call counting lives. Reading `duration_ms` is more accurate *and* half the cost. See `Construction/Design-Decisions/2026-09-06-idpf-measure-posttooluse-only.md`.
**Overhead is disclosed, and charged to model generation only.** The spawn does not cancel between events — the session waits for the hook process to exit before the model resumes — so each gap carries exactly one. Tool execution carries none. The report states the figure so that bucket reads net of the instrument.
## Why armed, not always on
A permanent tap spawns a Node process per tool call in every session forever, measured or not — ~95ms a call, ~6s on a 66-call run. A diagnostic that taxes all users for occasional use is a bad trade, worse downstream where nobody asked for it. **A marker check inside the hook does not help:** the spawn IS the cost and happens before the hook's code runs. Only unwiring removes it.
## Scope: collection is project-wide, reporting is session-filtered (#2798)
**Different scopes — the non-obvious part.** The tap is wired via `.claude/settings.local.json`, a project file with no per-session form, so it fires for **every** session in the working directory and all their calls land in one log. Reporting then filters to the active session from `CLAUDE_CODE_SESSION_ID`.
**Filtering is correctness, not presentation.** Tool execution sums independent `duration_ms` and survives interleaving. Model generation does not: it derives from inter-record *gaps*, which assume consecutive records are one serial timeline. Across an interleaved log a gap can span a peer's whole tool call and go negative against the next call's duration. Within one session it is correct — sessions run in parallel, so the interval between one session's consecutive calls is its own generation time whatever a peer did.
The report names excluded sessions and their call counts, so a filtered report never reads like one with no peer present. Records with no session id (logged before attribution existed) are an **unattributed** group, excluded, never folded into the active session's totals.
**Every session still pays the per-call spawn** whether or not its records are reported — the wiring is project-scoped with no per-session form. Inherent to the mechanism, not a filtering gap.
## What arming does to the working tree (#2803)
**In this repo `.claude/settings.local.json` is git-tracked** — the opposite of a PHM project, where the file is absent and `--start` creates it (#2794 AC3). Arming here produces a **tracked diff every session sharing the directory can see**, and a crash between `--start` and `--stop` leaves it modified.
`--stop` restores byte-for-byte and the redness is working-tree-local; committed state is unaffected. But while armed the tree is not private to the measuring session, which is why the `Docs/02-Advanced/Claude-Code-Dependencies.md` §3 guard excludes the tap from its derived count: without that, arming turned `npx jest` red repo-wide, and Step 4f's sweep is a hard gate — one developer measuring blocked every other session from completing an issue on a failure they did not cause.
## Degradation
| Situation | Behaviour |
|---|---|
| `--stop`, nothing armed | Warning, not error — a normal state |
| Marker present, session died | Reported **stale** and cleaned up. NEVER silently honoured — that leaves collection armed forever |
| Live marker, another session | Left in place, and said so. This `--stop` must not strand a concurrent one |
| `--start` when already wired | Idempotent; reported, wiring unchanged. **Stores no restore baseline** — it did not add the tap and holds no pre-tap contents, so it must not offer any (#2807) |
| `--stop` after such a `--start` | Removes the tap **surgically** and says so, never reporting a clean verbatim restore. Storing the tapped file as baseline made the wired state a **fixed point**: `--stop` wrote the tap back and reported success, so no arm/disarm cycle returned the tree to clean. Co-tenants survive; formatting may be normalised, and the warning says so |
| Empty log | "No events were collected" plus likely causes — never zeros, which assert a run happened and took no time |
| Call with no `duration_ms` | Counted, excluded, surfaced as making the total partial. A missing duration is the harness declining to report, NOT a 0ms call |
| Fewer than two events | Model generation **not measurable**, not zero. With no gap it is unmeasured; 0 would assert the model spent no time thinking |
| No marker at report time | Coverage **qualified**: collection had stopped, so figures cover only up to the last recorded call and may omit later activity. Marker absence suffices alone — no timestamp threshold: a report legitimately runs after the last call, so any bare timeout is invented (#2800) |
| Spawn cost unavailable from marker | Overhead line marks the value a **fallback constant**, not this machine's calibration, so the model-generation figure it is subtracted from is approximate. The fallback is deliberate, so an older marker still renders; printing it like a calibration was the defect (#2800) |
| Marker present, records stop early | **NOT** inferred. A gap between last record and reporting time is reported via the fields above, never a truncation verdict on its own — the marker, not a clock, decides |
| `--reset`, nothing armed | Warning, not error — matches `--stop`. Any log from a previous run is still cleared, unarmed state reported |
| `--reset`, no log present | Reports nothing to clear. Not an error: indistinguishable in effect from a successful reset |
| `--reset`, live foreign marker | **Refuses**, log intact, naming the owning pid. The log is shared across sessions, so clearing discards a peer's events — the stranding `--stop`'s guard prevents. Refusing not prompting avoids a second convention (#2799) |
| First call has no `duration_ms` | Measured span underivable, so shares are **withheld** rather than computed against an assumed zero, which is shorter than the run and overstates all. Totals still print (#2797) |
## STOP — Workflow Boundary
`--start` and `--stop` mutate `.claude/settings.local.json`. Report what changed and **STOP**. Do NOT run, interpret, or act on a measured command on the user's behalf — arming an instrument is not permission to use it.
**End of /idpf-measure Command**
