---
version: "v0.60.0"
allowed-tools: Bash, AskUserQuestion
description: "Manage project skills: list, install, remove, info (project)"
argument-hint: "[list|install|remove|info] [name] [--verbose]"
---
<!-- MANAGED -->
Unified skill management for discovery, installation, removal, and status.

## Subcommands
| Subcommand | Description |
|------------|-------------|
| `list` | Show installed and available skills |
| `install <name>` | Install a skill by name |
| `remove <name>` | Remove an installed skill |
| `info <name>` | Show skill details |
| *(none)* | Interactive mode — select action |

## Execution
Run the manage-skills script with the provided arguments:
```bash
node .claude/scripts/shared/manage-skills.js "$ARGUMENTS"
```
**Note:** The script is a library. When invoked directly (no `require.main === module` guard), parse the command and execute accordingly:

### Direct Invocation Flow
1. **Parse arguments** via `parseCommand(args)` from the script
2. **Route by mode:**
   - `list` → Call `listSkills(projectDir, { verbose })`, format and display results
   - `install` → Call `installSkill(projectDir, skillName)`, report result
   - `remove` → Call `removeSkill(projectDir, skillName)`, report result
   - `info` → Call `skillInfo(projectDir, skillName)`, format and display
   - `interactive` → Call `interactiveData(projectDir)`, use `AskUserQuestion` to let user pick action, then execute

### Interactive Mode
When no subcommand is provided:
1. Call `interactiveData(projectDir)` to get installed and available skills
2. Present grouped list via `AskUserQuestion`:
   - Installed skills with option to remove
   - Available skills with option to install
   - Info option for any skill
3. Execute selected action

### Post-Install Hooks
After `install`, check the result for `postInstall` field. If present, report:
```
Post-install: {postInstall.description}
```

### Default Skills Indicator
When formatting `list` output, check each skill's `isDefault` field. If `true`, append `[default]` tag:
```
  ✓ tdd-red-phase [default] — Write failing tests for specific behavior
  ✓ electron-development — Patterns for Electron app development
    api-versioning — API versioning strategies
```

### Default Skill Removal Warning
When `remove` returns `isDefault: true`, display the warning from `result.warnings`:
```
⚠ 'tdd-red-phase' is a default skill and will be re-added on next charter refresh.
Removed: tdd-red-phase
```

### Tech Stack Recommendations
After `list`, if skills have `suggests` field, mention recommendations:
```
Recommended for your stack: {skill-name} — {reason}
```
