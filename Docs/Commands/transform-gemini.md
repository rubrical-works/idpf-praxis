# /transform-gemini

Transform `.min-mirror/` artifacts into Gemini CLI equivalents for cross-platform compatibility testing.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<target-dir>` | **Yes** | Directory where `.gemini/` output is written |
| `--validate` | No | Run validation against output after transformation |
| `--dry-run` | No | Preview files that would be transformed without writing |

## Usage

```
/transform-gemini ../my-test-project
/transform-gemini ../my-test-project --validate
/transform-gemini ../my-test-project --dry-run
```

## Key Behaviors

- **Framework-only command** — not deployed to user projects.
- Requires `.min-mirror/` to be populated first (run `/minimize-files`).
- Applies 5 transformation rules: `md-to-toml` (command specs → TOML), `flatten-to-imports` (rules → GEMINI.md with imports), `hook-event-map` (remap hook events), `perms-to-policy` (permissions → TOML policy), `passthrough` (copy format-agnostic files).
- Generates a `GEMINI.md` with `@import` directives and startup trigger section.
- Includes semantic content translation (tool name mapping, path rewriting) for passthrough files and command prompts.
- Command rename map avoids Gemini CLI built-in conflicts (e.g., `bug` → `finding`).
- `--validate` runs `validate-gemini-output.js` to check TOML parsing, import resolution, and event validation.
