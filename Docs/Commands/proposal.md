# /proposal

Create a proposal document (`Proposal/[Name].md`) and a tracking issue with the `proposal` label.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<title>` | No | Proposal title (e.g., `Dark Mode Support`) |

## Usage

```
/proposal Dark Mode Support
/proposal Dark Mode Support - adds theme switching to the settings page
idea: Dark Mode Support
```

## Key Behaviors

- Also triggered by the `idea:` alias — identical workflow and output
- Supports two creation modes: **Quick** (single description prompt) and **Guided** (step-by-step prompts for Problem Statement, Proposed Solution, Implementation Criteria, Alternatives, Impact, and Screen Discovery); mode is auto-selected based on how much detail was provided in the command
- Proposal document must include `**File:** Proposal/[Name].md` — required for `/create-prd` integration
- After creating the document, creates a GitHub issue with the `proposal` label (priority P2, status Backlog) and updates the document with the issue number
- **STOP** after reporting — does not implement anything unless the user explicitly says "work" or "implement"
- Warns before overwriting an existing `Proposal/[Name].md`
