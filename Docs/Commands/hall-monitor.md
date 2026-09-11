# /hall-monitor

Dedicate a session to observing cross-session activity in the working directory: it consumes the lifecycle announcements other sessions already broadcast, correlates them against local commits, and reports what no single working session is positioned to see.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--auto-create` | No | File bugs automatically for filable findings, and offer enhancements. Opt-in; off by default. Absent, every finding is reported and nothing is filed. |
| `--force` | No | Start even when another monitor is recorded as live in this directory, displacing it. Required on Windows, where a recycled process id can look like a running monitor. |

## Usage

```
/hall-monitor
/hall-monitor --auto-create
```

## What It Can and Cannot See

| Source | Observable? |
|---|---|
| Lifecycle announcements addressed to this session | Yes |
| Local git state (`git log`, `git status`, working tree) | Yes |
| A direct message between two **other** sessions | No |
| Another working directory, machine, or user | No |

A monitor sees only what is addressed to it. Direct messages between two other sessions are point-to-point, with no bus or log to read, so the report says what was observed rather than implying complete coverage.

No new transport is involved: announcements already reach every reachable peer in the working directory, so a session sitting idle there receives them for free. What this command adds is a reader.

## Key Behaviors

- Runs as a self-paced loop, waking on inbound announcements and polling git on a long fallback interval
- Correlates announcements against commits and reports findings — unannounced commits, unmatched work-started events, overlapping declared scope between in-flight issues
- Re-checks issue state immediately before reporting, because a monitor's observations go stale within a single tick
- Emits no announcements of its own; it performs no work, so it adds no traffic to other sessions
- With `--auto-create`, files bugs only for findings marked filable, behind a dedupe window and a per-session cap, and always after a prior-art sweep
- Enhancements are always offered, never filed unattended
- Degrades to git-only observation when cross-session discovery is disabled, and reports that it has done so

## One Monitor Per Directory

Only one `/hall-monitor` runs in a working directory at a time. Starting a second one is refused, and the refusal names the running monitor's pid and start time.

While a monitor is live it writes `.hall-monitor.json` at the project root. Every session in that directory — the monitor included — reads it and narrates inbound peer announcements quietly, the one-line acknowledgement only, for as long as the monitor runs. That is the point: one session does the analysis instead of all of them. The file is gitignored and per-machine; nothing is sent to any peer, because writing a file is not an announcement.

**`--force` displaces a live monitor.** Use it when the refusal is wrong. On Windows this is not a convenience but a necessity: liveness there can only be checked by asking whether the pid exists, and a recycled pid looks exactly like a running monitor. `--force` overwrites the marker and names the pid it displaced. The other monitor is **not** stopped by this — it simply no longer owns the marker.

**A crashed monitor does not lock you out.** If a monitor dies without cleaning up, its marker is left behind on purpose — there is no crash hook. The next `/hall-monitor` start overwrites it automatically, no `--force` needed, and the startup `Peers:` row names the stale marker in the meantime so you can see what happened.

On a clean stop the monitor removes the marker, but only if the marker is still its own.

## Configuration

Thresholds, finding kinds and dispositions live in `.claude/metadata/hall-monitor-signals.json` — tunable without editing the command.
