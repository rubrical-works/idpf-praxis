# /proposal

Create a proposal document (`Proposal/[Name].md`) and a tracking issue with the `proposal` label.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<title>` | No | Proposal title (e.g., `Dark Mode Support`) |
| `--prior-art` | No | Run a prior-art sweep before composing the proposal. Absent means no sweep. |

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
- After creating the document, creates a GitHub issue with the `proposal` label (priority P2, status Backlog) and updates the document with the issue number
- **STOP** after reporting — does not implement anything unless the user explicitly says "work" or "implement"
- Warns before overwriting an existing `Proposal/[Name].md`

## Prior-Art Sweep

With `--prior-art`, the command searches the codebase, other proposals' contents, and issue history (including closed issues) **before** the proposal document is composed, so findings shape what gets written.

This is distinct from — and additional to — the existing-file check. That check only tests whether `Proposal/[Name].md` already exists; it is a filename comparison and cannot detect a capability that already ships under a different name.

- The `--prior-art` token is stripped **before** the title is converted to a filename, so it never lands in the document name.
- If no search surface can be resolved, the sweep is reported as incomplete rather than as a clean result.
- Prior work that duplicates the proposal's scope is surfaced for a decision before the document is written.

When you use the `proposal:` or `idea:` trigger phrase instead of the slash command, flag-shaped tokens are extracted automatically.
