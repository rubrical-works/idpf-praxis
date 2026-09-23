---
version: "v0.106.0"
description: Configure this project's IDPF cross-session peer messaging.
argument-hint: "[--on <levers>] [--off <levers>] [--quiet] [--loud] [--show] [--help]"
copyright: "Rubrical Works (c) 2026"
---
<!-- MANAGED -->
# /x-session-config
Edit the cross-session peer messaging levers (#2702). They live in `.claude/x-session.json`, gitignored per-developer state since #2774; the deprecated `crossSessionMessaging` key in `framework-config.json` is still read as a fallback and moved across on the next write.
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
**Levers:** `enabled`, `discovery`, `notices`, `upstreamMonitor`, `noticeNarration`, `overlapNotices`, `broadcast`, `work`, `push`, `review` — the last three addressing `groups.*` without the prefix. **Non-interactive:** asks nothing, blocks on nothing.
**`--show` is the read-only mode.** A bare invocation writes by design, so without it there is no way to look without changing the file. It reports exactly what a bare run would have written — a preview, not a second opinion.
**`--show` with `--on`/`--off` is rejected** — opposite intents, and silently honoring one produces output that looks like a write but was not. "Did it write?" stays answerable from the flags alone.
**`--help` takes precedence over every other flag**, `--show` and an invalid lever included — the likeliest reason to type it is not knowing the lever names, so `--help --off nonsense` prints help rather than complaining.
## Workflow
**One step.** Pass the arguments through verbatim:
```bash
node .claude/scripts/shared/x-session-config.js [--on <levers>] [--off <levers>]
```
Report the envelope:
- `--help` → the script prints usage text, not JSON. Relay it as-is and **STOP**.
- `ok: true` → report `summary`, every `implications` entry **verbatim**, and `changed` (or that nothing changed). **STOP**.
- `ok: false` → report every `errors` entry verbatim and **STOP**. Nothing was written — neither file; do **not** retry, and do **not** edit either by hand.
Takes effect: `discovery` and `upstreamMonitor` in new sessions, groups on the next `/work`, `/done`, `/review-issue` or `/resolve-review`, `overlapNotices` on a running `/overwatch`'s next tick, `broadcast` on the next announcement `announce.js` composes.
**`source: environment` → say so, and say the config was not changed (#2705).** `IDPF_X_SESSION` outranks the file, so reporting only the written levers tells the user messaging is on while nothing this session emits leaves it. The `summary` line already carries the variable, its value, and *not written to framework-config.json* — relay it verbatim, never paraphrased into "messaging is disabled".
**No task list.** One deterministic step; `07-task-creation-timing.md` permits upfront task creation for unrouted commands, it does not require it. Creating and pruning tasks around a single script call is pure overhead.
**Do not re-implement the helper.** Parsing, validation, conflict detection, apply and write all live in the script. Re-deriving any in prose is what this rebuild exists to stop — the write was previously re-authored per invocation, which is how the `write(cwd, config)` / `validate(config, cwd)` argument reversal was hit live.
## What it governs
An **absent** object still resolves to fully enabled at every level — the resolver's rule, for hand-written configs, configs predating a lever, and projects that never run this. The helper does not rely on it: **every invocation writes the complete ten-lever object**, bare and `--on all` included. A bare invocation is therefore a mutation — first run produces a diff, **idempotent** thereafter.
| Key | Governs |
|---|---|
| `enabled` | Master switch. False resolves every lever below to off. |
| `discovery` | `peers-check.js` and the startup `Peers:` row. False **implies all three groups off** — announcing to peers never discovered is not meaningful. |
| `notices` | Dispatch-caveat and skip-reason lines printed once per announcement. False leaves dispatch unchanged. |
| `upstreamMonitor` | Whether the background upstream-push poller arms. Intervals and backoff stay in `.claude/metadata/upstream-monitor.json`. |
| `noticeNarration` | **The one receive-side lever (#2735).** How verbosely *this* session narrates an announcement it **receives**. Absent/`true` = today's verbose behavior; `false` keeps the one-line acknowledgment, drops the commentary. Not implied by `discovery: false`; forced off by `enabled: false`. |
| `overlapNotices` | Whether `/overwatch` sends a targeted overlap notice to the sessions whose in-flight issues declare the same files (#2914). `false` is report-only: reported to the monitor's user, no session messaged. Resolved off by `enabled: false` and `discovery: false`. Dedupe and rate limit stay in `.claude/metadata/overwatch-signals.json`. |
| `broadcast` | **Routing mode, not an off switch (#2915).** Absent or `true`: every announcement `announce.js` composes (`/work`, review events, `/done`'s push group) goes to every addressable peer — today's behavior. `--off broadcast` selects **targeted** routing: with a live `/overwatch` whose pid is an addressable, uniquely named peer, announcements go to it alone and other peers are skipped as `routed-to-monitor`. No live monitor, stale marker, unaddressable monitor or shared monitor name → **falls back to broadcast**, never silence, and the notice names why. `/done` push/CI events route the same way (#2972); `/qa`'s `fixtures-provisioned` bypasses `announce.js` and still broadcasts. **Known cost:** a monitor holding, declining or letting messages expire is undetectable from the sender (#2674), so no session hears anything. Unchanged by `enabled: false` / `discovery: false`. |
| `groups.work` | `/work` events 1 `work-started`, 2 `work-completed` |
| `groups.push` | `/done` events 3 `push-started`, 4 `ci-terminal`, 5 `push-rejected` |
| `groups.review` | `/review-issue` event 6 `review-started`, `/resolve-review` event 7 `review-resolved` |
### Where the settings live — `.claude/x-session.json` (#2774)
The levers are **not** in `framework-config.json` any more; they live in `.claude/x-session.json`, **gitignored** — a per-developer preference, not team policy. Why the file moved: `{frameworkPath}/Reference/Cross-Session-Messaging.md` § Project Config.
**This command creates the file when absent**, and an absent `framework-config.json` no longer refuses the run: the *owns one key, not the file* rule was about `framework-config.json`. It owns the new file outright.
**The one-shot move.** First write in a project still carrying `crossSessionMessaging` carries the values across and strips the key. **New file written first, key stripped after** — the reverse would delete settings and fail to replace them. `migrated: true` on that run. A failed strip is reported, **not** fatal: the levers are written, and failing there reports a write that did happen as a run that did not.
**Reading falls back, and says when it did.** New file first, then the legacy key; the new file wins **outright** — never merged, because a half-migrated project must not resolve to a blend of two files nobody wrote. A run that read the legacy location says so in `implications`; relay it.
`--show` reports `source`: `environment`, `x-session-json`, `project-config` (legacy) or `default`.

### The effective routing line (#2971)
`broadcast: false` is **intent**; whether targeted routing is **in effect** depends on a live `/overwatch` now — a monitor started later, or crashed since, changes it with no config change, and the startup `Peers:` row is one snapshot. So with `broadcast` resolving `false`, `--show` and a bare run carry a `routing` field and one line in `summary` and `implications`:
| `routing.mode` | Line |
|---|---|
| `targeted` | `announcement routing: targeted — live monitor <name> (#<pid>)` |
| `fallback` | `announcement routing: targeted configured, falling back to broadcast: <reason>` — `no-marker`, `stale-pid`, `stale-boot`, `malformed`, `cwd-mismatch`, `monitor-not-addressable`, `monitor-name-ambiguous`, plus the marker's pid when known |
| `undetermined` | `announcement routing undetermined: <why> — not confirmed targeted` — discovery or marker read failed |
**The mode comes from the decision `announce.js` makes** — `lib/announce-routing.js` `routeRecipients()` over discovered peers and the marker reading; never a separate marker check (two definitions of "targeted" drift). **A failed read is `undetermined`, never `targeted`** — an unverified "targeted" is the false all-clear this line removes.
**No line, `routing: null`,** when there is nothing to route: `broadcast` on, messaging disabled, or discovery off.
**Covers what `announce.js` composes:** `/work`, review events, `/done`'s push group. `/qa`'s `fixtures-provisioned` always broadcasts; branch-operation notices are forced to every peer (#2960).
**Read-only:** reads the registry and marker, writes nothing; `--show` still writes nothing, a bare run writes exactly what it did before.
### The session layer above all of it — `IDPF_X_SESSION` (#2705)
Every key above is **project** state: git-tracked, shared by every session in the directory. This is the **session** layer, and it sits above them:
```
IDPF_X_SESSION  >  framework-config.json crossSessionMessaging  >  enabled by default
```
**All-or-nothing.** A recognized off-value resolves exactly as `enabled: false` — discovery, notices, upstream monitor, narration, all three groups. It accepts no lever list — per-lever tuning stays a project decision via `--off <levers>`.
**Only `off`, `0` and `false` suppress**, case-insensitive after trimming; empty or whitespace-only counts as **absent**. **Anything else leaves messaging enabled and is reported as unrecognized.** Why an unknown value fails *open*, and why this layer is all-or-nothing: `{frameworkPath}/Reference/Cross-Session-Messaging.md` § The Session Layer.
**This command never writes it — a guarantee, not an omission.** The override is session-scoped; `framework-config.json` is project-scoped and committed. So `run()` derives what it **writes** from the config resolved *without* the env layer, and what this **session** does from the config resolved *with* it. The two views are named `written` and `effective`; under an active override they always differ.
| Envelope field | View | Answers |
|---|---|---|
| `object` | `written` | what the project file now declares |
| `summary`, `implications`, `source`, `envOverride` | `effective` | what this session will actually do |
Reporting either alone is false under an override: `object` alone says messaging is on while nothing leaves the session; `summary` alone says off while the file says otherwise, sending the next reader to change a key that is already correct. **Report `summary` and every `implications` entry verbatim** — that is where the variable is named and where the reader is told the value was **not** written to `framework-config.json`.
## Recorded decisions
The part a script cannot carry; each exists because the alternative was tried.
> **Groups, not per-event toggles.** Every event 3 is followed by exactly one terminal event. Per-event toggles would make "push-started on, ci-terminal off" valid config — a peer waiting forever for a message that never arrives. Grouping makes that **unrepresentable**.
> **Governs emission, with exactly one exception (#2674, amended #2735).** Whether a dispatched message is accepted, held, declined or left to expire is the receiver's decision, undetectable from the sender. No setting here promises delivery. **The exception is `noticeNarration`, which is receive-side:** how verbosely this session narrates an announcement it receives. It lives in this object rather than a sibling key so it inherits one resolver, one absence rule and the `--on`/`--off` idiom; a parallel key re-implements all three, and a second copy of the absence rule is what this object exists to prevent. Recorded, not hidden — a reader assuming the emission-only framing still holds universally will look elsewhere for a receive-side setting and not find one.
> **Quiet trims commentary, not the signal (#2735).** `--quiet` keeps the one-line acknowledgment and drops issue lookup, likely-files enumeration and collision-surface analysis. Why the acknowledgment stays: `{frameworkPath}/Reference/Cross-Session-Messaging.md` § Inbound Narration.
> **Polarity, not preference (#2735).** Named so `true` is today's behavior. A lever called `quietNotices` would invert the resolver's one rule — absence resolving to quiet, silently changing behavior in every project that never wrote the object.
> **Superseded design (#2702).** An interactive walk of seven prompts was built first and **rejected in review** — flipping one lever meant answering six prompts about levers the user did not care about. Recorded so the flag form does not read as the option nobody considered.
> **Explicit over implied (#2702).** An earlier draft recorded negatives alone, arguing that emitting `true` would freeze a project against future releases. **That does not survive checking** — `resolveCrossSessionConfig` reads each key independently, so a lever added later still resolves to enabled. Only legibility was lost: a reader had to know what absence meant.
## Error Handling
The helper validates before writing and returns `ok: false` **without touching the config** — an error that still mutated the file is worse than no validation, since "error" reads as "nothing happened". Report its `errors` verbatim and STOP.
| Situation | Reported as |
|---|---|
| `framework-config.json` missing | `No framework-config.json at <path>.` Never created — this command owns one key, not the file. |
| Unknown lever | Names the token and lists the valid levers. Never fuzzy-matched. |
| A lever in both `--on` and `--off` | Names the conflicting lever. |
| A flag with no value, or an unknown flag | Named, never ignored — silently dropping one would report success having changed nothing. |
| Schema-invalid result | `Write refused: …` with the validator's message. |
**End of /x-session-config Command**
