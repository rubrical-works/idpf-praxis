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
