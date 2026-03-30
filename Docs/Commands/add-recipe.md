# /add-recipe

Add extension recipes to the framework from a document or interactively.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<document-path>` | No | Path to a markdown file containing recipe definitions. If omitted, falls back to interactive single-recipe mode. |

## Usage

```
/add-recipe
/add-recipe Proposal/Extension-Recipe-Expansion.md
```

## Key Behaviors

- **Batch mode:** Parses a structured markdown document, extracts recipe definitions, validates each against `extension-points.json`, and reports a validation summary before creating anything. Requires confirmation before writing.
- **Interactive mode:** Guides you through naming, categorizing, selecting extension points, and writing a template for a single recipe.
- **Validation classes:** Each recipe is classified as VALID, PARTIAL (some `appliesTo` entries invalid), INVALID (uncovered extension points), or SKIP (duplicate name). Invalid and skipped recipes are excluded from creation.
- After creation, regenerates `extension-recipes.json` via script and commits all changes.
- Requires `.claude/metadata/extension-points.json` to exist; run `/extensions` first if missing.
- STOP boundary: halts after reporting and creating recipes — does not proceed further without user instruction.
