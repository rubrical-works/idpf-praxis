# /create-backlog

Create GitHub epics and stories from an approved PRD, with TDD test case skeletons embedded in each story.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<issue-number>` | Yes | PRD tracker issue number (e.g., `151` or `#151`) |

## Usage

```
/create-backlog 151
/create-backlog #151
```

## Key Behaviors

- **Blocked by two gates:** (1) PRD must have the "PRD reviewed" checkbox checked in the tracker body — offers to run `/review-prd` or bypass with notation; (2) the test plan approval issue must be closed before epics/stories are created.
- Parses `PRD/{name}/PRD-{name}.md` to extract epics and stories, then creates matching GitHub issues using `gh pmu create` (automatically added to project board).
- Test case skeletons from the approved `Test-Plan-{name}.md` are embedded directly in each story's body, using the correct syntax for the project's language and test framework.
- Epic priority is set to the highest priority among its child stories.
- After creation, runs keyword matching against story content and suggests relevant skills to install — can be skipped or selectively accepted.
- Moves the PRD tracker to `in_progress` status; the tracker stays open until `/complete-prd` is run.

## Human Gates Are Preserved

Test plan rows marked as human actions become explicitly-open gates rather than ordinary checkboxes. This distinction is load-bearing: it is the only signal that later tells an intentionally-open gate apart from unfinished work. Flattening a human row into a plain checkbox produces a story that cannot reach review, because the box cannot honestly be checked before the review it describes has happened.

Two related rules apply when converting these rows:

- If a row names a command as the reviewer but that command's documented scope does not cover reviewing implemented work, the human action is emitted instead of the command name.
- If a row describes work another command's checklist already owns, it is dropped rather than annotated.

## Success Criteria Are Never Invented

When a PRD's epic section has no Success Criteria, that slot has no source. The command does **not** synthesize criteria from the epic's child stories and does not invent them. Instead it emits the heading marked as unspecified, records the gap, and warns — a missing section is a gap to surface, not a prompt to generate.

Where the PRD does supply criteria, they are treated as acceptance criteria and run through the same feasibility checks used elsewhere: a criterion bundling a deliverable with its verification is split, and one whose condition resolves only after the epic reaches review is annotated as a gate.
