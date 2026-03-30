# /bug

Create a bug issue with a standard template and add it to the project board.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<title>` | No | Bug title. Prompted if not provided. |

## Usage

```
/bug
/bug assign-branch fails on Windows paths
/bug Login form accepts empty passwords
```

## Key Behaviors

- Auto-detects the software version from `package.json` or the latest git tag and confirms it with you before creating the issue.
- Builds the issue body from your description, populating: Description, Version, Steps to Reproduce, Expected/Actual Behavior, Scope, Acceptance Criteria, and Proposed Fix. Sections without enough context use "To be documented" placeholders.
- Issue is created with label `bug`, status `Backlog`, priority `P1`.
- **STOP boundary:** halts after reporting the created issue number. Does not begin implementation until you explicitly say "work", "fix that", or "implement that".
- Supports `pre-create` and `post-create` extension points.
