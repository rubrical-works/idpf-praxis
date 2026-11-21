# /create-prd

Transform a proposal document into an Agile PRD with user stories, acceptance criteria, epic groupings, UML diagrams, and a TDD test plan.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<issue-number>` | No | Proposal issue number to transform (e.g., `123` or `#123`) |
| `--extract` | No | Extract a PRD from existing codebase (requires `codebase-analysis` skill) |
| `--extract <directory>` | No | Extract from a specific directory |
| *(none)* | No | Interactive mode — prompts for issue number or extraction |
| `--assignee <value>` | No | GitHub login to assign the PRD tracker issue to. Omitted → `@me`. |
| `--help` | No | Open this page. Takes precedence over every other argument and performs no action. |

**Retired forms:** `extract` typed bare is no longer accepted; use `--extract`.

## Usage

```
/create-prd 123
/create-prd #123
/create-prd --extract
/create-prd --extract src/
/create-prd
```

## Key Behaviors

- Validates the proposal issue has the `proposal` label and that a `Proposal/{Name}.md` file is linked in the issue body.
- **Charter scope check.** The proposal's title, problem statement and proposed solution are checked against `CHARTER.md`, and the result is reported on one line: `Charter scope: <verdict> — "<charter bullet>" — <reason>`. Only when that verdict calls for a decision are you offered: expand the charter scope, defer to a future release, proceed anyway, or revise the proposal. Advisory only — it never blocks the PRD, and it is skipped with a one-line note when there is no charter, the charter is an unfilled template, or the project has opted out with `.no-charter-enforcement`.
- **Project context.** Besides `CHARTER.md` (recommended), the optional `Project/Constraints.md` and `Project/Architecture.md` inform the PRD. The test plan's framework, coverage targets and TDD approach come from `Project/Test-Strategy.md`, and the language for test syntax from the Tech Stack in `CHARTER.md`; with no `Project/Test-Strategy.md`, framework defaults are used and you are pointed at `/charter`.
- **"Document updated" acceptance criterion.** When a story changes the project's architecture, constraints, test strategy or a key decision, you are asked whether to add an acceptance criterion naming the document it updates — `Project/Architecture.md`, `Project/Constraints.md`, `Project/Test-Strategy.md`, or a `Construction/Design-Decisions/` entry. `CHARTER.md` is named only when the work introduces a new kind of entity or adopts a new technology (a new Key Entities or Tech Stack row), never to update a count or a version. Declining adds nothing.
- **Story dependencies.** Every story gets a **Depends on:** line (`Story X.Y, Story X.Z` or `none`), which `/create-backlog` copies into each story issue and `/work --nonstop` and `/work --concurrent` use to order work. Dependencies are inferred from the final stories — a story depends on another whose acceptance criteria create something it consumes, extends or calls — and shown as a table (story, dependency, reason) for you to accept or correct before the line is written. `none` is written only when no dependency applies, never to mean "unknown". A dependency cycle is reported, naming every story in it, and you are asked which edge to drop; a cyclic set is never written to the PRD. Stated entries that point outside the PRD or are not story ids are shown to you and kept verbatim.
- Generates UML diagrams (Use Case and Activity by default) as `.drawio.svg` files alongside the PRD in `PRD/{Name}/Diagrams/`, or inline ASCII UML based on the style you pick at Phase 5.5a.
- **Optional `diagram-design` style.** Before asking for a style, `/create-prd` checks whether the third-party `diagram-design` skill is installed (in the project, in your user skills, or as a Claude Code plugin). If it is, a third option appears: editorial HTML diagrams, each exported to a diffable `.svg`, with the `.html` kept beside it as the editable source. Use Case diagrams have no counterpart there and fall back to ASCII. If the skill is not installed, one line says so and points to `Docs/02-Advanced/Diagram-Design-Optional-Skill.md`. The question is not blocked.
- **E2E requirements for user journeys.** When `framework-config.json` `testing.suites[]` declares a gate e2e suite, every story is marked `**User journey:** yes` or `no` — `yes` for a journey or UI flow a user drives end to end — so the classification is visible and correctable at `/review-prd`. Each `yes` story gains an acceptance criterion requiring an E2E test in the declared suite, and the test plan's E2E framework row and E2E scenarios come from that suite. When the only e2e records are manual-only, or no e2e suite is declared, this is reported in one line and the PRD is generated as before. If `testing.suites[]` cannot be read, that is reported as such — never as "no suite declared" — and no E2E requirements are added.
- Generates a TDD test plan at `PRD/{Name}/Test-Plan-{Name}.md` and creates a test plan approval issue — `/create-backlog` is blocked until this approval issue is closed.
- PRD acceptance criteria that only restate the project's test command passing ("`npm test` passes") are not authored, because `/work` already runs the full verification sweep before review; they are kept when the project declares no verification commands.
- In `solo` review mode, offers to consolidate all stories under a single epic for simpler solo development.
- After PRD creation, closes and archives the source proposal issue (moves file to `Proposal/Implemented/`) and opens a new PRD tracker issue.
- **Commits generated artifacts atomically** (Phase 7 Step 4 in Issue-Driven Mode; Extract Mode Step 6) — `git add PRD/{name}/ Proposal/Implemented/{Name}.md && git commit -m "Refs #$issue_num — ..."`. The completion report shows the `Committed: {sha}` line. A `git diff --cached --quiet` guard short-circuits when there are no changes to commit. No `--skip-commit` flag is provided; use `git reset HEAD~1` to regroup.
- **Extract mode** checks for the `Project/` documents (`Architecture.md`, `Constraints.md`, `Test-Strategy.md`); a missing one is warned about and `/charter` is offered, without blocking. A project still on the legacy charter layout is pointed at `/charter --refresh`, and nothing is read from the old path.
- Suggests relevant skills based on technical requirements found in the PRD; confirmed suggestions are saved to `framework-config.json`.
