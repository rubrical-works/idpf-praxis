# /design-system

Produce DTCG-compliant design tokens with pluggable adapter architecture, visual-reference bootstrapping, drift detection, and change propagation to downstream mockups.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| *(none)* | No | Init mode when no tokens exist; status summary when they do. |
| `--init` | No | Force init mode regardless of current state. Prompts for backup (`backupAndOffer` → `*.bak.{ts}`) when valid tokens already exist; follows the shared `'unreadable'` path when the token file is present but unparseable. |
| `--discover` | No | Discovery mode — extract tokens from existing code via adapters |
| `--export <adapter>` | No | Export tokens to framework-specific format |
| `--export all` | No | Export to all detected framework formats |
| `--theme <name>` | No | Generate or apply a theme override file |
| `--from-screenshot <path>` | No | Extract token candidates (color / typography / spacing / gradient) from a visual reference image (png/jpeg/webp). |
| `--diff` | No | Produce a 4-category drift report (additions / removals / mismatches / broken aliases) across registered discovery adapters — no writes. |

## Usage

```
/design-system
/design-system --init
/design-system --discover
/design-system --export tailwind
/design-system --theme dark
/design-system --from-screenshot ./design/home.png
/design-system --diff
/design-system --diff --apply
```

## Key Behaviors

- Produces a DTCG-compliant token file at `Design-System/idpf-design.tokens.json` with a companion JSON Schema.
- **Init mode** walks through palette selection, spacing scale, typography, and border radius to generate a complete token set.
- **Update-mode detection** — re-running `/design-system` on an existing token file auto-routes to the right sub-flow (init / extend / diff / rebuild) based on the detected mode.
- **Discovery mode** uses pluggable adapters (Tailwind config, CSS custom properties, Sass variables, etc.) to extract tokens from existing code.
- **Screenshot bootstrap** (`--from-screenshot`): multimodal extraction proposes candidates; the accept/reject/partial selection is applied before any disk write.
- **Drift report** (`--diff`): each discovery adapter's `diff()` method is aggregated into a 4-category report (additions / removals / mismatches / broken aliases), with selective apply so you can accept drift entries one at a time.
- **Token change propagation**: when tokens change, `findAffectedMockups` locates every screen in the catalog whose `tokenDependencies` overlap the changed keys, so you know exactly which mockups need regeneration.
- **Export mode** outputs tokens to framework-specific formats via export adapters (CSS variables, Tailwind, Style Dictionary, React Native).
- **Theme mode** generates theme override files that layer on top of the base token set.
- Integrates with `/mockups` (palette-to-CSS conversion, `tokenDependencies` upsert) and `/catalog-screens` (token usage discovery).
- Supports `pre-init` and `post-export` extension points.
