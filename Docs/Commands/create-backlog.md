# /create-backlog

Create GitHub epics and stories from an approved PRD, with TDD test case skeletons embedded in each story.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<issue-number>` | Yes | PRD tracker issue number (e.g., `151` or `#151`) |
| `--assignee <value>` | No | GitHub login to assign every created epic and story to. Omitted → `@me`. |
| `--help` | No | Open this page. Takes precedence over every other argument and performs no action. |

## Usage

```
/create-backlog 151
/create-backlog #151
```

## Key Behaviors

- **Blocked by two gates:** (1) PRD must have the "PRD reviewed" checkbox checked in the tracker body — offers to run `/review-prd` or bypass with notation; (2) the test plan approval issue must be closed before epics/stories are created.
- Parses `PRD/{name}/PRD-{name}.md` to extract epics and stories, then creates matching GitHub issues using `gh pmu create` (automatically added to project board).
- Test case skeletons from the approved `Test-Plan-{name}.md` are embedded directly in each story's body, using the correct syntax for the project's language and test framework.
- Each story's **E2E** line is taken from `framework-config.json` `testing.suites[]` — the suite whose `role` is `e2e`, as declared by `/charter` harness selection. No e2e framework is detected or guessed.
- **E2E test cases for user journeys.** A story derived from a PRD story marked `**User journey:** yes` (set by `/create-prd` when the project declares a gate e2e suite) gets an **E2E Test Cases** section naming the suite and its command, with a happy-path case and a user-reachable error-path case, plus an `E2E test passes` item in its Definition of Done. With no gate e2e suite declared, or for a `User journey: no` story, nothing E2E-specific is added.
- Each story gets a **Depends on:** line taken from the PRD story. After every story exists, PRD story ids (`Story 1.1`) are rewritten to issue numbers (`#3118`), including forward references. An id that does not resolve to a story in this backlog is left as written and reported, never dropped or guessed. A PRD story with no dependency statement gets `none (not stated in the PRD)` and is listed in the closing summary.
- **Charter scope check before any epic is created.** The PRD title, summary and epic names are checked against `CHARTER.md`. When they match no charter item or match an out-of-scope item, you are shown the matching items and offered: expand the charter scope, defer to a future release, proceed anyway, or revise. Advisory only — it never blocks the backlog, and it is skipped with a one-line note when there is no charter, the charter is an unfilled template, or the project has opted out with `.no-charter-enforcement`.
- Epic priority is set to the highest priority among its child stories.
- After creation, runs keyword matching against story content and suggests relevant skills to install — can be skipped or selectively accepted.
- Moves the PRD tracker to `in_progress` status; the tracker stays open until `/complete-prd` is run.

## Human Gates Are Preserved

Test plan rows marked as human actions become explicitly-open gates rather than ordinary checkboxes. This distinction is load-bearing: it is the only signal that later tells an intentionally-open gate apart from unfinished work. Flattening a human row into a plain checkbox produces a story that cannot reach review, because the box cannot honestly be checked before the review it describes has happened.

Two related rules apply when converting these rows:

- If a row names a command as the reviewer but that command's documented scope does not cover reviewing implemented work, the human action is emitted instead of the command name.
- If a row describes work another command's checklist already owns, it is dropped rather than annotated.
- A criterion that only restates the project's test command passing ("`npm test` passes") is dropped and noted in the report, because `/work` already runs the full verification sweep before review. It is kept when the project declares no verification commands.

## Success Criteria Are Never Invented

When a PRD's epic section has no Success Criteria, that slot has no source. The command does **not** synthesize criteria from the epic's child stories and does not invent them. Instead it emits the heading marked as unspecified, records the gap, and warns — a missing section is a gap to surface, not a prompt to generate.

Where the PRD does supply criteria, they are treated as acceptance criteria and run through the same feasibility checks used elsewhere: a criterion bundling a deliverable with its verification is split, and one whose condition resolves only after the epic reaches review is annotated as a gate.
