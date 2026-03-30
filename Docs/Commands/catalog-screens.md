# /catalog-screens

Discover and catalog UI screen elements from application source code into structured spec documents.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `#NN` | No | Issue number for context. Reads the issue body for screen/feature names and writes spec file references back to the issue when done. |

## Usage

```
/catalog-screens
/catalog-screens #42
```

## Key Behaviors

- Fully interactive: uses `AskUserQuestion` throughout to guide scope (create vs update vs re-scan), mockup set selection, discovery method (auto-scan, specific directory, or manual entry), screen selection, and element enrichment.
- Supports React/Next.js, Electron, Vue, vanilla HTML, and React Native. For Electron bridge patterns and other delegation layers, traces through to the actual DOM-rendering code rather than trusting the wrapper API shape.
- Element fields are defined by `.claude/metadata/screen-spec-schema.json` — all fields (including `dataTestId`, `ariaLabel`, `conditionalRender`, `stateBinding`, etc.) come from that schema.
- For "Update existing" and "Re-scan" flows, diffs source against existing specs and preserves all user-enriched data. Never silently overwrites user edits.
- Writes one file per screen to `Mockups/{Name}/Specs/{Screen-Name}.md`, then offers to stage and commit.
- **STOP boundary:** halts after the commit offer — does not proceed without user instruction.
