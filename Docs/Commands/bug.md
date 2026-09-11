# /bug

Create a bug issue with a standard template and add it to the project board.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<title>` | No | Bug title. Prompted if not provided. |
| `--assignee <value>` | No | GitHub login to assign the new issue to. Omitted → `@me`. |

## Usage

```
/bug
/bug assign-branch fails on Windows paths
/bug Login form accepts empty passwords
```

## Filing Into a Companion Repository (`--target`)

`--target <owner/name>` files the issue into a **companion** repository instead of this one. The repository must be registered in `CHARTER.md` as filable; if it is registered read-only, or not registered at all, the command says which and stops without creating anything.

**The issue goes onto the companion's board, not this project's.** If the charter row records a `Board` for that companion (`owner/number`), the issue is added to it and Status and Priority are set from the companion's own field names — never from this project's. If no board is registered, the issue is created and no board is touched at all, and the command says so rather than leaving you to assume fields were set.

Field values are read from the companion's board. Anything that does not resolve there — a status this project uses but that one does not, for instance — is reported **unset** rather than guessed, because a guess would file the issue into the wrong column silently.

**Before 0.102.0 this landed on the wrong board.** Cross-repo filings created the issue in the companion but added it to *this* project's board, and reported that board fields were not set — which was true, and hid the fact that the wrong board had been touched. Issues filed that way are still on the wrong board; this fix does not move them.

## Key Behaviors

- Auto-detects the software version from `package.json` or the latest git tag and confirms it with you before creating the issue.
- Builds the issue body from your description, populating: Description, Version, Steps to Reproduce, Expected/Actual Behavior, Scope, Acceptance Criteria, and Proposed Fix. Sections without enough context use "To be documented" placeholders.
- Issue is created with label `bug`, status `Backlog`, priority `P1`.
- **STOP boundary:** halts after reporting the created issue number. Does not begin implementation until you explicitly say "work", "fix that", or "implement that".
- Supports `pre-create` and `post-create` extension points.
