---
version: "v0.106.0"
description: Generate an IDPF session statistics report with development velocity metrics.
argument-hint: "[--daily-log [prose]] [--today] [--date YYYY-MM-DD] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--repos /path/a,/path/b] [--repos-edit] [--save]"
copyright: "Rubrical Works (c) 2026"
---

<!-- MANAGED -->
# /idpf-stats

Session statistics from git history, GitHub issues, and test counts. Renders ASCII tables for volume, testing, throughput, and issue categorization. `--daily-log` instead writes a per-day work log for product, QA and engineering managers (Step 5).

**Scope:** Framework dev and user projects — deployed.

## Prerequisites

- Git repo
- `gh` CLI (issue breakdown skipped if missing)
- `.gh-pmu.json` optional

## Arguments

| Argument | Default | Description |
|---|---|---|
| `--today` | — | Explicit alias for default. `since` = midnight local today, `until` = "now". Mutually exclusive with `--since`/`--until`/`--date`. |
| `--date YYYY-MM-DD` | — | Full day shortcut. `since` = `T00:00:00`, `until` = `T23:59:59`. Deterministic. Mutually exclusive with `--since`/`--until`/`--today`. |
| `--since` | Today (midnight) | Start date `YYYY-MM-DD` |
| `--until` | Now | End date `YYYY-MM-DD` |
| `--repos` | — | Comma-separated dirs. With no value, uses cached list. |
| `--repos-edit` | — | Interactive add/remove on cached list |
| `--save` | — | Save report to `Construction/Reports/Stats/YYYY-MM-DD.md` (or range filename) |
| `--daily-log [prose]` | today | Management-facing daily work log per day instead of the stats tables (Step 5). Optional prose sets the days (`for every weekday last week`), running to the next flag-shaped token. No prose → today. Current repository only. Ignores `--today`/`--date`/`--since`/`--until`/`--save`/`--repos`/`--repos-edit` — each reported in the run output, not rejected; use prose (`for 2026-09-01`) to choose days. |

**Examples:** `/idpf-stats`, `/idpf-stats --today`, `/idpf-stats --date 2026-04-06`, `/idpf-stats --since 2026-03-10 --until 2026-03-14`, `/idpf-stats --repos /path/a,/path/b`, `/idpf-stats --repos-edit`, `/idpf-stats --save`, `/idpf-stats --daily-log`, `/idpf-stats --daily-log for every weekday last week`.

### Work Day Calculation

Range is anchored to **local timezone**, never UTC. Modes:

| Mode | `since` | `until` |
|---|---|---|
| Default / `--today` | Midnight local today | "now" (moves forward on re-run) |
| `--date YYYY-MM-DD` | `YYYY-MM-DD T00:00:00` local | `YYYY-MM-DD T23:59:59` local (deterministic) |
| `--since` / `--until` | `T00:00:00` of given date | `T23:59:59` of given date (or "now" if omitted) |

`getTzOffset()` detects system offset (e.g. `-04:00`) and formats git log queries accordingly. A commit at 23:55 local on 2026-04-06 appears in `--date 2026-04-06`, not the next day.

**Midnight boundaries:** `--date` uses `00:00:00`–`23:59:59`, so a commit exactly at midnight counts in the day it starts. Default/`--today` upper bound is "now" — clock-skewed future commits don't appear until clock catches up.

**`--today` vs `--date <today>`:** `--today` at 15:00 then 18:00 grows the range. `--date 2026-04-06` is fixed but misses commits made after the run. Use `--today` for "today so far"; use `--date` after the day ends.

## Workflow

**`--daily-log` present → run Step 5 only.** Steps 1–4 are the standard stats report; the daily log has its own collector, report and output location, and ignores every other flag except its prose.

### Step 1: Collect Metrics

```bash
node .claude/scripts/shared/stats-collect.js [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--repos /path/a,/path/b] [--repos-edit]
```

Parse JSON output. Script handles: timezone-aware parsing (local, never UTC), git execution for volume/testing/throughput, multi-repo aggregation, directory validation (non-git → warning + skip), directory list cache at `<framework_root>/idpf-stats/repos.json` (`framework_root` = `frameworkPath`: repo root self-hosted, **hub** root when deployed — `.claude/scripts/shared` is a hub symlink and Node resolves against the real path, so the cache is not under the project), edge cases (no commits/issues/tests, single-commit throughput).

**`--repos` behavior:**
- `--repos /path/a,/path/b` — collect and cache
- `--repos` (no value) — reuse cached list
- `--repos-edit` — present cached list via `AskUserQuestion`, then collect

**Auto-detection:** If no `--repos` flag but `<framework_root>/idpf-stats/repos.json` exists, auto-load and run multi-repo. It is the persistent source of truth, and resolves under the **hub** root when deployed — so every project sharing a hub shares this cache.

**Multi-repo output shape:** `{ aggregate, perRepo, warnings }`. `aggregate` matches single-repo shape; `perRepo` is per-directory results; `warnings` lists skipped non-git dirs.

**Script fails:** report error and STOP.
**No commits:** `volume.commits: 0` → skip to Step 4 (empty report).

### Step 2: Gather Issue Categories

**Requires:** `gh` CLI. Verify once with `gh auth status`.

**Single-repo mode:** Issues are `["#42", "#43"]`. Query default repo:
```bash
gh issue view $N --json labels --jq '.labels[].name' 2>/dev/null
```

**Multi-repo mode:** Issues are `[{ "number": 42, "repo": "owner/repo" }]`. Query with `--repo`:
```bash
gh issue view $N --repo $REPO --json labels --jq '.labels[].name' 2>/dev/null
```

Cross-repo issues query their originating repo, not current.

Categorize via `labelCategories` from `.claude/metadata/stats-config.json`:

| Label | Category |
|---|---|
| `bug` | Bug fixes |
| `enhancement` | Enhancements |
| `security` | Security hardening |
| `code-review`, `reviewed` | Code review findings |
| `infrastructure`, `ci`, `devops` | Infrastructure |
| `documentation`, `docs` | Documentation |
| (no match) | Other |

**No issues referenced:** skip issue breakdown table.
**`gh` not installed:** skip issue metrics. Report: "Issue breakdown unavailable (gh CLI not found)." `.gh-pmu.json` is NOT required — `gh` uses global auth (`~/.config/gh/hosts.yml`).

### Step 3: Render Output
**Volume is SPACE *Activity*, and the caveat travels with the heading (#2676).** Render the `volume` section under its configured `title` ("Activity (SPACE)") and print its `caveat` from `stats-config.json` beneath. Activity counts output, not value — a high count is not a good outcome. SPACE is explicit that one dimension read alone misleads; the other four (Satisfaction, Performance, Communication, Efficiency) are **not** collected. The caveat lives in config so the renderer can see it; one only a spec reader meets never reaches the report.

ASCII box-drawing tables from script output.

**Rendering rules:**
- Box chars: `┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼ │ ─`
- Auto-sized columns; header divider `├──┼──┤`
- Numbers right-aligned, text left-aligned
- Comma-format large numbers (`1,265`); `+`/`-` prefixes for deltas

**Title** uses `displayRange`:
- `isSingleDay: true` → `"Today's Session Stats ({since})"`
- `isSingleDay: false` → `"Session Stats ({since} to {until})"`

**Output structure:**

```
{Title} ({Date Range})

Volume
┌──────────────────────┬──────────────────┐
│        Metric        │      Value       │
├──────────────────────┼──────────────────┤
│ Commits              │ {volume.commits} │
│ Issues closed/worked │ {issues.length}  │
│ Files changed        │ {volume.filesChanged} │
│ Lines added          │ +{volume.linesAdded}  │
│   Code               │ +{byType.Code.added}  │
│   Documentation      │ +{byType.Documentation.added} │
│   Config             │ +{byType.Config.added}│
│   Other              │ +{byType.Other.added} │
│ Lines removed        │ -{volume.linesRemoved}│
│ Net lines            │ +/-{volume.netLines}  │
└──────────────────────┴──────────────────┘

Testing
┌────────────────────┬───────┐
│       Metric       │ Value │
├────────────────────┼───────┤
│ Tests before today │ {testing.testsBefore} │
│ Tests now          │ {testing.testCases}   │
│ New tests added    │ +{testing.newTestFiles}│
│ Test files         │ {testing.testFiles}   │
└────────────────────┴───────┘

Throughput
┌──────────────────┬───────┐
│      Metric      │ Value │
├──────────────────┼───────┤
│ Commits/hour     │ ~{throughput.commitsPerHour}  │
│ Lines added/hour │ ~{throughput.linesPerHour}    │
│ Issues/hour      │ ~{throughput.issuesPerHour}   │
└──────────────────┴───────┘

Issue Breakdown by Category
┌──────────────────────┬───────┬──────────────────────────────┐
│       Category       │ Count │            Issues            │
├──────────────────────┼───────┼──────────────────────────────┤
│ {category}           │ {N}   │ {#N, #N, ...}                │
└──────────────────────┴───────┴──────────────────────────────┘
```

**Line-type sub-rows:** Indented sub-rows under "Lines added" for each `byType` (from `parseNumstat`) where `added > 0`. Use `extensionCategories` from `stats-config.json`.

**Code:Docs ratio:** After Volume table, if both Code and Documentation are non-zero, report `"Code:Docs ratio — {N}:1"` with assessment ("code-heavy", "documentation-heavy", "balanced").

**Conditional sections:**
- **Throughput:** render only if `throughput` not null (commits > 0)
- **Issue Breakdown:** render only if issues array non-empty AND `gh` available
- **Testing:** always render (zeros if no tests)
- **Velocity Assessment:** render only if `throughput` not null

**Unavailable metrics are NEVER rendered as `0` (#2675).** The collector emits `null` for any probe that could not run, plus an `unavailable` map of metric → reason. `0` now means the probe ran and the answer was zero.

| Value | Render as |
|---|---|
| a number (incl. `0`) | the number — a measured answer |
| `null` | `unavailable` (or `—`), never `0` |

After any table holding a `null`, report the reasons once:
```
Some metrics were unavailable:
  filesChanged — git log failed: fatal: not a git repository
```
`unavailable` is present-and-empty on a healthy run, so an empty map means every probe answered, not that the field is missing. **Do NOT substitute `0` for `null`** — these metrics reported zeros on Windows for as long as the helper existed and nobody noticed, because a plausible number hides a broken probe in a way an explicit `unavailable` cannot.

### Step 3a: Multi-Repo Rendering (`--repos` used)

When output has `perRepo`:

1. Render aggregate tables from `aggregate` (same format as single-repo)
2. Add per-repo breakdown after aggregates:

```
Per-Repository Breakdown
┌──────────────────────┬─────────┬───────────┬─────────┬──────────┐
│      Repository      │ Commits │ Files     │ +Lines  │ -Lines   │
├──────────────────────┼─────────┼───────────┼─────────┼──────────┤
│ /path/to/repo-a      │ {N}     │ {N}       │ +{N}    │ -{N}     │
│ /path/to/repo-b      │ {N}     │ {N}       │ +{N}    │ -{N}     │
├──────────────────────┼─────────┼───────────┼─────────┼──────────┤
│ Total                │ {N}     │ {N}       │ +{N}    │ -{N}     │
└──────────────────────┴─────────┴───────────┴─────────┴──────────┘
```

3. Report warnings for skipped non-git dirs: `⚠ Skipped (not a git repository): /path/to/invalid`

### Step 3b: Velocity Assessment

**Trigger:** `throughput` not null.

Use `assessVelocity()` from `stats-collect.js` with `velocityBenchmarks` from `stats-config.json`.

```
Velocity Assessment
┌──────────────────┬────────┬────────────┐
│      Metric      │  Rate  │  Rating    │
├──────────────────┼────────┼────────────┤
│ Commits/hour     │ ~{N}   │ 🟢/🟡/🔴  │
│ Lines added/hour │ ~{N}   │ 🟢/🟡/🔴  │
│ Issues/hour      │ ~{N}   │ 🟢/🟡/🔴  │
└──────────────────┴────────┴────────────┘
Deviation from this repository's trailing baseline: {N}x the median of {activeDays} active
day(s) over the last {windowDays} days (`computeTrailingBaseline()`)
Assumptions: {commits median} commits/hr, {lines median} lines/hr, {issues median} issues/hr
Population: {population}   Source: {source}
```

Ratings: 🟢 above `high`, 🟡 between `low` and `high`, 🔴 below `low`.

**Assumptions disclosure is mandatory, and satisfiable since #2676.** Show each benchmark's `median`, `population` and `source` — all three ship in `stats-config.json` and return on `assessVelocity()`'s `benchmarks` key. Before #2676 the rule demanded a source that existed nowhere.
**Where a set is `validated: false`, say so.** The three throughput bands are unvalidated internal heuristics with no published citation; presenting them as "median human benchmarks" stated as fact was the defect removed. A labeled heuristic is usable with scepticism; an uncited one is not.
**The "~Nx typical developer velocity" line is gone and must not return.** It divided this repository's rates by an uncited median and reported the quotient as a fact about developers. The replacement compares against **this repository's own** trailing history. `assessVelocity()` no longer returns `multiplier`; a test asserts its absence.
**Insufficient history reports not-collected, never 0.** Fewer active days than `baseline.minDataPoints` → `computeTrailingBaseline()` returns `null` with a reason; render the reason. A median over two days is not a baseline.

### Step 3b-i: DORA Metrics (#2676)
**Trigger:** always attempted; each metric renders its own not-collected reason when absent.
Call `collectDora()` from `stats-collect.js` → `measured`, `proxies`, `tierPlacement`, `tierSource`, `unavailable`. Render deployment frequency, lead time, change failure rate ‡ and time to restore ‡ with their tier, and head the table with `tierSource.source` + `reportYear`.
**The two proxies must be labeled wherever they appear (‡).** Change failure rate and time to restore derive from issue labels and timestamps, not deployment telemetry. They arrive under `proxies` rather than `measured` and each carries `isProxy: true` — render the marker. A proxy shown as measured invites a tier comparison the data does not support.
**Attribution rule for both proxies.** A `bug` issue attributes to the **most recent release tag preceding its `createdAt`**. Issues predating the first tag in range are **excluded**, not attributed to it — attributing them would blame the first release for every bug that already existed.
**Never render a missing metric as 0.** Every `unavailable` entry carries a reason; show it in place of the value. "No releases in range" is not a deployment frequency of zero, and rendering it as zero places the repo in the Low tier on a measurement that never happened.
**Cite the tier source.** DORA band boundaries move between annual reports, so a placement is only as current as `reportYear`. Refreshing it and surfacing staleness is #2677.
### Step 3b-ii: File Type Breakout

**Trigger:** `byExtension` from `parseNumstat` has entries.

Render after all other tables as detail appendix:

```
File Type Breakout
┌───────────┬────────┬────────┐
│ Extension │ +Lines │ -Lines │
├───────────┼────────┼────────┤
│ .md       │ +8,200 │ -1,100 │
│ .js       │ +5,800 │   -900 │
│ .test.js  │ +2,300 │    -50 │
│ .json     │ +1,100 │   -200 │
└───────────┴────────┴────────┘
```

**Rules:**
- Sorted by added desc (already sorted by `parseNumstat`)
- Omit extensions with zero added and zero removed
- `.test.js` and `.spec.js` separate from `.js` (handled by `getExtension()`)
- Multi-repo: aggregate `byExtension` across all repos

### Step 3c: Save Report (`--save`)

1. Create `Construction/Reports/Stats/` at project root if it doesn't exist
2. Filename: single day → `Construction/Reports/Stats/YYYY-MM-DD.md`; range → `Construction/Reports/Stats/YYYY-MM-DD--YYYY-MM-DD.md`
3. Write markdown report with:
   - Emoji headers: 📊 Activity (SPACE), 🧪 Testing, ⚡ Throughput, 🚀 DORA Metrics, 📁 Issue Breakdown
   - Markdown tables; 🟢 🟡 🔴 velocity indicators
   - Velocity Assessment with trailing-baseline deviation, benchmark medians, population and source
   - DORA Metrics with tier placements, proxy markers and the cited tier source
   - Code:Docs ratio assessment
   - File Type Breakout as final section
4. Report: `"Saved to {filepath}"`

**Note:** `Construction/Reports/` is committed project history in user projects, like `Construction/Code-Reviews/` — do not gitignore it. Project-local, never deployed to dist. Saved reports moved here from the old stats report directory (#2925); the `<framework_root>/idpf-stats/repos.json` cache did not move.

### Step 4: Edge Case — Empty Report

If `volume.commits` is 0:

```
{Title} ({Date Range})

No activity found in the specified time range.
```

Do not render empty tables.

### Step 5: Daily Log (`--daily-log`)

**Trigger:** `--daily-log` present. One report per day for product, QA and engineering managers: what shipped, what is ready to test, what is blocked, which bugs were found or fixed. Every issue, number and claim must trace to a collected fact — derive, never compose (#2790).

**Current repository only.** Ignores `--repos`, `--repos-edit` and the auto-detected `<framework_root>/idpf-stats/repos.json` list. The collector names each source set aside in `ignored`; when non-empty, say in the run output they were ignored and the log covers the current repository only.
**Date-range and `--save` flags are ignored too, and reported the same way (#2962).** Days come only from the prose after `--daily-log` (or today), so `--today`, `--date`, `--since`, `--until`, `--save` have no effect. Name each one the user typed on the same `Ignored for --daily-log` line as the repo sources, so `/idpf-stats --daily-log --date 2026-09-01` does not silently produce today's log. Report, never reject: ignoring stays the behavior and no invocation's output changes.

#### 5a: Resolve the Days
- **Bare `--daily-log` (no prose):** today, over the same range as `--today`. Interpret nothing; run without a confirmation prompt.
- **Prose:** resolve the phrase into an explicit date list of `YYYY-MM-DD` local dates (`for every weekday last week` → five dates). Show it and confirm via `AskUserQuestion` before any report is generated (proceed, or correct the list). A declined list generates nothing: no collection, no files. A phrase that cannot be resolved into dates stops with a message that names the phrase — never guess a range.

#### 5b: Collect
**Generate the facts path first — once per invocation, before collection runs.** A fixed path is shared by every session running this command in this working directory, and the failure is silent: one run reads a file the other wrote, or one run's cleanup removes a file the other has not read. Nothing here is named after an issue, so shell out for the suffix — **`/bug`'s scheme (#2980)**: 
```bash
FACTS_FILE=".tmp-daily-log-facts-$(node -e "console.log(require('crypto').randomBytes(4).toString('hex'))").json"
```
Use `$FACTS_FILE` at both sites — the redirect here and `--facts` at 5e. They must name the same file, or citation verification checks a draft against another run's facts. **Keep the `.tmp-` prefix**: it is what lets the startup stale-scratch sweep collect a file an interrupted run left behind.
```bash
node .claude/scripts/shared/daily-log-collect.js --dates 2026-09-08,2026-09-09 > $FACTS_FILE
```
Omit `--dates` for today; pass `--repos`/`--repos-edit` through if typed so they are reported as ignored. `ok: false` → report `invalid` and STOP. Each day uses Step 1's `--date` semantics (local, `T00:00:00`–`T23:59:59`).

Each `days[]` entry: `issues` (`transitioned`, `movedToInReview`, `movedToDone`, `closed`), `bugs`/`qaRequired` (`opened`, `closed`), `reviews` (`passed`, `findings`), `releases`, `blockers`, `activity`, `referencedIssues`, `unavailable`, `warnings`. Section order from `sections` (`dailyLog` in `stats-config.json`).

**A `null` fact is unavailable, never `0` or "none" (#2675)** — render it with its `unavailable` reason. **`blockers` is current state** (`asOf: collection-time`), not that day's — say so for a past day. Relay `warnings` (possibly truncated search, issue lookup failure).

#### 5c: Plan the Files
`plan` decides what is written — one file per day, never a combined range file:

| `plan` list | Meaning | Action |
|---|---|---|
| `writes` | Day had activity | Write `Construction/Reports/Daily-Logs/YYYY-MM-DD.md`; re-running a day overwrites only that file |
| `skipped` | Every probe answered, found nothing | No file; list the date as skipped in the run summary |
| `undetermined` | Nothing found, but probes failed | No file; list the date with its reasons — not a quiet day |

#### 5d: Draft Each Day
Draft each `plan.writes` day from its facts, sections in this order:
```markdown
# Daily Log — YYYY-MM-DD

## Product
What shipped or changed for users: issues moved to Done or closed, with titles; releases tagged.

## Quality
Tests added, bugs opened and closed, qa-required gates opened and closed, review outcomes (passed; findings raised).

## Engineering
In-flight work (moved to In review), open blockers, releases, and risk the facts support.

## Activity
> {caveat from the reportSections entry named by dailyLog.activityCaveatFrom}

Commits, files changed, lines added and removed by type, tests added.
```
- **Activity is last, with the SPACE caveat beneath its heading.** Counts only — no rates, ratings or tier placements; a management audience is the one most likely to read a count as a verdict.
- Name issues `#N — title` from the facts. An empty section says so in one line; do not pad.

#### 5e: Verify Citations, Then Save
Write each draft to `.tmp-daily-log-YYYY-MM-DD.md`, then check it:
```bash
node .claude/scripts/shared/daily-log-collect.js --verify-citations .tmp-daily-log-2026-09-08.md --facts $FACTS_FILE
```
`unknown` non-empty (exit 1) → this blocks the save for that day, naming each unknown issue: remove or correct every citation absent from the facts and verify again. Never save a report citing an issue the collector did not return.

Write each report only after its check passes: create `Construction/Reports/Daily-Logs/` when absent, write the file, remove the `.tmp-daily-log-*` files. Report written paths, skipped dates, undetermined dates with reasons, and ignored sources.

## Error Handling

| Condition | Behavior |
|---|---|
| Not a git repo | Script returns error → STOP |
| Invalid date format | "Invalid date format. Use YYYY-MM-DD." STOP. |
| `--until` before `--since` | "End date must be after start date." STOP. |
| No commits in range | "No activity found" message |
| `gh` CLI unavailable | Skip issue breakdown, show other tables |
| No test files | Testing table with zeros — a readable tree with no tests is a measured zero |
| A probe could not run | Value is `null`; render `unavailable`, never `0`, and report `unavailable[metric]` (#2675) |
| Script execution fails | Report failure, continue with available data |
| `--daily-log` phrase cannot be resolved to dates | Report the phrase, STOP — never guess a range |
| `--daily-log` date list declined | Generate nothing, STOP |
| `--verify-citations` returns unknown issues | Block that day's save; name each unknown issue; correct and re-verify |

**End of /idpf-stats Command**
