# /design-system

Produce DTCG-compliant design tokens with pluggable adapter architecture for extensible discovery and export.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| *(none)* | No | Init mode — guided walkthrough to create design tokens |
| `--discover` | No | Discovery mode — extract tokens from existing code via adapters |
| `--export <adapter>` | No | Export tokens to framework-specific format |
| `--export all` | No | Export to all detected framework formats |
| `--theme <name>` | No | Generate or apply a theme override file |

## Usage

```
/design-system
/design-system --discover
/design-system --export tailwind
/design-system --theme dark
```

## Key Behaviors

- Produces a DTCG-compliant token file at `Design-System/idpf-design.tokens.json` with a companion JSON Schema.
- **Init mode** walks through palette selection, spacing scale, typography, and border radius to generate a complete token set.
- **Discovery mode** uses pluggable adapters to extract tokens from existing code (Tailwind config, CSS custom properties, Sass variables, etc.).
- **Export mode** outputs tokens to framework-specific formats via export adapters (CSS variables, Tailwind, Style Dictionary, React Native).
- **Theme mode** generates theme override files that layer on top of the base token set.
- Integrates with `/mockups` (palette-to-CSS conversion) and `/catalog-screens` (token usage discovery).
- Supports `pre-init` and `post-export` extension points.
