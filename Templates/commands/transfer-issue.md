---
version: "v0.109.1"
allowed-tools: Bash
description: Transfer an issue between branches, using the IDPF framework.
argument-hint: "<issue-number> [--branch <name>] [--remove-branch] [--help]"
copyright: "Rubrical Works (c) 2026"
---
<!-- MANAGED -->
Transfer an issue between branches.
## Arguments
| Argument | Required | Description |
|----------|----------|-------------|
| `<issue-number>` | Yes | Issue to transfer (`42` or `#42`) |
| `--branch <name>` | No | Transfer to this branch |
| `--remove-branch` | No | Remove from its branch (back to backlog) |
| `--help` | No | Open this command's docs page. Takes precedence over every other argument and performs no action. |

**`--help` takes precedence over every other argument and performs no action:** run `node .claude/scripts/shared/command-help.js transfer-issue`, report its output, and STOP.
## Workflow
```bash
node .claude/scripts/shared/transfer-issue.js "$ARGUMENTS"
```
Report the result to the user.
