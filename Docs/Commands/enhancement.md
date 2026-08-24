# /enhancement

Create a properly labeled enhancement issue with a standard template and add it to the project board.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<title>` | No | Enhancement title (prompted if not provided) |
| `--prior-art` | No | Run a prior-art sweep before composing the issue body. Absent means no sweep. |
| `--assignee <value>` | No | GitHub login to assign the new issue to. Omitted → `@me`. |

## Usage

```
/enhancement add dark mode support
/enhancement improve search performance --prior-art
/enhancement
```

## Key Behaviors

- If no title is provided, prompts for one before proceeding.
- Creates the issue with label `enhancement`, status `Backlog`, and priority `P2` via `gh pmu create` (project board integrated).
- Populates a standard template (Description, Motivation, Proposed Solution, Scope, Acceptance Criteria) using details inferred from your input; unfilled sections use "To be documented" placeholders.
- Acceptance criteria are checked for feasibility as they are authored: a criterion that can only be satisfied after this issue reaches review is annotated as a gate rather than left to deadlock, and work another command already owns (CHANGELOG entries, tagging, release publication) is dropped rather than duplicated.
- **STOP after creation** — does not begin implementation until you explicitly say "work", "fix that", or "implement that".
- Suggests next steps: `/review-issue #N` → `/assign-branch #N` → `work #N`.

## Prior-Art Sweep

With `--prior-art`, the command searches the codebase, existing proposals, and issue history (including closed issues) **before** composing the body, so findings shape what gets written instead of annotating an already-wrong description.

- The `--prior-art` token is recognized anywhere in the argument text and is removed from the title, so it never becomes part of the issue's name.
- If no search surface can be resolved, the sweep is reported as incomplete rather than as a clean result.
- Findings that duplicate the request's scope are surfaced for a decision before the issue is created.

### The `reviewSweep` setting can refuse the flag

Your project's `reviewSweep` setting in `framework-config.json` has four values — `full`, `recommend`, `flag-only` and `off`. The first three all honour an explicit `--prior-art`. **Only `off` refuses it.**

When the flag is refused, the command tells you so and names the setting responsible, then continues creating the issue. No `**Prior Art:**` section is written, so the absence correctly reads as "no sweep ran" rather than "swept and found nothing". A refusal is always reported — you typed a flag, so you learn why nothing happened and what to change.

If `reviewSweep` is absent from your config, it means `recommend`, and `--prior-art` works.

When you use the `enhancement:` trigger phrase instead of the slash command, flag-shaped tokens are extracted automatically.
