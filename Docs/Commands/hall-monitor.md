# /hall-monitor

Dedicate a session to observing cross-session activity in the working directory: it consumes the lifecycle announcements other sessions already broadcast, correlates them against local commits, and reports what no single working session is positioned to see.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--auto-create` | No | File bugs automatically for filable findings, and offer enhancements. Opt-in; off by default. Absent, every finding is reported and nothing is filed. |

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

## Configuration

Thresholds, finding kinds and dispositions live in `.claude/metadata/hall-monitor-signals.json` — tunable without editing the command.
