# Configuring an External Editor

**Date:** 2026-02-18
**Topic:** How to set up an external editor for commands that produce wide or long output

---

## Why an External Editor?

Some IDPF commands produce output that is too wide or long for Claude Code's terminal display. Claude Code collapses tool output beyond ~30 lines into a summary (`+N lines (ctrl+o to expand)`), making tabular output like extension point matrices effectively unreadable.

Commands affected:
- `/extensions list` — extension point tree (36+ lines)
- `/extensions matrix` — cross-command comparison table (57+ lines, very wide)

These commands automatically open their output in your configured editor, where width and scrolling are not constrained.

---

## Setup

Set one of these environment variables to your preferred editor command:

| Variable | Priority | Typical Use |
|----------|----------|-------------|
| `$VISUAL` | First (checked first) | Graphical editors (VS Code, Notepad++, Sublime) |
| `$EDITOR` | Second (fallback) | Terminal editors (vim, nano) or graphical editors |

### Windows (Git Bash)

Add to your `~/.bashrc` or `~/.bash_profile`:

```bash
# VS Code (recommended — install shell integration first)
export VISUAL="code"

# Notepad++
export VISUAL="notepad++"

# Sublime Text
export VISUAL="subl"
```

After editing, reload your profile:
```bash
source ~/.bashrc
```

**VS Code shell integration:** Run `code` in a terminal. If it's not recognized, open VS Code → press `Ctrl+Shift+P` → type "Shell Command: Install 'code' command in PATH" → restart your terminal.

### macOS

Add to your `~/.zshrc` or `~/.bash_profile`:

```bash
export VISUAL="code"
# or: export VISUAL="subl"
# or: export VISUAL="nano"
```

### Linux

Add to your `~/.bashrc`:

```bash
export VISUAL="code"
# or: export VISUAL="vim"
# or: export VISUAL="nano"
```

---

## Verification

Test that your editor opens from the command line:

```bash
echo "test" > /tmp/editor-test.txt
$VISUAL /tmp/editor-test.txt
```

If the editor opens with the file, you're configured correctly.

---

## Behavior

When an editor is configured:
1. The command generates output to a temporary file in your system's temp directory
2. The editor opens with that file
3. Claude Code reports: `Opened in editor: /path/to/temp/file`

When no editor is configured:
1. A warning is printed: `Warning: No editor configured. Set $VISUAL or $EDITOR environment variable.`
2. Output falls back to stdout (printed in the terminal as before)

### Forcing Terminal Output

Use the `--stdout` flag to bypass the editor and print to the terminal:

```bash
node .claude/scripts/shared/extensions-cli.js list --stdout
node .claude/scripts/shared/extensions-cli.js matrix --stdout
```

This is useful for piping output to other commands or when you want inline display despite the width.

---

## Recommended Editors

| Editor | Command | Notes |
|--------|---------|-------|
| **VS Code** | `code` | Best for wide output — supports horizontal scrolling, syntax highlighting |
| **Notepad++** | `notepad++` | Windows-native, lightweight, supports wide tables |
| **Sublime Text** | `subl` | Cross-platform, fast startup |
| **vim/nano** | `vim` / `nano` | Terminal-based — works but less ideal for wide tables |
