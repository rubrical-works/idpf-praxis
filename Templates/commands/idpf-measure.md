---
version: "v0.123.0"
description: Instrument an IDPF command run and report where its time went.
argument-hint: "--start | --stop | --report [--help]"
copyright: "Rubrical Works (c) 2026"
---

<!-- MANAGED -->
# /idpf-measure
Instruments a command run and reports where its time went, separating **tool execution time** from **model generation time**. Collection is armed and disarmed explicitly, so no session pays for it unless someone asked.
**MANAGED, with no `USER-EXTENSION` blocks.** What it records is fixed by the decomposition; the one tunable value — per-spawn hook cost — is calibrated on the machine, not configured (same reasoning as #2746).
**Not `/idpf-stats`**, which measures repository output (commits, issues, velocity). This measures one command run's execution.
## Prerequisites
- Nothing beyond Node. The tap uses built-ins only; no `gh pmu` call is made.
## Arguments
Exactly one mode per invocation.
| Argument | Behavior |
|----------|-----------|
| `--start` | Arm collection: calibrate the spawn cost, reset the log, write the marker, wire the tap |
| `--stop` | Disarm — remove the marker, remove the wiring — and print the report |
| `--report` | Print the report **without** disarming, so a long `--nonstop` run can be inspected mid-flight |
| `--reset` | Clear the event log **without** disarming: the marker, its calibrated `spawnMs` and `startedAt`, and the wiring are untouched. Reports how many events were discarded and the span they covered |
| `--schema` | Print the envelope reference and exit, mutating nothing |
| `--help` | Open this command's docs page. Takes precedence over every other argument and performs no action. |
**`--help` takes precedence over every other argument and performs no action:** run `node .claude/scripts/shared/command-help.js idpf-measure`, report its output, and STOP.
**`--reset` is not "clear everything" — `--start` already does that** (it unlinks the log on every arm; `--stop` retains it for a post-hoc `--report`). What no combination provides is clearing the log while **staying armed**: arm, do setup, then run what you meant to measure without the setup calls in the log. `--stop` then `--start` instead recalibrates (figures either side on different bases), rewrites the git-tracked settings file twice, and briefly disarms where peers may be collecting.
Two modes at once is an error, not a silent choice. An unrecognized flag is reported and ignored, never silently dropped (`02-github-workflow.md` pass-through convention, at the script layer).
## Execution
Delegate to the CLI; do not re-implement any part of the lifecycle inline.
```bash
node .claude/scripts/shared/idpf-measure.js --start
node .claude/scripts/shared/idpf-measure.js --stop
node .claude/scripts/shared/idpf-measure.js --report
```
Parse the JSON envelope. `ok: false` → report `errors[0].message` and **STOP**. `ok: true` → print `report` when present, then relay every `warnings` entry verbatim — the only channel for a stale marker or an already-wired tap; never summarize them away.
**Report the tracked-file caveat on `--start` in this repository:** `.claude/settings.local.json` is git-tracked here, so arming produces a tracked diff `--stop` reverts. In a deployed project the file is absent and `--start` creates it — nothing to warn about.
## What the report separates, and why it can
The tap records one event per tool call at `PostToolUse`, each carrying the harness's own `duration_ms`.
| Figure | Derived from |
|---|---|
| tool execution time | summed `duration_ms` — the harness's measurement, not the instrument's |
| model generation time | summed inter-event gaps, each less the following call's `duration_ms` |
| instrument overhead | calls − 1, times the calibrated per-spawn cost |
**Manual marking cannot do this** — every hand-recorded interval contains both components with no way to split them.
**`PostToolUse` only — deliberately; must not be "fixed" back to a pair.** The `PreToolUse`/`PostToolUse` subtraction measures the instrument's two spawns with the tool: 1.8×–8.3× inflation, worst where the tool is fastest. Reading `duration_ms` is more accurate *and* half the cost. See `Construction/Design-Decisions/2026-09-06-idpf-measure-posttooluse-only.md`.
**Overhead is disclosed and charged to model generation only.** The session waits for the hook process to exit before the model resumes, so each gap carries exactly one spawn; tool execution carries none.
## Why collection is armed rather than always on
A permanently-registered tap spawns a Node process on every tool call in every session — ~95ms a call, ~6s on a 66-call run — taxing all users for occasional use. **A marker check inside the hook does not help:** the spawn *is* the cost, and happens before the hook's code runs. Only wiring and unwiring removes it.
## Scope: collection is project-wide, reporting is session-filtered (#2798)
The tap is wired through `.claude/settings.local.json`, which has no per-session form, so it fires for **every** session in the working directory into one log. Reporting filters to the active session, from `CLAUDE_CODE_SESSION_ID`.
**Filtering is a correctness requirement.** Tool execution sums independent `duration_ms` and survives interleaving; model generation is derived from inter-record *gaps*, which assume one serial timeline. Across an interleaved log a gap can span a peer's whole call and go negative. Within one session's records the interval between consecutive calls is that session's own generation time.
The report names each excluded session and its call count, so a filtered report never reads like one with no peer present. Records with no session id (logged before attribution) are an **unattributed** group, excluded — never folded into the active session's totals.
**Every session still pays the per-call spawn** whether or not its records are reported — inherent to project-scoped wiring.
## Timelines: the main thread and each agent (#3914)
**Session filtering is not enough when agents run.** A spawned agent's calls carry its parent's `session_id`, so they land among the main thread's records; with agents running at once, the record after a main-thread call is often an agent's, and that gap is nobody's generation time — #2798 one level down. `/work --concurrent` and the review gates spawn agents routinely.
**The tap records which timeline made each call.** A live `PostToolUse` dump showed `agent_id`/`agent_type` on calls inside an agent and neither on main-thread calls; `transcript_path` and the hook environment are identical for both. Every record carries `agent_id` and `agent_type`, `null` on the main thread; an `Agent` call also records `background` and `launched_agent_id` from its response. See `Construction/Design-Decisions/2026-11-24-idpf-measure-per-agent-timelines.md`.
| Element | Behavior |
|---|---|
| Headline figures | The **main thread's** only; an agent's calls are never folded in |
| **Timelines** section | One row per timeline — main thread and each agent, labeled by type and id — with calls, tool execution, model generation, overhead and elapsed time. Shown only when the session ran an agent or holds unattributed records |
| Model generation | Derived from gaps **within** one timeline; no gap joins two timelines |
| Overhead | Charged per timeline: each of its gaps carries one hook spawn |
| Agent elapsed time | The span of the agent's **own** records (first call start → last call end) |
| Background `Agent` call | Listed as **`Agent (launch)`** and labeled launch time: the call returns when the agent starts, so its `duration_ms` is not the agent's work |
| Overlap | Timelines run at the same time, so the report says so and gives **no combined total** — adding them would count the same time more than once |
## What arming does to the working tree (#2803)
**In this repository `.claude/settings.local.json` is git-tracked**, unlike a PHM-bootstrapped project where `--start` creates it (#2794 AC3). Arming produces a **tracked diff every session sharing the working directory can see**; a crash between `--start` and `--stop` leaves it modified.
`--stop` restores the file byte-for-byte; committed state is unaffected. While armed the tree is not private to the measuring session, which is why the `Docs/02-Advanced/Claude-Code-Dependencies.md` §3 guard excludes the tap from its derived count — otherwise arming turned `npx jest` red repo-wide and blocked other sessions' Step 4f sweeps.
## Degradation
| Situation | Behavior |
|---|---|
| `--stop` with nothing armed | Warning, not an error. Nothing to disarm is a normal state |
| Marker present but its session died | Reported **stale** and cleaned up. Never silently honored — that would leave collection armed forever |
| A live marker from another session | Left in place, and said so. This session's `--stop` must not strand a concurrent one |
| `--start` when already wired | Idempotent; reported, wiring unchanged. **Stores no restore baseline** — it did not add the tap and holds no pre-tap contents (#2807) |
| `--stop` after such a `--start` | Removes the tap **surgically** and says so, never a clean verbatim restore. Storing the tapped file as baseline made the wired state a fixed point no arm/disarm cycle could clean. Co-tenant hooks survive; unrelated formatting may be normalized, and the warning states that |
| Empty log | "No events were collected", with likely causes — never a report of zeros |
| A call with no `duration_ms` | Counted, excluded from the total, surfaced as making the figure partial. A missing duration is the harness declining to report, not a 0ms call |
| Fewer than two events | Model generation **not measurable**, not zero |
| No marker at report time | **Coverage** qualified: collection had already stopped, so figures cover only up to the last recorded call. The marker's absence suffices — no timestamp threshold, since any bare timeout would be invented (#2800) |
| Spawn cost unavailable from the marker | Overhead marked a **fallback constant**, not this machine's calibration, and model generation called correspondingly approximate. The fallback is deliberate (older markers still render); presenting it as a calibration was the defect (#2800) |
| Marker present, but records stop early | **Not** inferred — reported through the fields above, never a truncation verdict; the marker, not a clock, decides |
| `--reset` with nothing armed | Warning, not an error, as `--stop`. Any previous log is still cleared and the unarmed state reported |
| `--reset` with no log present | Reports nothing to clear. Not an error |
| `--reset` against a live foreign marker | **Refuses**, log intact, naming the owning pid: the shared log holds a concurrent session's events. Refusing rather than prompting avoids a second convention for the same situation (#2799) |
| First call has no `duration_ms` | Measured span cannot be derived, so every share is **withheld** rather than computed against an assumed zero. Component totals still print (#2797) |
| Records with no `agent_id` field among attributed ones | Written before #3914: an **unattributed** group with its own row, excluded from the main thread's figures and every other timeline. Folding them into the main thread would bring the merge back |
| No record carries an `agent_id` field | Nothing to separate: the session is decomposed whole as before, and the report says the main thread and any agents cannot be separated |
## STOP — Workflow Boundary
`--start` and `--stop` mutate `.claude/settings.local.json`. Report what changed and **STOP**. Do not proceed to run, interpret, or act on a measured command on the user's behalf — arming an instrument is not permission to use it.
**End of /idpf-measure Command**
