# /mockups

Create or modify text-based or interactive UI screen mockups.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `#NN` | No | Issue number (bug, enhancement, proposal, or PRD) to pre-populate context |

## Usage

```
/mockups
/mockups #42
```

## Key Behaviors

- Fully interactive — uses `AskUserQuestion` to guide through: action (create/modify/browse), mockup set, output type (ASCII, drawio.svg, or both), and content source (specs, source code, manual, or issue)
- ASCII mockups are written to `Mockups/{Name}/AsciiScreens/`; interactive mockups to `Mockups/{Name}/Screens/`
- Detects ASCII-only sets and offers to convert them to interactive `.drawio.svg` mockups
- Checks for existing screen specs and path analysis from the linked issue to inform candidate generation
- Protects against file collisions — asks to overwrite, rename, or skip when a target already exists
- After completion, auto-generates/updates `Mockups/{Name}/README.md` and writes mockup references back to the source issue or proposal; offers to stage and commit all changes
- **STOP** after reporting — does not proceed without user instruction
