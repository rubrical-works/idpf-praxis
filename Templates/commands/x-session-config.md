---
version: "v0.101.0"
description: Configure cross-session peer messaging for this project (project)
argument-hint: "[--on <levers>] [--off <levers>] [--quiet] [--loud] [--show] [--help]"
copyright: "Rubrical Works (c) 2026"
---
<!-- MANAGED -->
# /x-session-config
Edit the `crossSessionMessaging` object in `framework-config.json` — project-level governance of cross-session peer messaging (#2702).
**MANAGED, not EXTENSIBLE:** a config editor has no per-project customization surface, so it is hub-owned and symlinked. No `USER-EXTENSION` blocks.
## Arguments
| Argument | Required | Description |
|---|---|---|
| `--off <levers>` | No | Comma-separated lever names, or `all`. Turns each off, then writes. |
| `--on <levers>` | No | Comma-separated lever names, or `all`. Turns each on, then writes. |
| `--quiet` | No | Alias for `--off noticeNarration`. No value. |
| `--loud` | No | Alias for `--on noticeNarration`. No value. |
| `--show` | No | Prints the resolved state. **Writes nothing.** |
| `--help` | No | Prints usage and the lever names. **Writes nothing.** |
| *(none)* | — | Changes nothing, but still writes the resolved object and displays it. |
**Levers:** `enabled`, `discovery`, `notices`, `upstreamMonitor`, `work`, `push`, `review` — the last three addressing `groups.*` without the prefix. **Non-interactive:** asks nothing, blocks on nothing.
**`--show` is the read-only mode.** A bare invocation writes by design, so without it there is no way to look without changing the file. It reports exactly what a bare run would have written — a preview, not a second opinion.
**`--show` with `--on`/`--off` is rejected** — opposite intents, and silently honouring one produces output that looks like a write but was not. "Did it write?" stays answerable from the flags alone.
**`--help` takes precedence over every other flag**, `--show` and an invalid lever included — the likeliest reason to type it is not knowing the lever names, so `--help --off nonsense` prints help rather than complaining.
## Workflow
**One step.** Pass the arguments through verbatim:
```bash
node .claude/scripts/shared/x-session-config.js [--on <levers>] [--off <levers>]
```
Report the envelope:
- `--help` → the script prints usage text, not JSON. Relay it as-is and **STOP**.
- `ok: true` → report `summary`, every `implications` entry **verbatim**, and `changed` (or that nothing changed). **STOP**.
- `ok: false` → report every `errors` entry verbatim and **STOP**. Nothing was written; do **not** retry, and do **not** write `framework-config.json` by hand.
Takes effect: `discovery` and `upstreamMonitor` in new sessions, groups on the next `/work`, `/done`, `/review-issue` or `/resolve-review`.
**No task list.** One deterministic step; `07-task-creation-timing.md` permits upfront task creation for unrouted commands, it does not require it. Creating and pruning tasks around a single script call is pure overhead.
**Do not re-implement the helper.** Parsing, validation, conflict detection, apply and write all live in the script. Re-deriving any in prose is what this rebuild exists to stop — the write was previously re-authored per invocation, which is how the `write(cwd, config)` / `validate(config, cwd)` argument reversal was hit live.
## What it governs
An **absent** object still resolves to fully enabled at every level — the resolver's rule, for hand-written configs, configs predating a lever, and projects that never run this. The helper does not rely on it: **every invocation writes the complete eight-lever object**, bare and `--on all` included. A bare invocation is therefore a mutation — first run produces a diff, **idempotent** thereafter.
| Key | Governs |
|---|---|
| `enabled` | Master switch. False resolves every lever below to off. |
| `discovery` | `peers-check.js` and the startup `Peers:` row. False **implies all three groups off** — announcing to peers never discovered is not meaningful. |
| `notices` | Dispatch-caveat and skip-reason lines printed once per announcement. False leaves dispatch unchanged. |
| `upstreamMonitor` | Whether the background upstream-push poller arms. Intervals and backoff stay in `.claude/metadata/upstream-monitor.json`. |
| `noticeNarration` | **The one receive-side lever (#2735).** How verbosely *this* session narrates an announcement it **receives**. Absent/`true` = today's verbose behaviour; `false` keeps the one-line acknowledgement, drops the commentary. Not implied by `discovery: false`; forced off by `enabled: false`. |
| `groups.work` | `/work` events 1 `work-started`, 2 `work-completed` |
| `groups.push` | `/done` events 3 `push-started`, 4 `ci-terminal`, 5 `push-rejected` |
| `groups.review` | `/review-issue` event 6 `review-started`, `/resolve-review` event 7 `review-resolved` |
## Recorded decisions
The part a script cannot carry; each exists because the alternative was tried.
> **Groups, not per-event toggles.** Every event 3 is followed by exactly one terminal event. Per-event toggles would make "push-started on, ci-terminal off" valid config — a peer waiting forever for a message that never arrives. Grouping makes that **unrepresentable**.
> **Governs emission, with exactly one exception (#2674, amended #2735).** Whether a dispatched message is accepted, held, declined or left to expire is the receiver's decision, undetectable from the sender. No setting here promises delivery. **The exception is `noticeNarration`, which is receive-side:** how verbosely this session narrates an announcement it receives. It lives in this object rather than a sibling key so it inherits one resolver, one absence rule and the `--on`/`--off` idiom; a parallel key re-implements all three, and a second copy of the absence rule is what this object exists to prevent. Recorded, not hidden — a reader assuming the emission-only framing still holds universally will look elsewhere for a receive-side setting and not find one.
> **Quiet trims commentary, not the signal (#2735).** `--quiet` keeps the one-line acknowledgement and suppresses the paragraph around it — issue lookup, likely-files enumeration, collision-surface analysis. Suppressing the acknowledgement itself was rejected: it is the only evidence the sender has that anything landed, and dispatch is already undetectable from the sending side.
> **Polarity, not preference (#2735).** Named so `true` is today's behaviour. A lever called `quietNotices` would invert the resolver's one rule — absence resolving to quiet, silently changing behaviour in every project that never wrote the object.
> **Superseded design (#2702).** An interactive walk of seven prompts was built first and **rejected in review** — flipping one lever meant answering six prompts about levers the user did not care about. Recorded so the flag form does not read as the option nobody considered.
> **Explicit over implied (#2702).** An earlier draft recorded negatives alone, arguing that emitting `true` would freeze a project against future releases. **That does not survive checking** — `resolveCrossSessionConfig` reads each key independently, so a lever added later still resolves to enabled. Only legibility was lost: a reader had to know what absence meant.
## Error Handling
The helper validates before writing and returns `ok: false` **without touching the config** — an error that still mutated the file is worse than no validation, since "error" reads as "nothing happened". Report its `errors` verbatim and STOP.
| Situation | Reported as |
|---|---|
| `framework-config.json` missing | `No framework-config.json at <path>.` Never created — this command owns one key, not the file. |
| Unknown lever | Names the token and lists the seven valid levers. Never fuzzy-matched. |
| A lever in both `--on` and `--off` | Names the conflicting lever. |
| A flag with no value, or an unknown flag | Named, never ignored — silently dropping one would report success having changed nothing. |
| Schema-invalid result | `Write refused: …` with the validator's message. |
**End of /x-session-config Command**
