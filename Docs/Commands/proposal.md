# /proposal

Create a proposal document (`Proposal/[Name].md`) and a tracking issue with the `proposal` label.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<title>` | No | Proposal title (e.g., `Dark Mode Support`) |
| `--prior-art` | No | Run a prior-art sweep before composing the proposal. Absent means no sweep. |
| `--assignee <value>` | No | GitHub login to assign the new issue to. Omitted → `@me`. |
| `--target <owner/name>` | No | File the tracking issue into a registered companion repository instead of this one. |
| `--target-path <dir>` | No | With `--target`: a local checkout of that companion, where the proposal document is written. |
| `--help` | No | Open this page. Takes precedence over every other argument and performs no action. |

## Usage

```
/proposal Dark Mode Support
/proposal Dark Mode Support - adds theme switching to the settings page
/proposal Dark Mode Support --prior-art
idea: Dark Mode Support
```

## Key Behaviors

- Also triggered by the `idea:` alias — identical workflow and output
- Supports two creation modes: **Quick** (single description prompt) and **Guided** (step-by-step prompts for Problem Statement, Proposed Solution, Implementation Criteria, Alternatives, Impact, and Screen Discovery); mode is auto-selected based on how much detail was provided in the command
- Proposal document must include `**File:** Proposal/[Name].md` — required for `/create-prd` integration
- Checks the title and problem statement against `CHARTER.md` scope. When they match no charter item or match an out-of-scope item, you are shown the matching items and offered: expand the charter scope, defer to a future release, proceed anyway, or revise the proposal. Advisory only — it never blocks creation, and it is skipped with a one-line note when there is no charter, the charter is an unfilled template, or the project has opted out with `.no-charter-enforcement`
- After creating the document, creates a GitHub issue with the `proposal` label (priority P2, status Backlog) and updates the document with the issue number
- **STOP** after reporting — does not implement anything unless the user explicitly says "work" or "implement"
- Warns before overwriting an existing `Proposal/[Name].md`

## Filing Into a Companion Repository (`--target`)

`--target <owner/name>` files the tracking issue into a **companion** repository instead of this one. The repository must be registered in `CHARTER.md` as filable; if it is registered read-only, or not registered at all, the command says which and stops without creating anything.

**The issue goes onto the companion's board, not this project's,** exactly as with `/bug --target` and `/enhancement --target`. Status and Priority are set from the companion board's own fields; anything that does not resolve there is reported **unset** rather than guessed, and with no board registered no board is touched and the command says so.

**The proposal document belongs to the companion too.** The issue's `**File:** Proposal/[Name].md` line is what `/create-prd` reads, and it runs in the companion — so the document must live in the companion's tree, not here. Nothing is written to this repository's `Proposal/`:

- **With `--target-path <dir>`** — `<dir>` must be a local checkout of the target (its `origin` remote is checked). The document is written to `<dir>/Proposal/[Name].md`. It is **not committed**: commit it in the companion through that project's own workflow.
- **Without `--target-path`** — the document is printed in full after the issue is filed, for you to add to the companion as `Proposal/[Name].md`.

```
/proposal --target rubrical-worker/px-manager --target-path ../px-manager Hub Health Panel - shows hook status per project
```

**Before 0.109.0 this landed on the wrong board.** `/proposal --target` added the companion issue to this project's board and wrote the document here, where the companion's `/create-prd` could not find it.

## Prior-Art Sweep

With `--prior-art`, the command searches the codebase, other proposals' contents, and issue history (including closed issues) **before** the proposal document is composed, so findings shape what gets written.

This is distinct from — and additional to — the existing-file check. That check only tests whether `Proposal/[Name].md` already exists; it is a filename comparison and cannot detect a capability that already ships under a different name.

- The `--prior-art` token is stripped **before** the title is converted to a filename, so it never lands in the document name.
- If no search surface can be resolved, the sweep is reported as incomplete rather than as a clean result.
- Prior work that duplicates the proposal's scope is surfaced for a decision before the document is written.

### The `reviewSweep` setting can refuse the flag

Your project's `reviewSweep` setting in `framework-config.json` has four values — `full`, `recommend`, `flag-only` and `off`. The first three all honor an explicit `--prior-art`. **Only `off` refuses it.**

When refused, the command reports the refusal and names the setting responsible, then continues creating the proposal. No `**Prior Art:**` section is written, so the absence correctly reads as "no sweep ran" rather than "swept and found nothing".

If `reviewSweep` is absent from your config, it means `recommend`, and `--prior-art` works.

When you use the `proposal:` or `idea:` trigger phrase instead of the slash command, flag-shaped tokens are extracted automatically.
