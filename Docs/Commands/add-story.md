# /add-story

Add a new story to an epic with charter compliance validation and automatic test plan updates.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `[epic-number]` | No | Parent epic issue number (e.g., `42` or `#42`). Prompts with a list of open epics if not provided. |

## Usage

```
/add-story
/add-story 42
/add-story #42
```

## Key Behaviors

- If no epics exist or you select "Create new epic", the command creates the epic first, then adds the story to it.
- Validates the story description against `CHARTER.md` scope before creating the issue. Warns on potential out-of-scope items and asks for confirmation to proceed.
- Creates the story issue with a full canonical template (Description, Relevant Skills, Acceptance Criteria, TDD Test Cases, Definition of Done). All sections are required; use "N/A" rather than omitting any.
- If the epic belongs to a PRD, automatically updates the PRD tracker issue and the PRD document file with the new story.
- Optionally suggests and installs relevant skills based on technologies mentioned in the story.
- Links the new story to its parent epic as a sub-issue.
