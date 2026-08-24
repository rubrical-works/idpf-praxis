# /add-story

Add a new story to an epic with charter compliance validation and automatic test plan updates.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `[epic-number]` | No | Parent epic issue number (e.g., `42` or `#42`). Prompts with a list of open epics if not provided. |
| `--assignee <value>` | No | GitHub login to assign the new story to. Omitted → `@me`. |

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
- Requires a **Files to modify** section listing only the files this story's criteria implicate. A purely behavioral story uses the section marker with `N/A` — omitting the section entirely is not equivalent.
- If the epic belongs to a PRD, automatically updates the PRD tracker issue and the PRD document file with the new story.
- Optionally suggests and installs relevant skills based on technologies mentioned in the story.
- Links the new story to its parent epic as a sub-issue.
- On completion, reports the next steps in order: review the story (`/review-issue #N`), assign it to a branch (`/assign-branch #N`), work it, then check epic progress. Review and branch assignment now precede work in that sequence.

## Acceptance Criteria Feasibility Gate

Before the story is created, each acceptance criterion is checked against two questions:

**Can it be verified?** If a criterion names a verification mechanism no existing test uses, you are asked to rewrite it, commit to a feasibility spike, or accept a weaker mechanism. The story is not created until each flagged criterion is resolved.

**Can it close in this phase?** A criterion can name a real mechanism and still be unsatisfiable — "user-reviewed and approved before merge" describes a genuine review whose outcome does not exist at the moment the box must be checked. These are handled two ways:

| Situation | Result |
|---|---|
| The work belongs to another command's checklist (CHANGELOG entries, tagging, release publication) | Not authored at all; you are told which command owns it |
| The gate is genuinely load-bearing, such as a required human sign-off | Authored as an explicitly-open gate rather than an ordinary checkbox |

Annotation is preferred over deletion when the requirement is real. The goal is to stop a gate deadlocking the story at review, not to drop the requirement.
