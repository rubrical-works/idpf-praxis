# /mockups

Create or modify text-based or interactive UI screen mockups, driven by the screen catalog and the design token set.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `#NN` | No | Issue number (bug, enhancement, proposal, or PRD) to pre-populate context |
| `--from-image <path>` | No | Use a reference image (png/jpeg/webp) as the visual baseline for mockup generation. Bypasses the source-selection question. |
| `--showcase` | No | Launch the Living Style Guide browser review surface on `127.0.0.1`. Renders the screen catalog (UI components / iconography) alongside the other seven design categories; captures accept/reject/annotate decisions to `Design-System/showcase/decisions.json`. Mutually exclusive with `--apply-decisions`. |
| `--apply-decisions` | No | Read pending decisions from `Design-System/showcase/decisions.json` and apply mockup outcomes (revise / mark accepted / mark rejected / record annotations) without launching the server. For scripted / CI use. Mutually exclusive with `--showcase`. |

## Usage

```
/mockups
/mockups #42
/mockups --from-image ./design/home.png
/mockups --showcase
/mockups --apply-decisions
```

## Key Behaviors

- Fully interactive — uses `AskUserQuestion` to guide through: action (create/modify/browse), mockup set, output type (ASCII, drawio.svg, or both), and content source (specs, source code, manual, issue, or catalog).
- **Catalog-driven input**: offers `Mockups/screen-catalog.json` as a content source so mockup generation stays aligned with the registered screen set.
- **Image input** (`--from-image`): multimodal extraction uses the reference image as the visual baseline.
- **Design token wiring**: consumes tokens from `Design-System/idpf-design.tokens.json` when available; records `tokenDependencies` (the token keys each mockup actually consumes) so `/design-system --diff` can propagate changes downstream.
- **Registry upsert**: every mockup write updates `Mockups/screen-catalog.json` (`status`, `kind`, `canonicalSpec`, `designTokens: applied | pending`, `tokenDependencies`).
- **Navigation graph regeneration**: after upsert, regenerates `Mockups/NAVIGATION.md` (Pages, Wizards with steps, Unreachable) — paginated for 200+ screen catalogs.
- ASCII mockups are written to `Mockups/{Name}/AsciiScreens/`; interactive mockups to `Mockups/{Name}/Screens/`.
- Detects ASCII-only sets and offers to convert them to interactive `.drawio.svg` mockups.
- Checks for existing screen specs and path analysis from the linked issue to inform candidate generation.
- **Framework-native component generation is NOT produced** — `/mockups` output stays at the mockup layer; hand-off to implementation is deliberate.
- Protects against file collisions — asks to overwrite, rename, or skip when a target already exists.
- After completion, auto-generates/updates `Mockups/{Name}/README.md` and writes mockup references back to the source issue or proposal; offers to stage and commit all changes.
- **STOP** after reporting — does not proceed without user instruction.
- **Living Style Guide** (`--showcase`): launches a loopback browser surface that renders the screen catalog into the UI Components and Iconography categories of a nine-category review, captures reviewer decisions to `Design-System/showcase/decisions.json` (append-only JSON-Lines), and applies outcomes back to mockups / catalog entries on the next invocation. `--apply-decisions` provides the same apply step without the server for scripted / headless use. See `Docs/02-Advanced/Screen-Design-Pipeline.md` → "Living Style Guide" for the full workflow.
