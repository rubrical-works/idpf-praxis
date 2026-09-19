# /idpf-measure

Instrument a command run and report where its time went, separating **tool execution time** from **model generation time**. Collection is armed and disarmed explicitly, so no session pays for it unless someone asked.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--start` | Yes (one of) | Arm collection: calibrate the per-spawn cost, reset the log, write the marker, wire the tap. |
| `--stop` | | Disarm — remove the marker and the wiring — and print the report. |
| `--report` | | Print the report without disarming, so a long run can be inspected while it is still going. |
| `--schema` | | Print the envelope reference and exit, changing nothing. |

Exactly one mode per invocation. Two at once is an error rather than a silent choice between them.

## Usage

```
/idpf-measure --start
/idpf-measure --report
/idpf-measure --stop
```

## What the Report Tells You

| Figure | Where it comes from |
|---|---|
| tool execution time | The harness's own per-call duration, summed. Not measured by this command. |
| model generation time | The gaps between tool calls, each less the duration of the call that closed it. |
| instrument overhead | The cost this command itself added, stated so the figure above can be read net of it. |

Also reported: per-tool call counts and totals, and the slowest individual calls.

**Separating those two numbers is the point.** Timing a command by hand gives one interval that contains both, with no way to split it — so "5 seconds per task call" cannot tell you whether the tool was slow or the model was thinking.

## Why It Has to Be Turned On

The tap runs as a hook, and a hook costs a process launch on every tool call — roughly 95ms, or about 6 seconds across a 66-call run. Left permanently registered, every session would pay that forever whether or not anyone was measuring.

So `--start` registers the hook and `--stop` removes it. Between those two commands you are measuring; outside them there is no hook and no cost. Checking a flag inside the hook would not help: the launch *is* the cost, and it happens before any of the hook's own code runs.

## What It Changes on Disk

| File | When |
|---|---|
| `.claude/settings.local.json` | `--start` adds the hook entry, creating the file if your project has none. `--stop` puts it back exactly as it was, or deletes it if `--start` created it. |
| `.idpf-measure.json` | The marker that says collection is armed. Written by `--start`, removed by `--stop`. |
| `.idpf-measure.jsonl` | The event log. Reset by `--start`, kept after `--stop` so a later `--report` still works. |

Both `.idpf-measure.*` files are gitignored. Neither is durable — this command answers "why was that slow just now", not "how has this changed over months".

## When Something Is Off

| Situation | What happens |
|---|---|
| `--stop` with nothing armed | Says so and carries on. Nothing to disarm is a normal state, not an error. |
| A session died without `--stop` | The leftover marker is reported as stale and cleaned up, rather than being honoured — otherwise collection would stay armed indefinitely. |
| Another session is measuring here | Its marker is left alone and you are told. Your `--stop` will not interfere with someone else's run. |
| `--start` twice | The second is a no-op. The wiring is not doubled. |
| Nothing was recorded | You get "no events were collected" and the likely reasons — never a report full of zeros, which would suggest a run happened and took no time. |
| A call with no reported duration | Counted, left out of the total, and flagged as making that total partial. |
| Only one call recorded | Model generation time is reported as not measurable rather than zero: with no gap between calls there is nothing to measure. |

## Not `/idpf-stats`

`/idpf-stats` measures what the repository produced — commits, issues, velocity over time. This measures how a single command run spent its time. Different questions, different data.

## See Also

- `/idpf-stats` — repository output and development velocity
- `/overwatch` — observing what other sessions in this directory are doing
