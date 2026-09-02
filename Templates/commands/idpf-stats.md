---
version: "v0.100.2"
description: Generate session statistics report with development velocity metrics
argument-hint: "[--today] [--date YYYY-MM-DD] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--repos /path/a,/path/b] [--repos-edit] [--save]"
copyright: "Rubrical Works (c) 2026"
---

<!-- MANAGED -->
# /idpf-stats

Session statistics from git history, GitHub issues, and test counts. Renders ASCII tables for volume, testing, throughput, and issue categorization.

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
| `--save` | — | Save report to `idpf-stats/YYYY-MM-DD.md` |

**Examples:** `/idpf-stats`, `/idpf-stats --today`, `/idpf-stats --date 2026-04-06`, `/idpf-stats --since 2026-03-10 --until 2026-03-14`, `/idpf-stats --repos /path/a,/path/b`, `/idpf-stats --repos-edit`, `/idpf-stats --save`.

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

### Step 1: Collect Metrics

```bash
node .claude/scripts/shared/stats-collect.js [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--repos /path/a,/path/b] [--repos-edit]
```

Parse JSON output. Script handles: timezone-aware parsing (local, never UTC), git execution for volume/testing/throughput, multi-repo aggregation, directory validation (non-git → warning + skip), directory list cache at `.claude/metadata/idpf-stats-repos.json`, edge cases (no commits/issues/tests, single-commit throughput).

**`--repos` behavior:**
- `--repos /path/a,/path/b` — collect and cache
- `--repos` (no value) — reuse cached list
- `--repos-edit` — present cached list via `AskUserQuestion`, then collect

**Auto-detection:** If no `--repos` flag but `idpf-stats/repos.json` exists at project root, auto-load and run multi-repo. `idpf-stats/repos.json` is the persistent source of truth.

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
**Where a set is `validated: false`, say so.** The three throughput bands are unvalidated internal heuristics with no published citation; presenting them as "median human benchmarks" stated as fact was the defect removed. A labelled heuristic is usable with scepticism; an uncited one is not.
**The "~Nx typical developer velocity" line is gone and must not return.** It divided this repository's rates by an uncited median and reported the quotient as a fact about developers. The replacement compares against **this repository's own** trailing history. `assessVelocity()` no longer returns `multiplier`; a test asserts its absence.
**Insufficient history reports not-collected, never 0.** Fewer active days than `baseline.minDataPoints` → `computeTrailingBaseline()` returns `null` with a reason; render the reason. A median over two days is not a baseline.

### Step 3b-i: DORA Metrics (#2676)
**Trigger:** always attempted; each metric renders its own not-collected reason when absent.
Call `collectDora()` from `stats-collect.js` → `measured`, `proxies`, `tierPlacement`, `tierSource`, `unavailable`. Render deployment frequency, lead time, change failure rate ‡ and time to restore ‡ with their tier, and head the table with `tierSource.source` + `reportYear`.
**The two proxies must be labelled wherever they appear (‡).** Change failure rate and time to restore derive from issue labels and timestamps, not deployment telemetry. They arrive under `proxies` rather than `measured` and each carries `isProxy: true` — render the marker. A proxy shown as measured invites a tier comparison the data does not support.
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

1. Create `idpf-stats/` at project root if missing
2. Filename: single day → `idpf-stats/YYYY-MM-DD.md`; range → `idpf-stats/YYYY-MM-DD--YYYY-MM-DD.md`
3. Write markdown report with:
   - Emoji headers: 📊 Volume, 🧪 Testing, ⚡ Throughput, 📁 Issue Breakdown
   - Markdown tables
   - 🟢 🟡 🔴 velocity indicators
   - Velocity Assessment with multiplier and benchmark assumptions
   - Code:Docs ratio assessment
   - File Type Breakout as final section
4. Report: `"Saved to {filepath}"`

**Note:** `idpf-stats/` is project-local (not symlinked), never deployed to dist. Should be `.gitignore`'d in user projects but tracked in framework dev repos.

### Step 4: Edge Case — Empty Report

If `volume.commits` is 0:

```
{Title} ({Date Range})

No activity found in the specified time range.
```

Do not render empty tables.

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

**End of /idpf-stats Command**
