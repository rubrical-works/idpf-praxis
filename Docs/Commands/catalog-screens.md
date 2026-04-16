# /catalog-screens

Discover and catalog UI screen elements from application source code — or from screenshots — into structured spec documents, with a unified screen registry and navigation graph.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `#NN` | No | Issue number for context. Reads the issue body for screen/feature names and writes spec file references back to the issue when done. |
| `--from-screenshot <path>` | No | Extract a single screen spec from a screenshot image (png/jpeg/webp). |
| `--from-screenshots <dir>` | No | Bulk-extract specs from a directory of screenshots; non-image files skipped with warning. |

## Usage

```
/catalog-screens
/catalog-screens #42
/catalog-screens --from-screenshot ./design/home.png
/catalog-screens --from-screenshots ./design/screenshots/
```

## Key Behaviors

- Fully interactive: uses `AskUserQuestion` throughout to guide scope (create new / update existing / re-scan / **initialize full catalog**), mockup set selection, discovery method (auto-scan, specific directory, manual entry, or screenshot input), screen selection, and element enrichment.
- Supports React/Next.js, Electron, Vue, vanilla HTML, and React Native. For Electron bridge patterns and other delegation layers, traces through to the actual DOM-rendering code rather than trusting the wrapper API shape.
- Element fields are defined by `.claude/metadata/screen-spec-schema.json` — all fields (including `dataTestId`, `ariaLabel`, `conditionalRender`, `stateBinding`, etc.) come from that schema.
- **Initialize full screen catalog** (brownfield): bulk-discovers screens from project source and seeds `Mockups/screen-catalog.json`, then renders the navigation graph.
- **Registry upsert + drift report:** every run detects new / missing / changed screens against `Mockups/screen-catalog.json` before writing, so you see drift before any spec is overwritten.
- **Navigation graph regeneration:** after specs land, regenerates `Mockups/NAVIGATION.md` with Pages, Wizards (with steps), and Unreachable sections (paginated for 200+ screen catalogs).
- **Catalog validation:** runs `validate-screen-catalog.js` (9 invariants) as a non-blocking report after re-scans.
- For "Update existing" and "Re-scan" flows, diffs source against existing specs and preserves all user-enriched data. Never silently overwrites user edits.
- Writes one file per screen to `Mockups/{Name}/Specs/{Screen-Name}.md`, then offers to stage and commit.
- **STOP boundary:** halts after the commit offer — does not proceed without user instruction.
