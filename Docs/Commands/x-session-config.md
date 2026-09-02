# /x-session-config

Configure cross-session peer messaging for this project.

Sessions working in the same directory announce what they are doing to each other — when work starts and finishes, when a push happens and how CI resolved, and when a review starts or is resolved. They also discover each other at startup and can run a background poller that watches the git upstream. This command decides how much of that this project wants.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--off <levers>` | No | Comma-separated lever names, or `all`. Turns each off. |
| `--on <levers>` | No | Comma-separated lever names, or `all`. Turns each on. |

**Lever names:** `enabled`, `discovery`, `notices`, `upstreamMonitor`, `work`, `push`, `review`.

## Usage

```
/x-session-config                      # write the current settings out, then show them
/x-session-config --off push           # stop /done announcing
/x-session-config --off work,review    # several at once
/x-session-config --on all             # turn everything back on
/x-session-config --off all            # turn everything off
```

## Key Behaviors

- **Every run writes the settings to `framework-config.json`, then shows you what it wrote** — including a run with no arguments. The file always ends up stating all seven settings explicitly, so you can read it without knowing what a missing entry would have meant.
- The first run in a project that has never been configured will therefore show up as a change to `framework-config.json`. Runs after that write the same thing again and produce no change.
- Not configuring this project at all is still perfectly valid: with no settings present, everything is on. The same is true of any individual setting that is missing — including one added by a future release, which will be on by default without you editing anything.
- Settings are validated before being saved. If a value would produce an invalid file, the save is refused rather than written.
- An unrecognised lever name is reported as an error rather than guessed at, and nothing is written.

## What you can turn off

| Setting | Effect when off |
|---|---|
| `enabled` | Everything below. No discovery, no announcements, no background poller. |
| `discovery` | Sessions are not looked for at startup. **Also silences all announcements** — there is no one to announce to. |
| `work` | `/work` stops announcing when it starts and finishes an issue. |
| `push` | `/done` stops announcing pushes and how CI resolved. |
| `review` | `/review-issue` and `/resolve-review` stop announcing. |
| `notices` | The "delivery is not confirmed" caveat lines stop printing. Messages are still sent. |
| `upstreamMonitor` | The background poller that watches for upstream pushes does not start. |

Push announcements are one setting rather than three, deliberately. A push announcement is always followed by exactly one result announcement, and separate switches would let you enable the first without the second — leaving other sessions waiting for a result that never comes. Review announcements are one setting for the same reason.

## Where you see the effect

A disabled setting is silent by design: commands do **not** print a "skipped, disabled" line every time they run, because that notice would be the noise you turned the setting off to avoid. The current state shows up in two places instead — the `Peers:` line in the session-start block, and this command's own output.

## What this does not control

Whether another session actually **receives** a message. That is the receiving session's own decision, made after the message is sent and not visible to the sender. These settings control what your session sends, not what anyone else accepts.

## Related

- `/charter` — other project configuration in the same file
- `/work`, `/done`, `/review-issue`, `/resolve-review` — the commands that announce
