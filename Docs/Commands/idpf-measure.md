# /idpf-measure

Instrument a command run and report where its time went, separating **tool execution time** from **model generation time**. Collection is armed and disarmed explicitly, so no session pays for it unless someone asked.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--start` | Yes (one of) | Arm collection: calibrate the per-spawn cost, reset the log, write the marker, wire the tap. |
| `--stop` | | Disarm — remove the marker and the wiring — and print the report. |
| `--report` | | Print the report without disarming, so a long run can be inspected while it is still going. |
| `--reset` | | Clear the event log **without** disarming. The marker, its calibration and the wiring are untouched. Reports how many events were discarded and the span they covered. |
| `--schema` | | Print the envelope reference and exit, changing nothing. |
| `--help` | No | Open this page. Takes precedence over every other argument and performs no action. |

Exactly one mode per invocation. Two at once is an error rather than a silent choice between them. An unrecognized flag is reported and ignored.

## Usage

```
/idpf-measure --start
/idpf-measure --reset
/idpf-measure --report
/idpf-measure --stop
```

`--start` and `--stop` report what they changed and stop there. Arming the instrument does not run, interpret or act on the command you meant to measure — you run that yourself.

## When to Use `--reset`

`--start` already clears the log every time it arms, so `--reset` is not "clear everything". It covers the one case nothing else does: clearing the log while **staying armed**. Arm, do your setup — inspect a file, check a branch, fix a typo — then `--reset` and run what you actually meant to measure, without the setup calls in the figures.

Running `--stop` then `--start` instead would recalibrate (so figures either side sit on different bases), rewrite the settings file twice, and briefly disarm while other sessions may be collecting.

## What the Report Tells You

| Figure | Where it comes from |
|---|---|
| tool execution time | The harness's own per-call duration, summed. Not measured by this command. |
| model generation time | The gaps between tool calls, each less the duration of the call that closed it. |
| instrument overhead | The cost this command itself added, stated so the figure above can be read net of it. |

Also reported: per-tool call counts and totals, and the slowest individual calls.

**Separating those two numbers is the point.** Timing a command by hand gives one interval that contains both, with no way to split it — so "5 seconds per task call" cannot tell you whether the tool was slow or the model was thinking.

## Sessions and Agents

**Collection is project-wide; the report is filtered to your session.** The tap fires for every session in the working directory and writes to one log. The report covers only the session that asked for it, and names each other session it left out with its call count, so a filtered report never reads like one with no peer present. Every session still pays the per-call cost while armed.

**The main thread and each agent are separate timelines.** A spawned agent's calls carry its parent's session, so without separation they would interleave with the main thread's calls and the gaps between them would be nobody's generation time. The report keeps them apart:

| Element | Behavior |
|---|---|
| Headline figures | The **main thread's** only; an agent's calls are never folded in. |
| **Timelines** section | One row per timeline — the main thread and each agent, labeled by type and id — with calls, tool execution, model generation, overhead and elapsed time. Shown only when the session ran an agent or holds unattributed records. |
| Model generation | Derived from gaps **within** one timeline; no gap joins two timelines. |
| Agent elapsed time | The span of the agent's own calls, first to last. |
| Background agent launch | Listed as **`Agent (launch)`**: the call returns when the agent starts, so its duration is launch time, not the agent's work. |
| Overlap | Timelines run at the same time, so the report says so and gives **no combined total** — adding them would count the same time more than once. |

## Why It Has to Be Turned On

The tap runs as a hook, and a hook costs a process launch on every tool call — roughly 95ms, or about 6 seconds across a 66-call run. Left permanently registered, every session would pay that forever whether or not anyone was measuring.

So `--start` registers the hook and `--stop` removes it. Between those two commands you are measuring; outside them there is no hook and no cost. Checking a flag inside the hook would not help: the launch *is* the cost, and it happens before any of the hook's own code runs.

## What It Changes on Disk

| File | When |
|---|---|
| `.claude/settings.local.json` | `--start` adds the hook entry, creating the file if your project has none. `--stop` restores it. If the tap was already wired when you ran `--start`, `--stop` removes just the tap entry and says so; other hooks in the file survive, though unrelated formatting may be normalized. |
| `.idpf-measure.json` | The marker that says collection is armed. Written by `--start`, removed by `--stop`. |
| `.idpf-measure.jsonl` | The event log. Reset by `--start` and by `--reset`, kept after `--stop` so a later `--report` still works. |

Both `.idpf-measure.*` files are gitignored. Neither is durable — this command answers "why was that slow just now", not "how has this changed over months".

## When Something Is Off

| Situation | What happens |
|---|---|
| `--stop` with nothing armed | Says so and carries on. Nothing to disarm is a normal state, not an error. |
| A session died without `--stop` | The leftover marker is reported as stale and cleaned up, rather than being honored — otherwise collection would stay armed indefinitely. |
| Another session is measuring here | Its marker is left alone and you are told. Your `--stop` will not interfere with someone else's run. |
| `--start` twice | The second is a no-op. The wiring is not doubled. |
| Nothing was recorded | You get "no events were collected" and the likely reasons — never a report full of zeros, which would suggest a run happened and took no time. |
| A call with no reported duration | Counted, left out of the total, and flagged as making that total partial. |
| Only one call recorded | Model generation time is reported as not measurable rather than zero: with no gap between calls there is nothing to measure. |
| The first call has no reported duration | Shares of the run are withheld rather than computed against an assumed zero; the component totals still print. |
| Report run after collection stopped | The report notes that its figures cover only up to the last recorded call. |
| Calibration missing from the marker | Overhead is marked as a fallback constant rather than this machine's calibration, and model generation as correspondingly approximate. |
| `--reset` with nothing armed | A warning, not an error. Any previous log is still cleared. |
| `--reset` with no log present | Reports nothing to clear. |
| `--reset` while another session is measuring | Refused, with the log left intact and the owning process named — the shared log holds that session's events. |
| Records written before agent tracking | Shown as an **unattributed** group with its own row, kept out of the main thread's figures and every other timeline. |
| No record carries agent information | The session is reported whole, and the report says the main thread and any agents cannot be separated. |

## Not `/idpf-stats`

`/idpf-stats` measures what the repository produced — commits, issues, velocity over time. This measures how a single command run spent its time. Different questions, different data.

## See Also

- `/idpf-stats` — repository output and development velocity
- `/overwatch` — observing what other sessions in this directory are doing
