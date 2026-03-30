# /audit-extensions

Audit extension point content within project commands for quality and consistency.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `all` | No | Audit every command that has extension points |
| `<command-name>` | No | Audit a single command's extensions |
| `<group description>` | No | Natural-language grouping (e.g., `"release commands"`) |

If no argument is provided, the command prompts for scope.

## Usage

```
/audit-extensions all
/audit-extensions prepare-release
/audit-extensions "release commands"
```

## Key Behaviors

- Only processes commands that contain `USER-EXTENSION-START` markers; others are filtered out.
- Classifies each extension point as Empty or Populated, then evaluates against Category 4 of the `command-spec-audit` skill rubric (formatting, conflicts, ordering, size, consistency).
- Creates one GitHub enhancement issue per command with findings; commands with no recommendations are reported and skipped.
- This is an **audit-only** command — it never modifies command files. STOP after the summary report.
- Framework-only: not available in user projects.
