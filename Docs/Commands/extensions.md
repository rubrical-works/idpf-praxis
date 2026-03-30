# /extensions

Discover, view, edit, and validate extension points in slash commands.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `list` | No | Show all extension points across all commands |
| `list --command <cmd>` | No | Show extension points for a specific command |
| `list --status` | No | Show filled (X) / empty (.) markers per extension point |
| `view <cmd>:<point>` | No | Show the current content of a specific extension point |
| `edit <cmd>:<point>` | No | Edit a specific extension point interactively |
| `validate` | No | Check all extension blocks for formatting issues |
| `summary` | No | Per-command filled/empty/total counts |
| `recipes [category]` | No | Show common patterns for extension points |
| *(none)* or `--help` | No | Show help |

## Usage

```
/extensions list
/extensions list --command create-branch --status
/extensions view prepare-release:post-validation
/extensions edit prepare-release:post-validation
/extensions validate
/extensions summary
/extensions recipes ci
```

## Key Behaviors

- Read-only subcommands (`list`, `view`, `validate`, `summary`, `recipes`) are delegated to `extensions-cli.js` and output is displayed as-is.
- `edit` is spec-driven and interactive — describe what you want changed in natural language; the command implements the edit directly using the Edit tool (never asks for raw replacement text).
- Extension point registry is sourced from `.claude/metadata/extension-points.json`; falls back to scanning command files if registry is missing.
- Only content between `USER-EXTENSION-START` and `USER-EXTENSION-END` markers is modified during `edit`; surrounding formatting is preserved exactly.
- Extension point names follow conventions: `pre-*` (before a phase), `post-*` (after a phase), `checklist` (verification items).
