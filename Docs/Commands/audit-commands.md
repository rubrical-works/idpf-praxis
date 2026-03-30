# /audit-commands

Audit command spec files for formatting weaknesses that impact LLM processing reliability.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `all` | No | Audit every command in `.claude/commands/` |
| `<command-name>` | No | Audit a single command (e.g., `work`, `done`) |
| `<group description>` | No | Natural-language grouping (e.g., `"release commands"`) |

If no argument is provided, the command prompts for scope.

## Usage

```
/audit-commands all
/audit-commands work
/audit-commands "review commands"
```

## Key Behaviors

- Loads the `command-spec-audit` skill for the evaluation rubric before running.
- Evaluates each command against four rubric categories: Structural Integrity, Decision Formatting, Execution Reliability, and Extension Points.
- Creates one GitHub enhancement issue per command that has findings; commands with zero findings are reported inline and skipped.
- This is an **audit-only** command — it never modifies command files. STOP after the summary report.
- Framework-only: not available in user projects.
