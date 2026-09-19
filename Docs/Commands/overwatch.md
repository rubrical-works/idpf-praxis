# /overwatch

Dedicate a session to observing cross-session activity in the working directory: it consumes the lifecycle announcements other sessions already broadcast, correlates them against local commits, and reports what no single working session is positioned to see.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--auto-create` | No | File bugs automatically for filable findings, and offer enhancements. Opt-in; off by default. Absent, every finding is reported and nothing is filed. |
| `--force` | No | Start even when another monitor is recorded as live in this directory, displacing it. Required on Windows, where a recycled process id can look like a running monitor. |

## Usage

```
/overwatch
/overwatch --auto-create
```

## What It Can and Cannot See

| Source | Observable? |
|---|---|
| Lifecycle announcements addressed to this session | Yes |
| Local git state (`git log`, `git status`, working tree) | Yes |
| A direct message between two **other** sessions | No |
| Another working directory, machine, or user | No |

A monitor sees only what is addressed to it. Direct messages between two other sessions are point-to-point, with no bus or log to read, so the report says what was observed rather than implying complete coverage.

No new transport is involved: by default announcements already reach every reachable peer in the working directory, so a session sitting idle there receives them for free. What this command adds is a reader.

**Targeted routing.** If a project turns broadcast off (`/x-session-config --off broadcast`), the announcements `/work`, `/review-issue` and `/resolve-review` make go to the running monitor only, not to every session. The monitor then receives all of them, and the working sessions stop hearing each other directly; the monitor's overlap notices are what tells them about a collision. `/done` and `/qa` still send to every session. If no monitor is running, its marker is stale, or it cannot be addressed safely, sending falls back to broadcast and the send says why. One cost cannot be detected: if the monitor session is holding or declining its messages, no sending session can tell, and then no session hears anything. Use targeted routing only while someone is watching the monitor.

## Key Behaviors

- Runs as a self-paced loop, waking on inbound announcements and polling git on a long fallback interval
- Correlates announcements against commits and reports findings — unannounced commits, unmatched work-started events, overlapping declared scope between in-flight issues
- Re-checks issue state immediately before reporting, because a monitor's observations go stale within a single tick
- Sends no lifecycle announcements of its own; it performs no work, so it adds no broadcast traffic to other sessions
- Sends one targeted message, an overlap notice, only to the sessions involved when their in-flight issues declare the same files — see below
- Replies to each announcement it receives with a short receipt, so the sending session can record that the monitor got it — see below
- With `--auto-create`, files bugs only for findings marked filable, behind a dedupe window and a per-session cap, and always after a prior-art sweep
- Enhancements are always offered, never filed unattended
- Degrades to git-only observation when cross-session discovery is disabled, and reports that it has done so

## Overlap Notices

When two in-flight issues declare the same files in their **Files to modify** sections, the monitor tells its own user and also sends an overlap notice to each of the two sessions working them. Each notice names both issues, both sessions and the shared files, says which side is the recipient's, and says it is advisory: nothing is blocked.

- **Who gets one:** the sessions that announced starting those issues. If the monitor never received a "work started" for an issue (the session had work announcements turned off, or started before the monitor did), it cannot tell who is working it, so it reports the overlap to its own user and messages no one.
- **How often:** once per session per overlap. A standing overlap is not re-sent every tick; a new shared file makes it a new notice. Each session also has an hourly cap. Both limits live in `.claude/metadata/overwatch-signals.json`.
- **Turning it off:** `/x-session-config --off overlapNotices`. The monitor then goes back to reporting overlaps to its own user only.

Delivery is not confirmed: a receiving session can hold or decline a message, and the monitor cannot see which.

## Receipt Replies

Sending a message to another session tells you the send succeeded, not that anyone read it. The monitor closes that gap for its own inbox: for each announcement it receives, it sends a one-line receipt back to that session naming what it received. The sending session records the receipt, so its later reports can say the monitor received the message instead of saying it could not tell.

- **What it covers:** the work and review announcements a session records when it sends them. Push, CI and QA fixture messages carry no record, so they get no receipt.
- **What it does not claim:** that the monitor acted on the message, or that any session the monitor relays to heard anything. It confirms one hop.
- **When no receipt arrives:** nothing changes. Nothing waits for one, nothing is retried, and no command fails. The sending session keeps saying delivery was not confirmed, which remains true.
- **Never a loop:** the monitor does not reply to receipts or to its own overlap notices.

## One Monitor Per Directory

Only one `/overwatch` runs in a working directory at a time. Starting a second one is refused, and the refusal names the running monitor's pid and start time.

While a monitor is live it writes `.overwatch.json` at the project root. Every session in that directory — the monitor included — reads it and narrates inbound peer announcements quietly, the one-line acknowledgement only, for as long as the monitor runs. That is the point: one session does the analysis instead of all of them. The file is gitignored and per-machine; nothing is sent to any peer, because writing a file is not an announcement.

**`--force` displaces a marker that reads as live.** Use it when the refusal is wrong. On Windows this is not a convenience but a necessity: liveness there can only be checked by asking whether the pid exists, and a recycled pid looks exactly like a running monitor. `--force` overwrites the marker and names the pid it displaced. It does not assume a monitor is running at that pid. On Windows, or for a marker written without a process start time, all that can be established is that *some* process holds the pid, and that process may be a recycled pid rather than a monitor, so the message says exactly that. Only where the recorded start time matched the process does it say the displaced monitor is still running. Either way, nothing is stopped by `--force`: whatever holds that pid simply no longer owns the marker.

**A crashed monitor does not lock you out.** If a monitor dies without cleaning up, its marker is left behind on purpose — there is no crash hook. The next `/overwatch` start overwrites it automatically, no `--force` needed, and the startup `Peers:` row names the stale marker in the meantime so you can see what happened.

On a clean stop the monitor removes the marker, but only if the marker is still its own.

## Configuration

Thresholds, finding kinds and dispositions live in `.claude/metadata/overwatch-signals.json` — tunable without editing the command.
