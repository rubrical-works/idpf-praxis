---
version: "v0.110.0"
allowed-tools: Bash
description: Switch the branch context, using the IDPF framework.
argument-hint: "[branch-name] [--help]"
copyright: "Rubrical Works (c) 2026"
---
<!-- MANAGED -->
Switch between branch contexts.
## Arguments
| Argument | Required | Description |
|----------|----------|-------------|
| `[branch-name]` | No | Branch to switch to. Omitted → list open branches |
| `--help` | No | Open this command's docs page. Takes precedence over every other argument and performs no action. |

**`--help` takes precedence over every other argument and performs no action:** run `node .claude/scripts/shared/command-help.js switch-branch`, report its output, and STOP.
## Workflow
```bash
node .claude/scripts/shared/switch-branch.js "$ARGUMENTS"
```
After switching, report the new context to the user.
