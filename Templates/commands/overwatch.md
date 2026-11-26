---
version: "v0.123.0"
description: Dedicate a session to observing cross-session IDPF activity.
argument-hint: "[--auto-create] [--force] | --on <keys> | --off <keys> | --show [--help]"
copyright: "Rubrical Works (c) 2026"
---

<!-- MANAGED -->
# /overwatch
Dedicates this session to observing cross-session activity here: consumes the lifecycle announcements peers broadcast, correlates them with local commits, reports what no single working session can see.
**MANAGED, with no `USER-EXTENSION` blocks** (#2746). Tunables, one place per owner:
- **Hub-owned signals:** `.claude/metadata/overwatch-signals.json` — data, read-only in deployed projects.
- **Per-project defaults:** `.claude/.overwatch/config.json` (#2957), written by `--on`/`--off`, read via `overwatch-config.js` `resolveOverwatchConfig()`; keys = `.claude/metadata/overwatch-config.schema.json` properties (`autoCreate`). `.claude/.overwatch/` is per-developer, gitignored. Absent = today's behavior.
## Prerequisites
- `gh pmu` installed, `.gh-pmu.json` configured (only for `--auto-create`)
- Cross-session messaging discoverable — see **Degradation** when it is not
## Arguments
| Argument | Required | Description |
|----------|----------|-------------|
| `--auto-create` | No | File bugs automatically for filable findings, and offer enhancements. **Opt-in; off by default.** Absent, the `autoCreate` config default applies (`false` unless set); off, every finding is reported and nothing filed. Forces it on for this run only. |
| `--force` | No | Start even when a live presence marker names another monitor, displacing it. **Required on win32**, where liveness is pid-existence only, so a recycled pid reads as live. Takes no value. |
| `--on <keys>` | No | **Config, not a run.** Set each named key (comma-separated, or `all`) to `true`, write `.claude/.overwatch/config.json`, stop. Keys from `overwatch-config.schema.json`. |
| `--off <keys>` | No | **Config, not a run.** As `--on`, setting each key `false`. `/overwatch --off autoCreate` runs without auto-create when the file has it on; no per-run force-off flag. |
| `--show` | No | **Config, not a run.** Print every key with resolved value and source (`file` or `default`), plus the presence marker's state. Writes nothing. |
| `--help` | No | Open this command's docs page. Takes precedence over every other argument and performs no action. |

**`--help` takes precedence over every other argument and performs no action:** run `node .claude/scripts/shared/command-help.js overwatch`, report its output, and STOP.
**A config invocation never starts the monitor (#2957).** `--on`, `--off`, `--show` write or report, then STOP: no presence marker, no loop (else `--show` would take the monitor slot and `--on` on win32 would need `--force`). Rejected, writing nothing: `--show` with `--on`/`--off`; any config flag with `--auto-create` or `--force`; an unknown key; a key in both lists.
## What This Command Can and Cannot See
**This section is the contract. A monitor that implies wider coverage than it has is worse than none — a reader stops looking for what it silently misses.**
| Source | Observable? |
|---|---|
| Lifecycle announcements addressed to this session | **Yes** — the whole vocabulary below |
| Local git state (`git log`, `git status`, the working tree) | **Yes** |
| A direct `SendMessage` between two **other** sessions | **No** |
| Anything in a different working directory, on another machine, or under another user | **No** |

**Direct messages between other sessions are point-to-point and unobservable** — no bus, log or tap. Say so in the report; never present the analysis as complete coverage. Discovery, reachability, delivery: `{frameworkPath}/Reference/Cross-Session-Messaging.md`.
**No new transport is required, and none should be added.** By default (`broadcast` absent or `true`) `peer-announce.js` `resolveRecipients()` sends every announcement to **every addressable discovered peer**, so an idle session here already receives all fifteen events; the gap is a **consumer**, not a channel.
**Under targeted routing the monitor is the only receiver (#2915).** With `broadcast: false` in `.claude/x-session.json`, what `announce.js` composes (`work-started`, `work-completed`, the four review events, `/done`'s push group `push-started`/`ci-terminal`/`ci-resolved`/`push-rejected`) goes to this monitor alone, others skipped as `routed-to-monitor`; sessions hear of each other only via overlap notices (Step 4a). `/qa`'s `fixtures-provisioned` (not via `announce.js`) and the branch-operation notices (#2960) still reach every peer.
- **It falls back to broadcast, never to silence**, when this monitor cannot be confirmed a uniquely addressable peer (no or stale marker, marker pid not addressable, a peer sharing this name); the sender's notice names why.
- **A monitor that holds, declines or lets messages expire is undetectable from the sender (#2674)**: under targeted routing a monitor not reading leaves every session uninformed — no session hears the announcements. Use targeted routing only while actively consuming.

**Events consumed** — the full `peer-announce.js` vocabulary, no subset:
`work-started`, `work-completed`, `push-started`, `ci-terminal`, `ci-resolved`, `push-rejected`, `review-started`, `review-resolved`, `review-passed`, `review-findings`, `fixtures-provisioned`, `branch-merge-starting`, `beta-starting`, `release-starting`, `branch-destroy-starting`. `fixtures-provisioned` (#2827) names scratch board issues `/qa` provisioned for a manual check; a later `work-started` on one is expected, not a collision.
**Branch-operation notices (#2960):** `/merge-branch`, `/prepare-beta`, `/prepare-release`, `/destroy-branch` announce before their first irreversible step as a **forced broadcast**, so sessions hear them directly — this monitor is one recipient, with no relay. Record-only, not openers: no closer, never terminal; never report a missing follow-up.
**A terminal claim is checked against what follows it (#2902).** `review-passed` and the CI resolution events say "No further announcement will follow"; a later announcement naming the same issue leaves peers that stopped waiting with a stale belief — the `terminal-claim-contradicted` finding.
- **Needs per-issue terminal history**, which is **session-scoped**: a contradiction spanning two monitor sessions is unobservable anyway.
- **Keys on terminality generally, never on `review-passed` alone** — `ci-resolved` carries the same claim; ask whether the earlier announcement was terminal.
- **Reported, never filed** (`severity: report`, `autoCreatable: false`; rationale in `overwatch-signals.json`, vs. `opener-while-previous-unmatched`). A later `work-started` on a `/qa` scratch issue (`fixtures-provisioned`) is expected, not a contradiction.

**The monitor emits no lifecycle announcements of its own** — it performs no work; emitting would be noise.
**Two narrowings, and only two.** An overlap notice (#2914) goes only to the sessions involved; a receipt reply (#2922) goes only to the sender. Neither is broadcast or about the monitor's own work. Every other finding is reported to this session's user alone (#2768).
## Run Model
**A self-paced `/loop`, not a new scheduler.** Wake on inbound announcements (they arrive on their own); use a long fallback interval for git polling (`observation.gitPollFallbackSeconds` in `overwatch-signals.json`, bounded to the `ScheduleWakeup` clamp).
**Do not schedule short-interval polling for harness-notified work** — a short tick spends turns to learn nothing. The fallback exists for state the harness cannot notify on (commits from another session).
## Workflow
### Step 0: Parse Arguments and Route (#2957)
**Delegate the parse and the routing decision; never re-derive either here.** Pass arguments verbatim:
```bash
node .claude/scripts/shared/overwatch-config.js <arguments>
```
It prints one JSON object. Act on it **before anything else runs**:
| Output | Action |
|---|---|
| `ok: false` | Report `errors` verbatim and **STOP**. Nothing was written. |
| `startLoop: false` (`mode: config` or `show`) | Report the output (`config` names the file and values written; `show` lists each key's `value`, `source` and the marker's state) and **STOP**. Write no presence marker and start no loop: this invocation configures, it is not a monitor. |
| `startLoop: true` (`mode: loop`) | Carry `autoCreate` (with `autoCreateSource`: `flag`, `file` or `default`) and `force` into the steps below. A non-empty `errors` here means `config.json` was schema-invalid: report once and run on the defaults. |

**Routing is first on purpose** — Step 1a claims the marker, so a config invocation reaching it would take the monitor slot. The no-loop guard is exercised as code in `tests/scripts/shared/overwatch-config.test.js`.
### Step 1: Resolve Configuration
```bash
node .claude/scripts/shared/lib/cross-session-config.js
```
Read the resolved state; **never re-derive the defaults inline** — six consumers share the absence rule, and the `discovery: false` group implication is what a local copy gets wrong.
### Step 1a: Claim the Presence Marker (#2769)
**Delegate the decision and the write; do not re-derive either here.**
```bash
node -e "console.log(JSON.stringify(require('./.claude/scripts/shared/lib/overwatch-presence.js').claimPresence(process.cwd(), {force: FORCE})))"
```
`FORCE` ← Step 0's `force`. Returns `{claimed, reason, message}`. **`claimPresence` writes the marker itself (#3063)** — never write it here. It runs `decideStart`, creates exclusively on `no-marker`, overwrites only for stale reasons, `self`, and `live` with `--force`; a losing simultaneous start gets `claimed-concurrently`.
**Session identity travels in `CLAUDE_PID`, inherited — do not substitute it (#2795).** **Never** `process.pid` (the `node -e` child's pid), which made `self` unreachable.
- `claimed: false` → **refuse to start.** Report `message` verbatim and **STOP**. Nothing was written.
- `claimed: true` → marker at `.claude/.overwatch/.overwatch.json` (`markerPath(cwd)`) with `{pid, procStart, startedAt, cwd, version}`; continue to Step 2. **`pid` is the session pid (`CLAUDE_PID`)**, so an unresolved `CLAUDE_PID` refuses even with no marker (`self-pid-unresolved`).

**Write the current path only; the fallbacks are read, never written (#2928, #2957).** `readPresence` falls back to the pre-move root `.overwatch.json`, then `.hall-monitor.json`; `markerFile` names which answered. Fallbacks stay inert.
| `reason` | `claimed` | Meaning |
|---|---|---|
| `no-marker` | yes | Nothing there; created exclusively |
| `claimed-concurrently` | **no** | Another start's exclusive create won; `message` names its pid |
| `stale-pid`, `stale-boot`, `malformed`, `cwd-mismatch` | yes | **Overwrite. Never refuse** |
| `self` | yes | This **session's** own marker — the same monitor re-arming, not a second one. Reachable only because `CLAUDE_PID` carries the session pid |
| `live` | **no** | A different monitor runs here. `message` names its pid, `startedAt`, and `--force` |
| `live` with `--force` | yes | Overwrite, naming the pid displaced |
| `self-pid-unresolved` | **no** | `CLAUDE_PID` unset or unreadable: cannot tell a live marker is its own, nor write one naming itself. Its own reason, never folded into `live` |

**Refusal is scoped to `live` and `self-pid-unresolved`, and must stay that way.** The helper never deletes, so this overwrite is a stale marker's **only** cleanup; a refusing stale reason would let one crashed monitor lock out every future monitor here permanently.
**`self-pid-unresolved` is not a `live` verdict and must not be reported as one**; `--force` still displaces the marker in this state.
**Writing a file is not an announcement** (#2768, #2914): nothing is sent to any peer. **Under `discovery: false` the marker is still written.**
### Step 2: Establish the Baseline
Record current `HEAD` and the set of open issues in flight. Everything reported later is a delta against this.
### Step 3: Observe
Hold received announcements for the session. On each tick, read local commits since the last tick:
```bash
git log --oneline <last-tick-sha>..HEAD
```
### Step 3a: Receipt Replies (#2922)
**Every announcement routed here gets one receipt reply to its sender.** It says the monitor **received** it and claims nothing about whether it acted on it or about any session it relays to. Why this is the one sender-visible confirmation (#2674): `{frameworkPath}/Reference/Cross-Session-Messaging.md` § Receipt Replies.
**Delegate the decision — never judge an inbound message in prose:**
```javascript
const { decideReceipt } = require('.claude/scripts/shared/lib/overwatch-receipt.js');
const d = decideReceipt({ text: inbound.text, from: inbound.fromName, event: classifiedEvent });
```
`d.reply` true → `SendMessage` to `d.to` with `d.text` **verbatim**, exactly one reply per accepted announcement. **Never compose or edit the text** (#2790: a composed payload once named a commit that never existed).
`d.reply` false → send nothing; `d.reason` says why:
| `reason` | Meaning |
|---|---|
| `no-ledger-id` | Sender predates the suffix, or not a recorded announcement (`fixtures-provisioned` is composed outside `announce.js`; push and CI events carry one since #2972) |
| `overlap-notice` | This monitor's own notice (Step 4a) |
| `receipt-reply` | A receipt reply — never replied to |
| `no-sender` | No address to reply to |
| `no-text` | Nothing usable arrived |

**Never a gate.** Nothing waits for a reply to be read, nothing retries; a failed `SendMessage` is reported and the tick continues. The sender records the reply itself, every id from one monitor in one call (`announce.js --receipt-received --ledger-id <id>[,<id>...]`), with no `--from` — the ledger already names this monitor on each entry routed to it (#3911). This monitor keeps no receipt state.
### Step 3b: Session Exits (#3912)
**A session exiting here records its exit; it cannot send it.** Its SessionEnd hook writes the announcement as its own file in `.claude/.overwatch/session-exits/`, addressed to this monitor alone while the marker is live, else to every addressable sibling. Nothing arrives as a message: no turn follows SessionEnd, and a subprocess cannot call `SendMessage` (#2660). **So read it on every tick:**
```bash
node .claude/scripts/shared/peers-check.js --exits
```
`success: false` → report `message`: exits are **unknown or incomplete** (unreadable record directory or record, or no `CLAUDE_PID`), never zero; still report what `data.exited` holds; read again next tick. `data.exited` lists exits addressed to this session, one `{id, pid, name, sessionId, exitedAt, reason}` each, plus `warnings` on an exit recorded degraded. For each `id` not yet reported this run:
- **Report it** to this session's user, naming the session and the time.
- **Drop the session from the in-flight picture.** An issue it announced with `work-started` and never closed with `work-completed` is now unattributed, so overlap notices (Step 4a) stop naming it as a recipient.

**Best-effort, and say so.** SessionEnd does not fire on a hard kill (#2792), so **a missing exit record never proves a session is alive.** Not a receipt-reply case (Step 3a): nothing was sent, so nothing gets a reply.
### Step 4: Correlate and Report
Compare what was announced against what landed. Finding kinds, severities and rationales are **data** — re-read `.claude/metadata/overwatch-signals.json` from disk at use (rule `01-anti-hallucination.md`); do not restate them here.
**Re-validate before reporting.** Observations go stale inside a tick (an issue read `in_review` can be `Done` ninety seconds later). Re-check any issue state a finding depends on immediately before reporting it, and say when it could not be re-confirmed.
**Report findings to the user in this session.** Severity `report` findings are reported and never filed — they name a risk, not a defect.
### Step 4a: Overlap Notices (#2914)
**The `scope-overlap` finding is also told to the sessions involved.** Reporting it to this session's user (Step 4) still happens in every case.
**Gated by the `overlapNotices` lever**, from Step 1's `cross-session-config.js` output — never re-derived. `false` (set directly, or by `enabled: false`, `discovery: false` or `IDPF_X_SESSION`) is report-only: overlaps are reported, no session is messaged.
**Delegate the whole decision:**
```javascript
const { attributeInFlight, evaluateOverlapNotices } = require('.claude/scripts/shared/lib/overwatch-overlap.js');
const owners = attributeInFlight(announcements);   // [{event, issues, fromName, at}] as received
const inFlight = issues.map((n) => ({ issue: n, session: owners[n] || null, body: bodyOf(n) }));
const r = evaluateOverlapNotices({ inFlight, sent, now: Date.now(), signals, config });
```
- **Attribution** is the `from-name` on the `work-started` received for the issue; a later `work-completed` takes it out of flight. Record each announcement's `from-name` as it arrives — nothing else says who is working what.
- **Overlap** is declared scope only — the authored `**Files to modify:**` / `**Files:**` section, parsed by `scope-drift-check.js`. Re-read each body immediately before this step. Committed-file overlap is #2839's.
- **Recipients are both sessions** of an overlapping pair, one notice each.

| Field | Action |
|---|---|
| `notices[]` | `SendMessage` to `recipient` with `text` **verbatim**, then append `{fingerprint, recipient, at}` to `sent`. **Never compose or edit the text** (#2790). |
| `reportOnly[]` | Report to this session's user with its `reason`: `unattributed` — an issue with no attributable sender is **never messaged**, nor is the other side of its pair; `same-session`; `overlap-notices-off`; `signals-unreadable`. |
| `suppressed[]` | Withheld: `duplicate` (`overlapNotices.dedupe`) or `rate-limited` (`overlapNotices.rateLimit`, per recipient). Name them in the tick summary; not a failure. |

**Dedupe and the rate limit are data** in `overwatch-signals.json` `overlapNotices` — without them a standing overlap becomes one message per tick. A widened overlap (new shared path) is a new notice.
**Advisory, and dispatch is not delivery (#2674).** A failed `SendMessage` is reported and the tick continues. Nothing is blocked — enforcement is Station's (#2640).
### Step 5: Auto-Create (resolved `autoCreate` only)
**Opt-in; runs only when Step 0 resolved `autoCreate` to `true`**, from `--auto-create` (source `flag`) or the config default (source `file`). Name the source when it runs, so a project default is not mistaken for a flag nobody typed. Only a finding whose disposition is `filable` **and** `autoCreatable` is eligible; `report` findings never are.
**Two guards, both metadata-driven** (thresholds in `.claude/metadata/overwatch-signals.json`, tunable without a spec edit):
| Guard | What it stops |
|---|---|
| **dedupe** (`autoCreate.dedupe`) | A **standing** condition re-derived every tick becoming one issue per tick. The fingerprint excludes `detail`, the part most likely reworded between ticks. |
| **rate limit** (`autoCreate.rateLimit`) | An analysis gone wrong filing unbounded issues. The cap is the blast radius. |

**Guards first, and delegate the decision:**
```javascript
const { evaluateAutoCreate } = require('.claude/scripts/shared/lib/overwatch-guards.js');
const verdict = evaluateAutoCreate({ finding, filings, now: Date.now(), signals });
```
`allowed: false` → report `reason` (`duplicate`, `rate-limited`, `signals-unreadable`), file nothing. **Refusal is reported, never silent** — an unexplained non-filing is indistinguishable from a monitor that never looked.
**Bug path — delegate to a subagent, which keeps the monitor responsive.** Filing is multi-step (sweep, compose, `gh pmu create`); inline it blocks, and a monitor that stops monitoring while it files has stopped being one. Spawn a subagent to run `/bug`.
- A **prior-art sweep is mandatory**; an `already-shipped` verdict **skips** the filing. An unattended filer has no human check between it and the board.
- Auto-filed issues carry the `auto-filed` label from `autoCreate.label` — recognizable and reversible.
- **The subagent runs degraded, and must say so.** Every subagent lacks the task tools — `TaskCreate`/`TaskList` cannot be given to a subagent by any route (`{frameworkPath}/Reference/Agent-Architecture.md`, findings 4 and 5) — so `/bug` runs under rule `07-task-creation-timing.md`'s inline-checklist fallback and the `TaskList` compaction-recovery guarantee does not hold, whatever the subagent's type.

**Enhancement path — stays in this session, and cannot be delegated.** A subagent has **no `AskUserQuestion`** (finding 3), so it cannot make an offer. Offer enhancements here via `AskUserQuestion`; **never file one unattended.**
### Step 6: Continue or Stop
Schedule the next tick, or stop when the user says so. One-line summary per tick; consecutive quiet ticks collapsed.
**Release the marker on stop.** Remove `.claude/.overwatch/.overwatch.json` **only when its `pid` matches this process**; leave a foreign marker untouched. Leave `.claude/.overwatch/` in place (`config.json` lives there). Without the ownership test, monitor A exiting would delete a marker monitor B had overwritten with `--force`.
**Abnormal termination leaves a stale marker by design.** No crash hook is proposed. The next monitor's start-time overwrite is the recovery; the startup `Peers:` row names the stale marker meanwhile.
## Degradation
| Condition | Behavior |
|---|---|
| `crossSessionMessaging.discovery` false | Not discovered, **receives no announcements**. Degrade to **git-only observation** and report it plainly — a quiet channel and an unwatched one are otherwise indistinguishable. |
| `enabled` false | Same, cause reported as `crossSessionMessaging.enabled: false`. |
| No peers discovered | Normal. Report git-derived findings only. |
| `overlapNotices` false | Report-only for overlaps: Step 4a sends nothing; no per-tick notice that the lever is off (#2914). |
| `overwatch-signals.json` missing or unreadable | Report the gap, continue report-only. `--auto-create` **refuses** — `evaluateAutoCreate` returns `signals-unreadable`; failing open would leave an unbounded filer. |
| `.claude/.overwatch/config.json` schema-invalid | Step 0 reports the rejection once; the loop runs on defaults. Never half-read, never rewritten. Fix by hand or with `--on`/`--off`, which refuse to write over an invalid file. |
## Error Handling
| Situation | Response |
|-----------|----------|
| `gh` unavailable | Report; git-derived findings continue. Never halt the loop. |
| A guard helper throws | Cannot happen by construction (pure, no throwing path); if it did, report and continue — the monitor is advisory. |
| Subagent filing fails | Report the failure and the finding it was filing, so the finding is not lost. |
| `--auto-create` with no filable findings | Nothing to do. Do not lower the bar to produce one. |

**End of /overwatch Command**
