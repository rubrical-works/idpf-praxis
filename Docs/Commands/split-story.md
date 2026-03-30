# /split-story

Split a story issue into two or more smaller, focused stories.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<story-number>` | Yes | Story issue number to split (e.g., `123` or `#123`) |

## Usage

```
/split-story 123
/split-story #123
```

## Key Behaviors

- Only works on issues that have the `story` label; reports an error for any other issue type
- Asks how to split (by acceptance criteria, user workflow, technical component, priority, or custom); requires at least 2 new stories
- Checks new stories against `CHARTER.md` and `Inception/Scope-Boundaries.md` for scope compliance; warns and asks to confirm if concerns are found
- Creates each new story with a structured body (description, acceptance criteria, TDD test cases, Definition of Done) linked to the parent epic
- Closes the original story with a split notice comment listing the new issue numbers
- If the epic has a linked test plan, redistributes test cases into per-story sections and commits the updated test plan file
- Comments on the PRD tracker issue (if present) with a split summary; silently skips this step for non-PRD-derived epics
