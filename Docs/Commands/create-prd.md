# /create-prd

Transform a proposal document into an Agile PRD with user stories, acceptance criteria, epic groupings, UML diagrams, and a TDD test plan.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<issue-number>` | No | Proposal issue number to transform (e.g., `123` or `#123`) |
| `extract` | No | Extract a PRD from existing codebase (requires `codebase-analysis` skill) |
| `extract <directory>` | No | Extract from a specific directory |
| *(none)* | No | Interactive mode — prompts for issue number or extraction |

## Usage

```
/create-prd 123
/create-prd #123
/create-prd extract
/create-prd extract src/
/create-prd
```

## Key Behaviors

- Validates the proposal issue has the `proposal` label and that a `Proposal/{Name}.md` file is linked in the issue body.
- Generates UML diagrams (Use Case and Activity by default) as `.drawio.svg` files alongside the PRD in `PRD/{Name}/Diagrams/`.
- Generates a TDD test plan at `PRD/{Name}/Test-Plan-{Name}.md` and creates a test plan approval issue — `/create-backlog` is blocked until this approval issue is closed.
- In `solo` review mode, offers to consolidate all stories under a single epic for simpler solo development.
- After PRD creation, closes and archives the source proposal issue (moves file to `Proposal/Implemented/`) and opens a new PRD tracker issue.
- Suggests relevant skills based on technical requirements found in the PRD; confirmed suggestions are saved to `framework-config.json`.
