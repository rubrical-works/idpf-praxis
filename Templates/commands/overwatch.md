---
version: "v0.106.0"
description: Dedicate a session to observing cross-session IDPF activity.
argument-hint: "[--auto-create] [--force] | --on <keys> | --off <keys> | --show"
copyright: "Rubrical Works (c) 2026"
---
<!-- MANAGED -->
# /overwatch
Observes cross-session activity: consumes the lifecycle announcements peers broadcast, correlates them against local commits, reports what no single working session can see.
**MANAGED, no `USER-EXTENSION` blocks** — the command text has no per-project customization surface (#2746 reasoning). Tunables have two owners: hub-owned signal definitions in `.claude/metadata/overwatch-signals.json` (data, read-only when deployed), and per-project defaults in `.claude/.overwatch/config.json` (#2957) — written by `--on`/`--off`, read via `overwatch-config.js` `resolveOverwatchConfig()`, keys = `.claude/metadata/overwatch-config.schema.json` properties (currently `autoCreate`). `.claude/.overwatch/` is per-developer, gitignored; absent file or key = today's behavior.
## Prerequisites
`gh pmu` + `.gh-pmu.json` (only for `--auto-create`); messaging discoverable — see **Degradation**.
## Arguments
| Argument | Required | Description |
|----------|----------|-------------|
| `--auto-create` | No | File bugs automatically for filable findings, and offer enhancements. **Opt-in; off by default.** Absent, the `autoCreate` config default applies (`false` unless set); off, findings are reported and nothing is filed. Forces it on for this run only. |
| `--force` | No | Start even when a live marker names another monitor, displacing it. **Required on win32**, where liveness is pid-existence only so a recycled pid reads as live. No value. |
| `--on <keys>` | No | **Config, not a run.** Set each key (comma-separated or `all`) `true`, write `.claude/.overwatch/config.json`, stop. Keys from `overwatch-config.schema.json`. |
| `--off <keys>` | No | **Config, not a run.** As `--on`, setting `false`. `--off autoCreate` is how to run without auto-create when the file has it on — no per-run force-off flag. |
| `--show` | No | **Config, not a run.** Print every key's resolved value and source (`file`/`default`) plus the marker state. Writes nothing. |
**A config invocation never starts the monitor (#2957).** `--on`/`--off`/`--show` write or report, then STOP — no presence marker, no loop (else `--show` takes the monitor slot and `--on` needs `--force` on win32). Rejected by name, writing nothing: `--show` with `--on`/`--off`; any config flag with `--auto-create`/`--force`; an unknown key; a key in both lists.
## What This Command Can and Cannot See
**This section is the contract: a monitor implying wider coverage than it has is worse than none, because a reader stops looking.**
| Source | Observable? |
|---|---|
| Lifecycle announcements addressed to this session | **Yes** — the whole vocabulary below |
| Local git state (`git log`, `git status`, working tree) | **Yes** |
| A direct `SendMessage` between two **other** sessions | **No** |
| Another working directory, machine, or user | **No** |
**Direct messages between other sessions are point-to-point and unobservable** — no bus, no log, no tap. Say so rather than presenting the analysis as complete coverage. Discovery scope, reachability and delivery dispositions: `{frameworkPath}/Reference/Cross-Session-Messaging.md`.
**No new transport is required, and none should be added.** By default (`broadcast` absent or `true`) `peer-announce.js` `resolveRecipients()` dispatches to **every addressable discovered peer**, so a discoverable idle session already receives all fifteen events. The gap this fills is a **consumer**, not a channel.
**Under targeted routing the monitor is the only receiver (#2915).** With `broadcast: false` in `.claude/x-session.json`, what `announce.js` composes — `work-started`, `work-completed`, the four review events, `/done`'s push group (`push-started`, `ci-terminal`, `ci-resolved`, `push-rejected`, #2972) — goes to this monitor alone; every other peer is skipped as `routed-to-monitor`. The monitor then sees the complete set, and working sessions hear of each other only through overlap notices (Step 4a). `/qa`'s `fixtures-provisioned` bypasses `announce.js` and still reaches every peer; branch-operation notices are forced to every peer on purpose (#2960).
- **It falls back to broadcast, never to silence**, when this monitor is not a confirmed, uniquely addressable peer: no marker, stale marker, marker pid not an addressable recipient, or another peer sharing this session's name. The sender's notice names the reason.
- **A monitor holding, declining or letting messages expire is undetectable from the sender (#2674)** — under targeted routing a monitor that is not reading leaves every session uninformed: no session hears the announcements and nobody is told. Use targeted routing only while this monitor is actively consuming.
**Events consumed** — full vocabulary, no subset: `work-started`, `work-completed`, `push-started`, `ci-terminal`, `ci-resolved`, `push-rejected`, `review-started`, `review-resolved`, `review-passed`, `review-findings`, `fixtures-provisioned`, `branch-merge-starting`, `beta-starting`, `release-starting`, `branch-destroy-starting`. `fixtures-provisioned` (#2827) names scratch board issues `/qa` provisioned for a manual check; a later `work-started` on one of those numbers is expected, not a collision.
**The four branch-operation notices (#2960) reach this monitor as one recipient among many.** `/merge-branch`, `/prepare-beta`, `/prepare-release`, `/destroy-branch` announce before their first irreversible step as a **forced broadcast** — every addressable peer, whatever `broadcast` says — so working sessions hear them directly, not through this monitor, which has no relay for branch operations. Record-only notices, not openers: no closer follows and none is terminal, so a monitor never expects a follow-up nor reports one missing.
**A terminal claim is checked against what follows it (#2902).** A terminal announcement invites peers to stop waiting — `review-passed` and the CI resolution events say "No further announcement will follow" verbatim. A later announcement naming that same issue leaves every peer that honored it holding a stale belief with nothing to correct it; the `terminal-claim-contradicted` finding reports it.
- **Detection needs per-issue terminal history** — the monitor otherwise correlates announcements against git, and this needs it to remember that a terminal event was seen for issue N. That history is **session-scoped**: a contradiction spanning two monitor sessions is not observable anyway, so persisting it buys nothing and costs more than the finding warrants.
- **Keys on terminality generally, never on `review-passed` alone.** `ci-resolved` carries the same claim verbatim, so a rule written against one event name misses the other. Ask whether the earlier announcement was terminal, not which event it was.
- **Monitor-only by construction.** A working session sees the events addressed to it and has no reason to keep per-issue history across cycles — this is the "what no single working session can see" role.
- **Reported, never filed** (`severity: report`, `autoCreatable: false`). Differs from `opener-while-previous-unmatched`, the nearest kind: that fires on an opener whose own closer has not arrived (ordering within a cycle), this on a claim made by a cycle that already closed.
- **`fixtures-provisioned` is the documented non-collision** — a later `work-started` on a `/qa` scratch issue is expected, not a contradiction.
**The monitor emits no lifecycle announcements of its own.** It performs no work, so emitting adds noise to every peer's inbox for no signal.
**Two narrowings, and only two.** An overlap notice (#2914) goes only to the sessions involved; a receipt reply (#2922) goes only to the sender. When two in-flight issues declare the same files, the monitor messages the two sessions working them (Step 4a). Not a lifecycle announcement — not broadcast, says nothing of the monitor's own work, actionable for exactly its two recipients. A receipt reply is the same shape: addressed to one sender, not broadcast, not about the monitor's own work. Every other finding is reported to this session's user alone.
## Run Model
**A self-paced `/loop`, not a new scheduler.** Wake on inbound announcements; long fallback for git polling (`observation.gitPollFallbackSeconds`, bounded to the `ScheduleWakeup` clamp).
**Never schedule short-interval polling for harness-notified work** — announcements and background tasks re-invoke the session already, so a short tick learns nothing. The fallback covers only what the harness cannot notify: commits from another session.
## Workflow
### Step 0: Parse Arguments and Route (#2957)
**Delegate the parse and routing; never re-derive either.** Pass the arguments verbatim:
```bash
node .claude/scripts/shared/overwatch-config.js <arguments>
```
One JSON object; act on it **before anything else runs**:
| Output | Action |
|---|---|
| `ok: false` | Report `errors` verbatim and **STOP**. Nothing was written. |
| `startLoop: false` (`mode: config`/`show`) | Report the output (`config`: file and values written; `show`: each key's `value`/`source` and the marker state) and **STOP**. No presence marker, no loop — this invocation configures, it is not a monitor. |
| `startLoop: true` (`mode: loop`) | Carry `autoCreate` (+ `autoCreateSource`: `flag`/`file`/`default`) and `force` into the steps below. Non-empty `errors` = `config.json` rejected as schema-invalid: report once, run on defaults. |
**Routing is first on purpose** — Step 1a claims the marker, so a config invocation reaching it would take the monitor slot. The no-loop guard is exercised as code in `tests/scripts/shared/overwatch-config.test.js`.
### Step 1: Resolve Configuration
```bash
node .claude/scripts/shared/lib/cross-session-config.js
```
**Never re-derive the defaults inline** — six consumers share the absence rule, and the `discovery: false` group implication is what a local copy gets wrong.
### Step 1a: Claim the Presence Marker (#2769)
**Delegate the decision; do not re-derive it here.**
```bash
node -e "console.log(JSON.stringify(require('./.claude/scripts/shared/lib/overwatch-presence.js').decideStart(process.cwd(), {force: FORCE})))"
```
`FORCE` ← Step 0's `force`. Returns `{proceed, reason, message}`.
**Session identity travels in `CLAUDE_PID`, inherited — do not substitute it (#2795).** `decideStart` resolves the session pid from the environment, the same source `peers-check.js` uses to recognize itself. It must **never** be `process.pid`: inside `node -e` that is the node child's pid, fresh every invocation and never the marker's, which made the `self` row unreachable and left a re-arming monitor refusing itself. A substituted placeholder was rejected for the same reason — an unsubstituted one fails in that direction, silently.
- `proceed: false` → **refuse to start.** Report `message` verbatim and **STOP**. Write nothing.
- `proceed: true` → write the marker at `.claude/.overwatch/.overwatch.json` (`overwatch-presence.js` `markerPath(cwd)`), creating `.claude/.overwatch/` if absent, with `{pid, procStart, startedAt, cwd, version}`, then continue. **`pid` is the session pid (`CLAUDE_PID`)** — the identity `decideStart` compares next tick. Writing this process's pid makes the marker read `stale-pid` immediately and defeats the `self` row.
**Write the current path only; the fallbacks are read, never written (#2928, #2957).** `readPresence` falls back to the pre-move root `.overwatch.json`, then the pre-rename `.hall-monitor.json`, one release each, reporting which path answered in `markerFile`. The write above writes the new path, so a fallback marker is never cleaned up — left inert, since the new path wins whenever several exist. Only a fallback-served reading means an older monitor is live here.
| `reason` | `proceed` | Meaning |
|---|---|---|
| `no-marker` | yes | Nothing there; write |
| `stale-pid`, `stale-boot`, `malformed`, `cwd-mismatch` | yes | **Overwrite. Never refuse** |
| `self` | yes | This **session's** own marker — the same monitor re-arming, not a second one. Reachable only because `CLAUDE_PID` carries the session pid into the subprocess |
| `live` | **no** | A different monitor is running here; `message` names its pid, `startedAt` and `--force` |
| `live` with `--force` | yes | Overwrite, naming the pid displaced |
| `self-pid-unresolved` | **no** | A marker is live but `CLAUDE_PID` is unset or unreadable, so this session cannot tell whether it is its own. Its own reason, never folded into `live` |
**Refusal is scoped to `live` and `self-pid-unresolved`, and must stay that way.** The helper never deletes, so this overwrite is the **only** cleanup path a stale marker has; if any stale reason could refuse, one crashed monitor would lock out every future monitor in this directory permanently — `malformed` being the sharpest case, where a truncated write becomes an unrecoverable lock.
**`self-pid-unresolved` refuses but is not a `live` verdict and must not be reported as one.** Treating it as `self` starts a second monitor on a guess; treating it as `live` blames a foreign monitor that may not exist and points at `--force`, which is not the remedy for meeting your own marker. `--force` still displaces the marker in this state, being the remedy for a foreign marker and a recycled win32 pid regardless of whether identity was established.
**Writing a file is not an announcement.** #2768's *emits nothing* criterion, as narrowed by #2914 to overlap notices, is preserved here: nothing is sent to any peer.
**Under `discovery: false` the marker is still written** — the monitor receives nothing, so quiet narration of announcements that never arrive is harmless.
### Step 2: Establish the Baseline
Record current `HEAD` and the open issues in flight; everything reported later is a delta against it.
### Step 3: Observe
Hold received announcements. Each tick, read commits since the last:
```bash
git log --oneline <last-tick-sha>..HEAD
```
### Step 3a: Receipt Replies (#2922)
**Every announcement routed here gets one receipt reply to its sender.** The monitor **received** it, and claims nothing about acting on it or about sessions it relays to. Why this is the one sender-visible confirmation (#2674): `{frameworkPath}/Reference/Cross-Session-Messaging.md` § Receipt Replies.
**Delegate the decision; never judge an inbound message in prose:**
```javascript
const { decideReceipt } = require('.claude/scripts/shared/lib/overwatch-receipt.js');
const d = decideReceipt({ text: inbound.text, from: inbound.fromName, event: classifiedEvent });
```
`d.reply` true → `SendMessage` to `d.to` with `d.text` **verbatim**, exactly one receipt reply per accepted announcement. **Never compose or edit the text** (#2790: a composed payload is how an announcement once named a commit that never existed). False → send nothing; `d.reason`:
| `reason` | Meaning |
|---|---|
| `no-ledger-id` | Sender predates the suffix, or not a recorded announcement (`fixtures-provisioned` carries no ledger entry; push/CI events do since #2972) |
| `overlap-notice` | This monitor's own notice (Step 4a) |
| `receipt-reply` | A receipt reply — never replied to |
| `no-sender` | No address to reply to |
| `no-text` | Nothing usable |
**Never a gate:** nothing waits, nothing retries, a failed `SendMessage` is reported and the tick continues. The sender records it (`announce.js --receipt-received --ledger-id <id>`); the monitor keeps no receipt state.
### Step 4: Correlate and Report
Compare announced against landed. Finding kinds, severities and rationales are **data** — re-read `.claude/metadata/overwatch-signals.json` from disk at use (rule `01-anti-hallucination.md`).
**Re-validate before reporting.** Observations go stale inside one tick: an issue read as `in_review` can be `Done` ninety seconds later, closed by a session that never announced it. Re-check any issue state a finding rests on immediately before reporting, and say so when it could not be re-confirmed.
Severity `report` findings are never filed — they name a risk, not a defect.
### Step 4a: Overlap Notices (#2914)
**The `scope-overlap` finding is also told to the sessions involved.** Step 4's report to this session's user still happens in every case.
**Gated by the `overlapNotices` lever**, read from Step 1's `cross-session-config.js` output — never re-derived. `false` (directly, or via `enabled: false`, `discovery: false` or `IDPF_X_SESSION`) is report-only: overlaps reported, no session messaged.
**Delegate the whole decision:**
```javascript
const { attributeInFlight, evaluateOverlapNotices } = require('.claude/scripts/shared/lib/overwatch-overlap.js');
const owners = attributeInFlight(announcements);   // [{event, issues, fromName, at}] as received
const inFlight = issues.map((n) => ({ issue: n, session: owners[n] || null, body: bodyOf(n) }));
const r = evaluateOverlapNotices({ inFlight, sent, now: Date.now(), signals, config });
```
- **Attribution** is the `from-name` on the received `work-started` for the issue; a later `work-completed` takes it out of flight. Record each announcement's `from-name` as it arrives — nothing else says who is working what.
- **Overlap** is declared scope only — the authored `**Files to modify:**` / `**Files:**` section, parsed by `scope-drift-check.js`. Re-read each body just before this step. Committed-file overlap is #2839's.
- **Recipients are both sessions** of an overlapping pair, one notice each.

| Field | Action |
|---|---|
| `notices[]` | `SendMessage` to `recipient` with `text` **verbatim**, then append `{fingerprint, recipient, at}` to `sent`. **Never compose or edit the text** — a composed list is how an announcement once named a commit that never existed (#2790). |
| `reportOnly[]` | Report to this session's user with its `reason`: `unattributed` (an issue with no attributable sender is **never messaged**, nor the other side of its pair), `same-session`, `overlap-notices-off`, `signals-unreadable`. |
| `suppressed[]` | Withheld: `duplicate` (`overlapNotices.dedupe`) or `rate-limited` (`overlapNotices.rateLimit`, per recipient). Name them in the tick summary; not a failure. |

**Dedupe and rate limit are data** in `overwatch-signals.json` `overlapNotices` — a standing overlap is re-derived every tick and would otherwise be one message per tick. A widened overlap (new shared path) is a new notice.
**Advisory, and dispatch is not delivery (#2674).** The text says both; a failed `SendMessage` is reported and the tick continues. Nothing is blocked — enforcement is Station's (#2640).
### Step 5: Auto-Create (resolved `autoCreate` only)
**Opt-in; runs only when Step 0 resolved `autoCreate` `true`** — from `--auto-create` (source `flag`) or the config default (source `file`). Name the source when it runs, so a project default is not mistaken for a flag nobody typed. Only `filable` **and** `autoCreatable` findings qualify.
**Two guards bound this step, both metadata-driven — thresholds in `overwatch-signals.json`, tunable without a spec edit:**
| Guard | What it stops |
|---|---|
| **dedupe** (`autoCreate.dedupe`) | A **standing** condition re-derived every tick becoming one issue per tick. The fingerprint excludes `detail` — the part most likely reworded between ticks while the finding is the same one. |
| **rate limit** (`autoCreate.rateLimit`) | An analysis that goes wrong filing an unbounded number of issues. The cap is the blast radius. |
```javascript
const { evaluateAutoCreate } = require('.claude/scripts/shared/lib/overwatch-guards.js');
const verdict = evaluateAutoCreate({ finding, filings, now: Date.now(), signals });
```
`allowed: false` → report `reason` (`duplicate`, `rate-limited`, `signals-unreadable`), file nothing. **Refusal is reported, never silent** — an unexplained non-filing is indistinguishable from a monitor that never looked.
**Bug path — delegate to a subagent; that is what keeps the monitor responsive.** Filing is multi-step (sweep, compose, `gh pmu create`) and inline it is blocking — a monitor that stops monitoring while it files has stopped being one. Spawn a subagent to run `/bug`.
- A **prior-art sweep is mandatory**; an `already-shipped` verdict **skips** the filing. Duplicate filing is a known failure here, and an unattended filer has no human check.
- Auto-filed issues carry the `auto-filed` label (`autoCreate.label`) — recognizable and reversible.
- **The subagent runs degraded and must say so:** `framework-dev` has no `TaskCreate`/`TaskList`, so `/bug` falls back to rule `07-task-creation-timing.md`'s inline checklist and the `TaskList` compaction-recovery guarantee does not hold.
**Enhancement path — stays in this session; it cannot be delegated.** Same tool boundary: `framework-dev` has **no `AskUserQuestion`**, so a subagent cannot make an offer at all. Bug filing is non-interactive and delegable; an offer is not. **Never file an enhancement unattended.**
### Step 6: Continue or Stop
Schedule the next tick, or stop when the user says so. One line per tick; quiet ticks collapse.
**Release the marker on stop.** Remove `.claude/.overwatch/.overwatch.json` **only when its `pid` matches this process**; leave a foreign marker untouched. Leave the `.claude/.overwatch/` directory — `config.json` lives there too. This closes the interleave `--force` allows: without the ownership test, monitor A exiting would delete a marker monitor B had overwritten, leaving B live and unmarked.
**Abnormal termination leaves a stale marker by design.** No crash hook, and none proposed: the next monitor's start-time overwrite is the recovery, and the startup `Peers:` row names the stale marker meanwhile.
## Degradation
| Condition | Behavior |
|---|---|
| `crossSessionMessaging.discovery` false | Not discovered, **receives no announcements**. Degrade to **git-only observation** and report that plainly — a quiet channel and an unwatched one are otherwise indistinguishable, and only one is fine. |
| `enabled` false | Same; cause reported as `crossSessionMessaging.enabled: false`. |
| No peers discovered | Normal. Report git-derived findings only. |
| `overlapNotices` false | Report-only for overlaps: Step 4a sends nothing, every overlap reported to this session's user. No per-tick notice that the lever is off (#2914). |
| `overwatch-signals.json` missing/unreadable | Report the gap, continue report-only. `--auto-create` **refuses** (`signals-unreadable`); failing open leaves an unbounded filer. |
| `.claude/.overwatch/config.json` schema-invalid | Step 0 reports the rejection once; the loop runs on defaults. Never half-read, never rewritten; fix by hand or with `--on`/`--off`, which also refuse to write over an invalid file. |
## Error Handling
| Situation | Response |
|-----------|----------|
| `gh` unavailable | Report; git-derived findings continue. Never halt the loop. |
| A guard helper throws | Cannot happen by construction; if it did, report and continue. |
| Subagent filing fails | Report the failure **and** the finding, so it is not lost with the attempt. |
| `--auto-create`, no filable findings | Nothing to do. Do NOT lower the bar to produce one. |
**End of /overwatch Command**
