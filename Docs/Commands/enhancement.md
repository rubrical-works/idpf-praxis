# /enhancement

Create a properly labeled enhancement issue with a standard template and add it to the project board.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<title>` | No | Enhancement title (prompted if not provided) |
| `--prior-art` | No | Run a prior-art sweep before composing the issue body. Absent means no sweep. |
| `--assignee <value>` | No | GitHub login to assign the new issue to. Omitted → `@me`. |
| `--help` | No | Open this page. Takes precedence over every other argument and performs no action. |

## Usage

```
/enhancement add dark mode support
/enhancement improve search performance --prior-art
/enhancement
```

## Filing Into a Companion Repository (`--target`)

`--target <owner/name>` files the issue into a **companion** repository instead of this one. The repository must be registered in `CHARTER.md` as filable; if it is registered read-only, or not registered at all, the command says which and stops without creating anything.

**The issue goes onto the companion's board, not this project's.** If the charter row records a `Board` for that companion (`owner/number`), the issue is added to it and Status and Priority are set from the companion's own field names — never from this project's. If no board is registered, the issue is created and no board is touched at all, and the command says so rather than leaving you to assume fields were set.

Field values are read from the companion's board. Anything that does not resolve there — a status this project uses but that one does not, for instance — is reported **unset** rather than guessed, because a guess would file the issue into the wrong column silently.

**Before 0.102.0 this landed on the wrong board.** Cross-repo filings created the issue in the companion but added it to *this* project's board, and reported that board fields were not set — which was true, and hid the fact that the wrong board had been touched. Issues filed that way are still on the wrong board; this fix does not move them.

## Key Behaviors

- If no title is provided, prompts for one before proceeding.
- Creates the issue with label `enhancement`, status `Backlog`, and priority `P2` through the shared filing script (the same path `/bug` and `/code-review` use), so it lands on the project board.
- Populates a standard template (Description, Motivation, Proposed Solution, Scope, Acceptance Criteria) using details inferred from your input; unfilled sections use "To be documented" placeholders.
- Acceptance criteria are checked for feasibility as they are authored: a criterion that can only be satisfied after this issue reaches review is annotated as a gate rather than left to deadlock, and work another command already owns (CHANGELOG entries, tagging, release publication) is dropped rather than duplicated. A criterion that only restates the project's test command passing ("`npm test` passes") is dropped too, because `/work` already runs the full verification sweep before review — kept when the project declares no verification commands.
- Checks the title and description against `CHARTER.md` scope before creating the issue. When the enhancement matches no charter item or matches an out-of-scope item, you are shown the matching items and offered: expand the charter scope, defer to a future release, proceed anyway, or revise the enhancement. Advisory only — it never blocks creation, and it is skipped with a one-line note when there is no charter, the charter is an unfilled template, or the project has opted out with `.no-charter-enforcement`.
- **STOP after creation** — does not begin implementation until you explicitly say "work", "fix that", or "implement that".
- Suggests next steps: `/review-issue #N` → `/assign-branch #N` → `work #N`.

## Prior-Art Sweep

With `--prior-art`, the command searches the codebase, existing proposals, and issue history (including closed issues) **before** composing the body, so findings shape what gets written instead of annotating an already-wrong description.

- The `--prior-art` token is recognized anywhere in the argument text and is removed from the title, so it never becomes part of the issue's name.
- If no search surface can be resolved, the sweep is reported as incomplete rather than as a clean result.
- Findings that duplicate the request's scope are surfaced for a decision before the issue is created.

### The `reviewSweep` setting can refuse the flag

Your project's `reviewSweep` setting in `framework-config.json` has four values — `full`, `recommend`, `flag-only` and `off`. The first three all honor an explicit `--prior-art`. **Only `off` refuses it.**

When the flag is refused, the command tells you so and names the setting responsible, then continues creating the issue. No `**Prior Art:**` section is written, so the absence correctly reads as "no sweep ran" rather than "swept and found nothing". A refusal is always reported — you typed a flag, so you learn why nothing happened and what to change.

If `reviewSweep` is absent from your config, it means `recommend`, and `--prior-art` works.

When you use the `enhancement:` trigger phrase instead of the slash command, flag-shaped tokens are extracted automatically.
