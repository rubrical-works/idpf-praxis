# /minimize-files

Create token-optimized versions of markdown files in `.min-mirror/` for distribution.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `reset` | No | Clear `.min-mirror/` and do a full rebuild |
| `orphans` | No | List orphaned files in `.min-mirror/` (no minimization) |
| `scope` | No | List files in scope (no minimization) |
| `scope-output` | No | List files with output paths including remappings |
| `commands-only` | No | Minimize only command files (distribution output only) |

## Usage

```
/minimize-files
/minimize-files reset
/minimize-files orphans
/minimize-files commands-only
```

## Key Behaviors

- **Framework-only command** — not deployed to user projects
- Source files are the single source of truth; never edit `.min-mirror/` files directly — they are regenerated on every run
- Source commands in `.claude/commands/` are **never overwritten** by minimization — only the distribution output in `.min-mirror/Templates/commands/` is produced
- Uses a two-pass approach: aggressive minimization first, then impact assessment to restore any removed compliance checklists, numbered lists, or coverage matrices
- `FRAMEWORK-ONLY-START/END` blocks are stripped from distribution output in `.min-mirror/`
- After minimizing, rebuilds skill zip packages in `Skills/Packaged/`, regenerates `Skills/MAINTENANCE.md`, and rebuilds the extension registry
- `.claude/commands/` is path-remapped to `.min-mirror/Templates/commands/` in output
